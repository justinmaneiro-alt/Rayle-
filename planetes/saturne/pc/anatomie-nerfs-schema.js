/* ═════════════ ANATOMIE : NERFS PÉRIPHÉRIQUES, REPRÉSENTATION SCHÉMATIQUE (Phase D, module pur) ═════════════
   Le modèle BodyParts3D ne contient AUCUN nerf rachidien ni périphérique. Aucune source libre compatible (CC) couvrant ces nerfs n'a été intégrée dans cette mission : ce module
   définit donc des TRACÉS SCHÉMATIQUES (tubes passant par des repères osseux : articulations du corps articulé), étiquetés « schéma, tracé approximatif » partout.
   JAMAIS un modèle anatomique exact : le trajet réel varie, seuls les rapports classiques sont respectés (ex. nerf ulnaire derrière l'épicondyle médial, nerf radial dans la gouttière
   du radial, nerf sciatique derrière la cuisse, nerf fibulaire commun contre le col de la fibula). Les fiches (territoires, déficits) sont rédigées de mémoire d'anatomie classique :
   niveau de confiance « schématique », À VÉRIFIER avec le cours / un atlas. Ancrages : [repère, dx, dy, dz] (dx > 0 vers l'extérieur du côté, dz > 0 vers l'avant, mètres) ou
   ['mid', repère1, repère2, t, dx, dy, dz] (point à la fraction t du segment entre deux repères). */
