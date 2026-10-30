// Chargement des vraies bougies M15 de l'agent (lecture seule) pour le mode Trader : BTC, SOL, DOGE.
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { dossierAgent } from './etat-agent.mjs';
export async function chargerSerie(p, dossier = dossierAgent()) {
  const h = creerHistorique({ stockage: stockageFichier(path.join(dossier, 'donnees', p.toLowerCase())), lire: null }); await h.charger(); return h.serie();
}
