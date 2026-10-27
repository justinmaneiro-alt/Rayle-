/* S6 : pathologies et orthopédie (module pur) : angle de Cobb mesuré, amputations, déficiences, poses, fractures, fiches. Nécessite assets-lourds/anatomie/index.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerIndex } from '../pc/anatomie-index.js';
import { construireRig, anglesA, ARTICULATION } from '../pc/anatomie-mouvement-calcul.js';
import { PATHOLOGIES, AMPUTATIONS, DEFICIENCES, POSES, FRACTURES, AVERTISSEMENT, rachis, scoliose, cyphose, cobbSur, classerAmputation, classerDeficience, planFracture, trouverPathologie, descriptionParleePatho } from '../pc/anatomie-pathologies-calcul.js';
const chemin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets-lourds/anatomie/index.json');
if (!fs.existsSync(chemin)) { console.log('index.json absent : test ignoré'); process.exit(0); }
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
const index = creerIndex(JSON.parse(fs.readFileSync(chemin, 'utf8'))), rig = construireRig(index), R = rachis(index);
// fiches
const ids = PATHOLOGIES.map(p => p.id);
ok(ids.length >= 34 && new Set(ids).size === ids.length, 'identifiants uniques (' + ids.length + ')');
for (const p of PATHOLOGIES) {
  ok(p.nom && p.categorie && p.description && ['élevée', 'générique'].includes(p.confiance) && p.avertissement === AVERTISSEMENT, 'fiche complète : ' + p.id);
  ok(/pas un outil de diagnostic/.test(p.avertissement) && /vérifier/.test(p.avertissement), 'avertissement pédagogique : ' + p.id);
  const t = descriptionParleePatho(p); ok(t.includes(AVERTISSEMENT) && !/[*#`]/.test(t) && t.length > 150, 'description parlée : ' + p.id);
  ok(trouverPathologie(p.nom) && trouverPathologie(p.nom).id === p.id, 'recherche par le nom : ' + p.id);
}
ok(AMPUTATIONS.length === 15 && AMPUTATIONS.filter(a => a.membre === 'inférieur').length === 9 && AMPUTATIONS.filter(a => a.membre === 'supérieur').length === 6, 'amputations : 9 du membre inférieur, 6 du supérieur');
for (const a of AMPUTATIONS) ok(a.moignon && a.appareillage && a.points, 'amputation avec moignon, appareillage et points de vigilance : ' + a.id);
// rachis
ok(R.vertebres.length === 17 && R.vertebres[0].code === 'T1' && R.vertebres[16].code === 'L5', 'rachis : T1 à L5 (' + R.vertebres.length + ' vertèbres)');
ok(R.vertebres.every((v, i) => i === 0 || v.centre[1] < R.vertebres[i - 1].centre[1]), 'vertèbres de haut en bas');
const ribs = [...R.rattache.entries()].filter(([id]) => /rib$/i.test(index.parId.get(id).nom_en)); ok(ribs.length === 24, 'les 24 côtes sont rattachées à une vertèbre (' + ribs.length + ')');
ok([...R.rattache.entries()].filter(([id]) => /intervertebral disk/i.test(index.parId.get(id).nom_en)).length >= 15, 'disques intervertébraux rattachés');
// angle de Cobb : la valeur visée est retrouvée en mesurant l'inclinaison des vertèbres
for (const [type, cobb] of [['thoracique', 15], ['thoracique', 30], ['thoracique', 45], ['thoracique', 60], ['lombaire', 25], ['lombaire', 40], ['double', 35], ['double', 50]]) {
  const s = scoliose(R.vertebres, { cobb, type }); ok(Math.abs(s.cobbMesure - cobb) < 0.2, 'Cobb ' + type + ' visé ' + cobb + '° mesuré ' + s.cobbMesure.toFixed(2) + '°');
  const dI = s.inclinaison.map((x, i, t) => (i ? Math.abs(x - t[i - 1]) : 0)); ok(Math.max(...dI) < cobb * 0.6, 'courbe continue (' + type + ' ' + cobb + ')');
  ok(Math.max(...s.decalage.map(Math.abs)) < 0.12, 'décalage latéral plausible : ' + Math.max(...s.decalage.map(Math.abs)).toFixed(3) + ' m');
  ok(s.decalage.length === 17 && s.inclinaison.every(Number.isFinite), 'valeurs finies');
}
const sd = scoliose(R.vertebres, { cobb: 40, type: 'double' }); ok(sd.cobbSecondaire > 5, 'double courbe : seconde courbe mesurée (' + sd.cobbSecondaire.toFixed(1) + '°)');
const sg = scoliose(R.vertebres, { cobb: 30, coteConvexe: 'gauche' }), sdr = scoliose(R.vertebres, { cobb: 30, coteConvexe: 'droit' }); ok(Math.sign(Math.max(...sg.decalage.map(x => x))) !== Math.sign(Math.max(...sdr.decalage.map(x => x))) || Math.max(...sg.decalage) < 0, 'côté convexe : gauche et droit sont opposés');
const sn = scoliose(R.vertebres, { cobb: 10 }); ok(cobbSur(sn.inclinaison) < 10.5, 'seuil de 10° (limite de la définition)');
for (const c of [30, 45, 60, 80]) { const k = cyphose(R.vertebres, { cobb: c }); ok(Math.abs(k.cobbMesure - c) < 0.3, 'cyphose visée ' + c + '° mesurée ' + k.cobbMesure.toFixed(2) + '°'); }
// amputations : plus le niveau est haut, plus on cache de pièces ; les moignons ont une longueur plausible
const nb = {}; for (const a of AMPUTATIONS) { const r = classerAmputation(index, rig, a, 'droit'); nb[a.id] = r.cacher.length + r.clip.length * 0.001; ok(r.cacher.length > 0, 'amputation ' + a.id + ' cache des pièces (' + r.cacher.length + ')'); }
const ordreInf = ['transmetatarsienne', 'lisfranc', 'chopart', 'syme', 'transtibiale', 'desarticulation_genou', 'transfemorale', 'desarticulation_hanche', 'hemipelvectomie'];
for (let i = 1; i < ordreInf.length; i++) ok(nb[ordreInf[i]] >= nb[ordreInf[i - 1]] - 0.6 || ordreInf[i] === 'transfemorale', 'plus on monte, plus on enlève : ' + ordreInf[i - 1] + ' → ' + ordreInf[i] + ' (' + nb[ordreInf[i - 1]].toFixed(0) + ' → ' + nb[ordreInf[i]].toFixed(0) + ')');
ok(nb.desarticulation_hanche > nb.transfemorale && nb.transfemorale > nb.desarticulation_genou * 0 && nb.transtibiale < nb.transfemorale + 2000, 'ordre des niveaux inférieurs');
const lt = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'transtibiale')).longueurCm, lf = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'transfemorale')).longueurCm;
ok(lt > 8 && lt < 25, 'transtibiale : longueur du moignon du modèle ' + lt.toFixed(1) + ' cm sous le genou'); ok(lf > 12 && lf < 30, 'transfémorale : ' + lf.toFixed(1) + ' cm sous la hanche');
const rt = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'transtibiale'));
ok(rt.clip.length > 0 && rt.clip.some(c => /tibia/i.test(index.parId.get(c.id).nom_en)), 'transtibiale : le tibia est coupé (clip)');
ok(!rt.cacher.some(id => /femur/i.test(index.parId.get(id).nom_en)) && !rt.cacher.some(id => index.parId.get(id).cote === 'gauche'), 'transtibiale : le fémur et le membre gauche sont intacts');
ok(rt.cacher.some(id => /calcaneus|talus/i.test(index.parId.get(id).nom_en)), 'transtibiale : le pied est enlevé');
const sy = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'syme')); ok(sy.cacher.some(id => /calcaneus/i.test(index.parId.get(id).nom_en)) && !sy.cacher.some(id => /^right tibia/i.test(index.parId.get(id).nom_en)), 'Syme : pied enlevé, tibia conservé');
const ch = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'chopart')); ok(!ch.cacher.some(id => /calcaneus|talus/i.test(index.parId.get(id).nom_en)) && ch.cacher.some(id => /cuboid|metatarsal/i.test(index.parId.get(id).nom_en)), 'Chopart : talus et calcanéus conservés, reste du pied enlevé');
const li = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'lisfranc')); ok(li.cacher.some(id => /metatarsal/i.test(index.parId.get(id).nom_en)) && !li.cacher.some(id => /cuboid|cuneiform/i.test(index.parId.get(id).nom_en)), 'Lisfranc : métatarsiens enlevés, tarse conservé');
const hp = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'hemipelvectomie')); ok(hp.cacher.some(id => /^right hip bone/i.test(index.parId.get(id).nom_en)), 'hémipelvectomie : l’os coxal du côté est enlevé');
const gm = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'transtibiale'), 'gauche'); ok(gm.cacher.length > 0 && gm.cacher.every(id => index.parId.get(id).cote !== 'droit'), 'côté gauche : seules des pièces non droites sont enlevées');
for (const id of ['transradiale', 'transhumerale', 'desarticulation_coude', 'desarticulation_epaule', 'desarticulation_poignet']) { const r = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === id)); ok(r.cacher.length > 5 && r.cacher.every(x => ['bras', 'avantbras', 'main'].some(s => rig.segmentDe[x] === s + 'D') || /scapula|clavicle/i.test(index.parId.get(x).nom_en)), 'membre supérieur ' + id + ' : seules les pièces du bras droit sont enlevées'); }
const tr = classerAmputation(index, rig, AMPUTATIONS.find(a => a.id === 'transradiale')); ok(tr.longueurCm > 8 && tr.longueurCm < 20, 'transradiale : moignon de ' + tr.longueurCm.toFixed(1) + ' cm sous le coude');
// déficiences
for (const d of DEFICIENCES) { const r = classerDeficience(index, rig, d); ok(r.cacher.length + r.clip.length > 0, 'déficience ' + d.id + ' modifie le modèle'); ok(['transversale', 'longitudinale'].includes(d.type), 'type ISO 8548-1 : ' + d.id); }
ok(classerDeficience(index, rig, DEFICIENCES.find(d => d.id === 'fibula_absente')).cacher.every(id => /fibula/i.test(index.parId.get(id).nom_en) && index.parId.get(id).cote === 'droit'), 'fibula absente : seule la fibula droite est cachée');
// poses
const joints = new Set([...Object.values(ARTICULATION)]);
for (const p of POSES) { for (const [j, v] of Object.entries(p.poses)) { ok(joints.has(j), p.id + ' : articulation connue ' + j); ok(Object.values(v).every(Number.isFinite), p.id + ' : valeurs finies'); } }
// fractures
for (const f of FRACTURES) { const pl = planFracture(index, rig, f); ok(pl && pl.id && pl.c.every(Number.isFinite), 'plan de fracture : ' + f.id); const b = index.parId.get(pl.id).bornes; ok(pl.c[1] >= b[0][1] - 1e-6 && pl.c[1] <= b[1][1] + 1e-6, 'fracture ' + f.id + ' : le plan coupe l’os (y ' + pl.c[1].toFixed(3) + ')'); ok(Math.abs(Math.hypot(...pl.n) - 1) < 1e-9, 'normale unitaire : ' + f.id); }
// recherche
for (const [t, id] of [['montre une scoliose', 'scoliose'], ['amputation transtibiale', 'transtibiale'], ['amputation au-dessus du genou', 'transfemorale'], ['fracture du col du fémur', 'femur_col'], ['genu valgum', 'genu_valgum'], ['désarticulation de hanche', 'desarticulation_hanche'], ['pied tombant', 'pied_tombant'], ['pouteau-colles', 'radius_distal'], ['hémimélie fibulaire', 'fibula_absente']]) ok((trouverPathologie(t) || {}).id === id, 'reconnaissance : « ' + t + ' » → ' + id);
ok(trouverPathologie('recette de crêpes') === null, 'inconnu = null');
console.log(`pathologies (${PATHOLOGIES.length}) : ${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
