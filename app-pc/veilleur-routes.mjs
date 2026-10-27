// Rayle - routes locales /__veilleur/… (branchées dans serveur.mjs) : la page Rayle parle au Veilleur par des fichiers dans %LOCALAPPDATA%\Rayle\veilleur.
// N'écoute que sur 127.0.0.1 (comme le serveur) ; mêmes garde-fous que le mode multi-écrans (hôte local, même origine, en-tête X-Rayle-Multi pour les actions).
// Le jeton d'appareil reçu est écrit dans config.local.json (hors dépôt) et n'est JAMAIS renvoyé ni journalisé.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requeteAutorisee } from './multi-ecrans.mjs';
import { dossierVeilleur } from './veilleur/dossier.mjs';
import { fichiers } from './veilleur/coeur.mjs';
import { REGLAGES_DEFAUT, reglagesValides } from '../planetes/mars/pc/alertes/regles.js';
import { stockagePilote } from './veilleur/pilote-fichier.mjs';
import { fichiersChercheur } from './veilleur/chercheur.mjs';
import { urlKraken } from '../planetes/mars/pc/agent-m6/paires.js';

export const VERSION_VEILLEUR_ROUTES = 1;
const ICI = path.dirname(fileURLToPath(import.meta.url));
const lireJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
const ecrireJson = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); fs.renameSync(tmp, f); };
const lireCorps = (req, max) => new Promise((resolve, reject) => {
  let n = 0; const morceaux = [];
  req.on('data', c => { n += c.length; if (n > max) { reject(new Error('corps trop gros')); req.destroy(); } else morceaux.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); } catch (e) { reject(new Error('JSON invalide')); } });
  req.on('error', reject);
});
const vivant = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

