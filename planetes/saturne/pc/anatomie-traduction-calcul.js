/* ═════════════ ANATOMIE : TRADUCTION FRANÇAISE DES NOMS ANGLAIS PAR RÈGLES (module pur, testé : planetes/saturne/tests/traduction-test.mjs) ═════════════
   Le modèle 3D (BodyParts3D / FMA) donne à 1 031 pièces un nom ANGLAIS sans équivalent français dans la Terminologia Anatomica (TA2) : artères segmentaires, branches, veines, muscles intrinsèques…
   Ce module les traduit avec un LEXIQUE FERMÉ et la grammaire de la nomenclature anatomique française : adjectifs placés après le nom et en ordre inverse de l'anglais
   (« radial collateral branch » → « branche collatérale radiale »), accord en genre et en nombre, articles et contractions (de + le = du), côté (droit / gauche) accordé avec le nom.
   RÈGLE D'OR : on ne devine jamais. Un seul mot hors du lexique, une structure inattendue ou plusieurs noms dans un groupe → le module répond { fr: null, manques: [...] } et la pièce garde son nom
   latin ou anglais signalé « à vérifier » (docs/ANATOMIE_A_VERIFIER.md). Le lexique a été validé contre les ~1 200 noms français officiels que le modèle possède déjà (test).
   Utilisable dans la page (window.AnatomieTraduction) et sous Node (module ES). */

