import * as THREE from 'three';
import { R, horizonKm, norme, unit } from './geo.js';
import { soleilReel } from './soleil-reel.js';
import { creerTuiles } from './tuiles.js';
import { creerOmbres } from './ombres.js';
import { creerMeteoAnim } from './meteo-anim.js';
import { BASE_VERT, BASE_FRAG, ATMO_VERT, ATMO_FRAG, NUAGE_VERT, NUAGE_FRAG } from './shaders-terre.js';

/* ═════════════ LE GLOBE DÉTAILLÉ ═════════════
   Une scène à part (dessinée par la galaxie à la place de la sienne pendant l'orbite) : sphère de base mondiale, tuiles, atmosphère,
   nuages, ciel étoilé. La caméra reste à l'origine ; tout est déplacé de (− position de la caméra) à chaque image. Unité : le kilomètre. */
const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ATMO_EPAISSEUR = 380, ECHELLE_ATMO = 55;
/* Qualité du rendu de près, par profil : ombres des bâtiments (carte de profondeur), ombres du relief (pas de marche), texture de détail. */
export const QUALITE_RENDU = { haute: { ombres: true, pasRelief: 14, detail: 1 }, moyenne: { ombres: true, pasRelief: 8, detail: 1 }, basse: { ombres: false, pasRelief: 0, detail: 0 } };

