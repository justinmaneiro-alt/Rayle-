// Moteur de recherche PERMANENT de l'agent (service PC) : génère des variantes de façon CONTRÔLÉE (six familles simples × trois actifs, grilles raisonnables), les évalue avec la validation V3
// (strategies/validation-v3.js, critères écrits avant, jamais assouplis), garde un CACHE par empreinte (rien n'est calculé deux fois), répartit le travail sur les cœurs (worker_threads) avec un mode
// économe, et s'arrête quand Justin joue. Exploration d'abord (grille grossière), RAFFINEMENT ensuite seulement autour d'un résultat prometteur ET stable (jamais autour d'un pic isolé).
// Priorité : variantes simples avant variantes compliquées (plus petite grille d'abord). Le jeu final n'est ouvert qu'UNE fois par stratégie validée (coffre dans l'état de l'agent).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { ORDRE_V3, famille, tailleGrille, NOMS_V3 } from '../strategies/familles-v3.js';
import { CRITERES3, empreinteV3 } from '../strategies/criteres-v3.js';
import { combinaisons } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { journaliser } from '../strategies/agent-etat.js';
import { fichiersAgent, lireJson, ecrireJson } from './etat-agent.mjs';

export const CHARGES = Object.freeze({ faible: 1, normal: 2, fort: Math.max(3, Math.floor(os.cpus().length / 2)) });
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
export const grilleDe = id => famille(id).grille(0);
/* Ordre de recherche : les familles les plus simples (plus petite grille) d'abord ; à égalité, l'ordre de la bibliothèque. */
export const ORDRE_SIMPLICITE = Object.freeze([...ORDRE_V3].sort((a, b) => tailleGrille(a) - tailleGrille(b) || ORDRE_V3.indexOf(a) - ORDRE_V3.indexOf(b)));

/* Grille RAFFINÉE autour de paramètres retenus : pour chaque paramètre, la valeur retenue et les milieux avec ses deux voisins de la grille d'origine. Au plus 300 variantes (sinon : on réduit). */
export function grilleRaffinee(id, retenus, plafond = 300) {
  const base = grilleDe(id), g = {};
  for (const k of Object.keys(base)) {
    const vals = base[k], i = vals.indexOf(retenus[k]); if (i < 0 || typeof vals[i] !== 'number') { g[k] = [retenus[k]]; continue; }
    const c = new Set([vals[i]]); if (i > 0) c.add(+((vals[i - 1] + vals[i]) / 2).toFixed(4)); if (i < vals.length - 1) c.add(+((vals[i] + vals[i + 1]) / 2).toFixed(4));
    g[k] = [...c].sort((a, b) => a - b);
  }
  let n = Object.values(g).reduce((a, v) => a * v.length, 1);
  for (const k of Object.keys(g)) { if (n <= plafond) break; if (g[k].length > 1) { n /= g[k].length; g[k] = [retenus[k]]; } }   // on fige les derniers paramètres plutôt que de dépasser le plafond
  return g;
}
export const empreinteTache = ({ famille: f, paire, grille, debutFinal, finDonnees, type }) => hash([f, paire, type || 'exploration', JSON.stringify(grille), debutFinal, finDonnees, empreinteV3()].join('|'));

/* Liste des tâches à faire (exploration), cache déjà retiré. `finDonnees` = jour (AAAA-MM-JJ) de la dernière bougie : un nouveau jour = de nouveaux calculs (les données ont changé). */
export function planifier(etat, { paires, finDonnees, debutFinal, cache }) {
  const taches = [];
  for (const f of ORDRE_SIMPLICITE) for (const p of paires) {
    const grille = grilleDe(f), emp = empreinteTache({ famille: f, paire: p, grille, debutFinal: debutFinal[p], finDonnees: finDonnees[p], type: 'exploration' });
    if (cache.has(emp)) continue;
    taches.push({ type: 'exploration', famille: f, paire: p, grille, empreinte: emp, debutFinal: debutFinal[p], taille: tailleGrille(f) });
  }
  return taches;
}
export const lireCache = (dossierCache, emp) => lireJson(path.join(dossierCache, emp + '.json'), null);
export const ecrireCache = (dossierCache, emp, v) => ecrireJson(path.join(dossierCache, emp + '.json'), v);

