import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { dossierAgent } from '../agent-pc/etat-agent.mjs';
import { analyserExemple, hypotheseDepuisExemple, testerHypothese } from '../strategies/positions/exemples.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
const h = creerHistorique({ stockage: stockageFichier(path.join(dossierAgent(), 'donnees', 'btc')), lire: null }); await h.charger(); const s = h.serie();
const i = 150000, ex = { actif: 'BTC', sens: 'achat', avis: 'bon', t: s.t[i], entree: s.c[i], stop: s.c[i] * 0.995, cible: s.c[i] * 1.012, tf: 'M15' };
const a = analyserExemple(s, ex); console.log(a.statut, a.pourquoi); const hy = hypotheseDepuisExemple(ex, a); console.log(hy && hy.titre);
if (hy) { const t0 = Date.now(); console.log(JSON.stringify(testerHypothese([{ actif: 'BTC', m15: s, exclure: [ex.t] }], hy, { config: configMoteurDe('BTC') })), Date.now() - t0, 'ms'); }
