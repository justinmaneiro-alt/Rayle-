/* Calibration des pivots articulaires (hors site, une fois) : node planetes/saturne/outils/calibrer-pivots.mjs
   Les pivots du corps articulé sont d'abord ESTIMÉS (bornes des os ; centre des têtes du fémur et de l'humérus par ajustement de sphère, anatomie-corps.js). Ce script les affine par une
   recherche locale (descente par coordonnées) qui minimise l'enfoncement d'un os dans l'os voisin pendant des mouvements d'essai de l'articulation (flexion, abduction, rotation…),
   mesuré sur les triangles réels du modèle (anatomie-collision-calcul.js). Les décalages obtenus (≤ 2 cm, ≤ 1,2 cm pour les rotules hanche et épaule) sont écrits dans
   planetes/saturne/pc/anatomie-pivots.js (données générées : mesures réelles seulement). Ce n'est PAS un ajustement esthétique : seule la géométrie du modèle sert de critère. */
import fs from 'node:fs';
import { chargerGeometrie, preparerCollisions } from '../tests/aide-geometrie.mjs';
import { creerCinematique } from '../pc/anatomie-cinematique.js';
import { INDEX_SEG } from '../pc/anatomie-corps.js';

const G = await chargerGeometrie({ decalages: null }), { corps } = G; const C = creerCinematique(corps);
console.log('têtes ajustées (sphères) :', Object.entries(corps.tetes).map(([k, t]) => k + ' r=' + (t.rayon * 1000).toFixed(1) + ' mm c=' + t.centre.map(x => x.toFixed(3)).join(',')).join(' | '));
const COL = await preparerCollisions(G, { pas: 2 }); console.log('collisions :', COL.maillages.length, 'os,', COL.candidats.length, 'sommets de contact');
const S2 = ['D', 'G'], ARTS = [];
for (const S of S2) {
  ARTS.push({ nom: 'hanche' + S, a: 'cuisse' + S, b: 'bassin', poses: [{ ['hanche' + S]: { fl: 90 } }, { ['hanche' + S]: { fl: -20 } }, { ['hanche' + S]: { ab: 35 } }, { ['hanche' + S]: { ab: -20 } }, { ['hanche' + S]: { rot: 35 } }, { ['hanche' + S]: { rot: -30 } }, { ['hanche' + S]: { fl: 60, ab: 20 } }] });
  ARTS.push({ nom: 'genou' + S, a: 'jambe' + S, b: 'cuisse' + S, poses: [{ ['genou' + S]: { fl: 60 } }, { ['genou' + S]: { fl: 120 } }] });
  ARTS.push({ nom: 'cheville' + S, a: 'pied' + S, b: 'jambe' + S, poses: [{ ['cheville' + S]: { fl: 20 } }, { ['cheville' + S]: { fl: -35 } }] });
  ARTS.push({ nom: 'epaule' + S, a: 'bras' + S, b: 'scap' + S, poses: [{ ['epaule' + S]: { plan: 0, ele: 90 } }, { ['epaule' + S]: { plan: 90, ele: 90 } }, { ['epaule' + S]: { plan: 0, ele: 150 } }, { ['epaule' + S]: { plan: 90, ele: 60, rot: 50 } }, { ['epaule' + S]: { plan: 45, ele: 120, rot: -40 } }] });
  ARTS.push({ nom: 'coude' + S, a: 'avantbras' + S, b: 'bras' + S, poses: [{ ['coude' + S]: { fl: 60 } }, { ['coude' + S]: { fl: 130 } }, { ['coude' + S]: { fl: 90, pro: 60 } }] });
  ARTS.push({ nom: 'poignet' + S, a: 'main' + S, b: 'avantbras' + S, poses: [{ ['poignet' + S]: { fl: 60 } }, { ['poignet' + S]: { fl: -50 } }, { ['poignet' + S]: { dev: 20 } }] });
}
ARTS.push({ nom: 'lombo-sacree', a: 'lombaire', b: 'bassin', poses: [{ lombaire: { fl: 30 } }, { lombaire: { fl: -15 } }, { lombaire: { rot: 10 } }] });
ARTS.push({ nom: 'toracolombaire', a: 'tronc', b: 'lombaire', poses: [{ tronc: { fl: 15 } }, { tronc: { rot: 30 } }, { tronc: { ab: 15 } }] });
ARTS.push({ nom: 'cervicale', a: 'tete', b: 'tronc', poses: [{ tete: { fl: 40 } }, { tete: { rot: 60 } }, { tete: { ab: 30 } }, { tete: { fl: -40 } }] });

const decalages = {};
for (const art of ARTS) {
  const origine = corps.pivots[art.nom].slice(), seg = new Set([INDEX_SEG[art.a], INDEX_SEG[art.b]]), repos = COL.evaluer(COL.reposT, { segments: seg });
  const borne = /^(hanche|epaule)/.test(art.nom) ? 0.012 : 0.02;
  const evaluer = off => {
    corps.pivots[art.nom] = [origine[0] + off[0], origine[1] + off[1], origine[2] + off[2]]; let pire = 0;
    for (const j of art.poses) { const r = C.poser({ joints: j }), T = Object.keys(r.T).length ? C.segments.map(s => r.T[s]) : null, e = COL.evaluer(T, { segments: seg }); for (let i = 0; i < e.depth.length; i++) pire = Math.max(pire, e.depth[i] - repos.depth[i]); }
    return pire + 0.04 * Math.hypot(...off);
  };
  let off = [0, 0, 0], f = evaluer(off); const f0 = f;
  for (const pas of [0.006, 0.003, 0.0015, 0.00075]) for (let passe = 0; passe < 3; passe++) { let mieux = false; for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { const o = off.slice(); o[k] += s * pas; if (Math.abs(o[k]) > borne) continue; const g = evaluer(o); if (g < f - 1e-6) { f = g; off = o; mieux = true; } } if (!mieux) break; }
  corps.pivots[art.nom] = origine; decalages[art.nom] = off.map(x => +x.toFixed(4));
  console.log(art.nom.padEnd(16), 'enfoncement ajouté max : ' + (f0 * 1000).toFixed(1) + ' mm → ' + (f * 1000).toFixed(1) + ' mm', 'décalage (mm) ' + off.map(x => (x * 1000).toFixed(1)).join(', '));
}
const sortie = new URL('../pc/anatomie-pivots.js', import.meta.url);
fs.writeFileSync(sortie, `/* DONNÉES GÉNÉRÉES par planetes/saturne/outils/calibrer-pivots.mjs : ne pas éditer à la main.
   Décalages (en mètres, repère du modèle) ajoutés aux pivots estimés depuis les bornes des os, trouvés en minimisant l'enfoncement des os voisins pendant des mouvements d'essai (mesures réelles
   sur les triangles de BodyParts3D, ${G.index.pieces.length} pièces). Chaque décalage reste ≤ 2 cm (≤ 1,2 cm pour les rotules hanche et épaule, dont le centre vient d'un ajustement de sphère). */
export const DECALAGES_PIVOTS = ${JSON.stringify(decalages, null, 1)};
`);
console.log('écrit :', sortie.pathname);
