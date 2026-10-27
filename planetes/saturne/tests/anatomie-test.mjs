/* Tests de l'index d'anatomie (S2) : nombre d'os, cohérence des noms, fiches jamais vides, recherche, côtés, mesures.
   Nécessite assets-lourds/anatomie/index.json (généré par planetes/saturne/outils/anatomie-convertir.mjs) ; sinon le test est ignoré. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerIndex, distanceMm, angleDeg, norm } from '../pc/anatomie-index.js';
import { fiche, descriptionParlee, A_VERIFIER, OS, cleSimple } from '../pc/anatomie-savoirs.js';
import { ARTERES, VEINES } from '../pc/anatomie-vaisseaux.js';
import { CERVEAU } from '../pc/anatomie-cerveau.js';
import { MUSCLES, cleMuscle, ECHELLE_MUSCULAIRE, TEXTE_ECHELLE } from '../pc/anatomie-muscles.js';

const chemin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets-lourds/anatomie/index.json');
if (!fs.existsSync(chemin)) { console.log('index.json absent : test ignoré (lancer anatomie-convertir.mjs)'); process.exit(0); }
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
const index = creerIndex(JSON.parse(fs.readFileSync(chemin, 'utf8')));
const c = index.controle();
const os = index.deSysteme('os');

ok(c.total === 2234, 'total de pièces = 2234 (' + c.total + ')');
ok(c.doubles.length === 0, 'identifiants uniques');
ok(c.sansBornes.length === 0 && c.sansFichier.length === 0, 'chaque pièce a des bornes et un fichier');
ok(os.length >= 200 && os.length <= 206, 'squelette : 200 à 206 os (' + os.length + ')');
for (const attendu of ['femur', 'tibia', 'fibula', 'humerus', 'radius', 'ulna', 'clavicle', 'scapula', 'patella', 'sacrum', 'mandible', 'frontal bone', 'occipital bone', 'sphenoid bone', 'atlas', 'axis', 'talus', 'calcaneus'])
  ok(os.some(p => p.nom_en.toLowerCase().includes(attendu)), 'os présent : ' + attendu);
ok(os.filter(p => /vertebra$/i.test(p.nom_en)).length + os.filter(p => /^(atlas|axis)$/i.test(p.nom_en)).length === 24, '24 vertèbres libres');
ok(os.filter(p => / rib$/i.test(p.nom_en)).length === 24, '24 côtes');
ok(os.filter(p => /metacarpal/i.test(p.nom_en)).length === 10 && os.filter(p => /metatarsal/i.test(p.nom_en)).length === 10, '10 métacarpiens et 10 métatarsiens');
ok(os.filter(p => /phalanx/i.test(p.nom_en)).length === 56, '56 phalanges (' + os.filter(p => /phalanx/i.test(p.nom_en)).length + ')');
// cohérence des noms de tous les os
ok(os.every(p => p.nom_fr && p.nom_la), 'tous les os ont un nom français et un nom latin');
ok(os.every(p => !/undefined|null|\[object/.test(p.nom_fr + p.nom_la)), 'aucun nom corrompu');
for (const p of os) { if (p.cote) { const m = index.miroir(p.id); if (!m && !/sesamoid/i.test(p.nom_en)) ok(false, 'pas de miroir pour ' + p.id + ' ' + p.nom_en); else if (m && !/sesamoid/i.test(p.nom_en)) ok(m.cote !== p.cote && index.miroir(m.id).id === p.id, 'miroir réciproque ' + p.id); } }
ok(index.miroir(index.chercher('fémur gauche')[0].id).cote === 'droit', 'miroir du fémur gauche = droit');
// vertèbres : latin et français cohérents
const l3 = index.chercher('troisième vertèbre lombaire')[0];
ok(l3 && /L3/.test(l3.nom_fr) && /Vertebra lumbalis III/.test(l3.nom_la), 'L3 nommée (' + (l3 && l3.nom_la) + ')');
const c1 = index.chercher('atlas')[0]; ok(c1 && /C1/.test(c1.nom_fr), 'atlas = C1');
const cote1 = index.chercher('première côte gauche')[0]; ok(cote1 && /Costa prima/.test(cote1.nom_la) && cote1.cote === 'gauche', 'première côte gauche');
// recherche
ok(index.chercher('fémur')[0].nom_la.startsWith('Os femoris') || /fémur/i.test(index.chercher('fémur')[0].nom_fr), 'recherche « fémur »');
ok(index.resoudre('le fémur').length === 2, 'sans côté : les deux fémurs (' + index.resoudre('le fémur').length + ')');
ok(index.resoudre('le fémur gauche').length === 1 && index.resoudre('le fémur gauche')[0].cote === 'gauche', '« fémur gauche » = un seul, gauche');
ok(index.resoudre('left tibia').length === 1, 'nom anglais accepté');
ok(index.resoudre('os coxal').length >= 1, 'os coxal trouvé');
ok(index.chercher('zzzzz inexistant').length === 0, 'rien d’inventé pour un mot inconnu');
ok(norm('Fémur Gauche') === 'femur gauche', 'normalisation');
// fiches : jamais vides
let elevees = 0, generiques = 0, minimales = 0;
for (const p of os) {
  const fi = fiche(p);
  ok(fi.nom_fr && fi.region && fi.type && fi.verifier === A_VERIFIER && ['élevée', 'générique', 'minimale'].includes(fi.confiance), 'fiche non vide : ' + p.id);
  if (fi.confiance === 'élevée') { elevees++; ok(fi.description && fi.articulations.length && fi.clinique, 'fiche élevée complète : ' + p.nom_en); }
  else if (fi.confiance === 'générique') { generiques++; ok(fi.description, 'fiche générique avec description : ' + p.nom_en); }
  else { minimales++; ok(fi.description === null && fi.reperes.length === 0, 'fiche minimale sans contenu inventé : ' + p.nom_en); }
}
ok(elevees >= 60, 'au moins 60 os avec fiche rédigée (' + elevees + ')');
ok(descriptionParlee(fiche(index.resoudre('fémur gauche')[0])).includes('À vérifier avec ton cours'), 'Raylé rappelle de vérifier');
ok(!/[*#`]/.test(descriptionParlee(fiche(index.resoudre('tibia')[0]))), 'texte parlé sans markdown');
for (const k of Object.keys(OS)) ok(os.some(p => p.nom_en.toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right) /, ' of ').replace(/ of (left|right)$/, '').startsWith(k) || p.nom_en.toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right) /, ' of ').includes(k)), 'clé de fiche sans os correspondant : ' + k);
// muscles (S3)
const mus = index.deSysteme('muscles').filter(p => p.type === 'muscle');
ok(mus.length === 417 || mus.length >= 410, 'muscles du modèle : ' + mus.length);
ok(index.pieces.filter(p => /tensor fasciae latae/i.test(p.nom_en)).every(p => p.systeme === 'muscles'), 'tenseur du fascia lata classé en muscle');
let avec = 0, sans = 0;
for (const p of mus) {
  const fi = fiche(p);
  ok(fi.nom_affiche && fi.region && fi.verifier === A_VERIFIER, 'fiche muscle non vide : ' + p.id);
  ok([1, 2, 3].includes(p.couche), 'couche estimée présente : ' + p.nom_en);
  if (fi.muscle) { avec++; const m = fi.muscle; ok(m.origine && m.insertion && m.innervation && m.vascularisation && m.action && m.antagonistes && m.clinique, 'fiche muscle complète : ' + p.nom_en); ok(fi.confiance === 'élevée', 'confiance élevée : ' + p.nom_en); }
  else { sans++; ok(fi.confiance === 'minimale' && !fi.clinique, 'muscle sans fiche : contenu vide, pas inventé : ' + p.nom_en); }
}
ok(avec >= 100, 'au moins 100 muscles (pièces) avec fiche détaillée (' + avec + ')');
for (const k of Object.keys(MUSCLES)) ok(mus.some(p => cleMuscle(p.nom_en) === k), 'clé de fiche sans muscle dans le modèle : ' + k);
ok(Object.values(MUSCLES).every(m => Object.values(m).every(v => typeof v === 'string' && v.length > 8)), 'tous les champs des fiches de muscles sont renseignés');
ok(cleMuscle('Long head of left biceps brachii') === 'biceps brachii' && cleMuscle('Acromial part of right deltoid') === 'deltoid' && cleMuscle('Lateral head of left gastrocnemius') === 'gastrocnemius', 'têtes et faisceaux ramenés au muscle');
ok(ECHELLE_MUSCULAIRE.length === 6 && ECHELLE_MUSCULAIRE.map(e => e.cote).join('') === '543210' && /Lovett/.test(TEXTE_ECHELLE) && /cours/.test(TEXTE_ECHELLE), 'échelle de cotation 0 à 5');
const bic = index.chercher('biceps brachial').map(p => p.nom_fr); ok(bic.length >= 2, 'recherche du biceps brachial (' + bic.join(' / ') + ')');
const sup = mus.filter(p => p.couche === 1).length, prof = mus.filter(p => p.couche === 3).length; ok(sup > 50 && prof > 50, 'couches réparties (' + sup + ' superficielles, ' + prof + ' profondes)');
const grandF = mus.find(p => /gluteus maximus/i.test(p.nom_en)), pieceProf = mus.find(p => /obturator internus/i.test(p.nom_en)); ok(grandF.couche < pieceProf.couche || grandF.couche === 1, 'le grand fessier est plus superficiel que l’obturateur interne (' + grandF.couche + ' / ' + pieceProf.couche + ')');
const dp = descriptionParlee(fiche(index.resoudre('biceps brachial gauche')[0])); ok(/naît de/.test(dp) && /Innervation/.test(dp) && /Antagonistes/.test(dp) && /À vérifier/.test(dp) && !/[*#`]/.test(dp), 'description parlée d’un muscle');
// vaisseaux, encéphale, nerfs crâniens (S4)
const art = index.deSysteme('arteres'), vei = index.deSysteme('veines'), cer = index.deSysteme('cerveau'), ner = index.deSysteme('nerfs'), coe = index.deSysteme('coeur');
ok(art.length > 300 && vei.length > 200, 'artères et veines présentes (' + art.length + ' / ' + vei.length + ')');
ok(cer.length >= 100 && cer.every(p => p.region === 'tête'), 'encéphale : ' + cer.length + ' structures, toutes dans la tête');
ok(!coe.some(p => /(third|fourth) ventricle|lateral ventricle|interventricular foramen/i.test(p.nom_en)), 'les ventricules cérébraux ne sont plus rangés avec le cœur');
ok(coe.some(p => /cavity of left ventricle/i.test(p.nom_en)), 'les cavités du cœur restent dans le système cœur');
ok(ner.every(p => /nerve|ganglion/i.test(p.nom_en)), 'système nerfs : uniquement des nerfs et ganglions (' + ner.length + ')');
ok(!index.pieces.some(p => /sciatic|median nerve|ulnar nerve|radial nerve|femoral nerve/i.test(p.nom_en)), 'nerfs périphériques absents du modèle (limite documentée)');
for (const [nomD, d, sys] of [['artères', ARTERES, art], ['veines', VEINES, vei], ['encéphale et nerfs crâniens', CERVEAU, cer.concat(ner)]]) {
  for (const k of Object.keys(d)) ok(sys.some(p => cleSimple(p.nom_en).replace(/^(anterior|posterior) part of /, '') === k), 'clé de fiche sans pièce du modèle (' + nomD + ') : ' + k);
  for (const [k, f] of Object.entries(d)) ok(Object.values(f).every(x => typeof x === 'string' && x.length > 3), 'fiche complète (' + nomD + ') : ' + k);
}
for (const p of art.concat(vei, cer, ner)) { const fi = fiche(p); ok(fi.nom_affiche && fi.region && fi.verifier === A_VERIFIER, 'fiche non vide : ' + p.id); if (cleSimple(p.nom_en).replace(/^(anterior|posterior) part of /, '') in { ...ARTERES, ...VEINES, ...CERVEAU }) ok(fi.confiance === 'élevée' && (fi.vaisseau || fi.cerveau) && p.nom_fr && p.nom_la, 'fiche élevée et noms présents : ' + p.nom_en); }
ok(index.resoudre('artère fémorale gauche').length === 1 && index.resoudre('artère fémorale gauche')[0].systeme === 'arteres', 'recherche : artère fémorale gauche');
ok(index.resoudre('grande veine saphène').length === 2, 'recherche : grande veine saphène (deux côtés)');
ok(index.resoudre('hippocampe').length >= 1 && /hippocamp/i.test(index.resoudre('hippocampe')[0].nom_en), 'recherche : hippocampe');
ok(/Broca/.test(fiche(index.chercher('gyrus frontal inférieur')[0]).cerveau.role) , 'gyrus frontal inférieur : aire de Broca');
const dpv = descriptionParlee(fiche(index.resoudre('artère fémorale gauche')[0])); ok(/Origine/.test(dpv) && /Territoire/.test(dpv) && /À vérifier/.test(dpv) && !/[*#`]/.test(dpv), 'description parlée d’une artère');
const dpc = descriptionParlee(fiche(index.resoudre('thalamus')[0])); ok(/Rôle/.test(dpc) && /Situation/.test(dpc), 'description parlée d’une structure de l’encéphale');
ok(index.pieces.filter(p => p.systeme === 'lymphatique').length === 3, 'système lymphatique : 3 pièces seulement (limite documentée)');
// mesures
ok(Math.abs(distanceMm([0, 0, 0], [0.3, 0.4, 0]) - 500) < 1e-6, 'distance en mm');
ok(Math.abs(angleDeg([1, 0, 0], [0, 0, 0], [0, 1, 0]) - 90) < 1e-9, 'angle 90°');
ok(angleDeg([0, 0, 0], [0, 0, 0], [0, 1, 0]) === null, 'angle indéfini');
const fem = index.chercher('fémur gauche')[0], d = index.dimensions(fem); ok(d && d[1] > 0.35 && d[1] < 0.6, 'fémur : longueur plausible ' + (d && d[1]));
console.log(`anatomie (os ${os.length}, fiches élevées ${elevees} / génériques ${generiques} / minimales ${minimales}) : ${n - ko}/${n} vérifications`);
if (ko) { process.exit(1); }
