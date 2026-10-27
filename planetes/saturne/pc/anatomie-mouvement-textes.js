/* ═════════════ ANATOMIE : TEXTES EXPLICATIFS DES MOUVEMENTS (Phase B et C) ═════════════
   Pour chaque mouvement de anatomie-mouvements2.js : explication courte, étapes, amplitudes de référence (goniométrie classique) et valeurs utilisées dans l'animation, mécanisme,
   conséquences fonctionnelles, rôle de l'appareillage (À TITRE INFORMATIF : le choix d'une orthèse ou d'une prothèse relève du médecin et de l'orthoprothésiste).
   Contenu pédagogique rédigé d'après l'anatomie et la biomécanique classiques (programme de BTS prothésiste-orthésiste), SANS manuel sous la main : à VÉRIFIER avec le cours / un atlas.
   Les amplitudes « animation » sont celles du code (voir mouvements2-test.mjs : chaque image est comparée aux amplitudes de référence). */
const a = (articulation, mouvement, reference, utilise) => ({ articulation, mouvement, reference, utilise });
export const MOUVEMENTS_TEXTES = {
  marche: {
    explication: 'Cycle de marche : le talon touche le sol, le poids passe sur le pied, la jambe se tend puis pousse, enfin la jambe passe en avant. Les bras balancent en sens inverse des jambes.',
    etapes: ['Contact du talon : hanche fléchie d’environ 25°, genou presque tendu, cheville à zéro.', 'Mise en charge : le genou fléchit de 15° environ pour amortir, le quadriceps freine.', 'Appui unipodal : le moyen fessier maintient le bassin horizontal.', 'Poussée : la hanche s’étend, le talon se lève, le triceps sural pousse.', 'Phase pendulaire : le psoas et le droit fémoral avancent la jambe, le genou fléchit jusqu’à 60°, le tibial antérieur relève le pied.'],
    amplitude: 'hanche d’environ −10° à +30° ; genou jusqu’à 60° en phase pendulaire ; cheville de −15° à +10° (marche à vitesse libre)',
    amplitudes: [a('hanche', 'flexion / extension', '−10° à +30°', 'environ −10° à +30°'), a('genou', 'flexion', '0° à 60°', '0° à 55°'), a('cheville', 'flexion dorsale / plantaire', '−15° à +10°', 'environ −20° à +6°'), a('épaule', 'balancement', '±20°', '±22°')],
    mecanisme: 'Pendule inversé pendant l’appui (le bassin passe au-dessus du pied d’appui, avec une oscillation verticale d’environ 4 à 5 cm) et pendule simple pendant l’oscillation. Les pieds restent posés sans glisser : le sol défile sous le corps.',
    consequences: 'Une faiblesse du moyen fessier fait chuter le bassin du côté opposé (signe de Trendelenburg) ; une paralysie du tibial antérieur donne un pied tombant (steppage) ; une raideur du genou donne une marche en fauchage.',
    appareillage: 'Orthèse releveuse du pied pour le pied tombant ; prothèse de membre inférieur : le genou et le pied prothétiques reproduisent les phases d’appui et d’oscillation ; orthèses de genou ou de hanche selon la pathologie. À titre informatif.'
  },
  course: {
    explication: 'Course : comme la marche, avec une phase de vol où aucun pied ne touche le sol. Les bras, coudes fléchis à 90°, équilibrent la rotation du bassin.',
    etapes: ['Attaque du sol sur l’avant-pied ou le talon selon la vitesse.', 'Amortissement : genou fléchi, le quadriceps travaille en freinage (excentrique).', 'Poussée : extension de hanche, de genou et plantiflexion de cheville.', 'Phase de vol : le centre de gravité monte, les deux pieds sont en l’air.'],
    amplitude: 'hanche jusqu’à 20° d’extension et 50° de flexion ; genou jusqu’à 90° en oscillation ; cheville jusqu’à 35° de dorsiflexion à l’amortissement',
    amplitudes: [a('hanche', 'flexion / extension', '−20° à +60°', 'environ −20° à +45°'), a('genou', 'flexion', '0° à 100°', '0° à 90°'), a('coude', 'flexion', '70° à 110°', '80° à 105°')],
    mecanisme: 'Cycle étiré (muscle qui s’allonge puis se raccourcit) : les tendons stockent puis restituent de l’énergie élastique, surtout le tendon calcanéen. Le tronc s’incline légèrement vers l’avant.',
    consequences: 'Les contraintes sur le genou, la hanche et le pied sont plusieurs fois le poids du corps : tendinopathies, fractures de fatigue, syndrome de la bandelette ilio-tibiale.',
    appareillage: 'Prothèses de course (lame en carbone) pour l’amputé du membre inférieur ; semelles et orthèses plantaires pour répartir les appuis. À titre informatif.'
  },
  flexion_hanche: {
    explication: 'Flexion de la hanche droite, genou fléchi, en appui sur la jambe gauche : le poids passe d’abord sur la jambe gauche, puis la cuisse monte.',
    etapes: ['Le poids se déplace sur le pied gauche (le bassin glisse de côté).', 'Le psoas et l’iliaque fléchissent la hanche droite.', 'Le genou se fléchit pour raccourcir le levier.', 'Le moyen fessier gauche stabilise le bassin en appui unipodal.'],
    amplitude: 'flexion de hanche jusqu’à 120° (genou fléchi) ; ici 95°',
    amplitudes: [a('hanche', 'flexion', '0° à 120°', '0° à 95°'), a('genou', 'flexion', '0° à 140°', '0° à 85°')],
    mecanisme: 'Levier de troisième genre : l’ilio-psoas agit près de l’articulation, le poids du membre s’applique plus loin. En appui sur une jambe, le centre de gravité se place au-dessus du pied d’appui.',
    consequences: 'Un déficit du psoas rend la montée d’escalier et l’enjambée difficiles ; une raideur de hanche (arthrose) limite la flexion et le passage assis-debout.',
    appareillage: 'Aucune orthèse spécifique pour un mouvement normal ; en cas de faiblesse, orthèses de hanche ou aides techniques (cannes). À titre informatif.'
  },
  extension_hanche: {
    explication: 'Extension de la hanche droite : la jambe part en arrière, le bassin bascule légèrement vers l’avant pour compenser.',
    etapes: ['Transfert du poids sur la jambe gauche.', 'Le grand fessier et les ischio-jambiers tirent la cuisse en arrière.', 'Le ligament ilio-fémoral se tend et limite l’amplitude à environ 20°.'],
    amplitude: 'extension de hanche d’environ 20° ; ici 18°',
    amplitudes: [a('hanche', 'extension', '10° à 20°', '18°')],
    mecanisme: 'L’extension est freinée par les ligaments ilio-, pubo- et ischio-fémoraux ; au-delà, c’est le bassin et la colonne lombaire qui prennent le relais (hyperlordose).',
    consequences: 'Un flexum de hanche (hanche qui ne se tend plus) oblige à se pencher en avant ou à cambrer le rachis.',
    appareillage: 'Prothèse transfémorale : l’alignement de l’emboîture règle la stabilité en extension. À titre informatif.'
  },
  abduction_hanche: {
    explication: 'Abduction de la hanche droite : la jambe s’écarte sur le côté, en appui sur la jambe gauche.',
    etapes: ['Le poids passe sur la jambe gauche.', 'Le moyen et le petit fessier droits écartent la cuisse (environ 40°).', 'Les adducteurs sont étirés et limitent l’amplitude.', 'Le tronc s’incline un peu du côté d’appui.'],
    amplitude: 'abduction de hanche d’environ 45° ; ici 38°',
    amplitudes: [a('hanche', 'abduction', '0° à 45°', '0° à 38°')],
    mecanisme: 'Les abducteurs du côté d’appui (moyen et petit fessiers gauches) maintiennent le bassin horizontal ; ceux du côté libre déplacent la jambe.',
    consequences: 'Déficit des abducteurs : bassin qui tombe côté libre en appui monopodal (Trendelenburg) ; marche dandinante si bilatéral.',
    appareillage: 'Aides techniques (canne du côté opposé) ; prothèse de hanche : le bras de levier des abducteurs dépend du centre de rotation prothétique. À titre informatif.'
  },
  rotation_hanche: {
    explication: 'Rotation de la hanche droite, assis, hanche et genou à 90° : le pied se déplace de part et d’autre de la verticale.',
    etapes: ['Position assise : cuisse horizontale, jambe verticale, pied gauche posé.', 'Rotation externe : le pied se déplace vers l’intérieur (piriforme, obturateur interne, carré fémoral).', 'Rotation interne : le pied se déplace vers l’extérieur (petit et moyen fessiers antérieurs).'],
    amplitude: 'rotation externe 45°, interne 45° (hanche fléchie à 90°) ; ici ±30°',
    amplitudes: [a('hanche', 'rotation externe', '0° à 45°', '0° à 30°'), a('hanche', 'rotation interne', '0° à 45°', '0° à 30°')],
    mecanisme: 'La rotation se fait autour de l’axe du col du fémur dans l’acétabulum ; en position assise, elle déplace le pied (effet de levier du tibia).',
    consequences: 'La limitation de la rotation interne est un signe précoce d’arthrose de hanche ; en pédiatrie, l’antéversion fémorale modifie la rotation de repos.',
    appareillage: 'Orthèses de rotation (orthèse nocturne type Denis Browne) en pédiatrie ; coussin d’abduction après prothèse de hanche. À titre informatif.'
  },
  flexion_genou: {
    explication: 'Flexion du genou droit, en appui sur la jambe gauche : le talon monte vers la fesse.',
    etapes: ['Le poids passe sur la jambe gauche.', 'Les ischio-jambiers fléchissent le genou, aidés du gastrocnémien.', 'En fin de flexion, le tibia tourne légèrement (poplité) pour déverrouiller le genou.'],
    amplitude: 'flexion active environ 130°, passive jusqu’à 140-150° ; ici 125°',
    amplitudes: [a('genou', 'flexion', '0° à 140°', '0° à 125°'), a('hanche', 'flexion associée', '—', '0° à 8°')],
    mecanisme: 'Le fémur roule puis glisse sur le tibia (roulement-glissement) : cette complexité n’est pas simulée ici, le genou est une charnière simplifiée dont l’axe a été calé sur le modèle.',
    consequences: 'Un déficit d’extension (flessum) ou de flexion limite la marche, l’assise et la montée d’escalier ; l’arthrose du genou limite d’abord la flexion.',
    appareillage: 'Orthèse articulée de genou (limitation d’amplitude) ; prothèse de genou (total ou partiel) ; genou prothétique pour l’amputé transfémoral. À titre informatif.'
  },
  extension_genou: {
    explication: 'Extension du genou droit, assis, cuisse horizontale : la jambe se tend de 90° à 0°.',
    etapes: ['Position assise, hanche et genou à 90°.', 'Le quadriceps (droit fémoral et trois vastes) se contracte.', 'Le tendon patellaire tire la tubérosité tibiale : la jambe se tend.', 'Les ischio-jambiers s’allongent.'],
    amplitude: 'extension complète à 0° ; hyperextension possible de quelques degrés',
    amplitudes: [a('genou', 'extension', '90° → 0°', '90° → 0°')],
    mecanisme: 'Le bras de levier du quadriceps varie avec l’angle (maximal vers 45° de flexion) ; la patella augmente ce bras de levier.',
    consequences: 'Un déficit d’extension de plus de 10° (genu flessum) gêne la station debout et la marche ; le déficit du quadriceps entraîne une dérobade du genou.',
    appareillage: 'Orthèse de genou verrouillée en extension en cas de paralysie du quadriceps ; renforcement musculaire. À titre informatif.'
  },
  cheville: {
    explication: 'Flexion dorsale puis plantaire de la cheville droite, jambe droite légèrement levée en appui sur la jambe gauche.',
    etapes: ['Le poids passe sur la jambe gauche, la jambe droite se lève devant.', 'Dorsiflexion : le tibial antérieur relève la pointe du pied (environ 18°).', 'Flexion plantaire : le triceps sural abaisse le pied (environ 40°).'],
    amplitude: 'dorsiflexion d’environ 20°, flexion plantaire d’environ 45 à 50°',
    amplitudes: [a('cheville', 'flexion dorsale', '0° à 20°', '0° à 18°'), a('cheville', 'flexion plantaire', '0° à 50°', '0° à 40°')],
    mecanisme: 'Articulation talo-crurale en charnière autour d’un axe qui passe par les deux malléoles ; l’inversion et l’éversion se font dans l’articulation sous-talienne (non simulée).',
    consequences: 'Pied tombant (steppage) si le tibial antérieur est déficitaire ; équin (cheville raide en flexion plantaire) en cas de rétraction du triceps sural ; entorse en inversion forcée.',
    appareillage: 'Orthèse releveuse du pied, orthèse cheville-pied (AFO) pour contrôler l’équin ; chaussures orthopédiques. À titre informatif.'
  },
  accroupissement: {
    explication: 'Squat : les pieds restent fixes, les hanches reculent et les genoux avancent dans l’axe des pieds ; le tronc s’incline vers l’avant en gardant le dos neutre.',
    etapes: ['Départ debout, pieds un peu plus écartés que les hanches, orteils légèrement ouverts.', 'Descente : les hanches reculent, les genoux fléchissent dans l’axe des pieds, le tronc penche pour garder le centre de gravité au-dessus des pieds.', 'En bas : cuisses proches de l’horizontale, rachis neutre, talons au sol.', 'Remontée : extension des hanches et des genoux (grand fessier, quadriceps).'],
    amplitude: 'hanche environ 100°, genou environ 90 à 100°, cheville environ 30° de dorsiflexion (squat parallèle)',
    amplitudes: [a('hanche', 'flexion', '0° à 125°', '0° à 100°'), a('genou', 'flexion', '0° à 140°', '0° à 90°'), a('cheville', 'dorsiflexion', '0° à 35° (fonctionnel)', '0° à 34°'), a('rachis', 'flexion lombaire', 'neutre', '0° (neutre)')],
    mecanisme: 'Chaîne cinétique fermée : les trois articulations bougent ensemble. Le centre de gravité reste au-dessus de la base d’appui ; plus le tronc penche, plus les hanches reculent. Une dorsiflexion de cheville insuffisante limite la profondeur.',
    consequences: 'Un manque de mobilité de cheville ou de hanche fait lever les talons ou arrondir le bas du dos ; les genoux qui rentrent (valgus dynamique) surchargent le ligament croisé antérieur et la patella.',
    appareillage: 'Semelles ou orthèses plantaires pour le valgus du pied ; prothèse de genou : la flexion obtenue dépend de la technique et de la rééducation. À titre informatif.'
  },
  fente: {
    explication: 'Fente avant : pied droit devant, pied gauche derrière (talon levé), les deux pieds restent fixes ; le bassin descend verticalement.',
    etapes: ['Départ en position fendue, les deux pieds au sol.', 'Descente : le genou avant fléchit vers 80-90°, le genou arrière fléchit et descend vers le sol.', 'Le tronc reste droit ; le centre de gravité reste entre les deux pieds.', 'Remontée : extension de la hanche et du genou avant.'],
    amplitude: 'genou avant environ 90°, genou arrière environ 90°, hanche avant environ 80°',
    amplitudes: [a('hanche avant', 'flexion', '0° à 125°', '0° à 75°'), a('genou avant', 'flexion', '0° à 140°', '0° à 85°'), a('genou arrière', 'flexion', '0° à 140°', '0° à 100°')],
    mecanisme: 'Chaîne fermée asymétrique : la jambe avant porte l’essentiel du poids, la jambe arrière stabilise. L’étirement du psoas arrière est important.',
    consequences: 'Instabilité : faiblesse des fessiers ou du quadriceps ; douleur patellaire en cas d’avancée excessive du genou.',
    appareillage: 'Genouillère patellaire ; chaussures stables. À titre informatif.'
  },
  escalier: {
    explication: 'Montée d’escalier : un pied est posé sur la marche (18 cm), le poids passe dessus, le corps monte, puis l’autre pied rejoint la marche. Le cycle redescend ensuite.',
    etapes: ['Le poids passe sur le pied gauche resté au sol.', 'Le pied droit monte et se pose sur la marche.', 'Le poids passe sur le pied droit : le quadriceps et le grand fessier droits hissent le corps.', 'Le pied gauche (talon levé) quitte le sol et rejoint la marche.', 'Les deux pieds sont sur la marche.'],
    amplitude: 'hanche jusqu’à 70° de flexion, genou jusqu’à 90° environ, cheville jusqu’à 25° de dorsiflexion',
    amplitudes: [a('hanche', 'flexion', '0° à 125°', 'environ 0° à 75°'), a('genou', 'flexion', '0° à 140°', 'environ 0° à 75°'), a('cheville', 'dorsiflexion', '0° à 35°', 'environ −10° à 33°')],
    mecanisme: 'Alternance d’appuis unipodaux ; le centre de gravité est toujours au-dessus du pied d’appui. Le moment extenseur du genou et de la hanche est bien plus élevé que sur le plat.',
    consequences: 'Une faiblesse du quadriceps ou du fessier rend la montée impossible sans rampe ; douleur patello-fémorale à la montée.',
    appareillage: 'Orthèse de genou ; prothèse de genou à contrôle de phase d’appui ; rampe et canne. À titre informatif.'
  },
  assis_debout: {
    explication: 'Passage de la position assise à la position debout : le buste se penche, les fesses décollent, puis les jambes se tendent.',
    etapes: ['Pieds ramenés sous la chaise, tibias inclinés d’environ 10°.', 'Phase de flexion : le tronc s’incline de 30° vers l’avant et les bras vont en avant pour amener le centre de gravité vers les pieds.', 'Décollement des fesses : le quadriceps et le grand fessier se contractent.', 'Extension : les hanches et les genoux se tendent, le tronc se redresse.'],
    amplitude: 'hanche jusqu’à 120° de flexion, genou jusqu’à 110°, cheville jusqu’à 25° de dorsiflexion',
    amplitudes: [a('hanche', 'flexion', '0° à 125°', '0° à 118°'), a('genou', 'flexion', '0° à 140°', '0° à 115°'), a('cheville', 'dorsiflexion', '0° à 35°', '0° à 28°')],
    mecanisme: 'La transition « fesses sur la chaise → pieds seuls » exige que le centre de gravité soit déjà au-dessus des pieds : l’élan du buste le déplace.',
    consequences: 'Test fonctionnel courant (5 levers de chaise) : son temps estime la force des membres inférieurs ; la perte de ce mouvement signe une perte d’autonomie.',
    appareillage: 'Surélévation de l’assise, fauteuil releveur, orthèses de membres inférieurs ; prothèses : la force des extenseurs conditionne le lever. À titre informatif.'
  },
  saut: {
    explication: 'Saut vertical : flexion rapide (contre-mouvement), extension explosive des hanches, genoux et chevilles, vol, puis réception amortie.',
    etapes: ['Contre-mouvement : flexion des jambes, bras en arrière.', 'Poussée : extension des hanches, des genoux et des chevilles, élan des bras vers le haut.', 'Vol : les chevilles en flexion plantaire, le centre de gravité suit une trajectoire balistique.', 'Réception : les genoux et les hanches fléchissent pour amortir (quadriceps en freinage).'],
    amplitude: 'genou jusqu’à 90° à l’amortissement, cheville jusqu’à 35° de dorsiflexion',
    amplitudes: [a('hanche', 'flexion', '0° à 125°', 'environ 0° à 85°'), a('genou', 'flexion', '0° à 140°', 'environ 0° à 85°'), a('cheville', 'flexion plantaire', '0° à 50°', 'jusqu’à 38°')],
    mecanisme: 'Cycle étirement-détente : l’énergie élastique des tendons s’ajoute à la contraction. Le saut est la somme de la force et de la vitesse des extenseurs.',
    consequences: 'Les ruptures du ligament croisé antérieur surviennent souvent à la réception (valgus du genou, quadriceps dominant).',
    appareillage: 'Orthèses de genou et chevillères en prévention ; prothèses à restitution d’énergie. À titre informatif.'
  },
  abduction_epaule: {
    explication: 'Abduction de l’épaule : les bras s’élèvent sur le côté jusqu’au-dessus de la tête ; l’omoplate tourne pour accompagner l’humérus (rythme scapulo-huméral).',
    etapes: ['Départ (0 à 30°) : le supra-épineux déclenche le mouvement, le deltoïde prend le relais.', 'De 30° à 90° : l’omoplate commence à tourner (environ 1° pour 2° d’élévation gléno-humérale).', 'Au-delà de 90° : l’humérus se met en rotation externe pour dégager le tubercule majeur sous l’acromion.', 'Vers 180° : le trapèze et le dentelé antérieur ont fait tourner l’omoplate d’environ 60°.'],
    amplitude: 'abduction jusqu’à 180° (environ 120° dans l’articulation gléno-humérale et 60° de rotation de la scapula)',
    amplitudes: [a('épaule', 'abduction', '0° à 180°', '0° à 172°'), a('scapula', 'rotation supérieure', '≈ 60°', '≈ 56° + clavicule 15°'), a('épaule', 'rotation externe', '≈ 90° en fin de mouvement', '0° à 75°')],
    mecanisme: 'Le rythme scapulo-huméral 2 pour 1 combine la gléno-humérale, la scapulo-thoracique et les articulations acromio- et sterno-claviculaires. L’élévation dans le plan frontal exige la rotation externe.',
    consequences: 'Un conflit sous-acromial ou une lésion de la coiffe donne un arc douloureux entre 60° et 120° ; une paralysie du nerf axillaire (deltoïde) ou du nerf thoracique long (dentelé) limite l’élévation.',
    appareillage: 'Orthèse d’abduction (coussin d’abduction) après chirurgie de la coiffe ; écharpe ; prothèse d’épaule. À titre informatif.'
  },
  flexion_epaule: {
    explication: 'Flexion de l’épaule : les bras montent devant, jusqu’au-dessus de la tête ; l’omoplate suit en rotation supérieure.',
    etapes: ['Élévation dans le plan sagittal : deltoïde antérieur, faisceau claviculaire du grand pectoral, coraco-brachial.', 'La scapula tourne vers le haut (environ 60° au total), la clavicule se soulève de 10 à 15°.', 'En fin de course, l’extension du rachis thoracique ajoute quelques degrés.'],
    amplitude: 'flexion de l’épaule jusqu’à 180° ; ici 172°',
    amplitudes: [a('épaule', 'flexion', '0° à 180°', '0° à 172°'), a('scapula', 'rotation supérieure', '≈ 60°', '≈ 56° + clavicule 15°')],
    mecanisme: 'Les mêmes rouages que pour l’abduction, dans le plan sagittal ; la rotation externe de l’humérus reste nécessaire au-delà de 120°.',
    consequences: 'Raideur de la capsule (capsulite rétractile) : l’élévation passe de 180° à 90° ; douleur du conflit sous-acromial.',
    appareillage: 'Orthèse d’épaule, bandage de Mayo ; prothèses inversée ou anatomique d’épaule. À titre informatif.'
  },
  flexion_coude: {
    explication: 'Flexion du coude : l’avant-bras se plie vers le bras, la paume se tourne vers le haut (supination).',
    etapes: ['Le brachial est le fléchisseur le plus puissant, quelle que soit la position de l’avant-bras.', 'Le biceps agit surtout en supination ; le brachio-radial, avant-bras en position neutre.', 'En fin de course, le contact des masses musculaires et les structures osseuses arrêtent le mouvement.'],
    amplitude: 'flexion jusqu’à 145° ; ici 142°',
    amplitudes: [a('coude', 'flexion', '0° à 145°', '0° à 142°'), a('avant-bras', 'supination', '0° à 85°', '0° à 30°')],
    mecanisme: 'Charnière huméro-ulnaire ; l’axe passe par le centre de la trochlée. Le triceps freine à la descente (travail excentrique).',
    consequences: 'Une perte de 30° d’extension ou de flexion gêne la préhension à la bouche ou la toilette ; la paralysie du musculo-cutané supprime le biceps et le brachial.',
    appareillage: 'Orthèse de coude articulée (limitation d’amplitude) ; prothèse myoélectrique de l’amputé transhuméral : le coude prothétique fléchit par commande musculaire. À titre informatif.'
  },
  pronosupination: {
    explication: 'Pronation et supination : l’avant-bras tourne autour de son axe, le radius croise l’ulna ; coudes fléchis à 90°, la paume passe vers le bas puis vers le haut.',
    etapes: ['Position neutre : pouce vers le haut.', 'Pronation : le rond pronateur et le carré pronateur tournent le radius autour de l’ulna.', 'Supination : le supinateur et le biceps ramènent le radius.'],
    amplitude: 'environ 80 à 90° dans chaque sens ; ici ±80°',
    amplitudes: [a('avant-bras', 'pronation', '0° à 85°', '0° à 80°'), a('avant-bras', 'supination', '0° à 85°', '0° à 80°')],
    mecanisme: 'Les articulations radio-ulnaires proximale et distale travaillent ensemble autour d’un axe qui passe par la tête du radius et la tête de l’ulna. L’animation fait tourner l’avant-bras entier (simplification).',
    consequences: 'Après une fracture des deux os de l’avant-bras ou de Pouteau-Colles, la pronosupination peut être limitée : les gestes de la vie quotidienne (visser, tourner une clé) sont gênés.',
    appareillage: 'Orthèse de poignet ; prothèse avec poignet rotatif motorisé. À titre informatif.'
  },
  prehension: {
    explication: 'Préhension : atteindre un objet devant soi (verre), pronation, serrage. L’épaule se fléchit, le coude se fléchit à 50°, la main se place en pronation.',
    etapes: ['Orientation de la tête et du regard vers l’objet.', 'Élévation du bras vers l’avant (épaule en flexion vers 80°) et inclinaison du tronc de 15°.', 'Mise en pronation de l’avant-bras (75°), extension du poignet (18°).', 'Fermeture de la main : les fléchisseurs des doigts serrent (mouvement non simulé : la main est un seul bloc).'],
    amplitude: 'épaule 80°, coude 50°, pronation 75°, extension de poignet 18°',
    amplitudes: [a('épaule', 'flexion', '0° à 180°', '0° à 78°'), a('coude', 'flexion', '0° à 150°', '0° à 52°'), a('avant-bras', 'pronation', '0° à 85°', '0° à 75°'), a('poignet', 'extension', '0° à 70°', '≈ 18°')],
    mecanisme: 'Chaîne cinématique ouverte : la main se déplace vers une cible grâce à la coordination de l’épaule, du coude et du poignet ; le tronc participe à l’atteinte.',
    consequences: 'La perte de la préhension (paralysie du radial, du médian, de l’ulnaire) est un handicap fonctionnel majeur pour le travail et la vie quotidienne.',
    appareillage: 'Orthèse de poignet et de main (opposition du pouce), orthèse dynamique à ressorts après lésion nerveuse ; prothèse de main (crochets, mains myoélectriques). À titre informatif.'
  },
  lancer: {
    explication: 'Lancer d’une balle (bras droit, pied gauche en avant) : le bras est armé en arrière, la rotation du bassin, puis du tronc, puis du bras lance la balle, qui est lâchée devant.',
    etapes: ['Armé : appui sur la jambe arrière, tronc tourné vers la droite, épaule en abduction à 90° et rotation externe d’environ 85°, coude fléchi à 90°.', 'Rotation du bassin vers l’avant (le plus tôt), suivie du tronc, puis du bras.', 'Accélération : rotation interne de l’épaule et extension du coude (pectoral, grand rond, triceps).', 'Lâcher de la balle devant le corps.', 'Fin de geste : le bras continue sa course et freine (infra-épineux, petit rond, trapèze).'],
    amplitude: 'rotation externe de l’épaule jusqu’à 90° (jusqu’à 120° chez le lanceur entraîné), rotation du tronc ±45°',
    amplitudes: [a('épaule', 'rotation externe (armé)', '0° à 90°', '0° à 85°'), a('tronc', 'rotation', '±40°', '−48° à +32°'), a('coude', 'flexion', '0° à 150°', '22° à 90°')],
    mecanisme: 'Chaîne cinétique proximo-distale : l’énergie passe de la jambe au bassin, au tronc, à l’épaule, au coude, au poignet, avec des vitesses de plus en plus élevées de chaque segment (somme des vitesses).',
    consequences: 'Les contraintes sur la coiffe des rotateurs, le labrum et le ligament collatéral ulnaire du coude sont importantes : tendinopathies et ruptures du lanceur.',
    appareillage: 'Orthèse d’épaule ou de coude de prévention ; prothèses spécifiques pour le sport. À titre informatif.'
  },
  flexion_tronc: {
    explication: 'Flexion du tronc : le buste se penche en avant, d’abord par le rachis lombaire puis par la bascule du bassin sur les hanches (rythme lombo-pelvien) ; les pieds restent fixes.',
    etapes: ['Début : les muscles abdominaux et le psoas fléchissent le rachis lombaire (environ 50°) et le rachis thoracique (environ 10°).', 'La suite vient de la bascule du bassin autour des hanches (environ 20°).', 'Le bassin recule pour garder le centre de gravité au-dessus des pieds.', 'En fin de course, les érecteurs du rachis, puis les fessiers et les ischio-jambiers freinent (travail excentrique).'],
    amplitude: 'flexion lombaire d’environ 40 à 60° ; flexion totale du tronc jusqu’à 80° avec les hanches',
    amplitudes: [a('rachis lombaire', 'flexion', '0° à 60°', '0° à 50°'), a('rachis thoracique', 'flexion', '0° à 35°', '0° à 12°'), a('bassin (hanches)', 'flexion', '0° à 125°', '≈ 0° à 37°')],
    mecanisme: 'Rythme lombo-pelvien : la flexion du tronc est partagée entre le rachis lombaire (environ 60 %) et la bascule du bassin (environ 40 %). Au-delà de la flexion maximale, les ligaments postérieurs (phénomène de flexion-relaxation) portent la charge.',
    consequences: 'Une raideur des ischio-jambiers limite la bascule du bassin et surcharge le rachis lombaire : lombalgies, hernies discales (L4-L5, L5-S1) à la flexion avec charge.',
    appareillage: 'Corset lombaire (soutien) ; lombostat rigide dans certaines fractures ; ceinture de soutien. À titre informatif.'
  },
  rotation_tronc: {
    explication: 'Rotation du tronc : le buste tourne autour de l’axe vertical, surtout au niveau thoracique ; la tête suit en partie, le bassin reste fixe.',
    etapes: ['Les obliques externes d’un côté et internes de l’autre font tourner le thorax.', 'Le rachis thoracique fournit la plus grande part de la rotation (environ 30°), le rachis lombaire peu (environ 10°).', 'La tête tourne d’environ 12° en plus.'],
    amplitude: 'rotation totale du tronc d’environ 40° de chaque côté ; ici ±32° (lombaire ±9°, thoracique ±26°)',
    amplitudes: [a('rachis thoracique', 'rotation', '±35°', '±26°'), a('rachis lombaire', 'rotation', '±10°', '±9°')],
    mecanisme: 'L’orientation des facettes articulaires thoraciques (frontale) permet la rotation ; au niveau lombaire elles sont sagittales et la limitent fortement.',
    consequences: 'La rotation lombaire excessive sous charge fatigue le disque ; la scoliose associe courbure latérale et rotation des vertèbres.',
    appareillage: 'Corset de scoliose (corrige la rotation et l’inclinaison) ; ceinture lombaire. À titre informatif.'
  },
  inclinaison_tronc: {
    explication: 'Inclinaison latérale du tronc : le buste se penche de côté, pieds fixes ; le bassin se déplace de l’autre côté pour garder l’équilibre.',
    etapes: ['Contraction des muscles du côté de l’inclinaison (érecteurs, carré des lombes, obliques).', 'Le rachis lombaire s’incline d’environ 16°, le thoracique d’environ 12°.', 'Le bassin se décale de l’autre côté (équilibre du centre de gravité).'],
    amplitude: 'inclinaison latérale totale d’environ 30 à 35° de chaque côté',
    amplitudes: [a('rachis lombaire', 'inclinaison', '±25°', '±16°'), a('rachis thoracique', 'inclinaison', '±25°', '±12°')],
    mecanisme: 'Les plans articulaires lombaires permettent l’inclinaison, couplée à une légère rotation (mouvements couplés).',
    consequences: 'Une inclinaison asymétrique ou un déficit de mobilité d’un côté oriente vers une scoliose ou une inégalité de longueur des membres inférieurs.',
    appareillage: 'Corset (Chêneau, Boston, Lyon) pour la scoliose : ils agissent par appuis latéraux ; talonnette en cas d’inégalité de longueur. À titre informatif.'
  },
  rotation_tete: {
    explication: 'Rotation de la tête (« dire non ») : la tête tourne autour de l’axe vertical, essentiellement entre l’atlas et l’axis.',
    etapes: ['Le sterno-cléido-mastoïdien tourne la tête vers le côté opposé.', 'Le splénius la tourne vers le même côté.', 'La moitié de l’amplitude vient de l’articulation atlanto-axoïdienne (C1-C2).'],
    amplitude: 'rotation cervicale d’environ 80° de chaque côté ; ici ±70°',
    amplitudes: [a('rachis cervical', 'rotation', '±80°', '±70°')],
    mecanisme: 'Autour de la dent de l’axis (processus odontoïde) : l’atlas tourne sur l’axis. L’artère vertébrale est étirée lors des grandes rotations.',
    consequences: 'Le torticolis congénital ou aigu limite la rotation ; l’arthrose cervicale limite d’abord la rotation et l’inclinaison.',
    appareillage: 'Collier cervical souple ou rigide (immobilisation) ; orthèse cervicale. À titre informatif.'
  },
  flexion_tete: {
    explication: 'Flexion et extension de la tête (« dire oui ») : la tête bascule vers l’avant et vers l’arrière.',
    etapes: ['Flexion : les sterno-cléido-mastoïdiens et scalènes.', 'Extension : le splénius, le semi-épineux et le trapèze.', 'L’articulation atlanto-occipitale fournit environ la moitié de la flexion-extension.'],
    amplitude: 'flexion d’environ 45° et extension d’environ 60° (totale cervicale) ; ici ±48°',
    amplitudes: [a('rachis cervical', 'flexion / extension', '−60° à +50°', '±48°')],
    mecanisme: 'Mouvement dans le plan sagittal autour de l’articulation atlanto-occipitale et du rachis cervical inférieur.',
    consequences: 'Le coup du lapin (traumatisme cervical en accélération) étire les structures ; la cervicalgie est fréquente.',
    appareillage: 'Collier cervical. À titre informatif.'
  },
  inclinaison_tete: {
    explication: 'Inclinaison latérale de la tête : l’oreille se rapproche de l’épaule, sans lever l’épaule.',
    etapes: ['Contraction des scalènes, du sterno-cléido-mastoïdien et de l’élévateur de la scapula du côté de l’inclinaison.', 'Le trapèze supérieur du côté opposé est étiré.'],
    amplitude: 'inclinaison d’environ 45° de chaque côté ; ici ±38°',
    amplitudes: [a('rachis cervical', 'inclinaison', '±45°', '±38°')],
    mecanisme: 'Plan frontal : les mouvements sont couplés à une légère rotation du côté de l’inclinaison.',
    consequences: 'Le torticolis congénital musculaire (sterno-cléido-mastoïdien raccourci) incline la tête d’un côté et la tourne de l’autre.',
    appareillage: 'Orthèse cervicale, traitement orthopédique du torticolis chez le nourrisson. À titre informatif.'
  }
};
