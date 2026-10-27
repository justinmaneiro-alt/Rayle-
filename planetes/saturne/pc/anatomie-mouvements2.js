import { DEG, lisse, ease, pic, lerp } from './anatomie-mat4.js';

/* ═════════════ ANATOMIE : BIBLIOTHÈQUE DE MOUVEMENTS V2 (module pur, Phase C) ═════════════
   Chaque mouvement est une fonction pose(p, ctx) → pose pour le moteur de cinématique (anatomie-cinematique.js), avec p dans [0, 1) (un cycle, la dernière image rejoint la première).
   Les pieds posés sont placés par cinématique inverse (pas de glissement), le bassin est abaissé ou translaté pour que le centre de gravité reste au-dessus de la base d'appui.
   ctx = { corps, a (avant), cR (côté droit), lat(S), centrePied(S), centreDeux() } fourni par le moteur.
   Les angles sont des valeurs de RÉFÉRENCE classiques (goniométrie, analyse du mouvement), simplifiées et À VÉRIFIER avec le cours / un atlas. Rien ne vient d'une capture de mouvement. */
const S2 = ['D', 'G'], pieds = (o = {}) => ({ D: { ...o }, G: { ...o } });
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = (x, a, b) => lisse((x - a) / (b - a));                           // 0 avant a, 1 après b, lissé
const autre = S => (S === 'D' ? 'G' : 'D');
/* Spline cubique de Hermite PÉRIODIQUE (tangentes de Catmull-Rom) à travers des instants clés [[t, valeur], …], t croissants dans [0, 1) ; la valeur en t = 1 est celle en t = 0 :
   le geste se referme sans saut, avec des vitesses continues (animation fluide, sans arrêts brusques aux instants clés). */
export function spline(p, cles) {
  const n = cles.length, t = ((p % 1) + 1) % 1; let i = n - 1;
  for (let k = 0; k < n; k++) if (cles[k][0] > t) { i = k - 1; break; }
  const get = k => { const m = ((k % n) + n) % n; return [cles[m][0] + Math.floor(k / n), cles[m][1]]; };
  const [t0, v0] = get(i), [t1, v1] = get(i + 1), [tm, vm] = get(i - 1), [t2, v2] = get(i + 2);
  const m0 = (v1 - vm) / (t1 - tm), m1 = (v2 - v0) / (t2 - t0), h = t1 - t0, tt = (t < t0 ? t + 1 : t) - t0, s = tt / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
}
const both = (f) => ({ D: f('D'), G: f('G') });

/* ── marche et course : générateur d'allure (pieds posés sur un sol qui défile, sans glissement) ── */
function allure(p, ctx, o) {
  const a = ctx.a, { rho, pas, haut, vol, pitchDebut, penche, brasAmp, coudeBase, coudeAmp, largeur = 0.0 } = o, phi = p, TAU = 2 * Math.PI;
  const pied = {}, joints = {};
  for (const S of S2) {
    const psi = (phi + (S === 'D' ? 0 : 0.5)) % 1, appui = psi < rho, lt = ctx.lat(S);
    let dz, dy = 0, talon = 0, attaque = 0, cheville, melange;
    if (appui) { const u = psi / rho; dz = pas / 2 - pas * u; talon = 40 * sm(u, 0.62, 1); attaque = pitchDebut * (1 - sm(u, 0, 0.18)); }
    else {
      const w = (psi - rho) / (1 - rho); dz = -pas / 2 + pas * lisse(w); dy = haut * Math.sin(Math.PI * w) + vol.hauteur(phi);
      talon = 40 * (1 - sm(w, 0, 0.3)); attaque = pitchDebut * sm(w, 0.8, 1);             // continuité avec la fin de l'appui (talon levé) et le début du suivant (attaque du talon)
      cheville = -20 * (1 - sm(w, 0, 0.45)) + 6 * sm(w, 0.65, 1);                        // le pied pend (orteils vers le bas au décollement), puis se relève avant l'attaque du talon
      melange = sm(w, 0.82, 1) + sm(0.12 - w, 0, 0.12);                                   // retrouve l'orientation à plat juste avant et juste après le contact
    }
    pied[S] = { dz: a * dz, dy, dx: lt * largeur, talon, attaque, cheville, melange: cl(melange === undefined ? 0 : melange), appui };
  }
  const c = Math.cos(TAU * phi), s = Math.sin(TAU * phi);
  for (const S of S2) { const sg = S === 'D' ? 1 : -1; joints['epaule' + S] = { fl: -brasAmp * c * sg + 4, ab: 6 }; joints['coude' + S] = { fl: coudeBase + coudeAmp * (1 + (S === 'D' ? -c : c)) / 2 }; }
  joints.lombaire = { fl: penche * 0.6, rot: -3.5 * c }; joints.tronc = { fl: penche * 0.4, rot: -5 * c, ab: 0 }; joints.tete = { rot: 3 * c, fl: -penche * 0.5 };
  return { pied, joints, pelvis: { dx: ctx.cR * 0.022 * s, dy: vol.hauteur(phi), rot: 4.5 * c, ab: ctx.cR * 2.5 * s, fl: penche * 0.35 }, equilibre: false };
}
const volNul = { hauteur: () => 0 };
function volCourse(rho, h) { return { hauteur: phi => { const w1 = (phi - rho) / (0.5 - rho), w2 = (phi - 0.5 - rho) / (0.5 - rho); const b = w1 >= 0 && w1 <= 1 ? Math.sin(Math.PI * w1) : w2 >= 0 && w2 <= 1 ? Math.sin(Math.PI * w2) : 0; return h * b; } }; }

