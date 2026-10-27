import { construireRig, segmentDeOs } from './anatomie-mouvement-calcul.js';
import { sub, mul, ajouter, dist, lerp, norme, unitaire } from './anatomie-mat4.js';
import { ajusterSphere } from './anatomie-peau-calcul.js';
import { DECALAGES_PIVOTS } from './anatomie-pivots.js';

/* ═════════════ ANATOMIE : LE CORPS ARTICULÉ V2 (module pur, Phase C) ═════════════
   Étend le squelette articulé de S5 : 20 segments rigides (bassin, rachis lombaire, thorax, tête, et pour chaque côté clavicule, scapula, bras, avant-bras, main, cuisse, jambe, pied),
   leurs articulations (pivots estimés depuis les bornes des os du modèle BodyParts3D), les amplitudes physiologiques de référence (goniométrie classique, À VÉRIFIER avec le cours / un atlas),
   les masses et centres de masse par segment (tables de Winter / Dempster, repères classiques), la géométrie des pieds (talon, orteils, sol).
   Rien d'inventé : tout ce qui n'est pas mesurable dans le modèle est une valeur de référence étiquetée comme telle. */
export const COTES = ['D', 'G'];
export const SEGMENTS = ['bassin', 'lombaire', 'tronc', 'tete', ...COTES.flatMap(S => ['clav' + S, 'scap' + S, 'bras' + S, 'avantbras' + S, 'main' + S, 'cuisse' + S, 'jambe' + S, 'pied' + S])];
export const INDEX_SEG = Object.fromEntries(SEGMENTS.map((s, i) => [s, i]));
export const PARENT = { bassin: null, lombaire: 'bassin', tronc: 'lombaire', tete: 'tronc' };
export const PIVOT = { lombaire: 'lombo-sacree', tronc: 'toracolombaire', tete: 'cervicale' };
for (const S of COTES) {
  Object.assign(PARENT, { ['clav' + S]: 'tronc', ['scap' + S]: 'clav' + S, ['bras' + S]: 'scap' + S, ['avantbras' + S]: 'bras' + S, ['main' + S]: 'avantbras' + S, ['cuisse' + S]: 'bassin', ['jambe' + S]: 'cuisse' + S, ['pied' + S]: 'jambe' + S });
  Object.assign(PIVOT, { ['clav' + S]: 'sternoclav' + S, ['scap' + S]: 'acromioclav' + S, ['bras' + S]: 'epaule' + S, ['avantbras' + S]: 'coude' + S, ['main' + S]: 'poignet' + S, ['cuisse' + S]: 'hanche' + S, ['jambe' + S]: 'genou' + S, ['pied' + S]: 'cheville' + S });
}
/* Les segments, du parent aux enfants (ordre de calcul). */
export const ORDRE = (() => { const o = [], vus = new Set(); const visiter = s => { if (vus.has(s)) return; if (PARENT[s]) visiter(PARENT[s]); vus.add(s); o.push(s); }; SEGMENTS.forEach(visiter); return o; })();

/* Amplitudes de référence en degrés [min, max] (goniométrie classique ; l'« extension » est négative). À VÉRIFIER avec le cours / un atlas. Servent à contrôler chaque image d'un mouvement. */
export const ROM = {
  hanche: { fl: [-25, 125], ab: [-30, 45], rot: [-45, 45] }, genou: { fl: [-5, 145] }, cheville: { fl: [-50, 35], inv: [-25, 35] },
  epaule: { fl: [-60, 180], ab: [-45, 180], rot: [-90, 90] }, coude: { fl: [-8, 150], pro: [-85, 85] }, poignet: { fl: [-85, 80], dev: [-25, 35] },
  lombaire: { fl: [-30, 60], ab: [-30, 30], rot: [-15, 15] }, tronc: { fl: [-10, 35], ab: [-25, 25], rot: [-40, 40] }, tete: { fl: [-60, 50], ab: [-45, 45], rot: [-80, 80] },
  clav: { elev: [-5, 20], prot: [-15, 25] }, scap: { rotHaut: [-10, 75] }
};
/* Masses (fraction de la masse totale) et position du centre de masse (fraction de la distance proximal → distal), tables de Winter. */
export const MASSES = { bassin: [0.142, 0.5], lombaire: [0.139, 0.5], tronc: [0.216, 0.5], tete: [0.081, 0.5] };
for (const S of COTES) Object.assign(MASSES, { ['bras' + S]: [0.028, 0.436], ['avantbras' + S]: [0.016, 0.43], ['main' + S]: [0.006, 0.506], ['cuisse' + S]: [0.1, 0.433], ['jambe' + S]: [0.0465, 0.433], ['pied' + S]: [0.0145, 0.5] });

