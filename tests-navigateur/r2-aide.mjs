import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
export * from './mars-aide.mjs';
export { BASE, attendre, compteur };

/* R2 : comme ouvrirGalaxie, mais dans le thème AURORE (celui de Justin, par défaut) : le bouton 🌌 y est caché, la galaxie s'ouvre par le menu Espaces / G1 ;
   ici on déclenche le même bouton par le DOM. Les tests R2 vérifient donc ce que Justin voit vraiment. `theme` : 'aurore' (défaut) ou 'jarvis'. */
export async function ouvrirGalaxieTheme({ largeur = 1600, hauteur = 900, avant = null, theme = 'aurore', tactile = false } = {}) {
  const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${largeur},${hauteur}`] });
  const page = await navigateur.newPage();
  await page.setViewport({ width: largeur, height: hauteur, hasTouch: tactile, isMobile: false });
  const erreurs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) erreurs.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
  await page.evaluateOnNewDocument(t => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); if (!localStorage.getItem('rayle_theme')) localStorage.setItem('rayle_theme', t); } catch (e) {} }, theme);
  if (process.env.FENETRES_V1) await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_fenetres_v1', '1'); } catch (e) {} });   // V2 : ancien système de fenêtres (anciens tests)
  if (avant) await avant(page);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await attendre(1200);
  await page.evaluate(() => document.getElementById('btnOuvrirGalaxie').click());
  await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 });
  await attendre(500);
  return { navigateur, page, erreurs };
}
