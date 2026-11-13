/* Diagnostic tactile (émulation, pas un vrai appareil) : reproduit les problèmes de circulation sur le graphique.   BASE=http://127.0.0.1:8011 node agent-trading/tests/tactile-diagnostic.mjs  (depuis la racine) */
import { lancer, ouvrir, glisser, pincer, doubleAppui, appuiLong, mesurer, rect, plage, w } from './tactile-aide.mjs';
const nav = await lancer(); const sortie = {};
for (const app of ['s23', 'tablette']) {
  for (const cpu of [1, 4]) {
    const p = await ouvrir(nav, app, { cpu }); const r = await rect(p, '[data-graph]') || await rect(p, '.tor-graph'); const R = {}; sortie[`${app} cpu×${cpu}`] = R;
    R.graphique = r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    R.pageDefile = await p.evaluate(() => ({ scrollH: document.documentElement.scrollHeight, innerH: innerHeight, touchAction: getComputedStyle(document.querySelector('.tor-graph-lw') || document.body).touchAction, overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY, vp: document.querySelector('meta[name=viewport]').content }));
    if (!r) { await p.close(); continue; }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, y0 = await p.evaluate(() => scrollY);
    const a = await plage(p); R.glisseH = await mesurer(p, () => glisser(p, [cx - 100, cy], [cx + 100, cy], { pas: 20 })); const b = await plage(p); R.glisseHdeplace = a && b ? Math.round((b.de - a.de) * 10) / 10 : null;
    const y1 = await p.evaluate(() => scrollY); R.glisseVpage = await mesurer(p, () => glisser(p, [cx, cy - 80], [cx, cy + 80], { pas: 20 })); const y2 = await p.evaluate(() => scrollY); R.pageScrollApresV = y2 - y1;
    const c = await plage(p); R.pincer = await mesurer(p, () => pincer(p, [cx, cy], 60, 220, { pas: 20 })); const d = await plage(p); R.pincerEffet = c && d ? Math.round(((c.a - c.de) - (d.a - d.de)) * 10) / 10 : null;
    const e = await plage(p); await doubleAppui(p, [cx, cy]); await w(300); const f = await plage(p); R.doubleAppuiChange = !!(e && f && Math.abs((e.a - e.de) - (f.a - f.de)) > 0.5);
    const fin = await appuiLong(p, [cx, cy]); await w(200); R.appuiLongReticule = await p.evaluate(() => { const t = document.querySelector('.tor-graph-lw table'); return !!t; }); await fin();
    R.outilActif = await p.evaluate(() => (window.__or.graph.etat().modeOutil || null));
    R.erreurs = p.__err.slice(0, 3); R.y0 = y0;
    await p.close();
  }
}
await nav.close(); console.log(JSON.stringify(sortie, null, 1));
