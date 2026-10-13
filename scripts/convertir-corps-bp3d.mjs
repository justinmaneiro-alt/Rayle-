// Convertit BodyParts3D (DBCLS, CC BY 4.0) en couches GLB pour Raylé : tous les maillages viennent du MÊME corps, donc les insertions des muscles tombent sur les os.
//   node scripts/convertir-corps-bp3d.mjs <dossier isa_BP3D_4.0_obj_99> <dossier des tables> <os|muscles|arteres|veines|organes|nerfs|tout> [dossier de sortie]
// Tables : isa_element_parts.txt et isa_inclusion_relation_list.txt (https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/). Sortie par défaut : ui/assets/anatomie/.
// Repère : mm, z vers le haut, face vers −y → mètres, y vers le haut, face vers +z (voir lib-bp3d.mjs).
// Os : os-axial-bp3d.glb (os longs, scapula, clavicule, os coxal, patella, rachis, côtes, sacrum, disques) ; les mains, pieds et le crâne restent dans os-detail-bp3d.glb (convertir-bodyparts3d.mjs).
// Tissus mous : chaque sommet reçoit jusqu'à 4 ancres (os les plus proches, poids en 1/d³) : attributs _SKI / _SKW. À l'exécution, chaque os affiché est recalé sur le squelette de l'application
//   (ajustement.js) ; les tissus mous suivent par mélange linéaire des transformations de leurs ancres (js/anatomie/corps-hd.js), donc l'insertion d'un muscle reste collée à son os.
import fs from 'node:fs';
import { ouvrirBP3D, boite } from './lib-bp3d.mjs';
import { normales, loop, cuire, ecrireGLB, interpoler, simplifier } from './lib-glb.mjs';
import { ancres, VERT } from './ancres-bp3d.mjs';

const [, , dossierOBJ, dossierTables, quoi = 'tout', sortie = 'ui/assets/anatomie'] = process.argv;
if (!dossierOBJ || !dossierTables) { console.error('usage : node scripts/convertir-corps-bp3d.mjs <dossier OBJ> <dossier tables> <os|muscles|arteres|veines|organes|nerfs|tout> [sortie]'); process.exit(1); }
const bp = ouvrirBP3D(dossierOBJ, dossierTables);
const DROITS = 'BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)';
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const mo = n => (n / 1048576).toFixed(2) + ' Mo';

