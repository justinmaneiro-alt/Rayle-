/* Test de la Terre mobile en émulation Galaxy S23 : affichage (basse résolution immédiate, haute ensuite), aucune dépendance au PC, WebGL refusé, texture absente,
   couches, météo au toucher, recherche, actualités, libération à la fermeture, plafonds de taille.
   Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <snapshots> 8801.   Usage : node tests-navigateur/terre-mobile-test.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const HOTE = 'http://rayle.test:8000', w = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const verif = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP rayle.test 127.0.0.1'] });
async function page({ bloquer = () => false, webgl = true } = {}) {
  const p = await nav.newPage(); const vus = [];
  await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
  await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(webgl => { try { localStorage.setItem('rayle_donnees_base', 'http://127.0.0.1:8801/'); localStorage.setItem('rayle_m_sw', '0'); } catch (e) { /* */ } if (!webgl) { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; } }, webgl);
  await p.setRequestInterception(true);
  p.on('request', async r => { const u = r.url(); vus.push(u); if (bloquer(u)) return r.abort('failed');
    if (/^(http:\/\/rayle\.test|http:\/\/127\.0\.0\.1:8801|data:|blob:)/.test(u) || r.method() !== 'GET') return r.continue();
    try { const x = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }); r.respond({ status: x.status, headers: { 'access-control-allow-origin': '*', 'content-type': x.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await x.arrayBuffer()) }); } catch (e) { r.abort('failed'); } });
  const erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 150)));
  await p.goto(HOTE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(3000);
  return { p, vus, erreurs };
}
const attendre = async (f, ms = 60000, pas = 300) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await w(pas); } return false; };
const luminance = async p => p.evaluate(async () => { const c = document.querySelector('#terre-mobile .tm-toile').getBoundingClientRect(); return 0 + c.width; }).then(async () => {
  const buf = await p.screenshot({ clip: { x: 100, y: 330, width: 212, height: 260 }, encoding: 'base64' });
  return p.evaluate(async b64 => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0, coul = new Set(); for (let k = 0; k < d.length; k += 16) { s += d[k] + d[k + 1] + d[k + 2]; n++; coul.add((d[k] >> 4) + ',' + (d[k + 1] >> 4) + ',' + (d[k + 2] >> 4)); } return { moy: s / n / 3, couleurs: coul.size }; }, buf); });
const etatTerre = p => p.evaluate(async () => (await import(new URL('planetes/terre/mobile/terre-mobile.js', document.baseURI).href)).etat());

/* 1. ouverture, basse puis haute résolution, aucune dépendance au PC */
console.log('— ouverture —');
{ const { p, vus, erreurs } = await page(); const t0 = Date.now();
  await p.evaluate(() => window.Application.ouvrir('terre'));
  const visible = await attendre(() => p.evaluate(() => !!document.querySelector('#terre-mobile') && document.querySelector('#terre-mobile .tm-charge').hidden === true), 45000);
  const tBasse = Date.now() - t0; verif(visible, 'la Terre s\u2019affiche (écran de chargement masqué) en ' + tBasse + ' ms'); verif(tBasse < 20000, 'affichage utile en moins de 20 s même sous SwiftShader (' + tBasse + ' ms)');
  await w(1500); const L = await luminance(p); verif(L.moy > 25 && L.couleurs > 12, `le globe est dessiné (luminance ${L.moy.toFixed(0)}, ${L.couleurs} teintes)`);
  verif(await attendre(async () => (await etatTerre(p)).haute === true, 40000), 'la haute résolution (4k) est chargée ensuite');
  const e = await etatTerre(p); verif(e.actif && e.pret && !e.erreur, 'état : actif et prêt'); verif(e.resolution && e.resolution.basse === '1k', 'résolution choisie : ' + JSON.stringify(e.resolution));
  verif(await attendre(async () => (await etatTerre(p)).seismes > 0, 20000), 'séismes USGS lus en direct : ' + (await etatTerre(p)).seismes);
  verif(!vus.some(u => /\/__|\/actualites\/fil|rayle\.justinmaneiro\.workers\.dev\/(actualites|meteo|evenements)/.test(u)), 'aucun appel au serveur du PC ni au Worker pour la Terre');
  verif(vus.some(u => /terre\/mobile\/textures\/jour-1k\.jpg/.test(u)) && vus.some(u => /jour-4k\.jpg/.test(u)), 'textures lues dans le dépôt (1k puis 4k)');
  /* couches */
  await p.evaluate(() => document.querySelector('#terre-mobile [data-c="nuages"]').click()); verif((await etatTerre(p)).couches.nuages === false, 'couche Nuages désactivable');
  await p.evaluate(() => document.querySelector('#terre-mobile [data-c="seismes"]').click()); verif((await etatTerre(p)).couches.seismes === false, 'couche Séismes désactivable');
  await p.evaluate(() => document.querySelector('#terre-mobile [data-c="seismes"]').click());
  /* appui sur le globe : météo (Open-Meteo direct) */
  await p.evaluate(() => document.querySelector('#terre-mobile [data-c="rotation"]').click()); await w(400);
  await p.touchscreen.tap(206, 460); const fiche = await attendre(() => p.evaluate(() => { const f = document.querySelector('#terre-mobile .tm-fiche'); return !f.hidden && /°C|indisponible|séisme/i.test(f.innerText); }), 15000);
  verif(fiche, 'appui sur le globe : fiche (météo ou séisme) : ' + (await p.evaluate(() => document.querySelector('#terre-mobile .tm-fiche').innerText.slice(0, 60).replace(/\s+/g, ' '))));
  await p.evaluate(() => document.querySelector('#terre-mobile [data-a="fiche-fermer"]').click());
  /* recherche d'une ville */
  await p.evaluate(() => { const i = document.querySelector('#terre-mobile .tm-recherche input'); i.value = 'Tokyo'; document.querySelector('#terre-mobile .tm-recherche').requestSubmit(); });
  verif(await attendre(() => p.evaluate(() => /Tokyo/.test(document.querySelector('#terre-mobile .tm-fiche').innerText)), 15000), 'recherche « Tokyo » : fiche'); await w(1500);
  const v = (await etatTerre(p)).vue; verif(Math.abs(v.lat - 35.7) < 6 || Math.abs(v.lon - 139.7) < 40, 'la vue vole vers Tokyo : ' + JSON.stringify({ lat: +v.lat.toFixed(1), lon: +v.lon.toFixed(1) }));
  /* actualités (snapshot) */
  await p.evaluate(() => document.querySelector('#terre-mobile [data-a="actus"]').click()); verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#terre-mobile .tm-actus li').length > 3), 15000), 'actualités du monde (snapshot) listées');
  await p.screenshot({ path: 'outils-restructuration/captures-mobile-autonome/terre-mobile-actus.png' });
  /* fermeture : tout est libéré */
  await p.evaluate(() => window.Application.fermer()); await w(1200);
  verif(await p.evaluate(() => !document.querySelector('#terre-mobile')), 'fermeture : l\u2019élément est retiré du DOM'); verif((await etatTerre(p)).actif === false, 'fermeture : instance libérée');
  verif(erreurs.length === 0, 'aucune erreur de page ' + erreurs.join(' | ')); await p.close(); }

