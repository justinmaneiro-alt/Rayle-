/* ═════════════ DRIVE : Google Docs (lecture structurée + modification qui conserve la mise en forme) ═════════════
   Lecture : documents.get → paragraphes avec leur position (deb/fin) dans le document.
   Écriture : documents.batchUpdate avec le plus petit changement possible (on ne supprime/insère que ce qui change : le gras, les liens, les tailles autour sont gardés).
   Un objet qui n'est pas du texte (image, saut de page, équation) est représenté par « ￼ » pour que les positions restent exactes. */
import { changementMinimal } from './modele.js?v=2026.10.15.4';

export const OBJET = '￼';
const NIVEAUX = { TITLE: 1, SUBTITLE: 2, HEADING_1: 1, HEADING_2: 2, HEADING_3: 3, HEADING_4: 4, HEADING_5: 5, HEADING_6: 6 };

/** document Google (JSON de l'API Docs) → { paragraphes, revision, avertissements, fin } */
export function lireGdoc(d) {
  const P = [], avert = new Set();
  let fin = 1;
  const paragraphe = (el, ctx) => {
    const p = el.paragraph; let texte = '';
    for (const e of p.elements || []) {
      if (e.textRun) texte += e.textRun.content || '';
      else { texte += OBJET.repeat(Math.max(1, (e.endIndex || 0) - (e.startIndex || 0))); if (e.inlineObjectElement) avert.add('images'); if (e.footnoteReference) avert.add('notes'); }
    }
    texte = texte.replace(/\n$/, '');
    const style = p.paragraphStyle && p.paragraphStyle.namedStyleType;
    P.push({ texte, niveau: NIVEAUX[style] || 0, editable: !ctx, tableau: ctx === 'tableau', puce: !!p.bullet, deb: el.startIndex, fin: el.endIndex });
  };
  const parcourir = (contenu, ctx) => {
    for (const el of contenu || []) {
      if (el.paragraph) paragraphe(el, ctx);
      else if (el.table) { avert.add('tableaux'); for (const r of el.table.tableRows || []) for (const c of r.tableCells || []) parcourir(c.content, 'tableau'); }
      else if (el.tableOfContents) parcourir(el.tableOfContents.content, 'sommaire');
    }
  };
  const contenu = (d.body && d.body.content) || [];
  parcourir(contenu, null);
  for (const el of contenu) if (el.endIndex) fin = Math.max(fin, el.endIndex);
  if (d.footnotes && Object.keys(d.footnotes).length) avert.add('notes');
  const msg = [];
  if (avert.has('tableaux')) msg.push('Les tableaux se lisent mais je ne les modifie pas.');
  if (avert.has('images')) msg.push('Les images et objets sont conservés tels quels (ils apparaissent comme « ▣ » dans le texte).');
  if (avert.has('notes')) msg.push('Les notes de bas de page ne sont pas lues.');
  return { paragraphes: P, revision: d.revisionId || null, avertissements: msg, fin };
}

const nbObjets = t => (String(t).match(/￼/g) || []).length;

