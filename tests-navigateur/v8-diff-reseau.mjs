// V8 : liste des fichiers demandés au chargement mobile (avec poids) ; BASE=… pour l'ancienne version. node tests-navigateur/v8-diff-reseau.mjs > liste.json
import fs from 'node:fs';
const { ouvrirMobile, attendre } = await import('./v8-aide.mjs');
const o = await ouvrirMobile('telephone', { attente: 6000 });
fs.writeFileSync(process.argv[2] || 'docs/reseau-mobile.json', JSON.stringify(o.requetes.map(r => [r.url.split('?')[0], r.octets]), null, 0));
await o.fermer();
