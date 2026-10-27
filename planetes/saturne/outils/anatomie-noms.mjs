/* ═════════════ ANATOMIE : NOMS (latin, français), CÔTÉ, TYPE ET RÉGION DES PIÈCES (outil hors site, logique pure) ═════════════
   Les noms anglais viennent de BodyParts3D (FMA). Le latin et le français viennent de la Terminologia Anatomica 2 (TA2, Z-Anatomy, CC BY-SA 4.0) quand le nom correspond,
   sinon de RÈGLES explicites écrites ici (vertèbres, côtes, doigts, dents, os du carpe…), sinon la pièce garde son nom anglais et un drapeau `traduction: 'absente'` :
   jamais de traduction devinée. La logique est pure et testée (planetes/saturne/tests/anatomie-noms-test.mjs). */
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const ROM = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n];
const ORD_FR = { 1: 'première', 2: 'deuxième', 3: 'troisième', 4: 'quatrième', 5: 'cinquième', 6: 'sixième', 7: 'septième', 8: 'huitième', 9: 'neuvième', 10: 'dixième', 11: 'onzième', 12: 'douzième' };
const ORD_FR_M = { 1: 'premier', 2: 'deuxième', 3: 'troisième', 4: 'quatrième', 5: 'cinquième' };
const ORD_LA = { 1: 'prima', 2: 'secunda', 3: 'tertia', 4: 'quarta', 5: 'quinta', 6: 'sexta', 7: 'septima', 8: 'octava', 9: 'nona', 10: 'decima', 11: 'undecima', 12: 'duodecima' };
export const sansAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = s => sansAccents(s).toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* « Left femur », « Proximal phalanx of right big toe », « Long head of left biceps brachii » → { cote, base } */
export function separerCote(nom) {
  let n = String(nom).trim(), cote = null;
  const m = n.match(/\b(left|right)\b/i);
  if (m) { cote = m[1].toLowerCase() === 'left' ? 'gauche' : 'droit'; n = n.replace(/\b(left|right)\b ?/i, '').replace(/ of (foot|hand)$/i, ' of $1').replace(/\s+/g, ' ').trim(); }
  n = n.replace(/\bof (the )?(foot|hand)$/i, m => m); return { cote, base: n.replace(/^\w/, c => c.toUpperCase()) };
}

/* Type de la pièce (reclassement : l'atlas range des ligaments, cartilages et tendons dans « squelette » ou « muscles ») */
export function typePiece(nom, systemeAtlas) {
  const n = nom.toLowerCase();
  if (/\bgingiva\b/.test(n)) return 'gencive';
  if (/ tooth$/.test(n) || /\bmolar tooth\b|\bpremolar tooth\b|\bincisor tooth\b|\bcanine tooth\b/.test(n)) return 'dent';
  if (/intervertebral disk|\bdisk\b|\bdisc\b/.test(n)) return 'disque';
  if (/cartilage/.test(n)) return 'cartilage';
  if (/tensor fasciae latae/.test(n)) return 'muscle';
  if (/ligament|raphe|membrane|tendinous arch|conus elasticus|iliotibial tract|linea alba|trochlea of|check ligament|\bfascia\b|aponeurosis|retinaculum|tendon of|^calcaneal tendon|intermediate tendon/.test(n)) return 'ligament';
  if (systemeAtlas === 'skeletal') return /tibialis|fibularis|peroneus|subscapularis|levator scapulae|tensor fasciae/.test(n) ? 'muscle' : 'os';
  if (systemeAtlas === 'connective') return 'ligament';
  if (systemeAtlas === 'muscular') return 'muscle';
  return 'organe';
}
/* Encéphale : l'atlas range le cerveau avec les nerfs et les ventricules cérébraux avec le cœur ; on les regroupe dans un système « cerveau » (structures de l'encéphale, du tronc cérébral et du cervelet). */
export const estCerveau = nom => /gyrus|lobule|insula|internal capsule|amygdala|caudate nucleus|globus pallidus|white matter of (left |right )?cerebral|hippocampus|hypothalamus|colliculus|mammillary body|medulla oblongata|midbrain|^pons$|putamen|thalamus|^cerebellum$|commissure|corpus callosum|fornix|habenula|lamina terminalis|tuber cinereum|septum of telencephalon|tentorium|stria |geniculate|brachium of|cerebral aqueduct|central canal|interpeduncular|peduncle of midbrain|optic chiasm|optic tract|occipital lobe|^(third|fourth) ventricle|lateral ventricle|interventricular foramen/i.test(nom);
/* Système d'affichage (français) d'une pièce */
export function systemePiece(nom, systemeAtlas) {
  if (estCerveau(nom)) return 'cerveau';
  const t = typePiece(nom, systemeAtlas);
  if (t === 'os') return 'os'; if (t === 'dent' || t === 'gencive') return 'dents';
  if (t === 'disque' || t === 'cartilage' || t === 'ligament') return 'conjonctif';
  if (t === 'muscle') return 'muscles';
  return { arterial: 'arteres', venous: 'veines', nervous: 'nerfs', cardiac: 'coeur', digestive: 'digestif', respiratory: 'respiratoire', urinary: 'urinaire', reproductive: 'genital', endocrine: 'endocrine', lymphatic: 'lymphatique', sensory: 'sens', integumentary: 'peau', skeletal: 'os', muscular: 'muscles', connective: 'conjonctif' }[systemeAtlas] || 'autre';
}

