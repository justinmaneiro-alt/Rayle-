/* Fige la liste fermée des variantes + les critères + le découpage : écrit liste-figee.json avec les SHA-256. À lancer UNE fois, AVANT tout test.
   recherche.mjs refuse de tourner si les empreintes ne correspondent plus (liste ou critères modifiés après coup). */
import fs from 'node:fs'; import crypto from 'node:crypto'; import { SPECS } from './familles.mjs';
const sha = t => crypto.createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex');
const lire = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const f = new URL('./liste-figee.json', import.meta.url);
if (fs.existsSync(f) && !process.argv.includes('--forcer')) { console.log('liste déjà figée :', JSON.parse(fs.readFileSync(f, 'utf8')).sha256_liste); process.exit(0); }
const liste = JSON.stringify(SPECS);
const obj = { fige_le: '2026-11-10', nombre_variantes: SPECS.length, sha256_liste: sha(liste), sha256_criteres: sha(lire('./criteres.json')), sha256_decoupage: sha(lire('./decoupage.json')), sha256_familles_source: sha(lire('./familles.mjs')), sha256_simulateur: sha(lire('./simulateur.mjs')), variantes: SPECS };
fs.writeFileSync(f, JSON.stringify(obj, null, 1)); console.log(SPECS.length, 'variantes figées', obj.sha256_liste);
