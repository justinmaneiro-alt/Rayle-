/* ═════════════ NEPTUNE : ATELIER 3D, calculs PURS (testés sous Node : planetes/neptune/tests/maquette-test.mjs) ═════════════
   Maillage = { positions: Float32Array|number[] (x,y,z à plat), index?: Uint32Array|number[] (triangles) }. Aucune dépendance à Three.js ni au navigateur.
   Contient : statistiques et contrôle d'étanchéité (impression 3D), mesures (distance, circonférence d'une coupe : scans de membres), écritures STL/OBJ, lecture STL,
   vue éclatée, ordre de présentation et textes de visite, trajets de caméra, pistes d'animation, formes PARAMÉTRIQUES (engrenage, coque, mât, boîtier, casque…) et
   interprétation d'une description en français. Honnêteté : ce sont des formes simples ; aucune génération photoréaliste. */

/* ───────── outils de maillage ───────── */
export const nbSommets = m => (m.positions.length / 3) | 0;
export function indexDe(m) { if (m.index && m.index.length) return m.index; const n = nbSommets(m), a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; }
export const nbTriangles = m => (indexDe(m).length / 3) | 0;
const sous = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const croix = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const point = (m, i) => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]];
const norme = v => Math.hypot(v[0], v[1], v[2]);
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function boite(m) {
  const p = m.positions, n = p.length / 3;
  if (!n) return { min: [0, 0, 0], max: [0, 0, 0], dim: [0, 0, 0], centre: [0, 0, 0] };
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = p[3 * i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { min: mn, max: mx, dim: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], centre: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
}

/* Statistiques + étanchéité. Les sommets coïncidents (à `tolerance` près) sont soudés avant de compter les arêtes :
   étanche = chaque arête est partagée par exactement 2 triangles, orientés en sens inverse. */
export function statsMaillage(m, { tolerance = 1e-5 } = {}) {
  const idx = indexDe(m), nt = (idx.length / 3) | 0, b = boite(m), q = Math.max(tolerance, 1e-12);
  const soude = new Map(), id = new Int32Array(nbSommets(m));
  for (let i = 0; i < id.length; i++) {
    const k = Math.round(m.positions[3 * i] / q) + '|' + Math.round(m.positions[3 * i + 1] / q) + '|' + Math.round(m.positions[3 * i + 2] / q);
    let s = soude.get(k); if (s === undefined) { s = soude.size; soude.set(k, s); } id[i] = s;
  }
  let surface = 0, volume = 0, degeneres = 0;
  const dirigees = new Map();   // "a>b" → nombre
  const cle = (a, c) => a * 4294967296 + c;
  for (let t = 0; t < nt; t++) {
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2], A = point(m, ia), B = point(m, ib), C = point(m, ic);
    const n = croix(sous(B, A), sous(C, A)), aire = norme(n) / 2; surface += aire; volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) + A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    const a = id[ia], bb = id[ib], c = id[ic];
    if (a === bb || bb === c || a === c || aire < 1e-14) { degeneres++; continue; }
    for (const [u, v] of [[a, bb], [bb, c], [c, a]]) { const k = cle(u, v); dirigees.set(k, (dirigees.get(k) || 0) + 1); }
  }
  let ouvertes = 0, nonManifold = 0, incoherentes = 0; const vus = new Set();
  for (const [k, nb] of dirigees) {
    const u = Math.floor(k / 4294967296), v = k - u * 4294967296, inverse = dirigees.get(cle(v, u)) || 0, paire = u < v ? cle(u, v) : cle(v, u);
    if (nb > 1) incoherentes++;
    if (vus.has(paire)) continue; vus.add(paire);
    const total = nb + inverse;
    if (total === 1) ouvertes++; else if (total > 2) nonManifold++;
  }
  const etanche = nt > 0 && ouvertes === 0 && nonManifold === 0 && incoherentes === 0;
  return { sommets: nbSommets(m), sommetsSoudes: soude.size, triangles: nt, degeneres, boite: b, surface, volumeSigne: volume, volume: Math.abs(volume), aretesOuvertes: ouvertes, aretesNonManifold: nonManifold, aretesIncoherentes: incoherentes, etanche,
    normalesInversees: etanche === true ? volume < 0 : (ouvertes === 0 && nonManifold === 0 && volume < 0) };
}

/* Contrôle avant impression 3D : liste de problèmes en français, avec ce qu'on sait et ce qu'on ne sait pas. */
export function verifierImpression(m, opts) {
  const s = statsMaillage(m, opts), pb = [];
  if (!s.triangles) pb.push('Le maillage est vide.');
  if (s.aretesOuvertes) pb.push(s.aretesOuvertes + ' arête(s) ouverte(s) : le maillage n’est pas étanche (trous), une imprimante 3D ne saura pas où est l’intérieur.');
  if (s.aretesNonManifold) pb.push(s.aretesNonManifold + ' arête(s) partagée(s) par plus de 2 triangles (géométrie non manifold).');
  if (s.aretesIncoherentes) pb.push(s.aretesIncoherentes + ' arête(s) dont les triangles voisins sont orientés dans le même sens (normales incohérentes).');
  if (s.normalesInversees) pb.push('Le volume calculé est négatif : les normales pointent vers l’intérieur (maillage « retourné »).');
  if (s.degeneres) pb.push(s.degeneres + ' triangle(s) dégénéré(s) (aire nulle ou sommets confondus).');
  return { ...s, problemes: pb, imprimable: pb.length === 0, note: 'Contrôle géométrique de base : il ne détecte ni les parois trop fines, ni les surplombs, ni les corps flottants. À compléter dans le logiciel de tranchage.' };
}

/* Échelle : un fichier STL/OBJ n'a pas d'unité. On présente les hypothèses (mm, cm, m) : taille de la plus grande dimension et volume. */
export function hypothesesEchelle(m) {
  const s = statsMaillage(m), d = s.boite.dim, L = Math.max(d[0], d[1], d[2]);
  const f = { mm: 1, cm: 10, m: 1000 };
  return Object.entries(f).map(([unite, mm]) => ({ unite, plusGrandeDimension_mm: L * mm, dimensions_mm: d.map(x => x * mm), volume_cm3: s.volume * mm ** 3 / 1000, plausible: L * mm >= 5 && L * mm <= (unite === 'm' ? 5000 : 400) }));
}

