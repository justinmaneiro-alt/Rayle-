/* Terminal tactile « graphique d'abord » : Chrome en ÉMULATION tactile (S23 Ultra ≈ 412×915, tablette 800×1280 portrait et 1280×800 paysage), vrais événements tactiles (CDP), CPU ralenti ×4.
   Prérequis : node serveur.mjs 8011, depuis la racine.   BASE=http://127.0.0.1:8011 node agent-trading/tests/tactile-chrome.mjs
   Jamais testé sur un vrai appareil. */
import fs from 'node:fs';
import { lancer, ouvrir, glisser, pincer, appui, doubleAppui, appuiLong, mesurer, rect, plage, w, verif, BASE } from './tactile-aide.mjs';
const { v, fin } = verif(); fs.mkdirSync('outils-restructuration/captures-mobile', { recursive: true });
const nav = await lancer(); const ignore = e => /allorigins|Failed to load resource|ERR_FAILED|faireconomy/.test(e);
const nbRange = r => r ? r.a - r.de : 0;
for (const [app, avantApres] of [['s23', true], ['tablette', true], ['paysage', false]]) {
  const L = app + ' : ';
  if (avantApres) { const q = await ouvrir(nav, app, { url: '/agent-trading/front/or.html?pro=1&tactile=0#trading' }); await q.screenshot({ path: `outils-restructuration/captures-mobile/tactile-avant-${app}.png` }); await q.close(); }
  const p = await ouvrir(nav, app); await w(1500);
  const vp = await p.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // ── disposition : graphique seul
  const D = await p.evaluate(() => { const vis = s => [...document.querySelectorAll(s)].some(e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; }); const lw = document.querySelector('.tor-graph-lw').getBoundingClientRect();
    return { cls: document.documentElement.classList.contains('tm-tactile'), lw: { x: lw.x, y: lw.y, w: lw.width, h: lw.height }, scrollH: document.documentElement.scrollHeight, blocs: vis('.tor-bloc, .tor-pied, .esp-barre, .tor-tete, .tp-haut, .tor-ray-carte'), outils: vis('.tp-outils'), tuiles: vis('.tt-tuiles'), touchAction: getComputedStyle(document.querySelector('.tor-graph-lw')).touchAction, overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY }; });
  v(D.cls, L + 'mode tactile actif (html.tm-tactile)');
  v(!D.blocs, L + 'plus aucun panneau de données, onglets ni titre : le graphique seul');
  v(D.lw.x === 0 && Math.abs(D.lw.w - vp.w) < 2 && D.lw.y < 110 && Math.abs(D.lw.y + D.lw.h - vp.h) < 2, L + `graphique plein écran sous la barre (${Math.round(D.lw.w)}×${Math.round(D.lw.h)} en y=${Math.round(D.lw.y)})`);
  v(D.scrollH <= vp.h + 1, L + `la page ne défile pas (hauteur ${D.scrollH} ≤ ${vp.h})`);
  v(D.touchAction === 'none' && D.overscroll === 'none', L + `graphique : touch-action none, overscroll-behavior none (${D.touchAction}, ${D.overscroll})`);
  v(!D.outils && !D.tuiles, L + 'outils de dessin et cases de données masqués par défaut');
  const B = await p.evaluate(() => { const bs = [...document.querySelectorAll('.tt-barre select, .tt-barre button')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, t: (e.textContent || e.value || '').trim().slice(0, 10) }; }); return bs; });
  v(B.length === 8 && B.every(b => b.h >= 43.5 && b.w >= 43.5), L + `barre : instrument, 5 périodes, flèches, ⋯ — tous ≥ 44 px (${B.length})`);
  { let ok = true; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5) ok = false; } v(ok, L + 'barre : aucune superposition'); v(B.every(b => b.x >= 0 && b.x + b.w <= vp.w + 0.5), L + 'barre : rien ne dépasse de l\'écran'); }
  await p.screenshot({ path: `outils-restructuration/captures-mobile/tactile-apres-${app}.png` });
  const r = await rect(p, '.tor-graph-lw'), cx = r.x + r.w / 2, cy = r.y + r.h * 0.45;
  // ── gestes
  const p0 = await plage(p); await glisser(p, [cx - 120, cy], [cx + 120, cy], { pas: 16 }); await w(300); const p1 = await plage(p);
  v(p0 && p1 && Math.abs(p1.de - p0.de) > 5, L + `un doigt qui glisse déplace le graphique (${p0 && p1 ? (p1.de - p0.de).toFixed(1) : '?'} bougies)`);
  const sy0 = await p.evaluate(() => ({ y: scrollY, x: scrollX })); await glisser(p, [cx, cy - 100], [cx, cy + 100], { pas: 16 }); await w(300); const sy1 = await p.evaluate(() => ({ y: scrollY, x: scrollX }));
  v(sy1.y === sy0.y && sy1.x === sy0.x, L + 'glisser en vertical ne fait jamais défiler la page (ni rafraîchir par tirage)');
  const q0 = await plage(p); await pincer(p, [cx, cy], 60, 240, { pas: 16 }); await w(300); const q1 = await plage(p);
  v(nbRange(q0) - nbRange(q1) > 8, L + `deux doigts qui pincent zooment le temps (${nbRange(q0).toFixed(0)} → ${nbRange(q1).toFixed(0)} bougies)`);
  await pincer(p, [cx, cy], 240, 40, { pas: 16 }); await w(300); const q2 = await plage(p);
  v(nbRange(q2) <= 262, L + `jamais plus de ~250 bougies à l'écran (${nbRange(q2).toFixed(0)})`);
  const tot = await p.evaluate(() => window.__or.graph.etat().bougies.length);
  await glisser(p, [cx - 150, cy], [cx + 150, cy], { pas: 10 }); await w(200);
  await doubleAppui(p, [cx, cy]); await w(400); const q3 = await plage(p);
  v(q3 && Math.abs(q3.a - (tot + 4)) < 3 && nbRange(q3) <= 180, L + `double appui : recentre sur les dernières bougies (fin ${q3 ? q3.a.toFixed(0) : '?'} / ${tot + 4}, ${nbRange(q3).toFixed(0)} bougies)`);
  // appui long = réticule qui suit le doigt
  await p.evaluate(() => { window.__cx = []; window.__or.graph.chart().subscribeCrosshairMove(e => { if (e && e.point) window.__cx.push({ x: Math.round(e.point.x), t: e.time }); }); });
  const lache = await appuiLong(p, [cx, cy], { ms: 650, bouge: [60, 0] }); await w(200); const cr = await p.evaluate(() => window.__cx.slice()); await lache();
  v(cr.length >= 2 && new Set(cr.map(c => c.x)).size >= 2, L + `appui long : le réticule (prix et heure) apparaît et suit le doigt (${cr.length} positions)`);
  // axe des prix : glisser sur l'axe change l'échelle verticale
  const axe = await p.evaluate(() => { const c = window.__or.graph.chart(), s = window.__or.graph.serie(); const r = s.priceScale ? null : null; void r; const h = c.paneSize ? c.paneSize(0) : { width: 0, height: 0 }; const pw = c.priceScale('right').width(); return { pw, h: h.height || 0 }; });
  const plagePrix = () => p.evaluate(() => { const s = window.__or.graph.serie(), c = window.__or.graph.chart(); const a = s.coordinateToPrice(20), b = s.coordinateToPrice(300); return Math.abs(a - b); });
  const e0 = await plagePrix(); const xa = r.x + r.w - Math.max(20, axe.pw / 2); await glisser(p, [xa, cy], [xa, cy - 120], { pas: 14 }); await w(300); const e1 = await plagePrix();
  v(Math.abs(e1 - e0) > 0.2, L + `glisser le long de l'axe des prix change l'échelle verticale (${e0.toFixed(1)} → ${e1.toFixed(1)} $)`);
  await doubleAppui(p, [cx, cy]); await w(300);
  // appui sur une flèche : infobulle ; appui sur un niveau : fenêtre avec corbeille
  const f = await p.evaluate(() => { const T = window.__or, c = T.graph.chart(), s = T.graph.serie(), L = T.flechesT.liste().filter(f => !f.contre && f.type !== 'ma_cassure' && !f.masquee); const B = T.graph.etat().bougies; const cand = L.slice().reverse().map(f => { const t = T.graph.tempsDeBougie(f.tCloture - 1), x = c.timeScale().timeToCoordinate(t), b = B.find(q => q.t === f.t), y = b ? s.priceToCoordinate(f.dir > 0 ? b.l : b.h) : null; return { x, y, ok: x != null && y != null && x > 10 && x < innerWidth - 70 && y > 80, nom: f.nom }; }).filter(q => q.ok); return cand[0] || null; });
  if (f) { const rr = await rect(p, '.tor-graph-lw'); await appui(p, [rr.x + f.x, rr.y + f.y + 6]); await w(500); const vis = await p.evaluate(() => { const b = [...document.querySelectorAll('.tor-ft-bulle')].find(x => !x.hidden && x.innerText.length > 10); return b ? b.innerText.slice(0, 80) : null; }); v(!!vis, L + `appui sur une flèche : infobulle (${(vis || '').replace(/\n/g, ' · ').slice(0, 60)})`); } else v(false, L + 'aucune flèche visible pour le test d\'appui');
  await appui(p, [cx, r.y + 4]); await w(200);
  const niv = await p.evaluate(() => { const E = window.__or.graph.lectureV8Etat(); const z = E.zonesPix.find(z => z.y0 > 90 && z.y1 < innerHeight - 90); return z ? { y: (z.y0 + z.y1) / 2 } : null; });
  if (niv) { const rr = await rect(p, '.tor-graph-lw'); await appui(p, [rr.x + rr.w * 0.5, rr.y + niv.y]); await w(500); const fen = await p.evaluate(() => { const e = [...document.querySelectorAll('.tor-sup')].find(x => { const r = x.getBoundingClientRect(); return r.width > 20 && r.height > 20 && getComputedStyle(x).visibility !== 'hidden' && !x.hidden; }); return e ? (e.className || e.tagName) + ' ' + (e.innerText || '').slice(0, 40) : null; }); v(!!fen, L + `appui sur un niveau : petite fenêtre de suppression (${(fen || '').replace(/\n/g, ' ')})`); }
  else v(false, L + 'aucune zone visible pour le test d\'appui sur un niveau');
  await appui(p, [cx, r.y + 4]); await w(300);
  // ── RSI replié par défaut, volume masqué
  const S0 = await p.evaluate(() => ({ rsi: window.__or.graph.couches().rsi, etat: window.RayleTactile.etat(), panes: window.__or.graph.chart().panes().length }));
  v(S0.rsi === false && S0.etat.rsi === false, L + 'bande RSI repliée par défaut');
  await p.evaluate(() => document.querySelector('[data-tt-rsi]').click()); await w(800); const S1 = await p.evaluate(() => ({ rsi: window.__or.graph.couches().rsi, panes: window.__or.graph.chart().panes().length }));
  v(S1.rsi === true && S1.panes >= S0.panes, L + 'bouton RSI : la bande s\'ouvre'); await p.evaluate(() => document.querySelector('[data-tt-rsi]').click()); await w(600);
  // ── petites cases + fenêtre du bas
  await p.evaluate(() => document.querySelector('[data-tt-donnees]').click()); await w(300);
  const T1 = await p.evaluate(() => [...document.querySelectorAll('.tt-tuile')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, w: r.width, h: r.height, ok: r.width > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }; }));
  v(T1.length === 7 && T1.every(t => t.h >= 43.5 && t.ok), L + `bouton Données : 7 petites cases ≥ 44 px (${T1.map(t => t.t).join(', ')})`);
  await p.evaluate(() => document.querySelector('[data-tt-tuile="cot"]').click()); await w(1500);
  const F = await p.evaluate(() => { const z = document.querySelector('[data-zone="cot"]'), r = z.getBoundingClientRect(), h = document.querySelector('.tt-feuille-haut').getBoundingClientRect(); return { z: { x: r.x, y: r.y, w: r.width, h: r.height, vis: !z.hidden }, haut: { h: h.height, w: h.width }, cls: document.documentElement.classList.contains('tt-feuille-ouverte'), scrollH: document.documentElement.scrollHeight, actif: window.__espaces.etat().actif }; });
  v(F.cls && F.z.vis && F.actif === 'cot' && F.z.y >= 50 && F.z.h > 200, L + `une case s'ouvre dans une fenêtre du bas (${Math.round(F.z.w)}×${Math.round(F.z.h)})`);
  v(F.scrollH <= vp.h + 1, L + 'la fenêtre du bas n\'ajoute aucun contenu sous le graphique (la page ne grandit pas)');
  await p.screenshot({ path: `outils-restructuration/captures-mobile/tactile-case-${app}.png` });
  const hx = await p.evaluate(() => { const r = document.querySelector('.tt-feuille-haut').getBoundingClientRect(); return r.x + r.width / 2; }); await glisser(p, [hx, 24], [hx, 200], { pas: 10 }); await w(1200);
  v(await p.evaluate(() => !document.documentElement.classList.contains('tt-feuille-ouverte') && window.__espaces.etat().actif === 'trading'), L + 'balayage vers le bas sur l\'en-tête : la fenêtre se ferme, retour au graphique');
  await p.evaluate(() => document.querySelector('[data-tt-tuile="sante"]').click()); await w(1200);
  await p.evaluate(() => document.querySelector('[data-tt-ferme]').click()); await w(1000);
  v(await p.evaluate(() => !document.documentElement.classList.contains('tt-feuille-ouverte') && window.__espaces.etat().actif === 'trading'), L + 'bouton X : la fenêtre se ferme');
  await p.evaluate(() => document.querySelector('[data-tt-donnees]').click()); await w(200);
  // ── outils de dessin : masqués, puis actifs = navigation coupée + bandeau
  await p.evaluate(() => document.querySelector('[data-tt-plus]').click()); await w(400);
  const R0 = await p.evaluate(() => ({ cases: document.querySelectorAll('.tt-reglages [data-tt-couche]').length, notif: !!document.querySelector('.tt-reglages [data-ft-notif]') }));
  v(R0.cases >= 8 && R0.notif, L + `⋯ : couches (${R0.cases}) et notifications dans une fenêtre`);
  await p.evaluate(() => document.querySelector('[data-tt-outils]').click()); await w(300);
  await p.evaluate(() => document.querySelector('[data-tt-ferme-reglages]').click()); await w(300);
  v(await p.evaluate(() => { const e = document.querySelector('.tp-outils'); return !!e && e.getBoundingClientRect().width > 20; }), L + 'outils de dessin : affichés à la demande');
  await p.evaluate(() => document.querySelector('[data-tp-outil="fib"]').click()); await w(1300);
  v(await p.evaluate(() => !document.querySelector('.tt-bandeau-outil').hidden), L + 'outil actif : le bandeau le dit');
  const o0 = await plage(p); await glisser(p, [cx - 100, cy], [cx + 100, cy], { pas: 12 }); await w(300); const o1 = await plage(p);
  v(o0 && o1 && Math.abs(o1.de - o0.de) < 0.5, L + 'outil actif : les gestes de navigation sont désactivés');
  await p.evaluate(() => document.querySelector('[data-tt-fin-outil]').click()); await w(500);
  const o2 = await plage(p); await glisser(p, [cx - 100, cy], [cx + 100, cy], { pas: 12 }); await w(300); const o3 = await plage(p);
  v(o2 && o3 && Math.abs(o3.de - o2.de) > 3 && await p.evaluate(() => document.querySelector('.tt-bandeau-outil').hidden), L + 'après « Terminer » : la navigation revient et le bandeau disparaît');
  // ── images par seconde, CPU ralenti ×4
  await p.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mp = await mesurer(p, async () => { for (let k = 0; k < 3; k++) { await glisser(p, [cx - 110, cy], [cx + 110, cy], { pas: 22, dt: 14 }); await glisser(p, [cx + 110, cy], [cx - 110, cy], { pas: 22, dt: 14 }); } });
  const mz = await mesurer(p, async () => { for (let k = 0; k < 3; k++) { await pincer(p, [cx, cy], 80, 220, { pas: 20, dt: 14 }); await pincer(p, [cx, cy], 220, 80, { pas: 20, dt: 14 }); } });
  console.log(`INFO ${L}CPU×4 : glisser ${mp.fps.toFixed(0)} i/s (p95 ${mp.p95.toFixed(0)} ms, ${mp.longues} tâches longues) · pincer ${mz.fps.toFixed(0)} i/s (p95 ${mz.p95.toFixed(0)} ms, ${mz.longues} tâches longues)`);
  v(mp.fps >= 50, L + `glisser avec CPU ×4 : ≥ 50 images/s (${mp.fps.toFixed(0)})`); v(mz.fps >= 50, L + `pincer avec CPU ×4 : ≥ 50 images/s (${mz.fps.toFixed(0)})`);
  await p.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const errs = p.__err.filter(e => !ignore(e)); v(errs.length === 0, L + `aucune erreur console ${errs.slice(0, 2).join(' | ').slice(0, 160)}`);
  await p.close();
}
// ── balayage depuis le graphique : jamais de changement de fenêtre du carrousel Rayle
{
  const p = await nav.newPage(); await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); p.__err = [];
  await p.goto(BASE + '/index.html?tactile=1', { waitUntil: 'domcontentloaded' }).catch(() => {}); await w(3500);
  p.cdp = await p.createCDPSession();
  const ok = await p.evaluate(async () => { try { if (!window.Application) return 'sans Application'; await window.Application.ouvrir('terminal'); return 'ouvert'; } catch (e) { return 'erreur ' + e.message; } });
  await w(6000);
  const iframe = await p.evaluate(() => { const f = document.querySelector('iframe.tr-or'); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (iframe) {
    const avant = await p.evaluate(() => ({ e: window.Application.etat(), g: document.body.className }));
    await glisser(p, [iframe.x + iframe.w * 0.8, iframe.y + iframe.h * 0.5], [iframe.x + iframe.w * 0.1, iframe.y + iframe.h * 0.5], { pas: 14 }); await w(600);
    await glisser(p, [iframe.x + iframe.w * 0.1, iframe.y + iframe.h * 0.5], [iframe.x + iframe.w * 0.9, iframe.y + iframe.h * 0.5], { pas: 14 }); await w(600);
    const apres = await p.evaluate(() => ({ e: window.Application.etat(), g: document.body.className }));
    v(avant.e.id === apres.e.id && apres.e.ouvert === 'terminal', `carrousel : un balayage depuis le graphique ne change jamais de fenêtre (${avant.e.id} → ${apres.e.id}, ouvert : ${apres.e.ouvert})`);
  } else v(false, `carrousel : le terminal n'a pas pu être ouvert dans index.html (${ok})`);
  await p.close();
}
await nav.close(); console.log(fin() ? 'ÉCHECS : ' + fin() : 'tout passe'); process.exit(fin() ? 1 : 0);
