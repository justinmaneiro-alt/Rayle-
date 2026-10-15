/* ═════════════ DRIVE : fichiers Word (.docx) ═════════════
   Un .docx est un zip dont word/document.xml contient les paragraphes <w:p>. On ne touche QU'AUX paragraphes modifiés : tout le reste du fichier
   (styles, images, en-têtes, commentaires, mise en page) reste octet pour octet. Dans un paragraphe corrigé, seuls les caractères changés sont remplacés
   (le gras, l'italique et les polices des mots voisins sont conservés). Fonctions pures sur le texte XML (testables sans zip). */
import { changementMinimal } from './modele.js?v=2026.10.15.4';

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const deXml = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return String.fromCodePoint(n); }
  return ENTITES[e.toLowerCase()];
});
const versXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const RE_PARA = /<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g;
const RE_JETON = /<w:t(?:\s[^>]*)?\/>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>|<w:noBreakHyphen\/>/g;

/** découpe un paragraphe en jetons de texte : { type:'t'|'tab'|'br', texte, deb (dans le texte du paragraphe), xmlDeb, xmlFin } */
function jetons(pXml) {
  const sortie = []; let pos = 0, m; RE_JETON.lastIndex = 0;
  while ((m = RE_JETON.exec(pXml))) {
    const x = m[0]; let type, texte;
    if (/^<w:t[\s>/]/.test(x)) { type = 't'; texte = m[1] == null ? '' : deXml(m[1]); }
    else if (x.startsWith('<w:tab')) { type = 'tab'; texte = '\t'; }
    else if (x.startsWith('<w:noBreakHyphen')) { type = 'tab'; texte = '-'; }
    else if (/w:type="(?:page|column)"/.test(x)) { type = 'saut'; texte = ''; }
    else { type = 'br'; texte = '\n'; }
    sortie.push({ type, texte, deb: pos, xmlDeb: m.index, xmlFin: m.index + x.length, xml: x });
    pos += texte.length;
  }
  return sortie;
}
const texteDe = pXml => jetons(pXml).map(j => j.texte).join('');

function niveauDe(pXml) {
  const s = (pXml.match(/<w:pStyle\s+w:val="([^"]*)"/) || [])[1];
  if (s) {
    const m = s.match(/^(?:heading|titre)\s*(\d)$/i); if (m) return Math.min(6, +m[1]);
    if (/^(?:title|titre|subtitle|sous-?titre)$/i.test(s)) return /sub|sous/i.test(s) ? 2 : 1;
  }
  const o = pXml.match(/<w:outlineLvl\s+w:val="(\d)"/); if (o && +o[1] < 6) return +o[1] + 1;
  return 0;
}

/** word/document.xml → { paragraphes, avertissements } ; paragraphes[k].xmlDeb/xmlFin = position dans le XML */
export function lireDocx(xml) {
  const corps = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [0, xml])[1], decal = xml.indexOf(corps);
  const P = []; let page = 1, repere = false, m, tbl = 0, dernier = 0;
  RE_PARA.lastIndex = 0;
  while ((m = RE_PARA.exec(corps))) {
    const avant = corps.slice(dernier, m.index);
    tbl += (avant.match(/<w:tbl>|<w:tbl\s/g) || []).length - (avant.match(/<\/w:tbl>/g) || []).length;
    dernier = m.index + m[0].length;
    const px = m[0], salto = (px.match(/<w:lastRenderedPageBreak\/>|<w:br\s+w:type="page"\/>|<w:pageBreakBefore\/?>/g) || []).length;
    if (salto) repere = true;
    const debutPage = page + (/<w:pageBreakBefore\/?>/.test(px) ? 1 : 0);
    const jts = jetons(px), texte = jts.map(j => j.texte).join('');
    page += salto;
    const section = /<w:sectPr/.test(px);
    P.push({ texte, niveau: niveauDe(px), editable: !tbl && !section && !/<w:txbxContent/.test(px) && !/<w:drawing|<w:pict|<w:object|<w:fldChar|<w:instrText/.test(px) , tableau: tbl > 0, page: debutPage, xmlDeb: decal + m.index, xmlFin: decal + m.index + px.length });
  }
  if (!repere) P.forEach(p => { delete p.page; });                                    // aucune marque de page dans le fichier : pas de numéros inventés
  const avert = [];
  if (repere) avert.push('Les numéros de page d’un fichier Word sont approximatifs (ceux de la dernière mise en page enregistrée).');
  if (/<w:ins\s|<w:del\s/.test(xml)) avert.push('Ce document contient des modifications suivies : je lis le texte tel qu’il est affiché.');
  if (/<w:txbxContent/.test(xml)) avert.push('Les zones de texte ne sont pas lues.');
  if (P.some(p => !p.editable && !p.tableau && p.texte)) avert.push('Les paragraphes avec images, champs ou sauts de section ne sont pas modifiés.');
  if (P.some(p => p.tableau)) avert.push('Les tableaux se lisent mais je ne les modifie pas.');
  return { paragraphes: P, avertissements: avert };
}