/* ───────── mesures ───────── */
/* Section par un plan perpendiculaire à l'axe (0 = x, 1 = y, 2 = z) à la hauteur `h` : boucles de la coupe, longueur du contour (= circonférence d'un membre scanné) et aire. */
export function coupe(m, axe, h, { tolerance = 1e-6 } = {}) {
  const idx = indexDe(m), segs = [];
  const val = i => m.positions[3 * i + axe];
  for (let t = 0; t < idx.length; t += 3) {
    const ids = [idx[t], idx[t + 1], idx[t + 2]], pts = [];
    for (let e = 0; e < 3; e++) {
      const a = ids[e], b = ids[(e + 1) % 3], va = val(a) - h, vb = val(b) - h;
      if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) { const u = va / (va - vb), A = point(m, a), B = point(m, b); pts.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u]); }
      else if (va === 0 && vb !== 0) pts.push(point(m, a));
    }
    const uniques = []; for (const p of pts) if (!uniques.some(q => distance(p, q) < tolerance)) uniques.push(p);
    if (uniques.length === 2) segs.push(uniques);
  }
  // chaînage des segments en boucles
  const q = 1e-4 * Math.max(1e-9, Math.max(...boite(m).dim)), cle = p => Math.round(p[0] / q) + '|' + Math.round(p[1] / q) + '|' + Math.round(p[2] / q);
  const parPoint = new Map(); segs.forEach((s, i) => { for (const p of s) { const k = cle(p); if (!parPoint.has(k)) parPoint.set(k, []); parPoint.get(k).push(i); } });
  const pris = new Array(segs.length).fill(false), boucles = [];
  for (let i = 0; i < segs.length; i++) {
    if (pris[i]) continue; pris[i] = true; const pts = [segs[i][0], segs[i][1]]; let fin = cle(segs[i][1]); const debut = cle(segs[i][0]); let bouclee = false;
    for (let garde = 0; garde < segs.length; garde++) {
      if (fin === debut) { bouclee = true; break; }
      const suite = (parPoint.get(fin) || []).find(j => !pris[j]); if (suite === undefined) break;
      pris[suite] = true; const s = segs[suite], suivant = cle(s[0]) === fin ? s[1] : s[0]; pts.push(suivant); fin = cle(suivant);
    }
    boucles.push({ points: pts, fermee: bouclee });
  }
  const autres = [0, 1, 2].filter(k => k !== axe);
  let longueur = 0, aire = 0;
  for (const b of boucles) {
    let l = 0, a = 0; for (let i = 1; i < b.points.length; i++) { l += distance(b.points[i - 1], b.points[i]); a += b.points[i - 1][autres[0]] * b.points[i][autres[1]] - b.points[i][autres[0]] * b.points[i - 1][autres[1]]; }
    b.longueur = l; b.aire = Math.abs(a) / 2; longueur += l; aire += b.aire;
  }
  return { axe, hauteur: h, boucles, nbBoucles: boucles.length, tousFermes: boucles.every(b => b.fermee), longueurContour: longueur, aire, vide: segs.length === 0 };
}

