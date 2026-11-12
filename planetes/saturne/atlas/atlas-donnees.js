/* ═════════════ ATLAS D'ANATOMIE 2D (téléphone, tablette, hors ligne) — données ═════════════
   Contenu LOCAL (aucun réseau, aucun modèle 3D) : régions, noms français avec terminologie médicale, fiches courtes reprises des modules de connaissances déjà rédigés pour Saturne
   (anatomie-savoirs.js : os ; anatomie-muscles.js : muscles) + articulations rédigées ici. Pédagogique : « à vérifier avec le cours / un atlas de référence », jamais un outil de diagnostic. */
import { OS, A_VERIFIER } from '../pc/anatomie-savoirs.js';
import { MUSCLES } from '../pc/anatomie-muscles.js';
export { A_VERIFIER };
export const AVERTISSEMENT = A_VERIFIER + ' Ce n’est pas un outil de diagnostic.';

export const REGIONS = [
  { id: 'tete', nom: 'Tête et cou', court: 'Tête' },
  { id: 'rachis', nom: 'Rachis (colonne vertébrale)', court: 'Rachis' },
  { id: 'thorax', nom: 'Thorax et ceinture scapulaire', court: 'Thorax' },
  { id: 'msup', nom: 'Membre supérieur', court: 'Mb sup.' },
  { id: 'bassin', nom: 'Bassin et hanche', court: 'Bassin' },
  { id: 'minf', nom: 'Membre inférieur', court: 'Mb inf.' }
];
/* clé du module de connaissances → [nom français, terme latin (TA), région] */
const O = {
  'femur': ['Fémur', 'Femur', 'minf'], 'tibia': ['Tibia', 'Tibia', 'minf'], 'fibula': ['Fibula (péroné)', 'Fibula', 'minf'], 'patella': ['Patella (rotule)', 'Patella', 'minf'],
  'humerus': ['Humérus', 'Humerus', 'msup'], 'radius': ['Radius', 'Radius', 'msup'], 'ulna': ['Ulna (cubitus)', 'Ulna', 'msup'], 'clavicle': ['Clavicule', 'Clavicula', 'thorax'], 'scapula': ['Scapula (omoplate)', 'Scapula', 'thorax'],
  'hip bone': ['Os coxal', 'Os coxae', 'bassin'], 'sacrum': ['Sacrum', 'Os sacrum', 'bassin'], 'atlas': ['Atlas (C1)', 'Atlas', 'rachis'], 'axis': ['Axis (C2)', 'Axis', 'rachis'],
  'mandible': ['Mandibule', 'Mandibula', 'tete'], 'frontal bone': ['Os frontal', 'Os frontale', 'tete'], 'parietal bone': ['Os pariétal', 'Os parietale', 'tete'], 'occipital bone': ['Os occipital', 'Os occipitale', 'tete'],
  'temporal bone': ['Os temporal', 'Os temporale', 'tete'], 'sphenoid bone': ['Os sphénoïde', 'Os sphenoidale', 'tete'], 'ethmoid': ['Os ethmoïde', 'Os ethmoidale', 'tete'], 'maxilla': ['Maxillaire', 'Maxilla', 'tete'],
  'zygomatic bone': ['Os zygomatique', 'Os zygomaticum', 'tete'], 'nasal bone': ['Os nasal', 'Os nasale', 'tete'], 'sternum': ['Sternum', 'Sternum', 'thorax'], 'manubrium': ['Manubrium sternal', 'Manubrium sterni', 'thorax'],
  'body of sternum': ['Corps du sternum', 'Corpus sterni', 'thorax'], 'xiphoid process': ['Processus xiphoïde', 'Processus xiphoideus', 'thorax'], 'hyoid bone': ['Os hyoïde', 'Os hyoideum', 'tete'],
  'talus': ['Talus', 'Talus', 'minf'], 'calcaneus': ['Calcanéus', 'Calcaneus', 'minf'], 'cuboid bone': ['Os cuboïde', 'Os cuboideum', 'minf'], 'navicular bone of foot': ['Os naviculaire (scaphoïde tarsien)', 'Os naviculare', 'minf'],
  'medial cuneiform bone': ['Cunéiforme médial', 'Os cuneiforme mediale', 'minf'], 'intermediate cuneiform bone': ['Cunéiforme intermédiaire', 'Os cuneiforme intermedium', 'minf'], 'lateral cuneiform bone': ['Cunéiforme latéral', 'Os cuneiforme laterale', 'minf'],
  'scaphoid': ['Scaphoïde (os du carpe)', 'Os scaphoideum', 'msup'], 'lunate': ['Lunatum', 'Os lunatum', 'msup'], 'triquetral': ['Triquetrum', 'Os triquetrum', 'msup'], 'pisiform': ['Pisiforme', 'Os pisiforme', 'msup'],
  'trapezium': ['Trapèze (os du carpe)', 'Os trapezium', 'msup'], 'trapezoid': ['Trapézoïde', 'Os trapezoideum', 'msup'], 'capitate': ['Capitatum', 'Os capitatum', 'msup'], 'hamate': ['Hamatum', 'Os hamatum', 'msup'],
  'sesamoid bone of foot': ['Sésamoïdes du pied', 'Ossa sesamoidea pedis', 'minf'], 'vomer': ['Vomer', 'Vomer', 'tete'], 'palatine bone': ['Os palatin', 'Os palatinum', 'tete']
};
const M = {
  'deltoid': ['Deltoïde', 'M. deltoideus', 'thorax'], 'supraspinatus': ['Supra-épineux', 'M. supraspinatus', 'thorax'], 'infraspinatus muscle': ['Infra-épineux', 'M. infraspinatus', 'thorax'], 'teres minor': ['Petit rond', 'M. teres minor', 'thorax'],
  'teres major': ['Grand rond', 'M. teres major', 'thorax'], 'subscapularis': ['Subscapulaire', 'M. subscapularis', 'thorax'], 'biceps brachii': ['Biceps brachial', 'M. biceps brachii', 'msup'], 'brachialis': ['Brachial', 'M. brachialis', 'msup'],
  'coracobrachialis': ['Coraco-brachial', 'M. coracobrachialis', 'msup'], 'triceps brachii': ['Triceps brachial', 'M. triceps brachii', 'msup'], 'anconeus': ['Anconé', 'M. anconeus', 'msup'], 'pectoralis major': ['Grand pectoral', 'M. pectoralis major', 'thorax'],
  'pectoralis minor': ['Petit pectoral', 'M. pectoralis minor', 'thorax'], 'serratus anterior': ['Dentelé antérieur', 'M. serratus anterior', 'thorax'], 'trapezius': ['Trapèze (muscle)', 'M. trapezius', 'thorax'], 'rhomboid major': ['Grand rhomboïde', 'M. rhomboideus major', 'thorax'],
  'rhomboid minor': ['Petit rhomboïde', 'M. rhomboideus minor', 'thorax'], 'levator scapulae': ['Élévateur de la scapula', 'M. levator scapulae', 'thorax'], 'brachioradialis': ['Brachio-radial', 'M. brachioradialis', 'msup'],
  'pronator teres': ['Rond pronateur', 'M. pronator teres', 'msup'], 'flexor carpi radialis': ['Fléchisseur radial du carpe', 'M. flexor carpi radialis', 'msup'], 'palmaris longus': ['Long palmaire', 'M. palmaris longus', 'msup'],
  'flexor carpi ulnaris': ['Fléchisseur ulnaire du carpe', 'M. flexor carpi ulnaris', 'msup'], 'flexor digitorum superficialis': ['Fléchisseur superficiel des doigts', 'M. flexor digitorum superficialis', 'msup'],
  'flexor digitorum profundus': ['Fléchisseur profond des doigts', 'M. flexor digitorum profundus', 'msup'], 'flexor pollicis longus': ['Long fléchisseur du pouce', 'M. flexor pollicis longus', 'msup'], 'pronator quadratus': ['Carré pronateur', 'M. pronator quadratus', 'msup'],
  'extensor carpi radialis longus': ['Long extenseur radial du carpe', 'M. extensor carpi radialis longus', 'msup'], 'extensor carpi radialis brevis': ['Court extenseur radial du carpe', 'M. extensor carpi radialis brevis', 'msup'],
  'extensor carpi ulnaris': ['Extenseur ulnaire du carpe', 'M. extensor carpi ulnaris', 'msup'], 'extensor digitorum': ['Extenseur des doigts', 'M. extensor digitorum', 'msup'], 'supinator': ['Supinateur', 'M. supinator', 'msup'],
  'abductor pollicis longus': ['Long abducteur du pouce', 'M. abductor pollicis longus', 'msup'], 'extensor pollicis brevis': ['Court extenseur du pouce', 'M. extensor pollicis brevis', 'msup'], 'extensor pollicis longus': ['Long extenseur du pouce', 'M. extensor pollicis longus', 'msup'],
  'gluteus maximus': ['Grand fessier', 'M. gluteus maximus', 'bassin'], 'gluteus medius': ['Moyen fessier', 'M. gluteus medius', 'bassin'], 'gluteus minimus': ['Petit fessier', 'M. gluteus minimus', 'bassin'], 'piriformis': ['Piriforme', 'M. piriformis', 'bassin'],
  'psoas major': ['Grand psoas', 'M. psoas major', 'bassin'], 'iliacus': ['Iliaque', 'M. iliacus', 'bassin'], 'rectus femoris': ['Droit fémoral', 'M. rectus femoris', 'minf'], 'vastus lateralis': ['Vaste latéral', 'M. vastus lateralis', 'minf'],
  'vastus medialis': ['Vaste médial', 'M. vastus medialis', 'minf'], 'vastus intermedius': ['Vaste intermédiaire', 'M. vastus intermedius', 'minf'], 'sartorius': ['Sartorius (couturier)', 'M. sartorius', 'minf'], 'gracilis': ['Gracile (droit interne)', 'M. gracilis', 'minf'],
  'adductor longus': ['Long adducteur', 'M. adductor longus', 'minf'], 'adductor brevis': ['Court adducteur', 'M. adductor brevis', 'minf'], 'adductor magnus': ['Grand adducteur', 'M. adductor magnus', 'minf'], 'pectineus': ['Pectiné', 'M. pectineus', 'minf'],
  'semitendinosus': ['Semi-tendineux', 'M. semitendinosus', 'minf'], 'semimembranosus': ['Semi-membraneux', 'M. semimembranosus', 'minf'], 'biceps femoris': ['Biceps fémoral', 'M. biceps femoris', 'minf'], 'tibialis anterior': ['Tibial antérieur', 'M. tibialis anterior', 'minf'],
  'extensor digitorum longus': ['Long extenseur des orteils', 'M. extensor digitorum longus', 'minf'], 'extensor hallucis longus': ['Long extenseur de l’hallux', 'M. extensor hallucis longus', 'minf'], 'fibularis longus': ['Long fibulaire', 'M. fibularis longus', 'minf'],
  'fibularis brevis': ['Court fibulaire', 'M. fibularis brevis', 'minf'], 'gastrocnemius': ['Gastrocnémien (jumeaux)', 'M. gastrocnemius', 'minf'], 'soleus': ['Soléaire', 'M. soleus', 'minf'], 'plantaris': ['Plantaire', 'M. plantaris', 'minf'],
  'popliteus': ['Poplité', 'M. popliteus', 'minf'], 'tibialis posterior': ['Tibial postérieur', 'M. tibialis posterior', 'minf'], 'flexor digitorum longus': ['Long fléchisseur des orteils', 'M. flexor digitorum longus', 'minf'],
  'flexor hallucis longus': ['Long fléchisseur de l’hallux', 'M. flexor hallucis longus', 'minf'], 'abductor hallucis': ['Abducteur de l’hallux', 'M. abductor hallucis', 'minf'], 'flexor digitorum brevis': ['Court fléchisseur des orteils', 'M. flexor digitorum brevis', 'minf'],
  'external oblique': ['Oblique externe', 'M. obliquus externus abdominis', 'thorax'], 'diaphragm': ['Diaphragme', 'Diaphragma', 'thorax'], 'sternocleidomastoid': ['Sterno-cléido-mastoïdien', 'M. sternocleidomastoideus', 'tete'],
  'scalenus anterior': ['Scalène antérieur', 'M. scalenus anterior', 'tete'], 'scalenus medius': ['Scalène moyen', 'M. scalenus medius', 'tete'], 'longissimus thoracis': ['Longissimus du thorax', 'M. longissimus thoracis', 'rachis'],
  'iliocostalis lumborum': ['Ilio-costal lombaire', 'M. iliocostalis lumborum', 'rachis'], 'semispinalis capitis': ['Semi-épineux de la tête', 'M. semispinalis capitis', 'rachis'], 'splenius capitis': ['Splénius de la tête', 'M. splenius capitis', 'rachis'],
  'platysma': ['Platysma', 'Platysma', 'tete'], 'digastric': ['Digastrique', 'M. digastricus', 'tete'], 'obturator internus': ['Obturateur interne', 'M. obturator internus', 'bassin'], 'quadratus femoris': ['Carré fémoral', 'M. quadratus femoris', 'bassin']
};
/* os généraux (règles) : vertèbres, côtes, mains, pied — fiches rédigées ici, courtes */
const G = [
  ['vertebres-cervicales', 'os', 'Vertèbres cervicales (C1–C7)', 'Vertebrae cervicales', 'rachis', 'os court', 'Sept vertèbres du cou ; C1 (atlas) et C2 (axis) sont atypiques. Trous transversaires pour l’artère vertébrale.', ['processus épineux bifide (C2–C6)', 'dent de l’axis', 'foramen transversaire'], ['atlanto-occipitale (flexion-extension)', 'atlanto-axoïdienne (rotation)'], 'Entorse cervicale ; lordose cervicale physiologique.'],
  ['vertebres-thoraciques', 'os', 'Vertèbres thoraciques (T1–T12)', 'Vertebrae thoracicae', 'rachis', 'os court', 'Douze vertèbres portant les côtes (fossettes costales) ; cyphose physiologique.', ['fossettes costales', 'processus épineux long et oblique vers le bas'], ['costo-vertébrales', 'zygapophysaires (rotation importante)'], 'Cyphose, scoliose (rotation vertébrale), fractures-tassements ostéoporotiques.'],
  ['vertebres-lombaires', 'os', 'Vertèbres lombaires (L1–L5)', 'Vertebrae lumbales', 'rachis', 'os court', 'Cinq grosses vertèbres supportant la charge ; lordose lombaire physiologique.', ['corps volumineux', 'processus costiformes', 'pars interarticularis'], ['zygapophysaires (flexion-extension)', 'disque intervertébral'], 'Lombalgie, hernie discale L4-L5 et L5-S1, spondylolyse, spondylolisthésis.'],
  ['cotes', 'os', 'Côtes (12 paires)', 'Costae', 'thorax', 'os plat', '7 vraies côtes, 3 fausses côtes, 2 côtes flottantes ; protègent les organes thoraciques et participent à la ventilation.', ['tête', 'col', 'tubercule', 'angle costal', 'sillon costal (nerf et vaisseaux)'], ['costo-vertébrales', 'sterno-costales (cartilage costal)'], 'Fractures de côtes ; thorax en entonnoir ou en carène.'],
  ['metacarpiens', 'os', 'Métacarpiens et phalanges de la main', 'Ossa metacarpi et phalanges manus', 'msup', 'os long', 'Cinq métacarpiens et 14 phalanges (pouce : 2 phalanges) ; main de préhension.', ['base', 'diaphyse', 'tête (articulation métacarpo-phalangienne)'], ['carpo-métacarpiennes', 'métacarpo-phalangiennes', 'interphalangiennes'], 'Fracture du boxeur (5e métacarpien) ; amputation partielle de main (prothèse).'],
  ['metatarsiens', 'os', 'Métatarsiens et phalanges du pied', 'Ossa metatarsi et phalanges pedis', 'minf', 'os long', 'Cinq métatarsiens et 14 phalanges ; avant-pied, appui et propulsion.', ['base', 'diaphyse', 'tête', 'tubérosité du 5e métatarsien'], ['tarso-métatarsiennes (Lisfranc)', 'métatarso-phalangiennes'], 'Fracture de fatigue (marche), hallux valgus, amputation de Lisfranc ou de Chopart.']
];
/* articulations rédigées ici (type, mouvements, moyens d'union) */
const J = [
  ['epaule', 'Épaule (gléno-humérale)', 'Articulatio glenohumeralis', 'msup', 'synoviale sphéroïde', 'flexion-extension, abduction-adduction, rotations médiale et latérale, circumduction (3 degrés de liberté)', 'labrum glénoïdal, capsule, ligaments gléno-huméraux, coiffe des rotateurs (supra-épineux, infra-épineux, petit rond, subscapulaire)', 'Articulation la plus mobile et la plus instable : luxation antéro-inférieure fréquente.'],
  ['coude', 'Coude', 'Articulatio cubiti', 'msup', 'synoviale trochléenne + trochoïde (radio-ulnaire proximale)', 'flexion-extension (huméro-ulnaire) ; pro-supination (radio-ulnaires)', 'ligaments collatéraux ulnaire et radial, ligament annulaire du radius', 'Prono-supination = rotation du radius autour de l’ulna ; “pronation douloureuse” de l’enfant.'],
  ['poignet', 'Poignet (radio-carpienne)', 'Articulatio radiocarpalis', 'msup', 'synoviale ellipsoïde (condylienne)', 'flexion-extension, inclinaisons radiale et ulnaire', 'ligaments radio-carpiens, ligament collatéral ulnaire, complexe fibro-cartilagineux triangulaire', 'Fracture du scaphoïde (risque de nécrose) ; fracture de Pouteau-Colles du radius distal.'],
  ['hanche', 'Hanche (coxo-fémorale)', 'Articulatio coxae', 'bassin', 'synoviale sphéroïde (énarthrose)', 'flexion-extension, abduction-adduction, rotations, circumduction', 'labrum acétabulaire, capsule, ligaments ilio-fémoral (Bertin), pubo-fémoral, ischio-fémoral', 'Coxarthrose, fracture du col fémoral, prothèse totale de hanche ; désarticulation de hanche.'],
  ['genou', 'Genou', 'Articulatio genus', 'minf', 'synoviale condylienne (bicondylaire) + fémoro-patellaire', 'flexion-extension ; rotation en flexion', 'ligaments croisés antérieur et postérieur, collatéraux tibial et fibulaire, ménisques médial et latéral, tendon quadricipital', 'Rupture du LCA, lésion méniscale, gonarthrose ; niveaux d’amputation trans-tibiale et désarticulation du genou.'],
  ['cheville', 'Cheville (talo-crurale)', 'Articulatio talocruralis', 'minf', 'synoviale trochléenne (charnière)', 'flexion dorsale et flexion plantaire', 'ligaments collatéral latéral (talo-fibulaire antérieur, calcanéo-fibulaire), collatéral médial (deltoïdien), syndesmose tibio-fibulaire', 'Entorse en inversion (ligament talo-fibulaire antérieur) ; fractures bimalléolaires.'],
  ['sous-talienne', 'Sous-talienne', 'Articulatio subtalaris', 'minf', 'synoviale (trochoïde)', 'inversion et éversion du pied (avec les articulations du médio-pied)', 'ligament talo-calcanéen interosseux, ligaments collatéraux', 'Pied plat / creux, varus ou valgus du talon (analyse de marche, semelles orthopédiques).'],
  ['sacro-iliaque', 'Sacro-iliaque', 'Articulatio sacroiliaca', 'bassin', 'synoviale plane + syndesmose (très peu mobile)', 'nutation / contre-nutation (quelques degrés)', 'ligaments sacro-iliaques antérieurs et postérieurs, sacro-tubéral, sacro-épineux', 'Sacro-iliite, douleurs en ceinture pelvienne ; transmet le poids du tronc aux membres inférieurs.'],
  ['symphyse-pubienne', 'Symphyse pubienne', 'Symphysis pubica', 'bassin', 'cartilagineuse (amphiarthrose)', 'mobilité quasi nulle (augmente à l’accouchement)', 'disque fibro-cartilagineux interpubien, ligaments pubiens', 'Pubalgie du sportif ; diastasis pendant la grossesse.'],
  ['temporo-mandibulaire', 'Temporo-mandibulaire (ATM)', 'Articulatio temporomandibularis', 'tete', 'synoviale bicondylaire avec disque', 'ouverture-fermeture, propulsion-rétropulsion, diduction', 'disque articulaire, capsule, ligaments temporo-mandibulaire, stylo-mandibulaire', 'Syndrome de l’ATM (craquements, douleurs), luxation en bâillant.'],
  ['sterno-claviculaire', 'Sterno-claviculaire et acromio-claviculaire', 'Articulationes sternoclavicularis et acromioclavicularis', 'thorax', 'synoviales planes (avec disque pour la sterno-claviculaire)', 'élévation, abaissement, rotation de la clavicule (complexe de l’épaule)', 'ligaments costo-claviculaire, acromio-claviculaire, coraco-claviculaire (conoïde, trapézoïde)', 'Entorse acromio-claviculaire (“disjonction”), fracture de la clavicule (tiers moyen).'],
  ['atlanto-occipitale', 'Atlanto-occipitale et atlanto-axoïdienne', 'Articulationes atlantooccipitalis et atlantoaxialis', 'rachis', 'condylienne (flexion-extension) et trochoïde (rotation)', 'oui de la tête (flexion-extension) ; non de la tête (rotation)', 'ligament transverse de l’atlas, ligaments alaires, membrane tectoriale', 'Instabilité atlanto-axoïdienne (polyarthrite, trisomie 21) ; traumatismes de la dent de l’axis.'],
  ['intervertebrales', 'Intervertébrales (disques et zygapophysaires)', 'Articulationes intervertebrales et zygapophysiales', 'rachis', 'symphyses (disque) + synoviales planes', 'flexion-extension, inclinaisons latérales, rotation (variables selon l’étage)', 'disque (anneau fibreux + noyau pulpeux), ligaments longitudinaux antérieur et postérieur, ligament jaune', 'Hernie discale, discopathie, arthrose zygapophysaire.']
];
/* ───── fiches normalisées ───── */
const num = s => String(s || '').trim();
const ligne = (t, v) => v ? [t, Array.isArray(v) ? v.join(' ; ') : String(v)] : null;
export const FICHES = [];
for (const [k, [nom, latin, region]] of Object.entries(O)) { const o = OS[k]; if (!o) continue; FICHES.push({ id: 'os-' + k, genre: 'os', nom, latin, region, type: o.type, resume: o.description, lignes: [ligne('Repères', o.reperes), ligne('Articulations', o.articulations), ligne('Muscles', o.muscles), ligne('À retenir', o.clinique)].filter(Boolean) }); }
for (const g of G) FICHES.push({ id: 'os-' + g[0], genre: 'os', nom: g[2], latin: g[3], region: g[4], type: g[5], resume: g[6], lignes: [ligne('Repères', g[7]), ligne('Articulations', g[8]), ligne('À retenir', g[9])].filter(Boolean) });
for (const [k, [nom, latin, region]] of Object.entries(M)) { const m = MUSCLES[k]; if (!m) continue; FICHES.push({ id: 'mu-' + k, genre: 'muscle', nom, latin, region, type: 'muscle', resume: 'Action : ' + m.action + '.', action: m.action, innervation: m.innervation, lignes: [ligne('Origine', m.origine), ligne('Insertion', m.insertion), ligne('Innervation', m.innervation), ligne('Vascularisation', m.vascularisation), ligne('Action', m.action), ligne('Antagonistes', m.antagonistes), ligne('À retenir', m.clinique)].filter(Boolean) }); }
for (const j of J) FICHES.push({ id: 'ar-' + j[0], genre: 'articulation', nom: j[1], latin: j[2], region: j[3], type: j[4], resume: 'Mouvements : ' + j[5] + '.', lignes: [ligne('Type', j[4]), ligne('Mouvements', j[5]), ligne('Moyens d’union', j[6]), ligne('À retenir', j[7])].filter(Boolean) });
export const GENRES = { os: 'Os', articulation: 'Articulations', muscle: 'Muscles' };
export const parRegion = (region, genre) => FICHES.filter(f => f.region === region && (!genre || f.genre === genre)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
export const nomRegion = id => (REGIONS.find(r => r.id === id) || {}).nom || id;
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export function chercher(q, genre = null) {
  const n = norm(q); if (n.length < 2) return [];
  const mots = n.split(' ').filter(Boolean), pt = f => { const c = norm(f.nom + ' ' + f.latin + ' ' + nomRegion(f.region)); return mots.every(m => c.includes(m)) ? (norm(f.nom).startsWith(mots[0]) ? 0 : 1) : 9; };
  return FICHES.filter(f => (!genre || f.genre === genre)).map(f => [pt(f), f]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].nom.localeCompare(b[1].nom, 'fr')).map(x => x[1]);
}
export const trouver = id => FICHES.find(f => f.id === id) || null;

