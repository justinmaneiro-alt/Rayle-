import { DOSSIERS_ANAT, construire, typeDe, idReel, idMouvement, idPatho } from '../pc/anatomie-dossiers-calcul.js';
import { verifierDossiers } from '../../../core/commun/dossiers-calcul.js';
import fs from 'node:fs';
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };

ok(DOSSIERS_ANAT.map(d => d.id).join() === 'os,muscles,vaisseaux,nerfs,organes,mouvements,pathologies', 'les 7 dossiers demandés');
const pieces = [
  { id: 'a1', systeme: 'os', nom_fr: 'Fémur', nom_la: 'Femur', cote: 'droit' }, { id: 'a2', systeme: 'conjonctif', nom_fr: 'Ligament', nom_la: 'Ligamentum' },
  { id: 'b1', systeme: 'muscles', nom_fr: 'Biceps brachial' }, { id: 'c1', systeme: 'arteres', nom_fr: 'Aorte' }, { id: 'c2', systeme: 'veines', nom_fr: 'Veine cave' }, { id: 'c3', systeme: 'lymphatique', nom_fr: 'Rate' },
  { id: 'd1', systeme: 'nerfs', nom_fr: 'Nerf vague' }, { id: 'd2', systeme: 'nerfs-periph', nom_fr: 'Nerf sciatique' },
  { id: 'e1', systeme: 'coeur', nom_fr: 'Cœur' }, { id: 'e2', systeme: 'cerveau', nom_fr: 'Cerveau' }, { id: 'z1', systeme: 'inconnu', nom_fr: 'Orpheline' }
];
const r = construire({ pieces, libelle: p => p.nom_fr, mouvements: [{ id: 'squat', nom: 'Squat', categorie: 'Membres inférieurs', plan: 'sagittal' }], pathologies: [{ id: 'scoliose', nom: 'Scoliose', categorie: 'Rachis', niveau: 'modèle 3D' }] });
const par = Object.fromEntries(r.dossiers.map(d => [d.id, d.ids]));
ok(par.os.length === 2 && par.muscles.length === 1 && par.vaisseaux.length === 3 && par.nerfs.length === 2 && par.organes.length === 2, 'pièces rangées selon leur système');
ok(par.mouvements[0] === 'mv:squat' && par.pathologies[0] === 'pa:scoliose', 'mouvements et pathologies préfixés');
ok(r.orphelines.join() === 'z1', 'une pièce de système inconnu est signalée, pas perdue en silence');
ok(verifierDossiers(r.dossiers, Object.keys(r.fenetres)).length === 0, 'chaque fenêtre dans un seul dossier, aucune oubliée');
ok(r.fenetres['d2'].etat === 'schéma' && r.fenetres['mv:squat'].etat === 'simule', 'étiquettes honnêtes (schéma, simulé)');
ok(typeDe('mv:x') === 'mouvement' && typeDe('pa:x') === 'pathologie' && typeDe('abc') === 'piece' && idReel('mv:squat') === 'squat' && idReel('abc') === 'abc' && idMouvement('q') === 'mv:q' && idPatho('q') === 'pa:q', 'types et identifiants');
ok(r.dossiers.every(d => d.ids.length), 'les dossiers vides sont écartés');
/* avec le vrai index si présent (assets-lourds) */
const chemin = new URL('../../../assets-lourds/anatomie/index.json', import.meta.url);
if (fs.existsSync(chemin)) {
  const j = JSON.parse(fs.readFileSync(chemin, 'utf8')), vr = construire({ pieces: j.pieces, libelle: p => p.nom_fr || p.nom_en });
  const total = vr.dossiers.reduce((a, d) => a + d.ids.length, 0);
  ok(vr.orphelines.length === 0, 'vrai modèle : aucune pièce sans dossier (orphelines : ' + vr.orphelines.slice(0, 5).join(',') + ')');
  ok(total === j.pieces.length, 'vrai modèle : ' + total + ' pièces rangées sur ' + j.pieces.length);
  console.log('   dossiers du vrai modèle :', vr.dossiers.map(d => d.titre + ' ' + d.ids.length).join(' · '));
} else console.log('   (assets-lourds absent : contrôle du vrai modèle ignoré)');
console.log(`anatomie dossiers : ${n - ko}/${n} vérifications`); process.exit(ko ? 1 : 0);
