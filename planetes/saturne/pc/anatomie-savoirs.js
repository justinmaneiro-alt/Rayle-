import { ficheMuscle, NOMS_COUCHES } from './anatomie-muscles.js';
import { ARTERES, VEINES } from './anatomie-vaisseaux.js';
import { CERVEAU } from './anatomie-cerveau.js';
export const cleSimple = nomEn => String(nomEn).toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right) /, ' of ').replace(/ of (left|right)$/, '').replace(/\s+/g, ' ').trim();
/* ═════════════ ANATOMIE : BASE DE CONNAISSANCES DES OS (module pur) ═════════════
   Fiches rédigées à la main d'après l'anatomie classique (programme de BTS prothésiste-orthésiste), donc PÉDAGOGIQUES : chaque fiche porte un niveau de confiance
   et la mention « à vérifier avec le cours / un atlas de référence ». Justin doit relire et valider (voir docs/anatomie/os.md).
   Niveaux : 'élevée' = fiche rédigée pour cet os ; 'générique' = produite par une règle (vertèbre, côte, phalange…) ; 'minimale' = nom, région et côté seulement (rien d'inventé). */
export const A_VERIFIER = 'À vérifier avec le cours / un atlas de référence. Contenu pédagogique, pas un avis médical.';
const f = (type, description, reperes, articulations, muscles, clinique) => ({ type, description, reperes, articulations, muscles, clinique });

