import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';

/* Mesure rapide des images par seconde : galaxie seule, orbite de Mars, salon (qualité imposée par QUALITE, haute par défaut). */
const Q = process.env.QUALITE || 'haute', L = Number(process.env.L) || 2560, H = Number(process.env.H) || 1440;
const { navigateur, page } = await ouvrirGalaxie({ largeur: L, hauteur: H });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(q => window.Galaxie.regler({ qualite: q, fpsMax: 0, afficherFps: true }), Q);
const fps = async nom => { await attendre(3500); const m = await ev(() => { const x = window.Galaxie.mesures(2500); return { fps: Math.round(x.fps), pire1: Math.round(x.pire1), cpu: x.cpuMs && +x.cpuMs.toFixed(1), gpu: x.gpuMs && +x.gpuMs.toFixed(1), appels: x.appels, tri: x.triangles }; }); console.log(nom.padEnd(12), JSON.stringify(m)); };
await fps('galaxie');
await entrerSurMars(page); await fps('orbite');
await ev(() => window.Mars.placerOrbite({ lon: 77.5, lat: 18.4, dist: 100 + 12.5 })); await fps('orbite près');
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur'); await fps('salon');
await ev(() => window.Mars.placerInterieur({ yaw: 1.5, pitch: 0, avancee: 0.2 })); await fps('salon ouest');
await navigateur.close();
