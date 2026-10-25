import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
mkdirSync('docs/captures-r2', { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

/* R2 phase 5 : accueil AURORE, petites fenêtres en haut à droite (météo, localisation, graphique en bougies tournant), gérées par le gestionnaire commun. */
const PREV = { current: { time: '2026-10-24T14:30', temperature_2m: 17.2, apparent_temperature: 16, relative_humidity_2m: 60, wind_speed_10m: 11, uv_index: 2.1 },
  hourly: { temperature_2m: Array.from({ length: 24 }, (_, i) => +(10 + Math.sin(i / 4) * 6).toFixed(1)), apparent_temperature: Array.from({ length: 24 }, (_, i) => 9 + i / 3), relative_humidity_2m: Array.from({ length: 24 }, (_, i) => 80 - i) },
  daily: { temperature_2m_min: [9], temperature_2m_max: [19], sunrise: ['2026-10-24T08:01'], sunset: ['2026-10-24T18:40'], precipitation_probability_max: [35] } };
const AIR = { current: { european_aqi: 33, pm2_5: 8.4 }, hourly: { european_aqi: Array.from({ length: 24 }, (_, i) => 25 + (i % 7) * 3) } };
const GEO = { results: [{ name: 'Lourdes', admin1: 'Occitanie', country: 'France', latitude: 43.09, longitude: -0.05 }] };
const cors = { 'access-control-allow-origin': '*' };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1920,1080'] });
const erreurs = [];
async function page(viewport, { fresh = true, tactile = false } = {}) {
  const p = await b.newPage(); await p.setViewport({ ...viewport, hasTouch: tactile });
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|Failed to load|CORS|net::|bls\.gov/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url();
    if (/air-quality-api\.open-meteo/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(AIR) });
    if (/geocoding-api\.open-meteo/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(GEO) });
    if (/api\.open-meteo\.com\/v1\/forecast/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(PREV) });
    r.continue(); });
  await p.evaluateOnNewDocument(f => {
    window.__RAYLE_TB_TEST__ = { sansReseau: true }; localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.removeItem('rayle_theme');
    if (f && !sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of ['rayle_g1_mini', 'rayle_fenetres_accueil']) localStorage.removeItem(k); localStorage.setItem('rayle_tableau_bord', JSON.stringify({ version: 1, actif: true, meteo: { nom: 'Pau', lat: 43.3, lon: -0.37 } })); }
    window.__geoAppels = 0; try { Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, ko) => { window.__geoAppels++; ok({ coords: { latitude: 43.2951, longitude: -0.3708 } }); } }, configurable: true }); } catch (e) {}
  }, fresh);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(4500);
  return p;
}
const rect = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { x: r.x, y: r.y, l: r.width, h: r.height, op: c.opacity, vis: c.visibility, disp: c.display }; }, sel);
const dedans = (r, L, H) => r && r.l >= 240 && r.h >= 120 && r.x >= 0 && r.y >= 0 && r.x + r.l <= L + 1 && r.y + r.h <= H + 1 && r.op === '1' && r.disp !== 'none';