/* ───────── écriture / lecture ───────── */
export function exporterSTLBinaire(m, { echelle = 1, nom = 'Raylé Neptune' } = {}) {
  const idx = indexDe(m), nt = (idx.length / 3) | 0, buf = new ArrayBuffer(84 + 50 * nt), dv = new DataView(buf);
  for (let i = 0; i < Math.min(79, nom.length); i++) dv.setUint8(i, nom.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true); let o = 84;
  for (let t = 0; t < nt; t++) {
    const A = point(m, idx[3 * t]).map(x => x * echelle), B = point(m, idx[3 * t + 1]).map(x => x * echelle), C = point(m, idx[3 * t + 2]).map(x => x * echelle), n = croix(sous(B, A), sous(C, A)), l = norme(n) || 1;
    for (const v of [[n[0] / l, n[1] / l, n[2] / l], A, B, C]) for (const c of v) { dv.setFloat32(o, c, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
export function exporterSTLAscii(m, { echelle = 1, nom = 'raylé' } = {}) {
  const idx = indexDe(m), nt = (idx.length / 3) | 0, l = ['solid ' + nom.replace(/\s+/g, '_')];
  for (let t = 0; t < nt; t++) {
    const A = point(m, idx[3 * t]).map(x => x * echelle), B = point(m, idx[3 * t + 1]).map(x => x * echelle), C = point(m, idx[3 * t + 2]).map(x => x * echelle), n = croix(sous(B, A), sous(C, A)), d = norme(n) || 1;
    l.push(' facet normal ' + n.map(x => (x / d).toExponential(6)).join(' '), '  outer loop', ...[A, B, C].map(v => '   vertex ' + v.map(x => x.toExponential(6)).join(' ')), '  endloop', ' endfacet');
  }
  l.push('endsolid ' + nom.replace(/\s+/g, '_')); return l.join('\n') + '\n';
}
export function exporterOBJ(m, { nom = 'raylé', echelle = 1 } = {}) {
  const l = ['# Raylé · Neptune', 'o ' + nom.replace(/\s+/g, '_')], n = nbSommets(m), idx = indexDe(m);
  for (let i = 0; i < n; i++) l.push('v ' + point(m, i).map(x => +(x * echelle).toFixed(6)).join(' '));
  for (let t = 0; t < idx.length; t += 3) l.push('f ' + (idx[t] + 1) + ' ' + (idx[t + 1] + 1) + ' ' + (idx[t + 2] + 1));
  return l.join('\n') + '\n';
}
export function lireSTL(donnees) {
  const u8 = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const enTete = String.fromCharCode(...u8.slice(0, 5)).toLowerCase();
  const nbBin = u8.length >= 84 ? dv.getUint32(80, true) : -1;
  if (!(enTete === 'solid' && u8.length !== 84 + 50 * nbBin)) {
    if (nbBin < 0 || u8.length < 84 + 50 * nbBin) throw new Error('STL binaire tronqué');
    const pos = new Float32Array(nbBin * 9); let o = 84;
    for (let t = 0; t < nbBin; t++) { o += 12; for (let k = 0; k < 9; k++) { pos[9 * t + k] = dv.getFloat32(o, true); o += 4; } o += 2; }
    return { positions: pos };
  }
  const texte = new TextDecoder().decode(u8), v = [...texte.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)];
  if (!v.length) throw new Error('STL sans triangle');
  const pos = new Float32Array(v.length * 3); v.forEach((m, i) => { pos[3 * i] = +m[1]; pos[3 * i + 1] = +m[2]; pos[3 * i + 2] = +m[3]; }); return { positions: pos };
}

/* ───────── vue éclatée ───────── */
/* pieces = [{ id, centre:[x,y,z], rayon }] → Map id → décalage [dx,dy,dz]. Chaque pièce s'éloigne du centre de l'assemblage, d'autant plus qu'elle en est loin. */
export function exploser(pieces, facteur = 1) {
  const sortie = new Map(); if (!pieces.length) return sortie;
  const c = [0, 0, 0]; for (const p of pieces) for (let k = 0; k < 3; k++) c[k] += p.centre[k] / pieces.length;
  let R = 0; for (const p of pieces) R = Math.max(R, distance(p.centre, c) + (p.rayon || 0));
  for (const p of pieces) {
    let d = sous(p.centre, c), l = norme(d);
    if (l < 1e-9) { d = [0, 1, 0]; l = 1; }
    const k = Math.max(0, facteur) * (R * 0.6 + (p.rayon || 0) * 0.4) * (0.4 + Math.min(1, l / (R || 1)) * 0.6) / l;
    sortie.set(p.id, [d[0] * k, d[1] * k, d[2] * k]);
  }
  return sortie;
}

/* ───────── visite pièce par pièce ───────── */
export const GLOSSAIRE = [
  // moteur
  ['piston', 'Le piston coulisse dans le cylindre : la pression des gaz le pousse et il transmet l’effort à la bielle.'],
  ['bielle', 'La bielle relie le piston au vilebrequin et transforme le va-et-vient en rotation.'],
  ['vilebrequin', 'Le vilebrequin est l’arbre qui reçoit l’effort des bielles et fournit la rotation en sortie du moteur.'],
  ['culasse', 'La culasse ferme le haut des cylindres et porte les soupapes, les bougies ou les injecteurs.'],
  ['soupape', 'La soupape ouvre et ferme l’admission ou l’échappement des gaz dans le cylindre.'],
  ['arbre a cames', 'L’arbre à cames commande l’ouverture des soupapes au bon moment du cycle.'],
  ['carter', 'Le carter enferme et protège les pièces mobiles ; celui d’un moteur contient aussi l’huile.'],
  ['volant moteur', 'Le volant moteur est une masse qui régularise la rotation entre deux explosions.'],
  ['cylindre', 'Le cylindre est le fourreau dans lequel se déplace le piston.'],
  ['injecteur', 'L’injecteur pulvérise le carburant dans la chambre de combustion ou dans l’admission.'],
  ['bougie', 'La bougie produit l’étincelle qui enflamme le mélange dans un moteur à allumage commandé.'],
  ['engrenage', 'Un engrenage transmet un mouvement de rotation par ses dents, en changeant la vitesse ou le couple.'],
  ['pignon', 'Le pignon est la plus petite roue d’un engrenage ; il engrène avec une roue plus grande.'],
  ['courroie', 'La courroie transmet la rotation entre deux poulies.'],
  ['poulie', 'La poulie est une roue à gorge qui guide ou entraîne une courroie ou un câble.'],
  ['roulement', 'Le roulement guide un arbre en rotation en réduisant le frottement.'],
  ['joint', 'Le joint assure l’étanchéité entre deux pièces.'],
  // bateau
  ['coque', 'La coque est le corps du navire, la partie qui flotte et assure sa forme et son étanchéité.'],
  ['quille', 'La quille est la pièce longitudinale tout en bas de la coque ; elle la rigidifie et, sur un voilier, limite la dérive et lestera le bateau.'],
  ['etrave', 'L’étrave est la partie avant de la coque, qui fend l’eau.'],
  ['etambot', 'L’étambot est la pièce verticale à l’arrière de la coque, qui porte le gouvernail.'],
  ['mat', 'Le mât est le grand espar vertical qui porte les voiles.'],
  ['vergue', 'La vergue est l’espar horizontal qui tient le bord supérieur d’une voile carrée.'],
  ['beaupre', 'Le beaupré est l’espar qui dépasse à l’avant du navire et porte des voiles d’avant.'],
  ['gouvernail', 'Le gouvernail oriente le navire en déviant le flux de l’eau à l’arrière.'],
  ['safran', 'Le safran est la partie plate du gouvernail, immergée, qui dévie l’eau.'],
  ['barre', 'La barre sert à manœuvrer le gouvernail.'],
  ['pont', 'Le pont est le plancher qui ferme la coque par le haut.'],
  ['cabestan', 'Le cabestan est un treuil à axe vertical pour virer les ancres et les grosses manœuvres.'],
  ['haubans', 'Les haubans sont les câbles ou cordages qui maintiennent le mât latéralement.'],
  ['etai', 'L’étai est le câble qui maintient le mât vers l’avant.'],
  ['voile', 'La voile est la toile qui capte le vent pour propulser le navire.'],
  ['grand-voile', 'La grand-voile est la voile principale, portée par le mât principal.'],
  ['foc', 'Le foc est la voile triangulaire établie à l’avant.'],
  ['ancre', 'L’ancre retient le navire au fond.'],
  // maison
  ['fondation', 'Les fondations transmettent le poids du bâtiment au sol.'],
  ['dalle', 'La dalle est une plaque de béton horizontale qui forme un sol ou un plancher.'],
  ['mur', 'Le mur porte les charges ou sépare les espaces.'],
  ['toit', 'Le toit protège le bâtiment des intempéries.'],
  ['charpente', 'La charpente est l’ossature en bois ou en métal qui porte la toiture.'],
  ['chevron', 'Le chevron est une pièce inclinée de la charpente qui porte la couverture.'],
  ['fenetre', 'La fenêtre éclaire et aère une pièce.'],
  ['porte', 'La porte ferme et permet de passer d’un espace à un autre.'],
  ['escalier', 'L’escalier relie des niveaux différents.'],
  ['cheminee', 'La cheminée évacue les fumées d’un foyer ou d’une chaudière.'],
  // armure
  ['casque', 'Le casque protège la tête.'],
  ['plastron', 'Le plastron protège le devant du torse.'],
  ['brassard', 'Le brassard protège le bras.'],
  ['gantelet', 'Le gantelet protège la main et le poignet.'],
  ['cuissard', 'Le cuissard protège la cuisse.'],
  ['genouillere', 'La genouillère protège l’articulation du genou.'],
  ['grieve', 'La grève protège le tibia.']
];
const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function nomLisible(nom) {
  const s = String(nom || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s*\b(?:mesh|obj|geo|node|object|group)\b\s*\d*$/i, '').replace(/\s+\d+$/, '').replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  return s || 'Pièce sans nom';
}
export function definition(nom) { const n = sansAccent(nom); const e = GLOSSAIRE.find(([k]) => new RegExp('(^|[^a-z])' + k.replace('-', '[ -]') + '(s|x)?([^a-z]|$)').test(n)); return e ? e[1] : null; }

/* pieces = [{ id, nom, volume, boite:{dim}, centre }]. Ordre de visite : les plus grosses pièces d'abord (structure), puis les détails ; à volume égal, de bas en haut. */
export function ordrePresentation(pieces) {
  return [...pieces].sort((a, b) => (b.volume || 0) - (a.volume || 0) || (a.centre ? a.centre[1] : 0) - (b.centre ? b.centre[1] : 0) || String(a.nom).localeCompare(String(b.nom), 'fr'));
}
/* Texte dit à voix haute pour une pièce. Ne dit que ce que contient le fichier (nom, dimensions) et le glossaire vérifié : aucun rôle inventé. */
export function textePiece(piece, rang, total, { unite = null } = {}) {
  const nom = nomLisible(piece.nom), d = definition(piece.nom), dim = piece.boite && piece.boite.dim;
  const parts = ['Pièce ' + (rang + 1) + ' sur ' + total + ' : ' + nom + '.'];
  if (d) parts.push(d);
  else parts.push('Je n’ai pas de description pour « ' + nom + ' » : je ne t’en invente pas. Tu peux la renommer ou me dire ce que c’est.');
  if (dim && unite && dim.every(x => isFinite(x) && x > 0)) {
    const f = { mm: 0.1, cm: 1, m: 100 }[unite]; if (f) parts.push('Elle mesure environ ' + dim.map(x => +(x * f).toPrecision(3)).join(' sur ') + ' centimètres.');
  }
  return parts.join(' ');
}
export function introPresentation(nomModele, total) { return 'Je te présente « ' + nomLisible(nomModele) + ' », pièce par pièce : ' + total + ' pièce' + (total > 1 ? 's' : '') + '. Je t’isole chacune à son tour.'; }

/* ───────── trajets de caméra (visites) ───────── */
export function genreDepuisNom(texte) {
  const n = sansAccent(texte).replace(/[_.\-]+/g, ' ');
  if (/\b(maison|house|home|villa|chalet|batiment|building|cottage|habitation)\b/.test(n)) return 'maison';
  if (/\b(bateau|boat|ship|navire|voilier|yacht|sailboat|galion|frigate|fregate|vaisseau)\b/.test(n)) return 'bateau';
  return 'objet';
}
/* Points de passage { pos, cible, duree, texte } d'après la boîte englobante (Y vers le haut). */
export function visiteCamera(b, genre = 'objet') {
  const c = b.centre, [dx, dy, dz] = b.dim, diag = Math.hypot(dx, dy, dz) || 1, R = diag * 0.95, pas = 8, pts = [];
  const orbite = (rayon, el, texte0) => { for (let i = 0; i < pas; i++) { const a = (i / pas) * Math.PI * 2; pts.push({ pos: [c[0] + Math.cos(a) * rayon, c[1] + Math.sin(el) * rayon + dy * 0.1, c[2] + Math.sin(a) * rayon], cible: [...c], duree: 2.2, texte: i === 0 ? texte0 : '' }); } };
  if (genre === 'maison') {
    orbite(R * 1.1, 0.35, 'Tour extérieur de la maison.');
    const dev = Math.max(dx, dz) * 0.75 + 1, oeil = b.min[1] + Math.min(dy * 0.35, 1.6);
    pts.push({ pos: [c[0], oeil, b.max[2] + dev], cible: [c[0], oeil, c[2]], duree: 3, texte: 'Approche de la façade, à hauteur d’yeux.' });
    pts.push({ pos: [c[0], oeil, c[2] + dz * 0.2], cible: [c[0], oeil, b.min[2]], duree: 4, texte: 'Entrée dans la maison.' });
    pts.push({ pos: [c[0] - dx * 0.2, oeil, c[2]], cible: [b.min[0], oeil, c[2]], duree: 3, texte: '' });
    pts.push({ pos: [c[0] + dx * 0.2, oeil, c[2]], cible: [b.max[0], oeil, c[2]], duree: 3, texte: '' });
  } else if (genre === 'bateau') {
    const long = dx >= dz ? 0 : 2, trans = long === 0 ? 2 : 0, h = b.min[1] + dy * 0.55;
    const P = (l, t, y) => { const p = [0, y, 0]; p[long] = l; p[trans] = t; return p; };
    const lc = c[long], tc = c[trans], L = long === 0 ? dx : dz, W = long === 0 ? dz : dx;
    orbite(R * 1.15, 0.3, 'Tour du bateau.');
    pts.push({ pos: P(b.min[long] - L * 0.35, tc + W * 0.6, h), cible: P(lc, tc, c[1]), duree: 3, texte: 'Vue de l’arrière.' });
    pts.push({ pos: P(lc, tc + W * 0.9, h), cible: P(lc, tc, c[1]), duree: 3, texte: 'Le long de la coque, côté bâbord ou tribord selon le modèle.' });
    pts.push({ pos: P(b.max[long] + L * 0.35, tc + W * 0.6, h), cible: P(lc, tc, c[1]), duree: 3, texte: 'Vue de l’avant.' });
    pts.push({ pos: P(lc, tc, b.max[1] + dy * 0.6), cible: P(lc, tc, c[1]), duree: 3, texte: 'Vue du dessus.' });
  } else {
    orbite(R * 1.05, 0.3, 'Tour de l’objet.'); orbite(R * 0.8, 0.8, 'Deuxième tour, en plongée.');
  }
  return pts;
}
/* Catmull-Rom : position et cible le long du trajet, t de 0 à 1. */
export function echantillonnerTrajet(points, t) {
  const n = points.length; if (!n) return null; if (n === 1) return { pos: [...points[0].pos], cible: [...points[0].cible] };
  const total = points.reduce((s, p, i) => s + (i ? p.duree : 0), 0) || 1; let x = Math.max(0, Math.min(1, t)) * total, i = 1;
  while (i < n - 1 && x > points[i].duree) { x -= points[i].duree; i++; }
  const u = Math.max(0, Math.min(1, x / (points[i].duree || 1))), p0 = points[Math.max(0, i - 2)], p1 = points[i - 1], p2 = points[i], p3 = points[Math.min(n - 1, i + 1)];
  const cr = (a, b, c, d, s) => 0.5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s * s * s);
  const f = k => [0, 1, 2].map(j => cr(p0[k][j], p1[k][j], p2[k][j], p3[k][j], u));
  return { pos: f('pos'), cible: f('cible'), indice: i };
}
export const dureeTrajet = points => points.reduce((s, p, i) => s + (i ? p.duree : 0), 0);

/* ───────── animation par images clés ───────── */
const ease = { lineaire: u => u, doux: u => u * u * (3 - 2 * u), entree: u => u * u, sortie: u => 1 - (1 - u) * (1 - u) };
/* piste = { cible, propriete: 'position'|'rotation'|'echelle', cles: [{ t, v:[x,y,z], ease? }] } → valeur à l'instant t (sans dépasser les bornes). */
export function evaluerPiste(piste, t) {
  const c = [...piste.cles].sort((a, b) => a.t - b.t); if (!c.length) return null;
  if (t <= c[0].t) return [...c[0].v]; if (t >= c[c.length - 1].t) return [...c[c.length - 1].v];
  let i = 1; while (c[i].t < t) i++;
  const a = c[i - 1], b = c[i], u = (ease[b.ease] || ease.doux)((t - a.t) / (b.t - a.t || 1));
  return a.v.map((x, k) => x + (b.v[k] - x) * u);
}
export const dureePistes = pistes => pistes.reduce((m, p) => Math.max(m, ...p.cles.map(c => c.t), 0), 0);
/* Assemblage / désassemblage animé : chaque pièce passe de sa position éclatée à sa position de repos (ou l'inverse), avec un léger décalage entre les pièces. */
export function pistesAssemblage(decalages, positions, { sens = 'assembler', duree = 3, ecart = 0.15 } = {}) {
  const ids = [...decalages.keys()], pistes = [];
  ids.forEach((id, i) => {
    const repos = positions.get(id) || [0, 0, 0], d = decalages.get(id), eclate = [repos[0] + d[0], repos[1] + d[1], repos[2] + d[2]], t0 = ids.length > 1 ? (i / (ids.length - 1)) * ecart * duree : 0;
    const depart = sens === 'assembler' ? eclate : repos, arrivee = sens === 'assembler' ? repos : eclate;
    pistes.push({ cible: id, propriete: 'position', cles: [{ t: 0, v: depart }, { t: t0, v: depart }, { t: t0 + duree * (1 - ecart), v: arrivee, ease: 'doux' }] });
  });
  return pistes;
}

/* ───────── formes paramétriques (maillages fermés, orientés vers l'extérieur) ───────── */
function creer() { return { positions: [], index: [] }; }
const ajouterSommet = (m, x, y, z) => { m.positions.push(x, y, z); return m.positions.length / 3 - 1; };
const tri = (m, a, b, c) => m.index.push(a, b, c);
const quad = (m, a, b, c, d) => { tri(m, a, b, c); tri(m, a, c, d); };
export function fusionner(liste) {
  const m = creer(); for (const f of liste) { const base = m.positions.length / 3; for (const v of f.positions) m.positions.push(v); for (const i of indexDe(f)) m.index.push(i + base); }
  return fin(m);
}
const fin = m => ({ positions: Float32Array.from(m.positions), index: Uint32Array.from(m.index) });
export function transformer(m, { echelle = [1, 1, 1], deplacement = [0, 0, 0] } = {}) {
  const p = Float32Array.from(m.positions); for (let i = 0; i < p.length; i += 3) { p[i] = p[i] * echelle[0] + deplacement[0]; p[i + 1] = p[i + 1] * echelle[1] + deplacement[1]; p[i + 2] = p[i + 2] * echelle[2] + deplacement[2]; }
  let idx = indexDe(m); const inverse = echelle[0] * echelle[1] * echelle[2] < 0;
  if (inverse) { const j = Uint32Array.from(idx); for (let t = 0; t < j.length; t += 3) { const x = j[t + 1]; j[t + 1] = j[t + 2]; j[t + 2] = x; } idx = j; }
  return { positions: p, index: idx };
}
export function miroir(m, axe) { const e = [1, 1, 1]; e[axe] = -1; return transformer(m, { echelle: e }); }

export function formeBoite(l, h, p) {
  const m = creer(), x = l / 2, y = h / 2, z = p / 2;
  const s = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]].map(v => ajouterSommet(m, ...v));
  quad(m, s[0], s[3], s[2], s[1]); quad(m, s[4], s[5], s[6], s[7]); quad(m, s[0], s[4], s[7], s[3]); quad(m, s[1], s[2], s[6], s[5]); quad(m, s[3], s[7], s[6], s[2]); quad(m, s[0], s[1], s[5], s[4]);
  return fin(m);
}
/* Solide de révolution autour de Y : profil = [[rayon, y], …] du bas vers le haut ; les rayons nuls ferment les extrémités. */
export function revolution(profil, seg = 32) {
  const m = creer(), n = profil.length, anneaux = [];
  for (let i = 0; i < n; i++) {
    const [r, y] = profil[i];
    if (r <= 1e-12) anneaux.push(ajouterSommet(m, 0, y, 0)); else { const a = []; for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2; a.push(ajouterSommet(m, Math.cos(t) * r, y, Math.sin(t) * r)); } anneaux.push(a); }
  }
  for (let i = 0; i < n - 1; i++) {
    const A = anneaux[i], B = anneaux[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      if (typeof A === 'number' && typeof B === 'number') continue;
      if (typeof A === 'number') tri(m, A, B[k], B[k1]);
      else if (typeof B === 'number') tri(m, A[k1], A[k], B);
      else quad(m, A[k], B[k], B[k1], A[k1]);
    }
  }
  // capuchons si les extrémités ne sont pas des points
  const capuchon = (a, haut) => { if (typeof a === 'number') return; const c = ajouterSommet(m, 0, profil[haut ? n - 1 : 0][1], 0); for (let k = 0; k < a.length; k++) { const k1 = (k + 1) % a.length; if (haut) tri(m, c, a[k1], a[k]); else tri(m, c, a[k], a[k1]); } };
  capuchon(anneaux[0], false); capuchon(anneaux[n - 1], true);
  return fin(m);
}
export const formeCylindre = (r, h, seg = 32) => revolution([[r, -h / 2], [r, h / 2]], seg);
export const formeCone = (r, h, seg = 32) => revolution([[r, -h / 2], [0, h / 2]], seg);
export function formeSphere(r, seg = 24) { const prof = []; const n = Math.max(6, seg >> 1); for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; prof.push([i === 0 || i === n ? 0 : Math.cos(a) * r, Math.sin(a) * r]); } return revolution(prof, seg); }
export function formeTore(R, r, seg = 32, seg2 = 16) {
  const m = creer(), g = [];
  for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2, ligne = []; for (let j = 0; j < seg2; j++) { const b = (j / seg2) * Math.PI * 2, rr = R + r * Math.cos(b); ligne.push(ajouterSommet(m, Math.cos(a) * rr, r * Math.sin(b), Math.sin(a) * rr)); } g.push(ligne); }
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg2; j++) { const i1 = (i + 1) % seg, j1 = (j + 1) % seg2; quad(m, g[i][j], g[i][j1], g[i1][j1], g[i1][j]); }
  return fin(m);
}
/* Tube creux : paroi entre rayon intérieur et extérieur. */
export function formeTube(rExt, rInt, h, seg = 32) { return revolutionCreuse(rExt, rInt, h, seg); }
function revolutionCreuse(rExt, rInt, h, seg) {
  const m = creer(), y0 = -h / 2, y1 = h / 2, E0 = [], E1 = [], I0 = [], I1 = [];
  for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); E0.push(ajouterSommet(m, c * rExt, y0, s * rExt)); E1.push(ajouterSommet(m, c * rExt, y1, s * rExt)); I0.push(ajouterSommet(m, c * rInt, y0, s * rInt)); I1.push(ajouterSommet(m, c * rInt, y1, s * rInt)); }
  for (let k = 0; k < seg; k++) { const k1 = (k + 1) % seg; quad(m, E0[k], E1[k], E1[k1], E0[k1]); quad(m, I0[k], I0[k1], I1[k1], I1[k]); quad(m, E1[k], I1[k], I1[k1], E1[k1]); quad(m, E0[k], E0[k1], I0[k1], I0[k]); }
  return fin(m);
}
/* Engrenage droit : dents trapézoïdales (forme simplifiée, pas de développante), alésage central. module en m, mêmes unités que le reste. */
export function formeEngrenage({ dents = 20, module: mod = 0.002, epaisseur = 0.008, alesage = 0.006 } = {}) {
  const z = Math.max(6, Math.round(dents)), rp = mod * z / 2, rTete = rp + mod, rPied = Math.max(rp - 1.25 * mod, alesage / 2 + mod * 0.5), m = creer(), N = z * 4, h = epaisseur / 2;
  const prof = []; for (let i = 0; i < z; i++) { const a0 = (i / z) * Math.PI * 2, pas = (Math.PI * 2) / z; for (const [f, r] of [[0.0, rPied], [0.15, rPied], [0.3, rTete], [0.55, rTete], [0.7, rPied], [0.99, rPied]]) { const a = a0 + f * pas; prof.push([Math.cos(a) * r, Math.sin(a) * r]); } }
  const P = prof.length, ra = alesage / 2, anneauA = [], anneauB = [], interA = [], interB = [];
  for (const [x, y] of prof) { anneauA.push(ajouterSommet(m, x, -h, y)); anneauB.push(ajouterSommet(m, x, h, y)); }
  for (let i = 0; i < P; i++) { const a = (i / P) * Math.PI * 2; interA.push(ajouterSommet(m, Math.cos(a) * ra, -h, Math.sin(a) * ra)); interB.push(ajouterSommet(m, Math.cos(a) * ra, h, Math.sin(a) * ra)); }
  for (let i = 0; i < P; i++) { const j = (i + 1) % P; quad(m, anneauA[i], anneauB[i], anneauB[j], anneauA[j]); quad(m, interA[i], interA[j], interB[j], interB[i]); quad(m, anneauB[i], interB[i], interB[j], anneauB[j]); quad(m, anneauA[i], anneauA[j], interA[j], interA[i]); }
  void N; return fin(m);
}
/* Boîtier à parois épaisses, ouvert dessus (couvercle séparé si demandé). Solide fermé : parois = boîte extérieure moins cavité (construit par faces). */
export function formeBoitier({ l = 0.1, h = 0.05, p = 0.07, paroi = 0.003 } = {}) {
  const m = creer(), X = l / 2, Z = p / 2, x = X - paroi, z = Z - paroi, y0 = 0, y1 = h, yf = paroi;
  const V = (a, b, c) => ajouterSommet(m, a, b, c);
  const e = [V(-X, y0, -Z), V(X, y0, -Z), V(X, y1, -Z), V(-X, y1, -Z), V(-X, y0, Z), V(X, y0, Z), V(X, y1, Z), V(-X, y1, Z)];
  const i = [V(-x, yf, -z), V(x, yf, -z), V(x, y1, -z), V(-x, y1, -z), V(-x, yf, z), V(x, yf, z), V(x, y1, z), V(-x, y1, z)];
  quad(m, e[0], e[3], e[2], e[1]); quad(m, e[4], e[5], e[6], e[7]); quad(m, e[0], e[4], e[7], e[3]); quad(m, e[1], e[2], e[6], e[5]); quad(m, e[0], e[1], e[5], e[4]);   // extérieur + fond
  quad(m, i[0], i[1], i[2], i[3]); quad(m, i[4], i[7], i[6], i[5]); quad(m, i[0], i[3], i[7], i[4]); quad(m, i[1], i[5], i[6], i[2]); quad(m, i[0], i[4], i[5], i[1]);          // cavité (normales vers l'intérieur de la cavité)
  quad(m, e[3], e[7], i[7], i[3]); quad(m, e[2], i[2], i[6], e[6]); quad(m, e[3], i[3], i[2], e[2]); quad(m, e[7], e[6], i[6], i[7]);                                         // tranche du haut
  return fin(m);
}
/* Coque de bateau par sections : longueur L (axe X), largeur maximale B, tirant d'eau T, hauteur de franc-bord F. Étrave pointue à +X, tableau plat à −X. Fermée par un pont plat. */
export function formeCoque({ longueur = 10, largeur = 3, tirant = 1.2, francBord = 0.9, stations = 18, points = 9 } = {}) {
  const m = creer(), st = [];
  for (let s = 0; s < stations; s++) {
    const u = s / (stations - 1), x = -longueur / 2 + u * longueur, aff = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, 2 * u - 0.8) / 1.2, 2.2)), 0.6), demi = (largeur / 2) * Math.min(1, 0.55 + u * 1.2) * aff;
    const prof = tirant * (0.35 + 0.65 * Math.min(1, Math.sin(Math.min(1, u * 1.25 + 0.05) * Math.PI / 2))) * (u > 0.85 ? 1 - (u - 0.85) / 0.15 * 0.55 : 1);
    const sect = [];   // tribord du pont (haut) → fond → bâbord du pont, demi-largeur avec forme en V arrondi
    for (let k = 0; k < points; k++) { const a = (k / (points - 1)) * Math.PI; sect.push([x, francBord - Math.sin(a) * (francBord + prof) * (u > 0.995 ? 0.3 : 1), Math.cos(a) * demi]); }
    st.push(sect);
  }
  const S = st.map(sect => sect.map(p => ajouterSommet(m, ...p)));
  for (let s = 0; s < stations - 1; s++) for (let k = 0; k < points - 1; k++) quad(m, S[s][k], S[s][k + 1], S[s + 1][k + 1], S[s + 1][k]);
  // pont : fermeture du dessus (ligne tribord/bâbord de chaque station), éventail par station
  for (let s = 0; s < stations - 1; s++) { const a0 = S[s][0], a1 = S[s][points - 1], b0 = S[s + 1][0], b1 = S[s + 1][points - 1]; quad(m, a0, b0, b1, a1); }
  // tableau arrière (station 0) et étrave (dernière station) : éventails depuis le premier point de la section, le bord du pont étant déjà fermé par les quads du pont
  const arr = S[0], av = S[stations - 1];
  for (let k = 1; k < points - 1; k++) { tri(m, arr[0], arr[k + 1], arr[k]); tri(m, av[0], av[k], av[k + 1]); }
  return fin(m);
}
export function formeMat({ hauteur = 12, diametre = 0.25, seg = 16 } = {}) { return revolution([[diametre / 2, 0], [diametre / 2 * 0.95, hauteur * 0.5], [diametre / 2 * 0.55, hauteur], [0, hauteur + 0.02]], seg); }
export function formeCasque({ rayon = 0.11, seg = 24 } = {}) {   // calotte pleine + visière plate : forme simple, pas un modèle de personnage existant
  return fusionner([formeCalotte(rayon, seg), transformer(formeBoite(rayon * 1.5, rayon * 0.5, rayon * 0.12), { deplacement: [0, rayon * 0.35, rayon * 0.95] })]);
}
function formeCalotte(r, seg) { const prof = [[r, 0]]; const n = 8; for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; prof.push([i === n ? 0 : Math.cos(a) * r, Math.sin(a) * r]); } return revolution(prof, seg); }
export function formePlastron({ largeur = 0.34, hauteur = 0.42, epaisseur = 0.05 } = {}) { return fusionner([transformer(formeBoite(largeur, hauteur, epaisseur), { deplacement: [0, 0, 0] }), transformer(formeBoite(largeur * 0.5, hauteur * 0.25, epaisseur * 1.3), { deplacement: [0, hauteur * 0.15, epaisseur * 0.3] })]); }
export const formeBrassard = ({ rayon = 0.045, longueur = 0.28 } = {}) => formeTube(rayon * 1.25, rayon, longueur, 24);

