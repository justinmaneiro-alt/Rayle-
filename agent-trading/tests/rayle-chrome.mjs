/* Test Chrome de la stratégie Rayle v1 : moyenne mobile et événements (phase 1), boîtes et ligne de retournement (phase 2), carnet (3), feuille de décision (4), scénarios (5), voix (6).
   Série H1 injectée (aucun réseau). PC 1600 px et téléphone 390 px. Épuré : 12 objets au plus (hors bougies et moyenne mobile), aucune étiquette ne chevauche une autre. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H, N = 24 * 45;
let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
let c = 4000; const cl = []; for (let i = 0; i < N; i++) { c += (rnd() - 0.5) * 9 + Math.sin(i / 37) * 3.2; cl.push(c); }
const serie = cl.map((x, i) => { const o = i ? cl[i - 1] : x; return { t: fin - (N - 1 - i) * H, o, h: Math.max(o, x) + rnd() * 3, l: Math.min(o, x) - rnd() * 3, c: x, v: 80 + rnd() * 80 }; });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function ouvrir(l, h, mob) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/^rayle_or_/.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.structure && window.__or.structure.etat().stats && window.__or.strategie.etat().stats.ma && window.__or.graph.etat().bougies.length > 20, { timeout: 40000 }).catch(() => {});
  return p;
}
const chevauche = (a, b) => a.x0 < b.x0 + b.w && a.x0 + a.w > b.x0 && a.y0 < b.y0 + b.h && a.y0 + a.h > b.y0;
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await ouvrir(l, h, mob);
  v(await p.evaluate(() => !!document.querySelector('[data-rayle]') && !!document.querySelector('[data-graph-barre] [data-a="ray-vue"]')), `${l}px : panneau Rayle et bouton Épuré / Complet collé au graphique`);
  v(await p.evaluate(() => ['rayMa', 'rayBoites'].every(k => document.querySelector(`[data-couche="${k}"]`).checked) && !document.querySelector('[data-couche="rayScenarios"]').checked && ['ictLiquidite', 'schemas', 'rsi'].every(k => !document.querySelector(`[data-couche="${k}"]`).checked)), `${l}px : couches Rayle par défaut ; ICT, RSI et schémas restent décochés (aucune couche supprimée)`);
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.strategie.maj(true); }, serie); await p.waitForFunction(() => window.__or.graph.rayleEtat().cadres > 0, { timeout: 8000 }).catch(() => {}); await w(300);
  const e1 = await p.evaluate(() => window.__or.graph.rayleEtat()); v((e1.types.ma || 0) === 1, `${l}px : la moyenne mobile est dessinée (${JSON.stringify(e1.types)})`);
  const st = await p.evaluate(() => { const E = window.__or.strategie.etat(); return { evts: E.res.events.length, types: [...new Set(E.res.events.map(e => e.type))], aff: E.m.evenements.length, vue: E.reg.vue }; });
  v(st.evts >= 5 && st.types.includes("cassure"), `${l}px : événements calculés sur ${serie.length} bougies (${JSON.stringify(st)})`);
  v(st.vue === 'epure' && st.aff <= 2, `${l}px : Épuré par défaut, ${st.aff} événement(s) affiché(s)`);
  v(await p.evaluate(() => window.__or.strategie.compterObjets() <= 12), `${l}px : Épuré : 12 objets au plus hors bougies et moyenne mobile`);
  const E1 = await p.evaluate(() => window.__or.graph.rayleEtat()); let rien = true; for (let i = 0; i < E1.etiquettes.length; i++) for (let j = i + 1; j < E1.etiquettes.length; j++) if (chevauche(E1.etiquettes[i], E1.etiquettes[j])) rien = false;
  v(rien, `${l}px : aucune étiquette ne chevauche une autre (${E1.etiquettes.length} étiquettes)`);
  const tx = await p.evaluate(() => document.querySelector('[data-rayle]').innerText); v(/moyenne mobile 200/i.test(tx) && /en observation/i.test(tx) && !/(achète|vends|achetez|vendez)/i.test(tx), `${l}px : texte du panneau (observation, jamais un ordre)`);
  // Complet
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(500);
  const st2 = await p.evaluate(() => { const E = window.__or.strategie.etat(); return { vue: E.reg.vue, aff: E.m.evenements.length }; }); v(st2.vue === 'complet' && st2.aff >= st.aff, `${l}px : Complet affiche tout ce que Rayle calcule (${st2.aff} événements)`);
  const E2 = await p.evaluate(() => window.__or.graph.rayleEtat()); let rien2 = true; for (let i = 0; i < E2.etiquettes.length; i++) for (let j = i + 1; j < E2.etiquettes.length; j++) if (chevauche(E2.etiquettes[i], E2.etiquettes[j])) rien2 = false; v(rien2, `${l}px : Complet : aucune étiquette ne chevauche une autre`);
  await p.screenshot({ path: `captures-or/rayle-${l}-complet.png` });
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(400);
  await p.screenshot({ path: `captures-or/rayle-${l}.png` });
  // ── phase 2 : boîtes, ligne de retournement, bandeau ──
  await p.evaluate(() => { const E = window.__or.strategie.etat(), z = E.zones.find(q => !q.invalide); window.__or.strategie.injecterPrix(z ? (z.cote === 'vente' ? z.bas - 1.2 * z.atr : z.haut + 1.2 * z.atr) : E.B[E.B.length - 1].c); }); await w(500);   // le prix est placé à 1,2 ATR d'une zone valide
  const z2 = await p.evaluate(() => { const E = window.__or.strategie.etat(); return { zones: E.zones.length, bandeau: E.bandeau, ligne: E.m.ligne && E.m.ligne.texte, structure: E.m.structure.length, boites: E.m.boites.length, vue: E.reg.vue, objets: window.__or.strategie.compterObjets() }; });
  v(/Tendance H4 .* · H1 .*mouvement en cours/.test(z2.bandeau), `${l}px : bandeau d'état (tendance H1/H4, ligne, prochaine zone, mouvement) : ${z2.bandeau.slice(0, 120)}`);
  v(z2.structure <= 3 && (z2.ligne == null || /^Retournement (baissier|haussier)/.test(z2.ligne)), `${l}px : ligne de retournement unique et au plus 3 cassures étiquetées (${z2.ligne})`);
  v(z2.objets <= 12, `${l}px : Épuré : ${z2.objets} objets (12 au plus)`);
  v(z2.boites <= 4, `${l}px : Épuré : au plus 2 boîtes de chaque côté (${z2.boites})`);
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(500);
  const z3 = await p.evaluate(() => { const E = window.__or.strategie.etat(), g = window.__or.graph.rayleEtat(); return { zones: E.zones.length, boites: E.m.boites.length, types: g.types, vue: E.reg.vue, bandeauCache: document.querySelector('[data-ray-bandeau]').hidden, etiq: g.etiquettes, boitesTxt: E.m.boites.map(b => b.etiquette) }; });
  v(z3.vue === 'complet' && z3.zones > 0 && z3.boites > 0 && (z3.types.boite || 0) > 0, `${l}px : Complet : les boîtes sont dessinées (zones ${z3.zones}, boîtes ${z3.boites} ; ${JSON.stringify(z3.boitesTxt.slice(0, 3))} ; ${JSON.stringify(z3.types)})`);
  v(z3.boitesTxt.every(t => /^Zone de (vente|achat) · (\d+ % · n = \d+|pas de mesure)/.test(t)), `${l}px : une seule étiquette « Zone de vente · 60 % · n = 20 » par boîte`);
  let rien3 = true; for (let i = 0; i < z3.etiq.length; i++) for (let j = i + 1; j < z3.etiq.length; j++) if (chevauche(z3.etiq[i], z3.etiq[j])) rien3 = false; v(rien3, `${l}px : Complet avec boîtes : aucune étiquette ne chevauche une autre (${z3.etiq.length})`);
  await p.screenshot({ path: `captures-or/rayle-${l}-boites.png` });
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(300);
  // couche décochée : plus de moyenne mobile
  await p.evaluate(() => { document.querySelector('.tor-couches').open = true; const c = document.querySelector('[data-couche="rayMa"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(400);
  v((await p.evaluate(() => window.__or.graph.rayleEtat())).types.ma === undefined, `${l}px : décocher la couche retire la moyenne mobile`);
  await p.evaluate(() => { const c = document.querySelector('[data-couche="rayMa"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px : pas de défilement horizontal');
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