// ── 1. bureau 1920×1080 ──
const L = 1920, H = 1080;
let p = await page({ width: L, height: H });
v('thème Aurore', await p.evaluate(() => document.body.classList.contains('g1')));
v('le gestionnaire commun est chargé', await p.evaluate(() => !!window.G1Mini && window.G1Mini.visible() && !!window.G1Mini.gestionnaire()));
for (const id of ['meteo', 'position', 'marche']) { const r = await rect(p, '.gf[data-id="mini-' + id + '"]'); v('petite fenêtre « ' + id + ' » visible, dans l’écran, compacte', dedans(r, L, H) && r.l <= 460, JSON.stringify(r)); v('« ' + id + ' » en haut à droite', !!r && r.x > L / 2 && r.y < H / 2); }
const rm = await rect(p, '.gf[data-id="mini-meteo"]'), rp = await rect(p, '.gf[data-id="mini-position"]'), rk = await rect(p, '.gf[data-id="mini-marche"]');
const chevauche = (a, c) => a.x < c.x + c.l && c.x < a.x + a.l && a.y < c.y + c.h && c.y < a.y + a.h;
v('les trois fenêtres ne se recouvrent pas', !chevauche(rm, rp) && !chevauche(rm, rk) && !chevauche(rp, rk));
const tm = await p.evaluate(() => document.querySelector('.gf[data-id="mini-meteo"]').innerText);
v('météo : ville choisie, température, mini-courbe, bouton position', /Pau/.test(tm) && /17°/.test(tm) && /Utiliser ma position/.test(tm) && await p.evaluate(() => !!document.querySelector('.gf[data-id="mini-meteo"] svg.gm-courbe')), tm.replace(/\n/g, ' | ').slice(0, 160));
const tp = await p.evaluate(() => document.querySelector('.gf[data-id="mini-position"]').innerText);
v('localisation : lieu, coordonnées, soleil', /Pau/.test(tp) && /43,300/.test(tp) && /08:01|8:01/.test(tp), tp.replace(/\n/g, ' | ').slice(0, 200));
v('marché : graphique en bougies avec instruments et unités', await p.evaluate(() => { const g = document.querySelector('.gf[data-id="mini-marche"] .gb'); return !!g && g.querySelectorAll('[data-i]').length === 5 && g.querySelectorAll('[data-u]').length === 4; }));
const gb = await p.evaluate(() => { const g = document.querySelector('.gf[data-id="mini-marche"] .gb'); const m = g.querySelector('[data-r=msg]'); return { msg: m && !m.hidden ? m.textContent : '', etat: (g.querySelector('[data-r=etat]') || {}).textContent, canvas: g.querySelectorAll('canvas').length }; });
v('marché : bougies ou « données indisponibles » avec la raison (jamais vide)', gb.canvas > 0 || /indispon/i.test(gb.msg) || /charge|attente|Lecture/i.test(gb.msg), JSON.stringify(gb));
v('pause au survol', await (async () => { const r = await rect(p, '.gf[data-id="mini-marche"] .gb-zone'); await p.mouse.move(r.x + r.l / 2, r.y + r.h / 2); await attendre(300); return await p.evaluate(() => document.querySelector('.gf[data-id="mini-marche"] .gb').dataset.rotation === 'arret'); })());
v('aucun reste « IPS / LAT N/A / REMP » dans la page', await p.evaluate(() => !/\bIPS\b|LAT\s*N\/A|REMP\b/.test(document.body.innerText)));
v('rien ne chevauche l’état « VERROUILLÉ / COUPÉ » du dock', await p.evaluate(() => { const e = document.getElementById('g1Etat').getBoundingClientRect(); return ![...document.querySelectorAll('.gf')].some(w => { const r = w.getBoundingClientRect(); return r.x < e.right && e.x < r.right && r.y < e.bottom && e.y < r.bottom; }); }));
await p.screenshot({ path: 'docs/captures-r2/accueil-mini.png' });

