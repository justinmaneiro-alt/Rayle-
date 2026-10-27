import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
/* Capture de la table de Mars avec les 13 fenêtres (Finance comprise). Écrit captures-mars/finance-*.png. */
fs.mkdirSync('captures-mars', { recursive: true });
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900;
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: 0.02, avancee: 0.25 })); await attendre(6000);
await page.screenshot({ path: 'captures-mars/finance-table.png' });
console.log('capture ok', JSON.stringify((await ev(() => window.Mars.fenetresReelles())).map(f => f.id + ':' + f.etat)));
await navigateur.close();
