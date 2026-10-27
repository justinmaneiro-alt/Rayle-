/* ═════════════ DÉTECTEUR DE TILT (M6 ; module pur et déterministe, sans IA ; testé : planetes/mars/tests/m6-gardien-test.mjs) ═════════════
   Le tilt est l'état où l'on trade pour « se refaire » au lieu de suivre son plan. Il se voit dans le journal, par des signaux objectifs :
   - REVANCHE : un trade ouvert peu après une perte, dans le même sens ou plus gros ;
   - SURTRADING : trop de trades dans la journée ou en rafale ;
   - TAILLE EN HAUSSE APRÈS UNE PERTE : on grossit juste après avoir perdu ;
   - STOP IGNORÉ : pas de stop, stop reculé, ou perte réelle bien plus grande que le risque prévu ;
   - HORS PLAN : trade sans stratégie ni plan (ou signalé comme tel), R/R sous le minimum ;
   - ENTRÉE AVEC LA MARGE PRESQUE ÉPUISÉE : trade pris alors que la perte du jour ou le drawdown était déjà proche de la limite.
   Échelle VERT / ORANGE / ROUGE avec recommandation de pause. Les poids sont écrits ici, visibles, et ne sont pas « appris ». Rien n'est dit de ton état psychologique : on décrit des FAITS du journal. */
export const POIDS_TILT = Object.freeze({ revanche: 30, surtrading: 20, taille_apres_perte: 25, stop_ignore: 30, hors_plan: 15, marge_epuisee: 25 });
export const SEUILS_TILT = Object.freeze({ orange: 25, rouge: 55 });
const MS_J = 86400e3, MS_MIN = 60e3;
const chrono = j => j.filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);

/* journal : trades { id, t, tSortie?, paire, sens, taille? (quantité), risqueUSD?, pnl?, stop?, stopDeplace?, stopIgnore?, horsPlan?, strategie?, rr?, margeAvant?, partMargeAvant? (0..1 = part de la limite déjà consommée à l'entrée) }.
   regles : { revancheDelaiMin, tradesParJourMax, rrMin, perteMultipleStop } (valeurs par défaut prudentes). fenetreMs : seuls les trades récents comptent pour l'état courant. */
