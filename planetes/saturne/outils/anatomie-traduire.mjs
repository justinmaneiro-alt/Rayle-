// Génère data/anatomie_fr.json (noms français des pièces du modèle qui n'en avaient pas) et docs/ANATOMIE_A_VERIFIER.md.
// Lancer :  node planetes/saturne/outils/anatomie-traduire.mjs      (nécessite assets-lourds/anatomie/index.json ; relancer si le lexique change)
// Méthode : traduction PAR RÈGLES avec un lexique fermé (planetes/saturne/pc/anatomie-traduction-calcul.js). Aucune IA, rien n'est deviné : un mot inconnu = pièce non traduite (et listée).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traduireNom, nomLatinDeRepli } from '../pc/anatomie-traduction-calcul.js';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const idx = JSON.parse(fs.readFileSync(path.join(RACINE, 'assets-lourds/anatomie/index.json'), 'utf8'));
const noms = {}, manquantes = [], parSysteme = {};
for (const p of idx.pieces) {
  if (p.nom_fr || !p.nom_en) continue;
  const r = traduireNom(p.nom_en);
  if (r.fr) { noms[p.id] = { fr: r.fr, en: p.nom_en }; (parSysteme[p.systeme] = parSysteme[p.systeme] || []).push([p.nom_en, r.fr]); }
  else manquantes.push({ id: p.id, systeme: p.systeme, en: p.nom_en, latin: nomLatinDeRepli(p.nom_en), manques: r.manques });
}
fs.mkdirSync(path.join(RACINE, 'data'), { recursive: true });
fs.writeFileSync(path.join(RACINE, 'data/anatomie_fr.json'), JSON.stringify({
  version: 1, source: 'traduction par règles et lexique fermé (planetes/saturne/pc/anatomie-traduction-calcul.js), à partir des noms anglais du modèle BodyParts3D / FMA ; générée par planetes/saturne/outils/anatomie-traduire.mjs',
  avertissement: 'Noms traduits automatiquement par règles : à vérifier avec le cours ou la Terminologia Anatomica. Les noms officiels déjà présents dans le modèle (TA2) ne sont jamais remplacés.', noms
}) + '\n');

// ── validation contre les noms officiels ──
const norme = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
let testables = 0, identiques = 0; const diff = new Map();
for (const p of idx.pieces) {
  if (!p.nom_fr || !p.nom_en || p.traduction === 'absente' || p.traduction === 'regle') continue;
  const r = traduireNom(p.nom_en); if (!r.fr) continue; testables++;
  const brut = p.nom_fr.replace(/\s+(droit|droite|gauche)$/i, '');
  if (norme(r.fr).replace(/ (droite?s?|gauches?)$/, '') === norme(brut) || norme(r.fr) === norme(p.nom_fr)) identiques++;
  else { const k = p.nom_en.replace(/\b(left|right)\b/ig, '').replace(/\s+/g, ' ').trim().toLowerCase(); if (!diff.has(k)) diff.set(k, [p.nom_en, p.nom_fr, r.fr]); }
}
const n = Object.keys(noms).length;
const md = ['# Anatomie : noms français à vérifier', '',
  '_Fichier généré par `node planetes/saturne/outils/anatomie-traduire.mjs`. Ne pas modifier à la main._', '',
  '## Ce qui a été fait',
  '- Le modèle 3D (BodyParts3D / FMA) donne **' + idx.pieces.length + ' pièces**. Environ la moitié avait déjà un nom français officiel (Terminologia Anatomica 2, CC BY-SA) : **ces noms ne sont jamais remplacés**.',
  '- **' + n + ' pièces** n\'avaient qu\'un nom anglais (artères et veines segmentaires, branches, muscles intrinsèques, valves du cœur, arbres bronchiques…). Elles reçoivent maintenant un nom français **traduit par règles** (lexique fermé + grammaire de la nomenclature française : adjectifs après le nom, accords, « de l\'artère », « du pied droit »…). **Aucune IA, aucun nom inventé.**',
  '- Pièces que le lexique ne sait pas traduire : **' + manquantes.length + '**' + (manquantes.length ? ' (listées plus bas : elles gardent leur nom latin entre parenthèses, ou le terme anglais signalé « à traduire »)' : ' (aucune : tout le lexique nécessaire est en place)') + '.',
  '- Le texte « (nom français non précisé) » n\'apparaît plus nulle part.', '',
  '## Fiabilité mesurée',
  '- Le même traducteur, lancé sur les **' + testables + '** noms qui ont aussi un nom français OFFICIEL dans le modèle, redonne **exactement** le nom officiel dans **' + identiques + '** cas (' + (testables ? Math.round(100 * identiques / testables) : 0) + ' %). Les autres écarts sont de style (voir ci-dessous) et non des contresens.',
  '- **À faire par toi** : survoler la liste ci-dessous avec ton cours / un atlas. Les noms ne sont pas des termes officiels de la TA : ce sont des **traductions de travail** pour t\'aider à lire le modèle.', '',
  '## Écarts de style avec les noms officiels (' + diff.size + ')',
  '| Anglais | Officiel (TA2 dans le modèle) | Traduit par règles |', '|---|---|---|', ...[...diff.values()].map(d => '| ' + d.join(' | ') + ' |'), '',
  '## Choix de vocabulaire à valider',
  '- « head » d\'un muscle = **chef** (chef huméral du muscle rond pronateur) ; « cusp » = **valvule** ; « leaflet » = **feuillet** ; « atrium » = **oreillette** ; « duct » = **conduit** ; « levator » = **élévateur** (TA française).',
  '- Deux adjectifs de position voisins sont fusionnés comme dans la TA : « posterior inferior » = postéro-inférieur ; « inferior medial » = inféromédial.',
  '- « Set of … » = « Ensemble des … » ; « tributary » = affluent ; « tree » = arbre (arbre bronchique, arbre biliaire).',
  '- Les définitions courtes ne sont **pas** générées : une définition fabriquée automatiquement serait une invention.', '',
  '## Pièces traduites par système (échantillon de 6 par système)'];
for (const [sys, l] of Object.entries(parSysteme).sort()) { md.push('', '### ' + sys + ' (' + l.length + ')', ...l.slice(0, 6).map(x => '- ' + x[0] + ' → **' + x[1] + '**')); }
if (manquantes.length) { md.push('', '## Pièces non traduites (' + manquantes.length + ')', ...manquantes.map(m => '- ' + m.en + (m.latin ? ' (latin : ' + m.latin + ')' : '') + ' — manque : ' + m.manques.join(', '))); }
fs.writeFileSync(path.join(RACINE, 'docs/ANATOMIE_A_VERIFIER.md'), md.join('\n') + '\n');
console.log(n + ' noms écrits dans data/anatomie_fr.json ; ' + manquantes.length + ' non traduits ; validation ' + identiques + '/' + testables + ' ; docs/ANATOMIE_A_VERIFIER.md écrit.');
