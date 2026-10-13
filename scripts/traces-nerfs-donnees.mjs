// Données des tracés de nerfs (langage décrit dans traces-nerfs.mjs). Chaque tracé : id (celui de l'application), rayon (m), sym, membre, et soit `pts` (une ligne), soit `lignes` [{ pts, r }] (plexus : racines puis tronc).
// Les points s'appuient sur des structures réelles de BodyParts3D (artères, os, muscles) ; les décalages en mètres placent le nerf à côté de la structure (nerf médian à 4 mm de l'artère brachiale…).
// Description anatomique : Gray's Anatomy (1918), Névrologie ; le tracé reste schématique.
const racinesPlexusBrachial = [['fifth cervical vertebra', 0.0], ['sixth cervical vertebra', 0.0], ['seventh cervical vertebra', 0.0], ['seventh cervical vertebra', -0.012], ['first thoracic vertebra', 0.0]];

export const NERFS_TRACES = [
  { id: 'plexus-brachial', r: .0022, sym: true, membre: null, lignes: [
    ...racinesPlexusBrachial.map(([v, dy], i) => ({ r: .0016, pts: [['c', v, [0.022, dy, -0.006]], ['c', '{c} scalenus anterior', [0.016 + 0.002 * i, -0.012 + 0.003 * (2 - i), -0.014]], ['c', '{c} first rib', [0.02, 0.016, 0.0]]] })),
    { r: .0042, pts: [['c', '{c} first rib', [0.02, 0.016, 0.0]], ['c', '{c} clavicle', [0.004, -0.014, -0.006]], ['l', '{c} axillary artery', 0.0, 0.5, [-0.003, 0.004, 0.0], 3]] }
  ] },
  { id: 'nerf-musculo-cutane', r: .0025, sym: true, membre: 'MS',
    pts: [['l', '{c} axillary artery', 0.5, 1.0, [0.006, 0.0, 0.004], 2], ['c', '{c} coracobrachialis', [0.0, 0.0, 0.0]], ['l', '{c} brachialis', 0.0, 1.0, [0.0, 0.0, 0.01], 4], ['x', '{c} radius', 'y', 'max', [0.02, 0.0, 0.015]]] },
  { id: 'nerf-axillaire', r: .0028, sym: true, membre: 'MS',
    pts: [['l', '{c} axillary artery', 0.6, 0.9, [0.0, 0.0, -0.02], 2], ['x', '{c} humerus', 'y', 'max', [0.0, -0.04, -0.028]], ['c', '{c} deltoid', [0, 0, -0.01]]] },
  { id: 'nerf-radial', r: .0032, sym: true, membre: 'MS',
    pts: [['l', '{c} axillary artery', 0.6, 1.0, [-0.004, 0.0, -0.012], 2], ['l', '{c} humerus', 0.45, 0.8, [0.0, 0.0, -0.016], 3], ['x', '{c} humerus', 'y', 'min', [0.016, 0.02, 0.022]], ['l', '{c} radial artery', 0.0, 0.8, [0.008, 0.0, 0.0], 5], ['c', '{c} capitate', [0.005, 0.0, -0.014]]] },
  { id: 'nerf-median', r: .0034, sym: true, membre: 'MS',
    pts: [['l', '{c} axillary artery', 0.4, 1.0, [-0.002, 0.0, 0.0], 3], ['l', '{c} brachial artery', 0.0, 1.0, [-0.004, 0.0, 0.0], 6], ['l', '{c} ulnar artery', 0.0, 0.3, [-0.006, 0.0, 0.0], 2], ['c', '{c} capitate', [-0.004, 0.01, 0.014]], ['c', '{c} capitate', [-0.003, -0.025, 0.014]]] },
  { id: 'nerf-ulnaire', r: .003, sym: true, membre: 'MS',
    pts: [['l', '{c} axillary artery', 0.4, 1.0, [-0.008, 0.0, -0.004], 3], ['l', '{c} brachial artery', 0.0, 0.85, [-0.008, 0.0, -0.006], 5], ['x', '{c} humerus', 'x', 'min', [-0.004, 0.0, -0.012]], ['l', '{c} ulnar artery', 0.2, 1.0, [0.004, 0.0, 0.004], 5], ['c', '{c} pisiform', [0.004, 0.0, 0.0]], ['c', '{c} hamate', [0.0, -0.02, 0.012]]] },
  { id: 'plexus-lombaire', r: .0022, sym: true, membre: null, lignes:
    ['second lumbar vertebra', 'third lumbar vertebra', 'fourth lumbar vertebra'].map((v, i) => ({ r: .0018, pts: [['c', v, [0.024, 0.0, -0.01]], ['c', '{c} psoas major', [0.002 + 0.002 * i, 0.07 - 0.035 * i, 0.0]], ['c', '{c} psoas major', [0.01, -0.07, 0.025]]] })) },
  { id: 'nerf-femoral', r: .0042, sym: true, membre: 'MI',
    pts: [['c', '{c} psoas major', [0.014, -0.035, 0.0]], ['c', '{c} psoas major', [0.014, -0.11, 0.03]], ['l', '{c} femoral artery', 0.0, 0.85, [0.012, 0.0, 0.002], 6]] },
  { id: 'nerf-obturateur', r: .003, sym: true, membre: 'MI',
    pts: [['c', '{c} psoas major', [-0.012, -0.03, 0.0]], ['c', '{c} obturator externus', [0.0, 0.01, 0.0]], ['c', '{c} adductor brevis', [0.0, 0.0, 0.0]], ['c', '{c} adductor longus', [0.0, -0.02, -0.008]]] },
  { id: 'plexus-sacre', r: .0022, sym: true, membre: null, lignes:
    [['fifth lumbar vertebra', 0.0, 0.0], ['sacrum', 0.04, 0.012], ['sacrum', 0.005, 0.012], ['sacrum', -0.025, 0.012]].map(([v, dy, dx], i) => ({ r: .0022, pts: [['c', v, [0.03 + dx, dy, 0.012]], ['c', '{c} piriformis', [-0.02, 0.0, 0.002 * i]], ['c', '{c} piriformis', [0.014, -0.012, -0.006]]] })) },
  { id: 'nerf-sciatique', r: .0065, sym: true, membre: 'MI',
    pts: [['c', '{c} piriformis', [0.014, -0.012, -0.006]], ['c', '{c} quadratus femoris', [-0.004, 0.0, -0.014]], ['l', '{c} adductor magnus', 0.25, 0.8, [0.0, 0.0, -0.032], 4], ['l', '{c} popliteal artery', 0.5, 1.0, [-0.002, 0.0, -0.014], 2]] },
  { id: 'nerf-tibial', r: .0045, sym: true, membre: 'MI',
    pts: [['l', '{c} popliteal artery', 0.5, 1.0, [-0.002, 0.0, -0.014], 2], ['l', '{c} posterior tibial artery', 0.0, 0.95, [0.0, 0.0, -0.008], 6], ['c', '{c} calcaneus', [-0.01, 0.01, 0.0]], ['c', '{c} calcaneus', [-0.004, 0.0, 0.03]]] },
  { id: 'nerf-fibulaire-commun', r: .0036, sym: true, membre: 'MI',
    pts: [['l', '{c} popliteal artery', 0.55, 1.0, [0.014, 0.0, -0.012], 2], ['x', '{c} fibula', 'y', 'max', [0.0, -0.025, -0.008]], ['x', '{c} fibula', 'y', 'max', [0.004, -0.045, 0.018]], ['l', '{c} anterior tibial artery', 0.1, 0.8, [0.004, 0.0, 0.0], 4]] },
  { id: 'nerf-phrenique', r: .0022, sym: true, membre: null,
    pts: [['c', '{c} scalenus anterior', [0.0, 0.035, 0.0]], ['c', '{c} scalenus anterior', [-0.002, -0.03, 0.004]], ['l', '{c} brachiocephalic vein', 0.2, 1.0, [0.0, 0.0, 0.0], 2], ['c', 'diaphragm', [0.045, 0.02, 0.02]]] },
  { id: 'nerf-vague', r: .003, sym: true, membre: null,
    pts: [['x', '{c} temporal bone', 'y', 'min', [-0.006, 0.0, -0.004]], ['l', '{c} common carotid artery', 0.0, 1.0, [0.0, 0.0, -0.01], 4], ['x', 'arch of aorta', 'y', 'max', [0.0, -0.01, 0.0]], ['l', 'esophagus', 0.0, 1.0, [0.0, 0.0, 0.012], 5]] }
];
