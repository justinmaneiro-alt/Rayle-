/* ═════════════ DONNÉES : ORGANES ET NERFS HAUTE FIDÉLITÉ (BodyParts3D) ═════════════
   Ligne : [id, nom français, latin (Terminologia Anatomica), région, [concepts], remplace?]. Concept : « nom » (arbre « est un », fichiers isa) · « p:nom » (arbre « fait partie de », concept entier)
   · « pp:nom » (arbre « fait partie de », seulement les fichiers propres du concept) · « pd:nom|filtre » (arbre « fait partie de », fichiers propres de tous les descendants dont le nom vérifie le filtre : le parenchyme d'un poumon = ses segments broncho-pulmonaires).
   Si l'id est celui d'un organe schématique de donnees-nerfs-organes.js, le modèle haute fidélité le remplace (même identifiant, même fiche) ; sinon c'est une structure nouvelle.
   BodyParts3D n'a ni thyroïde, ni moelle spinale, ni nerfs périphériques : ces structures restent celles du modèle schématique. */
const G = n => ['left ', 'right '].map(c => c + n);

/** Cortex cérébral : les circonvolutions de BodyParts3D, hémisphères gauche et droit */
const CORTEX = ['superior frontal gyrus', 'middle frontal gyrus', 'inferior frontal gyrus', 'precentral gyrus', 'postcentral gyrus', 'supramarginal gyrus', 'angular gyrus',
  'superior parietal lobule', 'middle temporal gyrus', 'inferior temporal gyrus', 'fusiform gyrus', 'parahippocampal gyrus', 'cingulate gyrus', 'insula', 'occipital lobe']
  .flatMap(G).concat(['orbital gyrus', 'anterior part of left superior temporal gyrus', 'posterior part of left superior temporal gyrus', 'anterior part of right superior temporal gyrus', 'posterior part of right superior temporal gyrus']);

export const ORGANES_HD = [
  ['encephale', 'Encéphale', 'Encephalon', 'Tête', CORTEX.concat(['cerebellum', 'pons', 'medulla oblongata', 'midbrain'])],
  ['coeur', 'Cœur', 'Cor', 'Thorax', ['wall of atrium', 'wall of ventricle']],
  ['poumon-droit', 'Poumon droit', 'Pulmo dexter', 'Thorax', ['pd:right lung|bronchopulmonary segment|^upper lobe']],
  ['poumon-gauche', 'Poumon gauche', 'Pulmo sinister', 'Thorax', ['pd:left lung|bronchopulmonary segment']],
  ['foie', 'Foie', 'Hepar', 'Abdomen', ['pd:liver|hepatovenous segment|caudate lobe']],
  ['estomac', 'Estomac', 'Gaster', 'Abdomen', ['stomach']],
  ['rate', 'Rate', 'Splen', 'Abdomen', ['spleen']],
  ['pancreas', 'Pancréas', 'Pancreas', 'Abdomen', ['pancreas']],
  ['rein-droit', 'Rein droit', 'Ren dexter', 'Abdomen', ['right kidney']],
  ['rein-gauche', 'Rein gauche', 'Ren sinister', 'Abdomen', ['left kidney']],
  ['intestin-grele', 'Intestin grêle', 'Intestinum tenue', 'Abdomen', ['duodenum', 'proximal part of jejunum', 'middle part of jejunum', 'distal part of jejunum', 'proximal part of ileum', 'middle part of ileum', 'distal part of ileum']],
  ['colon', 'Côlon et rectum', 'Colon et rectum', 'Abdomen', ['ascending colon', 'transverse colon', 'descending colon', 'rectum', 'appendix']],
  ['vessie', 'Vessie', 'Vesica urinaria', 'Bassin', ['urinary bladder']],
  ['trachee', 'Trachée et bronches souches', 'Trachea et bronchi principales', 'Thorax', ['trachea', 'left main bronchus', 'right main bronchus proper']],
  // ── structures nouvelles ──
  ['oesophage', 'Œsophage', 'Oesophagus', 'Thorax', ['esophagus']],
  ['vesicule-biliaire', 'Vésicule biliaire', 'Vesica biliaris', 'Abdomen', ['gallbladder', 'cystic duct']],
  ['voies-biliaires', 'Voies biliaires extra-hépatiques', 'Viae biliferae extrahepaticae', 'Abdomen', ['common hepatic duct', 'bile duct', 'left hepatic duct']],
  ['surrenale-droite', 'Glande surrénale droite', 'Glandula suprarenalis dextra', 'Abdomen', ['right adrenal gland']],
  ['surrenale-gauche', 'Glande surrénale gauche', 'Glandula suprarenalis sinistra', 'Abdomen', ['left adrenal gland']],
  ['langue', 'Langue', 'Lingua', 'Tête', ['tongue']],
  ['larynx-cartilages', 'Cartilages du larynx', 'Cartilagines laryngis', 'Cou', ['thyroid cartilage', 'cricoid cartilage', 'epiglottis', 'left arytenoid cartilage', 'right arytenoid cartilage']],
  ['hypophyse', 'Hypophyse', 'Hypophysis', 'Tête', ['pituitary gland']],
  ['corps-calleux', 'Corps calleux', 'Corpus callosum', 'Tête', ['corpus callosum']],
  ['thalamus', 'Thalamus', 'Thalamus', 'Tête', ['left thalamus', 'right thalamus']]
];

