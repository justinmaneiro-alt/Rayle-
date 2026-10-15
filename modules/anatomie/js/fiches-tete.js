/* Fiches : langue, palais, orbite, larynx, pharynx, périnée. Source : Gray's Anatomy 1918, Myologie (voir fiches-corps.js). */
import { f, SOURCE_GRAY } from './fiches-outils.js?v=2026.10.15.7';

const TET = SOURCE_GRAY + ', Myologie : muscles de la tête, de la langue, du palais et du pharynx';
const ORB = SOURCE_GRAY + ', Myologie : muscles de l\'orbite';
const PER = SOURCE_GRAY + ', Myologie : muscles du périnée et du plancher pelvien';
const OCU = "Nerf oculomoteur (III)";

export const FICHES_TETE = {
  // ── Langue et palais ──
  'genioglosse': f(['mandibule', "Épine mentonnière supérieure, face interne de la symphyse, juste au-dessus du génio-hyoïdien, par un court tendon"], null, null, null, "Muscle plat triangulaire, parallèle au plan médian ; ses fibres inférieures s'attachent au haut du corps de l'os hyoïde.", TET),
  'hyoglosse': f(null, null, null, "Muscle extrinsèque de la langue.", "Mince et quadrilatère : naît du côté du corps et de toute la longueur de la grande corne de l'os hyoïde, monte presque verticalement dans le côté de la langue.", TET),
  'elevateur-voile-palais': f(['crane', "Face inférieure du sommet de la partie pétreuse du temporal et lame médiale du cartilage de la trompe auditive"], null, "Probablement le nerf accessoire par le plexus pharyngien (Gray, 1918)", "Élève le voile du palais.", "Épais et arrondi, latéral aux choanes ; passe au-dessus du bord supérieur du constricteur supérieur du pharynx.", TET),
  'tenseur-voile-palais': f(['crane', "Fosse scaphoïde à la base de la lame ptérygoïdienne médiale, épine du sphénoïde et paroi latérale du cartilage de la trompe auditive"], null, "Nerf issu du ganglion otique", "Tend le voile du palais.", "Large ruban mince, latéral à l'élévateur du voile ; son tendon s'enroule autour du crochet ptérygoïdien.", TET),
  'luette': f(['crane', "Épine nasale postérieure des os palatins et aponévrose palatine"], null, "Probablement le nerf accessoire par le plexus pharyngien (Gray, 1918)", "Raccourcit et élève la luette.", null, TET),
  // ── Orbite ──
  'droit-superieur-oeil': f(null, null, OCU, "Tourne la cornée vers le haut.", null, ORB),
  'droit-inferieur-oeil': f(null, null, OCU, "Tourne la cornée vers le bas.", null, ORB),
  'droit-medial-oeil': f(null, null, OCU, "Tourne la cornée vers l'intérieur.", null, ORB),
  'droit-lateral-oeil': f(null, null, "Nerf abducens (VI)", "Tourne la cornée vers l'extérieur.", null, ORB),
  'oblique-superieur-oeil': f(['crane', "Juste au-dessus du bord du canal optique, au-dessus et en dedans de l'origine du droit supérieur"], null, "Nerf trochléaire (IV)", "Muscle oculomoteur oblique.", "Son tendon arrondi glisse dans une poulie fibro-cartilagineuse attachée à la fovéa trochléaire de l'os frontal.", ORB),
  'oblique-inferieur-oeil': f(['crane', "Face orbitaire du maxillaire, en dehors de la gouttière lacrymale"], null, OCU, "Muscle oculomoteur oblique.", "Mince et étroit, près du bord antérieur du plancher de l'orbite ; s'insère sur la partie latérale de la sclère.", ORB),
  'elevateur-paupiere': f(null, null, OCU, "Élève la paupière supérieure ; antagoniste direct de l'orbiculaire des paupières.", null, ORB),
  // ── Pharynx ──
  'constricteur-superieur': f(['crane', "Tiers inférieur du bord postérieur de la lame ptérygoïdienne médiale et son crochet, raphé ptérygo-mandibulaire, processus alvéolaire de la mandibule, côté de la langue"], null, "Branches du plexus pharyngien", "Resserre le pharynx à la déglutition.", "Quadrilatère, plus mince et plus pâle que les deux autres constricteurs ; ses fibres s'insèrent sur le raphé médian postérieur.", TET),
  'constricteur-moyen': f(null, null, "Branches du plexus pharyngien", "Resserre le pharynx à la déglutition.", "En éventail : naît du bord supérieur de la grande corne, de la petite corne de l'os hyoïde et du ligament stylo-hyoïdien.", TET),
  'constricteur-inferieur': f(null, null, "Branches du plexus pharyngien et nerfs laryngés externe et récurrent", "Resserre le pharynx à la déglutition.", "Le plus épais des trois constricteurs, né des côtés des cartilages cricoïde et thyroïde.", TET),
  'stylo-pharyngien': f(['crane', "Côté médial de la base du processus styloïde"], null, "Nerf glosso-pharyngien (IX)", "Élève le pharynx et élargit son diamètre transversal à la déglutition.", "Long, grêle, entre le constricteur supérieur et le constricteur moyen.", TET),
  'salpingo-pharyngien': f(null, null, "Branches du plexus pharyngien", "Élève le pharynx.", null, TET),
  'palato-pharyngien': f(null, null, "Branches du plexus pharyngien", "Resserre le pharynx et abaisse le voile du palais.", null, TET),
  // ── Larynx ──
  'crico-arytenoidien-posterieur': f(null, null, null, "Muscle intrinsèque du larynx.", null, TET),
  'crico-arytenoidien-lateral': f(null, null, null, "Muscle intrinsèque du larynx.", null, TET),
  'arytenoidien-transverse': f(null, null, null, "Muscle intrinsèque du larynx.", null, TET),
  'arytenoidien-oblique': f(null, null, null, "Muscle intrinsèque du larynx.", null, TET),
  'thyro-arytenoidien': f(null, null, null, "Muscle intrinsèque du larynx.", null, TET),
  'vocal': f(null, null, null, "Muscle intrinsèque du larynx, du pli vocal.", null, TET),
  'crico-thyroidien': f(null, null, null, "Muscle intrinsèque du larynx : tend les plis vocaux.", "Triangulaire ; deux groupes de fibres, partie oblique et partie droite.", TET),
  'ary-epiglottique': f(null, null, null, "Muscle intrinsèque du larynx.", null, TET),
  // ── Périnée et plancher pelvien ──
  'coccygien': f(['os-coxal', "Épine ischiatique et ligament sacro-épineux, par son sommet"], ['coccyx', "Bord du coccyx et côté de la dernière pièce du sacrum, par sa base"], "Branche des nerfs sacrés S4 et S5", "Tire en avant et soutient le coccyx, repoussé en arrière pendant la défécation ou l'accouchement ; avec le releveur de l'anus, ferme la partie postérieure du détroit inférieur du bassin.", "Plan triangulaire de fibres musculaires et tendineuses, derrière le releveur de l'anus.", PER),
  'pubo-coccygien': f(null, null, null, "Le releveur de l'anus resserre l'extrémité inférieure du rectum ; muscle de l'expiration forcée.", "Fait partie du releveur de l'anus, large muscle mince sur le côté du bassin.", PER),
  'ilio-coccygien': f(null, null, null, "Le releveur de l'anus resserre l'extrémité inférieure du rectum ; muscle de l'expiration forcée.", "Fait partie du releveur de l'anus.", PER),
  'pubo-rectal': f(null, null, null, "Le releveur de l'anus resserre l'extrémité inférieure du rectum ; muscle de l'expiration forcée.", "Fait partie du releveur de l'anus.", PER),
  'sphincter-externe-anus': f(null, null, "Branche du 4e nerf sacré et rameaux du nerf rectal inférieur (nerf pudendal)", "En contraction tonique permanente, il garde fermés le canal et l'orifice anal.", "Plan plat elliptique, adhérent à la peau autour de l'anus ; mesure 8 à 10 cm de long ; deux strates, superficielle et profonde.", PER)
};
