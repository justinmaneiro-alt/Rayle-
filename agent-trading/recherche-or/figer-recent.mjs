/* Fige l'étude « fenêtre récente » (variantes, grilles, critères, simulateur) AVANT tout calcul. */
import fs from 'node:fs'; import crypto from 'node:crypto'; import { SPECS_R, GRILLE_STOP, GRILLE_MECHE } from './familles-recent.mjs';
const sha = t => crypto.createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex'), lire = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8'), f = new URL('./liste-recent-figee.json', import.meta.url);
if (fs.existsSync(f)) { console.log('déjà figée :', JSON.parse(fs.readFileSync(f, 'utf8')).sha256_liste); process.exit(0); }
const o = { fige_le: '2026-11-10', nombre_variantes: SPECS_R.length, sha256_liste: sha(JSON.stringify({ SPECS_R, GRILLE_STOP, GRILLE_MECHE })), sha256_criteres: sha(lire('./criteres-recent.json')), sha256_familles: sha(lire('./familles-recent.mjs')), sha256_simulateur: sha(lire('./simulateur-recent.mjs')), variantes: SPECS_R };
fs.writeFileSync(f, JSON.stringify(o, null, 1)); console.log('figée', o.sha256_liste);
