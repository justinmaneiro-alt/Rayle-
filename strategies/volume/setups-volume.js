/* ═════════════ SETUPS DE VOLUME (V14, phases 0 bis et 5 ; module pur, testé) ═════════════
   Règle de Justin : AU PLUS 3 conditions par setup : (1) un NIVEAU (extrême, POC, VAH/VAL, HVN, confluence), (2) une confirmation de VOLUME NET ou d'ABSORPTION, (3) une invalidation claire (le stop).
   Aucun filtre de biais H4, de volatilité, d'horaire ou de tendance dans le signal (ils ne sont que mesurés dans l'entonnoir, `filtres` plus bas).
   Un signal : { i, sens (+1 achat / −1 vente), niveau (prix de l'ordre LIMITE), stop, rr, cle, setup, raison, niv: nom du niveau }.
   Causalité : le signal à la barre i ne regarde que les barres 0..i et les profils de jours TERMINÉS. L'ordre est posé à la clôture de i et vit `validite` barres. */
import { profilJour, profilSemaine, absorption } from './serie-volume.js';

export const SETUPS_VOLUME = Object.freeze({
  absorption_extreme: { nom: 'Absorption à un extrême', famille: 'a', carnet: false, texte: 'Balayage du plus haut / plus bas récent, volume agressif absorbé, entrée sur le retour.' },
  rejet_niveau: { nom: 'Rejet d’un niveau du profil de volume', famille: 'b', carnet: false, texte: 'Le prix touche POC / VAH / VAL de la veille, repart, et le volume net confirme.' },
  acceptation_hors_valeur: { nom: 'Acceptation hors de la zone de valeur', famille: 'b', carnet: false, texte: 'Clôture au-delà de VAH / VAL avec volume net dans le sens ; entrée sur le retest.' },
  divergence_cvd: { nom: 'Divergence CVD / prix', famille: 'c', carnet: false, texte: 'Nouveau plus bas (haut) du prix mais le volume net ne confirme pas.' },
  diamant: { nom: 'Zone diamant', famille: 'e', carnet: false, texte: 'Au moins 3 éléments au même niveau (POC, HVN, VAH/VAL, extrême) + absorption.' },
  mur_carnet: { nom: 'Mur du carnet d’ordres', famille: 'd', carnet: true, texte: 'Gros mur absorbé ou qui tient. Pas d’historique : suivi en direct seulement (forward-test).' }
});

const LVL = (nom, prix) => (prix > 0 ? { nom, prix } : null);
export const cleSignal = (setup, p) => setup + '|' + Object.entries(p).map(([k, v]) => k + '=' + v).join(',');

/* Pose le stop sous / sur l'invalidation avec un risque minimal en ATR (les frais pèsent en R sur les stops serrés : levier numéro un). */
function fabriquer(s, i, sens, niveau, invalid, { rr, margeAtr = 0.25, riskMinAtr = 0.8, validite = 4 }, meta) {
  const atr = s.atr[i]; if (!(atr > 0) || !(niveau > 0)) return null;
  let stop = sens > 0 ? invalid - margeAtr * atr : invalid + margeAtr * atr;
  if (Math.abs(niveau - stop) < riskMinAtr * atr) stop = sens > 0 ? niveau - riskMinAtr * atr : niveau + riskMinAtr * atr;
  if (sens > 0 ? stop >= niveau : stop <= niveau) return null;
  return { i, sens, niveau, stop, rr, validite, ...meta };
}

