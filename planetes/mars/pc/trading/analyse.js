import { atr, bollinger, ema, macd, niveauxCles, pivots, rsi, sma, vwap, aDuVolume } from './indicateurs.js';

/* ═════════════ LECTURE DU MARCHÉ (module pur, testé : planetes/mars/tests/trading-analyse-test.mjs) ═════════════
   Tout est CALCULÉ dans le navigateur à partir des bougies réelles : aucune IA, aucun jeton. Ce sont des constats chiffrés (« le prix est au-dessus de la MA200 »),
   jamais des conseils ni des prévisions : Raylé n'exécute ni ne recommande d'ordre. */
const dernier = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
const pct = (a, b) => (b ? (a - b) / b * 100 : null);

export function resume(bougies) {
  const n = bougies.length; if (n < 30) return null;
  const c = bougies.map(x => x.c), prix = c[n - 1];
  const m200 = dernier(sma(c, 200)), e200 = dernier(ema(c, 200)), m50 = dernier(sma(c, 50)), e20 = dernier(ema(c, 20));
  const r = dernier(rsi(c, 14)), a = dernier(atr(bougies, 14)), md = macd(c), bb = bollinger(c);
  const iM = md.macd.length - 1, bbh = bb.haut[n - 1], bbl = bb.bas[n - 1];
  const niv = niveauxCles(bougies.slice(-Math.min(n, 400)), a);
  const seg = bougies.slice(-160), pv = pivots(seg, 3), H = pv.hauts.slice(-2), L = pv.bas.slice(-2);
  let structure = 'indéterminée';
  if (H.length === 2 && L.length === 2) {
    structure = H[1].p > H[0].p && L[1].p > L[0].p ? 'sommets et creux montants' : H[1].p < H[0].p && L[1].p < L[0].p ? 'sommets et creux descendants'
      : H[1].p < H[0].p && L[1].p > L[0].p ? 'compression (sommets descendants, creux montants)' : 'expansion (sommets montants, creux descendants)';
  }
  const ref200 = m200 != null ? m200 : e200;
  const ext = bougies.slice(-50), vw = dernier(vwap(bougies.slice(-Math.min(n, 200))));
  return {
    prix, rsi: r, rsiEtat: r == null ? null : r >= 70 ? 'surachat' : r <= 30 ? 'survente' : r >= 55 ? 'acheteur' : r <= 45 ? 'vendeur' : 'neutre',
    ma200: m200, ema200: e200, ma50: m50, ema20: e20,
    distanceMa200Pct: ref200 != null ? pct(prix, ref200) : null,
    tendanceMa200: ref200 == null ? 'MA200 indisponible (historique trop court)' : prix >= ref200 ? 'prix au-dessus de la MA200' : 'prix sous la MA200',
    macd: md.macd[iM], macdSignal: md.signal[iM], macdHisto: md.histogramme[iM],
    macdEtat: md.histogramme[iM] == null ? null : md.histogramme[iM] >= 0 ? 'histogramme positif' : 'histogramme négatif',
    atr: a, atrPct: a != null ? a / prix * 100 : null,
    bollingerPct: bbh != null && bbh > bbl ? (prix - bbl) / (bbh - bbl) * 100 : null,   // 0 = bande basse, 100 = bande haute
    supports: niv.supports, resistances: niv.resistances, structure,
    plusHaut50: Math.max(...ext.map(x => x.h)), plusBas50: Math.min(...ext.map(x => x.l)),
    vwap: vw, volume: aDuVolume(bougies)
  };
}

/* ── Corrélations ── */
export function pearson(x, y) {
  const n = Math.min(x.length, y.length); if (n < 3) return null;
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n; let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
/* séries : { id: bougies journalières } → clôtures par jour UTC (les séances ne tombent pas à la même heure selon la place : on joint sur la DATE). */
const parJour = b => { const m = new Map(); for (const x of b) m.set(Math.floor(x.t / 86400e3), x.c); return m; };
/* Corrélation des variations quotidiennes (en %) sur les `fenetre` derniers jours communs. Rend { ids, matrice, observations } ; null si trop peu de recul. */
export function correlations(series, fenetre = 60, minimum = 20) {
  const ids = Object.keys(series).filter(id => series[id] && series[id].length > 5), jours = ids.map(id => parJour(series[id]));
  const matrice = {}, obs = {};
  for (let i = 0; i < ids.length; i++) {
    matrice[ids[i]] = {}; obs[ids[i]] = {};
    for (let j = 0; j < ids.length; j++) {
      if (i === j) { matrice[ids[i]][ids[j]] = 1; obs[ids[i]][ids[j]] = fenetre; continue; }
      const communs = [...jours[i].keys()].filter(k => jours[j].has(k)).sort((p, q) => p - q).slice(-(fenetre + 1)), x = [], y = [];
      for (let k = 1; k < communs.length; k++) {
        const a0 = jours[i].get(communs[k - 1]), a1 = jours[i].get(communs[k]), b0 = jours[j].get(communs[k - 1]), b1 = jours[j].get(communs[k]);
        if (a0 && b0) { x.push((a1 - a0) / a0); y.push((b1 - b0) / b0); }
      }
      matrice[ids[i]][ids[j]] = x.length >= minimum ? pearson(x, y) : null; obs[ids[i]][ids[j]] = x.length;
    }
  }
  return { ids, matrice, observations: obs, fenetre };
}
export function lectureCorrelation(r) {
  if (r == null) return 'indisponible';
  const a = Math.abs(r), force = a >= 0.7 ? 'forte' : a >= 0.4 ? 'moyenne' : a >= 0.2 ? 'faible' : 'quasi nulle';
  return force + (a >= 0.2 ? (r > 0 ? ' positive' : ' négative') : '');
}
