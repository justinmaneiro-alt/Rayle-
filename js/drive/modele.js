/* ═════════════ DRIVE : modèle de document (pur, sans réseau ni navigateur) ═════════════
   Un document = une liste de paragraphes { texte, niveau, page?, editable? } :
   niveau 0 = texte courant, 1 à 6 = titres. Tout ce que Raylé lit, cherche, résume ou modifie passe par ce modèle ; il ne cite QUE le texte réel.
   Les modifications sont des « opérations » (remplacer / inserer / supprimer) dont l'inverse est calculé pour pouvoir annuler. */
import { norm, mots, motsUtiles, phrases, estMotVide, morceaux } from './texte.js?v=2026.10.14.5';

export const estTitre = p => p.niveau > 0;
export const estVide = p => !String(p.texte || '').trim();
const corps = doc => doc.paragraphes.map((p, i) => ({ p, i })).filter(({ p }) => !estTitre(p) && !estVide(p));

/** titre de la section qui contient le paragraphe i (ou '') */
export function titreDe(doc, i) {
  for (let k = Math.min(i, doc.paragraphes.length - 1); k >= 0; k--) if (estTitre(doc.paragraphes[k]) && !estVide(doc.paragraphes[k])) return doc.paragraphes[k].texte.trim();
  return '';
}
/** plan du document : les titres, avec leur indice */
export const plan = doc => doc.paragraphes.map((p, i) => ({ p, i })).filter(({ p }) => estTitre(p) && !estVide(p)).map(({ p, i }) => ({ i, niveau: p.niveau, texte: p.texte.trim() }));

/** indices de la section d'un titre : le titre et ce qui suit jusqu'au prochain titre de même niveau ou plus haut */
export function sectionDe(doc, i) {
  const niv = doc.paragraphes[i].niveau || 1, sortie = [i];
  for (let k = i + 1; k < doc.paragraphes.length; k++) {
    const p = doc.paragraphes[k];
    if (estTitre(p) && p.niveau <= niv) break;
    sortie.push(k);
  }
  return sortie.filter(k => !estVide(doc.paragraphes[k]));
}

/** cherche un titre par son intitulé (approximatif). → { ok, i } | { ok:false, proches:[titres réels] } */
export function trouverTitre(doc, texte) {
  const q = motsUtiles(texte);
  const cands = plan(doc);
  const pool = cands.length ? cands : doc.paragraphes.map((p, i) => ({ i, texte: p.texte.trim(), niveau: 1 })).filter(x => x.texte && x.texte.length <= 90);   // sans titres : lignes courtes
  if (!q.length) return { ok: false, proches: cands.slice(0, 6).map(c => c.texte) };
  const notes = pool.map(c => {
    const m = motsUtiles(c.texte); if (!m.length) return { c, s: 0 };
    const tous = q.every(w => m.some(x => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)))));
    const exact = norm(c.texte) === norm(texte);
    const part = q.filter(w => m.some(x => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))))).length / q.length;
    return { c, s: exact ? 2 : tous ? 1 + q.length / (m.length + q.length) : part * 0.5 };
  }).filter(x => x.s >= 1).sort((a, b) => b.s - a.s);
  if (!notes.length) return { ok: false, proches: cands.slice(0, 6).map(c => c.texte) };
  return { ok: true, i: notes[0].c.i, titre: notes[0].c.texte };
}

/** paragraphes qui contiennent les mots (tous, sinon au moins la moitié) */
export function trouverMotCle(doc, texte) {
  const q = motsUtiles(texte).length ? motsUtiles(texte) : mots(texte);
  if (!q.length) return [];
  const ok = [];
  doc.paragraphes.forEach((p, i) => {
    if (estVide(p)) return;
    const n = ' ' + norm(p.texte) + ' ';
    const trouves = q.filter(w => n.includes(w.length >= 4 ? ' ' + w.slice(0, Math.max(4, w.length - 2)) : ' ' + w + ' '));
    if (trouves.length === q.length) ok.push({ i, s: 2 + trouves.length });
    else if (q.length > 2 && trouves.length >= Math.ceil(q.length / 2)) ok.push({ i, s: trouves.length / q.length });
  });
  const entiers = ok.filter(x => x.s >= 2);
  return (entiers.length ? entiers : ok).map(x => x.i);
}

