/* ═════════════ ANATOMIE : MOUVEMENTS DU SQUELETTE (module pur, S5) ═════════════
   Le modèle BodyParts3D est une pose figée : les os sont des pièces séparées. Ce module construit un SQUELETTE ARTICULÉ SIMPLIFIÉ (segments rigides et articulations dont les pivots sont
   estimés depuis les bornes des os : tête fémorale, genou, cheville, épaule, coude, poignet, jonction lombo-sacrée, charnière cervicale), la bibliothèque de mouvements
   (angles en fonction de la phase d'un cycle), les muscles agonistes / antagonistes de chaque mouvement et les amplitudes de référence.
   Les angles sont des degrés ANATOMIQUES (flexion, abduction, rotation) ; la conversion en rotations 3D est faite par la vue. Pédagogique : mouvements simplifiés
   (pas de rythme scapulo-huméral, pas de roulement-glissement du genou), amplitudes de référence classiques à vérifier avec le cours / un atlas. */
export const A_VERIFIER_MVT = 'Mouvement simplifié, amplitudes de référence classiques : à vérifier avec le cours / un atlas de référence.';
const sansCote = n => String(n).toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right)( |$)/, ' of $2').replace(/\s+/g, ' ').trim();
const C = { droit: 'D', gauche: 'G' };

/* Hiérarchie des segments : nom → parent. Les côtés sont portés par le suffixe D / G. */
export const HIERARCHIE = { bassin: null, tronc: 'bassin', tete: 'tronc', brasD: 'tronc', brasG: 'tronc', avantbrasD: 'brasD', avantbrasG: 'brasG', mainD: 'avantbrasD', mainG: 'avantbrasG', cuisseD: 'bassin', cuisseG: 'bassin', jambeD: 'cuisseD', jambeG: 'cuisseG', piedD: 'jambeD', piedG: 'jambeG' };
/* Articulation d'un segment (le pivot est dans le repère du modèle au repos) */
export const ARTICULATION = { tronc: 'lombo-sacree', tete: 'cervicale', brasD: 'epauleD', brasG: 'epauleG', avantbrasD: 'coudeD', avantbrasG: 'coudeG', mainD: 'poignetD', mainG: 'poignetG', cuisseD: 'hancheD', cuisseG: 'hancheG', jambeD: 'genouD', jambeG: 'genouG', piedD: 'chevilleD', piedG: 'chevilleG' };

/* Segment d'un os d'après son nom anglais (os seulement ; les autres pièces suivent l'os le plus proche) */
export function segmentDeOs(nomEn, cote) {
  const n = sansCote(nomEn), s = cote ? C[cote] : '';
  if (/^femur$/.test(n)) return 'cuisse' + s;
  if (/^(tibia|fibula|patella)$/.test(n)) return 'jambe' + s;
  if (/calcaneus|talus|cuboid|cuneiform|navicular bone of foot|sesamoid bone of foot|metatarsal|phalanx of .*(toe)/.test(n)) return 'pied' + s;
  if (/^humerus$/.test(n)) return 'bras' + s;
  if (/^(radius|ulna)$/.test(n)) return 'avantbras' + s;
  if (/scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|phalanx of .*(finger|thumb)/.test(n)) return 'main' + s;
  if (/skull|frontal bone|parietal|occipital|temporal bone|sphenoid|ethmoid|maxilla|mandible|zygomatic|nasal bone|palatine|vomer|hyoid|^atlas$|^axis$|cervical vertebra/.test(n)) return 'tete';
  if (/hip bone|sacrum|coccyx/.test(n)) return 'bassin';
  if (/clavicle|scapula|rib$|sternum|manubrium|xiphoid|thoracic vertebra|lumbar vertebra/.test(n)) return 'tronc';
  return null;
}