/* ── a. absorption à un extrême ── */
export function absorptionExtreme(s, p = {}) {
  const o = { fen: 96, facteur: 2, entree: 0.5, rr: 2, ...p }, out = [];
  for (let i = o.fen + 1; i < s.nBarres; i++) {
    let lo = Infinity, hi = -Infinity; for (let q = i - o.fen; q < i; q++) { if (s.l[q] < lo) lo = s.l[q]; if (s.h[q] > hi) hi = s.h[q]; }
    const ab = absorption(s, i, { facteur: o.facteur });
    if (s.l[i] < lo && s.c[i] > lo && ab.sens > 0) { const e = s.c[i] - o.entree * (s.c[i] - lo); const x = fabriquer(s, i, 1, e, s.l[i], o, { setup: 'absorption_extreme', niv: 'plus bas ' + o.fen + ' barres', raison: 'Balayage du plus bas puis ventes agressives absorbées (' + ab.force.toFixed(1) + '× le delta typique).' }); if (x) out.push(x); }
    else if (s.h[i] > hi && s.c[i] < hi && ab.sens < 0) { const e = s.c[i] + o.entree * (hi - s.c[i]); const x = fabriquer(s, i, -1, e, s.h[i], o, { setup: 'absorption_extreme', niv: 'plus haut ' + o.fen + ' barres', raison: 'Balayage du plus haut puis achats agressifs absorbés (' + ab.force.toFixed(1) + '× le delta typique).' }); if (x) out.push(x); }
  }
  return out;
}

/* ── b. rejet d'un niveau du profil de la veille (POC / VAH / VAL) ── */
export function rejetNiveau(s, p = {}) {
  const o = { niveaux: 'poc,vah,val', meche: 0.4, relatif: 0.5, rr: 2, ...p }, noms = o.niveaux.split(','), out = [];
  for (let i = 1; i < s.nBarres; i++) {
    const pj = profilJour(s, i); if (!pj) continue; const rng = s.h[i] - s.l[i]; if (!(rng > 0) || !(s.atr[i] > 0)) continue;
    for (const nom of noms) {
      const L = pj[nom]; if (!(L > 0)) continue;
      if (s.l[i] <= L && s.c[i] > L && (Math.min(s.o[i], s.c[i]) - s.l[i]) >= o.meche * rng && s.delta[i] > 0 && s.typique[i] > 0 && s.delta[i] >= o.relatif * s.typique[i]) { const x = fabriquer(s, i, 1, Math.max(L, s.c[i] - 0.5 * (s.c[i] - L)), s.l[i], o, { setup: 'rejet_niveau', niv: nom.toUpperCase() + ' de la veille', raison: 'Rejet du ' + nom.toUpperCase() + ' de la veille avec acheteurs agressifs.' }); if (x) { out.push(x); break; } }
      else if (s.h[i] >= L && s.c[i] < L && (s.h[i] - Math.max(s.o[i], s.c[i])) >= o.meche * rng && s.delta[i] < 0 && s.typique[i] > 0 && -s.delta[i] >= o.relatif * s.typique[i]) { const x = fabriquer(s, i, -1, Math.min(L, s.c[i] + 0.5 * (L - s.c[i])), s.h[i], o, { setup: 'rejet_niveau', niv: nom.toUpperCase() + ' de la veille', raison: 'Rejet du ' + nom.toUpperCase() + ' de la veille avec vendeurs agressifs.' }); if (x) { out.push(x); break; } }
    }
  }
  return out;
}

/* ── b'. acceptation hors de la zone de valeur (continuation, entrée sur retest) ── */
export function acceptationHorsValeur(s, p = {}) {
  const o = { relatif: 1, rr: 2, stopAtr: 0.8, ...p }, out = [];
  for (let i = 1; i < s.nBarres; i++) {
    const pj = profilJour(s, i); if (!pj || !(s.atr[i] > 0) || !(s.typique[i] > 0)) continue;
    if (s.c[i] > pj.vah && s.c[i - 1] <= pj.vah && s.delta[i] >= o.relatif * s.typique[i]) { const x = fabriquer(s, i, 1, pj.vah + 0.1 * s.atr[i], pj.vah - o.stopAtr * s.atr[i], { ...o, margeAtr: 0 }, { setup: 'acceptation_hors_valeur', niv: 'VAH de la veille', raison: 'Clôture au-dessus de la zone de valeur avec delta acheteur ; retest du VAH.' }); if (x) out.push(x); }
    else if (s.c[i] < pj.val && s.c[i - 1] >= pj.val && -s.delta[i] >= o.relatif * s.typique[i]) { const x = fabriquer(s, i, -1, pj.val - 0.1 * s.atr[i], pj.val + o.stopAtr * s.atr[i], { ...o, margeAtr: 0 }, { setup: 'acceptation_hors_valeur', niv: 'VAL de la veille', raison: 'Clôture sous la zone de valeur avec delta vendeur ; retest du VAL.' }); if (x) out.push(x); }
  }
  return out;
}

