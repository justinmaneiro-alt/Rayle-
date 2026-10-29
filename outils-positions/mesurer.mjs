// Mesure les types de setup d'un actif sur la ZONE DE RECHERCHE (lecture seule). node outils-positions/mesurer.mjs BTC [nonOuvrirFinal]
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { dossierAgent } from '../agent-pc/etat-agent.mjs';
import { mesurerActif } from '../strategies/positions/preuves.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
const p = process.argv[2] || 'BTC';
const h = creerHistorique({ stockage: stockageFichier(path.join(dossierAgent(), 'donnees', p.toLowerCase())), lire: null }); await h.charger();
const t0 = Date.now(); const r = mesurerActif(h.serie(), p, { config: configMoteurDe(p), ouvrirJeuFinal: false });
console.log(p, 'ms', Date.now() - t0, 'zone mois', r.zone.mois.toFixed(1), 'essais', r.nVariantes, 'effectif', r.nEffectif);
for (const t of Object.values(r.types)) console.log(t.cle.padEnd(40), 'n', String(t.n).padStart(4), 'E', t.esperance == null ? '—' : t.esperance.toFixed(3), 'réussite', t.tauxReussite == null ? '—' : Math.round(t.tauxReussite * 100) + '%', 'RR', t.rrMoyen == null ? '—' : t.rrMoyen.toFixed(2), 'IC', t.fourchette ? t.fourchette.map(x => x.toFixed(2)).join('..') : '—', t.niveau);
console.log(r.profil.phrases.join('\n'));
