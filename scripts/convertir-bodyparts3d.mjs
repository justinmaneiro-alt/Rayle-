// Assemble les os détaillés de BodyParts3D (DBCLS, CC BY 4.0) en un GLB : mains (carpe 8 os, 5 métacarpiens, 14 phalanges par côté), pieds (tarse 7 os, 5 métatarsiens, 14 phalanges par côté),
// crâne (os séparés : frontal, occipital, sphénoïde, ethmoïde, vomer, pariétaux, temporaux, zygomatiques, maxillaires, palatins, lacrymaux, nasaux, cornets) et mandibule, os hyoïde, 28 dents.
//   node scripts/convertir-bodyparts3d.mjs <dossier isa_BP3D_4.0_obj_99> <isa_element_parts.txt> [sortie.glb]
// Données : https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/ (isa_BP3D_4.0_obj_99.zip, isa_element_parts.txt) ; décompresser seulement le dossier d'OBJ.
// Ce que fait le script : repère BodyParts3D (mm, z vers le haut, face vers −y) → repère de Raylé (m, y vers le haut, face vers +z) ; soudure des sommets, une passe de subdivision de Loop
// pour les petits os (maillage de 170 à 800 sommets), normales lisses, épiphyse et occlusion ambiante cuites (attribut _FIBRE), quantification 16 bits.
import fs from 'node:fs';
import { souder, normales, loop, cuire, ecrireGLB } from './lib-glb.mjs';

const [, , dossier, elements, sortie = 'ui/assets/anatomie/os-detail-bp3d.glb'] = process.argv;
if (!dossier || !elements) { console.error('usage : node scripts/convertir-bodyparts3d.mjs <dossier OBJ> <isa_element_parts.txt> [sortie.glb]'); process.exit(1); }

