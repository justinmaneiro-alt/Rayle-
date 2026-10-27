// Fichiers de l'agent sur le PC (hors dépôt git) : %LOCALAPPDATA%\Rayle\agent  (RAYLE_AGENT_DOSSIER pour les tests).
//   agent.json        l'état complet (identité, versions, stratégies, backtests, alertes…) : écrit de façon ATOMIQUE, avec 3 sauvegardes tournantes (agent.json.1 à .3)
//   suivi.json        l'état de surveillance de chaque règle (compte simulé : position, trades, courbe de capital)
//   journal.jsonl     le journal de bord complet (une ligne JSON par événement ; agent.json n'en garde que les derniers)
//   service.json      l'état du service (pid, vivant le, phase) ; service.arret / service.pause : demandes
//   config.local.json adresse du Worker et jeton d'appareil (copiés du Veilleur la première fois) : JAMAIS affichés ni journalisés
//   donnees/…         bougies, dérivés, Kraken ; cache/…  résultats de calcul (par empreinte)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { etatInitial } from '../strategies/agent-etat.js';

export const dossierAgent = (env = process.env) => env.RAYLE_AGENT_DOSSIER || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Rayle', 'agent');
export const fichiersAgent = (dossier = dossierAgent()) => ({
  etat: path.join(dossier, 'agent.json'), suivi: path.join(dossier, 'suivi.json'), journal: path.join(dossier, 'journal.jsonl'), service: path.join(dossier, 'service.json'),
  arret: path.join(dossier, 'service.arret'), verrou: path.join(dossier, 'service.verrou'), config: path.join(dossier, 'config.local.json'), donnees: path.join(dossier, 'donnees'), cache: path.join(dossier, 'cache'), rapports: path.join(dossier, 'rapports')
});
export const lireJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
/* Écriture atomique (fichier temporaire puis renommage) avec `copies` sauvegardes tournantes : un fichier à moitié écrit ne remplace jamais le bon. */
export function ecrireJson(f, v, { copies = 0 } = {}) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v));
  if (copies && fs.existsSync(f)) { for (let k = copies; k >= 2; k--) { const a = f + '.' + (k - 1), b = f + '.' + k; if (fs.existsSync(a)) fs.copyFileSync(a, b); } fs.copyFileSync(f, f + '.1'); }
  fs.renameSync(tmp, f);
}
/* Charge l'état ; si le fichier est abîmé, essaie les sauvegardes ; sinon crée un état neuf (l'identité repart de zéro SEULEMENT dans ce cas, et le journal le dit). */
export function chargerEtat(dossier = dossierAgent(), maintenant = Date.now()) {
  const F = fichiersAgent(dossier);
  for (const f of [F.etat, F.etat + '.1', F.etat + '.2', F.etat + '.3']) {
    const e = lireJson(f, null); if (e && e.schema && e.identite && Array.isArray(e.versions)) { if (f !== F.etat) e.journal.push({ t: maintenant, type: 'erreur', texte: 'agent.json abîmé : état restauré depuis ' + path.basename(f) }); return e; }
  }
  const neuf = etatInitial(maintenant); neuf.journal.push({ t: maintenant, type: 'naissance', texte: 'L’agent est créé : première identité et premier journal.' });
  return neuf;
}
export function sauverEtat(etat, dossier = dossierAgent()) { const F = fichiersAgent(dossier); ecrireJson(F.etat, etat, { copies: 3 }); }
export function ajouterJournal(ligne, dossier = dossierAgent()) {
  const F = fichiersAgent(dossier); fs.mkdirSync(path.dirname(F.journal), { recursive: true });
  try { if (fs.existsSync(F.journal) && fs.statSync(F.journal).size > 8e6) fs.renameSync(F.journal, F.journal + '.ancien'); } catch (e) { /* tant pis */ }
  fs.appendFileSync(F.journal, JSON.stringify({ t: Date.now(), ...ligne }).replace(/rd_[A-Za-z0-9_-]{8,}/g, 'rd_***') + '\n');
}
/* Configuration du Worker : celle de l'agent, sinon celle du Veilleur (copiée une fois). Rend { url, jeton } ou null. Le jeton n'est jamais journalisé. */
export function lireConfig(dossier = dossierAgent(), env = process.env) {
  const F = fichiersAgent(dossier); let c = lireJson(F.config, null);
  if (!(c && c.url && c.jeton)) {
    const veilleur = path.join(env.RAYLE_VEILLEUR_DOSSIER || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Rayle', 'veilleur'), 'config.local.json'), v = lireJson(veilleur, null);
    if (v && v.url && v.jeton) { c = { url: v.url, jeton: v.jeton, copieLe: Date.now() }; try { ecrireJson(F.config, c); } catch (e) { /* lecture seule */ } }
  }
  return c && c.url && c.jeton ? c : null;
}
export const vivant = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
