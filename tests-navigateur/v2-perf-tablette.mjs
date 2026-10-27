import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre } from './terre-aide.mjs';

/* V2 phase 13 : cadence d'images en mode « tablette » ÉMULÉ : écran 1180×820 tactile à densité 2, processeur ralenti 4 fois (CDP Emulation.setCPUThrottlingRate), qualité « basse » de la galaxie.
   C'est une émulation sur le PC de Justin : elle ne remplace pas une mesure sur la vraie tablette (GPU mobile, mémoire, chaleur). Les chiffres sont écrits dans docs/resultats-v2/perf-tablette.json.
   Lancer : node tests-navigateur/v2-perf-tablette.mjs   (≈ 2 min ; fermer les jeux et autres programmes GPU avant)  */
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1180,820'] });
const page = await nav.newPage();
await page.emulate({ viewport: { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 13; Tablette) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); } catch (e) { /* stockage refusé */ } });
const ev = (f, ...a) => page.evaluate(f, ...a);
const fps = ms => ev(async d => { let n = 0, pire = 0, prec = performance.now(); const t0 = prec; await new Promise(r => { const f = t => { n++; pire = Math.max(pire, t - prec); prec = t; if (t - t0 < d) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return { fps: Math.round(n * 1000 / (performance.now() - t0)), pireImageMs: Math.round(pire) }; }, ms);
const res = {};
for (const theme of ['aurore', 'jarvis']) {
  await ev(t => { try { localStorage.setItem('rayle_theme', t); } catch (e) { /* stockage refusé */ } }, theme); await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(6000);
  res['accueil ' + theme] = await fps(3000); console.log('accueil ' + theme + ' : ' + JSON.stringify(res['accueil ' + theme]));
}
// galaxie en qualité basse
await ev(() => document.getElementById('btnOuvrirGalaxie')?.click()); await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement')?.classList.contains('fini'), { timeout: 120000 }).catch(() => {}); await attendre(1500);
await ev(() => window.Galaxie && window.Galaxie.regler({ qualite: 'basse', fpsMax: 0 })); await attendre(1500);
res['galaxie (basse)'] = await fps(3000); console.log('galaxie (basse) : ' + JSON.stringify(res['galaxie (basse)']));
// Mars : intérieur du salon
const mars = await ev(async () => { try { window.Galaxie.nav.allerA('mars', { entrer: true }); return true; } catch (e) { return false; } });
if (mars) {
  await page.waitForFunction(() => window.Mars && window.Mars.etat().actif && !window.Mars.etat().transition, { timeout: 120000 }).catch(() => {}); await attendre(1500);
  await ev(() => window.Mars.entrerBase && window.Mars.entrerBase()); await page.waitForFunction(() => window.Mars && window.Mars.etat().mode === 'interieur' && !window.Mars.etat().transition, { timeout: 90000 }).catch(() => {}); await attendre(2500);
  res['Mars : salon (basse)'] = await fps(3000); console.log('Mars : salon (basse) : ' + JSON.stringify(res['Mars : salon (basse)']));
}
fs.mkdirSync('docs/resultats-v2', { recursive: true });
fs.writeFileSync('docs/resultats-v2/perf-tablette.json', JSON.stringify({ date: new Date().toISOString(), emulation: { ecran: '1180×820 @2x tactile', processeur: 'ralenti ×4', qualite: 'basse' }, mesures: res, erreurs: erreurs.length }, null, 1));
console.log('\nÉcrit : docs/resultats-v2/perf-tablette.json  (erreurs JS : ' + erreurs.length + ')');
await nav.close();