/** remplace dans le XML d'un paragraphe les caractères [a, a+supprime) par `insere`, en gardant la mise en forme des caractères voisins */
export function spliceParagraphe(pXml, a, supprime, insere) {
  const js = jetons(pXml), b = a + supprime;
  const attr = '<w:t xml:space="preserve">';
  // jeton hôte de l'insertion : celui qui contient le caractère avant la position (sinon le premier jeton de texte)
  let hote = -1;
  js.forEach((j, k) => { if (j.type === 't' && j.deb < a && a <= j.deb + j.texte.length) hote = k; });
  if (hote < 0) hote = js.findIndex(j => j.type === 't' && j.deb >= a && j.deb <= a);
  if (hote < 0) hote = js.findIndex(j => j.type === 't');
  let sortie = '', curseur = 0;
  js.forEach((j, k) => {
    sortie += pXml.slice(curseur, j.xmlDeb); curseur = j.xmlFin;
    const fin = j.deb + j.texte.length;
    let t = j.texte;
    if (j.type !== 't' && j.type !== 'tab' && j.type !== 'br') { sortie += j.xml; return; }
    if (j.deb < b && fin > a) {                                                             // recouvre la zone supprimée
      if (j.type === 't') t = j.texte.slice(0, Math.max(0, a - j.deb)) + (k === hote && a >= j.deb ? insere : '') + j.texte.slice(Math.max(0, b - j.deb));
      else if (j.deb >= a && fin <= b) t = null;                                           // tabulation ou saut de ligne supprimé
    } else if (k === hote && j.type === 't') {                                              // pas de suppression : insertion simple
      const dedans = Math.max(0, Math.min(j.texte.length, a - j.deb));
      t = j.texte.slice(0, dedans) + insere + j.texte.slice(dedans);
    }
    if (t === null) return;
    sortie += j.type === 't' ? attr + versXml(t) + '</w:t>' : j.xml;
  });
  sortie += pXml.slice(curseur);
  const insereFait = hote >= 0 || !insere;
  if (!insereFait) {                                                                        // paragraphe sans aucun texte : on crée un passage
    const run = '<w:r>' + attr + versXml(insere) + '</w:t></w:r>';
    return /\/>$/.test(sortie) && !/<\/w:p>$/.test(sortie) ? sortie.replace(/\/>$/, '>' + run + '</w:p>') : sortie.replace(/<\/w:p>$/, run + '</w:p>');
  }
  return sortie;
}
// l'insertion « avant la zone supprimée » quand a est au début d'un jeton qui est lui-même supprimé : gérée par `hote` (jeton avant) ou le premier jeton

