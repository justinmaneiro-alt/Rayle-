/* ═════════════ DONNÉES : SQUELETTE ═════════════
   Repère : mètres, personne debout de 1,75 m, y vers le haut, face vers +z, pieds au sol (y = 0).
   Les coordonnées sont celles du côté GAUCHE du patient (x > 0) ; le côté droit est le miroir (x → −x).
   Vu de face, la droite du patient est à gauche de l'écran.
   Parties de forme : { t:'cap', a, b, r0, r1 } (fuseau entre deux points) · { t:'ell', c, r:[rx,ry,rz], rot?:[rx,ry,rz] } (ellipsoïde) · { t:'sph', c, r }.
   `diaphyse:true` marque la partie qui se casse dans la simulation des fractures. Les parties vont du proximal au distal.
   Géométries volontairement schématiques (pédagogie) : elles sont remplacées par un modèle GLB si ui/assets/anatomie/<id>.glb existe. */

export const SOL = 0;
export const HAUTEUR = 1.75;

// Articulations (côté gauche)
export const J = {
  hanche: [.09, .93, 0], genou: [.095, .50, .01], cheville: [.09, .08, 0],
  epaule: [.18, 1.41, 0], coude: [.205, 1.12, 0], poignet: [.225, .865, 0]
};

// Rachis : 24 vertèbres mobiles (du bas vers le haut), hauteur au repos
export const VERTEBRES = (() => {
  const l = [];
  for (let k = 0; k < 5; k++) l.push({ id: 'L' + (5 - k), region: 'lombaire', y: 1.03 + .038 * k });
  for (let k = 0; k < 12; k++) l.push({ id: 'T' + (12 - k), region: 'thoracique', y: 1.222 + .0245 * k });
  for (let k = 0; k < 7; k++) l.push({ id: 'C' + (7 - k), region: 'cervicale', y: 1.515 + .0195 * k });
  return l;
})();
export const SACRUM_Y = .975;
/** profondeur (z) de l'axe du rachis à la hauteur y : lordose lombaire, cyphose thoracique */
export const zRachis = y => -.058 - .032 * Math.sin(Math.PI * Math.min(Math.max((y - 1.03) / .46, 0), 1))
  + .014 * Math.sin(Math.PI * Math.min(Math.max((y - 1.49) / .15, 0), 1));      // lordose cervicale (le rachis cervical bombe vers l'avant) en plus de la lordose lombaire et de la cyphose thoracique
/** profil des côtes : demi-largeur et profondeur du thorax selon le rang (1 à 12) */
export const profilCote = i => {
  const u = (i - 1) / 11;
  return { rx: .062 + .075 * Math.sin(Math.PI * Math.min(u * 1.1 + .12, 1)), zAvant: .058 + .045 * Math.sin(Math.PI * Math.min(u + .1, 1)), chute: .045 + .05 * u, fin: i >= 11 ? .62 : 1 };
};

export const cap = (a, b, r0, r1, extra) => Object.assign({ t: 'cap', a, b, r0, r1: r1 == null ? r0 : r1 }, extra);
const ell = (c, r, rot) => ({ t: 'ell', c, r, rot });
const sph = (c, r) => ({ t: 'sph', c, r });
const tube = (pts, r, r1) => ({ t: 'tube', pts, r, r1 });
const tor = (c, R, r, rot) => ({ t: 'tor', c, R, r, rot });
/** reflète une liste de parties (x → −x) pour décrire un os médian à deux côtés (crâne, mandibule) */
const mx = p => { const m = q => [-q[0], q[1], q[2]]; const o = Object.assign({}, p); if (p.c) o.c = m(p.c); if (p.a) { o.a = m(p.a); o.b = m(p.b); } if (p.pts) o.pts = p.pts.map(m); if (p.rot) o.rot = [p.rot[0], -p.rot[1], -p.rot[2]]; return o; };
const deuxCotes = l => l.flatMap(p => [p, mx(p)]);
/** rangée de dents le long d'un arc (liste de points de gauche à droite) : une petite ellipsoïde par dent */
const dents = (arc, y, h, n) => { const c = new Array(n).fill(0).map((_, i) => { const u = i / (n - 1) * (arc.length - 1), k = Math.min(Math.floor(u), arc.length - 2), t = u - k; return [arc[k][0] + (arc[k + 1][0] - arc[k][0]) * t, y, arc[k][1] + (arc[k + 1][1] - arc[k][1]) * t]; }); return c.map((p, i) => Object.assign(ell(p, [i > 3 && i < n - 4 ? .0032 : .0042, h, i > 3 && i < n - 4 ? .0026 : .0034]), { sym: false })); };

