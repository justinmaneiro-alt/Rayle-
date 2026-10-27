/* ═════════════ RÉSEAU DE NEURONES DU SOLEIL (génération pure, testée sous Node : galaxie/tests/reseau-test.mjs) ═════════════
   Structure : un cœur très dense, plusieurs COUCHES concentriques (des « cages » aux sommets reliés par de fins filaments droits,
   d'où un contour irrégulier presque polygonal), des rayons qui relient les couches, des ramifications, et des neurones diffus
   dont la densité diminue vers l'extérieur. */
export const NB_NEURONES_MAX = 12000;

/* Les couches concentriques : rayon moyen, nombre de sommets de la cage. */
export const COUCHES = [{ r: 0.42, V: 20 }, { r: 0.70, V: 36 }, { r: 1.0, V: 58 }];

/* ── Génération du réseau (déterministe : le même nuage à chaque lancement) ── */
export function generateur(graine) { let a = graine >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function genererReseau(N = NB_NEURONES_MAX, graine = 11) {
  const r = generateur(graine);
  const gauss = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const dirAlea = () => { const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; };
  const norme = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const pos = new Float32Array(N * 3), poids = new Float32Array(N), sommet = new Uint8Array(N);
  let n = 0;
  const ajouter = (x, y, z, w) => { if (n >= N) return -1; pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; poids[n] = w; return n++; };
  const chaines = [], tipes = [];   // chaque chaîne = suite de nœuds reliés (un filament) : [indices] ; type : 2 = cage (contour des couches), 1 = ramification
  // Rayon d'une couche dans une direction : une enveloppe irrégulière (bosses larges), pas une sphère
  const surface = (k, d) => COUCHES[k].r * (0.9 + 0.22 * 0.5 * (Math.sin(d[0] * 2.3 + k * 1.7) * Math.cos(d[1] * 2.9 - k) + Math.sin(d[2] * 3.7 + d[0] * 1.3 + k * 2.1)));

  // 1. Cœur très dense
  for (let i = 0; i < N * 0.27; i++) ajouter(gauss() * 0.15, gauss() * 0.13, gauss() * 0.14, 0.6);
  const nCoeur = n;
  // 2. Les couches : des sommets (neurones « hubs ») reliés à leurs voisins par des filaments droits (contour presque polygonal)
  const cages = COUCHES.map((C, k) => {
    const phi = Math.PI * (3 - Math.sqrt(5)), ids = [], dirs = [];
    for (let i = 0; i < C.V; i++) {
      const y = 1 - (i + 0.5) / C.V * 2, rr = Math.sqrt(1 - y * y), th = phi * i + k * 0.9;
      const d = norme([Math.cos(th) * rr + gauss() * 0.13, y + gauss() * 0.13, Math.sin(th) * rr + gauss() * 0.13]);
      const s = surface(k, d) * (0.93 + r() * 0.14);
      const id = ajouter(d[0] * s, d[1] * s, d[2] * s, 1.0); sommet[id] = 1; ids.push(id); dirs.push(d);
    }
    return { ids, dirs };
  });
  const cleC = (a, b) => (a < b ? a + '-' + b : b + '-' + a), liaisons = new Set();
  const relier = (a, b, pas, ecart) => {   // un filament presque droit entre deux neurones, avec des neurones le long du trajet
    const kk = cleC(a, b); if (liaisons.has(kk)) return; liaisons.add(kk);
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const L = Math.hypot(bx - ax, by - ay, bz - az), m = Math.max(1, Math.round(L / pas)), chaine = [a];
    for (let i = 1; i < m; i++) { const t = i / m, id = ajouter(ax + (bx - ax) * t + gauss() * ecart, ay + (by - ay) * t + gauss() * ecart, az + (bz - az) * t + gauss() * ecart, 0.42 + r() * 0.25); if (id < 0) break; chaine.push(id); }
    chaine.push(b); chaines.push(chaine); tipes.push(2);
  };
  cages.forEach((cg, k) => {
    // chaque sommet est relié à ses 3 plus proches voisins de la même couche
    cg.ids.forEach((a, i) => {
      const voisins = cg.ids.map((b, j) => [Math.hypot(cg.dirs[i][0] - cg.dirs[j][0], cg.dirs[i][1] - cg.dirs[j][1], cg.dirs[i][2] - cg.dirs[j][2]), b]).filter(x => x[1] !== a).sort((x, y) => x[0] - y[0]);
      for (const [, b] of voisins.slice(0, 3)) relier(a, b, 0.045, 0.006);
    });
    // rayons : chaque sommet est aussi relié au sommet le plus proche de la couche inférieure (ou au cœur)
    cg.ids.forEach((a, i) => {
      if (k === 0) { relier(a, Math.floor(r() * nCoeur), 0.05, 0.01); return; }
      const bas = cages[k - 1];
      let meilleur = 0, dm = 1e9; bas.dirs.forEach((d, j) => { const dd = Math.hypot(d[0] - cg.dirs[i][0], d[1] - cg.dirs[i][1], d[2] - cg.dirs[i][2]); if (dd < dm) { dm = dd; meilleur = j; } });
      relier(a, bas.ids[meilleur], 0.05, 0.01);
    });
  });
  // 3. Neurones répartis sur chaque couche (on voit les enveloppes)
  cages.forEach((cg, k) => { for (let i = 0; i < N * 0.035; i++) { const d = dirAlea(), s = surface(k, d) * (1 + gauss() * 0.035); ajouter(d[0] * s, d[1] * s, d[2] * s, 0.42); } });
  // 4. Ramifications fines qui partent du cœur et des couches
  const depart = n;
  const budgetDendrites = Math.floor(N * 0.66);
  let tentatives = 0;
  while (n < budgetDendrites && tentatives++ < 3000) {
    const i0 = Math.floor(Math.pow(r(), 1.5) * depart);
    const x = pos[i0 * 3], y = pos[i0 * 3 + 1], z = pos[i0 * 3 + 2];
    const lx = Math.hypot(x, y, z) || 1;
    let pd = [x / lx + gauss() * 0.5, y / lx + gauss() * 0.5, z / lx + gauss() * 0.5], px = x, py = y, pz = z, prec = i0;
    const chaine = [i0];
    for (let reste = 8 + Math.floor(r() * 14); reste > 0 && n < budgetDendrites; reste--) {
      const a = dirAlea(), ld = Math.hypot(...pd) || 1;
      pd = [pd[0] / ld * 0.8 + a[0] * 0.4, pd[1] / ld * 0.8 + a[1] * 0.4, pd[2] / ld * 0.8 + a[2] * 0.4];
      const l = Math.hypot(...pd) || 1, pas = 0.025 + r() * 0.02;
      px += pd[0] / l * pas; py += pd[1] / l * pas; pz += pd[2] / l * pas;
      if (Math.hypot(px, py, pz) > 1.15) break;
      const id = ajouter(px, py, pz, 0.28 + 0.3 * Math.max(0, 1 - Math.hypot(px, py, pz))); if (id < 0) break;
      chaine.push(id); prec = id;
    }
    if (chaine.length > 2) { chaines.push(chaine); tipes.push(1); }
  }
  // 5. Neurones diffus : la densité (par volume) diminue vers l'extérieur
  while (n < N) { const d = dirAlea(), k = Math.min(1.25, -0.32 * Math.log(1 - r() * 0.985)); ajouter(d[0] * k, d[1] * k, d[2] * k, 0.25); }
  // 6. Déformation globale légère (pas une sphère parfaite) ; le cœur brille plus
  const ca = Math.cos(0.5), sa = Math.sin(0.5);
  for (let i = 0; i < N; i++) {
    let x = pos[i * 3] * 1.2, y = pos[i * 3 + 1] * 0.85, z = pos[i * 3 + 2];
    pos[i * 3] = x * ca - y * sa; pos[i * 3 + 1] = x * sa + y * ca; pos[i * 3 + 2] = z;
    poids[i] = Math.min(1.8, poids[i] + 0.9 * Math.exp(-Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) * 4.5));
  }
  // 7. Connexions : segments des filaments + plus proches voisins (grille spatiale)
  const aretes = [], vus = new Set();
  const cle = (a, b) => (a < b ? a * N + b : b * N + a);
  chaines.forEach((ch, c) => { const L = ch.length - 1; for (let k = 0; k < L; k++) { const a = ch[k], b = ch[k + 1], kk = cle(a, b); if (vus.has(kk)) continue; vus.add(kk); aretes.push({ a, b, chaine: c, u0: k / L, u1: (k + 1) / L, long: L, tipe: tipes[c] }); } });
  const T = 0.075, grille = new Map(), gk = (x, y, z) => Math.floor(x / T) + ',' + Math.floor(y / T) + ',' + Math.floor(z / T);
  for (let i = 0; i < N; i++) { const k = gk(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); (grille.get(k) || grille.set(k, []).get(k)).push(i); }
  const nChaines = chaines.length;
  for (let i = 0; i < N; i++) {
    const cx = Math.floor(pos[i * 3] / T), cy = Math.floor(pos[i * 3 + 1] / T), cz = Math.floor(pos[i * 3 + 2] / T);
    const voisins = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = grille.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)); if (!l) continue;
      for (const j of l) if (j !== i) { const d = Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 1] - pos[j * 3 + 1], pos[i * 3 + 2] - pos[j * 3 + 2]); if (d < T * 1.6) voisins.push([d, j]); }
    }
    voisins.sort((a, b) => a[0] - b[0]);
    const rr0 = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    // moins de liens parasites hors du cœur : les couches ressortent
    for (const [, j] of voisins.slice(0, rr0 < 0.45 ? 2 : 1)) { const kk = cle(i, j); if (vus.has(kk)) continue; vus.add(kk); aretes.push({ a: i, b: j, chaine: nChaines + aretes.length, u0: 0, u1: 1, long: 1, tipe: 0 }); }
  }
  // 8. Ordre aléatoire des neurones : un sous-ensemble (qualité réduite) reste réparti partout
  const perm = new Uint32Array(N); for (let i = 0; i < N; i++) perm[i] = i;
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }   // perm[nouveau] = ancien
  const nouveau = new Uint32Array(N); for (let i = 0; i < N; i++) nouveau[perm[i]] = i;
  const pos2 = new Float32Array(N * 3), poids2 = new Float32Array(N), hub2 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = perm[i]; pos2[i * 3] = pos[o * 3]; pos2[i * 3 + 1] = pos[o * 3 + 1]; pos2[i * 3 + 2] = pos[o * 3 + 2]; poids2[i] = poids[o];
    const rr = Math.hypot(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]);
    hub2[i] = (sommet[o] || (rr < 1.0 && ((o * 2654435761) >>> 0) % 100 < 5)) ? 1 : 0;   // les sommets des couches et ~5 % des autres : neurones plus gros et plus blancs
  }
  for (const e of aretes) { e.a = nouveau[e.a]; e.b = nouveau[e.b]; e.max = Math.max(e.a, e.b); }
  aretes.sort((x, y) => x.max - y.max);   // un préfixe = toutes les connexions entre neurones d'indice < k
  const maxParArete = new Uint32Array(aretes.length); aretes.forEach((e, i) => { maxParArete[i] = e.max; });
  return { N, pos: pos2, poids: poids2, hub: hub2, aretes, maxParArete, filaments: chaines.length, sommets: cages.map(c => c.ids.length) };
}

/* Nombre d'arêtes entièrement contenues dans les k premiers neurones (recherche dichotomique). */
export function aretesPour(reseau, k) {
  let lo = 0, hi = reseau.maxParArete.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (reseau.maxParArete[m] < k) lo = m + 1; else hi = m; }
  return lo;
}
