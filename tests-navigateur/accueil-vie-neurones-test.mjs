// Vie individuelle des neurones : l'apparence ne change pas, mais chaque neurone, chaque filament vit ; cascades, pointeur, clic ; intensité par mode ; images/s.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument(q => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', String(q)); localStorage.setItem('rayle_boot', '0'); }, opts.qualite ?? 0);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  await p.evaluate(() => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; if (!window.__garde) { window.__garde = 1; } document.querySelectorAll('.hud,.hud-anneaux,.state,#panneaux,.titre,.bridge,.barre').forEach(e => { e.style.visibility = 'hidden'; }); });
  return p;
}
const rect = p => p.evaluate(() => { const e = document.getElementById('reactor').getBoundingClientRect(); return { x: Math.round(e.left), y: Math.round(e.top), width: Math.round(e.width), height: Math.round(e.height) }; });
const photo = async (p, clip) => PNG.sync.read(Buffer.from(await p.screenshot({ clip })));
const lum = (img, x0, y0, x1, y1) => { let s = 0, n = 0; x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1); for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * img.width + x) * 4; s += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; n++; } return s / Math.max(1, n); };
const diffMoy = (a, c, rMin, rMax) => { const W = a.width, cx = W / 2, cy = a.height / 2, R = W / 2; let s = 0, n = 0; for (let y = 0; y < a.height; y += 2) for (let x = 0; x < W; x += 2) { const rr = Math.hypot(x - cx, y - cy) / R; if (rr < rMin || rr >= rMax) continue; const i = (y * W + x) * 4; s += (Math.abs(a.data[i] - c.data[i]) + Math.abs(a.data[i + 1] - c.data[i + 1]) + Math.abs(a.data[i + 2] - c.data[i + 2])) / 3; n++; } return s / n; };
const fps = p => p.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
/* « mouvement » de l'entité : moyenne, sur des paires d'images prises à ~100 ms d'intervalle, des différences en périphérie (la rotation à cette échelle est négligeable) */
async function mouvement(p, clip, paires = 10) { let t = 0; for (let k = 0; k < paires; k++) { const a = await photo(p, clip), c = await photo(p, clip); t += diffMoy(a, c, 0.3, 0.75); await attendre(120); } return t / paires; }

// ── 1. l'apparence ne change pas : luminance moyenne comparée à la référence « avant » ──
let p = await page();
let i = await p.evaluate(() => Entite.info());
v('les nouveaux shaders se compilent (moteur réseau actif, aucune erreur)', i.moteur === 'reseau' && erreurs.length === 0, JSON.stringify({ moteur: i.moteur, erreurs }));
const clip = await rect(p);
if (fs.existsSync('../captures-accueil/vie-avant.json')) {
  const avant = JSON.parse(fs.readFileSync('../captures-accueil/vie-avant.json', 'utf8')), apres = {};
  for (const etat of ['veille', 'listening', 'thinking', 'speaking']) {
    await p.evaluate(e => { Entite.etat(e); if (e === 'listening' || e === 'speaking') { window.__t0 = performance.now(); Entite.amplitude(() => 0.45 + 0.4 * Math.sin((performance.now() - window.__t0) / 1000 * (e === 'speaking' ? 7 : 3.2))); } else Entite.amplitude(null); }, etat);
    await attendre(3000); let s = 0; for (let k = 0; k < 6; k++) { s += lum(await photo(p, clip), 0, 0, clip.width, clip.height); await attendre(350); } apres[etat] = s / 6;
  }
  const ma = Object.values(avant).reduce((s, x) => s + x.luminance, 0) / 4, mp = Object.values(apres).reduce((s, x) => s + x, 0) / 4;
  v('apparence conservée : luminance moyenne (4 états) à ±12 % de la référence d\'avant', Math.abs(mp - ma) / ma < 0.12, ma.toFixed(1) + ' → ' + mp.toFixed(1));
  const couleurs = await p.evaluate(() => { Entite.amplitude(null); Entite.etat('idle'); Entite.fixer(); return Entite.info().c; });
  v('couleurs de l\'entité inchangées (cyan au repos)', Math.abs(couleurs[0] - 0.28) < 0.02 && Math.abs(couleurs[1] - 0.78) < 0.02 && Math.abs(couleurs[2] - 1) < 0.02, JSON.stringify(couleurs));
} else console.log('--  référence « avant » absente (lancer : node vie-captures.mjs avant) : test d\'apparence ignoré');

