import fs from 'node:fs';
const f = 'index.html';
const lignes = fs.readFileSync(f, 'utf8').split('\n');
const RETIRE = [
  /(?:src|href)="core\/multi\//, /(?:src|href)="core\/gestes\//, /(?:src|href)="camera\//, /(?:src|href)="core\/vr\//, /(?:src|href)="core\/mobile\//,
  /(?:src|href)="core\/commun\/(?:telecommande|carte-pad|interrupteur-ancien|g1-|graphique-bougies|media-pont|jarvis-bureau|appareil-ui|liquidite-voix)/,
  /document\.write\('<script src="core\/(?:gestes|mobile)\//,
  /document\.write\('<script src="core\/vr\//
];
const sortie = lignes.filter(l => !RETIRE.some(r => r.test(l)));
fs.writeFileSync(f, sortie.join('\n'));
console.log('lignes retirées :', lignes.length - sortie.length);
console.log(lignes.filter(l => RETIRE.some(r => r.test(l))).map(l => l.trim().slice(0, 90)).join('\n'));
