import { CRITERES2 } from './criteres-v2.js';
import { intervalleEsperance } from './stats-m5.js';

/* ═════════════ DÉRIVE EN DIRECT, SURVEILLANCE, SUSPENSION, CONFIRMATION (M5 ; module pur, testé : m5-derive-test.mjs) ═════════════
   Une stratégie validée sur le passé peut cesser de marcher. On compare ses trades SIMULÉS EN DIRECT (compte simulé, jamais d'ordre réel) à son comportement ATTENDU (espérance et écart-type hors échantillon) :
   - z = (moyenne en direct − espérance attendue) ÷ (écart-type attendu ÷ √n) ; sous zSurveillance → EN SURVEILLANCE ; sous zSuspension → SUSPENDUE ;
   - CUSUM (somme cumulée des écarts défavorables) au-dessus du seuil → EN SURVEILLANCE ; creux en direct au-dessus du 95e centile Monte Carlo → EN SURVEILLANCE ;
   - rien n'est décidé avant `tradesMin` trades en direct (trop de bruit) ;
   - une suspension n'est JAMAIS levée automatiquement : seule l'utilisatrice peut réactiver. Une surveillance revient à la normale si z ≥ 0.
   Niveau « CONFIRMÉE EN RÉEL » : au moins `tradesReels` trades simulés en direct, moyenne ≥ 0, z ≥ zSurveillance, aucun signal de dérive. Ce n'est pas une preuve : c'est l'absence de contradiction. */
export function evaluerDerive(tradesLive, attendu, c = CRITERES2) {
  const d = c.derive, n = tradesLive.length, R = tradesLive.map(x => x.R);
  const base = { n, z: null, cusum: 0, ddR: 0, moyenne: n ? R.reduce((a, b) => a + b, 0) / n : null, statut: 'ok', raison: null, signaux: [] };
  if (!attendu || !(attendu.sigma > 0) || attendu.esperance == null) return { ...base, statut: 'inconnu', raison: 'Comportement attendu inconnu : surveillance impossible.' };
  let cusum = 0, pic = 0, courbe = 0, dd = 0, cusumMax = 0;
  for (const r of R) { cusum = Math.max(0, cusum + (attendu.esperance - r) / attendu.sigma - 0.5); if (cusum > cusumMax) cusumMax = cusum; courbe += r; if (courbe > pic) pic = courbe; if (pic - courbe > dd) dd = pic - courbe; }
  base.cusum = cusum; base.ddR = dd;
  if (n < d.tradesMin) return { ...base, statut: 'ok', raison: 'Seulement ' + n + ' trade(s) en direct : trop tôt pour juger (il en faut ' + d.tradesMin + ').', insuffisant: true };
  const z = (base.moyenne - attendu.esperance) / (attendu.sigma / Math.sqrt(n)); base.z = z;
  const signaux = [];
  if (z < d.zSurveillance) signaux.push('moyenne en direct ' + base.moyenne.toFixed(2).replace('.', ',') + ' R contre ' + attendu.esperance.toFixed(2).replace('.', ',') + ' R attendus (z = ' + z.toFixed(1).replace('.', ',') + ')');
  if (cusum >= d.cusumSeuil) signaux.push('série de résultats défavorables (indicateur CUSUM ' + cusum.toFixed(1).replace('.', ',') + ' ≥ ' + d.cusumSeuil + ')');
  if (attendu.ddP95 != null && dd > attendu.ddP95) signaux.push('creux en direct de ' + dd.toFixed(1).replace('.', ',') + ' R, au-delà du 95e centile attendu (' + attendu.ddP95.toFixed(1).replace('.', ',') + ' R)');
  base.signaux = signaux;
  if (z < d.zSuspension) return { ...base, statut: 'suspendue', raison: 'Dérive forte : ' + signaux.join(' ; ') + '.' };
  if (signaux.length) return { ...base, statut: 'surveillance', raison: 'Dérive possible : ' + signaux.join(' ; ') + '.' };
  return { ...base, statut: 'ok', raison: null };
}
/* Décide du prochain statut (voir transitions de bibliotheque.js). `statutActuel` ∈ validee | confirmee | surveillance | suspendue. Rend { statut, raison, changement }. */
export function prochainStatut(statutActuel, tradesLive, attendu, c = CRITERES2) {
  const e = evaluerDerive(tradesLive, attendu, c);
  if (statutActuel === 'suspendue') return { statut: 'suspendue', raison: 'Suspendue : seule une réactivation manuelle la relance.', changement: false, evaluation: e };
  if (e.statut === 'suspendue') return { statut: 'suspendue', raison: e.raison, changement: true, evaluation: e };
  if (e.statut === 'surveillance') return { statut: 'surveillance', raison: e.raison, changement: statutActuel !== 'surveillance', evaluation: e };
  if (statutActuel === 'surveillance') {
    if (e.z != null && e.z >= 0) return { statut: tradesLive.length >= c.confirmation.tradesReels ? 'confirmee' : 'validee', raison: 'Retour à la normale (z = ' + e.z.toFixed(1).replace('.', ',') + ').', changement: true, evaluation: e };
    return { statut: 'surveillance', raison: 'Toujours en surveillance.', changement: false, evaluation: e };
  }
  if (statutActuel === 'validee' && tradesLive.length >= c.confirmation.tradesReels && e.z != null && e.z >= c.derive.zSurveillance && e.moyenne >= 0)
    return { statut: 'confirmee', raison: tradesLive.length + ' trades simulés en direct, moyenne ' + e.moyenne.toFixed(2).replace('.', ',') + ' R, aucune dérive détectée.', changement: true, evaluation: e };
  return { statut: statutActuel, raison: null, changement: false, evaluation: e };
}
/* Progression vers la confirmation, pour l'interface. */
export function progressionConfirmation(tradesLive, c = CRITERES2) {
  const n = tradesLive.length, N = c.confirmation.tradesReels, ic = intervalleEsperance(tradesLive.map(x => x.R));
  return { n, objectif: N, part: Math.min(1, n / N), ic, texte: n + ' trade' + (n > 1 ? 's' : '') + ' simulé' + (n > 1 ? 's' : '') + ' en direct sur ' + N + ' pour être CONFIRMÉE EN RÉEL' };
}
