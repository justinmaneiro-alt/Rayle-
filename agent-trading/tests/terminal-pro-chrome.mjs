/* Test Chrome du terminal pro : mise en page (barre du haut, barre d'outils à gauche, panneau droit FERMÉ par défaut), modes Pro épuré / ICT / Flux mémorisés, niveaux majeurs (3 + 3, étiquette à droite), outils Fibonacci / texte / mesure / gomme.
   MODE PRO ÉPURÉ : aucune étiquette ne chevauche une autre (boîtes englobantes) et pas plus de 15 objets visibles, sinon le test échoue. PC 1600, tablette 1024, téléphone 390. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H, N = 24 * 60; let s = 17; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
let c = 4000; const cl = []; for (let i = 0; i < N; i++) { c += (rnd() - 0.5) * 9 + Math.sin(i / 37) * 3.2; cl.push(c); }
const serie = cl.map((x, i) => { const o = i ? cl[i - 1] : x; return { t: fin - (N - 1 - i) * H, o, h: Math.max(o, x) + rnd() * 3, l: Math.min(o, x) - rnd() * 3, c: x, v: 80 + rnd() * 80 }; });
const chevauche = (a, b) => a.x0 < b.x0 + b.w && a.x0 + a.w > b.x0 && a.y0 < b.y0 + b.h && a.y0 + a.h > b.y0;
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message)); 
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) {} window.speak = () => {}; window.prompt = () => 'Zone clé'; });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.strategie.pro && window.__or.strategie.etat().stats.nm && window.__or.graph.etat().bougies.length > 20, { timeout: 40000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.strategie.maj(true); }, serie); await w(1200);
  const L1 = await p.evaluate(() => { const R = document.querySelector('.tor'), cs = x => getComputedStyle(document.querySelector(x)); return { haut: !!document.querySelector('.tp-haut'), outils: document.querySelectorAll('.tp-outils [data-tp-outil]').length, carnet: cs('.tor-carnet').display, feuille: !!document.querySelector('.tor-ray-feuille') && cs('.tor-ray-feuille').display, mode: document.querySelector('[data-tp-mode]').value, barreAncienne: cs('.tor-graph-barre').display, periodes: document.querySelectorAll('[data-periode]').length }; });
  v(L1.haut && L1.outils === 10 && L1.mode === 'pro' && L1.periodes >= 5, `${l}px : barre du haut (mode, analyses, couches, panneau droit, Rayle) et barre d'outils à gauche (${L1.outils} outils), timeframes ${L1.periodes}`);
  v(L1.carnet === 'none' && L1.feuille === 'none' && L1.barreAncienne === 'none', `${l}px : panneau droit (carnet, feuille de décision, grosses transactions) FERMÉ par défaut, ancienne barre masquée`);
  // ── PRO ÉPURÉ : couches, objets, étiquettes ──
  const E1 = await p.evaluate(() => { const S = window.__or.strategie, g = window.__or.graph, e = g.rayleEtat(), on = Object.entries(g.couches()).filter(([, x]) => x).map(([k]) => k), m = S.modele(); return { on, objets: S.compterObjets() + (g.outils().objets || []).length, etiq: e.etiquettes, axe: e.etiquettes.filter(r => r.x0 > 0), niveaux: (m.niveaux || []).length, haut: (m.niveaux || []).filter(n => n.cote === 'haut').length, bas: (m.niveaux || []).filter(n => n.cote === 'bas').length, types: e.types, largeur: document.querySelector('.tor-graph-lw').clientWidth }; });
  v(E1.on.every(k => ['rayMa', 'rayGolden', 'rayNiveaux', 'fleches'].includes(k)) && E1.on.includes('rayNiveaux'), `${l}px : Pro épuré : couches actives = ${E1.on.join(', ')}`);
  v(E1.niveaux >= 1 && E1.haut <= 3 && E1.bas <= 3, `${l}px : niveaux majeurs : ${E1.haut} au-dessus, ${E1.bas} en dessous (3 au plus de chaque côté)`);
  v(E1.objets <= 15, `${l}px : Pro épuré : ${E1.objets} objets visibles (15 au plus) ${JSON.stringify(E1.types)}`);
  let rien = true; for (let i = 0; i < E1.etiq.length; i++) for (let j = i + 1; j < E1.etiq.length; j++) if (chevauche(E1.etiq[i], E1.etiq[j])) rien = false; v(rien, `${l}px : Pro épuré : aucune étiquette ne chevauche une autre (${E1.etiq.length} boîtes englobantes testées)`);
  const lab = await p.evaluate(() => (window.__or.graph.rayleEtat().etiquettes || []).filter(r => r.w > 30).length); void lab;
  await p.screenshot({ path: `captures-or/terminal-pro-${l}.png` });
  // ── modes ──
  const r1 = await p.evaluate(async () => await window.TableauOr.commande('mode ICT')); await w(600); const m2 = await p.evaluate(() => ({ on: Object.entries(window.__or.graph.couches()).filter(([, x]) => x).map(([k]) => k), mode: window.__or.strategie.pro.mode() }));
  v(/Mode ICT/.test(r1) && m2.mode === 'ict' && m2.on.includes('ictFvg') && m2.on.includes('structure'), `${l}px : « mode ICT » : couches ICT et structure`);
  const r2 = await p.evaluate(async () => await window.TableauOr.commande('mode flux')); await w(600); v(/Flux/.test(r2) && await p.evaluate(() => getComputedStyle(document.querySelector('.tor-carnet')).display !== 'none' && window.__or.graph.couches().carteCarnet === true), `${l}px : « mode flux » : carnet et flux visibles`);
  await p.evaluate(async () => await window.TableauOr.commande('mode pro')); await w(500); await p.evaluate(async () => await window.TableauOr.commande('ouvre le panneau droit')); await w(300);
  v(await p.evaluate(() => getComputedStyle(document.querySelector('.tor-carnet')).display !== 'none' && !!document.querySelector('.tor-ray-feuille')), `${l}px : « ouvre le panneau droit » : carnet visible`); await p.evaluate(async () => await window.TableauOr.commande('ferme le panneau droit')); await w(300);
  await p.evaluate(async () => await window.TableauOr.commande('mode ICT')); await w(400); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.strategie.pro && window.__or.graph.etat().bougies.length > 20, { timeout: 40000 }).catch(() => {}); await w(1500);
  v(await p.evaluate(() => window.__or.strategie.pro.mode() === 'ict' && document.querySelector('[data-tp-mode]').value === 'ict'), `${l}px : le mode choisi est mémorisé après rechargement`);
  await p.evaluate(async () => await window.TableauOr.commande('mode pro')); await w(300);
  // ── outils : Fibonacci, texte, mesure, gomme (clics réels sur le graphique) ──
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.strategie.maj(true); window.__or.strategie.pro.effacerAnnotations(); }, serie); await w(800);
  const box = await p.evaluate(() => { const r = document.querySelector('.tor-graph-lw').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const clic = async (fx, fy) => { await p.mouse.click(box.x + box.w * fx, box.y + box.h * fy); await w(250); };
  await p.click('[data-tp-outil="fib"]'); await clic(0.55, 0.3); await clic(0.7, 0.6); v((await p.evaluate(() => window.__or.strategie.pro.annotations())).filter(a => a.type === 'fib').length === 1, `${l}px : Fibonacci : deux clics = un tracé`);
  await p.click('[data-tp-outil="texte"]'); await clic(0.4, 0.4); v((await p.evaluate(() => window.__or.strategie.pro.annotations())).some(a => a.type === 'texte' && a.texte === 'Zone clé'), `${l}px : texte : un clic = une note`);
  await p.click('[data-tp-outil="mesure"]'); await clic(0.3, 0.3); await clic(0.5, 0.5); v(await p.evaluate(() => (window.__or.strategie.modele().annotations || []).some(a => a.type === 'mesure' && /ATR|\$/.test(a.libelle))), `${l}px : mesure : distance en $, ATR et heures`);
  const avant = (await p.evaluate(() => window.__or.strategie.pro.annotations())).length; const bx = await p.evaluate(() => { const a = window.__or.strategie.pro.annotations().find(x => x.type === 'texte'), g = window.__or.graph; return { x: g.xDeT(a.t), y: g.serie().priceToCoordinate(a.p) }; }); await p.click('[data-tp-outil="curseur"]'); await p.mouse.click(box.x + bx.x, box.y + bx.y); await w(300); await p.click('[data-sup-corbeille]'); await w(300);   // fenêtre commune de suppression (plus de gomme)
  v((await p.evaluate(() => window.__or.strategie.pro.annotations())).length === avant - 1, `${l}px : clic puis corbeille : supprime la note touchée`);
  v(await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_or_annotations') || '[]').length === window.__or.strategie.pro.annotations().length), `${l}px : annotations sauvegardées sur l'appareil`);
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${l}px : pas de défilement horizontal`);
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
