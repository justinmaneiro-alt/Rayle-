/* ═════════════ ANATOMIE : PATHOLOGIES ET ORTHOPÉDIE (module pur, S6) ═════════════
   Bibliothèque pédagogique : scoliose (angle de Cobb MESURÉ sur la déformation), cyphose, amputations à tous les niveaux (plan de section, longueur du moignon d'après le modèle,
   appareillage usuel), déficiences congénitales (ISO 8548-1, décrites par le segment absent), attitudes neurologiques et déformations articulaires (poses de l'articulé),
   fractures (fragments déplacés). OUTIL PÉDAGOGIQUE, PAS UN OUTIL DE DIAGNOSTIC : chaque fiche porte un niveau de confiance et le rappel « à vérifier avec le cours / un atlas
   de référence ». Les décisions de diagnostic, de chirurgie et d'appareillage relèvent des professionnels de santé. Les valeurs chiffrées sont des repères classiques, jamais des normes de soin. */
export const AVERTISSEMENT = 'Contenu pédagogique, pas un outil de diagnostic : un diagnostic, une chirurgie ou un appareillage relèvent d’un médecin et d’un orthoprothésiste. À vérifier avec le cours / un atlas de référence.';
const D = Math.PI / 180;
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const sansCote = n => String(n).toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right)( |$)/, ' of $2').replace(/\s+/g, ' ').trim();

/* ── rachis : T1 à L5 dans l'ordre, avec leur centre ; côtes et disques rattachés à la vertèbre ── */
export function rachis(index) {
  const os = index.deSysteme('os'), vertebres = [];
  for (const [serie, nom, n] of [['thoracic', 'T', 12], ['lumbar', 'L', 5]]) for (let i = 0; i < n; i++) {
    const p = os.find(x => sansCote(x.nom_en) === ORD[i] + ' ' + serie + ' vertebra'); if (!p) continue;
    vertebres.push({ code: nom + (i + 1), piece: p, centre: index.centre(p) });
  }
  const parCode = new Map(vertebres.map((v, i) => [v.code, i])), rattache = new Map();
  for (const v of vertebres) rattache.set(v.piece.id, parCode.get(v.code));
  for (const p of index.pieces) {
    const n = sansCote(p.nom_en); let m;
    if (p.systeme === 'os' && (m = n.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib$/))) { const k = ORD.indexOf(m[1]); if (k < 12) rattache.set(p.id, k); }
    else if ((m = n.match(/^intervertebral disk of (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) (thoracic|lumbar) vertebra$/))) { const code = (m[2] === 'thoracic' ? 'T' : 'L') + (ORD.indexOf(m[1]) + 1); if (parCode.has(code)) rattache.set(p.id, parCode.get(code)); }
  }
  return { vertebres, rattache };
}

/* ── déformations du rachis ── */
const gauss = (y, y0, s) => Math.exp(-((y - y0) ** 2) / (2 * s * s));
/* Profil latéral x(y) d'une courbe : somme de gaussiennes ; amplitudes signées. Les angles d'inclinaison des vertebres sont mesurés sur la dérivée. */
function inclinaisons(ys, courbes, K) {
  return ys.map(y => { let dx = 0; for (const c of courbes) dx += K * c.signe * c.amp * (-(y - c.y0) / (c.s * c.s)) * gauss(y, c.y0, c.s); return Math.atan(dx) / D; });
}
/* Angle de Cobb : écart entre l'inclinaison maximale et minimale sur une plage de vertèbres (extrémités de la courbe) */
export function cobbSur(incl, i0 = 0, i1 = incl.length - 1) { let mx = -1e9, mn = 1e9; for (let i = i0; i <= i1; i++) { mx = Math.max(mx, incl[i]); mn = Math.min(mn, incl[i]); } return mx - mn; }
/* Scoliose : cobb = angle visé de la courbe principale, type = 'thoracique' | 'lombaire' | 'double' ; coteConvexe = 'droit' | 'gauche' pour la courbe thoracique. Renvoie, pour chaque vertèbre, décalage latéral (m) et inclinaison (°). */
export function scoliose(vertebres, { cobb = 30, type = 'thoracique', coteConvexe = 'droit' } = {}) {
  const ys = vertebres.map(v => v.centre[1]), n = ys.length, sg = coteConvexe === 'droit' ? 1 : -1;
  const yT = ys[Math.min(7, n - 1)], yL = ys[Math.min(13, n - 1)];                       // sommets : T8 et L2
  const courbes = type === 'lombaire' ? [{ y0: yL, s: 0.06, signe: -sg, amp: 1 }] : type === 'double' ? [{ y0: yT, s: 0.08, signe: sg, amp: 1 }, { y0: yL, s: 0.06, signe: -sg, amp: 0.8 }] : [{ y0: yT, s: 0.08, signe: sg, amp: 1 }];
  const mesure = A => { const cs = courbes.map(c => ({ ...c, amp: c.amp * A })); const incl = inclinaisons(ys, cs, 1); return { cs, incl }; };
  // plage de la courbe principale : jusqu'au point d'inflexion pour une double courbe
  const milieu = (yT + yL) / 2, iInf = ys.reduce((b, y, i) => (Math.abs(y - milieu) < Math.abs(ys[b] - milieu) ? i : b), 0);
  const plage = type === 'double' ? [0, iInf] : [0, n - 1];
  let lo = 0, hi = 3; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2, { incl } = mesure(mid); if (cobbSur(incl, plage[0], plage[1]) < cobb) lo = mid; else hi = mid; }
  const { cs, incl } = mesure((lo + hi) / 2);
  const decal = ys.map(y => cs.reduce((s, c) => s + c.signe * c.amp * gauss(y, c.y0, c.s), 0));
  const rot = incl.map(t => 0.3 * t * (sg));                                                  // rotation axiale simplifiée (≈ 0,3 × inclinaison, vers la convexité)
  return { decalage: decal, inclinaison: incl, rotation: rot, cobbMesure: cobbSur(incl, plage[0], plage[1]), cobbSecondaire: type === 'double' ? cobbSur(incl, plage[1], n - 1) : null, plage, sommets: type === 'double' ? ['T8', 'L2'] : type === 'lombaire' ? ['L2'] : ['T8'] };
}
/* Cyphose thoracique : angle de Cobb sagittal visé (repère classique : normal 20 à 40°, hypercyphose > 45°). Renvoie inclinaisons dans le plan sagittal. */
export function cyphose(vertebres, { cobb = 60 } = {}) {
  const ys = vertebres.map(v => v.centre[1]), yA = ys[Math.min(6, ys.length - 1)];
  const mesure = A => inclinaisons(ys, [{ y0: yA, s: 0.1, signe: 1, amp: A }], 1);
  const plage = [0, Math.min(11, ys.length - 1)];
  let lo = 0, hi = 3; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (cobbSur(mesure(mid), plage[0], plage[1]) < cobb) lo = mid; else hi = mid; }
  const incl = mesure((lo + hi) / 2), decal = ys.map(y => (lo + hi) / 2 * gauss(y, yA, 0.1));
  return { decalage: decal, inclinaison: incl, cobbMesure: cobbSur(incl, plage[0], plage[1]), plage };
}