/** requêtes batchUpdate pour des opérations, à partir de l'état FRAIS du document (vérifie que rien n'a bougé) */
export function requetesGdoc(lu, ops) {
  const P = lu.paragraphes, items = [];
  const conflit = m => { const e = new Error(m); e.conflit = true; return e; };
  ops.forEach((op, rang) => {
    if (op.t === 'remplacer') {
      const p = P[op.i]; if (!p) throw conflit('Le paragraphe ' + (op.i + 1) + ' n’existe plus.');
      if (!p.editable) throw conflit('Ce paragraphe est dans un tableau ou un sommaire : je ne le modifie pas.');
      if (!op.force && p.texte !== op.avant) throw conflit('Le paragraphe ' + (op.i + 1) + ' a changé sur le Drive depuis l’aperçu.');
      const avantReel = op.force ? p.texte : op.avant;
      if (nbObjets(avantReel) !== nbObjets(op.apres)) throw conflit('Ce paragraphe contient une image ou un objet que je risquerais de supprimer : je ne le modifie pas.');
      const c = changementMinimal(avantReel, op.apres), debut = p.deb + c.debut, reqs = [];
      if (c.supprime > 0) reqs.push({ deleteContentRange: { range: { startIndex: debut, endIndex: debut + c.supprime } } });
      if (c.insere) reqs.push({ insertText: { location: { index: debut }, text: c.insere } });
      if (reqs.length) items.push({ pos: debut, rang, rg: 1, reqs });
    } else if (op.t === 'supprimer') {
      const p = P[op.i]; if (!p) throw conflit('Le paragraphe ' + (op.i + 1) + ' n’existe plus.');
      if (!p.editable) throw conflit('Ce paragraphe est dans un tableau ou un sommaire : je ne le supprime pas.');
      if (!op.force && p.texte !== op.avant) throw conflit('Le paragraphe ' + (op.i + 1) + ' a changé sur le Drive depuis l’aperçu.');
      if (nbObjets(p.texte)) throw conflit('Ce paragraphe contient une image ou un objet : je ne le supprime pas.');
      let a = p.deb, b = p.fin;
      if (b >= lu.fin) { a = Math.max(1, p.deb - 1); b = p.fin - 1; }                     // dernier paragraphe : on retire le saut de ligne qui le précède
      if (b > a) items.push({ pos: a, rang, rg: 1, reqs: [{ deleteContentRange: { range: { startIndex: a, endIndex: b } } }] });
    } else if (op.t === 'inserer') {
      const texte = op.texte;
      if (op.apres < 0) {
        const p = P[0], pos = p ? p.deb : 1;
        const reqs = [{ insertText: { location: { index: pos }, text: texte + '\n' } }];
        styleNormal(reqs, pos, pos + texte.length + 1, p && p.puce);
        items.push({ pos, rang, rg: 0, reqs });
      } else {
        const p = P[op.apres]; if (!p) throw conflit('Le paragraphe ' + (op.apres + 1) + ' n’existe plus.');
        if (p.tableau) throw conflit('Je n’ajoute pas de paragraphe dans un tableau.');
        const pos = p.fin - 1, reqs = [{ insertText: { location: { index: pos }, text: '\n' + texte } }];
        if (op.style !== 'meme') styleNormal(reqs, pos + 1, pos + 1 + texte.length + 1, p.puce);
        else reqs.push({ updateTextStyle: { range: { startIndex: pos + 1, endIndex: pos + 1 + texte.length }, textStyle: {}, fields: CHAMPS_TEXTE } });
        items.push({ pos, rang, rg: 0, reqs });
      }
    } else throw conflit('Opération inconnue : ' + op.t);
  });
  // de la fin vers le début du document : les positions des changements précédents ne bougent pas ; à position égale, les insertions d'abord (dans l'ordre inverse)
  items.sort((x, y) => y.pos - x.pos || x.rg - y.rg || y.rang - x.rang);
  return items.flatMap(i => i.reqs);
}
const CHAMPS_TEXTE = 'bold,italic,underline,strikethrough,link,foregroundColor,backgroundColor';
function styleNormal(reqs, a, b, puce) {
  reqs.push({ updateParagraphStyle: { range: { startIndex: a, endIndex: b }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } });
  reqs.push({ updateTextStyle: { range: { startIndex: a, endIndex: b - 1 }, textStyle: {}, fields: CHAMPS_TEXTE } });
  if (puce) reqs.push({ deleteParagraphBullets: { range: { startIndex: a, endIndex: b } } });
}

/** applique les opérations sur un Google Doc, puis relit pour vérifier → { verifie, revision } */
export async function ecrireGdoc(api, id, ops, attendu) {
  const frais = lireGdoc(await api.docsGet(id));
  if (attendu && attendu.revision && frais.revision && attendu.revision !== frais.revision) {
    // le document a bougé depuis l'ouverture : on ne continue que si les paragraphes visés n'ont pas changé (vérifié op par op)
  }
  const requetes = requetesGdoc(frais, ops);
  if (requetes.length) await api.docsBatch(id, requetes, frais.revision);
  const apres = lireGdoc(await api.docsGet(id));
  return { revision: apres.revision, relu: apres };
}
