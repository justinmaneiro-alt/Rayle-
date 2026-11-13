/* Garde la sauvegarde « Direct (v7 validée) » : les copies archivées correspondent à SHA256SUMS.txt, les modules vivants de la v7 sont identiques aux copies,
   et la v7 produit la même liste de flèches que le jour de la sauvegarde.   node agent-trading/tests/direct-v7-valide-test.mjs */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { L } from '../archives/direct-v7-valide/liste-reference.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), A = path.join(ici, '..', 'archives', 'direct-v7-valide'), vivant = path.join(ici, '..', 'front', 'or');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for (const l of fs.readFileSync(path.join(A, 'SHA256SUMS.txt'), 'utf8').split('\n').filter(Boolean)) { const [h, f] = l.split(/\s+\*?/); v('archive intacte : ' + f, sha(path.join(A, f)) === h); }
for (const f of ['fleches-simples-v7.js', 'fleches-simples-v6.js', 'zones-direct.js', 'signal-niveaux.js']) v('module vivant identique à l\'archive : ' + f, sha(path.join(vivant, f)) === sha(path.join(A, 'front/or', f)), 'la v7 validée a changé');
const ref = JSON.parse(fs.readFileSync(path.join(A, 'liste-reference.json'), 'utf8'));
v('liste de flèches v7 identique à celle de la sauvegarde (' + ref['flèches'].length + ')', JSON.stringify(L) === JSON.stringify(ref['flèches']));
console.log(`direct-v7-valide : ${ok} ok, ${ko} échecs`); process.exit(ko ? 1 : 0);