// ───────── os ─────────
function os() {
  const defs = {};      // nœud → concept
  for (const [k, c] of [['G', 'left'], ['D', 'right']]) {
    for (const [id, nom] of [['clavicule', 'clavicle'], ['scapula', 'scapula'], ['humerus', 'humerus'], ['radius', 'radius'], ['ulna', 'ulna'], ['os_coxal', 'hip bone'], ['femur', 'femur'], ['patella', 'patella'], ['tibia', 'tibia'], ['fibula', 'fibula']]) defs[`${id}_${k}`] = `${c} ${nom}`;
    for (let i = 1; i <= 12; i++) defs[`cote_${i}_${k}`] = `${c} ${ORD[i - 1]} rib`;
  }
  defs.sacrum = 'sacrum';
  for (const [id, nom] of VERT) defs['vertebre_' + id] = nom;
  // disques : « intervertebral disk of <vertèbre> » est le disque situé sous cette vertèbre ; nom du nœud : disque_<haute><basse>
  for (let k = 1; k + 1 < VERT.length; k++) { const [h, nh] = VERT[k], [b] = VERT[k + 1]; defs[`disque_${h}${b}`] = 'intervertebral disk of ' + nh; }
  const noeuds = [];
  for (const [nom, concept] of Object.entries(defs)) {
    const m = bp.maillage(concept); if (!m) { console.warn('  absent :', nom, '←', concept); continue; }
    noeuds.push({ nom, pos: m.pos, idx: m.idx, nor: normales(m.pos, m.idx) });
  }
  console.log('  maillages bruts :', noeuds.length, 'nœuds,', noeuds.reduce((s, n) => s + n.pos.length / 3, 0), 'sommets');
  const groupes = [
    [n => /^(vertebre_|cote_|sacrum|disque_|os_coxal)/.test(n), .045, 10],
    [n => /^(femur|tibia|fibula|patella)_G/.test(n), .04], [n => /^(femur|tibia|fibula|patella)_D/.test(n), .04],
    [n => /^(humerus|radius|ulna|clavicule|scapula)_G/.test(n), .04], [n => /^(humerus|radius|ulna|clavicule|scapula)_D/.test(n), .04]
  ];
  for (const [test, portee, rayons = 16] of groupes) { const s = noeuds.filter(n => test(n.nom)); if (s.length) { const t0 = Date.now(); cuire(s, { portee, cellule: portee / 3, rayons }); console.log('  cuisson', s.length, 'nœuds :', Date.now() - t0, 'ms'); } }
  for (const n of noeuds) {            // une passe de Loop pour adoucir les maillages grossiers ; l'épiphyse et l'occlusion, cuites sur le maillage brut, sont interpolées
    const nv = n.pos.length / 3; if (nv >= 1800) continue;
    const L = loop(n.pos, n.idx); n.fibre = interpoler(n.fibre, 2, nv, L.parents); n.pos = L.pos; n.idx = L.idx; n.nor = normales(n.pos, n.idx);
  }
  const out = ecrireGLB(noeuds, { droits: DROITS, generateur: 'Rayle scripts/convertir-corps-bp3d.mjs (os)' });
  fs.writeFileSync(sortie + '/os-axial-bp3d.glb', out);
  console.log('os :', noeuds.length, 'nœuds,', noeuds.reduce((s, n) => s + n.pos.length / 3, 0), 'sommets,', mo(out.length));
}

if (quoi === 'os' || quoi === 'tout') os();

// ───────── tissus mous : peau (ancres) et fibres ─────────
let ANC = null;
function ancresCharge() { if (!ANC) { ANC = ancres(bp); console.log('ancres :', ANC.length); } return ANC; }

/** Pour chaque sommet : jusqu'à 4 ancres (os les plus proches) avec des poids en 1/(d+3 mm)³ → { idx: Uint8Array(4n), poids: Uint8Array(4n) } ; les indices renvoient à ANC */
const CEL = .025, CLE = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
function grillePeau() {
  if (peau.G) return peau.G;
  const A = ancresCharge(), G = new Map(), X = [], Y = [], Z = [], Q = [];
  for (let a = 0; a < A.length; a++) {
    const p = A[a].maillage.pos, n = p.length / 3, pas = Math.max(1, Math.floor(n / 600));
    for (let i = 0; i < n; i += pas) {
      const s = X.length; X.push(p[3 * i]); Y.push(p[3 * i + 1]); Z.push(p[3 * i + 2]); Q.push(a);
      const k = CLE(Math.floor(p[3 * i] / CEL), Math.floor(p[3 * i + 1] / CEL), Math.floor(p[3 * i + 2] / CEL));
      const l = G.get(k); if (l) l.push(s); else G.set(k, [s]);
    }
  }
  return peau.G = { G, X: Float32Array.from(X), Y: Float32Array.from(Y), Z: Float32Array.from(Z), Q: Int16Array.from(Q), n: A.length };
}
function peau(pos) {
  const { G, X, Y, Z, Q, n: na } = grillePeau(), nv = pos.length / 3, idx = new Uint8Array(4 * nv), poids = new Uint8Array(4 * nv);
  const dist = new Float32Array(na), touches = [];
  for (let v = 0; v < nv; v++) {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2], cx = Math.floor(x / CEL), cy = Math.floor(y / CEL), cz = Math.floor(z / CEL);
    for (const a of touches) dist[a] = 0; touches.length = 0;
    const note = s => { const d = Math.hypot(X[s] - x, Y[s] - y, Z[s] - z), a = Q[s]; if (dist[a] === 0) { dist[a] = d; touches.push(a); } else if (d < dist[a]) dist[a] = d; };
    for (let r = 0; r <= 14; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        const bord = Math.abs(i) === r || Math.abs(j) === r;
        for (let k = bord ? -r : -r; k <= r; k += (bord ? 1 : 2 * r || 1)) { const l = G.get(CLE(cx + i, cy + j, cz + k)); if (l) for (const s of l) note(s); }
      }
      if (touches.length >= 4) { const ds = touches.map(a => dist[a]).sort((p, q) => p - q); if (r * CEL > ds[3]) break; }
    }
    if (!touches.length) for (let s = 0; s < X.length; s++) note(s);
    const l = touches.map(a => [a, dist[a]]).sort((p, q) => p[1] - q[1]).slice(0, 4).map(([a, d]) => [a, 1 / Math.pow(d + .003, 3)]);
    const S = l.reduce((s, e) => s + e[1], 0); let reste = 255;
    l.forEach((e, q) => { const w = q === l.length - 1 ? reste : Math.min(reste, Math.round(e[1] / S * 255)); idx[4 * v + q] = e[0]; poids[4 * v + q] = w; reste -= w; });
    for (let q = l.length; q < 4; q++) idx[4 * v + q] = l[0][0];
  }
  return { idx, poids };
}

