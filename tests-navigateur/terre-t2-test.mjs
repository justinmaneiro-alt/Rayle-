/* T2 : rendu de près avec les VRAIES sources (réseau nécessaire) : photos aériennes locales, relief fin, ombres, réglages de qualité, détail du sol. */
import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
import { PNG } from 'pngjs';
const c = compteur();
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
await entrerEnOrbite(page);
const aller = async (lon, lat, dist, cap, incl, h) => {
  await page.evaluate(([lon, lat, dist, cap, incl]) => window.Terre.placer({ lon, lat, dist, cap, incl }), [lon, lat, dist, cap, incl]);
  const hu = ((h - lon / 15) % 24 + 24) % 24;
  await page.evaluate(hu => window.Terre.definirDate(new Date(Date.UTC(2026, 8, 23, Math.floor(hu), Math.round((hu % 1) * 60)))), hu);
  await attendreChargement(page, { calme: 900, max: 60000 }); await attendre(500);
};
const ecartType = async () => {   // variété des pixels du centre de l'écran : un aplat uni a un écart-type voisin de 0
  const png = PNG.sync.read(Buffer.from(await page.screenshot({ clip: { x: 500, y: 300, width: 600, height: 400 } })));
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < png.data.length; i += 16) { const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; s += l; s2 += l * l; n++; }
  const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m));
};
await aller(3.08, 45.65, 0.4, 0.3, 1.0, 12);
let src = await page.evaluate(() => window.Terre.sourcesAffichees());
c.verifier('Issac : photo aérienne IGN à l’écran', src.includes('ign'), JSON.stringify(src));
c.verifier('Issac : relief Mapterhorn', (await page.evaluate(() => window.Terre.sourcesRelief())).includes('mapterhorn'));
c.verifier('Issac : le sol n’est pas un aplat (écart-type des pixels > 12)', (await ecartType()) > 12, 'σ=' + (await ecartType()).toFixed(1));
const credit = await page.evaluate(() => document.querySelector('#terre-ui .t-credits span').textContent);
c.verifier('crédit IGN affiché dans la ligne du bas', /IGN/.test(credit), credit.slice(-90));
await page.evaluate(() => window.Terre.regler({ regional: false }));
await attendreChargement(page, { calme: 900, max: 60000 }); await attendre(400);
c.verifier('photos locales coupées : plus de source régionale, niveau ≤ 16', (await page.evaluate(() => window.Terre.sourcesAffichees())).length === 0 && (await page.evaluate(() => window.Terre.niveauMax())) <= 16);
await page.evaluate(() => window.Terre.regler({ regional: true }));
await aller(8.54, 47.37, 1.5, 0.3, 1.0, 12);
src = await page.evaluate(() => window.Terre.sourcesAffichees());
c.verifier('Zurich : swisstopo (ou IGN si la boîte l’emporte)', src.includes('swisstopo') || src.includes('ign'), JSON.stringify(src));
await aller(-140, 0, 5, 0.3, 1.0, 12);
c.verifier('Pacifique : aucune photo régionale, tuiles affichées', (await page.evaluate(() => window.Terre.sourcesAffichees())).length === 0 && (await page.evaluate(() => window.Terre.stats().affichees.length)) > 0);
await aller(2.3522, 48.8566, 0.5, 0.4, 1.0, 16.2);
c.verifier('Paris, 16 h : ombres des bâtiments actives', (await page.evaluate(() => window.Terre.lireUniforme('uOmbreOn'))) === 1);
c.verifier('Paris : niveau de détail ≥ 17 (photos aériennes à 20 cm)', (await page.evaluate(() => window.Terre.niveauMax())) >= 17, String(await page.evaluate(() => window.Terre.niveauMax())));
c.verifier('Paris : bâtiments en volume chargés', (await page.evaluate(() => window.Terre.stats().batiments)) > 20);
// images par seconde dans la scène la plus lourde
await page.evaluate(() => { window.__ft = []; const f = t => { window.__ft.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); });
await attendre(3000);
const fps = await page.evaluate(() => { const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const p1 = d.slice(Math.floor(d.length * 0.99)); return { fps: 1000 / (d.reduce((s, v) => s + v, 0) / d.length), pire1: 1000 / (p1.reduce((s, v) => s + v, 0) / p1.length) }; });
console.log('images/s Paris (ombres + bâtiments) :', JSON.stringify(fps));
c.verifier('Paris : ≥ 50 i/s (fenêtre de test à 60 Hz)', fps.fps >= 50, fps.fps.toFixed(1));
await page.evaluate(() => window.Terre.regler({ profil: 'basse' }));
await attendreChargement(page, { calme: 900, max: 60000 }); await attendre(500);
c.verifier('profil léger : pas d’ombres, niveau ≤ 14', (await page.evaluate(() => window.Terre.lireUniforme('uOmbreOn'))) === 0 && (await page.evaluate(() => window.Terre.niveauMax())) <= 14);
await page.evaluate(() => window.Terre.regler({ profil: 'moyenne' }));
await attendreChargement(page, { calme: 900, max: 60000 }); await attendre(500);
c.verifier('profil moyen : ombres actives, niveau ≤ 16', (await page.evaluate(() => window.Terre.lireUniforme('uOmbreOn'))) === 1 && (await page.evaluate(() => window.Terre.niveauMax())) <= 16);
const e = erreurs.filter(x => !/faireconomy|404|408|ERR_FAILED|CONNECTION_REFUSED|CORS|Failed to load resource/.test(x));
c.verifier('aucune erreur de page', e.length === 0, e.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(c.fin() ? 1 : 0);
