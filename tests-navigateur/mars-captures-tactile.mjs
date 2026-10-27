import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* Captures de Mars sur téléphone (390 × 844) : orbite, salon, fenêtre ouverte. Écrit dans captures-mars/. */
fs.mkdirSync('captures-mars', { recursive: true });
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url); };
const { navigateur, page } = await ouvrirGalaxie({ largeur: 1000, hauteur: 700, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await attendre(600);
await ev(() => window.Galaxie.regler({ appareil: 'telephone', qualite: 'auto', fpsMax: 0 })); await attendre(400);
const photo = async n => { await attendre(900); await page.screenshot({ captureBeyondViewport: false, path: 'captures-mars/' + n + '.png' }); console.log('capture', n); };
await entrerSurMars(page);
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 2.5, lat: 18.4 + 3, dist: 100 + 40 })); await photo('tel-1-orbite');
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.05, avancee: 0.4 })); await photo('tel-2-salon');
await ev(() => window.Mars.ouvrirFenetre('graphique-us100')); await attendre(2500); await photo('tel-3-terminal');
await ev(() => document.querySelector('.tg-btn[title*="Redemander"]').scrollIntoView()); await ev(() => window.Mars.espaceApi().choisirDock('correlations')); await ev(() => document.querySelector('.tg-corps').scrollTo(0, 99999)); await photo('tel-4-panneaux');
await navigateur.close(); await worker.fermer();
