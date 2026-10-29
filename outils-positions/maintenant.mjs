// Propositions du moment sur les vraies bougies (lecture seule). node outils-positions/maintenant.mjs BTC [idees]
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { dossierAgent } from '../agent-pc/etat-agent.mjs';
import { proposerPourActif } from '../strategies/positions/moteur.js';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
const p = process.argv[2] || 'BTC', idees = process.argv[3] === 'idees', recul = +(process.argv[4] || 0);
const h = creerHistorique({ stockage: stockageFichier(path.join(dossierAgent(), 'donnees', p.toLowerCase())), lire: null }); await h.charger(); let s = h.serie(); if (recul) s = tranche(s, 0, s.n - recul);
const t0 = Date.now(); const r = proposerPourActif(tranche(s, Math.max(0, s.n - 30000), s.n), p, { reglages: { afficherIdees: idees } }); console.log('ms', Date.now() - t0, 'prix', r.prix, new Date(r.t).toISOString());
for (const x of r.propositions) console.log(x.achat ? 'ACHAT' : 'VENTE', x.famille, x.type, 'limite', x.limite.toFixed(2), 'stop', x.stop.toFixed(2), 'cible', x.cible.toFixed(2), 'rr', x.rr.toFixed(2), x.statut, x.preuve.niveau, '\n   ', x.raison);
console.log('écartées', r.ecartees.length, 'hypothèse', r.hypothese && (r.hypothese.type + ' — ' + r.hypothese.pourquoi + ' / ' + r.hypothese.quand)); console.log('diamant', JSON.stringify(r.zonesDiamant));
