import { execFileSync, spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compteur, attendre } from './terre-aide.mjs';

/* Mode multi-écrans : ce qui a échoué sur le PC de Justin, avec de VRAIES fenêtres sur les vrais écrans.
   P. un serveur local ANCIEN (lancé avant la mise à jour, il répond 404 aux routes du mode) : le lanceur le détecte et le redémarre ;
   O. Rayle est déjà ouvert et on clique sur « Rayle Multi-écrans » (vrai RayleMulti.vbs) : la fenêtre ouverte active le mode, rien n'est dupliqué ;
   N. Rayle dans un ONGLET de navigateur normal (pas l'application) : le mode marche quand même, dans le même navigateur ; « Ferme tout » ferme les autres écrans et laisse l'onglet.
   Isolé de ton Rayle (port 8123, données dans %TEMP%\rayle-multi-lancement). Des fenêtres s'ouvrent et se ferment sur tes écrans (≈ 2 minutes).
   Lancer :  node tests-navigateur/multi-ecrans-lancement-test.mjs */
const { verifier, fin } = compteur();
const RACINE = path.resolve(import.meta.dirname, '..');
const PORT = 8123, BASE = 'http://127.0.0.1:' + PORT, DBG = 9447, DBG_N = 9448;
const DONNEES = path.join(os.tmpdir(), 'rayle-multi-lancement'), PROFIL_APP = path.join(DONNEES, 'profil-edge'), PROFIL_N = path.join(DONNEES, 'navigateur-normal');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const ps = (...a) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...a], { encoding: 'utf8' }).trim();
const fen = (profil, action, ...extra) => JSON.parse(ps('-File', path.join(RACINE, 'app-pc', 'fenetres.ps1'), '-Action', action, ...(profil ? ['-Profil', profil] : []), ...extra));
const sats = profil => (fen(profil, 'fenetres').fenetres || []).filter(f => /\[rayle-sat-/.test(f.titre));
const procs = motif => Number(ps('-Command', `(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*${motif}*') } | Measure-Object).Count`));
const serveurs = () => ps('-Command', `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*serveur.mjs*${PORT}*' } | ForEach-Object { $_.ProcessId }`).split(/\s+/).filter(Boolean);
const journal = () => { try { return fs.readFileSync(path.join(DONNEES, 'lancement.log'), 'utf8'); } catch (e) { return ''; } };
const http = async (chemin, opt = {}) => { try { const r = await fetch(BASE + chemin, { signal: AbortSignal.timeout(2500), ...opt }); return { code: r.status, texte: await r.text() }; } catch (e) { return { code: 0, texte: '' }; } };
async function jusqua(cond, max = 30000, pas = 400) { const t0 = Date.now(); while (Date.now() - t0 < max) { try { const v = await cond(); if (v) return v; } catch (e) {} await attendre(pas); } return false; }
const tuer = () => { try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*rayle-multi-lancement*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*${PORT}*' -and $_.CommandLine -like '*serveur.mjs*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]); } catch (e) {} };
const connecter = async port => { for (let i = 0; i < 60; i++) { try { return await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null }); } catch (e) { await attendre(500); } } return null; };
const pagesRayle = async nav => (await nav.pages()).filter(p => p.url().startsWith(BASE));
const env = { ...process.env, RAYLE_DONNEES: DONNEES, RAYLE_DEBUG_PORT: String(DBG), RAYLE_PORT: String(PORT) };

