// L'ÉQUIPE de Kepler sur le PC (V4, phase 6) : trois rôles internes, UN seul agent visible.
//   · Kepler (exécutant) : surveille, simule, valide selon les critères, alerte, tient le journal (agent-pc/service.mjs) ;
//   · le Chercheur : chaque jour (et quand les résultats stagnent) écrit au plus 10 hypothèses structurées ; un validateur de schéma rejette le flou ; le code en fait des stratégies testables ;
//   · l'Auditeur : essaie de CASSER chaque candidate avant tout feu vert ; rien n'est validé sans son rapport écrit (rapports/auditeur/…).
// État : <agent>\equipe.json (jamais dans git). Budget : 10 hypothèses par jour (UTC), tout est journalisé (proposé, testé, rejeté, pourquoi). Le modèle de langage (Dolphin / API gratuite) propose et explique ;
// il ne calcule rien, ne valide rien, ne passe aucun ordre.
import fs from 'node:fs';
import path from 'node:path';
import { dossierAgent, fichiersAgent, lireJson, ecrireJson } from '../etat-agent.mjs';
import { completer } from '../llm.mjs';
import { promptSystemeChercheur, promptUtilisateurChercheur, construireFaitsChercheur, parserSortieModele, filtrerHypotheses, proposerSansModele, familleDepuisHypothese, LIMITES_CHERCHEUR } from '../../strategies/equipe/chercheur.js';

export const fichierEquipe = dossier => path.join(dossier, 'equipe.json');
export const jourUTC = t => new Date(t).toISOString().slice(0, 10);
export const equipeVide = () => ({ version: 1, chercheur: { derniereExecution: null, budget: { jour: null, utilisees: 0 }, rapport: [], source: null, stagnation: null }, hypotheses: [], journal: [], auditeur: { dernier: null, rapports: [] } });
export function lireEquipe(dossier = dossierAgent()) { const e = lireJson(fichierEquipe(dossier), null); return e && e.version === 1 ? e : equipeVide(); }
export function ecrireEquipe(equipe, dossier = dossierAgent()) { equipe.hypotheses = equipe.hypotheses.slice(-300); equipe.journal = equipe.journal.slice(-400); ecrireJson(fichierEquipe(dossier), equipe, { copies: 1 }); }
export const noter = (equipe, type, texte, t = Date.now()) => { equipe.journal.push({ t, type, texte: String(texte).slice(0, 300) }); };
export function budgetRestant(equipe, maintenant = Date.now()) {
  const b = equipe.chercheur.budget, j = jourUTC(maintenant); if (b.jour !== j) { b.jour = j; b.utilisees = 0; } return Math.max(0, LIMITES_CHERCHEUR.parJour - b.utilisees);
}
export const idsVus = equipe => new Set(equipe.hypotheses.map(h => h.id));

