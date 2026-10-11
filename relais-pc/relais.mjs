// Relais PC de Raylé (phase 3B) : tourne en arrière-plan, invisible, très économe.
// Il lit sa file de commandes sur le Worker (/evenements?c=1) avec son propre jeton d'appareil (« PC système », révocable),
// exécute seulement la liste blanche d'actions.mjs, puis rend compte (/appareil/retour).
// Rythme : toutes les 30 s au repos (45 s après 30 minutes sans ordre), toutes les 5 s pendant 2 minutes après un ordre.
// Lancement : node relais.mjs (le script d'installation le met au démarrage de la session Windows).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plan, ps, scriptCapture, SCRIPT_BATTERIE, texteEtat } from './actions.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FICHIER_CONFIG = path.join(ICI, 'config.json'), JOURNAL = path.join(ICI, 'relais.log'), PID = path.join(ICI, 'relais.pid');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function noter(t) {
  const ligne = new Date().toLocaleString('fr-FR') + '  ' + t + '\n';
  try { if (fs.existsSync(JOURNAL) && fs.statSync(JOURNAL).size > 200e3) fs.renameSync(JOURNAL, JOURNAL + '.ancien'); fs.appendFileSync(JOURNAL, ligne); } catch (e) {}
}

// Une seule copie à la fois
try {
  const ancien = Number(fs.readFileSync(PID, 'utf8'));
  if (ancien && ancien !== process.pid) { try { process.kill(ancien, 0); noter('déjà lancé (pid ' + ancien + '), je m’arrête'); process.exit(0); } catch (e) {} }
} catch (e) {}
fs.writeFileSync(PID, String(process.pid));
process.on('exit', () => { try { if (Number(fs.readFileSync(PID, 'utf8')) === process.pid) fs.unlinkSync(PID); } catch (e) {} });

let config;
try { config = JSON.parse(fs.readFileSync(FICHIER_CONFIG, 'utf8')); } catch (e) { noter('config.json illisible : lance installer.cmd'); process.exit(1); }
const WORKER = String(config.worker || '').replace(/\/+$/, ''), JETON = String(config.jeton || '');
if (!/^https:\/\//.test(WORKER) || !/^rd_/.test(JETON)) { noter('config.json incomplète (worker, jeton) : lance installer.cmd'); process.exit(1); }
const REPOS_S = Math.max(15, Number(config.intervalle_repos_s) || 30), ACTIF_S = Math.max(3, Number(config.intervalle_actif_s) || 5);

async function appel(chemin, corps, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(WORKER + chemin, { method: corps ? 'POST' : 'GET', headers: { 'X-Rayle-Token': JETON, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined, signal: c.signal });
    return { status: r.status, d: await r.json().catch(() => ({})) };
  } finally { clearTimeout(t); }
}
// Lance une étape sans shell, sans fenêtre ; attend la fin (20 s au plus) pour les scripts PowerShell
function lancer(e, attendre) {
  return new Promise((ok) => {
    let p;
    try { p = spawn(e.prog, e.args, { shell: false, windowsHide: true, detached: !attendre, stdio: 'ignore' }); } catch (err) { ok({ code: -1, err }); return; }
    p.on('error', (err) => ok({ code: -1, err }));
    if (!attendre) { p.unref(); setTimeout(() => ok({ code: 0 }), 300); return; }
    const t = setTimeout(() => { try { p.kill(); } catch (x) {} ok({ code: -2 }); }, 20000);
    p.on('exit', (code) => { clearTimeout(t); ok({ code }); });
  });
}
const sortiePs = (script) => new Promise((ok) => {
  const e = ps(script);
  execFile(e.prog, e.args, { windowsHide: true, timeout: 20000 }, (err, out) => ok(err ? '' : String(out || '').trim()));
});

async function capture(id) {
  const f = path.join(os.tmpdir(), 'rayle-capture-' + process.pid + '.jpg');
  try {
    for (const [l, q] of [[1280, 70], [1024, 55], [800, 45]]) {
      await sortiePs(scriptCapture(f, l, q));
      if (!fs.existsSync(f)) return { ok: false, message: 'capture impossible (session verrouillée ?)' };
      const b64 = fs.readFileSync(f).toString('base64');
      if (b64.length < 14e5) {
        const r = await appel('/relais/capture', { id, image: 'data:image/jpeg;base64,' + b64 }, 30000);
        return r.status === 200 ? { ok: true, message: 'capture envoyée' } : { ok: false, message: 'envoi de la capture refusé (' + (r.d.error || r.status) + ')' };
      }
    }
    return { ok: false, message: 'capture trop lourde' };
  } finally { try { fs.unlinkSync(f); } catch (e) {} }
}
async function executer(c) {
  const a = c.action || {};
  const p = plan(a, config);
  noter('ordre ' + c.id + ' de ' + (c.de || '?') + ' : ' + a.op + (a.valeur ? ' ' + a.valeur : '') + (p.erreur ? ' → refusé : ' + p.erreur : ''));
  if (p.erreur) return { ok: false, message: p.erreur };
  if (p.special === 'capture') return await capture(c.id);
  if (p.special === 'etat') {
    let bat = null;
    try { bat = JSON.parse(await sortiePs(SCRIPT_BATTERIE) || '{}'); } catch (e) {}
    return { ok: true, message: texteEtat(os.uptime(), bat) };
  }
  if (p.differe) setTimeout(() => { for (const e of p.etapes) lancer(e, false); }, p.differe);   // la veille : d'abord rendre compte
  else for (const e of p.etapes) {
    const r = await lancer(e, e.prog === 'powershell.exe');
    if (r.code !== 0 && !p.toleree && e.prog !== 'rundll32.exe' && e.prog !== 'cmd.exe') return { ok: false, message: 'le PC n’a pas pu le faire (code ' + r.code + ')' };
  }
  return { ok: true, message: p.message };
}

let dernierOrdre = 0, erreurs = 0;
noter('relais démarré (Worker ' + WORKER.replace(/^https:\/\//, '') + ', toutes les ' + REPOS_S + ' s au repos)');
for (;;) {
  let attente = REPOS_S;
  try {
    const r = await appel('/evenements?c=1&a=0');
    if (r.status === 401) { noter('jeton refusé (appareil révoqué ?) : relance installer.cmd. Nouvel essai dans 10 minutes.'); await pause(6e5); continue; }
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    erreurs = 0;
    for (const c of (r.d.commandes || [])) {
      dernierOrdre = Date.now();
      let res;
      try { res = await executer(c); } catch (e) { res = { ok: false, message: String(e && e.message || e).slice(0, 150) }; }
      try { await appel('/appareil/retour', { id: c.id, ok: !!res.ok, message: String(res.message || '').slice(0, 200) }); } catch (e) { noter('retour impossible : ' + e.message); }
    }
    const depuis = Date.now() - dernierOrdre;
    attente = depuis < 12e4 ? ACTIF_S : depuis > 18e5 ? Math.round(REPOS_S * 1.5) : REPOS_S;
  } catch (e) {
    erreurs++;
    attente = Math.min(300, REPOS_S * Math.min(erreurs, 10));   // pas de réseau : on espace (jusqu'à 5 minutes)
    if (erreurs === 1 || erreurs % 20 === 0) noter('Worker injoignable : ' + (e.name === 'AbortError' ? 'délai dépassé' : e.message));
  }
  await pause(attente * 1000);
}