/* ── Noms : en → [français, genre, pluriel?] ── */
const NOMS = {
  artery: ['artère', 'f'], arteries: ['artères', 'f', 1], arteria: ['artère', 'f'], vein: ['veine', 'f'], veins: ['veines', 'f', 1], branch: ['branche', 'f'], branches: ['branches', 'f', 1],
  tree: ['arbre', 'm'], part: ['partie', 'f'], set: ['ensemble', 'm'], tributary: ['affluent', 'm'], trunk: ['tronc', 'm'], division: ['division', 'f'], segment: ['segment', 'm'],
  ileum: ['iléon', 'm'], jejunum: ['jéjunum', 'm'], finger: ['doigt', 'm'], foot: ['pied', 'm'], hand: ['main', 'f'], ventricle: ['ventricule', 'm'], atrium: ['oreillette', 'f'], muscle: ['muscle', 'm'],
  sulcus: ['sillon', 'm'], lobe: ['lobe', 'm'], arch: ['arcade', 'f'], valve: ['valve', 'f'], nerve: ['nerf', 'm'], duct: ['conduit', 'm'], cusp: ['valvule', 'f'], leaflet: ['feuillet', 'm'],
  head: ['tête', 'f'], ligament: ['ligament', 'm'], eyelid: ['paupière', 'f'], hemisphere: ['hémisphère', 'm'], ganglion: ['ganglion', 'm'], plexus: ['plexus', 'm'], lens: ['cristallin', 'm'],
  limb: ['bras', 'm'], capsule: ['capsule', 'f'], gyrus: ['gyrus', 'm'], canal: ['canal', 'm'], commissure: ['commissure', 'f'], fornix: ['fornix', 'm'], forebrain: ['prosencéphale', 'm'],
  telencephalon: ['télencéphale', 'm'], septum: ['septum', 'm'], body: ['corps', 'm'], peduncle: ['pédoncule', 'm'], midbrain: ['mésencéphale', 'm'], stria: ['strie', 'f'], thalamus: ['thalamus', 'm'],
  gland: ['glande', 'f'], wall: ['paroi', 'f'], cavity: ['cavité', 'f'], junction: ['jonction', 'f'], parenchyma: ['parenchyme', 'm'], pancreas: ['pancréas', 'm'], mesentery: ['mésentère', 'm'],
  intestine: ['intestin', 'm'], mesoappendix: ['mésoappendice', 'm'], appendix: ['appendice', 'm'], esophagus: ['œsophage', 'm'], oesophagus: ['œsophage', 'm'], colon: ['côlon', 'm'], liver: ['foie', 'm'],
  vesicle: ['vésicule', 'f'], penis: ['pénis', 'm'], lip: ['lèvre', 'f'], bronchus: ['bronche', 'f'], aorta: ['aorte', 'f'], tendon: ['tendon', 'm'], cartilage: ['cartilage', 'm'], lake: ['lac', 'm'],
  interossei: ['interosseux', 'm', 1], lumbricals: ['lombricaux', 'm', 1], lumbrical: ['lombrical', 'm'], interosseous: ['interosseux', 'm'], rotator: ['rotateur', 'm'],
  conus: ['cône', 'm'], valves: ['valves', 'f', 1], arteriole: ['artériole', 'f'], cord: ['cordon', 'm'], matter: ['substance', 'f'], hair: ['poil', 'm'],
  deltoid: ['deltoïde', 'm'], levator: ['élévateur', 'm'], levatores: ['élévateurs', 'm', 1], intertransversarius: ['intertransversaire', 'm'], intertransversarii: ['intertransversaires', 'm', 1],
  interspinalis: ['interépineux', 'm'], interspinales: ['interépineux', 'm', 1], pronator: ['pronateur', 'm'], flexor: ['fléchisseur', 'm'], opponens: ['opposant', 'm'], gemellus: ['jumeau', 'm'],
  puborectalis: ['puborectal', 'm'], spinalis: ['épineux', 'm'], longissimus: ['longissimus', 'm'], iliocostalis: ['iliocostal', 'm'], semispinalis: ['semi-épineux', 'm'], splenius: ['splénius', 'm'],
  rectus: ['droit', 'm'], obliquus: ['oblique', 'm'], longus: ['long', 'm'], aryepiglotticus: ['ary-épiglottique', 'm'], pectoralis: ['pectoral', 'm']
};
/* ── Adjectifs : en → 'masculin|féminin' (ou une seule forme invariable en genre) ; préfixe « > » = se place AVANT le nom (ordinaux) ── */
const ADJ = {
  posterior: 'postérieur|postérieure', anterior: 'antérieur|antérieure', superior: 'supérieur|supérieure', inferior: 'inférieur|inférieure', lateral: 'latéral|latérale', medial: 'médial|médiale',
  middle: 'moyen|moyenne', basal: 'basal|basale', apical: 'apical|apicale', segmental: 'segmentaire', bronchial: 'bronchique', digital: 'digital|digitale', palmar: 'palmaire', plantar: 'plantaire',
  coronary: 'coronaire', hepatic: 'hépatique', proper: 'propre', renal: 'rénal|rénale', cerebral: 'cérébral|cérébrale', distal: 'distal|distale', proximal: 'proximal|proximale', dorsal: 'dorsal|dorsale',
  interventricular: 'interventriculaire', lingular: 'lingulaire', temporal: 'temporal|temporale', genicular: '@du genou', portal: 'porte', lumbar: 'lombaire', marginal: 'marginal|marginale',
  phrenic: 'phrénique', intercostal: 'intercostal|intercostale', common: 'commun|commune', metacarpal: 'métacarpien|métacarpienne', ventricular: 'ventriculaire', biliary: 'biliaire', central: 'central|centrale',
  perforating: 'perforant|perforante', descending: 'descendant|descendante', superficial: 'superficiel|superficielle', callosomarginal: 'callosomarginal|callosomarginale', diagonal: 'diagonal|diagonale',
  circumflex: 'circonflexe', venous: 'veineux|veineuse', pulmonary: 'pulmonaire', colic: 'colique', hepatovenous: 'hépato-veineux|hépato-veineuse', septal: 'septal|septale', cervical: 'cervical|cervicale',
  caudate: 'caudé|caudée', ciliary: 'ciliaire', occipital: 'occipital|occipitale', precentral: 'précentral|précentrale', cerebellar: 'cérébelleux|cérébelleuse', frontobasal: 'fronto-basal|fronto-basale',
  paracentral: 'paracentral|paracentrale', deep: 'profond|profonde', brachial: 'brachial|brachiale', internal: 'interne', anterolateral: 'antérolatéral|antérolatérale', papillary: 'papillaire',
  ascending: 'ascendant|ascendante', fibular: 'fibulaire', tarsal: 'tarsien|tarsienne', communicating: 'communicant|communicante', external: 'externe', oblique: 'oblique', ulnar: 'ulnaire', thoracic: 'thoracique',
  parietal: 'pariétal|pariétale', splenial: 'splénial|splénial', pontine: 'pontique', posteromedial: 'postéromédial|postéromédiale', choroidal: 'choroïdien|choroïdienne', ileocolic: 'iléocolique',
  metatarsal: 'métatarsien|métatarsienne', 'thoraco-acromial': 'thoraco-acromial|thoraco-acromiale', radial: 'radial|radiale', collateral: 'collatéral|collatérale', pancreaticoduodenal: 'pancréaticoduodénal|pancréaticoduodénale',
  gastric: 'gastrique', insular: 'insulaire', femoral: 'fémoral|fémorale', gluteal: 'glutéal|glutéale', nasal: 'nasal|nasale', ileal: 'iléal|iléale', ureteric: 'urétérique', tricuspid: 'tricuspide',
  aortic: 'aortique', lacrimal: 'lacrymal|lacrymale', accessory: 'accessoire', long: 'long|longue', short: 'court|courte', suspensory: 'suspenseur', spinal: 'spinal|spinale', sacral: 'sacral|sacrale',
  obturator: 'obturateur|obturatrice', epigastric: 'épigastrique', testicular: 'testiculaire', mitral: 'mitral|mitrale', deferent: 'déférent|déférente', seminal: 'séminal|séminale', cecal: 'cæcal|cæcale',
  pancreatic: 'pancréatique', sigmoid: 'sigmoïdien|sigmoïdienne', rectal: 'rectal|rectale', angular: 'angulaire', gastroepiploic: 'gastro-épiploïque', 'gastro-epiploic': 'gastro-épiploïque',
  subcostal: 'subcostal|subcostale', musculophrenic: 'musculophrénique', cardiac: 'cardiaque', suprarenal: 'surrénal|surrénale', adrenal: 'surrénal|surrénale', polar: 'polaire', terminal: 'terminal|terminale',
  postcommunicating: 'post-communicant|post-communicante', thalamoperforating: 'thalamo-perforant|thalamo-perforante', prefrontal: 'préfrontal|préfrontale', vermian: 'vermien|vermienne',
  'temporo-occipital': 'temporo-occipital|temporo-occipitale', celiac: 'cœliaque', calcaneal: 'calcanéen|calcanéenne', tibial: 'tibial|tibiale', pectoral: 'pectoral|pectorale', mediobasal: 'médio-basal|médio-basale',
  laterobasal: 'latéro-basal|latéro-basale', subsuperior: 'sous-supérieur|sous-supérieure', hypothalamic: 'hypothalamique', intermediomedial: 'intermédio-médial|intermédio-médiale', pericallosal: 'péricalleux|péricalleuse',
  precuneal: 'précunéal|précunéale', postcentral: 'postcentral|postcentrale', white: 'blanc|blanche', intermediate: 'intermédiaire', vertical: 'vertical|verticale', uvular: '@de la luette', esophageal: 'œsophagien|œsophagienne',
  lobar: 'lobaire', caudal: 'caudal|caudale', gastroduodenal: 'gastro-duodénal|gastro-duodénale', mesenteric: 'mésentérique', pubic: 'pubien|pubienne', main: 'principal|principale', small: '>petit|petite',
  upper: 'supérieur|supérieure', lower: 'inférieur|inférieure', sphenoid: 'sphénoïdal|sphénoïdale', thalamogeniculate: 'thalamo-génouillé|thalamo-génouillée', 'pre-hepatic': 'pré-hépatique', hepatobiliary: 'hépatobiliaire', nasociliary: 'naso-ciliaire', clavicular: 'claviculaire', sternocostal: 'sternocostal|sternocostale', humeral: 'huméral|humérale', oesophageal: 'œsophagien|œsophagienne', pineal: 'pinéal|pinéale', hemiazygos: 'hémi-azygos',
  major: 'grand|grande', minor: 'petit|petite', brevis: 'court|courte', breves: 'courts|courtes', 'first': '>premier|première', second: '>deuxième', third: '>troisième', fourth: '>quatrième', fifth: '>cinquième',
  interior: 'intérieur|intérieure', innermost: 'le plus interne', extensor: 'extenseur', flexor: 'fléchisseur', apicoposterior: 'apico-postérieur|apico-postérieure', superficialis: 'superficiel|superficielle',
  lingula: 'lingulaire', vermis: 'vermien|vermienne', parietooccipital: 'pariéto-occipital|pariéto-occipitale', subclavian: 'sous-clavier|sous-clavière', laryngeal: 'laryngé|laryngée', hypogastric: 'hypogastrique',
  popliteal: 'poplité|poplitée', saphenous: 'saphène', sural: 'sural|surale', ileocecal: 'iléo-cæcal|iléo-cæcale', mesocolic: 'mésocolique', omental: 'omental|omentale'
};
/* ── Expressions toutes faites (groupe nominal sans côté, en minuscules) → [français, genre, pluriel?]. Prioritaires sur la grammaire : elles portent les noms latins et les termes figés. ── */
const EXPRESSIONS = {
  'tarsal plate': ['tarse', 'm'], 'white matter': ['substance blanche', 'f'], 'little finger': ['auriculaire', 'm'], 'ring finger': ['annulaire', 'm'], 'index finger': ['index', 'm'], 'small intestine': ['intestin grêle', 'm'],
  'adrenal gland': ['glande surrénale', 'f'], 'suprarenal gland': ['glande surrénale', 'f'], 'spinal cord': ['moelle spinale', 'f'], 'central canal': ['canal central', 'm'], 'choroid plexus': ['plexus choroïde', 'm'],
  'check ligament': ['ligament d’arrêt', 'm'], 'suspensory ligament': ['ligament suspenseur', 'm'], 'lacrimal lake': ['lac lacrymal', 'm'], 'taenia libera': ['bandelette libre', 'f'], 'taenia mesocolica': ['bandelette mésocolique', 'f'],
  'taenia omentalis': ['bandelette omentale', 'f'], 'main bronchus proper': ['bronche principale', 'f'], 'ileocecal junction': ['jonction iléo-cæcale', 'f'], 'pectoralis major': ['muscle grand pectoral', 'm'],
  'gemellus inferior': ['muscle jumeau inférieur', 'm'], 'gemellus superior': ['muscle jumeau supérieur', 'm'], 'flexor accessorius': ['muscle carré plantaire', 'm'], 'pronator teres': ['muscle rond pronateur', 'm'],
  'puborectalis': ['muscle puborectal', 'm'], 'external oblique': ['muscle oblique externe de l’abdomen', 'm'], 'superficial perineal muscle': ['muscle transverse superficiel du périnée', 'm'],
  'external intercostal muscle': ['muscle intercostal externe', 'm'], 'internal intercostal muscle': ['muscle intercostal interne', 'm'], 'innermost intercostal muscle': ['muscle intercostal le plus interne', 'm'],
  'lumbrical': ['muscle lombrical', 'm'], 'plantar interosseous': ['muscle interosseux plantaire', 'm'], 'flexor digiti minimi brevis': ['muscle court fléchisseur du petit doigt', 'm'],
  'opponens digiti minimi': ['muscle opposant du petit doigt', 'm'], 'deltoid': ['muscle deltoïde', 'm'], 'uvular muscle': ['muscle de la luette', 'm'], 'aryepiglotticus': ['muscle ary-épiglottique', 'm'],
  'lumbar rotator': ['muscle rotateur lombaire', 'm'], 'cervical rotator': ['muscle rotateur cervical', 'm'], 'thoracic rotator': ['muscle rotateur thoracique', 'm'], 'spinalis': ['muscle épineux', 'm'],
  'iliocostalis cervicis': ['muscle iliocostal du cou', 'm'], 'longissimus cervicis': ['muscle longissimus du cou', 'm'], 'semispinalis cervicis': ['muscle semi-épineux du cou', 'm'], 'splenius cervicis': ['muscle splénius du cou', 'm'],
  'interspinalis thoracis': ['muscle interépineux du thorax', 'm'], 'rectus capitis anterior': ['muscle droit antérieur de la tête', 'm'], 'obliquus capitis inferior': ['muscle oblique inférieur de la tête', 'm'],
  'obliquus capitis superior': ['muscle oblique supérieur de la tête', 'm'], 'longus colli': ['muscle long du cou', 'm'], 'lateral lumbar intertransversarius': ['muscle intertransversaire latéral lombaire', 'm'],
  'medial lumbar intertransversarius': ['muscle intertransversaire médial lombaire', 'm'], 'levatores costarum breves': ['muscles élévateurs courts des côtes', 'm', 1], 'levatores costarum longi': ['muscles élévateurs longs des côtes', 'm', 1],
  'interspinales lumborum': ['muscles interépineux lombaires', 'm', 1], 'interspinales cervicis': ['muscles interépineux cervicaux', 'm', 1], 'anterior cervical intertransversarii': ['muscles intertransversaires cervicaux antérieurs', 'm', 1],
  'posterior cervical intertransversarii': ['muscles intertransversaires cervicaux postérieurs', 'm', 1], 'dorsal interossei': ['muscles interosseux dorsaux', 'm', 1], 'palmar interossei': ['muscles interosseux palmaires', 'm', 1],
  'lumbricals': ['muscles lombricaux', 'm', 1], 'lateral papillary muscle': ['muscle papillaire latéral', 'm'], 'posterior papillary muscle': ['muscle papillaire postérieur', 'm'], 'septal papillary muscle': ['muscle papillaire septal', 'm'],
  'pancreatic duct tree': ['arbre du canal pancréatique', 'm'], 
    'humeral head': ['chef huméral', 'm'], 'ulnar head': ['chef ulnaire', 'm'], 'anterolateral head': ['chef antérolatéral', 'm'],
  'caudate lobe branch': ['branche du lobe caudé', 'f'], 'caudate lobe tributary': ['affluent du lobe caudé', 'm'], 'arteria radialis indicis': ['artère radiale de l’index', 'f'], 'arteria princeps pollicis': ['artère principale du pouce', 'f'],
  'plantar digital arteries proper': ['artères digitales plantaires propres', 'f', 1], 'conus branch': ['branche du cône artériel', 'f'], 'conus artery': ['artère du cône artériel', 'f'], 'stria medullaris': ['strie médullaire', 'f'],
  'levator palpebrae superioris': ['muscle élévateur de la paupière supérieure', 'm'], 'hepatic artery proper': ['artère hépatique propre', 'f'], 'rectus capitis lateralis': ['muscle droit latéral de la tête', 'm'],
  'rectus capitis posterior major': ['muscle grand droit postérieur de la tête', 'm'], 'rectus capitis posterior minor': ['muscle petit droit postérieur de la tête', 'm'],
  'hepatovenous segment ii': ['segment hépato-veineux II', 'm'], 'hepatovenous segment iii': ['segment hépato-veineux III', 'm'], 'hepatovenous segment iv': ['segment hépato-veineux IV', 'm'], 'hepatovenous segment v': ['segment hépato-veineux V', 'm'],
  'hepatovenous segment vi': ['segment hépato-veineux VI', 'm'], 'hepatovenous segment vii': ['segment hépato-veineux VII', 'm'], 'hepatovenous segment viii': ['segment hépato-veineux VIII', 'm'], 'hepatovenous segment ix': ['segment hépato-veineux IX', 'm'],
  'superior rectus': ['muscle droit supérieur de l’œil', 'm'], 'inferior rectus': ['muscle droit inférieur de l’œil', 'm'], 'lateral rectus': ['muscle droit latéral de l’œil', 'm'], 'medial rectus': ['muscle droit médial de l’œil', 'm'],
  'hepatic biliary tree': ['arbre biliaire hépatique', 'm'], 'hepatovenous segment': ['segment hépato-veineux', 'm'], 'hair': ['poil', 'm']
};
/* Mots latins conservés tels quels quand une pièce n'a ni traduction ni expression (le nom latin sert alors de nom officiel). */
const LATIN = new Set('capitis cervicis thoracis lumborum digiti minimi brevis breves longus longi colli pollicis indicis costarum levatores intertransversarii interspinales splenius iliocostalis longissimus semispinalis spinalis obliquus rectus gemellus pectoralis accessorius radialis princeps palpebrae superioris libera mesocolica omentalis arteria medullaris levator teres major minor posterior anterior superior inferior pars'.split(' '));
const SIDE = { right: 'droit', left: 'gauche' };
/* Noms entiers dont la structure sort de la grammaire (le côté appartient à un lobe, pas au nom de tête). */
const COMPLETS = {
  'hair of head': 'Cheveux', 'arch of aorta': 'Arc de l’aorte', 'pubic hair': 'Poils pubiens',
  'left lobe branch of left hepatic artery': 'Branche du lobe gauche de l’artère hépatique gauche', 'right lobe branch of right hepatic artery': 'Branche du lobe droit de l’artère hépatique droite',
  'anterolateral head of lateral papillary muscle of left ventricle': 'Chef antérolatéral du muscle papillaire latéral du ventricule gauche'
};
/* Classes d'adjectifs pour l'ORDRE FRANÇAIS : type (collatéral, circonflexe…) puis région / famille (radial, bronchique…) puis position (postérieur, profond…) puis adjectifs finaux (propre, commun…) puis compléments (« du genou »).
   Les groupes de deux positions voisines sont fusionnés comme dans la TA (« anterior inferior » → « inféro-antérieur »). */