/* Squelette articulé : orientation du modèle (avant, côté), pivots, segment de chaque pièce. index = résultat de creerIndex. */
export function construireRig(index) {
  const os = index.deSysteme('os'), trouver = (re, cote) => os.find(p => re.test(sansCote(p.nom_en)) && (!cote || p.cote === cote));
  const centre = p => index.centre(p), borne = p => p.bornes;
  const sacrum = trouver(/^sacrum$/), sternum = trouver(/^body of sternum$/);
  const ant = Math.sign(centre(sternum)[2] - centre(sacrum)[2]) || 1;          // sens « vers l'avant » sur l'axe Z du modèle
  const cote = {}; for (const c of ['droit', 'gauche']) { const f = trouver(/^femur$/, c); cote[c] = Math.sign(centre(f)[0]) || 1; }   // signe de X du côté
  const pivots = {};
  for (const c of ['droit', 'gauche']) {
    const S = C[c], l = cote[c], fem = trouver(/^femur$/, c), tib = trouver(/^tibia$/, c), hum = trouver(/^humerus$/, c), rad = trouver(/^radius$/, c), ulna = trouver(/^ulna$/, c), cal = trouver(/^calcaneus$/, c), tal = trouver(/^talus$/, c), carp = trouver(/^capitate$/, c);
    const fb = borne(fem), cf = centre(fem), edgeMed = l > 0 ? fb[0][0] : fb[1][0];
    pivots['hanche' + S] = [edgeMed + l * 0.022, fb[1][1] - 0.03, cf[2] + ant * 0.01];
    pivots['genou' + S] = [cf[0], (fb[0][1] + borne(tib)[1][1]) / 2, centre(tib)[2]];
    pivots['cheville' + S] = [centre(tal)[0], centre(tal)[1] + 0.005, centre(tal)[2]];
    const hb = borne(hum), ch = centre(hum), edgeMedH = l > 0 ? hb[0][0] : hb[1][0];
    pivots['epaule' + S] = [edgeMedH + l * 0.02, hb[1][1] - 0.025, ch[2]];
    pivots['coude' + S] = [ch[0], hb[0][1] + 0.012, ch[2]];
    pivots['poignet' + S] = [centre(carp)[0], centre(carp)[1] + 0.02, centre(carp)[2]];
  }
  const l5 = trouver(/^fifth lumbar vertebra$/), c7 = trouver(/^seventh cervical vertebra$/);
  pivots['lombo-sacree'] = l5 ? centre(l5) : centre(sacrum); pivots.cervicale = c7 ? centre(c7) : [0, 1.45, 0];
  const segmentDe = {}, repere = os.filter(p => segmentDeOs(p.nom_en, p.cote)).map(p => ({ c: centre(p), s: segmentDeOs(p.nom_en, p.cote) }));
  for (const p of index.pieces) {
    if (!p.bornes) continue; let s = p.systeme === 'os' ? segmentDeOs(p.nom_en, p.cote) : null;
    if (!s && (p.systeme === 'cerveau' || p.region === 'tête' && p.systeme !== 'muscles')) s = 'tete';
    if (!s) { const c = centre(p); let m = 1e9; for (const r of repere) { const d = (r.c[0] - c[0]) ** 2 + (r.c[1] - c[1]) ** 2 + (r.c[2] - c[2]) ** 2; if (d < m) { m = d; s = r.s; } } }
    segmentDe[p.id] = s || 'tronc';
  }
  return { ant, cote, pivots, segmentDe };
}

/* ── muscles dont on suit la longueur (segment proximal → distal) ── */
export const MUSCLES_SEGMENTS = {
  'biceps brachii': ['tronc', 'avantbras'], 'brachialis': ['bras', 'avantbras'], 'triceps brachii': ['tronc', 'avantbras'], 'brachioradialis': ['bras', 'avantbras'], 'deltoid': ['tronc', 'bras'], 'supraspinatus': ['tronc', 'bras'], 'pectoralis major': ['tronc', 'bras'], 'coracobrachialis': ['tronc', 'bras'],
  'pronator teres': ['bras', 'avantbras'], 'flexor carpi radialis': ['bras', 'main'], 'extensor carpi radialis longus': ['bras', 'main'], 'flexor carpi ulnaris': ['bras', 'main'], 'extensor carpi ulnaris': ['bras', 'main'], 'extensor digitorum': ['bras', 'main'], 'flexor digitorum superficialis': ['bras', 'main'],
  'rectus femoris': ['bassin', 'jambe'], 'vastus lateralis': ['cuisse', 'jambe'], 'vastus medialis': ['cuisse', 'jambe'], 'vastus intermedius': ['cuisse', 'jambe'], 'semitendinosus': ['bassin', 'jambe'], 'semimembranosus': ['bassin', 'jambe'], 'biceps femoris': ['bassin', 'jambe'], 'sartorius': ['bassin', 'jambe'], 'gracilis': ['bassin', 'jambe'],
  'gluteus maximus': ['bassin', 'cuisse'], 'gluteus medius': ['bassin', 'cuisse'], 'gluteus minimus': ['bassin', 'cuisse'], 'psoas major': ['tronc', 'cuisse'], 'iliacus': ['bassin', 'cuisse'], 'adductor longus': ['bassin', 'cuisse'], 'adductor magnus': ['bassin', 'cuisse'], 'adductor brevis': ['bassin', 'cuisse'], 'pectineus': ['bassin', 'cuisse'],
  'tibialis anterior': ['jambe', 'pied'], 'gastrocnemius': ['cuisse', 'pied'], 'soleus': ['jambe', 'pied'], 'tibialis posterior': ['jambe', 'pied'], 'fibularis longus': ['jambe', 'pied'], 'fibularis brevis': ['jambe', 'pied'], 'extensor digitorum longus': ['jambe', 'pied'], 'flexor digitorum longus': ['jambe', 'pied'], 'extensor hallucis longus': ['jambe', 'pied'], 'flexor hallucis longus': ['jambe', 'pied']
};

