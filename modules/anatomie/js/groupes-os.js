/* ═════════════ RÉGIONS DU SQUELETTE : isolation et transparence par groupe d'os ═════════════
   groupeDe(base) → identifiant de région d'un os (identifiant de base de registre.js), ou null pour toute autre structure. */
export const GROUPES_OS = [
  { id: 'crane', nom: 'Crâne', court: 'Crâne', bases: ['crane', 'mandibule'] },
  { id: 'colonne', nom: 'Colonne vertébrale', court: 'Colonne', test: b => /^(vertebre-|disque-)/.test(b) || b === 'sacrum' || b === 'coccyx' },
  { id: 'thorax', nom: 'Thorax', court: 'Thorax', test: b => /^cote-/.test(b) || b === 'sternum' || b === 'cartilages-costaux' },
  { id: 'bassin', nom: 'Bassin', court: 'Bassin', bases: ['os-coxal'] },
  { id: 'abdomen', nom: 'Abdomen', court: 'Abdomen', bases: [] },          // aucun os : région des tissus mous (muscles, vaisseaux, organes)
  { id: 'membre-superieur', nom: 'Membre supérieur', court: 'Membre sup.', bases: ['clavicule', 'scapula', 'humerus', 'radius', 'ulna', 'carpe', 'metacarpiens', 'phalanges-main'] },
  { id: 'membre-inferieur', nom: 'Membre inférieur', court: 'Membre inf.', bases: ['femur', 'patella', 'tibia', 'fibula', 'talus', 'calcaneus', 'tarse-anterieur', 'metatarsiens', 'phalanges-pied'] }
];
export const groupeDe = base => { for (const g of GROUPES_OS) if (g.test ? g.test(base) : g.bases.includes(base)) return g.id; return null; };
export const nomGroupe = id => { const g = GROUPES_OS.find(x => x.id === id); return g ? g.nom : id; };

/* Régions des tissus mous : une structure haute fidélité porte une « région » (Bras, Cuisse, Thorax…) ; une structure schématique (muscles, nerfs, organes de donnees-*.js) se rattache à la région de ses os ou de son membre. */
const REGION_VERS_GROUPE = { Tête: 'crane', Langue: 'crane', Palais: 'crane', Orbite: 'crane', Cou: 'colonne', Larynx: 'colonne', Pharynx: 'colonne', Dos: 'colonne', Nuque: 'colonne', Thorax: 'thorax',
  Abdomen: 'abdomen', Bassin: 'bassin', Périnée: 'bassin', Épaule: 'membre-superieur', Bras: 'membre-superieur', 'Avant-bras': 'membre-superieur', Main: 'membre-superieur', Cuisse: 'membre-inferieur', Jambe: 'membre-inferieur', Pied: 'membre-inferieur' };
export const groupeDeStructure = def => {
  if (!def) return null;
  if (def.region && REGION_VERS_GROUPE[def.region]) return REGION_VERS_GROUPE[def.region];
  if (def.membre) return def.membre === 'MS' ? 'membre-superieur' : 'membre-inferieur';
  return groupeDe(def.origine && def.origine.os) || groupeDe(def.insertion && def.insertion.os) || null;
};
