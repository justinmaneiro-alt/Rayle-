// Travailleur de recherche (worker_threads) : exécute UNE tâche (famille × paire) : validation V3 sur la zone de recherche, raffinement éventuel, puis jeu final (une seule ouverture) si la stratégie est
// validée en backtest. Lit les bougies sur le disque (aucun réseau). Rend { resumes: [...] }.
import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { validerV3 } from '../strategies/validation-v3.js';
import { ouvrirJeuFinalV3 } from '../strategies/jeu-final-v3.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { grilleRaffinee, prometteur, resumerValidation } from './recherche.mjs';

export async function chargerSerie(dossierDonnees, paire) {
  const h = creerHistorique({ stockage: stockageFichier(path.join(dossierDonnees, paire.toLowerCase())), lire: null }); await h.charger(); return h.serie();
}
/* Exécute une tâche avec des séries fournies (testable sans disque). `series` = { BTC: m15, SOL: m15, … }. */
export function executerTacheSync(tache, contexte, series) {
  const m15 = series[tache.paire]; if (!m15 || !m15.n) return { resumes: [{ famille: tache.famille, paire: tache.paire, type: tache.type, statut: 'insuffisant', raison: 'pas de données pour ' + tache.paire, t: Date.now() }] };
  const autres = Object.keys(series).filter(p => p !== tache.paire && series[p] && series[p].n).map(p => ({ nom: p, m15: series[p] }));
  const config = configMoteurDe(tache.paire), debutFinal = tache.debutFinal, resumes = [];
  let r = validerV3(m15, tache.famille, { config, variantesAvant: contexte.variantesAvant || 0, autres, debutFinal, grille: tache.type === 'exploration' ? null : tache.grille });
  resumes.push(resumerValidation(r, tache));
  let retenu = r;
  if (tache.type === 'exploration' && prometteur(r)) {                                                // raffinement : seulement autour d'un résultat prometteur ET stable
    const grille = grilleRaffinee(tache.famille, r.retenus), t2 = { ...tache, type: 'raffinement', grille };
    const r2 = validerV3(m15, tache.famille, { config, variantesAvant: (contexte.variantesAvant || 0) + (r.variantesDeCetteEvaluation || 0), autres, debutFinal, grille });
    resumes.push(resumerValidation(r2, t2)); retenu = r2.statut === 'validee_backtest' ? r2 : r;
    if (r2.statut === 'validee_backtest') tache = t2;
  }
  if (retenu.statut === 'validee_backtest') {                                                         // jeu final : UNE seule ouverture, paramètres figés
    const jf = ouvrirJeuFinalV3(m15, retenu.retenus, tache.famille, { debutFinal, rang: (contexte.ouverturesParPaire || {})[tache.paire] + 1 || 1, config });
    const dernier = resumes[resumes.length - 1]; dernier.jeuFinal = { ...jf, lignes: (jf.lignes || []).map(l => ({ critere: l.critere, valeur: l.valeur, seuil: l.seuil, ok: l.ok })) };
  }
  return { resumes };
}
if (workerData && workerData.tache) {
  const { tache, contexte } = workerData;
  (async () => {
    const series = {}; for (const p of contexte.paires) series[p] = await chargerSerie(contexte.dossierDonnees, p).catch(() => null);
    parentPort.postMessage(executerTacheSync(tache, contexte, series));
  })().catch(e => { parentPort.postMessage({ resumes: [{ famille: tache.famille, paire: tache.paire, type: tache.type, statut: 'erreur', raison: String(e && e.message || e).slice(0, 200), t: Date.now() }] }); });
}
