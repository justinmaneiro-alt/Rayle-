/* ═════════════ COUVERTURE : corrélations, bêta, stabilité, backtest « seule » contre « couverte », verdict (calculs PURS, testés) ═════════════
   Convention : sens = +1 achat, −1 vente. Rendements journaliers logarithmiques (différences pour les taux). Aucune donnée inventée : un actif sans série n'est pas classé.
   Couverture d'une position X (notionnel N, sens s) par un actif Y : PnL(t) = s·N·(rX(t) − β·rY(t)), β = cov(rX, rY) / var(rY) mesuré sur une fenêtre.
   β > 0 (actifs corrélés) → la couverture est dans le sens OPPOSÉ à la position ; β < 0 → dans le MÊME sens. Taille de la couverture = |β| × N (notionnel).
   Le backtest est « sans regard vers l'avenir » : à chaque jour, β est estimé sur les jours AVANT (walk-forward). */
import { rendementsCommuns, differencesCommunes, significativite } from '../commun/series.js';
import { correlation, moyenne, ecartType } from '../commun/analyse.js';

export const FENETRES_CORR = [30, 90, 250];
export const FENETRE_BETA = 120, JOURS_BACKTEST = 250, FENETRE_STABILITE = 60;

/* actifs de l'univers « couverture » : id des instantanés jour-<id>.json, nom court, correspondance XTB (à vérifier dans xStation) et nature de la série */
export const UNIVERS_COUV = Object.freeze([
  { id: 'XAUUSD', court: 'OR', nom: 'Or', xtb: 'GOLD' },
  { id: 'XAGUSD', court: 'ARG', nom: 'Argent', xtb: 'SILVER' },
  { id: 'US100', court: 'N100', nom: 'Nasdaq 100', xtb: 'US100' },
  { id: 'US500', court: 'S&P', nom: 'S&P 500', xtb: 'US500' },
  { id: 'BTC', court: 'BTC', nom: 'Bitcoin', xtb: 'BITCOIN' },
  { id: 'SOL', court: 'SOL', nom: 'Solana', xtb: 'SOLANA' },
  { id: 'DXY', court: 'DXY', nom: 'Dollar (DXY)', xtb: 'USDX (à vérifier)' },
  { id: 'EURUSD', court: 'EUR', nom: 'EUR/USD', xtb: 'EURUSD' },
  { id: 'US10Y', court: 'T10', nom: 'Taux US 10 ans', xtb: null, taux: true },
  { id: 'WTI', court: 'PÉT', nom: 'Pétrole WTI', xtb: 'OIL.WTI' }
]);
export const parId = Object.freeze(Object.fromEntries(UNIVERS_COUV.map(a => [a.id, a])));
export const tauxIds = UNIVERS_COUV.filter(a => a.taux).map(a => a.id);

const rend = (A, B) => ((parId[A.id] && parId[A.id].taux) || (parId[B.id] && parId[B.id].taux) ? differencesCommunes : rendementsCommuns);
/* A et B : { id, serie: [{ d, t, c }] } */
export function paire(A, B) { const { ra, rb, dates } = rend(A, B)(A.serie, B.serie); return { ra, rb, dates }; }
export function corrPaire(A, B, jours) { const { ra, rb } = paire(A, B), n = Math.min(jours, ra.length); if (n < 15) return { r: null, n }; const r = correlation(ra.slice(-n), rb.slice(-n)); return { r, n, ...significativite(r, n) }; }
export function matriceCorr(S, ids, jours) { return ids.map(a => ids.map(b => (a === b ? { r: 1, n: jours } : (S[a] && S[b] ? corrPaire({ id: a, serie: S[a] }, { id: b, serie: S[b] }, jours) : { r: null, n: 0 })))); }
export function glissante(A, B, fen = 60) { const { ra, rb, dates } = paire(A, B), out = []; for (let i = fen; i <= ra.length; i++) out.push({ d: dates[i - 1], r: correlation(ra.slice(i - fen, i), rb.slice(i - fen, i)) }); return out; }