/* clé = nom anglais de BodyParts3D sans « Left / Right », en minuscules */
export const OS = {
  'femur': f('os long', 'Plus long et plus solide os du corps ; relie le bassin au genou.', ['tête fémorale', 'col anatomique', 'grand trochanter', 'petit trochanter', 'ligne âpre', 'condyles médial et latéral', 'surface patellaire'], ['coxo-fémorale (hanche) avec l’acétabulum', 'fémoro-tibiale (genou)', 'fémoro-patellaire'], ['grand fessier, moyen fessier (grand trochanter)', 'ilio-psoas (petit trochanter)', 'quadriceps (diaphyse et face antérieure)', 'adducteurs (ligne âpre)'], 'Fracture du col du fémur (sujet âgé, ostéoporose) ; l’axe mécanique du membre inférieur passe par la tête fémorale et le centre du genou ; niveau d’amputation transfémorale.'),
  'tibia': f('os long', 'Os médial et porteur de la jambe ; transmet le poids du fémur au pied.', ['plateau tibial', 'tubérosité tibiale antérieure', 'crête tibiale', 'malléole médiale', 'éminence intercondylaire'], ['fémoro-tibiale (genou)', 'tibio-fibulaire proximale et distale', 'talo-crurale (cheville) avec le talus'], ['tendon patellaire (tubérosité tibiale)', 'pattes d’oie : sartorius, gracile, semi-tendineux', 'tibial antérieur', 'poplité'], 'Fracture de jambe, syndrome des loges ; la crête tibiale est sous-cutanée ; niveau d’amputation transtibiale.'),
  'fibula': f('os long', 'Os latéral et grêle de la jambe ; peu porteur, il sert surtout de support musculaire et forme la malléole latérale.', ['tête fibulaire', 'col', 'malléole latérale'], ['tibio-fibulaire proximale et distale', 'talo-crurale (malléole latérale)'], ['biceps fémoral (tête)', 'fibulaires (long et court)', 'extenseur commun des orteils', 'soléaire'], 'Fracture de la malléole latérale (entorse de cheville) ; risque pour le nerf fibulaire commun au col de la fibula.'),
  'patella': f('os sésamoïde', 'Plus grand os sésamoïde du corps, inclus dans le tendon du quadriceps ; protège le genou et améliore le bras de levier.', ['base', 'apex', 'face articulaire (crête médiane)'], ['fémoro-patellaire avec la trochlée fémorale'], ['quadriceps (tendon quadricipital, base)', 'ligament patellaire (apex)'], 'Luxation et syndrome rotulien (douleur antérieure du genou) ; fracture par choc direct.'),
  'humerus': f('os long', 'Os du bras ; relie l’épaule au coude.', ['tête humérale', 'tubercules majeur et mineur', 'sillon intertuberculaire', 'tubérosité deltoïdienne', 'épicondyles médial et latéral', 'capitulum', 'trochlée', 'fosse olécrânienne'], ['gléno-humérale (épaule)', 'huméro-ulnaire et huméro-radiale (coude)'], ['deltoïde (tubérosité deltoïdienne)', 'coiffe des rotateurs (tubercules)', 'brachial, biceps, triceps', 'grand pectoral et grand dorsal (lèvres du sillon)'], 'Fracture du col chirurgical ; le nerf radial passe dans la gouttière radiale (atteinte lors d’une fracture de diaphyse) ; niveau d’amputation transhumérale.'),
  'radius': f('os long', 'Os latéral (côté du pouce) de l’avant-bras ; tourne autour de l’ulna dans la pronation et la supination.', ['tête radiale', 'tubérosité radiale', 'processus styloïde', 'incisure ulnaire'], ['huméro-radiale', 'radio-ulnaire proximale et distale', 'radio-carpienne (scaphoïde, lunatum)'], ['biceps brachial (tubérosité radiale)', 'supinateur', 'pronateurs rond et carré', 'brachio-radial'], 'Fracture de l’extrémité distale (Pouteau-Colles) très fréquente après une chute sur la main.'),
  'ulna': f('os long', 'Os médial de l’avant-bras ; forme la partie principale de l’articulation du coude.', ['olécrane', 'incisure trochléaire', 'processus coronoïde', 'tête ulnaire', 'processus styloïde'], ['huméro-ulnaire', 'radio-ulnaire proximale et distale'], ['triceps brachial (olécrane)', 'brachial (processus coronoïde)', 'fléchisseur ulnaire du carpe'], 'Fracture de l’olécrane ; le nerf ulnaire passe derrière l’épicondyle médial.'),
  'clavicle': f('os long', 'Os en S qui relie le sternum à l’acromion ; seule attache osseuse du membre supérieur au tronc.', ['extrémité sternale', 'extrémité acromiale', 'tubercule conoïde'], ['sterno-claviculaire', 'acromio-claviculaire'], ['deltoïde', 'trapèze', 'sterno-cléido-mastoïdien', 'grand pectoral (faisceau claviculaire)'], 'Fracture du tiers moyen très fréquente (chute sur l’épaule) ; disjonction acromio-claviculaire.'),
  'scapula': f('os plat', 'Omoplate : os plat triangulaire de la face postérieure du thorax.', ['épine de la scapula', 'acromion', 'processus coracoïde', 'cavité glénoïde', 'fosses supra-épineuse, infra-épineuse et subscapulaire', 'angle inférieur'], ['gléno-humérale', 'acromio-claviculaire', 'scapulo-thoracique (glissement)'], ['coiffe des rotateurs (supra-épineux, infra-épineux, petit rond, subscapulaire)', 'deltoïde', 'trapèze, rhomboïdes, dentelé antérieur'], 'Décollement de l’omoplate (paralysie du dentelé antérieur) ; instabilité de la gléno-humérale.'),
  'hip bone': f('os plat', 'Os coxal : ilium, ischium et pubis soudés à l’adulte ; forme avec le sacrum la ceinture pelvienne.', ['crête iliaque', 'épines iliaques antéro-supérieure et postéro-supérieure', 'acétabulum', 'tubérosité ischiatique', 'branches ischio-pubiennes', 'foramen obturé'], ['coxo-fémorale (acétabulum)', 'sacro-iliaque', 'symphyse pubienne'], ['grand, moyen et petit fessiers', 'ischio-jambiers (tubérosité ischiatique)', 'droit fémoral et sartorius (épines iliaques antérieures)', 'muscles de la paroi abdominale'], 'Fractures du bassin ; la tubérosité ischiatique supporte le poids en position assise (appui de l’emboîture en prothèse de cuisse).'),
  'sacrum': f('os irrégulier', 'Cinq vertèbres sacrales soudées ; coin postérieur de la ceinture pelvienne.', ['promontoire', 'foramens sacrés', 'canal sacral', 'hiatus sacral'], ['sacro-iliaque (avec l’os coxal)', 'lombo-sacrale (L5)', 'sacro-coccygienne'], ['grand fessier', 'piriforme', 'muscle érecteur du rachis'], 'Fracture sacrée ; sacro-iliite ; sert de repère de la charnière lombo-sacrale.'),
  'atlas': f('vertèbre cervicale', 'Première vertèbre cervicale (C1), sans corps, en anneau.', ['masses latérales', 'arcs antérieur et postérieur', 'fovea dentis'], ['atlanto-occipitale (oui / non)', 'atlanto-axoïdienne'], ['petits muscles sous-occipitaux', 'droit antérieur de la tête'], 'Fracture de Jefferson ; la rotation de la tête se fait surtout entre C1 et C2.'),
  'axis': f('vertèbre cervicale', 'Deuxième vertèbre cervicale (C2) portant la dent (processus odontoïde) autour de laquelle pivote l’atlas.', ['dent de l’axis (processus odontoïde)', 'processus épineux bifide'], ['atlanto-axoïdienne', 'C2-C3'], ['semi-épineux du cou', 'grand droit postérieur de la tête'], 'Fracture de la dent (stabilité du rachis cervical supérieur).'),
  'mandible': f('os irrégulier', 'Os de la mâchoire inférieure, seul os mobile du crâne.', ['corps', 'branche', 'angle de la mandibule', 'processus condylaire', 'processus coronoïde', 'foramen mentonnier'], ['temporo-mandibulaire (ATM)'], ['masséter, temporal, ptérygoïdiens', 'digastrique', 'génio-hyoïdien'], 'Luxation de l’ATM ; fracture du condyle ou de l’angle.'),
  'frontal bone': f('os plat', 'Os du front et du toit des orbites.', ['glabelle', 'arcades sourcilières', 'sinus frontal'], ['sutures coronale et fronto-pariétale', 'ethmoïde, sphénoïde, os nasaux'], ['frontal (occipito-frontal)'], 'Sinusite frontale ; fracture du crâne antérieur.'),
  'parietal bone': f('os plat', 'Os pair formant la voûte et les côtés du crâne.', ['lignes temporales', 'suture sagittale'], ['sutures coronale, sagittale et lambdoïde', 'écaille temporale'], ['temporal (ligne temporale)'], 'Point de rencontre des sutures : repères de la fontanelle chez le nourrisson.'),
  'occipital bone': f('os plat', 'Os de la base et de l’arrière du crâne ; porte le foramen magnum.', ['foramen magnum', 'condyles occipitaux', 'protubérance occipitale externe'], ['atlanto-occipitale (condyles)', 'sutures lambdoïde et occipito-mastoïdienne'], ['trapèze', 'sterno-cléido-mastoïdien', 'muscles sous-occipitaux'], 'Le foramen magnum livre passage à la moelle spinale.'),
  'temporal bone': f('os irrégulier', 'Os pair de la base latérale du crâne ; contient l’oreille moyenne et interne.', ['processus mastoïde', 'processus styloïde', 'fosse mandibulaire', 'rocher'], ['temporo-mandibulaire', 'sutures avec pariétal, sphénoïde et occipital'], ['sterno-cléido-mastoïdien (mastoïde)', 'temporal'], 'Mastoïdite ; fracture du rocher.'),
  'sphenoid bone': f('os irrégulier', 'Os en « chauve-souris » au centre de la base du crâne.', ['selle turcique', 'petites et grandes ailes', 'processus ptérygoïdes'], ['avec presque tous les os du crâne'], ['ptérygoïdiens'], 'La selle turcique loge l’hypophyse.'),
  'ethmoid': f('os irrégulier', 'Os léger entre les orbites ; paroi des fosses nasales.', ['lame criblée', 'crista galli', 'cornets supérieur et moyen'], ['frontal, sphénoïde, maxillaire, vomer'], [], 'Les trous de la lame criblée laissent passer les filets du nerf olfactif.'),
  'maxilla': f('os irrégulier', 'Os de la mâchoire supérieure ; contient le sinus maxillaire.', ['processus alvéolaire', 'processus zygomatique', 'foramen infra-orbitaire'], ['zygomatique, nasal, palatin, vomer'], ['masséter (processus zygomatique)'], 'Sinusite maxillaire ; fentes labio-palatines.'),
  'zygomatic bone': f('os irrégulier', 'Os de la pommette.', ['processus temporal', 'foramen zygomatico-facial'], ['maxillaire, frontal, temporal, sphénoïde'], ['masséter'], 'Fracture « en tripode » de la pommette.'),
  'nasal bone': f('os plat', 'Petit os pair formant la partie haute du nez.', ['suture inter-nasale'], ['frontal, maxillaire, ethmoïde'], [], 'Fracture des os propres du nez (fréquente).'),
  'sternum': f('os plat', 'Os plat médian de la face antérieure du thorax.', [], ['côtes 1 à 7 (cartilages costaux)', 'clavicule'], ['grand pectoral', 'sterno-cléido-mastoïdien'], 'Voie d’abord de la chirurgie cardiaque (sternotomie).'),
  'manubrium': f('os plat', 'Partie supérieure du sternum.', ['incisure jugulaire', 'angle sternal (avec le corps)'], ['clavicules', 'première côte'], ['sterno-cléido-mastoïdien'], 'L’angle sternal repère la 2e côte.'),
  'body of sternum': f('os plat', 'Partie moyenne du sternum.', ['incisures costales'], ['côtes 2 à 7'], ['grand pectoral'], 'Fracture par traumatisme thoracique (volant).'),
  'xiphoid process': f('os plat', 'Pointe inférieure et cartilagineuse du sternum.', [], ['corps du sternum'], ['droit de l’abdomen', 'ligne blanche'], 'Repère des gestes de réanimation (massage cardiaque).'),
  'hyoid bone': f('os irrégulier', 'Os en U du cou, sans articulation osseuse ; suspendu par des muscles.', ['corps', 'grandes et petites cornes'], ['aucune articulation osseuse'], ['muscles supra- et infra-hyoïdiens'], 'Sa fracture est un signe d’étranglement.'),
  'talus': f('os court', 'Os du tarse qui reçoit le poids du tibia et le répartit dans le pied.', ['trochlée du talus', 'tête', 'col'], ['talo-crurale', 'sous-talienne', 'talo-naviculaire'], [], 'Luxation et nécrose avasculaire après fracture du col (vascularisation fragile).'),
  'calcaneus': f('os court', 'Plus grand os du tarse ; forme le talon.', ['tubérosité calcanéenne', 'sustentaculum tali', 'sinus du tarse'], ['sous-talienne', 'calcanéo-cuboïdienne'], ['triceps sural par le tendon calcanéen (d’Achille)', 'fascia plantaire'], 'Épine calcanéenne (talalgie) ; fracture par chute de hauteur.'),
  'cuboid bone': f('os court', 'Os latéral du tarse.', ['gouttière du fibulaire long'], ['calcanéus', 'métatarsiens IV et V'], ['fibulaire long'], 'Participe à la colonne latérale du pied.'),
  'navicular bone of foot': f('os court', 'Os naviculaire (scaphoïde tarsien) de l’arche médiale.', ['tubérosité du naviculaire'], ['talus', 'trois cunéiformes'], ['tibial postérieur'], 'Fracture de fatigue chez les sportifs.'),
  'medial cuneiform bone': f('os court', 'Premier cunéiforme (médial).', [], ['naviculaire', 'métatarsien I'], ['tibial antérieur', 'fibulaire long'], 'Participe à la stabilité du premier rayon.'),
  'intermediate cuneiform bone': f('os court', 'Cunéiforme intermédiaire.', [], ['naviculaire', 'métatarsien II'], [], 'Clef de voûte de l’articulation de Lisfranc.'),
  'lateral cuneiform bone': f('os court', 'Cunéiforme latéral.', [], ['naviculaire', 'cuboïde', 'métatarsien III'], [], 'Articulation de Lisfranc.'),
  'scaphoid': f('os court', 'Os latéral de la rangée proximale du carpe.', ['tubercule du scaphoïde'], ['radius', 'lunatum', 'capitatum', 'trapèze', 'trapézoïde'], [], 'Fracture la plus fréquente du carpe ; risque de pseudarthrose et de nécrose (vascularisation rétrograde).'),
  'lunate': f('os court', 'Os central de la rangée proximale du carpe.', [], ['radius', 'scaphoïde', 'triquetrum', 'capitatum'], [], 'Maladie de Kienböck (nécrose avasculaire).'),
  'triquetral': f('os court', 'Os pyramidal du carpe.', [], ['lunatum', 'pisiforme', 'hamatum'], ['fléchisseur ulnaire du carpe (par le pisiforme)'], 'Fracture par arrachement dorsal.'),
  'pisiform': f('os sésamoïde', 'Petit os sésamoïde dans le tendon du fléchisseur ulnaire du carpe.', [], ['triquetrum'], ['fléchisseur ulnaire du carpe', 'abducteur du petit doigt'], 'Repère de la loge de Guyon (nerf ulnaire).'),
  'trapezium': f('os court', 'Os de la rangée distale, en rapport avec le pouce.', ['tubercule du trapèze'], ['métacarpien I (trapézo-métacarpienne)', 'scaphoïde'], [], 'Rhizarthrose (arthrose de la base du pouce).'),
  'trapezoid': f('os court', 'Petit os de la rangée distale, en rapport avec l’index.', [], ['métacarpien II', 'trapèze', 'capitatum', 'scaphoïde'], [], 'Rarement fracturé.'),
  'capitate': f('os court', 'Plus grand os du carpe, au centre.', ['tête du capitatum'], ['métacarpien III', 'hamatum', 'lunatum', 'scaphoïde'], [], 'Axe de la main ; la tête s’articule avec le lunatum.'),
  'hamate': f('os court', 'Os de la rangée distale côté ulnaire, avec un crochet (hamulus).', ['hamulus (crochet)'], ['métacarpiens IV et V', 'capitatum', 'triquetrum'], ['fléchisseur ulnaire du carpe', 'opposant du petit doigt'], 'Fracture du crochet (sport de raquette, golf) ; proche du nerf ulnaire.'),
  'sesamoid bone of foot': f('os sésamoïde', 'Petits os sous la tête du premier métatarsien, dans les tendons du court fléchisseur de l’hallux.', [], ['tête du métatarsien I'], ['court fléchisseur de l’hallux'], 'Sésamoïdite ; amortissent l’appui de l’avant-pied.'),
  'vomer': f('os plat', 'Os de la cloison nasale.', [], ['ethmoïde (lame perpendiculaire)', 'sphénoïde', 'maxillaire', 'palatin'], [], 'Déviation de cloison.'),
  'palatine bone': f('os plat', 'Os en L de la voûte du palais et de la fosse nasale.', ['lame horizontale'], ['maxillaire', 'sphénoïde', 'vomer'], [], 'Participe à la voûte palatine.')
};