/* Crâne : neurocrâne (voûte, base, bosse frontale), massif facial (maxillaire, os nasaux, zygomatiques), orbites, arcades sourcilières, arcades zygomatiques, mastoïdes, protubérance occipitale, dents du haut */
const creux = p => Object.assign(p, { creux: true, sym: false });       // cavité (orbite, narine, conduit) : assombrie par l'attribut aFibre.y, comme une occlusion ambiante cuite
const CRANE = [
  ell([0, 1.703, -.012], [.074, .08, .093]), ell([0, 1.668, -.03], [.062, .04, .07]), ell([0, 1.718, .028], [.066, .057, .05]),
  ell([0, 1.64, .052], [.043, .033, .034]), ell([0, 1.664, .086], [.008, .016, .008], [.5, 0, 0]),
  ell([0, 1.658, .06], [.05, .034, .03]),                                                    // plan du massif facial, sur lequel reposent les orbites
  ...deuxCotes([tor([.031, 1.667, .0845], .0158, .0032, [0, .3, 0]), creux(ell([.031, 1.667, .0838], [.0138, .0122, .0055], [0, .3, 0])),
    ell([.044, 1.647, .066], [.0095, .008, .0095]), tube([[.046, 1.649, .064], [.068, 1.654, .04], [.074, 1.66, -.002]], .0036), ell([.05, 1.628, -.026], [.007, .011, .007]),
    ]),
  tube([[-.044, 1.686, .08], [0, 1.693, .088], [.044, 1.686, .08]], .0048), creux(ell([0, 1.646, .0905], [.0072, .0125, .005])), ell([0, 1.656, -.098], [.007, .006, .004]),
  tube([[-.026, 1.619, .07], [-.012, 1.615, .088], [0, 1.614, .092], [.012, 1.615, .088], [.026, 1.619, .07]], .0046),
  ...dents([[-.027, .068], [-.012, .088], [0, .092], [.012, .088], [.027, .068]], 1.612, .0052, 12)
];
/* Mandibule : corps en arc, branches montantes, angles, coronoïdes, condyles (articulation temporo-mandibulaire), menton, dents du bas */
const MANDIBULE = [
  tube([[-.046, 1.652, -.012], [-.047, 1.612, -.004], [-.04, 1.598, .044], [-.02, 1.594, .07], [0, 1.592, .076], [.02, 1.594, .07], [.04, 1.598, .044], [.047, 1.612, -.004], [.046, 1.652, -.012]], .0072),
  ...deuxCotes([ell([.048, 1.626, .0], [.0035, .021, .016], [0, 0, 0]), ell([.044, 1.603, .03], [.005, .009, .02])]),
  ell([0, 1.594, .074], [.014, .0085, .007]),
  ...deuxCotes([ell([.047, 1.651, -.012], [.0065, .004, .005]), ell([.047, 1.628, .01], [.003, .012, .008]), ell([.046, 1.604, -.006], [.006, .005, .008])]),
  ...dents([[-.025, .068], [-.012, .086], [0, .089], [.012, .086], [.025, .068]], 1.607, .0048, 12)
];
/* Sternum en trois parties : manubrium, corps, processus xiphoïde (+ échancrure jugulaire et angle de Louis) */
const STERNUM = [
  ell([0, 1.432, .097], [.03, .027, .0095]), ell([0, 1.347, .103], [.02, .061, .0085]), ell([0, 1.406, .104], [.027, .004, .006]),
  Object.assign(cap([0, 1.292, .1], [0, 1.257, .097], .0065, .0025), { simple: true })
];
/* Sacrum (5 vertèbres soudées, ailes, crête médiane) et coccyx (3 à 4 pièces) */
const SACRUM = [ell([0, SACRUM_Y, -.062], [.045, .05, .02], [.35, 0, 0]), ell([0, SACRUM_Y + .022, -.056], [.058, .018, .018], [.2, 0, 0]), tube([[0, SACRUM_Y + .035, -.082], [0, SACRUM_Y - .005, -.086], [0, SACRUM_Y - .04, -.078]], .005)];
const COCCYX = [sph([0, .928, -.07], .008), sph([0, .912, -.066], .0065), sph([0, .899, -.06], .005), sph([0, .889, -.054], .0035)];
/* Os coxal : aile iliaque, crête iliaque, épines (EIAS, EIPS), acétabulum, ischion et tubérosité ischiatique, branche ilio-pubienne, trou obturé */
const COXAL = [
  ell([.09, 1.045, -.005], [.011, .06, .078], [0, .55, 0]),
  tube([[.056, 1.085, -.085], [.105, 1.092, -.04], [.14, 1.082, .015], [.125, 1.056, .078]], .0062),
  sph([.12, 1.04, .085], .009), sph([.05, 1.045, -.095], .009), sph([.105, .985, .075], .007),
  cap([.07, .98, -.04], [.07, .885, -.055], .015, .015), ell([.07, .887, -.058], [.014, .013, .017]),
  cap([.045, .93, .05], [.012, .9, .072], .012, .012), sph([.09, .93, 0], .03),
  tor([.057, .915, .022], .02, .0045, [0, 1.35, 0]),
  tube([[.03, 1.0, -.08], [.06, 1.03, -.085], [.075, 1.05, -.07]], .013),                // articulation sacro-iliaque : relie l'aile au sacrum
  cap([.095, 1.015, -.012], [.09, .945, 0], .022, .026), ell([.11, 1.06, .03], [.012, .036, .06], [0, .55, 0]), sph([0, .905, .076], .0085)       // corps de l'os coxal, aile antérieure, symphyse pubienne
];
// carpe : deux rangées de quatre os ; tarse antérieur : naviculaire, cuboïde et trois cunéiformes
const CARPE = [ell([.212, .848, -.006], [.0085, .007, .0085]), ell([.223, .85, -.006], [.008, .0075, .008]), ell([.234, .848, -.004], [.008, .007, .008]), ell([.244, .843, .002], [.007, .0065, .007]),
  ell([.213, .832, .004], [.0075, .007, .008]), ell([.224, .833, .006], [.008, .0075, .008]), ell([.235, .832, .008], [.0075, .007, .008]), ell([.245, .83, .013], [.0075, .0075, .008])];
