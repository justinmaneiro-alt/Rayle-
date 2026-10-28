// Réglages de coûts de l'agent (V6, phase 1) : le fichier couts.json que Justin peut remplir (frais maker / taker, spread, glissement), lu au démarrage du service et à chaque tâche de recherche.
// Dossier : %LOCALAPPDATA%\Rayle\agent\couts.json (RAYLE_AGENT_DOSSIER pour les tests). Absent ou invalide : les valeurs PRUDENTES de planetes/mars/pc/agent-m6/couts.js s'appliquent (jamais de blocage).
// RÈGLE : changer les coûts change tous les résultats ; la recherche est donc refaite (l'empreinte des tâches contient l'empreinte des coûts) et le compteur de variantes ne baisse jamais.
// On ne règle les coûts que pour y mettre les VRAIS coûts de Justin, jamais pour « faire passer » une stratégie.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COUTS_DEFAUT, configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { ORDRE_PAIRES } from '../planetes/mars/pc/agent-m6/paires.js';
import { validerReglageCouts, COUTS_EXEMPLE } from '../strategies/couts-r.js';
import { dossierAgent, lireJson } from './etat-agent.mjs';

export const fichierCouts = (dossier = dossierAgent()) => path.join(dossier, 'couts.json');
/* Lit les réglages. Renvoie { source: 'defaut' | 'fichier', erreurs, couts: { BTC: { fraisPct, makerPct, spreadPct, glissementPct }, … }, filePct, spreadParHeureUTC, empreinte }. */
export function lireCoutsReglage(dossier = dossierAgent()) {
  const f = fichierCouts(dossier), brut = lireJson(f, null);
  const valides = validerReglageCouts(brut || {}, COUTS_DEFAUT), source = brut ? 'fichier' : 'defaut';
  // un fichier avec des erreurs n'est PAS appliqué à moitié : on revient aux valeurs prudentes et on le dit
  const r = brut && !valides.ok ? validerReglageCouts({}, COUTS_DEFAUT) : valides;
  const effectif = { couts: r.couts, filePct: r.filePct, spreadParHeureUTC: r.spreadParHeureUTC };
  const empreinte = crypto.createHash('sha256').update(JSON.stringify(effectif)).digest('hex').slice(0, 8);
  return { source: brut && valides.ok ? 'fichier' : 'defaut', fichierPresent: !!brut, erreurs: valides.erreurs, ...effectif, empreinte };
}
/* Configuration complète du simulateur pour une paire : frais taker (fraisPct), frais maker, spread, glissement, profondeur de file (un ordre limite n'est rempli que si le prix traverse le niveau
   d'au moins filePct %), multiplicateurs de spread par heure UTC. */
export function configRicheDe(idPaire, reglage = lireCoutsReglage()) {
  const c = (reglage.couts && reglage.couts[idPaire]) || configMoteurDe(idPaire);
  return { fraisPct: c.fraisPct, makerPct: c.makerPct == null ? +(c.fraisPct * 0.4).toFixed(4) : c.makerPct, spreadPct: c.spreadPct, glissementPct: c.glissementPct, filePct: reglage.filePct == null ? 0.02 : reglage.filePct, spreadParHeure: reglage.spreadParHeureUTC || null };
}
/* Écrit le modèle à remplir (couts.exemple.json) à côté de l'état de l'agent, SANS jamais toucher à un couts.json existant. */
export function ecrireExemple(dossier = dossierAgent()) {
  const f = path.join(dossier, 'couts.exemple.json');
  try { fs.mkdirSync(dossier, { recursive: true }); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(COUTS_EXEMPLE, null, 2) + '\n', 'utf8'); return f; } catch (e) { return null; }
}
/* Texte pour l'état et le rapport : d'où viennent les coûts. */
export function phraseSource(reglage) {
  if (reglage.erreurs && reglage.erreurs.length && reglage.fichierPresent) return 'Coûts : ton fichier couts.json contient des erreurs (' + reglage.erreurs[0] + ') : les valeurs prudentes s’appliquent en attendant.';
  return reglage.source === 'fichier' ? 'Coûts : ceux de ton fichier couts.json (empreinte ' + reglage.empreinte + ').' : 'Coûts : valeurs prudentes par défaut (frais 0,06 % par côté, spread et glissement selon l’actif) ; remplis couts.json avec tes vrais frais.';
}
export { ORDRE_PAIRES };
