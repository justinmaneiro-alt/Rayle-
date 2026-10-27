// Écrit strategies/criteres-v3.json à partir de criteres-v3.js (source de vérité). Le test vérifie qu'ils sont identiques.
import fs from 'node:fs';
import { CRITERES3, empreinteV3 } from './criteres-v3.js';
const sortie = new URL('./criteres-v3.json', import.meta.url);
fs.writeFileSync(sortie, JSON.stringify({ empreinte: empreinteV3(), criteres: CRITERES3 }, null, 2) + '\n');
console.log('écrit', sortie.pathname, 'empreinte', empreinteV3());
