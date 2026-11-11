import fs from 'node:fs';
const f = 'core/intelligence/phrase.js';
let t = fs.readFileSync(f, 'utf8');
const lignes = t.split('\n'), sortie = [];
// début de blocs à retirer (la ligne de départ + les lignes jusqu'à la ligne « if(cmdX){ ... return; } » incluse)
const departs = [/^\s*const cmdMo=/, /^\s*\/\/ Terre 2\.0 \(PC\)/, /^\s*const cmdMu=/, /^\s*const cmdM=await commandeMars/, /^\s*const cmdF=window\.G1/];
for (let i = 0; i < lignes.length; i++) {
  const l = lignes[i];
  if (departs.some(r => r.test(l))) {
    let j = i;
    while (j < lignes.length && !/^\s*if\(cmd[A-Za-z0-9]+\)\{.*return;\s*\}\s*$/.test(lignes[j])) j++;
    // retire jusqu'à la ligne if(cmdX) incluse
    i = j; continue;
  }
  sortie.push(l);
}
fs.writeFileSync(f, sortie.join('\n'));
console.log('lignes retirées :', lignes.length - sortie.length);
