/* Essai réel de rayle-voix : node worker-voix/essai-reel.mjs [id-voix]
   Le code d'accès est lu dans la variable d'environnement RAYLE_TOKEN (jamais écrit dans un fichier).
   Écrit donnees-privees/essai-voix.wav et affiche le statut, le moteur utilisé et la taille. */
import fs from 'node:fs';
const token = process.env.RAYLE_TOKEN || '';
const id = process.argv[2] || 'gemini-h1';
if (!token) { console.log('RAYLE_TOKEN manquant'); process.exit(1); }
const t0 = Date.now();
const r = await fetch('https://rayle-voix.justinmaneiro.workers.dev/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Token': token }, body: JSON.stringify({ text: 'Bonjour, je suis Rayle. Voici votre point du jour.', id, ton: 'naturel', vitesse: 0 }) });
console.log('statut', r.status, '| ms', Date.now() - t0, '| moteur', r.headers.get('X-Rayle-Voix'), '| cache', r.headers.get('X-Rayle-Cache'));
if (!r.ok) { console.log((await r.text()).slice(0, 600)); process.exit(2); }
const b = Buffer.from(await r.arrayBuffer());
fs.mkdirSync('donnees-privees', { recursive: true }); fs.writeFileSync('donnees-privees/essai-voix.wav', b);
console.log('WAV', b.length, 'octets,', b.slice(0, 4).toString(), '~', (b.length / 48000).toFixed(1), 's → donnees-privees/essai-voix.wav');
