/* ═════════════ DONNÉES : ORTHOPÉDIE ET ORTHOPROTHÈSE ═════════════
   Amputations, scolioses, fractures, appareillages et matériaux. Contenu pédagogique : il ne remplace ni le bilan clinique,
   ni la prescription médicale, ni l'avis de l'orthoprothésiste.
   Zones retirées (amputations) : intersection de demi-espaces { n·p > d } dans le repère du côté gauche (miroir à droite). */

const X = [1, 0, 0], NY = [0, -1, 0], Z = [0, 0, 1];
const sous = y => ({ n: NY, d: -y });          // retire tout ce qui est sous la hauteur y
const lat = x => ({ n: X, d: x });             // retire ce qui est plus latéral que x (le membre, pas le tronc)

/* ── Amputations ── */
export const AMPUTATIONS = [
  // Membre inférieur
  { id: 'hanche', nom: 'Désarticulation de hanche', membre: 'MI', famille: 'Désarticulation', retire: [lat(.02), sous(.96)], cap: { y: .96 },
    description: "Section au niveau de l'articulation coxo-fémorale : tout le fémur est retiré, le bassin est conservé.", indications: "Tumeurs de la racine de la cuisse, traumatismes majeurs, infections non contrôlables.",
    moignon: "Pas de moignon osseux ; appui sur l'ischion et la crête iliaque, toute la hanche est à remplacer.", difficulte: "Dépense énergétique très élevée (≈ 100 % de plus qu'une marche normale).",
    prothese: { type: 'MI', chaine: [{ k: 'emboiture', haut: 1.08, bas: .86, nom: 'Corbeille pelvienne' }, { k: 'articulation', nom: 'Hanche (articulation à ressort/hydraulique)', y: .85, t: 'hanche' }, { k: 'articulation', nom: 'Genou', y: .5, t: 'genou' }, { k: 'pylone' }, { k: 'pied' }] } },
  { id: 'transfemorale', nom: 'Amputation trans-fémorale', membre: 'MI', famille: 'Transosseuse', retire: [lat(.02), sous(.7)], cap: { y: .7 },
    description: "Section du fémur dans son tiers moyen ou proximal ; le genou est perdu.", indications: "Artériopathie, traumatismes, tumeurs.",
    moignon: "Idéal : 25 à 30 cm sous le grand trochanter ; un moignon trop court limite le levier des muscles de la hanche (adducteurs, fessiers) et la stabilité du genou prothétique.", difficulte: "Dépense énergétique +60 à 70 %.",
    prothese: { type: 'MI', chaine: [{ k: 'emboiture', haut: .96, bas: .66, nom: 'Emboîture (contenance ischiatique)' }, { k: 'articulation', nom: 'Genou prothétique', y: .5, t: 'genou' }, { k: 'pylone' }, { k: 'pied' }] } },
  { id: 'genou', nom: 'Désarticulation du genou', membre: 'MI', famille: 'Désarticulation', retire: [lat(.02), sous(.485)], cap: { y: .485 },
    description: "Section à l'interligne du genou : le fémur est entier avec ses condyles volumineux.", indications: "Traumatismes, ischémie chez le sujet jeune ou non marchant (enfant : conservation de la plaque de croissance).",
    moignon: "Moignon long, appui terminal possible sur les condyles ; levier maximal.", difficulte: "Genou prothétique polycentrique obligatoire (le genou prothétique serait plus bas que le genou sain sans cela).",
    prothese: { type: 'MI', chaine: [{ k: 'emboiture', haut: .74, bas: .46, nom: 'Emboîture à appui condylien' }, { k: 'articulation', nom: 'Genou polycentrique', y: .45, t: 'genou' }, { k: 'pylone' }, { k: 'pied' }] } },
  { id: 'transtibiale', nom: 'Amputation trans-tibiale', membre: 'MI', famille: 'Transosseuse', retire: [lat(.02), sous(.35)], cap: { y: .35 },
    description: "Section du tibia et de la fibula sous le genou ; l'articulation du genou et le quadriceps sont conservés.", indications: "Artériopathie diabétique, traumatismes, infections osseuses.",
    moignon: "Longueur idéale : 12 à 15 cm sous l'interligne du genou ; fibula sectionnée 1 à 2 cm plus haut que le tibia, crête tibiale biseautée.", difficulte: "Dépense énergétique +25 %. Pronostic de marche très favorable.",
    prothese: { type: 'MI', chaine: [{ k: 'emboiture', haut: .52, bas: .31, nom: 'Emboîture PTB / TSB' }, { k: 'pylone' }, { k: 'pied' }] } },
  { id: 'syme', nom: 'Désarticulation de Syme', membre: 'MI', famille: 'Désarticulation', retire: [lat(.02), sous(.07)], cap: { y: .07 },
    description: "Désarticulation de la cheville : le pied est retiré mais le coussinet talonnier est conservé pour l'appui terminal.", indications: "Traumatismes du pied, ischémie distale, malformations.",
    moignon: "Moignon très long, appui terminal direct possible, mais volume bulbeux (malléoles) qui impose une emboîture fenêtrée ou une botte.", difficulte: "Faible hauteur disponible pour le pied prothétique (pied de profil bas).",
    prothese: { type: 'MI', chaine: [{ k: 'emboiture', haut: .38, bas: .06, nom: 'Emboîture botte (résine + carbone)' }, { k: 'pied', bas: true }] } },
  { id: 'chopart', nom: 'Amputation de Chopart', membre: 'MI', famille: 'Partielle du pied', retire: [lat(.02), { n: Z, d: .055 }, sous(.09)], cap: { z: .055 },
    description: "Désarticulation médio-tarsienne : on garde le talus et le calcanéus, on retire l'avant-pied et le tarse antérieur.", indications: "Traumatismes, infection de l'avant-pied.",
    moignon: "Risque d'équin du talon (déséquilibre entre triceps sural et releveurs) → ténotomie et transferts tendineux souvent nécessaires.", difficulte: "Bras de levier du pied perdu ; appui talonnier conservé.",
    prothese: { type: 'MI', chaine: [{ k: 'pied-partiel', nom: 'Chausson prothétique + lame carbone', z: .055 }] } },
  { id: 'lisfranc', nom: 'Amputation de Lisfranc', membre: 'MI', famille: 'Partielle du pied', retire: [lat(.02), { n: Z, d: .1 }, sous(.09)], cap: { z: .1 },
    description: "Désarticulation tarso-métatarsienne : les métatarsiens sont retirés, le tarse est conservé.", indications: "Traumatismes, infection des métatarsiens.",
    moignon: "Appui sur la voûte et le talon ; risque de varus/équin à surveiller.", difficulte: "Perte de la propulsion de l'avant-pied.",
    prothese: { type: 'MI', chaine: [{ k: 'pied-partiel', nom: 'Chausson de remplissage + semelle rigide', z: .1 }] } },

  // Membre supérieur
  { id: 'epaule-disarticulation', nom: "Désarticulation d'épaule", membre: 'MS', famille: 'Désarticulation', retire: [lat(.14), sous(1.43)], cap: { y: 1.43 },
    description: "Section de l'articulation gléno-humérale : l'humérus est retiré, la clavicule et la scapula sont conservées.", indications: "Tumeurs, traumatismes majeurs.", moignon: "Contour de l'épaule conservé grâce à la scapula et à la clavicule.", difficulte: "Prothèse lourde ; contrôle par le mouvement de la scapula et du thorax.",
    prothese: { type: 'MS', chaine: [{ k: 'emboiture', haut: 1.5, bas: 1.32, nom: 'Épaulière enveloppante' }, { k: 'articulation', nom: 'Épaule passive', y: 1.4, t: 'epaule' }, { k: 'articulation', nom: 'Coude à verrouillage', y: 1.12, t: 'coude' }, { k: 'pylone' }, { k: 'main' }] } },
  { id: 'transhumerale', nom: 'Amputation trans-humérale', membre: 'MS', famille: 'Transosseuse', retire: [lat(.12), sous(1.25)], cap: { y: 1.25 },
    description: "Section de l'humérus ; l'épaule est conservée, le coude est perdu.", indications: "Traumatismes, tumeurs.", moignon: "Moignon long idéal : 50 à 90 % de la longueur de l'humérus (moignon de 4 à 5 cm au-dessus du coude pour permettre le coude prothétique).",
    difficulte: "Nécessite un coude prothétique ; commande par câbles ou capteurs myoélectriques.",
    prothese: { type: 'MS', chaine: [{ k: 'emboiture', haut: 1.42, bas: 1.22, nom: 'Emboîture huméro-scapulaire' }, { k: 'articulation', nom: 'Coude prothétique', y: 1.18, t: 'coude' }, { k: 'pylone' }, { k: 'main' }] } },
  { id: 'coude', nom: 'Désarticulation du coude', membre: 'MS', famille: 'Désarticulation', retire: [lat(.12), sous(1.1)], cap: { y: 1.1 },
    description: "Section à l'interligne huméro-ulnaire : l'humérus est entier avec ses épicondyles.", indications: "Traumatismes, infections.", moignon: "Moignon avec bon levier et rotation de l'humérus conservée.", difficulte: "Coude externe à charnières (pas de place pour un coude interne).",
    prothese: { type: 'MS', chaine: [{ k: 'emboiture', haut: 1.34, bas: 1.08, nom: 'Emboîture à appui condylien' }, { k: 'articulation', nom: 'Charnière externe de coude', y: 1.1, t: 'coude' }, { k: 'pylone' }, { k: 'main' }] } },
  { id: 'transradiale', nom: 'Amputation trans-radiale', membre: 'MS', famille: 'Transosseuse', retire: [lat(.12), sous(.98)], cap: { y: .98 },
    description: "Section du radius et de l'ulna ; le coude est conservé.", indications: "Traumatismes, tumeurs.", moignon: "Longueur idéale : tiers moyen à distal. La prono-supination est conservée proportionnellement à la longueur.",
    difficulte: "Bon pronostic fonctionnel : le coude actif conserve la mobilité.",
    prothese: { type: 'MS', chaine: [{ k: 'emboiture', haut: 1.13, bas: .94, nom: 'Emboîture trans-radiale (myoélectrique)' }, { k: 'articulation', nom: 'Poignet rotateur', y: .92, t: 'poignet' }, { k: 'main' }] } },
  { id: 'poignet', nom: 'Désarticulation du poignet', membre: 'MS', famille: 'Désarticulation', retire: [lat(.12), sous(.86)], cap: { y: .86 },
    description: "Section à l'interligne radio-carpien : l'avant-bras est entier, la prono-supination est conservée.", indications: "Traumatismes, tumeurs de la main.", moignon: "Moignon très long avec renflement des styloïdes (appui d'autosuspension).",
    difficulte: "Peu d'espace pour une main myoélectrique ; poignet prothétique compact.",
    prothese: { type: 'MS', chaine: [{ k: 'emboiture', haut: 1.02, bas: .84, nom: 'Emboîture à fenêtre' }, { k: 'articulation', nom: 'Poignet prothétique', y: .83, t: 'poignet' }, { k: 'main', court: true }] } },
  { id: 'transmetacarpienne', nom: 'Amputation transmétacarpienne', membre: 'MS', famille: 'Main partielle', retire: [lat(.12), sous(.795)], cap: { y: .795 },
    description: "Section des métacarpiens : la paume est partiellement conservée avec le carpe.", indications: "Traumatismes, brûlures.", moignon: "Conservation du poignet et de la prono-supination ; appui palmaire pour une prothèse partielle.",
    difficulte: "Préhension perdue : prothèse partielle avec doigts passifs ou à capteurs.", prothese: { type: 'MS', chaine: [{ k: 'main-partielle', nom: 'Prothèse de paume (silicone + doigts articulés)' }] } },
  { id: 'doigts', nom: 'Amputation de doigts', membre: 'MS', famille: 'Main partielle', retire: [lat(.12), sous(.755)], cap: { y: .755 },
    description: "Amputation d'un ou plusieurs rayons digitaux au niveau des phalanges ou des articulations métacarpo-phalangiennes.", indications: "Traumatismes (presse, scie), brûlures, gelures.", moignon: "Conservation du pouce prioritaire (50 % de la fonction de la main).",
    difficulte: "Prothèses digitales en silicone, doigts mécaniques ou myoélectriques selon le niveau.", prothese: { type: 'MS', chaine: [{ k: 'main-partielle', nom: 'Prothèse digitale en silicone' }] } }
];