/* ───────── interprétation d'une description en français ───────── */
const UNITES = { mm: 0.001, millimetre: 0.001, millimetres: 0.001, cm: 0.01, centimetre: 0.01, centimetres: 0.01, m: 1, metre: 1, metres: 1 };
/* Cherche « 24 dents », « module 2 mm », « 12 m de long »… dans le texte : renvoie une valeur en mètres (ou un entier pour les dents). */
function nombreApres(txt, mots, { defaut = null, unitePar = 'm' } = {}) {
  for (const mot of mots) {
    const re1 = new RegExp('(?:' + mot + ')\\s*(?:de|d |du|:|=|a|à)?\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(mm|millimetres?|cm|centimetres?|metres?|m)?(?![a-z])');
    const re2 = new RegExp('([0-9]+(?:[.,][0-9]+)?)\\s*(mm|millimetres?|cm|centimetres?|metres?|m)?\\s*(?:de |d )?(?:' + mot + ')(?![a-z])');
    for (const re of [re1, re2]) { const m = re.exec(txt); if (m) return { valeur: parseFloat(m[1].replace(',', '.')) * (m[2] ? UNITES[m[2]] : (unitePar === 'm' ? 1 : UNITES[unitePar])), brute: parseFloat(m[1].replace(',', '.')), unite: m[2] || null }; }
  }
  return defaut === null ? null : { valeur: defaut, brute: defaut, unite: null };
}
export function interpreterDescription(description) {
  const t = sansAccent(description).replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim(), pieces = [], notes = [];
  if (!t) return { ok: false, pieces: [], message: 'Décris ce que tu veux fabriquer : par exemple « un engrenage de 24 dents, module 2 mm, épaisseur 8 mm ».' };
  const dim = (mots, def, unite = 'm') => { const r = nombreApres(t, mots, { unitePar: unite }); return r ? r.valeur : def; };
  const ajouter = (type, nom, params, couleur) => pieces.push({ type, nom, params, couleur });
  if (/\b(engrenage|pignon|roue dentee)\b/.test(t)) {
    const z = nombreApres(t, ['dents?']), mo = nombreApres(t, ['module'], { unitePar: 'mm' }), ep = dim(['epaisseur', 'largeur'], 0.008, 'mm'), al = dim(['alesage', 'trou'], 0.006, 'mm');
    ajouter('engrenage', 'Engrenage', { dents: z ? Math.round(z.brute) : 20, module: mo ? (mo.unite ? mo.valeur : mo.brute * 0.001) : 0.002, epaisseur: ep, alesage: al }, '#b8c2cc');
  }
  if (/\b(coque|bateau|navire|voilier|barque)\b/.test(t)) {
    const L = dim(['long', 'longueur'], 10), B = dim(['large', 'largeur'], Math.max(1, L * 0.3)), T = dim(['tirant d eau', 'tirant'], L * 0.12);
    ajouter('coque', 'Coque', { longueur: L, largeur: B, tirant: T, francBord: L * 0.09 }, '#8a5a34');
    if (/\b(voilier|mat|mats|voile)\b/.test(t)) ajouter('mat', 'Mât', { hauteur: dim(['mat de', 'hauteur de mat', 'mat'], L * 1.1), diametre: L * 0.025 }, '#c9a76a');
  } else if (/\b(mat)\b/.test(t)) ajouter('mat', 'Mât', { hauteur: dim(['hauteur', 'haut'], 12), diametre: dim(['diametre'], 0.25) }, '#c9a76a');
  if (/\b(boitier|boite|coffret|caisse)\b/.test(t)) ajouter('boitier', 'Boîtier', { l: dim(['long', 'longueur', 'largeur'], 0.1, 'mm'), h: dim(['haut', 'hauteur'], 0.05, 'mm'), p: dim(['profond', 'profondeur'], 0.07, 'mm'), paroi: dim(['paroi'], 0.003, 'mm') }, '#7e8c99');
  if (/\b(cylindre)\b/.test(t)) ajouter('cylindre', 'Cylindre', { rayon: dim(['rayon'], dim(['diametre'], 0.1, 'mm') / 2, 'mm'), hauteur: dim(['haut', 'hauteur', 'long', 'longueur'], 0.1, 'mm') }, '#9aa7b3');
  if (/\b(tube|tuyau)\b/.test(t)) ajouter('tube', 'Tube', { rExt: dim(['diametre exterieur', 'diametre'], 0.04, 'mm') / 2, rInt: dim(['diametre interieur'], 0.03, 'mm') / 2, hauteur: dim(['long', 'longueur', 'haut', 'hauteur'], 0.2, 'mm') }, '#9aa7b3');
  if (/\b(sphere|boule|bille)\b/.test(t)) ajouter('sphere', 'Sphère', { rayon: dim(['rayon'], dim(['diametre'], 0.1, 'mm') / 2, 'mm') }, '#a0b4c8');
  if (/\b(cone)\b/.test(t)) ajouter('cone', 'Cône', { rayon: dim(['rayon'], 0.05, 'mm'), hauteur: dim(['haut', 'hauteur'], 0.1, 'mm') }, '#a0b4c8');
  if (/\b(tore|anneau|bague)\b/.test(t)) ajouter('tore', 'Tore', { R: dim(['grand rayon', 'rayon'], 0.04, 'mm'), r: dim(['petit rayon', 'section'], 0.01, 'mm') }, '#c8b27a');
  if (/\b(armure)\b/.test(t)) {
    ajouter('casque', 'Casque', { rayon: 0.11 }, '#b0453b'); ajouter('plastron', 'Plastron', { largeur: 0.34, hauteur: 0.42, epaisseur: 0.05 }, '#b0453b');
    ajouter('brassard', 'Brassard gauche', { rayon: 0.045, longueur: 0.28 }, '#c9a24a'); ajouter('brassard', 'Brassard droit', { rayon: 0.045, longueur: 0.28 }, '#c9a24a');
    notes.push('« Armure » = quelques pièces simples (casque, plastron, deux brassards) : une base à raffiner, pas une armure détaillée.');
  } else {
    if (/\b(casque)\b/.test(t)) ajouter('casque', 'Casque', { rayon: dim(['rayon'], 0.11) }, '#b0453b');
    if (/\b(plastron)\b/.test(t)) ajouter('plastron', 'Plastron', { largeur: 0.34, hauteur: 0.42, epaisseur: 0.05 }, '#b0453b');
    if (/\b(brassard)\b/.test(t)) ajouter('brassard', 'Brassard', { rayon: 0.045, longueur: 0.28 }, '#c9a24a');
  }
  if (!pieces.length) return { ok: false, pieces: [], message: 'Je ne sais pas fabriquer « ' + description.trim().slice(0, 60) + ' » avec des formes paramétriques. Je sais : engrenage, coque et voilier, mât, boîtier, cylindre, tube, sphère, cône, tore, casque, plastron, brassard, armure simple. Pour un modèle complexe, importe un fichier libre de droits.' };
  return { ok: true, pieces, notes: [...notes, 'Formes paramétriques simples : aucune génération photoréaliste n’est fiable sans service payant. Importe un modèle libre de droits pour du détail.'], message: 'Je fabrique : ' + pieces.map(p => p.nom.toLowerCase()).join(', ') + '.' };
}
export function construireForme(piece) {
  const p = piece.params || {};
  switch (piece.type) {
    case 'engrenage': return formeEngrenage(p);
    case 'coque': return formeCoque(p);
    case 'mat': return formeMat(p);
    case 'boitier': return formeBoitier(p);
    case 'cylindre': return formeCylindre(p.rayon, p.hauteur);
    case 'tube': return formeTube(p.rExt, Math.min(p.rInt, p.rExt * 0.95), p.hauteur);
    case 'sphere': return formeSphere(p.rayon);
    case 'cone': return formeCone(p.rayon, p.hauteur);
    case 'tore': return formeTore(p.R, Math.min(p.r, p.R * 0.9));
    case 'casque': return formeCasque(p);
    case 'plastron': return formePlastron(p);
    case 'brassard': return formeBrassard(p);
    default: throw new Error('forme inconnue : ' + piece.type);
  }
}

