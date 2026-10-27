// Fabrique les fichiers d'essai de l'atelier 3D (tests-navigateur/fixtures-neptune/) : moteur simplifié en GLB (brut et compressé Meshopt), STL d'un « moignon » (cylindre conique), OBJ + MTL d'une maison.
// Usage : node planetes/neptune/outils/fabriquer-fixtures.mjs   (utilise les modules installés dans planetes/saturne/outils : cd planetes/saturne/outils && npm i)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.resolve(ici, '../../..'), sortie = path.join(racine, 'tests-navigateur/fixtures-neptune');
const outils = createRequire(path.join(racine, 'planetes/saturne/outils/package.json'));
const imp = n => import(pathToFileURL(outils.resolve(n)).href);
const { Document, NodeIO } = await imp('@gltf-transform/core'), { EXTMeshoptCompression, KHRMeshQuantization } = await imp('@gltf-transform/extensions'), { meshopt, quantize } = await imp('@gltf-transform/functions'), { MeshoptEncoder } = await imp('meshoptimizer');
const M = await import(pathToFileURL(path.join(racine, 'planetes/neptune/pc/maquette-calcul.js')).href);
fs.mkdirSync(sortie, { recursive: true }); await MeshoptEncoder.ready;

function ajouter(doc, scene, buffer, nom, forme, pos, couleur) {
  const f = M.transformer(forme, { deplacement: pos });
  const position = doc.createAccessor().setType('VEC3').setArray(Float32Array.from(f.positions)).setBuffer(buffer), indices = doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(f.index)).setBuffer(buffer);
  const mat = doc.createMaterial(nom).setBaseColorFactor([...couleur, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.4);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices).setMaterial(mat);
  const node = doc.createNode(nom).setMesh(doc.createMesh(nom).addPrimitive(prim)); scene.addChild(node); return node;
}
function moteur() {
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('moteur');
  // unités : mètres. Un bloc moteur simplifié : carter, 4 pistons, 4 bielles, vilebrequin, culasse.
  ajouter(doc, scene, buffer, 'Carter', M.formeBoitier({ l: 0.5, h: 0.18, p: 0.2, paroi: 0.01 }), [0, 0, 0], [0.55, 0.58, 0.62]);
  ajouter(doc, scene, buffer, 'Culasse', M.formeBoite(0.5, 0.06, 0.2), [0, 0.3, 0], [0.4, 0.42, 0.46]);
  ajouter(doc, scene, buffer, 'Vilebrequin', M.transformer(M.formeCylindre(0.02, 0.5, 24), { echelle: [1, 1, 1] }), [0, 0.04, 0], [0.8, 0.8, 0.82]);
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    ajouter(doc, scene, buffer, 'Piston ' + (i + 1), M.formeCylindre(0.04, 0.07, 24), [x, 0.22, 0], [0.85, 0.7, 0.4]);
    ajouter(doc, scene, buffer, 'Bielle ' + (i + 1), M.formeBoite(0.02, 0.14, 0.015), [x, 0.12, 0], [0.7, 0.72, 0.75]);
  }
  ajouter(doc, scene, buffer, 'Pièce mystère 77', M.formeTore(0.05, 0.012, 24, 10), [0.32, 0.1, 0.12], [0.3, 0.6, 0.8]);
  return doc;
}
// vilebrequin couché le long de X : on tourne le cylindre autour de Z
const doc = moteur(), io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await io.write(path.join(sortie, 'moteur-test.glb'), doc);
// GLB compressé Draco (facultatif : demande le paquet draco3dgltf, installé avec « cd planetes/saturne/outils && npm i draco3dgltf --no-save »)
try {
  const draco3d = (await imp('draco3dgltf')).default || (await imp('draco3dgltf')), { KHRDracoMeshCompression } = await imp('@gltf-transform/extensions'), { draco } = await imp('@gltf-transform/functions');
  const dd = moteur(), ioD = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
  await dd.transform(draco()); await ioD.write(path.join(sortie, 'moteur-draco.glb'), dd);
} catch (e) { console.log('Draco ignoré :', e && e.message); }
await doc.transform(quantize({ quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(path.join(sortie, 'moteur-meshopt.glb'), doc);

// « moignon » de scan : cône tronqué (rayon 45 mm à la base, 28 mm au bout, 220 mm de long), axe Y, en mm
const prof = [[0, 0], [45, 0], [42, 60], [36, 140], [28, 220], [0, 220]], moignon = M.revolution(prof, 72);
fs.writeFileSync(path.join(sortie, 'moignon-scan.stl'), M.exporterSTLBinaire(moignon, { nom: 'moignon test' }));
// maison : murs + toit (prisme) + porte, en mètres, OBJ + MTL
const maison = [['Murs', M.transformer(M.formeBoite(8, 3, 6), { deplacement: [0, 1.5, 0] }), 'mur'], ['Dalle', M.transformer(M.formeBoite(8.4, 0.2, 6.4), { deplacement: [0, -0.1, 0] }), 'dalle'], ['Toit', M.transformer(M.formeBoite(8.6, 0.25, 6.6), { deplacement: [0, 3.2, 0] }), 'toit'], ['Porte', M.transformer(M.formeBoite(1, 2.1, 0.12), { deplacement: [0, 1.05, 3.05] }), 'porte']];
let obj = 'mtllib maison-test.mtl\n', base = 1;
for (const [nom, f, mat] of maison) { obj += 'o ' + nom + '\nusemtl ' + mat + '\n'; for (let i = 0; i < f.positions.length; i += 3) obj += 'v ' + f.positions[i].toFixed(4) + ' ' + f.positions[i + 1].toFixed(4) + ' ' + f.positions[i + 2].toFixed(4) + '\n'; for (let i = 0; i < f.index.length; i += 3) obj += 'f ' + (f.index[i] + base) + ' ' + (f.index[i + 1] + base) + ' ' + (f.index[i + 2] + base) + '\n'; base += f.positions.length / 3; }
fs.writeFileSync(path.join(sortie, 'maison-test.obj'), obj);
fs.writeFileSync(path.join(sortie, 'maison-test.mtl'), 'newmtl mur\nKd 0.9 0.85 0.75\nnewmtl dalle\nKd 0.5 0.5 0.5\nnewmtl toit\nKd 0.6 0.2 0.15\nnewmtl porte\nKd 0.35 0.2 0.1\n');
console.log('fixtures écrites dans', sortie, fs.readdirSync(sortie).map(f => f + ' ' + fs.statSync(path.join(sortie, f)).size).join(', '));
