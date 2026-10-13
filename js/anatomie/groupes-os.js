/* ═════════════ RÉGIONS DU SQUELETTE : isolation et transparence par groupe d'os ═════════════
   groupeDe(base) → identifiant de région d'un os (identifiant de base de registre.js), ou null pour toute autre structure. */
export const GROUPES_OS = [
  { id: 'crane', nom: 'Crâne', court: 'Crâne', bases: ['crane', 'mandibule'] },
  { id: 'colonne', nom: 'Colonne vertébrale', court: 'Colonne', test: b => /^(vertebre-|disque-)/.test(b) || b === 'sacrum' || b === 'coccyx' },
  { id: 'thorax', nom: 'Thorax', court: 'Thorax', test: b => /^cote-/.test(b) || b === 'sternum' || b === 'cartilages-costaux' },
  { id: 'bassin', nom: 'Bassin', court: 'Bassin', bases: ['os-coxal'] },
  { id: 'membre-superieur', nom: 'Membre supérieur', court: 'Membre sup.', bases: ['clavicule', 'scapula', 'humerus', 'radius', 'ulna', 'carpe', 'metacarpiens', 'phalanges-main'] },
  { id: 'membre-inferieur', nom: 'Membre inférieur', court: 'Membre inf.', bases: ['femur', 'patella', 'tibia', 'fibula', 'talus', 'calcaneus', 'tarse-anterieur', 'metatarsiens', 'phalanges-pied'] }
];
export const groupeDe = base => { for (const g of GROUPES_OS) if (g.test ? g.test(base) : g.bases.includes(base)) return g.id; return null; };
export const nomGroupe = id => { const g = GROUPES_OS.find(x => x.id === id); return g ? g.nom : id; };