const POS = new Set('anterior posterior superior inferior lateral medial middle proximal distal deep superficial internal external dorsal palmar plantar upper lower apical basal caudal central intermediate vertical ascending descending anterolateral posteromedial subsuperior mediobasal laterobasal intermediomedial polar major minor main perforating'.split(' '));
const TYPE = new Set('collateral circumflex communicating recurrent'.split(' '));
const FIN = new Set('proper common accessory terminal'.split(' '));
const COMBOS = { 'anterior inferior': 'inféro-antérieur|inféro-antérieure', 'posterior inferior': 'postéro-inférieur|postéro-inférieure', 'anterior superior': 'antéro-supérieur|antéro-supérieure',
  'posterior superior': 'postéro-supérieur|postéro-supérieure', 'inferior lateral': 'inférolatéral|inférolatérale', 'inferior medial': 'inféromédial|inféromédiale', 'superior lateral': 'supérolatéral|supérolatérale', 'superior medial': 'supéromédial|supéromédiale' };

const ROMAINS = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const voyelle = s => /^[aeiouyhàâéèêëîïôöûüœæ]/i.test(s);
const maj = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const formeAdj = (def, g, pl) => {
  const d = def.replace(/^[>@]/, ''), [m, f] = d.split('|'); let w = g === 'f' ? (f || m) : m;
  if (!pl || /\s/.test(w)) return w;
  if (/[sx]$/.test(w)) return w; if (/al$/.test(w)) return w.slice(0, -2) + 'aux'; if (/eau$/.test(w)) return w + 'x'; return w + 's';
};
const pluriel = nom => (/[sx]$/.test(nom) ? nom : /al$/.test(nom) ? nom.slice(0, -2) + 'aux' : nom + 's');