// ── 2. cascades visibles et qui se propagent de proche en proche ──
await p.evaluate(() => { Entite.amplitude(null); Entite.etat('veille'); Entite.vie(1); });
await attendre(2500);
const W = clip.width;
// source à gauche (périphérie) : on suit la luminosité près de la source et au cœur
const zones = { source: [W * 0.16, W * 0.34, W * 0.38, W * 0.62], coeur: [W * 0.42, W * 0.42, W * 0.58, W * 0.58], loin: [W * 0.70, W * 0.34, W * 0.92, W * 0.64] };
const base = { source: 0, coeur: 0, loin: 0 }; for (let k = 0; k < 3; k++) { const f0 = await photo(p, clip); for (const z in zones) base[z] += lum(f0, ...zones[z]) / 3; await attendre(120); }   // luminosité de référence (moyenne de 3 images)
await p.evaluate(() => { Entite.cascade(-0.55, 0.0, 0.0, 1, 0.9, 0, 0.3); Entite.cascade(-0.6, 0.15, 0.1, 1, 0.9, 0, 0.3); });
const serie = { source: [], coeur: [], loin: [] };
for (let k = 0; k < 14; k++) { const f = await photo(p, clip); for (const z in zones) serie[z].push(lum(f, ...zones[z]) - base[z]); await attendre(70); }
const pic = a => a.indexOf(Math.max(...a));
v('la cascade s\'allume d\'abord près de sa source, puis gagne le cœur : la périphérie proche de la source précède le cœur', Math.max(...serie.source) > 2 && pic(serie.source) <= pic(serie.coeur) + 3, JSON.stringify({ source: pic(serie.source), coeur: pic(serie.coeur), max: Math.max(...serie.source).toFixed(1) }));
const infoC = await p.evaluate(() => Entite.info().vie);
v('l\'état de la cascade est exposé (info) et s\'éteint ensuite', typeof infoC.casc === 'number');
await attendre(4500); v('les cascades s\'éteignent (aucune ne dure plus de 4 s)', (await p.evaluate(() => Entite.info().vie.casc)) <= 3);

// ── 3. chaque neurone vit : plus de mouvement local qu'avec « réduire les animations » ou en léger ──
const mC = await mouvement(p, clip);
await p.close();
p = await page({ reduire: true });
const clipR = await rect(p); const mR = await mouvement(p, clipR);
await p.close();
p = await page({ qualite: 2 });
const clipL = await rect(p); const mL = await mouvement(p, clipL);
await p.close();
v('vie individuelle : le nuage bouge au moins 2,5 fois plus qu\'avec « réduire les animations »', mC > mR * 2.5, `complet ${mC.toFixed(2)} · réduit ${mR.toFixed(2)}`);
v('modes : complet nettement plus vivant que léger ; léger pas plus calme que « animations réduites » (à la marge de mesure près)', mC > mL * 2 && mL >= mR * 0.75, `complet ${mC.toFixed(2)} · léger ${mL.toFixed(2)} · réduit ${mR.toFixed(2)}`);