/* ───── quiz (QCM et cartes mémoire) : questions fabriquées à partir des fiches, réponses toujours tirées des fiches ───── */
export function melanger(a, alea = Math.random) { const t = a.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; }
const court = (s, n = 110) => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n).replace(/[,;:(\s][^,;:(]*$/, ''); return (c || s.slice(0, n)) + '…'; };
export function questionQcm(alea = Math.random, { region = null } = {}) {
  const pool = FICHES.filter(f => !region || f.region === region), muscles = pool.filter(f => f.genre === 'muscle'), os = pool.filter(f => f.genre === 'os');
  const types = ['region', 'region', 'innervation', 'action', 'typeOs'].filter(t => t === 'region' || (t === 'typeOs' ? os.length > 3 : muscles.length > 3));
  const t = types[Math.floor(alea() * types.length)], pick = a => a[Math.floor(alea() * a.length)];
  const fabriquer = (enonce, bonne, autres, fiche, explication) => { const o = melanger([...new Set(autres.filter(x => x && x !== bonne))], alea).slice(0, 3); if (o.length < 3) return null; const choix = melanger([bonne, ...o], alea); return { enonce, choix, juste: choix.indexOf(bonne), fiche: fiche.id, explication }; };
  for (let essai = 0; essai < 12; essai++) {
    let q = null;
    if (t === 'region') { const f = pick(pool); q = fabriquer(`Dans quelle région se trouve : ${f.nom} ?`, nomRegion(f.region), REGIONS.map(r => r.nom), f, `${f.nom} (${f.latin}) : ${nomRegion(f.region)}.`); }
    else if (t === 'innervation') { const f = pick(muscles); q = fabriquer(`Quelle est l’innervation du muscle « ${f.nom} » ?`, court(f.innervation, 70), muscles.map(m => court(m.innervation, 70)), f, `${f.nom} : ${f.innervation}.`); }
    else if (t === 'action') { const f = pick(muscles); q = fabriquer(`Quelle est l’action principale du muscle « ${f.nom} » ?`, court(f.action, 90), muscles.map(m => court(m.action, 90)), f, `${f.nom} : ${f.action}.`); }
    else { const f = pick(os); q = fabriquer(`Quel est le type de : ${f.nom} ?`, f.type, os.map(o => o.type), f, `${f.nom} : ${f.type}.`); }
    if (q) return q;
  }
  return null;
}
export function carteMemoire(alea = Math.random, { region = null } = {}) { const pool = FICHES.filter(f => !region || f.region === region); const f = pool[Math.floor(alea() * pool.length)]; return { fiche: f.id, recto: f.nom, sousRecto: f.latin, verso: f.resume, region: nomRegion(f.region) }; }
