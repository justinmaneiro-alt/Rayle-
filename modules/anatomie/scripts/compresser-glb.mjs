// Compresse les GLB de l'atlas anatomique avec EXT_meshopt_compression (décodé par three/addons/libs/meshopt_decoder.module.js dans modeles-glb.js) : les positions et normales sont quantifiées
// (KHR_mesh_quantization), les attributs propres à Raylé (_FIBRE : épiphyse et occlusion ; _SKI / _SKW : ancres de peau) sont conservés tels quels.
//   OUTILS=<dossier où ont été installés les paquets> node scripts/compresser-glb.mjs <entree.glb> [<sortie.glb>]      (sans sortie : le fichier est remplacé)
// Paquets (hors dépôt, ex. %TEMP%/gltfx) : npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
import fs from 'node:fs';
import { createRequire } from 'node:module';
const dossier = process.env.OUTILS, [entree, sortie = entree] = process.argv.slice(2);
if (!dossier || !entree) { console.error('usage : OUTILS=<dossier des paquets> node scripts/compresser-glb.mjs <entree.glb> [<sortie.glb>]'); process.exit(1); }
const req = createRequire(dossier.replace(/[\\/]$/, '') + '/package.json');
const { NodeIO } = req('@gltf-transform/core'), { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
const { meshopt } = req('@gltf-transform/functions'), { MeshoptEncoder, MeshoptDecoder } = req('meshoptimizer');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const avant = fs.statSync(entree).size;
const doc = await io.read(entree);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(sortie, doc);
console.log(entree, (avant / 1048576).toFixed(2), 'Mo →', sortie, (fs.statSync(sortie).size / 1048576).toFixed(2), 'Mo');
