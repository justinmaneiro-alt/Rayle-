import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import * as C from '../planetes/terre/pc/camera-orbite.js';
import { vers, faceCamera } from '../planetes/terre/pc/geo.js';
import { soleilReel } from '../planetes/terre/pc/soleil-reel.js';

/* La Terre est un globe PLEIN et opaque : la face nuit ne laisse jamais voir le fond (étoiles, nébuleuses, Voie lactée), et les noms, repères
   et fenêtres de l'autre hémisphère sont cachés.
   Méthode : on place la nuit au centre de l'écran, temps figé, puis on compare les pixels du disque (face nuit) avec le ciel visible
   puis entièrement caché. Si le fond « passe à travers » le globe, les deux images diffèrent. Garde-fou : le même test doit voir une vraie
   différence sur le fond (hors du disque), sinon il ne détecterait rien. */
const { verifier, fin } = compteur();
const dossier = process.env.OUT || '../captures-terre/transparence';
fs.mkdirSync(dossier, { recursive: true });
const L = 1600, H = 900;
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H });
await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 900 });
await page.evaluate(() => { document.querySelectorAll('.t-panneau,#terre-ui,.t-barre,.t-noms,.t-marqueurs').forEach(e => e.style.visibility = 'hidden'); });

// heure où le centre de l'écran est en pleine nuit (calculée ici avec la même formule que le globe)
const e0 = await page.evaluate(() => { const e = window.Terre.etat(); return { lon: e.lon, lat: e.lat }; });
const centre = vers(e0.lon, e0.lat);
let heure = 0, pire = 9;
for (let h = 0; h < 24; h++) {
  const s = soleilReel(new Date(Date.UTC(2026, 8, 23, h, 0, 0))).direction, u = centre.map(x => x / Math.hypot(...centre)), d = u[0] * s[0] + u[1] * s[1] + u[2] * s[2];
  if (d < pire) { pire = d; heure = h; }
}
verifier('le centre de l’écran est bien en pleine nuit (soleil à plus de 120° du centre)', pire < -0.6, 'cos ' + pire.toFixed(2));
await page.evaluate(h => window.Terre.definirDate(new Date(Date.UTC(2026, 8, 23, h, 0, 0))), heure);
await attendre(900);

const pixels = async clip => PNG.sync.read(Buffer.from(await page.screenshot({ clip })));
const ecart = (a, b) => { let m = 0; for (let i = 0; i < a.data.length; i += 4) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a.data[i + k] - b.data[i + k])); return m; };
const lum = a => { let s = 0, n = 0; for (let i = 0; i < a.data.length; i += 4) { s += 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2]; n++; } return s / n; };
const ciel = oui => page.evaluate(oui => { window.Galaxie.ciel.groupe.visible = oui; }, oui);

// Disque de la Terre : détecté sur l'image (centre de l'écran), on échantillonne des zones bien à l'intérieur, côté nuit
const disque = await page.evaluate(() => { const e = window.Terre.etat(); return { alt: e.altitude }; });
const R = 6371, rc = R + disque.alt, rayonPx = (() => { const fov = 50 * Math.PI / 180, ang = Math.asin(R / rc); return Math.tan(ang) / Math.tan(fov / 2) * H / 2; })();
const zones = [[0, 0], [-0.45, 0.1], [0.4, -0.3], [-0.2, -0.5], [0.3, 0.45], [0.6, 0.1]].map(([a, b]) => ({ x: Math.round(L / 2 + a * rayonPx * 0.9) - 20, y: Math.round(H / 2 + b * rayonPx * 0.9) - 20, width: 40, height: 40 }));
const COIN = { x: 20, y: H - 160, width: 120, height: 100 };

let max = 0, lumMax = 0, lumCentre = 0, vu = 0, i0 = 0;
for (const z of zones) {
  await ciel(true); await attendre(120); const avec = await pixels(z), coinA = await pixels(COIN);
  await ciel(false); await attendre(120); const sans = await pixels(z), coinS = await pixels(COIN);
  await ciel(true);
  max = Math.max(max, ecart(avec, sans)); lumMax = Math.max(lumMax, lum(avec)); if (i0++ === 0) lumCentre = lum(avec);
  if (ecart(coinA, coinS) > 12) vu++;
}
verifier('face nuit opaque : aucun pixel du disque ne change quand le ciel est caché (écart ≤ 3)', max <= 3, `écart max ${max}`);
verifier('face nuit : faiblement éclairée (lueur ambiante, lumières de villes), ni noire ni éclairée par le jour (centre : 3 < luminance < 70)', lumCentre > 3 && lumCentre < 70, lumCentre.toFixed(1));
verifier('garde-fou : le test voit bien le fond quand il est derrière (hors du disque)', vu >= 4, String(vu) + ' zones');
await page.screenshot({ path: `${dossier}/nuit-apres.png` });

// étiquettes, repères : rien de l'autre hémisphère
await page.evaluate(() => { document.querySelectorAll('.t-noms,.t-marqueurs').forEach(e => e.style.visibility = ''); });
await page.evaluate(() => window.Terre.regler({ noms: true }));
await attendre(1500);
const etat = await page.evaluate(() => { const T = window.Terre, e = T.etat(); return { e: { lon: e.lon, lat: e.lat, dist: e.dist, cap: e.cap, incl: e.incl }, noms: [...T.noms.items.values()].filter(i => i.alpha > 0.05).map(i => ({ n: i.n, lon: i.lon, lat: i.lat })), marq: T.marqueursEcran() }; });
const pose = C.pose(etat.e, 0);
const caches = etat.noms.filter(i => !faceCamera(vers(i.lon, i.lat, 0), pose.cam));
verifier('noms de lieux : aucun sur l\'hémisphère caché', caches.length === 0, `${etat.noms.length} affichés, ${caches.length} cachés à tort`);
verifier('on a bien des noms à tester', etat.noms.length > 0);
console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
process.exit(fin() ? 1 : 0);
