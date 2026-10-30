import { ema, atr, sma, swings, dernierConf, regrouper, alignerFin, profilVolume, PAS, fr, prixTexte } from './outils.js';

/* ═════════════ MOTEUR « TRADER » (V12, phase 2 ; module pur, déterministe, testé : galaxie/tests/trader-moteur-test.mjs) ═════════════
   Un trader regarde dans cet ordre : le BIAIS (H4 / H1), les ZONES (supports, résistances, volume, liquidité), puis un DÉCLENCHEUR en M15. Ce moteur fait pareil, avec des règles explicites FIXÉES À L'AVANCE
   (aucun réglage n'est ajusté d'après un résultat), et il ne dépend d'AUCUNE preuve préalable : il propose, la preuve se construit en suivant les propositions en direct (suivi.js, bilan.js).
   Quatre déclencheurs : cassure de structure + retest, balayage de liquidité puis reprise, repli dans la tendance, rebond d'épuisement.
   Gestion intégrée : stop structurel, cible 1 = zone de liquidité la plus proche valable (sortie partielle ~50 %, stop remonté à l'entrée), cible 2 = aimant suivant, RR ≥ 1,5, fréquence bornée, expiration.
   CAUSALITÉ : rien de ce qui suit l'index i n'entre dans une proposition faite à la clôture de la bougie i (vérifié par le test préfixe / série complète). Les données du carnet d'ordres et des liquidations
   n'existent pas en historique : elles ne sont PAS utilisées par ce moteur (elles pourront ajouter des confluences en direct, étiquetées comme telles). Aucun ordre n'est passé. */
export const STYLES = Object.freeze({
  prudent: { nom: 'Prudent', confluenceMin: 3, rrMin: 2, maxParJour: 2 },
  equilibre: { nom: 'Équilibré', confluenceMin: 2, rrMin: 1.5, maxParJour: 3 },
  actif: { nom: 'Actif', confluenceMin: 1, rrMin: 1.5, maxParJour: 3 }
});
export const SETUPS = Object.freeze({
  cassure_retest: 'Cassure de structure + retest dans le sens du biais',
  balayage_reprise: 'Balayage de liquidité puis reprise (sweep & reclaim)',
  repli_tendance: 'Repli dans la tendance vers VWAP / POC / zone de volume',
  rebond_epuisement: 'Rebond de fin de mouvement (épuisement)'
});
export const ORDRE_SETUPS = Object.freeze(Object.keys(SETUPS));
/* Plafond de frais décidé AVANT toute mesure : le stop d'une proposition est au moins assez large pour que les frais aller-retour restent sous 0,22 R (un stop plus serré ne peut pas survivre aux frais). */
export const COUT_MAX_R = 0.22, COUT_ALLER_RETOUR_PCT = 0.13;
const FENETRE_NIVEAUX = 2880, PLAFOND_SCAN = 3000, JOUR = 86400e3, SEMAINE = 7 * JOUR;

