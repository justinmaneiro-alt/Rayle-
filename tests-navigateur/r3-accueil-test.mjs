import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

/* R3 phase 3 : ACCUEIL Aurore (thème par défaut). Petites fenêtres (météo, localisation, marché) = gestionnaire commun ; grande fenêtre (neuf contenus) = gestes des fenêtres fixes ;
   souris, clavier, curseur virtuel de la télécommande, tactile, mémoire après rechargement, tiroir global. Lancer : node tests-navigateur/r3-accueil-test.mjs */
const PREV = { current: { time: '2026-10-24T14:30', temperature_2m: 17.2, apparent_temperature: 16, relative_humidity_2m: 60, wind_speed_10m: 11, uv_index: 2.1 },
  hourly: { temperature_2m: Array.from({ length: 24 }, (_, i) => +(10 + Math.sin(i / 4) * 6).toFixed(1)), apparent_temperature: Array.from({ length: 24 }, (_, i) => 9 + i / 3), relative_humidity_2m: Array.from({ length: 24 }, (_, i) => 80 - i) },
  daily: { temperature_2m_min: [9], temperature_2m_max: [19], sunrise: ['2026-10-24T08:01'], sunset: ['2026-10-24T18:40'], precipitation_probability_max: [35] } };
const cors = { 'access-control-allow-origin': '*' };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1920,1080'] });
const erreurs = [];
const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080, hasTouch: true });
p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|Failed to load|CORS|net::|bls\.gov/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
await p.setRequestInterception(true);
p.on('request', r => { const u = r.url();
  if (/air-quality-api\.open-meteo/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ current: { european_aqi: 33, pm2_5: 8.4 }, hourly: { european_aqi: [30, 31] } }) });
  if (/api\.open-meteo\.com\/v1\/forecast/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(PREV) });
  r.continue(); });
await p.evaluateOnNewDocument(() => {
  window.__RAYLE_TB_TEST__ = { sansReseau: true };
  if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.removeItem('rayle_theme'); for (const k of ['rayle_g1_mini', 'rayle_fenetres_accueil', 'rayle_pm_g1-grande']) localStorage.removeItem(k); localStorage.setItem('rayle_g1_mini', JSON.stringify({ meteo: true, position: true, marche: true })); }
  try { Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (o) => o({ coords: { latitude: 43.2951, longitude: -0.3708 } }) }, configurable: true }); } catch (e) {}
});
const charger = async () => { await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(4500); };
await charger();
const ev = (f, ...a) => p.evaluate(f, ...a);
const rect = sel => ev(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height, op: getComputedStyle(e).opacity }; }, sel);
const M = '.gf[data-id="mini-meteo"]';

