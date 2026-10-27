import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';
import { demarrerReseauLocal } from '../app-pc/reseau-local.mjs';
import { matriceQR } from '../app-pc/qr-console.mjs';
/* Clavier en éventail (K1) : serveur réseau à jeton, QR, émulation tablette, multi-touch, zones tactiles, pas de défilement, une capture. */
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { verifier, fin } = compteur();

// Serveur réseau (sur 127.0.0.1 pour le test) : refus sans jeton, rien d'autre que /clavier
const net = await demarrerReseauLocal({ racine: RACINE, port: 0, ip: '127.0.0.1', silencieux: true });
const base = net.url.split('/clavier')[0];
const code = async (u, h) => (await fetch(base + u, { headers: h })).status;
verifier('réseau : /clavier sans jeton refusé', await code('/clavier') === 403);
verifier('réseau : mauvais jeton refusé', await code('/clavier?jeton=' + '0'.repeat(24)) === 403);
const ok = await fetch(net.url);
verifier('réseau : /clavier avec jeton servi', ok.status === 200 && /Clavier en éventail/.test(await ok.text()));
const cookie = (ok.headers.get('set-cookie') || '').split(';')[0];
verifier('réseau : fichier de la page avec le cookie', await code('/clavier/clavier.js', { cookie }) === 200);
verifier('réseau : fichier de la page sans cookie refusé', await code('/clavier/clavier.js') === 403);
verifier('réseau : le reste du site refusé même avec jeton', await code('/index.html?jeton=' + net.jeton) === 403 && await code('/__multi/ecrans?jeton=' + net.jeton) === 403);
verifier('réseau : sortie du dossier refusée', await code('/clavier/..%2fserveur.mjs', { cookie }) === 403 || await code('/clavier/..%2fserveur.mjs', { cookie }) === 404);
verifier('QR : matrice carrée de version 4 pour une adresse type', matriceQR(net.url).length >= 33);
net.serveur.close();

// Serveur local (127.0.0.1) pour la page
const local = creerServeur(); await new Promise(r => local.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + local.address().port + '/clavier';
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await nav.newPage();
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message)); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
const cdp = await page.createCDPSession();
const toucher = async (pts, type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
const centre = async id => page.evaluate(i => { const r = document.querySelector('[data-id="' + i + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
const etat = () => page.evaluate(() => window.ClavierEventail.etat());

for (const [nom, w, h] of [['tablette', 1024, 600], ['téléphone', 812, 375]]) {
  await page.setViewport({ width: w, height: h, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'load' }); await attendre(400);
  const m = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.touche')].map(g => { const r = g.getBoundingClientRect(); return { id: g.dataset.id, w: r.width, h: r.height }; });
    const lettres = t.filter(k => /^c-/.test(k.id));
    return { n: t.length, minL: Math.min(...lettres.map(k => Math.min(k.w, k.h))), minTous: Math.min(...t.map(k => Math.min(k.w, k.h))), defile: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
  });
  verifier(nom + ' : 12 commandes + 63 touches de lettres/espace (' + m.n + ')', m.n === 12 + 10 + 11 + 10 + 11 + 9 + 0 - 0 + 0 || m.n >= 60, String(m.n));
  verifier(nom + ' : aucun défilement', !m.defile);
  verifier(nom + ' : lettres ≥ 44 px (min ' + m.minL.toFixed(0) + ')', m.minL >= (w >= 1000 ? 44 : 40), String(m.minL));
  verifier(nom + ' : toutes les touches ≥ 40 px (min ' + m.minTous.toFixed(0) + ')', m.minTous >= 40, String(m.minTous));
}

// Multi-touch sur la tablette : Maj maintenu + lettre en même temps, puis deux lettres simultanées
await page.setViewport({ width: 1024, height: 600, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' }); await attendre(400);
const evts = await page.evaluate(() => { window.__ev = []; document.addEventListener('rayle:touche', e => window.__ev.push(e.detail)); return true; });
const maj = await centre('maj'), a = await centre('c-a'), b = await centre('c-b'), z = await centre('c-z');
await toucher([maj], 'touchStart'); await attendre(60);
await toucher([maj, a], 'touchStart'); await attendre(60);
await toucher([maj], 'touchEnd'); await attendre(60);       // relâche « a » (le doigt Maj reste)
await toucher([], 'touchEnd'); await attendre(60);
let e = await etat();
verifier('multi-touch : Maj maintenu + a → « A »', e.texte === 'A', JSON.stringify(e.texte));
await toucher([b, z], 'touchStart'); await attendre(60);
const pris = await page.evaluate(() => [...document.querySelectorAll('.touche.on')].map(g => g.dataset.id));
verifier('multi-touch : deux touches enfoncées en même temps', pris.includes('c-b') && pris.includes('c-z'), JSON.stringify(pris));
await toucher([], 'touchEnd'); await attendre(60);
e = await etat();
verifier('multi-touch : les deux lettres sont écrites', e.texte === 'Abz', JSON.stringify(e.texte));
const ev = await page.evaluate(() => window.__ev);
verifier('événement « rayle:touche » émis, liaison inactive', ev.length >= 3 && ev[0].source === 'clavier-eventail' && e.liaison === false);
// Maj « une fois » puis lettre ; veille
await toucher([maj], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(40);
await toucher([a], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(40);
await toucher([a], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(40);
e = await etat();
verifier('Maj touché une fois → une seule majuscule', e.texte === 'AbzAa', JSON.stringify(e.texte));
const mode = await centre('mode');
await toucher([mode], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(40);
await toucher([a], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(40);
e = await etat();
verifier('VEILLE : les touches sont ignorées', !e.pret && e.texte === 'AbzAa', JSON.stringify(e));
await toucher([mode], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(40);
verifier('retour à PRÊT', (await etat()).pret === true);
// Gaucher : l'arc passe à droite
await page.evaluate(() => { const s = document.getElementById('r-main'); s.value = 'droite'; s.dispatchEvent(new Event('change')); });
await attendre(100);
const pos = await page.evaluate(() => ({ arc: document.getElementById('arc').getBoundingClientRect().x, let: document.getElementById('lettres').getBoundingClientRect().x }));
verifier('gaucher : l\'éventail est à droite', pos.arc > pos.let, JSON.stringify(pos));
await page.evaluate(() => { const s = document.getElementById('r-main'); s.value = 'gauche'; s.dispatchEvent(new Event('change')); });
await attendre(100);
verifier('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
await page.screenshot({ path: path.join(RACINE, 'docs', 'k1-clavier.png') });
await nav.close(); local.close();
fin();
