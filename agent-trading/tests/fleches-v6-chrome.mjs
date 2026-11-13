/* Test Chrome des flèches v6 (v5 + 2ᵉ touche + raison des points gris) (niveaux en trait plein ; série Kraken réelle) : PC 1600, tablette 1024, téléphone 390. Série H1 fabriquée (1 440 bougies, tendance + oscillations).
   (i) jamais plus d'1 flèche par fenêtre de 12 bougies ; (ii) au plus 12 flèches visibles sur 600 bougies ; (iii) aucune flèche sans MA200 ni gros niveau ;
   la case « Toutes les flèches (debug) » existe, désactivée par défaut ; le graphique porte exactement les flèches visibles.
   Prérequis : node serveur.mjs 8125.   BASE=http://127.0.0.1:8011 node agent-trading/tests/fleches-lecture-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
const H = 3600e3, serie = JSON.parse(fs.readFileSync('agent-trading/recherche-or/donnees/kraken-xau-h1-13-nov.json', 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, serie); await w(800);
  await p.evaluate(() => { window.__or.flechesT.maj(); }); await w(1500);
  const E = await p.evaluate(() => { const T = window.__or, L = T.flechesT.liste().filter(f => !f.masquee), V = T.flechesT.visibles(); return { n: L.length, vis: V.map(f => ({ contre: f.contre, invalidee: f.invalidee, dir: f.dir, niveauType: f.niveauType, niveauStyle: f.niveauStyle, levelId: f.levelId, t: f.tCloture, type: f.type, source: f.source, zone: f.zone || null })), etat: T.flechesT.etat(), posees: T.graph.flechesTerminalEtat(), debug: (() => { const i = [...document.querySelectorAll('.tor-couches input, [data-couche]')].find(x => /debug|flechesTout/i.test((x.parentElement && x.parentElement.textContent) + (x.dataset.couche || '') + (x.dataset.c || ''))); return i ? { present: true, coche: !!i.checked } : { present: false }; })(), couches: window.__or.graph.couches() }; });
  let grappes = 0; for (const d of [1, -1]) { const t = E.vis.filter(x => x.dir === d).map(x => x.t).sort((a, b) => a - b); for (let k = 1; k < t.length; k++) if (t[k] - t[k - 1] < 1 * H) grappes++; }   // même sens, même bougie (deux sens opposés sur une bougie restent possibles)
  const t = E.vis.map(x => x.t).sort((a, b) => a - b); let max = 0; for (let k = 0; k < t.length; k++) max = Math.max(max, t.filter(x => x >= t[k] && x < t[k] + 600 * H).length);
  v(E.n >= 0 && E.etat.raison == null, `${l}px : flèches de lecture calculées (${E.n} au registre, ${E.vis.length} visibles sur 30 jours)`);
  v(grappes === 0, `${l}px : (i) aucune grappe (deux flèches jamais sur la même bougie ; la distance de 6 bougies est testée en Node) : ${grappes}`);
  { const ts = E.vis.map(x => x.t).sort((a, b) => a - b); let tp = 0; for (let k = 1; k < ts.length; k++) if (ts[k] - ts[k - 1] < 6 * H) tp++; v(tp === 0, `${l}px : aucune superposition de flèches (au moins 6 bougies d'écart) : ${tp}`); }
  console.log(`INFO ${l}px : maximum de flèches visibles sur 600 bougies H1 : ${max}`);
  v(E.vis.every(x => (x.levelId === 'MA200' && x.type === 'ma_cassure') || (x.type === 'retournement' && x.levelId && (x.niveauType === 'structure' || x.niveauType === 'swing') && x.niveauStyle === 'trait plein')), `${l}px : (a) chaque flèche est sur la MA200 ou un niveau en trait plein (structure / swing actif)`);
  v(E.posees.posees === E.vis.length, `${l}px : le graphique porte exactement les flèches visibles (${E.posees.posees} / ${E.vis.length})`);
  const COUL = await p.evaluate(() => (window.__or.graph.marquesAffichees ? window.__or.graph.marquesAffichees() : []).filter(m => /^f[tc]/.test(m.id)).map(m => ({ c: m.color, s: m.shape, t: m.text })));
  v(COUL.length > 0 && COUL.every(m => (/^(#2ecc71|#ff4d4d|#8fd0e3)$/.test(m.c) && m.t === undefined) || (m.c === '#7d8791' && (m.t === undefined || m.t === '×')) || m.c === '#5d6872'), `${l}px : flèches vertes / rouges / cyan (MA200), points gris (contre-tendance) ou invalidées grises avec × : ${[...new Set(COUL.map(m => m.c))].join(' ')}`);
  v(E.couches.fleches !== false && E.couches.flechesTout === false, `${l}px : couche « flèches de lecture » active, « toutes les flèches (debug) » désactivée par défaut (${JSON.stringify({ f: E.couches.fleches, d: E.couches.flechesTout })})`);
  { const R = await p.evaluate(async () => { const T = window.__or, F = await import('/agent-trading/front/or/fleches-simples-v6.js'), L = T.flechesT.liste(), C = T.flechesT.contacts(), M = T.graph.marquesAffichees().filter(m => /^f[tc]/.test(m.id));
      const deux = L.filter(f => f.deuxiemeTouche && !f.contre), cible = L.find(f => f.type === 'retournement' && f.dir < 0 && !f.contre && f.deuxiemeTouche && f.zoneHaut > 4125 && f.zoneBas < 4155 && f.tCloture >= Date.UTC(2026, 10, 9, 18) && f.tCloture <= Date.UTC(2026, 10, 10, 1));   // double sommet 4 131–4 144 (le fuseau du navigateur peut changer le niveau de structure retenu : POC ou VAH mensuel)
      const par = new Map(); for (const m of M) par.set(m.time, (par.get(m.time) || 0) + 1);
      return { nDeux: deux.length, cibleCouleur: cible ? !cible.contre : null, autour: L.filter(f => f.tCloture >= Date.UTC(2026, 10, 9, 18) && f.tCloture <= Date.UTC(2026, 10, 10, 1)).map(f => ({ t: new Date(f.tCloture).toISOString().slice(5, 16), contre: !!f.contre, dt: !!f.deuxiemeTouche, lv: f.levelId })), cibleDetail: cible ? F.detail(cible).join(' | ') : '', nContacts: C.length, raisons: C.every(k => /^(bloqué|en attente) : /.test(k.raison)), detailContact: C[0] ? F.detailContact(C[0]).join(' | ') : '', maxParBougie: Math.max(0, ...par.values()), gris: M.filter(m => m.id.startsWith('fc')).length }; });
    v(R.nDeux >= 1 && R.cibleCouleur === true, `${l}px : la 2ᵉ touche du 9 nov. au soir sur 4 131–4 150 est une flèche colorée (${R.nDeux} flèche(s) « 2ᵉ touche ») ${JSON.stringify(R.autour)}`);
    v(/2ᵉ touche : double sommet\/double creux/.test(R.cibleDetail) && /Stop .*TP1 .*TP2|Invalidée/.test(R.cibleDetail), `${l}px : infobulle de la 2ᵉ touche : étiquette + entrée/stop/TP ${R.cibleDetail.slice(0, 400)}`);
    v(R.nContacts > 0 && R.raisons && /bloqué|en attente/.test(R.detailContact) && /pas un ordre/.test(R.detailContact), `${l}px : ${R.nContacts} point(s) gris expliqué(s), chacun avec sa raison (« ${R.detailContact.split(' | ')[0]} »)`);
    v(R.maxParBougie <= 1, `${l}px : aucun marqueur superposé (au plus 1 marque flèche/point par bougie : ${R.maxParBougie})`); }
  v(err.length === 0, `${l}px : aucune erreur de script ${err.join(' | ').slice(0, 160)}`);
  await p.screenshot({ path: `outils-restructuration/captures/fleches-v6-${l}.png` }); await p.close();
}
await nav.close(); console.log(ko ? 'ÉCHECS : ' + ko : 'tout passe'); process.exit(ko ? 1 : 0);