/* Un groupe nominal anglais (sans « of » / « with » / « to ») → { mots: 'texte français sans article', g, pl } ou { manque: [...] }.
   Anglais : adjectifs… nom (le nom est le DERNIER mot). Français : (ordinal) nom adjectifs en ordre inverse, puis le côté. */
function groupe(texte, cote) {
  const t = texte.trim().toLowerCase().replace(/\s+/g, ' '); if (!t) return { manque: ['(vide)'] };
  let mots = t.split(' '), base = null, tete = null;
  const exp = EXPRESSIONS[t];
  if (exp) { base = exp[0]; tete = { g: exp[1], pl: !!exp[2] }; mots = []; }
  else {
    // une expression qui termine le groupe (« extensor … » + adjectifs devant) : la plus longue
    for (let i = 1; i < mots.length && !base; i++) { const e = EXPRESSIONS[mots.slice(i).join(' ')]; if (e) { base = e[0]; tete = { g: e[1], pl: !!e[2] }; mots = mots.slice(0, i); } }
  }
  const adjs = [], pre = [], manque = [];
  for (let i = 0; i < mots.length; i++) {
    const w = mots[i], dernier = i === mots.length - 1 && !base;
    if (ROMAINS.test(w) && mots.length > 1) { adjs.push({ lit: w.toUpperCase(), cls: 'F' }); continue; }
    const combo = COMBOS[w + ' ' + mots[i + 1]]; if (combo && i + 1 < mots.length - (base ? 0 : 1)) { adjs.push({ def: combo, cls: 'P' }); i++; continue; }
    const n = NOMS[w], ad = ADJ[w];
    if (dernier && n) { base = n[0]; tete = { g: n[1], pl: !!n[2] }; }
    else if (ad) { if (ad.startsWith('>')) pre.push(ad); else adjs.push({ def: ad, cls: ad.startsWith('@') ? 'C' : FIN.has(w) ? 'F' : TYPE.has(w) ? 'T' : POS.has(w) ? 'P' : 'R' }); }
    else if (n) manque.push('deux noms dans « ' + t + ' » (' + w + ')');
    else manque.push(w);
  }
  if (!manque.length && !tete) manque.push('pas de nom à la fin de « ' + t + ' »');
  if (manque.length) return { manque };
  const g = tete.g, pl = tete.pl, sortie = [];
  for (const ad of pre) sortie.push(formeAdj(ad, g, pl));
  sortie.push(base);
  // ordre français : types, régions, positions (chacun en ordre inverse de l'anglais), adjectifs finaux (ordre de l'anglais), compléments
  for (const cls of ['T', 'R', 'P']) for (const ad of adjs.filter(x => x.cls === cls).reverse()) sortie.push(formeAdj(ad.def, g, pl));
  for (const ad of adjs.filter(x => x.cls === 'F')) sortie.push(ad.lit ? ad.lit : formeAdj(ad.def, g, pl));
  const complements = adjs.filter(x => x.cls === 'C').map(x => x.def.slice(1));
  const sideMot = !cote ? [] : [cote === 'droit' ? (pl ? (g === 'f' ? 'droites' : 'droits') : (g === 'f' ? 'droite' : 'droit')) : (pl ? 'gauches' : 'gauche')];
  return { mots: sortie.concat(complements, sideMot).join(' '), g, pl };
}
const article = (g, pl, mot, prep) => {
  if (pl) return prep === 'de' ? 'des ' : prep + ' les ';
  if (voyelle(mot)) return prep === 'de' ? 'de l’' : prep + ' l’';
  if (prep === 'de') return g === 'f' ? 'de la ' : 'du ';
  return prep + (g === 'f' ? ' la ' : ' le ');
};

