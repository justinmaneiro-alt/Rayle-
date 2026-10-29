// V7b : aide commune des tests par APPAREIL (émulation Galaxy S23 Ultra, tablette Android, PC). Mesure aussi le réseau (fichiers chargés, octets).
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
export { BASE, attendre, compteur };

const marques = [{ brand: 'Chromium', version: '130' }, { brand: 'Google Chrome', version: '130' }, { brand: 'Not?A_Brand', version: '99' }];
export const APPAREILS = {
  telephone: {
    nom: 'Galaxy S23 Ultra', viewport: { width: 412, height: 915, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true },
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    meta: { platform: 'Android', platformVersion: '14.0.0', architecture: '', model: 'SM-S918B', mobile: true, brands: marques, fullVersionList: marques.map(b => ({ ...b, version: b.version + '.0.0.0' })) }
  },
  tablette: {
    nom: 'Tablette Android 800×1280', viewport: { width: 800, height: 1280, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    meta: { platform: 'Android', platformVersion: '13.0.0', architecture: '', model: 'SM-X710', mobile: false, brands: marques, fullVersionList: marques.map(b => ({ ...b, version: b.version + '.0.0.0' })) }
  },
  pc: { nom: 'PC 1920×1080', viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, ua: null, meta: null }
};

/* Ouvre Rayle dans l'appareil émulé. Options : url (défaut /index.html), storage (valeurs localStorage posées avant le chargement), avant(page), paysage (échange largeur / hauteur), attente (ms). */
export async function ouvrirAppareil(cle, { url = '/index.html', storage = {}, avant = null, paysage = false, attente = 2500, args = [] } = {}) {
  const A = APPAREILS[cle], navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${A.viewport.width},${A.viewport.height}`, ...args] });
  const page = await navigateur.newPage();
  if (A.ua) await page.setUserAgent(A.ua, A.meta);
  await page.setViewport({ ...A.viewport, ...(paysage ? { width: A.viewport.height, height: A.viewport.width } : {}) });
  const erreurs = [], requetes = [], octets = { total: 0 }, parId = new Map();
  page.on('console', m => { if (['error'].includes(m.type())) { erreurs.push(m.text().slice(0, 240)); if (process.env.RAYLE_DEBUG_404) console.log('CONSOLE', m.text().slice(0, 100), (m.location() || {}).url); } });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
  if (process.env.RAYLE_DEBUG_404) page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 140)); });
  const cdp = await page.createCDPSession(); await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', e => { parId.set(e.requestId, e.request.url); });
  cdp.on('Network.loadingFinished', e => { const u = parId.get(e.requestId); if (u) { octets.total += e.encodedDataLength || 0; requetes.push({ url: u.replace(BASE, ''), octets: e.encodedDataLength || 0 }); } });
  await page.evaluateOnNewDocument(s => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } catch (x) {} }, storage);
  if (avant) await avant(page);
  const t0 = Date.now(); await page.goto(BASE + url, { waitUntil: 'load' }); const chargeMs = Date.now() - t0; await attendre(attente);
  return { navigateur, page, erreurs, requetes, octets, chargeMs, appareil: A, cdp };
}
/* Fichiers de Galaxie (lourds) demandés : 3D, textures, planètes, vendor three.js. `galaxie/commandes.js` (la colle vocale, légère) et le CSS de la galaxie sur PC ne comptent pas ici. */
export const FICHIER_GALAXIE_LOURD = /\/galaxie\/(?!commandes\.js|reseau\.js|qualite\.js)|\/planetes\/(?:saturne|neptune|jupiter)\/|\/planetes\/mars\/pc\/(?:index|orbite|interieur|paysage|hologrammes|base-exterieur|dessin-exemples|exemples|ordres-mars)\.js|\/planetes\/terre\/pc\/(?:index|globe|tuiles|quadtree|shaders-terre|camera-orbite|charge|worker-tuiles|marqueurs|radar|meteo-anim|balises-actus|balises-lointaines|ombres|etiquettes|interface-terre)\.js|three\.module|\/assets-lourds\//;   // les modules de données (actualités, météo, finance, agent) ne sont pas de la galaxie
export const galaxieChargee = requetes => requetes.filter(r => FICHIER_GALAXIE_LOURD.test(r.url.split('?')[0]));
export const ko = o => (o / 1024).toFixed(0) + ' Ko';
/* Envoie une phrase comme la voix le fait (addLine + respond) en capturant ce que Rayle dirait. Rend le texte dit. */
export async function dire(page, texte, ms = 1800) {
  await page.evaluate(() => { window.__dit = []; if (!window.__speakPris) { window.__speakPris = true; window.speak = async t => { window.__dit.push(String(t)); }; } });
  await page.evaluate(t => { addLine('user', t); respond(t); }, texte); await attendre(ms);
  return page.evaluate(() => window.__dit.join(' | '));
}
export const panneaux = page => page.evaluate(() => Array.from(document.querySelectorAll('#panneaux .pn:not(.hud-out)')).map(e => e.dataset.id));
export const vueCourante = page => page.evaluate(() => RayleBus.demander('vue'));
