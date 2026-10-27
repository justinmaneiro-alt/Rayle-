import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* Captures du terminal de Mars : le salon avec les vraies fenêtres, l'espace de travail (graphique, indicateurs, profil de volume, watchlist, résumé, corrélations),
   l'or en H1, une panne, le téléphone. Écrit dans captures-mars/trading-*.png.
   Données : le faux Worker (déterministe) par défaut ; SOURCE=reel utilise le mini-Worker local qui exécute les VRAIES routes avec les vraies sources (port 8796). */
const SORTIE = 'captures-mars/'; fs.mkdirSync(SORTIE, { recursive: true });
const reel = process.env.SOURCE === 'reel';
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900;
const worker = reel ? { url: 'http://127.0.0.1:8796', fermer: async () => {} } : await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
const photo = async nom => { await attendre(1200); await page.screenshot({ path: SORTIE + 'trading-' + nom + '.png' }); console.log('capture', nom); };
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 })); await attendre(2500);
await photo('01-salon-fenetres-reelles');
await ev(() => window.Mars.ouvrirFenetre('graphique-us100')); await attendre(2500);
await photo('02-espace-us100-h1');
await ev(() => window.Mars.espaceApi().graphique().regler({ profil: true, bollinger: true, ema200: true, macd: true, vwap: true })); await attendre(1200);
await photo('03-espace-indicateurs');
await ev(() => window.Mars.espaceApi().choisirUnite('M15')); await attendre(2500);
await photo('04-espace-m15');
await ev(() => window.Mars.espaceApi().choisirInstrument('XAU')); await ev(() => window.Mars.espaceApi().choisirUnite('H1')); await attendre(2500);
await photo('05-espace-or-h1');
await ev(() => window.Mars.espaceApi().choisirDock('correlations')); await attendre(2500);
await photo('06-espace-correlations');
await ev(() => Array.from(document.querySelectorAll('.tg-btn')).find(b => /Panneaux du bas/.test(b.textContent)).click()); await ev(() => window.Mars.espaceApi().graphique().regler({ profil: true, macd: false, bollinger: false, vwap: false })); await attendre(1500);
await photo('07-dock-replie');
await ev(() => Array.from(document.querySelectorAll('.tg-btn')).find(b => /seul/.test(b.textContent)).click()); await attendre(1000);
await photo('07-graphique-seul');
await ev(() => window.Mars.fermerFenetre()); await attendre(600);
console.log('erreurs :', erreurs.filter(e => !/faireconomy|ERR_FAILED|404|Failed to load/.test(e)).slice(0, 6).join('\n  ') || 'aucune');
await navigateur.close(); await worker.fermer();
