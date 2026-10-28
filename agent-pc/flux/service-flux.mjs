// Service d'enregistrement du carnet (V4, phase 2) : processus séparé, démarré et relancé par le service Kepler (agent-pc/service.mjs), priorité BASSE.
//   node agent-pc/flux/service-flux.mjs              enregistre (une seule instance)
//   node agent-pc/flux/service-flux.mjs --statut     « enregistre BTC/SOL/DOGE depuis X jours, Y Go, trous : Z »
//   node agent-pc/flux/service-flux.mjs --arreter    demande l'arrêt
//   node agent-pc/flux/service-flux.mjs --quota 25   fixe le quota de disque (en Go)
// Fichiers : <dossier agent>\flux\ (données), etat-flux.json (battement toutes les 15 s), flux.verrou, config-flux.json (quota…).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dossierAgent, lireJson, ecrireJson, vivant } from '../etat-agent.mjs';
import { creerStockage, jourUTC } from './stockage-flux.mjs';
import { creerEnregistreur, ACTIFS } from './enregistreur.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const QUOTA_DEFAUT_GO = 15;
export const fichiersFlux = (dossier = dossierAgent()) => ({ dossier: path.join(dossier, 'flux'), etat: path.join(dossier, 'flux', 'etat-flux.json'), verrou: path.join(dossier, 'flux', 'flux.verrou'), config: path.join(dossier, 'flux', 'config-flux.json'), arret: path.join(dossier, 'flux', 'flux.arret'), pause: path.join(dossier, 'flux', 'flux.pause') });
export const lireQuotaGo = (F, env = process.env) => { const c = lireJson(F.config, {}) || {}; return Number(env.RAYLE_FLUX_QUOTA_GO) || Number(c.quotaGo) || QUOTA_DEFAUT_GO; };

const fmtGo = o => (o / 1024 ** 3).toFixed(2).replace('.', ',') + ' Go';
/* Résumé lisible pour `service.mjs --statut`. Fonctionne même si le service ne tourne pas (lit les fichiers). */
export function statutFlux(dossier = dossierAgent(), { maintenant = Date.now(), stockage = null } = {}) {
  const F = fichiersFlux(dossier), e = lireJson(F.etat, null), quotaGo = lireQuotaGo(F);
  if (!e) return { enregistre: false, phrase: 'Carnet d’ordres : jamais démarré (lance node agent-pc/flux/service-flux.mjs ou attends que le service Kepler le fasse).', quotaGo };
  const S = stockage || creerStockage({ dossier: F.dossier, quotaOctets: quotaGo * 1024 ** 3 }), inv = S.inventaire(), vivantMaintenant = !!e.pid && vivant(e.pid) && maintenant - e.vivantLe < 90000;
  const trous = S.lireTrous(0), debuts = Object.values(e.premierEnregistrement || {}).filter(Boolean), debut = debuts.length ? Math.min(...debuts) : null;
  const jours = debut ? (maintenant - debut) / 86400e3 : 0, actifs = Object.keys(ACTIFS).filter(a => Object.keys(e.flux || {}).some(k => k.endsWith('-' + a)));
  const prets = Object.entries(e.flux || {}).filter(([, v]) => v.pret).length, total = Object.keys(e.flux || {}).length;
  const phrase = (vivantMaintenant ? 'Enregistre ' : 'ARRÊTÉ (dernier battement il y a ' + Math.round((maintenant - e.vivantLe) / 60000) + ' min) — avait enregistré ') + (actifs.join('/') || '—') + ' depuis ' + jours.toFixed(1).replace('.', ',') + ' jour(s), ' + fmtGo(inv.total) + ' sur ' + quotaGo + ' Go, trous : ' + trous.length + '.';
  return { enregistre: vivantMaintenant, phrase, jours, octets: inv.total, quotaGo, trous: trous.length, derniersTrous: trous.slice(-5), fluxPrets: prets + '/' + total, parType: inv.parType, debut, pid: e.pid, derniereSeconde: e.derniereSeconde, erreurs: e.erreurs || [], libre: e.disque && e.disque.libre };
}
/* Le service Kepler appelle ceci à chaque cycle : si l'enregistreur ne bat plus, on le relance (processus détaché, priorité basse). Rend 'deja' | 'lance' | 'pause' | 'impossible'. */
export function assurerEnregistreur(dossier = dossierAgent(), { maintenant = Date.now(), lancer = true } = {}) {
  const F = fichiersFlux(dossier); if (fs.existsSync(F.pause)) return 'pause';
  const e = lireJson(F.etat, null); if (e && e.pid && vivant(e.pid) && maintenant - e.vivantLe < 90000) return 'deja';
  let verrou = null; try { verrou = Number(fs.readFileSync(F.verrou, 'utf8')); } catch (x) { /* pas de verrou */ }
  if (verrou && vivant(verrou) && e && maintenant - e.vivantLe < 300000) return 'deja';                          // vient de démarrer
  if (!lancer) return 'a-lancer';
  try { const p = spawn(process.execPath, [path.join(ICI, 'service-flux.mjs')], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, RAYLE_AGENT_DOSSIER: dossier } }); p.unref(); return 'lance'; } catch (x) { return 'impossible'; }
}