const sansCote = n => String(n).toLowerCase().replace(/\b(left|right) /g, '').replace(/ of (left|right)( |$)/, ' of $2').replace(/\s+/g, ' ').trim();

/* Segment d'un os pour le corps V2 (os seulement). */
export function segmentOsV2(p) {
  const n = sansCote(p.nom_en), S = p.cote === 'droit' ? 'D' : p.cote === 'gauche' ? 'G' : '';
  if (/lumbar vertebra|intervertebral disk of .* lumbar/.test(n)) return 'lombaire';
  if (/^clavicle$/.test(n)) return 'clav' + S;
  if (/^scapula$/.test(n)) return 'scap' + S;
  const s = segmentDeOs(p.nom_en, p.cote);
  return s;
}

/* pointsOs(id) → Float32Array des sommets de l'os (repère du modèle), facultatif : sert à placer le centre des têtes du fémur et de l'humérus par ajustement de sphère.
   decalages : décalages de calibration des pivots (anatomie-pivots.js, générés par outils/calibrer-pivots.mjs) ; null pour les ignorer (utilisé par la calibration elle-même). */
export function construireCorps(index, { pointsOs = null, decalages = DECALAGES_PIVOTS } = {}) {
  const rig = construireRig(index), a = rig.ant, os = index.deSysteme('os'), pivots = { ...rig.pivots }, tetes = {};
  const trouver = (re, cote) => os.find(p => re.test(sansCote(p.nom_en)) && (!cote || p.cote === cote));
  const centre = p => index.centre(p);
  const l12 = trouver(/^twelfth thoracic vertebra$/), l1 = trouver(/^first lumbar vertebra$/);
  pivots.toracolombaire = l12 && l1 ? lerp(centre(l12), centre(l1), 0.5) : [0, (pivots['lombo-sacree'][1] + pivots.cervicale[1]) / 2, pivots['lombo-sacree'][2]];
  for (const S of COTES) {
    const l = S === 'D' ? rig.cote.droit : rig.cote.gauche, c = S === 'D' ? 'droit' : 'gauche', cl = trouver(/^clavicle$/, c), sc = trouver(/^scapula$/, c);
    const b = cl.bornes, cc = centre(cl), med = l > 0 ? b[0][0] : b[1][0], lat = l > 0 ? b[1][0] : b[0][0];
    pivots['sternoclav' + S] = [med + l * 0.006, cc[1], b[l > 0 ? 0 : 1][2] * 0 + cc[2]];
    pivots['acromioclav' + S] = [lat - l * 0.012, cc[1], cc[2]];
    void sc;
  }
  /* centre de la tête fémorale et de la tête humérale : sphère ajustée aux sommets de la partie haute et médiale de l'os (rayons attendus : fémur ≈ 24 mm, humérus ≈ 23 mm) */
  if (pointsOs) for (const S of COTES) for (const [os2, art, rMin, rMax] of [['femur', 'hanche', 0.018, 0.032], ['humerus', 'epaule', 0.016, 0.03]]) {
    const c = S === 'D' ? 'droit' : 'gauche', piece = trouver(new RegExp('^' + os2 + '$'), c), P = piece && pointsOs(piece.id); if (!P) continue;
    let ymax = -1e9; for (let i = 0; i < P.length / 3; i++) ymax = Math.max(ymax, P[3 * i + 1]);
    const haut = []; for (let i = 0; i < P.length / 3; i++) if (P[3 * i + 1] > ymax - 0.05) haut.push(i);
    let mx = 0; for (const i of haut) mx += Math.abs(P[3 * i]); mx /= haut.length || 1;
    const med = haut.filter(i => Math.abs(P[3 * i]) < mx); if (med.length < 30) continue;
    const c0 = [0, 1, 2].map(k => med.reduce((s, i) => s + P[3 * i + k], 0) / med.length); let f = null;
    for (const dx of [-0.012, 0, 0.012]) for (const dy of [-0.016, -0.006, 0.004]) for (const dz of [-0.01, 0, 0.01]) {          // plusieurs départs : on garde l'ajustement qui explique le plus de sommets avec un rayon plausible
      const g = ajusterSphere(P, [c0[0] + dx, c0[1] + dy, c0[2] + dz], { rMax: 0.04, rayon0: os2 === 'femur' ? 0.024 : 0.023 });
      if (g.n >= 20 && g.rayon >= rMin && g.rayon <= rMax && (!f || g.n > f.n)) f = g;
    }
    if (f) { pivots[art + S] = f.centre; tetes[art + S] = { centre: f.centre, rayon: f.rayon, n: f.n }; }
  }
  if (decalages) for (const [nom, d] of Object.entries(decalages)) if (pivots[nom]) pivots[nom] = [pivots[nom][0] + d[0], pivots[nom][1] + d[1], pivots[nom][2] + d[2]];
  /* segment de chaque os */
  const segmentOs = {}, osParSegment = Object.fromEntries(SEGMENTS.map(s => [s, []]));
  for (const p of os) { const s = segmentOsV2(p); if (s && osParSegment[s]) { segmentOs[p.id] = s; osParSegment[s].push(p.id); } }
  /* pieds : talon, orteils, sol */
  const pied = {}; let sol = 1e9;
  for (const S of COTES) {
    const c = S === 'D' ? 'droit' : 'gauche', pieces = os.filter(p => p.cote === c && segmentOsV2(p) === 'pied' + S), ch = pivots['cheville' + S];
    let zMin = 1e9, zMax = -1e9, xMin = 1e9, xMax = -1e9, yMin = 1e9;
    for (const p of pieces) { const b = p.bornes; zMin = Math.min(zMin, b[0][2]); zMax = Math.max(zMax, b[1][2]); xMin = Math.min(xMin, b[0][0]); xMax = Math.max(xMax, b[1][0]); yMin = Math.min(yMin, b[0][1]); }
    const talon = a > 0 ? zMin : zMax, orteils = a > 0 ? zMax : zMin;
    pied[S] = { talon: [ch[0], yMin, talon], orteils: [(xMin + xMax) / 2, yMin, orteils], demiLargeur: (xMax - xMin) / 2, centreX: (xMin + xMax) / 2, yBas: yMin, longueur: Math.abs(orteils - talon) };
    sol = Math.min(sol, yMin);
  }
  const jambes = {};
  for (const S of COTES) jambes[S] = { L1: dist(pivots['hanche' + S], pivots['genou' + S]), L2: dist(pivots['genou' + S], pivots['cheville' + S]), hauteurCheville: pivots['cheville' + S][1] - sol };
  const sommet = trouver(/^skull$|^neurocranium$|^frontal bone$/);
  const topTete = Math.max(...os.filter(p => segmentOsV2(p) === 'tete' && p.bornes).map(p => p.bornes[1][1]));
  void sommet;
  /* extrémités (proximale, distale) de chaque segment, repère du modèle au repos : servent au centre de masse et aux lignes d'os */
  const P = n => pivots[n], hancheMilieu = lerp(P('hancheD'), P('hancheG'), 0.5);
  const bouts = { bassin: [P('lombo-sacree'), hancheMilieu], lombaire: [P('lombo-sacree'), P('toracolombaire')], tronc: [P('toracolombaire'), P('cervicale')], tete: [P('cervicale'), [P('cervicale')[0], topTete, P('cervicale')[2] + a * 0.02]] };
  for (const S of COTES) {
    const h = P('epaule' + S), main = P('poignet' + S), cap = [main[0], main[1] - 0.09, main[2]];
    Object.assign(bouts, { ['clav' + S]: [P('sternoclav' + S), P('acromioclav' + S)], ['scap' + S]: [P('acromioclav' + S), P('epaule' + S)], ['bras' + S]: [h, P('coude' + S)], ['avantbras' + S]: [P('coude' + S), main], ['main' + S]: [main, cap], ['cuisse' + S]: [P('hanche' + S), P('genou' + S)], ['jambe' + S]: [P('genou' + S), P('cheville' + S)], ['pied' + S]: [pied[S].talon, pied[S].orteils] });
  }
  return { rig, ant: a, cote: rig.cote, pivots, tetes, pied, sol, jambes, bouts, hancheMilieu, segmentOs, osParSegment, ROM, MASSES, topTete, lat: S => (S === 'D' ? rig.cote.droit : rig.cote.gauche) };
}

/* Centre de masse du corps pour des transformations de segments T (matrices 4×4), repère du modèle. Rend aussi la contribution de chaque segment. */
export function centreDeMasse(corps, T, pt) {
  let m = 0, x = 0, y = 0, z = 0;
  for (const [s, [masse, f]] of Object.entries(MASSES)) {
    const [p0, p1] = corps.bouts[s]; const c0 = pt(T[s], p0), c1 = pt(T[s], p1), c = [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    m += masse; x += masse * c[0]; y += masse * c[1]; z += masse * c[2];
  }
  return [x / m, y / m, z / m];
}
void sub; void mul; void ajouter; void norme; void unitaire;