v('thème Aurore actif', await ev(() => document.body.classList.contains('g1')));
v('les petites fenêtres sont là (météo, localisation, marché)', (await ev(() => [...document.querySelectorAll('#g1MiniRacine .gf')].map(e => e.dataset.id).sort())).join() === 'mini-marche,mini-meteo,mini-position');
// ── souris ──
let r0 = await rect(M); const hx = r0.x + 40, hy = r0.y + 20;
await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx - 240, hy + 160, { steps: 8 }); await attendre(160); await p.mouse.up(); await attendre(250);
let r1 = await rect(M); v('souris : glisser la barre de titre déplace la petite fenêtre', Math.abs((r1.x - r0.x) + 240) < 16 && Math.abs((r1.y - r0.y) - 160) < 16, JSON.stringify([r0, r1]));
await p.mouse.move(r1.x + 40, r1.y + 20); await p.mouse.wheel({ deltaY: -100 }); await p.mouse.wheel({ deltaY: -100 }); await attendre(300); let r2 = await rect(M);
v('souris : la molette sur la barre agrandit la fenêtre', r2.l > r1.l * 1.1, JSON.stringify([r1.l, r2.l]));
await p.mouse.click(r2.x + 40, r2.y + 20, { button: 'right' }); await attendre(250);
v('souris : clic droit = menu de fenêtre', await ev(() => !!document.querySelector('.gfx-menu') && /Épingler/.test(document.querySelector('.gfx-menu').textContent) && !/Ranger/.test(document.querySelector('.gfx-menu').textContent)));
await ev(() => document.querySelector('.gfx-menu [data-m="epingler"]').click()); await attendre(150);
v('épingler fonctionne', await ev(sel => document.querySelector(sel).classList.contains('gfx-epingle'), M));
// clavier
await ev(sel => { document.querySelector(sel).focus(); }, M); const k0 = await rect(M); await p.keyboard.press('ArrowLeft'); await attendre(120); const k1 = await rect(M);
v('clavier : flèche gauche déplace de 24 px', Math.abs(k1.x - k0.x + 24) < 2, JSON.stringify([k0.x, k1.x]));
await p.keyboard.down('Shift'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Shift'); await attendre(120); const k2 = await rect(M);
v('clavier : Maj + flèche redimensionne', Math.abs(k2.l - k1.l - 24) < 2);
await p.keyboard.press('Enter'); await attendre(250); v('clavier : Entrée agrandit', (await rect(M)).l > 1500); await p.keyboard.press('Enter'); await attendre(250);
await p.keyboard.press('Tab'); await attendre(100); v('clavier : Tab passe à une autre fenêtre', await ev(() => document.activeElement.dataset.id !== 'mini-meteo' && /^mini-/.test(document.activeElement.dataset.id)));
// télécommande (on écarte d'abord la météo épinglée, qui recouvrait la localisation)
{ const q = await rect(M); await p.mouse.move(q.x + 40, q.y + 20); await p.mouse.down(); await p.mouse.move(300, 200, { steps: 8 }); await attendre(160); await p.mouse.up(); await attendre(300); }
const virtuel = async (x, y) => { for (let i = 0; i < 80; i++) { const fini = await ev((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-140, Math.min(140, x - q.x)), dy: Math.max(-140, Math.min(140, y - q.y)) }); return false; }, x, y); if (fini) break; await attendre(15); } await attendre(200); };
{ const q = await rect('.gf[data-id="mini-position"]'); await p.mouse.move(q.x + 40, q.y + 20); await p.mouse.down(); await p.mouse.move(340, 620, { steps: 8 }); await attendre(160); await p.mouse.up(); await attendre(300); }
const t0 = await rect('.gf[data-id="mini-position"]');
await virtuel(t0.x + 40, t0.y + 20); await ev(() => window.Telecommande.appliquer({ a: 'zoom', delta: 120 })); await attendre(300);
{ const n = await rect('.gf[data-id="mini-position"]'); v('télécommande : le pincement simulé agrandit la fenêtre sous le curseur', n.l > t0.l * 1.05, JSON.stringify([t0, n]) + JSON.stringify(await ev(() => { const q = window.Telecommande.position(), e = document.elementFromPoint(q.x, q.y); return [q.x, q.y, e && e.className]; }))); }
{ const n = await rect('.gf[data-id="mini-position"]'); await virtuel(n.x + 40, n.y + 20); }
await ev(() => window.Telecommande.appliquer({ a: 'clic', n: 1, bouton: 2 })); await attendre(250);
v('télécommande : le clic droit virtuel ouvre le menu', await ev(() => !!document.querySelector('.gfx-menu'))); await ev(() => document.querySelector('.gfx-menu [data-m="fermer"]') && document.querySelector('.gfx-menu [data-m="fermer"]').click()); await attendre(300);
v('télécommande : « Fermer » du menu ferme la fenêtre', !(await rect('.gf[data-id="mini-position"]')));
// tactile
const cdp = await p.createCDPSession(); const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i + 1 })) });
const m0 = await rect('.gf[data-id="mini-marche"]'); await toucher('touchStart', [{ x: m0.x + 40, y: m0.y + 20 }]); for (let i = 1; i <= 8; i++) { await toucher('touchMove', [{ x: m0.x + 40 - i * 15, y: m0.y + 20 + i * 8 }]); await attendre(40); } await attendre(200); await toucher('touchEnd', []); await attendre(300);
const m1 = await rect('.gf[data-id="mini-marche"]'); v('doigt : glisser la barre de titre déplace la fenêtre du marché', Math.abs(m1.x - m0.x + 120) < 20 && Math.abs(m1.y - m0.y - 64) < 20, JSON.stringify([m0, m1]));
// ── mémoire après rechargement (petites fenêtres) ──
const avantRel = await rect(M);
await charger();
const apresRel = await rect(M); v('après rechargement, la petite fenêtre est à la même place et toujours épinglée', apresRel && Math.abs(apresRel.x - avantRel.x) < 3 && Math.abs(apresRel.y - avantRel.y) < 3 && await ev(sel => document.querySelector(sel).classList.contains('gfx-epingle'), M), JSON.stringify([avantRel, apresRel]));