const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const dossier = dossierAgent(), F = fichiersFlux(dossier), args = process.argv.slice(2); fs.mkdirSync(F.dossier, { recursive: true });
  if (args[0] === '--statut') { console.log(JSON.stringify(statutFlux(dossier), null, 1)); process.exit(0); }
  if (args[0] === '--arreter') { fs.writeFileSync(F.arret, String(Date.now())); console.log('Arrêt demandé.'); process.exit(0); }
  if (args[0] === '--pause') { fs.writeFileSync(F.pause, String(Date.now())); fs.writeFileSync(F.arret, String(Date.now())); console.log('Enregistrement mis en pause (retire avec --reprendre).'); process.exit(0); }
  if (args[0] === '--reprendre') { try { fs.unlinkSync(F.pause); } catch (e) { /* rien */ } console.log('Reprise : le service Kepler relancera l’enregistrement dans la minute.'); process.exit(0); }
  if (args[0] === '--quota') { const go = Number(args[1]); if (!(go >= 1)) { console.log('Donne un quota en Go, par exemple : --quota 25'); process.exit(1); } ecrireJson(F.config, { ...(lireJson(F.config, {}) || {}), quotaGo: go }); console.log('Quota fixé à ' + go + ' Go (pris en compte au prochain démarrage).'); process.exit(0); }
  try { const pid = Number(fs.readFileSync(F.verrou, 'utf8')); if (pid && pid !== process.pid && vivant(pid)) { console.log('L’enregistreur tourne déjà (pid ' + pid + ').'); process.exit(0); } } catch (e) { /* pas de verrou */ }
  fs.writeFileSync(F.verrou, String(process.pid)); try { fs.unlinkSync(F.arret); } catch (e) { /* rien */ }
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { /* tant pis */ }
  // anti-veille Windows : un petit PowerShell caché qui demande « système requis » tant que cet enregistreur vit
  if (process.platform === 'win32' && !process.env.RAYLE_FLUX_SANS_ANTIVEILLE) { try { spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', path.join(ICI, 'anti-veille.ps1'), '-Parent', String(process.pid)], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (e) { /* facultatif */ } }
  const quotaGo = lireQuotaGo(F), stockage = creerStockage({ dossier: F.dossier, quotaOctets: quotaGo * 1024 ** 3 });
  const prior = lireJson(F.etat, {}) || {}, premier = { ...(prior.premierEnregistrement || {}) }, demarreLe = Date.now(), erreursRecentes = [];
  const rec = creerEnregistreur({ stockage, surErreur: m => { erreursRecentes.unshift({ t: Date.now(), msg: m }); erreursRecentes.length = Math.min(8, erreursRecentes.length); } });
  let fini = false, derniereCompression = 0, dernierePurge = 0, disque = null;
  const ecrireEtat = () => {
    const e = rec.etat(); for (const [k, v] of Object.entries(e.flux)) if (v.secondes > 0 && !premier[k]) premier[k] = Date.now();
    try { ecrireJson(F.etat, { pid: process.pid, demarreLe, vivantLe: Date.now(), quotaGo, disque, premierEnregistrement: premier, erreurs: erreursRecentes, ...e }); } catch (x) { /* disque */ }
  };
  const sortir = () => { if (fini) return; fini = true; try { rec.arreter(); ecrireEtat(); fs.unlinkSync(F.verrou); } catch (e) { /* fini */ } process.exit(0); };
  process.on('SIGINT', sortir); process.on('SIGTERM', sortir);
  process.on('uncaughtException', e => { erreursRecentes.unshift({ t: Date.now(), msg: 'non gérée : ' + (e && e.message) }); });
  process.on('unhandledRejection', e => { erreursRecentes.unshift({ t: Date.now(), msg: 'promesse : ' + (e && e.message) }); });
  if (prior.vivantLe && demarreLe - prior.vivantLe > 45000) { try { stockage.noterTrou({ t: prior.vivantLe, flux: 'tous', de: prior.vivantLe, a: demarreLe, raison: 'enregistreur arrêté (PC éteint, en veille ou service coupé)' }); } catch (e) { /* disque */ } }   // l'arrêt entre deux démarrages est un trou aussi
  rec.demarrer();
  setInterval(() => {
    if (fs.existsSync(F.arret)) return sortir();
    const t = Date.now(); stockage.vider();
    if (t - derniereCompression > 60000) { derniereCompression = t; try { stockage.compresserFinis(); } catch (e) { erreursRecentes.unshift({ t, msg: 'compression : ' + e.message }); } }
    if (t - dernierePurge > 600000) { dernierePurge = t; try { const p = stockage.purger(); disque = { octets: p.apres, quota: p.quota, libre: stockage.espaceLibre() }; if (p.supprimes.length) erreursRecentes.unshift({ t, msg: 'quota : jours purgés ' + p.supprimes.join(', ') }); } catch (e) { erreursRecentes.unshift({ t, msg: 'purge : ' + e.message }); } }
    ecrireEtat();
  }, 15000);
  ecrireEtat();
}
export { jourUTC };