// déplacement à la souris
const t0 = await rect(p, '.gf[data-id="mini-position"]');
await p.mouse.move(t0.x + 120, t0.y + 18); await p.mouse.down(); await p.mouse.move(t0.x - 180, t0.y + 150, { steps: 8 }); await attendre(200); await p.mouse.up(); await attendre(200);
const t1 = await rect(p, '.gf[data-id="mini-position"]'); v('déplacement à la souris', Math.abs(t1.x - (t0.x - 300)) < 4 && Math.abs(t1.y - (t0.y + 132)) < 4, JSON.stringify([t0, t1]));
// déplacement au doigt (touch CDP)
const cdp = await p.createCDPSession(); const tou = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i + 1 })) });
const m0 = await rect(p, '.gf[data-id="mini-meteo"]'); const tx = m0.x + 100, ty = m0.y + 18;
await tou('touchStart', [{ x: tx, y: ty }]); for (let i = 1; i <= 6; i++) await tou('touchMove', [{ x: tx - i * 20, y: ty + i * 10 }]); await attendre(200); await tou('touchEnd', []); await attendre(300);
const m1 = await rect(p, '.gf[data-id="mini-meteo"]'); v('déplacement au doigt', Math.abs(m1.x - (m0.x - 120)) < 6 && Math.abs(m1.y - (m0.y + 60)) < 6, JSON.stringify([m0, m1]));
// agrandir en grande fenêtre
await p.evaluate(() => document.querySelector('.gf[data-id="mini-marche"] [data-b="agrandir"]').click()); await attendre(500);
const rg = await rect(p, '.gf[data-id="mini-marche"]'); v('agrandir : grande fenêtre', rg.l > L * 0.8 && rg.h > H * 0.7, JSON.stringify(rg));
await p.evaluate(() => document.querySelector('.gf[data-id="mini-marche"] [data-b="agrandir"]').click()); await attendre(400);
// utiliser ma position
await p.evaluate(() => document.querySelector('.gf[data-id="mini-meteo"] .gm-pos').click()); await attendre(1500);
v('« Utiliser ma position » : géolocalisation demandée au clic seulement', await p.evaluate(() => window.__geoAppels === 1 && /Ma position/.test(document.querySelector('.gf[data-id="mini-meteo"]').innerText)));
// fermer, puce, rouvrir
await p.evaluate(() => document.querySelector('.gf[data-id="mini-position"] [data-b="fermer"]').click()); await attendre(300);
v('fermer : la fenêtre disparaît et une puce « + Localisation » apparaît', await p.evaluate(() => !document.querySelector('.gf[data-id="mini-position"]') && !!document.querySelector('.gm-puces [data-ouvre="position"]')));
await p.evaluate(() => document.querySelector('.gm-puces [data-ouvre="position"]').click()); await attendre(800);
v('la puce rouvre la fenêtre', await p.evaluate(() => !!document.querySelector('.gf[data-id="mini-position"]')));
const avant = await rect(p, '.gf[data-id="mini-meteo"]');
// mémorisation : rechargement
await p.reload({ waitUntil: 'load' }); await attendre(4500);
const apres = await rect(p, '.gf[data-id="mini-meteo"]');
v('position mémorisée après rechargement', !!apres && Math.abs(apres.x - avant.x) < 3 && Math.abs(apres.y - avant.y) < 3, JSON.stringify([avant, apres]));
// ouverture de la grande fenêtre : les petites s'effacent mais l'accueil reste utilisable
await p.close();

// ── 2. tablette 1280×800 tactile ──
p = await page({ width: 1280, height: 800 }, { tactile: true });
for (const id of ['meteo', 'position', 'marche']) { const r = await rect(p, '.gf[data-id="mini-' + id + '"]'); v('tablette · « ' + id + ' » visible et dans l’écran', dedans(r, 1280, 800), JSON.stringify(r)); }
v('tablette · cibles tactiles ≥ 44 px (boutons de fenêtre)', await p.evaluate(() => [...document.querySelectorAll('.gm-hote .gf-b button:not([hidden])')].every(b => b.getBoundingClientRect().width >= 43)) || !(await p.evaluate(() => matchMedia('(pointer:coarse)').matches)));
await p.close();

// ── 3. téléphone 390×844 : démarrent fermées, puces pour les ouvrir ──
p = await page({ width: 390, height: 844 }, { tactile: true });
v('téléphone · fenêtres fermées au départ, puces visibles', await p.evaluate(() => !document.querySelector('.gf') && document.querySelectorAll('.gm-puces button').length === 3));
await p.evaluate(() => document.querySelector('.gm-puces [data-ouvre="meteo"]').click()); await attendre(900);
const rt = await rect(p, '.gf[data-id="mini-meteo"]'); v('téléphone · la météo s’ouvre et tient dans l’écran', !!rt && rt.x >= 0 && rt.x + rt.l <= 391 && rt.y + rt.h <= 845 && rt.op === '1', JSON.stringify(rt));
await p.close();

// ── 4. thème Jarvis : rien de tout cela ──
const pj = await b.newPage(); await pj.setViewport({ width: 1600, height: 900 });
await pj.evaluateOnNewDocument(() => { localStorage.setItem('rayle_theme', 'jarvis'); localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); });
await pj.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
v('thème Jarvis : pas de petites fenêtres Aurore', await pj.evaluate(() => !document.querySelector('.gf[data-id^="mini-"]')));
await pj.close();

console.log('erreurs page :', erreurs.slice(0, 5));
await b.close();
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
