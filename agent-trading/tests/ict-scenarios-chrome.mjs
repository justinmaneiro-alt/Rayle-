/* Scénarios ICT de Rayle dans un vrai navigateur : le terminal (or.html) est hébergé dans un cadre, comme dans l'application ; les outils lecture_graphique et lecture_ict de Rayle sont exécutés pour de vrai.
   Bougies de l'or de l'écran : simulées (relais Kraken intercepté) ; bougies des autres unités : instantané du robot (branche « donnees »), comme en production. Écrit les réponses dans captures-or/ict-scenarios.json.
   Le texte du modèle Gemini lui-même n'est pas testable sans la clé du Worker : ici on vérifie ce que l'IA REÇOIT (l'outil) et ce que Rayle DIT sans IA (résumé déterministe de repli).
   Prérequis : node serveur.mjs 8011. Usage : node agent-trading/tests/ict-scenarios-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
let PRIX = 3500; try { const r = await fetch('https://rayle-or-relais.justinmaneiro.workers.dev/kraken/ticker', { signal: AbortSignal.timeout(8000) }); const d = await r.json(); if (d && d.ticker && +d.ticker.last > 0) PRIX = +d.ticker.last; } catch (e) { /* repli */ }
const PAS = { '15m': 15 * 60e3, '1h': 3600e3, '4h': 4 * 3600e3, '1d': 86400e3 };
function serie(pas, de, a) {
  const n0 = Math.floor(Date.now() / pas) * pas, debut = n0 - 1800 * pas, out = []; let s = 7 + pas / 1000, x = 3500; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, sig = 1.4 * Math.sqrt(pas / 3600e3);
  for (let i = 0, t = debut; t <= n0; i++, t += pas) { const imp = i % 37 === 0 ? (rnd() < 0.5 ? -1 : 1) * 3.2 * sig : 0, o = x; x += (rnd() - 0.5) * 2.2 * sig + imp + Math.sin(i / 23) * 0.5 * sig; out.push({ time: t, open: o, high: Math.max(o, x) + rnd() * 0.5 * sig, low: Math.min(o, x) - rnd() * 0.5 * sig, close: x, volume: 100 + rnd() * 50 }); }
  const dec = PRIX - out[out.length - 1].close; for (const b of out) { b.open += dec; b.high += dec; b.low += dec; b.close += dec; }
  return out.filter(b => b.time >= de && b.time < a);
}
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900 }); const err = []; p.on('pageerror', e => err.push(e.message));
await p.setRequestInterception(true);
p.on('request', r => { const u = r.url();
  if (u.includes('/kraken/bougies')) { const q = new URL(u).searchParams, pas = PAS[q.get('res')]; if (!pas) return r.continue(); const de = (+q.get('from') || 0) * 1000, a = q.get('to') ? +q.get('to') * 1000 : Infinity;
    return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ candles: serie(pas, de, a).map(b => ({ ...b, time: String(b.time) })) }) }); }
  if (/api\.binance\.com|fapi\.binance\.com|kraken\/ticker|kraken\/instrument/.test(u)) return r.abort('failed');
  return r.continue(); });
