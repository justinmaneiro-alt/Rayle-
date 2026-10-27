/* Capture d'une vue : node terre-t2-vue.mjs nom lon lat dist cap incl moment(jour|crep|nuit) [reglages JSON] */
import { ouvrirGalaxie, entrerEnOrbite, attendreChargement, attendre } from './terre-aide.mjs';
const [nom, lon, lat, dist, cap, incl, moment, reg] = process.argv.slice(2);
const { navigateur, page } = await ouvrirGalaxie({ largeur: +(process.env.L || 1600), hauteur: +(process.env.H || 900) });
await entrerEnOrbite(page);
if (reg) await page.evaluate(r => { const o = JSON.parse(r); const { dbg, ...rest } = o; if (Object.keys(rest).length) window.Terre.regler(rest); for (const [k, v] of Object.entries(dbg || {})) window.Terre.debogage(k, v); }, reg);
await page.evaluate(([lon, lat, dist, cap, incl]) => window.Terre.placer({ lon, lat, dist, cap, incl }), [+lon, +lat, +dist, +cap, +incl]);
const h = { jour: 12, crep: 17.7, nuit: 0.5 }[moment || 'jour'] ?? +moment, hu = ((h - lon / 15) % 24 + 24) % 24;
await page.evaluate(hu => window.Terre.definirDate(new Date(Date.UTC(2026, 8, 23, Math.floor(hu), Math.round((hu % 1) * 60)))), hu);
await attendreChargement(page, { calme: 900, max: 60000 }); await attendre(600);
await page.screenshot({ path: process.env.OUT || `docs/captures-t2/${nom}.png` });
console.log(JSON.stringify(await page.evaluate(() => { const s = window.Terre.stats(); return { aff: s.affichees.length, bat: s.batiments }; })));
await navigateur.close();