/* Prépare TOUTES les colonnes causales d'une série M15 (une fois) ; chaque requête ensuite ne lit que l'index ≤ i. */
export function preparer(m15) {
  const n = m15.n, s1 = regrouper(m15, 3600e3), s4 = regrouper(m15, 14400e3), P = { m15, n, s1, s4 };
  P.A = atr(m15.h, m15.l, m15.c, 14); P.vmoy = sma(m15.v, 50);
  P.delta = new Float64Array(n); for (let i = 0; i < n; i++) P.delta[i] = Number.isNaN(m15.vb[i]) ? NaN : 2 * m15.vb[i] - m15.v[i];
  P.k1 = alignerFin(s1.fin, n); P.k4 = alignerFin(s4.fin, n);
  P.ema50h1 = ema(s1.c, 50); P.ema20h4 = ema(s4.c, 20); P.atr1 = atr(s1.h, s1.l, s1.c, 14);
  P.sw15 = swings(m15.h, m15.l, 4).map(x => ({ ...x, src: 'M15' }));
  const bruts = swings(s1.h, s1.l, 3); P.sw1 = bruts.map(x => ({ j: s1.fin[x.j], conf: s1.fin[x.conf], prix: x.prix, haut: x.haut, src: 'H1' })).sort((a, b) => a.conf - b.conf || a.j - b.j);
  for (const l of [P.sw15, P.sw1]) for (const x of l) {
    x.pris = Infinity; const fin = Math.min(n - 1, x.conf + PLAFOND_SCAN);
    for (let q = x.conf + 1; q <= fin; q++) if (x.haut ? m15.h[q] > x.prix : m15.l[q] < x.prix) { x.pris = q; break; }
  }
  // jour / semaine : plus hauts et plus bas de la VEILLE et de la semaine précédente, hauts et bas du jour / de la semaine EN COURS, VWAP du jour
  P.pdh = new Float64Array(n).fill(NaN); P.pdl = new Float64Array(n).fill(NaN); P.pwh = new Float64Array(n).fill(NaN); P.pwl = new Float64Array(n).fill(NaN);
  P.jh = new Float64Array(n); P.jl = new Float64Array(n); P.sh = new Float64Array(n); P.sl = new Float64Array(n); P.vwap = new Float64Array(n).fill(NaN);
  const jours = new Map(), semaines = new Map(); let jk = null, sk = null, jH = 0, jL = 0, sH = 0, sL = 0, pv = 0, v = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.floor(m15.t[i] / JOUR), w = Math.floor((m15.t[i] / JOUR + 3) / 7);
    if (d !== jk) { if (jk != null) jours.set(jk, [jH, jL]); jk = d; jH = -Infinity; jL = Infinity; pv = 0; v = 0; }
    if (w !== sk) { if (sk != null) semaines.set(sk, [sH, sL]); sk = w; sH = -Infinity; sL = Infinity; }
    jH = Math.max(jH, m15.h[i]); jL = Math.min(jL, m15.l[i]); sH = Math.max(sH, m15.h[i]); sL = Math.min(sL, m15.l[i]);
    const tp = (m15.h[i] + m15.l[i] + m15.c[i]) / 3; pv += tp * m15.v[i]; v += m15.v[i]; P.vwap[i] = v > 0 ? pv / v : m15.c[i];
    P.jh[i] = jH; P.jl[i] = jL; P.sh[i] = sH; P.sl[i] = sL;
    const pj = jours.get(d - 1), ps = semaines.get(w - 1);
    if (pj) { P.pdh[i] = pj[0]; P.pdl[i] = pj[1]; } if (ps) { P.pwh[i] = ps[0]; P.pwl[i] = ps[1]; }
  }
  P.cacheProfil = new Map();
  return P;
}
export const profilA = (P, i) => { if (!P.cacheProfil.has(i)) P.cacheProfil.set(i, i >= 192 ? profilVolume(P.m15, i - 191, i) : null); return P.cacheProfil.get(i); };

