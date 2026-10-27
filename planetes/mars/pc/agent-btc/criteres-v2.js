import { CRITERES } from './criteres.js';
import { intervalleEsperance, sharpeDeflate } from './stats-m5.js';

/* ═════════════ CRITÈRES D'ACCEPTATION, VERSION 2 (M5 ; écrits le 2026-10-22 AVANT toute recherche M5) ═════════════
   La version 1 (criteres.js, empreinte c9995253) n'est PAS modifiée. La version 2 = la version 1 + des conditions de PLUS. Aucun seuil de la version 1 n'est assoupli :
   en particulier l'espérance nette ≥ +0,25 R par trade reste exigée (plus stricte que les ≈ +0,13 R par trade qui découlent de l'objectif « +20 R sur 150 trades »).
   Ajouts :
   - objectif de rentabilité hors échantillon (walk-forward cumulé, frais + spread + glissement déduits) : au moins +20 R net sur au moins 150 trades ; objectif haut +30 R ;
   - l'intervalle de confiance à 95 % de l'espérance doit rester au-dessus de zéro ;
   - le Sharpe DÉFLATÉ (probabilité que l'avantage ne soit pas du hasard, compte tenu du nombre TOTAL de variantes testées depuis le début) doit être ≥ 95 % ;
   - le jeu final, ouvert une seule fois par stratégie, est partagé par plusieurs candidates : chaque ouverture supplémentaire durcit sa barre (voir recherche-continue.js) ;
   - « CONFIRMÉE EN RÉEL » : après un nombre réglable de trades simulés en direct sans dérive.
   Modifier un seuil = nouvelle recherche, jamais pour sauver une stratégie existante (voir profil-agent.js). */
export const CRITERES2 = Object.freeze({
  ...CRITERES,
  version: 2,
  figesLe: '2026-10-22',
  horsEchantillon: Object.freeze({ ...CRITERES.horsEchantillon, tradesMin: 150 }),
  objectif: Object.freeze({ rNetMin: 20, tradesMin: 150, rNetHaut: 30 }),
  intervalle: Object.freeze({ niveau: 0.95, basMin: 0 }),
  deflation: Object.freeze({ dsrMin: 0.95 }),
  jeuFinalPartage: Object.freeze({ ouverturesMax: 5 }),
  confirmation: Object.freeze({ tradesReels: 20 }),
  derive: Object.freeze({ tradesMin: 8, zSurveillance: -1.5, zSuspension: -2.5, cusumSeuil: 4 })
});

/* Lignes de critères supplémentaires de la version 2 (même format que jugerHorsEchantillon). */
export function lignesM5(wf, nVariantes, c = CRITERES2, varianceObservee = null) {
  const st = wf.stats, R = wf.trades.map(x => x.R), ic = intervalleEsperance(R, c.intervalle.niveau), dsr = sharpeDeflate(R, nVariantes, { varianceObservee });
  const L = (critere, valeur, seuil, ok, unite = '') => ({ critere, valeur, seuil, ok, unite });
  return {
    lignes: [
      L('Objectif : gain net hors échantillon', st.Rtotal, '≥ +' + c.objectif.rNetMin, st.n > 0 && st.Rtotal >= c.objectif.rNetMin, ' R'),
      L('Objectif : nombre de trades hors échantillon', st.n, '≥ ' + c.objectif.tradesMin, st.n >= c.objectif.tradesMin),
      L('Intervalle de confiance à ' + Math.round(c.intervalle.niveau * 100) + ' % de l’espérance : borne basse', ic.bas, '> ' + c.intervalle.basMin, ic.bas != null && ic.bas > c.intervalle.basMin, ' R'),
      L('Sharpe déflaté (probabilité que ce ne soit pas du hasard) parmi ' + nVariantes + ' variantes', dsr.dsr, '≥ ' + Math.round(c.deflation.dsrMin * 100) + ' %', dsr.dsr != null && dsr.dsr >= c.deflation.dsrMin)
    ], ic, dsr
  };
}

/* Avancement vers l'objectif : « +14 R sur 120 trades, objectif +20 R sur 150 ». */
export function avancement(stats, c = CRITERES2) {
  const R = stats && stats.Rtotal != null ? stats.Rtotal : 0, n = stats ? stats.n : 0, o = c.objectif;
  const fmt = x => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1).replace('.', ',') + ' R';
  return {
    R, n, partR: Math.max(0, Math.min(1, R / o.rNetMin)), partTrades: Math.max(0, Math.min(1, n / o.tradesMin)), atteint: n >= o.tradesMin && R >= o.rNetMin, hautAtteint: n >= o.tradesMin && R >= o.rNetHaut,
    echantillonInsuffisant: n < o.tradesMin,
    texte: fmt(R) + ' sur ' + n + ' trade' + (n > 1 ? 's' : '') + ', objectif +' + o.rNetMin + ' R sur ' + o.tradesMin + ' trades' + (n < o.tradesMin ? ' (échantillon insuffisant)' : '')
  };
}