/* ── c. divergence CVD / prix ── */
export function divergenceCvd(s, p = {}) {
  const o = { fen: 24, rr: 2, ...p }, out = [], cum = new Float64Array(s.nBarres); let c = 0; for (let i = 0; i < s.nBarres; i++) { c += s.delta[i]; cum[i] = c; }
  for (let i = o.fen + 1; i < s.nBarres; i++) {
    let pl = -1, ph = -1, ml = Infinity, mh = -Infinity; for (let q = i - o.fen; q < i; q++) { if (s.l[q] < ml) { ml = s.l[q]; pl = q; } if (s.h[q] > mh) { mh = s.h[q]; ph = q; } }
    if (s.l[i] < ml && cum[i] > cum[pl] && s.c[i] > s.o[i] && s.delta[i] > 0) { const x = fabriquer(s, i, 1, s.c[i] - 0.3 * (s.c[i] - s.l[i]), s.l[i], o, { setup: 'divergence_cvd', niv: 'plus bas ' + o.fen + ' barres', raison: 'Nouveau plus bas du prix mais le volume net est plus haut qu’au précédent creux.' }); if (x) out.push(x); }
    else if (s.h[i] > mh && cum[i] < cum[ph] && s.c[i] < s.o[i] && s.delta[i] < 0) { const x = fabriquer(s, i, -1, s.c[i] + 0.3 * (s.h[i] - s.c[i]), s.h[i], o, { setup: 'divergence_cvd', niv: 'plus haut ' + o.fen + ' barres', raison: 'Nouveau plus haut du prix mais le volume net est plus bas qu’au précédent sommet.' }); if (x) out.push(x); }
  }
  return out;
}

/* ── e. zone diamant : confluence de niveaux au même endroit + absorption ── */
export function niveauxAutour(s, i, fen = 96) {
  const pj = profilJour(s, i), ps = profilSemaine(s, i), liste = []; if (pj) { liste.push(LVL('POC veille', pj.poc), LVL('VAH veille', pj.vah), LVL('VAL veille', pj.val), LVL('haut veille', pj.haut), LVL('bas veille', pj.bas)); for (const h of pj.hvn.slice(0, 3)) liste.push(LVL('HVN veille', h)); }
  if (ps) liste.push(LVL('POC 7 j', ps.poc), LVL('VAH 7 j', ps.vah), LVL('VAL 7 j', ps.val));
  let lo = Infinity, hi = -Infinity; for (let q = Math.max(0, i - fen); q < i; q++) { if (s.l[q] < lo) lo = s.l[q]; if (s.h[q] > hi) hi = s.h[q]; }
  if (isFinite(lo)) liste.push(LVL('plus bas récent', lo), LVL('plus haut récent', hi));
  return liste.filter(Boolean);
}
export function diamant(s, p = {}) {
  const o = { minConf: 3, tolAtr: 0.3, facteur: 1.5, rr: 2, ...p }, out = [];
  for (let i = 100; i < s.nBarres; i++) {
    const ab = absorption(s, i, { facteur: o.facteur }); if (!ab.sens) continue; const atr = s.atr[i], tol = o.tolAtr * atr, ref = ab.sens > 0 ? s.l[i] : s.h[i];
    const lv = niveauxAutour(s, i).filter(x => Math.abs(x.prix - ref) <= tol), noms = new Set(lv.map(x => x.nom)); if (noms.size < o.minConf) continue;
    const niv = lv.reduce((a, x) => a + x.prix, 0) / lv.length, e = ab.sens > 0 ? Math.max(niv, s.c[i] - 0.5 * (s.c[i] - niv)) : Math.min(niv, s.c[i] + 0.5 * (niv - s.c[i]));
    const x = fabriquer(s, i, ab.sens, e, ref, o, { setup: 'diamant', niv: [...noms].join(' + '), raison: noms.size + ' éléments au même niveau (' + [...noms].join(', ') + ') et volume agressif absorbé.' }); if (x) out.push(x);
  }
  return out;
}