/* ── Scoliose ── */
export const SCOLIOSE = {
  apexListe: ['T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4'],
  presets: [
    { id: 'thoracique-droite', nom: 'Thoracique droite', courbes: [{ apex: 'T8', cobb: 35, convexite: 'D' }], note: "Forme la plus fréquente de la scoliose idiopathique de l'adolescente (type Lenke 1)." },
    { id: 'lombaire-gauche', nom: 'Lombaire gauche', courbes: [{ apex: 'L2', cobb: 30, convexite: 'G' }], note: 'Courbe lombaire isolée (Lenke 5) ; retentissement sur la hauteur des crêtes et le bassin.' },
    { id: 'double-majeure', nom: 'Double courbure majeure', courbes: [{ apex: 'T8', cobb: 40, convexite: 'D' }, { apex: 'L2', cobb: 35, convexite: 'G' }], note: 'Courbure thoracique droite + lombaire gauche d\'amplitudes proches (Lenke 3), en S.' },
    { id: 'thoraco-lombaire', nom: 'Thoraco-lombaire', courbes: [{ apex: 'T11', cobb: 32, convexite: 'D' }], note: 'Courbe à la jonction thoraco-lombaire (Lenke 5-6), à fort risque de décompensation du tronc.' },
    { id: 'severe', nom: 'Sévère (indication chirurgicale)', courbes: [{ apex: 'T8', cobb: 65, convexite: 'D' }], note: 'Au-delà de 45-50° chez l\'adolescent, la progression continue à l\'âge adulte : discussion de l\'arthrodèse.' }
  ],
  /** 0-9° : pas de scoliose ; 10-24 : légère ; 25-44 : modérée ; ≥ 45 : sévère */
  gravite(cobb) {
    if (cobb < 10) return { niveau: 'Aucune (attitude scoliotique)', conduite: "Pas de scoliose structurale ; surveillance." };
    if (cobb < 25) return { niveau: 'Légère', conduite: "Surveillance radiologique tous les 4 à 6 mois pendant la croissance ; kinésithérapie spécifique (type Schroth)." };
    if (cobb < 45) return { niveau: 'Modérée', conduite: "Corset à discuter selon la croissance (Risser 0 à 2) et l'évolutivité ; kinésithérapie spécifique ; port de 18 à 23 h par jour selon le protocole." };
    return { niveau: 'Sévère', conduite: "Avis chirurgical (arthrodèse vertébrale postérieure) ; le corset peut être utilisé pour temporiser en attendant la fin de croissance." };
  },
  mesure: "Angle de Cobb : angle entre la tangente au plateau supérieur de la vertèbre limite supérieure et la tangente au plateau inférieur de la vertèbre limite inférieure de la courbure, mesuré sur radiographie du rachis en entier de face debout.",
  gibbosite: "La rotation des vertèbres entraîne celle des côtes : bosse costale côté convexe (gibbosité, à mesurer au scoliomètre : angle de rotation du tronc, ATR) et creux côté concave."
};