/* ── appui unipodal : le poids passe sur la jambe gauche (w), puis la jambe droite se lève (l) ; le pied droit compte dans la base d'appui tant qu'il est au sol ── */
function unipodal(ctx, s, f) {
  const w = sm(s, 0, 0.3), l = sm(s, 0.25, 0.9), r = f(l, w);
  return { pied: { G: {}, D: { ik: false, appui: l < 0.002 } }, equilibre: { mode: 'centre', cible: lerp(ctx.centreDeux(), ctx.centrePied('G'), w) }, ...r };
}

/* ── pose assise sur une chaise (hanche à hauteur du genou, cuisse horizontale, tibia vertical) ── */
function assis(ctx, S = 'G', creux = 0, beta = 0) {
  const { corps, a } = ctx, ch = corps.pivots['cheville' + S], h0 = corps.pivots['hanche' + S], L1 = corps.jambes[S].L1, L2 = corps.jambes[S].L2, B = beta * DEG;      // beta : inclinaison du tibia (pieds ramenés sous la chaise)
  const hy = ch[1] + L2 * Math.cos(B) * 0.97, hz = ch[2] - a * (L1 * 0.97 - L2 * Math.sin(B)) + a * creux;
  return { dy: hy - h0[1], dz: hz - h0[2] };
}

