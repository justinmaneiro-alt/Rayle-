/* Test Chrome de l'historique des flèches : sélecteur 1 / 3 / 6 mois / tout (mémorisé), calcul dans un Worker (l'interface ne gèle pas), cache, ligne « Période de réglage », carte « Bilan des flèches », 1600 / 1024 / 390 px, émulation tactile.
   Prérequis : node serveur.mjs 8011, depuis la racine du dépôt ; données : recherche-or/historique-donnees.mjs.   BASE=http://127.0.0.1:8011 node agent-trading/tests/fleches-historique-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
import { composite } from '../recherche-or/historique-series.mjs';
const require = createRequire(path.resolve('tests-navigateur/package.json')), puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const serie = composite().serie.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const ouvrir = async (l, h, mob) => {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); indexedDB.deleteDatabase('rayle-or-fleches-histo'); } } catch (e) { /* */ } });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {}); return p;
};
const injecter = async p => { await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); const S = b; window.__or.flechesT.histo().fixerSerie(async () => S); }, serie); await w(800); };   // série longue injectée (pas de réseau)
const attendre = p => p.evaluate(async () => { await window.__or.flechesT.histo().attendre(); return window.__or.flechesT.histo().etat(); });
const visibles = p => p.evaluate(() => window.__or.flechesT.visibles().length);
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await ouvrir(l, h, mob);
  // rythme de l'interface pendant le calcul : intervalles entre deux images (rAF) ; le Worker ne doit pas geler la page
  await p.evaluate(() => { window.__r = { max: 0, fin: false }; let t0 = performance.now(); const f = t => { window.__r.max = Math.max(window.__r.max, t - t0); t0 = t; if (!window.__r.fin) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t0 = Date.now(); await injecter(p); await p.evaluate(() => window.__or.flechesT.maj());
  const E1 = await attendre(p), dur = Date.now() - t0;
  const gel = await p.evaluate(() => { window.__r.fin = true; return window.__r.max; });
  v(E1.n > 100 && !E1.erreur && E1.mode === 'worker', `${l}px : historique calculé dans un Worker (${E1.n} flèches en ${Math.round(dur / 1000)} s, mode ${E1.mode})`);
  v(gel < 1000, `${l}px : l'interface n'est jamais gelée pendant le calcul (plus long intervalle entre deux images : ${Math.round(gel)} ms)`);
  const sel = await p.evaluate(() => { const s = document.querySelector('[data-fh-fen]'); return s ? { v: s.value, o: [...s.options].map(o => o.value + ':' + o.textContent) } : null; });
  v(sel && sel.v === '3m' && sel.o.join() === '1m:1 mois,3m:3 mois,6m:6 mois,tout:Tout', `${l}px : « Historique des flèches » dans Couches, 3 mois par défaut (${sel && sel.o.join(' ')})`);
  const N = {}; for (const c of ['1m', '3m', '6m', 'tout']) { await p.evaluate(k => window.__or.flechesT.histo().fixerFenetre(k), c); await w(900); N[c] = await visibles(p); }
  v(N['1m'] <= N['3m'] && N['3m'] <= N['6m'] && N['6m'] <= N.tout && N.tout > N['1m'], `${l}px : plus la période est longue, plus de flèches (1 mois ${N['1m']} · 3 mois ${N['3m']} · 6 mois ${N['6m']} · tout ${N.tout})`);
  const de = await p.evaluate(() => { const T = window.__or.flechesT, n = Date.now(); return T.visibles().length ? Math.min(...T.visibles().map(f => f.tCloture)) : null; });
  const marques = await p.evaluate(() => window.__or.graph.marquesAffichees().filter(m => /^ft/.test(m.id)));
  v(marques.length > 50 && marques.every(m => !m.text), `${l}px : à fort dézoom (tout) aucune étiquette de texte sur les flèches (${marques.length} marques ; avec texte : ${marques.filter(m => m.text).map(m => m.id.slice(0, 22) + ':' + m.text).slice(0, 3).join(' ')})`);
  await p.evaluate(() => window.__or.flechesT.histo().fixerFenetre('3m')); await w(300);
  // mémorisation
  await p.evaluate(() => window.__or.flechesT.histo().fixerFenetre('6m')); await w(200); await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  await injecter(p); await p.evaluate(() => window.__or.flechesT.maj()); await attendre(p);
  const t1 = Date.now(); await p.evaluate(() => window.__or.flechesT.histo().recalculer()); const E2 = await attendre(p);   // même série, même règles : le calcul vient du cache IndexedDB
  v(E2.fenetre === '6m', `${l}px : la période choisie est mémorisée (${E2.fenetre})`);
  v(E2.depuisCache === true && Date.now() - t1 < 8000, `${l}px : même série relancée = calcul lu dans le cache IndexedDB (${Math.round((Date.now() - t1) / 1000)} s, cache : ${E2.depuisCache})`);
  // ligne « Période de réglage »
  await p.evaluate(() => { const c = window.__or.graph.chart(); c.timeScale().setVisibleRange({ from: Date.UTC(2026, 8, 30, 6) / 1000, to: Date.UTC(2026, 9, 2, 6) / 1000 }); }); await w(900);
  const rx = await p.evaluate(() => window.__or.graph.lectureV8Etat().reglageX);
  v(rx != null && rx > 0, `${l}px : ligne verticale « Période de réglage → » tracée au 1er octobre 2026 (x = ${rx == null ? 'absente' : Math.round(rx)})`);
  const bulle = await p.evaluate(x => { window.__or.flechesT.bulleA(window.__or.graph.etat().bougies[200].t / 1000, x, 100); const b = [...document.querySelectorAll('.tor-ft-bulle')].find(e => !e.hidden); return b ? b.textContent : ''; }, rx || 0);
  v(/hors échantillon/.test(bulle) && /1er octobre 2026/.test(bulle), `${l}px : l'infobulle de la ligne dit que ce qui est avant est hors échantillon`);
  // carte « Bilan des flèches » : fermée par défaut, bouton dans Couches
  const fermee = await p.evaluate(() => { const c = document.querySelector('[data-fb]'); return !!c && c.hidden; }); v(fermee, `${l}px : la carte « Bilan des flèches » est fermée par défaut`);
  await p.evaluate(() => window.__or.flechesT.histo().fixerFenetre('tout')); await p.evaluate(() => document.querySelector('[data-fh-bilan]').click());
  await p.waitForFunction(() => /Avant la période de réglage/.test((document.querySelector('[data-fb-corps]') || {}).textContent || ''), { timeout: 60000 }).catch(() => {}); await w(300);
  const carte = await p.evaluate(() => { const c = document.querySelector('[data-fb]'); return { ouverte: !c.hidden, texte: c.querySelector('[data-fb-corps]').textContent, largeur: c.getBoundingClientRect().width, vp: innerWidth }; });
  v(carte.ouverte && /Règles réglées sur la période récente : le hors échantillon est la partie utile/.test(carte.texte) && /Depuis le 1er octobre 2026/.test(carte.texte), `${l}px : le bilan s'ouvre, sépare avant / après la période de réglage et rappelle que le hors échantillon est la partie utile`);
  v(/spread 1 pb/.test(carte.texte) && /(pas assez de données|pas mieux que le hasard|mieux que le hasard)/.test(carte.texte), `${l}px : frais indiqués et verdict sans surinterprétation`);
  v(carte.largeur <= carte.vp, `${l}px : la carte tient dans l'écran (${Math.round(carte.largeur)} px)`);
  await p.screenshot({ path: `outils-restructuration/captures/historique-fleches-${l}.png` }); if (l === 1600) fs.copyFileSync(`outils-restructuration/captures/historique-fleches-${l}.png`, 'outils-restructuration/captures/historique-fleches-annotee.png');   // capture annotée : ligne « Période de réglage → », bilan ouvert
  await p.evaluate(() => window.__or.flechesT.histo().fixerOuvert(false));
  v(await p.evaluate(() => document.querySelector('[data-fb]').hidden), `${l}px : la carte se referme`);
  v(p.__err.length === 0, `${l}px : aucune erreur de script ${p.__err.join(' | ').slice(0, 160)}`);
  await p.close();
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
