/* Vérification finale de la stratégie Rayle v1 avec les VRAIES données (aucune injection), PC 1600 px et téléphone 390 px : fluidité (aucune tâche longue > 0,8 s, calcul d'un cycle H1 < 0,8 s),
   Épuré : 12 objets au plus et aucune étiquette qui en chevauche une autre, couches ICT / RSI / schémas disponibles mais décochées, captures avant / après (captures-or/, ignoré par git). */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const chevauche = (a, b) => a.x0 < b.x0 + b.w && a.x0 + a.w > b.x0 && a.y0 < b.y0 + b.h && a.y0 + a.h > b.y0;
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/^rayle_or_/.test(k)) localStorage.removeItem(k); } catch (e) {} window.__tachesLongues = []; try { new PerformanceObserver(L => { for (const e of L.getEntries()) window.__tachesLongues.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  const pret = await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.strategie.etat().B && window.__or.strategie.etat().stats.scen && window.__or.graph.etat().bougies.length > 20, { timeout: 60000 }).then(() => true).catch(() => false);
  v(pret, `${l}px : page prête avec les vraies données`); if (!pret) { await p.close(); continue; }
  await w(1500);
  // « avant » : aucune couche Rayle
  await p.evaluate(() => { document.querySelector('.tor-couches').open = true; for (const k of ['rayMa', 'rayBoites', 'rayScenarios']) { const c = document.querySelector(`[data-couche="${k}"]`); if (c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } } }); await w(500);
  await p.screenshot({ path: `captures-or/rayle-avant-${l}.png` });
  // « après » : Épuré (couches par défaut)
  await p.evaluate(() => { for (const k of ['rayMa', 'rayBoites']) { const c = document.querySelector(`[data-couche="${k}"]`); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }); await w(700);
  const e1 = await p.evaluate(() => { const S = window.__or.strategie, g = window.__or.graph.rayleEtat(); return { vue: S.etat().reg.vue, objets: S.compterObjets(), etiquettes: g.etiquettes, types: g.types, ict: ['ictLiquidite', 'ictStructure', 'ictFvg', 'ictOb', 'ictPd', 'ictTemps', 'ictAmd', 'rsi', 'divCachees', 'schemas'].every(k => !document.querySelector(`[data-couche="${k}"]`).checked), bandeau: S.etat().bandeau }; });
  v(e1.vue === 'epure' && e1.objets <= 12, `${l}px : Épuré (vraies données) : ${e1.objets} objets (12 au plus) ${JSON.stringify(e1.types)}`);
  let rien = true; for (let i = 0; i < e1.etiquettes.length; i++) for (let j = i + 1; j < e1.etiquettes.length; j++) if (chevauche(e1.etiquettes[i], e1.etiquettes[j])) rien = false; v(rien, `${l}px : aucune étiquette ne chevauche une autre (${e1.etiquettes.length} étiquettes)`);
  v(e1.ict, `${l}px : ICT, RSI, divergences cachées et schémas restent disponibles et décochés par défaut`); v(/Tendance H4/.test(e1.bandeau), `${l}px : bandeau d'état : ${e1.bandeau.slice(0, 110)}`);
  await p.screenshot({ path: `captures-or/rayle-apres-epure-${l}.png` });
  // Complet + scénarios
  await p.evaluate(() => { document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click(); document.querySelector('[data-graph-barre] [data-a="ray-scen"]').click(); }); await w(900);
  const e2 = await p.evaluate(() => { const S = window.__or.strategie, g = window.__or.graph.rayleEtat(); return { vue: S.etat().reg.vue, objets: S.compterObjets(), etiquettes: g.etiquettes, types: g.types }; });
  let rien2 = true; for (let i = 0; i < e2.etiquettes.length; i++) for (let j = i + 1; j < e2.etiquettes.length; j++) if (chevauche(e2.etiquettes[i], e2.etiquettes[j])) rien2 = false; v(e2.vue === 'complet' && rien2, `${l}px : Complet + scénarios : aucune étiquette ne chevauche une autre (${e2.etiquettes.length} ; ${JSON.stringify(e2.types)})`);
  await p.screenshot({ path: `captures-or/rayle-apres-complet-${l}.png` });
  // Épuré + scénarios (2 au plus)
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(500);
  v(await p.evaluate(() => window.__or.strategie.compterObjets() <= 12 && (window.__or.graph.rayleEtat().types.scenario || 0) <= 2), `${l}px : Épuré avec scénarios : 12 objets au plus, 2 scénarios au plus`);
  await p.screenshot({ path: `captures-or/rayle-apres-epure-scenarios-${l}.png` });
  // fluidité : durée d'un cycle de calcul complet et tâches longues
  const t = await p.evaluate(async () => { const S = window.__or.strategie, D = []; for (let k = 0; k < 6; k++) { const a = performance.now(); S.reglage('ma', k % 2 ? 'h1' : 'jour'); D.push(performance.now() - a); /* changer de moyenne force un recalcul complet (moyenne mobile, niveaux, zones, scénarios, feuille) */ await new Promise(r => setTimeout(r, 60)); } S.reglage('ma', 'h1'); return { max: Math.max(...D), moy: D.reduce((s, x) => s + x, 0) / D.length, longues: window.__tachesLongues.slice() }; });
  v(t.max < 800, `${l}px : un cycle de calcul complet (moyenne mobile, boîtes, scénarios, feuille) dure au plus ${t.max.toFixed(0)} ms (moyenne ${t.moy.toFixed(0)} ms ; limite 800 ms)`);
  v(Math.max(0, ...t.longues) < 800, `${l}px : aucune pause d'interface de 0,8 s ou plus (tâches longues : ${t.longues.map(x => Math.round(x)).join(', ') || 'aucune'} ms)`);
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px : pas de défilement horizontal');
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
// ── l'appli : écran Terminal de Rayle (index.html), la voix atteint la stratégie par le relais window.TableauOr ──
{
  const a = await nav.newPage(); await a.setViewport({ width: 1600, height: 900 }); const err = []; a.on('pageerror', e => err.push(e.message));
  await a.goto(BASE + '/index.html', { waitUntil: 'load' }); await w(3500);
  try {
    await a.evaluate(() => document.getElementById('btnOuvrirTerminal').click()); await a.waitForSelector('#vueTerminal iframe.tr-or', { timeout: 30000 });
    const fr = await (await a.$('#vueTerminal iframe.tr-or')).contentFrame(); await fr.waitForFunction(() => window.__or && window.__or.strategie && window.__or.strategie.etat().stats.scen, { timeout: 60000 }); await w(4000);
    v(await fr.evaluate(() => !!document.querySelector('[data-rayle]') && !!document.querySelector('[data-a="ray-vue"]') && !!document.querySelector('[data-a="ray-scen"]')), 'appli (Terminal) : panneau Rayle, Épuré / Complet et Scénarios présents');
    const tt = await a.evaluate(async () => { const o = {}; o.ma = await window.TableauOr.commande('où en est la moyenne mobile ?'); o.feuille = await window.TableauOr.commande('où en est la feuille de décision ?'); o.scen = await window.TableauOr.commande('montre-moi les scénarios'); return o; });
    v(typeof tt.ma === 'string' && /moyenne mobile/.test(tt.ma) && typeof tt.feuille === 'string' && /Scénario A/.test(tt.scen) && /Scénarios, pas prévisions/.test(tt.scen), `appli : la voix de Rayle atteint la stratégie par le relais window.TableauOr (${String(tt.feuille).slice(0, 70)}…)`);
    v(err.length === 0, `appli : aucune erreur de page ${err.slice(0, 2).join(' | ')}`);
  } catch (e) { v(false, 'appli (Terminal) : ' + e.message.slice(0, 160)); }
  await a.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
