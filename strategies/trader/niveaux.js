import { CRITERES4 } from '../criteres-v4.js';
import { intervalleBootstrap } from '../stats-v3.js';
import { statsR } from './bilan.js';
import { fr } from './outils.js';

/* ═════════════ NIVEAUX D'AFFICHAGE, PROMOTION, RÉTROGRADATION, ADAPTATION (V12, phases 3 et 4 ; module pur, testé : galaxie/tests/trader-niveaux-test.mjs) ═════════════
   Trois niveaux : « Validée » (critères V4, alerte d'entrée officielle), « Candidate » (critères V7 / V4 niveau Candidate), « À l'essai » (règles fixées, AUCUNE preuve revendiquée).
   Le mode Trader n'ajoute que le niveau d'AFFICHAGE du bas ; les critères de validation ne sont ni lus ailleurs que dans strategies/criteres-v4.js ni modifiés. Seuls les trades SUIVIS EN AVANT comptent
   (un rétro-test n'est jamais une preuve). Un type qui perd régulièrement est DÉSACTIVÉ automatiquement avec son explication ; il continue d'être suivi en « fantôme » (non affiché, non alerté)
   pour que Justin voie s'il se rétablit, mais il ne se réactive jamais tout seul. */
export const NIVEAUX_TRADER = Object.freeze({ validee: 'Validée', candidate: 'Candidate', a_lessai: 'À l’essai', desactive: 'Désactivé' });
export const BANDEAU_ESSAI = 'À l’essai : pas de preuve statistique — le bilan se construit en direct, trade après trade. Une position proposée n’est pas une promesse.';
export const SEUILS_DESACTIVATION = Object.freeze({ nMin: 20, icHautSous: 0, nMinLourd: 30, espSous: -0.1 });

const moy = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const tri = l => l.slice().sort((a, b) => a.tSortie - b.tSortie);

/* Évalue UN type d'après ses trades suivis en avant. `avant` : [{ R, Rbrut, couts, tSortie, regime }]. `opts` : { auditeurOk, deflationOk, semainesLive } fournis par l'Auditeur (absents = faux).
   Rend { niveau, raison, stats, manque:[…] } ; manque = ce qui reste à remplir pour monter. */
export function evaluerType(avant, opts = {}) {
  const trades = tri(avant), R = trades.map(t => t.R), st = statsR(R), c = CRITERES4, manque = [];
  if (st.n >= SEUILS_DESACTIVATION.nMin && st.ic && st.ic[1] < SEUILS_DESACTIVATION.icHautSous) return { niveau: 'desactive', raison: 'Ce type perd de façon régulière : ' + st.n + ' trades suivis en avant, espérance ' + fr(st.esperance, 2) + ' R, intervalle de confiance à 95 % [' + fr(st.ic[0], 2) + ' ; ' + fr(st.ic[1], 2) + '] entièrement sous zéro.', stats: st, manque: [] };
  if (st.n >= SEUILS_DESACTIVATION.nMinLourd && st.esperance < SEUILS_DESACTIVATION.espSous) return { niveau: 'desactive', raison: 'Ce type perd : ' + st.n + ' trades suivis en avant, espérance ' + fr(st.esperance, 2) + ' R (sous ' + fr(SEUILS_DESACTIVATION.espSous, 2) + ' R).', stats: st, manque: [] };
  const cand = c.candidate;
  const moitie = Math.floor(R.length / 2), p1 = R.slice(0, moitie), p2 = R.slice(moitie), doubles = trades.map(t => t.Rbrut - 2 * t.couts);
  if (st.n < cand.tradesMin) manque.push(st.n + ' / ' + cand.tradesMin + ' trades suivis en avant');
  if (!(st.esperance >= cand.esperanceMin)) manque.push('espérance ' + (st.esperance == null ? '—' : fr(st.esperance, 2)) + ' R, il faut ' + fr(cand.esperanceMin, 2) + ' R au moins');
  if (!(p1.length >= cand.tradesParPeriodeMin && p2.length >= cand.tradesParPeriodeMin && moy(p1) > 0 && moy(p2) > 0)) manque.push('au moins ' + cand.periodesPositivesMin + ' périodes positives de ' + cand.tradesParPeriodeMin + ' trades');
  if (!(moy(doubles) >= cand.fraisDoublesMin)) manque.push('espérance avec frais doublés ≥ 0');
  if (cand.auditeurObligatoire && !opts.auditeurOk) manque.push('rapport de l’Auditeur (absence de fuite du futur, frais ×2)');
  if (manque.length) return { niveau: 'a_lessai', raison: 'Pas de preuve revendiquée. Pour devenir Candidate : ' + manque.join(' ; ') + '.', stats: st, manque };
  // niveau Candidate atteint ; Validée ?
  const val = c.validee, mq = [], boot = R.length >= 30 ? intervalleBootstrap(R, { tirages: val.bootstrap.tirages, niveau: val.bootstrap.niveau, graine: val.bootstrap.graine }) : null;
  const alt = val.alternative;
  if (!((st.n >= val.tradesMin) || (st.n >= alt.tradesMin && (opts.semainesLive || 0) >= alt.semainesLiveMin && st.esperance > alt.liveEsperanceMin))) mq.push(st.n + ' / ' + val.tradesMin + ' trades (ou ' + alt.tradesMin + ' + ' + alt.semainesLiveMin + ' semaines de direct)');
  if (!(st.esperance >= val.esperanceMin)) mq.push('espérance ≥ ' + fr(val.esperanceMin, 2) + ' R');
  if (!(boot && boot.bas > val.bootstrap.basMin)) mq.push('borne basse de l’intervalle (bootstrap) > 0');
  if (!opts.deflationOk) mq.push('Sharpe déflaté ≥ ' + Math.round(val.deflation.dsrMin * 100) + ' % (nombre total d’essais compté)');
  if (!opts.auditeurOk) mq.push('rapport de l’Auditeur');
  if (!((opts.semainesLive || 0) >= val.simulationDirect.semainesMin && st.n >= val.simulationDirect.tradesMin)) mq.push(val.simulationDirect.semainesMin + ' semaines et ' + val.simulationDirect.tradesMin + ' trades de simulation en direct');
  if (mq.length) return { niveau: 'candidate', raison: 'Les critères Candidate sont remplis sur des trades suivis en avant. Pour devenir Validée : ' + mq.join(' ; ') + '.', stats: st, manque: mq };
  return { niveau: 'validee', raison: 'Critères Validée remplis sur des trades suivis en avant.', stats: st, manque: [] };
}