// ── grande fenêtre ──
await ev(() => window.G1.ouvrir('marche')); await attendre(1200);
const G = '#g1Fen'; let g0 = await rect(G); v('la grande fenêtre est ouverte et visible', g0 && g0.op === '1' && g0.l > 400, JSON.stringify(g0));
const barre = await rect('#g1Fen .g1-fen-barre');
await p.mouse.move(g0.x + 60, barre.y + 4); await p.mouse.down(); await p.mouse.move(g0.x + 60 - 300, barre.y + 4 + 50, { steps: 8 }); await attendre(160); await p.mouse.up(); await attendre(300);
let g1 = await rect(G); v('souris : glisser la barre de la grande fenêtre la déplace', Math.abs(g1.x - g0.x + 300) < 20 && Math.abs(g1.y - g0.y - 50) < 20, JSON.stringify([g0, g1]));
await p.mouse.move(g1.x + 60, (await rect('#g1Fen .g1-fen-barre')).y + 4); await p.mouse.wheel({ deltaY: -100 }); await p.mouse.wheel({ deltaY: -100 }); await attendre(300); let g2 = await rect(G);
v('souris : la molette sur la barre l’agrandit', g2.l > g1.l * 1.1, JSON.stringify([g1.l, g2.l]));
await p.mouse.click(g2.x + 60, (await rect('#g1Fen .g1-fen-barre')).y + 4, { button: 'right' }); await attendre(250);
v('souris : clic droit = menu avec « Remettre à sa place »', await ev(() => !!document.querySelector('.gfx-menu') && /Remettre à sa place/.test(document.querySelector('.gfx-menu').textContent)));
await ev(() => document.querySelector('.gfx-menu [data-m="epingler"]').click()); await attendre(150);
const memo = await ev(() => JSON.parse(localStorage.getItem('rayle_pm_g1-grande') || 'null')); v('position et échelle mémorisées', memo && memo.e === 1 && memo.k > 1, JSON.stringify(memo));
await ev(() => window.G1.fermer()); await attendre(500); await charger();
await ev(() => window.G1.ouvrir('marche')); await attendre(1500); const g3 = await rect(G);
v('après rechargement, la grande fenêtre rouvre à sa place (taille mémorisée)', g3 && Math.abs(g3.x - g2.x) < 6 && Math.abs(g3.y - g2.y) < 6, JSON.stringify([g2, g3]));
await p.mouse.click(g3.x + 60, (await rect('#g1Fen .g1-fen-barre')).y + 4, { button: 'right' }); await attendre(250); await ev(() => document.querySelector('.gfx-menu [data-m="remettre"]').click()); await attendre(400);
const g4 = await rect(G); v('« Remettre à sa place » la ramène au centre bas d’origine', g4 && Math.abs((g4.x + g4.l / 2) - 960) < 12 && g4.l > 400, JSON.stringify(g4));
v('la grande fenêtre garde ses onglets cliquables après tout cela', await ev(() => { document.querySelector('#g1Onglets [data-t="actus"]').click(); return window.G1.courant() === 'actus'; }));
await ev(() => window.G1.fermer()); await attendre(500);

// ── tiroir ──
await ev(() => window.TiroirFenetres.ouvrir()); await attendre(300);
const tir = await ev(() => ({ n: document.querySelectorAll('.tf-f').length, h: [...document.querySelectorAll('.tf-dossier h4')].map(x => x.textContent.replace(/\d+$/, '').trim()) }));
v('le tiroir liste les petites fenêtres et les neuf contenus de la grande', tir.n >= 12 && tir.h.includes('Petites fenêtres') && tir.h.includes('Grande fenêtre'), JSON.stringify(tir));
await p.type('.tf-panneau input', 'actualit'); await attendre(250);
await ev(() => [...document.querySelectorAll('.tf-f')].find(x => /Actualit/.test(x.textContent)).click()); await attendre(1200);
v('un appui dans le tiroir ouvre « Actualités » dans la grande fenêtre', await ev(() => window.G1.courant() === 'actus'));
console.log('erreurs page :', erreurs.slice(0, 5));
await b.close(); console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