/** extrait de contexte autour du premier mot trouvé */
function extrait(texte, q) {
  const t = String(texte).replace(/\s+/g, ' ');
  const n = norm(t); const w = q.map(x => n.indexOf(x)).filter(k => k >= 0).sort((a, b) => a - b)[0] || 0;
  const deb = Math.max(0, w - 60), fin = Math.min(t.length, w + 100);
  return (deb > 0 ? '… ' : '') + t.slice(deb, fin).trim() + (fin < t.length ? ' …' : '');
}
/** recherche dans le document : { total, resultats:[{ i, extrait, section, page }] } (8 au plus) */
export function chercher(doc, texte) {
  const idx = trouverMotCle(doc, texte), q = motsUtiles(texte);
  return { total: idx.length, resultats: idx.slice(0, 8).map(i => ({ i, extrait: extrait(doc.paragraphes[i].texte, q), section: titreDe(doc, i), page: doc.paragraphes[i].page || null })) };
}

/**
 * Désigne un passage. Demandes : { type:'paragraphe', n } · { type:'titre', texte } · { type:'page', n } · { type:'motcle', texte }
 * · { type:'debut' } · { type:'suite', apres } · { type:'tout' } · { type:'selection', indices }
 * → { ok, indices, intitule, ... } | { ok:false, raison }
 */
export function passage(doc, req) {
  const P = doc.paragraphes;
  if (!P.length || P.every(estVide)) return { ok: false, raison: 'Le document est vide.' };
  switch (req.type) {
    case 'paragraphe': {
      const c = corps(doc); if (!c.length) return { ok: false, raison: 'Je ne trouve aucun paragraphe de texte dans ce document.' };
      const n = req.n === -1 ? c.length : req.n;
      if (!(n >= 1) || n > c.length) return { ok: false, raison: 'Ce document n’a que ' + c.length + ' paragraphe' + (c.length > 1 ? 's' : '') + ' de texte.' };
      return { ok: true, indices: [c[n - 1].i], intitule: (req.n === -1 ? 'le dernier' : 'le ' + (n === 1 ? '1er' : n + 'e')) + ' paragraphe', n };
    }
    case 'titre': {
      const t = trouverTitre(doc, req.texte);
      if (!t.ok) return { ok: false, raison: 'Je ne trouve pas de titre « ' + req.texte + ' » dans ce document.' + (t.proches.length ? ' Les titres que je vois : ' + t.proches.join(' ; ') + '.' : ' Il ne contient pas de titres.') };
      return { ok: true, indices: sectionDe(doc, t.i), intitule: 'la partie « ' + t.titre + ' »', titreIndice: t.i };
    }
    case 'page': {
      if (!P.some(p => p.page)) return { ok: false, raison: 'Ce type de document ne me donne pas les pages. Je peux lire par titre, par paragraphe ou par mot-clé.' };
      const ind = P.map((p, i) => ({ p, i })).filter(({ p }) => p.page === req.n && !estVide(p)).map(x => x.i);
      if (!ind.length) { const max = Math.max(...P.map(p => p.page || 0)); return { ok: false, raison: req.n > max ? 'Ce document n’a que ' + max + ' page' + (max > 1 ? 's' : '') + '.' : 'Je ne trouve pas de texte à la page ' + req.n + '.' }; }
      return { ok: true, indices: ind, intitule: 'la page ' + req.n };
    }
    case 'motcle': {
      const ind = trouverMotCle(doc, req.texte);
      if (!ind.length) return { ok: false, raison: 'Je ne trouve pas « ' + req.texte + ' » dans ce document.' };
      return { ok: true, indices: [ind[0]], intitule: 'le passage sur « ' + req.texte + ' »', occurrences: ind.length, autres: ind.slice(1) };
    }
    case 'debut': {
      const ind = P.map((p, i) => i).filter(i => !estVide(P[i]));
      return { ok: true, indices: ind, intitule: 'le début' };
    }
    case 'suite': {
      const apres = Number.isInteger(req.apres) ? req.apres : -1;
      const ind = P.map((p, i) => i).filter(i => i > apres && !estVide(P[i]));
      if (!ind.length) return { ok: false, raison: 'C’était la fin du document.', fin: true };
      return { ok: true, indices: ind, intitule: 'la suite' };
    }
    case 'tout': return { ok: true, indices: P.map((p, i) => i).filter(i => !estVide(P[i])), intitule: 'le document entier' };
    case 'selection': return { ok: true, indices: (req.indices || []).filter(i => P[i] && !estVide(P[i])), intitule: 'ce passage' };
    default: return { ok: false, raison: 'Je n’ai pas compris quel passage lire.' };
  }
}