/* ── amputations ── */
const AVERT = AVERTISSEMENT;
const am = (id, nom, membre, coupe, description, moignon, appareillage, points) => ({ id, nom, membre, coupe, description, moignon, appareillage, points, categorie: 'amputation', confiance: 'élevée', avertissement: AVERT });
/* coupe : { segment, f } = plan perpendiculaire à l'axe du segment à la fraction f ; { desarticulation: segment à cacher avec tout ce qui est distal } ; { pieds: 'lisfranc' | 'chopart' | 'transmetatarsienne' } */
export const AMPUTATIONS = [
  am('transmetatarsienne', 'Amputation transmétatarsienne', 'inférieur', { pied: 'transmetatarsienne' }, 'Section au milieu des métatarsiens : l’avant-pied est enlevé, l’arrière-pied et la cheville sont conservés.', 'Moignon d’appui plantaire, cheville mobile conservée.', 'Prothèse d’avant-pied (semelle compensée avec remplissage et lame de renfort) ou chaussure orthopédique avec complément d’avant-pied ; l’appui terminal est possible.', 'Surveiller les points d’appui, la déviation en équin, le risque cutané (diabète).'),
  am('lisfranc', 'Désarticulation de Lisfranc (tarso-métatarsienne)', 'inférieur', { pied: 'lisfranc' }, 'Désarticulation entre le tarse et les métatarsiens.', 'Moignon d’appui plantaire sur le tarse ; risque d’équin et de varus par déséquilibre des muscles restants (le tibial antérieur et les fibulaires perdent leurs insertions).', 'Prothèse d’avant-pied ou chaussure orthopédique avec orthèse suro-pédieuse de maintien ; une plaque en carbone rigidifie la marche.', 'Rééquilibrage des tendons ; la rétraction du triceps sural est à prévenir.'),
  am('chopart', 'Désarticulation de Chopart (médio-tarsienne)', 'inférieur', { pied: 'chopart' }, 'Désarticulation entre le talus et le calcanéus d’une part et le naviculaire et le cuboïde d’autre part.', 'Il reste le talus et le calcanéus ; fort risque d’équin du talon.', 'Prothèse de Chopart (emboîture jambière avec appui sur le talon et semelle de remplissage) ; un pied prothétique de hauteur limitée est parfois nécessaire.', 'Risque d’équin et de varus ; le chirurgien allonge souvent le tendon calcanéen.'),
  am('syme', 'Amputation de Syme', 'inférieur', { desarticulation: 'pied' }, 'Désarticulation de la cheville avec conservation du coussinet talonnier : le pied est enlevé, la malléole est taillée.', 'Moignon long, appui terminal possible grâce au coussinet talonnier.', 'Prothèse de Syme : emboîture souvent avec fenêtre ou en deux parties pour passer le bulbe distal, pied à restitution d’énergie à profil bas (hauteur disponible faible).', 'Le moignon est bulbeux, ce qui complique l’enfilage ; le profil bas limite le choix du pied.'),
  am('transtibiale', 'Amputation transtibiale (tibiale)', 'inférieur', { segment: 'jambe', f: 0.4 }, 'Section du tibia et de la fibula, en général au tiers moyen ; le genou est conservé.', 'Longueur idéale classique : environ 12 à 15 cm sous l’interligne du genou, avec un moignon musculaire fermé par myoplastie ou myodèse.', 'Emboîture à appui rotulien et tendineux (PTB) ou tibiale à suspension supra-condylienne (TSB), manchon silicone avec broche ou système à dépression, pylône, pied à restitution d’énergie en carbone.', 'Points sensibles : crête tibiale, tête fibulaire, extrémité distale ; le genou doit rester libre de flexum.'),
  am('desarticulation_genou', 'Désarticulation du genou', 'inférieur', { desarticulation: 'jambe' }, 'Désarticulation entre le fémur et le tibia : les condyles fémoraux sont conservés.', 'Moignon long, appui terminal possible ; la longueur du fémur résiduel crée une différence de hauteur du genou prothétique.', 'Emboîture fémorale avec genou prothétique à axes déportés (policentrique), pied à restitution d’énergie ; la prothèse est un peu plus longue au genou.', 'Genou prothétique plus bas du côté prothèse en position assise.'),
  am('transfemorale', 'Amputation transfémorale (fémorale)', 'inférieur', { segment: 'cuisse', f: 0.5 }, 'Section du fémur, en général au tiers moyen ; le genou est perdu.', 'Longueur classique : le moignon doit laisser de la place au genou prothétique (environ 10 cm au-dessus de l’interligne).', 'Emboîture ischiatique (ischion contenu, de type CAT-CAM ou MAS) ou à contact total, genou prothétique mécanique ou à microprocesseur, pylône, pied à restitution d’énergie ; suspension par succion, manchon ou ceinture.', 'Myodèse des adducteurs pour garder un moignon fonctionnel ; la rotation externe et la flexion de hanche sont des risques.'),
  am('desarticulation_hanche', 'Désarticulation de hanche', 'inférieur', { desarticulation: 'cuisse' }, 'Désarticulation de la hanche : tout le membre inférieur est enlevé, le bassin est conservé.', 'Aucun moignon osseux libre : l’appui se fait sur le bassin (ischion et fesse).', 'Prothèse de désarticulation de hanche (corbeille pelvienne) avec articulation de hanche prothétique, genou et pied ; la flexion de la hanche prothétique commande la marche.', 'Stabilité du bassin et équilibre en position assise difficiles ; surveiller la peau et la corbeille.'),
  am('hemipelvectomie', 'Hémipelvectomie', 'inférieur', { desarticulation: 'cuisse', os: ['hip bone'] }, 'Ablation du membre inférieur avec la moitié du bassin du même côté.', 'Aucun moignon osseux ; l’appui se fait sur les tissus mous du bassin restant.', 'Prothèse d’hémipelvectomie : corbeille avec appui sur les tissus mous et le bassin restant, hanche, genou et pied prothétiques.', 'L’équilibre et le confort en position assise sont difficiles ; appareillage rare et très personnalisé.'),
  am('desarticulation_poignet', 'Désarticulation du poignet', 'supérieur', { desarticulation: 'main' }, 'Désarticulation radio-carpienne : la main est enlevée, le radius et l’ulna gardent leur longueur.', 'Moignon long avec conservation de la prono-supination.', 'Prothèse esthétique ou myoélectrique avec emboîture de désarticulation, main électrique ou crochet ; la place pour le poignet prothétique est réduite.', 'Prono-supination conservée : l’emboîture doit la respecter ; peu d’espace pour la motorisation.'),
  am('transradiale', 'Amputation transradiale (avant-bras)', 'supérieur', { segment: 'avantbras', f: 0.45 }, 'Section du radius et de l’ulna ; le coude est conservé.', 'Longueur idéale classique : au tiers moyen à distal de l’avant-bras, la longueur conserve une partie de la prono-supination.', 'Prothèse myoélectrique (capteurs sur les muscles fléchisseurs et extenseurs, main motorisée), mécanique (câbles, crochet) ou esthétique ; emboîture à contact total, suspension supracondylienne ou succion.', 'Choix selon l’activité de la personne ; le niveau de la section conditionne la place pour le poignet.'),
  am('desarticulation_coude', 'Désarticulation du coude', 'supérieur', { desarticulation: 'avantbras' }, 'Désarticulation de l’articulation du coude : l’humérus est entier, l’avant-bras est enlevé.', 'Moignon long avec condyles huméraux conservés (rotation du bras conservée).', 'Prothèse avec coude à charnières externes, avant-bras, main ou crochet ; l’emboîture se suspend sur les épicondyles.', 'L’articulation du coude prothétique prend de la place : la prothèse est un peu plus longue au coude.'),
  am('transhumerale', 'Amputation transhumérale (bras)', 'supérieur', { segment: 'bras', f: 0.5 }, 'Section de l’humérus ; le coude est perdu.', 'Longueur classique : au tiers moyen ; l’épaule reste mobile.', 'Prothèse avec coude mécanique ou motorisé, avant-bras, main ou crochet ; emboîture humérale avec suspension par harnais ou succion, commande par câbles, interrupteurs ou myoélectrique.', 'Le moignon court perd en bras de levier ; l’emboîture doit respecter l’épaule.'),
  am('desarticulation_epaule', 'Désarticulation de l’épaule', 'supérieur', { desarticulation: 'bras' }, 'Désarticulation gléno-humérale : tout le membre supérieur est enlevé, la scapula et la clavicule sont conservées.', 'Aucun moignon humérus ; le contour de l’épaule est perdu.', 'Prothèse d’épaule avec emboîture thoracique, épaule, coude et main prothétiques ; souvent esthétique ou hybride.', 'Les fonctions sont limitées ; la commande utilise les mouvements de la scapula et du thorax.'),
  am('interscapulothoracique', 'Amputation inter-scapulo-thoracique', 'supérieur', { desarticulation: 'bras', os: ['scapula', 'clavicle'] }, 'Ablation du membre supérieur avec la scapula et la clavicule.', 'Aucun appui osseux à l’épaule.', 'Prothèse esthétique avec coque thoracique (épaulette de remplissage) ; une prothèse active est rare.', 'Appareillage rare ; l’équilibre du tronc et la symétrie de la silhouette sont les enjeux.')
];

