/* ═════════════ NIVEAUX MAJEURS — règle figée « niveaux-majeurs-v1 » (SHA-256 dans niveaux-majeurs-v1.sceau.json, posé AVANT l'affichage et les statistiques) ═════════════
   Niveaux = plus haut / plus bas de la VEILLE, de la SEMAINE et du MOIS précédents (jour de marché de ict-v1), profil de volume HEBDOMADAIRE et MENSUEL précédents (POC, VAH, VAL), nombres RONDS (multiples de 50 et de 100).
   Fusion : des niveaux à moins de 0,5 ATR journalier se fondent en UNE zone ; deux zones affichées sont séparées d'au moins 1 ATR journalier. Score = 2 × poids du timeframe + touches (5 au plus) + ancienneté (3 au plus) + volume (2 au plus).
   On n'affiche que les 3 meilleures zones au-dessus et les 3 meilleures en dessous du prix. Un niveau est une zone de réaction possible, jamais une promesse : le taux de réaction mesuré est publié avec son n et celui de niveaux aléatoires. Pur, sans DOM. */
import { jours } from './ict-v1.js';
export const VERSION = 'niveaux-majeurs-v1', FIGEES_LE = '2026-11-13';
export const P = Object.freeze({ atrJours: 14, fusionAtr: 0.5, ecartAtr: 1, parCote: 3, rondsPortee: 6, toucheAtr: 0.25, toucheJours: 120, bin: 0.05, vaPct: 0.7 });
export const POIDS_TF = Object.freeze({ veille: 1, semaine: 2, mois: 3, profil_semaine: 2, profil_mois: 3, rond100: 1, rond50: 0.5 });
export const NOMS = Object.freeze({ veille: 'Veille', semaine: 'Semaine', mois: 'Mois', profil_semaine: 'POC/VA sem.', profil_mois: 'POC/VA mois', rond50: 'Rond 50', rond100: 'Rond 100' });
export const TYPES = Object.freeze(Object.keys(POIDS_TF));
const H = 3600e3;
/* contexte par série : jours, semaines, mois (indices de jours), ATR journalier causal */
export function preparer(B) {
  const J = jours(B), sem = new Map(), mois = new Map(); J.forEach((g, d) => { let w = sem.get(g.semaine); if (!w) { w = { cle: g.semaine, d0: d, d1: d, i0: g.i0, i1: g.i1, h: g.h, l: g.l }; sem.set(g.semaine, w); } w.d1 = d; w.i1 = g.i1; w.h = Math.max(w.h, g.h); w.l = Math.min(w.l, g.l); const k = g.cle.slice(0, 7); let m = mois.get(k); if (!m) { m = { cle: k, d0: d, d1: d, i0: g.i0, i1: g.i1, h: g.h, l: g.l }; mois.set(k, m); } m.d1 = d; m.i1 = g.i1; m.h = Math.max(m.h, g.h); m.l = Math.min(m.l, g.l); });
  const S = [...sem.values()], M = [...mois.values()], jourDe = new Int32Array(B.length); J.forEach((g, d) => { for (let i = g.i0; i <= g.i1; i++) jourDe[i] = d; });
  const atr = new Array(J.length).fill(null); for (let d = P.atrJours + 1; d < J.length; d++) { let s = 0; for (let k = d - P.atrJours; k < d; k++) s += Math.max(J[k].h - J[k].l, Math.abs(J[k].h - J[k - 1].c), Math.abs(J[k].l - J[k - 1].c)); atr[d] = s / P.atrJours; }   // ATR des jours COMPLETS précédant le jour d
  return { B, J, S, M, jourDe, atr, semDe: J.map(g => S.findIndex(w => w.cle === g.semaine)), moisDe: J.map(g => M.findIndex(m => m.cle === g.cle.slice(0, 7))) };
}
function profil(B, i0, i1, atrj, R = P) {
  let lo = Infinity, hi = -Infinity, vt = 0; for (let i = i0; i <= i1; i++) { lo = Math.min(lo, B[i].l); hi = Math.max(hi, B[i].h); vt += B[i].v || 0; } if (!(vt > 0) || !(hi > lo)) return null;
  const bin = Math.max(0.05, R.bin * atrj), nb = Math.ceil((hi - lo) / bin) + 1, vol = new Float64Array(nb);
  for (let i = i0; i <= i1; i++) { const v = B[i].v || 0; if (!v) continue; const k0 = Math.floor((B[i].l - lo) / bin), k1 = Math.max(k0, Math.floor((B[i].h - lo) / bin)); for (let k = k0; k <= k1; k++) vol[k] += v / (k1 - k0 + 1); }
  let poc = 0; for (let k = 1; k < nb; k++) if (vol[k] > vol[poc]) poc = k; let acc = vol[poc], a = poc, b = poc; while (acc < R.vaPct * vt && (a > 0 || b < nb - 1)) { const g = a > 0 ? vol[a - 1] : -1, d = b < nb - 1 ? vol[b + 1] : -1; if (g >= d) { a--; acc += vol[a]; } else { b++; acc += vol[b]; } }
  return { poc: lo + (poc + 0.5) * bin, vah: lo + (b + 1) * bin, val: lo + a * bin };
}
/* niveaux bruts à la clôture de la bougie i (journée d en cours : seuls les jours, semaines et mois PRÉCÉDENTS, complets, servent) */
export function niveauxBruts(ctx, i, R = P) {
  const { B, J, S, M, jourDe, atr } = ctx, d = jourDe[i], a = atr[d], L = []; if (a == null || d < 2) return { niveaux: [], atrj: null };
  const pj = J[d - 1], t0 = B[J[d].i0].t, add = (p, type, t, nom) => L.push({ p, type, t, nom, tf: POIDS_TF[type] });
  add(pj.h, 'veille', t0, 'Haut de la veille'); add(pj.l, 'veille', t0, 'Bas de la veille');
  const w = ctx.semDe[d]; if (w >= 1) { const pw = S[w - 1]; add(pw.h, 'semaine', t0, 'Haut de la semaine'); add(pw.l, 'semaine', t0, 'Bas de la semaine'); const pf = profil(B, pw.i0, pw.i1, a, R); if (pf) { add(pf.poc, 'profil_semaine', t0, 'POC hebdo'); add(pf.vah, 'profil_semaine', t0, 'VAH hebdo'); add(pf.val, 'profil_semaine', t0, 'VAL hebdo'); } }
  const m = ctx.moisDe[d]; if (m >= 1) { const pm = M[m - 1]; add(pm.h, 'mois', t0, 'Haut du mois'); add(pm.l, 'mois', t0, 'Bas du mois'); const pf = profil(B, pm.i0, pm.i1, a, R); if (pf) { add(pf.poc, 'profil_mois', t0, 'POC mensuel'); add(pf.vah, 'profil_mois', t0, 'VAH mensuel'); add(pf.val, 'profil_mois', t0, 'VAL mensuel'); } }
  const px = B[i].c, lo = Math.ceil((px - R.rondsPortee * a) / 50) * 50, hi = Math.floor((px + R.rondsPortee * a) / 50) * 50; for (let r = lo; r <= hi; r += 50) add(r, r % 100 === 0 ? 'rond100' : 'rond50', t0, `Rond ${r}`);
  return { niveaux: L, atrj: a };
}
/* fusion : niveaux à moins de 0,5 ATR journalier → une zone { bas, haut, centre, membres, types } */
export function fusionner(niveaux, atrj, R = P) {
  const L = niveaux.slice().sort((x, y) => x.p - y.p), Z = []; for (const n of L) { const z = Z[Z.length - 1]; if (z && n.p - z.bas <= R.fusionAtr * atrj) { z.membres.push(n); z.haut = n.p; } else Z.push({ bas: n.p, haut: n.p, membres: [n] }); }
  return Z.map(z => ({ ...z, centre: z.membres.reduce((s, q) => s + q.p, 0) / z.membres.length, types: [...new Set(z.membres.map(q => q.type))] }));
}
/* score d'une zone : poids du timeframe, touches, ancienneté, volume */
export function scorer(z, ctx, i, atrj, R = P) {
  const { B, J, jourDe } = ctx, d = jourDe[i], i0 = J[Math.max(0, d - R.toucheJours)].i0, marge = R.toucheAtr * atrj; let touches = 0, hors = true, vTouch = 0, nTouch = 0, vTot = 0, nTot = 0;
  for (let k = i0; k <= i; k++) { const v = B[k].v || 0; vTot += v; nTot++; const dans = B[k].l <= z.haut + marge && B[k].h >= z.bas - marge; if (dans && hors) { touches++; } if (dans) { vTouch += v; nTouch++; } hors = !dans; }
  const poids = Math.min(4, Math.max(...z.membres.map(q => q.tf)) + 0.5 * (z.types.length - 1)), age = Math.min(3, (B[i].t - Math.min(...z.membres.map(q => q.t))) / 86400e3 / 30), vm = nTot && vTot > 0 && nTouch ? Math.min(2, (vTouch / nTouch) / (vTot / nTot)) : 0;
  return { score: 2 * poids + Math.min(5, touches) + age + vm, touches, poids, anciennete: age, volume: vm };
}
/* sélection finale : 3 meilleures au-dessus et 3 en dessous du prix, écart minimal d'1 ATR journalier entre deux zones affichées */
export function selectionner(zones, prix, atrj, R = P) {
  const pick = L => { const S = []; for (const z of L.sort((a, b) => b.score - a.score)) { if (S.length >= R.parCote) break; if (S.every(q => Math.abs(q.centre - z.centre) >= R.ecartAtr * atrj)) S.push(z); } return S; };
  return { haut: pick(zones.filter(z => z.bas > prix)), bas: pick(zones.filter(z => z.haut < prix)) };
}
const nom = z => { const m = z.membres.slice().sort((a, b) => b.tf - a.tf)[0]; return m.type.startsWith('rond') ? String(Math.round(m.p)) : m.nom; };
export function etiquette(z) { return `${nom(z)} ${Math.round(z.centre).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}${z.types.length > 1 ? ' +' + (z.types.length - 1) : ''}`; }
/* tout en un : niveaux majeurs à la clôture de la bougie i */
export function niveauxMajeurs(ctx, i, R = P) {
  const { niveaux, atrj } = niveauxBruts(ctx, i, R); if (!niveaux.length) return { zones: [], haut: [], bas: [], atrj: null };
  const Z = fusionner(niveaux, atrj, R).map(z => ({ ...z, ...scorer(z, ctx, i, atrj, R) })); const s = selectionner(Z, ctx.B[i].c, atrj, R);
  return { zones: Z, haut: s.haut, bas: s.bas, atrj };
}
