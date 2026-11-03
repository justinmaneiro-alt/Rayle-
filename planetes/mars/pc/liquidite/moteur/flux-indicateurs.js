import { profilVolume } from './barres-flux.js';
import { profondeurJusqua, desequilibre } from './livre.js';

/* ═════════════ INDICATEURS DE FLUX (V4, phase 3 ; module pur, testé : galaxie/tests/liquidite-test.mjs) ═════════════
   Déséquilibre du carnet, delta et CVD, divergences, absorption, VWAP et bandes, profils de volume par période. Tout est CAUSAL : la valeur en i n'utilise que les données jusqu'en i (les
   fonctions rendent des tableaux alignés sur les barres d'entrée ; un test vérifie qu'ajouter des barres APRÈS i ne change rien avant). */
const mediane = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/* ── Déséquilibre du carnet (bid − ask) / (bid + ask) à 0,1 / 0,5 / 1 % du milieu, pour UNE seconde enregistrée ── */
export function desequilibreCarnet(rec, pasPct = 0.02, niveaux = [0.1, 0.5, 1]) {
  const out = { t: rec.tSec * 1000 }; for (const p of niveaux) { const b = profondeurJusqua(rec.bid, pasPct, p), a = profondeurJusqua(rec.ask, pasPct, p); out['b' + p] = b; out['a' + p] = a; out['d' + p] = desequilibre(b, a); } return out;
}
export const serieDesequilibre = (enregs, pasPct = 0.02, niveaux = [0.1, 0.5, 1]) => enregs.map(r => desequilibreCarnet(r, pasPct, niveaux));
/* Variation et PRESSION : pression = moyenne du déséquilibre à 0,5 % sur les `n` dernières secondes (persistante si elle garde le même signe sur ≥ 80 % des secondes) ; variation = fin − début. */
export function pressionCarnet(serie, { n = 60, cle = 'd0.5' } = {}) {
  const x = serie.slice(-n).map(s => s[cle]).filter(v => v != null); if (x.length < 5) return { pression: null, persistante: false, variation: null, n: x.length };
  const moy = x.reduce((a, b) => a + b, 0) / x.length, signe = Math.sign(moy), memeSigne = x.filter(v => Math.sign(v) === signe).length / x.length;
  return { pression: moy, persistante: Math.abs(moy) >= 0.1 && memeSigne >= 0.8, variation: x[x.length - 1] - x[0], sens: moy > 0.05 ? 'acheteuse' : moy < -0.05 ? 'vendeuse' : 'neutre', n: x.length };
}

/* ── Delta et CVD ── */
/* Delta des bougies M15 en dollars à partir du volume acheteur « taker » (vb) de Binance : achat − vente = (2·vb − v) × clôture. NaN si vb manque. */
export function deltaBougies(m15) { const d = new Float64Array(m15.n); for (let i = 0; i < m15.n; i++) d[i] = Number.isFinite(m15.vb && m15.vb[i]) ? (2 * m15.vb[i] - m15.v[i]) * m15.c[i] : NaN; return d; }
export const deltaBarres = barres => Float64Array.from(barres, b => b.achatUsd - b.venteUsd);
/* Somme cumulée (CVD) ; `reinitialiser(i)` rend true aux bornes où l'on repart de zéro (début de journée par exemple). */
export function cumulDelta(delta, reinitialiser = null) { const c = new Float64Array(delta.length); let s = 0; for (let i = 0; i < delta.length; i++) { if (reinitialiser && reinitialiser(i)) s = 0; s += Number.isFinite(delta[i]) ? delta[i] : 0; c[i] = s; } return c; }
/* Divergence prix / CVD (causale). +1 = haussière (le prix fait un nouveau bas sur `fenetre` barres mais le CVD ne le fait pas : les vendeurs s'épuisent), −1 = baissière (nouveau haut de prix sans nouveau haut de CVD).
   `marge` : écart minimal du CVD, en part de l'écart-type du delta récent, pour ignorer le bruit. */
export function divergencePrixCvd(prix, cvd, { fenetre = 48, marge = 0.5 } = {}) {
  const n = prix.length, out = new Int8Array(n);
  for (let i = fenetre; i < n; i++) {
    let hP = -Infinity, bP = Infinity, hC = -Infinity, bC = Infinity, s = 0, s2 = 0;
    for (let j = i - fenetre; j < i; j++) { if (prix[j] > hP) hP = prix[j]; if (prix[j] < bP) bP = prix[j]; if (cvd[j] > hC) hC = cvd[j]; if (cvd[j] < bC) bC = cvd[j]; const d = cvd[j + 1] - cvd[j]; s += d; s2 += d * d; }
    const sd = Math.sqrt(Math.max(0, s2 / fenetre - (s / fenetre) ** 2)), m = marge * sd;
    if (prix[i] > hP && cvd[i] < hC - m) out[i] = -1; else if (prix[i] < bP && cvd[i] > bC + m) out[i] = 1;
  }
  return out;
}

