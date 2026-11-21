/* ═════════════ BOUGIES HTF EN GRAND (v7, phase 2) — pur et testé ═════════════
   Les 3, 4 ou 5 dernières bougies Weekly (ou Daily / Monthly), avec les zones de rebond potentielles : plus haut / plus bas de chaque période affichée,
   50 % de la période précédente, milieu des longues mèches (CE), FVG encore ouverts, ouverture de la période en cours, MA200 Daily si elle est dans la zone visible.
   Les niveaux proches sont fusionnés en un seul (tolérance = 4 % de la hauteur visible) ; au plus 6 étiquettes (priorité : PWH/PWL, 50 %, CE, ouverture, MA200, autres). */
import { agreger, fairValueGaps } from './ict-calcul.js';

export const NOMS = Object.freeze({ J: { periode: 'jour', pre: 'PD', cour: 'Ouv. jour', court: 'j' }, S: { periode: 'semaine', pre: 'PW', cour: 'Ouv. sem.', court: 's' }, M: { periode: 'mois', pre: 'PM', cour: 'Ouv. mois', court: 'm' } });
export const NB_DEFAUT = Object.freeze({ J: 5, S: 4, M: 4 });
export const MAX_ETIQUETTES = 6;

const moy = L => (L.length ? L.reduce((s, x) => s + x, 0) / L.length : null);

