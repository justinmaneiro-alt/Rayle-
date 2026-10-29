// Essai à blanc des agents de positions sur les VRAIES bougies (lecture seule, rien n'est écrit dans l'état de l'agent). node outils-positions/essai-agents.mjs BTC
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { dossierAgent } from '../agent-pc/etat-agent.mjs';
import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { ORDRE_V7, FAMILLES_V7, parametresDefaut } from '../strategies/positions/agents.js';
import { simulerRiche } from '../strategies/simulateur-riche.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
const p = process.argv[2] || 'BTC';
const h = creerHistorique({ stockage: stockageFichier(path.join(dossierAgent(), 'donnees', p.toLowerCase())), lire: null }); await h.charger(); const s = h.serie();
console.log(p, s.n, 'bougies');
let t0 = Date.now(); const ctx = construireContexte(s); console.log('contexte', Date.now() - t0, 'ms');
for (const id of ORDRE_V7) {
  t0 = Date.now(); const sig = FAMILLES_V7[id].signaux(ctx, parametresDefaut(id)); let nSig = 0; for (let i = 0; i < ctx.n; i++) if (sig.sens[i]) nSig++;
  const sim = simulerRiche(ctx.m15, sig, configMoteurDe(p), {}); const R = sim.trades.map(x => x.R), moy = R.length ? R.reduce((a, b) => a + b, 0) / R.length : null;
  const types = {}; for (const tr of sim.trades) { const m = sig.meta.get(tr.signal); const k = m ? m.type : '?'; (types[k] = types[k] || []).push(tr.R); }
  console.log(id, 'signaux', nSig, 'trades', R.length, 'E', moy == null ? '—' : moy.toFixed(3), 'ms', Date.now() - t0, JSON.stringify(Object.fromEntries(Object.entries(types).map(([k, v]) => [k, v.length + ' E=' + (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)]))), JSON.stringify(sim.ordres));
}