/* Structure H1 : plus hauts / plus bas confirmés. +1 (HH + HL), −1 (LH + LL), 0 sinon. */
function structureH1(P, i) {
  const r = dernierConf(P.sw1, i); if (r < 0) return 0; const h = [], b = [];
  for (let q = r; q >= 0 && (h.length < 2 || b.length < 2); q--) { const x = P.sw1[q]; if (x.haut) { if (h.length < 2) h.push(x.prix); } else if (b.length < 2) b.push(x.prix); }
  if (h.length < 2 || b.length < 2) return 0;
  const c = P.m15.c[i];
  if (c < b[0] && b[0] > b[1]) return -1;               // cassure de structure baissière : le dernier plus bas H1 (un plus bas plus haut) est clôturé en dessous
  if (c > h[0] && h[0] < h[1]) return 1;                // cassure de structure haussière
  return h[0] > h[1] && b[0] > b[1] ? 1 : h[0] < h[1] && b[0] < b[1] ? -1 : 0;
}
/* Biais et régime à la clôture de la bougie i. */
export function analyser(P, i) {
  const m = P.m15, c = m.c[i], k1 = P.k1[i], k4 = P.k4[i];
  if (k1 < 60 || k4 < 25 || !(P.A[i] > 0)) return { ok: false, biais: 0, regime: 'inconnu', score: 0 };
  const struct = structureH1(P, i), e50 = P.ema50h1[k1], e20 = P.ema20h4[k4];
  const s = struct + (c > e50 ? 1 : -1) + (c > e20 ? 1 : -1), biais = s >= 2 ? 1 : s <= -2 ? -1 : 0;
  // régime : efficacité de la dernière journée H1 (24 bougies) et volatilité relative
  let somme = 0; for (let q = k1 - 23; q <= k1; q++) somme += Math.abs(P.s1.c[q] - P.s1.c[q - 1]);
  const eff = somme > 0 ? Math.abs(P.s1.c[k1] - P.s1.c[k1 - 24]) / somme : 0, atrRel = P.atr1[k1] / (P.atr1[Math.max(0, k1 - 240)] || P.atr1[k1]);
  const regime = atrRel > 1.8 ? 'transition' : eff < 0.2 ? 'range' : 'tendance';
  return { ok: true, biais, regime, score: s, struct, eff: +eff.toFixed(2), vwap: P.vwap[i], ema50h1: e50, ema20h4: e20 };
}

/* Niveaux de liquidité NON PRIS à l'instant i (swings M15 / H1 de moins de 30 jours, hauts et bas de la veille et de la semaine précédente). */
export function niveauxLiquidite(P, i) {
  const out = [];
  for (const [liste, src] of [[P.sw15, 'M15'], [P.sw1, 'H1']]) {
    for (let r = dernierConf(liste, i); r >= 0; r--) { const x = liste[r]; if (x.conf < i - FENETRE_NIVEAUX) break; if (x.j >= i - FENETRE_NIVEAUX && x.pris > i) out.push({ prix: x.prix, haut: x.haut, src, j: x.j }); }
  }
  const m = P.m15;
  if (Number.isFinite(P.pdh[i])) { if (P.jh[i] < P.pdh[i]) out.push({ prix: P.pdh[i], haut: true, src: 'veille', j: -1 }); if (P.jl[i] > P.pdl[i]) out.push({ prix: P.pdl[i], haut: false, src: 'veille', j: -1 }); }
  if (Number.isFinite(P.pwh[i])) { if (P.sh[i] < P.pwh[i]) out.push({ prix: P.pwh[i], haut: true, src: 'semaine', j: -1 }); if (P.sl[i] > P.pwl[i]) out.push({ prix: P.pwl[i], haut: false, src: 'semaine', j: -1 }); }
  void m; return out;
}
/* Niveaux pris dans les `bars` dernières bougies (candidats au balayage / à la cassure). */
export function niveauxPris(P, i, bars) {
  const out = [];
  for (const [liste, src] of [[P.sw15, 'M15'], [P.sw1, 'H1']]) {
    for (let r = dernierConf(liste, i); r >= 0; r--) { const x = liste[r]; if (x.conf < i - FENETRE_NIVEAUX) break; if (x.pris <= i && x.pris >= i - bars && x.j >= i - FENETRE_NIVEAUX) out.push({ prix: x.prix, haut: x.haut, src, j: x.j, pris: x.pris }); }
  }
  const m = P.m15;
  if (Number.isFinite(P.pdh[i])) {
    for (const [pris, prix, haut] of [[m.h, P.pdh[i], true], [m.l, P.pdl[i], false]]) { let q0 = -1; for (let q = i; q >= Math.max(0, i - bars); q--) if (haut ? pris[q] > prix : pris[q] < prix) q0 = q; if (q0 >= 0 && (haut ? P.jh[Math.max(0, q0 - 1)] <= prix : P.jl[Math.max(0, q0 - 1)] >= prix)) out.push({ prix, haut, src: 'veille', j: -1, pris: q0 }); }
  }
  return out;
}
const POIDS_SRC = { semaine: 4, veille: 3, H1: 2, M15: 1 };
const egauxAutour = (niveaux, niv) => niveaux.filter(x => x !== niv && x.haut === niv.haut && Math.abs(x.prix - niv.prix) / niv.prix < 0.0012).length;