/* ── Fractures ── */
export const FRACTURES = [
  { id: 'clavicule-tiers-moyen', nom: 'Clavicule : tiers moyen', os: [{ id: 'clavicule', t: .5 }], type: 'oblique', angulation: 15, decalage: .012, raccourcissement: .015, rotation: 0,
    classification: "Classification d'Allman (groupe I : tiers moyen, 80 % des fractures de la clavicule).", mecanisme: "Chute sur l'épaule ou choc direct.",
    deplacement: "Le fragment médial est tiré en haut par le sterno-cléido-mastoïdien ; le latéral est tiré vers le bas par le poids du bras et le deltoïde.",
    traitement: "Écharpe ou bandage en 8 (traitement orthopédique) 3 à 4 semaines ; ostéosynthèse par plaque si déplacement > 2 cm ou raccourcissement important.", complications: "Cal vicieux, pseudarthrose, atteinte du plexus brachial (rare).", appareillage: ['echarpe'] },
  { id: 'humerus-diaphyse', nom: 'Humérus : diaphyse', os: [{ id: 'humerus', t: .5 }], type: 'spiroide', angulation: 10, decalage: .015, raccourcissement: .02, rotation: 25,
    classification: "Classification AO 12-A (simple) / B (à coin) / C (complexe).", mecanisme: "Choc direct ou torsion (bras de fer).",
    deplacement: "Fragment proximal tiré en abduction par le deltoïde (fracture sous-deltoïdienne), en adduction par le grand pectoral (au-dessus).",
    traitement: "Orthèse brachiale fonctionnelle (Sarmiento) 6 à 8 semaines ; ostéosynthèse (enclouage, plaque) en cas de paralysie radiale secondaire, fracture ouverte ou instabilité.", complications: "Paralysie du nerf radial (≈ 10 %) : main tombante ; pseudarthrose.", appareillage: ['orthese-sarmiento'] },
  { id: 'radius-distal-pouteau-colles', plan: 'sagittal', nom: 'Radius distal (Pouteau-Colles)', os: [{ id: 'radius', t: .88 }], type: 'transversale', angulation: 25, decalage: .008, raccourcissement: .006, rotation: 0,
    classification: "Fracture de l'extrémité distale du radius à déplacement dorsal : « dos de fourchette » de face et de profil.", mecanisme: "Chute sur la paume, poignet en extension (ostéoporose chez le sujet âgé).",
    deplacement: "Bascule postérieure, ascension et translation radiale du fragment distal.", traitement: "Réduction puis immobilisation (manchette plâtrée ou résine 4-6 semaines), ou plaque palmaire si instable.", complications: "Algodystrophie, cal vicieux, syndrome du canal carpien, rupture du long extenseur du pouce.", appareillage: ['orthese-poignet-resine'] },
  { id: 'avant-bras-deux-os', nom: 'Avant-bras : deux os', os: [{ id: 'radius', t: .5 }, { id: 'ulna', t: .5 }], type: 'transversale', angulation: 12, decalage: .01, raccourcissement: .012, rotation: 15,
    classification: "AO 22-A à C. Chez l'adulte : chirurgie systématique pour restaurer la prono-supination.", mecanisme: "Choc direct ou chute.",
    deplacement: "Angulation avec perte de l'espace interosseux et de la prono-supination.", traitement: "Ostéosynthèse par deux plaques ; plâtre brachio-antébrachio-palmaire chez l'enfant.", complications: "Syndrome des loges, synostose radio-ulnaire, pseudarthrose.", appareillage: ['orthese-poignet-resine'] },
  { id: 'col-femoral', nom: 'Fémur : col (Garden III)', os: [{ id: 'femur', partie: 'col', t: .6 }], type: 'transversale', angulation: -18, decalage: .01, raccourcissement: .02, rotation: 22,
    classification: "Classification de Garden (I à IV) selon le déplacement de la tête.", mecanisme: "Chute de sa hauteur chez le sujet âgé ostéoporotique ; plus rare chez le jeune (traumatisme violent).",
    deplacement: "Raccourcissement et rotation externe du membre ; coxa vara.", traitement: "Prothèse de hanche (intermédiaire ou totale) chez le sujet âgé ; ostéosynthèse par vis chez le sujet jeune ; chirurgie précoce < 48 h.", complications: "Nécrose de la tête fémorale, pseudarthrose, thromboses.", appareillage: [] },
  { id: 'femur-diaphyse', nom: 'Fémur : diaphyse', os: [{ id: 'femur', t: .5 }], type: 'oblique', angulation: 12, decalage: .02, raccourcissement: .03, rotation: 15,
    classification: "AO 32 : A (simple), B (à coin), C (complexe).", mecanisme: "Traumatisme à haute énergie (accident de la route).",
    deplacement: "Raccourcissement par la contraction du quadriceps, angulation à sommet latéral par les adducteurs.", traitement: "Enclouage centromédullaire verrouillé (référence).", complications: "Embolie graisseuse, hémorragie (jusqu'à 1,5 l), cal vicieux.", appareillage: [] },
  { id: 'tibia-fibula-diaphyse', nom: 'Jambe : tibia et fibula', os: [{ id: 'tibia', t: .5 }, { id: 'fibula', t: .5 }], type: 'comminutive', angulation: 10, decalage: .018, raccourcissement: .02, rotation: 12,
    classification: "AO 42 ; Gustilo (I à III) si fracture ouverte.", mecanisme: "Choc direct, torsion lors d'une chute (ski).",
    deplacement: "Recurvatum ou varus, raccourcissement.", traitement: "Enclouage centromédullaire (tibia) ; botte plâtrée ou orthèse jambière si non déplacée.", complications: "Syndrome de loges (douleur disproportionnée), pseudarthrose (tiers moyen/distal peu vascularisé), infection.", appareillage: ['botte-resine'] },
  { id: 'malleole-weber-b', nom: 'Cheville : malléole latérale (Weber B)', os: [{ id: 'fibula', t: .96 }], type: 'oblique', angulation: 8, decalage: .006, raccourcissement: .004, rotation: 0,
    classification: "Classification de Danis-Weber : B = trait au niveau de la syndesmose.", mecanisme: "Torsion de la cheville (supination-rotation externe).",
    deplacement: "Déplacement latéral et rotation externe du talus.", traitement: "Plaque et vis ; botte ou botte en résine 6 semaines si stable.", complications: "Arthrose post-traumatique, raideur.", appareillage: ['botte-resine'] },
  { id: 'tassement-l1', nom: 'Rachis : tassement de L1', os: [{ id: 'vertebre-L1', tassement: .4 }], type: 'tassement',
    classification: "AO Spine A1-A3 ; compression cunéiforme antérieure du corps vertébral.", mecanisme: "Chute sur les fesses ou flexion axiale ; ostéoporose chez le sujet âgé.",
    deplacement: "Cyphose locale (angle de cunéiformisation) ; risque de recul du mur postérieur dans les fractures explosion.", traitement: "Corset de type Jewett (hyperextension 3 points) ou orthèse thoraco-lombaire 8 à 12 semaines ; cimentoplastie ; ostéosynthèse si instable ou déficit neurologique.", complications: "Cyphose résiduelle, compression médullaire (fracture-explosion), douleur chronique.", appareillage: ['corset-jewett'] },
  { id: 'explosion-l1', nom: 'Rachis : fracture-explosion de L1', os: [{ id: 'vertebre-L1', tassement: .55, eclat: true }], type: 'tassement',
    classification: "AO Spine A4 / B : comminution du corps avec recul du mur postérieur.", mecanisme: "Chute de hauteur, accident de la route.",
    deplacement: "Perte de hauteur importante, fragments dans le canal rachidien.", traitement: "Évaluation neurologique urgente (ASIA) ; stabilisation chirurgicale si instabilité ou compression médullaire ; corset en post-opératoire.", complications: "Lésion médullaire ou de la queue-de-cheval, cyphose.", appareillage: ['corset-jewett'] }
];
export const TYPES_FRACTURE = [
  { id: 'transversale', nom: 'Transversale' }, { id: 'oblique', nom: 'Oblique' }, { id: 'spiroide', nom: 'Spiroïde' }, { id: 'comminutive', nom: 'Comminutive (éclats)' }
];