const TARSE_ANT = [ell([.075, .052, .07], [.012, .01, .014]), ell([.115, .038, .082], [.013, .012, .018]), ell([.083, .036, .098], [.0085, .011, .011]), ell([.097, .035, .1], [.0085, .011, .011]), ell([.108, .034, .1], [.0085, .011, .011])];

/* Fiche : nom, latin, region, description, reperes[], articulations[], role, ortho.
   `membre` : 'MI' (membre inférieur, de la hanche aux orteils) ou 'MS' (membre supérieur) → coupé par les amputations. */
export const OS = [
  { id: 'crane', nom: 'Crâne', latin: 'Cranium', sym: false, region: 'Tête', parts: CRANE,
    description: "Boîte osseuse qui protège l'encéphale ; il comprend la voûte (frontal, pariétaux, occipital, temporaux) et la face.",
    reperes: ['Protubérance occipitale externe', 'Processus mastoïde', 'Arcade zygomatique'], articulations: ['Atlas (C1) : articulation atlanto-occipitale', 'Mandibule : ATM'],
    role: "Protection de l'encéphale et des organes des sens ; point d'insertion des muscles de la nuque et de la mastication.", ortho: "Orthèses crâniennes (casque pour plagiocéphalie), collier cervical : le crâne est le point d'appui supérieur." },
  { id: 'mandibule', nom: 'Mandibule', latin: 'Mandibula', sym: false, region: 'Tête', parts: MANDIBULE,
    description: "Seul os mobile de la tête, en forme de fer à cheval.", reperes: ['Angle de la mandibule', 'Condyle (devant le tragus)'], articulations: ['Articulation temporo-mandibulaire'],
    role: 'Mastication, phonation.', ortho: 'Les colliers cervicaux prennent appui sur la mandibule (menton) : attention aux escarres.' },
  { id: 'sternum', nom: 'Sternum', latin: 'Sternum', sym: false, region: 'Thorax', parts: STERNUM,
    description: 'Os plat médian en avant du thorax : manubrium, corps et processus xiphoïde.', reperes: ['Fourchette sternale', "Angle de Louis (2e côte)", 'Processus xiphoïde'],
    articulations: ['Clavicules (sterno-claviculaire)', 'Cartilages costaux 1 à 7'], role: 'Protège le cœur ; fixe la cage thoracique en avant.', ortho: "Point d'appui antérieur des corsets de rachis (Jewett, minerve sterno-occipito-mandibulaire)." },
  { id: 'sacrum', nom: 'Sacrum', latin: 'Os sacrum', sym: false, region: 'Bassin', parts: SACRUM,
    description: 'Cinq vertèbres soudées, en coin entre les deux os coxaux ; base de la colonne.', reperes: ['Épines iliaques postéro-supérieures (fossettes de Vénus)'], articulations: ['L5 (disque L5-S1)', 'Os coxaux (sacro-iliaques)', 'Coccyx'],
    role: 'Transmet le poids du tronc aux membres inférieurs.', ortho: "Base de la mesure de l'obliquité pelvienne en scoliose ; repère du bord inférieur des corsets." },
  { id: 'coccyx', nom: 'Coccyx', latin: 'Os coccygis', sym: false, region: 'Bassin', parts: COCCYX,
    description: 'Petit os terminal formé de 3 à 5 vertèbres atrophiées.', reperes: ['Palpable dans le pli interfessier'], articulations: ['Sacrum'], role: "Insertion de muscles du plancher pelvien.", ortho: "Les emboîtures fémorales doivent décharger le coccyx et l'ischion." },
  { id: 'clavicule', nom: 'Clavicule', latin: 'Clavicula', sym: true, region: 'Épaule', membre: null, parts: [cap([.02, 1.44, .055], [.17, 1.465, -.005], .007, .0085, { diaphyse: true })],
    description: "Os long en S couché, seul lien osseux entre le tronc et le membre supérieur.", reperes: ['Palpable sur toute sa longueur sous la peau', 'Extrémité acromiale (articulation acromio-claviculaire)'],
    articulations: ['Sternum (sterno-claviculaire)', 'Acromion (acromio-claviculaire)'], role: "Entretient l'écartement de l'épaule ; transmet les forces du membre supérieur au tronc.", ortho: "Fracture très fréquente (tiers moyen) : bandage en 8, écharpe, ostéosynthèse si déplacement important." },
  { id: 'scapula', nom: 'Scapula (omoplate)', latin: 'Scapula', sym: true, region: 'Épaule', parts: [ell([.105, 1.385, -.095], [.048, .075, .012], [0, .25, 0]), cap([.1, 1.425, -.1], [.17, 1.465, -.005], .007, .009), cap([.14, 1.43, .035], [.145, 1.43, .062], .006)],
    description: "Os plat triangulaire à la face postérieure du thorax ; porte la cavité glénoïde, l'épine, l'acromion et le processus coracoïde.", reperes: ['Épine de la scapula', 'Angle inférieur', 'Acromion', 'Processus coracoïde'],
    articulations: ['Humérus (gléno-humérale)', 'Clavicule (acromio-claviculaire)'], role: "Plateforme mobile de l'épaule ; insertion de 17 muscles dont la coiffe des rotateurs.", ortho: "En scoliose, la saillie de l'angle inférieur côté convexe signe la rotation vertébrale (gibbosité)." },
  { id: 'humerus', nom: 'Humérus', latin: 'Humerus', sym: true, membre: 'MS', region: 'Bras',
    parts: [sph([.175, 1.41, 0], .023), cap([.178, 1.395, 0], [.205, 1.135, 0], .017, .014, { diaphyse: true, nom: 'diaphyse' }), ell([.205, 1.12, 0], [.03, .016, .02]), sph([.178, 1.12, 0], .0105), sph([.237, 1.12, 0], .0105), sph([.195, 1.4, .012], .014), sph([.19, 1.3, .012], .0085)],
    description: "Os long du bras : tête articulaire, col anatomique et chirurgical, diaphyse avec la tubérosité deltoïdienne, extrémité distale (trochlée, capitulum).", reperes: ['Tubercule majeur (sous l\'acromion)', 'Épicondyles médial et latéral', 'Épitrochlée (gouttière du nerf ulnaire)'],
    articulations: ['Scapula (gléno-humérale)', 'Radius et ulna (coude)'], role: "Levier du bras ; insertion du deltoïde, des muscles de la coiffe, du biceps (origine) et du triceps.",
    ortho: "Le nerf radial contourne la diaphyse : risque de paralysie (main tombante) dans les fractures du tiers moyen. Orthèse brachiale (Sarmiento) en traitement fonctionnel." },
  { id: 'radius', nom: 'Radius', latin: 'Radius', sym: true, membre: 'MS', region: 'Avant-bras', parts: [sph([.222, 1.105, .012], .011), cap([.222, 1.1, .012], [.233, .87, .005], .009, .012, { diaphyse: true }), ell([.233, .87, .005], [.015, .012, .012])],
    description: "Os latéral de l'avant-bras ; sa tête tourne dans l'incisure radiale de l'ulna, son extrémité distale s'élargit vers le carpe.", reperes: ['Tête radiale (sous l\'épicondyle latéral)', 'Processus styloïde radial', 'Tubercule de Lister (dos du poignet)'],
    articulations: ['Humérus (huméro-radiale)', 'Ulna (radio-ulnaires proximale et distale)', 'Carpe (radio-carpienne)'], role: "Prono-supination ; porte la main.", ortho: "Fracture de Pouteau-Colles (extrémité distale, déplacement dorsal) : très fréquente après chute sur la paume ; plâtre ou ostéosynthèse par plaque." },
  { id: 'ulna', nom: 'Ulna (cubitus)', latin: 'Ulna', sym: true, membre: 'MS', region: 'Avant-bras', parts: [sph([.205, 1.135, -.03], .014), cap([.205, 1.125, -.02], [.218, .865, -.008], .012, .007, { diaphyse: true })],
    description: "Os médial de l'avant-bras ; l'olécrane forme la saillie du coude.", reperes: ['Olécrane', 'Bord postérieur (palpable sur toute sa longueur)', 'Processus styloïde ulnaire'],
    articulations: ['Humérus (huméro-ulnaire)', 'Radius (radio-ulnaires)'], role: "Charnière de flexion-extension du coude.", ortho: "Le moignon d'amputation trans-radiale conserve radius et ulna : l'emboîture respecte l'olécrane et le pli du coude." },
  { id: 'carpe', nom: 'Carpe', latin: 'Ossa carpi', sym: true, membre: 'MS', region: 'Main', parts: CARPE,
    description: "Huit os en deux rangées (scaphoïde, lunatum, triquetrum, pisiforme ; trapèze, trapézoïde, capitatum, hamatum).", reperes: ['Pisiforme', 'Tubercule du scaphoïde', 'Tabatière anatomique'],
    articulations: ['Radius (radio-carpienne)', 'Métacarpiens'], role: "Mobilité du poignet.", ortho: "Le scaphoïde se fracture souvent (chute sur la main) : douleur de la tabatière, immobilisation 6 à 12 semaines." },
  { id: 'metacarpiens', nom: 'Métacarpiens', latin: 'Ossa metacarpi', sym: true, membre: 'MS', region: 'Main',
    parts: [cap([.245, .83, .01], [.255, .785, .02], .006), cap([.238, .825, 0], [.242, .752, 0], .0055), cap([.228, .825, 0], [.229, .745, 0], .0055), cap([.218, .825, 0], [.217, .75, 0], .005), cap([.208, .828, 0], [.205, .76, 0], .0045)],
    description: "Cinq os longs de la paume (Ier à Ve rayon).", reperes: ['Têtes métacarpiennes (articulations des « jointures »)'], articulations: ['Carpe', 'Phalanges proximales'], role: 'Squelette de la paume.', ortho: "Amputation transmétacarpienne : prothèse partielle de main ou orthèse d'opposition." },
  { id: 'phalanges-main', nom: 'Phalanges de la main', latin: 'Phalanges manus', sym: true, membre: 'MS', region: 'Main',
    parts: [cap([.255, .782, .02], [.262, .735, .026], .0045), cap([.242, .75, 0], [.245, .672, 0], .004), cap([.229, .743, 0], [.23, .658, 0], .004), cap([.217, .748, 0], [.216, .668, 0], .0038), cap([.205, .758, 0], [.203, .69, 0], .0034)],
    description: "14 phalanges : 2 pour le pouce, 3 pour chacun des autres doigts.", reperes: ['Articulations interphalangiennes'], articulations: ['Métacarpiens'], role: 'Préhension fine.', ortho: "Amputation de doigts : prothèses digitales en silicone, doigts mécaniques ou myoélectriques." },
  { id: 'os-coxal', nom: 'Os coxal', latin: 'Os coxae', sym: true, region: 'Bassin',
    parts: COXAL,
    description: "Os large formé de l'ilium, de l'ischium et du pubis soudés autour de l'acétabulum (cotyle).", reperes: ['Crête iliaque', 'Épine iliaque antéro-supérieure (EIAS)', 'Épine iliaque postéro-supérieure (EIPS)', 'Tubérosité ischiatique', 'Symphyse pubienne'],
    articulations: ['Sacrum (sacro-iliaque)', 'Fémur (coxo-fémorale)', 'Pubis controlatéral (symphyse)'], role: "Transmet le poids du tronc aux membres inférieurs ; large surface d'insertion des fessiers et des muscles de la cuisse.",
    ortho: "Les crêtes iliaques sont le point d'appui du corset ; la tubérosité ischiatique supporte la prothèse fémorale (emboîture à contenance ischiatique)." },
  { id: 'femur', nom: 'Fémur', latin: 'Femur', sym: true, membre: 'MI', region: 'Cuisse',
    parts: [sph([.08, .93, 0], .024), cap([.08, .93, 0], [.155, .905, 0], .011, .011, { nom: 'col', diaphyse: false }), sph([.158, .915, -.005], .02), cap([.145, .89, 0], [.1, .53, .012], .016, .014, { diaphyse: true, nom: 'diaphyse' }), ell([.074, .505, -.005], [.02, .026, .035]), ell([.118, .505, -.005], [.022, .026, .035]), sph([.095, .525, .028], .019), sph([.092, .885, -.022], .0095)],
    description: "Plus long et plus solide os du corps : tête, col (angle cervico-diaphysaire ≈ 125°), grand et petit trochanters, diaphyse avec la ligne âpre, condyles.", reperes: ['Grand trochanter', 'Épicondyles médial et latéral'],
    articulations: ['Os coxal (coxo-fémorale)', 'Tibia (fémoro-tibiale)', 'Patella (fémoro-patellaire)'], role: "Support du poids ; levier des fessiers, du quadriceps et des ischio-jambiers.",
    ortho: "Fracture du col (Garden I à IV) chez le sujet âgé : prothèse de hanche ou vissage. Amputation trans-fémorale : la longueur du moignon conditionne le levier et le choix du genou prothétique." },
  { id: 'patella', nom: 'Patella (rotule)', latin: 'Patella', sym: true, membre: 'MI', region: 'Genou', parts: [ell([.095, .515, .05], [.021, .025, .011])],
    description: "Os sésamoïde dans le tendon du quadriceps ; augmente le bras de levier de l'extension du genou.", reperes: ['Base (haut), apex (bas)', 'Tendon patellaire (jusqu\'à la tubérosité tibiale)'], articulations: ['Fémur (trochlée)'],
    role: "Poulie du quadriceps.", ortho: "L'emboîture trans-tibiale PTB prend appui sur le tendon patellaire, sous la patella." },
  { id: 'tibia', nom: 'Tibia', latin: 'Tibia', sym: true, membre: 'MI', region: 'Jambe',
    parts: [ell([.095, .485, .005], [.04, .012, .032]), cap([.097, .47, .015], [.088, .095, 0], .018, .014, { diaphyse: true, nom: 'diaphyse' }), sph([.077, .078, 0], .012), ell([.09, .085, 0], [.026, .012, .022]), sph([.098, .455, .038], .0095)],
    description: "Os médial et porteur de la jambe : plateaux tibiaux, tubérosité tibiale, crête (bord antérieur) sous-cutanée, malléole médiale.", reperes: ['Tubérosité tibiale antérieure', 'Crête tibiale', 'Malléole médiale'],
    articulations: ['Fémur (genou)', 'Fibula (tibio-fibulaires)', 'Talus (cheville)'], role: "Reprend l'essentiel de la charge du membre inférieur.",
    ortho: "Amputation trans-tibiale : moignon de 12 à 15 cm sous l'interligne en général. Zones intolérantes : crête tibiale, extrémité distale ; zones tolérantes : tendon patellaire, loges musculaires." },
  { id: 'fibula', nom: 'Fibula (péroné)', latin: 'Fibula', sym: true, membre: 'MI', region: 'Jambe', parts: [sph([.13, .47, -.012], .012), cap([.128, .46, -.012], [.116, .075, -.008], .007, .008, { diaphyse: true }), sph([.116, .068, -.008], .012)],
    description: "Os grêle latéral de la jambe : tête, diaphyse, malléole latérale ; il porte peu de charge mais stabilise la cheville.", reperes: ['Tête de la fibula', 'Malléole latérale'], articulations: ['Tibia', 'Talus'],
    role: "Insertions musculaires ; mortaise tibio-fibulaire de la cheville.", ortho: "Le nerf fibulaire commun contourne le col : zone de décharge impérative des emboîtures et des orthèses de genou." },
  { id: 'talus', nom: 'Talus', latin: 'Talus', sym: true, membre: 'MI', region: 'Pied', parts: [ell([.09, .065, .005], [.02, .014, .025])],
    description: "Os de la cheville entre le tibia/fibula et le calcanéus.", reperes: ['Sous la mortaise malléolaire'], articulations: ['Tibia/fibula', 'Calcanéus', 'Naviculaire'], role: "Transmet le poids du corps au pied.", ortho: "Désarticulation de Syme : le talus est retiré, le coussinet talonnier est conservé." },
  { id: 'calcaneus', nom: 'Calcanéus', latin: 'Calcaneus', sym: true, membre: 'MI', region: 'Pied', parts: [ell([.09, .032, -.04], [.018, .022, .04])],
    description: "Plus gros os du tarse : le talon ; le tendon calcanéen s'y insère.", reperes: ['Tubérosité postérieure du calcanéus'], articulations: ['Talus', 'Cuboïde'], role: "Bras de levier du triceps sural.", ortho: "Fracture par chute de hauteur ; semelles de décharge du talon." },
  { id: 'tarse-anterieur', nom: 'Tarse antérieur', latin: 'Ossa tarsi', sym: true, membre: 'MI', region: 'Pied', parts: TARSE_ANT,
    description: "Naviculaire, cuboïde et trois cunéiformes : voûte du pied.", reperes: ['Tubercule du naviculaire', 'Base du Ve métatarsien'], articulations: ['Talus et calcanéus (Chopart)', 'Métatarsiens (Lisfranc)'], role: 'Voûte plantaire.', ortho: "Amputations partielles : interlignes de Chopart (talo-naviculaire et calcanéo-cuboïdienne) et de Lisfranc (tarso-métatarsienne)." },
  { id: 'metatarsiens', nom: 'Métatarsiens', latin: 'Ossa metatarsi', sym: true, membre: 'MI', region: 'Pied',
    parts: [cap([.07, .03, .1], [.065, .02, .17], .0075), cap([.08, .03, .1], [.08, .02, .175], .0055), cap([.09, .03, .1], [.094, .02, .172], .0055), cap([.1, .03, .1], [.107, .02, .165], .005), cap([.11, .03, .1], [.12, .02, .155], .005)],
    description: "Cinq os longs de l'avant-pied.", reperes: ['Tête du Ier métatarsien (hallux)', 'Base du Ve métatarsien'], articulations: ['Tarse', 'Phalanges'], role: "Appui de l'avant-pied et propulsion.", ortho: "Amputation transmétatarsienne ou de Lisfranc : orthèse de remplissage avec lame carbone." },
  { id: 'phalanges-pied', nom: 'Phalanges du pied', latin: 'Phalanges pedis', sym: true, membre: 'MI', region: 'Pied',
    parts: [cap([.065, .02, .172], [.066, .016, .208], .007), cap([.08, .02, .177], [.08, .016, .202], .004), cap([.094, .02, .174], [.096, .016, .196], .004), cap([.107, .02, .167], [.11, .016, .188], .0035), cap([.12, .02, .157], [.125, .016, .174], .003)],
    description: "14 phalanges : 2 pour l'hallux, 3 pour les autres orteils.", reperes: ['Hallux'], articulations: ['Métatarsiens'], role: 'Propulsion en fin de phase d\'appui.', ortho: "Hallux valgus ; amputation d'orteils : prothèses de remplissage silicone." }
];