const cov = (a, b) => { const ma = moyenne(a), mb = moyenne(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / Math.max(1, a.length - 1); };
const variance = a => { const m = moyenne(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1); };
export const beta = (ra, rb) => { const v = variance(rb); return v > 0 ? cov(ra, rb) / v : null; };   // pente de X sur Y
/* part des fenêtres glissantes dont la corrélation a le même signe que la corrélation d'ensemble (0 à 1) */
export function stabilite(ra, rb, fen = FENETRE_STABILITE, pas = 5, horizon = 500) {
  const n = ra.length, debut = Math.max(fen, n - horizon), ref = correlation(ra.slice(-Math.min(n, 250)), rb.slice(-Math.min(n, 250))); if (ref == null) return null;
  let tot = 0, ok = 0; for (let i = n; i >= debut; i -= pas) { const r = correlation(ra.slice(i - fen, i), rb.slice(i - fen, i)); if (r == null) continue; tot++; if (Math.sign(r) === Math.sign(ref)) ok++; }
  return tot >= 4 ? ok / tot : null;
}
export function maxDrawdown(courbe) { let pic = -Infinity, dd = 0; for (const v of courbe) { if (v > pic) pic = v; dd = Math.min(dd, v - pic); } return dd; }   // en points de % du notionnel (≤ 0)
const volAnn = r => ecartType(r) * Math.sqrt(252);

/* backtest : la position seule contre la position couverte, β estimé sur les `fenBeta` jours précédents, coûts : spread (en % du notionnel de la couverture, payé à l'ouverture) et swap annuel (en % par an du notionnel de la couverture) */
export function backtest(X, Y, sens, { jours = JOURS_BACKTEST, fenBeta = FENETRE_BETA, spreadPct = 0, swapAnPct = 0 } = {}) {
  const { ra, rb, dates } = paire(X, Y), n = ra.length; if (n < fenBeta + 30) return null;
  const debut = Math.max(fenBeta, n - jours), seule = [], couverte = [], d = [], betas = []; let cs = 0, cc = 0;
  for (let t = debut; t < n; t++) {
    const b = beta(ra.slice(t - fenBeta, t), rb.slice(t - fenBeta, t)); if (b == null) continue;
    const r1 = sens * ra[t], r2 = sens * (ra[t] - b * rb[t]) * 100, cout = (t === debut ? spreadPct : 0) + Math.abs(b) * swapAnPct / 365;
    cs += r1 * 100; cc += r2 - cout; seule.push(cs); couverte.push(cc); d.push(dates[t]); betas.push(b);
  }
  if (seule.length < 20) return null;
  const rs = seule.map((v, i) => v - (i ? seule[i - 1] : 0)), rc = couverte.map((v, i) => v - (i ? couverte[i - 1] : 0));
  const vS = volAnn(rs), vC = volAnn(rc), dS = maxDrawdown(seule), dC = maxDrawdown(couverte);
  return { dates: d, seule, couverte, betas, volSeule: vS, volCouverte: vC, reductionVol: vS > 0 ? 1 - vC / vS : null, ddSeule: dS, ddCouverte: dC, reductionDD: dS < 0 ? 1 - dC / dS : null, finSeule: seule[seule.length - 1], finCouverte: couverte[couverte.length - 1], jours: seule.length };
}
export function verdict({ r250, stab, p, reductionVol }) {
  if (r250 == null || stab == null || reductionVol == null) return { niveau: 'a-eviter', texte: 'à éviter : pas assez de données pour juger' };
  if (Math.abs(r250) < 0.3 || stab < 0.5 || reductionVol < 0.05) return { niveau: 'a-eviter', texte: 'à éviter : lien trop faible ou instable, la couverture ne réduirait presque pas le risque' };
  if (Math.abs(r250) >= 0.6 && stab >= 0.8 && (p == null || p < 0.01) && reductionVol >= 0.25) return { niveau: 'fiable', texte: 'fiable : lien fort, stable dans le temps et réduction du risque mesurée sans regarder l’avenir' };
  return { niveau: 'fragile', texte: 'fragile : le lien existe mais varie dans le temps ou réduit peu le risque ; à surveiller et à retester' };
}
/* classe tous les candidats pour couvrir X ; S = { id: serie } ; renvoie la liste triée (meilleur d'abord) */
export function classerCouvertures(S, xId, sens, { notionnel = null, spreadPct = 0, swapAnPct = 0, exclure = [] } = {}) {
  const X = { id: xId, serie: S[xId] }; if (!X.serie) return [];
  const out = [];
  for (const a of UNIVERS_COUV) {
    if (a.id === xId || a.taux || !a.xtb || exclure.includes(a.id) || !S[a.id]) continue;
    const Y = { id: a.id, serie: S[a.id] }, { ra, rb } = paire(X, Y); if (ra.length < FENETRE_BETA + 30) continue;
    const c30 = corrPaire(X, Y, 30), c90 = corrPaire(X, Y, 90), c250 = corrPaire(X, Y, 250), b = beta(ra.slice(-250), rb.slice(-250)), stab = stabilite(ra, rb);
    const bt = backtest(X, Y, sens, { spreadPct, swapAnPct }); if (b == null) continue;
    const dirY = -Math.sign(b) * sens, v = verdict({ r250: c250.r, stab, p: c250.p, reductionVol: bt ? bt.reductionVol : null });
    out.push({ id: a.id, nom: a.nom, xtb: a.xtb, c30: c30.r, c90: c90.r, c250: c250.r, n250: c250.n, p: c250.p, ic: c250.ic, beta: b, stabilite: stab, sensCouverture: dirY, tailleNotionnel: notionnel ? Math.abs(b) * notionnel : null, tailleRelative: Math.abs(b), backtest: bt, verdict: v,
      score: (c250.r == null || stab == null ? 0 : Math.abs(c250.r) * stab) * (v.niveau === 'a-eviter' ? 0.3 : 1) });
  }
  return out.sort((p, q) => q.score - p.score);
}
