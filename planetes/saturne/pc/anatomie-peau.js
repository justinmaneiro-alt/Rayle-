import * as THREE from 'three';
import { construireGrille, poidsSommets, axePrincipal, extremites, volumeMuscle } from './anatomie-peau-calcul.js';
import { SEGMENTS, INDEX_SEG } from './anatomie-corps.js';

/* ═════════════ ANATOMIE : HABILLAGE DES STRUCTURES MOLLES SUR LE GPU (Phase C) ═════════════
   Les os suivent leur segment (matrice par pièce). Muscles, ligaments, vaisseaux, nerfs et organes sont « habillés » : au premier mouvement, chaque pièce reçoit des poids de proximité aux
   segments osseux (anatomie-peau-calcul.js), une géométrie en repère du modèle et un nuanceur qui déforme les sommets avec les matrices des 20 segments (uniforme partagé `uBones`, donc
   aussi pour la vue rapprochée du mouvement, qui utilise un second moteur de rendu). Les muscles ont en plus une correction de volume (ventre qui gonfle quand il se raccourcit).
   Le calcul des poids est découpé en lots (quelques millisecondes par image) : le mouvement démarre tout de suite, les pièces pas encore habillées suivent leur segment rigidement. */
const N = SEGMENTS.length;
export function creerPeau({ anat }) {
  const bones = { value: new Float32Array(N * 16) }; for (let i = 0; i < N; i++) { bones.value[16 * i] = bones.value[16 * i + 5] = bones.value[16 * i + 10] = bones.value[16 * i + 15] = 1; }
  const etat = { grille: null, equipes: new Map(), file: [], enCours: false, nOs: 0 };
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), n3 = new THREE.Matrix3();

  /* positions et normales d'une pièce en repère du modèle (matrice locale du maillage appliquée : les modèles Meshopt sont quantifiés avec une matrice de dé-quantification) */
  function decoder(mesh, avecNormales = true) {
    const g = mesh.geometry, pa = g.attributes.position, na = g.attributes.normal, n = pa.count, P = new Float32Array(3 * n), N2 = avecNormales && na ? new Float32Array(3 * n) : null;
    m4.copy(mesh.matrix); n3.getNormalMatrix(m4);
    for (let i = 0; i < n; i++) { v3.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(m4); P[3 * i] = v3.x; P[3 * i + 1] = v3.y; P[3 * i + 2] = v3.z; if (N2) { v3.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix3(n3).normalize(); N2[3 * i] = v3.x; N2[3 * i + 1] = v3.y; N2[3 * i + 2] = v3.z; } }
    return { P, N: N2 };
  }
  /* points d'os (un sur `pas`) avec leur index de segment : base de la pondération par proximité */
  function preparerOs(corps, pas = 3) {
    const pts = [], segs = [];
    for (const [id, ms] of anat.etat.meshs) { const seg = corps.segmentOs[id]; if (!seg) continue; for (const m of ms) { const { P } = decoder(m, false); for (let i = 0; i < P.length / 3; i += pas) { pts.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); segs.push(INDEX_SEG[seg]); } } }
    etat.grille = construireGrille(Float32Array.from(pts), Uint8Array.from(segs)); etat.nOs = segs.length; return etat.grille;
  }
  function pret() { return !!etat.grille; }

  /* nuanceur : habillage + correction de volume, chaîné avec les nuanceurs déjà installés (animations de flux, plan de coupe local des pathologies) */
  function installer(mat, uVol) {
    if (mat.userData.peauInstallee) return; mat.userData.peauInstallee = true;
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r); sh.uniforms.uBones = bones; sh.uniforms.uVolA = uVol.A; sh.uniforms.uVolB = uVol.B;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aSkinI; attribute vec4 aSkinW; attribute float aSkinT;\nuniform mat4 uBones[' + N + '];\nuniform vec4 uVolA; uniform vec4 uVolB;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat4 skM = aSkinW.x * uBones[int(aSkinI.x)] + aSkinW.y * uBones[int(aSkinI.y)] + aSkinW.z * uBones[int(aSkinI.z)] + aSkinW.w * uBones[int(aSkinI.w)];\nobjectNormal = normalize(mat3(skM) * objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = (skM * vec4(transformed, 1.0)).xyz;\nvec3 vdv = transformed - uVolA.xyz; float kkv = 1.0 + (uVolA.w - 1.0) * sin(3.14159265 * clamp(aSkinT, 0.0, 1.0));\ntransformed = uVolA.xyz + vdv + (kkv - 1.0) * (vdv - uVolB.xyz * dot(vdv, uVolB.xyz));');
    };
    mat.customProgramCacheKey = () => prevKey() + '-peau'; mat.needsUpdate = true;
  }

  /* Habille une pièce (non osseuse) : calcul des poids puis remplacement de la géométrie. Rend l'enregistrement { mesh, poids… } ou null. */
  function equiper(mesh, piece, corps) {
    if (etat.equipes.has(mesh)) return etat.equipes.get(mesh); if (!etat.grille) return null;
    const { P, N: Nn } = decoder(mesh), poids = poidsSommets(P, etat.grille, { defaut: INDEX_SEG[corps.rig.segmentDe[piece.id]] || 0 }), est = piece.systeme === 'muscles' && piece.type === 'muscle';
    const ax = axePrincipal(P), ext = est ? extremites(ax.t) : null, g = mesh.geometry, ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(P, 3)); ng.setAttribute('normal', new THREE.BufferAttribute(Nn || new Float32Array(P.length), 3));
    ng.setAttribute('aSkinI', new THREE.BufferAttribute(poids.idx, 4)); ng.setAttribute('aSkinW', new THREE.BufferAttribute(poids.w, 4)); ng.setAttribute('aSkinT', new THREE.BufferAttribute(est ? ax.t : new Float32Array(P.length / 3), 1));
    if (g.index) ng.setIndex(new THREE.BufferAttribute(g.index.array.slice(), 1));
    ng.computeBoundingSphere();
    const mat = anat.materielPropre(mesh), uVol = { A: { value: new THREE.Vector4(0, 0, 0, 1) }, B: { value: new THREE.Vector4(0, 1, 0, 0) } };
    installer(mat, uVol);
    mesh.geometry = ng; mesh.matrix.identity(); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.userData.m0 = new THREE.Matrix4(); mesh.userData.peau = true; mesh.matrixWorldNeedsUpdate = true;
    let L0 = 0.05; if (ext && ext.A.length && ext.B.length) { const cen = l => [0, 1, 2].map(k => l.reduce((s, i) => s + P[3 * i + k], 0) / l.length), a = cen(ext.A), b = cen(ext.B); L0 = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) || 0.05; }
    const rec = { mesh, piece, P, idx: poids.idx, w: poids.w, ext, L0, uVol, est }; etat.equipes.set(mesh, rec); return rec;
  }
  /* Habille par lots dans la file, en respectant un budget de temps par image (ms). Rend le nombre de pièces restantes. */
  function traiter(corps, budgetMs = 8) {
    const t0 = performance.now();
    while (etat.file.length && performance.now() - t0 < budgetMs) { const { mesh, piece } = etat.file.shift(); if (!etat.equipes.has(mesh)) equiper(mesh, piece, corps); }
    return etat.file.length;
  }
  function planifier(mesh, piece, prioritaire = false) { if (etat.equipes.has(mesh) || etat.file.some(f => f.mesh === mesh)) return; (prioritaire ? etat.file.unshift.bind(etat.file) : etat.file.push.bind(etat.file))({ mesh, piece }); }

  /* Uniforme des segments (rép. du modèle au repos → posé) */
  function majOs(T) { for (let i = 0; i < N; i++) { const m = T[SEGMENTS[i]]; for (let k = 0; k < 16; k++) bones.value[16 * i + k] = m[k]; } }
  function majVolumes(T) {
    const mats = SEGMENTS.map(s => T[s]);
    for (const rec of etat.equipes.values()) {
      if (!rec.est || !rec.ext || !rec.mesh.visible) continue;
      const v = volumeMuscle(rec.P, rec.idx, rec.w, mats, rec.ext, rec.L0); rec.uVol.A.value.set(v.centre[0], v.centre[1], v.centre[2], v.k); rec.uVol.B.value.set(v.axe[0], v.axe[1], v.axe[2], 0); rec.vol = v;
    }
  }
  function reinitialiser() {
    for (let i = 0; i < N; i++) { bones.value.fill(0, 16 * i, 16 * i + 16); bones.value[16 * i] = bones.value[16 * i + 5] = bones.value[16 * i + 10] = bones.value[16 * i + 15] = 1; }
    for (const rec of etat.equipes.values()) { rec.uVol.A.value.set(0, 0, 0, 1); rec.uVol.B.value.set(0, 1, 0, 0); }
  }
  return { bones, preparerOs, pret, equiper, planifier, traiter, majOs, majVolumes, reinitialiser, decoder, equipes: etat.equipes, etat: () => ({ equipes: etat.equipes.size, file: etat.file.length, pointsOs: etat.nOs }) };
}