export const MENTION_SCHEMA = 'Schéma, tracé approximatif : ce tube n’est pas un modèle anatomique exact (le modèle 3D ne contient aucun nerf périphérique).';
const m = (a, b, t, dx = 0, dy = 0, dz = 0) => ['mid', a, b, t, dx, dy, dz];
export const NERFS = [
  { id: 'plexus_brachial', nom: 'Plexus brachial', latin: 'Plexus brachialis', membre: 'supérieur', rayon: 0.0055, couleur: 0xf0d878,
    points: [['cervicale', 0.03, -0.035, 0.0], ['cervicale', 0.07, -0.055, 0.012], ['epaule', -0.045, 0.01, 0.025], ['epaule', -0.035, -0.04, 0.005]],
    racines: 'C5, C6, C7, C8, T1', trajet: 'Naît des racines C5 à T1, passe entre les muscles scalènes antérieur et moyen, au-dessus de la clavicule, puis dans le creux axillaire où il se divise en nerfs terminaux.',
    moteur: 'Tous les muscles du membre supérieur (par ses branches), muscles de la ceinture scapulaire.', sensitif: 'Peau du membre supérieur sauf le moignon de l’épaule (C4) et la face médiale du bras haut (T2).',
    clinique: 'Paralysie obstétricale (Erb-Duchenne C5-C6 : bras en rotation interne, pronation ; Klumpke C8-T1 : main en griffe) ; atteinte traumatique (chute de moto, luxation d’épaule) ; syndrome du défilé thoraco-brachial.', orthese: 'Orthèse d’épaule et de coude, attelles de poignet et de main dans la rééducation des paralysies ; prothèse après amputation. À titre informatif.' },
  { id: 'axillaire', nom: 'Nerf axillaire', latin: 'Nervus axillaris', membre: 'supérieur', rayon: 0.0032, couleur: 0xf0d878,
    points: [['epaule', -0.035, -0.045, -0.005], ['epaule', -0.01, -0.045, -0.04], ['epaule', 0.03, -0.03, -0.03], ['epaule', 0.04, -0.005, 0.005]],
    racines: 'C5, C6', trajet: 'Branche du faisceau postérieur ; traverse le quadrilatère huméro-tricipital, contourne le col chirurgical de l’humérus puis se distribue au deltoïde et au petit rond.',
    moteur: 'Deltoïde, petit rond.', sensitif: 'Peau de la face latérale de l’épaule (« patch de l’épaulette »).',
    clinique: 'Paralysie après luxation antéro-inférieure de l’épaule ou fracture du col chirurgical : abduction impossible au-delà de 15°, amyotrophie du deltoïde, anesthésie du moignon de l’épaule.', orthese: 'Orthèse d’abduction/de maintien de l’épaule (coussin d’abduction) en phase aiguë. À titre informatif.' },
  { id: 'musculo_cutane', nom: 'Nerf musculo-cutané', latin: 'Nervus musculocutaneus', membre: 'supérieur', rayon: 0.003, couleur: 0xf0d878,
    points: [['epaule', -0.035, -0.045, 0.012], m('epaule', 'coude', 0.4, -0.012, 0, 0.022), ['coude', 0.012, 0.0, 0.032], m('coude', 'poignet', 0.5, 0.03, 0, 0.012)],
    racines: 'C5, C6, C7', trajet: 'Traverse le coraco-brachial, passe entre le biceps et le brachial, puis devient le nerf cutané latéral de l’avant-bras.',
    moteur: 'Coraco-brachial, biceps brachial, brachial.', sensitif: 'Peau de la face latérale de l’avant-bras.',
    clinique: 'Atteinte : flexion du coude très affaiblie (reste le brachio-radial), perte du réflexe bicipital, anesthésie latérale de l’avant-bras.', orthese: 'Orthèse de coude articulée ou prothèse de coude après reconstruction. À titre informatif.' },
  { id: 'median', nom: 'Nerf médian', latin: 'Nervus medianus', membre: 'supérieur', rayon: 0.0042, couleur: 0xf0d878,
    points: [['epaule', -0.038, -0.05, 0.005], m('epaule', 'coude', 0.6, -0.018, 0, 0.004), ['coude', -0.012, 0.0, 0.022], m('coude', 'poignet', 0.5, -0.004, 0, 0.012), ['poignet', 0.0, 0.0, 0.012], ['poignet', 0.0, -0.07, 0.016]],
    racines: 'C6, C7, C8, T1', trajet: 'Descend avec l’artère brachiale à la face médiale du bras, passe entre les chefs du rond pronateur, descend entre les fléchisseurs, traverse le canal carpien jusqu’à la main.',
    moteur: 'Fléchisseurs de l’avant-bras (sauf fléchisseur ulnaire du carpe et moitié du fléchisseur profond), rond et carré pronateurs, muscles de l’éminence thénar et deux premiers lombricaux.', sensitif: 'Face palmaire du pouce, de l’index, du majeur et moitié latérale de l’annulaire.',
    clinique: 'Syndrome du canal carpien (compression au poignet : fourmillements, perte d’opposition du pouce) ; atteinte haute : main de bénédiction à la demande de serrer le poing, perte de la pronation.', orthese: 'Orthèse de repos de poignet en position neutre (nuit) dans le canal carpien ; orthèse d’opposition du pouce dans les paralysies. À titre informatif.' },
  { id: 'ulnaire', nom: 'Nerf ulnaire', latin: 'Nervus ulnaris', membre: 'supérieur', rayon: 0.0038, couleur: 0xf0d878,
    points: [['epaule', -0.04, -0.055, -0.005], m('epaule', 'coude', 0.7, -0.032, 0, -0.02), ['coude', -0.026, 0.0, -0.032], m('coude', 'poignet', 0.6, -0.014, 0, 0.0), ['poignet', -0.016, 0.0, 0.0], ['poignet', -0.022, -0.07, 0.0]],
    racines: 'C8, T1', trajet: 'Descend à la face médiale du bras, passe dans la gouttière derrière l’épicondyle médial (« petit os »), puis le long de l’avant-bras et dans le canal de Guyon au poignet.',
    moteur: 'Fléchisseur ulnaire du carpe, moitié médiale du fléchisseur profond des doigts, muscles hypothénar, interosseux, deux derniers lombricaux, adducteur du pouce.', sensitif: 'Face palmaire et dorsale du petit doigt et moitié médiale de l’annulaire.',
    clinique: 'Compression au coude (syndrome de la gouttière épitrochléo-olécrânienne) ; main en griffe ulnaire (4e et 5e doigts), signe de Froment (adduction du pouce impossible), perte de l’écartement des doigts.', orthese: 'Orthèse anti-griffe (blocage des articulations métacarpo-phalangiennes en flexion), orthèse de coude nocturne. À titre informatif.' },
  { id: 'radial', nom: 'Nerf radial', latin: 'Nervus radialis', membre: 'supérieur', rayon: 0.0042, couleur: 0xf0d878,
    points: [['epaule', -0.034, -0.055, -0.015], m('epaule', 'coude', 0.4, 0.0, 0, -0.03), m('epaule', 'coude', 0.8, 0.028, 0, -0.005), ['coude', 0.026, 0.0, 0.02], m('coude', 'poignet', 0.4, 0.022, 0, -0.012), ['poignet', 0.02, 0.0, -0.015]],
    racines: 'C5, C6, C7, C8, T1', trajet: 'Naît du faisceau postérieur, passe derrière l’humérus dans la gouttière radiale, traverse la cloison intermusculaire latérale, puis se divise au coude en branche profonde (motrice) et superficielle (sensitive).',
    moteur: 'Triceps, anconé, brachio-radial, extenseurs du poignet et des doigts, long abducteur et extenseurs du pouce, supinateur.', sensitif: 'Face dorsale du bras et de l’avant-bras, face dorsale de la main côté pouce (tabatière anatomique).',
    clinique: 'Paralysie du radial (fracture de la diaphyse humérale, « paralysie du samedi soir ») : main tombante, impossibilité d’étendre poignet, doigts et pouce ; le triceps est épargné si l’atteinte est basse.', orthese: 'Orthèse de poignet en extension avec releveurs des doigts (orthèse de Levis) pour la main tombante. À titre informatif.' },
  { id: 'plexus_lombo_sacre', nom: 'Plexus lombo-sacré', latin: 'Plexus lumbosacralis', membre: 'inférieur', rayon: 0.0055, couleur: 0xf0d878,
    points: [['toracolombaire', 0.025, 0.0, 0.0], ['lombo-sacree', 0.03, 0.02, 0.0], ['lombo-sacree', 0.025, -0.05, -0.012], ['hanche', -0.02, 0.0, -0.03]],
    racines: 'T12-L4 (plexus lombaire), L4-S4 (plexus sacré)', trajet: 'Le plexus lombaire se forme dans le muscle psoas ; le plexus sacré se forme devant le piriforme et sort du bassin par le foramen sciatique.',
    moteur: 'Muscles du membre inférieur et des fessiers, par les nerfs fémoral, obturateur, sciatique, glutéaux.', sensitif: 'Peau du membre inférieur et de la région fessière.',
    clinique: 'Atteinte par tumeur pelvienne, hématome du psoas, traumatisme du bassin ; radiculopathies L4, L5, S1 (sciatiques, cruralgies).', orthese: 'Orthèse de membre inférieur (releveur du pied, genou verrouillé) selon le déficit. À titre informatif.' },
  { id: 'femoral', nom: 'Nerf fémoral', latin: 'Nervus femoralis', membre: 'inférieur', rayon: 0.0042, couleur: 0xf0d878,
    points: [['lombo-sacree', 0.03, 0.02, 0.0], ['hanche', -0.012, 0.03, 0.028], m('hanche', 'genou', 0.5, -0.012, 0, 0.03), ['genou', -0.022, 0.0, 0.03]],
    racines: 'L2, L3, L4', trajet: 'Descend dans la gouttière entre psoas et iliaque, passe sous le ligament inguinal en dehors de l’artère fémorale puis se divise ; sa branche terminale est le nerf saphène.',
    moteur: 'Quadriceps, sartorius, pectiné, iliaque.', sensitif: 'Face antérieure de la cuisse, face médiale de la jambe (nerf saphène).',
    clinique: 'Paralysie du fémoral (diabète, hématome du psoas, chirurgie de hanche) : extension du genou impossible, dérobement du genou, perte du réflexe rotulien.', orthese: 'Orthèse de genou verrouillable en extension (orthèse articulée à verrouillage). À titre informatif.' },
  { id: 'obturateur', nom: 'Nerf obturateur', latin: 'Nervus obturatorius', membre: 'inférieur', rayon: 0.003, couleur: 0xf0d878,
    points: [['lombo-sacree', 0.03, -0.01, 0.0], ['hanche', -0.05, -0.02, 0.0], m('hanche', 'genou', 0.3, -0.032, 0, 0.0), m('hanche', 'genou', 0.6, -0.036, 0, -0.012)],
    racines: 'L2, L3, L4', trajet: 'Descend le long du bord médial du psoas, traverse le canal obturateur du bassin et se distribue aux adducteurs.',
    moteur: 'Adducteurs de la cuisse (long, court, grand adducteur), gracile, obturateur externe.', sensitif: 'Face médiale de la cuisse.',
    clinique: 'Atteinte (hernie obturatrice, chirurgie pelvienne) : adduction affaiblie, démarche en circumduction, douleur médiale de la cuisse.', orthese: 'Aides à la marche ; orthèse spécifique rare. À titre informatif.' },
  { id: 'sciatique', nom: 'Nerf sciatique', latin: 'Nervus ischiadicus', membre: 'inférieur', rayon: 0.0058, couleur: 0xf0d878,
    points: [['hanche', -0.022, 0.0, -0.05], ['hanche', -0.012, -0.06, -0.05], m('hanche', 'genou', 0.5, 0.0, 0, -0.036), m('hanche', 'genou', 0.9, 0.0, 0, -0.03)],
    racines: 'L4, L5, S1, S2, S3', trajet: 'Sort du bassin sous le piriforme (foramen sous-piriforme), descend derrière le fémur sous les ischio-jambiers et se divise au-dessus du creux poplité en nerfs tibial et fibulaire commun.',
    moteur: 'Ischio-jambiers (par ses branches), tous les muscles de la jambe et du pied par ses branches terminales.', sensitif: 'Presque toute la jambe et le pied (sauf face médiale : nerf saphène).',
    clinique: 'Sciatique (compression de racine L5 ou S1 par hernie discale : douleur en bande du fessier au pied), lésion lors d’une injection fessière ou d’une prothèse de hanche : pied tombant et perte de la flexion du genou.', orthese: 'Orthèse releveuse de pied (AFO) pour la paralysie du fibulaire commun et du tibial. À titre informatif.' },
  { id: 'tibial', nom: 'Nerf tibial', latin: 'Nervus tibialis', membre: 'inférieur', rayon: 0.0045, couleur: 0xf0d878,
    points: [m('hanche', 'genou', 0.9, 0.0, 0, -0.03), ['genou', 0.0, 0.0, -0.03], m('genou', 'cheville', 0.5, -0.004, 0, -0.03), ['cheville', -0.03, 0.0, -0.012], ['cheville', -0.025, -0.045, 0.0]],
    racines: 'L4, L5, S1, S2, S3', trajet: 'Traverse le creux poplité, passe sous le soléaire, derrière la malléole médiale (canal tarsien) et se divise en nerfs plantaires médial et latéral.',
    moteur: 'Triceps sural, poplité, tibial postérieur, fléchisseurs des orteils, muscles plantaires.', sensitif: 'Face postérieure de la jambe, plante du pied.',
    clinique: 'Paralysie : flexion plantaire impossible (marche sur la pointe), perte du réflexe achilléen ; syndrome du canal tarsien : douleurs de la plante.', orthese: 'Orthèse pour talus du pied ; orthèses plantaires. À titre informatif.' },
  { id: 'fibulaire_commun', nom: 'Nerf fibulaire commun', latin: 'Nervus fibularis communis', membre: 'inférieur', rayon: 0.0042, couleur: 0xf0d878,
    points: [m('hanche', 'genou', 0.9, 0.0, 0, -0.03), ['genou', 0.042, 0.0, -0.022], m('genou', 'cheville', 0.3, 0.046, 0, 0.0), m('genou', 'cheville', 0.7, 0.026, 0, 0.03), ['cheville', 0.0, 0.0, 0.042]],
    racines: 'L4, L5, S1, S2', trajet: 'Longe le bord médial du biceps fémoral, contourne le col de la fibula (point de compression superficiel) et se divise en nerfs fibulaires superficiel et profond.',
    moteur: 'Tibial antérieur, extenseurs des orteils et de l’hallux, fibulaires long et court.', sensitif: 'Face latérale de la jambe, dos du pied.',
    clinique: 'Paralysie (compression au col de la fibula : plâtre, jambes croisées, orthèse mal ajustée) : pied tombant (steppage), perte de la dorsiflexion et de l’éversion, anesthésie du dos du pied.', orthese: 'Orthèse releveuse (AFO à lame postérieure) pour le pied tombant. À titre informatif.' }
];
/* La moelle spinale : un seul tracé médian derrière les corps vertébraux (repères du rachis). */
export const MOELLE = { id: 'moelle_spinale', nom: 'Moelle spinale', latin: 'Medulla spinalis', membre: 'axe', rayon: 0.006, couleur: 0xe9e3b0, points: [['cervicale', 0, 0.0, -0.016], ['toracolombaire', 0, 0.0, -0.016], ['lombo-sacree', 0, 0.065, -0.012]],
  racines: 'C1 à S5', trajet: 'Dans le canal vertébral, du foramen magnum au cône médullaire (niveau L1-L2) ; au-dessous, la queue de cheval.', moteur: 'Voies motrices vers tous les muscles.', sensitif: 'Voies sensitives de tout le corps.',
  clinique: 'Lésions médullaires : tétraplégie (cervicale), paraplégie (thoracique, lombaire) ; syndrome de la queue de cheval (compression lombaire basse). Tracé très schématique : la moelle s’arrête vers L1-L2.', orthese: 'Orthèses de marche (RGO, orthèses de membre inférieur), verticalisation, fauteuil. À titre informatif.' };