/** Fiches des vertèbres et des côtes (générées) */
const FICHE_REGION = {
  lombaire: { description: "Vertèbre lombaire : gros corps vertébral cylindrique, apophyses transverses longues, apophyse épineuse horizontale.", role: 'Porte la charge du tronc ; mobilité en flexion-extension.', reperes: ['Apophyse épineuse (ligne médiane du dos)', "Ligne de Tuffier : L4 au niveau des crêtes iliaques"], ortho: "La zone lombaire est le siège de la lordose ; les corsets de scoliose lombaire exercent un appui sur les crêtes iliaques et la région lombaire convexe." },
  thoracique: { description: "Vertèbre thoracique : porte les facettes costales ; l'apophyse épineuse est longue et oblique en bas.", role: 'Articulation avec les côtes ; rigidité relative du thorax.', reperes: ['Apophyse épineuse (T7 au niveau de l\'angle inférieur de la scapula)'], ortho: "Siège habituel des scoliosistes idiopathiques : la rotation vertébrale entraîne la gibbosité costale côté convexe." },
  cervicale: { description: "Vertèbre cervicale : petit corps, foramen transversaire (artère vertébrale), apophyse épineuse courte (bifide de C2 à C6).", role: 'Mobilité de la tête.', reperes: ['C7 : apophyse épineuse la plus saillante (vertèbre proéminente)'], ortho: "Collier cervical, minerve : appui mentonnier, occipital et sternal." }
};
export const ficheVertebre = (v) => {
  const f = FICHE_REGION[v.region];
  const nom = v.id === 'C1' ? 'Atlas (C1)' : v.id === 'C2' ? 'Axis (C2)' : 'Vertèbre ' + v.id;
  return { nom, latin: 'Vertebra ' + v.id, region: 'Rachis ' + v.region, description: f.description + (v.id === 'C7' ? ' C7, la « proéminente », sert de repère pour compter les vertèbres.' : ''),
    reperes: f.reperes, articulations: ['Disques intervertébraux', 'Articulaires postérieures'], role: f.role, ortho: f.ortho };
};
export const ficheCote = (i) => ({ nom: 'Côte ' + i, latin: 'Costa ' + i, region: 'Thorax',
  description: i <= 7 ? 'Côte vraie : son cartilage costal rejoint directement le sternum.' : i <= 10 ? 'Côte fausse : son cartilage rejoint celui de la côte sus-jacente.' : 'Côte flottante : aucune attache antérieure.',
  reperes: i === 1 ? ['Sous la clavicule, en arrière du sternum'] : ['Espaces intercostaux palpables sur la paroi du thorax'], articulations: ['Vertèbre thoracique T' + i + ' (costo-vertébrale)', i <= 10 ? 'Sternum (par le cartilage costal)' : 'Aucune attache sternale'],
  role: 'Protection des viscères thoraciques ; mécanique ventilatoire.', ortho: "En scoliose, la rotation vertébrale déplace les côtes : gibbosité postérieure côté convexe, creux côté concave." });