/** Attribut _FIBRE d'un muscle : x = position le long du grand axe (0..1), y = angle autour de l'axe (0..1). Un muscle plat ou large (rapport des axes < 2,2) n'a pas d'extrémités tendineuses : x est ramené au centre */
function fibres(pos) {
  const n = pos.length / 3; let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pos[3 * i]; cy += pos[3 * i + 1]; cz += pos[3 * i + 2]; } cx /= n; cy /= n; cz /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i++) { const x = pos[3 * i] - cx, y = pos[3 * i + 1] - cy, z = pos[3 * i + 2] - cz; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  const iter = (v, evite) => { for (let k = 0; k < 60; k++) { let w = [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]];
      if (evite) { const d = w[0] * evite[0] + w[1] * evite[1] + w[2] * evite[2]; w = w.map((q, i) => q - d * evite[i]); } const l = Math.hypot(...w) || 1; v = w.map(q => q / l); }
    const w = [xx * v[0] + xy * v[1] + xz * v[2], xy * v[0] + yy * v[1] + yz * v[2], xz * v[0] + yz * v[1] + zz * v[2]]; return [v, Math.hypot(...w)]; };
  const [a, l1] = iter([1, .7, .4]), perp = Math.abs(a[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  const [b, l2] = iter(perp.map((q, i) => q - a[i] * (perp[0] * a[0] + perp[1] * a[1] + perp[2] * a[2])), a);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let mn = Infinity, mx = -Infinity; const t = new Float32Array(n);
  for (let i = 0; i < n; i++) { t[i] = (pos[3 * i] - cx) * a[0] + (pos[3 * i + 1] - cy) * a[1] + (pos[3 * i + 2] - cz) * a[2]; mn = Math.min(mn, t[i]); mx = Math.max(mx, t[i]); }
  const allonge = Math.sqrt(l1 / Math.max(l2, 1e-12)) >= 2.2, F = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    const dx = pos[3 * i] - cx, dy = pos[3 * i + 1] - cy, dz = pos[3 * i + 2] - cz;
    const u = dx * b[0] + dy * b[1] + dz * b[2], w = dx * c[0] + dy * c[1] + dz * c[2];
    F[2 * i] = allonge ? (t[i] - mn) / Math.max(mx - mn, 1e-9) : .5; F[2 * i + 1] = (Math.atan2(w, u) / Math.PI + 1) / 2;
  }
  return F;
}

let SEUIL_LOOP = 500;       // une passe de Loop (×4 sommets) seulement pour les petits maillages : la couche reste légère pour une tablette
function lisser(m) { return m.pos.length / 3 < SEUIL_LOOP ? loop(m.pos, m.idx) : m; }

