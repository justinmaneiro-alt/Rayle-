import { alea } from '../planetes/mars/pc/mars-calcul.js';

/* ═════════════ STATISTIQUES DE LA VALIDATION V3 (module pur, testé : galaxie/tests/strategies-v3-test.mjs) ═════════════ */

/* Intervalle de confiance de l'espérance (en R par trade) par RÉÉCHANTILLONNAGE (bootstrap, avec remise). Graine fixe : résultat reproductible. */
export function intervalleBootstrap(R, { tirages = 5000, niveau = 0.95, graine = 1 } = {}) {
  const n = R.length; if (n < 8) return { bas: null, haut: null, moy: n ? R.reduce((a, b) => a + b, 0) / n : null, n, tirages: 0 };
  const a = alea(graine), moyennes = new Float64Array(tirages); let tot = 0; for (const x of R) tot += x;
  for (let s = 0; s < tirages; s++) { let somme = 0; for (let i = 0; i < n; i++) somme += R[Math.floor(a() * n)]; moyennes[s] = somme / n; }
  moyennes.sort(); const q = p => moyennes[Math.min(tirages - 1, Math.max(0, Math.floor(p * tirages)))], e = (1 - niveau) / 2;
  return { bas: q(e), haut: q(1 - e), moy: tot / n, n, tirages, niveau };
}

/* Compte prop simulé : chaque trade vaut `risquePct` % du capital de départ par R (additif, prudent). Le creux est mesuré depuis le plus haut de l'ÉQUITÉ (suiveur), la perte du jour sur les
   trades CLOS ce jour-là (jour UTC). `trades` doit avoir R et tSortie (ou t). Rend le creux max, la pire journée, le gain total, et le risque maximal qui respecterait les deux limites. */
export function simulerProp(trades, { risquePct = 1, drawdownMaxPct = 6, perteJourMaxPct = 3 } = {}) {
  const liste = trades.slice().sort((x, y) => (x.tSortie || x.t) - (y.tSortie || y.t));
  let eq = 0, pic = 0, ddR = 0, pireJourR = 0; const jours = new Map();
  for (const x of liste) {
    eq += x.R; if (eq > pic) pic = eq; if (pic - eq > ddR) ddR = pic - eq;
    const j = Math.floor((x.tSortie || x.t) / 86400e3); jours.set(j, (jours.get(j) || 0) + x.R);
  }
  for (const v of jours.values()) if (v < pireJourR) pireJourR = v;
  const ddPct = ddR * risquePct, pireJourPct = -pireJourR * risquePct;
  const rMaxDd = ddR > 0 ? drawdownMaxPct / ddR : Infinity, rMaxJour = pireJourR < 0 ? perteJourMaxPct / -pireJourR : Infinity;
  return { risquePct, ddPct, pireJourPct, gainPct: eq * risquePct, ok: ddPct <= drawdownMaxPct && pireJourPct <= perteJourMaxPct, risqueMaxPct: Math.min(rMaxDd, rMaxJour), ddR, pireJourR, trades: liste.length };
}

/* Résultat par régime (hausse, baisse, range) : `trades` doivent venir de `enrichirTrades` (champ `regime`). */
export function parRegime(tradesEnrichis, nMin = 20) {
  const noms = ['hausse', 'baisse', 'range'], out = {};
  for (const nom of noms) { const t = tradesEnrichis.filter(x => x.regime === nom); out[nom] = { n: t.length, esperance: t.length ? t.reduce((a, x) => a + x.R, 0) / t.length : null, assez: t.length >= nMin }; }
  const evaluables = noms.filter(k => out[k].assez);
  return { regimes: out, evaluables: evaluables.length, positifs: evaluables.filter(k => out[k].esperance > 0).length };
}

/* Détection de dérive (CUSUM) : `R` = résultats récents en R, `attendu` = espérance du backtest, `sigma` = écart-type du backtest. Rend { derive, cusum, seuil }.
   Le CUSUM cumule les écarts NÉGATIFS à l'attendu (en écarts-types) ; il dépasse le seuil quand la stratégie fait durablement moins bien que prévu. */
export function detecterDerive(R, { attendu, sigma, seuil = 4, tradesMin = 8, tolerance = 0.5 } = {}) {
  if (!Array.isArray(R) || R.length < tradesMin || !(sigma > 0)) return { derive: false, cusum: 0, seuil, assez: false };
  let c = 0, max = 0; for (const x of R) { c = Math.max(0, c + (attendu - x) / sigma - tolerance); if (c > max) max = c; }
  return { derive: c >= seuil, cusum: c, max, seuil, assez: true };
}