/* Choisit cible 1 et cible 2 parmi les niveaux de liquidité dans le sens d : cible 1 = le plus proche qui offre au moins rrMin × risque (et au plus 6 R) ; cible 2 = le suivant. */
function choisirCibles(niveaux, d, entree, risque, rrMin, imposees = null) {
  const sens = niveaux.filter(x => (d > 0 ? x.haut && x.prix > entree : !x.haut && x.prix < entree)).map(x => ({ ...x, dist: Math.abs(x.prix - entree) })).sort((a, b) => a.dist - b.dist);
  const proches = sens.filter(x => x.dist < rrMin * risque).length ? sens.find(x => x.dist < rrMin * risque) : null;
  let t1 = sens.find(x => x.dist >= rrMin * risque && x.dist <= 6 * risque), nom1 = null, nom2 = null;
  if (imposees && imposees.t1 != null && Math.abs(imposees.t1 - entree) >= rrMin * risque) { t1 = { prix: imposees.t1, dist: Math.abs(imposees.t1 - entree), src: imposees.nom }; }
  if (!t1) return { ok: false, raison: sens.length ? 'la cible de liquidité la plus proche est à ' + fr((proches || sens[0]).dist / risque, 1) + ' R, il en faut ' + fr(rrMin, 1) + ' au moins' : 'aucune zone de liquidité non prise dans le sens du trade' };
  nom1 = t1.src === 'M15' ? 'dernier extrême M15' : t1.src === 'H1' ? 'extrême H1' : t1.src === 'veille' ? 'plus haut / bas de la veille' : t1.src === 'semaine' ? 'plus haut / bas de la semaine précédente' : t1.src;
  let t2 = imposees && imposees.t2 != null ? { prix: imposees.t2, src: imposees.nom2 } : sens.find(x => x.dist > t1.dist + 0.5 * risque);
  if (t2 && Math.abs(t2.prix - entree) <= Math.abs(t1.prix - entree)) t2 = null;
  const prix2 = t2 ? t2.prix : entree + d * Math.min(4 * risque, 1.6 * t1.dist);
  nom2 = t2 ? (t2.src === 'M15' ? 'extrême M15 suivant' : t2.src === 'H1' ? 'extrême H1 suivant' : t2.src === 'veille' ? 'plus haut / bas de la veille' : t2.src === 'semaine' ? 'plus haut / bas de la semaine précédente' : t2.src) : 'extension (aimant suivant estimé)';
  return { ok: true, t1: t1.prix, nom1, t2: prix2, nom2, rr1: t1.dist / risque, rr2: Math.abs(prix2 - entree) / risque };
}

function confluences(P, i, a, d, entree, niveau, extra) {
  const L = [], A = P.A[i], prof = profilA(P, i);
  if (a.biais === d) L.push({ cle: 'biais', texte: 'biais H1 / H4 dans le sens du trade' });
  if (niveau && (niveau.src === 'H1' || niveau.src === 'veille' || niveau.src === 'semaine')) L.push({ cle: 'niveau', texte: 'niveau important (' + (niveau.src === 'H1' ? 'extrême H1' : niveau.src === 'veille' ? 'veille' : 'semaine précédente') + ')' });
  if (extra.egaux > 0) L.push({ cle: 'egaux', texte: 'plus hauts / plus bas égaux (liquidité empilée)' });
  if (prof && (Math.abs(entree - prof.poc) <= 0.4 * A || Math.abs(entree - prof.val) <= 0.4 * A || Math.abs(entree - prof.vah) <= 0.4 * A)) L.push({ cle: 'volume', texte: 'zone de volume (POC ou bord de la zone de valeur)' });
  if (Math.abs(entree - P.vwap[i]) <= 0.4 * A) L.push({ cle: 'vwap', texte: 'VWAP du jour' });
  if (extra.delta) L.push({ cle: 'delta', texte: 'delta acheteur / vendeur confirmé dans le sens du trade' });
  if (extra.absorption) L.push({ cle: 'absorption', texte: 'absorption (volume fort, rejet du prix)' });
  if (extra.cibleRR >= 2) L.push({ cle: 'rr', texte: 'cible de liquidité à ' + fr(extra.cibleRR, 1) + ' R ou plus' });
  if (extra.tendance && a.regime === 'tendance') L.push({ cle: 'regime', texte: 'marché en tendance' });
  return L;
}
const dirMot = d => (d > 0 ? 'achat' : 'vente');