/** Réduit un maillage trop dense jusqu'à `max` sommets. Avec les paquets d'outils (variable OUTILS, voir compresser-glb.mjs) : simplification par contraction d'arêtes (meshoptimizer), qui garde les bords nets des muscles
    plats (oblique externe, intercostaux, diaphragme) ; sans eux : regroupement de sommets (cellule de 1,5 mm agrandie de 30 % tant qu'il dépasse `max`), plus grossier. */
let SIMPLIFIER = undefined;
async function chargerSimplifier() {
  if (SIMPLIFIER !== undefined) return SIMPLIFIER;
  SIMPLIFIER = null;
  try { if (process.env.OUTILS) { const { createRequire } = await import('node:module'); const req = createRequire(process.env.OUTILS.replace(/[\\/]$/, '') + '/package.json'); const { MeshoptSimplifier } = req('meshoptimizer'); await MeshoptSimplifier.ready; SIMPLIFIER = MeshoptSimplifier; console.log('simplification : meshoptimizer'); } } catch (e) { console.log('simplification : regroupement de sommets (meshoptimizer indisponible : ' + e.message + ')'); }
  return SIMPLIFIER;
}
function reduire(n, max) {
  if (n.pos.length / 3 <= max) return;
  const avant = n.pos.length / 3;
  if (SIMPLIFIER) {
    const S = SIMPLIFIER; let erreur = .01, m = null;
    for (let essai = 0; essai < 6; essai++) {
      const [idx2] = S.simplify(Uint32Array.from(n.idx), n.pos, 3, Math.floor(max * 2 / 3) * 3, erreur, ['ErrorAbsolute']);
      const [remap, unique] = S.compactMesh(idx2), pos = new Float32Array(unique * 3);
      for (let i = 0; i < n.pos.length / 3; i++) if (remap[i] !== 4294967295) { const j = remap[i]; pos[3 * j] = n.pos[3 * i]; pos[3 * j + 1] = n.pos[3 * i + 1]; pos[3 * j + 2] = n.pos[3 * i + 2]; }
      m = { pos, idx: Uint32Array.from(idx2, v => remap[v]) };
      if (unique <= max * 1.15) break; erreur *= 2;
    }
    n.pos = m.pos; n.idx = m.idx; console.log('  réduit', n.nom, avant, '→', m.pos.length / 3, 'sommets (contraction d\'arêtes)'); return;
  }
  let cel = .0015, m = { pos: n.pos, idx: n.idx };
  while (m.pos.length / 3 > max && cel < .05) { cel *= 1.3; m = simplifier(n.pos, n.idx, cel); }
  n.pos = m.pos; n.idx = m.idx; console.log('  réduit', n.nom, avant, '→', m.pos.length / 3, 'sommets (cellule ' + (cel * 1000).toFixed(1) + ' mm)');
}

/** Écrit une couche de tissus mous : noeuds [{ nom, pos, idx }] → fichier, avec ancres de peau et (si fib) fibres */
async function couche(fichier, noeuds, { fib = false, lisse = true, label, maxSommets = 12000 }) {
  await chargerSimplifier();
  const A = ancresCharge();
  const t0 = Date.now(); let fait = 0;
  for (const n of noeuds) {
    reduire(n, maxSommets);
    if (lisse) { const m = lisser(n); n.pos = m.pos; n.idx = m.idx; }
    n.nor = normales(n.pos, n.idx); n.peau = peau(n.pos); if (fib) n.fibre = fibres(n.pos);
    if (++fait % 25 === 0) console.log('  ', label, fait + '/' + noeuds.length, Math.round((Date.now() - t0) / 1000) + ' s');
  }
  const out = ecrireGLB(noeuds, { droits: DROITS, generateur: 'Rayle scripts/convertir-corps-bp3d.mjs (' + label + ')', extras: { ancres: A.map(a => a.id) }, sansNormales: true });      // normales recalculées à l'exécution, après le recalage des sommets
  fs.writeFileSync(sortie + '/' + fichier, out);
  console.log(label, ':', noeuds.length, 'nœuds,', noeuds.reduce((s, n) => s + n.pos.length / 3, 0), 'sommets,', mo(out.length), '→', fichier);
}

