/* Pose le sceau SHA-256 (fins de ligne normalisées) d'un module : node scripts-sceau.mjs front/or/xxx.js nom-version */
import fs from 'node:fs'; import crypto from 'node:crypto';
const [,, fichier, version] = process.argv; const s = fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
const sha = crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(fichier.replace(/\.js$/, '.sceau.json'), JSON.stringify({ version, scelle_le: new Date().toISOString().slice(0, 10), sha256: sha, note: 'Empreinte SHA-256 de ' + fichier.split('/').pop() + ' (fins de ligne normalisées), posée AVANT tout affichage.' }, null, 1));
console.log(sha);
