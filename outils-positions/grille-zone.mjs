// Parcourt la petite grille d'une famille sur la zone de recherche (75 % premiers) pour un actif. node outils-positions/grille-zone.mjs BTC rebond_h1
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { dossierAgent } from '../agent-pc/etat-agent.mjs';
import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { combinaisons } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { FAMILLES_V7 } from '../strategies/positions/agents.js';
import { simulerRiche } from '../strategies/simulateur-riche.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
const [, , p = 'BTC', id = 'rebond_h1'] = process.argv;
const h = creerHistorique({ stockage: stockageFichier(path.join(dossierAgent(), 'donnees', p.toLowerCase())), lire: null }); await h.charger(); const full = h.serie();
const s = tranche(full, 0, Math.floor(full.n * 0.75)); const ctx = construireContexte(s);
for (const params of combinaisons(FAMILLES_V7[id].grille())) {
  const sig = FAMILLES_V7[id].signaux(ctx, params), sim = simulerRiche(ctx.m15, sig, configMoteurDe(p), {}), R = sim.trades.map(x => x.R);
  console.log(JSON.stringify(params).padEnd(60), String(R.length).padStart(5), (R.reduce((a, b) => a + b, 0) / (R.length || 1)).toFixed(3));
}