/** texte à lire à voix haute pour des indices, limité à `max` caractères (arrêt à la fin d'un paragraphe) → { texte, lus:[i], reste:boolean } */
export function texteLecture(doc, indices, max = 1500) {
  const lus = []; let txt = '';
  for (const i of indices) {
    const t = String(doc.paragraphes[i].texte).replace(/\s+/g, ' ').trim(); if (!t) continue;
    if (lus.length && txt.length + t.length > max) break;
    txt += (txt ? ' ' : '') + t + (/[.!?…:;]$/.test(t) ? '' : '.'); lus.push(i);
    if (txt.length > max) break;
  }
  return { texte: txt, lus, reste: lus.length < indices.filter(i => !estVide(doc.paragraphes[i])).length };
}

/** résumé EXTRACTIF : titres + phrases réelles du document les plus représentatives (rien n'est inventé ni reformulé) */
export function resumer(doc, indices) {
  const P = doc.paragraphes, ind = (indices || P.map((p, i) => i)).filter(i => !estVide(P[i]));
  if (!ind.length) return { ok: false, raison: 'Il n’y a rien à résumer.' };
  const freq = new Map();
  for (const i of ind) if (!estTitre(P[i])) for (const m of mots(P[i].texte)) if (m.length > 2 && !estMotVide(m)) freq.set(m, (freq.get(m) || 0) + 1);
  const noteP = s => { const m = mots(s).filter(x => x.length > 2 && !estMotVide(x)); if (m.length < 4) return 0; return m.reduce((a, x) => a + (freq.get(x) || 0), 0) / Math.pow(m.length, 0.6); };
  const meilleures = (idx, k) => idx.flatMap(i => phrases(P[i].texte).map((s, r) => ({ s, i, r, n: noteP(s) + (r === 0 ? 0.5 : 0) })))
    .filter(x => x.n > 0.5 || (x.r > 0 && x.n > 0)).sort((a, b) => b.n - a.n).slice(0, k).sort((a, b) => a.i - b.i || a.r - b.r).map(x => x.s);
  const titres = ind.filter(i => estTitre(P[i]));
  const sections = [];
  if (titres.length >= 2) {
    for (const t of titres.slice(0, 12)) {
      const s = sectionDe(doc, t).filter(i => ind.includes(i) && !estTitre(P[i]));
      const ph = meilleures(s, 1);
      if (ph.length) sections.push(P[t].texte.trim().replace(/[.:]$/, '') + ' : ' + ph[0]);
    }
  }
  const lignes = sections.length >= 2 ? sections : meilleures(ind.filter(i => !estTitre(P[i])), ind.length > 6 ? 5 : 3);
  if (!lignes.length) return { ok: false, raison: 'Le texte est trop court pour en faire un résumé : je préfère le lire tel quel.' };
  return { ok: true, lignes, methode: 'extractif' };
}

/* ═════════════ OPÉRATIONS DE MODIFICATION ═════════════
   { t:'remplacer', i, avant, apres } · { t:'inserer', apres:i (-1 = tout début), texte, style:'normal'|'meme' } · { t:'supprimer', i, avant }
   Les indices désignent le document AVANT l'application. */