/* ── Matériaux ── */
export const MATERIAUX = [
  { id: 'pa6', nom: 'PA6 (nylon 6, polyamide)', famille: 'Thermoplastique', densite: 1.14, module: 2.8, couleur: 0xe8e2cf, rendu: { metal: 0, rough: .55 }, usage: "Orthèses et corsets imprimés en 3D (frittage laser) ou injectés ; emboîtures de prothèse imprimées.", avantages: "Très bon rapport résistance/poids, résistance à la fatigue et à l'abrasion, possibilité d'imprimer des structures alvéolées (corsets aérés).", limites: "Reprend de l'humidité (-30 % de module à saturation) ; vieillissement aux UV." },
  { id: 'nylon', nom: 'Nylon 12 (PA12)', famille: 'Thermoplastique', densite: 1.01, module: 1.7, couleur: 0xf3efe2, rendu: { metal: 0, rough: .6 }, usage: "Impression SLS / MJF de corsets, de prothèses d'enfant, de coques d'orthèses.", avantages: "Absorbe peu d'eau, bonne finition, souplesse.", limites: "Moins rigide que le PA6 chargé ; coût plus élevé." },
  { id: 'polyethylene', nom: 'Polyéthylène (PE)', famille: 'Thermoplastique', densite: .95, module: 1.0, couleur: 0xf7f2e8, rendu: { metal: 0, rough: .5 }, usage: "Corsets thermoformés (Boston, Chêneau), emboîtures d'essai.", avantages: "Léger, thermoformable à 160-180 °C, facile à retoucher, résistant à l'eau.", limites: "Peu rigide, fluage à la chaleur, collage difficile." },
  { id: 'polypropylene', nom: 'Polypropylène (PP)', famille: 'Thermoplastique', densite: .91, module: 1.5, couleur: 0xd8e4ea, rendu: { metal: 0, rough: .5 }, usage: "Orthèses plantaires, releveurs de pied (AFO), coques de corset.", avantages: "Plus rigide que le PE, très léger, résiste à la fatigue en flexion.", limites: "Retrait au refroidissement ; colle difficilement." },
  { id: 'carbone', nom: 'Fibre de carbone (composite)', famille: 'Composite', densite: 1.6, module: 70, couleur: 0x1b1d22, rendu: { metal: .35, rough: .3 }, usage: "Pieds à restitution d'énergie, pylônes, emboîtures et cadres de prothèse, AFO dynamiques.", avantages: "Rapport rigidité/poids exceptionnel, restitue l'énergie à l'appui.", limites: "Coût élevé, fragile aux chocs localisés, rigide donc sans possibilité de retouche à chaud." },
  { id: 'verre', nom: 'Fibre de verre (composite)', famille: 'Composite', densite: 1.9, module: 25, couleur: 0xcfd8d4, rendu: { metal: 0, rough: .45, alpha: .85 }, usage: "Emboîtures laminées, plâtres de résine, attelles.", avantages: "Moins cher que le carbone, translucide, léger.", limites: "Moins rigide que le carbone, irritation à la manipulation." },
  { id: 'resine-epoxy', nom: 'Résine époxy / polyester', famille: 'Résine', densite: 1.2, module: 3.5, couleur: 0xb8c9d6, rendu: { metal: .05, rough: .25, alpha: .8 }, usage: "Matrice des composites de laminage (stratifiés), moulage d'emboîtures sur positif plâtre.", avantages: "Excellente adhérence aux fibres, rigide après polymérisation.", limites: "Durcissement irréversible, vapeurs et durée de manipulation." },
  { id: 'resine-acrylique', nom: 'Résine acrylique (laminage)', famille: 'Résine', densite: 1.15, module: 3, couleur: 0xf0e6ce, rendu: { metal: .05, rough: .3, alpha: .8 }, usage: "Emboîtures de prothèse (laminage 80:20 acrylique), recouvrement des orthèses.", avantages: "Meilleure tolérance cutanée, compatible avec les fibres (perlon, carbone).", limites: "Moins résistante au fluage que l'époxy." },
  { id: 'platre', nom: 'Plâtre / résine de contention', famille: 'Immobilisation', densite: 1.1, module: 2, couleur: 0xf5f5f0, rendu: { metal: 0, rough: .85 }, usage: "Immobilisation des fractures (manchette, botte, brachio-antébrachio-palmaire).", avantages: "Moule parfaitement, pas cher, immédiat.", limites: "Lourd (plâtre), fragile à l'eau, pas modifiable ; la résine est plus légère et résistante." },
  { id: 'thermo-basse', nom: 'Thermoplastique basse température', famille: 'Thermoplastique', densite: 1.2, module: .9, couleur: 0xf8d7c1, rendu: { metal: 0, rough: .55 }, usage: "Attelles et orthèses de main moulées à même la peau (60-70 °C).", avantages: "Réglable et retouchable à chaud ; moulage direct sur le patient.", limites: "Peu résistant à la chaleur, rigidité moyenne." },
  { id: 'silicone', nom: 'Silicone (manchon / liner)', famille: 'Élastomère', densite: 1.1, module: .002, couleur: 0xe7c6b2, rendu: { metal: 0, rough: .35, alpha: .7 }, usage: "Manchons de moignon, gaines cosmétiques, doigts prothétiques.", avantages: "Amortit les pressions, bonne adhérence, favorise l'autosuspension (broche).", limites: "Retient la chaleur et la transpiration ; entretien rigoureux, risque d'allergie." },
  { id: 'gel', nom: 'Gel de polyuréthane (liner)', famille: 'Élastomère', densite: 1.05, module: .001, couleur: 0xbfd8d0, rendu: { metal: 0, rough: .3, alpha: .65 }, usage: "Manchons pour moignon sensible, protection des reliefs osseux.", avantages: "Bon amortissement, plus léger que certaines silicones.", limites: "Moins durable ; nécessite un moignon bien cicatrisé." },
  { id: 'eva', nom: 'EVA (mousse)', famille: 'Mousse', densite: .15, module: .01, couleur: 0xe8d6a8, rendu: { metal: 0, rough: .8 }, usage: "Garnitures, semelles, rembourrage des appuis de corset (pelotes).", avantages: "Très léger, amortit, facile à usiner.", limites: "Se tasse avec le temps." },
  { id: 'acier', nom: 'Acier inoxydable', famille: 'Métal', densite: 7.9, module: 200, couleur: 0xb7bcc4, rendu: { metal: .9, rough: .3 }, usage: "Barres latérales d'orthèses, articulations de genou, cadres de corset (Milwaukee).", avantages: "Résistance et rigidité maximales, durable.", limites: "Lourd (5 fois la densité du PA6), conducteur thermique." },
  { id: 'aluminium', nom: 'Aluminium (alliage)', famille: 'Métal', densite: 2.7, module: 70, couleur: 0xc9d0d8, rendu: { metal: .85, rough: .35 }, usage: "Pylônes, tubes de prothèse, tiges d'orthèses, articulations.", avantages: "Léger, bon compromis résistance/poids, usinable.", limites: "Fatigue limitée, moins rigide que l'acier." },
  { id: 'titane', nom: 'Titane (alliage)', famille: 'Métal', densite: 4.4, module: 110, couleur: 0xa7a9ae, rendu: { metal: .85, rough: .4 }, usage: "Articulations de genou haut de gamme, pylônes légers, implants ostéo-intégrés.", avantages: "Très résistant, biocompatible, léger pour un métal, ne se corrode pas.", limites: "Coût élevé, usinage difficile." }
];

