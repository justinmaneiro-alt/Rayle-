import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement } from './terre-aide.mjs';
import { demarrerWorkerReel } from './worker-local-reel.mjs';

/* Démonstration du point B avec de VRAIES données : vrais flux RSS, vraie météo Open-Meteo (par le code réel du Worker), vrai radar RainViewer,
   vraie image satellite du jour. Captures dans captures-terre/ (b-reel-*.png). Aucune position d'appareil n'est utilisée. */
const worker = await demarrerWorkerReel(8796);
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: +(process.env.L || 1600), hauteur: +(process.env.H || 900), avant: async p => {
  await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url);
} });
await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 1000 });
const fen = id => page.waitForFunction(id => { const el = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return !!el && !el.querySelector('.t-charge'); }, { timeout: 30000 }, id).catch(() => {});
const G = (f, a) => page.evaluate(f, a);

await G(() => window.Terre.placer({ lon: 8, lat: 46, dist: 3800, cap: 0, incl: 0 })); await attendre(1500);
const france = await G(() => window.Terre.actualites('FR', 'France')); await fen('terre-actus'); await attendre(3200); await attendreChargement(page, { calme: 900 });
console.log('France :', france.ok ? france.modele.lignes.length + ' titres, médias : ' + france.modele.sources.join(', ') : france.erreur);
console.log('  ', france.ok ? france.modele.lignes.slice(0, 3).map(l => l.source + ' · ' + l.quand + ' · ' + l.titre.slice(0, 70)).join('\n   ') : '');
await page.screenshot({ path: '../captures-terre/b-reel-actus-france.png' });
const japon = await G(() => window.Terre.actualites('JP', 'Japon')); await fen('terre-actus'); await attendre(4200); await attendreChargement(page, { calme: 900 });
console.log('Japon :', japon.ok ? japon.modele.lignes.length + ' titres, médias : ' + japon.modele.sources.join(', ') : japon.erreur);
await page.screenshot({ path: '../captures-terre/b-reel-actus-japon.png' });
const meteo = await G(() => window.Terre.meteo(43.6047, 2.2399, 'Castres')); await fen('terre-meteo'); await attendre(3500); await attendreChargement(page, { calme: 900 });
console.log('Météo :', meteo.ok ? meteo.phrase : meteo.erreur);
await page.screenshot({ path: '../captures-terre/b-reel-meteo-castres.png' });
await G(() => window.Terre.placer({ lon: 2.2399, lat: 43.6047, dist: 45, cap: 0.3, incl: 0.7 })); await attendreChargement(page, { calme: 1200 }); await attendre(1200);
await page.screenshot({ path: '../captures-terre/b-reel-meteo-nuages-locaux.png' });
await G(() => { window.Terre.placer({ lon: 4, lat: 49, dist: 2400, cap: 0, incl: 0 }); window.Terre.regler({ radar: true }); });
await page.waitForFunction(() => window.Terre.etatB().radar.tuiles > 0, { timeout: 30000 }).catch(() => {});
await attendreChargement(page, { calme: 1200 }); await attendre(800);
console.log('Radar :', JSON.stringify(await G(() => window.Terre.etatB().radar)));
await page.screenshot({ path: '../captures-terre/b-reel-radar.png' });
await G(() => { window.Terre.regler({ radar: false, nuagesReels: true }); window.Terre.placer({ lon: 10, lat: 35, dist: 14000, cap: 0, incl: 0 }); });
await attendreChargement(page, { calme: 1500 }); await attendre(800);
await page.screenshot({ path: '../captures-terre/b-reel-nuages-du-jour.png' });
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close(); await worker.fermer();
process.exit(0);
