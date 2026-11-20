/* ═════════════ AIDES À LA DÉCISION DU GRAPHIQUE (module PUR, testé) : taille de position XTB, régime de marché, voyant d'alignement, annonces ═════════════
   Lecture seule : aucun ordre. Chaque chiffre vient d'un calcul visible ; ce qui n'est pas vérifié est marqué comme tel et reste modifiable. */
import { atr, dernier } from '../commun/analyse.js';

/* ───── 1. Taille de position en lots XTB ───── */
/* Contrat = unités de l'actif sous-jacent par lot XTB. `verifie: true` seulement quand la valeur est certaine ; sinon la valeur par défaut (1) n'est qu'un point de départ et le champ est à corriger
   dans xStation (spécification de l'instrument). Cotation en USD pour tous ces instruments : conversion en € par le taux EUR/USD. */
export const CONTRATS_XTB = Object.freeze({
  or: { xtb: 'GOLD', contrat: 100, devise: 'USD', verifie: true, note: '1 lot = 100 onces' },
  us100: { xtb: 'US100', contrat: 1, devise: 'USD', verifie: false, note: 'valeur du point par lot à vérifier dans xStation' },
  us500: { xtb: 'US500', contrat: 1, devise: 'USD', verifie: false, note: 'valeur du point par lot à vérifier dans xStation' },
  btc: { xtb: 'BITCOIN', contrat: 1, devise: 'USD', verifie: true, note: '1 lot = 1 bitcoin' },
  sol: { xtb: 'SOLANA', contrat: 1, devise: 'USD', verifie: false, note: 'taille du lot à vérifier dans xStation' },
  doge: { xtb: 'DOGECOIN', contrat: 1, devise: 'USD', verifie: false, note: 'taille du lot à vérifier dans xStation' }
});
export const PAS_LOT = 0.01;
/* entree, stop, objectif : prix ; risqueEur : perte acceptée au stop ; contrat : unités par lot ; eurUsd : nombre de dollars pour 1 € (null = inconnu) */
export function calculerTaille({ entree, stop, objectif, risqueEur = 100, contrat = 1, eurUsd = null, devise = 'USD' } = {}) {
  if (!(entree > 0) || !(stop > 0) || entree === stop || !(risqueEur > 0) || !(contrat > 0)) return null;
  const sens = stop < entree ? 'achat' : 'vente', dist = Math.abs(entree - stop), conv = devise === 'EUR' ? 1 : eurUsd > 0 ? 1 / eurUsd : null;
  if (conv == null) return { sens, dist, sansTaux: true, R: Number.isFinite(objectif) ? (objectif - entree) * (sens === 'achat' ? 1 : -1) / dist : null };
  const perteParLot = dist * contrat * conv, lots = Math.floor(risqueEur / perteParLot / PAS_LOT + 1e-9) * PAS_LOT;
  const gainParLot = Number.isFinite(objectif) ? (objectif - entree) * (sens === 'achat' ? 1 : -1) * contrat * conv : null, R = Number.isFinite(objectif) ? (objectif - entree) * (sens === 'achat' ? 1 : -1) / dist : null;
  const l = +lots.toFixed(2);
  return { sens, dist, perteParLot, lots: l, risqueReel: l * perteParLot, gainCible: gainParLot == null ? null : l * gainParLot, R, coherent: R == null ? null : R > 0, trop_petit: l < PAS_LOT, risqueMinimal: PAS_LOT * perteParLot };
}

/* ───── 2. Régime de marché ───── */
export const SEUIL_TENDANCE = 0.30, FEN_ER = 20;
/* ratio d'efficacité de Kaufman sur les n dernières clôtures : |variation nette| / somme des variations absolues (0 = bruit pur, 1 = ligne droite). Choisi plutôt que l'ADX : borné, un seul paramètre, calculé sur les clôtures. */
export function efficacite(B, n = FEN_ER) {
  if (!B || B.length <= n) return null; const f = B.length - 1; let s = 0; for (let j = f - n + 1; j <= f; j++) s += Math.abs(B[j].c - B[j - 1].c);
  return s > 0 ? Math.abs(B[f].c - B[f - n].c) / s : 0;
}
const BOUGIES_AN = { H1: 24 * 250, H4: 6 * 250, J: 250 };   // séances de marché sur un an
/* percentile (0 à 1) de l'ATR(14) courant parmi les ATR(14) de la dernière année ; null si l'historique couvre moins de 80 % d'une année */
export function percentileAtr(B, unite = 'J') {
  const an = BOUGIES_AN[unite] || 250; if (!B || B.length < 60) return null;
  const v = atr(B, 14).slice(-an).filter(x => x != null); if (v.length < 0.8 * an) return null;
  const cur = v[v.length - 1]; return v.filter(x => x <= cur).length / v.length;
}
export const niveauVol = p => (p == null ? null : p < 0.25 ? 'basse' : p > 0.75 ? 'haute' : 'normale');
/* B : bougies de l'unité affichée ; BJ : bougies Jour (repli pour la volatilité quand l'unité n'a pas un an d'historique, H1 notamment) */
export const SEUIL_ECART_ATR = 3, FEN_MA = 200, FEN_PENTE = 20;
/* Écart au prix de la MA200 de la série B : en % de la MA et en ATR(14) ; pente de la MA sur FEN_PENTE bougies. null si moins de 220 bougies. */
export function ecartMa200(B) {
  if (!B || B.length < FEN_MA + FEN_PENTE) return null;
  const c = B.map(b => b.c), n = c.length, moy = fin => { let s = 0; for (let i = fin - FEN_MA + 1; i <= fin; i++) s += c[i]; return s / FEN_MA; };
  const ma = moy(n - 1), maAvant = moy(n - 1 - FEN_PENTE), a = dernier(atr(B, 14)); if (!(ma > 0) || !(a > 0)) return null;
  return { ma, pct: (c[n - 1] - ma) / ma * 100, atr: (c[n - 1] - ma) / a, pente: ma - maAvant };
}
/* B : bougies de l'unité affichée ; BJ : bougies Jour (repli pour la volatilité quand l'unité n'a pas un an d'historique, H1 notamment).
   Tendance = (efficacité de Kaufman sur 20 bougies ≥ 0,30) OU (prix à plus de 3 ATR de la MA200 de l'unité ET MA200 qui penche du même côté). Sinon range.
   Avant la v4 seule l'efficacité sur 20 bougies comptait : un marché 19 % sous sa MA200 pouvait s'afficher « Range ». */
