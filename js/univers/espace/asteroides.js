// Ceinture d'astéroïdes : des rochers à la forme irrégulière (3 variantes, relief et texture rocheuse procéduraux), en instances, qui tournent sur eux-mêmes et
// parcourent leur orbite (période = a^1,5 années, loi de Kepler). Entre Mars et Jupiter : de 2,1 à 3,3 UA, inclinés de quelques degrés, avec les lacunes de Kirkwood
// (résonances avec Jupiter) retirées. La taille des rochers est exagérée pour être visible ; Cérès et Vesta sont à part (voir systeme.js).
// creerCeinture(THREE, {nb, uaUnites, taille}) → { groupe, maj(tSimSecondes, t), detruire() }
const KIRKWOOD = [[2.48, 2.52], [2.80, 2.84], [2.95, 3.0], [3.24, 3.28]];     // lacunes (UA) : résonances 3:1, 5:2, 7:3, 2:1 avec Jupiter

function bruitHash(x, y, z, s) { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453; return n - Math.floor(n); }
function bruit3(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => bruitHash(xi + a, yi + b, zi + c, s), m = (p, q, t) => p + (q - p) * t;
  return m(m(m(h(0, 0, 0), h(1, 0, 0), u), m(h(0, 1, 0), h(1, 1, 0), u), v), m(m(h(0, 0, 1), h(1, 0, 1), u), m(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
// rocher irrégulier : icosaèdre subdivisé, déformé par du bruit multi-échelle et aplati/allongé
export function geometrieRocher(THREE, graine, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  const al = [1 + (graine % 3) * .25, .75 + ((graine * 7) % 5) * .07, .8 + ((graine * 3) % 4) * .08];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d = 1 + .34 * (bruit3(v.x * 1.6 + graine, v.y * 1.6, v.z * 1.6, graine) - .5) * 2 + .16 * (bruit3(v.x * 4.2, v.y * 4.2 + graine, v.z * 4.2, graine + 1) - .5) * 2 + .06 * (bruit3(v.x * 11, v.y * 11, v.z * 11 + graine, graine + 2) - .5) * 2;
    p.setXYZ(i, v.x * d * al[0], v.y * d * al[1], v.z * d * al[2]);
  }
  g.computeVertexNormals(); return g;
}
// texture rocheuse : grains, taches claires/sombres et petits cratères (canvas 256×256, répétable)
export function textureRoche(THREE, graine = 1, couleur = [128, 118, 104]) {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), im = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = bruit3(x / 32, y / 32, graine, graine) * .5 + bruit3(x / 11, y / 11, graine, 3) * .3 + bruit3(x / 4, y / 4, graine, 5) * .2, k = .55 + a * .8, i = (y * N + x) * 4;
    im.data[i] = couleur[0] * k; im.data[i + 1] = couleur[1] * k; im.data[i + 2] = couleur[2] * k; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  for (let c = 0; c < 22; c++) {                                  // cratères : disque sombre + croissant clair
    const x = Math.random() * N, y = Math.random() * N, r = 3 + Math.random() * 14;
    for (const dx of [-N, 0, N]) { g.fillStyle = 'rgba(20,18,15,.28)'; g.beginPath(); g.arc(x + dx, y, r, 0, 6.2832); g.fill(); g.fillStyle = 'rgba(210,200,185,.16)'; g.beginPath(); g.arc(x + dx - r * .18, y - r * .18, r * .86, .6, 2.9); g.lineWidth = 1.2; g.strokeStyle = 'rgba(220,210,195,.35)'; g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function creerCeinture(THREE, { nb = 900, uaUnites = 60, taille = 4 } = {}) {
  const E = { taille };                                         // facteur d'agrandissement des rochers (4 : didactique, 1 : vraie échelle des rochers affichés)
  const groupe = new THREE.Group(); groupe.name = 'ceinture';
  const tex = textureRoche(THREE, 7), mat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2.2, roughness: .95, metalness: .05, flatShading: false });
  const variantes = [0, 1, 2].map(i => geometrieRocher(THREE, 3 + i * 5, nb > 600 ? 2 : 1));
  const parV = [Math.ceil(nb / 3), Math.ceil(nb / 3), nb - 2 * Math.ceil(nb / 3)], meshes = [], donnees = [];
  const rnd = (() => { let s = 20241; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const gauss = () => { let u = 0; for (let k = 0; k < 4; k++) u += rnd(); return (u - 2) * 1.2; };
  variantes.forEach((geo, vi) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, parV[vi])); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); groupe.add(m); meshes.push(m);
    const liste = [];
    for (let i = 0; i < parV[vi]; i++) {
      let a; do { a = 2.1 + 1.2 * (rnd() * .55 + rnd() * .45); } while (KIRKWOOD.some(([x, y]) => a > x && a < y));
      liste.push({ a, e: rnd() * .22, inc: gauss() * 5.5 * Math.PI / 180, noeud: rnd() * 6.2832, M0: rnd() * 6.2832, peri: rnd() * 6.2832, spin: (rnd() - .5) * 3, axe: new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize(), ech: .12 + Math.pow(rnd(), 3.2) * .55 });
    }
    donnees.push(liste);
  });
  const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let derniere = -1;
  function maj(tSim, t) {
    if (t - derniere < .033) return; derniere = t;                 // 30 mises à jour par seconde suffisent
    meshes.forEach((m, vi) => {
      const L = donnees[vi];
      for (let i = 0; i < L.length; i++) {
        const o = L[i], an = o.a, T = Math.pow(an, 1.5) * 365.25 * 86400, M = o.M0 + 6.2832 * (tSim / T);
        const v = M + 2 * o.e * Math.sin(M), r = an * (1 - o.e * o.e) / (1 + o.e * Math.cos(v)), u = v + o.peri;
        const cx = Math.cos(o.noeud), sx = Math.sin(o.noeud), ci = Math.cos(o.inc), si = Math.sin(o.inc), cu = Math.cos(u), su = Math.sin(u);
        const X = r * (cx * cu - sx * su * ci), Y = r * (sx * cu + cx * su * ci), Z = r * su * si;
        p.set(X * uaUnites, Z * uaUnites, -Y * uaUnites);          // écliptique → monde (y vers le haut)
        q.setFromAxisAngle(o.axe, o.spin * (t * .4 + o.M0)); s.setScalar(o.ech * E.taille);
        M4.compose(p, q, s); m.setMatrixAt(i, M4);
      }
      m.instanceMatrix.needsUpdate = true;
    });
  }
  // poussière : un nuage de points, visible de loin quand les rochers sont trop petits pour être vus (la ceinture entière en une image)
  const nP = Math.max(2500, nb * 5), pp = new Float32Array(nP * 3), rp = (() => { let s = 777; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  for (let i = 0; i < nP; i++) {
    let r; do { r = 2.1 + 1.2 * (rp() * .55 + rp() * .45); } while (KIRKWOOD.some(([x, y]) => r > x && r < y));
    const ang = rp() * 6.2832, h = (rp() - .5) * (rp() - .5) * .9;
    pp[3 * i] = Math.cos(ang) * r * uaUnites; pp[3 * i + 1] = h * uaUnites; pp[3 * i + 2] = Math.sin(ang) * r * uaUnites;
  }
  const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const mp = new THREE.PointsMaterial({ color: 0xcdbb9a, size: 1.5, sizeAttenuation: false, transparent: true, opacity: .55, depthWrite: false });
  const poussiere = new THREE.Points(gp, mp); poussiere.frustumCulled = false; groupe.add(poussiere);
  const omega = 6.2832 / (Math.pow(2.7, 1.5) * 365.25 * 86400);          // vitesse angulaire moyenne : le nuage tourne avec la ceinture
  function maj2(tSim, t) { poussiere.rotation.y = -omega * tSim; maj(tSim, t); }
  function reglerTaille(k) { E.taille = k; }
  maj(0, 1);
  function detruire() { gp.dispose(); mp.dispose(); variantes.forEach(g => g.dispose()); mat.dispose(); tex.dispose(); meshes.forEach(m => m.dispose()); }
  return { groupe, maj: maj2, detruire, nombre: nb, textureRoche: tex, reglerTaille, poussiere };
}