/* ── Absorption : un gros volume AGRESSIF encaissé par des ordres limites sans que le prix avance ──
   Sur chaque barre M15 (avec delta) : le delta est grand par rapport au delta typique (médiane des |delta| des `histo` barres PRÉCÉDENTES) mais la barre n'a pas progressé dans le sens du delta :
   delta fortement négatif + clôture au-dessus de l'ouverture moins `tolAtr` ATR = les acheteurs limites absorbent les ventes (+1, haussier) ; delta fortement positif + clôture sous l'ouverture + `tolAtr` ATR
   = absorption des achats (−1, baissier). `niveau` = prix où le volume agressif du côté absorbé est le plus gros (depuis l'empreinte si disponible). Rend un tableau d'objets ou null. */
export function absorptionBarres(barres, atr, { facteur = 2, histo = 96, tolAtr = 0.25 } = {}) {
  const n = barres.length, out = new Array(n).fill(null), abs = [];
  for (let i = 0; i < n; i++) {
    const b = barres[i], d = b.achatUsd - b.venteUsd, a = atr ? atr[i] : null;
    const typique = abs.length >= 20 ? mediane(abs.slice(-histo)) : null;
    if (typique && typique > 0 && a > 0 && Math.abs(d) >= facteur * typique) {
      const progres = b.cloture - b.ouv;
      if (d < 0 && progres >= -tolAtr * a) out[i] = { sens: 1, force: Math.abs(d) / typique, deltaUsd: d, niveau: niveauAbsorbe(b, 'vente') };
      else if (d > 0 && progres <= tolAtr * a) out[i] = { sens: -1, force: Math.abs(d) / typique, deltaUsd: d, niveau: niveauAbsorbe(b, 'achat') };
    }
    abs.push(Math.abs(d));
  }
  return out;
}
function niveauAbsorbe(b, cote) { let m = -1, k = null; for (const [kk, a, v] of b.fp || []) { const x = cote === 'vente' ? v : a; if (x > m) { m = x; k = kk; } } return k == null ? null : Math.exp((k + 0.5) * Math.log(1.0002)); }

/* ── VWAP ancré (jour ou semaine UTC) et bandes à ±1 / ±2 écarts-types pondérés par le volume (causal) ── */
export function vwapAncre(m15, { ancre = 'jour' } = {}) {
  const n = m15.n, vwap = new Float64Array(n).fill(NaN), h1 = new Float64Array(n).fill(NaN), b1 = new Float64Array(n).fill(NaN), h2 = new Float64Array(n).fill(NaN), b2 = new Float64Array(n).fill(NaN);
  let cle = null, sv = 0, spv = 0, spv2 = 0;
  for (let i = 0; i < n; i++) {
    const t = m15.t[i], k = ancre === 'semaine' ? Math.floor((t / 86400e3 + 3) / 7) : Math.floor(t / 86400e3);
    if (k !== cle) { cle = k; sv = 0; spv = 0; spv2 = 0; }
    const tp = (m15.h[i] + m15.l[i] + m15.c[i]) / 3, v = m15.v[i] > 0 ? m15.v[i] : 0; sv += v; spv += tp * v; spv2 += tp * tp * v;
    if (sv > 0) { const m = spv / sv, sd = Math.sqrt(Math.max(0, spv2 / sv - m * m)); vwap[i] = m; h1[i] = m + sd; b1[i] = m - sd; h2[i] = m + 2 * sd; b2[i] = m - 2 * sd; }
  }
  return { vwap, haut1: h1, bas1: b1, haut2: h2, bas2: b2 };
}

/* ── Profils de volume par période (jour, semaine, session UTC) à partir des barres avec empreinte ── */
export const clePeriode = (t, periode) => {
  if (periode === 'semaine') return 'S' + Math.floor((t / 86400e3 + 3) / 7);
  if (periode === 'session') return 'J' + Math.floor(t / 86400e3) + '-' + Math.floor((t % 86400e3) / (8 * 3600e3));
  return 'J' + Math.floor(t / 86400e3);
};
export function profilsParPeriode(barres, periode = 'jour', opts = {}) {
  const groupes = new Map(); for (const b of barres) { const k = clePeriode(b.t, periode); let g = groupes.get(k); if (!g) groupes.set(k, g = []); g.push(b); }
  const out = new Map(); for (const [k, g] of groupes) out.set(k, { debut: g[0].t, fin: g[g.length - 1].t + 900000, profil: profilVolume(g, opts), barres: g.length }); return out;
}
/* Profil de la période PRÉCÉDENTE complète à l'instant t (jour d'avant, semaine d'avant) : c'est ce que le marché connaît à t, jamais la période en cours (pas de regard vers le futur). */
export function profilPrecedent(profils, t, periode = 'jour') {
  const cle = clePeriode(t, periode); let meilleur = null; for (const [k, p] of profils) { if (k === cle) continue; if (p.fin <= t && (!meilleur || p.fin > meilleur.fin)) meilleur = p; } return meilleur;
}
