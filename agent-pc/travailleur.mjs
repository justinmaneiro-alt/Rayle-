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
import { chargerCompact } from './flux/compact-flux.mjs';
import { ACTIFS_HIST } from './flux/historique-trades.mjs';
import { attacherEmpreinte } from '../strategies/liquidite/contexte-flux.js';
import { EXIGENCES_V4 } from '../strategies/familles-v4.js';
import { auditer } from '../strategies/equipe/auditeur.js';
import { enregistrerHypothese } from '../strategies/equipe/chercheur.js';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';

export async function chargerSerie(dossierDonnees, paire) {
  const h = creerHistorique({ stockage: stockageFichier(path.join(dossierDonnees, paire.toLowerCase())), lire: null }); await h.charger(); return h.serie();
}
/* Exécute une tâche avec des séries fournies (testable sans disque). `series` = { BTC: m15, SOL: m15, … }. */
export function executerTacheSync(tache, contexte, series, compacts = {}) {
  if (tache.hypothese) enregistrerHypothese(tache.hypothese);                                         // V4 : une hypothèse du Chercheur devient une petite famille testable dans ce processus
  const m15 = series[tache.paire]; if (!m15 || !m15.n) return { resumes: [{ famille: tache.famille, paire: tache.paire, type: tache.type, statut: 'insuffisant', raison: 'pas de données pour ' + tache.paire, t: Date.now() }] };
  const autres = Object.keys(series).filter(p => p !== tache.paire && series[p] && series[p].n).map(p => ({ nom: p, m15: series[p] }));
  const config = configMoteurDe(tache.paire), debutFinal = tache.debutFinal, resumes = [];
  // V4 : les familles qui exigent l'empreinte (aggTrades) reçoivent le résumé de l'historique des transactions ; sans lui, aucun signal (jamais de valeur inventée)
  const avecEmpreinte = (EXIGENCES_V4[tache.famille] || []).includes('empreinte'), preparer = avecEmpreinte ? ctx => attacherEmpreinte(ctx, compacts[tache.paire] || null) : null, preparerAutre = avecEmpreinte ? (ctx, nom) => attacherEmpreinte(ctx, compacts[nom] || null) : null;
  let r = validerV3(m15, tache.famille, { config, variantesAvant: contexte.variantesAvant || 0, autres, debutFinal, grille: tache.type === 'exploration' ? null : tache.grille, preparer, preparerAutre });
  resumes.push(resumerValidation(r, tache));
  let retenu = r;
  if (tache.type === 'exploration' && prometteur(r)) {                                                // raffinement : seulement autour d'un résultat prometteur ET stable
    const grille = grilleRaffinee(tache.famille, r.retenus), t2 = { ...tache, type: 'raffinement', grille };
    const r2 = validerV3(m15, tache.famille, { config, variantesAvant: (contexte.variantesAvant || 0) + (r.variantesDeCetteEvaluation || 0), autres, debutFinal, grille, preparer, preparerAutre });
    resumes.push(resumerValidation(r2, t2)); retenu = r2.statut === 'validee_backtest' ? r2 : r;
    if (r2.statut === 'validee_backtest') tache = t2;
  }
  if (retenu.statut === 'validee_backtest') {
    // V4 : l'AUDITEUR essaie de casser la candidate AVANT l'ouverture du jeu final (qui ne peut servir qu'une fois) ; rien n'est validé sans son rapport écrit
    const dernier = resumes[resumes.length - 1]; let idx = 0; while (idx < m15.n && m15.t[idx] < debutFinal) idx++;
    const aud = auditer({ id: tache.famille, params: retenu.retenus, paire: tache.paire, nom: dernier.nom }, tranche(m15, 0, idx), { config, preparer, resultatValidation: retenu });
    dernier.auditeur = { ok: aud.ok, t: aud.t, resume: aud.resume, tests: aud.tests.map(t => ({ nom: t.nom, ok: t.ok, valeur: t.valeur, seuil: t.seuil })), rapport: aud.rapport, candidate: aud.candidate };
    if (!aud.ok) { dernier.statut = 'rejetee_auditeur'; dernier.ratees = [...(dernier.ratees || []), 'Auditeur : ' + aud.tests.filter(t => !t.ok).map(t => t.nom).join(' ; ')]; }
    else {                                                                                              // jeu final : UNE seule ouverture, paramètres figés
      const jf = ouvrirJeuFinalV3(m15, retenu.retenus, tache.famille, { debutFinal, rang: (contexte.ouverturesParPaire || {})[tache.paire] + 1 || 1, config, preparer });
      dernier.jeuFinal = { ...jf, lignes: (jf.lignes || []).map(l => ({ critere: l.critere, valeur: l.valeur, seuil: l.seuil, ok: l.ok })) };
    }
  }
  return { resumes };
}
if (workerData && workerData.tache) {
  const { tache, contexte } = workerData;
  (async () => {
    const series = {}; for (const p of contexte.paires) series[p] = await chargerSerie(contexte.dossierDonnees, p).catch(() => null);
    const compacts = {}; if ((EXIGENCES_V4[tache.famille] || []).includes('empreinte')) for (const p of contexte.paires) { try { compacts[p] = chargerCompact(path.dirname(contexte.dossierDonnees), 'spot', ACTIFS_HIST[p]); } catch (e) { compacts[p] = null; } }
    parentPort.postMessage(executerTacheSync(tache, contexte, series, compacts));
  })().catch(e => { parentPort.postMessage({ resumes: [{ famille: tache.famille, paire: tache.paire, type: tache.type, statut: 'erreur', raison: String(e && e.message || e).slice(0, 200), t: Date.now() }] }); });
}
