// Mesure le chargement de l'accueil sur un appareil émulé (médiane de 3 chargements). BASE=http://127.0.0.1:8010 node tests-navigateur/v7b-mesure.mjs telephone
import { ouvrirAppareil, galaxieChargee } from './v7b-aide.mjs';
const cle = process.argv[2] || 'telephone', res = [];
for (let i = 0; i < 3; i++) { const o = await ouvrirAppareil(cle, { attente: 1500 }); const t = await o.page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; }); res.push({ ...t, fichiers: o.requetes.length, octets: o.octets.total, galaxie: galaxieChargee(o.requetes).length }); await o.navigateur.close(); }
const med = k => res.map(r => r[k]).sort((a, b) => a - b)[1];
console.log(JSON.stringify({ appareil: cle, base: process.env.BASE || 'défaut', dcl_ms: med('dcl'), load_ms: med('load'), fichiers: med('fichiers'), ko: Math.round(med('octets') / 1024), fichiersGalaxieLourds: med('galaxie') }));