const krakenMemo = new Map();
export function creerRoutesVeilleur(env = process.env) {
  const dossier = () => { const d = dossierVeilleur(env); fs.mkdirSync(d, { recursive: true }); return d; };
  const lienDemarrage = () => path.join(env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Rayle Veilleur.lnk');
  const ps1 = path.join(ICI, 'veilleur', 'installer-demarrage.ps1');
  const vbs = path.join(ICI, 'RayleVeilleur.vbs');

  function etatComplet() {
    const F = fichiers(dossier()), brut = lireJson(F.etat, null), c = lireJson(F.config, {});
    const e = brut && { ...brut, erreurs: undefined, erreursRecentes: (brut.erreurs || []).slice(0, 3).map(x => ({ t: x.t, msg: x.msg })) };
    const enMarche = !!(e && e.pid && vivant(e.pid) && Date.now() - e.vivantLe < 120000);
    return { ok: true, version: VERSION_VEILLEUR_ROUTES, plateforme: process.platform, enMarche, etat: e, reglages: reglagesValides(lireJson(F.reglages, {}), REGLAGES_DEFAUT),
      workerConfigure: !!(c.url && c.jeton), demarrageWindows: process.platform === 'win32' ? fs.existsSync(lienDemarrage()) : false };
  }
  function alertesDepuis(depuis, max = 60) {
    const F = fichiers(dossier());
    try { return fs.readFileSync(F.alertes, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(a => a && a.t > depuis).slice(-max); } catch (e) { return []; }
  }
  /* ── Pilote de l'agent BTC (M5) : l'état est dans pilote.json (voir veilleur/pilote-fichier.mjs) ; la page lit tout et envoie des COMMANDES (une liste fermée, voir pilote-coeur.js) ── */
  const pilote = (paire = 'BTC') => stockagePilote(dossier(), { paire });                       // M6 : un pilote par paire (BTC = pilote.json, SOL = pilote-sol.json, DOGE = pilote-doge.json)
  function etatChercheur(paire = 'BTC') {
    const F2 = fichiersChercheur(dossier(), paire), e = lireJson(F2.etat, null);
    return { enMarche: !!(e && e.pid && vivant(e.pid) && Date.now() - e.vivantLe < 120000), etat: e && { ...e, erreurs: (e.erreurs || []).slice(0, 3).map(x => ({ t: x.t, msg: x.msg })) } };
  }
  const lancerChercheur = (paire = 'BTC') => {
    if (env.RAYLE_VEILLEUR_SANS_LANCEMENT === '1') return;   // tests : on ne lance jamais un vrai processus
    const F2 = fichiersChercheur(dossier(), paire); try { fs.unlinkSync(F2.arret); } catch (x) { /* rien */ }
    spawn(process.execPath, [path.join(ICI, 'veilleur', 'chercheur.mjs'), '--paire', paire], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  };
  const lancerVeilleur = () => {
    if (env.RAYLE_VEILLEUR_SANS_LANCEMENT === '1') return;   // tests : on ne lance jamais un vrai processus
    if (process.platform !== 'win32') return spawn(process.execPath, [path.join(ICI, 'veilleur', 'veilleur.mjs')], { detached: true, stdio: 'ignore' }).unref();
    spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore' }).unref();
  };
  const sh = (cmd, args, ms = 30000) => new Promise(resolve => execFile(cmd, args, { windowsHide: true, timeout: ms, encoding: 'utf8' }, (err, out) => resolve({ ok: !err, sortie: String(out || '').trim().split(/\r?\n/).pop() })));

  /* Traite une requête /__veilleur/… */
  async function gerer(req, res, chemin) {
    const json = (code, obj) => { const t = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(t) }); res.end(t); };
    const refus = requeteAutorisee(req); if (refus) return json(403, { ok: false, erreur: refus });
    try {
      const url = new URL(req.url, 'http://x'), route = chemin.replace(/^\/__veilleur\//, ''), F = fichiers(dossier()), paireDemandee = String(url.searchParams.get('paire') || 'BTC').toUpperCase();
      if (!['BTC', 'SOL', 'DOGE'].includes(paireDemandee)) return json(400, { ok: false, erreur: 'paire inconnue' });
      if (req.method === 'GET') {
        if (route === 'etat') return json(200, etatComplet());
        if (route === 'alertes') return json(200, { ok: true, alertes: alertesDepuis(Number(url.searchParams.get('depuis')) || 0) });
        if (route === 'pilote') { const e = pilote(paireDemandee).etat(); return json(200, { ok: true, paire: paireDemandee, existe: !!e, etat: e, chercheur: etatChercheur(paireDemandee) }); }
        if (route === 'chercheur') return json(200, { ok: true, paire: paireDemandee, ...etatChercheur(paireDemandee) });
        if (route === 'chercheurs') return json(200, { ok: true, chercheurs: Object.fromEntries(['BTC', 'SOL', 'DOGE'].map(p => [p, etatChercheur(p)])) });
        if (route === 'kraken') {                                // M6 : proxy en LECTURE SEULE vers l'API publique de Kraken (sans CORS, donc inappelable depuis la page) pour recouper les prix ; une seule adresse possible par paire, cache de 60 s
          const memo = krakenMemo.get(paireDemandee); if (memo && Date.now() - memo.t < 60e3) return json(200, memo.j);
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
          try { const rep = await fetch(urlKraken(paireDemandee), { signal: ctl.signal, headers: { Accept: 'application/json' } }); if (!rep.ok) return json(502, { ok: false, erreur: 'Kraken a répondu HTTP ' + rep.status }); const j = await rep.json(); krakenMemo.set(paireDemandee, { t: Date.now(), j }); return json(200, j); }
          catch (e) { return json(502, { ok: false, erreur: 'Kraken injoignable : ' + String(e && e.message || e).slice(0, 80) }); } finally { clearTimeout(tm); }
        }
        if (route === 'm6') { const e = lireJson(path.join(dossier(), 'm6.json'), null); return json(200, { ok: true, existe: !!e, etat: e }); }       // M6 : compte, journal et idées (écrits par la page)
        return json(404, { ok: false, erreur: 'route inconnue' });
      }
      if (route === 'strategie') {
        const c = await lireCorps(req, 1 << 20);
        if (!c.verdict || typeof c.verdict.etat !== 'string') return json(400, { ok: false, erreur: 'verdict manquant' });
        ecrireJson(F.strategie, { verdict: c.verdict, coffre: c.coffre || null, nVariantes: c.nVariantes, reglagesAgent: c.reglagesAgent || null, recuLe: Date.now() });
        return json(200, { ok: true });
      }
      if (route === 'pilote-adopter') {                       // la page passe son état au Veilleur : seulement s'il n'y en a pas déjà un (sinon fusion par commandes)
        const c = await lireCorps(req, 64 << 20);
        if (!c || !c.etat || typeof c.etat !== 'object' || !Array.isArray((c.etat.bibliotheque || {}).strategies)) return json(400, { ok: false, erreur: 'état invalide' });
        if (!(await pilote(paireDemandee).adopterSiAbsent(c.etat))) return json(409, { ok: false, existe: true, erreur: 'un état existe déjà : fusion par commandes' });
        return json(200, { ok: true });
      }
      if (route === 'pilote-commande') {
        const c = await lireCorps(req, 16 << 20);
        if (!c || typeof c.commande !== 'object' || typeof c.commande.type !== 'string') return json(400, { ok: false, erreur: 'commande manquante' });
        const r = await pilote(paireDemandee).modifier(p => p.commande(c.commande));
        return json(200, { ok: true, resultat: r });
      }
      if (route === 'm6-etat') {                                // M6 : la page est l'UNIQUE écrivain du compte ; le Veilleur le relit pour juger les alertes et envoyer les messages Telegram avec la marge restante
        const c = await lireCorps(req, 16 << 20);
        if (!c || !c.etat || typeof c.etat !== 'object' || !c.etat.regles || typeof c.etat.regles !== 'object' || !Array.isArray(c.etat.journal) || !c.etat.base) return json(400, { ok: false, erreur: 'état du compte invalide' });
        ecrireJson(path.join(dossier(), 'm6.json'), c.etat); return json(200, { ok: true });
      }
      if (route === 'ms-etat') {                                // V1 « Teste ma stratégie » : la page écrit les stratégies mises EN ALERTES (validées par l'utilisatrice) ; le Veilleur les suit même application fermée
        const c = await lireCorps(req, 2 << 20);
        if (!c || !Array.isArray(c.strategies) || c.strategies.length > 50 || !c.strategies.every(x => x && typeof x.id === 'string' && x.strategie && typeof x.strategie === 'object' && x.confiance && typeof x.confiance.etiquette === 'string')) return json(400, { ok: false, erreur: 'stratégies invalides' });
        ecrireJson(path.join(dossier(), 'ms-strategies.json'), { t: Date.now(), strategies: c.strategies }); return json(200, { ok: true, n: c.strategies.length });
      }
      const c = await lireCorps(req, 8192);
      if (route === 'chercheur-demarrer') { const e = etatChercheur(paireDemandee); if (e.enMarche) return json(200, { ok: true, deja: true, paire: paireDemandee }); lancerChercheur(paireDemandee); return json(200, { ok: true, paire: paireDemandee }); }
      if (route === 'chercheur-arreter') { fs.writeFileSync(fichiersChercheur(dossier(), paireDemandee).arret, String(Date.now())); return json(200, { ok: true, paire: paireDemandee }); }
      if (route === 'mode-jeu') { const f = path.join(dossier(), 'mode-jeu.flag'); if (c.actif) fs.writeFileSync(f, String(Date.now())); else { try { fs.unlinkSync(f); } catch (x) { /* absent */ } } return json(200, { ok: true, actif: !!c.actif }); }
      if (route === 'reglages') { const r = reglagesValides(c.patch || {}, reglagesValides(lireJson(F.reglages, {}), REGLAGES_DEFAUT)); ecrireJson(F.reglages, r); return json(200, { ok: true, reglages: r }); }
      if (route === 'config') {
        const u = String(c.url || '').trim().replace(/\/+$/, ''), j = String(c.jeton || '').trim();
        if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~-]*)*$/.test(u) || u.length > 200) return json(400, { ok: false, erreur: 'adresse du Worker invalide' });
        if (j.length < 2 || j.length > 200 || /\s/.test(j)) return json(400, { ok: false, erreur: 'jeton invalide' });
        ecrireJson(F.config, { url: u, jeton: j }); return json(200, { ok: true });
      }
      if (route === 'demarrer') { const e = etatComplet(); if (e.enMarche) return json(200, { ok: true, deja: true }); try { fs.unlinkSync(F.arret); } catch (x) { /* rien */ } lancerVeilleur(); return json(200, { ok: true }); }
      if (route === 'arreter') { fs.writeFileSync(F.arret, String(Date.now())); return json(200, { ok: true }); }
      if (route === 'demarrage-windows') {
        if (process.platform !== 'win32') return json(200, { ok: false, erreur: 'Windows seulement' });
        const r = await sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...(c.actif === false ? ['-Retirer'] : [])]);
        return json(200, { ok: r.ok, resultat: r.sortie, demarrageWindows: fs.existsSync(lienDemarrage()) });
      }
      if (route === 'faux-signal') {
        const r = await sh(process.execPath, [path.join(ICI, 'veilleur', 'veilleur.mjs'), '--faux-signal'], 20000);   // JAMAIS d'envoi Telegram depuis ici
        return json(200, { ok: r.ok, resultat: r.sortie });
      }
      return json(404, { ok: false, erreur: 'route inconnue' });
    } catch (e) { return json(400, { ok: false, erreur: e.message }); }
  }
  return { gerer, etatComplet, alertesDepuis, etatChercheur };
}