/* 2. WebGL indisponible : message clair, bouton Réessayer, jamais un écran figé */
console.log('— WebGL refusé —');
{ const { p } = await page({ webgl: false }); await p.evaluate(() => window.Application.ouvrir('terre'));
  verif(await attendre(() => p.evaluate(() => { const x = document.querySelector('#terre-mobile .tm-erreur'); return x && !x.hidden && /WebGL/.test(x.innerText); }), 20000), 'erreur WebGL expliquée');
  verif(await p.evaluate(() => !!document.querySelector('#terre-mobile [data-a="reessayer"]') && document.querySelector('#terre-mobile .tm-charge').hidden), 'bouton « Réessayer » présent, plus de « Chargement… » figé'); await p.close(); }

/* 3. texture absente puis réseau revenu : Réessayer fonctionne */
console.log('— texture absente —');
{ let coupe = true; const { p } = await page({ bloquer: u => coupe && /textures\/jour-1k\.jpg/.test(u) }); await p.evaluate(() => window.Application.ouvrir('terre'));
  verif(await attendre(() => p.evaluate(() => { const x = document.querySelector('#terre-mobile .tm-erreur'); return x && !x.hidden && x.innerText.length > 20; }), 25000), 'erreur de chargement affichée avec sa cause');
  coupe = false; await p.evaluate(() => document.querySelector('#terre-mobile [data-a="reessayer"]').click());
  verif(await attendre(() => p.evaluate(() => document.querySelector('#terre-mobile .tm-charge').hidden && document.querySelector('#terre-mobile .tm-erreur').hidden), 40000), 'après « Réessayer » la Terre s\u2019affiche'); await p.close(); }

/* 4. plafonds de taille (échec si dépassés) */
console.log('— plafonds —');
{ const d = 'planetes/terre/mobile/textures/', t = f => fs.statSync(d + f).size / 1024;
  verif(t('jour-1k.jpg') + t('nuit-2k.jpg') + t('nuages-1k.jpg') < 400, 'basse résolution (1k + nuit + nuages) < 400 Ko : ' + (t('jour-1k.jpg') + t('nuit-2k.jpg') + t('nuages-1k.jpg')).toFixed(0) + ' Ko'); verif(t('jour-4k.jpg') < 900, 'texture 4k < 900 Ko : ' + t('jour-4k.jpg').toFixed(0) + ' Ko');
  verif(fs.statSync('planetes/terre/mobile/terre-mobile.js').size < 40 * 1024, 'module < 40 Ko'); }
console.log(`résultat : ${ok} vérifications, ${ko} échec(s)`); await nav.close(); process.exit(ko ? 1 : 0);
