// Entité de l'accueil (réseau natif) : moteur, niveaux, états, repli, pause, images par seconde.  node accueil-entite-test.mjs
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
const ev = f => page.evaluate(f);
const fps = async (ms = 3000) => ev(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await ev(() => { localStorage.removeItem('rayle_entite_qualite'); localStorage.removeItem('rayle_entite_niveau'); }); await page.reload({ waitUntil: 'load' });
await attendre(3500);
let i = await ev(() => Entite.info());
v('moteur réseau par défaut sur PC', i.moteur === 'reseau' && i.niveau === 0 && i.points === 12000 && i.bloom, JSON.stringify(i));
v('un seul canvas d\'entité dans la page', (await ev(() => document.querySelectorAll('.entite-canvas').length)) === 1);
v('génération du réseau raisonnable (< 2 s) et dans un Worker', i.generation < 2000 && i.worker === true, i.generation + ' ms, worker ' + i.worker);
v('mode détecté sur PC : complet', i.mode === 'complet', i.mode);

// états : couleurs de la galaxie
await ev(() => { Entite.verrou(false); Entite.verrou = () => {}; });
for (const [e, c0, c2] of [['idle', 0.28, 1.0], ['listening', 0.30, 1.0], ['thinking', 0.78, 1.0], ['speaking', 1.0, 0.65]]) {
  await ev(`Entite.etat('${e}'); Entite.fixer();`); await attendre(300);
  i = await ev(() => Entite.info());
  v('état ' + e + ' : couleurs de la galaxie', Math.abs(i.c[0] - c0) < 0.03, JSON.stringify(i.c));
}
await ev(() => { Entite.alerte(2000); }); await attendre(1500); i = await ev(() => Entite.info());
v('alerte : rouge-orangé', i.c[0] > 0.6 && i.c[2] < 0.5, JSON.stringify(i.c));
await attendre(3500); await ev(() => Entite.etat('idle'));

// niveaux
for (const [q, pts, bloom] of [[1, 8000, true], [2, 6000, false], [0, 12000, true]]) {
  await ev(`Entite.qualite(${q})`); await attendre(1500); i = await ev(() => Entite.info());
  const f = await fps(2500);
  v(`niveau ${q} : ${pts} neurones, lueur ${bloom}, ${f} images/s (page)`, i.points === pts && i.bloom === bloom && f >= 55, JSON.stringify({ niveau: i.niveau, fps: i.fps }));
}
// repli 2D (mode jeu) puis retour
await ev(() => Entite.qualite(3)); await attendre(800); i = await ev(() => Entite.info());
v('qualité 3 : ancien dessin 2D', i.moteur === '2d' && (await ev(() => document.querySelectorAll('.entite-canvas').length)) === 1, JSON.stringify(i));
await ev(() => Entite.qualite('auto')); await attendre(1500); i = await ev(() => Entite.info());
v('retour en auto : réseau', i.moteur === 'reseau' && (await ev(() => document.querySelectorAll('.entite-canvas').length)) === 1, JSON.stringify(i));
// perte du contexte graphique : repli 2D
await ev(() => { document.querySelector('.entite-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(); }); await attendre(800); i = await ev(() => Entite.info());
v('contexte perdu : repli sur l\'ancien dessin', i.moteur !== 'reseau', JSON.stringify(i));
// pause quand l'onglet est caché : pas de dessin
await page.reload({ waitUntil: 'load' }); await attendre(3500);
await ev(() => { window.__tp = 0; const g = WebGL2RenderingContext.prototype.drawArrays; WebGL2RenderingContext.prototype.drawArrays = function () { window.__tp++; return g.apply(this, arguments); }; });
await attendre(500); const a1 = await ev(() => window.__tp);
await ev(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); }); await attendre(300); const h0 = await ev(() => window.__tp); await attendre(1500); const h1 = await ev(() => window.__tp);
v('dessine quand l\'onglet est visible', a1 > 0, String(a1));
v('pause quand l\'onglet est caché', h1 === h0, `${h0} → ${h1}`);

// détection automatique et réduction des animations, sur des appareils simulés
async function nouvelAppareil(opts, titre) {
  const p = await b.newPage(); await p.setViewport(opts.viewport);
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (opts.cpu) { const c = await p.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu }); }
  p.on('pageerror', e => erreurs.push(titre + ' : ' + e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { localStorage.removeItem('rayle_entite_qualite'); localStorage.removeItem('rayle_entite_niveau'); });
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 4500);
  const info = await p.evaluate(() => Entite.info());
  const f = await p.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
  return { p, info, f };
}
let ap = await nouvelAppareil({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, cpu: 4 }, 'téléphone');
v('téléphone : mode léger détecté', ap.info.mode === 'leger' && ap.info.points === 6000 && !ap.info.bloom, JSON.stringify({ mode: ap.info.mode, fps: ap.f }));
v('téléphone (processeur ralenti 4×) : au moins 55 images/s', ap.f >= 55, ap.f + ' i/s');
await ap.p.close();
ap = await nouvelAppareil({ viewport: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, cpu: 4 }, 'tablette');
v('tablette : mode normal ou léger détecté (jamais complet)', ap.info.mode !== 'complet', ap.info.mode + ' ' + ap.f + ' i/s');
v('tablette (processeur ralenti 4×) : au moins 55 images/s', ap.f >= 55, ap.f + ' i/s');
await ap.p.close();
ap = await nouvelAppareil({ viewport: { width: 1600, height: 900 }, reduire: true }, 'animations réduites');
await ap.p.evaluate(() => { Entite.verrou(false); Entite.verrou = () => {}; Entite.etat('speaking'); Entite.fixer(); });
let fmax = 0; for (let k = 0; k < 12; k++) { await attendre(500); fmax = Math.max(fmax, (await ap.p.evaluate(() => Entite.info())).flash); }
v('« réduire les animations » : entité calme, aucun flash', ap.info.calme === true && fmax === 0, 'flash max ' + fmax);
await ap.p.close();
// la génération ne bloque pas la page : écart maximal entre deux images pendant le chargement
const pg = await b.newPage(); await pg.setViewport({ width: 1600, height: 900 });
await pg.evaluateOnNewDocument(() => { window.__ecart = 0; let t = performance.now(); const f = () => { const n = performance.now(); window.__ecart = Math.max(window.__ecart, n - t); t = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await pg.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(4000);
const ecart = await pg.evaluate(() => window.__ecart);
v('chargement fluide : aucune image bloquée plus de 250 ms', ecart < 250, Math.round(ecart) + ' ms'); await pg.close();
// terminal : l'entité suit le petit réacteur
await ev(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); });
v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); process.exit(ko ? 1 : 0);
