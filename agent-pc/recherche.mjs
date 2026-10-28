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
import { ORDRE_V4, NOMS_V4 } from '../strategies/familles-v4.js';
import { CRITERES3, empreinteV3 } from '../strategies/criteres-v3.js';
import { combinaisons } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { journaliser } from '../strategies/agent-etat.js';
import { fichiersAgent, lireJson, ecrireJson } from './etat-agent.mjs';

export const CHARGES = Object.freeze({ faible: 1, normal: 2, fort: Math.max(3, Math.floor(os.cpus().length / 2)) });
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
/* Grille d'une famille à la génération `gen` : 0 = grille de base ; 1 à 3 = élargie vers l'extérieur (valeurs numériques au-delà des extrémités, +25 % par génération), toujours petite et bornée.
   La recherche épuise l'espace défini (jamais de grille infinie) puis attend de nouvelles données ou de nouvelles idées. */
export const GENERATIONS_MAX = 2;
export function grilleDe(id, gen = 0) {
  const base = famille(id).grille(0); if (!gen) return base;
  const cles = Object.keys(base).filter(k => base[k].every(x => typeof x === 'number') && base[k].length > 1), choisies = new Set();
  for (let g = 1; g <= gen; g++) for (let q = 0; q < 2; q++) choisies.add(cles[(2 * (g - 1) + q) % Math.max(1, cles.length)]);   // 2 paramètres élargis par génération : la grille reste petite
  const out = {};
  for (const k of Object.keys(base)) {
    const v = base[k]; if (!choisies.has(k)) { out[k] = v; continue; }
    const ent = v.every(x => Number.isInteger(x)), f = 1.25, bas = Math.min(...v), haut = Math.max(...v), arr = new Set(v), b2 = bas / f, h2 = haut * f;
    arr.add(ent ? Math.round(b2) : +b2.toFixed(3)); arr.add(ent ? Math.round(h2) : +h2.toFixed(3));
    out[k] = [...arr].filter(x => x > 0).sort((a, b) => a - b);
  }
  return out;
}
export const tailleGrilleGen = (id, gen) => Object.values(grilleDe(id, gen)).reduce((a, v) => a * v.length, 1);
export const cleVariante = (f, paire, p) => f + ':' + paire + ':' + Object.keys(p).sort().map(k => k + '=' + p[k]).join(',');
/* Ordre de recherche : les familles les plus simples (plus petite grille) d'abord ; à égalité, l'ordre de la bibliothèque. */
export const ORDRE_TOUT = Object.freeze([...ORDRE_V3, ...ORDRE_V4]), NOMS_TOUT = Object.freeze({ ...NOMS_V3, ...NOMS_V4 });
export const ORDRE_SIMPLICITE = Object.freeze([...ORDRE_TOUT].sort((a, b) => tailleGrille(a) - tailleGrille(b) || ORDRE_TOUT.indexOf(a) - ORDRE_TOUT.indexOf(b)));
export const ORDRE_SIMPLICITE_GEN = gen => [...ORDRE_TOUT].sort((a, b) => tailleGrilleGen(a, gen) - tailleGrilleGen(b, gen) || ORDRE_TOUT.indexOf(a) - ORDRE_TOUT.indexOf(b));

/* Grille RAFFINÉE autour de paramètres retenus : pour chaque paramètre, la valeur retenue et les milieux avec ses deux voisins de la grille d'origine. Au plus 300 variantes (sinon : on réduit). */
export function grilleRaffinee(id, retenus, plafond = 300) {
  const base = grilleDe(id, 0), g = {};
  for (const k of Object.keys(base)) {
    const vals = base[k], i = vals.indexOf(retenus[k]); if (i < 0 || typeof vals[i] !== 'number') { g[k] = [retenus[k]]; continue; }
    const c = new Set([vals[i]]); if (i > 0) c.add(+((vals[i - 1] + vals[i]) / 2).toFixed(4)); if (i < vals.length - 1) c.add(+((vals[i] + vals[i + 1]) / 2).toFixed(4));
    g[k] = [...c].sort((a, b) => a - b);
  }
  let n = Object.values(g).reduce((a, v) => a * v.length, 1);
  for (const k of Object.keys(g)) { if (n <= plafond) break; if (g[k].length > 1) { n /= g[k].length; g[k] = [retenus[k]]; } }   // on fige les derniers paramètres plutôt que de dépasser le plafond
  return g;
}
export const VERSION_PIPELINE = 'p4';   // V4 : purge du walk-forward (trade à cheval sur la coupe) ; change l'empreinte, donc les anciens résultats sont refaits (le compteur de variantes ne baisse jamais)
export const empreinteTache = ({ famille: f, paire, grille, debutFinal, type }) => hash([f, paire, type || 'exploration', JSON.stringify(grille), debutFinal, empreinteV3(), VERSION_PIPELINE].join('|'));   // la zone de recherche est FIXE (coffre) : de nouvelles bougies ne changent pas le résultat