/* Le Chercheur travaille : modèle (si disponible) puis secours déterministe ; rend { acceptees, rejetees, source }. `faits` = construireFaitsChercheur(...). `force` : ignore « déjà fait aujourd'hui » (stagnation, demande). */
export async function executerChercheur({ dossier = dossierAgent(), equipe = null, faits, maintenant = Date.now(), force = false, fetchImpl = globalThis.fetch, preference = null, config = null, occasions = null, exemples = null, completerImpl = completer } = {}) {
  equipe = equipe || lireEquipe(dossier); const reste = budgetRestant(equipe, maintenant);
  if (reste <= 0) { noter(equipe, 'chercheur', 'budget du jour atteint (' + LIMITES_CHERCHEUR.parJour + ' hypothèses) : rien de nouveau avant demain.', maintenant); return { acceptees: [], rejetees: [], source: 'budget', equipe }; }
  if (!force && equipe.chercheur.derniereExecution && jourUTC(equipe.chercheur.derniereExecution) === jourUTC(maintenant)) return { acceptees: [], rejetees: [], source: 'deja_fait', equipe };
  let acceptees = [], rejetees = [], source = 'secours déterministe (aucun modèle utilisé)', essais = [];
  const rep = await completerImpl({ systeme: promptSystemeChercheur(), utilisateur: promptUtilisateurChercheur(faits), fetchImpl, preference, config }).catch(e => ({ texte: null, source: 'erreur', essais: [String(e.message).slice(0, 80)] }));
  essais = rep.essais || [];
  if (rep.texte) {
    const p = parserSortieModele(rep.texte);
    if (p.ok) { const f = filtrerHypotheses(p.hypotheses, { dejaVues: idsVus(equipe), max: reste }); acceptees = f.acceptees; rejetees = f.rejetees; source = rep.source; if (!acceptees.length) noter(equipe, 'chercheur', 'le modèle (' + rep.source + ') n’a produit aucune hypothèse valide : ' + (rejetees[0] ? rejetees[0].raisons.join(' ; ') : 'liste vide') + '. Secours déterministe utilisé.', maintenant); }
    else noter(equipe, 'chercheur', 'sortie du modèle illisible (' + p.erreur + ') : secours déterministe utilisé.', maintenant);
  } else noter(equipe, 'chercheur', 'aucun modèle disponible (' + essais.join(' ; ') + ') : secours déterministe utilisé.', maintenant);
  if (!acceptees.length) { const f = proposerSansModele({ occasions, exemples, dejaVues: idsVus(equipe), max: reste }); acceptees = f.acceptees; rejetees = rejetees.concat(f.rejetees); source = 'secours déterministe (aucun modèle utilisé)'; }
  for (const h of acceptees) equipe.hypotheses.push({ id: h.id, titre: h.titre, raison: h.raison, regle: h.regle, t: maintenant, source, statut: 'a_tester', resultats: {} });
  equipe.chercheur.budget.utilisees += acceptees.length; equipe.chercheur.derniereExecution = maintenant; equipe.chercheur.source = source;
  equipe.chercheur.rapport = ['Le Chercheur a proposé ' + acceptees.length + ' hypothèse(s) aujourd’hui (' + source + ').', rejetees.length ? rejetees.length + ' proposition(s) rejetée(s) par le validateur de schéma (' + [...new Set(rejetees.flatMap(r => r.raisons))].slice(0, 2).join(' ; ') + ').' : 'Aucune proposition rejetée.', 'Il n’a pas le droit de valider : chaque hypothèse devient une stratégie testée avec les critères habituels.'];
  for (const h of acceptees) noter(equipe, 'chercheur', 'proposée : ' + h.titre, maintenant); for (const r of rejetees) noter(equipe, 'chercheur', 'rejetée : ' + r.titre + ' — ' + r.raisons.join(' ; '), maintenant);
  const F = fichiersAgent(dossier); try { const f = path.join(F.rapports, 'chercheur', jourUTC(maintenant) + '.md'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ['# Le Chercheur — ' + jourUTC(maintenant), '', 'Source : ' + source, '', '## Hypothèses acceptées', ...acceptees.map(h => '- **' + h.titre + '** — ' + h.raison), '', '## Rejetées', ...rejetees.map(r => '- ' + r.titre + ' : ' + r.raisons.join(' ; ')), ''].join('\n'), 'utf8'); } catch (e) { /* disque */ }
  return { acceptees, rejetees, source, equipe };
}