/* Résumé court d'un résultat de validation (ce qui est gardé dans l'état et envoyé au Worker : jamais les listes de trades). */
export function resumerValidation(r, tache) {
  const base = { id: tache.famille + ':' + tache.paire + ':' + tache.type, famille: tache.famille, nom: NOMS_V3[tache.famille], paire: tache.paire, type: tache.type, statut: r.statut, t: Date.now(), empreinteCriteres: r.criteres, jeuFinalOuvert: !!r.jeuFinal && r.jeuFinal.ouvert === true };
  if (!r.ok || !r.lignes) return { ...base, raison: r.raison || null };
  const st = r.wf.stats;
  return { ...base, retenus: r.retenus, nVariantes: r.nVariantes, variantesCetteEvaluation: r.variantesDeCetteEvaluation, trades: st.n, esperance: st.esperance, tauxReussite: st.tauxReussite, factProfit: st.factProfit, ddR: st.ddR, parSemaine: st.parSemaine,
    bootstrapBas: r.bootstrap.bas, dsr: r.dsr && r.dsr.dsr, propDdPct: r.prop.ddPct, propJourPct: r.prop.pireJourPct, ratees: r.ratees, actifs: r.actifs, regimes: r.regimes, zone: r.zoneRecherche, jeuFinal: r.jeuFinal || null };
}
/* Le résultat est-il « prometteur et stable » (donc digne d'un raffinement) ? Jamais un pic isolé : voisins majoritairement positifs. */
export function prometteur(r) {
  if (!r || r.statut !== 'non_validee' || !r.wf) return false;
  const lig = r.lignes || [], voisins = lig.find(l => /Voisins des paramètres positifs/.test(l.critere));
  return r.wf.stats.esperance > 0.1 && r.wf.stats.n >= 60 && !!voisins && voisins.ok && !(r.ratees || []).some(x => /Causalité/.test(x));
}

/* Pool de travailleurs : exécute des tâches avec `n` threads. `executer(tache)` côté travailleur = ./travailleur.mjs. */
export function executerTache(tache, contexte) {
  return new Promise((ok, ko) => {
    const w = new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)), 'travailleur.mjs'), { workerData: { tache, contexte } });
    let fini = false; const clore = (f, v) => { if (!fini) { fini = true; f(v); } };
    w.on('message', m => clore(ok, m)); w.on('error', e => clore(ko, e)); w.on('exit', c => { if (c !== 0) clore(ko, new Error('travailleur arrêté (code ' + c + ')')); else clore(ko, new Error('travailleur sans réponse')); });
    tache.__terminer = () => w.terminate();
  });
}

/* Intègre un résultat dans l'état : backtest résumé, compteur de variantes (jamais en baisse), journal ; rend les candidates VALIDÉES (backtest + jeu final réussi). */
export function integrerResultat(etat, resume, tache, maintenant = Date.now()) {
  etat.backtests.push(resume); if (etat.backtests.length > 400) etat.backtests.splice(0, etat.backtests.length - 400);
  if (!resume.fromCache) etat.compteurVariantes[tache.paire] = (etat.compteurVariantes[tache.paire] || 0) + (resume.variantesCetteEvaluation || 0);
  const jf = resume.jeuFinal;
  if (resume.statut === 'validee_backtest' && jf && jf.ouvert) {
    const coffre = (etat.coffre = etat.coffre || {})[tache.paire] = etat.coffre[tache.paire] || { debutFinal: tache.debutFinal, ouvertures: [] };
    coffre.ouvertures.push({ famille: tache.famille, params: resume.retenus, t: maintenant, resultat: jf.statut, rang: jf.rang });
    if (jf.ok) { journaliser(etat, 'validation', NOMS_V3[tache.famille] + ' ' + tache.paire + ' : validée en backtest ET sur le jeu final (ouvert une seule fois).', maintenant); return [{ famille: tache.famille, paire: tache.paire, params: resume.retenus, validation: { statut: 'validee_backtest', jeuFinal: jf.statut, esperance: resume.esperance, trades: resume.trades, criteres: empreinteV3(), t: maintenant } }]; }
    journaliser(etat, 'rejet', NOMS_V3[tache.famille] + ' ' + tache.paire + ' : validée en backtest mais RECALÉE sur le jeu final (ne revient jamais).', maintenant);
  } else if (resume.statut === 'rejetee_causalite') journaliser(etat, 'rejet', NOMS_V3[tache.famille] + ' ' + tache.paire + ' : REJETÉE, elle regarde le futur.', maintenant);
  else journaliser(etat, 'essai', NOMS_V3[tache.famille] + ' ' + tache.paire + ' (' + tache.type + ') : ' + ({ non_validee: 'non validée (' + (resume.ratees || []).length + ' critères ratés)', insuffisant: 'historique insuffisant', validee_backtest: 'validée en backtest (jeu final en attente)' }[resume.statut] || resume.statut), maintenant);
  return [];
}
export { combinaisons, CRITERES3 };