/* Construit la proposition si les conditions de risque sont remplies, sinon rend null. */
function monter(P, i, a, R, niveaux, d, setup, tf, entree, stop0, niveau, extra, imposees = null) {
  const A = P.A[i], c = P.m15.c[i];
  let risque = Math.abs(entree - stop0); risque = Math.max(risque, 0.5 * A, (R.coutsPct || COUT_ALLER_RETOUR_PCT) / 100 * entree / COUT_MAX_R);        // plancher : les frais aller-retour restent sous 0,22 R
  if (risque > 5 * A && risque > 0.025 * entree) return { refus: 'stop structurel trop éloigné (' + fr(risque / A, 1) + ' ATR)' };
  const stop = entree - d * risque;
  if (d > 0 ? entree >= c : entree <= c) return { refus: 'prix d’entrée déjà dépassé' };
  const t = choisirCibles(niveaux, d, entree, risque, R.rrMin, imposees); if (!t.ok) return { refus: t.raison };
  const conf = confluences(P, i, a, d, entree, niveau, { ...extra, cibleRR: t.rr1 });
  return { refus: null, p: { setup, nom: SETUPS[setup], tf, sens: d, entree, stop, cible1: t.t1, cible1Nom: t.nom1, cible2: t.t2, cible2Nom: t.nom2, rr: t.rr1, rr2: t.rr2, distancePct: risque / entree, confluences: conf, nConfluences: conf.length, diamant: conf.length >= 4, atr: A } };
}