/** Nerfs de BodyParts3D (région orbitaire seulement : BodyParts3D n'a aucun autre nerf périphérique) : [id, nom, latin, région, [concepts]] */
export const NERFS_HD = [
  // tracés reconstitués (scripts/traces-nerfs.mjs) : aucun concept BodyParts3D ; [id, nom, latin, région, [], membre]
  ['plexus-brachial', 'Plexus brachial', 'Plexus brachialis', 'Épaule', [], null],
  ['nerf-musculo-cutane', 'Nerf musculo-cutané', 'Nervus musculocutaneus', 'Bras', [], 'MS'],
  ['nerf-axillaire', 'Nerf axillaire (circonflexe)', 'Nervus axillaris', 'Épaule', [], 'MS'],
  ['nerf-radial', 'Nerf radial', 'Nervus radialis', 'Bras', [], 'MS'],
  ['nerf-median', 'Nerf médian', 'Nervus medianus', 'Bras', [], 'MS'],
  ['nerf-ulnaire', 'Nerf ulnaire (cubital)', 'Nervus ulnaris', 'Bras', [], 'MS'],
  ['plexus-lombaire', 'Plexus lombaire', 'Plexus lumbalis', 'Abdomen', [], null],
  ['nerf-femoral', 'Nerf fémoral', 'Nervus femoralis', 'Cuisse', [], 'MI'],
  ['nerf-obturateur', 'Nerf obturateur', 'Nervus obturatorius', 'Bassin', [], 'MI'],
  ['plexus-sacre', 'Plexus sacré', 'Plexus sacralis', 'Bassin', [], null],
  ['nerf-sciatique', 'Nerf sciatique (ischiatique)', 'Nervus ischiadicus', 'Cuisse', [], 'MI'],
  ['nerf-tibial', 'Nerf tibial', 'Nervus tibialis', 'Jambe', [], 'MI'],
  ['nerf-fibulaire-commun', 'Nerf fibulaire commun', 'Nervus fibularis communis', 'Jambe', [], 'MI'],
  ['nerf-phrenique', 'Nerf phrénique', 'Nervus phrenicus', 'Cou', [], null],
  ['nerf-vague', 'Nerf vague (X)', 'Nervus vagus', 'Cou', [], null],
  // BodyParts3D : nerfs de l'orbite
  ['nerf-optique', 'Nerf optique (II), chiasma et tractus optiques', 'Nervus opticus, chiasma opticum, tractus opticus', 'Tête', ['left optic nerve', 'right optic nerve', 'optic chiasm', 'left optic tract', 'right optic tract']],
  ['nerf-trochleaire', 'Nerf trochléaire (IV)', 'Nervus trochlearis', 'Tête', ['left trochlear nerve', 'right trochlear nerve']],
  ['nerf-ophtalmique', 'Nerf ophtalmique (V1) et ses branches', 'Nervus ophthalmicus', 'Tête', ['left ophthalmic nerve', 'right ophthalmic nerve', 'left nasociliary nerve', 'right nasociliary nerve', 'left frontal nerve', 'right frontal nerve', 'left lacrimal nerve', 'right lacrimal nerve', 'left supra-orbital nerve', 'right supra-orbital nerve', 'left supratrochlear nerve', 'right supratrochlear nerve']]
];