// ── 4. états : cascades selon l'état ──
p = await page();
const echantillon = async (etat, secondes, amp) => { await p.evaluate((e, a) => { Entite.etat(e); window.__t0 = performance.now(); Entite.amplitude(a ? () => 0.5 + 0.45 * Math.sin((performance.now() - window.__t0) / 1000 * 7) : null); }, etat, amp); await attendre(2500); let somme = 0, max = 0, n = 0; for (let k = 0; k < secondes * 4; k++) { const c = (await p.evaluate(() => Entite.info().vie.casc)); somme += c; max = Math.max(max, c); n++; await attendre(250); } return { moy: somme / n, max, info: await p.evaluate(() => Entite.info()) }; };
const eVeille = await echantillon('veille', 10, false), eReflex = await echantillon('thinking', 8, false), eParole = await echantillon('speaking', 8, true), eEcoute = await echantillon('listening', 8, true);
v('veille : activité douce et dispersée (cascades rares)', eVeille.moy < 1.6 && eVeille.max <= 3, JSON.stringify({ moy: +eVeille.moy.toFixed(2), max: eVeille.max }));
v('réflexion : cascades denses (plusieurs en même temps), violettes', eReflex.moy > eVeille.moy && eReflex.max >= 2 && eReflex.info.c[0] > 0.6 && eReflex.info.c[2] > 0.9, JSON.stringify({ moy: +eReflex.moy.toFixed(2), max: eReflex.max }));
v('parole : cascades au rythme de la voix', eParole.moy >= 0.8 && eParole.max >= 1, JSON.stringify({ moy: +eParole.moy.toFixed(2), max: eParole.max }));
v('écoute : cascades au rythme de la voix', eEcoute.moy >= 0.8 && eEcoute.max >= 1, JSON.stringify({ moy: +eEcoute.moy.toFixed(2), max: eEcoute.max }));
await p.evaluate(() => { Entite.amplitude(null); Entite.etat('alerte'); }); await attendre(1500);
let eAlerte = 0; for (let k = 0; k < 12; k++) { eAlerte = Math.max(eAlerte, await p.evaluate(() => Entite.info().vie.casc)); await attendre(200); }
v('alerte : éclairs rapides', eAlerte >= 1);
await p.evaluate(() => Entite.etat('idle'));

// ── 5. pointeur et clic ──
const c0 = await rect(p); const centre = { x: c0.x + c0.width / 2, y: c0.y + c0.height / 2 };
await p.mouse.move(centre.x - c0.width * 0.2, centre.y - 40); await attendre(900);
let vi = await p.evaluate(() => Entite.info().vie);
v('pointeur : les neurones proches du curseur réagissent (force du pointeur)', vi.pointeur > 0.8, String(vi.pointeur));
const imgP = await photo(p, c0); const luProche = lum(imgP, c0.width * 0.22, c0.height * 0.32, c0.width * 0.46, c0.height * 0.58);
await p.mouse.move(centre.x + c0.width * 1.5, centre.y + c0.height * 0.9); await attendre(3200);
const imgN = await photo(p, c0); const luLoin = lum(imgN, c0.width * 0.22, c0.height * 0.32, c0.width * 0.46, c0.height * 0.58);
vi = await p.evaluate(() => Entite.info().vie);
v('pointeur : la zone près du curseur est plus lumineuse que la même zone sans curseur', luProche > luLoin * 1.05, luProche.toFixed(1) + ' / ' + luLoin.toFixed(1));
v('pointeur : oublié sans mouvement', vi.pointeur < 0.05, String(vi.pointeur));
await attendre(3500); const avant = (await p.evaluate(() => Entite.info().vie.casc));
await p.mouse.click(centre.x - c0.width * 0.18, centre.y); await attendre(250);
const apresClic = await p.evaluate(() => Entite.info().vie);
v('un clic lance une cascade depuis le point touché (et une vague du cœur)', apresClic.casc >= 1 && apresClic.ondes >= 1, JSON.stringify({ avant, apres: apresClic.casc, ondes: apresClic.ondes }));
await p.close();