export function creerGlobe({ renderer, textures, ciel, chargeur, lire, modeleVecteur }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100000);
  const partages = {
    uSoleil: { value: new THREE.Vector3(1, 0, 0) }, uExag: { value: 2 }, uTemps: { value: 0 }, uHaze: { value: 1e9 },
    uOcean: { value: 1 }, uLumieres: { value: 1 }, uJupe: { value: 0.3 }, uVecA: { value: 1 }, uRadA: { value: 0 }, uPasRelief: { value: 12 }, uDetail: { value: 1 },
    uJourG: { value: textures.jour }, uNuitG: { value: textures.nuit }
  };

  // sphère de base : couvre le monde entier (pôles compris) sous les tuiles, légèrement en retrait
  const base = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.ShaderMaterial({
    vertexShader: BASE_VERT, fragmentShader: BASE_FRAG, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    uniforms: { uJour: { value: textures.jour }, uNuit: { value: textures.nuit }, uSoleil: partages.uSoleil, uLumieres: partages.uLumieres }
  }));
  base.frustumCulled = false; base.matrixAutoUpdate = false; scene.add(base);

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSoleil: partages.uSoleil, uRayon: { value: R }, uEchelle: { value: ECHELLE_ATMO }, uForce: { value: 1.25 } }
  }));
  atmo.frustumCulled = false; atmo.matrixAutoUpdate = false; atmo.renderOrder = 5; scene.add(atmo);

  const nuagesU = { uNuages: { value: textures.nuages }, uSoleil: partages.uSoleil, uDecalage: { value: 0 }, uOpacite: { value: 0.9 } };
  const nuages = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.ShaderMaterial({
    vertexShader: NUAGE_VERT, fragmentShader: NUAGE_FRAG, uniforms: nuagesU, transparent: true, depthWrite: false
  }));
  nuages.frustumCulled = false; nuages.matrixAutoUpdate = false; nuages.renderOrder = 4; scene.add(nuages);

  const ombres = creerOmbres({ renderer, partages });
  const tuiles = creerTuiles({ scene, chargeur, partages, lire, modeleVecteur, renderer, ombres });
  const meteoAnim = creerMeteoAnim({ scene, partages });
  let temps = 0, decalageNuages = 0, hauteurSol = 0;
  const basis = new THREE.Matrix4(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

  function place(mesh, cam, rayon) {
    mesh.position.set(-cam[0], -cam[1], -cam[2]); mesh.scale.setScalar(rayon); mesh.updateMatrix();
  }
  return {
    scene, camera, tuiles, partages, meteoAnim,
    /* pose : issue de camera-orbite.js ; ecran : { largeur, hauteur } ; options : date simulée facultative (tests, captures). */
    maj(dt, pose, ecran, { date = null, hSol = 0, hSolCam = null } = {}) {
      temps += dt; hauteurSol = hSol;
      const cfg = lire(), cam = pose.cam, alt = pose.altitude;
      const s = soleilReel(date || new Date());
      partages.uSoleil.value.set(s.direction[0], s.direction[1], s.direction[2]);
      partages.uTemps.value = temps; partages.uExag.value = cfg.exag; partages.uOcean.value = cfg.ocean ? 1 : 0; partages.uRadA.value = cfg.radar ? 1 : 0; partages.uLumieres.value = 1;
      partages.uHaze.value = alt < 100 ? 70 + Math.max(alt, 0) * 4 : 470 * Math.exp((alt - 100) * 0.2);
      // caméra à l'origine, orientée d'après la pose ; plans proche/lointain adaptés à l'altitude (précision de profondeur)
      const sol = Math.max(alt - Math.max(hSol, hSolCam === null ? 0 : hSolCam) * cfg.exag, 0.0003);   // dégagement au-dessus du sol le plus haut entre le point visé et le sol sous la caméra (sinon le plan proche coupe le relief devant la caméra)
      const rc = norme(cam), horizon = horizonKm(Math.max(alt, 0)) + 700;
      camera.near = Math.max(0.0006, sol * 0.08); camera.far = alt > 1500 ? rc + R * 1.3 : Math.max(horizon, camera.near * 50);
      camera.aspect = ecran.largeur / Math.max(1, ecran.hauteur); camera.updateProjectionMatrix();
      camera.position.set(0, 0, 0);
      basis.makeBasis(v1.set(...pose.droite), v2.set(...pose.haut), v3.set(-pose.avant[0], -pose.avant[1], -pose.avant[2]));
      camera.quaternion.setFromRotationMatrix(basis);
      camera.updateMatrixWorld();
      place(base, cam, R - 0.5); place(atmo, cam, R + ATMO_EPAISSEUR); place(nuages, cam, R + 11);
      decalageNuages += dt * 0.00002; nuagesU.uDecalage.value = decalageNuages;
      nuagesU.uOpacite.value = cfg.nuages && !cfg.nuagesReels ? 0.92 * lisse(30, 700, sol) : 0;   // avec l'image du jour, les vrais nuages sont déjà dans l'imagerie
      nuages.visible = nuagesU.uOpacite.value > 0.01;
      if (ciel) { const k = camera.far * 0.8 / 900; ciel.groupe.scale.setScalar(k); ciel.groupe.position.set(0, 0, 0); }
      meteoAnim.maj(dt, { cam, altitude: sol, actif: cfg.meteoAnim && !cfg.jeu, sol: hSol * cfg.exag });
      tuiles.maj(pose, { fov: camera.fov * Math.PI / 180, aspect: camera.aspect, hauteurEcran: ecran.hauteur, hTerrain: alt < 400 ? Math.max(hSol, hSolCam || 0) * cfg.exag : 0 });
      const q = QUALITE_RENDU[cfg.profil] || QUALITE_RENDU.haute;
      partages.uPasRelief.value = cfg.ombres === false ? 0 : q.pasRelief; partages.uDetail.value = q.detail;
      ombres.activer(q.ombres && cfg.ombres !== false && cfg.batiments && !cfg.jeu);
      ombres.maj({ soleil: [partages.uSoleil.value.x, partages.uSoleil.value.y, partages.uSoleil.value.z], cibleAbs: pose.cible, camAbs: cam, altitude: alt });
    },
    soleil: () => unit([partages.uSoleil.value.x, partages.uSoleil.value.y, partages.uSoleil.value.z]),
    arreter() { meteoAnim.arreter(); ombres.arreter(); tuiles.arreter(); base.geometry.dispose(); base.material.dispose(); atmo.geometry.dispose(); atmo.material.dispose(); nuages.geometry.dispose(); nuages.material.dispose(); }
  };
}