/* Règles génériques (vertèbres, côtes, métacarpiens, métatarsiens, phalanges). */
export function ficheGenerique(piece) {
  const en = String(piece.nom_en).toLowerCase().replace(/\b(left|right) /g, '');
  if (/(cervical|thoracic|lumbar) vertebra$/.test(en)) {
    const t = en.match(/(cervical|thoracic|lumbar)/)[1];
    const d = { cervical: f('vertèbre cervicale', 'Vertèbre du cou : petit corps, foramens transversaires (artère vertébrale), processus épineux souvent bifide.', ['foramen transversaire', 'processus unciforme'], ['disques intervertébraux', 'articulaires postérieures'], ['muscles profonds du cou'], 'Les lésions du rachis cervical menacent la moelle spinale et les racines du plexus brachial.'), thoracic: f('vertèbre thoracique', 'Vertèbre du dos portant des facettes costales : articulation avec les côtes.', ['fovéas costales', 'processus épineux long, oblique vers le bas'], ['disques', 'côtes'], ['érecteur du rachis'], 'Cyphose et scoliose se mesurent surtout sur le rachis thoracique.'), lumbar: f('vertèbre lombaire', 'Vertèbre massive, grand corps, sans facette costale ; supporte la plus grande charge.', ['processus costiforme (transverse)', 'pédicules', 'pars interarticularis'], ['disques', 'facettes articulaires'], ['carré des lombes', 'psoas', 'érecteur du rachis'], 'Hernie discale (L4-L5, L5-S1) et spondylolyse de la pars interarticularis.') }[t];
    return { ...d, confiance: 'générique' };
  }
  if (/ rib$/.test(en)) return { ...f('os plat (côte)', 'Arc osseux du thorax. Côtes 1 à 7 : vraies (cartilage direct au sternum) ; 8 à 10 : fausses ; 11 et 12 : flottantes.', ['tête', 'col', 'tubercule', 'angle'], ['vertèbres thoraciques', 'cartilages costaux'], ['intercostaux', 'dentelés', 'scalènes (côtes 1 et 2)'], 'Fractures de côtes ; risque pulmonaire.'), confiance: 'générique' };
  if (/metacarpal bone$/.test(en)) return { ...f('os long', 'Os du métacarpe (paume) : base, corps et tête.', ['base', 'corps', 'tête'], ['carpe (base)', 'phalange proximale (tête)'], ['interosseux'], 'Fracture du « boxeur » : col du 5e métacarpien.'), confiance: 'générique' };
  if (/metatarsal bone$/.test(en)) return { ...f('os long', 'Os du métatarse : forme l’avant-pied.', ['base', 'corps', 'tête'], ['tarse (base)', 'phalange proximale (tête)'], ['interosseux'], 'Fracture de fatigue (marche) ; le 1er supporte une grande part de l’appui.'), confiance: 'générique' };
  if (/phalanx/.test(en)) return { ...f('os long', 'Os des doigts ou des orteils : base, corps et tête (trochlée).', ['base', 'corps', 'tête'], ['phalanges voisines'], ['fléchisseurs et extenseurs des doigts'], 'Fractures par écrasement.'), confiance: 'générique' };
  return null;
}

