/* ═════════════ TABLE DE CORRESPONDANCE : nœuds du GLB de squelette → os de l'application ═════════════
   Le fichier modules/anatomie/assets/squelette-cc0.glb (produit par scripts/convertir-squelette.mjs à partir du modèle CC0 d'Armen Barsegyan) contient 116 nœuds nommés.
   Cette table dit quel(s) nœud(s) habille(nt) quel os de l'application (identifiants de base de registre.js : sélection, étiquettes, transparence par calque, coupes d'amputation).
   Entrée : { G: [nœuds du côté gauche], D: [nœuds du côté droit] }  ou  { noeuds: [nœuds] } pour une structure médiane ;  groupe : les os d'un même groupe (main, pied) sont recalés ENSEMBLE par une seule transformation, pour que leurs positions relatives (celles du modèle) soient conservées ;
   ajuster : 'axe' (os long : l'axe du modèle est aligné sur celui de l'os de l'application,
   ce qui garde les articulations et les insertions musculaires cohérentes) · 'boite' (centre et taille de la forme schématique, valeur par défaut).
   Le GLB est déclaré dans manifest.json :  { "_atlas": { "fichier": "squelette-cc0.glb", "table": "squelette-cc0", … } }.
   Le rachis et les côtes ne sont repris du GLB que sans scoliose ni fracture vertébrale (ils sont alors déformés en direct par la forme procédurale). */

const paire = (g, d, ajuster, groupe) => Object.assign({ G: g, D: d, ajuster }, groupe ? { groupe } : {});
const cotes = (nom, ajuster, groupe) => Object.assign(paire([nom + '_G'], [nom + '_D'], ajuster), groupe ? { groupe } : {});

const VERTEBRES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'];

function construire() {
  const os = {
    crane: { noeuds: ['crane', 'dents_sup'] },
    mandibule: { noeuds: ['mandibule', 'dents_inf'] },
    sternum: { noeuds: ['sternum'] },
    sacrum: { noeuds: ['sacrum'] },
    coccyx: { noeuds: ['coccyx'] },
    clavicule: cotes('clavicule', 'axe'),
    scapula: cotes('scapula'),
    humerus: cotes('humerus', 'axe'),
    radius: cotes('radius', 'axe'),
    ulna: cotes('ulna', 'axe'),
    carpe: cotes('carpe', 'boite', 'main'),
    metacarpiens: cotes('metacarpiens', 'boite', 'main'),
    'phalanges-main': cotes('phalanges_main', 'boite', 'main'),
    'os-coxal': cotes('os_coxal'),
    femur: cotes('femur', 'axe'),
    patella: cotes('patella'),
    tibia: cotes('tibia', 'axe'),
    fibula: cotes('fibula', 'axe'),
    talus: cotes('talus', 'boite', 'pied'),
    calcaneus: cotes('calcaneus', 'boite', 'pied'),
    'tarse-anterieur': cotes('tarse', 'boite', 'pied'),
    metatarsiens: cotes('metatarsiens', 'boite', 'pied'),
    'phalanges-pied': cotes('phalanges_pied', 'boite', 'pied')
  };
  for (const v of VERTEBRES) os['vertebre-' + v] = { noeuds: ['vertebre_' + v], rachis: true };
  os['cartilages-costaux'] = { noeuds: ['cartilages_sternaux'], rachis: true };
  for (let i = 1; i <= 12; i++) os['cote-' + i] = Object.assign(cotes('cote_' + i), { rachis: true });
  // disques : l'application nomme « disque-<vertèbre basse>-<vertèbre haute> », le GLB « disque_<haute><basse> » (C1-C2 n'est pas un vrai disque : forme procédurale seule)
  for (let k = 0; k + 1 < VERTEBRES.length; k++) {
    const haute = VERTEBRES[k], basse = VERTEBRES[k + 1];
    if (haute === 'C1') continue;
    os['disque-' + basse + '-' + haute] = { noeuds: ['disque_' + haute + basse], rachis: true };
  }
  return os;
}


/* Table du GLB « os-detail-bp3d.glb » (BodyParts3D, CC BY 4.0, voir scripts/convertir-bodyparts3d.mjs) : crâne en os séparés, mandibule et dents, mains et pieds à os individuels.
   Les os fusionnés sous un même identifiant d'application (carpe = 8 os, phalanges = 14 os…) gardent leur forme propre : on les voit séparés, jointifs, avec leurs facettes articulaires. */