// ── Repères anatomiques palpables ──
/* sym:false → x = 0 ; sinon côté gauche, miroir à droite. `os` : os sous-jacent. */
export const REPERES = [
  { id: 'eias', nom: 'Épine iliaque antéro-supérieure (EIAS)', p: [.12, 1.04, .085], os: 'os-coxal', palpation: "Saillie osseuse à l'extrémité antérieure de la crête iliaque, au-dessus du pli de l'aine, sur la ligne latérale du bassin.", utilite: "Origine du sartorius ; repère de la longueur des membres inférieurs et de l'alignement du bassin." },
  { id: 'eips', nom: 'Épine iliaque postéro-supérieure (EIPS)', p: [.05, 1.045, -.095], os: 'os-coxal', palpation: "Fossette de Vénus : relief osseux au niveau des deux fossettes sacrées, de part et d'autre du sacrum.", utilite: "Repère de la bascule du bassin et de l'articulation sacro-iliaque." },
  { id: 'crete-iliaque', nom: 'Crête iliaque', p: [.145, 1.08, -.01], os: 'os-coxal', palpation: "Mains posées sur les hanches : bord supérieur de l'os coxal, de l'EIAS à l'EIPS.", utilite: "Niveau de L4-L5 ; point d'appui des corsets lombaires." },
  { id: 'grand-trochanter', nom: 'Grand trochanter', p: [.165, .925, 0], os: 'femur', palpation: "Saillie latérale à la hauteur du pli fessier haut, qui suit la rotation de la cuisse.", utilite: "Axe de la hanche ; insertion des fessiers ; repère des emboîtures fémorales (bord externe)." },
  { id: 'ischion', nom: 'Tubérosité ischiatique', p: [.07, .885, -.058], os: 'os-coxal', palpation: "Sous le pli fessier, en position assise ou hanche fléchie : saillie osseuse qui supporte le poids assis.", utilite: "Appui ischiatique des emboîtures fémorales ; origine des ischio-jambiers." },
  { id: 'symphyse-pubienne', nom: 'Symphyse pubienne', sym: false, p: [0, .9, .075], os: 'os-coxal', palpation: "Relief médian au-dessus des organes génitaux externes.", utilite: "Repère antérieur du bassin." },
  { id: 'epicondyle-lat-femur', nom: 'Épicondyle latéral du fémur', p: [.135, .5, .0], os: 'femur', palpation: "Saillie latérale au-dessus de l'interligne du genou.", utilite: "Axe de flexion du genou ; repère des genouillères et articulations de genou." },
  { id: 'epicondyle-med-femur', nom: 'Épicondyle médial du fémur', p: [.055, .5, .0], os: 'femur', palpation: "Saillie médiale au-dessus de l'interligne, tubercule des adducteurs au-dessus.", utilite: "Axe de flexion du genou." },
  { id: 'patella', nom: 'Patella (rotule)', p: [.095, .515, .062], os: 'patella', palpation: "Os mobile en avant du genou, genou en extension et quadriceps relâché.", utilite: "Repère des emboîtures PTB (tendon patellaire en dessous)." },
  { id: 'tuberosite-tibiale', nom: 'Tubérosité tibiale antérieure', p: [.098, .455, .045], os: 'tibia', palpation: "Relief à 3 cm sous la patella où s'insère le tendon patellaire.", utilite: "Appui de l'emboîture PTB ; repère de la maladie d'Osgood-Schlatter." },
  { id: 'tete-fibula', nom: 'Tête de la fibula', p: [.135, .47, -.012], os: 'fibula', palpation: "Saillie arrondie à la face latérale et postérieure du genou, 2 cm sous l'interligne.", utilite: "Le nerf fibulaire commun passe en dessous : zone de décharge." },
  { id: 'crete-tibiale', nom: 'Crête tibiale', p: [.095, .3, .036], os: 'tibia', palpation: "Bord antérieur du tibia, sous la peau sur toute la jambe.", utilite: "Zone douloureuse, intolérante à la pression en emboîture." },
  { id: 'malleole-med', nom: 'Malléole médiale', p: [.068, .075, 0], os: 'tibia', palpation: "Saillie médiale de la cheville.", utilite: "Axe de la cheville ; repère des orthèses de cheville." },
  { id: 'malleole-lat', nom: 'Malléole latérale', p: [.125, .065, -.008], os: 'fibula', palpation: "Saillie latérale de la cheville, plus basse et plus postérieure que la médiale.", utilite: "Axe de la cheville ; entorse du ligament talo-fibulaire antérieur." },
  { id: 'tuberosite-calcaneus', nom: 'Tubérosité du calcanéus', p: [.09, .03, -.078], os: 'calcaneus', palpation: "Arrière du talon, point d'appui postérieur.", utilite: "Insertion du tendon calcanéen." },
  { id: 'base-5e-meta', nom: 'Base du 5e métatarsien', p: [.125, .03, .075], os: 'metatarsiens', palpation: "Saillie sur le bord latéral du pied, à mi-longueur.", utilite: "Insertion du fibulaire court ; fracture de Jones." },
  { id: 'acromion', nom: 'Acromion', p: [.17, 1.468, 0], os: 'scapula', palpation: "Sommet osseux de l'épaule, en suivant la clavicule vers l'extérieur.", utilite: "Repère de l'espace sous-acromial ; coiffe des rotateurs." },
  { id: 'epine-scapula', nom: 'Épine de la scapula', p: [.1, 1.428, -.105], os: 'scapula', palpation: "Crête transversale oblique à la face postérieure de l'omoplate.", utilite: "Niveau de T3 ; séparation des fosses supra- et infra-épineuses." },
  { id: 'angle-inf-scapula', nom: 'Angle inférieur de la scapula', p: [.095, 1.31, -.105], os: 'scapula', palpation: "Pointe inférieure de l'omoplate ; elle se soulève en décollement scapulaire.", utilite: "Niveau de T7 ; en scoliose, saillie côté convexe." },
  { id: 'coracoide', nom: 'Processus coracoïde', p: [.14, 1.43, .06], os: 'scapula', palpation: "Sous la clavicule, relief profond en dedans de la tête humérale.", utilite: "Insertion du petit pectoral et du court biceps." },
  { id: 'tubercule-majeur', nom: 'Tubercule majeur (trochiter)', p: [.195, 1.4, .012], os: 'humerus', palpation: "Relief latéral de la tête humérale, sous l'acromion.", utilite: "Insertion des muscles sus- et infra-épineux." },
  { id: 'epicondyle-med-humerus', nom: 'Épicondyle médial (épitrochlée)', p: [.178, 1.12, 0], os: 'humerus', palpation: "Saillie interne du coude ; le nerf ulnaire passe en arrière.", utilite: "Origine des fléchisseurs du poignet." },
  { id: 'epicondyle-lat-humerus', nom: 'Épicondyle latéral', p: [.237, 1.12, 0], os: 'humerus', palpation: "Saillie externe du coude.", utilite: "Origine des extenseurs (tennis-elbow)." },
  { id: 'olecrane', nom: 'Olécrane', p: [.205, 1.13, -.043], os: 'ulna', palpation: "Pointe postérieure du coude, nettement palpable coude fléchi.", utilite: "Insertion du triceps ; repère des emboîtures trans-humérales." },
  { id: 'styloide-radiale', nom: 'Processus styloïde radial', p: [.245, .865, .01], os: 'radius', palpation: "Saillie latérale du poignet, à la base du pouce.", utilite: "Repère de la tabatière anatomique." },
  { id: 'styloide-ulnaire', nom: 'Processus styloïde ulnaire', p: [.215, .86, -.02], os: 'ulna', palpation: "Petite saillie postéro-médiale du poignet.", utilite: "Repère de l'ulna distal." },
  { id: 'c7', nom: 'Vertèbre proéminente (C7)', sym: false, p: [0, 1.515, -.085], os: 'vertebre-C7', palpation: "Saillie la plus marquée à la base de la nuque, tête fléchie.", utilite: "Repère pour compter les épines vertébrales ; fil à plomb de la ligne médiane en scoliose." },
  { id: 'epineuse-l4', nom: 'Apophyse épineuse de L4 (ligne de Tuffier)', sym: false, p: [0, 1.106, -.085], os: 'vertebre-L4', palpation: "Sur la ligne joignant les sommets des crêtes iliaques.", utilite: "Repère de la ponction lombaire et du niveau L4-L5." },
  { id: 'fourchette-sternale', nom: 'Fourchette sternale', sym: false, p: [0, 1.46, .09], os: 'sternum', palpation: "Dépression à la base du cou, entre les clavicules.", utilite: "Repère du niveau T2-T3." },
  { id: 'angle-louis', nom: 'Angle de Louis (manubrio-sternal)', sym: false, p: [0, 1.405, .115], os: 'sternum', palpation: "Crête transversale du sternum, à la 2e côte.", utilite: "Repère pour compter les côtes ; niveau de T4-T5." },
  { id: 'processus-xiphoide', nom: 'Processus xiphoïde', sym: false, p: [0, 1.27, .105], os: 'sternum', palpation: "Extrémité inférieure du sternum, au creux de l'estomac.", utilite: "Limite basse des corsets de thorax antérieurs." },
  { id: 'protuberance-occipitale', nom: 'Protubérance occipitale externe', sym: false, p: [0, 1.66, -.098], os: 'crane', palpation: "Bosse médiane à la jonction nuque-crâne.", utilite: "Appui postérieur des colliers et minerves." }
];
