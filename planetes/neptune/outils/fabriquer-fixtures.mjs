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

// ── FBX (texte ASCII, écrit à la main : un cube et une pyramide, deux matériaux) ──
function fbxAscii() {
  const faces = (sommets, quads) => { const idx = [], nor = []; for (const q of quads) { const p = q.map(i => sommets[i]), u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; q.forEach((i, k) => { idx.push(k === q.length - 1 ? -(i + 1) : i); nor.push(...n.map(x => +(x / l).toFixed(5))); }); } return { idx, nor }; };
  const cube = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], fc = faces(cube, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]);
  const pyr = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [0, 1.6, 0]], fp = faces(pyr, [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]]);
  const geo = (id, nom, s, f) => `\tGeometry: ${id}, "Geometry::${nom}", "Mesh" {\n\t\tVertices: *${s.length * 3} {\n\t\t\ta: ${s.flat().join(',')}\n\t\t}\n\t\tPolygonVertexIndex: *${f.idx.length} {\n\t\t\ta: ${f.idx.join(',')}\n\t\t}\n\t\tGeometryVersion: 124\n\t\tLayerElementNormal: 0 {\n\t\t\tVersion: 101\n\t\t\tName: ""\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "Direct"\n\t\t\tNormals: *${f.nor.length} {\n\t\t\t\ta: ${f.nor.join(',')}\n\t\t\t}\n\t\t}\n\t}\n`;
  const modele = (id, nom, t) => `\tModel: ${id}, "Model::${nom}", "Mesh" {\n\t\tVersion: 232\n\t\tProperties70:  {\n\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${t.join(',')}\n\t\t}\n\t}\n`;
  const mat = (id, nom, c) => `\tMaterial: ${id}, "Material::${nom}", "" {\n\t\tVersion: 102\n\t\tShadingModel: "phong"\n\t\tProperties70:  {\n\t\t\tP: "DiffuseColor", "Color", "", "A",${c.join(',')}\n\t\t}\n\t}\n`;
  return '; FBX 7.4.0 project file (fichier d\'essai écrit par Raylé : rien d\'un modèle existant)\nFBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n\tCreator: "Raylé fixtures"\n}\nGlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n\t\tP: "UpAxis", "int", "Integer", "",1\n\t\tP: "UpAxisSign", "int", "Integer", "",1\n\t\tP: "FrontAxis", "int", "Integer", "",2\n\t\tP: "FrontAxisSign", "int", "Integer", "",1\n\t\tP: "CoordAxis", "int", "Integer", "",0\n\t\tP: "CoordAxisSign", "int", "Integer", "",1\n\t\tP: "UnitScaleFactor", "double", "Number", "",1\n\t}\n}\nDefinitions:  {\n\tVersion: 100\n\tCount: 6\n}\nObjects:  {\n'
    + geo(1001, 'Cube', cube, fc) + geo(1002, 'Pyramide', pyr, fp) + modele(2001, 'Cube FBX', [-2, 1, 0]) + modele(2002, 'Pyramide FBX', [2, 0, 0]) + mat(3001, 'Rouge', [0.8, 0.25, 0.2]) + mat(3002, 'Bleu', [0.2, 0.45, 0.8])
    + '}\nConnections:  {\n\tC: "OO",2001,0\n\tC: "OO",2002,0\n\tC: "OO",1001,2001\n\tC: "OO",1002,2002\n\tC: "OO",3001,2001\n\tC: "OO",3002,2002\n}\n';
}
fs.writeFileSync(path.join(sortie, 'solides-test.fbx'), fbxAscii());