/* ── amplitudes de référence (goniométrie classique, en degrés, ± quelques degrés selon les sources) ── */
export const AMPLITUDES = {
  hancheFlexion: [0, 120], hancheExtension: [0, 20], hancheAbduction: [0, 45], genouFlexion: [0, 140], chevilleDorsiflexion: [0, 20], chevillePlantaire: [0, 50],
  epauleFlexion: [0, 180], epauleAbduction: [0, 180], epauleExtension: [0, 60], coudeFlexion: [0, 145], troncFlexion: [0, 60], troncExtension: [0, 25], teteRotation: [-80, 80], teteFlexion: [-45, 45]
};

const TAU = Math.PI * 2, rad = d => d, wrap = x => x - Math.round(x);
const g = (p, c, s) => { const d = wrap(p - c); return Math.exp(-(d * d) / (2 * s * s)); };       // gaussienne périodique
const lisse = p => 0.5 - 0.5 * Math.cos(TAU * p);                                                 // 0 → 1 → 0 sur un cycle

/* Jambe qui marche à la phase p (0 = contact du talon) */
const jambeMarche = p => ({ hanche: { fl: 10 + 20 * Math.cos(TAU * p) }, genou: { fl: 5 + 10 * g(p, 0.12, 0.08) + 52 * g(p, 0.72, 0.1) }, cheville: { fl: 8 * g(p, 0.4, 0.12) - 4 * g(p, 0.04, 0.04) - 15 * g(p, 0.62, 0.07) } });
const MARCHE = p => {
  const D = jambeMarche(p), G = jambeMarche(wrap(p + 0.5) + (wrap(p + 0.5) < 0 ? 1 : 0));
  return { hancheD: D.hanche, genouD: D.genou, chevilleD: D.cheville, hancheG: G.hanche, genouG: G.genou, chevilleG: G.cheville,
    epauleD: { fl: -22 * Math.cos(TAU * p) + 3 }, epauleG: { fl: 22 * Math.cos(TAU * p) + 3 }, coudeD: { fl: 20 + 8 * (1 - Math.cos(TAU * p)) / 2 }, coudeG: { fl: 20 + 8 * (1 + Math.cos(TAU * p)) / 2 },
    tronc: { rot: 5 * Math.sin(TAU * p) }, bassin: { dy: 0.012 * Math.cos(2 * TAU * p) - 0.006 } };
};