/* Tâches de recherche pour les hypothèses « à tester » : une par actif (même forme que `planifier` de recherche.mjs). */
export function tachesHypotheses({ equipe, paires, debutFinal, cache, empreinteTache, maxParCycle = 12 }) {
  const taches = [];
  for (const h of equipe.hypotheses) {
    if (h.statut === 'testee') continue; const fam = familleDepuisHypothese(h), grille = fam.grille();
    for (const p of paires) {
      if (!debutFinal[p] || (h.resultats && h.resultats[p])) continue;
      const emp = empreinteTache({ famille: h.id, paire: p, grille, debutFinal: debutFinal[p], type: 'hypothese' }); if (cache.has(emp)) continue;
      taches.push({ type: 'hypothese', gen: 0, famille: h.id, paire: p, grille, empreinte: emp, debutFinal: debutFinal[p], taille: Object.values(grille).reduce((a, v) => a * v.length, 1), hypothese: { id: h.id, titre: h.titre, raison: h.raison, regle: h.regle } });
    }
  }
  return taches.slice(0, maxParCycle);
}
/* Après un test : garde le résultat par actif ; l'hypothèse est « testée » quand les trois actifs ont répondu. */
export function marquerTest(equipe, tache, resume, paires, maintenant = Date.now()) {
  const h = equipe.hypotheses.find(x => x.id === tache.famille); if (!h) return;
  h.resultats[tache.paire] = { statut: resume.statut, esperance: resume.esperance ?? null, trades: resume.trades ?? null, auditeur: resume.auditeur ? { ok: resume.auditeur.ok } : null, t: maintenant };
  h.statut = paires.every(p => h.resultats[p]) ? 'testee' : 'en_test';
  noter(equipe, 'test', h.titre + ' sur ' + tache.paire + ' : ' + ({ non_validee: 'non validée', validee_backtest: 'validée en backtest', insuffisant: 'historique insuffisant', rejetee_causalite: 'REJETÉE (regarde le futur)', rejetee_auditeur: 'REJETÉE par l’Auditeur' }[resume.statut] || resume.statut) + (resume.esperance != null ? ' (' + resume.esperance.toFixed(2).replace('.', ',') + ' R, ' + resume.trades + ' trades)' : ''), maintenant);
}
/* Rapport de l'Auditeur : écrit en Markdown (rapports/auditeur/…) ; rend le chemin. */
export function ecrireRapportAuditeur(dossier, equipe, aud, maintenant = Date.now()) {
  const F = fichiersAgent(dossier), nom = (aud.candidate.id + '-' + (aud.candidate.paire || 'x') + '-' + jourUTC(maintenant) + '.md').replace(/[^A-Za-z0-9_.-]/g, '_'), f = path.join(F.rapports, 'auditeur', nom);
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, aud.rapport.join('\n') + '\n', 'utf8'); } catch (e) { return null; }
  equipe.auditeur.dernier = { t: maintenant, ok: aud.ok, candidate: aud.candidate, resume: aud.resume, fichier: nom }; equipe.auditeur.rapports.push({ t: maintenant, ok: aud.ok, id: aud.candidate.id, paire: aud.candidate.paire, fichier: nom }); equipe.auditeur.rapports = equipe.auditeur.rapports.slice(-100);
  noter(equipe, 'auditeur', aud.candidate.id + ' ' + (aud.candidate.paire || '') + ' : ' + (aud.ok ? 'tests passés' : 'REJETÉE — ' + aud.tests.filter(t => !t.ok).map(t => t.nom).slice(0, 2).join(' ; ')), maintenant); return f;
}
/* Ce que montre la page « Équipe » : qui fait quoi, dernier rapport de chacun en trois lignes. */
export function resumeEquipe(equipe, etatAgent = null, maintenant = Date.now()) {
  const c = equipe.chercheur, a = equipe.auditeur, hy = equipe.hypotheses, restant = budgetRestant(equipe, maintenant);
  const kepler = etatAgent ? ['Kepler surveille ' + Object.keys(etatAgent.strategies || {}).length + ' stratégie(s) et a testé ' + Object.values(etatAgent.compteurVariantes || {}).reduce((x, y) => x + y, 0) + ' variantes.', etatAgent.rapport && etatAgent.rapport.lignes ? etatAgent.rapport.lignes[0] : 'Pas encore de rapport.', 'Il valide seulement avec les critères (v1, v2, v3 intacts) ; aucun ordre.'] : ['État de l’agent indisponible.'];
  return {
    kepler: { role: 'Exécutant : surveille, simule, valide selon les critères, alerte, tient le journal', lignes: kepler },
    chercheur: { role: 'Écrit au plus ' + LIMITES_CHERCHEUR.parJour + ' hypothèses par jour (n’a pas le droit de valider)', lignes: c.rapport && c.rapport.length ? c.rapport : ['Le Chercheur n’a pas encore travaillé.'], budget: { restant, parJour: LIMITES_CHERCHEUR.parJour }, hypotheses: { total: hy.length, a_tester: hy.filter(h => h.statut === 'a_tester').length, testees: hy.filter(h => h.statut === 'testee').length } },
    auditeur: { role: 'Essaie de casser chaque candidate ; rien n’est validé sans son rapport écrit', lignes: a.dernier ? a.dernier.resume : ['L’Auditeur n’a pas encore eu de candidate à auditer (aucune stratégie n’a encore passé la validation).'], rapports: a.rapports.length, rejetes: a.rapports.filter(r => !r.ok).length },
    journal: equipe.journal.slice(-12).reverse()
  };
}
