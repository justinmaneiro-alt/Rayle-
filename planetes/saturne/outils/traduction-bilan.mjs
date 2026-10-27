// Bilan de la traduction par règles : (1) validation contre les noms français OFFICIELS (TA2) que le modèle possède déjà, (2) pièces sans nom français : traduites / manquantes.
// Lancer :  node planetes/saturne/outils/traduction-bilan.mjs [--details]   (nécessite assets-lourds/anatomie/index.json)
import fs from 'node:fs';
import { traduireNom, nomLatinDeRepli } from '../pc/anatomie-traduction-calcul.js';
const idx = JSON.parse(fs.readFileSync(new URL('../../../assets-lourds/anatomie/index.json', import.meta.url), 'utf8'));
const detail = process.argv.includes('--details');
const norme = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
// (1) validation : pièces dont le nom français est officiel
let tot = 0, traduites = 0, egales = 0; const diff = [], echecs = new Map();
for (const p of idx.pieces) {
  if (!p.nom_fr || !p.nom_en || p.traduction === 'absente' || p.traduction === 'regle') continue; tot++;
  const r = traduireNom(p.nom_en); if (!r.fr) { for (const m of r.manques) echecs.set(m, (echecs.get(m) || 0) + 1); continue; }
  traduites++;
  const brut = p.nom_fr.replace(/\s+(droit|droite|gauche)$/i, '');
  if (norme(r.fr).replace(/ (droite?s?|gauches?)$/, '') === norme(brut) || norme(r.fr) === norme(p.nom_fr)) egales++; else diff.push([p.nom_en, p.nom_fr, r.fr]);
}
console.log('VALIDATION contre ' + tot + ' noms français officiels : ' + traduites + ' traduisibles par le lexique, dont ' + egales + ' identiques (' + (traduites ? Math.round(100 * egales / traduites) : 0) + ' %)');
if (detail) { console.log('— différences (officiel ≠ règles) —'); for (const d of diff.slice(0, 60)) console.log('  ' + d[0] + '\n     officiel : ' + d[1] + '\n     règles   : ' + d[2]); }
// (2) pièces sans nom français
let ok = 0, latin = 0, rien = 0; const manquesGlobal = new Map(), sansTrad = [];
for (const p of idx.pieces) {
  if (p.traduction !== 'absente') continue; const r = traduireNom(p.nom_en);
  if (r.fr) ok++; else { const l = nomLatinDeRepli(p.nom_en); if (l) latin++; else { rien++; sansTrad.push(p.nom_en + '  ← ' + r.manques.join(' ; ')); } for (const m of r.manques) manquesGlobal.set(m, (manquesGlobal.get(m) || 0) + 1); }
}
console.log('PIÈCES SANS NOM FRANÇAIS : ' + (ok + latin + rien) + ' · traduites ' + ok + ' · nom latin de repli ' + latin + ' · non traduites ' + rien);
console.log('mots / structures manquants (par fréquence) :', [...manquesGlobal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(x => x[0] + ':' + x[1]).join(' · '));
if (detail) console.log([...new Set(sansTrad)].slice(0, 80).join('\n'));
