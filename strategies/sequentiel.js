import { intervalleBootstrap } from './stats-v3.js';
import { CRITERES3 } from './criteres-v3.js';

/* ═════════════ TEST SÉQUENTIEL (SPRT) : UNE VOIE DE PREUVE SUPPLÉMENTAIRE (V4, phase 7 ; module pur, testé : galaxie/tests/pepiniere-test.mjs) ═════════════
   ⚠ « À VALIDER PAR JUSTIN » : cette voie s'AJOUTE aux critères de validation, elle ne les remplace pas et ne les assouplit pas (criteres-v3.json et CRITERES.md : intacts). La voie classique (backtest hors
   échantillon + jeu final) reste telle quelle ; le test séquentiel sert à juger plus tôt les candidates de la PÉPINIÈRE LIVE (trades simulés sur le marché réel).
   Principe (test séquentiel du rapport de vraisemblance de Wald, variance estimée prudemment) : après chaque trade, on compare deux hypothèses sur l'espérance en R par trade :
       H0 : espérance = 0   (aucun avantage)        H1 : espérance = δ  (δ = 0,25 R, le plancher des critères v1)
   LLR = (δ / σ²) · Σ (xᵢ − δ/2).  On ACCEPTE (« avantage prouvé ») quand LLR ≥ A = ln((1 − β) / α′), on REJETTE (« pas d'avantage ») quand LLR ≤ B = ln(β / (1 − α′)), sinon on CONTINUE.
   Même niveau de confiance que la voie classique : α′ = 0,05 / K où K = nombre de candidates JAMAIS testées par la pépinière (correction de Bonferroni sur les comparaisons multiples : le compteur ne baisse
   jamais), β = 0,2. Garde-fous en plus : au moins 30 trades (comme la simulation en direct), σ estimé sur les données avec un plancher de 1 R (une variance sous-estimée rendrait le test trop facile),
   et la borne basse de l'intervalle bootstrap à 95 % doit être > 0 pour accepter (jamais une acceptation sans ça). Une acceptation ouvre la voie à la validation en direct (4 semaines OU 30 trades déjà prévues),
   elle ne déclenche jamais d'ordre. */
export const SPRT = Object.freeze({ delta: 0.25, alpha: 0.05, beta: 0.2, sigmaMin: 1.0, tradesMin: 30, bootstrap: { tirages: 2000, niveau: 0.95, graine: 20261028 } });
const moy = a => a.reduce((x, y) => x + y, 0) / a.length;
export function ecartType(R) { if (R.length < 2) return null; const m = moy(R); return Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1)); }

/* R = résultats en R des trades dans l'ordre. `K` = nombre de comparaisons (candidates jamais testées, ≥ 1). Rend { decision: 'accepter' | 'rejeter' | 'continuer', llr, A, B, n, sigma, moyenne, … } */
export function sprt(R, { K = 1, delta = SPRT.delta, alpha = SPRT.alpha, beta = SPRT.beta, sigmaMin = SPRT.sigmaMin, tradesMin = SPRT.tradesMin } = {}) {
  const n = R.length, a2 = alpha / Math.max(1, K), A = Math.log((1 - beta) / a2), B = Math.log(beta / (1 - a2)), sd = ecartType(R), sigma = Math.max(sigmaMin, sd == null ? sigmaMin : sd);
  let llr = 0; for (const x of R) llr += (delta / (sigma * sigma)) * (x - delta / 2);
  const m = n ? moy(R) : null, base = { llr, A, B, n, sigma, moyenne: m, alpha: a2, K: Math.max(1, K), delta };
  if (n < tradesMin) return { ...base, decision: llr <= B && n >= 10 ? 'rejeter' : 'continuer', raison: n < tradesMin ? 'moins de ' + tradesMin + ' trades : on ne conclut pas à une acceptation avant' : '' };
  if (llr >= A) { const b = intervalleBootstrap(R, { tirages: SPRT.bootstrap.tirages, niveau: SPRT.bootstrap.niveau, graine: SPRT.bootstrap.graine }); if (b.bas != null && b.bas > 0) return { ...base, decision: 'accepter', bootstrapBas: b.bas, raison: 'LLR ' + llr.toFixed(2) + ' ≥ ' + A.toFixed(2) + ' et borne basse de l’intervalle de confiance > 0' }; return { ...base, decision: 'continuer', bootstrapBas: b.bas, raison: 'LLR au-dessus du seuil mais l’intervalle de confiance à 95 % inclut 0 : on continue' }; }
  if (llr <= B) return { ...base, decision: 'rejeter', raison: 'LLR ' + llr.toFixed(2) + ' ≤ ' + B.toFixed(2) + ' : pas d’avantage' };
  return { ...base, decision: 'continuer', raison: 'LLR ' + llr.toFixed(2) + ' entre ' + B.toFixed(2) + ' et ' + A.toFixed(2) };
}
/* Combien de trades la voie classique exige-t-elle ? (pour comparer) : 150 hors échantillon + espérance ≥ 0,25 R + borne basse du bootstrap > 0. */
export function voieClassique(R) {
  const n = R.length, b = n >= 8 ? intervalleBootstrap(R, { tirages: 2000, niveau: 0.95, graine: SPRT.bootstrap.graine }) : null, m = n ? moy(R) : null;
  return { n, moyenne: m, bootstrapBas: b && b.bas, ok: n >= CRITERES3.horsEchantillon.tradesMin && m >= CRITERES3.horsEchantillon.esperanceMin && !!b && b.bas > 0, tradesRequis: CRITERES3.horsEchantillon.tradesMin };
}

/* ── Données REGROUPÉES : la même idée sur BTC, SOL et DOGE ──
   Autorisé seulement quand l'hypothèse est la MÊME sur les trois actifs (mêmes paramètres, même famille). Le résultat PAR ACTIF reste toujours affiché ; le regroupement exige que chaque actif ait au moins
   `tradesParActif` trades et qu'aucun ne soit nettement négatif (moyenne ≥ −0,10 R) : un actif qui perd clairement bloque le regroupement. `trades` = { BTC: [R…], SOL: [R…], DOGE: [R…] } (ordre chronologique). */
export function regrouper(trades, { actifs = ['BTC', 'SOL', 'DOGE'], tradesParActif = 10, moyenneMin = -0.10 } = {}) {
  const parActif = Object.fromEntries(actifs.map(a => [a, { n: (trades[a] || []).length, moyenne: (trades[a] || []).length ? moy(trades[a]) : null }]));
  const manque = actifs.filter(a => parActif[a].n < tradesParActif), negatif = actifs.filter(a => parActif[a].moyenne != null && parActif[a].moyenne < moyenneMin);
  if (manque.length) return { ok: false, parActif, raison: 'regroupement refusé : pas assez de trades sur ' + manque.join(', ') + ' (au moins ' + tradesParActif + ' par actif)' };
  if (negatif.length) return { ok: false, parActif, raison: 'regroupement refusé : ' + negatif.join(', ') + ' est nettement négatif (moyenne < ' + moyenneMin + ' R) : on ne cache pas un actif qui perd' };
  const R = []; const tous = actifs.flatMap(a => (trades[a] || []).map((x, i) => ({ x, i, a }))); tous.sort((p, q) => p.i - q.i || actifs.indexOf(p.a) - actifs.indexOf(q.a)); for (const o of tous) R.push(o.x);   // entrelacé : ordre d'arrivée approximatif
  return { ok: true, parActif, R, raison: 'regroupement autorisé (même hypothèse sur ' + actifs.length + ' actifs, aucun actif nettement négatif) ; résultat par actif toujours affiché' };
}