/* Région du corps : mots du nom d'abord, hauteur et écart latéral ensuite (approximatif pour les vaisseaux et les nerfs). */
export function regionPiece(nom, bounds) {
  const n = nom.toLowerCase();
  if (estCerveau(nom)) return 'tête';
  if (/skull|cranial|cranium|frontal|parietal|occipital|temporal|sphenoid|ethmoid|maxilla|mandib|zygomatic|nasal|palatine|vomer|orbital|tooth|gingiva|tongue|eyeball|ear|cochlea|brain|cerebr|cerebell|facial|trigeminal|optic|hyoid|larynx|laryng|pharyn|thyroid cartilage|cricoid|arytenoid|eyelid|rectus|oblique|levator palpebrae|masseter|temporalis|pterygoid|buccinator|orbicularis (oculi|oris)|zygomaticus|mentalis|platysma/.test(n)) return /hyoid|laryn|pharyn|thyroid cartilage|cricoid|arytenoid|platysma/.test(n) ? 'cou' : 'tête';
  if (/cervical|atlas|axis|sternocleido|scalene|trachea/.test(n)) return 'cou';
  if (/humer|radi|ulna|carp|metacarp|scaphoid|lunate|triquetr|pisiform|trapez|capitate|hamate|clavic|scapula|shoulder|arm|hand|finger|thumb|digit.* manus|deltoid|biceps brachii|triceps brachii|brachi|axill|subclav|forearm|wrist|elbow|supraspinatus|infraspinatus|teres|subscapularis|pollicis|lumbrical of (right|left) hand|palmar|dorsal interosse/.test(n)) return 'membre supérieur';
  if (/femur|femoral|patella|tibia|fibul|peroneal|tarsal|metatars|calcane|talus|cuboid|cuneiform|navicular|toe|foot|leg|thigh|knee|ankle|gluteus|iliac|gastrocnem|soleus|hallucis|plantar|sartorius|gracilis|quadriceps|vastus|rectus femoris|hamstring|semi(tendin|membran)osus|biceps femoris|adductor (magnus|longus|brevis)|pectineus|popliteal|saphenous|sural/.test(n)) return 'membre inférieur';
  if (/rib|sternum|manubrium|xiphoid|thoracic|costal|intercostal|pectoral|serratus|lung|bronch|heart|cardiac|atrium|ventric|aort|diaphragm|esophag|thymus|mediastin|breast|latissimus|trapezius|rhomboid/.test(n)) return 'thorax';
  if (/lumbar|abdom|stomach|liver|spleen|pancrea|intestin|colon|duoden|jejun|ileum|kidney|renal|ureter|adrenal|gallbladder|bile|rectus abdominis|oblique|transvers|psoas|quadratus lumborum|peritone|mesenter|celiac/.test(n)) return 'abdomen';
  if (/pelvi|sacr|coccy|hip bone|ilium|ischium|pubi|bladder|urethra|prostat|testis|penis|seminal|vas deferens|anal|rectum|perine|levator ani|obturator|piriformis/.test(n)) return 'bassin';
  if (bounds) { const y = (bounds[0][1] + bounds[1][1]) / 2, ax = Math.abs((bounds[0][0] + bounds[1][0]) / 2); if (y > 1.5) return 'tête'; if (y > 1.38) return 'cou'; if (y > 1.05) return ax > 0.2 ? 'membre supérieur' : 'thorax'; if (y > 0.88) return ax > 0.22 ? 'membre supérieur' : 'abdomen'; if (y > 0.75) return 'bassin'; return 'membre inférieur'; }
  return 'corps entier';
}

