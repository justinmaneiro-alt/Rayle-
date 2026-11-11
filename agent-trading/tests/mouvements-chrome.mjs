/* Test Chrome de la couche « Mouvements H1 » (or.html) avec les VRAIES données (Kraken / Binance, comme or-chrome-test.mjs).
   Usage : node agent-trading/tests/mouvements-chrome.mjs   (lance lui-même le serveur local sur le port 8014 ; captures dans captures-or/) */
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')), puppeteer = require('puppeteer-core');
const PORT = 8014, BASE = `http://127.0.0.1:${PORT}`, SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
const srv = spawn(process.execPath, ['serveur.mjs', String(PORT)], { stdio: 'ignore' }); const w = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/agent-trading/front/or.html')).ok) break; } catch (e) { /* */ } await w(300); }
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
let nOk = 0; const echecs = [], erreurs = []; const v = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
async function essai(l, h, mobile) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mobile, hasTouch: mobile });
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|status of 40|net::|Failed to load resource|youtube|googlevideo|allorigins|blocked by CORS policy/i.test(m.text())) erreurs.push(m.text()); });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.TableauOr && window.TableauOr.mouvements, { timeout: 30000 }); v(true, `${l}px : le module Mouvements est monté`);
  await p.waitForFunction(() => document.querySelector('[data-periode="H1"]'), { timeout: 30000 }); await w(4000);
  await p.evaluate(() => document.querySelector('[data-periode="H1"]').click());
  await p.waitForFunction(() => { const d = window.TableauOr.mouvements.dernier(); return d && d.moves.length > 0; }, { timeout: 90000 });
  const E = await p.evaluate(() => { const T = window.TableauOr, d = T.mouvements.dernier(); return { n: d.moves.length, stats: d.stats, worker: T.mouvements.utilisationWorker(), seuil: T.mouvements.seuil(), ms: d.ms, debut: d.debut, fin: d.fin, coche: document.querySelector('[data-couche="mouvements"]').checked, note: document.querySelector('[data-mouv-note]').textContent, notevisible: !document.querySelector('[data-mouv-note]').hidden }; });
  v(E.n > 100, `${l}px : ${E.n} mouvements trouvés sur l’historique H1 réel (${((E.fin - E.debut) / 86400e3 / 365).toFixed(1)} an), ${E.stats.parSemaine.toFixed(1)} par semaine, ampleur médiane ${E.stats.ampleurMedUSD.toFixed(1)} $`);
  v(E.coche && E.seuil === 1.5, `${l}px : couche activée par défaut, seuil 1,5 ATR`);
  v(E.worker === true, `${l}px : calcul dans un Worker (${E.ms} ms)`);
  v(E.notevisible && /Rétrospectif : ces mouvements sont repérés après coup\. Ils ne prédisent pas le suivant\./.test(E.note), `${l}px : l’avertissement « Rétrospectif » est à l’écran`);
  // le menu Couches
  await p.evaluate(() => { document.querySelector('.tor-couches').open = true; document.querySelector('.tor-mouv-stats').open = true; }); await w(300);
  const M = await p.evaluate(() => ({ label: [...document.querySelectorAll('.tor-couches-corps > label')].map(x => x.textContent.trim()), curseur: !!document.querySelector('[data-mouv-seuil]'), exports: [...document.querySelectorAll('[data-mouv-export]')].map(b => b.textContent), stats: document.querySelector('[data-mouv-stats-corps]').innerText, bloc: !document.querySelector('[data-mouv-bloc]').hidden, sousFenetre: document.querySelectorAll('[role=dialog]').length }));
  v(M.label.some(x => /Mouvements H1/.test(x)), `${l}px : « Mouvements H1 » dans le menu Couches`);
  v(M.curseur && M.exports.join() === 'CSV,JSON' && M.bloc, `${l}px : curseur de seuil et boutons d’export CSV / JSON`);
  v(/par semaine/.test(M.stats) && /Heure de départ/.test(M.stats) && /Jour de départ/.test(M.stats), `${l}px : statistiques (par semaine, heure de Paris, jour)`);
  // dessin : placer la vue sur une zone qui contient des mouvements
  await p.evaluate(() => document.querySelector('.tor-couches').open = false);
  await w(800);
  // les rectangles : lecture via l'état du graphique exposé par TableauOr
  const etatG = () => p.evaluate(() => window.TableauOr.graphe().mouvementsEtat());
  let G = await etatG(); if (!G.dessines) { await p.evaluate(() => { const g = window.TableauOr.graphe(), d = window.TableauOr.mouvements.dernier(), m = d.moves[d.moves.length - 4]; g.allerA(m.t0 + 30 * 3600e3); }); await w(900); G = await etatG(); }
  v(G.actif && G.dessines > 0, `${l}px : ${G.dessines} rectangles dessinés dans la vue`, JSON.stringify({ a: G.actif, d: G.dessines, t: G.total }));
  await p.screenshot({ path: path.join(SORTIE, `mouvements-${l}.png`) });
  // clic sur un mouvement : fiche
  const zone = await p.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }), c = G.cadres.find(q => !q.enCours && q.x0 > 5 && q.x1 < zone.w - 90 && q.y1 > 20 && q.y0 < zone.h - 20) || G.cadres.find(q => q.x0 > 5 && q.x1 < zone.w - 90);
  await p.mouse.click(zone.x + (c.x0 + c.x1) / 2, zone.y + (Math.max(c.y0, 10) + Math.min(c.y1, zone.h - 10)) / 2); await w(500);
  const tip = await p.evaluate(() => { const t = document.querySelector('[data-graph] [role=tooltip]'); return t && !t.hidden && /Mouvement (haussier|baissier)/.test(t.innerText) ? t.innerText : null; });
  v(!!tip, `${l}px : le clic sur un mouvement ouvre sa fiche`, String(tip));
  if (tip) { for (const mot of ['Départ', 'Durée', 'Ampleur', 'Niveau structurel', 'SMA 200 Jour', 'heure de Paris', 'balayé|balayé aucun', 'Rétrospectif']) v(new RegExp(mot).test(tip), `${l}px : la fiche contient « ${mot} »`); }
  // seuil : plus haut = moins de mouvements, sans bloquer l'interface
  await p.evaluate(() => { window.__gaps = []; let der = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gaps.push(n - der); der = n; }, 16); });
  const n15 = await p.evaluate(() => window.TableauOr.mouvements.dernier().moves.length);
  await p.evaluate(() => window.TableauOr.mouvements.regler(3)); await p.waitForFunction(n => window.TableauOr.mouvements.dernier().moves.length < n && window.TableauOr.mouvements.seuil() === 3, { timeout: 30000 }, n15);
  const n3 = await p.evaluate(() => window.TableauOr.mouvements.dernier().moves.length); v(n3 < n15, `${l}px : seuil 3 ATR : ${n3} mouvements au lieu de ${n15}`);
  await p.evaluate(() => window.TableauOr.mouvements.regler(1)); await p.waitForFunction(n => window.TableauOr.mouvements.dernier().moves.length > n && window.TableauOr.mouvements.seuil() === 1, { timeout: 30000 }, n15);
  const n1 = await p.evaluate(() => window.TableauOr.mouvements.dernier().moves.length); v(n1 > n15, `${l}px : seuil 1 ATR : ${n1} mouvements`);
  const gap = await p.evaluate(() => { clearInterval(window.__iv); return Math.max(...window.__gaps); }); v(gap < 800, `${l}px : l’interface n’a jamais été bloquée plus de 0,8 s (pire pause ${Math.round(gap)} ms)`);
  await p.evaluate(() => window.TableauOr.mouvements.regler(1.5)); await p.waitForFunction(() => window.TableauOr.mouvements.seuil() === 1.5 && window.TableauOr.mouvements.dernier().seuilAtr === 1.5, { timeout: 30000 });
  // interrupteur
  await p.evaluate(() => { const c = document.querySelector('[data-couche="mouvements"]'); c.click(); }); await w(500);
  G = await etatG(); v(!G.actif && G.dessines === 0, `${l}px : désactivable d’un clic`);
  await p.evaluate(() => document.querySelector('[data-couche="mouvements"]').click()); await w(1500); G = await etatG(); v(G.actif, `${l}px : réactivable d’un clic`);
  // autres unités : masqué
  await p.evaluate(() => document.querySelector('[data-periode="M15"]').click()); await w(2500);
  G = await etatG(); const bloc = await p.evaluate(() => ({ cache: document.querySelector('[data-mouv-bloc]').hidden, note: document.querySelector('[data-mouv-note]').hidden }));
  v(!G.actif && G.dessines === 0 && bloc.cache && bloc.note, `${l}px : masquée sur M15 (rectangles, réglages et avertissement)`);
  await p.evaluate(() => document.querySelector('[data-periode="H1"]').click()); await w(2500); G = await etatG(); v(G.actif, `${l}px : de retour sur H1, la couche revient`);
  // export
  const ex = await p.evaluate(() => { const T = window.TableauOr.mouvements, c = T.exporter('csv'), j = T.exporter('json'); return { csv: c.texte.split('\n').length, entete: c.texte.split('\n')[0], nom: c.nom, json: JSON.parse(j.texte).mouvements.length, av: JSON.parse(j.texte).avertissement, n: T.dernier().moves.length }; });
  v(ex.csv === ex.n + 2 && /dateUTC;heureParis/.test(ex.entete) && /\.csv$/.test(ex.nom) && ex.json === ex.n && /Rétrospectif/.test(ex.av), `${l}px : export CSV (${ex.csv - 2} lignes) et JSON (${ex.json})`);
  const debord = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2); v(!debord, `${l}px : pas de défilement horizontal`);
  await p.close();
}
await essai(1600, 900, false); await essai(390, 844, true);
v(erreurs.length === 0, 'aucune erreur JavaScript dans la console', erreurs.slice(0, 3).join(' | '));
await nav.close(); srv.kill();
console.log(`\nmouvements-chrome : ${nOk} OK, ${echecs.length} échec(s)`); process.exit(echecs.length ? 1 : 0);
