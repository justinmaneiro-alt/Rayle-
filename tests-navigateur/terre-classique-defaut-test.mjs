/* La Terre CLASSIQUE est la Terre par défaut ; Terre 2.0 = bouton « Terre 2.0 (expérimental) », PC seulement. Vraie page, vrai réseau.
   PC : la galaxie ouvre la Terre classique (actualités, relief, villes, bâtiments, couches, commandes Rayle), le bouton ouvre la 2.0, « Terre classique » revient.
   Tablette et téléphone : carte légère, jamais la 2.0, pas de bouton expérimental. Captures dans captures-terre/apres-*.png.
   Prérequis : node serveur.mjs 8011.  Usage : BASE=http://127.0.0.1:8011 node terre-classique-defaut-test.mjs */
import fs from 'node:fs';
import { ouvrirGalaxieTheme as ouvrirGalaxie, attendre, compteur } from './r2-aide.mjs';
import { attendreChargement } from './terre-aide.mjs';
const { verifier, fin } = compteur();
fs.mkdirSync('../captures-terre', { recursive: true });
const sansVue = p => p.evaluateOnNewDocument(() => { try { localStorage.removeItem('rayle_terre_vue'); sessionStorage.clear(); } catch (e) { /* */ } });

// ── PC ──
if (!process.env.SANS_PC) {
  const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900, avant: sansVue });
  await page.evaluate(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
  await page.waitForFunction(() => window.Terre && window.Terre.etat && window.Terre.etat().actif && window.Terre.etat().entree, { timeout: 90000 });
  const e = await page.evaluate(() => ({ mode: window.Terre.mode || '3d', t2: !!(window.Terre2 && window.Terre2.etat().actif), bouton: !!document.querySelector('[data-a="terre-v2"]'), france: !!document.querySelector('[data-a="france"]'), relief: !!window.Terre.stats }));
  verifier('PC : la galaxie ouvre la Terre CLASSIQUE (globe 3D, pas la 2.0)', e.mode !== 'leger' && !e.t2, JSON.stringify(e));
  verifier('PC : commandes de la Terre classique présentes (actualités France, couches)', e.france && e.relief);
  verifier('PC : bouton « Terre 2.0 (expérimental) »', e.bouton);
  await page.evaluate(() => window.Terre.definirDate('2026-06-21T11:30:00Z'));
  await page.evaluate(() => window.Terre.placer({ lon: 6.86, lat: 45.83, dist: 60, cap: 2.6, incl: 1.0 })); await attendreChargement(page, { max: 40000 }); await attendre(1200);
  await page.screenshot({ path: '../captures-terre/apres-pc-classique-alpes.png' });
  await page.evaluate(() => window.Terre.placer({ lon: 5.45, lat: 43.18, dist: 7, cap: 0.5, incl: 0.5 })); await attendreChargement(page, { max: 40000 }); await attendre(1200);
  await page.screenshot({ path: '../captures-terre/apres-pc-classique-calanques.png' });
  await page.evaluate(() => window.Terre.placer({ lon: 2.3522, lat: 48.8566, dist: 1.6, cap: 0.4, incl: 1.0 })); await attendreChargement(page, { max: 40000 }); await attendre(1500);
  const bat = await page.evaluate(() => window.Terre.stats().batiments);
  verifier('PC : bâtiments 3D à Paris', bat > 0, 'bâtiments ' + bat);
  await page.screenshot({ path: '../captures-terre/apres-pc-classique-paris.png' });
  await page.evaluate(() => document.querySelector('[data-a="terre-v2"]').click());
  const ok2 = await page.waitForFunction(() => window.Terre2 && window.Terre2.etat().actif, { timeout: 60000 }).then(() => true).catch(() => false);
  verifier('PC : le bouton ouvre la Terre 2.0 (expérimental)', ok2);
  await attendre(6000); await page.screenshot({ path: '../captures-terre/apres-pc-terre2-bouton.png' });
  if (ok2) { await page.evaluate(() => window.Terre2.classique()); await attendre(4000); }
  verifier('PC : « Terre classique » ramène la Terre classique', await page.evaluate(() => !!(window.Terre && window.Terre.etat().actif) && !(window.Terre2 && window.Terre2.etat().actif)));
  const ex = erreurs.filter(x => /pageerror|TypeError|ReferenceError/.test(x));
  verifier('PC : aucune exception', !ex.length, ex.slice(0, 3).join(' | '));
  await navigateur.close();
}
// ── tablette et téléphone ──
for (const [nom, l, h, app] of [['tablette', 820, 1180, 'tablette'], ['telephone', 390, 844, 'telephone']]) {
  const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1280, hauteur: 900, avant: sansVue });   // la galaxie est réservée au PC : on l'ouvre puis on simule l'appareil
  await page.evaluate(a => window.Galaxie.regler({ appareil: a }), app);
  await page.evaluate(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
  await page.waitForFunction(() => window.Terre && window.Terre.etat && window.Terre.etat().entree, { timeout: 90000 });
  await page.setViewport({ width: l, height: h }); await attendre(1500);
  await attendre(2500);
  const e = await page.evaluate(() => ({ mode: window.Terre.mode, t2: !!window.Terre2, bouton: !!document.querySelector('[data-a="terre-v2"]'), largeur: document.documentElement.scrollWidth }));
  verifier(`${nom} : carte légère, jamais la Terre 2.0, pas de bouton expérimental`, e.mode === 'leger' && !e.t2 && !e.bouton, JSON.stringify(e));
  verifier(`${nom} : pas de défilement horizontal`, e.largeur <= l + 1, String(e.largeur));
  await page.screenshot({ path: `../captures-terre/apres-${nom}.png` });
  const ex = erreurs.filter(x => /pageerror|TypeError|ReferenceError/.test(x));
  verifier(`${nom} : aucune exception`, !ex.length, ex.slice(0, 3).join(' | '));
  await navigateur.close();
}
process.exit(fin() ? 1 : 0);
