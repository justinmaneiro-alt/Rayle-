import * as THREE from 'three';
import { BAT_VERT } from './shaders-terre.js';

/* ═════════════ OMBRES PORTÉES DES BÂTIMENTS ═════════════
   Une carte de profondeur vue du Soleil (caméra orthographique) ne contient que les bâtiments : le sol et les façades la lisent pour savoir
   s'ils sont à l'ombre (filtre doux sur 12 points). Elle couvre un carré autour du point regardé, dont la taille suit l'altitude de la caméra ;
   son centre est calé sur la grille des texels (absolue, en km) pour que les ombres ne scintillent pas quand la caméra bouge.
   Les ombres du relief (montagnes) sont calculées autrement, dans le nuanceur des tuiles (marche le long du relief). */
const VERT_OMBRE = BAT_VERT;
const FRAG_OMBRE = /* glsl */`void main(){ gl_FragColor = vec4(1.0); }`;

export function creerOmbres({ renderer, partages }) {
  const taille = 2048;
  const cible = new THREE.WebGLRenderTarget(taille, taille);
  cible.depthTexture = new THREE.DepthTexture(taille, taille);
  cible.depthTexture.type = THREE.UnsignedIntType;
  cible.depthTexture.minFilter = cible.depthTexture.magFilter = THREE.NearestFilter;
  const scene = new THREE.Scene(), groupe = new THREE.Group(); scene.add(groupe);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const matrice = new THREE.Matrix4();
  partages.uOmbre = { value: cible.depthTexture }; partages.uOmbreM = { value: matrice }; partages.uOmbreOn = { value: 0 }; partages.uOmbreTaille = { value: 1 };
  let actif = false, demiTaille = 1;
  const v = new THREE.Vector3(), haut = new THREE.Vector3(), droite = new THREE.Vector3();

  return {
    groupe,
    /* matériau « profondeur seule » pour un maillage de bâtiments (mêmes sommets déplacés que le maillage visible) */
    materiau(uniformes) { return new THREE.ShaderMaterial({ vertexShader: VERT_OMBRE, fragmentShader: FRAG_OMBRE, side: THREE.DoubleSide, uniforms: uniformes }); },
    activer(oui) { actif = !!oui; if (!actif) partages.uOmbreOn.value = 0; },
    /* soleil : direction unitaire (repère du globe) ; cibleAbs : point regardé (km, absolu) ; camAbs : position de la caméra (km, absolue) ;
       meshes : [{ ombre, visible, position }] ; altitude : de la caméra (km) */
    maj({ soleil, cibleAbs, camAbs, altitude, jour }) {
      const sol = soleil, localUp = [cibleAbs[0], cibleAbs[1], cibleAbs[2]], n = Math.hypot(...localUp) || 1;
      const elev = (sol[0] * localUp[0] + sol[1] * localUp[1] + sol[2] * localUp[2]) / n;     // sinus de la hauteur du soleil au point regardé
      if (!actif || elev < 0.06 || altitude > 6) { partages.uOmbreOn.value = 0; groupe.visible = false; return false; }
      groupe.visible = true;
      demiTaille = Math.max(0.2, Math.min(3, altitude * 1.6)); partages.uOmbreTaille.value = demiTaille;
      const L = v.set(sol[0], sol[1], sol[2]).normalize();
      haut.set(0, 1, 0); if (Math.abs(L.dot(haut)) > 0.95) haut.set(0, 0, 1);
      droite.crossVectors(haut, L).normalize(); haut.crossVectors(L, droite).normalize();
      // centre calé sur la grille des texels (coordonnées absolues)
      const texel = 2 * demiTaille / taille;
      const f = new THREE.Vector3(cibleAbs[0], cibleAbs[1], cibleAbs[2]);
      const a = f.dot(droite), b = f.dot(haut), c = f.dot(L);
      const fq = droite.clone().multiplyScalar(Math.round(a / texel) * texel).add(haut.clone().multiplyScalar(Math.round(b / texel) * texel)).add(L.clone().multiplyScalar(c));
      const rel = fq.sub(new THREE.Vector3(camAbs[0], camAbs[1], camAbs[2]));
      const D = 1.2 + demiTaille * 1.2;
      cam.left = -demiTaille; cam.right = demiTaille; cam.top = demiTaille; cam.bottom = -demiTaille; cam.near = 0.02; cam.far = 2 * D;
      cam.position.copy(rel).addScaledVector(L, D); cam.up.copy(haut); cam.lookAt(rel); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      matrice.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const ancien = renderer.getRenderTarget();
      renderer.setRenderTarget(cible); renderer.clear(false, true, false);
      const clair = renderer.getClearAlpha(); renderer.render(scene, cam);
      renderer.setRenderTarget(ancien);
      partages.uOmbreOn.value = 1;
      return true;
    },
    arreter() { cible.dispose(); cible.depthTexture.dispose(); }
  };
}
