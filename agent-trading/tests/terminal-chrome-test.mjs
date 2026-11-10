/* Test Chrome du TERMINAL DE RAYLE (vraies données : relais Kraken de l'or, Binance). Phases A à E selon ce qui est présent.
   Prérequis : node serveur.mjs 8125.   Usage : node agent-trading/tests/terminal-chrome-test.mjs [A|B|C|D|E ...] */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8125';
const PHASES = process.argv.slice(2).length ? process.argv.slice(2) : ['A'];
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m, d ? '· ' + d : ''); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
export const IGNORER = /favicon|status of 404|Telegram|ERR_|net::/i;

export async function ouvrirTerminal(ctx, { init, url = '/agent-trading/front/terminal-ancien.html', l = 1600, h = 900 } = {}) {
  const p = await ctx.newPage(); await p.setViewport({ width: l, height: h, deviceScaleFactor: 1 });
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !IGNORER.test(m.text())) erreurs.push('console : ' + m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument(() => { window.__longues = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longues.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* */ } });
  if (init) await p.evaluateOnNewDocument(init);
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__terminal && window.__terminal.graph.etat().n > 100, { timeout: 90000 });
  await w(600); return p;
}

if (PHASES.includes('A')) {
  const ctx = await nav.createBrowserContext();
  const p = await ouvrirTerminal(ctx, { init: () => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.clear(); } } });
  const d = await p.evaluate(() => {
    const T = window.__terminal, ch = T.graph.chart(), series = ch.panes().flatMap(x => x.getSeries());
    return { cats: [...document.querySelectorAll('.tr-outils .tr-cat')].map(c => c.title).filter(Boolean), outils: [...document.querySelectorAll('[data-outil]')].map(b => b.dataset.outil),
      unites: [...document.querySelectorAll('[data-unite]')].map(b => b.dataset.unite), actifs: [...document.querySelectorAll('[data-actif] option')].map(o => o.value),
      carnet: !!document.querySelector('.tr-carnet canvas'), bas: [...document.querySelectorAll('[data-section]')].map(b => b.dataset.section), nSeries: series.length,
      menus: [...document.querySelectorAll('[data-m]')].map(b => b.dataset.m), cloche: !!document.querySelector('[data-a="alertes"]'), prix: document.querySelector('[data-prix]').textContent, couches: T.couches() };
  });
  verifier(d.cats.join() === 'Curseur,Lignes,Zones,Mesure,Position,Texte,Gomme', 'barre d’outils à gauche rangée par catégories', d.cats.join());
  verifier(['horizontale', 'tendance', 'rayon', 'verticale', 'zone', 'mesure', 'position', 'texte', 'gomme'].every(x => d.outils.includes(x)), 'outils présents');
  verifier(d.unites.join() === 'M5,M15,H1,H4,J' && d.menus.join() === 'indicateurs,couches' && d.cloche, 'barre du haut : unités, indicateurs, couches, alertes');
  verifier(d.actifs.join() === 'OR,NASDAQ,BTC,SOL,DOGE', 'sélecteur : les 5 actifs seulement');
  verifier(d.carnet, 'carnet d’ordres à droite');
  verifier(['tableau', 'sante', 'calendrier', 'cot', 'rapports', 'actus', 'journal', 'alertes', 'registre'].every(x => d.bas.includes(x)), 'page qui défile : sections tableau, santé, calendrier, COT, rapports, actualités, journal, alertes, registre', d.bas.join());
  verifier(d.nSeries === 2 && !d.couches.ma200 && !d.couches.sr && d.couches.volume, 'graphique VIERGE par défaut : bougies + volume', 'séries : ' + d.nSeries);
  verifier(/\d/.test(d.prix), 'prix affiché', d.prix);
  // SMA 200 sur tout l'historique : couche ajoutée, mémorisée par actif
  await p.evaluate(() => window.__terminal.couche('ma200', true)); await w(800);
  const m = await p.evaluate(() => { const T = window.__terminal, v = T.valeursMA().ma200, B = T.serie().bougies(); let s = 0; for (let i = B.length - 200; i < B.length; i++) s += B[i].c; return { n: B.length, v: v && v[v.length - 1], att: s / 200, nul: v ? v.filter(x => x == null).length : -1, series: T.graph.chart().panes().flatMap(x => x.getSeries()).length }; });
  verifier(m.v && Math.abs(m.v - m.att) < 1e-6 && m.nul === 199 && m.series === 3, 'SMA 200 calculée sur TOUT l’historique chargé', `${m.n} bougies`);
  await p.evaluate(() => window.__terminal.couche('ma200H1', true)); await w(2500);
  const h1 = await p.evaluate(() => { const v = window.__terminal.valeursMA().ma200H1; return v ? v.filter(x => x != null).length : 0; });
  verifier(h1 > 100, 'option SMA 200 H1 sur l’unité affichée', h1 + ' valeurs');
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__terminal && window.__terminal.graph.etat().n > 100, { timeout: 60000 }); await w(800);
  const mem = await p.evaluate(() => window.__terminal.couches());
  verifier(mem.ma200 && mem.ma200H1, 'couches mémorisées après rechargement');
  // unités et actifs
  for (const u of ['H1', 'J', 'M5']) {
    await p.evaluate(u2 => window.__terminal.choisirUnite(u2), u);
    await p.waitForFunction(u2 => window.__terminal.graph.etat().unite === u2 && window.__terminal.graph.etat().n > 50, { timeout: 60000 }, u);
    await w(3000); verifier(true, 'unité ' + u + ' chargée', await p.evaluate(() => document.querySelector('[data-hist]').textContent));
  }
  await p.evaluate(() => window.__terminal.choisirActif('BTC'));
  await p.waitForFunction(() => window.__terminal.graph.etat().actif === 'BTC' && window.__terminal.graph.etat().n > 50, { timeout: 60000 });
  const btc = await p.evaluate(() => ({ prix: window.__terminal.prix(), src: document.querySelector('[data-source]').textContent, c: window.__terminal.couches(), carnet: document.querySelector('[data-cn-instr]').textContent }));
  verifier(btc.prix > 10000 && /BTC|XBT/.test(btc.src), 'Bitcoin : prix d’un bitcoin (jamais celui de l’or)', btc.src + ' · ' + btc.prix);
  verifier(!btc.c.ma200, 'couches propres à chaque actif (BTC vierge)');
  verifier(/PF_XBTUSD/.test(btc.carnet), 'carnet du Bitcoin', btc.carnet);
  await p.evaluate(() => window.__terminal.choisirActif('NASDAQ')); await w(5000);
  const nq = await p.evaluate(() => ({ e: window.__terminal.graph.etat(), h: document.querySelector('[data-hist]').textContent, prix: window.__terminal.prix() }));
  verifier(nq.e.actif === 'NASDAQ' && (nq.e.n === 0 ? /indisponibles/.test(nq.h) : nq.prix > 10000), 'Nasdaq : vraies bougies ou erreur claire (jamais celles d’un autre actif)', nq.h.slice(0, 90));
  await p.evaluate(() => { window.__terminal.choisirActif('OR'); window.__terminal.ongletBas('dash'); }); await p.waitForFunction(() => window.__terminal.graph.etat().actif === 'OR' && window.__terminal.graph.etat().n > 50, { timeout: 60000 }); await w(4000);
  const dash = await p.evaluate(() => ({ cot: document.querySelector('[data-d="cotations"]').textContent, sante: document.querySelector('[data-section="sante"]').textContent }));
  verifier(/Or/.test(dash.cot) && /Bitcoin/.test(dash.cot), 'cotations des 5 actifs');
  verifier(/Volatilit/.test(dash.sante) && /Spread/.test(dash.sante), 'santé du marché');
  const L = await p.evaluate(() => window.__longues.slice());
  verifier(Math.max(0, ...L) < 800, 'aucune pause > 0,8 s', 'pire tâche longue ' + Math.max(0, ...L) + ' ms');
  await p.screenshot({ path: 'captures-or/terminal-a.png' });
  // dans Rayle : la vue « Terminal » monte le nouveau terminal
  const r = await ctx.newPage(); await r.setViewport({ width: 1600, height: 900 });
  r.on('pageerror', e => erreurs.push('rayle : ' + e.message));
  await r.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }); await w(2500);
  await r.evaluate(() => RayleBus.demander('vue:ouvrir', 'terminal')); await w(4000);
  const v = await r.evaluate(() => ({ tr: !!document.querySelector('#vueTerminal iframe.tr-or'), visible: !document.getElementById('vueTerminal').hidden, ancien: 'none', agent: !!document.querySelector('#g1Menu [data-p="agent"]') }));
  verifier(v.tr && v.visible && v.ancien === 'none', 'Rayle : la vue Terminal ouvre le terminal à jour (or.html)');
  verifier(!v.agent, 'Rayle : l’entrée « Agent » a disparu du menu');
  await r.evaluate(() => RayleBus.emit('vue:demande', { vue: 'rayle' })); await w(800);
  verifier(await r.evaluate(() => !document.querySelector('#vueTerminal .tr')), 'fermer la vue démonte le terminal');
  await ctx.close();
}

const suite = { verifier, w, ouvrirTerminal, nav, erreurs };
for (const ph of ['B', 'C', 'D', 'E', 'F']) if (PHASES.includes(ph)) { const m = await import(`./terminal-chrome-${ph.toLowerCase()}.mjs`); await m.default(suite); }

verifier(!erreurs.length, 'aucune erreur JavaScript', erreurs.slice(0, 5).join(' | '));
await nav.close();
console.log(`\n${nOk} réussis, ${echecs.length} échecs${echecs.length ? ' : ' + echecs.join(' ; ') : ''}`);
process.exit(echecs.length ? 1 : 0);