/* ───────── sources de modèles libres et attribution ───────── */
export const LICENCES_LIBRES = { 'CC0': 'Domaine public (CC0)', 'CC-BY': 'Creative Commons Attribution', 'CC-BY-SA': 'Creative Commons Attribution – Partage dans les mêmes conditions', 'CC-BY-4.0': 'Creative Commons Attribution 4.0', 'CC-BY-3.0': 'Creative Commons Attribution 3.0', 'PD': 'Domaine public', 'NASA': 'NASA (généralement domaine public, à vérifier fichier par fichier)', 'MIT': 'Licence MIT' };
export const SOURCES_MODELES = [
  { id: 'polypizza', nom: 'Poly Pizza', url: 'https://poly.pizza', licences: 'CC0 et CC-BY (indiquées sur chaque modèle)', note: 'Petits modèles low-poly, GLB téléchargeables.' },
  { id: 'nasa', nom: 'NASA 3D Resources', url: 'https://nasa3d.arc.nasa.gov', licences: 'Généralement libres de droits (vérifier la fiche)', note: 'Satellites, vaisseaux, planètes.' },
  { id: 'smithsonian', nom: 'Smithsonian Open Access 3D', url: 'https://3d.si.edu', licences: 'CC0 pour les objets marqués « Open Access »', note: 'Objets de musée, scans.' },
  { id: 'sketchfab', nom: 'Sketchfab (filtre « Téléchargeable » + licence CC)', url: 'https://sketchfab.com/features/free-3d-models', licences: 'CC-BY, CC-BY-SA, CC0 selon le modèle', note: 'Compte gratuit nécessaire pour télécharger ; l’attribution est obligatoire pour CC-BY.' },
  { id: 'kenney', nom: 'Kenney', url: 'https://kenney.nl/assets', licences: 'CC0', note: 'Packs d’objets, maisons, véhicules.' }
];
/* Fiche d'attribution à garder avec le modèle (et à écrire dans les extras du GLB exporté). Refuse une licence qui n'est pas dans la liste connue. */
export function attribution({ titre, auteur, licence, url, source }) {
  const l = String(licence || '').toUpperCase().replace(/\s+/g, '-');
  const code = Object.keys(LICENCES_LIBRES).find(k => k.toUpperCase() === l) || null;
  const manque = []; if (!titre) manque.push('titre'); if (!auteur && code !== 'CC0' && code !== 'PD') manque.push('auteur'); if (!url) manque.push('adresse d’origine'); if (!code) manque.push('licence reconnue');
  return { ok: manque.length === 0, manque, licenceCode: code, texte: manque.length ? null : '« ' + titre + ' »' + (auteur ? ' par ' + auteur : '') + ' — ' + LICENCES_LIBRES[code] + ' — ' + url + (source ? ' (via ' + source + ')' : '') };
}
