import { RESULTATS_M6C } from './resultats-m6c.js';
import { REGIMES } from './detecteur-regime.js';
import { simulerEvaluation } from '../agent-m6/simulation-eval.js';

/* ═════════════ MON TABLEAU DE PERFORMANCE, VERSION RÉGIME (M6c ; module pur, testé : m6c-performance-test.mjs) ═════════════
   Met en forme les RÉSULTATS MESURÉS de la validation (resultats-m6c.js : zone de recherche A, hors échantillon, frais déduits) pour la fenêtre « Performance des stratégies » de la table de Mars
   et pour l'onglet Régime du poste. Tout est étiqueté « BACKTEST » (mesuré sur le passé) ; « CONFIRMÉ EN RÉEL » n'apparaît que si une règle a été confirmée par des trades simulés en direct, ce qui n'est
   pas le cas tant qu'aucune règle n'est au statut SIGNAL. Rien n'est inventé : sans mesure pour une paire, le tableau le dit. */
export const NOMS_REGLES = Object.freeze({ tendance_cassure: 'Tendance : cassure de qualité', tendance_repli: 'Tendance : repli sur la moyenne 50', cassure_range: 'Cassure de range de qualité', range_trade: 'Trade du range (option)' });
const pct = x => (x == null ? '—' : Math.round(x * 100) + ' %'), r2 = x => (x == null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2).replace('.', ',') + ' R'), r1 = x => (x == null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1).replace('.', ',') + ' R');
export const nomRegime = code => REGIMES[code] || 'inconnu';

export function tableauM6c({ resultats = RESULTATS_M6C, paire = 'BTC' } = {}) {
  const P = resultats && resultats.paires && resultats.paires[paire]; if (!P) return { ok: false, paire, erreur: 'aucune mesure pour ' + paire };
  const regles = Object.entries(P.regles).map(([id, r]) => ({
    id, nom: NOMS_REGLES[id] || id, statut: r.statut, etiquette: r.statut === 'SIGNAL' ? 'BACKTEST' : 'BACKTEST · INFORMATION', n: r.n, esperance: r.esperance, Rtotal: r.Rtotal, tauxReussite: r.tauxReussite, ddR: r.ddR, factProfit: r.factProfit, centileHasard: r.centileHasard,
    gainFiltre: r.gainFiltre, courbeR: r.courbeR, parAnnee: r.parAnnee, parRegime: r.parRegime, cotes: r.cotes, croisement: r.croisement, achatConservation: r.achatConservation, raisons: r.raisons, nCriteres: r.lignes ? r.lignes.length : null, nCriteresOk: r.lignes ? r.lignes.filter(l => l.ok).length : null,
    phrase: NOMS_REGLES[id] + ' : ' + r.n + ' trades hors échantillon, espérance ' + r2(r.esperance) + ' par trade, total ' + r1(r.Rtotal) + ', creux ' + (r.ddR == null ? '—' : r.ddR.toFixed(1).replace('.', ',')) + ' R, ' + (r.centileHasard == null ? 'hasard non mesuré' : 'meilleure que ' + pct(r.centileHasard) + ' des entrées aléatoires') + ' → ' + (r.statut === 'SIGNAL' ? 'SIGNAL' : 'INFORMATION seulement (pas de signal d’entrée)')
  }));
  // taux de réussite par régime (toutes règles confondues, pondéré par le nombre de trades)
  const reg = new Map(); for (const r of regles) for (const x of r.parRegime || []) { const e = reg.get(x.regime) || { regime: x.regime, n: 0, gagnants: 0, R: 0 }; e.n += x.n; e.gagnants += x.taux * x.n; e.R += x.esperance * x.n; reg.set(x.regime, e); }
  const parRegime = [...reg.values()].map(e => ({ regime: e.regime, nom: nomRegime(e.regime), n: e.n, taux: e.n ? e.gagnants / e.n : null, esperance: e.n ? e.R / e.n : null })).sort((a, b) => a.regime - b.regime);
  const M = P.mesures || {};
  const meilleure = regles.filter(r => r.n >= 20).sort((a, b) => (b.Rtotal ?? -1e9) - (a.Rtotal ?? -1e9))[0] || null;
  return {
    ok: true, paire, etiquette: 'BACKTEST', zoneMois: P.zoneAMois, nVariantes: P.nVariantes, genereLe: resultats.genereLe, criteres: resultats.criteres, regles, parRegime, meilleure,
    detecteur: (M.precision || []).map(p => ({ regime: p.regime, n: p.n, taux: p.taux, base: p.base, lift: p.lift, ok: p.ok, phrase: p.regime + ' : annoncé ' + p.n + ' fois, réussi ' + pct(p.taux) + ' (base ' + pct(p.base) + ', lift ' + (p.lift == null ? '—' : p.lift.toFixed(2).replace('.', ',')) + ')' + (p.ok ? '' : ' → indicatif, pas prédictif') })),
    cassures: M.cassures ? { evitees: M.cassures.retest.evitees, subies: M.cassures.immediat.subies, signauxRetest: M.cassures.retest.signaux, signauxImmediat: M.cassures.immediat.signaux } : null,
    evites: M.evites || null, grosMouvements: M.grosMouvements || null,
    verdict: regles.some(r => r.statut === 'SIGNAL') ? 'Au moins une règle a passé tous les critères.' : 'Aucune règle n’a battu le hasard sur tous les critères : l’assistant décrit le marché (information), il ne propose aucune entrée.'
  };
}