export function construireHtf(J, { tf = 'S', n = 4, prixLive = null, fmt = v => String(Math.round(v)), maintenant = Date.now() } = {}) {
  const N = NOMS[tf] || NOMS.S; n = Math.max(3, Math.min(5, n | 0 || 4));
  if (!J || J.length < 20) return { ok: false, raison: 'Pas assez de bougies Daily (' + (J ? J.length : 0) + ').' };
  const G = agreger(J, tf); if (G.length < n + 1) return { ok: false, raison: 'Pas assez de bougies ' + N.periode + ' (' + G.length + ').' };
  const px = Number.isFinite(prixLive) && prixLive > 0 ? prixLive : G[G.length - 1].c;
  const toutes = G.map(b => ({ ...b })), dern = toutes[toutes.length - 1];
  if (Number.isFinite(prixLive) && prixLive > 0) { dern.c = prixLive; dern.h = Math.max(dern.h, prixLive); dern.l = Math.min(dern.l, prixLive); }
  const vues = toutes.slice(-n), vols = toutes.slice(0, -n).slice(-20).map(b => b.v).filter(v => v > 0), mv = moy(vols);
  const bougies = vues.map((b, i) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, enCours: i === vues.length - 1, amplitudePct: b.l > 0 ? (b.h - b.l) / b.l * 100 : null, volRel: mv && b.v > 0 ? b.v / mv : null }));
  let lo = Math.min(...bougies.map(b => b.l), px), hi = Math.max(...bougies.map(b => b.h), px); const pad = (hi - lo) * 0.08 || hi * 0.01; lo -= pad; hi += pad;
  /* candidats : { prix, texte, prio } ; age = 0 pour la période en cours */
  const C = [];
  bougies.forEach((b, i) => {
    const age = bougies.length - 1 - i, suf = age >= 2 ? ' ' + N.court + '-' + age : '';
    if (age === 0) { C.push({ prix: b.h, texte: 'Haut ' + N.court, prio: 7 }, { prix: b.l, texte: 'Bas ' + N.court, prio: 7 }); }
    else { const pw = age === 1; C.push({ prix: b.h, texte: pw ? N.pre + 'H' : 'Haut' + suf, prio: pw ? 1 : 2 }, { prix: b.l, texte: pw ? N.pre + 'L' : 'Bas' + suf, prio: pw ? 1 : 2 }); }
    const r = b.h - b.l;
    if (r > 0) { const hautC = Math.max(b.o, b.c), basC = Math.min(b.o, b.c); if (b.h - hautC > 0.4 * r) C.push({ prix: (b.h + hautC) / 2, texte: 'CE' + suf, prio: 3 }); if (basC - b.l > 0.4 * r) C.push({ prix: (b.l + basC) / 2, texte: 'CE' + suf, prio: 3 }); }
  });
  const prec = bougies[bougies.length - 2]; if (prec) C.push({ prix: (prec.h + prec.l) / 2, texte: '50 %', prio: 2 });
  C.push({ prix: vues[vues.length - 1].o, texte: N.cour, prio: 4 });
  if (J.length >= 200) { const ma = moy(J.slice(-200).map(b => b.c)); if (ma > lo && ma < hi) C.push({ prix: ma, texte: 'MA200 J', prio: 5 }); }
  const zones = []; if (G.length >= 8) for (const f of fairValueGaps(toutes, { max: 4 })) if (f.haut > lo && f.bas < hi) zones.push({ bas: Math.max(f.bas, lo), haut: Math.min(f.haut, hi), sens: f.sens, texte: 'FVG' });
  /* fusion des niveaux proches */
  const tol = (hi - lo) * 0.04, dans = C.filter(c => c.prix > lo && c.prix < hi).sort((a, b) => a.prix - b.prix), amas = [];
  for (const c of dans) { const a = amas[amas.length - 1]; if (a && c.prix - a.fin <= tol) { a.membres.push(c); a.fin = c.prix; } else amas.push({ membres: [c], fin: c.prix }); }
  let niveaux = amas.map(a => { const rep = [...a.membres].sort((x, y) => x.prio - y.prio)[0]; return { prix: rep.prix, texte: rep.texte + (a.membres.length > 1 ? ' +' + (a.membres.length - 1) : ''), prio: rep.prio, membres: a.membres.map(m => m.texte) }; });
  const tous = niveaux.map(x => ({ ...x }));
  if (niveaux.length > MAX_ETIQUETTES) niveaux = [...niveaux].sort((a, b) => a.prio - b.prio || Math.abs(a.prix - px) - Math.abs(b.prix - px)).slice(0, MAX_ETIQUETTES);
  niveaux.sort((a, b) => b.prix - a.prix);
  /* niveaux les plus proches (sur tous les niveaux visibles, FVG compris) */
  const bords = [...tous, ...zones.map(z => ({ prix: (z.bas + z.haut) / 2, texte: 'FVG' }))];
  const sous = bords.filter(x => x.prix < px).sort((a, b) => b.prix - a.prix)[0] || null, dessus = bords.filter(x => x.prix > px).sort((a, b) => a.prix - b.prix)[0] || null;
  const pct = x => (x.prix / px - 1) * 100, ft = v => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const support = sous ? { texte: sous.texte, prix: sous.prix, pct: pct(sous), phrase: `Support le plus proche : ${sous.texte} ${fmt(sous.prix)} (${ft(pct(sous))})` } : null;
  const resistance = dessus ? { texte: dessus.texte, prix: dessus.prix, pct: pct(dessus), phrase: `Résistance la plus proche : ${dessus.texte} ${fmt(dessus.prix)} (${ft(pct(dessus))})` } : null;
  return { ok: true, tf, n, bougies, niveaux, zones, prix: px, bas: lo, haut: hi, support, resistance, maintenant };
}

/* étiquettes sans chevauchement : renvoie les y (pixels) décalés d'au moins `ecart`, dans [min, max] */
export function placerEtiquettes(ys, ecart, min, max) {
  const n = ys.length; if (!n) return []; const idx = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]), p = idx.map(i => Math.max(min, Math.min(max, ys[i])));
  for (let q = 1; q < n; q++) if (p[q] < p[q - 1] + ecart) p[q] = p[q - 1] + ecart;
  if (p[n - 1] > max) { p[n - 1] = max; for (let q = n - 2; q >= 0; q--) if (p[q] > p[q + 1] - ecart) p[q] = p[q + 1] - ecart; }
  const out = new Array(n); idx.forEach((i, q) => { out[i] = p[q]; }); return out;
}
