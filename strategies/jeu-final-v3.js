import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { evaluerVariante, jugerJeuFinal } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { CRITERES3 } from './criteres-v3.js';
import { intervalleBootstrap, simulerProp } from './stats-v3.js';

/* ═════════════ JEU FINAL DE LA V3 (module pur, testé : galaxie/tests/strategies-v3-test.mjs) ═════════════
   Le jeu final = tout ce qui suit `debutFinal` (fixé au premier jour et gardé dans le « coffre » de l'agent). Il n'est ouvert QU'UNE FOIS par stratégie, avec les paramètres figés. Il est partagé par
   plusieurs candidates : la k-ième ouverture sur une paire exige un niveau de confiance plus haut (1 − 0,05 / k) ; au plus 5 ouvertures par paire. Une stratégie recalée ici ne revient jamais. */
export function ouvrirJeuFinalV3(m15, params, id, { debutFinal, rang = 1, config = {}, c3 = CRITERES3, preparer = null } = {}) {
  const n = m15.n; let idx = 0; while (idx < n && m15.t[idx] < debutFinal) idx++;
  const mois = n > idx ? (m15.t[n - 1] + 900e3 - m15.t[idx]) / (30.4375 * 86400e3) : 0;
  if (mois < c3.jeuFinal.moisMin) return { ok: false, statut: 'attente', raison: 'Jeu final de ' + mois.toFixed(1).replace('.', ',') + ' mois : il en faut au moins ' + c3.jeuFinal.moisMin + ' (on attend de nouvelles données).', rang, ouvert: false };
  if (rang > c3.jeuFinal.ouverturesMax) return { ok: false, statut: 'attente', raison: 'Le jeu final a déjà servi ' + c3.jeuFinal.ouverturesMax + ' fois sur cette paire : il faut des données fraîches avant une nouvelle ouverture.', rang, ouvert: false };
  const ctxF = construireContexte(m15); if (preparer) preparer(ctxF);
  const e = evaluerVariante(ctxF, id, params, config, { de: idx, a: n }), R = e.trades.map(x => x.R);
  const juge = jugerJeuFinal(e.stats), niveau = c3.jeuFinal.bonferroni ? 1 - (1 - c3.jeuFinal.niveauBase) / rang : c3.jeuFinal.niveauBase;
  const boot = intervalleBootstrap(R, { tirages: c3.bootstrap.tirages, niveau, graine: c3.bootstrap.graine }), prop = simulerProp(e.trades, c3.prop);
  const lignes = [...juge.lignes, { critere: 'Intervalle de confiance (bootstrap) à ' + (niveau * 100).toFixed(1).replace('.', ',') + ' % : borne basse', valeur: boot.bas, seuil: '> 0', ok: boot.bas != null && boot.bas > 0, unite: ' R' },
    { critere: 'Compte prop : creux maximal', valeur: prop.ddPct, seuil: '≤ ' + c3.prop.drawdownMaxPct, ok: prop.ddPct <= c3.prop.drawdownMaxPct, unite: ' %' }, { critere: 'Compte prop : pire journée', valeur: prop.pireJourPct, seuil: '≤ ' + c3.prop.perteJourMaxPct, ok: prop.pireJourPct <= c3.prop.perteJourMaxPct, unite: ' %' }];
  const ok = lignes.every(l => l.ok);
  return { ok, statut: ok ? 'reussi' : 'echoue', ouvert: true, rang, lignes, stats: { n: e.stats.n, esperance: e.stats.esperance, factProfit: e.stats.factProfit, ddR: e.stats.ddR, parSemaine: e.stats.parSemaine, Rtotal: e.stats.Rtotal }, bootstrap: boot, prop, mois, debutFinal };
}
