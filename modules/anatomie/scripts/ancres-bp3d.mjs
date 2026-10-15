// Ancres de peau : les os de BodyParts3D auxquels les tissus mous (muscles, vaisseaux, organes) sont rattachés.
// Chaque ancre porte l'identifiant de la structure de l'application dont la transformation d'ajustement (ajustement.js) la déplace à l'exécution :
//   « humerus:G », « vertebre-C5 », « cote-3:D », « crane », « main:G » (carpe, métacarpiens, phalanges, qui partagent une même transformation), « pied:D » …
// ancres(bp) → [{ id, maillage: { pos, idx } }] ; les os absents de BodyParts3D (coccyx, manubrium) n'ont pas d'ancre.
import { ouvrirBP3D } from './lib-bp3d.mjs';

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
export const VERT = [];
for (let i = 1; i <= 7; i++) VERT.push(['C' + i, i === 1 ? 'atlas' : i === 2 ? 'axis' : ORD[i - 1] + ' cervical vertebra']);
for (let i = 1; i <= 12; i++) VERT.push(['T' + i, ORD[i - 1] + ' thoracic vertebra']);
for (let i = 1; i <= 5; i++) VERT.push(['L' + i, ORD[i - 1] + ' lumbar vertebra']);

const COTE = { G: 'left', D: 'right' };

/** Noms BodyParts3D des os d'une main ou d'un pied (côté 'left' / 'right') */
export function osMain(c) {
  const L = ['scaphoid', 'lunate', 'triquetral', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate'].map(n => `${c} ${n}`);
  ORD.slice(0, 5).forEach(o => L.push(`${c} ${o} metacarpal bone`));
  L.push(`proximal phalanx of ${c} thumb`, `distal phalanx of ${c} thumb`);
  for (const d of ['index', 'middle', 'ring', 'little']) L.push(`proximal phalanx of ${c} ${d} finger`, `middle phalanx of ${c} ${d} finger`, `distal phalanx of ${c} ${d} finger`);
  return L;
}
export function osPied(c) {
  const L = [`${c} talus`, `${c} calcaneus`, `navicular bone of ${c} foot`, `${c} cuboid bone`, `${c} medial cuneiform bone`, `${c} intermediate cuneiform bone`, `${c} lateral cuneiform bone`];
  ORD.slice(0, 5).forEach(o => L.push(`${c} ${o} metatarsal bone`));
  L.push(`proximal phalanx of ${c} big toe`, `distal phalanx of ${c} big toe`);
  for (const d of ['second', 'third', 'fourth', 'little']) L.push(`proximal phalanx of ${c} ${d} toe`, `middle phalanx of ${c} ${d} toe`, `distal phalanx of ${c} ${d} toe`);
  return L;
}

/** Définition des ancres : id → liste de noms de concepts BodyParts3D */
export function definitionAncres() {
  const D = {};
  D.crane = ['frontal bone', 'occipital bone', 'sphenoid bone', 'ethmoid', 'vomer'];
  for (const c of ['left', 'right']) D.crane.push(...['parietal bone', 'temporal bone', 'zygomatic bone', 'lacrimal bone', 'nasal bone', 'maxilla', 'palatine bone'].map(n => c + ' ' + n));
  D.mandibule = ['mandible'];
  D.sacrum = ['sacrum'];
  D.sternum = ['body of sternum'];
  for (const [id, nom] of VERT) D['vertebre-' + id] = [nom];
  for (const k of ['G', 'D']) {
    const c = COTE[k];
    for (let i = 1; i <= 12; i++) D[`cote-${i}:${k}`] = [`${c} ${ORD[i - 1]} rib`];
    for (const [id, nom] of [['clavicule', 'clavicle'], ['scapula', 'scapula'], ['humerus', 'humerus'], ['radius', 'radius'], ['ulna', 'ulna'], ['os-coxal', 'hip bone'], ['femur', 'femur'], ['patella', 'patella'], ['tibia', 'tibia'], ['fibula', 'fibula']]) D[`${id}:${k}`] = [`${c} ${nom}`];
    D[`main:${k}`] = osMain(c); D[`pied:${k}`] = osPied(c);
  }
  return D;
}

export function ancres(bp) {
  const def = definitionAncres(), res = [];
  for (const [id, noms] of Object.entries(def)) {
    const fichiers = [];
    for (const n of noms) { const f = bp.fichiers(n); if (f) fichiers.push(...f); else console.warn('  ancre', id, ': concept absent', n); }
    if (fichiers.length) res.push({ id, maillage: bp.maillageFichiers(fichiers) });
  }
  return res;
}
