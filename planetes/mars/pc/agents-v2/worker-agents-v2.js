import { backtester, validerAgent } from './validation-agent.js';
import { lireMarcheV2 } from './lecture-marche-v2.js';

/* Worker de navigateur des agents prêts à l'emploi : le backtest et la validation walk-forward (plusieurs secondes sur des années de bougies M15) tournent ici, pas dans l'interface.
   Messages : { id, type: 'backtest' | 'valider' | 'lire', serie (colonnes M15), agent, params, config, variantes } → { id, type: 'resultat', r } ou { id, type: 'erreur', message }. Aucun accès au réseau. */
self.onmessage = e => {
  const m = e.data || {};
  try {
    let r;
    if (m.type === 'backtest') r = backtester(m.serie, m.agent, m.params, { config: m.config });
    else if (m.type === 'valider') r = validerAgent(m.serie, m.agent, { config: m.config, variantesDejaTestees: m.variantes || 0 });
    else if (m.type === 'lire') r = lireMarcheV2(m.bougies, m.options || {});
    else throw new Error('message inconnu : ' + m.type);
    self.postMessage({ id: m.id, type: 'resultat', r });
  } catch (err) { self.postMessage({ id: m.id, type: 'erreur', message: String(err && err.message || err) }); }
};
