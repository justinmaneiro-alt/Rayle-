/* ═════════════ STATISTIQUES DES FLÈCHES (module PUR, testé, navigateur et Node) ═════════════
   Pour chaque TYPE de flèche (MA200 cassure, MA200 rebond, rebond sur niveau, cassure de niveau, rebond Fibonacci), chaque actif et chaque unité (H4, Jour), sur tout l'historique disponible :
   - taux de réussite = part des flèches dont la cible à 2 R est atteinte AVANT le stop (flèches non résolues dans les 100 bougies exclues du taux, mais comptées à part) ;
   - R médian après 10 et 20 bougies (stop maintenu : un stop touché avant l'échéance vaut −1 R, sinon (clôture − entrée) / risque) ;
   - espérance en R = (gagnés × 2 − perdus) / résolus ; nombre d'occurrences ; en dessous de 30 cas : « non significatif ».
   REPÈRE : avec une cible à 2 R et un stop à 1 R, une marche aléatoire gagne 1 fois sur 3 (33 %, espérance 0) : un taux proche de 33 % ne prouve aucun avantage.
   Trade simulé : entrée à la clôture de la bougie de confirmation ; stop derrière la mèche de cette bougie (plus bas pour un achat, plus haut pour une vente) avec une distance d'au moins 1 ATR(14) ;
   si stop et cible sont touchés dans la même bougie, le stop est supposé touché en premier (hypothèse prudente). Frais, spread et glissement ne sont pas pris en compte.
   Niveaux tracés à la main : impossible à rejouer à l'identique dans le passé ; on simule des niveaux OBJECTIFS = plus hauts et plus bas de swing majeurs (pivot de 8 bougies de chaque côté), connus seulement 8 bougies après leur formation,
   puis on applique exactement les mêmes règles de flèches (niveaux.js). Fibonacci : impulsions objectives = deux pivots majeurs consécutifs séparés d'au moins 3 ATR, la zone 0,5–0,705 étant évaluée dès que le second pivot est connu. */
import { atr, pivots } from '../commun/analyse.js';
import { analyserUnite } from './ma200-h4.js';
import { creer, evaluer, PAS } from './niveaux.js';
import { evenementsVolume, TYPES_FLECHES_VOLUME } from '../volume/volume-calcul.js';   // v4 : flèches du mode Volume

export const PARAMS_STATS = Object.freeze({ cible: 2, maxBarres: 100, horizons: [10, 20], pivotK: 8, dureeNiveau: 250, dureeFibo: 150, amplitudeFiboAtr: 3, minSignificatif: 30, stopMinAtr: 1 });
export const TYPES_STATS = Object.freeze([
  { id: 'ma200-cassure', nom: 'Cassure de la MA200' }, { id: 'ma200-rebond', nom: 'Rebond sur la MA200' },
  { id: 'niveau-rebond', nom: 'Rebond sur niveau' }, { id: 'niveau-cassure', nom: 'Cassure de niveau' }, { id: 'fibo-rebond', nom: 'Rebond Fibonacci' },
  ...TYPES_FLECHES_VOLUME.map(t => ({ id: t.id, nom: t.nom, volume: true }))   // v4 : absorption, cassure validée par le volume, faux breakout (delta ESTIMÉ depuis la bougie dans cet historique)
]);
export const mediane = a => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

/* un trade simulé à partir de la bougie i (confirmation), sens dir (+1 achat, −1 vente) ; a = ATR(14) de la bougie */
export function simuler(B, i, dir, a, P = PARAMS_STATS) {
  const b = B[i], e = b.c, ext = dir > 0 ? b.l : b.h, d = Math.max(Math.abs(e - ext), P.stopMinAtr * a); if (!(d > 0)) return null;
  const stop = e - dir * d, cible = e + dir * P.cible * d; let issue = null, kStop = null; const R = {};
  const fin = Math.min(B.length - 1, i + Math.max(P.maxBarres, ...P.horizons));
  for (let k = 1; i + k <= fin; k++) {
    const x = B[i + k], touchStop = dir > 0 ? x.l <= stop : x.h >= stop, touchCible = dir > 0 ? x.h >= cible : x.l <= cible;
    if (kStop == null && touchStop) kStop = k;
    if (issue == null && k <= P.maxBarres) { if (touchStop) issue = 'perdu'; else if (touchCible) issue = 'gagne'; }   // stop avant cible dans une même bougie
    for (const h of P.horizons) if (k === h) R[h] = kStop != null && kStop <= h ? -1 : (x.c - e) * dir / d;
  }
  return { issue: issue || (i + P.maxBarres <= B.length - 1 ? 'expire' : 'ouvert'), R };
}
/* agrège une liste d'événements { i, dir, atr } sur les bougies B */
export function agreger(B, evenements, P = PARAMS_STATS) {
  let gagnes = 0, perdus = 0, expires = 0, ouverts = 0; const R = Object.fromEntries(P.horizons.map(h => [h, []]));
  for (const ev of evenements) {
    const s = simuler(B, ev.i, ev.dir, ev.atr, P); if (!s) continue;
    if (s.issue === 'gagne') gagnes++; else if (s.issue === 'perdu') perdus++; else if (s.issue === 'expire') expires++; else ouverts++;
    for (const h of P.horizons) if (s.R[h] != null) R[h].push(s.R[h]);
  }
  const n = gagnes + perdus + expires + ouverts, res = gagnes + perdus;
  return { n, resolus: res, gagnes, perdus, nonResolus: expires + ouverts, taux: res ? gagnes / res : null, esperance: res ? (gagnes * P.cible - perdus) / res : null, rMed10: mediane(R[10]), rMed20: mediane(R[20]), significatif: n >= P.minSignificatif };
}

