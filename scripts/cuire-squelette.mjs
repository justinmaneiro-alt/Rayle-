// Ajoute à un GLB produit par convertir-squelette / lib-glb l'épiphyse et l'occlusion ambiante cuites (attribut _FIBRE) et le quantifie (KHR_mesh_quantization).
//   node scripts/cuire-squelette.mjs <entree.glb> [sortie.glb] [portee_m]
// Tous les nœuds s'occultent mutuellement (une côte ombre sa voisine, une vertèbre ombre son disque). Peut être relancé sur son propre résultat.
import fs from 'node:fs';
import { lireGLB, cuire, ecrireGLB, reparerNormales } from './lib-glb.mjs';
const [, , entree, sortie = entree, portee = '.04'] = process.argv;
if (!entree) { console.error('usage : node scripts/cuire-squelette.mjs <entree.glb> [sortie.glb] [portee_m]'); process.exit(1); }
const noeuds = lireGLB(fs.readFileSync(entree));
for (const n of noeuds) reparerNormales(n.nor, n.idx);
const aFaire = noeuds.filter(n => !n.fibre || process.env.REFAIRE);      // un nœud déjà cuit (attribut _FIBRE) n'est pas recalculé, sauf REFAIRE=1
if (aFaire.length) cuire(aFaire, { portee: +portee, cellule: +portee / 3, rayons: 20 });
const out = ecrireGLB(noeuds, { droits: process.env.DROITS || 'Armen Barsegyan (CGI Coffee), CC0 1.0 : https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model ; épiphyse et occlusion ambiante cuites par Rayle', generateur: 'Rayle scripts/cuire-squelette.mjs' });
fs.writeFileSync(sortie, out);
console.log(noeuds.length, 'nœuds,', noeuds.reduce((s, n) => s + n.pos.length / 3, 0), 'sommets,', (out.length / 1048576).toFixed(2), 'Mo →', sortie);
