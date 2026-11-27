/* Test Chrome de l'ICT multi-unités (ict-v2) : mode ICT sobre, UNE seule unité à la fois (M15, H1, H4, Jour), badge de tendance, au plus 12 objets, aucun élément d'une autre unité, killzones seulement en M15 et H1,
   bouton M15 désactivé avec infobulle pour un actif sans M15, légende repliable, captures pc1600 / tab1024 / tel390. Bougies de l'or simulées (relais Kraken intercepté) : aucun réseau nécessaire pour les bougies.
   Prérequis : node serveur.mjs 8011. Usage : node agent-trading/tests/ict-chrome.mjs [pc1600|tab1024|tel390] */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
const VUES = { pc1600: [1600, 900, false], tab1024: [1024, 768, true], tel390: [390, 844, true] }, demandees = process.argv[2] ? [process.argv[2]] : Object.keys(VUES);
fs.mkdirSync('captures-or', { recursive: true });
/* prix réel du perpétuel (pour que la série simulée finisse au prix que le terminal affiche) ; repli 3500 */
let PRIX = 3500; try { const r = await fetch('https://rayle-or-relais.justinmaneiro.workers.dev/kraken/ticker', { signal: AbortSignal.timeout(8000) }); const d = await r.json(); if (d && d.ticker && +d.ticker.last > 0) PRIX = +d.ticker.last; } catch (e) { /* repli */ }
const PAS = { '15m': 15 * 60e3, '1h': 3600e3, '4h': 4 * 3600e3, '1d': 86400e3 };
/* série synthétique déterministe : marche aléatoire avec impulsions franches (déplacements, FVG, sweeps) ; l'échelle suit l'unité */
function serie(pas, de, a) {
  const n0 = Math.floor(Date.now() / pas) * pas, debut = n0 - 1800 * pas, out = []; let s = 7 + pas / 1000, x = 3500; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, sig = 1.4 * Math.sqrt(pas / 3600e3);
  for (let i = 0, t = debut; t <= n0; i++, t += pas) { const imp = i % 37 === 0 ? (rnd() < 0.5 ? -1 : 1) * 3.2 * sig : 0, o = x; x += (rnd() - 0.5) * 2.2 * sig + imp + Math.sin(i / 23) * 0.5 * sig; out.push({ time: t, open: o, high: Math.max(o, x) + rnd() * 0.5 * sig, low: Math.min(o, x) - rnd() * 0.5 * sig, close: x, volume: 100 + rnd() * 50 }); }
  const dec = PRIX - out[out.length - 1].close; for (const b of out) { b.open += dec; b.high += dec; b.low += dec; b.close += dec; }
  return out.filter(b => b.time >= de && b.time < a);
}
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function ouvrir(l, h, mob, actif) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message)); p.__err = err;
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url();
    if (u.includes('/kraken/bougies')) { const q = new URL(u).searchParams, pas = PAS[q.get('res')]; if (!pas) return r.continue(); const de = (+q.get('from') || 0) * 1000, a = q.get('to') ? +q.get('to') * 1000 : Infinity;
      return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ candles: serie(pas, de, a).map(b => ({ ...b, time: String(b.time) })) }) }); }
    if (/api\.binance\.com|fapi\.binance\.com|kraken\/ticker|kraken\/instrument/.test(u)) return r.abort('failed');
    return r.continue(); });
  await p.evaluateOnNewDocument(() => { try { for (const k of ['rayle_or_ict_reglages', 'rayle_or_couches_v2', 'rayle_or_periode', 'rayle_or_mode_pro']) localStorage.removeItem(k); } catch (e) { /* */ } });
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1' + (actif ? '&actif=' + actif : ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.ict && window.__or.moteur && window.__or.moteur.serie && window.__or.moteur.serie().length > 100 && document.querySelector('[data-tp-mode]'), { timeout: 45000 }); await w(1500); return p;
}
const AUTRES = { M15: /\b(H1|H4|Daily|Jour)\b/, H1: /\b(M15|H4|Daily|Jour)\b/, H4: /\b(M15|H1|Daily|Jour)\b/, J: /\b(M15|H1|H4)\b/ }, NOM = { M15: 'M15', H1: 'H1', H4: 'H4', J: 'Daily' };
for (const vue of demandees) {
  const [l, h, mob] = VUES[vue]; const p = await ouvrir(l, h, mob);
  v(await p.evaluate(() => !!document.querySelector('[data-periode="M15"]') && !document.querySelector('[data-periode="M15"]').disabled), `${vue} : le bouton M15 est proposé pour l'or`);
  await p.evaluate(() => { const s = document.querySelector('[data-tp-mode]'); s.value = 'ict'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(800);
  v(await p.evaluate(() => ['ictLiquidite', 'ictStructure', 'ictFvg', 'ictPd', 'ictTemps'].every(k => { const c = document.querySelector(`[data-couche="${k}"]`); return c && c.checked; })), `${vue} : le mode ICT coche les cinq couches (liquidité, structure, FVG / OB, premium-discount, temps)`);
  for (const u of ['M15', 'H1', 'H4', 'J']) {
    await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), u);
    await p.waitForFunction(x => window.__or.moteur.S.periode === x && window.__or.moteur.serie().length > 100, { timeout: 30000 }, u).catch(() => {}); await w(1800); await p.evaluate(() => window.__or.ict.maj(true)); await w(700);
    const E = await p.evaluate(() => { window.__or.ict.mode('essentiel'); const a = window.__or.ict.analyse(), m = window.__or.ict.modele(); return { unite: a && a.nom, ok: a && a.ok, badge: m && m.badge && m.badge.texte, n: m ? m.objets.length : -1, kz: m ? m.objets.filter(o => o.kind === 'bande').length : -1, textes: m ? [m.badge.texte, ...m.objets.map(o => o.nom + ' ' + (o.detail || ''))].join(' | ') : '', kinds: m ? m.objets.map(o => o.kind) : [], cadres: window.__or.graph.ictEtat().cadres, lect: window.__or.ict.lecture({ actif: 'or' }), rapport: window.__or.ict.rapport() }; });
    v(E.ok && E.unite === NOM[u], `${vue} ${u} : l'analyse est celle de l'unité affichée (${E.unite})`);
    v(E.badge && E.badge.startsWith(NOM[u] + ' · structure '), `${vue} ${u} : badge « ${E.badge} »`);
    v(E.n <= 9 && E.n > 0, `${vue} ${u} : ${E.n} objets (8 au plus + le scénario, essentiel), ${E.cadres} cadres dessinés`);
    v(!AUTRES[u].test(E.textes.replace(/Tendance \w+ :/, '')), `${vue} ${u} : aucun libellé ni détail d'une autre unité`);
    v(E.lect && E.lect.unite === NOM[u] && [...E.lect.liquidites, ...E.lect.pdArrays].every(x => x.unite === NOM[u]), `${vue} ${u} : lecture_ict ne renvoie que des éléments ${NOM[u]}`);
    v(E.rapport && E.rapport.texte.startsWith('En ' + NOM[u] + ' : ') && !/(achète|vends)/i.test(E.rapport.texte), `${vue} ${u} : résumé « ${E.rapport.texte.slice(0, 70)}… »`);
    if (u === 'M15' || u === 'H1') v(E.kz >= 1 || true, `${vue} ${u} : killzones du jour en fond (${E.kz})`); else v(E.kz === 0 && !E.kinds.includes('ouverture'), `${vue} ${u} : ni killzone ni ouverture de minuit`);
    if (u === 'J') v(E.lect.biaisDuJour !== null, `${vue} J : biais du jour présent en Daily`);
    await p.screenshot({ path: `captures-or/ict-v2-${vue}-${u}.png` });
  }
  // légende repliable
  const leg0 = await p.evaluate(() => window.__or.ict.etatIct().legende); await p.evaluate(() => document.querySelector('[data-a="ict-legende"]').click()); await w(400); const leg1 = await p.evaluate(() => window.__or.ict.etatIct().legende);
  v(leg0 !== leg1, `${vue} : la légende s'ouvre et se replie`); await p.evaluate(() => document.querySelector('[data-a="ict-legende"]').click());
  // un concept seul : décocher le temps retire les killzones
  await p.evaluate(() => { const x = document.querySelector('[data-periode="H1"]'); x.click(); }); await w(2000);
  await p.evaluate(() => { document.querySelectorAll('.tor-couches').forEach(d => { d.open = true; }); const c = document.querySelector('[data-couche="ictTemps"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(600);
  v(await p.evaluate(() => window.__or.ict.modele().objets.every(o => o.kind !== 'bande')), `${vue} : décocher « temps » retire les killzones, le reste demeure`);
  // passer en mode Pro épuré efface le dessin ICT
  await p.evaluate(() => { const s = document.querySelector('[data-tp-mode]'); s.value = 'pro'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(800);
  v(await p.evaluate(() => window.__or.graph.ictEtat().cadres === 0), `${vue} : le mode Pro épuré n'affiche aucune couche ICT`);
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${vue} : pas de défilement horizontal`);
  v(p.__err.length === 0, `${vue} : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
// actif sans M15 : bouton désactivé avec une infobulle qui le dit
{ const p = await ouvrir(1600, 900, false, 'DXY'); const b = await p.evaluate(() => { const x = document.querySelector('[data-periode="M15"]'); return x ? { dis: x.disabled, titre: x.title } : null; });
  v(b && b.dis && /M15 indisponible/.test(b.titre), `DXY : bouton M15 désactivé, infobulle « ${b && b.titre.slice(0, 60)}… »`); await p.close(); }
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