/* ───── détection des événements historiques ───── */
export function evenementsMA200(B, unite) {
  const pas = PAS[unite], A = analyserUnite(B, unite, { maintenant: B[B.length - 1].t + pas }), out = { 'ma200-cassure': [], 'ma200-rebond': [] };
  for (const f of A.fleches) { const i = f.iH4; if (i == null || i < 0 || !Number.isFinite(f.atr)) continue; out[f.type === 'cassure' ? 'ma200-cassure' : 'ma200-rebond'].push({ i, dir: f.dir, atr: f.atr }); }
  return out;
}
function indexParTemps(B) { const m = new Map(); B.forEach((b, i) => m.set(b.t, i)); return m; }
/* niveaux objectifs : chaque pivot majeur devient une ligne horizontale connue K bougies plus tard, évaluée pendant `dureeNiveau` bougies */
export function evenementsNiveaux(B, unite, P = PARAMS_STATS) {
  const pas = PAS[unite], idx = indexParTemps(B), A = atr(B, 14), out = { 'niveau-rebond': [], 'niveau-cassure': [] }, now = B[B.length - 1].t + pas, piv = pivots(B, P.pivotK);
  for (const p of piv) {
    const jc = p.i + P.pivotK; if (jc >= B.length - 2) continue; const fin = Math.min(B.length, jc + P.dureeNiveau);
    const o = creer('horizontale', { p: p.prix, unite, cree: B[jc].t }, { id: 'sim' + p.i + p.type }); if (!o) continue;
    const r = evaluer(o, B.slice(0, fin), { maintenant: now, depuis: B[jc].t + pas });
    for (const e of r.evenements) { if (e.type === 'retest') continue; const i = idx.get(e.t); if (i == null || A[i] == null) continue; out[e.type === 'rebond' ? 'niveau-rebond' : 'niveau-cassure'].push({ i, dir: e.dir, atr: A[i] }); }
  }
  return out;
}
export function evenementsFibo(B, unite, P = PARAMS_STATS) {
  const pas = PAS[unite], idx = indexParTemps(B), A = atr(B, 14), out = { 'fibo-rebond': [] }, now = B[B.length - 1].t + pas, piv = pivots(B, P.pivotK).sort((a, b) => a.i - b.i), M = [];
  for (const p of piv) { const l = M[M.length - 1]; if (l && l.type === p.type) { if ((p.type === 'R' && p.prix > l.prix) || (p.type === 'S' && p.prix < l.prix)) M[M.length - 1] = p; } else M.push(p); }
  for (let j = 1; j < M.length; j++) {
    const a = M[j - 1], b = M[j], jc = b.i + P.pivotK; if (jc >= B.length - 2 || A[jc] == null || Math.abs(b.prix - a.prix) < P.amplitudeFiboAtr * A[jc]) continue;
    const o = creer('fibo', { t1: a.t, p1: a.prix, t2: b.t, p2: b.prix, unite }, { id: 'sim' + a.i + '-' + b.i }); if (!o) continue;
    const r = evaluer(o, B.slice(0, Math.min(B.length, jc + P.dureeFibo)), { maintenant: now, depuis: B[jc].t + pas });
    for (const e of r.evenements) { const i = idx.get(e.t); if (i != null && A[i] != null) out['fibo-rebond'].push({ i, dir: e.dir, atr: A[i] }); }
  }
  return out;
}
/* tous les types pour un jeu de bougies d'une unité ; renvoie { types: { id: stats }, bougies, debut, fin } */
export function statsUnite(B, unite, P = PARAMS_STATS) {
  if (!B || B.length < 260) return null;
  /* flèches Volume : seulement si la série a du volume sur au moins 80 % des bougies (sinon : aucun cas, jamais de volume inventé) */
  let EV = {}; if (B.filter(b => b.v > 0).length >= 0.8 * B.length) { try { EV = evenementsVolume(B, unite); } catch (e) { EV = {}; } }
  const E = { ...evenementsMA200(B, unite), ...evenementsNiveaux(B, unite, P), ...evenementsFibo(B, unite, P), ...EV }, types = {};
  for (const t of TYPES_STATS) types[t.id] = agreger(B, E[t.id] || [], P);
  return { bougies: B.length, debut: B[0].t, fin: B[B.length - 1].t, types };
}

/* ───── texte ───── */
const f1 = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signe = v => { const r = Math.round(v * 10) / 10; return (r >= 0 ? '+' : '−') + f1(Math.abs(r)); };
/* « Historique de ce type de flèche sur l'or H4 : 58 % · +0,9 R médian · 142 cas » ; moins de 30 cas : « non significatif » */
export function phraseStats(nomActif, unite, s, P = PARAMS_STATS) {
  const U = unite === 'J' ? 'Jour' : unite;
  if (!s || !s.n) return `Historique de ce type de flèche sur ${nomActif} ${U} : aucun cas`;
  if (s.n < P.minSignificatif) return `Historique de ce type de flèche sur ${nomActif} ${U} : ${s.n} cas seulement, non significatif`;
  return `Historique de ce type de flèche sur ${nomActif} ${U} : ${s.taux == null ? '—' : Math.round(s.taux * 100) + ' %'} · ${s.rMed20 == null ? '—' : signe(s.rMed20) + ' R médian (20 bougies)'} · ${s.n} cas`;
}
