/* ═════════════ STATISTIQUES DES FLÈCHES (interface) : tableau « Statistiques » et phrase d'historique dans l'info-bulle des flèches ═════════════
   Données : trader-pro/terminal/stats-fleches.json (calculées par outils-donnees/stats-fleches.mjs sur tout l'historique disponible, voir stats-fleches.js pour les règles). */
import { phraseStats, TYPES_STATS, PARAMS_STATS } from './stats-fleches.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const signe = v => { if (!Number.isFinite(v)) return '—'; const r = Math.round(v * 100) / 100; return (r >= 0 ? '+' : '−') + nf(Math.abs(r), 2); };
export const REPERE_HASARD = 1 / (1 + PARAMS_STATS.cible);   // 33 % : taux d'une marche aléatoire pour une cible à 2 R et un stop à 1 R
const NOMS_ACTIFS = { or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', eurusd: 'l’EUR/USD', doge: 'Dogecoin' };
let cache = null;
export async function chargerStats(url = new URL('./stats-fleches.json', import.meta.url).href, fetchFn = (...a) => fetch(...a)) {
  if (cache) return cache; try { const r = await fetchFn(url); if (!r.ok) return null; cache = await r.json(); } catch (e) { return null; } return cache;
}
/* type de statistique d'une flèche : MA200 → ma200-cassure / ma200-rebond ; niveau tracé → niveau-rebond / niveau-cassure ; Fibonacci → fibo-rebond ; le retest n'a pas de statistique propre */
export function typeStat({ source = 'ma200', type, niveau = null } = {}) {
  if (source === 'ma200') return type === 'cassure' ? 'ma200-cassure' : type === 'rebond' ? 'ma200-rebond' : null;
  if (type === 'retest') return null;
  if (niveau === 'fibo') return type === 'rebond' ? 'fibo-rebond' : null;
  return type === 'rebond' ? 'niveau-rebond' : type === 'cassure' ? 'niveau-cassure' : null;
}
/* « Historique de ce type de flèche sur l'or H4 : 58 % · +0,9 R médian · 142 cas » (ou la raison pour laquelle il n'y en a pas) */
export function phraseHistorique(S, actifId, unite, typeId) {
  const nom = NOMS_ACTIFS[actifId] || actifId; if (!typeId) return 'Pas de statistique propre pour ce type de flèche';
  if (unite === 'H1') return `Pas de statistique H1 pour ${nom} (historique H1 trop court) : voir H4 et Jour dans « Stats »`;
  const s = S && S.actifs && S.actifs[actifId] && S.actifs[actifId][unite] && S.actifs[actifId][unite].types[typeId]; if (!s) return `Historique de ce type de flèche sur ${nom} : non calculé`;
  return phraseStats(nom, unite, s);
}
const dateFr = t => new Date(t).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
export function tableauHtml(S, actifId, unite) {
  if (!S) return '<p class="tp-doux">Statistiques indisponibles (fichier non chargé).</p>';
  const A = S.actifs && S.actifs[actifId]; if (!A) return '<p class="tp-doux">Pas de statistiques pour cet actif.</p>';
  const U = A[unite]; if (!U) return `<p class="tp-doux">Pas assez de bougies ${unite === 'J' ? 'Jour' : unite} pour calculer des statistiques.</p>`;
  const lignes = TYPES_STATS.map(t => {
    const s = U.types[t.id], faible = !s.significatif, cls = s.taux == null ? '' : s.taux > REPERE_HASARD + 0.05 ? 'tp-h' : s.taux < REPERE_HASARD - 0.05 ? 'tp-b' : '';
    return `<tr class="${faible ? 'tp-faible' : ''}"><th scope="row">${esc(t.nom)}</th><td class="${faible ? '' : cls}">${s.taux == null ? '—' : Math.round(s.taux * 100) + ' %'}</td><td>${signe(s.esperance)}</td><td>${signe(s.rMed10)}</td><td>${signe(s.rMed20)}</td><td>${s.n}${faible ? '<br><small>non significatif</small>' : ''}</td></tr>`;
  }).join('');
  return `<div class="tp-stats-scroll"><table class="tp-stats-t"><thead><tr><th>Type de flèche</th><th title="cible à 2 R atteinte avant le stop">Réussite</th><th title="(gagnés × 2 − perdus) / cas résolus">Espérance (R)</th><th title="R médian après 10 bougies, stop maintenu">R méd. 10</th><th title="R médian après 20 bougies, stop maintenu">R méd. 20</th><th>Cas</th></tr></thead><tbody>${lignes}</tbody></table></div>
    <p class="tp-doux">${U.bougies} bougies ${unite === 'J' ? 'Jour' : unite} (${esc(dateFr(U.debut))} → ${esc(dateFr(U.fin))}). <b>Repère du hasard : ${Math.round(REPERE_HASARD * 100)} %</b> de réussite (cible 2 R, stop 1 R) : un taux proche de ${Math.round(REPERE_HASARD * 100)} % ne montre aucun avantage. Moins de ${PARAMS_STATS.minSignificatif} cas : non significatif.</p>`;
}
export function panneauHtml(S, actifId, unite) {
  const ids = S && S.actifs ? Object.keys(S.actifs) : [];
  return `<header><b>Statistiques des flèches</b><button type="button" data-fermer aria-label="Fermer">✕</button></header>
    <div class="tp-stats-choix" role="group" aria-label="Actif">${ids.map(a => `<button type="button" data-stat-actif="${a}" aria-pressed="${a === actifId}">${esc((S.actifs[a].nom || a).replace(/^(l’|le |la )/, ''))}</button>`).join('')}</div>
    <div class="tp-stats-choix" role="group" aria-label="Unité de temps">${['H4', 'J'].map(u => `<button type="button" data-stat-unite="${u}" aria-pressed="${u === unite}">${u === 'J' ? 'Jour' : u}</button>`).join('')}</div>
    ${tableauHtml(S, actifId, unite)}
    <h4>Comment lire</h4><p class="tp-doux">Chaque flèche simulée est « prise » à la clôture de la bougie de confirmation ; le stop est placé derrière la mèche de cette bougie (au moins 1 ATR) ; la cible est à 2 R. Les flèches de niveau et de Fibonacci sont simulées sur des niveaux <b>objectifs</b> (plus hauts et plus bas de swing majeurs) : les niveaux tracés à la main ne peuvent pas être rejoués à l’identique dans le passé. Frais, spread et glissement ne sont pas comptés. Passé ≠ futur.</p>
    <p class="tp-doux">Calcul du ${esc(S && S.genere ? new Date(S.genere).toLocaleDateString('fr-FR') : '—')} (outils-donnees/stats-fleches.mjs).</p>`;
}