/* Fiche complète d'une pièce de l'index. Jamais vide : nom, région, côté, niveau de confiance et mention de vérification. */
export function fiche(piece) {
  if (!piece) return null;
  const cle = String(piece.nom_en).toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right) /, ' of ').replace(/ of (left|right)$/, '').replace(/\s+/g, ' ').trim();
  const k = OS[cle] ? cle : Object.keys(OS).find(x => cle === x || cle.replace(/ bone$/, '') === x);
  let contenu = null, confiance = 'minimale';
  if (piece.fiche) { contenu = piece.fiche; confiance = 'schématique'; }          // tracé schématique (anatomie-nerfs-schema.js) : jamais présenté comme un modèle exact
  if (piece.systeme === 'os' || piece.systeme === 'dents') {
    if (k) { contenu = OS[k]; confiance = 'élevée'; }
    else { const g = ficheGenerique(piece); if (g) { contenu = g; confiance = 'générique'; } }
  }
  let vaisseau = null, cerveau = null;
  if (piece.systeme === 'arteres' || piece.systeme === 'veines') { const k = cleSimple(piece.nom_en), d = (piece.systeme === 'arteres' ? ARTERES : VEINES)[k]; if (d) { vaisseau = d; confiance = 'élevée'; contenu = { type: piece.systeme === 'arteres' ? 'artère' : 'veine', description: null, reperes: [], articulations: [], muscles: [], clinique: d.clinique }; } }
  if (piece.systeme === 'cerveau' || piece.systeme === 'nerfs') { const k = cleSimple(piece.nom_en).replace(/^(anterior|posterior) part of /, ''), d = CERVEAU[k]; if (d) { cerveau = d; confiance = 'élevée'; contenu = { type: piece.systeme === 'nerfs' ? 'nerf crânien' : 'structure de l’encéphale', description: null, reperes: [], articulations: [], muscles: [], clinique: d.clinique }; } }
  let muscle = null;
  if (piece.systeme === 'muscles') { muscle = ficheMuscle(piece); if (muscle) { contenu = { type: piece.type === 'muscle' ? 'muscle' : piece.type, description: null, reperes: [], articulations: [], muscles: [], clinique: muscle.clinique }; confiance = 'élevée'; } }
  return {
    vaisseau, cerveau, muscle, couche: piece.couche || null, couche_nom: piece.couche ? NOMS_COUCHES[piece.couche] : null,
    id: piece.id, nom_affiche: piece.nom_fr || (piece.nom_en + ' (nom français non précisé)'), nom_fr: piece.nom_fr, nom_la: piece.nom_la, nom_en: piece.nom_en, region: piece.region, cote: piece.cote, systeme: piece.systeme,
    type: contenu ? contenu.type : piece.type, description: contenu ? contenu.description : null, reperes: contenu ? contenu.reperes : [], articulations: contenu ? contenu.articulations : [], muscles: contenu ? contenu.muscles : [], clinique: contenu ? contenu.clinique : null,
    confiance, verifier: A_VERIFIER
  };
}

