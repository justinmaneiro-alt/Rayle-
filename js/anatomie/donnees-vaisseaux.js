/* ═════════════ DONNÉES : VAISSEAUX HAUTE FIDÉLITÉ (BodyParts3D) ═════════════
   Réseau principal : [id, nom français, latin (Terminologia Anatomica), région, [concepts BodyParts3D], 'artere' | 'veine', membre].
   « {c} » est remplacé par « left » / « right ». Les branches fines (rameaux segmentaires, cérébraux, coronaires distaux…) sont fusionnées sans étiquette individuelle dans
   arteres-fin-bp3d.glb et veines-fin-bp3d.glb (qualités Haute et Ultra seulement).
   Couleurs : artères rouges, veines bleues ; les artères pulmonaires sont bleues et les veines pulmonaires rouges (sang pauvre / riche en oxygène). */
const A = 'artere', V = 'veine';

export const VAISSEAUX_HD = [
  // ── Artères : aorte et grosses branches ──
  ['aorte-ascendante', 'Aorte ascendante', 'Pars ascendens aortae', 'Thorax', ['ascending aorta'], A],
  ['crosse-aorte', "Crosse de l'aorte", 'Arcus aortae', 'Thorax', ['arch of aorta'], A],
  ['aorte-thoracique', 'Aorte thoracique', 'Pars thoracica aortae', 'Thorax', ['descending thoracic aorta'], A],
  ['aorte-abdominale', 'Aorte abdominale', 'Pars abdominalis aortae', 'Abdomen', ['abdominal aorta'], A],
  ['tronc-brachio-cephalique', 'Tronc artériel brachio-céphalique', 'Truncus brachiocephalicus', 'Cou', ['brachiocephalic artery'], A],
  ['carotide-commune', 'Artère carotide commune', 'Arteria carotis communis', 'Cou', ['{c} common carotid artery'], A],
  ['carotide-interne', 'Artère carotide interne', 'Arteria carotis interna', 'Tête', ['{c} internal carotid artery'], A],
  ['sous-claviere', 'Artère sous-clavière', 'Arteria subclavia', 'Épaule', ['{c} subclavian artery'], A],
  ['vertebrale', 'Artère vertébrale', 'Arteria vertebralis', 'Cou', ['{c} vertebral artery'], A],
  ['thoracique-interne', 'Artère thoracique interne', 'Arteria thoracica interna', 'Thorax', ['{c} internal thoracic artery'], A],
  ['thyroidienne-inferieure', 'Artère thyroïdienne inférieure', 'Arteria thyroidea inferior', 'Cou', ['{c} inferior thyroid artery'], A],
  ['basilaire', 'Artère basilaire', 'Arteria basilaris', 'Tête', ['basilar artery'], A],
  // ── Artères du membre supérieur ──
  ['axillaire', 'Artère axillaire', 'Arteria axillaris', 'Épaule', ['{c} axillary artery'], A, 'MS'],
  ['brachiale', 'Artère brachiale', 'Arteria brachialis', 'Bras', ['{c} brachial artery'], A, 'MS'],
  ['brachiale-profonde', 'Artère brachiale profonde', 'Arteria profunda brachii', 'Bras', ['{c} deep brachial artery'], A, 'MS'],
  ['radiale', 'Artère radiale', 'Arteria radialis', 'Avant-bras', ['{c} radial artery'], A, 'MS'],
  ['ulnaire', 'Artère ulnaire', 'Arteria ulnaris', 'Avant-bras', ['{c} ulnar artery'], A, 'MS'],
  ['arcade-palmaire-superficielle', 'Arcade palmaire superficielle', 'Arcus palmaris superficialis', 'Main', ['{c} superficial palmar arterial arch'], A, 'MS'],
  ['arcade-palmaire-profonde', 'Arcade palmaire profonde', 'Arcus palmaris profundus', 'Main', ['{c} deep palmar arch'], A, 'MS'],
  // ── Artères de l'abdomen et du bassin ──
  ['tronc-coeliaque', 'Tronc cœliaque', 'Truncus coeliacus', 'Abdomen', ['celiac artery'], A],
  ['hepatique-commune', 'Artère hépatique commune', 'Arteria hepatica communis', 'Abdomen', ['common hepatic artery'], A],
  ['splenique', 'Artère splénique', 'Arteria splenica', 'Abdomen', ['splenic artery'], A],
  ['mesenterique-superieure', 'Artère mésentérique supérieure', 'Arteria mesenterica superior', 'Abdomen', ['superior mesenteric artery'], A],
  ['mesenterique-inferieure', 'Artère mésentérique inférieure', 'Arteria mesenterica inferior', 'Abdomen', ['inferior mesenteric artery'], A],
  ['renale-arterielle', 'Artère rénale', 'Arteria renalis', 'Abdomen', ['{c} renal artery'], A],
  ['iliaque-commune-arterielle', 'Artère iliaque commune', 'Arteria iliaca communis', 'Bassin', ['{c} common iliac artery'], A],
  ['iliaque-externe-arterielle', 'Artère iliaque externe', 'Arteria iliaca externa', 'Bassin', ['{c} external iliac artery'], A],
  ['iliaque-interne-arterielle', 'Artère iliaque interne', 'Arteria iliaca interna', 'Bassin', ['{c} internal iliac artery'], A],
  // ── Artères du membre inférieur ──
  ['femorale-arterielle', 'Artère fémorale', 'Arteria femoralis', 'Cuisse', ['{c} femoral artery'], A, 'MI'],
  ['poplitee-arterielle', 'Artère poplitée', 'Arteria poplitea', 'Cuisse', ['{c} popliteal artery'], A, 'MI'],
  ['tibiale-anterieure-arterielle', 'Artère tibiale antérieure', 'Arteria tibialis anterior', 'Jambe', ['{c} anterior tibial artery'], A, 'MI'],
  ['tibiale-posterieure-arterielle', 'Artère tibiale postérieure', 'Arteria tibialis posterior', 'Jambe', ['{c} posterior tibial artery'], A, 'MI'],
  ['dorsale-du-pied', 'Artère dorsale du pied', 'Arteria dorsalis pedis', 'Pied', ['{c} dorsalis pedis artery'], A, 'MI'],
  ['plantaire-laterale-arterielle', 'Artère plantaire latérale', 'Arteria plantaris lateralis', 'Pied', ['{c} lateral plantar artery'], A, 'MI'],
  ['plantaire-mediale-arterielle', 'Artère plantaire médiale', 'Arteria plantaris medialis', 'Pied', ['{c} medial plantar artery'], A, 'MI'],
  ['arcade-plantaire', 'Arcade plantaire', 'Arcus plantaris', 'Pied', ['{c} plantar arch'], A, 'MI'],
  // ── Cœur et poumons ──
  ['tronc-pulmonaire', 'Tronc pulmonaire', 'Truncus pulmonalis', 'Thorax', ['pulmonary trunk'], A],
  ['arteres-coronaires', 'Artères coronaires (réseau)', 'Arteriae coronariae', 'Thorax', ['coronary artery'], A],
  // ── Veines ──
  ['veine-cave-superieure', 'Veine cave supérieure', 'Vena cava superior', 'Thorax', ['superior vena cava'], V],
  ['veine-cave-inferieure', 'Veine cave inférieure', 'Vena cava inferior', 'Abdomen', ['inferior vena cava'], V],
  ['veine-brachio-cephalique', 'Veine brachio-céphalique', 'Vena brachiocephalica', 'Thorax', ['{c} brachiocephalic vein'], V],
  ['veine-jugulaire-interne', 'Veine jugulaire interne', 'Vena jugularis interna', 'Cou', ['{c} internal jugular vein'], V],
  ['veine-sous-claviere', 'Veine sous-clavière', 'Vena subclavia', 'Épaule', ['{c} subclavian vein'], V],
  ['veine-azygos', 'Veine azygos', 'Vena azygos', 'Thorax', ['azygos vein'], V],
  ['veine-hemi-azygos', 'Veine hémi-azygos', 'Vena hemiazygos', 'Thorax', ['hemiazygos vein'], V],
  ['veine-axillaire', 'Veine axillaire', 'Vena axillaris', 'Épaule', ['{c} axillary vein'], V, 'MS'],
  ['veine-cephalique', 'Veine céphalique', 'Vena cephalica', 'Bras', ['{c} cephalic vein'], V, 'MS'],
  ['veine-basilique', 'Veine basilique', 'Vena basilica', 'Bras', ['{c} basilic vein'], V, 'MS'],
  ['veines-brachiales', 'Veines brachiales', 'Venae brachiales', 'Bras', ['brachial vein'], V, 'MS'],
  ['veine-mediane-du-coude', 'Veine médiane du coude', 'Vena mediana cubiti', 'Avant-bras', ['{c} median cubital vein'], V, 'MS'],
  ['veines-radiales', 'Veines radiales', 'Venae radiales', 'Avant-bras', ['{c} radial vein'], V, 'MS'],
  ['veines-ulnaires', 'Veines ulnaires', 'Venae ulnares', 'Avant-bras', ['{c} ulnar vein'], V, 'MS'],
  ['veine-porte', 'Veine porte du foie', 'Vena portae hepatis', 'Abdomen', ['hepatic portal vein'], V],
  ['veine-splenique', 'Veine splénique', 'Vena splenica', 'Abdomen', ['splenic vein'], V],
  ['veine-mesenterique-superieure', 'Veine mésentérique supérieure', 'Vena mesenterica superior', 'Abdomen', ['superior mesenteric vein'], V],
  ['veine-mesenterique-inferieure', 'Veine mésentérique inférieure', 'Vena mesenterica inferior', 'Abdomen', ['inferior mesenteric vein'], V],
  ['veine-renale', 'Veine rénale', 'Vena renalis', 'Abdomen', ['{c} renal vein'], V],
  ['veine-iliaque-commune', 'Veine iliaque commune', 'Vena iliaca communis', 'Bassin', ['{c} common iliac vein'], V],
  ['veine-iliaque-externe', 'Veine iliaque externe', 'Vena iliaca externa', 'Bassin', ['{c} external iliac vein'], V],
  ['veine-iliaque-interne', 'Veine iliaque interne', 'Vena iliaca interna', 'Bassin', ['{c} internal iliac vein'], V],
  ['veine-femorale', 'Veine fémorale', 'Vena femoralis', 'Cuisse', ['{c} femoral vein'], V, 'MI'],
  ['veine-femorale-profonde', 'Veine fémorale profonde', 'Vena profunda femoris', 'Cuisse', ['{c} deep femoral vein'], V, 'MI'],
  ['grande-saphene', 'Veine grande saphène', 'Vena saphena magna', 'Cuisse', ['{c} great saphenous vein'], V, 'MI'],
  ['petite-saphene', 'Veine petite saphène', 'Vena saphena parva', 'Jambe', ['{c} small saphenous vein'], V, 'MI'],
  ['veine-poplitee', 'Veine poplitée', 'Vena poplitea', 'Cuisse', ['{c} popliteal vein'], V, 'MI'],
  ['veines-tibiales-anterieures', 'Veines tibiales antérieures', 'Venae tibiales anteriores', 'Jambe', ['{c} anterior tibial vein'], V, 'MI'],
  ['veines-tibiales-posterieures', 'Veines tibiales postérieures', 'Venae tibiales posteriores', 'Jambe', ['{c} posterior tibial vein'], V, 'MI'],
  ['veines-fibulaires', 'Veines fibulaires', 'Venae fibulares', 'Jambe', ['{c} fibular vein'], V, 'MI'],
  ['veines-pulmonaires', 'Veines pulmonaires', 'Venae pulmonales', 'Thorax', ['pulmonary vein'], V],
  ['veine-cardiaque-magna', 'Grande veine cardiaque', 'Vena cardiaca magna', 'Thorax', ['great cardiac vein'], V],
  ['veine-cardiaque-moyenne', 'Veine cardiaque moyenne', 'Vena cardiaca media', 'Thorax', ['middle cardiac vein'], V],
  // branches fines fusionnées (arteres-fin-bp3d.glb, veines-fin-bp3d.glb) : sans concept individuel
  ['arteres-fines', 'Branches artérielles fines (réseau de détail)', 'Rami arteriales', 'Tout le corps', [], A],
  ['veines-fines', 'Veines fines (réseau de détail)', 'Venulae et venae minores', 'Tout le corps', [], V]
];