/* Bibliothèque de mouvements. agonistes / antagonistes = clés de MUSCLES (anatomie-muscles.js). duree : secondes pour un cycle. */
export const MOUVEMENTS = [
  { id: 'marche', nom: 'Marche', alias: ['marche', 'marcher', 'la marche', 'cycle de marche', 'locomotion'], duree: 2.4, articulation: 'hanches, genoux, chevilles, épaules et coudes (bras opposés aux jambes)', plan: 'sagittal',
    angles: MARCHE, agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'tibialis anterior', 'gastrocnemius', 'soleus', 'iliacus', 'psoas major', 'biceps femoris'], antagonistes: ['semitendinosus', 'semimembranosus', 'fibularis longus'],
    amplitude: 'hanche environ −10° à +30°, genou jusqu’à 60° à la phase pendulaire, cheville de −15° à +8° (valeurs typiques d’une marche à vitesse libre)',
    explication: 'Cycle de marche : au contact du talon, la hanche est fléchie. Le moyen et le grand fessier stabilisent et étendent la hanche pendant l’appui, le quadriceps amortit la flexion du genou, le triceps sural pousse au décollement. En phase pendulaire, le psoas et le droit fémoral avancent la jambe, le tibial antérieur relève le pied. Les bras balancent en sens inverse des jambes.' },
  { id: 'flexion_hanche', nom: 'Flexion de hanche', alias: ['flexion de hanche', 'flexion de la hanche', 'lever la jambe', 'leve la jambe', 'flexion hanche'], duree: 3, articulation: 'hanche droite et gauche', plan: 'sagittal',
    angles: p => ({ hancheD: { fl: 100 * lisse(p) }, genouD: { fl: 60 * lisse(p) } }), agonistes: ['psoas major', 'iliacus', 'rectus femoris', 'sartorius', 'pectineus'], antagonistes: ['gluteus maximus', 'semitendinosus', 'semimembranosus', 'biceps femoris'],
    amplitude: 'flexion de hanche jusqu’à 120° (genou fléchi) ; ici 100° pour une prise de hauteur', explication: 'Flexion de la hanche droite, genou fléchi : l’ilio-psoas est le fléchisseur principal, aidé du droit fémoral, du sartorius et du pectiné. Les ischio-jambiers et le grand fessier sont les antagonistes qui limitent l’amplitude.' },
  { id: 'extension_hanche', nom: 'Extension de hanche', alias: ['extension de hanche', 'extension de la hanche', 'jambe en arriere', 'extension hanche'], duree: 3, articulation: 'hanche droite', plan: 'sagittal',
    angles: p => ({ hancheD: { fl: -20 * lisse(p) } }), agonistes: ['gluteus maximus', 'semitendinosus', 'semimembranosus', 'biceps femoris'], antagonistes: ['psoas major', 'iliacus', 'rectus femoris'],
    amplitude: 'extension de hanche d’environ 20° (limitée par le ligament ilio-fémoral)', explication: 'Extension de hanche : le grand fessier et les ischio-jambiers portent la cuisse en arrière. L’ilio-psoas et le droit fémoral sont étirés. L’amplitude est faible, limitée par le ligament ilio-fémoral.' },
  { id: 'abduction_hanche', nom: 'Abduction de hanche', alias: ['abduction de hanche', 'abduction de la hanche', 'jambe sur le cote', 'ecarter la jambe', 'abduction hanche'], duree: 3, articulation: 'hanche droite', plan: 'frontal',
    angles: p => ({ hancheD: { ab: 40 * lisse(p) } }), agonistes: ['gluteus medius', 'gluteus minimus'], antagonistes: ['adductor longus', 'adductor magnus', 'adductor brevis', 'gracilis', 'pectineus'],
    amplitude: 'abduction de hanche d’environ 45°', explication: 'Abduction de la hanche : le moyen fessier et le petit fessier écartent la jambe. Les adducteurs sont les antagonistes. Les mêmes muscles stabilisent le bassin en appui monopodal (signe de Trendelenburg si faibles).' },
  { id: 'flexion_genou', nom: 'Flexion de genou', alias: ['flexion de genou', 'flexion du genou', 'flechir le genou', 'flexion genou', 'plier le genou'], duree: 3, articulation: 'genou droit', plan: 'sagittal',
    angles: p => ({ genouD: { fl: 120 * lisse(p) }, hancheD: { fl: 8 * lisse(p) } }), agonistes: ['semitendinosus', 'semimembranosus', 'biceps femoris', 'gastrocnemius', 'sartorius', 'gracilis'], antagonistes: ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'],
    amplitude: 'flexion de genou jusqu’à 135-140° (active environ 120-130°)', explication: 'Flexion du genou : les ischio-jambiers sont les fléchisseurs principaux, aidés du gastrocnémien, du sartorius et du gracile. Le quadriceps est l’antagoniste. En fin de flexion, le tibia tourne légèrement.' },
  { id: 'extension_genou', nom: 'Extension de genou', alias: ['extension de genou', 'extension du genou', 'tendre la jambe', 'extension genou', 'extension de la jambe'], duree: 3, articulation: 'genou droit', plan: 'sagittal',
    angles: p => ({ genouD: { fl: 90 * (1 - lisse(p)) }, hancheD: { fl: 90 } }), agonistes: ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'], antagonistes: ['semitendinosus', 'semimembranosus', 'biceps femoris'],
    amplitude: 'extension complète à 0° ; hyperextension possible de quelques degrés', explication: 'Extension du genou, assis, cuisse à l’horizontale : le quadriceps (droit fémoral et trois vastes) tend la jambe par le tendon patellaire. Les ischio-jambiers sont les antagonistes. Le vaste médial oblique stabilise la patella.' },
  { id: 'cheville', nom: 'Flexion dorsale et plantaire de la cheville', alias: ['flexion de la cheville', 'flexion plantaire', 'dorsiflexion', 'cheville', 'mouvement de la cheville', 'flexion de cheville'], duree: 3, articulation: 'cheville droite', plan: 'sagittal',
    angles: p => ({ chevilleD: { fl: 18 * Math.sin(TAU * p) * (Math.sin(TAU * p) > 0 ? 1 : 2.4) } }), agonistes: ['tibialis anterior', 'extensor digitorum longus', 'extensor hallucis longus', 'gastrocnemius', 'soleus'], antagonistes: ['fibularis longus', 'tibialis posterior'],
    amplitude: 'flexion dorsale d’environ 20°, flexion plantaire d’environ 45 à 50°', explication: 'Dorsiflexion : le tibial antérieur et les extenseurs relèvent le pied. Flexion plantaire : le triceps sural (gastrocnémien et soléaire) abaisse le pied par le tendon calcanéen. Les deux groupes sont antagonistes.' },
  { id: 'abduction_epaule', nom: 'Abduction de l’épaule', alias: ['abduction de l epaule', 'abduction de l’épaule', 'abduction epaule', 'lever le bras sur le cote', 'ecarter le bras', 'abduction du bras'], duree: 3.5, articulation: 'épaule droite et gauche', plan: 'frontal',
    angles: p => ({ epauleD: { ab: 160 * lisse(p) }, epauleG: { ab: 160 * lisse(p) } }), agonistes: ['deltoid', 'supraspinatus', 'trapezius', 'serratus anterior'], antagonistes: ['pectoralis major', 'teres major'],
    amplitude: 'abduction de l’épaule jusqu’à 180° (dont environ 60° de rotation de la scapula) ; ici 160°', explication: 'Abduction de l’épaule : le supra-épineux débute le mouvement, le deltoïde prend le relais. Au-delà de 90°, le trapèze et le dentelé antérieur font tourner la scapula (rythme scapulo-huméral, non simulé ici). Le grand rond et le grand pectoral sont les antagonistes.' },
  { id: 'flexion_epaule', nom: 'Flexion de l’épaule', alias: ['flexion de l epaule', 'flexion de l’épaule', 'lever le bras', 'lever les bras', 'flexion epaule', 'bras vers l avant', 'elevation du bras'], duree: 3.5, articulation: 'épaule droite et gauche', plan: 'sagittal',
    angles: p => ({ epauleD: { fl: 160 * lisse(p) }, epauleG: { fl: 160 * lisse(p) } }), agonistes: ['deltoid', 'pectoralis major', 'coracobrachialis', 'biceps brachii'], antagonistes: ['teres major', 'triceps brachii', 'infraspinatus muscle'],
    amplitude: 'flexion de l’épaule jusqu’à 180° ; ici 160°', explication: 'Flexion de l’épaule : le deltoïde antérieur, le faisceau claviculaire du grand pectoral, le coraco-brachial et le biceps élèvent le bras vers l’avant. Le grand rond et le triceps sont les antagonistes.' },
  { id: 'flexion_coude', nom: 'Flexion du coude', alias: ['flexion du coude', 'flexion de coude', 'flechir le coude', 'plier le coude', 'flexion coude', 'curl'], duree: 3, articulation: 'coudes', plan: 'sagittal',
    angles: p => ({ coudeD: { fl: 140 * lisse(p) }, coudeG: { fl: 140 * lisse(p) } }), agonistes: ['biceps brachii', 'brachialis', 'brachioradialis'], antagonistes: ['triceps brachii'],
    amplitude: 'flexion du coude jusqu’à 145° (140° ici)', explication: 'Flexion du coude : le brachial est le fléchisseur le plus puissant, le biceps l’aide surtout en supination, le brachio-radial en position neutre. Le triceps brachial est l’antagoniste (extension).' },
  { id: 'flexion_tronc', nom: 'Flexion du tronc', alias: ['flexion du tronc', 'flexion de tronc', 'se pencher en avant', 'flechir le tronc', 'flexion avant', 'toucher les pieds'], duree: 4, articulation: 'rachis lombaire et hanches', plan: 'sagittal',
    angles: p => ({ tronc: { fl: 55 * lisse(p) }, hancheD: { fl: 35 * lisse(p) }, hancheG: { fl: 35 * lisse(p) } }), agonistes: ['psoas major', 'external oblique', 'rectus femoris'], antagonistes: ['longissimus thoracis', 'iliocostalis lumborum', 'gluteus maximus', 'semitendinosus'],
    amplitude: 'flexion lombaire d’environ 40 à 60° ; le reste de la flexion vient de la bascule du bassin (hanches)', explication: 'Flexion du tronc : les abdominaux et le psoas fléchissent le rachis ; en fin de course, les érecteurs du rachis, les fessiers et les ischio-jambiers freinent en s’allongeant. Le mouvement vient à la fois du rachis lombaire et de la bascule du bassin.' },
  { id: 'rotation_tete', nom: 'Rotation de la tête', alias: ['rotation de la tete', 'rotation de la tête', 'tourner la tete', 'tourner la tête', 'dire non', 'rotation cervicale', 'regarder a gauche et a droite'], duree: 4, articulation: 'rachis cervical (surtout atlas-axis)', plan: 'horizontal',
    angles: p => ({ tete: { rot: 70 * Math.sin(TAU * p) } }), agonistes: ['sternocleidomastoid', 'splenius capitis', 'semispinalis capitis'], antagonistes: ['trapezius'],
    amplitude: 'rotation cervicale d’environ 80° de chaque côté (la moitié à l’articulation atlas-axis)', explication: 'Rotation de la tête : le sterno-cléido-mastoïdien tourne la tête vers le côté opposé, le splénius la tourne du même côté. La moitié de l’amplitude se fait entre l’atlas et l’axis.' },
  { id: 'accroupissement', nom: 'Accroupissement (squat)', alias: ['accroupissement', 'accroupis toi', 'squat', 'faire un squat', 'flexion des jambes', 'flexion des membres inferieurs'], duree: 3.6, articulation: 'hanches, genoux et chevilles ensemble', plan: 'sagittal',
    angles: p => { const s = lisse(p); return { hancheD: { fl: 95 * s }, hancheG: { fl: 95 * s }, genouD: { fl: 105 * s }, genouG: { fl: 105 * s }, chevilleD: { fl: 22 * s }, chevilleG: { fl: 22 * s }, tronc: { fl: 28 * s }, bassin: { dy: -0.36 * s * 0.0 } }; },
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'adductor magnus', 'soleus'], antagonistes: ['psoas major', 'iliacus', 'tibialis anterior'],
    amplitude: 'hanche environ 95°, genou environ 105°, cheville environ 22° de dorsiflexion (squat parallèle)', explication: 'Squat : à la descente, le quadriceps, le grand fessier et les adducteurs freinent en s’allongeant (travail excentrique) ; à la remontée, ils se raccourcissent pour étendre hanches et genoux. Le soléaire stabilise la jambe. Une dorsiflexion limitée de la cheville limite la profondeur.' }
];

/* Mouvement d'après un texte libre (français) ; null si inconnu */
export function trouverMouvement(texte) {
  const n = String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  const nn = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ');
  let meilleur = null, taille = 0;
  for (const m of MOUVEMENTS) for (const a of [m.nom, ...m.alias]) { const k = nn(a); if ((n === k || n.includes(k)) && k.length > taille) { meilleur = m; taille = k.length; } }
  return meilleur;
}
/* Phase p dans [0, 1) → angles ; la valeur à p = 0 et à p = 1 doit être identique (boucle sans saut). */
export const anglesA = (mouvement, p) => mouvement.angles(((p % 1) + 1) % 1);
/* Phrase parlée par Raylé */
export function explicationParlee(m) { return m.nom + '. ' + m.explication + ' Amplitude de référence : ' + m.amplitude + '. Agonistes en rouge, antagonistes en bleu. ' + A_VERIFIER_MVT; }
export const COULEURS_ROLES = { agoniste: [1.0, 0.25, 0.15], antagoniste: [0.2, 0.45, 1.0] };
