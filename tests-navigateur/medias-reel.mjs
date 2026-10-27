import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { attendre } from './terre-aide.mjs';

/* Diagnostic des médias avec le VRAI Worker en ligne et le vrai jeton de ton navigateur (le jeton reste dans le navigateur : il n'est ni lu ici ni affiché).
   Lance l'application Rayle (raccourci réel, port de contrôle 9449), interroge /images et /videos comme la page, essaie « parle-moi de la tour Eiffel » sans parole,
   et affiche : réponse des routes, état de la fenêtre Médias, erreurs de console, requêtes d'images bloquées. CAPTURES=<dossier> pour une capture.
   Lancer :  node tests-navigateur/medias-reel.mjs        (ferme l'application à la fin si elle n'était pas ouverte avant) */
const RACINE = path.resolve(import.meta.dirname, '..'), CAPTURES = process.env.CAPTURES || '';
const DBG = 9449;
let nav = null, lance = false;
try { nav = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + DBG, defaultViewport: null }); } catch (e) {}
if (!nav) {
  spawn('wscript.exe', [path.join(RACINE, 'app-pc', 'Rayle.vbs')], { detached: true, stdio: 'ignore', env: { ...process.env, RAYLE_DEBUG_PORT: String(DBG) } }).unref(); lance = true;
  for (let i = 0; i < 80 && !nav; i++) { try { nav = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + DBG, defaultViewport: null }); } catch (e) { await attendre(500); } }
}
const page = await (async () => { for (let i = 0; i < 60; i++) { const p = (await nav.pages()).find(x => /127\.0\.0\.1:8000/.test(x.url())); if (p) return p; await attendre(500); } })();
const consoles = [], bloquees = [], echecs = [];
page.on('console', m => { const t = m.text(); if (/médias|Refused|Content Security|blocked|CSP|Failed to load resource/i.test(t) && !/calendar|faireconomy/.test(t)) consoles.push(m.type() + ' : ' + t.slice(0, 220)); });
page.on('requestfailed', r => { if (/wikimedia|ytimg|archive\.org/.test(r.url())) echecs.push(r.url().slice(0, 90) + ' → ' + (r.failure() && r.failure().errorText)); });
page.on('response', r => { if (/wikimedia|ytimg|archive\.org/.test(r.url())) bloquees.push(r.status() + ' ' + r.url().slice(0, 90)); });
await attendre(5000);
if (process.env.REPARER === '1') {   // une qualité « 2D très léger » restée enregistrée par le mode jeu est retirée (retour au mode automatique) ; un autre choix n'est jamais touché
  const q = await page.evaluate(() => localStorage.getItem('rayle_entite_qualite'));
  console.log('qualité enregistrée avant :', q);
  if (q === '3') { await page.evaluate(() => localStorage.removeItem('rayle_entite_qualite')); await page.reload({ waitUntil: 'load' }); await attendre(6000); console.log('→ retirée, page rechargée'); }
}
await page.evaluate(() => { try { Panneaux.fermerTout(); } catch (e) {} window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; });
const lire = () => page.evaluate(() => ({
  hud: document.body.dataset.hud, medias: localStorage.getItem('rayle_medias'), videos: localStorage.getItem('rayle_videos'), caseMedias: document.getElementById('kMedias') && document.getElementById('kMedias').checked,
  worker: (() => { try { return workerReady(); } catch (e) { return 'erreur'; } })(), profil: window.MediasHolo ? MediasHolo.profil() : 'MediasHolo absent', classer: window.MediasContenu ? MediasContenu.classer('parle-moi de la tour Eiffel') : null,
  scripts: { medias: !!window.MediasHolo, images: !!window.ImagesHolo }, meta_csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')
}));
console.log('ÉTAT PAGE :', JSON.stringify(await lire()));
const routes = await page.evaluate(async () => {
  const sortie = {};
  for (const [nom, chemin] of [['images', '/images?q=' + encodeURIComponent('tour Eiffel') + '&n=3'], ['videos', '/videos?q=' + encodeURIComponent('tour Eiffel') + '&type=savoir&n=2']]) {
    const t0 = performance.now();
    try { const r = await wjson(chemin, 15000); sortie[nom] = { ms: Math.round(performance.now() - t0), images: r.images && r.images.map(i => ({ titre: i.titre, origine: i.origine, mini: i.miniature && i.miniature.slice(0, 70), licence: i.licence })), videos: r.videos && r.videos.map(v => v.plateforme + ' ' + v.titre.slice(0, 40)), sujet: r.sujet && r.sujet.titre, raison: r.raison, cache: r.cache }; }
    catch (e) { sortie[nom] = { erreur: String((e && e.message) || e) }; }
  }
  return sortie;
});
console.log('ROUTES (vrai Worker) :', JSON.stringify(routes, null, 1));
await page.evaluate(() => { addLine('user', 'parle-moi de la tour Eiffel'); window.__t0 = performance.now(); MediasHolo.lancer('parle-moi de la tour Eiffel'); addLine('ray', 'Réponse de test (le texte reste la réponse).'); MediasHolo.montrer(); });
await attendre(6000);
console.log('FENÊTRE MÉDIAS :', JSON.stringify(await page.evaluate(() => MediasHolo.etat())));
console.log('PANNEAUX :', JSON.stringify(await page.evaluate(() => Panneaux.liste())));
console.log('IMAGES AFFICHÉES :', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.med-thumb img')].map(i => ({ complete: i.complete, w: i.naturalWidth, src: i.src.slice(0, 80) })))));
console.log('RÉPONSES IMAGES :', bloquees.slice(0, 6).join(' | '), '| ÉCHECS :', echecs.join(' | '));
console.log('CONSOLE :', consoles.join(' | ') || '(rien)');
if (CAPTURES) { fs.mkdirSync(CAPTURES, { recursive: true }); await page.screenshot({ path: path.join(CAPTURES, 'medias-reel.png') }); }
await nav.disconnect();
if (lance) { await attendre(500); spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(RACINE, 'app-pc', 'fenetres.ps1'), '-Action', 'fermer', '-Tout', '-Profil', path.join(process.env.LOCALAPPDATA, 'Rayle', 'profil-edge')], { stdio: 'ignore' }); }
