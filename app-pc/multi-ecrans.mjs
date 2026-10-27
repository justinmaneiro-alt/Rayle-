// Rayle - côté Windows du mode multi-écrans : détecter les écrans, ouvrir une fenêtre sur un écran, fermer, identifier.
// Branché dans serveur.mjs sous /__multi/… ; n'écoute que sur 127.0.0.1 (comme le serveur) et ne lance QUE le navigateur de Rayle sur l'adresse du serveur lui-même.
// Pas de secret ici, pas d'accès au Worker. Les fenêtres sont repérées par leur titre « … [rayle-sat-<id>] » : aucune autre fenêtre n'est jamais touchée.
// Marche dans l'application Rayle (Edge « --app ») COMME dans un onglet de navigateur normal : les fenêtres des autres écrans s'ouvrent dans le MÊME navigateur et le MÊME
// profil que la fenêtre principale (sinon elles ne pourraient pas se parler), retrouvés par la fenêtre principale elle-même (app-pc/fenetres.ps1, action « contexte »).
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION_MULTI = 2;   // la page vérifie que le serveur en cours d'exécution connaît ces routes (un vieux serveur resté en mémoire répond 404)
const DOSSIER = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_FENETRES = path.join(DOSSIER, 'fenetres.ps1'), SCRIPT_IDENTIFIER = path.join(DOSSIER, 'identifier-ecrans.ps1');
const HOTES = /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/;
const ID_FENETRE = /^[a-z0-9-]{1,40}$/;
export const MARQUE = id => '[rayle-sat-' + id + ']';

/* Navigateur et profil de l'application : les mêmes que le lanceur (app-pc/lancer-rayle.ps1). RAYLE_NAV et RAYLE_DONNEES servent aux tests. */
export function navigateur(env = process.env) {
  const pf = env.ProgramFiles || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = env.LOCALAPPDATA || '';
  const donnees = env.RAYLE_DONNEES || path.join(la, 'Rayle');
  const edge = [path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'), path.join(pf, 'Microsoft/Edge/Application/msedge.exe')].find(p => fs.existsSync(p));
  const chrome = [path.join(pf, 'Google/Chrome/Application/chrome.exe'), path.join(pf86, 'Google/Chrome/Application/chrome.exe'), path.join(la, 'Google/Chrome/Application/chrome.exe')].find(p => fs.existsSync(p));
  const exe = env.RAYLE_NAV || edge || chrome || null;
  const profil = path.join(donnees, exe && /chrome\.exe$/i.test(exe) && !edge ? 'profil-chrome' : 'profil-edge');
  return { exe, profil, donnees };
}

function ps(script, args, { timeout = 30000 } = {}) {
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true, timeout, maxBuffer: 1 << 20, encoding: 'utf8' }, (err, out) => {
      const ligne = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      try { resolve(JSON.parse(ligne)); } catch (e) { resolve({ ok: false, erreur: err ? 'PowerShell : ' + (err.killed ? 'délai dépassé' : err.message.split('\n')[0]) : 'réponse illisible' }); }
    });
  });
}
const fen = (action, args = [], opt) => ps(SCRIPT_FENETRES, ['-Action', action, ...args], opt);
const attendre = ms => new Promise(r => setTimeout(r, ms));

/* Le serveur répond d'abord à ses propres pages : on ne laisse passer que les appels de Rayle lui-même (même machine, même origine, en-tête dédié pour les actions). */
export function requeteAutorisee(req) {
  if (!HOTES.test(String(req.headers.host || ''))) return 'hôte refusé';
  const site = req.headers['sec-fetch-site']; if (site && !['same-origin', 'none'].includes(site)) return 'origine refusée';
  const origine = req.headers.origin; if (origine && origine !== 'http://' + req.headers.host) return 'origine refusée';
  if (req.method === 'POST') {
    if (req.headers['x-rayle-multi'] !== '1') return 'en-tête manquant';
    if (!/^application\/json/i.test(String(req.headers['content-type'] || ''))) return 'JSON attendu';
  } else if (req.method !== 'GET') return 'méthode refusée';
  return null;
}
const lireCorps = req => new Promise((resolve, reject) => {
  let n = 0; const morceaux = [];
  req.on('data', c => { n += c.length; if (n > 8192) { reject(new Error('corps trop gros')); req.destroy(); } else morceaux.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); } catch (e) { reject(new Error('JSON invalide')); } });
  req.on('error', reject);
});
const nombre = (v, def = 0) => Number.isFinite(Number(v)) ? Math.round(Number(v)) : def;

