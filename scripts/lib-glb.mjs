// Outils GLB sans dépendance pour les scripts de conversion d'Raylé (module partagé, pas chargé par l'application).
//   lireGLB(buffer)            → [{ nom, pos: Float32Array, nor: Float32Array, idx: Uint32Array }]  (GLB produit par ecrireGLB / convertir-squelette)
//   ecrireGLB(noeuds, options) → Buffer ; chaque nœud { nom, pos, nor, idx, fibre? } ; fibre = Float32Array (x : épiphyse 0..1, y : occlusion ambiante 0..1) → attribut _FIBRE
//   cuire(noeuds, options)     → ajoute à chaque nœud l'attribut « fibre » : épiphyse (os longs) et occlusion ambiante cuite (lancer de rayons sur une grille régulière)
// Écriture quantifiée (KHR_mesh_quantization) : positions en entiers 16 bits normalisés (échelle et décalage portés par le nœud), normales en 8 bits, _FIBRE en 16 bits.
import fs from 'node:fs';

const COMP = { UBYTE: 5121, FLOAT: 5126, UINT: 5125, USHORT: 5123, SHORT: 5122, BYTE: 5120 };

export function lireGLB(buf) {
  const lj = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + lj).toString('utf8'));
  const base = 20 + lj + 8;
  const TAB = { 5126: [Float32Array, 4], 5125: [Uint32Array, 4], 5123: [Uint16Array, 2], 5122: [Int16Array, 2], 5120: [Int8Array, 1], 5121: [Uint8Array, 1] };
  const NB = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const lire = ai => {                                    // → Float64Array dé-quantifié (ou entiers pour les indices), en tenant compte du stride
    const a = json.accessors[ai], v = json.bufferViews[a.bufferView], [Tab, oct] = TAB[a.componentType], n = NB[a.type], stride = v.byteStride || n * oct;
    const o = base + (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n), dv = new DataView(buf.buffer, buf.byteOffset);
    const get = { 5126: (p) => dv.getFloat32(p, true), 5125: p => dv.getUint32(p, true), 5123: p => dv.getUint16(p, true), 5122: p => dv.getInt16(p, true), 5120: p => dv.getInt8(p), 5121: p => dv.getUint8(p) }[a.componentType];
    const nrm = a.normalized ? { 5122: 32767, 5120: 127, 5123: 65535, 5121: 255 }[a.componentType] : 0;
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) { const x = get(o + i * stride + k * oct); out[i * n + k] = nrm ? Math.max(x / nrm, -1) : x; }
    return out;
  };
  return json.nodes.filter(n => n.mesh != null).map(n => {
    const p = json.meshes[n.mesh].primitives[0], a = p.attributes, S = n.scale || [1, 1, 1], T = n.translation || [0, 0, 0];
    const pos = lire(a.POSITION), nor = lire(a.NORMAL);
    for (let i = 0; i < pos.length; i++) pos[i] = pos[i] * S[i % 3] + T[i % 3];
    const f = a._FIBRE != null ? Float32Array.from(lire(a._FIBRE)) : null;
    return { nom: n.name, pos: Float32Array.from(pos), nor: Float32Array.from(nor), idx: Uint32Array.from(lire(p.indices)), fibre: f };
  });
}

export function normales(pos, idx) {
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;                       // pondérée par l'aire
    for (const j of [a, b, c]) { nor[j] += nx; nor[j + 1] += ny; nor[j + 2] += nz; }
  }
  const ok = new Uint8Array(nor.length / 3);
  for (let j = 0; j < nor.length; j += 3) { const l = Math.hypot(nor[j], nor[j + 1], nor[j + 2]); if (l > 1e-12) { ok[j / 3] = 1; nor[j] /= l; nor[j + 1] /= l; nor[j + 2] /= l; } }
  return reparerNormales(nor, idx, ok);
}

/** Un sommet qui n'appartient qu'à des triangles d'aire nulle n'a pas de normale : on lui donne la moyenne de celles de ses voisins (à défaut, le haut) */
export function reparerNormales(nor, idx, ok = null) {
  const bon = ok || Uint8Array.from({ length: nor.length / 3 }, (_, i) => Math.hypot(nor[3 * i], nor[3 * i + 1], nor[3 * i + 2]) > .5 ? 1 : 0);
  const acc = new Map();
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = idx[i + k]; if (bon[v]) continue;
    for (const w of [idx[i + (k + 1) % 3], idx[i + (k + 2) % 3]]) if (bon[w]) { const t = acc.get(v) || [0, 0, 0]; for (let c = 0; c < 3; c++) t[c] += nor[3 * w + c]; acc.set(v, t); }
  }
  for (let v = 0; v < bon.length; v++) if (!bon[v]) { const t = acc.get(v) || [0, 1, 0], l = Math.hypot(...t) || 1; for (let c = 0; c < 3; c++) nor[3 * v + c] = t[c] / l; }
  return nor;
}