/* Texte parlé par Raylé (phrases courtes, sans markdown). */
export function descriptionParlee(fi) {
  if (!fi) return 'Je ne trouve pas cette structure.';
  const nom = fi.nom_fr || fi.nom_en, parts = [];
  parts.push(nom + (fi.nom_la ? ', en latin ' + fi.nom_la : '') + '.');
  if (fi.vaisseau) { const d = fi.vaisseau; parts.push('Origine : ' + d.origine + '. Trajet : ' + d.trajet + '.'); parts.push('Territoire : ' + d.territoire + '.'); }
  if (fi.cerveau) { const d = fi.cerveau; parts.push('Rôle : ' + d.role + '.'); parts.push('Situation : ' + d.rapports + '.'); }
  if (fi.muscle) {
    const mu = fi.muscle; parts.push('Il naît de ' + mu.origine + ' et se termine sur ' + mu.insertion + '.');
    parts.push('Innervation : ' + mu.innervation + '. Vascularisation : ' + mu.vascularisation + '.');
    parts.push('Action : ' + mu.action + '.'); if (mu.antagonistes) parts.push('Antagonistes : ' + mu.antagonistes + '.');
    if (fi.couche_nom) parts.push('Dans le modèle, c’est un muscle de la couche ' + fi.couche_nom + ' (estimation indicative).');
  }
  if (fi.description) parts.push(fi.description);
  if (fi.reperes.length) parts.push('Repères : ' + fi.reperes.slice(0, 4).join(', ') + '.');
  if (fi.articulations.length) parts.push('Il s’articule avec : ' + fi.articulations.slice(0, 3).join(', ') + '.');
  if (fi.muscles.length) parts.push('Insertions : ' + fi.muscles.slice(0, 3).join(', ') + '.');
  if (fi.clinique) parts.push('En clinique : ' + fi.clinique);
  if (fi.confiance === 'minimale') parts.push('Je n’ai pas de fiche détaillée pour cette structure : seulement son nom, sa région et son côté.');
  parts.push('À vérifier avec ton cours ou un atlas.');
  return parts.join(' ');
}
