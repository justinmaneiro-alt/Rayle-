/* Fige la liste « gros mouvements » (24 variantes) + critères + sources de calcul, AVANT tout calcul de rendement. */
import fs from 'node:fs'; import crypto from 'node:crypto'; import { SPECS_GROS } from './familles-gros.mjs';
const sha = t => crypto.createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex'), lire = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8'), f = new URL('./liste-gros-figee.json', import.meta.url);
if (fs.existsSync(f)) { console.log('déjà figée :', JSON.parse(fs.readFileSync(f, 'utf8')).sha256_liste); process.exit(0); }
const o = { fige_le: '2026-11-10', nombre_variantes: SPECS_GROS.length, sha256_liste: sha(JSON.stringify(SPECS_GROS)), sha256_criteres: sha(lire('./criteres-gros.json')), sha256_familles_gros: sha(lire('./familles-gros.mjs')), sha256_simulateur_gros: sha(lire('./simulateur-gros.mjs')), sha256_liste_precedente: JSON.parse(lire('./liste-figee.json')).sha256_liste, variantes: SPECS_GROS };
fs.writeFileSync(f, JSON.stringify(o, null, 1)); console.log(SPECS_GROS.length, 'variantes figées', o.sha256_liste);