/** Soudure des sommets confondus (positions identiques à 1e-5 près) : nécessaire pour des normales lisses */
export function souder(pos, idx) {
  const id = new Map(), np = [], remap = new Uint32Array(pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const k = Math.round(pos[3 * i] * 1e5) + ',' + Math.round(pos[3 * i + 1] * 1e5) + ',' + Math.round(pos[3 * i + 2] * 1e5);
    if (!id.has(k)) { id.set(k, np.length / 3); np.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); }
    remap[i] = id.get(k);
  }
  const ni = []; for (let i = 0; i < idx.length; i += 3) { const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]]; if (a !== b && b !== c && a !== c) ni.push(a, b, c); }
  return { pos: new Float32Array(np), idx: Uint32Array.from(ni) };
}

/** Subdivision de Loop (une passe) : adoucit les maillages grossiers. Les bords ouverts gardent leur position (règle simple de bord). */
export function loop(pos, idx) {
  const nv = pos.length / 3, nt = idx.length / 3, arete = new Map(), voisins = Array.from({ length: nv }, () => new Set());
  const cle = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
  const adj = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const a = idx[3 * t + k], b = idx[3 * t + (k + 1) % 3], c = idx[3 * t + (k + 2) % 3], e = cle(a, b);
    voisins[a].add(b); voisins[b].add(a);
    if (!adj.has(e)) adj.set(e, { a: Math.min(a, b), b: Math.max(a, b), opp: [c] }); else adj.get(e).opp.push(c);
  }
  const bord = new Uint8Array(nv); for (const e of adj.values()) if (e.opp.length !== 2) { bord[e.a] = 1; bord[e.b] = 1; }
  const P = Array.from(pos); const milieu = new Map(), parents = [];
  const g = (i, k) => pos[3 * i + k];
  for (const [e, o] of adj) {
    const m = [0, 1, 2].map(k => o.opp.length === 2 ? .375 * (g(o.a, k) + g(o.b, k)) + .125 * (g(o.opp[0], k) + g(o.opp[1], k)) : .5 * (g(o.a, k) + g(o.b, k)));
    milieu.set(e, P.length / 3); P.push(...m); parents.push(o.a, o.b);
  }
  for (let i = 0; i < nv; i++) {
    if (bord[i]) continue;
    const n = voisins[i].size; if (!n) continue; const beta = n === 3 ? 3 / 16 : 3 / (8 * n);      // un sommet orphelin (aucun triangle) garde sa position
    for (let k = 0; k < 3; k++) { let s = 0; for (const j of voisins[i]) s += g(j, k); P[3 * i + k] = (1 - n * beta) * g(i, k) + beta * s; }
  }
  const I = [];
  for (let t = 0; t < nt; t++) {
    const [a, b, c] = [idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]], ab = milieu.get(cle(a, b)), bc = milieu.get(cle(b, c)), ca = milieu.get(cle(c, a));
    I.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { pos: new Float32Array(P), idx: Uint32Array.from(I), parents: Int32Array.from(parents) };      // parents : pour le k-ième sommet ajouté (indice nv + k), les deux sommets de l'arête dont il est le milieu
}

/** Interpole un attribut par sommet (n composantes) sur un maillage subdivisé par loop() : sommets d'origine inchangés, milieux = moyenne des deux extrémités */
export function interpoler(attr, n, nv, parents) {
  const out = new Float32Array(attr.length + parents.length / 2 * n); out.set(attr);
  for (let k = 0; k < parents.length / 2; k++) for (let c = 0; c < n; c++) out[(nv + k) * n + c] = (attr[parents[2 * k] * n + c] + attr[parents[2 * k + 1] * n + c]) / 2;
  return out;
}

