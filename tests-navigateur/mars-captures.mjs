import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';

/* Captures de Mars : l'extérieur, l'approche, l'entrée, le salon sous plusieurs angles et à plusieurs heures, une fenêtre ouverte en grand. Écrit dans captures-mars/.
   QUALITE (haute par défaut), L et H (taille de la fenêtre, 1600×900 par défaut). */
const SORTIE = 'captures-mars/'; fs.mkdirSync(SORTIE, { recursive: true });
const Q = process.env.QUALITE || 'haute', L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900;
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H });
const ev = (f, ...a) => page.evaluate(f, ...a);
const photo = async nom => { await attendre(900); await page.screenshot({ path: SORTIE + nom + '.png' }); console.log('capture', nom); };
await ev(q => window.Galaxie.regler({ qualite: q, fpsMax: 0 }), Q);
await ev(() => window.Galaxie.nav.placer('mars', { angle: 0.6, pitch: 0.3, distance: 11 })); await photo('00-galaxie-mars');
await entrerSurMars(page); await photo('01-orbite-arrivee');
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 3, lat: 18.4 + 4, dist: 100 + 46 })); await photo('02-base-de-loin');
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 1.2, lat: 18.4 + 2.2, dist: 100 + 22 })); await photo('03-base-proche');
await ev(() => { window.Mars.definirHeure(23); window.Mars.auto(false); }); await photo('04-base-nuit');
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 14, lat: 18.4 + 6, dist: 100 + 120 })); await ev(() => window.Mars.definirHeure(17.6)); await photo('05-mars-phobos');
// Phobos en orbite : la caméra se place du côté de la lune
await ev(() => window.Mars.definirTempsSim(1.2));
const lune = await ev(() => window.Mars.lunes());
const lonLat = await ev(l => window.Mars.M.lonLatDeDir(l.phobos), lune);
await ev(l => window.Mars.placerOrbite({ lon: l.lon - 24, lat: l.lat + 10, dist: 100 * 2.2 }), lonLat); await photo('05b-phobos-orbite');
await ev(() => window.Mars.placerOrbite({ lon: 77.5, lat: 18.4, dist: 100 + 14 }));
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur'); await photo('06-salon-entree');
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.05, avancee: 0.45 })); await photo('07-salon-table');
await ev(() => window.Mars.placerInterieur({ yaw: 1.55, pitch: 0.02, avancee: 0.15 })); await photo('08-salon-ouest-coucher');
await ev(() => window.Mars.placerInterieur({ yaw: -1.3, pitch: -0.02, avancee: 0.1 })); await photo('09-salon-est-cuisine');
await ev(() => window.Mars.placerInterieur({ yaw: 3.0, pitch: 0.0, avancee: 0.0 })); await photo('10-salon-sud-porte');
await ev(() => window.Mars.placerInterieur({ yaw: 0.25, pitch: 0.55, avancee: 0.3 })); await photo('11-salon-plafond');
await ev(() => { window.Mars.definirHeure(21.5); window.Mars.placerInterieur({ yaw: 0, pitch: 0.12, avancee: 0.2 }); }); await photo('12-salon-nuit-phobos');
await ev(() => { window.Mars.definirHeure(12); window.Mars.placerInterieur({ yaw: 0.4, pitch: -0.05, avancee: 0.2 }); }); await photo('13-salon-midi');
// Phobos dans le ciel du salon : on cherche un moment où il est haut dans le ciel, puis on le regarde
const vue = await ev(() => { const M = window.Mars.M; let meilleur = null; for (let h = 0; h < 24; h += 0.05) { const p = M.lune(M.PHOBOS, h, M.BASE.lon, M.BASE.lat, 0.6); if (p.elev > 8 && p.elev < 40 && p.azim > 252 && p.azim < 300 && (!meilleur || p.elev > meilleur.elev)) meilleur = { h, elev: p.elev, azim: p.azim }; } return meilleur; });
console.log('Phobos', JSON.stringify(vue));
if (vue) { await ev(v => { window.Mars.definirTempsSim(v.h); window.Mars.definirHeure(21.0); window.Mars.placerInterieur({ yaw: (360 - v.azim) * Math.PI / 180, pitch: v.elev * Math.PI / 180 * 0.9, avancee: 0.2 }); }, vue); await photo('12b-salon-phobos'); }
await ev(() => window.Mars.definirTempsSim(0.5));
await ev(() => { window.Mars.definirHeure(17.4); window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.3 }); });
await ev(() => window.Mars.ouvrirFenetre('graphique-us100')); await photo('14-fenetre-ouverte');
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|ERR_FAILED/.test(e)).slice(0, 8).join('\n  ') || 'aucune');
await navigateur.close();
