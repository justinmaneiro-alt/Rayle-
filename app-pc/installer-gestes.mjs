// Télécharge les fichiers de MediaPipe Hands dans assets-lourds/gestes/ (dossier exclu de git) et vérifie leur empreinte SHA-256.
//   node app-pc/installer-gestes.mjs
// MediaPipe Tasks Vision 0.10.21 (Apache-2.0, Google) : bundle JavaScript + WebAssembly depuis jsDelivr (paquet npm @mediapipe/tasks-vision) et modèle « hand_landmarker.task » (float16) depuis le
// stockage officiel des modèles MediaPipe. Après l'installation, plus aucun appel Internet : la page du PC et la page du téléphone lisent ces fichiers sur ce PC.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DEST = path.join(RACINE, 'assets-lourds', 'gestes'), V = '0.10.21';
const NPM = f => 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + V + '/' + f;
export const FICHIERS = [
  { f: 'vision_bundle.mjs', url: NPM('vision_bundle.mjs'), sha: '40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c' },
  { f: 'wasm/vision_wasm_internal.js', url: NPM('wasm/vision_wasm_internal.js'), sha: '4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb' },
  { f: 'wasm/vision_wasm_internal.wasm', url: NPM('wasm/vision_wasm_internal.wasm'), sha: 'f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7' },
  { f: 'wasm/vision_wasm_nosimd_internal.js', url: NPM('wasm/vision_wasm_nosimd_internal.js'), sha: '927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f' },
  { f: 'wasm/vision_wasm_nosimd_internal.wasm', url: NPM('wasm/vision_wasm_nosimd_internal.wasm'), sha: '3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4' },
  { f: 'hand_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', sha: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1' }
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
let mal = 0;
for (const { f, url, sha: attendu } of FICHIERS) {
  const cible = path.join(DEST, f);
  if (fs.existsSync(cible) && sha(fs.readFileSync(cible)) === attendu) { console.log('déjà là     ', f); continue; }
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  const r = await fetch(url).catch(e => ({ ok: false, status: String(e.message) }));
  if (!r.ok) { console.log('ÉCHEC       ', f, '(' + r.status + ')'); mal++; continue; }
  const b = Buffer.from(await r.arrayBuffer());
  if (sha(b) !== attendu) { console.log('EMPREINTE   ', f, ': le fichier reçu n’est pas celui attendu, non enregistré'); mal++; continue; }
  fs.writeFileSync(cible, b); console.log('installé    ', f, Math.round(b.length / 1024) + ' Ko');
}
console.log(mal ? mal + ' fichier(s) manquant(s) : relance, ou télécharge-les à la main (voir docs/GESTES.md).' : 'Gestes prêts : ' + DEST);
process.exit(mal ? 1 : 0);