// ───────── épiphyse et occlusion ambiante ─────────
function axePrincipal(pos) {
  const n = pos.length / 3, c = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += pos[3 * i + k] / n;
  const m = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < n; i++) { const x = pos[3 * i] - c[0], y = pos[3 * i + 1] - c[1], z = pos[3 * i + 2] - c[2]; m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z; }
  let v = [1, .7, .4]; for (let it = 0; it < 40; it++) { const w = [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[1] * v[0] + m[3] * v[1] + m[4] * v[2], m[2] * v[0] + m[4] * v[1] + m[5] * v[2]]; const l = Math.hypot(...w) || 1; v = w.map(x => x / l); }
  let mn = 1e9, mx = -1e9, r = 0; for (let i = 0; i < n; i++) { const t = (pos[3 * i] - c[0]) * v[0] + (pos[3 * i + 1] - c[1]) * v[1] + (pos[3 * i + 2] - c[2]) * v[2]; mn = Math.min(mn, t); mx = Math.max(mx, t); r += Math.hypot(pos[3 * i] - c[0] - t * v[0], pos[3 * i + 1] - c[1] - t * v[1], pos[3 * i + 2] - c[2] - t * v[2]); }
  return { c, v, mn, mx, rayon: r / n };
}
const lisse = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

/** Épiphyse : os long (longueur ≥ 4 × rayon moyen) → 0 au milieu de la diaphyse, 1 aux extrémités ; os court ou plat : 0,35 partout (os spongieux sous une fine corticale) */
export function epiphyse(pos) {
  const n = pos.length / 3, out = new Float32Array(n), a = axePrincipal(pos), long = (a.mx - a.mn) / (a.rayon || 1) > 7;
  for (let i = 0; i < n; i++) {
    if (!long) { out[i] = .35; continue; }
    const t = ((pos[3 * i] - a.c[0]) * a.v[0] + (pos[3 * i + 1] - a.c[1]) * a.v[1] + (pos[3 * i + 2] - a.c[2]) * a.v[2] - a.mn) / (a.mx - a.mn);
    out[i] = Math.max(lisse(.2, .04, t), lisse(.8, .96, t));
  }
  return out;
}

/** Occlusion ambiante cuite : pour chaque sommet, `rayons` directions dans l'hémisphère (spirale de Fibonacci, repère propre à la normale) ; la fraction de rayons arrêtés avant `portee` (en unités du modèle).
    Tous les nœuds passés ensemble s'occultent mutuellement (une côte ombre sa voisine, le crâne ombre la mandibule). Grille régulière + parcours de voxels (DDA). Renvoie un Float32Array par nœud. */
export function occlusion(noeuds, { rayons = 24, portee = .05, cellule = null } = {}) {
  const tris = []; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const n of noeuds) {
    for (let i = 0; i < n.idx.length; i += 3) { const t = new Float32Array(9); for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) t[3 * k + j] = n.pos[3 * n.idx[i + k] + j]; tris.push(t); }
    for (let i = 0; i < n.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], n.pos[i + k]); mx[k] = Math.max(mx[k], n.pos[i + k]); }
  }
  const taille = mx.map((x, k) => x - mn[k]), cel = cellule || Math.max(portee / 3, Math.cbrt(taille[0] * taille[1] * taille[2] / Math.max(1, tris.length)) * 2);
  const dim = taille.map(t => Math.max(1, Math.ceil(t / cel) + 1)), cases = new Map();
  const ci = (x, y, z) => (x * dim[1] + y) * dim[2] + z;
  tris.forEach((t, id) => {
    const lo = [0, 1, 2].map(k => Math.floor((Math.min(t[k], t[3 + k], t[6 + k]) - mn[k]) / cel)), hi = [0, 1, 2].map(k => Math.floor((Math.max(t[k], t[3 + k], t[6 + k]) - mn[k]) / cel));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const c = ci(x, y, z); let l = cases.get(c); if (!l) cases.set(c, l = []); l.push(id); }
  });
  const marque = new Int32Array(tris.length).fill(-1); let numero = 0;
  const frappe = (o, d, maxi) => {                         // vrai si un triangle coupe le segment [o, o + maxi·d]
    numero++;
    let x = Math.floor((o[0] - mn[0]) / cel), y = Math.floor((o[1] - mn[1]) / cel), z = Math.floor((o[2] - mn[2]) / cel);
    const pas = d.map(v => v > 0 ? 1 : -1), tD = [0, 1, 2].map(k => Math.abs(d[k]) < 1e-12 ? 1e30 : cel / Math.abs(d[k]));
    const cur = [x, y, z], tM = [0, 1, 2].map(k => { const bord = mn[k] + (cur[k] + (pas[k] > 0 ? 1 : 0)) * cel; return Math.abs(d[k]) < 1e-12 ? 1e30 : (bord - o[k]) / d[k]; });
    for (;;) {
      if (cur[0] < 0 || cur[1] < 0 || cur[2] < 0 || cur[0] >= dim[0] || cur[1] >= dim[1] || cur[2] >= dim[2]) return false;
      const l = cases.get(ci(cur[0], cur[1], cur[2]));
      if (l) for (const id of l) {
        if (marque[id] === numero) continue; marque[id] = numero;
        const t = tris[id], e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-14) continue;
        const s = [o[0] - t[0], o[1] - t[1], o[2] - t[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det; if (u < 0 || u > 1) continue;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (v < 0 || u + v > 1) continue;
        const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; if (tt > 1e-9 && tt < maxi) return true;
      }
      const k = tM[0] < tM[1] ? (tM[0] < tM[2] ? 0 : 2) : (tM[1] < tM[2] ? 1 : 2);
      if (tM[k] > maxi) return false; cur[k] += pas[k]; tM[k] += tD[k];
    }
  };
  const dirs = Array.from({ length: rayons }, (_, i) => { const u = (i + .5) / rayons, phi = i * 2.399963; const r = Math.sqrt(u), z = Math.sqrt(1 - u); return [r * Math.cos(phi), r * Math.sin(phi), z]; });   // répartition cosinus
  return noeuds.map(n => {
    const m = n.pos.length / 3, ao = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const nx = n.nor[3 * i], ny = n.nor[3 * i + 1], nz = n.nor[3 * i + 2];
      const a = Math.abs(nx) < .9 ? [1, 0, 0] : [0, 1, 0], t1 = [ny * a[2] - nz * a[1], nz * a[0] - nx * a[2], nx * a[1] - ny * a[0]], l1 = Math.hypot(...t1), T1 = t1.map(x => x / l1);
      const T2 = [ny * T1[2] - nz * T1[1], nz * T1[0] - nx * T1[2], nx * T1[1] - ny * T1[0]];
      const o = [n.pos[3 * i] + nx * portee * .004, n.pos[3 * i + 1] + ny * portee * .004, n.pos[3 * i + 2] + nz * portee * .004];
      let touche = 0;
      for (const d of dirs) { const w = [0, 1, 2].map(k => T1[k] * d[0] + T2[k] * d[1] + [nx, ny, nz][k] * d[2]); if (frappe(o, w, portee)) touche++; }
      ao[i] = touche / rayons;
    }
    return ao;
  });
}

