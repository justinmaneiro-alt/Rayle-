import { avancerRegle, ETAT_REGLE_VIDE, resumeCompte } from './direct-v3.js';
import { avancerRegleRiche, estRiche } from './direct-riche.js';
import { construireAlerte, filtrerAlertes, tropPermissive, controleCompte } from './alertes-v3.js';
import { detecterDerive, simulerProp } from './stats-v3.js';
import { CRITERES3 } from './criteres-v3.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';

/* ═════════════ SURVEILLANCE D'UNE RÈGLE : LE MÊME CODE POUR LE PC ET LE WORKER (module pur, testé via agent-worker-test.mjs et agent-service-test.mjs) ═════════════
   Entrées : la règle, la stratégie de l'état (nom, phase, validation), l'état de suivi de la règle, la série M15 (bougies fermées), les paramètres de risque et les alertes récentes.
   Sortie : le nouvel état de suivi, les alertes à envoyer (déjà filtrées : jamais de doublon, pas de spam, pas d'entrée si le moteur est trop permissif), les décisions (mise en pause pour dérive). */
export function surveillerRegle({ regle, s, suivi = null, serie, risque = {}, alertesRecentes = [], maintenant = Date.now(), ctx = null, config = null }) {
  const etat = suivi || ETAT_REGLE_VIDE(), cap = risque.capital || 10000, rk = risque.risquePct || 1;
  /* mêmes coûts par paire que le backtest (V6 : ceux de couts.json quand le service les donne ; les familles « riches » ont leur propre suivi, qui rejoue le simulateur riche) */
  const r = (estRiche(regle.famille) ? avancerRegleRiche : avancerRegle)({ regle, serie, etat, config: config || configMoteurDe(regle.paire), capital: cap, risquePct: rk, ctx });
  if (r.erreur) return { erreur: r.erreur, suivi: etat, alertes: [], evenements: [] };
  const strat = s || { id: regle.id, nom: regle.nom, paire: regle.paire, phase: regle.mode === 'REEL' ? 'active' : 'simulation' }, resume = resumeCompte(etat, { capital: cap, risquePct: rk }), candidates = [];
  for (const ev of r.evenements) {
    if (['ENTREE', 'PREPARATION', 'INVALIDATION', 'CLOTURE'].includes(ev.type)) candidates.push(construireAlerte(ev.type, { s: strat, ev, mode: regle.mode, resume }, maintenant));
  }
  const attendu = strat.validation && strat.validation.esperance, R = etat.trades.slice(-20).map(x => x.R);
  const dv = attendu != null ? detecterDerive(R, { attendu, sigma: Math.max(0.5, (strat.validation && strat.validation.sigma) || 1.5), seuil: CRITERES3.derive.cusumSeuil, tradesMin: CRITERES3.derive.tradesMin }) : { derive: false };
  if (dv.derive) candidates.push(construireAlerte('DEGRADATION', { s: strat, extra: { texte: 'CUSUM ' + dv.cusum.toFixed(1).replace('.', ',') + ' pour un seuil de ' + dv.seuil + '.' } }, maintenant));
  const sim = simulerProp(etat.trades, { risquePct: rk }), jour = etat.trades.filter(x => maintenant - x.tSortie < 86400e3).reduce((a, x) => a + x.R, 0) * rk;
  for (const c of controleCompte({ ddPct: sim.ddPct, pertejourPct: Math.max(0, -jour) })) candidates.push(construireAlerte('COMPTE_RISQUE', { extra: c }, maintenant));
  const tp = tropPermissive({ alertes: alertesRecentes }, regle.id, maintenant), gardees = filtrerAlertes({ alertes: alertesRecentes }, candidates, maintenant).filter(a => !(a.type === 'ENTREE' && tp.trop));
  return { suivi: etat, alertes: gardees, evenements: r.evenements, derive: !!dv.derive, cusum: dv.cusum || 0, tropPermissive: tp, resume, positionOuverte: !!etat.position, enAttente: !!etat.pendante };
}
