/* ═════════════ FLÈCHES H1, VERSION 2 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v2 », écrites le 2026-11-08 AVANT tout test et toute mesure, dans leur propre commit (la date de ce commit
   ouvre le bilan : seules les flèches posées après comptent). Seuils repris tels quels de « fleches-v1 » (jamais retouchés d'après les
   flèches déjà vues) ; les seuils nouveaux sont ceux de la consigne (0,25 ATR, 8 bougies) ou fixés ici une fois pour toutes (1 ATR).
   Affichées UNIQUEMENT en H1 ; v1 reste calculée en arrière-plan. Informations de lecture du graphique, jamais un ordre. */

export const REGLES_H1_V2 = Object.freeze({
  version: 'fleches-h1-v2', periode: 'H1', ecrites: '2026-11-08',
  // repris de fleches-v1 (inchangés)
  ecartAtr: 0.15, meche: 0.5, volumeMedianeN: 20, pivotK: 3,
  // B : seulement sur un niveau ou une liquidité LISTÉS (ceux du graphique H1, calculés avec les seules bougies d'avant)
  listeAtr: 0.25, fenetreListe: 1600,
  // C : pas en range ; une flèche par approche ; pas de flèche opposée à moins de 8 bougies
  opposeeBougies: 8, approcheSortieAtr: 1, memeNiveauAtr: 0.5,
  // bilan
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100,
  fraisTaker: 0.0005   // futures Kraken, preneur : 0,05 % par côté ; + spread mesuré
});

export const TEXTE_REGLES_H1_V2 = `Règles figées ${REGLES_H1_V2.version} (écrites le ${REGLES_H1_V2.ecrites}, avant tout test, dans leur propre commit ; affichées seulement en H1) :
- ATR = moyenne simple des 14 dernières étendues vraies (comme fleches-v1) ; régime H1 = règle du biais H1 : clôture au-dessus des EMA 20 et 50 et EMA 20 > EMA 50 = haussier, l'inverse = baissier, sinon « range » ;
- niveaux listés = supports, résistances et zones de liquidité du graphique H1 (règles niveaux-periode-v1), recalculés à chaque bougie avec les seules bougies closes AVANT elle (1600 au plus) ;
- rejet : l'extrême de la bougie (ou de la précédente) à moins de 0,25 ATR d'un niveau listé (B), clôture à au moins 0,15 ATR du niveau du côté d'où vient le prix, mèche de rejet ≥ la moitié de la bougie, volume ≥ la médiane des 20 précédentes (seuils de fleches-v1) ; liquidité haute : rejets vers le bas seulement, liquidité basse : vers le haut seulement ;
- A : pas de flèche verte après un rejet sur résistance tant qu'un creux plus haut (pivot de 3 bougies, au-dessus du creux confirmé précédent, formé après ce rejet) n'est pas confirmé ; miroir : pas de flèche rouge après un rebond sur support tant qu'un sommet plus bas n'est pas confirmé ;
- C : aucune flèche quand le régime H1 de la bougie est « range » ; une seule flèche par approche (même niveau à moins de 0,5 ATR : une autre flèche seulement après une clôture à au moins 1 ATR du niveau) ; aucune flèche opposée à moins de 8 bougies d'une flèche posée ;
- flèche posée à la clôture de la bougie de rejet, jamais redessinée ni retirée ;
- bilan depuis la date du commit des règles, par version : flèches indépendantes (une flèche à moins de 8 bougies de la précédente est regroupée avec elle) ; réussite = +1 ATR atteint avant −1 ATR dans les 8 bougies (les deux dans la même bougie = −1 ATR) ; R net = résultat en ATR (à défaut de cible ou de stop : clôture de la 8e bougie) moins les frais futures preneur (0,05 % par côté) et le spread mesuré ; contre 1000 flèches au hasard (même régime, même heure de Paris, même sens) ; « pas assez de données » sous 30 flèches ; aucune décision avant 100 flèches indépendantes nouvelles par version.`;

/* ───────────── calcul (ajouté après le commit des règles ; aucune règle ci-dessus n'a changé) ───────────── */
import { PERIODES } from './config-or.js';
import { mediane, ema } from './bougies-or.js';
import { decalage } from './temps-or.js';
import { alea } from './zones-or.js';
import { pluriel } from './texte-or.js';
import { closes, pivots, atrLocal, niveauxPeriode, liquidite } from './niveaux-periode.js';