export function detecterTilt(journal, { maintenant = Date.now(), regles = {}, fenetreMs = 24 * 3600e3 } = {}) {
  const R = { revancheDelaiMin: 30, tradesParJourMax: 3, rrMin: 1.5, perteMultipleStop: 1.25, rafaleTrades: 3, rafaleHeures: 2, hausseTaille: 1.25, margeEpuisee: 0.8, ...regles };
  const J = chrono(journal), recents = J.filter(x => maintenant - x.t <= fenetreMs), signaux = [];
  const ajouter = (id, nom, detail, trades, poids = POIDS_TILT[id]) => signaux.push({ id, nom, detail, poids, trades: trades.map(x => x.id), t: Math.max(...trades.map(x => x.t)) });
  const perdu = x => Number.isFinite(x.pnl) && x.pnl < 0 && Number.isFinite(x.tSortie);
  const taille = x => (Number.isFinite(x.risqueUSD) ? x.risqueUSD : Number.isFinite(x.taille) && Number.isFinite(x.prixEntree) ? x.taille * x.prixEntree : null);
  for (let i = 1; i < J.length; i++) {
    const x = J[i]; if (!recents.includes(x)) continue;
    const avant = J.slice(0, i).filter(perdu).sort((a, b) => b.tSortie - a.tSortie)[0];
    if (!avant || x.t < avant.tSortie) continue;
    const min = (x.t - avant.tSortie) / MS_MIN, memeSens = x.sens === avant.sens && x.paire === avant.paire, tx = taille(x), ta = taille(avant), plusGros = tx != null && ta != null && tx > ta * 1.0001;
    if (min < R.revancheDelaiMin && (memeSens || plusGros)) ajouter('revanche', 'Revanche', 'trade ouvert ' + Math.round(min) + ' min après une perte' + (memeSens ? ', dans le même sens sur ' + x.paire : '') + (plusGros ? ', plus gros que le précédent' : ''), [avant, x]);
    if (tx != null && ta != null && min < 8 * 60 && tx > ta * R.hausseTaille) ajouter('taille_apres_perte', 'Taille en hausse après une perte', 'risque ×' + (tx / ta).toFixed(1).replace('.', ',') + ' par rapport au trade perdant précédent', [avant, x]);
  }
  // surtrading : plus de trades que permis dans la journée, ou une rafale
  const parJour = new Map(); for (const x of recents) { const k = Math.floor(x.t / MS_J); (parJour.get(k) || parJour.set(k, []).get(k)).push(x); }
  for (const [, l] of parJour) if (l.length > R.tradesParJourMax) ajouter('surtrading', 'Surtrading', l.length + ' trades dans la journée pour ' + R.tradesParJourMax + ' prévus', l);
  for (let i = 0; i + R.rafaleTrades - 1 < recents.length; i++) { const w = recents.slice(i, i + R.rafaleTrades); if (w[w.length - 1].t - w[0].t <= R.rafaleHeures * 3600e3 && !signaux.some(s => s.id === 'surtrading' && w.every(x => s.trades.includes(x.id)))) ajouter('surtrading', 'Rafale de trades', R.rafaleTrades + ' trades en moins de ' + R.rafaleHeures + ' h', w, POIDS_TILT.surtrading * 0.75); }
  for (const x of recents) {
    if (x.stop == null && !x.stopIgnore) ajouter('stop_ignore', 'Pas de stop', 'trade sans stop posé', [x]);
    else if (x.stopIgnore || x.stopDeplace) ajouter('stop_ignore', 'Stop ignoré', x.stopDeplace ? 'stop reculé après l’entrée' : 'stop non respecté', [x]);
    else if (Number.isFinite(x.pnl) && Number.isFinite(x.risqueUSD) && x.risqueUSD > 0 && -x.pnl > x.risqueUSD * R.perteMultipleStop) ajouter('stop_ignore', 'Perte au-delà du stop', 'perte de ' + Math.round(-x.pnl) + ' $ pour ' + Math.round(x.risqueUSD) + ' $ prévus', [x]);
    if (x.horsPlan || (!x.strategie && !x.setup) || (Number.isFinite(x.rr) && x.rr < R.rrMin)) ajouter('hors_plan', 'Hors plan', x.horsPlan ? 'trade marqué hors plan' : (Number.isFinite(x.rr) && x.rr < R.rrMin ? 'R/R de ' + x.rr.toFixed(1).replace('.', ',') + ' sous le minimum de ' + R.rrMin : 'aucune stratégie ni setup associé'), [x]);
    if (Number.isFinite(x.partMargeAvant) && x.partMargeAvant >= R.margeEpuisee) ajouter('marge_epuisee', 'Marge presque épuisée', 'pris alors que ' + Math.round(x.partMargeAvant * 100) + ' % de la limite était déjà consommée', [x]);
  }
  // score : somme des poids, chaque famille plafonnée à 2 occurrences (le score n'explose pas pour un seul défaut répété), borné à 100 ; décroît avec l'ancienneté du dernier signal
  const parFamille = {}; for (const s of signaux) (parFamille[s.id] = parFamille[s.id] || []).push(s);
  let score = 0; for (const l of Object.values(parFamille)) score += l.sort((a, b) => b.poids - a.poids).slice(0, 2).reduce((s, x) => s + x.poids * (maintenant - x.t < 4 * 3600e3 ? 1 : maintenant - x.t < 12 * 3600e3 ? 0.7 : 0.4), 0);
  score = Math.min(100, Math.round(score));
  const niveau = score >= SEUILS_TILT.rouge ? 'ROUGE' : score >= SEUILS_TILT.orange ? 'ORANGE' : 'VERT';
  const recommandation = niveau === 'ROUGE' ? 'Arrête de trader pour le reste de la journée. Ferme l’écran, marche, reviens demain avec le plan.' : niveau === 'ORANGE' ? 'Fais une pause d’au moins 30 minutes avant tout nouveau trade et relis ton plan.' : 'Rien d’anormal dans ton journal récent.';
  const pauseMin = niveau === 'ROUGE' ? 12 * 60 : niveau === 'ORANGE' ? 30 : 0;
  const phrase = niveau === 'VERT' ? 'Tilt : vert. ' + (recents.length ? recents.length + ' trade(s) dans les dernières 24 h, aucun signal d’alerte.' : 'Aucun trade récent.') : 'Tilt : ' + niveau.toLowerCase() + ' (score ' + score + '/100). ' + signaux.slice(0, 3).map(s => s.nom.toLowerCase() + ' (' + s.detail + ')').join(' ; ') + '. ' + recommandation;
  return { niveau, score, signaux: signaux.sort((a, b) => b.poids - a.poids), pauseMin, recommandation, phrase, fenetre: { trades: recents.length, depuis: maintenant - fenetreMs }, regles: R,
    note: 'Calculé sur les faits de ton journal, sans IA. Ce n’est pas un jugement sur toi : c’est un signal pour faire une pause.' };
}
