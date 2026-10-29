// Écrit strategies/criteres-v4.json à partir de criteres-v4.js (source de vérité). Le test vérifie qu'ils sont identiques. Ne touche JAMAIS à criteres-v3.json.
import fs from 'node:fs';
import { CRITERES4, empreinteV4 } from './criteres-v4.js';
const sortie = new URL('./criteres-v4.json', import.meta.url);
fs.writeFileSync(sortie, JSON.stringify({ empreinte: empreinteV4(), criteres: CRITERES4 }, null, 2) + '\n');
console.log('écrit', sortie.pathname, 'empreinte', empreinteV4());