// ───────── muscles ─────────
async function muscles() {
  const { MUSCLES_HD, TENDONS_HD } = await import('../js/anatomie/donnees-corps.js');
  const noeuds = [];
  const ajoute = (id, spec, i) => {
    const sym = spec.includes('{c}');
    for (const [k, c] of sym ? [['G', 'left'], ['D', 'right']] : [['M', '']]) {
      const nom = spec.replace('{c}', c), m = bp.maillage(nom);
      if (!m) { console.warn('  absent :', id, '←', nom); continue; }
      noeuds.push({ nom: `${id}__${k}__${i}`, pos: m.pos, idx: m.idx });
    }
  };
  for (const [id, , , , specs] of MUSCLES_HD) specs.forEach((s, i) => ajoute(id, s, i));
  await couche('muscles-bp3d.glb', noeuds, { fib: true, label: 'muscles' });
  const tendons = [];
  for (const [id, , , , specs] of TENDONS_HD) specs.forEach((s, i) => {
    const sym = s.includes('{c}');
    for (const [k, c] of sym ? [['G', 'left'], ['D', 'right']] : [['M', '']]) { const m = bp.maillage(s.replace('{c}', c)); if (m) tendons.push({ nom: `${id}__${k}__${i}`, pos: m.pos, idx: m.idx }); else console.warn('  absent :', id, '←', s); }
  });
  await couche('tendons-bp3d.glb', tendons, { fib: true, label: 'tendons et fascias' });
}

if (quoi === 'muscles' || quoi === 'tout') await muscles();

// ───────── vaisseaux, organes, nerfs ─────────
const dossierPartof = process.env.BP3D_PARTOF || (dossierTables + '/partof');
let PO = null;
const partof = () => PO || (PO = ouvrirBP3D(dossierPartof + '/partof_BP3D_4.0_obj_99', dossierPartof, 'partof'));

/** Maillage d'un concept BodyParts3D : « nom » (isa), « p:nom », « pp:nom », « pd:nom|filtre » (voir js/anatomie/donnees-organes-hd.js) ; null si absent */
function maillageDe(spec) {
  let b = bp, nom = spec, mode = 'tout';
  if (spec.startsWith('pd:')) { b = partof(); const [n, ...f] = spec.slice(3).split('|'); const i = b.id(n); const fic = i ? b.fichiersPropresDescendants(i, f.join('|')) : []; return fic.length ? b.maillageFichiers(fic) : null; }
  if (spec.startsWith('pp:')) { b = partof(); nom = spec.slice(3); mode = 'propres'; } else if (spec.startsWith('p:')) { b = partof(); nom = spec.slice(2); }
  if (mode === 'propres') { const i = b.id(nom), f = i ? b.fichiersPropres(i) : null; return f && f.length ? b.maillageFichiers(f) : null; }
  return b.maillage(nom);
}
function ajouteRangees(noeuds, rangees, option = {}) {
  for (const r of rangees) r[4].forEach((s, i) => {
    const sym = s.includes('{c}');
    for (const [k, c] of sym ? [['G', 'left'], ['D', 'right']] : [['M', '']]) {
      const m = maillageDe(s.replace('{c}', c)); if (!m) { console.warn('  absent :', r[0], '←', s.replace('{c}', c)); continue; }
      noeuds.push({ nom: `${r[0]}__${k}__${i}`, pos: m.pos, idx: m.idx });
    }
  });
}

