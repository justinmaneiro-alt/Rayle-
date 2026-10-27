import fs from 'node:fs';
import { ouvrirGalaxieTheme as ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './r2-aide.mjs';

/* V2 phase 2 : les fenêtres de la table de Mars ne clignotent plus et ne sautillent plus.
   Mesure sur 6 s dans le salon : position écran de chaque fenêtre (écart max), opacité et échelle de chaque plan (variation max). Échec si une valeur bouge sans interaction.
   Lancer :  node tests-navigateur/mars-v2-stabilite.mjs   (serveur local sur 127.0.0.1:8000 : node serveur.mjs) */
const SORTIE = 'captures-mars/'; fs.mkdirSync(SORTIE, { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await ev(() => { window.Mars.auto(false); window.Mars.placerInterieur({ yaw: 0, pitch: -0.05, avancee: 0.45 }); });
await attendre(1200);
const echantillons = [];
for (let i = 0; i < 30; i++) { echantillons.push(await ev(() => ({ pos: window.Mars.positionsEcran(), plans: window.Mars.etatPlans() }))); await attendre(200); }
const ids = echantillons[0].pos.map(p => p.id);
v('au moins 7 fenêtres sur la table', ids.length >= 7, ids.length + ' fenêtres');
let derive = 0, dOp = 0, dEch = 0;
for (const id of ids) {
  const xs = echantillons.map(e => e.pos.find(p => p.id === id)), pl = echantillons.map(e => e.plans.find(p => p.id === id));
  derive = Math.max(derive, Math.max(...xs.map(p => p.x)) - Math.min(...xs.map(p => p.x)), Math.max(...xs.map(p => p.y)) - Math.min(...xs.map(p => p.y)));
  dOp = Math.max(dOp, Math.max(...pl.map(p => p.opacite)) - Math.min(...pl.map(p => p.opacite)));
  dEch = Math.max(dEch, Math.max(...pl.map(p => p.echelle)) - Math.min(...pl.map(p => p.echelle)));
}
v('aucune fenêtre ne bouge à l’écran (écart max ≤ 0,5 px)', derive <= 0.5, derive.toFixed(2) + ' px');
v('l’opacité ne varie pas (pas de clignotement)', dOp < 0.001, dOp.toFixed(4));
v('l’échelle ne varie pas', dEch < 0.001, dEch.toFixed(4));
await page.screenshot({ path: SORTIE + 'v2-stabilite-salon.png' });
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|ERR_FAILED/.test(e)).slice(0, 8).join('\n  ') || 'aucune');
v('aucune erreur JavaScript', !erreurs.filter(e => !/faireconomy|404|ERR_FAILED/.test(e)).length);
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : 'TOUT PASSE : ' + ok);
await navigateur.close(); process.exit(ko ? 1 : 0);
