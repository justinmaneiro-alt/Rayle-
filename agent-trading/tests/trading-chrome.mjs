/* Test Chrome du trading actif : panneau Outils, lecture épurée, golden zone dessinée, commandes vocales, alertes vocales (phrases), setup A+ (rejeu 2026 affiché, « non prouvée »). Série H1 injectée. PC 1600 px, tablette 1024 px, téléphone 390 px. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H, N = 24 * 45; let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
let c = 4000; const cl = []; for (let i = 0; i < N; i++) { c += (rnd() - 0.5) * 9 + Math.sin(i / 37) * 3.2; cl.push(c); }
const serie = cl.map((x, i) => { const o = i ? cl[i - 1] : x; return { t: fin - (N - 1 - i) * H, o, h: Math.max(o, x) + rnd() * 3, l: Math.min(o, x) - rnd() * 3, c: x, v: 80 + rnd() * 80 }; });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [1024, 768, true], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/^rayle_or_/.test(k)) localStorage.removeItem(k); } catch (e) {} window.__dits = []; window.speak = t => window.__dits.push(t); });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.strategie.etat().stats.ma && window.__or.graph.etat().bougies.length > 20, { timeout: 40000 }).catch(() => {});
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.strategie.maj(true); }, serie); await w(800);
  v(await p.evaluate(() => !!document.querySelector('[data-ray-outils]') && document.querySelectorAll('[data-ray-outil]').length === 8 && !!document.querySelector('[data-ray-moyenne]')), `${l}px : panneau Outils (8 interrupteurs, choix de la moyenne)`);
  const g = await p.evaluate(() => { const gz = window.__or.strategie.golden(), E = window.__or.strategie.etat(); return { gz: gz && { cote: gz.cote, bas: gz.bas, haut: gz.haut }, boites: E.m.boites.filter(b => /^Golden zone/.test(b.etiquette)).length, types: window.__or.graph.rayleEtat().types }; });
  v(g.gz && g.boites === 1 && (g.types.boite || 0) >= 1, `${l}px : golden zone calculée et dessinée en petite boîte (${JSON.stringify(g.gz && [Math.round(g.gz.bas), Math.round(g.gz.haut)])})`);
  v(await p.evaluate(() => /non prouvée/.test(document.querySelector('[data-ray-outils] summary').textContent) && /Rejeu 2026 : 10 alertes sur 409 événements/.test(document.querySelector('[data-ray-aplus-corps]').innerText)), `${l}px : « règles de trading : non prouvées » et rejeu 2026 de l'A+ affiché (10 alertes sur 409 événements)`);
  // commandes vocales
  const cmd = async t => p.evaluate(async t => await window.TableauOr.commande(t), t);
  const r1 = await cmd('lecture épurée'); await w(300); const ep = await p.evaluate(() => { const c = window.__or.graph.couches(); return { ok: c.rayMa && c.rayGolden && c.veilleSemaine && !c.sr && !c.fleches && !c.rayBoites && !c.vwap }; });
  v(/Lecture épurée/.test(r1) && ep.ok, `${l}px : « lecture épurée » : MA200 + golden zone + niveaux de la veille seulement`);
  const r2 = await cmd('montre le VWAP'); await w(200); v(/VWAP/.test(r2) && await p.evaluate(() => window.__or.graph.couches().vwap === true), `${l}px : « montre le VWAP »`);
  await cmd('affiche les zones d\'offre et de demande'); await w(200); v(await p.evaluate(() => window.__or.graph.couches().ictOb === true), `${l}px : « affiche les zones d'offre et de demande »`);
  const r3 = await cmd('affiche l EMA 300'); await w(400); v(/EMA 300/.test(r3) && await p.evaluate(() => window.__or.strategie.etat().reg.moyenne === 'vema300' && window.__or.strategie.etat().m.maNom === 'EMA 300 pondérée volume'), `${l}px : « affiche l'EMA 300 » : EMA pondérée par le volume`);
  await cmd('affiche la MA 200'); const r4 = await cmd('où est la golden zone ?'); v(/Golden zone/.test(r4) && /non prouvée/.test(r4), `${l}px : « où est la golden zone ? » : ${String(r4).slice(0, 80)}…`);
  const r5 = await cmd('setup A+'); v(/non prouvée/.test(r5) && /pas un ordre/.test(r5) && /10 alertes/.test(r5), `${l}px : « setup A+ » : ${String(r5).slice(0, 90)}…`);
  const r6 = await cmd('désactive les alertes vocales'), r7 = await cmd('active les alertes vocales'); v(/coupées/.test(r6) && /activées/.test(r7), `${l}px : alertes vocales : désactivation et activation à la voix`);
  // alertes vocales : phrases (événements injectés)
  const dits = await p.evaluate(async () => { const S = window.__or.strategie, T = S.trading, I = S.interne(), n = I.B.length, base = I.B[n - 1].t; window.__dits.length = 0;
    const faux = { B: I.B, res: { events: [{ id: 'cassure|t1|1', type: 'cassure', dir: 1, i: n - 1 }, { id: 'fausse|t2|-1', type: 'fausse', dir: -1, i: n - 1 }, { id: 'rebond|t3|1', type: 'rebond', dir: 1, i: n - 1 }] } };
    T.alertesMa(faux); return window.__dits.slice(); });
  v(dits.length === 3 && /Cassure haussière de la MA 200 à/.test(dits[0]) && /carnet/i.test(dits[0]) && /fausse cassure/.test(dits[1]) && /Rebond/.test(dits[2]) && dits.every(t => /Règle non prouvée/.test(t)) && !dits.some(t => /(achète|vends|achetez|vendez)/i.test(t)), `${l}px : alertes vocales de la MA200 (cassure + carnet, retour, rebond) : ${dits[0] && dits[0].slice(0, 90)}`);
  const dits2 = await p.evaluate(() => { const S = window.__or.strategie, I = S.interne(); window.__dits.length = 0; S.trading.alertesMa({ B: I.B, res: { events: [{ id: 'cassure|t1|1', type: 'cassure', dir: 1, i: I.B.length - 1 }] } }); return window.__dits.length; });
  v(dits2 === 0, `${l}px : une alerte déjà dite n'est pas répétée`);
  await p.screenshot({ path: `captures-or/trading-${l}.png` });
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${l}px : pas de défilement horizontal`);
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