tuer(); fs.rmSync(DONNEES, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }); fs.mkdirSync(path.join(DONNEES, 'ancien'), { recursive: true });
let nav = null;
try {
  // ══ P. serveur ANCIEN : le lanceur le remplace ══
  fs.writeFileSync(path.join(DONNEES, 'ancien', 'serveur.mjs'), `import http from 'node:http'; http.createServer((q, r) => { if (q.url.startsWith('/__multi')) { r.writeHead(404); return r.end('introuvable'); } r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<html><title>RAYL ancien</title></html>'); }).listen(Number(process.argv[2]), '127.0.0.1');`);
  spawn(process.execPath, [path.join(DONNEES, 'ancien', 'serveur.mjs'), String(PORT)], { stdio: 'ignore', windowsHide: true });
  await jusqua(async () => (await http('/index.html')).code === 200, 8000);
  const ancienPid = serveurs()[0];
  verifier('P. départ : un ancien serveur répond 404 au mode multi-écrans', (await http('/__multi/etat')).code === 404 && !!ancienPid);
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(RACINE, 'app-pc', 'lancer-rayle.ps1'), '-Port', String(PORT)], { stdio: 'ignore', env, windowsHide: true });
  nav = await connecter(DBG);
  const maj = await jusqua(async () => { const r = await http('/__multi/etat'); return r.code === 200 && JSON.parse(r.texte).version >= 2; }, 40000);
  verifier('P. le lanceur détecte l’ancien serveur, l’arrête et en démarre un nouveau qui connaît le mode', !!maj && /ANCIEN/.test(journal()) && /ancien serveur arrete/.test(journal()) && /serveur demarre/.test(journal()) && serveurs()[0] !== ancienPid, journal().split('\n').slice(-6).join(' | '));
  verifier('P. l’application s’ouvre (fenêtre principale)', !!nav && !!(await jusqua(async () => (await pagesRayle(nav)).length >= 1, 30000)));
  const principale = (await pagesRayle(nav))[0];
  await attendre(5000);
  verifier('P. l’état du serveur dit « application » : oui', JSON.parse((await http('/__multi/etat')).texte).application === true);
  verifier('P. au lancement normal : aucune fenêtre satellite', sats(PROFIL_APP).length === 0);

  // ══ O. Rayle déjà ouvert, clic sur « Rayle Multi-écrans » ══
  const avant = sats(PROFIL_APP).length;
  spawn('wscript.exe', [path.join(RACINE, 'app-pc', 'RayleMulti.vbs')], { detached: true, stdio: 'ignore', env }).unref();
  const venus = await jusqua(() => sats(PROFIL_APP).length >= 2, 60000, 1000);
  verifier('O. second clic sur « Rayle Multi-écrans » (Rayle déjà ouvert) : le mode s’active dans la fenêtre ouverte', avant === 0 && !!venus, `${avant} → ${sats(PROFIL_APP).length}`);
  verifier('O. le journal du lanceur le dit, sans second Rayle', /demande du mode multi-ecrans envoyee/.test(journal()) && (await pagesRayle(nav)).filter(p => !/ecran=/.test(p.url())).length === 1);
  const fo = fen(PROFIL_APP, 'fenetres').fenetres.filter(f => /RAYL/.test(f.titre) && !/\[rayle-sat-/.test(f.titre));
  verifier('O. une seule fenêtre principale', fo.length === 1, fo.length + '');
  await attendre(2000);
  verifier('O. la page est bien en mode actif', await principale.evaluate(() => MultiEcrans.actif() === true));
  await principale.keyboard.down('Control'); await principale.keyboard.press('F9'); await principale.keyboard.up('Control');
  const toutFerme = await jusqua(() => procs('rayle-multi-lancement') === 0 && serveurs().length === 0, 60000, 1000);
  verifier('O. « Ferme tout » : plus aucune fenêtre ni serveur', !!toutFerme, `processus ${procs('rayle-multi-lancement')}, serveurs ${serveurs().length}`);
  nav = null;

  // ══ N. NAVIGATEUR NORMAL (onglet, pas l'application) ══
  fs.mkdirSync(PROFIL_N, { recursive: true });
  spawn(process.execPath, [path.join(RACINE, 'serveur.mjs'), String(PORT)], { stdio: 'ignore', env, windowsHide: true });
  await jusqua(async () => (await http('/index.html')).code === 200, 10000);
  spawn(EDGE, ['--user-data-dir=' + PROFIL_N, '--remote-debugging-port=' + DBG_N, '--no-first-run', '--no-default-browser-check', '--window-size=1500,900', '--window-position=100,100', BASE + '/'], { stdio: 'ignore' });
  nav = await connecter(DBG_N);
  const onglet = nav && await jusqua(async () => (await pagesRayle(nav))[0], 30000);
  verifier('N. Rayle s’ouvre dans un onglet d’Edge normal (aucune option « application »)', !!onglet);
  await attendre(5000);
  const ctxN = JSON.parse((await http('/__multi/etat')).texte);
  verifier('N. le serveur voit que ce n’est PAS l’application (onglet de navigateur)', ctxN.application === false && ctxN.fenetrePrincipaleVue === true, JSON.stringify(ctxN));
  await onglet.evaluate(() => { localStorage.setItem('rayle_boot', '0'); });
  await onglet.bringToFront();
  const mess = await onglet.evaluate(async () => { const r = await MultiEcrans.activer(); return { r, actif: MultiEcrans.actif() }; });
  const sN = await jusqua(async () => (await pagesRayle(nav)).filter(p => /ecran=/.test(p.url())).length >= 2, 60000, 800);
  verifier('N. le mode s’active depuis un onglet : une fenêtre par écran, dans le MÊME navigateur', !!sN && mess.actif === true, JSON.stringify(mess));
  await attendre(4000);
  const fN = sats(PROFIL_N), ecrans = JSON.parse(ps('-File', path.join(RACINE, 'app-pc', 'fenetres.ps1'), '-Action', 'ecrans')).ecrans;
  verifier('N. fenêtres placées sur leurs écrans (tolérance 2 px)', fN.length === 2 && fN.every(f => ecrans.some(e => f.x === e.x && f.y === e.y && f.w === e.w && Math.abs(f.h - e.h) <= 2)), fN.map(f => `${f.x},${f.y} ${f.w}×${f.h}`).join(' | '));
  await onglet.evaluate(() => { addLine('ray', 'Message de synchronisation entre onglet et fenêtres.'); });
  await attendre(1200);
  let synchro = ''; for (const p of (await pagesRayle(nav)).filter(p => /ecran=/.test(p.url()))) { const t = await p.evaluate(() => (document.querySelector('.mx-conv') || {}).innerText || ''); if (t) synchro = t; }
  verifier('N. les fenêtres se parlent (conversation de l’onglet visible dans le satellite)', /synchronisation entre onglet/.test(synchro));
  verifier('N. « Ferme tout » : les fenêtres des autres écrans se ferment, l’onglet Rayle reste', await (async () => {
    const r = await onglet.evaluate(async () => { const x = await MultiEcrans.fermerTout(); return x; });
    await jusqua(() => sats(PROFIL_N).length === 0, 20000);
    return sats(PROFIL_N).length === 0 && !!(await pagesRayle(nav)).find(p => !/ecran=/.test(p.url())) && r.principaleOuverte === true;
  })());
  verifier('N. l’onglet affiche l’explication (ferme-le avec Ctrl+W)', await onglet.evaluate(() => /Ctrl\+W/.test(document.getElementById('log').innerText)));
  verifier('N. le bouton « Ouvrir l’application » est proposé dans ⚙ (onglet de navigateur)', await onglet.evaluate(async () => { document.getElementById('gear').click(); await new Promise(r => setTimeout(r, 800)); return !!document.getElementById('mxLancer'); }));
  verifier('N. rien d’autre n’a été fermé : l’onglet de Rayle est toujours là', (await pagesRayle(nav)).length >= 1);
} catch (e) {
  verifier('Aucune exception pendant le test', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
} finally {
  try { if (nav) await nav.disconnect(); } catch (e) {}
  tuer(); fin();
}
