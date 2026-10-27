import { ouvrirGalaxie, attendre } from './terre-aide.mjs';
for (const sans of [true, false, true, false]) {
  const { navigateur, page } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900, avant: async p => { if (sans) await p.evaluateOnNewDocument(() => { window.__RAYLE_SANS_VAISSEAU__ = true; }); } });
  await attendre(2500);
  await page.evaluate(() => { window.__ft = []; const f = t => { window.__ft.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); }); await attendre(4000);
  const r = await page.evaluate(() => { const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); return { fps: +(1000 / (d.reduce((s, x) => s + x, 0) / d.length)).toFixed(1), max: +d[d.length - 1].toFixed(1) }; });
  console.log(sans ? 'sans vaisseau détaillé' : 'avec vaisseau détaillé', JSON.stringify(r));
  await navigateur.close();
}