/* ── déficiences congénitales (ISO 8548-1 : transversale = absence terminale ; longitudinale = absence d'un os dans l'axe du membre) ── */
const de = (id, nom, type, cacher, description, signes, prise, points) => ({ id, nom, type, cacher, description, signes, prise, points, categorie: 'déficience congénitale', confiance: 'générique', avertissement: AVERT });
export const DEFICIENCES = [
  de('radius_absent', 'Déficience longitudinale radiale (aplasie du radius, main botte radiale)', 'longitudinale', [{ os: 'radius', cote: 'droit' }], 'Absence ou hypoplasie du radius : l’avant-bras est court, la main dévie du côté du pouce.', 'Main botte radiale, pouce absent ou hypoplasique, coude parfois raide.', 'Prise en charge pluridisciplinaire : orthèse nocturne, chirurgie de centralisation ou de radialisation, appareillage ; durée adaptée à la croissance.', 'Associée à des syndromes (TAR, Fanconi, VACTERL) : bilan général nécessaire.'),
  de('ulna_absent', 'Déficience longitudinale ulnaire (aplasie de l’ulna)', 'longitudinale', [{ os: 'ulna', cote: 'droit' }], 'Absence ou hypoplasie de l’ulna : le radius porte l’avant-bras, la main dévie du côté ulnaire.', 'Absence de rayons ulnaires (auriculaire, annulaire), coude parfois instable.', 'Chirurgie sélective, orthèses, appareillage selon le niveau ; suivi pendant la croissance.', 'Moins fréquente que la déficience radiale ; pas toujours associée à un syndrome.'),
  de('fibula_absente', 'Hémimélie fibulaire (aplasie de la fibula)', 'longitudinale', [{ os: 'fibula', cote: 'droit' }], 'Absence ou hypoplasie de la fibula : la jambe est courte, le pied est en valgus, le tibia est incurvé.', 'Raccourcissement du membre, pied en équin valgus avec rayons absents, instabilité du genou.', 'Choix entre allongement progressif du membre et amputation de type Syme avec appareillage précoce, selon l’inégalité prévue ; orthèse jusqu’à la décision.', 'La décision dépend de l’inégalité de longueur projetée et de la fonction du pied.'),
  de('tibia_absent', 'Hémimélie tibiale (aplasie du tibia)', 'longitudinale', [{ os: 'tibia', cote: 'droit' }], 'Absence ou hypoplasie du tibia : la jambe repose sur la fibula, le pied est en varus.', 'Jambe courte et incurvée, pied en varus, genou instable selon le type.', 'Chirurgie de centralisation de la fibula ou désarticulation du genou avec appareillage précoce selon le type ; prothèse évolutive avec la croissance.', 'La classification des types oriente la stratégie ; suivi orthopédique et prothétique long.'),
  de('deficience_femorale', 'Déficience fémorale focale proximale', 'longitudinale', [{ os: 'femur', cote: 'droit', f: 0.55, cote_coupe: 'proximal' }], 'Hypoplasie du fémur proximal (parfois absence de la tête et du col) : le membre est court avec une hanche instable.', 'Fort raccourcissement du fémur, hanche et genou instables, parfois fibula absente.', 'Prothèse d’allongement (prothèse « de tabouret » puis pied en équin), allongement, arthrodèse du genou avec rotationplastie ou prothèse selon le projet de vie.', 'Appareillage précoce pour la verticalisation ; plusieurs stratégies chirurgicales, décision pluridisciplinaire.'),
  de('avant_bras_terminal', 'Déficience transversale de l’avant-bras (absence terminale)', 'transversale', [{ segment: 'mainD' }], 'Absence terminale de la main au niveau du poignet : moignon d’avant-bras de forme arrondie.', 'Avant-bras terminé en moignon, parfois avec des petits bourgeons digitaux.', 'Appareillage précoce : prothèse passive pour l’éveil moteur dès les premiers mois, puis prothèse active à mesure que l’enfant grandit.', 'La prothèse change régulièrement avec la croissance de l’enfant.')
];

