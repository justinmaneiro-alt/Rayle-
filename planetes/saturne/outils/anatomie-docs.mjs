/* Génère docs/anatomie/os.md (fiches des os à relire et valider par Justin) à partir de la base de connaissances et de l'index. Usage : node anatomie-docs.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from './anatomie-sources.mjs';
import { creerIndex } from '../pc/anatomie-index.js';
import { fiche, A_VERIFIER } from '../pc/anatomie-savoirs.js';
const index = creerIndex(JSON.parse(fs.readFileSync(path.join(RACINE, 'assets-lourds/anatomie/index.json'), 'utf8')));
const os = index.deSysteme('os'), vus = new Set(), L = [];
L.push('# Anatomie : fiches des os (à relire et valider)', '', A_VERIFIER, '', 'Généré par `planetes/saturne/outils/anatomie-docs.mjs` à partir de `planetes/saturne/pc/anatomie-savoirs.js`. Niveaux : **élevée** = fiche rédigée pour cet os ; **générique** = règle commune (vertèbre, côte, métacarpien, métatarsien, phalange) ; **minimale** = nom seulement.', '', 'Justin doit relire chaque fiche « élevée » et « générique » avec son cours : ce sont des connaissances classiques rédigées sans manuel sous les yeux.', '');
const g = { élevée: [], générique: [], minimale: [] };
for (const p of os) { const f = fiche(p); const cle = f.confiance === 'élevée' ? f.nom_en.replace(/^(Left|Right) /, '') : f.confiance === 'générique' ? f.type + '|' + (f.nom_la || '').replace(/ [IVX]+.*$/, '') : f.nom_en; if (f.confiance === 'générique' ? vus.has(f.description) : vus.has(cle)) continue; if (f.confiance === 'générique') vus.add(f.description); vus.add(cle); g[f.confiance].push(f); }
for (const n of ['élevée', 'générique', 'minimale']) {
  L.push(`## Niveau ${n} (${g[n].length} entrées)`, '');
  for (const f of g[n]) { L.push(`### ${f.nom_fr} — ${f.nom_la || '?'}`, `*${f.region} · ${f.type}*`, ''); if (f.description) L.push(f.description, ''); if (f.reperes.length) L.push('- Repères : ' + f.reperes.join(', ')); if (f.articulations.length) L.push('- Articulations : ' + f.articulations.join(' ; ')); if (f.muscles.length) L.push('- Insertions musculaires : ' + f.muscles.join(' ; ')); if (f.clinique) L.push('- Clinique : ' + f.clinique); L.push(''); }
}
L.push('## Os absents du modèle', '', 'BodyParts3D ne contient pas : coccyx, os lacrymaux (2), cornets nasaux inférieurs (2), osselets de l’oreille (marteau, enclume, étrier). Ils ne sont donc ni affichés ni décrits. Le squelette compte 202 os modélisés (sésamoïdes du pied et os coxaux compris), contre ≈ 206 os dans l’anatomie classique.', '');
fs.mkdirSync(path.join(RACINE, 'docs/anatomie'), { recursive: true }); fs.writeFileSync(path.join(RACINE, 'docs/anatomie/os.md'), L.join('\n'));
console.log('docs/anatomie/os.md :', g.élevée.length, 'élevées,', g.générique.length, 'génériques,', g.minimale.length, 'minimales');

/* ── muscles ── */
import { MUSCLES, cleMuscle, TEXTE_ECHELLE } from '../pc/anatomie-muscles.js';
const mus = index.deSysteme('muscles').filter(p => p.type === 'muscle');
const M = ['# Anatomie : fiches des muscles (à relire et valider)', '', A_VERIFIER, '', 'Généré par `anatomie-docs.mjs` à partir de `planetes/saturne/pc/anatomie-muscles.js`. **Justin doit relire chaque fiche avec son cours** : origine, insertion, innervation, vascularisation, action, antagonistes, clinique sont rédigés de mémoire d’anatomie classique, sans manuel sous les yeux.', '', '## Cotation musculaire', '', TEXTE_ECHELLE, ''];
const couverts = new Set(mus.map(p => cleMuscle(p.nom_en)).filter(Boolean));
M.push(`## ${Object.keys(MUSCLES).length} fiches détaillées (couvrent ${mus.filter(p => cleMuscle(p.nom_en)).length} pièces sur ${mus.length})`, '');
for (const k of Object.keys(MUSCLES).sort()) { const mu = MUSCLES[k], p = mus.find(x => cleMuscle(x.nom_en) === k); M.push(`### ${(p.nom_fr || p.nom_en).replace(/ \((gauche|droit)\)$/, '')} — ${p.nom_la || k}`, `*${p.region}*`, '', `- Origine : ${mu.origine}`, `- Insertion : ${mu.insertion}`, `- Innervation : ${mu.innervation}`, `- Vascularisation : ${mu.vascularisation}`, `- Action : ${mu.action}`, `- Antagonistes : ${mu.antagonistes}`, `- Clinique : ${mu.clinique}`, ''); }
const sansFiche = [...new Set(mus.filter(p => !cleMuscle(p.nom_en)).map(p => p.nom_en.replace(/\b(left|right) /ig, '').replace(/ of (left|right)( |$)/, ' of $2').trim()))].sort();
M.push(`## Muscles du modèle sans fiche détaillée (${sansFiche.length} noms)`, '', 'Ils sont affichables (nom, région, couche estimée) mais n’ont pas de fiche : rien n’est inventé.', '', sansFiche.join(' ; '), '');
const attendus = { 'grand dorsal': /latissimus/, 'droit de l’abdomen': /rectus abdominis/, 'oblique interne': /internal oblique/, 'transverse de l’abdomen': /transversus abdominis/, 'carré des lombes': /quadratus lumborum/, 'masséter': /masseter/, 'temporal': /\btemporalis/, 'ptérygoïdiens': /pterygoid/, 'buccinateur': /buccinator/, 'orbiculaires': /orbicularis/, 'multifides': /multifid/ };
const absents = Object.entries(attendus).filter(([, r]) => !index.pieces.some(p => r.test(p.nom_en))).map(([n]) => n);
M.push('## Muscles importants ABSENTS du modèle', '', 'BodyParts3D (tel que simplifié par human-atlas) ne contient pas : ' + absents.join(', ') + '. Ils ne sont donc ni affichés ni décrits (le modèle compte ' + mus.length + ' pièces musculaires).', '');
fs.writeFileSync(path.join(RACINE, 'docs/anatomie/muscles.md'), M.join('\n'));
console.log('docs/anatomie/muscles.md :', Object.keys(MUSCLES).length, 'fiches ;', sansFiche.length, 'noms sans fiche ; absents :', absents.join(', '));