await p.evaluateOnNewDocument(() => { try { localStorage.clear(); localStorage.setItem('rayle_donnees_base', 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/'); } catch (e) { /* */ } });
await p.goto(BASE + '/agent-trading/tests/ict-harnais.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => { const f = document.getElementById('terminal'), W = f && f.contentWindow; try { return W && W.__or && W.__or.moteur && W.__or.moteur.serie().length > 100 && W.__orPro && W.__orPro.graphe && W.__orPro.graphe() && W.document.querySelector('[data-periode][aria-pressed="true"]'); } catch (e) { return false; } }, { timeout: 60000 }); await w(2500);
const run = (nom, args) => p.evaluate(async (n, a) => { const O = await import('/trader-pro/cerveau/outils.js'); return await O.executer(n, a); }, nom, args);
const local = q => p.evaluate(async t => { const O = await import('/trader-pro/cerveau/outils.js'); return await O.lectureLocale(t); }, q);
const clic = u => p.evaluate(x => { const D = document.getElementById('terminal').contentDocument; D.querySelector(`[data-periode="${x}"]`).click(); }, u);
const mode = m => p.evaluate(x => { const D = document.getElementById('terminal').contentDocument, s = D.querySelector('[data-tp-mode]'); s.value = x; s.dispatchEvent(new Event('change', { bubbles: true })); }, m);
const sortie = {}; const AUTRES = { M15: /\b(H1|H4|Daily)\b/, H1: /\b(M15|H4|Daily)\b/, H4: /\b(M15|H1|Daily)\b/, Daily: /\b(M15|H1|H4)\b/ };
await mode('ict'); await clic('H1'); await w(3500);
/* 1. graphique H1 : « qu'est-ce que tu vois en ICT ? » */
let g = await run('lecture_graphique', {}); v(g.pret && g.unite === 'H1' && g.mode !== undefined, `lecture_graphique : unité affichée ${g.unite}, actif ${g.actif}`);
let L = await run('lecture_ict', {}); sortie['H1 · qu\'est-ce que tu vois en ICT ?'] = { outil: 'lecture_ict {}', unite: L.unite, origine: L.origine, resume: await local('qu est-ce que tu vois en ICT ?') };
v(L.unite === 'H1' && L.affiche === true && L.source === 'ict-v2', `1. lecture_ict sans unité lit l'unité affichée (${L.unite}, ${L.origine})`);
v([...L.liquidites, ...L.pdArrays].every(x => x.unite === 'H1') && !L.tendance.pourquoi.match(/H4|M15|Daily/), '1. aucun élément H4 ni M15 dans la lecture H1');
let R = sortie['H1 · qu\'est-ce que tu vois en ICT ?'].resume; v(/^En H1 : /.test(R) && !AUTRES.H1.test(R) && !/ach[eè]te|vends/i.test(R), '1. réponse de repli : « ' + R.slice(0, 160) + '… »');
/* 2. « et en H4 ? » */
L = await run('lecture_ict', { unite: 'H4' }); const R4 = await local('et en H4 ? toujours en ICT'); sortie['« et en H4 ? »'] = { outil: 'lecture_ict {unite:H4}', unite: L.unite, origine: L.origine, resume: R4 };
v(L.unite === 'H4' && L.affiche === false && /instantané/.test(L.origine || ''), `2. « et en H4 ? » : lecture H4 seule (${L.unite || L.indisponible}, ${L.origine})`);
v(/^En H4 : /.test(R4) && !AUTRES.H4.test(R4), '2. réponse de repli H4 : « ' + R4.slice(0, 160) + '… »');
/* 3. graphique M15 : « où est la liquidité ? » */
await clic('M15'); await w(3500); g = await run('lecture_graphique', {}); L = await run('lecture_ict', {}); const R15 = await local('où est la liquidité ? en M15'); sortie['M15 · où est la liquidité ?'] = { outil: 'lecture_ict {}', unite: L.unite, liquidites: L.liquidites, temps: L.temps, resume: R15 };
v(g.unite === 'M15' && L.unite === 'M15' && L.affiche === true, `3. graphique M15 : lecture_ict lit le M15 (${L.unite})`);
v(Array.isArray(L.liquidites) && L.liquidites.length > 0 && L.liquidites.every(x => x.unite === 'M15') && L.temps !== null && 'killzone' in L.temps, `3. liquidités M15 (${L.liquidites.map(x => x.type + ' ' + x.prix + (x.balayee ? ' balayé' : '')).join(', ')}) et killzone (${JSON.stringify(L.temps && L.temps.killzone)})`);
v(/^En M15 : /.test(R15) && /Liquidité/.test(R15) && !AUTRES.M15.test(R15), '3. réponse de repli M15 : « ' + R15.slice(0, 200) + '… »');
/* 4. top-down */
const TD = await local('fais-moi le top-down ICT'); sortie['fais-moi le top-down ICT'] = { resume: TD };
const rub = (TD.match(/^En (Daily|H4|H1|M15) :/gm) || []).map(x => x.replace(/^En | :$/g, '')); v(rub.join() === 'Daily,H4,H1,M15', `4. top-down : rubriques ${rub.join(' → ')}`);
const liaison = TD.split('\n').pop(); v(liaison && !/^En /.test(liaison) && /(unités|dynamique)/.test(liaison), '4. une phrase de liaison : « ' + liaison + ' »');
/* 5. order block */
await clic('H1'); await w(3000); const OB = await local('c\'est un vrai order block ?'); sortie['c\'est un vrai order block ?'] = { resume: OB };
v(/^En H1 : /.test(OB) && (/1\) Prise de liquidité : (oui|non)/.test(OB) && /2\) Reversal candle/.test(OB) && /3\) FVG/.test(OB) || /aucun order block/.test(OB)), '5. order block : ' + OB.slice(0, 260) + '…');
await p.screenshot({ path: 'captures-or/ict-scenarios.png' }); fs.writeFileSync('captures-or/ict-scenarios.json', JSON.stringify(sortie, null, 1));
v(err.length === 0, 'aucune erreur de page ' + err.slice(0, 2).join(' | ')); await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