/* Résolution des ancrages en points 3D (repère du modèle) pour un côté S ('D', 'G' ou '' pour l'axe). pivots : corps.pivots ; lat(S) : signe de x du côté ; a : sens de l'avant. */
export function resoudre(nerf, S, { pivots, lat, a }) {
  const l = S ? lat(S) : 1, nomPivot = n => (/^(cervicale|toracolombaire|lombo-sacree)$/.test(n) ? n : n + S), P = n => pivots[nomPivot(n)];
  return nerf.points.map(pt => {
    if (pt[0] === 'mid') { const [, n1, n2, t, dx, dy, dz] = pt, A = P(n1), B = P(n2); return [A[0] + (B[0] - A[0]) * t + l * dx, A[1] + (B[1] - A[1]) * t + dy, A[2] + (B[2] - A[2]) * t + a * dz]; }
    const [n, dx, dy, dz] = pt, p = P(n); return [p[0] + l * dx, p[1] + dy, p[2] + a * dz];
  });
}
/* Fiche au format de anatomie-savoirs (rubriques : description, repères, muscles, clinique) : confiance « schématique ». */
export function ficheNerf(n) {
  return { type: 'nerf périphérique (schéma)', description: n.trajet + ' Territoire sensitif : ' + n.sensitif, reperes: ['Racines : ' + n.racines], articulations: [], muscles: ['Territoire moteur : ' + n.moteur], clinique: n.clinique + ' ' + n.orthese };
}
export const nomPiece = (n, S) => ({ fr: n.nom + (S ? (S === 'D' ? ' (droit)' : ' (gauche)') : ''), la: n.latin, en: n.nom + (S ? (S === 'D' ? ' (right)' : ' (left)') : '') + ' [schematic]' });