// ── KTX2 : un damier 8×8 NON compressé (écrit avec ktx-parse) posé sur un plan dans un GLB (extension KHR_texture_basisu) ──
try {
  const K = await imp('ktx-parse'), { KHRTextureBasisu } = await imp('@gltf-transform/extensions');
  const rgba = new Uint8Array(8 * 8 * 4); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = ((x >> 1) + (y >> 1)) % 2 ? [235, 235, 235] : [200, 60, 40]; rgba.set([...c, 255], (y * 8 + x) * 4); }
  const c = K.createDefaultContainer(); c.vkFormat = K.VK_FORMAT_R8G8B8A8_SRGB; c.typeSize = 1; c.pixelWidth = 8; c.pixelHeight = 8; c.pixelDepth = 0; c.layerCount = 0; c.faceCount = 1; c.supercompressionScheme = K.KHR_SUPERCOMPRESSION_NONE;
  c.levels = [{ levelData: rgba, uncompressedByteLength: rgba.length }]; c.levelCount = 1;
  const ech = (pos, type) => ({ bitOffset: pos * 8, bitLength: 8, channelType: type, samplePosition: [0, 0, 0, 0], sampleLower: 0, sampleUpper: 255 });
  c.dataFormatDescriptor[0] = { vendorId: 0, descriptorType: 0, versionNumber: 2, descriptorBlockSize: 0, colorModel: K.KHR_DF_MODEL_RGBSDA, colorPrimaries: K.KHR_DF_PRIMARIES_BT709, transferFunction: K.KHR_DF_TRANSFER_SRGB, flags: K.KHR_DF_FLAG_ALPHA_STRAIGHT, texelBlockDimension: [0, 0, 0, 0], bytesPlane: [4, 0, 0, 0, 0, 0, 0, 0], samples: [ech(0, K.KHR_DF_CHANNEL_RGBSDA_RED), ech(1, K.KHR_DF_CHANNEL_RGBSDA_GREEN), ech(2, K.KHR_DF_CHANNEL_RGBSDA_BLUE), ech(3, K.KHR_DF_CHANNEL_RGBSDA_ALPHA)] };
  const ktx = K.write(c); fs.writeFileSync(path.join(sortie, 'damier-8x8-rgba8.ktx2'), ktx);
  // GLB : un plan 1 m × 1 m, UV, matériau avec la texture KTX2
  const glbAvecKtx2 = async (octets, nom) => {
    const doc = new Document(); doc.createExtension(KHRTextureBasisu).setRequired(true);
    const buffer = doc.createBuffer(), scene = doc.createScene(nom);
    const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5])).setBuffer(buffer), uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])).setBuffer(buffer), nor = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])).setBuffer(buffer), idx = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 2, 1, 0, 3, 2])).setBuffer(buffer);
    const tex = doc.createTexture(nom + '-texture').setImage(octets).setMimeType('image/ktx2');
    const mat = doc.createMaterial(nom).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.9);
    const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('TEXCOORD_0', uv).setAttribute('NORMAL', nor).setIndices(idx).setMaterial(mat);
    scene.addChild(doc.createNode('Plan texturé').setMesh(doc.createMesh('Plan').addPrimitive(prim)));
    await new NodeIO().registerExtensions([KHRTextureBasisu]).write(path.join(sortie, nom + '.glb'), doc);
  };
  await glbAvecKtx2(ktx, 'plan-ktx2-rgba8');
  // vrais fichiers Basis Universal (UASTC et ETC1S) des exemples de three.js (licence MIT) : téléchargés seulement avec --reseau, gardés ensuite dans le dossier d'essai
  if (process.argv.includes('--reseau')) for (const [src, nom] of [['2d_uastc.ktx2', 'plan-ktx2-uastc'], ['2d_etc1s.ktx2', 'plan-ktx2-etc1s']]) {
    const r = await fetch('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/compressed/' + src); if (!r.ok) { console.log('téléchargement impossible :', src, r.status); continue; }
    const o = new Uint8Array(await r.arrayBuffer()); fs.writeFileSync(path.join(sortie, src), o); await glbAvecKtx2(o, nom);
  }
} catch (e) { console.log('KTX2 ignoré :', e && e.message); }
console.log('fixtures FBX / KTX2 :', fs.readdirSync(sortie).filter(f => /fbx|ktx2/.test(f)).join(', '));
