/* ═════════════ TABLE DE CORRESPONDANCE : nœuds du GLB de squelette → os de l'application ═════════════
   Le fichier ui/assets/anatomie/squelette-cc0.glb (produit par scripts/convertir-squelette.mjs à partir du modèle CC0 d'Armen Barsegyan) contient 116 nœuds nommés.
   Cette table dit quel(s) nœud(s) habille(nt) quel os de l'application (identifiants de base de registre.js : sélection, étiquettes, transparence par calque, coupes d'amputation).
   Entrée : { G: [nœuds du côté gauche], D: [nœuds du côté droit] }  ou  { noeuds: [nœuds] } pour une structure médiane ;  groupe : les os d'un même groupe (main, pied) sont recalés ENSEMBLE par une seule transformation, pour que leurs positions relatives (celles du modèle) soient conservées ;
   ajuster : 'axe' (os long : l'axe du modèle est aligné sur celui de l'os de l'application,
   ce qui garde les articulations et les insertions musculaires cohérentes) · 'boite' (centre et taille de la forme schématique, valeur par défaut).
   Le GLB est déclaré dans manifest.json :  { "_atlas": { "fichier": "squelette-cc0.glb", "table": "squelette-cc0", … } }.
   Le rachis et les côtes ne sont repris du GLB que sans scoliose ni fracture vertébrale (ils sont alors déformés en direct par la forme procédurale). */

const paire = (g, d, ajuster) => ({ G: g, D: d, ajuster });
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

/** Tables disponibles, par identifiant (champ « table » de l'entrée _atlas du manifeste) */
export const TABLES = {
  'squelette-cc0': {
    licence: 'CC0-1.0', auteur: 'Armen Barsegyan (CGI Coffee)', source: 'https://cgicoffee.com/blog/2017/10/free-human-skeleton-3d-model',
    os: construire()
  }
};

/** Noms des nœuds attendus dans le GLB pour une table (contrôle de cohérence) */
export function noeudsAttendus(table) {
  const s = new Set(); const t = TABLES[table]; if (!t) return s;
  for (const e of Object.values(t.os)) for (const l of [e.noeuds, e.G, e.D]) if (l) l.forEach(n => s.add(n));
  return s;
}