export const DETECTEURS = Object.freeze({ absorption_extreme: absorptionExtreme, rejet_niveau: rejetNiveau, acceptation_hors_valeur: acceptationHorsValeur, divergence_cvd: divergenceCvd, diamant });

/* Petites grilles JUSTIFIÉES (jamais des milliers de paramètres) : on compte chaque variante testée. */
export const GRILLES = Object.freeze({
  absorption_extreme: { fen: [48, 96], facteur: [1.5, 2.5], entree: [0.5, 1], rr: [2, 3], riskMinAtr: [1, 2, 3] },
  rejet_niveau: { niveaux: ['poc,vah,val', 'vah,val'], meche: [0.3, 0.5], relatif: [0.5, 1], rr: [2, 3], riskMinAtr: [1, 2, 3] },
  acceptation_hors_valeur: { relatif: [1, 2], rr: [2, 3], riskMinAtr: [1, 2, 3] },
  divergence_cvd: { fen: [24, 48], rr: [2, 3], riskMinAtr: [1, 2, 3] },
  diamant: { minConf: [2, 3], facteur: [1, 1.5, 2.5], rr: [2, 3], riskMinAtr: [1, 2, 3] }
});
export function combinaisons(grille) {
  const cles = Object.keys(grille); let r = [{}];
  for (const c of cles) { const n = []; for (const base of r) for (const v of grille[c]) n.push({ ...base, [c]: v }); r = n; }
  return r;
}

/* ── Filtres de CONTEXTE (ceux qui empilaient avant) : uniquement pour MESURER l'entonnoir, jamais appliqués au signal ── */
export function contexteFiltres(s) {
  const n = s.nBarres, ema = new Float64Array(n), rang = new Float64Array(n); let e = s.c[0]; const k = 2 / 201;
  for (let i = 0; i < n; i++) { e = e + k * (s.c[i] - e); ema[i] = e; }
  const rel = new Float64Array(n); for (let i = 0; i < n; i++) rel[i] = s.atr[i] / s.c[i];
  for (let i = 200; i < n; i++) { let m = 0; const f = Math.max(0, i - 500); for (let q = f; q < i; q++) if (rel[q] <= rel[i]) m++; rang[i] = m / (i - f); }
  return {
    biaisEma200: (sg) => (sg.sens > 0 ? s.c[sg.i] > ema[sg.i] : s.c[sg.i] < ema[sg.i]),
    volatilite: (sg) => rang[sg.i] >= 0.2 && rang[sg.i] <= 0.9,
    horaire: (sg) => { const h = new Date(s.t[sg.i]).getUTCHours(); return h >= 7 && h <= 21; },
    confirmation2: (sg) => { const i = sg.i; return sg.sens > 0 ? s.c[i] > s.o[i] && s.delta[i] > 0 : s.c[i] < s.o[i] && s.delta[i] < 0; }
  };
}
export const FILTRES_NOMS = Object.freeze({ biaisEma200: 'Biais de tendance (EMA 200)', volatilite: 'Filtre de volatilité', horaire: 'Filtre horaire (07-21 h UTC)', confirmation2: 'Seconde confirmation de bougie' });
