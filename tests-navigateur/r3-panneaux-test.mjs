import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
/* R3 phase 3 : fenêtres du système « Panneaux » (Terre : actualités, météo, événements, itinéraires ; Mars ; réponses de Raylé ; médias ; Jupiter et Neptune) : glisser, molette,
   menu, épingler, clavier, remettre à sa place, Échap, tiroir global, télécommande (fenêtre). Lancer : node tests-navigateur/r3-panneaux-test.mjs */
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1600,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900, hasTouch: true });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
await p.evaluateOnNewDocument(() => { window.__RAYLE_TB_TEST__ = { sansReseau: true }; if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', 'jarvis'); } });
await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
const ev = (f, ...a) => p.evaluate(f, ...a);
const rect = id => ev(id => { const e = document.querySelector('.pn[data-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height, libre: e.classList.contains('pm-libre') }; }, id);
await ev(() => { for (const [id, t] of [['t-actus', 'Actualités'], ['t-meteo', 'Météo'], ['t-evt', 'Événements']]) window.Panneaux.ouvrir({ id, titre: t, type: 'terre', corps: 'Contenu de ' + t + '\n\nSuite du contenu.' }); }); await attendre(900);
v('3 panneaux ouverts dans leurs colonnes (non détachés)', (await rect('t-actus')) && !(await rect('t-actus')).libre);
v('chaque panneau a un bouton épingler', (await ev(() => document.querySelectorAll('.pn .pm-pin').length)) === (await ev(() => document.querySelectorAll('.pn').length)));
let r0 = await rect('t-meteo'); const h = { x: r0.x + 60, y: r0.y + 18 };
await p.mouse.move(h.x, h.y); await p.mouse.down(); await p.mouse.move(h.x + 150, h.y + 120, { steps: 8 }); await attendre(160); await attendre(250); await p.mouse.up(); await attendre(1300);
let r1 = await rect('t-meteo'); v('souris : glisser la barre détache et déplace le panneau', r1.libre && Math.abs((r1.x - r0.x) - 150) < 25 && Math.abs((r1.y - r0.y) - 120) < 20, JSON.stringify([r0, r1]));
v('les autres panneaux n’ont pas bougé', !(await rect('t-actus')).libre);
await p.mouse.move(r1.x + 60, r1.y + 18); await p.mouse.wheel({ deltaY: -100 }); await p.mouse.wheel({ deltaY: -100 }); await attendre(300); const r2 = await rect('t-meteo');
v('molette sur la barre : le panneau grandit', r2.l > r1.l * 1.1, JSON.stringify([r1, r2]) + JSON.stringify(await ev((x, y) => { const e = document.elementFromPoint(x, y); return e && e.className; }, r1.x + 60, r1.y + 18)));
await p.mouse.click(r2.x + 60, r2.y + 18, { button: 'right' }); await attendre(250);
v('clic droit : menu avec « Remettre à sa place »', await ev(() => !!document.querySelector('.gfx-menu') && /Remettre à sa place/.test(document.querySelector('.gfx-menu').textContent)));
await ev(() => document.querySelector('.gfx-menu [data-m="epingler"]').click()); await attendre(200);
v('épingler : marqué, et Panneaux.liste() le sait', await ev(() => document.querySelector('.pn[data-id="t-meteo"]').classList.contains('pm-epingle') && window.Panneaux.liste().find(x => x.id === 't-meteo').epingle));
// une fenêtre épinglée n'est pas évincée (MAX = 8)
await ev(() => { for (let i = 0; i < 9; i++) window.Panneaux.ouvrir({ id: 'z' + i, titre: 'Z' + i, corps: 'x' }); }); await attendre(400);
v('une fenêtre épinglée n’est jamais évincée par de nouvelles fenêtres', !!(await rect('t-meteo')) && (await ev(() => window.Panneaux.liste().length)) <= 8);
await ev(() => { for (let i = 0; i < 9; i++) window.Panneaux.fermer('z' + i); window.Panneaux.ouvrir({ id: 't-evt', titre: 'Événements', type: 'terre', corps: 'x' }); }); await attendre(700);
// clavier
await ev(() => { document.querySelector('.pn[data-id="t-meteo"]').focus(); }); const k0 = await rect('t-meteo'); await p.keyboard.press('ArrowRight'); await attendre(120); const k1 = await rect('t-meteo');
v('clavier : flèche droite déplace de 24 px', Math.abs(k1.x - k0.x - 24) < 2, JSON.stringify([k0.x, k1.x]));
await p.keyboard.press('Enter'); await attendre(250); const k2 = await rect('t-meteo'); v('clavier : Entrée met en plein écran', k2.l > 1400 && k2.h > 600, JSON.stringify(k2));
await p.keyboard.press('Enter'); await attendre(250);
await p.keyboard.press('Tab'); await attendre(120); v('clavier : Tab passe à un autre panneau', await ev(() => document.activeElement.classList.contains('pn') && document.activeElement.dataset.id !== 't-meteo'));
// remettre à sa place
await ev(() => document.querySelector('.pn[data-id="t-meteo"]').focus()); const rr = await rect('t-meteo'); await p.mouse.click(rr.x + 60, rr.y + 18, { button: 'right' }); await attendre(250);
await ev(() => document.querySelector('.gfx-menu [data-m="remettre"]').click()); await attendre(300);
v('« Remettre à sa place » : le panneau retourne dans sa colonne', await ev(() => { const e = document.querySelector('.pn[data-id="t-meteo"]'); return !!e && !e.classList.contains('pm-libre') && !!e.closest('.pn-col,.pn-centre'); }));
// Échap ferme
await ev(() => document.querySelector('.pn[data-id="t-evt"]').focus()); await p.keyboard.press('Escape'); await attendre(700);
v('Échap sur un panneau le ferme', !(await rect('t-evt')));
// tactile : balayage vers le bas = réduire
const cdp = await p.createCDPSession(); const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i + 1 })) });
await ev(() => window.Panneaux.ouvrir({ id: 't-actus', titre: 'Actualités', type: 'terre', corps: 'Contenu' + String.fromCharCode(10) + String.fromCharCode(10) + 'Suite.' })); await attendre(700);
const a0 = await rect('t-actus'); const ha = { x: a0.x + 60, y: a0.y + 18 };
await toucher('touchStart', [ha]); await toucher('touchMove', [{ x: ha.x, y: ha.y + 40 }]); await attendre(20); await toucher('touchMove', [{ x: ha.x, y: ha.y + 110 }]); await attendre(20); await toucher('touchEnd', []); await attendre(350);
v('doigt : balayage rapide vers le bas réduit le panneau', await ev(() => document.querySelector('.pn[data-id="t-actus"]').classList.contains('pm-reduit')));
// tiroir
await ev(() => window.TiroirFenetres.ouvrir()); await attendre(300);
v('le tiroir liste les fenêtres Raylé ouvertes et l’interface (Réglages, Télécommande)', await ev(() => { const t = document.querySelector('.tf-panneau').innerText; return /Fenêtres Raylé/i.test(t) && /Réglages/.test(t) && /Télécommande/.test(t) && /Actualités/.test(t); }));
await ev(() => [...document.querySelectorAll('.tf-f')].find(x => /Réglages/.test(x.textContent)).click()); await attendre(300);
v('un appui dans le tiroir ouvre les réglages', await ev(() => document.getElementById('cfg').classList.contains('open')));
console.log('erreurs page :', erreurs.slice(0, 5));
await b.close(); console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