/* ── attitudes et déformations (poses de l'articulé) : angles anatomiques par articulation ── */
const po = (id, nom, categorie, poses, description, signes, prise, points, mesure) => ({ id, nom, categorie, poses, description, signes, prise, points, mesure, confiance: 'générique', avertissement: AVERT });
export const POSES = [
  po('pied_tombant', 'Pied tombant (steppage)', 'neurologique', { chevilleD: { fl: -35 }, hancheD: { fl: 35 }, genouD: { fl: 40 } }, 'Déficit des releveurs du pied (tibial antérieur, extenseurs) : le pied retombe en flexion plantaire, la marche se fait en levant haut le genou (steppage).', 'Impossible de relever la pointe du pied, la pointe accroche le sol en phase pendulaire.', 'Orthèse releveur de pied (orthèse jambière postérieure en polypropylène ou carbone, releveur dynamique), stimulation électrique fonctionnelle, rééducation ; la cause (nerf fibulaire commun, racine L5) est à rechercher.', 'La cause nerveuse décide de la prise en charge : l’orthèse est une compensation.', 'flexion plantaire de cheville'),
  po('main_tombante', 'Main tombante (paralysie du nerf radial)', 'neurologique', { poignetD: { fl: 55 }, coudeD: { fl: 30 }, epauleD: { fl: 15 } }, 'Paralysie des extenseurs du poignet et des doigts (nerf radial) : le poignet reste fléchi.', 'Impossible d’étendre le poignet et les doigts, la main pend.', 'Orthèse de poignet en extension (orthèse dynamique de Thomas ou orthèse statique de repos), rééducation, chirurgie de transfert de tendons si la récupération échoue.', 'Souvent suite d’une fracture de l’humérus ou d’une compression (« paralysie du samedi soir »).', 'flexion du poignet'),
  po('hemiplegie', 'Attitude de l’hémiplégique spastique (Wernicke-Mann)', 'neurologique', { epauleD: { fl: 0, ab: -10 }, coudeD: { fl: 90 }, poignetD: { fl: 30 }, hancheD: { fl: -10 }, genouD: { fl: 5 }, chevilleD: { fl: -25 } }, 'Après une lésion cérébrale, le membre supérieur se met en flexion (épaule collée au corps, coude et poignet fléchis) et le membre inférieur en extension (genou tendu, pied en équin).', 'Marche en fauchage (le membre inférieur décrit un arc), pied en équin varus, membre supérieur fléchi au corps.', 'Rééducation, toxine botulique, orthèses de repos et de marche (releveur de pied, orthèse suro-pédieuse), chaussage adapté ; chirurgie de l’appareil musculo-tendineux dans certains cas.', 'La spasticité varie dans le temps ; l’appareillage s’adapte à la fonction et au confort.', 'flexion du coude 90°'),
  po('genu_valgum', 'Genu valgum (genoux en X)', 'déformation', { genouD: { ab: 12 }, genouG: { ab: 12 } }, 'Les genoux se rapprochent, les chevilles s’écartent : l’axe de la jambe est dévié vers l’extérieur.', 'Distance inter-malléolaire augmentée, usure du compartiment latéral du genou.', 'Surveillance chez l’enfant (souvent physiologique vers 3 à 6 ans), orthèses ou chirurgie de réaxation (ostéotomie, hémi-épiphysiodèse) selon l’âge et l’angle.', 'Se mesure à l’angle fémoro-tibial (HKA) sur une radiographie en charge.', 'angle fémoro-tibial (HKA)'),
  po('genu_varum', 'Genu varum (genoux arqués)', 'déformation', { genouD: { ab: -12 }, genouG: { ab: -12 } }, 'Les genoux s’écartent, les chevilles se rapprochent : l’axe de la jambe est dévié vers l’intérieur.', 'Distance inter-condylienne augmentée, usure du compartiment médial du genou.', 'Surveillance (physiologique avant 2 ans), semelles et orthèses de décharge, chirurgie de réaxation (ostéotomie tibiale) selon l’âge et l’angle.', 'Se mesure à l’angle fémoro-tibial (HKA) ; la rachitisme et la maladie de Blount sont des causes.', 'angle fémoro-tibial (HKA)'),
  po('pied_bot', 'Pied bot varus équin congénital', 'déformation', { chevilleD: { fl: -35, inv: 25 } }, 'Déformation congénitale associant équin (pointe vers le bas), varus de l’arrière-pied, adduction de l’avant-pied et creux.', 'Pied tourné vers l’intérieur, talon relevé, plante orientée vers l’intérieur.', 'Méthode de Ponseti (plâtres successifs puis ténotomie du tendon calcanéen), puis attelle de Dennis Browne pendant plusieurs années ; chirurgie pour les formes résistantes.', 'Le traitement commence dans les premières semaines de vie ; les récidives sont surveillées jusqu’à la fin de la croissance.', 'équin et varus')
];