/* date du commit des règles (0eb9903, 2026-11-08 01:07:14 heure de Paris) : début du bilan */
export const DEPUIS_H1_V2 = Object.freeze({ commit: '0eb9903', t: 1794096434000, texte: '8 nov. 2026, 01 h 07' });
const H = PERIODES.H1.ms;

/* heure de Paris (0-23), décalage mis en cache par heure */
const cacheDec = new Map();
export function heureParis(t) { const k = Math.floor(t / H); let d = cacheDec.get(k); if (d == null) { d = decalage(t); if (cacheDec.size > 50000) cacheDec.clear(); cacheDec.set(k, d); } return new Date(t + d).getUTCHours(); }

/* régime H1 bougie par bougie (règle du biais H1, causale : EMA des clôtures jusqu'à i) */
export function regimes(C) {
  const c = C.map(b => b.c), e20 = ema(c, 20), e50 = ema(c, 50);
  return C.map((b, i) => i < 59 ? 'inconnu' : (c[i] > e20[i] && e20[i] > e50[i]) ? 'haussier' : (c[i] < e20[i] && e20[i] < e50[i]) ? 'baissier' : 'range');
}

/* niveaux listés (graphique H1) connus avant la bougie i : bandes {bas, haut} et liquidités {p, sorte} */
export function listesAvant(C, i, R = REGLES_H1_V2) {
  const Cs = C.slice(Math.max(0, i - R.fenetreListe), i), N = niveauxPeriode(Cs, { periode: 'H1', maintenant: C[i].t, prix: C[i - 1].c });
  if (!N.a) return [];
  const L = liquidite(Cs, { periode: 'H1', maintenant: C[i].t, prix: C[i - 1].c, a: N.a, pivotsL: N.pivots, i0: N.i0 });
  return [...N.bandes.map(b => ({ bas: b.bas, haut: b.haut, type: b.cote === 'resistance' ? 'résistance' : 'support', texte: b.texte })),
    ...L.zones.map(z => ({ bas: z.p, haut: z.p, type: z.sorte === 'haute' ? 'liquidité haute' : 'liquidité basse', texte: z.texte }))];
}

/* rejet de la bougie i sur un niveau listé (règle B + seuils de fleches-v1), ou null */
function rejet(C, i, a, niv, R) {
  const b = C[i], av = C[i - 1], e = b.h - b.l, tol = R.listeAtr * a, ec = R.ecartAtr * a;
  const mecheH = b.h - Math.max(b.o, b.c), mecheB = Math.min(b.o, b.c) - b.l, dist = (x, L) => x < L.bas ? L.bas - x : x > L.haut ? x - L.haut : 0;
  let best = null;
  for (const L of niv) {
    if (L.type !== 'liquidité basse' && mecheH >= R.meche * e) {
      const x = dist(b.h, L) <= dist(av.h, L) ? b.h : av.h, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c <= ref - ec && (!best || d < best.d)) best = { d, sens: 'baisse', niveau: ref, type: L.type };
    }
    if (L.type !== 'liquidité haute' && mecheB >= R.meche * e) {
      const x = dist(b.l, L) <= dist(av.l, L) ? b.l : av.l, d = dist(x, L), ref = Math.min(Math.max(x, L.bas), L.haut);
      if (d <= tol && b.c >= ref + ec && (!best || d < best.d)) best = { d, sens: 'hausse', niveau: ref, type: L.type };
    }
  }
  return best;
}

/* FLÈCHES H1 v2, strictement causales : la flèche de la bougie i ne dépend que des bougies 0..i (rejouable bougie par bougie).
   « listes » injectable (tests) : (C, i) → niveaux listés avant i. */