/** applique les opérations sur une liste de paragraphes → { paragraphes, inverse } (l'inverse s'applique au résultat) */
export function appliquerOps(paragraphes, ops) {
  let travail = paragraphes.map((p, i) => ({ orig: i, p: { ...p } }));
  const posOrig = i => travail.findIndex(x => x.orig === i);
  for (const op of ops) {
    if (op.t === 'remplacer') {
      const k = posOrig(op.i); if (k < 0) throw erreurOp('Le paragraphe ' + (op.i + 1) + ' n’existe plus.');
      if (!op.force && op.avant != null && travail[k].p.texte !== op.avant) throw erreurOp('Le paragraphe ' + (op.i + 1) + ' a changé depuis l’aperçu.');
      travail[k].p.texte = op.apres;
    } else if (op.t === 'supprimer') {
      const k = posOrig(op.i); if (k < 0) throw erreurOp('Le paragraphe ' + (op.i + 1) + ' n’existe plus.');
      if (!op.force && op.avant != null && travail[k].p.texte !== op.avant) throw erreurOp('Le paragraphe ' + (op.i + 1) + ' a changé depuis l’aperçu.');
      travail[k].supprime = true;
    } else if (op.t === 'inserer') {
      let k = op.apres < 0 ? -1 : posOrig(op.apres);
      if (op.apres >= 0 && k < 0) throw erreurOp('Le paragraphe ' + (op.apres + 1) + ' n’existe plus.');
      while (k + 1 < travail.length && travail[k + 1].orig === null) k++;           // plusieurs insertions au même endroit : dans l'ordre
      const base = op.apres >= 0 ? travail[posOrig(op.apres)].p : null;
      const niveau = op.niveau != null ? op.niveau : (op.style === 'meme' && base ? base.niveau : 0);
      travail.splice(k + 1, 0, { orig: null, p: { texte: op.texte, niveau, editable: true } });
    } else throw erreurOp('Opération inconnue : ' + op.t);
  }
  // résultat sans les paragraphes supprimés ; inverse calculé par rapport au résultat
  const garde = travail.filter(x => !x.supprime);
  const resultat = garde.map(x => x.p);
  const inverse = [];
  garde.forEach((x, k) => {
    if (x.orig === null) inverse.push({ t: 'supprimer', i: k, avant: x.p.texte });
    else if (paragraphes[x.orig].texte !== x.p.texte) inverse.push({ t: 'remplacer', i: k, avant: x.p.texte, apres: paragraphes[x.orig].texte });
  });
  let prec = -1;                                                                      // paragraphes supprimés : à réinsérer après leur voisin survivant
  travail.forEach(x => {
    if (x.supprime) inverse.push({ t: 'inserer', apres: prec, texte: paragraphes[x.orig].texte, style: 'normal', niveau: paragraphes[x.orig].niveau || 0 });
    else if (!x.supprime) prec = garde.indexOf(x);
  });
  return { paragraphes: resultat, inverse };
}
function erreurOp(m) { const e = new Error(m); e.conflit = true; return e; }

/** différences paragraphe par paragraphe entre deux listes de même structure (texte édité à la main) → opérations */
export function diffOps(avant, apres) {
  const ops = [];
  // apres[k] = { texte, orig:i|null } ; les paragraphes absents sont supprimés
  const gardes = new Set();
  let dernierOrig = -1; const inser = [];
  apres.forEach(a => {
    if (a.orig == null) { inser.push({ t: 'inserer', apres: dernierOrig, texte: a.texte, style: a.style || 'normal' }); return; }
    gardes.add(a.orig); dernierOrig = a.orig;
    if (avant[a.orig].texte !== a.texte) ops.push({ t: 'remplacer', i: a.orig, avant: avant[a.orig].texte, apres: a.texte });
  });
  avant.forEach((p, i) => { if (!gardes.has(i)) ops.push({ t: 'supprimer', i, avant: p.texte }); });
  return ops.concat(inser);
}

/** coupe un changement en préfixe/suffixe communs : { debut, supprime, insere } (sert à conserver la mise en forme autour d'une correction) */
export function changementMinimal(avant, apres) {
  let d = 0; const max = Math.min(avant.length, apres.length);
  while (d < max && avant[d] === apres[d]) d++;
  let f = 0;
  while (f < max - d && avant[avant.length - 1 - f] === apres[apres.length - 1 - f]) f++;
  return { debut: d, supprime: avant.length - d - f, insere: apres.slice(d, apres.length - f) };
}

/** décrit un changement pour l'aperçu (texte brut, lisible à voix haute et en fenêtre) */
export function decrireOp(op, doc) {
  if (op.t === 'remplacer') return { type: 'remplacer', i: op.i, avant: op.avant, apres: op.apres, titre: titreDe(doc, op.i) };
  if (op.t === 'supprimer') return { type: 'supprimer', i: op.i, avant: op.avant, apres: '', titre: titreDe(doc, op.i) };
  return { type: 'inserer', i: op.apres, avant: '', apres: op.texte, titre: op.apres >= 0 ? titreDe(doc, op.apres) : '' };
}

/** découpe longue d'un texte pour la lecture suivie (utilisé par la fenêtre) */
export { morceaux };