/** Ajoute n.fibre (Float32Array 2 × sommets : épiphyse, occlusion) à chaque nœud */
export function cuire(noeuds, opts = {}) {
  const ao = occlusion(noeuds, opts);
  noeuds.forEach((n, i) => {
    const e = epiphyse(n.pos), f = new Float32Array(2 * e.length);
    for (let j = 0; j < e.length; j++) { f[2 * j] = e[j]; f[2 * j + 1] = Math.min(1, ao[i][j] * (opts.gain || 1.25)); }
    n.fibre = f;
  });
  return noeuds;
}

export function ecrireGLB(noeuds, { droits = '', generateur = 'Rayle scripts/lib-glb.mjs', quantifier = true, extras = null, sansNormales = false } = {}) {
  const bin = []; let off = 0; const vues = [], acc = [], meshes = [], noeudsJ = [];
  const pousse = (typed, cible) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), pad = (4 - (b.length % 4)) % 4; vues.push({ buffer: 0, byteOffset: off, byteLength: b.length, target: cible }); bin.push(b, Buffer.alloc(pad)); off += b.length + pad; return vues.length - 1; };
  for (const n of noeuds) {
    const nv = n.pos.length / 3, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let j = 0; j < n.pos.length; j += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], n.pos[j + k]); mx[k] = Math.max(mx[k], n.pos[j + k]); }
    const attrs = {}; const nd = { name: n.nom, mesh: meshes.length };
    if (quantifier) {
      const c = mn.map((x, k) => (x + mx[k]) / 2), s = Math.max(...mx.map((x, k) => (x - mn[k]) / 2), 1e-9) * 1.0001;
      const P = new Int16Array(nv * 4);                              // 4 composantes : alignement sur 4 octets (la 4e est ignorée par le décalage de stride)
      for (let j = 0; j < nv; j++) for (let k = 0; k < 3; k++) P[4 * j + k] = Math.round((n.pos[3 * j + k] - c[k]) / s * 32767);
      const vp = pousse(P, 34962); vues[vp].byteStride = 8;
      acc.push({ bufferView: vp, componentType: COMP.SHORT, normalized: true, count: nv, type: 'VEC3' }); attrs.POSITION = acc.length - 1;
      if (!sansNormales) {
        const N = new Int8Array(nv * 4); for (let j = 0; j < nv; j++) for (let k = 0; k < 3; k++) N[4 * j + k] = Math.round(n.nor[3 * j + k] * 127);
        const vn = pousse(N, 34962); vues[vn].byteStride = 4;
        acc.push({ bufferView: vn, componentType: COMP.BYTE, normalized: true, count: nv, type: 'VEC3' }); attrs.NORMAL = acc.length - 1;
      }
      nd.translation = c; nd.scale = [s, s, s];
    } else {
      const vp = pousse(Float32Array.from(n.pos), 34962); acc.push({ bufferView: vp, componentType: COMP.FLOAT, count: nv, type: 'VEC3', min: mn, max: mx }); attrs.POSITION = acc.length - 1;
      const vn = pousse(Float32Array.from(n.nor), 34962); acc.push({ bufferView: vn, componentType: COMP.FLOAT, count: nv, type: 'VEC3' }); attrs.NORMAL = acc.length - 1;
    }
    if (n.fibre) {
      const F = new Uint16Array(nv * 2); for (let j = 0; j < nv * 2; j++) F[j] = Math.round(Math.min(Math.max(n.fibre[j], 0), 1) * 65535);
      const vf = pousse(F, 34962); acc.push({ bufferView: vf, componentType: COMP.USHORT, normalized: true, count: nv, type: 'VEC2' }); attrs._FIBRE = acc.length - 1;
    }
    if (n.peau) {       // peau : 4 ancres par sommet (indices 8 bits, poids 8 bits normalisés) → _SKI, _SKW ; voir scripts/convertir-corps-bp3d.mjs
      const vi_ = pousse(Uint8Array.from(n.peau.idx), 34962); acc.push({ bufferView: vi_, componentType: COMP.UBYTE, count: nv, type: 'VEC4' }); attrs._SKI = acc.length - 1;
      const vw_ = pousse(Uint8Array.from(n.peau.poids), 34962); acc.push({ bufferView: vw_, componentType: COMP.UBYTE, normalized: true, count: nv, type: 'VEC4' }); attrs._SKW = acc.length - 1;
    }
    const grand = nv > 65535, I = grand ? Uint32Array.from(n.idx) : Uint16Array.from(n.idx), vi = pousse(I, 34963);
    acc.push({ bufferView: vi, componentType: grand ? COMP.UINT : COMP.USHORT, count: I.length, type: 'SCALAR' });
    meshes.push({ name: n.nom, primitives: [{ attributes: attrs, indices: acc.length - 1, mode: 4 }] }); noeudsJ.push(nd);
  }
  const json = { asset: Object.assign({ version: '2.0', generator: generateur, copyright: droits }, extras ? { extras } : {}), scene: 0, scenes: [{ nodes: noeudsJ.map((_, i) => i) }], nodes: noeudsJ, meshes, accessors: acc, bufferViews: vues, buffers: [{ byteLength: off }] };
  if (quantifier) json.extensionsUsed = json.extensionsRequired = ['KHR_mesh_quantization'];
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const corps = Buffer.concat(bin), h = Buffer.alloc(12), c1 = Buffer.alloc(8), c2 = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + corps.length, 8);
  c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4); c2.writeUInt32LE(corps.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, c1, js, c2, corps]);
}

