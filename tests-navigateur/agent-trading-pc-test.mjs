// Agent de trading : les TROIS entrées PC (accueil « + Agent » et menu Espaces, dossier du salon de Mars, bouton du Terminal) ouvrent LA MÊME fenêtre,
// au-dessus de la 3D, fermée par Échap ou un clic à côté ; même capital que le téléphone. Captures 1600 px dans agent-trading/moteur/tests/captures/ (si présent) sinon captures-entrees/.
// Prérequis : node serveur.mjs 8000 ; un relais de test sur ws://127.0.0.1:8799 (agent-trading/moteur/tests/relais-demo.mjs, local).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { entrerSurMars, attendreMode, attendre, BASE } from './r2-aide.mjs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe', RELAIS = 'http://127.0.0.1:8799';
const DOSSIER = fs.existsSync('agent-trading/moteur/tests') ? 'agent-trading/moteur/tests/captures' : 'captures-entrees'; fs.mkdirSync(DOSSIER, { recursive: true });
let ok = 0, ko = 0; const t = (nom, c, info = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', nom, info); } };
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await nav.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = [], deAgent = () => erreurs.filter(e => /agent-trading|at-|fenetre-agent|vue\.js|graphique\.js|carnet\.js|panneaux\.js|connexion\.js|piles-table|maj-pc|g1-mini|g1-accueil/i.test(e));
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240) + ' @ ' + ((m.location() || {}).url || '')); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240) + ' ' + String(e.stack || '').slice(0, 200)));
await page.evaluateOnNewDocument(r => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', 'aurore'); localStorage.setItem('rayle_agent_trading_url', r); localStorage.setItem('rayle_agent_trading_jeton', 'test'); } catch (e) {} }, RELAIS);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3000);

const ouverte = () => page.evaluate(() => !!document.querySelector('.at-pc'));
const lireFenetre = () => page.evaluate(() => { const c = document.querySelector('.at-pc .at-capital'), b = document.querySelector('.at-pc'); const r = b && b.getBoundingClientRect(); return { cents: c && c.dataset.cents, seq: document.querySelector('.at-pc [data-version]') && document.querySelector('.at-pc [data-version]').textContent, l: r && Math.round(r.width), h: r && Math.round(r.height), onglets: document.querySelectorAll('.at-pc .at-onglets [data-onglet]').length, dessus: (() => { if (!r) return false; const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && b.contains(e)); })() }; });
const attendreFenetre = () => page.waitForFunction(() => document.querySelector('.at-pc .at-capital') && window.LightweightCharts, { timeout: 25000 }).then(() => attendre(2500));

// 1) accueil : « + Agent » visible, sans chevauchement
const puce = await page.evaluate(() => { const b = document.querySelector('#g1MiniPuces [data-agent]'); if (!b || document.getElementById('g1MiniPuces').hidden) return null; const r = b.getBoundingClientRect(), autres = [...document.querySelectorAll('#g1MiniPuces button')].filter(x => x !== b).map(x => x.getBoundingClientRect());
  return { x: r.x, y: r.y, w: r.width, h: r.height, chevauche: autres.some(o => o.x < r.x + r.width && r.x < o.x + o.width && o.y < r.y + r.height && r.y < o.y + o.height), texte: b.textContent }; });
