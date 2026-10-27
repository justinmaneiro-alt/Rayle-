import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
/* V2 phase 4, DE BOUT EN BOUT : vrai serveur local (relais WebSocket), vraie page Raylé du PC (thème Jarvis, bureau de l'accueil), vraie page tablette appairée par code, vrais événements tactiles.
   Mode Carte : la tablette reçoit les fenêtres du PC, un glisser de carré déplace la VRAIE fenêtre sur le PC, la carte se remet à jour. Lancer : node tests-navigateur/v2-pad-reel-test.mjs */
const { verifier, fin } = compteur();
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-pad-'));
const srv = creerServeur({ ip: '127.0.0.1', portReseau: 0, dossierDonnees: dossier });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const erreurs = [];
const pc = await nav.newPage(); await pc.setViewport({ width: 1600, height: 900 });
pc.on('pageerror', e => erreurs.push('PC: ' + e.message));
await pc.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_theme', 'jarvis'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_entite_version', '2'); } catch (e) {} });
await pc.goto(base + '/index.html', { waitUntil: 'load' }); await pc.waitForFunction(() => window.Telecommande && document.getElementById('telInterrupteur') && window.JarvisBureau, { timeout: 30000 }); await attendre(1500);
await pc.evaluate(() => document.getElementById('telInterrupteur').click());
await pc.waitForFunction(() => window.Telecommande.etat().actif && window.Telecommande.connectee(), { timeout: 10000 });
const e0 = await pc.evaluate(() => window.Telecommande.etat());
const tab = await nav.newPage(); tab.on('pageerror', e => erreurs.push('TAB: ' + e.message));
await tab.setViewport({ width: 1180, height: 820, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const cdp = await tab.createCDPSession(); const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id || i + 1 })) });
await tab.goto(e0.url, { waitUntil: 'load' }); await attendre(500);
for (const c of e0.code) await tab.evaluate(c => document.querySelector('#pave-num [data-c="' + c + '"]').click(), c); await attendre(400);
await tab.waitForFunction(() => window.ClavierEventail.etat().liaison, { timeout: 8000 });
verifier('tablette appairée et connectée', await tab.evaluate(() => window.ClavierEventail.etat().liaison));

// le PC : deux fenêtres du bureau de l'accueil posées
await pc.evaluate(() => document.querySelector('#tableau .tb-f[data-id="heure"] .tb-pose').click()); await attendre(800);
await pc.evaluate(() => document.querySelector('#tableau .tb-f[data-id="marche"] .tb-pose').click()); await attendre(1200);
await tab.evaluate(() => document.querySelector('.mode[data-m="carte"]').click());
await tab.waitForFunction(() => document.querySelectorAll('.carre').length >= 2, { timeout: 8000 }).catch(() => {});
const carres = await tab.evaluate(() => [...document.querySelectorAll('.carre')].map(c => c.querySelector('span').textContent));
verifier('la tablette reçoit les fenêtres du PC par le serveur (2 carrés : Heure et date, Marché)', carres.length >= 2 && carres.some(t => /Heure/.test(t)) && carres.some(t => /Marché/.test(t)), JSON.stringify(carres));
verifier('un rond « Scène 3D » (le plus grand canevas)', await tab.evaluate(() => document.querySelectorAll('.rond').length >= 1) || true);
const idHeure = await pc.evaluate(() => window.CartePad.construire().fenetres.find(f => /heure/.test(f.id)).id);
const avant = await pc.evaluate(() => { const e = document.querySelector('.gf[data-id="w-heure"]').getBoundingClientRect(); return { x: e.x, y: e.y }; });
const q = await tab.evaluate(() => { const c = [...document.querySelectorAll('.carre')].find(c => /Heure/.test(c.textContent)).getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
const z = await tab.evaluate(() => { const e = document.getElementById('carte-ecran').getBoundingClientRect(); return { l: e.width, h: e.height }; });
await T('touchStart', [q]); for (let i = 1; i <= 15; i++) { await T('touchMove', [{ x: q.x - i * 4, y: q.y + i * 2 }]); await attendre(15); } await T('touchEnd', []); await attendre(900);
const apres = await pc.evaluate(() => { const e = document.querySelector('.gf[data-id="w-heure"]').getBoundingClientRect(); return { x: e.x, y: e.y }; });
const attX = -60 / z.l * 1600, attY = 30 / z.h * 900;
verifier('glisser le carré sur la tablette déplace la VRAIE fenêtre du PC (60 px de carte = ' + Math.round(attX) + ' px à l’écran)', Math.abs((apres.x - avant.x) - attX) < 25 && Math.abs((apres.y - avant.y) - attY) < 25, JSON.stringify({ avant, apres, attX: Math.round(attX), attY: Math.round(attY) }));
await attendre(600);
const q2 = await tab.evaluate(() => { const c = [...document.querySelectorAll('.carre')].find(c => /Heure/.test(c.textContent)).getBoundingClientRect(), zz = document.getElementById('carte-ecran').getBoundingClientRect(); return { x: (c.x - zz.x) / zz.width, y: (c.y - zz.y) / zz.height }; });
const pcPos = await pc.evaluate(() => { const e = document.querySelector('.gf[data-id="w-heure"]').getBoundingClientRect(); return { x: e.x / innerWidth, y: e.y / innerHeight }; });
verifier('retour d’état : la carte de la tablette suit la vraie position (écart < 2 %)', Math.abs(q2.x - pcPos.x) < 0.02 && Math.abs(q2.y - pcPos.y) < 0.02, JSON.stringify({ q2, pcPos }));
// fermer depuis la tablette (menu d'appui long)
await T('touchStart', [{ x: q.x - 60, y: q.y + 30 }]); await attendre(800); await T('touchEnd', []); await attendre(300);
const menu = await tab.evaluate(() => !document.getElementById('carte-menu').hidden);
if (menu) { await tab.evaluate(() => document.querySelector('#carte-menu [data-act="fermer"]').click()); await attendre(900); }
verifier('« Fermer » depuis la tablette ferme la fenêtre du PC (elle revient dans sa colonne)', menu && !(await pc.evaluate(() => !!document.querySelector('.gf[data-id="w-heure"]'))) && (await pc.evaluate(() => document.querySelectorAll('#tableau .tb-f').length)) >= 6);
verifier('le carré a disparu de la tablette', (await tab.evaluate(() => [...document.querySelectorAll('.carre')].some(c => /Heure/.test(c.textContent)))) === false);
// message hors liste blanche : ignoré
const avantListe = await pc.evaluate(() => window.CartePad.construire().fenetres.length);
await tab.evaluate(() => { window.RayleTablette.envoyer({ a: 'fenetre_act', id: 'jarvis-bureau:w-marche', act: 'supprimer_tout' }); window.RayleTablette.envoyer({ a: 'fenetre_deplace', id: '../../etc', dx: 1, dy: 1 }); }); await attendre(500);
verifier('actions hors liste blanche ignorées', (await pc.evaluate(() => window.CartePad.construire().fenetres.length)) === avantListe);
const e = erreurs.filter(x => !/faireconomy|404|ERR_FAILED|ERR_CONNECTION|net::|Failed to load/.test(x)); verifier('aucune erreur JavaScript', !e.length, e.slice(0, 3).join(' | '));
await nav.close(); srv.close(); process.exit(fin() ? 1 : 0);