/* ── fractures : plan de fracture dans le repère du modèle (au repos), déplacement du fragment distal ── */
const fr = (id, nom, os, cote, plan, deplacement, description, classification, prise, complications) => ({ id, nom, os, cote, plan, deplacement, description, classification, prise, complications, categorie: 'fracture', confiance: 'générique', avertissement: AVERT });
/* plan : f = fraction le long de l'os (0 = extrémité haute / proximale pour un os vertical, 1 = basse) ; incl = inclinaison du plan (° autour de l'axe antéro-postérieur) ; sp = torsion en spirale (°) */
export const FRACTURES = [
  fr('femur_diaphyse', 'Fracture de la diaphyse fémorale', 'femur', 'droit', { f: 0.5, incl: 0 }, { raccourcissement: 0.025, decalage: 0.012, angulation: 12 }, 'Fracture du corps du fémur, souvent après un traumatisme à haute énergie ; le fragment distal est tiré vers le haut par les muscles et se raccourcit.', 'Traits transversal, oblique, spiroïde ou comminutif (classification AO 32).', 'Ostéosynthèse (enclouage centro-médullaire dans l’adulte), traction en attendant ; rééducation puis marche avec appui progressif.', 'Hémorragie importante, embolie graisseuse, retard de consolidation, cal vicieux (rotation).'),
  fr('femur_col', 'Fracture du col du fémur', 'femur', 'droit', { f: 0.07, incl: 40 }, { raccourcissement: 0.012, decalage: 0.006, angulation: 15 }, 'Fracture entre la tête et le massif trochantérien, fréquente chez la personne âgée (ostéoporose) après une chute simple.', 'Classification de Garden (I à IV selon le déplacement) ; Pauwels (inclinaison du trait).', 'Chirurgie rapide : vissage dans les fractures non déplacées, prothèse de hanche (hémi-arthroplastie ou totale) dans les fractures déplacées chez la personne âgée.', 'Nécrose de la tête (vascularisation fragile), pseudarthrose, complications de décubitus.'),
  fr('tibia_diaphyse', 'Fracture de la diaphyse tibiale', 'tibia', 'droit', { f: 0.55, incl: 30 }, { raccourcissement: 0.012, decalage: 0.01, angulation: 10 }, 'Fracture du corps du tibia ; le tibia est sous-cutané en avant, donc souvent ouverte.', 'AO 42 ; classification de Gustilo pour les fractures ouvertes.', 'Enclouage centro-médullaire, fixateur externe pour les fractures ouvertes, plâtre ou botte de marche dans certaines formes ; orthèse de décharge pendant la consolidation.', 'Syndrome de loge, retard de consolidation, infection.'),
  fr('radius_distal', 'Fracture de l’extrémité distale du radius (Pouteau-Colles)', 'radius', 'droit', { f: 0.93, incl: 0 }, { raccourcissement: 0.008, decalage: 0.006, angulation: 20 }, 'Fracture du radius à environ 2 à 3 cm du poignet après une chute sur la paume : le fragment distal bascule en arrière (déformation en « dos de fourchette »).', 'Classification AO 23 ; Frykman, Castaing (anciennes).', 'Réduction puis immobilisation par plâtre ou résine, ou ostéosynthèse par plaque palmaire ; orthèse amovible après consolidation.', 'Algodystrophie, déplacement secondaire, atteinte du nerf médian (canal carpien).'),
  fr('clavicule_moyenne', 'Fracture de la clavicule (tiers moyen)', 'clavicle', 'droit', { f: 0.5, incl: 25, horizontal: true }, { raccourcissement: 0.015, decalage: 0.012, angulation: 12 }, 'Fracture du tiers moyen de la clavicule, la plus fréquente de la clavicule : le fragment latéral descend avec le poids du bras et se raccourcit.', 'Classification d’Allman (tiers) et de Robinson.', 'Écharpe ou bandage en huit pour le confort ; chirurgie par plaque en cas de déplacement important ; reprise progressive des mouvements.', 'Pseudarthrose, raccourcissement, atteinte rare du plexus brachial.')
];

