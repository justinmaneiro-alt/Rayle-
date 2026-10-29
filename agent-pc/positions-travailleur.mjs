// Travailleur des positions (worker_threads) : exécute UNE tâche lourde hors du service : mesure des types de setup d'un actif (zone de recherche), analyse d'un exemple de Justin, test d'une hypothèse sur d'autres données.
// Lit les bougies sur le disque (aucun réseau). Rend { ok, ... } sans jamais lire le jeu final sauf ouverture unique d'un type qui a tout réussi (voir strategies/positions/preuves.js).
import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { creerHistorique } from '../planetes/mars/pc/agent-btc/historique.js';
import { stockageFichier } from '../app-pc/veilleur/stockage-fichier.mjs';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { configRicheDe } from './couts-reglage.mjs';
import { mesurerActif, explorerGrille } from '../strategies/positions/preuves.js';
import { analyserExemple, hypotheseDepuisExemple, testerHypothese } from '../strategies/positions/exemples.js';

export async function chargerSerie(dossierDonnees, paire) {
  const h = creerHistorique({ stockage: stockageFichier(path.join(dossierDonnees, paire.toLowerCase())), lire: null }); await h.charger(); return h.serie();
}
/* Retire de la mesure ce qui est lourd et inutile à stocker (les listes de trades) ; garde tout le reste. */
export function compacter(res) {
  if (!res || !res.types) return res;
  const types = {}; for (const [k, t] of Object.entries(res.types)) { const { trades, ...reste } = t; types[k] = { ...reste, nTrades: trades ? trades.length : t.n }; }
  return { ...res, types };
}
const coutsDe = (paire, contexte) => (contexte.couts ? configRicheDe(paire, contexte.couts) : configMoteurDe(paire));

/* Exécute une tâche avec des séries déjà chargées (testable sans disque). `tache.type` : 'mesure' | 'exemple' | 'hypothese'. */
export function executerPositionsSync(tache, contexte, series) {
  if (tache.type === 'mesure') {
    const m15 = series[tache.actif]; if (!m15 || !m15.n) return { ok: false, raison: 'pas de données pour ' + tache.actif };
    const brut = mesurerActif(m15, tache.actif, { config: coutsDe(tache.actif, contexte), version: tache.version || 'equilibre', risquePct: tache.risquePct || 0.5, etatPreuves: tache.etatPreuves || {}, plancher: tache.plancher || 0, simulationsAuditeur: tache.simulations || 60, familles: tache.familles || undefined, parametres: tache.parametres || {} });
    return { ok: brut.ok !== false, resultat: compacter(brut) };
  }
  if (tache.type === 'grille') {
    const m15 = series[tache.actif]; if (!m15 || !m15.n) return { ok: false, raison: 'pas de données pour ' + tache.actif };
    const r = explorerGrille(m15, tache.actif, tache.famille, { config: coutsDe(tache.actif, contexte), etatPreuves: tache.etatPreuves || {} });
    return r.ok ? { ok: true, resultat: { ...r, lignes: r.lignes.map(l => ({ ...l, params: l.params })) } } : { ok: false, raison: r.raison };
  }
  if (tache.type === 'exemple') {
    const m15 = series[tache.exemple.actif]; if (!m15) return { ok: false, raison: 'pas de données pour ' + tache.exemple.actif };
    const analyse = analyserExemple(m15, tache.exemple, { reglages: tache.reglages || {} }), hyp = hypotheseDepuisExemple(tache.exemple, analyse, { maintenant: tache.maintenant || Date.now() });
    return { ok: true, analyse, hypothese: hyp };
  }
  if (tache.type === 'hypothese') {
    const jeux = (tache.actifs || Object.keys(series)).filter(a => series[a]).map(a => ({ actif: a, m15: series[a], exclure: (tache.hypothese.exclure || []).filter(e => e.actif === a).map(e => e.t) }));
    const config = coutsDe(jeux[0] ? jeux[0].actif : 'BTC', contexte);
    return { ok: true, resultat: testerHypothese(jeux, tache.hypothese, { config, variantesAvant: tache.variantesAvant || 0, risquePct: tache.risquePct || 0.5 }) };
  }
  return { ok: false, raison: 'tâche inconnue : ' + tache.type };
}

if (workerData && workerData.tache) {
  (async () => {
    try {
      const { tache, contexte } = workerData, actifs = (tache.type === 'mesure' || tache.type === 'grille') ? [tache.actif] : tache.type === 'exemple' ? [tache.exemple.actif] : (tache.actifs || ['BTC', 'SOL', 'DOGE']), series = {};
      for (const a of actifs) series[a] = await chargerSerie(contexte.dossierDonnees, a);
      parentPort.postMessage(executerPositionsSync(tache, contexte, series));
    } catch (e) { parentPort.postMessage({ ok: false, raison: String(e && e.message || e).slice(0, 200) }); }
  })();
}
