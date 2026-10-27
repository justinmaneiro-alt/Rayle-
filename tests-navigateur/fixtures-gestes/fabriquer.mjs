// Fabrique les suites de repères de test (SYNTHÉTIQUES : core/gestes/main-synthetique.js, pas de vraie caméra). Format identique à ce qu'enregistre le bouton « Enregistrer » de l'écran des gestes :
// { origine, ips, ratio, frames: [{ t (ms), ratio, mains: [{ lat: 'Left'|'Right', pts: [[x, y, z] × 21] }] }] }  — coordonnées normalisées de l'image NON miroir.
// Lancer : node tests-navigateur/fixtures-gestes/fabriquer.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = createRequire(import.meta.url)('../../core/gestes/main-synthetique.js');
const ecrire = (nom, frames) => fs.writeFileSync(path.join(ici, nom), JSON.stringify({ origine: 'synthétique', ips: H.IPS, ratio: 4 / 3, frames }));
ecrire('clic.json', H.suites.pincer(0.1));
ecrire('saisie.json', H.suites.saisir(0.5, 0.25, 0.1, 0.7));
ecrire('zoom-deux-mains.json', H.suites.deuxPincesEcart(0.2, 0.55, 1));
ecrire('balayage.json', H.suites.balayage(0.25, 0.8, 0.35));
ecrire('rotation-deux-mains.json', H.suites.deuxOuvertesRotation(0, 0.9, 1));
ecrire('tremblement.json', H.suites.immobile('pointer', 1.5, { bruit: 0.0015, alea: H.alea(7) }));
ecrire('pointer-droite.json', H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1.2));
ecrire('deux-poings.json', H.suites.deuxPoings(2));
console.log('suites écrites :', fs.readdirSync(ici).filter(f => f.endsWith('.json')).join(', '));