export function regime(B, BJ, unite = 'H4') {
  const er = efficacite(B), ec = ecartMa200(B);
  const voieMa = !!(ec && Math.abs(ec.atr) >= SEUIL_ECART_ATR && Math.sign(ec.pente) === Math.sign(ec.atr));
  const voieEr = er != null && er >= SEUIL_TENDANCE;
  const type = er == null && !ec ? null : voieEr || voieMa ? 'tendance' : 'range';
  const sens = ec && (voieMa || voieEr) ? (ec.atr < 0 ? 'baissière' : 'haussière') : null;
  let p = percentileAtr(B, unite), base = unite; if (p == null && BJ) { p = percentileAtr(BJ, 'J'); base = 'J'; }
  const vol = niveauVol(p);
  const phrase = type === 'tendance' ? 'En tendance, privilégier les flèches MA200 ; en range, les rebonds sur niveaux tracés.' : type === 'range' ? 'En range, privilégier les rebonds sur niveaux tracés ; en tendance, les flèches MA200.' : '';
  return { type, er, vol, percentile: p, baseVol: base, phrase, ecart: ec, voie: voieMa ? (voieEr ? 'ma200+efficacité' : 'ma200') : voieEr ? 'efficacité' : null, sens };
}

/* ───── 3. Voyant d'alignement Daily / H4 ───── */
/* A : { H4, J } analyses MA200 (fleches-registre.analyseDe) ; la tendance en vigueur = le dernier `sens` */
export function voyant(A) {
  const t = Au => { const S = Au && Au.sens; return S && S.length ? S[S.length - 1].sens : 0; }, d = t(A && A.J), h = t(A && A.H4), nom = x => (x > 0 ? 'haussière' : 'baissière');
  if (!d || !h) return { etat: 'gris', daily: d, h4: h, texte: 'Alignement Daily / H4 : indéterminé (moins de 200 bougies sur une des unités)' };
  return d === h ? { etat: 'vert', daily: d, h4: h, texte: `Daily et H4 alignés : tendance ${nom(d)}` } : { etat: 'orange', daily: d, h4: h, texte: `Daily ${nom(d)} mais H4 ${nom(h)} : tendances non alignées` };
}

/* ───── 4. Annonces majeures ───── */
export function typeAnnonce(titre = '', pays = '', impact = '') {
  const t = String(titre), usd = /USD|US/i.test(pays || 'USD');
  if (/non-?farm|nfp/i.test(t) && usd) return 'NFP';
  if (/\bcpi\b/i.test(t) && usd) return 'CPI';
  if (/fomc|federal funds rate/i.test(t)) return 'Fed';
  if (/\becb\b|main refinancing|deposit facility|european central bank/i.test(t) || (/EUR/i.test(pays) && /rate statement|press conference/i.test(t))) return 'BCE';
  if (/\bgdp\b/i.test(t) && usd && /fort|high/i.test(impact || 'high') && !/price|deflator|prelim|final|annualized/i.test(t)) return 'PIB US';
  return null;
}
/* evenements : [{ t (ms), titre, pays, impact }] (lireEvenements du calendrier de Marchés) → bandes { t1, t2, type, titre } de 1 h avant à 1 h après */
export function bandesAnnonces(evenements, { avantMs = 3600e3, apresMs = 3600e3 } = {}) {
  const out = []; for (const e of evenements || []) { const type = typeAnnonce(e.titre, e.pays, e.impact); if (!type || !/fort|high/i.test(e.impact || 'fort')) continue; out.push({ t1: e.t - avantMs, t2: e.t + apresMs, t: e.t, type, titre: e.titre }); }
  out.sort((a, b) => a.t1 - b.t1); const fus = []; for (const b of out) { const l = fus[fus.length - 1]; if (l && b.t1 <= l.t2) { l.t2 = Math.max(l.t2, b.t2); l.type += ' + ' + b.type; } else fus.push({ ...b }); }
  return fus;
}
export const dansBande = (t, bandes) => (bandes || []).find(b => t >= b.t1 && t <= b.t2) || null;
