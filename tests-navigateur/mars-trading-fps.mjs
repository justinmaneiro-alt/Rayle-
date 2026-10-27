import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* Images par seconde du terminal de Mars : salon avec les fenêtres réelles, puis espace de travail ouvert (graphique + tous les indicateurs + profil de volume),
   dans la page 3D (qualité imposée par QUALITE, haute par défaut ; L × H : 2560 × 1440). À lancer quand aucun jeu n'occupe la carte graphique. */
const Q = process.env.QUALITE || 'haute', L = Number(process.env.L) || 2560, H = Number(process.env.H) || 1440;
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url); };
const { navigateur, page } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(q => window.Galaxie.regler({ qualite: q, fpsMax: 0, afficherFps: true }), Q);
const fps = async nom => { await attendre(3500); const m = await ev(() => { const x = window.Galaxie.mesures(2500); return { fps: Math.round(x.fps), pire1: Math.round(x.pire1), cpu: x.cpuMs && +x.cpuMs.toFixed(1), gpu: x.gpuMs && +x.gpuMs.toFixed(1), appels: x.appels }; }); console.log(nom.padEnd(34), JSON.stringify(m)); };
await entrerSurMars(page); await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 })); await fps('salon, fenêtres réelles');
await ev(() => window.Mars.ouvrirFenetre('graphique-us100')); await attendre(2500); await fps('espace de travail ouvert');
await ev(() => window.Mars.espaceApi().graphique().regler({ profil: true, bollinger: true, ema200: true, macd: true, vwap: true, atr: true, ma50: true, ema20: true })); await fps('tous les indicateurs (6 volets)');
await ev(() => window.Mars.espaceApi().choisirUnite('M15')); await fps('M15, tous les indicateurs');
await navigateur.close(); await worker.fermer();