export const PATHOLOGIES = [
  { id: 'scoliose', nom: 'Scoliose', categorie: 'déformation du rachis', confiance: 'élevée', parametre: { nom: 'angle de Cobb', unite: '°', min: 10, max: 70, defaut: 30 },
    description: 'Déformation du rachis dans les trois plans : courbure latérale avec rotation des vertèbres. Elle se définit par un angle de Cobb supérieur à 10° sur une radiographie de face debout.',
    signes: 'Gibbosité (bosse côtale à l’antéflexion), asymétrie des épaules et de la taille ; la scoliose idiopathique de l’adolescent est la plus fréquente.',
    prise: 'Surveillance sous 20°, corset (orthèse thoraco-lombo-sacrée) entre environ 20 et 40° pendant la croissance, chirurgie (arthrodèse) au-delà d’environ 45 à 50° ; kinésithérapie spécifique en complément.',
    points: 'La mesure de Cobb : on trace la tangente au plateau supérieur de la vertèbre limite supérieure et au plateau inférieur de la vertèbre limite inférieure ; l’angle entre les perpendiculaires est l’angle de Cobb. Le risque d’aggravation dépend de l’âge osseux (test de Risser).', avertissement: AVERT },
  { id: 'cyphose', nom: 'Hypercyphose thoracique', categorie: 'déformation du rachis', confiance: 'élevée', parametre: { nom: 'angle de Cobb sagittal', unite: '°', min: 30, max: 90, defaut: 60 },
    description: 'Exagération de la courbure à convexité postérieure du rachis thoracique ; le repère classique est de 20 à 40° à l’état normal.',
    signes: 'Dos rond, épaules vers l’avant ; maladie de Scheuermann chez l’adolescent, ostéoporose et tassements vertébraux chez la personne âgée.',
    prise: 'Kinésithérapie, corset (de Milwaukee ou orthèse thoraco-lombaire d’extension) pendant la croissance, chirurgie des déformations sévères ; traitement de l’ostéoporose.',
    points: 'Se mesure sur le profil radiographique entre le plateau supérieur de T4 et le plateau inférieur de T12 (repère classique).', avertissement: AVERT },
  ...AMPUTATIONS, ...DEFICIENCES, ...POSES, ...FRACTURES
];
export const trouverPathologie = texte => {
  const n = String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'-]/g, ' ').replace(/\s+/g, ' ');
  const ALIAS = { scoliose: ['scoliose'], cyphose: ['cyphose', 'hypercyphose', 'dos rond'], pied_tombant: ['pied tombant', 'steppage'], main_tombante: ['main tombante', 'paralysie du nerf radial'], hemiplegie: ['hemiplegie', 'hemiplegique', 'wernicke'], genu_valgum: ['genu valgum', 'genoux en x', 'valgum'], genu_varum: ['genu varum', 'genoux arques', 'varum'], pied_bot: ['pied bot', 'varus equin', 'pied bot varus equin'],
    transmetatarsienne: ['transmetatarsienne', 'transmetatarsien'], lisfranc: ['lisfranc'], chopart: ['chopart'], syme: ['syme'], transtibiale: ['transtibiale', 'amputation tibiale', 'sous le genou', 'amputation sous le genou'], desarticulation_genou: ['desarticulation du genou', 'desarticulation de genou'], transfemorale: ['transfemorale', 'amputation femorale', 'au dessus du genou', 'amputation au dessus du genou'], desarticulation_hanche: ['desarticulation de hanche', 'desarticulation de la hanche'], hemipelvectomie: ['hemipelvectomie'],
    desarticulation_poignet: ['desarticulation du poignet', 'desarticulation de poignet'], transradiale: ['transradiale', 'amputation de l avant bras', 'amputation avant bras'], desarticulation_coude: ['desarticulation du coude', 'desarticulation de coude'], transhumerale: ['transhumerale', 'amputation du bras', 'amputation humerale'], desarticulation_epaule: ['desarticulation de l epaule', 'desarticulation d epaule'], interscapulothoracique: ['interscapulo thoracique', 'inter scapulo thoracique'],
    radius_absent: ['aplasie du radius', 'main botte radiale', 'deficience radiale', 'agenesie du radius'], ulna_absent: ['aplasie de l ulna', 'deficience ulnaire', 'agenesie de l ulna'], fibula_absente: ['hemimelie fibulaire', 'aplasie de la fibula', 'agenesie de la fibula'], tibia_absent: ['hemimelie tibiale', 'aplasie du tibia', 'agenesie du tibia'], deficience_femorale: ['deficience femorale', 'pffd', 'deficience femorale focale proximale'], avant_bras_terminal: ['deficience transversale', 'absence terminale', 'agenesie de la main'],
    femur_diaphyse: ['fracture du femur', 'fracture de la diaphyse femorale', 'fracture diaphysaire du femur'], femur_col: ['fracture du col du femur', 'col du femur'], tibia_diaphyse: ['fracture du tibia', 'fracture de la jambe'], radius_distal: ['pouteau colles', 'fracture du poignet', 'fracture du radius', 'fracture de l extremite distale du radius'], clavicule_moyenne: ['fracture de la clavicule', 'fracture clavicule'] };
  let m = null, t = 0; for (const p of PATHOLOGIES) for (const a of [p.nom, ...(ALIAS[p.id] || [])]) { const k = norm(a); if ((n === k || n.includes(k)) && k.length > t) { m = p; t = k.length; } }
  return m;
};
/* Phrase parlée par Raylé */
export function descriptionParleePatho(p, mesure = null) {
  const parts = [p.nom + '.', p.description];
  if (mesure) parts.push(mesure);
  if (p.moignon) parts.push('Moignon : ' + p.moignon);
  if (p.appareillage) parts.push('Appareillage : ' + p.appareillage);
  if (p.signes) parts.push('Signes : ' + p.signes);
  if (p.prise) parts.push('Prise en charge : ' + p.prise);
  if (p.complications) parts.push('Complications : ' + p.complications);
  if (p.classification) parts.push('Classification : ' + p.classification);
  if (p.points) parts.push('À retenir : ' + p.points);
  parts.push(AVERTISSEMENT);
  return parts.join(' ');
}
export const DEG = D;