/* ── règles de nommage (os et dents) : latin et français explicites ── */
const DOIGTS = { thumb: ['pollicis', 'du pouce', 1], 'index finger': ['digiti secundi manus', 'de l’index', 2], 'middle finger': ['digiti tertii manus', 'du majeur', 3], 'ring finger': ['digiti quarti manus', 'de l’annulaire', 4], 'little finger': ['digiti quinti manus', 'de l’auriculaire', 5] };
const ORTEILS = { 'big toe': ['hallucis', 'du gros orteil', 1], 'second toe': ['digiti secundi pedis', 'du deuxième orteil', 2], 'third toe': ['digiti tertii pedis', 'du troisième orteil', 3], 'fourth toe': ['digiti quarti pedis', 'du quatrième orteil', 4], 'little toe': ['digiti quinti pedis', 'du cinquième orteil', 5] };
const PHALANGES = { proximal: ['proximalis', 'proximale'], middle: ['media', 'moyenne'], distal: ['distalis', 'distale'] };
const DENTS = {
  'central secondary incisor': ['Dens incisivus medialis', 'incisive centrale'], 'lateral secondary incisor': ['Dens incisivus lateralis', 'incisive latérale'], 'secondary canine': ['Dens caninus', 'canine'],
  'first secondary premolar': ['Dens premolaris primus', 'première prémolaire'], 'second secondary premolar': ['Dens premolaris secundus', 'deuxième prémolaire'],
  'first secondary molar': ['Dens molaris primus', 'première molaire'], 'second secondary molar': ['Dens molaris secundus', 'deuxième molaire']
};
export function nommerParRegles(base) {
  const b = base.toLowerCase();
  let m;
  if ((m = b.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) (cervical|thoracic|lumbar) vertebra$/))) {
    const n = ORD[m[1]], t = { cervical: ['cervicalis', 'cervicale', 'C'], thoracic: ['thoracica', 'thoracique', 'T'], lumbar: ['lumbalis', 'lombaire', 'L'] }[m[2]];
    return { la: `Vertebra ${t[0]} ${ROM(n)} (${t[2]}${n})`, fr: `${ORD_FR[n].replace(/^./, c => c.toUpperCase())} vertèbre ${t[1]} (${t[2]}${n})`, regle: 'vertèbre' };
  }
  if ((m = b.match(/^intervertebral disk(?: of (.+))?$/))) {
    if (!m[1]) return { la: 'Discus intervertebralis', fr: 'Disque intervertébral', regle: 'disque' };
    const v = nommerParRegles(m[1].replace(/^./, c => c.toUpperCase()) ); const sg = v ? v.la.match(/\((.+)\)/) : null, ax = /axis/.test(m[1]) ? 'C2' : /atlas/.test(m[1]) ? 'C1' : null;
    const code = sg ? sg[1] : ax; if (!code) return null;
    return { la: `Discus intervertebralis ${code}`, fr: `Disque intervertébral sous ${code}`, regle: 'disque' };
  }
  if ((m = b.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib$/))) { const n = ORD[m[1]]; return { la: `Costa ${ORD_LA[n]}`, fr: `${n === 1 ? 'Première' : n === 2 ? 'Deuxième' : ORD_FR[n].replace(/^./, c => c.toUpperCase())} côte`, regle: 'côte' }; }
  if ((m = b.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) costal cartilage$/))) { const n = ORD[m[1]]; return { la: `Cartilago costalis ${ROM(n)}`, fr: `Cartilage costal ${ROM(n)}`, regle: 'cartilage costal' }; }
  if ((m = b.match(/^(first|second|third|fourth|fifth) (metacarpal|metatarsal) bone$/))) { const n = ORD[m[1]]; return m[2] === 'metacarpal' ? { la: `Os metacarpi ${ROM(n)}`, fr: `${n === 1 ? 'Premier' : ORD_FR_M[n].replace(/^./, c => c.toUpperCase())} os métacarpien (M${n})`, regle: 'métacarpien' } : { la: `Os metatarsi ${ROM(n)}`, fr: `${n === 1 ? 'Premier' : ORD_FR_M[n].replace(/^./, c => c.toUpperCase())} os métatarsien (M${n})`, regle: 'métatarsien' }; }
  if ((m = b.match(/^(proximal|middle|distal) phalanx of (.+)$/))) {
    const p = PHALANGES[m[1]], d = DOIGTS[m[2]] || ORTEILS[m[2]]; if (!d) return null;
    return { la: `Phalanx ${p[0]} ${d[0]}`, fr: `Phalange ${p[1]} ${d[1]}`, regle: 'phalange' };
  }
  if ((m = b.match(/^(lower|upper) (.+) tooth$/)) && DENTS[m[2]]) { const dd = DENTS[m[2]], sup = m[1] === 'upper'; return { la: `${dd[0]} ${sup ? 'maxillaris' : 'mandibularis'}`, fr: `${dd[1].replace(/^./, c => c.toUpperCase())} ${sup ? 'supérieure' : 'inférieure'}${/molaire|prémolaire/.test(dd[1]) ? '' : ''}`, regle: 'dent' }; }
  if (b === 'gingiva of upper jaw') return { la: 'Gingiva maxillaris', fr: 'Gencive supérieure', regle: 'gencive' };
  if (b === 'gingiva of lower jaw') return { la: 'Gingiva mandibularis', fr: 'Gencive inférieure', regle: 'gencive' };
  const FIXES = { atlas: ['Atlas (C1)', 'Atlas (C1)'], axis: ['Axis (C2)', 'Axis (C2)'], 'hip bone': ['Os coxae', 'Os coxal (os iliaque)'], ethmoid: ['Os ethmoidale', 'Os ethmoïde'], 'sesamoid bone of foot': ['Ossa sesamoidea pedis', 'Os sésamoïdes du pied'], 'navicular bone of foot': ['Os naviculare', 'Os naviculaire (scaphoïde tarsien)'], scaphoid: ['Os scaphoideum', 'Scaphoïde (os naviculaire de la main)'], triquetral: ['Os triquetrum', 'Os triquetrum (pyramidal)'], 'xiphoid process': ['Processus xiphoideus', 'Processus xiphoïde'], 'body of sternum': ['Corpus sterni', 'Corps du sternum'], manubrium: ['Manubrium sterni', 'Manubrium sternal'], hyoid: ['Os hyoideum', 'Os hyoïde'], 'hyoid bone': ['Os hyoideum', 'Os hyoïde'] };
  if (FIXES[b]) return { la: FIXES[b][0], fr: FIXES[b][1], regle: 'nom courant' };
  return null;
}