/** nouveau paragraphe : copie la mise en forme d'un paragraphe de référence (corps de texte) */
function nouveauParagraphe(texte, ref) {
  let ppr = '', rpr = '';
  if (ref) {
    ppr = (ref.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0].replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '').replace(/<w:pStyle\s[^>]*\/>/g, m => (/heading|titre|title/i.test(m) ? '' : m));
    rpr = (ref.match(/<w:r>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/) || [0, ''])[1];
  }
  return '<w:p>' + ppr + '<w:r>' + rpr + '<w:t xml:space="preserve">' + versXml(texte) + '</w:t></w:r></w:p>';
}

/** applique des opérations (remplacer / inserer / supprimer) au XML du document ; renvoie le nouveau XML. Lève une erreur `conflit` si le contenu ne correspond plus. */
export function modifierDocx(xml, ops) {
  const lu = lireDocx(xml), P = lu.paragraphes;
  const conflit = m => { const e = new Error(m); e.conflit = true; return e; };
  const refCorps = (i) => { for (let k = Math.min(i, P.length - 1); k >= 0; k--) if (P[k].editable && P[k].niveau === 0 && P[k].texte.trim() && !/<w:numPr>/.test(xml.slice(P[k].xmlDeb, P[k].xmlFin))) return xml.slice(P[k].xmlDeb, P[k].xmlFin); return null; };
  const actions = [];
  ops.forEach((op, rang) => {
    if (op.t === 'remplacer' || op.t === 'supprimer') {
      const p = P[op.i]; if (!p) throw conflit('Le paragraphe ' + (op.i + 1) + ' n’existe plus.');
      if (!p.editable) throw conflit('Ce paragraphe est dans un tableau, ou contient une image, un champ ou un saut de section : je ne le modifie pas.');
      if (!op.force && p.texte !== op.avant) throw conflit('Le paragraphe ' + (op.i + 1) + ' a changé dans le fichier depuis l’aperçu.');
      if (op.t === 'supprimer') actions.push({ pos: p.xmlDeb, rg: 1, rang, f: s => s.slice(0, p.xmlDeb) + s.slice(p.xmlFin) });
      else {
        const c = changementMinimal(op.force ? p.texte : op.avant, op.apres);
        actions.push({ pos: p.xmlDeb, rg: 1, rang, f: s => s.slice(0, p.xmlDeb) + spliceParagraphe(s.slice(p.xmlDeb, p.xmlFin), c.debut, c.supprime, c.insere) + s.slice(p.xmlFin) });
      }
    } else if (op.t === 'inserer') {
      let ref = null, pos;
      if (op.apres < 0) { if (!P.length) throw conflit('Document vide.'); pos = P[0].xmlDeb; ref = refCorps(0); }
      else {
        const base = P[op.apres]; if (!base) throw conflit('Le paragraphe ' + (op.apres + 1) + ' n’existe plus.');
        if (base.tableau) throw conflit('Je n’ajoute pas de paragraphe dans un tableau.');
        pos = base.xmlFin; ref = op.style === 'meme' ? xml.slice(base.xmlDeb, base.xmlFin) : refCorps(op.apres);
      }
      actions.push({ pos, rg: 0, rang, f: s => s.slice(0, pos) + nouveauParagraphe(op.texte, ref) + s.slice(pos) });
    } else throw conflit('Opération inconnue : ' + op.t);
  });
  // de la fin vers le début ; à la même position, plusieurs insertions : la dernière d'abord pour garder l'ordre demandé
  actions.sort((x, y) => y.pos - x.pos || x.rg - y.rg || y.rang - x.rang);
  let out = xml; for (const a of actions) out = a.f(out);
  return out;
}

/** extrait d'un zip : charge JSZip à la demande (CDN) — `fournirZip()` est remplaçable pour les tests */
export const URL_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
export async function lireZipDocx(zipLib, octets) {
  const zip = await zipLib.loadAsync(octets);
  const f = zip.file('word/document.xml'); if (!f) throw new Error('Ce fichier n’est pas un document Word valide (word/document.xml absent).');
  return { zip, xml: await f.async('string') };
}
export async function ecrireZipDocx(zip, xml) {
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