/* Traduit un nom anglais (« Radial collateral branch of right deep brachial artery »). Rend { fr, manques }. fr = null si un seul élément manque. */
export function traduireNom(en) {
  const brut = String(en || '').trim(); if (!brut) return { fr: null, manques: ['(vide)'] };
  const complet = COMPLETS[brut.toLowerCase().replace(/\s+/g, ' ')]; if (complet) return { fr: complet, manques: [] };
  // découpe en groupes séparés par of / with / to (le premier groupe est la tête)
  const morceaux = brut.split(/\s+(of|with|to)\s+/i); const segs = [{ prep: null, texte: morceaux[0] }];
  for (let i = 1; i < morceaux.length; i += 2) segs.push({ prep: morceaux[i].toLowerCase(), texte: morceaux[i + 1] });
  const manques = [], sorties = [];
  for (let k = 0; k < segs.length; k++) {
    let texte = segs[k].texte, cote = null;
    texte = texte.replace(/\b(right|left)\b/gi, (m, c) => { cote = SIDE[c.toLowerCase()]; return ''; }).replace(/\s+/g, ' ').trim();
    if (/^set$/i.test(texte) && k === 0) { sorties.push({ prep: null, mots: 'ensemble', g: 'm', pl: false, ensemble: true }); continue; }
    const r = groupe(texte, cote);
    if (r.manque) { manques.push(...r.manque); continue; }
    sorties.push({ prep: segs[k].prep, mots: r.mots, g: r.g, pl: r.pl });
  }
  if (manques.length) return { fr: null, manques: [...new Set(manques)] };
  let fr = '';
  for (let i = 0; i < sorties.length; i++) {
    const s = sorties[i];
    if (!s.prep) { fr = s.mots; continue; }
    const pp = s.prep === 'of' ? 'de' : s.prep === 'with' ? 'avec' : 'vers', premier = s.mots.split(' ')[0];
    fr += ' ' + article(s.g, s.pl, premier, pp) + s.mots;
  }
  fr = fr.replace(/ +/g, ' ').replace(/’ /g, '’').trim();
  return { fr: maj(fr), manques: [] };
}
/* Nom latin de repli : quand l'anglais EST du latin (muscles de la TA : « rectus capitis anterior »), on le garde comme nom latin, sans côté. */
export function nomLatinDeRepli(en) {
  const mots = String(en || '').toLowerCase().replace(/\b(right|left)\b/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!mots.length || !mots.every(w => LATIN.has(w))) return null;
  return maj(mots.join(' '));
}
export const lexique = { NOMS, ADJ, EXPRESSIONS, LATIN };
if (typeof window !== 'undefined') window.AnatomieTraduction = { traduireNom, nomLatinDeRepli, lexique };
void pluriel;
