/* T1 : la sélection des tuiles ne rejette jamais le sol visé, quel que soit le lieu (océan, pôles, ligne de changement de date…) ni l'altitude. */
import { pose } from '../pc/camera-orbite.js';
import { selectionner } from '../pc/quadtree.js';
import { tuileDe } from '../pc/geo.js';
let ok = 0, ko = 0;
const verifier = (nom, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + nom + (d ? ' — ' + d : '')); };
const LIEUX = { paris: [2.35, 48.86], alpes: [6.87, 45.83], cote: [4, 43.45], desert: [10, 25], ocean: [-140, 0], pole_nord: [0, 85], pole_sud: [0, -85], date: [179.9, -17.7], tokyo: [139.69, 35.69], issac: [3.08, 45.65], commune: [1.17, 43.17], groenland: [-45, 75], samoa: [-172, -13.8] };
for (const [nom, [lon, lat]] of Object.entries(LIEUX)) for (const dist of [8000, 1500, 200, 30, 2.4]) for (const incl of [0, 0.9]) {
  const p = pose({ lon, lat, dist, cap: 0.3, incl }, 0);
  const f = selectionner({ cam: p.cam, avant: p.avant, droite: p.droite, haut: p.haut, fov: 50 * Math.PI / 180, aspect: 16 / 9, hauteurEcran: 900, zMax: 16, zMin: 3, pixelsMax: 420, maxTuiles: 340 });
  const k = tuileDe(lon, lat, 3);
  const couvre = f.some(t => t.z >= 3 && (t.x >> (t.z - 3)) === k.x && (t.y >> (t.z - 3)) === k.y) || incl > 0;   // incliné : la cible peut sortir du champ
  verifier(`${nom} dist ${dist} incl ${incl} : des tuiles voulues`, f.length > 0, `${f.length}`);
  if (incl === 0) verifier(`${nom} dist ${dist} : la tuile sous la caméra est voulue`, couvre);
}
// relief : une caméra à 2,5 km au-dessus d'un relief exagéré de 1,26 km ne doit pas perdre les tuiles du sol sous elle (sphères centrées au niveau de la mer)
{
  const p = pose({ lon: 3.08, lat: 45.65, dist: 2.5, cap: 0.3, incl: 1.0 }, 1.13);
  const args = { cam: p.cam, avant: p.avant, droite: p.droite, haut: p.haut, fov: 50 * Math.PI / 180, aspect: 16 / 9, hauteurEcran: 900, zMax: 18, zMin: 3, pixelsMax: 300, maxTuiles: 340 };
  const proches = h => selectionner({ ...args, hTerrain: h }).filter(t => t.z >= 16 && t.d < 3.4).length;
  const sans = proches(0), avec = proches(1.3);
  verifier('relief : plus de tuiles proches retenues quand la hauteur du relief est prise en compte', avec > sans && avec >= 3, `${sans} → ${avec}`);
}
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