/* Probabilités d'évaluation (−3 % jour, −6 % total, +10 %) à 0,25 / 0,5 / 1 % de risque, sur les trades hors échantillon d'UNE règle (rejeu de ses résultats mesurés : BACKTEST, pas une promesse). */
export function simulationRegle({ resultats = RESULTATS_M6C, paire = 'BTC', id, regles = {}, gain = 0, pic = null, risques = [0.25, 0.5, 1], graine = 20261023, nExt = 20, nInt = 100 } = {}) {
  const r = resultats.paires[paire] && resultats.paires[paire].regles[id]; if (!r || !r.Rtrades || r.Rtrades.length < 8) return { ok: false, erreur: 'pas assez de trades hors échantillon pour simuler' + (r ? ' (' + (r.Rtrades || []).length + ')' : '') };
  const semaines = Math.max(1, (resultats.paires[paire].zoneAMois * 0.6 * 30.4375) / 7), freq = Math.max(0.2, Math.min(5, r.n / semaines));
  const s = simulerEvaluation({ R: r.Rtrades, tradesParSemaine: freq, regles, gain, pic: pic == null ? undefined : pic, risquesPct: risques, graine, nExt, nInt });
  if (!s.ok) return s;
  return { ok: true, etiquette: 'BACKTEST · ESTIMÉ', paire, id, nom: NOMS_REGLES[id], n: r.Rtrades.length, esperance: s.esperance, niveaux: s.niveaux.map(x => ({ risquePct: x.risquePct, pObjectif: x.pObjectif.moy, pDrawdown: x.pDrawdown.moy, pJour: x.pJour.moy, bas: x.pObjectif.bas, haut: x.pObjectif.haut })),
    phrase: 'Si on rejouait les résultats mesurés de « ' + NOMS_REGLES[id] + ' » sur ' + paire + ' : ' + s.niveaux.map(x => 'à ' + String(x.risquePct).replace('.', ',') + ' % de risque, ' + Math.round(x.pObjectif.moy * 100) + ' % d’atteindre +10 % pour ' + Math.round((x.pDrawdown.moy) * 100) + ' % de toucher −6 % et ' + Math.round(x.pJour.moy * 100) + ' % de toucher −3 % sur un jour').join(' ; ') + '. Estimation sur le passé, pas une promesse.' };
}
