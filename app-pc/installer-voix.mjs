/* Installe la voix locale de Raylé (gratuite, hors ligne) : Kokoro et Piper. À lancer UNE fois :  node app-pc/installer-voix.mjs
   · crée un environnement Python privé dans assets-lourds/voix/py (rien n'est installé ailleurs sur le PC) ;
   · télécharge les modèles une seule fois dans assets-lourds/voix/modeles (≈ 260 Mo) : ensuite plus aucun accès au réseau ;
   · sans danger si relancé : ce qui est déjà là n'est pas retéléchargé.
   Options : --sans-jessica (n'installe pas la voix Piper « Jessica » : −77 Mo). Licences : NOTICE.md. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'assets-lourds', 'voix');
const MODELES = path.join(DOSSIER, 'modeles');
const PY = path.join(DOSSIER, 'py', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const SANS_JESSICA = process.argv.includes('--sans-jessica');

const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/';
const KO = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/';
const FICHIERS = [
  ['kokoro-v1.0.int8.onnx', KO + 'kokoro-v1.0.int8.onnx', 92361271],
  ['voices-v1.0.bin', KO + 'voices-v1.0.bin', 28214398],
  ['fr_FR-siwis-medium.onnx', HF + 'siwis/medium/fr_FR-siwis-medium.onnx', 63221984],
  ['fr_FR-siwis-medium.onnx.json', HF + 'siwis/medium/fr_FR-siwis-medium.onnx.json', null],
  ...(SANS_JESSICA ? [] : [
    ['fr_FR-upmc-medium.onnx', HF + 'upmc/medium/fr_FR-upmc-medium.onnx', 76733615],
    ['fr_FR-upmc-medium.onnx.json', HF + 'upmc/medium/fr_FR-upmc-medium.onnx.json', null]
  ])
];

function lancer(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) throw new Error(cmd + ' ' + args.join(' ') + ' : code ' + r.status);
}

async function telecharger([nom, url, taille]) {
  const cible = path.join(MODELES, nom);
  if (fs.existsSync(cible) && (taille == null || fs.statSync(cible).size === taille)) { console.log('  déjà là : ' + nom); return; }
  console.log('  téléchargement : ' + nom + (taille ? ' (' + Math.round(taille / 1e6) + ' Mo)' : ''));
  const rep = await fetch(url, { redirect: 'follow' });
  if (!rep.ok) throw new Error(nom + ' : HTTP ' + rep.status);
  const tmp = cible + '.partiel';
  await pipeline(Readable.fromWeb(rep.body), fs.createWriteStream(tmp));
  if (taille != null && fs.statSync(tmp).size !== taille) throw new Error(nom + ' : taille inattendue (téléchargement incomplet ?)');
  fs.renameSync(tmp, cible);
}

console.log('Voix locale de Raylé : installation (une seule fois)');
fs.mkdirSync(MODELES, { recursive: true });
if (!fs.existsSync(PY)) {
  console.log('1/3 environnement Python privé…');
  const sys = process.platform === 'win32' ? ['py', ['-3', '-m', 'venv', path.join(DOSSIER, 'py')]] : ['python3', ['-m', 'venv', path.join(DOSSIER, 'py')]];
  try { lancer(sys[0], sys[1]); } catch (e) { lancer('python', ['-m', 'venv', path.join(DOSSIER, 'py')]); }
} else console.log('1/3 environnement Python privé : déjà là');
console.log('2/3 bibliothèques (kokoro-onnx, piper-tts)…');
lancer(PY, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'kokoro-onnx', 'piper-tts', 'soundfile', 'numpy']);
console.log('3/3 modèles de voix…');
for (const f of FICHIERS) await telecharger(f);
console.log('Terminé. Au prochain lancement de Raylé, la voix locale est utilisée (⚙ Voix de Raylé pour choisir).');