/** Couleur d'affichage d'un vaisseau : rouge pour les artères, bleu pour les veines, sauf le petit circuit (tronc pulmonaire bleu, veines pulmonaires rouges) */
export const BLEUS = ['tronc-pulmonaire'];
export const ROUGES = ['veines-pulmonaires'];

/** Repli schématique (sans le modèle haute fidélité : hors ligne, fichier absent, appareil trop modeste) : les troncs principaux, tracés dans le repère de donnees-os.js (côté gauche, x > 0).
    Quand le modèle haute fidélité se charge, il remplace ces tubes (même identifiant). [id, type, rayon, symétrique, membre, points] */
export const VAISSEAUX_SCHEMA = [
  ['aorte-thoracique', 'artere', .011, false, null, [[.025, 1.34, .045], [.01, 1.43, .035], [.02, 1.38, -.01], [.018, 1.25, -.035], [.012, 1.1, -.045], [.005, .985, -.05]]],
  ['carotide-commune', 'artere', .004, true, null, [[.03, 1.45, .05], [.032, 1.55, .045], [.035, 1.64, .035]]],
  ['sous-claviere', 'artere', .005, true, null, [[.03, 1.45, .04], [.09, 1.435, .035], [.16, 1.42, .02]]],
  ['brachiale', 'artere', .0035, true, 'MS', [[.17, 1.4, .02], [.19, 1.3, .028], [.2, 1.12, .035]]],
  ['radiale', 'artere', .0022, true, 'MS', [[.205, 1.12, .03], [.22, .98, .03], [.235, .87, .03]]],
  ['ulnaire', 'artere', .0025, true, 'MS', [[.205, 1.12, .025], [.21, 1.0, 0], [.222, .88, .01]]],
  ['iliaque-commune-arterielle', 'artere', .006, true, null, [[.005, .985, -.045], [.03, .95, -.01], [.06, .92, .03]]],
  ['femorale-arterielle', 'artere', .005, true, 'MI', [[.07, .93, .05], [.08, .75, .06], [.088, .6, .045], [.09, .52, .02]]],
  ['poplitee-arterielle', 'artere', .004, true, 'MI', [[.09, .52, .02], [.095, .48, -.025], [.095, .4, -.03]]],
  ['tibiale-posterieure-arterielle', 'artere', .003, true, 'MI', [[.095, .4, -.03], [.09, .25, -.025], [.082, .1, -.02], [.08, .06, 0]]],
  ['tibiale-anterieure-arterielle', 'artere', .003, true, 'MI', [[.095, .4, -.03], [.105, .33, .02], [.09, .2, .045], [.09, .09, .05]]],
  ['veine-cave-inferieure', 'veine', .012, false, null, [[-.012, .985, -.03], [-.012, 1.1, -.035], [-.015, 1.2, -.03], [-.015, 1.33, 0]]],
  ['veine-cave-superieure', 'veine', .01, false, null, [[-.028, 1.33, .02], [-.03, 1.42, .02], [-.03, 1.5, .03]]],
  ['veine-femorale', 'veine', .005, true, 'MI', [[.062, .93, .05], [.075, .75, .055], [.085, .6, .04], [.09, .52, .02]]],
  ['grande-saphene', 'veine', .002, true, 'MI', [[.06, .93, .05], [.075, .7, .045], [.09, .5, .04], [.085, .3, .03], [.075, .1, .01]]],
  ['veine-cephalique', 'veine', .002, true, 'MS', [[.17, 1.4, .04], [.2, 1.3, .04], [.22, 1.12, .035], [.235, .9, .03]]]
];