t('accueil : bouton « + Agent » visible', puce && puce.w > 0 && puce.texte === '+ Agent', JSON.stringify(puce));
t('accueil : « + Agent » ne chevauche pas les autres boutons', puce && !puce.chevauche);
t('accueil : le titre du haut n’est pas recouvert par les boutons', await page.evaluate(() => { const ti = document.querySelector('.g1-titre'), p = document.getElementById('g1MiniPuces'); if (!ti || p.hidden) return true; const a = ti.getBoundingClientRect(), b = p.getBoundingClientRect(); return !(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height); }));
await page.screenshot({ path: DOSSIER + '/entrees-accueil-1600.png' });
await page.mouse.click(puce.x + puce.w / 2, puce.y + puce.h / 2); await attendreFenetre();
const f1 = await lireFenetre();
t('accueil → fenêtre ouverte, grande, en onglets, au premier plan', f1.l >= 1400 && f1.h >= 800 && f1.onglets === 4 && f1.dessus, JSON.stringify(f1));
await page.screenshot({ path: DOSSIER + '/entrees-fenetre-accueil-1600.png' });
// même capital que le téléphone (même relais, même numéro d'état)
const ctx = await nav.createBrowserContext(), tel = await ctx.newPage(); await tel.setViewport({ width: 384, height: 800, isMobile: true, hasTouch: true });
await tel.goto('http://127.0.0.1:8000/agent-trading/front/demo.html?relais=ws://127.0.0.1:8799');
await tel.waitForFunction(() => document.querySelector('.at-capital'), { timeout: 25000 });
let a, b; for (let i = 0; i < 40; i++) { await attendre(700); a = await lireFenetre(); b = await tel.evaluate(() => ({ cents: document.querySelector('.at-capital').dataset.cents, seq: document.querySelector('[data-version]').textContent })); if (a.seq.split('·')[0] === b.seq.split('·')[0]) break; }
t('même capital au centime que le téléphone (même état)', a.cents === b.cents && a.seq.split('·')[0] === b.seq.split('·')[0], JSON.stringify([a.cents, b.cents, a.seq, b.seq]));
await ctx.close();
// redimensionner, plein écran (agrandir), Échap
const avantL = f1.l; const coin = await page.evaluate(() => { const r = document.querySelector('.at-pc-poignee').getBoundingClientRect(); return { x: r.x + 9, y: r.y + 9 }; });
await page.mouse.move(coin.x, coin.y); await page.mouse.down(); await page.mouse.move(coin.x - 300, coin.y - 200, { steps: 6 }); await page.mouse.up(); await attendre(300);
t('fenêtre redimensionnable', (await lireFenetre()).l === avantL - 300);
await page.evaluate(() => document.querySelector('.at-pc-barre').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await attendre(300);
t('agrandissement plein écran (double-clic sur la barre)', (await lireFenetre()).l === 1600);
await page.keyboard.press('Escape'); await attendre(300);
t('Échap ferme la fenêtre', !(await ouverte()));
// 2) menu Espaces → Agent ; clic à côté = fermer
await page.evaluate(() => document.querySelector('#g1Icones [data-i="espaces"]').click()); await attendre(300);
t('menu Espaces : entrée « Agent »', await page.evaluate(() => !!document.querySelector('#g1Menu [data-p="agent"]')));
await page.evaluate(() => document.querySelector('#g1Menu [data-p="agent"]').click()); await attendreFenetre();
t('menu Espaces → même fenêtre', (await lireFenetre()).onglets === 4);
await page.mouse.click(10, 450); await attendre(300);
t('clic à côté ferme la fenêtre', !(await ouverte()));
const errAccueil = deAgent().length;

// 3) salon de Mars : 6e dossier, clic réel, la 3D ne masque rien, Échap ne fait pas sortir de la base
await page.evaluate(() => document.getElementById('btnOuvrirGalaxie').click());
await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }); await attendre(500);
await entrerSurMars(page); await page.evaluate(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await page.evaluate(() => window.Mars.placerInterieur({ yaw: 0, pitch: 0.05, avancee: 0.2 })); await attendre(4000);
const pos = (await page.evaluate(() => window.Mars.positionsEcran())).find(x => x.id === 'agent');
t('salon : dossier « Agent de trading » présent et devant la caméra', pos && pos.devant && pos.x > 0 && pos.x < 1600 && pos.y > 0 && pos.y < 900, JSON.stringify(pos));
await page.screenshot({ path: DOSSIER + '/entrees-salon-mars-1600.png' });
if (pos) { await page.mouse.click(pos.x, pos.y); await attendreFenetre(); }
const f3 = await lireFenetre();
t('dossier de Mars → même fenêtre, au-dessus de la 3D', f3.onglets === 4 && f3.dessus, JSON.stringify(f3));
await page.screenshot({ path: DOSSIER + '/entrees-fenetre-mars-1600.png' });
await page.evaluate(() => document.querySelector('.at-pc .at-onglets [data-onglet="carnet"]').click()); await attendre(400);
t('la souris marche dans la fenêtre au-dessus de Mars (onglet Carnet)', await page.evaluate(() => document.querySelector('.at-pc .at').dataset.onglet === 'carnet'));
await page.keyboard.press('Escape'); await attendre(600);
t('Échap ferme la fenêtre sans sortir de la base', !(await ouverte()) && (await page.evaluate(() => window.Mars.etat().mode)) === 'interieur');
// 4) bouton du Terminal (espace de travail de Mars)
await page.evaluate(() => window.Mars.ouvrirEspaceComplet({})); await attendre(2500);
const bt = await page.evaluate(() => { const b = document.querySelector('.tg-agent-trading'); if (!b) return null; b.click(); return true; });
t('Terminal : bouton « ◈ Agent de trading » présent', !!bt);
if (bt) await attendreFenetre();
t('Terminal → même fenêtre (une seule à la fois)', (await page.evaluate(() => document.querySelectorAll('.at-pc').length)) === 1);
await page.screenshot({ path: DOSSIER + '/entrees-fenetre-terminal-1600.png' });
t('aucune erreur console liée à l’agent ou à ses entrées', deAgent().length === 0 && errAccueil === 0, JSON.stringify(deAgent()));
console.log('toutes les erreurs console (pour information) :', erreurs.length ? erreurs.slice(0, 12) : 'aucune');
await nav.close();
console.log(`entrées PC de l’agent : ${ok} réussis, ${ko} échoués`); process.exit(ko ? 1 : 0);