export const lireFichier = f => lireGLB(fs.readFileSync(f));

/** Simplification par regroupement de sommets : les sommets d'une même cellule cubique (côté `cellule`, en unités du modèle) sont fusionnés en leur barycentre ; les triangles dégénérés disparaissent.
    Sert aux réseaux de vaisseaux fins (tubes de quelques millimètres) : un maillage de plusieurs centaines de milliers de triangles devient léger sans perdre le tracé. */
export function simplifier(pos, idx, cellule) {
  const n = pos.length / 3, nouveau = new Int32Array(n), cles = new Map(), cx = [], cy = [], cz = [], cn = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(pos[3 * i] / cellule) + ',' + Math.floor(pos[3 * i + 1] / cellule) + ',' + Math.floor(pos[3 * i + 2] / cellule);
    let j = cles.get(k); if (j === undefined) { j = cx.length; cles.set(k, j); cx.push(0); cy.push(0); cz.push(0); cn.push(0); }
    nouveau[i] = j; cx[j] += pos[3 * i]; cy[j] += pos[3 * i + 1]; cz[j] += pos[3 * i + 2]; cn[j]++;
  }
  const P = new Float32Array(cx.length * 3); for (let j = 0; j < cx.length; j++) { P[3 * j] = cx[j] / cn[j]; P[3 * j + 1] = cy[j] / cn[j]; P[3 * j + 2] = cz[j] / cn[j]; }
  const I = [], vus = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = nouveau[idx[t]], b = nouveau[idx[t + 1]], c = nouveau[idx[t + 2]]; if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(','); if (vus.has(k)) continue; vus.add(k); I.push(a, b, c);
  }
  return { pos: P, idx: Uint32Array.from(I) };
}