/* Liste des tâches à faire, cache déjà retiré. Génération 0 pour toutes les familles et tous les actifs d'abord, puis la génération 1, etc. */
export function planifier(etat, { paires, debutFinal, cache, generations = GENERATIONS_MAX }) {
  const taches = [];
  for (let gen = 0; gen <= generations; gen++) for (const f of ORDRE_SIMPLICITE_GEN(gen)) for (const p of paires) {
    if (!debutFinal[p]) continue;
    const grille = grilleDe(f, gen), emp = empreinteTache({ famille: f, paire: p, grille, debutFinal: debutFinal[p], type: 'exploration' });
    if (cache.has(emp)) continue;
    taches.push({ type: 'exploration', gen, famille: f, paire: p, grille, empreinte: emp, debutFinal: debutFinal[p], taille: tailleGrilleGen(f, gen) });
  }
  return taches;
}
export const lireCache = (dossierCache, emp) => lireJson(path.join(dossierCache, emp + '.json'), null);
export const ecrireCache = (dossierCache, emp, v) => ecrireJson(path.join(dossierCache, emp + '.json'), v);

/* Courbe des R cumulés hors échantillon, réduite à ≤ 200 points (pour l'écran : jamais la liste des trades). */
export function courbeReduite(c, max = 200) { if (!Array.isArray(c) || c.length < 2) return null; const pas = Math.max(1, (c.length - 1) / (max - 1)), out = []; for (let i = 0; i < c.length - 1; i += pas) out.push(+c[Math.round(i)].toFixed(2)); out.push(+c[c.length - 1].toFixed(2)); return out; }
/* Résumé court d'un résultat de validation (ce qui est gardé dans l'état et envoyé au Worker : jamais les listes de trades). */
export function resumerValidation(r, tache) {
  const base = { id: tache.famille + ':' + tache.paire + ':' + tache.type, famille: tache.famille, nom: NOMS_TOUT[tache.famille], paire: tache.paire, type: tache.type, statut: r.statut, t: Date.now(), empreinteCriteres: r.criteres, jeuFinalOuvert: !!r.jeuFinal && r.jeuFinal.ouvert === true };
  if (!r.ok || !r.lignes) return { ...base, grille: tache.grille, raison: r.raison || null };
  const st = r.wf.stats;
  return { ...base, grille: tache.grille, gen: tache.gen || 0, retenus: r.retenus, nVariantes: r.nVariantes, variantesCetteEvaluation: r.variantesDeCetteEvaluation, trades: st.n, esperance: st.esperance, tauxReussite: st.tauxReussite, factProfit: st.factProfit, ddR: st.ddR, parSemaine: st.parSemaine,
    bootstrapBas: r.bootstrap.bas, dsr: r.dsr && r.dsr.dsr, propDdPct: r.prop.ddPct, propJourPct: r.prop.pireJourPct, ratees: r.ratees, actifs: r.actifs, regimes: r.regimes, zone: r.zoneRecherche, couvertureFlux: r.couvertureFlux || null, courbeR: courbeReduite(r.wf.stats.courbeR), jeuFinal: r.jeuFinal || null };
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
  // le compteur ne compte une variante QU'UNE FOIS dans toute l'histoire de l'agent (rejouer le même test ne le fait pas monter) et ne baisse jamais
  const vues = (etat.variantesVues = etat.variantesVues || {}); let nouvelles = 0;
  if (resume.grille) for (const p of combinaisons(resume.grille)) { const k = cleVariante(resume.famille, resume.paire, p); if (!vues[k]) { vues[k] = 1; nouvelles++; } }
  etat.compteurVariantes[tache.paire] = (etat.compteurVariantes[tache.paire] || 0) + nouvelles; resume.variantesNouvelles = nouvelles;
  const jf = resume.jeuFinal;
  if (resume.statut === 'validee_backtest' && jf && jf.ouvert) {
    const coffre = (etat.coffre = etat.coffre || {})[tache.paire] = etat.coffre[tache.paire] || { debutFinal: tache.debutFinal, ouvertures: [] };
    coffre.ouvertures.push({ famille: tache.famille, params: resume.retenus, t: maintenant, resultat: jf.statut, rang: jf.rang });
    if (jf.ok) { journaliser(etat, 'validation', NOMS_TOUT[tache.famille] + ' ' + tache.paire + ' : validée en backtest ET sur le jeu final (ouvert une seule fois).', maintenant); return [{ famille: tache.famille, paire: tache.paire, params: resume.retenus, validation: { statut: 'validee_backtest', jeuFinal: jf.statut, esperance: resume.esperance, trades: resume.trades, criteres: empreinteV3(), t: maintenant } }]; }
    journaliser(etat, 'rejet', NOMS_TOUT[tache.famille] + ' ' + tache.paire + ' : validée en backtest mais RECALÉE sur le jeu final (ne revient jamais).', maintenant);
  } else if (resume.statut === 'rejetee_causalite') journaliser(etat, 'rejet', NOMS_TOUT[tache.famille] + ' ' + tache.paire + ' : REJETÉE, elle regarde le futur.', maintenant);
  else journaliser(etat, 'essai', NOMS_TOUT[tache.famille] + ' ' + tache.paire + ' (' + tache.type + ') : ' + ({ non_validee: 'non validée (' + (resume.ratees || []).length + ' critères ratés)', insuffisant: 'historique insuffisant', validee_backtest: 'validée en backtest (jeu final en attente)' }[resume.statut] || resume.statut), maintenant);
  return [];
}
export { combinaisons, CRITERES3 };