const volumesDe = (C, volumes) => C.map(b => { const x = volumes && volumes.get(b.t); return x != null ? x : b.v; });
/* filtre bon marché (seuils de fleches-v1) : la bougie peut-elle être un rejet ? Seules ces bougies demandent les niveaux listés */
function candidate(C, V, A, i, R) {
  const a = A[i - 1], b = C[i], e = b.h - b.l; if (!a || !(e > 0)) return false;
  const med = mediane(V.slice(i - R.volumeMedianeN, i)); if (!(V[i] >= med)) return false;
  return b.h - Math.max(b.o, b.c) >= R.meche * e || Math.min(b.o, b.c) - b.l >= R.meche * e ? med : false;
}
/* indices des bougies candidates (pour précalculer les niveaux listés par morceaux, sans bloquer la page) */
export function indicesCandidats(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V2 } = {}) {
  const C = closes(B, H, maintenant), n = C.length, o = []; if (n < 60) return { C, indices: o };
  const A = atrLocal(C, 14), V = volumesDe(C, volumes);
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) if (candidate(C, V, A, i, R) !== false) o.push(i);
  return { C, indices: o };
}
export function flechesH1v2(B, { maintenant = Date.now(), volumes = null, R = REGLES_H1_V2, listes = listesAvant } = {}) {
  const C = closes(B, H, maintenant), n = C.length, k = R.pivotK, out = [];
  if (n < 60) return out;
  const A = atrLocal(C, 14), V = volumesDe(C, volumes), REG = regimes(C);
  const pv = pivots(C, k, 0, n - 1), creux = pv.filter(p => p.sorte === 'creux'), sommets = pv.filter(p => p.sorte === 'sommet');
  const dernierRejet = { hausse: -1, baisse: -1 }, approches = [];
  // A : depuis le rejet r, un creux plus haut (sommet plus bas) formé après r et confirmé à i (p.i + k <= i), au-dessus du creux confirmé précédent
  const confirme = (L, r, i, plusHaut) => { for (let j = 0; j < L.length && L[j].i + k <= i; j++) { if (L[j].i <= r || j === 0) continue; if (plusHaut ? L[j].p > L[j - 1].p : L[j].p < L[j - 1].p) return true; } return false; };
  for (let i = Math.max(R.volumeMedianeN + 1, 59); i < n; i++) {
    const a = A[i - 1], b = C[i];
    // approches : une clôture à au moins 1 ATR du niveau termine l'approche (la bougie i compte)
    for (const x of approches) if (!x.finie && i > x.i && Math.abs(b.c - x.niveau) >= R.approcheSortieAtr * (A[i] || a)) x.finie = true;
    const med = candidate(C, V, A, i, R); if (med === false) continue;
    const rj = rejet(C, i, a, listes(C, i, R), R); if (!rj) continue;
    const autre = rj.sens === 'hausse' ? 'baisse' : 'hausse', rAutre = dernierRejet[autre];
    dernierRejet[rj.sens] = i;   // tout rejet compte pour la règle A, qu'une flèche soit posée ou non
    if (rAutre >= 0 && !confirme(rj.sens === 'hausse' ? creux : sommets, rAutre, i, rj.sens === 'hausse')) continue;   // A
    if (REG[i] !== 'haussier' && REG[i] !== 'baissier') continue;                                                       // C : range
    if (out.some(f => f.sens === autre && i - f.i < R.opposeeBougies)) continue;                                        // C : opposée < 8 bougies
    if (approches.some(x => !x.finie && Math.abs(x.niveau - rj.niveau) < R.memeNiveauAtr * a)) continue;               // C : une par approche
    const f = { t: b.t, i, sens: rj.sens, niveau: rj.niveau, type: rj.type, regime: REG[i], atr: a, volume: V[i], mediane: med, version: R.version };
    out.push(f); approches.push({ i, niveau: rj.niveau, finie: false });
  }
  return out;
}

/* ───────────── bilan honnête depuis la date du commit (même calcul pour v1 et v2) ───────────── */
/* issue d'une flèche posée à la clôture de la bougie i : +1 ATR avant −1 ATR dans les 8 bougies (les deux dans la même bougie = −1) ;
   sinon clôture de la 8e bougie ; null si les 8 bougies ne sont pas encore closes */