export const MOUVEMENTS2 = [
  /* ───────────── marche, course ───────────── */
  { id: 'marche', nom: 'Marche', categorie: 'Locomotion', alias: ['marche', 'marcher', 'la marche', 'cycle de marche', 'locomotion'], duree: 2.8, type: 'dynamique', plan: 'sagittal', articulation: 'hanches, genoux, chevilles, épaules, coudes et rachis (bras opposés aux jambes)',
    pose: (p, ctx) => allure(p, ctx, { rho: 0.62, pas: 0.62, haut: 0.065, vol: volNul, pitchDebut: 12, penche: 3, brasAmp: 22, coudeBase: 12, coudeAmp: 16 }),
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'tibialis anterior', 'gastrocnemius', 'soleus', 'iliacus', 'psoas major', 'biceps femoris'], antagonistes: ['semitendinosus', 'semimembranosus', 'fibularis longus'], stabilisateurs: ['gluteus medius', 'gluteus minimus', 'adductor magnus'] },
  { id: 'course', nom: 'Course', categorie: 'Locomotion', alias: ['course', 'courir', 'la course', 'footing', 'je cours'], duree: 1.4, type: 'dynamique', plan: 'sagittal', articulation: 'hanches, genoux, chevilles, épaules, coudes et rachis, avec phase de vol',
    pose: (p, ctx) => allure(p, ctx, { rho: 0.36, pas: 0.95, haut: 0.17, vol: volCourse(0.36, 0.075), pitchDebut: 4, penche: 10, brasAmp: 42, coudeBase: 80, coudeAmp: 22 }),
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'gastrocnemius', 'soleus', 'iliacus', 'psoas major', 'biceps femoris'], antagonistes: ['semitendinosus', 'semimembranosus', 'tibialis anterior'], stabilisateurs: ['gluteus medius', 'gluteus minimus', 'external oblique'] },

  /* ───────────── hanche ───────────── */
  { id: 'flexion_hanche', nom: 'Flexion de hanche', categorie: 'Membre inférieur', alias: ['flexion de hanche', 'flexion de la hanche', 'lever la jambe', 'leve la jambe', 'flexion hanche', 'monter le genou'], duree: 3.4, type: 'appui unipodal', plan: 'sagittal', articulation: 'hanche droite (appui sur la jambe gauche)',
    pose: (p, ctx) => unipodal(ctx, pic(p), (l, w) => ({ joints: { hancheD: { fl: 95 * l }, genouD: { fl: 85 * l } }, pelvis: { ab: ctx.cR * -1.5 * w } })),
    agonistes: ['psoas major', 'iliacus', 'rectus femoris', 'sartorius', 'pectineus'], antagonistes: ['gluteus maximus', 'semitendinosus', 'semimembranosus', 'biceps femoris'], stabilisateurs: ['gluteus medius', 'gluteus minimus', 'external oblique'] },
  { id: 'extension_hanche', nom: 'Extension de hanche', categorie: 'Membre inférieur', alias: ['extension de hanche', 'extension de la hanche', 'jambe en arriere', 'extension hanche'], duree: 3.4, type: 'appui unipodal', plan: 'sagittal', articulation: 'hanche droite (appui sur la jambe gauche)',
    pose: (p, ctx) => unipodal(ctx, pic(p), (l, w) => ({ joints: { hancheD: { fl: -18 * l } }, pelvis: { fl: 4 * l } })),
    agonistes: ['gluteus maximus', 'semitendinosus', 'semimembranosus', 'biceps femoris'], antagonistes: ['psoas major', 'iliacus', 'rectus femoris'], stabilisateurs: ['gluteus medius', 'longissimus thoracis'] },
  { id: 'abduction_hanche', nom: 'Abduction de hanche', categorie: 'Membre inférieur', alias: ['abduction de hanche', 'abduction de la hanche', 'jambe sur le cote', 'ecarter la jambe', 'abduction hanche'], duree: 3.4, type: 'appui unipodal', plan: 'frontal', articulation: 'hanche droite (appui sur la jambe gauche)',
    pose: (p, ctx) => unipodal(ctx, pic(p), (l, w) => ({ joints: { hancheD: { ab: 38 * l }, tronc: { ab: ctx.cR * -3 * l }, lombaire: { ab: ctx.cR * -2 * l } }, pelvis: { ab: ctx.cR * 2 * l } })),
    agonistes: ['gluteus medius', 'gluteus minimus'], antagonistes: ['adductor longus', 'adductor magnus', 'adductor brevis', 'gracilis', 'pectineus'], stabilisateurs: ['gluteus medius', 'external oblique'] },
  { id: 'rotation_hanche', nom: 'Rotation de hanche (assis)', categorie: 'Membre inférieur', alias: ['rotation de hanche', 'rotation de la hanche', 'rotation externe de hanche', 'rotation interne de hanche', 'rotation hanche'], duree: 4, type: 'assis', plan: 'transversal', articulation: 'hanche droite, assis, hanche et genou à 90°',
    pose: (p, ctx) => { const s = Math.sin(2 * Math.PI * p), as = assis(ctx, 'G'); return { pied: { G: { dx: ctx.lat('G') * 0.15 } }, joints: { hancheD: { fl: 90, rot: 30 * s }, genouD: { fl: 90 } }, pelvis: { dy: as.dy, dz: as.dz }, equilibre: false, abaisser: false }; },
    agonistes: ['piriformis', 'obturator internus', 'quadratus femoris', 'gluteus maximus'], antagonistes: ['gluteus minimus', 'gluteus medius', 'adductor longus'], stabilisateurs: ['external oblique'] },

  /* ───────────── genou, cheville ───────────── */
  { id: 'flexion_genou', nom: 'Flexion de genou', categorie: 'Membre inférieur', alias: ['flexion de genou', 'flexion du genou', 'flechir le genou', 'flexion genou', 'plier le genou', 'talon fesse'], duree: 3.4, type: 'appui unipodal', plan: 'sagittal', articulation: 'genou droit (appui sur la jambe gauche)',
    pose: (p, ctx) => unipodal(ctx, pic(p), (l, w) => ({ joints: { genouD: { fl: 125 * l }, hancheD: { fl: 8 * l } } })),
    agonistes: ['semitendinosus', 'semimembranosus', 'biceps femoris', 'gastrocnemius', 'sartorius', 'gracilis'], antagonistes: ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'], stabilisateurs: ['popliteus', 'gluteus medius'] },
  { id: 'extension_genou', nom: 'Extension de genou (assis)', categorie: 'Membre inférieur', alias: ['extension de genou', 'extension du genou', 'tendre la jambe', 'extension genou', 'extension de la jambe'], duree: 3.6, type: 'assis', plan: 'sagittal', articulation: 'genou droit, assis, cuisse horizontale',
    pose: (p, ctx) => { const s = pic(p), as = assis(ctx, 'G'); return { pied: { G: {} }, joints: { hancheD: { fl: 90 }, genouD: { fl: 90 * (1 - s) } }, pelvis: { dy: as.dy, dz: as.dz }, equilibre: false, abaisser: false }; },
    agonistes: ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius'], antagonistes: ['semitendinosus', 'semimembranosus', 'biceps femoris'], stabilisateurs: ['iliacus', 'psoas major'] },
  { id: 'cheville', nom: 'Flexion dorsale et plantaire de la cheville', categorie: 'Membre inférieur', alias: ['flexion de la cheville', 'flexion plantaire', 'dorsiflexion', 'cheville', 'mouvement de la cheville', 'flexion de cheville'], duree: 3.4, type: 'appui unipodal', plan: 'sagittal', articulation: 'cheville droite (jambe droite levée, appui sur la jambe gauche)',
    pose: (p, ctx) => { const c = Math.sin(2 * Math.PI * p), e = sm(Math.min(p, 1 - p), 0, 0.32); return unipodal(ctx, e, (l, w) => ({ joints: { hancheD: { fl: 30 * l }, genouD: { fl: 15 * l }, chevilleD: { fl: (c > 0 ? 18 * c : 40 * c) * l } } })); },
    agonistes: ['tibialis anterior', 'extensor digitorum longus', 'extensor hallucis longus', 'gastrocnemius', 'soleus'], antagonistes: ['fibularis longus', 'tibialis posterior'], stabilisateurs: ['fibularis brevis', 'flexor hallucis longus'] },

  /* ───────────── chaînes fermées : squat, fente, escalier, assis-debout ───────────── */
  { id: 'accroupissement', nom: 'Accroupissement (squat)', categorie: 'Chaîne fermée', alias: ['accroupissement', 'accroupis toi', 'squat', 'faire un squat', 'flexion des jambes', 'flexion des membres inferieurs', 'accroupissement profond'], duree: 4.2, type: 'chaîne fermée', plan: 'sagittal', articulation: 'hanches, genoux et chevilles ensemble, pieds fixes',
    pose: (p, ctx) => {
      const s = ease(pic(p)), a = ctx.a, cR = ctx.cR;
      const pd = S => ({ dx: ctx.lat(S) * 0.045, yaw: (S === 'D' ? 1 : -1) * a * cR * 12 });
      return { pied: { D: pd('D'), G: pd('G') }, pelvis: { dy: -0.255 * s, fl: 46 * s }, joints: { tete: { fl: -22 * s }, epauleD: { fl: 85 * s }, epauleG: { fl: 85 * s }, coudeD: { fl: 10 * s }, coudeG: { fl: 10 * s } }, equilibre: { mode: 'centre' } };
    },
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'adductor magnus', 'soleus'], antagonistes: ['psoas major', 'iliacus', 'tibialis anterior'], stabilisateurs: ['longissimus thoracis', 'iliocostalis lumborum', 'gluteus medius', 'gastrocnemius'] },
  { id: 'fente', nom: 'Fente avant', categorie: 'Chaîne fermée', alias: ['fente', 'fente avant', 'faire une fente', 'fentes'], duree: 4.4, type: 'chaîne fermée', plan: 'sagittal', articulation: 'hanches, genoux et chevilles, pieds fixes (jambe avant : la droite)',
    pose: (p, ctx) => { const s = ease(pic(p)), a = ctx.a, av = 0.36; return { pied: { D: { dz: a * av, appui: true }, G: { dz: -a * av, talon: 32 + 25 * s, appui: true } }, pelvis: { dy: -0.27 * s, fl: 6 }, joints: { tronc: { fl: 2 }, epauleD: { fl: -8 }, epauleG: { fl: -8 } }, equilibre: { mode: 'centre' } }; },
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius', 'adductor magnus'], antagonistes: ['semitendinosus', 'semimembranosus', 'biceps femoris'], stabilisateurs: ['gluteus medius', 'gluteus minimus', 'soleus', 'gastrocnemius', 'external oblique'] },
  { id: 'escalier', nom: 'Montée d’escalier', categorie: 'Chaîne fermée', alias: ['escalier', 'monter un escalier', 'montee d escalier', 'monter les escaliers', 'monter une marche', 'marche d escalier'], duree: 4.6, type: 'chaîne fermée', plan: 'sagittal', articulation: 'hanches, genoux et chevilles, pieds posés tour à tour sur la marche (18 cm)',
    pose: (p, ctx) => {
      /* chronologie (u : 0 → 1 à la montée, puis le cycle redescend à l'envers) : 0,02-0,2 le poids passe sur le pied gauche ; 0,08-0,34 le pied droit monte sur la marche ; 0,36-0,56 le poids passe sur le
         pied droit ; 0,4-0,78 le bassin monte ; 0,6-0,88 le pied gauche rejoint la marche ; 0,8-0,92 le poids se répartit sur les deux pieds. Le poids est TOUJOURS sur le pied qui reste posé. */
      const u = pic(p), a = ctx.a, H = 0.18, D = 0.30, A = cl((u - 0.14) / 0.22), B = cl((u - 0.64) / 0.26);
      const dyD = H * lisse(A) + 0.05 * Math.sin(Math.PI * A), dzD = D * lisse(A), dyG = H * lisse(Math.min(1, B * 1.35)) + 0.08 * Math.sin(Math.PI * B), dzG = D * Math.pow(lisse(B), 1.25);
      const w = sm(u, 0.16, 0.5) * (1 - sm(u, 0.56, 0.86));
      const posD = { dy: dyD, dz: a * dzD, appui: A >= 0.999 || A <= 0.001, cheville: A > 0.001 && A < 0.999 ? 8 : undefined, melange: A > 0.001 && A < 0.999 ? Math.min(sm(A, 0.78, 1), 1) + sm(0.2 - A, 0, 0.2) : undefined };
      const posG = { dy: dyG, dz: a * dzG, talon: 48 * sm(u, 0.3, 0.58) * (1 - sm(B, 0.25, 0.75)), appui: B <= 0.001 || B >= 0.999, cheville: B > 0.001 && B < 0.999 ? 8 : undefined, melange: B > 0.001 && B < 0.999 ? Math.min(sm(B, 0.78, 1), 1) + sm(0.2 - B, 0, 0.2) : undefined };
      /* le poids passe sur le pied posé sur la marche (w1), puis sur les deux pieds de la marche (w2) : cible d'équilibre continue, jamais de saut du bassin */
      const cG = ctx.centrePied('G'), cD = ctx.centrePied('D'), cDs = [cD[0], cD[1] + a * D], cGs = [cG[0], cG[1] + a * D], cm = [(cDs[0] + cGs[0]) / 2, (cDs[1] + cGs[1]) / 2], c0 = ctx.centreDeux();
      const cible = [0, 1].map(k => { const cGav = k === 1 ? cG[1] + a * 0.045 : cG[0], c1 = c0[k] + (cGav - c0[k]) * sm(u, 0, 0.12), c2 = c1 + (cDs[k] - c1) * sm(u, 0.4, 0.62); return c2 + (cm[k] - c2) * sm(u, 0.9, 1); });
      return { pied: { D: posD, G: posG }, pelvis: { dy: H * sm(u, 0.3, 0.58), fl: 22 * Math.sin(Math.PI * cl((u - 0.15) / 0.65)) }, joints: { epauleD: { fl: -10 * w }, epauleG: { fl: 10 * w } }, equilibre: { mode: 'centre', cible } };
    },
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'gastrocnemius', 'soleus'], antagonistes: ['semitendinosus', 'semimembranosus', 'tibialis anterior'], stabilisateurs: ['gluteus medius', 'gluteus minimus', 'adductor magnus', 'external oblique'] },
  { id: 'assis_debout', nom: 'Passage assis-debout', categorie: 'Chaîne fermée', alias: ['assis debout', 'passage assis debout', 'se lever', 'se lever d une chaise', 'lever de chaise', 'passage de l assis au debout', 'se rasseoir'], duree: 5, type: 'chaîne fermée', plan: 'sagittal', articulation: 'hanches, genoux, chevilles et tronc ; chaise de 43 cm',
    pose: (p, ctx) => {
      /* phases : 0 → 0,26 le buste s'incline (les fesses restent sur la chaise, bras en avant) ; 0,26 → 0,85 le bassin décolle et monte ; 0,6 → 1 le tronc se redresse */
      const s = pic(p), a = ctx.a, as = assis(ctx, 'G', 0, 10), lev = sm(s, 0.26, 0.85), pench = sm(s, 0, 0.26) * (1 - sm(s, 0.6, 1)), glisse = 0.1 * sm(s, 0.05, 0.26);
      const pd = {};                                                                      // pieds au repos, tibias inclinés de 10° ; le bassin glisse de 10 cm vers l'avant sur l'assise (buste penché, bras en avant), puis décolle
      return { pied: { D: { ...pd }, G: { ...pd } }, pelvis: { dy: as.dy * (1 - lisse(Math.min(1, lev * 1.4))), dz: (as.dz + a * glisse) * (1 - Math.pow(lev, 1.7)), fl: 30 * pench + 6 * (1 - lev) }, joints: { epauleD: { fl: 75 * pench }, epauleG: { fl: 75 * pench }, tete: { fl: -12 * pench } }, equilibre: s > 0.27 ? { mode: 'marge', marge: 0.015 } : false };
    },
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius', 'soleus'], antagonistes: ['psoas major', 'iliacus', 'tibialis anterior'], stabilisateurs: ['longissimus thoracis', 'iliocostalis lumborum', 'gluteus medius', 'external oblique'] },
  { id: 'saut', nom: 'Saut vertical', categorie: 'Chaîne fermée', alias: ['saut', 'sauter', 'saut vertical', 'faire un saut', 'je saute', 'impulsion'], duree: 2.2, type: 'dynamique', plan: 'sagittal', articulation: 'hanches, genoux, chevilles, tronc et bras : impulsion, vol, réception',
    pose: (p, ctx) => {
      const a = ctx.a, cr = sm(p, 0, 0.26) * (1 - sm(p, 0.26, 0.36)), vol = p >= 0.36 && p <= 0.62 ? (p - 0.36) / 0.26 : 0, recep = sm(p, 0.62, 0.7) * (1 - sm(p, 0.7, 0.88)), flex = Math.max(cr * 0.8 + recep * 0.6, 0);
      const hVol = 0.16 * 4 * vol * (1 - vol), prof = 0.165 * flex, braSwing = spline(p, [[0, 0], [0.26, -45], [0.44, 150], [0.54, 165], [0.72, 70], [0.88, 8]]);
      const tuck = Math.sin(Math.PI * vol) * 0.04, pl = vol > 0 ? -40 * Math.sin(Math.PI * vol) * 1 : 0;
      const sol = vol === 0;
      void tuck; void pl;
      const pd = { dy: hVol, appui: true };                                              // les pieds restent sous le corps : le bassin garde son équilibre pendant le vol
      if (!sol) { pd.cheville = -38 * Math.sin(Math.PI * vol); pd.melange = vol < 0.12 ? 1 - vol / 0.12 : vol > 0.88 ? (vol - 0.88) / 0.12 : 0; }
      return { pied: { D: { ...pd }, G: { ...pd } }, pelvis: { dy: -prof + hVol, fl: 38 * flex - 8 * sm(p, 0.28, 0.36) * (1 - sm(p, 0.36, 0.6)) }, joints: { epauleD: { fl: braSwing }, epauleG: { fl: braSwing }, tete: { fl: -16 * flex } }, equilibre: { mode: 'centre' } };
    },
    agonistes: ['gluteus maximus', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'gastrocnemius', 'soleus'], antagonistes: ['psoas major', 'iliacus', 'tibialis anterior'], stabilisateurs: ['longissimus thoracis', 'gluteus medius', 'external oblique'] },

  /* ───────────── membre supérieur ───────────── */
  { id: 'abduction_epaule', nom: 'Abduction de l’épaule', categorie: 'Membre supérieur', alias: ['abduction de l epaule', 'abduction de l’épaule', 'abduction epaule', 'lever le bras sur le cote', 'ecarter le bras', 'abduction du bras', 'lever les bras sur les cotes'], duree: 4, type: 'membre libre', plan: 'frontal', articulation: 'épaules (articulation gléno-humérale, scapulo-thoracique, acromio- et sterno-claviculaire)',
    pose: (p, ctx) => { const s = ease(pic(p)), er = 75 * sm(s, 0.4, 1); return { joints: { epauleD: { plan: 0, ele: 172 * s, rot: er }, epauleG: { plan: 0, ele: 172 * s, rot: er } } }; },
    agonistes: ['deltoid', 'supraspinatus', 'trapezius', 'serratus anterior'], antagonistes: ['pectoralis major', 'teres major'], stabilisateurs: ['infraspinatus muscle', 'teres minor', 'subscapularis', 'rhomboid major'] },
  { id: 'flexion_epaule', nom: 'Flexion de l’épaule', categorie: 'Membre supérieur', alias: ['flexion de l epaule', 'flexion de l’épaule', 'lever le bras', 'lever les bras', 'flexion epaule', 'bras vers l avant', 'elevation du bras', 'lever de bras'], duree: 4, type: 'membre libre', plan: 'sagittal', articulation: 'épaules (rythme scapulo-huméral)',
    pose: (p, ctx) => { const s = ease(pic(p)); return { joints: { epauleD: { plan: 90, ele: 172 * s, rot: 25 * sm(s, 0.5, 1) }, epauleG: { plan: 90, ele: 172 * s, rot: 25 * sm(s, 0.5, 1) } }, pelvis: {} }; },
    agonistes: ['deltoid', 'pectoralis major', 'coracobrachialis', 'biceps brachii', 'serratus anterior'], antagonistes: ['teres major', 'triceps brachii', 'infraspinatus muscle'], stabilisateurs: ['supraspinatus', 'subscapularis', 'trapezius'] },
  { id: 'flexion_coude', nom: 'Flexion du coude', categorie: 'Membre supérieur', alias: ['flexion du coude', 'flexion de coude', 'flechir le coude', 'plier le coude', 'flexion coude', 'curl'], duree: 3.4, type: 'membre libre', plan: 'sagittal', articulation: 'coudes (huméro-ulnaire, huméro-radiale)',
    pose: (p, ctx) => { const s = ease(pic(p)); return { joints: { coudeD: { fl: 142 * s, pro: -30 * s }, coudeG: { fl: 142 * s, pro: -30 * s }, epauleD: { fl: 4 }, epauleG: { fl: 4 } } }; },
    agonistes: ['biceps brachii', 'brachialis', 'brachioradialis'], antagonistes: ['triceps brachii', 'anconeus'], stabilisateurs: ['deltoid', 'supraspinatus'] },
  { id: 'pronosupination', nom: 'Pronation et supination', categorie: 'Membre supérieur', alias: ['pronation', 'supination', 'pronation et supination', 'prono supination', 'tourner l avant bras', 'rotation de l avant bras', 'tourner la main'], duree: 4, type: 'membre libre', plan: 'transversal', articulation: 'avant-bras (radio-ulnaires proximale et distale), coudes fléchis à 90°',
    pose: (p, ctx) => { const s = Math.sin(2 * Math.PI * p); return { joints: { coudeD: { fl: 90, pro: 80 * s }, coudeG: { fl: 90, pro: 80 * s }, epauleD: { fl: 8 }, epauleG: { fl: 8 } } }; },
    agonistes: ['pronator teres', 'pronator quadratus', 'supinator', 'biceps brachii'], antagonistes: ['brachioradialis', 'anconeus'], stabilisateurs: ['brachialis', 'triceps brachii'] },
  { id: 'prehension', nom: 'Préhension (saisir un objet)', categorie: 'Membre supérieur', alias: ['prehension', 'préhension', 'saisir un objet', 'attraper un objet', 'attraper', 'saisir', 'prendre un verre', 'atteindre un objet'], duree: 4.4, type: 'membre libre', plan: 'sagittal', articulation: 'épaule, coude, avant-bras, poignet et main droits, tronc incliné',
    pose: (p, ctx) => { const s = ease(pic(p)), g = sm(s, 0.6, 1); return { pied: { D: { ik: false }, G: { ik: false } }, joints: { epauleD: { plan: 78, ele: 78 * s, rot: -10 * s }, coudeD: { fl: 52 * s, pro: 75 * sm(s, 0.2, 0.8) }, poignetD: { fl: -18 * s + 6 * g, dev: -6 * s }, lombaire: { fl: 12 * s }, tronc: { fl: 6 * s }, tete: { fl: 8 * s }, epauleG: { fl: 6 * s }, coudeG: { fl: 10 * s } } }; },
    agonistes: ['deltoid', 'biceps brachii', 'brachialis', 'pronator teres', 'extensor carpi radialis longus', 'flexor digitorum superficialis'], antagonistes: ['triceps brachii', 'supinator'], stabilisateurs: ['trapezius', 'serratus anterior', 'infraspinatus muscle', 'supraspinatus'] },
  { id: 'lancer', nom: 'Lancer (bras armé)', categorie: 'Membre supérieur', alias: ['lancer', 'lancer une balle', 'lancer de balle', 'lancer un objet', 'geste de lancer', 'je lance'], duree: 2.6, type: 'dynamique', plan: 'multi-plans', articulation: 'jambe, bassin, tronc et épaule : chaîne cinétique du lancer (bras droit, pied gauche en avant)',
    pose: (p, ctx) => {
      /* Chaîne cinétique du lancer, interpolée par des splines périodiques passant par les instants clés : 0 départ, 0,30 armé (bras en abduction à 90°, rotation externe 85°), 0,40 pic de
         rotation du bassin, 0,46 lâcher, 0,64 fin de geste, 1 retour. Le bassin tourne avant le tronc, qui tourne avant le bras (décalage proximo-distal classique). */
      const a = ctx.a, cR = ctx.cR, K = (v0, v30, v40, v46, v64) => spline(p, [[0, v0], [0.3, v30], [0.4, v40], [0.46, v46], [0.64, v64]]);
      const rotTronc = K(0, 32, -6, -34, -48), ab = K(0, 0, 4, 10, 6), rotBassin = K(0, 14, -22, -26, -26), talon = K(0, 0, 4, 22, 30);
      return { pied: { G: { dz: a * 0.3, appui: true }, D: { dz: -a * 0.22, yaw: a * cR * 20, talon, appui: true } }, pelvis: { rot: rotBassin, fl: K(0, -2, 4, 8, 10), dy: K(-0.03, -0.075, -0.07, -0.04, -0.03) }, joints: {
        lombaire: { rot: rotTronc * 0.28, fl: K(0, -4, 4, 12, 20), ab: cR * -ab * 0.6 }, tronc: { rot: rotTronc * 0.72, fl: K(0, -4, 4, 10, 16), ab: cR * -ab * 0.4 }, tete: { rot: -rotTronc * 0.35, fl: K(0, 0, 0, 4, 10) },
        epauleD: { plan: K(90, 12, 40, 80, 100), ele: K(5, 92, 96, 105, 60), rot: K(0, 85, 40, 8, -25) }, coudeD: { fl: K(10, 90, 60, 22, 40), pro: K(0, -20, 20, 70, 60) }, poignetD: { fl: K(0, -35, -5, 18, 12) },
        epauleG: { plan: 90, ele: K(5, 70, 55, 30, 15), rot: 0 }, coudeG: { fl: K(10, 40, 55, 80, 50) } }, equilibre: { mode: 'marge', marge: 0.01 } };
    },
    agonistes: ['pectoralis major', 'deltoid', 'subscapularis', 'triceps brachii', 'serratus anterior', 'teres major', 'external oblique'], antagonistes: ['infraspinatus muscle', 'teres minor', 'biceps brachii', 'trapezius'], stabilisateurs: ['supraspinatus', 'rhomboid major', 'gluteus maximus', 'gluteus medius', 'vastus lateralis'] },

  /* ───────────── tronc, cou ───────────── */
  { id: 'flexion_tronc', nom: 'Flexion du tronc', categorie: 'Rachis', alias: ['flexion du tronc', 'flexion de tronc', 'se pencher en avant', 'flechir le tronc', 'flexion avant', 'toucher les pieds', 'flexion avant du tronc'], duree: 4.6, type: 'chaîne fermée', plan: 'sagittal', articulation: 'rachis lombaire et thoracique, bassin (rythme lombo-pelvien), pieds fixes',
    pose: (p, ctx) => {
      const s = ease(pic(p)), tot = 82 * s, lomb = Math.min(tot * 0.55, 50), thor = Math.min(tot * 0.12, 12), bas = Math.max(0, tot - lomb - thor);
      return { pied: pieds(), pelvis: { fl: bas }, joints: { lombaire: { fl: lomb }, tronc: { fl: thor }, epauleD: { fl: tot * 0.95 }, epauleG: { fl: tot * 0.95 }, tete: { fl: -tot * 0.18 } }, equilibre: { mode: 'marge', marge: 0.03 } };
    },
    agonistes: ['external oblique', 'psoas major', 'rectus femoris'], antagonistes: ['longissimus thoracis', 'iliocostalis lumborum', 'gluteus maximus', 'semitendinosus', 'semimembranosus'], stabilisateurs: ['gastrocnemius', 'soleus', 'diaphragm'] },
  { id: 'rotation_tronc', nom: 'Rotation du tronc', categorie: 'Rachis', alias: ['rotation du tronc', 'rotation de tronc', 'tourner le tronc', 'torsion du tronc', 'rotation du buste', 'tourner le buste'], duree: 4.6, type: 'membre libre', plan: 'transversal', articulation: 'rachis thoracique (surtout) et lombaire, bassin fixe',
    pose: (p, ctx) => { const s = Math.sin(2 * Math.PI * p); return { joints: { lombaire: { rot: 9 * s }, tronc: { rot: 26 * s }, tete: { rot: 12 * s }, epauleD: { fl: 6 }, epauleG: { fl: 6 } } }; },
    agonistes: ['external oblique', 'semispinalis capitis'], antagonistes: ['iliocostalis lumborum'], stabilisateurs: ['longissimus thoracis', 'gluteus medius'] },
  { id: 'inclinaison_tronc', nom: 'Inclinaison latérale du tronc', categorie: 'Rachis', alias: ['inclinaison du tronc', 'inclinaison laterale du tronc', 'inclinaison latérale du tronc', 'se pencher sur le cote', 'flexion laterale du tronc', 'inclinaison laterale', 'incliner le tronc'], duree: 4.6, type: 'chaîne fermée', plan: 'frontal', articulation: 'rachis lombaire et thoracique, pieds fixes',
    pose: (p, ctx) => { const s = Math.sin(2 * Math.PI * p), cR = ctx.cR; return { pied: pieds(), pelvis: { ab: cR * 2 * -s }, joints: { lombaire: { ab: 16 * s }, tronc: { ab: 12 * s }, tete: { ab: -4 * s }, epauleD: { ab: 6 }, epauleG: { ab: 6 } }, equilibre: { mode: 'marge', marge: 0.03 } }; },
    agonistes: ['iliocostalis lumborum', 'longissimus thoracis'], antagonistes: ['external oblique'], stabilisateurs: ['gluteus medius', 'adductor magnus'] },
  { id: 'rotation_tete', nom: 'Rotation de la tête', categorie: 'Rachis', alias: ['rotation de la tete', 'rotation de la tête', 'tourner la tete', 'tourner la tête', 'dire non', 'rotation cervicale', 'regarder a gauche et a droite'], duree: 4, type: 'membre libre', plan: 'horizontal', articulation: 'rachis cervical (surtout atlas-axis)',
    pose: (p, ctx) => ({ joints: { tete: { rot: 70 * Math.sin(2 * Math.PI * p) } } }),
    agonistes: ['sternocleidomastoid', 'splenius capitis', 'semispinalis capitis'], antagonistes: ['trapezius'], stabilisateurs: ['scalenus anterior', 'scalenus medius'] },
  { id: 'flexion_tete', nom: 'Flexion et extension de la tête', categorie: 'Rachis', alias: ['flexion de la tete', 'flexion de la tête', 'dire oui', 'flexion cervicale', 'baisser la tete', 'extension de la tete', 'extension cervicale', 'hocher la tete'], duree: 4, type: 'membre libre', plan: 'sagittal', articulation: 'rachis cervical',
    pose: (p, ctx) => ({ joints: { tete: { fl: 48 * Math.sin(2 * Math.PI * p) * (Math.sin(2 * Math.PI * p) > 0 ? 1 : 1.0) } } }),
    agonistes: ['sternocleidomastoid', 'scalenus anterior', 'longissimus thoracis'], antagonistes: ['splenius capitis', 'semispinalis capitis', 'trapezius'], stabilisateurs: ['scalenus medius'] },
  { id: 'inclinaison_tete', nom: 'Inclinaison latérale de la tête', categorie: 'Rachis', alias: ['inclinaison de la tete', 'inclinaison latérale de la tête', 'oreille vers l epaule', 'incliner la tete', 'inclinaison cervicale'], duree: 4, type: 'membre libre', plan: 'frontal', articulation: 'rachis cervical',
    pose: (p, ctx) => ({ joints: { tete: { ab: 38 * Math.sin(2 * Math.PI * p) } } }),
    agonistes: ['sternocleidomastoid', 'scalenus medius', 'scalenus anterior', 'levator scapulae'], antagonistes: ['trapezius', 'splenius capitis'], stabilisateurs: ['semispinalis capitis'] }
];

export const parIdV2 = id => MOUVEMENTS2.find(m => m.id === id) || null;
void both; void autre; void DEG;
