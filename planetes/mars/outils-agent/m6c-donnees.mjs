import path from 'node:path';
import { creerHistorique } from '../pc/agent-btc/historique.js';
import { sourceBinance } from '../pc/agent-m6/paires.js';
import { DOSSIER_CACHE, stockageFichiers, lireReseau } from '../tests/aide-btc.mjs';

/* Historique RÉEL M15 d'une paire (BTC, SOL, DOGE) pour les mesures M6c : cache local (dossiers ignorés par git), complété par Binance.
   BTC réutilise donnees-btc-cache ; SOL et DOGE ont leur dossier à côté. `maintenant` peut être figé pour une mesure reproductible. */
export const dossierPaire = paire => (paire === 'BTC' ? DOSSIER_CACHE : DOSSIER_CACHE.replace('donnees-btc-cache', 'donnees-' + paire.toLowerCase() + '-cache'));
export async function historiquePaire(paire, { annees = 10, maintenant = () => Date.now(), surProgres = () => {} } = {}) {
  const h = creerHistorique({ stockage: stockageFichiers(dossierPaire(paire)), lire: lireReseau, annees, maintenant, ...(paire === 'BTC' ? {} : { sources: { binance: sourceBinance(paire) }, ordre: ['binance'] }) });
  const etat = await h.synchroniser({ surProgres });
  return { serie: h.serie(), etat, historique: h };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\//, ''))) {
  for (const p of (process.argv[2] || 'BTC,SOL,DOGE').split(',')) {
    const t = Date.now(), { serie, etat } = await historiquePaire(p);
    console.log(p, serie.n, 'bougies', (etat.annees || 0).toFixed(2), 'ans', 'trous', (etat.lacunes || []).length, Math.round((Date.now() - t) / 1000) + ' s');
  }
}