export function creerMulti(env = process.env) {
  const nav = navigateur(env);
  const dispo = () => process.platform === 'win32' && !!nav.exe && fs.existsSync(SCRIPT_FENETRES);
  let demande = 0;      // « active le mode multi-écrans » demandé par le raccourci « Rayle Multi-écrans » alors que Rayle était déjà ouvert (lu une fois par la page)
  let cache = { t: 0, v: null };

  /* Navigateur de la fenêtre principale : {trouve, exe, userDataDir, profileDirectory, application} ; à défaut, le navigateur et le profil de l'application. */
  async function contexte(force) {
    if (!force && cache.v && Date.now() - cache.t < 15000) return cache.v;
    const r = dispo() ? await fen('contexte') : { ok: false };
    const v = r.ok && r.trouve ? { trouve: true, exe: r.exe || nav.exe, userDataDir: r.userDataDir || null, profileDirectory: r.profileDirectory || null, application: !!r.application }
      : { trouve: false, exe: nav.exe, userDataDir: nav.profil, profileDirectory: null, application: true };
    cache = { t: Date.now(), v }; return v;
  }
  const filtreProfil = ctx => (ctx.userDataDir ? ['-Profil', ctx.userDataDir] : []);   // sans profil : tous les processus d'Edge/Chrome, retrouvés par TITRE seulement

  async function ouvrir(hote, corps) {
    if (!dispo()) return { ok: false, erreur: 'navigateur introuvable' };
    const id = String(corps.id || ''); if (!ID_FENETRE.test(id)) return { ok: false, erreur: 'identifiant de fenêtre invalide' };
    const e = corps.ecran || {}, x = nombre(e.x), y = nombre(e.y), w = nombre(e.w), h = nombre(e.h);
    if (w < 200 || h < 200 || w > 20000 || h > 20000) return { ok: false, erreur: 'taille d’écran invalide' };
    const ctx = await contexte();
    const deja = await fen('fenetres', filtreProfil(ctx));
    if (deja.ok && (deja.fenetres || []).some(f => f.titre.includes(MARQUE(id)))) return { ok: true, deja: true };
    const url = 'http://' + hote + '/?ecran=' + id;
    const options = ['--app=' + url, ...(ctx.userDataDir ? ['--user-data-dir=' + ctx.userDataDir] : []), ...(ctx.profileDirectory ? ['--profile-directory=' + ctx.profileDirectory] : []),
      '--window-position=' + (x + 40) + ',' + (y + 40), '--window-size=' + Math.max(300, w - 80) + ',' + Math.max(300, h - 80),
      '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'];
    try { spawn(ctx.exe, options, { detached: true, stdio: 'ignore', windowsHide: false }).unref(); } catch (err) { return { ok: false, erreur: 'lancement impossible : ' + err.message }; }
    const r = await fen('placer', [...filtreProfil(ctx), '-Marque', MARQUE(id), '-X', String(x), '-Y', String(y), '-W', String(w), '-H', String(h), '-Attente', '25'], { timeout: 45000 });
    return r.ok ? { ok: true, place: { x: r.x, y: r.y, w: r.w, h: r.h } } : { ok: false, erreur: 'la fenêtre ne s’est pas ouverte (' + (r.erreur || 'inconnue') + ')' };
  }
  async function fermer(corps) {
    if (!dispo()) return { ok: false, erreur: 'navigateur introuvable' };
    const ctx = await contexte();
    if (corps.tout === true) {
      // Application Rayle : on ferme toutes ses fenêtres (le lanceur arrête ensuite le serveur). Navigateur normal : on ferme les fenêtres des autres écrans seulement ;
      // l'onglet de Rayle reste (fermer un onglet depuis ici fermerait aussi tes autres onglets) : la page le dit.
      if (ctx.application) return fen('fermer', [...filtreProfil(ctx), '-Tout']);
      const r = await fen('fermer', [...filtreProfil(ctx), '-Marque', '[rayle-sat-']);
      return { ...r, principaleOuverte: true };
    }
    if (corps.satellites === true) return fen('fermer', [...filtreProfil(ctx), '-Marque', '[rayle-sat-']);
    const id = String(corps.id || ''); if (!ID_FENETRE.test(id)) return { ok: false, erreur: 'identifiant de fenêtre invalide' };
    return fen('fermer', [...filtreProfil(ctx), '-Marque', MARQUE(id)]);
  }
  /* Lance (ou ramène) l'application Rayle avec le mode multi-écrans : c'est ce que fait le raccourci du Bureau. */
  function lancerApplication(port, multi) {
    const vbs = path.join(DOSSIER, multi ? 'RayleMulti.vbs' : 'Rayle.vbs');
    if (!fs.existsSync(vbs)) return { ok: false, erreur: 'lanceur introuvable' };
    spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore', env: { ...process.env, ...(port && port !== '8000' ? { RAYLE_PORT: port } : {}) } }).unref();
    return { ok: true };
  }

  /* Traite une requête /__multi/… ; renvoie true si elle a été prise en charge. */
  async function gerer(req, res, chemin) {
    const json = (code, obj) => { const t = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(t) }); res.end(t); };
    const refus = requeteAutorisee(req); if (refus) return json(403, { ok: false, erreur: refus });
    try {
      const route = chemin.replace(/^\/__multi\//, '');
      if (req.method === 'GET') {
        if (route === 'etat') { const ctx = dispo() ? await contexte() : null; return json(200, { ok: true, version: VERSION_MULTI, disponible: dispo(), plateforme: process.platform, navigateur: nav.exe ? path.basename(nav.exe) : null, application: ctx ? ctx.application : null, fenetrePrincipaleVue: ctx ? ctx.trouve : null }); }
        if (route === 'demande') { const vrai = demande > 0 && Date.now() - demande < 60000; demande = 0; return json(200, { ok: true, activer: vrai }); }
        if (!dispo()) return json(200, { ok: false, erreur: 'le mode multi-écrans demande Windows avec Microsoft Edge ou Google Chrome' });
        const ctx = await contexte(route === 'ecrans');
        if (route === 'ecrans') return json(200, { ...(await fen('ecrans', filtreProfil(ctx))), application: ctx.application });
        if (route === 'fenetres') return json(200, await fen('fenetres', filtreProfil(ctx)));
        return json(404, { ok: false, erreur: 'route inconnue' });
      }
      const corps = await lireCorps(req);
      const port = (/:(\d+)$/.exec(String(req.headers.host)) || [])[1] || '80';
      if (route === 'identifier') {
        if (process.platform !== 'win32') return json(200, { ok: false, erreur: 'Windows seulement' });
        const duree = Math.max(1, Math.min(10, nombre(corps.duree, 3)));
        spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', SCRIPT_IDENTIFIER, '-Duree', String(duree)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return json(200, { ok: true });
      }
      if (route === 'demander') { if (corps.action !== 'activer') return json(400, { ok: false, erreur: 'action inconnue' }); demande = Date.now(); return json(200, { ok: true }); }
      if (route === 'lancer') return json(200, process.platform === 'win32' ? lancerApplication(port, corps.multi !== false) : { ok: false, erreur: 'Windows seulement' });
      if (route === 'ouvrir') return json(200, await ouvrir(req.headers.host, corps));
      if (route === 'fermer') return json(200, await fermer(corps));
      return json(404, { ok: false, erreur: 'route inconnue' });
    } catch (e) { return json(400, { ok: false, erreur: e.message }); }
  }
  return { gerer, nav, dispo, attendre, contexte };
}
