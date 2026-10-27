/* S5 : squelette articulé et bibliothèque de mouvements (module pur). Nécessite assets-lourds/anatomie/index.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerIndex } from '../pc/anatomie-index.js';
import { MUSCLES, cleMuscle } from '../pc/anatomie-muscles.js';
import { construireRig, MOUVEMENTS, MUSCLES_SEGMENTS, AMPLITUDES, HIERARCHIE, ARTICULATION, anglesA, trouverMouvement, explicationParlee, A_VERIFIER_MVT } from '../pc/anatomie-mouvement-calcul.js';
const chemin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets-lourds/anatomie/index.json');
if (!fs.existsSync(chemin)) { console.log('index.json absent : test ignoré'); process.exit(0); }
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
const index = creerIndex(JSON.parse(fs.readFileSync(chemin, 'utf8'))), rig = construireRig(index);
ok(Math.abs(rig.ant) === 1 && Math.abs(rig.cote.droit) === 1 && rig.cote.droit === -rig.cote.gauche, 'orientation du modèle : avant ' + rig.ant + ', côté droit ' + rig.cote.droit);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
for (const S of ['D', 'G']) {
  const hanche = rig.pivots['hanche' + S], genou = rig.pivots['genou' + S], chev = rig.pivots['cheville' + S], ep = rig.pivots['epaule' + S], cou = rig.pivots['coude' + S], poi = rig.pivots['poignet' + S];
  ok(dist(hanche, genou) > 0.3 && dist(hanche, genou) < 0.5, 'cuisse ' + S + ' : ' + dist(hanche, genou).toFixed(3) + ' m');
  ok(dist(genou, chev) > 0.3 && dist(genou, chev) < 0.5, 'jambe ' + S + ' : ' + dist(genou, chev).toFixed(3) + ' m');
  ok(dist(ep, cou) > 0.24 && dist(ep, cou) < 0.4, 'bras ' + S + ' : ' + dist(ep, cou).toFixed(3) + ' m');
  ok(dist(cou, poi) > 0.2 && dist(cou, poi) < 0.35, 'avant-bras ' + S + ' : ' + dist(cou, poi).toFixed(3) + ' m');
  ok(hanche[1] > genou[1] && genou[1] > chev[1] && ep[1] > cou[1] && cou[1] > poi[1], 'ordre vertical des articulations ' + S);
  const coxal = index.pieces.find(p => p.systeme === 'os' && /hip bone/i.test(p.nom_en) && p.cote === (S === 'D' ? 'droit' : 'gauche')), b = coxal.bornes, m = 0.04;
  ok(hanche[0] > b[0][0] - m && hanche[0] < b[1][0] + m && hanche[1] > b[0][1] - m && hanche[1] < b[1][1] + m && hanche[2] > b[0][2] - m && hanche[2] < b[1][2] + m, 'le centre de la hanche ' + S + ' est dans l’enveloppe de l’os coxal');
  ok(Math.sign(hanche[0]) === (S === 'D' ? rig.cote.droit : rig.cote.gauche), 'hanche ' + S + ' du bon côté');
}
ok(rig.pivots['lombo-sacree'][1] < rig.pivots.cervicale[1] && rig.pivots['lombo-sacree'][1] > rig.pivots.hancheD[1] - 0.2, 'pivots du rachis');
const valides = new Set(Object.keys(HIERARCHIE)); let manque = 0; for (const p of index.pieces) { if (!p.bornes) continue; if (!valides.has(rig.segmentDe[p.id])) manque++; }
ok(manque === 0, 'chaque pièce a un segment valide');
const seg = re => { const p = index.pieces.find(x => re.test(x.nom_en)); return rig.segmentDe[p.id]; };
ok(seg(/^Right femur/i) === 'cuisseD' && seg(/^Left femur/i) === 'cuisseG' && seg(/^Left tibia/i) === 'jambeG' && seg(/^Right humerus/i) === 'brasD' && seg(/^Left radius/i) === 'avantbrasG' && seg(/^Right calcaneus/i) === 'piedD' && seg(/^Left capitate/i) === 'mainG' && seg(/^Mandible/i) === 'tete' && seg(/hip bone/i) === 'bassin' && seg(/^Left clavicle/i) === 'tronc', 'os principaux dans les bons segments');
ok(Object.keys(ARTICULATION).every(s => HIERARCHIE[s] !== undefined && rig.pivots[ARTICULATION[s]]), 'chaque segment mobile a un pivot');
for (const [k, [a, b]] of Object.entries(MUSCLES_SEGMENTS)) { ok(MUSCLES[k], 'muscle de la table des segments absent des fiches : ' + k); ok(a !== b, 'segments distincts : ' + k); ok(index.pieces.some(p => cleMuscle(p.nom_en) === k), 'muscle absent du modèle : ' + k); }
ok(MOUVEMENTS.length >= 12, 'au moins 12 mouvements (' + MOUVEMENTS.length + ')');
const joints = new Set([...Object.values(ARTICULATION), 'tronc', 'tete', 'bassin']), AMP = { hanche: 125, genou: 145, cheville: 55, epaule: 185, coude: 150, tronc: 65 };
for (const m of MOUVEMENTS) {
  ok(m.id && m.nom && m.alias.length && m.duree > 1 && m.explication && m.amplitude && m.articulation, 'mouvement complet : ' + m.id);
  ok(m.agonistes.length > 0 && m.antagonistes.length > 0, 'agonistes et antagonistes : ' + m.id);
  for (const k of [...m.agonistes, ...m.antagonistes]) ok(MUSCLES[k] && index.pieces.some(p => cleMuscle(p.nom_en) === k), 'muscle de ' + m.id + ' connu : ' + k);
  ok(m.agonistes.every(k => !m.antagonistes.includes(k)), 'aucun muscle à la fois agoniste et antagoniste : ' + m.id);
  const pas = 60; let saut = 0, prev = null, maxA = 0;
  for (let i = 0; i <= pas; i++) {
    const a = anglesA(m, i / pas);
    for (const [j, v] of Object.entries(a)) {
      ok(joints.has(j), m.id + ' : articulation connue ' + j);
      for (const [c, x] of Object.entries(v)) { ok(Number.isFinite(x), m.id + ' : valeur finie'); if (c !== 'dy') maxA = Math.max(maxA, Math.abs(x)); if (prev && prev[j] && prev[j][c] !== undefined && c !== 'dy') saut = Math.max(saut, Math.abs(x - prev[j][c])); }
      const base = j.replace(/[DG]$/, ''), lim = AMP[base];
      if (lim && v.fl !== undefined) ok(Math.abs(v.fl) <= lim, m.id + ' : ' + j + ' flexion ' + v.fl.toFixed(0) + '° dans l’amplitude de référence');
      if (base === 'epaule' && v.ab !== undefined) ok(v.ab <= 185, m.id + ' : abduction d’épaule');
      if (base === 'hanche' && v.ab !== undefined) ok(v.ab <= 50, m.id + ' : abduction de hanche');
      if (j === 'tete' && v.rot !== undefined) ok(Math.abs(v.rot) <= 80, m.id + ' : rotation de la tête');
    }
    prev = a;
  }
  ok(maxA > 5, m.id + ' : le mouvement bouge (max ' + maxA.toFixed(0) + '°)');
  ok(saut < 40, m.id + ' : continuité (plus grand écart entre deux images : ' + saut.toFixed(1) + '°)');
  const A = anglesA(m, 0), B = anglesA(m, 1 - 1e-7); let boucle = true; for (const j of Object.keys(A)) for (const c of Object.keys(A[j])) if (Math.abs(A[j][c] - B[j][c]) > 0.01) boucle = false;
  ok(boucle, m.id + ' : l’image 0 et la dernière image sont identiques (boucle sans saut)');
  ok(explicationParlee(m).includes(A_VERIFIER_MVT) && !/[*#`]/.test(explicationParlee(m)), m.id + ' : explication parlée avec rappel de vérifier');
}
ok(MOUVEMENTS.map(m => m.id).filter((x, i, t) => t.indexOf(x) !== i).length === 0, 'identifiants uniques');
for (const [t, id] of [['montre la marche', 'marche'], ['flexion du genou', 'flexion_genou'], ['abduction de l’épaule', 'abduction_epaule'], ['fais un squat', 'accroupissement'], ['dire non', 'rotation_tete'], ['lever la jambe', 'flexion_hanche'], ['plier le coude', 'flexion_coude'], ['flexion plantaire', 'cheville']]) ok((trouverMouvement(t) || {}).id === id, 'reconnaissance : « ' + t + ' » → ' + id);
ok(trouverMouvement('saut périlleux') === null, 'mouvement inconnu = null');
ok(Object.keys(AMPLITUDES).length >= 10, 'amplitudes de référence');
const M = MOUVEMENTS.find(m => m.id === 'marche'), a = anglesA(M, 0.1), b = anglesA(M, 0.6);
ok(Math.abs(a.hancheD.fl - b.hancheG.fl) < 1e-6 && Math.abs(a.genouD.fl - b.genouG.fl) < 1e-6, 'marche : jambe gauche = jambe droite décalée d’un demi-cycle');
ok(anglesA(M, 0).hancheD.fl > anglesA(M, 0.5).hancheD.fl, 'marche : hanche fléchie au contact du talon, étendue en fin d’appui');
console.log(`mouvements (${MOUVEMENTS.length}) : ${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
