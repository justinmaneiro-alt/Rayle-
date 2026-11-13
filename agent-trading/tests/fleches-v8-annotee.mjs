/* Capture annotée des trois versions (Direct v8, Direct v7 validée, Direct stable v6) sur la série Kraken : outils-restructuration/captures/fleches-gros-mouvements-annotee.png
   Prérequis : node serveur.mjs 8011, depuis la racine.   BASE=http://127.0.0.1:8011 node agent-trading/tests/fleches-v8-annotee.mjs */
import fs from 'node:fs'; import { lancer, ouvrir, w, serie13 } from './tactile-aide.mjs';
const nav = await lancer(); const imgs = [];
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest)_/.test(k)) localStorage.removeItem(k); } } catch (e) { /* */ } });
await p.goto((process.env.BASE || 'http://127.0.0.1:8011') + '/agent-trading/front/or.html?pro=1#trading', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__or && window.__or.graph && window.__or.flechesT && window.__or.graph.etat().bougies.length > 20, { timeout: 45000 }).catch(() => {});
await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); }, serie13()); await w(1000);
for (const [mode, titre] of [['direct', 'Direct (v8 « gros mouvements »)'], ['v7', 'Direct (v7 validée)'], ['stable', 'Direct (stable, v6)']]) {
  await p.evaluate(m => window.__or.flechesT.fixerMode(m), mode); await w(3000);
  const n = await p.evaluate(() => { const L = window.__or.flechesT.liste(); return { n: L.length, col: L.filter(f => !f.contre && !f.invalidee).length }; });
  const buf = await p.screenshot({ type: 'png' }); imgs.push({ titre: `${titre} — ${n.n} flèches sur la fenêtre de 30 jours (${n.col} colorées)`, data: Buffer.from(buf).toString('base64') });
}
const html = `<body style="margin:0;background:#05080c;color:#d7e3ea;font:600 22px system-ui"><div style="display:flex;flex-direction:column;gap:14px;padding:14px">${imgs.map(i => `<div><div style="padding:6px 4px">${i.titre}</div><img style="width:100%;border:1px solid #1c2a33" src="data:image/png;base64,${i.data}"></div>`).join('')}<div style="font:14px system-ui;color:#8a98a0;padding:4px">Série Kraken PF_XAUUSD H1, ${new Date().toISOString().slice(0, 10)}. Outil de lecture, jamais un ordre ; règles choisies en regardant des exemples (aucune preuve de performance).</div></div></body>`;
const q = await nav.newPage(); await q.setViewport({ width: 1600, height: 900 }); await q.setContent(html, { waitUntil: 'load' }); await w(1500);
fs.mkdirSync('outils-restructuration/captures', { recursive: true });
await q.screenshot({ path: 'outils-restructuration/captures/fleches-gros-mouvements-annotee.png', fullPage: true }); await nav.close(); console.log('capture écrite');