/* ─── Les quatre déclencheurs ─── */
function balayageReprise(P, i, a, R, niveaux, d) {
  const m = P.m15, A = P.A[i], pris = niveauxPris(P, i, 2).filter(x => x.haut === (d < 0)), out = [];
  for (const niv of pris.sort((x, y) => POIDS_SRC[y.src] - POIDS_SRC[x.src])) {
    let ext = d > 0 ? Infinity : -Infinity; for (let q = niv.pris; q <= i; q++) ext = d > 0 ? Math.min(ext, m.l[q]) : Math.max(ext, m.h[q]);
    const pen = Math.abs(niv.prix - ext); if (pen < 0.05 * A) continue;
    if (!(d > 0 ? m.c[i] > niv.prix : m.c[i] < niv.prix)) continue;                      // reprise : la clôture est revenue de l'autre côté du niveau
    let dsum = 0, connu = true, vol = 0; for (let q = niv.pris; q <= i; q++) { if (Number.isNaN(P.delta[q])) connu = false; else dsum += P.delta[q]; vol = Math.max(vol, m.v[q]); }
    const rng = m.h[i] - m.l[i], pos = rng > 0 ? (d > 0 ? (m.c[i] - m.l[i]) / rng : (m.h[i] - m.c[i]) / rng) : 0;
    const delta = connu && dsum * d > 0, absorption = vol >= 1.3 * P.vmoy[i] && pos >= 0.5;
    if (!delta && !absorption && !(pos >= 0.6 && (d > 0 ? m.c[i] > m.o[i] : m.c[i] < m.o[i]))) continue;      // il faut un signe de rejet
    const entree = d > 0 ? Math.min(m.c[i] - 0.05 * A, niv.prix + 0.15 * A) : Math.max(m.c[i] + 0.05 * A, niv.prix - 0.15 * A), stop0 = ext - d * 0.25 * A;
    const r = monter(P, i, a, R, niveaux, d, 'balayage_reprise', niv.src === 'M15' ? 'M15' : 'H1', entree, stop0, niv, { egaux: egauxAutour(niveaux, niv), delta, absorption, tendance: false });
    if (r.p) { r.p.raison = 'Le prix a balayé le ' + (niv.haut ? 'plus haut' : 'plus bas') + ' ' + (niv.src === 'veille' ? 'de la veille' : niv.src === 'semaine' ? 'de la semaine précédente' : niv.src) + ' (' + prixTexte(niv.prix) + ') puis a refermé ' + (d > 0 ? 'au-dessus' : 'en dessous') + ' : ' + (delta ? 'le delta confirme' : absorption ? 'le volume a été absorbé' : 'le rejet est net') + '.'; r.p.invalidation = 'Annulée si le prix ' + (d > 0 ? 'repasse sous ' : 'repasse au-dessus de ') + prixTexte(r.p.stop) + ' (stop), ou si l’ordre n’est pas touché dans les prochaines heures.'; return r; }
    out.push(r);
  }
  return out.length ? out[0] : null;
}
function cassureRetest(P, i, a, R, niveaux, d) {
  if (a.biais !== d) return null; const m = P.m15, A = P.A[i];
  const cand = []; for (const [liste, src] of [[P.sw15, 'M15'], [P.sw1, 'H1']]) for (let r = dernierConf(liste, i); r >= 0; r--) { const x = liste[r]; if (x.conf < i - 400) break; if (x.haut === (d < 0) && x.pris <= i && x.pris >= i - 12) cand.push({ ...x, src }); }
  cand.sort((x, y) => POIDS_SRC[y.src] - POIDS_SRC[x.src] || y.j - x.j);
  for (const niv of cand) {
    // cassure par une CLÔTURE de l'autre côté du niveau
    let brk = -1; for (let q = niv.pris; q <= i; q++) if (d > 0 ? m.c[q] > niv.prix : m.c[q] < niv.prix) { brk = q; break; }
    if (brk < 0) continue;
    let ext = d > 0 ? -Infinity : Infinity; for (let q = brk; q <= i; q++) ext = d > 0 ? Math.max(ext, m.l[q]) : Math.min(ext, m.h[q]);
    // le prix doit n'être pas déjà revenu franchement dans l'ancienne zone, et se trouver encore du bon côté (retest à venir)
    let revenu = false; for (let q = brk + 1; q <= i; q++) if (d > 0 ? m.c[q] < niv.prix - 0.3 * A : m.c[q] > niv.prix + 0.3 * A) revenu = true; if (revenu) continue;
    if (!(d > 0 ? m.c[i] > niv.prix + 0.1 * A : m.c[i] < niv.prix - 0.1 * A)) continue;
    const entree = niv.prix, stop0 = d > 0 ? Math.min(ext, niv.prix - 0.8 * A) - 0.25 * A : Math.max(ext, niv.prix + 0.8 * A) + 0.25 * A;
    const r = monter(P, i, a, R, niveaux, d, 'cassure_retest', niv.src === 'M15' ? 'M15' : 'H1', entree, stop0, niv, { egaux: egauxAutour(niveaux, niv), delta: false, absorption: false, tendance: true });
    if (r.p) { r.p.raison = 'Cassure ' + (d > 0 ? 'haussière' : 'baissière') + ' de la structure ' + niv.src + ' (' + prixTexte(niv.prix) + ') dans le sens du biais ' + (d > 0 ? 'haussier' : 'baissier') + ' ; ordre limite sur le retest du niveau.'; r.p.invalidation = 'Annulée si le prix clôture de nouveau ' + (d > 0 ? 'sous ' : 'au-dessus de ') + prixTexte(niv.prix) + ' avant d’être touché, ou stop ' + prixTexte(r.p.stop) + '.'; return r; }
    return r;
  }
  return null;
}
function repliTendance(P, i, a, R, niveaux, d) {
  if (a.biais !== d || a.regime !== 'tendance') return null; const m = P.m15, A = P.A[i], c = m.c[i], prof = profilA(P, i);
  const cands = [['VWAP du jour', P.vwap[i]], ['EMA 50 H1', a.ema50h1]]; if (prof) cands.push(['POC du profil de volume', prof.poc]);
  const bons = cands.filter(([, p]) => (d > 0 ? p < c - 0.1 * A : p > c + 0.1 * A) && Math.abs(p - c) <= 1.8 * A);
  if (!bons.length) return null;
  let extremeRecent = d > 0 ? -Infinity : Infinity; for (let q = i - 23; q <= i; q++) extremeRecent = d > 0 ? Math.max(extremeRecent, m.h[q]) : Math.min(extremeRecent, m.l[q]);
  if (Math.abs(extremeRecent - c) < 0.8 * A) return null;                                   // pas de repli en cours
  bons.sort((x, y) => Math.abs(x[1] - c) - Math.abs(y[1] - c)); const ref = bons[0][1], groupe = bons.filter(([, p]) => Math.abs(p - ref) <= 0.35 * A), entree = groupe.reduce((s, [, p]) => s + p, 0) / groupe.length;
  const r0 = dernierConf(P.sw15, i); let sw = null; for (let r = r0; r >= 0 && r > r0 - 40; r--) { const x = P.sw15[r]; if (x.haut === (d < 0) && (d > 0 ? x.prix < entree : x.prix > entree)) { sw = x.prix; break; } }
  const stop0 = (d > 0 ? Math.min(sw == null ? Infinity : sw, entree - 1.2 * A) : Math.max(sw == null ? -Infinity : sw, entree + 1.2 * A)) - d * 0.2 * A;
  const r = monter(P, i, a, R, niveaux, d, 'repli_tendance', 'M15', entree, stop0, null, { egaux: 0, delta: false, absorption: false, tendance: true }, { t1: d > 0 ? extremeRecent : extremeRecent, nom: 'extrême du dernier mouvement' });
  if (r.p) {
    r.p.nConfluences = r.p.confluences.length + 0; if (groupe.length >= 2) { r.p.confluences.push({ cle: 'groupe', texte: groupe.length + ' repères au même endroit (' + groupe.map(g => g[0]).join(', ') + ')' }); r.p.nConfluences = r.p.confluences.length; r.p.diamant = r.p.nConfluences >= 4; }
    r.p.raison = 'Marché en tendance ' + (d > 0 ? 'haussière' : 'baissière') + ' : repli vers ' + groupe.map(g => g[0]).join(' + ') + ' (' + prixTexte(entree) + '), ordre limite dans le sens du biais.'; r.p.invalidation = 'Annulée si le prix traverse ' + prixTexte(r.p.stop) + ' ou si la tendance H1 / H4 change de sens.';
  }
  return r;
}
function rebondEpuisement(P, i, a, R, niveaux, d) {
  const m = P.m15, A = P.A[i], k1 = P.k1[i]; if (k1 < 20) return null;
  let q0 = i; for (let q = i - 5; q <= i; q++) if (d > 0 ? m.l[q] < m.l[q0] : m.h[q] > m.h[q0]) q0 = q;
  let ext = d > 0 ? -Infinity : Infinity; for (let q = q0 - 24; q <= q0; q++) ext = d > 0 ? Math.max(ext, m.h[q]) : Math.min(ext, m.l[q]);
  const bout = d > 0 ? m.l[q0] : m.h[q0], mouvement = Math.abs(ext - bout); if (mouvement < 4 * P.atr1[k1]) return null;
  let spike = -1; for (let q = Math.max(q0 - 1, i - 5); q <= i; q++) if (m.v[q] >= 2 * P.vmoy[i]) { spike = q; break; }
  if (spike < 0) return null;
  const rng = m.h[spike] - m.l[spike], meche = rng > 0 ? (d > 0 ? (Math.min(m.o[spike], m.c[spike]) - m.l[spike]) / rng : (m.h[spike] - Math.max(m.o[spike], m.c[spike])) / rng) : 0;
  const dl = P.delta[spike], delta = Number.isFinite(dl) && dl * d > 0, absorption = meche >= 0.5 || (d > 0 ? m.c[spike] > m.o[spike] : m.c[spike] < m.o[spike]) && delta;
  if (!absorption && !delta) return null;
  if (!(d > 0 ? m.c[i] > bout + 0.3 * A : m.c[i] < bout - 0.3 * A)) return null;           // le rebond doit avoir commencé
  const entree = d > 0 ? Math.min(m.c[i] - 0.05 * A, Math.max(m.c[spike], bout + 0.3 * A)) : Math.max(m.c[i] + 0.05 * A, Math.min(m.c[spike], bout - 0.3 * A)), stop0 = bout - d * 0.3 * A;
  const f1 = bout + d * 0.382 * mouvement, f2 = bout + d * 0.618 * mouvement;
  const r = monter(P, i, a, R, niveaux, d, 'rebond_epuisement', 'M15', entree, stop0, null, { egaux: 0, delta, absorption: true, tendance: false }, { t1: f1, nom: 'retour de 38 % du mouvement', t2: f2, nom2: 'retour de 62 % du mouvement' });
  if (r.p) { r.p.raison = 'Mouvement de ' + fr(mouvement / P.atr1[k1], 1) + ' ATR H1 qui s’épuise : pic de volume absorbé' + (delta ? ' avec delta ' + (d > 0 ? 'acheteur' : 'vendeur') : '') + ' ; rebond proposé vers le retour de 38 % puis 62 %.'; r.p.invalidation = 'Annulée si le prix reprend ' + (d > 0 ? 'sous ' : 'au-dessus de ') + prixTexte(r.p.stop) + ' : l’épuisement n’en était pas un.'; r.p.contreBiais = a.biais === -d; }
  return r;
}
const DECLENCHEURS = { cassure_retest: cassureRetest, balayage_reprise: balayageReprise, repli_tendance: repliTendance, rebond_epuisement: rebondEpuisement };

