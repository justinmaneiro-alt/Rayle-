/* Test Chrome : RSI + divergences + schémas (couches décochées par défaut), panneau RSI, dessin, survol, messages « Attention », registre forward en ajout seul, statistiques honnêtes ;
   PC 1600 px et téléphone 390 px. Série H1 injectée dans la structure (le test ne dépend pas du réseau). */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H;
const chemin = (pts, depart = 4000) => { const c = [depart]; let d = depart; for (const [f, n] of pts) { for (let k = 1; k <= n; k++) c.push(d + (f - d) * k / n); d = f; } return c; };
const barres = cl => { const n = cl.length; return cl.map((c, i) => { const o = i ? cl[i - 1] : c; return { t: fin - (n - 1 - i) * H, o, h: Math.max(o, c) + 1.5, l: Math.min(o, c) - 1.5, c, v: 100 }; }); };
// 80 bougies d'échauffement, puis divergence baissière (2e sommet plus haut, RSI plus bas), puis double sommet confirmé
const serie = barres(chemin([[4010, 30], [3995, 30], [4060, 20], [4030, 10], [4066, 14], [4040, 8], [4066.5, 8], [4040, 8], [4010, 6]], 4000));
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function ouvrir(l, h, mob) { const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of ['rayle_or_schemas_forward', 'rayle_or_schemas_reglages', 'rayle_or_couches_v2', 'rayle_or_journal']) localStorage.removeItem(k); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.schemas && window.__or.structure && window.__or.structure.etat().stats && window.__or.schemas.etat().stats, { timeout: 40000 }); await w(2500); p.__err = err; return p; }
async function activer(p, ...ks) { await p.evaluate(k2 => { document.querySelector('.tor-couches').open = true; for (const k of k2) { const c = document.querySelector(`[data-couche="${k}"]`); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } document.querySelector('.tor-couches').open = false; }, ks); await w(900); }
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await ouvrir(l, h, mob);
  v(await p.evaluate(() => ['rsi', 'divCachees', 'schemas'].every(k => { const c = document.querySelector(`[data-couche="${k}"]`); return c && !c.checked; })) && !!(await p.$('[data-schemas]')), `${l}px : couches RSI, divergences cachées et schémas décochées par défaut, panneau présent`);
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.schemas.maj(true); }, serie); await w(800);
  const ev = await p.evaluate(() => { const R = window.__or.schemas.etat().R; return { div: R.divergences.filter(d => d.sous === 'reguliere' && d.dir < 0).length, doubles: R.doubles.length, n: R.rsi.length }; });
  v(ev.div >= 1 && ev.doubles >= 1 && ev.n === serie.length, `${l}px : divergence régulière baissière et double sommet détectés (${ev.div}, ${ev.doubles})`);
  await activer(p, 'rsi', 'schemas'); await p.waitForFunction(() => window.__or.graph.schemasEtat().cadres > 0, { timeout: 8000 }).catch(() => {});
  const g = await p.evaluate(() => window.__or.graph.schemasEtat()); v(g.cadres > 0 && (g.types.div || 0) >= 1, `${l}px : divergence et schéma dessinés sur le graphique (${JSON.stringify(g.types)})`);
  v(await p.evaluate(() => { const c = window.__or.graph.chart(); return c.panes().length >= 3; }), `${l}px : panneau RSI sous le graphique (3e panneau)`);
  v(await p.evaluate(() => document.querySelector('[data-schemas-stats]').textContent.length > 40 && /Mesures/.test(document.querySelector('[data-schemas-stats]').textContent)), `${l}px : phrase de mesures affichée`);
  const reg = await p.evaluate(() => window.__or.schemas.etat().registre); v(Array.isArray(reg), `${l}px : registre forward (ajout seul) : ${reg.length} entrée(s)`);
  const n1 = reg.length; await p.evaluate(() => window.__or.schemas.maj(true)); v((await p.evaluate(() => window.__or.schemas.etat().registre.length)) === n1, `${l}px : registre sans doublon au rechargement des mêmes données`);
  const t = await p.evaluate(async () => { window.speak = () => {}; return await window.TableauOr.commande('y a-t-il une divergence ?'); }); v(typeof t === 'string' && !/(achète|vends)/i.test(t) && /(divergence|Aucune)/i.test(t), `${l}px : commande « y a-t-il une divergence ? » : ${String(t).slice(0, 80)}`);
  const f = await p.evaluate(async () => await window.TableauOr.commande('explique la divergence RSI')); v(typeof f === 'string' && /RSI/.test(f) && !/(achète|vends)/i.test(f), `${l}px : fiche « Divergence RSI »`);
  const msg = await p.evaluate(() => { const s = window.__or.schemas, e = s.evenements().find(q => q.kind === 'divergence' && q.dir < 0); localStorage.setItem('rayle_or_journal', JSON.stringify([{ id: 't1', sens: 'achat', entree: 4000, stop: 3990, taille: 1, sortie: null }])); return s.message(e); });
  v(/^Attention : /.test(msg) && /contre ta position : protection ou réduction à envisager/.test(msg) && !/(achète|vends)/i.test(msg), `${l}px : message « Attention » contre une position : ${msg.slice(0, 120)}`);
  await p.screenshot({ path: `captures-or/schemas-${l}.png` });
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px : pas de défilement horizontal');
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`);
  await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