export function issue(C, i, sens, a, R = REGLES_H1_V2) {
  if (!a || i + R.suiviBougies >= C.length) return null;
  const e = C[i].c, d = sens === 'hausse' ? 1 : -1, cible = e + d * R.suiviAtr * a, stop = e - d * R.suiviAtr * a;
  for (let j = i + 1; j <= i + R.suiviBougies; j++) {
    const s = d > 0 ? C[j].l <= stop : C[j].h >= stop, c = d > 0 ? C[j].h >= cible : C[j].l <= cible;
    if (s) return { ok: false, r: -R.suiviAtr, j };
    if (c) return { ok: true, r: R.suiviAtr, j };
  }
  return { ok: false, r: (C[i + R.suiviBougies].c - e) * d / a, j: i + R.suiviBougies, temps: true };
}
/* coût d'un aller-retour en R (1 R = 1 ATR) : frais preneur des deux côtés + spread mesuré (null : non mesuré) */
export const coutR = (prix, a, spread, R = REGLES_H1_V2) => (2 * R.fraisTaker * prix + (spread || 0)) / a;
/* flèches indépendantes : une flèche à moins de 8 bougies de la précédente rejoint son groupe ; on garde la première du groupe */
export function independantes(F, R = REGLES_H1_V2) {
  const s = F.slice().sort((x, y) => x.i - y.i), o = []; let der = null;
  for (const f of s) { if (der == null || f.i - der >= R.regroupementBougies) o.push(f); der = f.i; }
  return o;
}
const pc = x => x == null ? '—' : Math.round(x * 100) + ' %';
const fr = (x, d = 2) => x == null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',');
export function bilanH1(B, F, { maintenant = Date.now(), depuis = DEPUIS_H1_V2.t, spread = null, R = REGLES_H1_V2, graine = 7, version = R.version } = {}) {
  const C = closes(B, H, maintenant), n = C.length, A = atrLocal(C, 14), REG = regimes(C), idx = new Map(C.map((b, i) => [b.t, i]));
  const nouvelles = F.filter(f => f.t >= depuis).map(f => ({ ...f, i: idx.get(f.t) })).filter(f => f.i != null);
  const ind = independantes(nouvelles, R), M = [];
  for (const f of ind) { const a = A[f.i], x = issue(C, f.i, f.sens, a, R); if (x) M.push({ f, ...x, net: x.r - coutR(C[f.i].c, a, spread, R) }); }
  const N = M.length, base = { version, depuis, total: nouvelles.length, independantes: ind.length, mesurees: N, spread, decision: ind.length >= R.decision };
  const fin = ` Aucune décision avant ${R.decision} flèches indépendantes nouvelles (${Math.min(ind.length, R.decision)}/${R.decision}). Mesure passée, pas une promesse ni un signal.`;
  if (N < R.minFleches) return { ...base, assez: false, texte: `${pluriel(ind.length, 'flèche indépendante', 'flèches indépendantes')} depuis le ${DEPUIS_H1_V2.texte} · pas assez de données (${pluriel(N, 'mesurable', 'mesurables')}, il en faut ${R.minFleches}).${fin}` };
  const reussite = M.filter(x => x.ok).length / N, rNet = M.reduce((s, x) => s + x.net, 0) / N;
  // hasard : même régime, même heure de Paris, même sens que chaque flèche tirée ; bougies de tout l'historique chargé
  const pool = new Map(); for (let i = 60; i + R.suiviBougies < n; i++) { if (!A[i]) continue; const c = REG[i] + '|' + heureParis(C[i].t); (pool.get(c) || pool.set(c, []).get(c)).push(i); }
  const r = alea(graine); let ok = 0, tot = 0, somme = 0;
  for (let k = 0; k < R.hasard; k++) {
    const x = M[Math.floor(r() * N)], L = pool.get(REG[x.f.i] + '|' + heureParis(x.f.t)); if (!L || !L.length) continue;
    const j = L[Math.floor(r() * L.length)], y = issue(C, j, x.f.sens, A[j], R); if (!y) continue;
    tot++; if (y.ok) ok++; somme += y.r - coutR(C[j].c, A[j], spread, R);
  }
  const hasard = tot ? { reussite: ok / tot, rNet: somme / tot, tirages: tot } : null;
  const sp = spread == null ? 'spread non mesuré : frais seuls' : `frais preneur 0,05 % par côté + spread mesuré ${spread.toFixed(2).replace('.', ',')} $`;
  return { ...base, assez: true, reussite, rNet, hasard,
    texte: `${pluriel(ind.length, 'flèche indépendante', 'flèches indépendantes')} depuis le ${DEPUIS_H1_V2.texte} · ${pc(reussite)} atteignent +1 ATR avant −1 ATR en 8 bougies · R net ${fr(rNet)} par flèche (${sp}) · au hasard (même régime, mêmes heures) : ${hasard ? `${pc(hasard.reussite)}, R net ${fr(hasard.rNet)} (${hasard.tirages} tirages)` : 'non mesurable'}.${fin}` };
}
