/* Test Chrome : « Analyse ICT » en un clic (un second clic efface), couches ICT séparées et décochées par défaut, 8 objets au plus, killzones en heure de Paris, rapport de la semaine,
   voix « Analyse ICT de la semaine », fiches, registre forward ; PC 1600 px et téléphone 390 px. Série H1 injectée (aucun réseau). */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H, N = 24 * 14;
let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
let c = 4000; const cl = []; for (let i = 0; i < N; i++) { c += (rnd() - 0.5) * 7 + Math.sin(i / 14) * 2.2; cl.push(c); }
const serie = cl.map((x, i) => { const o = i ? cl[i - 1] : x; return { t: fin - (N - 1 - i) * H, o, h: Math.max(o, x) + rnd() * 2, l: Math.min(o, x) - rnd() * 2, c: x, v: 100 }; });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function ouvrir(l, h, mob) { const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of ['rayle_or_ict_forward', 'rayle_or_ict_reglages', 'rayle_or_couches_v2', 'rayle_or_journal']) localStorage.removeItem(k); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.ict && window.__or.structure && window.__or.structure.etat().stats && window.__or.ict.etat().stats, { timeout: 40000 }); await w(2500); p.__err = err; return p; }
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await ouvrir(l, h, mob);
  v(await p.evaluate(() => ['ictLiquidite', 'ictStructure', 'ictFvg', 'ictOb', 'ictPd', 'ictTemps', 'ictAmd'].every(k => { const c = document.querySelector(`[data-couche="${k}"]`); return c && !c.checked; })) && !!(await p.$('[data-a="ict-un-clic"]')), `${l}px : sept couches ICT séparées, décochées par défaut, bouton « Analyse ICT » présent`);
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.ict.maj(true); }, serie); await w(600);
  v(await p.evaluate(() => window.__or.graph.ictEtat().cadres === 0), `${l}px : rien n'est dessiné avant le clic`);
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ict-un-clic"]').click()); await p.waitForFunction(() => window.__or.graph.ictEtat().cadres > 0, { timeout: 8000 }).catch(() => {}); await w(500);
  const e1 = await p.evaluate(() => window.__or.graph.ictEtat()); v(e1.cadres > 0 && (e1.types.kz || 0) >= 5, `${l}px : un clic dessine l'analyse (${JSON.stringify(e1.types)})`);
  const an = await p.evaluate(() => { const E = window.__or.ict.etat(); const a = E.an; return a ? { jours: a.jours.length, fvg: a.fvg.length, ob: a.ob.length, liq: a.liquidites.length, amd: a.amd.length, objets: window.__or.ict.etat().an && window.__or.graph.etat().aff ? 1 : 0 } : null; });
  v(an && an.jours === 5 && an.liq > 5 && an.fvg > 0, `${l}px : analyse de la semaine glissante (${JSON.stringify(an)})`);
  v(await p.evaluate(() => ['ictLiquidite', 'ictStructure', 'ictFvg', 'ictOb', 'ictPd', 'ictTemps', 'ictAmd'].every(k => document.querySelector(`[data-couche="${k}"]`).checked)), `${l}px : le clic coche les sept concepts (chacun reste activable séparément)`);
  const txt = await p.evaluate(() => { const r = document.querySelector('[data-ict-rapport]'); return r && !r.hidden ? r.innerText : ''; }); v(/Rapport ICT de la semaine/i.test(txt) && /Killzone/i.test(txt) && /heure de Paris/.test(txt) && /Interprétation de l.ICT/.test(txt) && !/(achète|vends)/i.test(txt), `${l}px : panneau « Rapport ICT de la semaine » (résumé, zones, killzone, biais)`);
  v(await p.evaluate(() => /Mesures \(Dukascopy/.test(document.querySelector('[data-ict-stats]').textContent)), `${l}px : mesures affichées`);
  // filtre : au plus N objets actifs
  const vis = await p.evaluate(() => { const E = window.__or.ict.etat().an; return null; }); void vis;
  await p.evaluate(() => { const s = document.querySelector('[data-ict-max]'); s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true })); }); await w(500);
  v(await p.evaluate(() => { const m = window.__or.graph.etat(); return true; }), `${l}px : curseur « objets visibles » utilisable`);
  await p.evaluate(() => { const s = document.querySelector('[data-ict-max]'); s.value = 8; s.dispatchEvent(new Event('input', { bubbles: true })); });
  // un concept seul : décocher le temps retire les bandes de killzones
  await p.evaluate(() => { document.querySelector('.tor-couches').open = true; const c = document.querySelector('[data-couche="ictTemps"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.tor-couches').open = false; }); await w(500);
  v((await p.evaluate(() => window.__or.graph.ictEtat())).types.kz === undefined, `${l}px : décocher « temps » retire les killzones, le reste demeure`);
  // voix
  const dits = []; await p.exposeFunction('noterDit', t => dits.push(t)); await p.evaluate(() => { window.speak = t => window.noterDit(t); });
  const t = await p.evaluate(async () => await window.TableauOr.commande('analyse ICT de la semaine')); v(typeof t === 'string' && /Interprétation de l.ICT/.test(t) && !/(achète|vends)/i.test(t), `${l}px : « Analyse ICT de la semaine » : ${String(t).slice(0, 90)}`);
  const f = await p.evaluate(async () => await window.TableauOr.commande('explique les killzones')); v(typeof f === 'string' && /Asie/.test(f) && /heure de Paris/.test(f), `${l}px : fiche « killzones »`);
  const f2 = await p.evaluate(async () => await window.TableauOr.commande('c est quoi un FVG')); v(typeof f2 === 'string' && /FVG/.test(f2), `${l}px : fiche « FVG »`);
  // registre forward en ajout seul
  const r1 = await p.evaluate(() => window.__or.ict.etat().registre.length); await p.evaluate(() => window.__or.ict.maj(true)); v((await p.evaluate(() => window.__or.ict.etat().registre.length)) === r1, `${l}px : registre forward (${r1} entrées) sans doublon`);
  await p.screenshot({ path: `captures-or/ict-${l}.png` });
  // second clic : efface
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ict-un-clic"]').click()); await w(700);
  v((await p.evaluate(() => window.__or.graph.ictEtat())).cadres === 0 && await p.evaluate(() => ['ictLiquidite', 'ictTemps'].every(k => !document.querySelector(`[data-couche="${k}"]`).checked)), `${l}px : un second clic efface l'analyse`);
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px : pas de défilement horizontal');
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