/* Résolution complète d'un nom anglais de pièce. ta : tableau TA2 [{ en, la, fr }] ; renvoie { cote, nom_en, nom_la, nom_fr, source, traduction } */
export function creerResolveur(ta, manuels = {}) {
  const index = new Map();
  for (const t of ta) { const k = norm(t.en); if (!index.has(k)) index.set(k, t); }
  const candidats = base => { const n = norm(base); return [n, n + ' muscle', n + ' bone', n.replace(/ bone$/, ''), n.replace(/^(the) /, ''), n.replace(/ muscle$/, ''), n.replace(/^(anterior|posterior) belly of /, ''), n.replace(/ artery$/, ' artery'), n.replace(/ vein$/, ' vein')]; };
  return nom => {
    const { cote, base } = separerCote(nom);
    const clef = norm(base).replace(/ muscle$/, ''), man = manuels[clef];
    if (man) return { cote, nom_en: nom, base_en: base, nom_la: man.la, nom_fr: man.fr, source: 'fiche (module de données)', traduction: 'fiche' };
    const regle = nommerParRegles(base);
    if (regle) return { cote, nom_en: nom, base_en: base, nom_la: regle.la, nom_fr: regle.fr, source: 'règle (' + regle.regle + ')', traduction: 'regle' };
    for (const c of candidats(base)) { const t = index.get(c); if (t) return { cote, nom_en: nom, base_en: base, nom_la: t.la, nom_fr: t.fr, source: 'TA2 #' + t.id, traduction: 'ta2' }; }
    return { cote, nom_en: nom, base_en: base, nom_la: null, nom_fr: null, source: null, traduction: 'absente' };
  };
}
