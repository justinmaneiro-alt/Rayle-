// Allège un GLB pour une tablette : décompresse Draco, soude et simplifie les maillages (meshoptimizer), réduit les textures (WebP), retire les animations et les extensions coûteuses
// (transmission, vernis, brillance), puis recompresse les maillages (EXT_meshopt_compression, décodé par three/addons/libs/meshopt_decoder.module.js).
//   OUTILS=<dossier où ont été installés les paquets> node scripts/optimiser-glb.mjs <entree.glb> <sortie.glb> [--tris 30000] [--tex 512] [--sans-textures]
//   --retirer nom1,nom2   supprime des nœuds (pièces égarées dont la place était donnée par une animation)
//   --axes zxy               réoriente : nouveaux axes (x', y', z') = anciens axes (z, x, y), permutation circulaire seulement (rotation propre)
// Paquets (hors dépôt, ex. %TEMP%/gltfx) : npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer draco3dgltf sharp
import fs from 'node:fs';
import { createRequire } from 'node:module';
const dossier = process.env.OUTILS;
const args = process.argv.slice(2), val = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const [entree, sortie] = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a));
if (!dossier || !entree || !sortie) { console.error('usage : OUTILS=<dossier des paquets> node scripts/optimiser-glb.mjs <entree.glb> <sortie.glb> [--tris N] [--tex px] [--sans-textures]'); process.exit(1); }
const req = createRequire(dossier.replace(/[\\/]$/, '') + '/package.json');
const { NodeIO } = req('@gltf-transform/core'), { ALL_EXTENSIONS, EXTMeshoptCompression } = req('@gltf-transform/extensions');
const { dedup, prune, weld, simplify, textureCompress, flatten, join, resample, quantize, getSceneVertexCount } = req('@gltf-transform/functions');
const draco3d = req('draco3dgltf'), { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = req('meshoptimizer'), sharp = req('sharp');

const cible = +val('--tris', 30000), taille = +val('--tex', 512);
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(entree);
const root = doc.getRoot();
for (const nom of (val('--retirer', '') || '').split(',').filter(Boolean)) root.listNodes().filter(n => n.getName() === nom).forEach(n => { const m = n.getMesh(); n.dispose(); if (m) m.dispose(); });
const axes = val('--axes', '');
if (axes) {                                                  // matrice de permutation circulaire appliquée aux nœuds racines (xyz → axes demandés)
  const idx = axes.split('').map(c => 'xyz'.indexOf(c));
  if (idx.some(i => i < 0) || new Set(idx).size !== 3 || !['0,1,2', '1,2,0', '2,0,1'].includes(idx.join(','))) throw new Error('--axes : permutation circulaire attendue (xyz, yzx, zxy)');
  const P = new Array(16).fill(0); P[15] = 1; idx.forEach((src, dst) => { P[src * 4 + dst] = 1; });      // colonne-majeure : x' = ancien axe idx[0]…
  const mul = (a, b) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k]; return r; };
  for (const sc of root.listScenes()) for (const n of sc.listChildren()) n.setMatrix(mul(P, n.getMatrix()));
}
const triangles = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const avant = triangles();
root.listAnimations().forEach(a => a.dispose());
for (const nom of ['KHR_draco_mesh_compression', 'KHR_materials_transmission', 'KHR_materials_clearcoat', 'KHR_materials_specular', 'KHR_materials_sheen', 'KHR_materials_volume', 'KHR_materials_ior']) {
  const e = root.listExtensionsUsed().find(x => x.extensionName === nom); if (e) e.dispose();
}
await doc.transform(dedup(), prune(), flatten(), join(), weld());
const ratio = Math.min(1, cible / Math.max(1, triangles()));
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: .02, lockBorder: false }));
if (!args.includes('--sans-textures')) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [taille, taille], quality: 70 }));
await doc.transform(prune(), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(sortie, doc);
console.log(entree, ':', Math.round(avant), '→', Math.round(triangles()), 'triangles ;', (fs.statSync(entree).size / 1e6).toFixed(2), '→', (fs.statSync(sortie).size / 1e6).toFixed(2), 'Mo ;', root.listTextures().length, 'textures');