/* ── Appareillages ── */
const appui = (nom, type, repere, note) => ({ nom, type, repere, note });
const comp = (id, nom, defaut, choix) => ({ id, nom, defaut, choix });

export const APPAREILLAGES = [
  // ── Prothèses du membre inférieur ──
  { id: 'prothese-transtibiale', nom: 'Prothèse trans-tibiale (PTB / TSB)', categorie: 'Prothèse', pour: { amputations: ['transtibiale'] },
    description: "Emboîture sur moignon avec appui sur le tendon patellaire (PTB) ou à contact total (TSB), manchon en silicone ou gel, pylône et pied à restitution d'énergie.",
    composants: [comp('emboiture', 'Emboîture', 'carbone', ['carbone', 'resine-acrylique', 'verre', 'pa6', 'polyethylene']), comp('manchon', 'Manchon (liner)', 'silicone', ['silicone', 'gel', 'eva']), comp('pylone', 'Pylône', 'aluminium', ['aluminium', 'titane', 'carbone']), comp('pied', 'Pied prothétique', 'carbone', ['carbone', 'pa6', 'aluminium'])],
    biomecanique: "Principe PTB : la charge est reprise par les zones tolérantes (tendon patellaire, loges musculaires, plateaux tibiaux) et déchargée sur les zones sensibles (crête tibiale, tête de la fibula, extrémité distale du tibia, nerf fibulaire commun). Le contact total (TSB) répartit la pression sur toute la surface du moignon grâce au manchon.",
    appuis: [appui('Tendon patellaire', 'appui', 'tuberosite-tibiale', 'Barre patellaire : principal appui antérieur en charge.'), appui('Condyle tibial médial', 'appui', 'epicondyle-med-femur', 'Appui médial, tolérant.'), appui('Loges musculaires (mollet)', 'appui', null, 'Reprise de pression à contact total.'),
      appui('Crête tibiale', 'decharge', 'crete-tibiale', 'Biseau, volume rembourré : zone intolérante.'), appui('Tête de la fibula', 'decharge', 'tete-fibula', 'Nerf fibulaire commun : jamais de pression.'), appui('Extrémité distale du tibia', 'decharge', null, 'Pas d\'appui terminal : décharge.')],
    precautions: "Surveiller les variations de volume du moignon (œdème, fonte musculaire), les points rouges persistants plus de 10-20 minutes, les cicatrices adhérentes.", niveauFrais: "Réévaluer l'emboîture à chaque variation de volume." },
  { id: 'prothese-transfemorale', nom: 'Prothèse trans-fémorale', categorie: 'Prothèse', pour: { amputations: ['transfemorale'] },
    description: "Emboîture à contenance ischiatique (IRC) ou sous-ischiatique, genou prothétique (mécanique, hydraulique ou à microprocesseur), pylône et pied.",
    composants: [comp('emboiture', 'Emboîture', 'carbone', ['carbone', 'resine-acrylique', 'verre', 'pa6']), comp('manchon', 'Manchon (liner)', 'silicone', ['silicone', 'gel']), comp('genou', 'Articulation du genou', 'titane', ['titane', 'acier', 'aluminium']), comp('pylone', 'Pylône', 'aluminium', ['aluminium', 'titane', 'carbone']), comp('pied', 'Pied prothétique', 'carbone', ['carbone', 'pa6'])],
    biomecanique: "Emboîture à contenance ischiatique : l'ischion est « verrouillé » dans le bord postéro-médial de l'emboîture, ce qui maintient le fémur en adduction et stabilise le bassin (limite le Trendelenburg). Le genou est aligné derrière la ligne de charge pour la stabilité statique ; le pied est posé sous cette ligne.",
    appuis: [appui('Tubérosité ischiatique', 'appui', 'ischion', 'Appui principal postérieur (contenance ischiatique).'), appui('Branche ischio-pubienne', 'appui', 'symphyse-pubienne', 'Contenance de l\'ischion en médial.'), appui('Grand trochanter', 'decharge', 'grand-trochanter', 'Contre-appui externe : maintien du fémur en adduction (profil latéral).'),
      appui('Bord antérieur (Scarpa)', 'decharge', 'eias', 'Décharge du triangle de Scarpa (vaisseaux fémoraux).'), appui('Épine iliaque antéro-supérieure', 'decharge', 'eias', 'Limiter les contacts sur l\'EIAS.')],
    precautions: "Surveiller la peau périnéale, le pli inguinal, le positionnement de l'ischion, le flessum de hanche.", niveauFrais: "Réévaluation lors des changements de poids supérieurs à 3 kg." },
  { id: 'prothese-genou', nom: 'Prothèse pour désarticulation du genou', categorie: 'Prothèse', pour: { amputations: ['genou'] },
    description: "Emboîture à appui condylien et genou polycentrique (centre de rotation proche du genou sain).",
    composants: [comp('emboiture', 'Emboîture', 'carbone', ['carbone', 'resine-acrylique', 'verre']), comp('manchon', 'Manchon (liner)', 'silicone', ['silicone', 'gel']), comp('genou', 'Genou polycentrique', 'titane', ['titane', 'acier', 'aluminium']), comp('pylone', 'Pylône', 'aluminium', ['aluminium', 'titane', 'carbone']), comp('pied', 'Pied prothétique', 'carbone', ['carbone', 'pa6'])],
    biomecanique: "L'appui terminal sur les condyles fémoraux est possible et très tolérant. Le genou polycentrique évite que le genou prothétique ne soit plus bas que le genou controlatéral.",
    appuis: [appui('Condyles fémoraux', 'appui', 'epicondyle-lat-femur', 'Appui terminal possible.'), appui('Tubérosité ischiatique', 'appui', 'ischion', 'Complément d\'appui proximal.'), appui('Creux poplité', 'decharge', null, 'Éviter la compression des vaisseaux et nerfs poplités.')],
    precautions: "Volume des condyles : emboîture à fenêtre ou ouverture latérale.", niveauFrais: "Bon pronostic de marche." },
  { id: 'prothese-hanche', nom: 'Prothèse pour désarticulation de hanche', categorie: 'Prothèse', pour: { amputations: ['hanche'] },
    description: "Corbeille pelvienne, articulation de hanche à ressort (type canadien), genou et pied.",
    composants: [comp('emboiture', 'Corbeille pelvienne', 'carbone', ['carbone', 'verre', 'resine-acrylique', 'polyethylene']), comp('manchon', 'Garniture', 'eva', ['eva', 'silicone', 'gel']), comp('hanche', 'Articulation de hanche', 'titane', ['titane', 'acier', 'aluminium']), comp('genou', 'Genou', 'titane', ['titane', 'acier', 'aluminium']), comp('pylone', 'Pylône', 'aluminium', ['aluminium', 'titane', 'carbone']), comp('pied', 'Pied', 'carbone', ['carbone', 'pa6'])],
    biomecanique: "L'appui se fait sur la crête iliaque, l'ischion et le sacrum ; la corbeille remplace la hanche. L'articulation de hanche est placée en avant pour la stabilité en station debout.",
    appuis: [appui('Tubérosité ischiatique', 'appui', 'ischion', 'Appui assis et marche.'), appui('Crête iliaque', 'appui', 'crete-iliaque', 'Appui supérieur et contenance.'), appui('Épine iliaque antéro-supérieure', 'decharge', 'eias', 'Éviter la compression directe.')],
    precautions: "Surveillance de la peau et de la ventilation ; rééducation de la marche lourde.", niveauFrais: "Dépense énergétique la plus élevée." },
  { id: 'prothese-syme', nom: 'Prothèse de Syme', categorie: 'Prothèse', pour: { amputations: ['syme'] },
    description: "Emboîture type botte avec fenêtre médiale ou manchon en résine souple et pied à profil bas.",
    composants: [comp('emboiture', 'Botte / emboîture', 'carbone', ['carbone', 'resine-acrylique', 'verre', 'pa6']), comp('manchon', 'Manchon', 'silicone', ['silicone', 'gel']), comp('pied', 'Pied profil bas', 'carbone', ['carbone', 'pa6'])],
    biomecanique: "L'appui terminal est possible sur le coussinet talonnier : l'emboîture sert surtout de guide et reprend la charge à contact total sous les malléoles (« auto-suspension »).",
    appuis: [appui('Coussinet talonnier', 'appui', 'tuberosite-calcaneus', 'Appui terminal tolérant.'), appui('Malléoles', 'decharge', 'malleole-med', 'Zone de friction : fenêtrer ou garnir.'), appui('Tubérosité tibiale antérieure', 'appui', 'tuberosite-tibiale', 'Appui complémentaire.')],
    precautions: "Surveiller le coussinet talonnier (migration) ; entretien du moignon.", niveauFrais: "Longueur utile du moignon : limite le choix du pied." },
  { id: 'prothese-chopart', nom: 'Prothèse partielle de pied (Chopart / Lisfranc)', categorie: 'Prothèse', pour: { amputations: ['chopart', 'lisfranc'] },
    description: "Chausson prothétique de remplissage avec lame de ressort carbone (silicone et semelle rigide) pour rétablir la longueur du bras de levier.",
    composants: [comp('remplissage', 'Remplissage / chausson', 'silicone', ['silicone', 'eva', 'gel']), comp('lame', 'Lame de ressort', 'carbone', ['carbone', 'pa6', 'polypropylene']), comp('emboiture', 'Coque de maintien', 'carbone', ['carbone', 'pa6', 'polypropylene', 'verre'])],
    biomecanique: "Rétablit l'appui plantaire et la propulsion ; la lame de carbone allonge le levier du pied et protège le moignon. Une coque montante prévient l'équin du talon (déséquilibre triceps / releveurs).",
    appuis: [appui('Talon', 'appui', 'tuberosite-calcaneus', 'Appui postérieur principal.'), appui('Malléoles', 'decharge', 'malleole-lat', 'Décharge des malléoles dans la coque.'), appui('Base du 5e métatarsien', 'decharge', 'base-5e-meta', 'Zone sensible latérale.')],
    precautions: "Prévenir l'équin du talon ; surveiller les points d'appui plantaires.", niveauFrais: "Peut nécessiter une ténotomie d'Achille associée." },

  // ── Prothèses du membre supérieur ──
  { id: 'prothese-transradiale', nom: 'Prothèse trans-radiale myoélectrique', categorie: 'Prothèse', pour: { amputations: ['transradiale', 'poignet'] },
    description: "Emboîture trans-radiale à capteurs myoélectriques, poignet rotateur, main à moteurs.",
    composants: [comp('emboiture', 'Emboîture', 'carbone', ['carbone', 'resine-acrylique', 'verre', 'pa6']), comp('manchon', 'Manchon', 'silicone', ['silicone', 'gel']), comp('poignet', 'Poignet', 'aluminium', ['aluminium', 'titane', 'acier']), comp('main', 'Main / crochet', 'silicone', ['silicone', 'aluminium', 'carbone'])],
    biomecanique: "Les capteurs captent l'activité des muscles fléchisseurs et extenseurs résiduels ; le contact total avec le moignon assure la suspension ; on respecte l'olécrane et le pli du coude pour laisser le coude actif.",
    appuis: [appui('Olécrane', 'decharge', 'olecrane', 'Ne pas bloquer la flexion du coude.'), appui('Épicondyles', 'appui', 'epicondyle-lat-humerus', 'Suspension par contact condylien.'), appui('Pli du coude', 'decharge', 'epicondyle-med-humerus', 'Garder la liberté de flexion.')],
    precautions: "Surveiller la transpiration, l'état de peau, les capteurs.", niveauFrais: "Prothèse esthétique ou à crochet comme alternative robuste." },
  { id: 'prothese-transhumerale', nom: 'Prothèse trans-humérale', categorie: 'Prothèse', pour: { amputations: ['transhumerale', 'coude', 'epaule-disarticulation'] },
    description: "Emboîture, coude prothétique (mécanique ou myoélectrique), poignet et main.",
    composants: [comp('emboiture', 'Emboîture', 'carbone', ['carbone', 'resine-acrylique', 'verre', 'pa6']), comp('manchon', 'Manchon', 'silicone', ['silicone', 'gel']), comp('coude', 'Coude', 'titane', ['titane', 'aluminium', 'acier']), comp('main', 'Main / crochet', 'silicone', ['silicone', 'aluminium', 'carbone'])],
    biomecanique: "Suspension par harnais ou autosuspension ; le coude à verrouillage permet de positionner l'avant-bras ; la commande se fait par câbles et mouvements d'épaule ou par capteurs.",
    appuis: [appui('Acromion', 'appui', 'acromion', 'Appui de suspension en haut.'), appui('Creux axillaire', 'decharge', null, 'Éviter la compression des vaisseaux et du plexus.')],
    precautions: "Vérifier les points de friction du harnais et la compression axillaire.", niveauFrais: "Prothèse lourde : repartir le poids sur le thorax." },
  { id: 'prothese-main-partielle', nom: 'Prothèse de main partielle / digitale', categorie: 'Prothèse', pour: { amputations: ['transmetacarpienne', 'doigts'] },
    description: "Gant en silicone avec doigts mécaniques, doigts myoélectriques ou doigts cosmétiques.",
    composants: [comp('main', 'Gant / doigts', 'silicone', ['silicone', 'gel', 'pa6']), comp('emboiture', 'Armature', 'pa6', ['pa6', 'carbone', 'thermo-basse'])],
    biomecanique: "Rétablit la pince et la préhension avec le pouce ; l'appui est réparti sur la paume.", appuis: [appui('Paume', 'appui', null, 'Appui large sur la paume.'), appui('Poignet', 'decharge', 'styloide-radiale', 'Laisser libre la mobilité du poignet.')],
    precautions: "Entretien du silicone, hygiène des moignons digitaux.", niveauFrais: "Esthétique et fonction sont indissociables." },

  // ── Corsets de scoliose ──
  { id: 'corset-cheneau', nom: 'Corset de Chêneau (thermoformé / PA6 imprimé)', categorie: 'Corset', pour: { scoliose: true },
    description: "Corset asymétrique, moulé sur le patient, avec des pelotes de poussée côté convexe et des zones d'expansion côté concave : la correction se fait par appui et par espace pour permettre la dérotation.",
    composants: [comp('coque', 'Coque', 'polyethylene', ['polyethylene', 'polypropylene', 'pa6', 'nylon', 'resine-acrylique']), comp('pelote', 'Pelotes d\'appui', 'eva', ['eva', 'gel', 'silicone']), comp('fermeture', 'Fermeture (sangles)', 'nylon', ['nylon', 'acier', 'aluminium'])],
    biomecanique: "Système à 3 points : appui sur le sommet de la courbure (apex) côté convexe, deux contre-appuis opposés au-dessus et au-dessous. S'y ajoutent des zones de décharge (fenêtres) côté concave qui permettent à la cage thoracique de se dérotater et de se déplacer.",
    precautions: "Port de 18 à 23 h par jour ; surveiller la peau (points de pression), la respiration, la croissance (corset à refaire tous les 6-12 mois).", niveauFrais: "Efficacité si > 18 h/j selon SOSORT. La radiographie en corset doit montrer au moins 40 % de correction." },
  { id: 'corset-boston', nom: 'Corset de Boston (polyéthylène préfabriqué)', categorie: 'Corset', pour: { scoliose: true },
    description: "Corset symétrique à base de modules préfabriqués, adaptés selon le patient, pour les courbures lombaires et thoraco-lombaires basses (apex ≤ T7).",
    composants: [comp('coque', 'Coque', 'polyethylene', ['polyethylene', 'polypropylene', 'pa6']), comp('pelote', 'Pelotes d\'appui', 'eva', ['eva', 'gel', 'silicone']), comp('fermeture', 'Fermeture', 'nylon', ['nylon', 'acier'])],
    biomecanique: "Appui sur la courbure lombaire convexe avec contre-appuis à la région axillaire et pelvienne ; réduction de la lordose lombaire par appui abdominal.",
    precautions: "Moins efficace sur les courbures thoraciques hautes ; le port est de 18 à 23 h.", niveauFrais: "Utilisation fréquente chez l'adolescent." },
  { id: 'corset-lyon', nom: 'Corset de Lyon (aluminium + polyéthylène)', categorie: 'Corset', pour: { scoliose: true },
    description: "Corset articulé en deux parties, avec une armature métallique et des pelotes en polyéthylène, réglable pour s'adapter à la croissance.",
    composants: [comp('armature', 'Armature', 'aluminium', ['aluminium', 'acier', 'titane']), comp('coque', 'Éléments en plastique', 'polyethylene', ['polyethylene', 'polypropylene', 'pa6']), comp('pelote', 'Pelotes', 'eva', ['eva', 'gel', 'silicone'])],
    biomecanique: "Appui sur le sommet de la courbure par des pelotes réglables ; l'armature permet de modifier la pression sans refaire le corset.",
    precautions: "Plus visible que les corsets thermoformés ; contrôle régulier des réglages.", niveauFrais: "Bon compromis entre efficacité et réglage." },
  { id: 'corset-nocturne', nom: 'Corset nocturne (Providence / Charleston)', categorie: 'Corset', pour: { scoliose: true },
    description: "Corset porté la nuit uniquement, qui corrige par hypercorrection en décubitus (sans charge gravitaire).",
    composants: [comp('coque', 'Coque', 'polyethylene', ['polyethylene', 'polypropylene', 'pa6']), comp('pelote', 'Pelotes', 'eva', ['eva', 'gel', 'silicone'])],
    biomecanique: "Hypercorrection par appuis forts, possible car le patient est allongé et immobile ; adapté aux courbures de 20 à 35°.",
    precautions: "Observance cruciale ; pas adapté aux courbures > 40° ni aux doubles courbures complexes.", niveauFrais: "Observance meilleure que les corsets de jour." },

  // ── Fractures : orthèses et immobilisations ──
  { id: 'echarpe', zone: { membre: 'MS', y0: .8, y1: 1.1 }, nom: 'Écharpe + bandage en 8', categorie: 'Orthèse', pour: { fractures: ['clavicule-tiers-moyen'] },
    description: "Écharpe pour décharger l'épaule et bandage en 8 pour ramener les épaules en arrière.", composants: [comp('sangle', 'Sangles', 'nylon', ['nylon', 'eva'])],
    biomecanique: "Le bandage en 8 maintient les épaules en rétropulsion et réduit l'écart entre les fragments ; l'écharpe soulage le poids du bras.", appuis: [appui('Poignet / avant-bras', 'appui', 'styloide-radiale', 'Soutien de l\'avant-bras.'), appui('Creux axillaire', 'decharge', null, 'Surveiller la compression du plexus.')],
    precautions: "Surveiller la peau des aisselles ; mobiliser le coude et la main.", niveauFrais: "Traitement orthopédique 3 à 4 semaines." },
  { id: 'orthese-sarmiento', zone: { membre: 'MS', y0: 1.12, y1: 1.38 }, nom: 'Orthèse brachiale (Sarmiento)', categorie: 'Orthèse', pour: { fractures: ['humerus-diaphyse'] },
    description: "Manchon rigide en deux coques (thermoplastique ou résine) qui enserre le bras et permet de mobiliser le coude et l'épaule.", composants: [comp('coque', 'Manchon rigide', 'polyethylene', ['polyethylene', 'polypropylene', 'pa6', 'resine-acrylique', 'verre', 'thermo-basse']), comp('sangle', 'Sangles', 'nylon', ['nylon', 'eva'])],
    biomecanique: "Principe de l'effet hydraulique : la compression circonférentielle des parties molles maintient l'alignement de la fracture et stabilise le foyer ; la mobilisation active favorise la consolidation.", appuis: [appui('Bras (circonférentiel)', 'appui', null, 'Compression uniforme des parties molles.'), appui('Creux axillaire', 'decharge', null, 'Libérer le plexus.'), appui('Épicondyles', 'decharge', 'epicondyle-lat-humerus', 'Ne pas gêner la flexion du coude.')],
    precautions: "Vérifier la sensibilité et la mobilité des doigts (nerf radial).", niveauFrais: "6 à 8 semaines." },
  { id: 'orthese-poignet-resine', zone: { membre: 'MS', y0: .76, y1: 1.02 }, nom: 'Manchette plâtrée / résine', categorie: 'Orthèse', pour: { fractures: ['radius-distal-pouteau-colles', 'avant-bras-deux-os'] },
    description: "Manchette en résine ou plâtre qui immobilise le poignet en légère flexion et inclinaison ulnaire, en laissant libres le coude et les doigts.", composants: [comp('coque', 'Manchette', 'platre', ['platre', 'verre', 'thermo-basse', 'resine-acrylique'])],
    biomecanique: "Maintien de la réduction par 3 points : appui dorsal sur le fragment distal, appui palmaire proximal, contre-appui radial.", appuis: [appui('Fragment distal', 'appui', 'styloide-radiale', 'Appui palmaire.'), appui('Pli du coude', 'decharge', 'epicondyle-med-humerus', 'Libérer la flexion du coude.')],
    precautions: "Surélévation, surveillance des doigts (œdème, couleur, mobilité) ; syndrome des loges.", niveauFrais: "4 à 6 semaines." },
  { id: 'botte-resine', zone: { membre: 'MI', y0: .06, y1: .46, pied: true }, nom: 'Botte en résine / orthèse jambière', categorie: 'Orthèse', pour: { fractures: ['tibia-fibula-diaphyse', 'malleole-weber-b'] },
    description: "Botte rigide en résine ou plâtre, avec talonnette pour la marche, ou orthèse de décharge type botte amovible.", composants: [comp('coque', 'Botte', 'platre', ['platre', 'verre', 'polypropylene', 'pa6', 'thermo-basse'])],
    biomecanique: "Maintient la cheville à 90° et bloque la prono-supination ; l'appui est réparti sur le tibia et le pied.", appuis: [appui('Tendon patellaire', 'appui', 'tuberosite-tibiale', 'Appui de décharge partielle.'), appui('Tête de la fibula', 'decharge', 'tete-fibula', 'Nerf fibulaire commun : bien garnir.'), appui('Malléoles', 'decharge', 'malleole-lat', 'Rembourrer.')],
    precautions: "Surveiller les points d'appui des malléoles et la compression du nerf fibulaire.", niveauFrais: "6 à 8 semaines selon la consolidation." },
  { id: 'corset-jewett', nom: 'Corset de Jewett (hyperextension 3 points)', categorie: 'Corset', pour: { fractures: ['tassement-l1', 'explosion-l1'] },
    description: "Orthèse thoraco-lombaire à trois points d'appui (sternum, pubis, rachis dorsolombaire) qui maintient le rachis en extension et décharge la partie antérieure des vertèbres.", composants: [comp('armature', 'Armature', 'aluminium', ['aluminium', 'acier', 'titane']), comp('pelote', 'Pelotes', 'eva', ['eva', 'gel', 'silicone'])],
    biomecanique: "Système à 3 points : appui sternal et pubien en avant, contre-appui dorsal au niveau de la fracture : l'extension du rachis soulage le corps vertébral fracturé et limite la cyphose.", appuis: [appui('Sternum', 'appui', 'angle-louis', 'Appui antérieur supérieur.'), appui('Symphyse pubienne', 'appui', 'symphyse-pubienne', 'Appui antérieur inférieur.'), appui('Rachis dorso-lombaire', 'appui', 'epineuse-l4', 'Contre-appui postérieur.'), appui('Abdomen', 'decharge', null, 'Zone libre pour la digestion et la respiration.')],
    precautions: "Surveiller la respiration, la peau au niveau du pubis et du sternum.", niveauFrais: "8 à 12 semaines." }
];

/** Appareillages proposés pour la pathologie en cours : { amputation, scoliose, fracture } (état du store) */
export function appareilsCompatibles(pathologie) {
  const p = pathologie || {};
  return APPAREILLAGES.filter(m =>
    (m.pour.amputations && p.amputation && m.pour.amputations.includes(p.amputation.niveau)) ||
    (m.pour.scoliose && p.scoliose) ||
    (m.pour.fractures && p.fracture && m.pour.fractures.includes(p.fracture.id)));
}