/* Un type est-il à garder dans le régime actuel ? Seulement si son bilan dans ce régime n'est pas mauvais (au moins 10 trades suivis dans ce régime). */
export function actifDansRegime(avant, regime) {
  const l = avant.filter(t => t.regime === regime), R = l.map(t => t.R);
  if (R.length < 10) return { actif: true, raison: null };
  const m = moy(R); if (m < 0) return { actif: false, raison: 'En régime « ' + regime + ' », ce type a ' + R.length + ' trades suivis pour ' + fr(m, 2) + ' R par trade : je ne le propose pas tant que le marché est dans ce régime.' };
  return { actif: true, raison: null };
}
/* Non-stationnarité : la performance récente (15 derniers trades) est nettement sous la moyenne et négative. */
export function baisseRecente(avant) {
  const R = tri(avant).map(t => t.R); if (R.length < 25) return { baisse: false };
  const rec = R.slice(-15), mr = moy(rec), mg = moy(R.slice(0, -15));
  return mr < 0 && mr < mg - 0.3 ? { baisse: true, texte: 'Baisse récente : ' + fr(mr, 2) + ' R sur les 15 derniers trades contre ' + fr(mg, 2) + ' R avant — ce type passe en dernier dans le classement.' } : { baisse: false };
}

/* Met à jour l'état des types (objet clé → { niveau, raison, depuis, … }) d'après les trades suivis EN AVANT des propositions. Rend les événements à journaliser / envoyer. */
export function majTypes(etatTypes, propositions, maintenant, { cleDe, auditeurDe = () => ({}) } = {}) {
  const evenements = [], parType = new Map();
  for (const p of propositions) { if (p.source === 'retro' || !p.resultat || p.resultat.statut !== 'cloturee') continue; const k = cleDe(p); if (!parType.has(k)) parType.set(k, []); parType.get(k).push({ R: p.resultat.R, Rbrut: p.resultat.Rbrut, couts: p.resultat.couts, tSortie: p.tSortie, regime: p.regime }); }
  const cles = new Set([...parType.keys(), ...Object.keys(etatTypes)]);
  for (const k of cles) {
    const avant = parType.get(k) || [], ev = evaluerType(avant, auditeurDe(k)), ancien = etatTypes[k] ? etatTypes[k].niveau : 'a_lessai';
    let niveau = ev.niveau;
    if (ancien === 'desactive' && etatTypes[k] && !etatTypes[k].reactive) niveau = 'desactive';       // jamais de réactivation automatique
    const rang = { desactive: 0, a_lessai: 1, candidate: 2, validee: 3 };
    if (niveau !== ancien) {
      const sens = niveau === 'desactive' ? 'desactivation' : rang[niveau] > rang[ancien] ? 'promotion' : 'retrogradation';
      evenements.push({ t: maintenant, cle: k, de: ancien, vers: niveau, sens, texte: (sens === 'desactivation' ? 'DÉSACTIVÉ : ' : sens === 'promotion' ? 'PROMOTION : ' : 'RÉTROGRADATION : ') + k.split('|').join(' · ') + ' passe de « ' + NIVEAUX_TRADER[ancien] + ' » à « ' + NIVEAUX_TRADER[niveau] + ' ». ' + ev.raison });
    }
    etatTypes[k] = { ...(etatTypes[k] || {}), niveau, raison: niveau === 'desactive' && ancien === 'desactive' && etatTypes[k] && etatTypes[k].raison ? etatTypes[k].raison : ev.raison, depuis: niveau === ancien && etatTypes[k] && etatTypes[k].depuis ? etatTypes[k].depuis : maintenant,
      n: ev.stats.n, esperance: ev.stats.esperance, ic: ev.stats.ic, taux: ev.stats.taux, manque: ev.manque, baisse: baisseRecente(avant) };
  }
  return evenements;
}