const doigts = ['index', 'middle', 'ring', 'little'], orteils = ['second', 'third', 'fourth', 'little'], rangs = ['first', 'second', 'third', 'fourth', 'fifth'];
function liste(cote) {
  const c = cote === 'G' ? 'left' : 'right', L = {};
  for (const n of ['scaphoid', 'lunate', 'triquetral', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate']) L['carpe_' + n] = `${c} ${n}`;
  rangs.forEach((o, i) => { L['mc' + (i + 1)] = `${c} ${o} metacarpal bone`; L['mt' + (i + 1)] = `${c} ${o} metatarsal bone`; });
  L.ph_p1 = `proximal phalanx of ${c} thumb`; L.ph_d1 = `distal phalanx of ${c} thumb`;
  doigts.forEach((d, i) => { L['ph_p' + (i + 2)] = `proximal phalanx of ${c} ${d} finger`; L['ph_m' + (i + 2)] = `middle phalanx of ${c} ${d} finger`; L['ph_d' + (i + 2)] = `distal phalanx of ${c} ${d} finger`; });
  L.talus = `${c} talus`; L.calcaneus = `${c} calcaneus`; L.naviculaire = `navicular bone of ${c} foot`; L.cuboide = `${c} cuboid bone`;
  L.cun1 = `${c} medial cuneiform bone`; L.cun2 = `${c} intermediate cuneiform bone`; L.cun3 = `${c} lateral cuneiform bone`;
  L.po_p1 = `proximal phalanx of ${c} big toe`; L.po_d1 = `distal phalanx of ${c} big toe`;
  orteils.forEach((d, i) => { L['po_p' + (i + 2)] = `proximal phalanx of ${c} ${d} toe`; L['po_m' + (i + 2)] = `middle phalanx of ${c} ${d} toe`; L['po_d' + (i + 2)] = `distal phalanx of ${c} ${d} toe`; });
  for (const n of ['parietal bone', 'temporal bone', 'zygomatic bone', 'lacrimal bone', 'nasal bone', 'maxilla', 'palatine bone', 'inferior nasal concha']) L['crane_' + n.replace(/ /g, '_')] = `${c} ${n}`;
  return L;
}
const MEDIAN = { crane_frontal: 'frontal bone', crane_occipital: 'occipital bone', crane_sphenoide: 'sphenoid bone', crane_ethmoide: 'ethmoid', crane_vomer: 'vomer', mandibule: 'mandible', hyoide: 'hyoid bone' };

const el = fs.readFileSync(elements, 'utf8').split('\n').slice(1).map(l => l.split('\t')).filter(a => a[2]);
const parNom = {}; for (const [, n, f] of el) (parNom[n.trim()] ||= new Set()).add(f.trim());
const dents = [...new Set(el.map(a => a[1].trim()).filter(n => /^(left|right) (upper|lower) .*tooth$/.test(n)))];
const defs = {};   // nœud → [fichiers]
for (const c of ['G', 'D']) for (const [k, n] of Object.entries(liste(c))) { if (!parNom[n]) throw new Error('concept introuvable : ' + n); defs[k + '_' + c] = [...parNom[n]]; }
for (const [k, n] of Object.entries(MEDIAN)) { if (!parNom[n]) throw new Error('concept introuvable : ' + n); defs[k] = [...parNom[n]]; }
for (const n of dents) defs['dent_' + n.replace(/ secondary| tooth/g, '').replace(/ /g, '_')] = [...parNom[n]];

function lireOBJ(f) {
  const V = [], I = [];
  for (const l of fs.readFileSync(dossier + '/' + f + '.obj', 'utf8').split('\n')) {
    if (l[0] === 'v' && l[1] === ' ') { const [x, y, z] = l.split(/\s+/).slice(1, 4).map(Number); V.push(x * .001, z * .001, -y * .001); }           // (x, y, z) BP3D → (x, z, −y) Raylé, en mètres
    else if (l[0] === 'f') { const t = l.trim().split(/\s+/).slice(1).map(s => parseInt(s) - 1); for (let i = 1; i + 1 < t.length; i++) I.push(t[0], t[i], t[i + 1]); }
  }
  return { pos: Float32Array.from(V), idx: Uint32Array.from(I) };
}
const fusion = parts => { let off = 0; const P = [], I = []; for (const p of parts) { P.push(...p.pos); for (const i of p.idx) I.push(i + off); off += p.pos.length / 3; } return { pos: Float32Array.from(P), idx: Uint32Array.from(I) }; };

const noeuds = [];
for (const [nom, fichiers] of Object.entries(defs)) {
  let m = souder(...Object.values(fusion(fichiers.map(lireOBJ))));
  if (m.pos.length / 3 < 1500 && !/^(dent_|hyoide)/.test(nom)) m = loop(m.pos, m.idx);
  noeuds.push({ nom, pos: m.pos, idx: m.idx, nor: normales(m.pos, m.idx) });
}
// occlusion ambiante : chaque groupe s'occulte lui-même (main, pied, crâne + mandibule + dents) ; la portée dépend de la taille
const groupes = [
  [n => /^(carpe_|mc\d|ph_)/.test(n) && /_G$/.test(n), .02], [n => /^(carpe_|mc\d|ph_)/.test(n) && /_D$/.test(n), .02],
  [n => /^(talus|calcaneus|naviculaire|cuboide|cun\d|mt\d|po_)/.test(n) && /_G$/.test(n), .025], [n => /^(talus|calcaneus|naviculaire|cuboide|cun\d|mt\d|po_)/.test(n) && /_D$/.test(n), .025],
  [n => /^(crane_|mandibule|dent_|hyoide)/.test(n), .05]
];
for (const [test, portee] of groupes) { const sous = noeuds.filter(n => test(n.nom)); cuire(sous, { portee, cellule: portee / 3, rayons: 20 }); console.log(sous.length, 'nœuds, portée', portee); }
const out = ecrireGLB(noeuds, { droits: 'BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)', generateur: 'Rayle scripts/convertir-bodyparts3d.mjs' });
fs.writeFileSync(sortie, out);
console.log(noeuds.length, 'nœuds,', noeuds.reduce((s, n) => s + n.pos.length / 3, 0), 'sommets,', (out.length / 1048576).toFixed(2), 'Mo →', sortie);
