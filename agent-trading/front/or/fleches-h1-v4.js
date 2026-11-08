/* ═════════════ FLÈCHES H1, VERSION 4 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v4 », écrites le 2026-11-08 AVANT le code, le diagnostic chiffré et tout test, dans leur propre commit
   (la date de ce commit ouvre le bilan de v4). Seuils repris tels quels de v2 / v3 (eux-mêmes de fleches-v1) ; le seul seuil nouveau
   (8 touches) vient de la consigne. Aucun seuil réglé d'après ce qui a été vu sur les graphiques. v1, v2, v3 restent intactes et calculées
   en parallèle. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V4 = Object.freeze({
  version: 'fleches-h1-v4', periode: 'H1', ecrites: '2026-11-08',
  // niveaux admis (parmi les niveaux listés du graphique H1, calculés avec les seules bougies d'avant)
  touchesMin: 8,                                            // supports / résistances : au moins 8 touches
  liquiditesMajeures: Object.freeze(['semaine', 'mois']),   // liquidités hautes / basses : plus haut / plus bas de la semaine ou du mois précédents
  // repris de v2 / v3 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, listeAtr: 0.25, fenetreListe: 1600, pivotK: 3,
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V4 = `Règles figées ${REGLES_H1_V4.version} (écrites le ${REGLES_H1_V4.ecrites}, avant le code, le diagnostic chiffré et tout test, dans leur propre commit) :
- niveaux admis, parmi les niveaux listés du graphique H1 (règles niveaux-periode-v1, recalculés avant chaque bougie avec les seules bougies closes d'avant, 1600 au plus) : les supports et résistances d'au moins 8 touches, et les liquidités hautes / basses MAJEURES (plus haut / plus bas de la semaine ou du mois précédents, même réunis avec une autre raison) ; aucun autre niveau : ni niveau secondaire (moins de 8 touches), ni sommets / creux égaux seuls, ni veille seule ;
- flèche verte seulement sur un support admis ou une liquidité basse admise ; flèche rouge seulement sur une résistance admise ou une liquidité haute admise ; jamais ailleurs ;
- rejet (seuils repris de v2 / v3, eux-mêmes de fleches-v1) : extrême de la bougie (ou de la précédente) à moins de 0,25 ATR du niveau admis, mèche de rejet ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes ;
- confirmation à la clôture : la bougie de rejet doit CLÔTURER du bon côté du niveau, à au moins 0,15 ATR (au-dessus pour une verte, au-dessous pour une rouge) ; flèche posée à cette clôture, jamais redessinée ni retirée ;
- une seule flèche par niveau et par approche : après une flèche sur un niveau (à moins de 0,5 ATR), aucune nouvelle flèche sur ce niveau tant que le prix n'a pas clôturé à au moins 1 ATR de lui, puis n'y est pas revenu ;
- règle C inchangée : aucune flèche en régime H1 « range » (biais H1 : EMA 20 / 50) ; aucune flèche opposée à moins de 8 bougies d'une flèche posée ;
- pas de règle A (toutes les vertes sont sur un support ou une liquidité basse, toutes les rouges sur une résistance ou une liquidité haute : c'est le cas exempté de v3) ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 / v3 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur les 4 versions ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles 632b26d ; aucune règle ci-dessus n'a changé) ───────────── */
import { mediane } from './bougies-or.js';
import { closes, atrLocal, niveauxPeriode, liquidite } from './niveaux-periode.js';
import { regimes, bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { DEPUIS_VERSIONS } from './fleches-h1-v3.js';
import { deuxProportions, holm } from './zones-or.js';

/* date du commit des règles v4 (632b26d, 2026-11-08 02:34:38 heure de Paris) : début du bilan de v4 */
export const DEPUIS_H1_V4 = Object.freeze({ commit: '632b26d', t: 1794101678000, texte: '8 nov. 2026, 02 h 34' });
export const DEPUIS_4 = Object.freeze({ ...DEPUIS_VERSIONS, 'fleches-h1-v4': DEPUIS_H1_V4 });
export const NOMS_4 = Object.freeze({ 'fleches-v1': 'v1', 'fleches-h1-v2': 'v2', 'fleches-h1-v3': 'v3', 'fleches-h1-v4': 'v4' });
const H = 3600e3;

/* niveaux listés AVEC leur détail (touches des bandes, raisons des liquidités) : mêmes appels et même ordre que listesAvant de v2
   (bas, haut, type, texte identiques, vérifié par test) ; v2 / v3 peuvent donc lire cette liste sans que leur résultat change */
export function listesDetail(C, i, R = REGLES_H1_V4) {
  const Cs = C.slice(Math.max(0, i - R.fenetreListe), i), N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: C[i - 1].c });
  if (!N.a) return [];
  const L = liquidite(Cs, { periode: 'H1', maintenant: C[i].t, prix: C[i - 1].c, a: N.a, pivotsL: N.pivots, i0: N.i0 });
  return [...N.bandes.map(b => ({ bas: b.bas, haut: b.haut, type: b.cote === 'resistance' ? 'résistance' : 'support', texte: b.texte, touches: b.touches, fort: b.fort })),
    ...L.zones.map(z => ({ bas: z.p, haut: z.p, type: z.sorte === 'haute' ? 'liquidité haute' : 'liquidité basse', texte: z.texte, raisons: z.raisons }))];
}
/* liquidité « majeure » : au moins une raison semaine / mois précédents */
export const estMajeure = (L, R = REGLES_H1_V4) => Array.isArray(L.raisons) && L.raisons.some(r => R.liquiditesMajeures.some(m => r.includes(m)));
/* niveaux admis par v4 */
export function admis(L, R = REGLES_H1_V4) {
  if (L.type === 'support' || L.type === 'résistance') return (L.touches || 0) >= R.touchesMin;
  return estMajeure(L, R);
}
const dist = (x, L) => x < L.bas ? L.bas - x : x > L.haut ? x - L.haut : 0;
const volumesDe = (C, volumes) => C.map(b => { const x = volumes && volumes.get(b.t); return x != null ? x : b.v; });
/* rejet v4 : verte seulement sur support / liquidité basse admis, rouge seulement sur résistance / liquidité haute admises */
function rejetV4(C, i, a, niv, R) {
  const b = C[i], av = C[i - 1], e = b.h - b.l, tol = R.listeAtr * a, ec = R.ecartAtr * a;
  const mecheH = b.h - Math.max(b.o, b.c), mecheB = Math.min(b.o, b.c) - b.l;
  let best = null;
  for (const L of niv) {
    if ((L.type === 'résistance' || L.type === 'liquidité haute') && mecheH >= R.meche * e) {
      const x = dist(b.h, L) <= dist(av.h, L) ? b.h : av.h, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c <= ref - ec && (!best || d < best.d)) best = { d, sens: 'baisse', niveau: ref, type: L.type, L };
    }
    if ((L.type === 'support' || L.type === 'liquidité basse') && mecheB >= R.meche * e) {
      const x = dist(b.l, L) <= dist(av.l, L) ? b.l : av.l, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c >= ref + ec && (!best || d < best.d)) best = { d, sens: 'hausse', niveau: ref, type: L.type, L };
    }
  }
  return best;
}
function candidate(C, V, A, i, R) {
  const a = A[i - 1], b = C[i], e = b.h - b.l; if (!a || !(e > 0)) return false;
  const med = mediane(V.slice(i - R.volumeMedianeN, i)); if (!(V[i] >= med)) return false;
  return b.h - Math.max(b.o, b.c) >= R.meche * e || Math.min(b.o, b.c) - b.l >= R.meche * e ? med : false;
}
/* FLÈCHES H1 v4, strictement causales. listes : (C, i) → niveaux listés DÉTAILLÉS avant i (listesDetail par défaut). trace facultative. */
export function flechesH1v4(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V4, listes = listesDetail, trace = null } = {}) {
  const C = closes(B, H, maintenant), n = C.length, out = [];
  if (n < 60) return out;
  const A = atrLocal(C, 14), V = volumesDe(C, volumes), REG = regimes(C), approches = [], T = trace;
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) {
    const a = A[i - 1], b = C[i];
    for (const x of approches) if (!x.finie && i > x.i && Math.abs(b.c - x.niveau) >= R.approcheSortieAtr * (A[i] || a)) x.finie = true;
    const med = candidate(C, V, A, i, R); if (med === false) continue;
    const tous = listes(C, i, R), niv = tous.filter(L => admis(L, R)), rj = rejetV4(C, i, a, niv, R);
    if (!rj) { if (T) T({ i, t: b.t, etape: 'niveau', atr: a, listes: tous.length, admis: niv.length }); continue; }
    if (REG[i] !== 'haussier' && REG[i] !== 'baissier') { if (T) T({ i, t: b.t, etape: 'C-range', sens: rj.sens, niveau: rj.niveau, type: rj.type, regime: REG[i] }); continue; }
    const autre = rj.sens === 'hausse' ? 'baisse' : 'hausse', op = out.find(f => f.sens === autre && i - f.i < R.opposeeBougies);
    if (op) { if (T) T({ i, t: b.t, etape: 'C-opposee', sens: rj.sens, niveau: rj.niveau, type: rj.type, ecart: i - op.i }); continue; }
    const ap = approches.find(x => !x.finie && Math.abs(x.niveau - rj.niveau) < R.memeNiveauAtr * a);
    if (ap) { if (T) T({ i, t: b.t, etape: 'approche', sens: rj.sens, niveau: rj.niveau, type: rj.type, depuis: ap.i }); continue; }
    const f = { t: b.t, i, sens: rj.sens, niveau: rj.niveau, type: rj.type, touches: rj.L.touches ?? null, raisons: rj.L.raisons || null, regime: REG[i], atr: a, volume: V[i], mediane: med, version: R.version };
    out.push(f); approches.push({ i, niveau: rj.niveau, finie: false });
    if (T) T({ i, t: b.t, etape: 'posee', sens: f.sens, niveau: f.niveau, type: f.type });
  }
  return out;
}

/* bilans des QUATRE versions, chacune depuis le commit de sa règle ; Holm sur 4 versions (même calcul que bilansH1 de v3) */
export function bilans4(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_4), out = {};
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_4[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps);
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, 4 versions) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  return out;
}
