/* Aide de test : charge three.js (copie du dossier galaxie/vendor), GLTFLoader et le décodeur Meshopt dans Node, puis lit les modèles d'anatomie (assets-lourds/anatomie/*.glb).
   Utilisée par les tests de mouvement qui ont besoin de la vraie géométrie (insertions des muscles, pénétrations os-os). */
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
const RACINE = new URL('../../../', import.meta.url);
const vendor = new URL('galaxie/vendor/', RACINE);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(new URL('three.module.min.js', vendor).href)}, shortCircuit: true }; if (s === 'three/addons/') return n(s, c); if (s.startsWith('three/addons/')) return { url: ${JSON.stringify(new URL('addons/', vendor).href)} + s.slice(13), shortCircuit: true }; return n(s, c); }`));
export const THREE = await import('three');
const { GLTFLoader } = await import(new URL('addons/loaders/GLTFLoader.js', vendor).href);
const { MeshoptDecoder } = await import(new URL('addons/libs/meshopt_decoder.module.js', vendor).href);
export const dossierModeles = fileURLDossier();
function fileURLDossier() { return new URL('assets-lourds/anatomie/', RACINE); }
export const modelesPresents = () => fs.existsSync(new URL('index.json', dossierModeles));
export const lireIndex = () => JSON.parse(fs.readFileSync(new URL('index.json', dossierModeles), 'utf8'));
export async function chargerGlb(nomFichier) {
  const buf = fs.readFileSync(new URL(nomFichier, dossierModeles)); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((ok, ko) => loader.parse(ab, '', g => ok(g.scene), ko));
}
void pathToFileURL;