function construireDetail() {
  const cote = c => ({
    carpe: ['scaphoid', 'lunate', 'triquetral', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate'].map(n => 'carpe_' + n + '_' + c),
    meta: [1, 2, 3, 4, 5].map(i => 'mc' + i + '_' + c),
    phal: ['ph_p1', 'ph_d1', ...[2, 3, 4, 5].flatMap(i => ['ph_p' + i, 'ph_m' + i, 'ph_d' + i])].map(n => n + '_' + c),
    tarse: ['naviculaire', 'cuboide', 'cun1', 'cun2', 'cun3'].map(n => n + '_' + c),
    mt: [1, 2, 3, 4, 5].map(i => 'mt' + i + '_' + c),
    po: ['po_p1', 'po_d1', ...[2, 3, 4, 5].flatMap(i => ['po_p' + i, 'po_m' + i, 'po_d' + i])].map(n => n + '_' + c)
  });
  const G = cote('G'), D = cote('D');
  const crane = ['frontal', 'occipital', 'sphenoide', 'ethmoide', 'vomer'].map(n => 'crane_' + n);
  for (const c of ['G', 'D']) for (const n of ['parietal_bone', 'temporal_bone', 'zygomatic_bone', 'lacrimal_bone', 'nasal_bone', 'maxilla', 'palatine_bone', 'inferior_nasal_concha']) crane.push('crane_' + n + '_' + c);
  const dents = arc => { const l = []; for (const c of ['left', 'right']) for (const t of ['central_incisor', 'lateral_incisor', 'canine', 'first_premolar', 'second_premolar', 'first_molar', 'second_molar']) l.push('dent_' + c + '_' + arc + '_' + t); return l; };
  return {
    crane: { noeuds: [...crane, ...dents('upper')] },
    mandibule: { noeuds: ['mandibule', ...dents('lower')] },
    carpe: paire(G.carpe, D.carpe, 'boite', 'main'), metacarpiens: paire(G.meta, D.meta, 'boite', 'main'), 'phalanges-main': paire(G.phal, D.phal, 'boite', 'main'),
    talus: paire(['talus_G'], ['talus_D'], 'boite', 'pied'), calcaneus: paire(['calcaneus_G'], ['calcaneus_D'], 'boite', 'pied'),
    'tarse-anterieur': paire(G.tarse, D.tarse, 'boite', 'pied'), metatarsiens: paire(G.mt, D.mt, 'boite', 'pied'), 'phalanges-pied': paire(G.po, D.po, 'boite', 'pied')
  };
}

/* Table du GLB « os-axial-bp3d.glb » (BodyParts3D, CC BY 4.0, scripts/convertir-corps-bp3d.mjs) : os longs, scapula, clavicule, os coxal, patella, rachis, côtes, sacrum, disques.
   C'est le MÊME corps que les muscles, vaisseaux et organes de la couche haute fidélité : leurs insertions tombent sur ces os (voir corps-hd.js). Le sternum (BodyParts3D n'a que le corps du sternum),
   le coccyx et les cartilages costaux restent ceux du squelette CC0 (repli par priorité des atlas). */
function construireAxial() {
  const os = {
    clavicule: cotes('clavicule', 'axe'), scapula: cotes('scapula'), humerus: cotes('humerus', 'axe'), radius: cotes('radius', 'axe'), ulna: cotes('ulna', 'axe'),
    'os-coxal': cotes('os_coxal'), femur: cotes('femur', 'axe'), patella: cotes('patella'), tibia: cotes('tibia', 'axe'), fibula: cotes('fibula', 'axe'),
    sacrum: { noeuds: ['sacrum'], rachis: true }
  };
  for (const v of VERTEBRES) os['vertebre-' + v] = { noeuds: ['vertebre_' + v], rachis: true };
  for (let i = 1; i <= 12; i++) os['cote-' + i] = Object.assign(cotes('cote_' + i), { rachis: true });
  for (let k = 1; k + 1 < VERTEBRES.length; k++) {      // « disque_<haute><basse> » : le disque situé sous la vertèbre haute (T12-L1 est absent de BodyParts3D, L5-S1 n'a pas d'équivalent dans l'application)
    const haute = VERTEBRES[k], basse = VERTEBRES[k + 1];
    if (haute === 'T12') continue;
    os['disque-' + basse + '-' + haute] = { noeuds: ['disque_' + haute + basse], rachis: true };
  }
  return os;
}

/** Tables disponibles, par identifiant (champ « table » de l'entrée _atlas du manifeste) */
export const TABLES = {
  'squelette-cc0': {
    licence: 'CC0-1.0', auteur: 'Armen Barsegyan (CGI Coffee)', source: 'https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model',
    os: construire()
  },
  'bodyparts3d-axial': {
    licence: 'CC-BY-4.0', auteur: 'The Database Center for Life Science (BodyParts3D)', source: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
    os: construireAxial()
  },
  'bodyparts3d': {
    licence: 'CC-BY-4.0', auteur: 'The Database Center for Life Science (BodyParts3D)', source: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
    os: construireDetail()
  }
};

/** Noms des nœuds attendus dans le GLB pour une table (contrôle de cohérence) */
export function noeudsAttendus(table) {
  const s = new Set(); const t = TABLES[table]; if (!t) return s;
  for (const e of Object.values(t.os)) for (const l of [e.noeuds, e.G, e.D]) if (l) l.forEach(n => s.add(n));
  return s;
}