/* ── vaisseaux, encéphale, nerfs crâniens ── */
import { ARTERES, VEINES } from '../pc/anatomie-vaisseaux.js';
import { CERVEAU } from '../pc/anatomie-cerveau.js';
const V = ['# Anatomie : artères, veines, encéphale et nerfs crâniens (à relire et valider)', '', A_VERIFIER, '', 'Généré par `anatomie-docs.mjs`. **Justin doit relire chaque fiche avec son cours.** Limites du modèle : aucun nerf rachidien ni périphérique (médian, ulnaire, radial, sciatique…) ; système lymphatique réduit à la rate et au thymus ; moelle spinale réduite à son canal central ; seuls les nerfs de l’orbite sont présents parmi les nerfs crâniens. L’animation de flux est illustrative (sens exact, vitesse non mesurée).', ''];
for (const [t, d] of [['Artères', ARTERES], ['Veines', VEINES]]) { V.push('## ' + t + ' (' + Object.keys(d).length + ' fiches)', ''); for (const f of Object.values(d)) V.push('### ' + f.fr + ' — ' + f.la, '- Origine : ' + f.origine, '- Trajet : ' + f.trajet, '- Territoire : ' + f.territoire, '- Clinique : ' + f.clinique, ''); }
V.push('## Encéphale et nerfs crâniens de l’orbite (' + Object.keys(CERVEAU).length + ' fiches)', ''); for (const f of Object.values(CERVEAU)) V.push('### ' + f.fr + ' — ' + f.la, '- Rôle : ' + f.role, '- Situation : ' + f.rapports, '- Clinique : ' + f.clinique, '');
fs.writeFileSync(path.join(RACINE, 'docs/anatomie/vaisseaux-cerveau.md'), V.join(String.fromCharCode(10)));
console.log('docs/anatomie/vaisseaux-cerveau.md');

/* ── pathologies ── */
import { PATHOLOGIES as _P, AVERTISSEMENT as _AV } from '../pc/anatomie-pathologies-calcul.js';
const P = ['# Anatomie : pathologies et orthopédie (à relire et valider)', '', _AV, '', 'Généré par `anatomie-docs.mjs`. **Justin doit relire chaque fiche avec son cours** (classifications, repères chiffrés, appareillages).', ''];
for (const p of _P) { P.push('## ' + p.nom, '*' + p.categorie + ' · confiance : ' + p.confiance + '*', '', p.description, ''); for (const [k, t] of [['moignon', 'Moignon'], ['appareillage', 'Appareillage'], ['signes', 'Signes'], ['prise', 'Prise en charge'], ['complications', 'Complications'], ['classification', 'Classification'], ['points', 'Points de vigilance']]) if (p[k]) P.push('- ' + t + ' : ' + p[k]); P.push(''); }
fs.writeFileSync(path.join(RACINE, 'docs/anatomie/pathologies.md'), P.join(String.fromCharCode(10)));
console.log('docs/anatomie/pathologies.md');