/* Toutes les propositions valables à la clôture de la bougie i (avant le plafond quotidien). Rend { propositions, refus } ; `refus` explique ce qui a presque marché (« pourquoi aucune position »). */
export function proposer(P, i, reglages = {}) {
  const R = { ...STYLES[reglages.style || 'equilibre'], ...reglages, ...(reglages.rrMin ? { rrMin: reglages.rrMin } : {}) }, a = analyser(P, i), propositions = [], refus = [];
  if (!a.ok) return { propositions, refus: [{ setup: null, pourquoi: 'pas assez d’historique H1 / H4 pour juger le biais' }], analyse: a };
  const niveaux = niveauxLiquidite(P, i), actives = reglages.setups || ORDRE_SETUPS;
  for (const setup of actives) for (const d of [1, -1]) {
    const r = DECLENCHEURS[setup](P, i, a, R, niveaux, d); if (!r) continue;
    if (r.refus) { refus.push({ setup, sens: d, pourquoi: r.refus }); continue; }
    const p = r.p; p.t = P.m15.t[i] + PAS; p.i = i; p.biais = a.biais; p.regime = a.regime;
    if (p.nConfluences < R.confluenceMin) { refus.push({ setup, sens: d, pourquoi: p.nConfluences + ' confluence(s), il en faut ' + R.confluenceMin + ' (style ' + R.nom + ')' }); continue; }
    p.ttl = p.tf === 'H1' ? 32 : 16; p.id = [reglages.actif || '?', setup, d, P.m15.t[i]].join('|'); p.actif = reglages.actif || null; p.style = reglages.style || 'equilibre';
    propositions.push(p);
  }
  propositions.sort((x, y) => y.nConfluences - x.nConfluences || y.rr - x.rr);
  return { propositions, refus, analyse: a };
}
export { dirMot };