async function vaisseaux() {
  const { VAISSEAUX_HD } = await import('../js/anatomie/donnees-corps.js');
  for (const [type, fichier] of [['artere', 'arteres-bp3d.glb'], ['veine', 'veines-bp3d.glb']]) {
    const noeuds = []; ajouteRangees(noeuds, VAISSEAUX_HD.filter(r => r[5] === type));
    await couche(fichier, noeuds, { lisse: false, label: type === 'artere' ? 'artères' : 'veines', maxSommets: 6000 });
  }
  // couches fines : tous les autres fichiers des arbres « artère » (FMA50720) et « veine » (FMA50723), regroupés par côté et simplifiés
  const principaux = new Set();
  for (const r of VAISSEAUX_HD) for (const s of r[4]) for (const c of s.includes('{c}') ? ['left', 'right'] : ['']) { const f = bp.fichiers(s.replace('{c}', c)); if (f) f.forEach(x => principaux.add(x)); }
  for (const [racine, fichier, label] of [['FMA50720', 'arteres-fin-bp3d.glb', 'artères fines'], ['FMA50723', 'veines-fin-bp3d.glb', 'veines fines']]) {
    const fichiers = new Set(); for (const d of bp.descendants(racine)) for (const f of bp.fichiersId(d) || []) if (!principaux.has(f)) fichiers.add(f);
    const cotes = { G: [], D: [], M: [] };
    for (const f of fichiers) { const m = bp.maillageFichiers([f]); let cx = 0; for (let i = 0; i < m.pos.length; i += 3) cx += m.pos[i]; cx /= m.pos.length / 3; cotes[cx > .004 ? 'G' : cx < -.004 ? 'D' : 'M'].push(f); }
    const noeuds = [];
    for (const [k, l] of Object.entries(cotes)) { if (!l.length) continue; const m0 = bp.maillageFichiers(l), m = simplifier(m0.pos, m0.idx, .003); noeuds.push({ nom: `${racine === 'FMA50720' ? 'arteres-fines' : 'veines-fines'}__${k}__0`, pos: m.pos, idx: m.idx }); console.log('  ', label, k, l.length, 'fichiers :', m0.pos.length / 3, '→', m.pos.length / 3, 'sommets'); }
    await couche(fichier, noeuds, { lisse: false, label });
  }
}

async function organes() {
  const { ORGANES_HD } = await import('../js/anatomie/donnees-corps.js');
  const noeuds = []; ajouteRangees(noeuds, ORGANES_HD);
  for (const n of noeuds) if (n.pos.length / 3 > 20000) { const avant = n.pos.length / 3, m = simplifier(n.pos, n.idx, .0012); n.pos = m.pos; n.idx = m.idx; console.log('  ', n.nom, avant, '→', m.pos.length / 3, 'sommets'); }      // maillages très denses (cortex) : regroupement de sommets à 1,2 mm
  await couche('organes-bp3d.glb', noeuds, { lisse: false, label: 'organes', maxSommets: 15000 });
}
async function nerfs() {
  const { NERFS_HD } = await import('../js/anatomie/donnees-corps.js');
  const { NERFS_TRACES, tracer, tube } = await import('./traces-nerfs.mjs');
  const noeuds = []; ajouteRangees(noeuds, NERFS_HD);
  for (const t of NERFS_TRACES) for (const k of t.sym ? ['G', 'D'] : ['M']) {      // tracés reconstitués (voir traces-nerfs.mjs) : tubes placés sur les structures de BodyParts3D
    try { tracer(bp, t, k === 'D' ? 'D' : 'G').forEach(({ ligne, r }, i) => { const m = tube(ligne, r); noeuds.push({ nom: `${t.id}__${k}__${i}`, pos: m.pos, idx: m.idx }); }); }
    catch (e) { console.warn('  tracé ' + t.id + ' ' + k + ' : ' + e.message); }
  }
  await couche('nerfs-bp3d.glb', noeuds, { lisse: false, label: 'nerfs' });
}
if (quoi === 'arteres' || quoi === 'veines' || quoi === 'vaisseaux' || quoi === 'tout') await vaisseaux();
if (quoi === 'organes' || quoi === 'tout') await organes();
if (quoi === 'nerfs' || quoi === 'tout') await nerfs();