/* ═════════ classement des pièces pour les amputations, déficiences et fractures (indépendant de three.js) ═════════ */
import { HIERARCHIE as _H, ARTICULATION as _A } from './anatomie-mouvement-calcul.js';
const CHAINES = { 'inférieur': ['cuisse', 'jambe', 'pied'], 'supérieur': ['bras', 'avantbras', 'main'] };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => Math.hypot(a[0], a[1], a[2]);
const coins = b => { const o = []; for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const z of [b[0][2], b[1][2]]) o.push([x, y, z]); return o; };
/* Étendue d'une pièce le long de n à partir de q : [min, max] des projections des 8 coins de ses bornes */
export function etendue(bornes, n, q) { let mn = 1e9, mx = -1e9; for (const c of coins(bornes)) { const s = dot(sub(c, q), n); mn = Math.min(mn, s); mx = Math.max(mx, s); } return [mn, mx]; }
const sansCoteNom = sansCote;
export function classerAmputation(index, rig, amp, cote = 'droit') {
  const S = cote === 'droit' ? 'D' : 'G', chaine = CHAINES[amp.membre].map(x => x + S), rang = id => chaine.indexOf(rig.segmentDe[id]);
  const cacher = new Set(), clip = []; let longueurCm = null, plan = null; const c = amp.coupe, a = rig.ant;
  const tester = (p, n, q) => { const [mn, mx] = etendue(p.bornes, n, q); if (mn >= -1e-9) cacher.add(p.id); else if (mx > 1e-9) clip.push({ id: p.id, n, q }); };
  if (c.desarticulation) {
    const k = chaine.indexOf(c.desarticulation + S); for (const p of index.pieces) if (p.bornes && rang(p.id) >= k && rang(p.id) >= 0) cacher.add(p.id);
    for (const nom of c.os || []) for (const p of index.pieces) if (p.systeme === 'os' && sansCoteNom(p.nom_en) === nom && p.cote === cote) cacher.add(p.id);
  } else if (c.segment) {
    const k = chaine.indexOf(c.segment + S), prox = rig.pivots[_A[chaine[k]]], dist = rig.pivots[_A[chaine[k + 1]]], v = sub(dist, prox), L = nrm(v), n = v.map(x => x / L);
    const q = [prox[0] + c.f * v[0], prox[1] + c.f * v[1], prox[2] + c.f * v[2]]; plan = { n, q }; longueurCm = c.f * L * 100;
    for (const p of index.pieces) { if (!p.bornes) continue; const r = rang(p.id); if (r < 0) continue; if (r > k) cacher.add(p.id); else tester(p, n, q); }
  } else if (c.pied) {
    const pieds = index.pieces.filter(p => p.bornes && rig.segmentDe[p.id] === 'pied' + S), os = pieds.filter(p => p.systeme === 'os');
    const nomOs = p => sansCoteNom(p.nom_en), z = p => index.centre(p)[2];
    const gardes = c.pied === 'chopart' ? os.filter(p => /calcaneus|talus/.test(nomOs(p))) : c.pied === 'lisfranc' ? os.filter(p => /calcaneus|talus|navicular|cuboid|cuneiform/.test(nomOs(p))) : os.filter(p => !/phalanx|sesamoid/.test(nomOs(p)));
    const zc = c.pied === 'transmetatarsienne' ? os.filter(p => /metatarsal/.test(nomOs(p))).reduce((s, p, _, t) => s + z(p) / t.length, 0) : (a > 0 ? Math.max(...gardes.map(p => p.bornes[1][2])) : Math.min(...gardes.map(p => p.bornes[0][2])));
    const n = [0, 0, a], q = [0, 0, zc]; plan = { n, q };
    for (const p of pieds) { if (p.systeme === 'os' && !gardes.includes(p) && !(c.pied === 'transmetatarsienne' && /metatarsal/.test(nomOs(p)))) { cacher.add(p.id); continue; } tester(p, n, q); }
    for (const p of index.pieces) if (p.bornes && p.systeme !== 'os' && rig.segmentDe[p.id] === 'pied' + S) { /* déjà traité */ }
  }
  return { cacher: [...cacher], clip, longueurCm, plan };
}
export function classerDeficience(index, rig, def) {
  const cacher = new Set(), clip = [];
  for (const e of def.cacher) {
    if (e.segment) { for (const p of index.pieces) if (p.bornes && rig.segmentDe[p.id] === e.segment) cacher.add(p.id); continue; }
    for (const p of index.pieces) if (p.systeme === 'os' && p.bornes && sansCoteNom(p.nom_en) === e.os && (!e.cote || p.cote === e.cote)) {
      if (e.f === undefined) cacher.add(p.id); else { const b = p.bornes, y = b[1][1] - e.f * (b[1][1] - b[0][1]); clip.push({ id: p.id, n: [0, 1, 0], q: [0, y, 0] }); }
    }
  }
  return { cacher: [...cacher], clip };
}
/* Plan et déplacement d'une fracture : { id, c (centre), n (normale du plan), ax (axe de l'os, du proximal au distal), lat, deplacement } */
export function planFracture(index, rig, fx) {
  const p = index.pieces.find(x => x.systeme === 'os' && sansCoteNom(x.nom_en) === fx.os && x.cote === fx.cote); if (!p) return null;
  const b = p.bornes, cc = index.centre(p), l = rig.cote[fx.cote], I = (fx.plan.incl || 0) * D;
  const horizontal = !!fx.plan.horizontal;
  const ax = horizontal ? [l, 0, 0] : [0, -1, 0], haut = horizontal ? Math.abs(b[1][0] - b[0][0]) : b[1][1] - b[0][1];
  const c = horizontal ? [(l > 0 ? b[0][0] : b[1][0]) + l * fx.plan.f * haut, cc[1], cc[2]] : [cc[0], b[1][1] - fx.plan.f * haut, cc[2]];
  const perp = horizontal ? [0, 1, 0] : [l, 0, 0], n = ax.map((x, i) => x * Math.cos(I) + perp[i] * Math.sin(I));
  return { id: p.id, c, n, ax, perp, l, horizontal, deplacement: fx.deplacement, taille: haut };
}