// ── 6. intensité par mode ──
p = await page({ qualite: 1 }); let n = (await p.evaluate(() => Entite.info())).vie;
v('normal : environ 70 % de la vie individuelle', Math.abs(n.indiv - 0.7) < 1e-6 && Math.abs(n.derive - 0.7) < 1e-6 && Math.abs(n.fils - 0.7) < 1e-6 && Math.abs(n.nais - 0.7) < 1e-6, JSON.stringify(n)); await p.close();
p = await page({ qualite: 2 }); n = (await p.evaluate(() => Entite.info())).vie;
v('léger : scintillement et quelques cascades, sans le reste', n.indiv === 1 && n.derive === 0 && n.fils === 0 && n.nais === 0, JSON.stringify(n)); await p.close();
p = await page({ reduire: true }); n = (await p.evaluate(() => Entite.info())).vie;
v('animations réduites : très peu de mouvement', n.indiv === 0.3 && n.derive === 0 && n.fils === 0 && n.nais === 0 && n.pointeur === 0, JSON.stringify(n)); await p.close();

// ── 7. performance : mémoire stable et images/s dans les trois modes ──
p = await page({ attente: 3000 });
const cdp = await p.createCDPSession(); await cdp.send('Performance.enable');
const tas = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = (await cdp.send('Performance.getMetrics')).metrics; return m.find(x => x.name === 'JSHeapUsedSize').value; };
await p.evaluate(() => { Entite.etat('thinking'); }); await attendre(3000);
const t0 = await tas(); await attendre(20000); const t1 = await tas();
v('aucune fuite : la mémoire JavaScript n\'augmente pas en 20 s (réflexion, activité maximale)', (t1 - t0) < 2e6, ((t1 - t0) / 1e6).toFixed(2) + ' Mo');
for (const [nom, q] of [['complet', 0], ['normal', 1], ['léger', 2]]) {
  const pp = await page({ qualite: q }); await pp.evaluate(() => { Entite.etat('thinking'); }); await attendre(1500);
  const f = await fps(pp), ii = await pp.evaluate(() => Entite.info());
  v(`${nom.toUpperCase()} : ≥ 100 images/s en réflexion (page ${f}, entité ${ii.fps})`, f >= 100 && ii.fps >= 100, f + ' / ' + ii.fps); await pp.close();
}
{
  const pt = await page({ qualite: 2, viewport: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  const c = await pt.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await pt.evaluate(() => { Entite.etat('thinking'); }); await attendre(1500);
  const f = await fps(pt), ii = await pt.evaluate(() => Entite.info());
  v(`tablette simulée (léger, processeur ralenti ×4, réflexion) : ≥ 60 images/s (page ${f}, entité ${ii.fps})`, f >= 60 && ii.fps >= 55, f + ' / ' + ii.fps); await pt.close();
}
await p.close();

// ── 8. galaxie : le soleil partage les shaders et vit aussi ──
p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_entite_version', '2'); });
await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
await p.click('#btnOuvrirGalaxie');
await p.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 90000 });
await attendre(2500);
const g = await p.evaluate(() => { const s = window.Galaxie.soleil; const L = s.groupe.children.find(o => o.isLineSegments), N = s.groupe.children.find(o => o.isPoints); return { unif: ['uCasA', 'uCasB', 'uCasCol', 'uPointeur', 'uVieIndiv', 'uVieFils'].every(k => k in L.material.uniforms && k in N.material.uniforms), vie: L.material.uniforms.uVieFils.value, ok: window.Galaxie.enMarche() }; });
v('galaxie : le soleil utilise les mêmes shaders (cascades, pointeur, vie individuelle) et tourne', g.unif && g.ok, JSON.stringify(g));
await p.evaluate(() => window.Galaxie.soleil.cascade(0.8, 0, 0, 1, 1, 0, 0.3)); await attendre(500);
v('galaxie : une cascade peut partir du soleil', (await p.evaluate(() => window.Galaxie.soleil.machine.v.casB.some(b => b[1] > 0))) === true);
await p.close();

v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); process.exit(ko ? 1 : 0);
