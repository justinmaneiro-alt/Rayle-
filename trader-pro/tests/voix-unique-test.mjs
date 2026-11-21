/* v8 phase 1 : aucune voix du système dans le code. Échoue si SpeechSynthesisUtterance ou speechSynthesis.speak apparaît dans un fichier de l'application.
   Usage : node trader-pro/tests/voix-unique-test.mjs */
import fs from 'node:fs'; import path from 'node:path';
const RACINES = ['core', 'agent-trading', 'trader-pro', 'galaxie', 'planetes', 'marches', 'js', 'app-pc', 'index.html', 'modules-rayle'];
const IGNORER = new RegExp(['node_modules', '/vendor/', '/tests?/', 'tests-navigateur', 'donnees-privees', '/dist/', '[.]git/', 'captures'].join('|'));
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const fichiers = []; const marcher = p => { p = p.split(path.sep).join('/'); if (!fs.existsSync(p) || IGNORER.test(p)) return; const st = fs.statSync(p); if (st.isDirectory()) { for (const f of fs.readdirSync(p)) marcher(path.join(p, f)); } else if (/\.(js|mjs|html)$/.test(p)) fichiers.push(p); };
RACINES.forEach(marcher);
const fautifs = []; for (const f of fichiers) { const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); if (/SpeechSynthesisUtterance|speechSynthesis\s*\.\s*speak|browserSpeak/.test(s)) fautifs.push(f); }
v('aucun appel à la voix du système dans ' + fichiers.length + ' fichiers', fautifs.length === 0, fautifs.join(', '));
const voix = fs.readFileSync('core/voice/voix.js', 'utf8');
v('une seule fonction de parole : speak, avec file unique (jeton) et anti-doublon', /speakToken/.test(voix) && /derniereCle/.test(voix));
v('en cas d échec : indicateur « voix momentanément indisponible », pas de repli', /voix momentanément indisponible/.test(voix) && !/voix du système/.test(voix.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
