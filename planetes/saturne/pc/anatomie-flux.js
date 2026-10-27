import * as THREE from 'three';

/* ═════════════ ANATOMIE : ANIMATIONS DE FLUX (S4) ═════════════
   Impulsions lumineuses dans le matériau des vaisseaux et des nerfs, calculées dans le nuanceur à partir de la distance au cœur (ou au cerveau) :
   artères = onde qui s'éloigne du cœur ; veines = onde qui revient vers le cœur ; nerfs crâniens = influx qui part de l'encéphale ; cœur = battement (~72 / min) ;
   encéphale = activité lente qui part du thalamus. Animation ILLUSTRATIVE : le sens est correct, la vitesse et la forme ne sont pas mesurées (jamais un débit réel).
   Aucune géométrie ni donnée en plus : un seul nuanceur ajouté aux matériaux partagés. */
const MODES = {
  arteres: { mode: 1, sens: 1, couleur: [1.0, 0.25, 0.2], source: 'coeur' },
  veines: { mode: 1, sens: -1, couleur: [0.25, 0.45, 1.0], source: 'coeur' },
  nerfs: { mode: 1, sens: 1, couleur: [1.0, 0.9, 0.4], source: 'cerveau' },
  cerveau: { mode: 3, sens: 1, couleur: [0.7, 0.55, 1.0], source: 'cerveau' },
  coeur: { mode: 2, sens: 1, couleur: [1.0, 0.3, 0.3], source: 'coeur' }
};
export function creerFlux({ racine, index }) {
  const global = { uT: { value: 0 }, uInv: { value: new THREE.Matrix4() }, uOn: { value: 0 } };
  const origines = {};
  const centreMoyen = sys => { const p = index.deSysteme(sys).filter(x => x.bornes); const s = [0, 0, 0]; for (const x of p) { const c = index.centre(x); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; } return p.length ? new THREE.Vector3(s[0] / p.length, s[1] / p.length, s[2] / p.length) : new THREE.Vector3(0, 1.3, 0); };
  origines.coeur = centreMoyen('coeur'); origines.cerveau = (() => { const t = index.pieces.find(p => /^thalamus$/i.test(p.nom_en.replace(/\b(left|right) /i, ''))); return t ? new THREE.Vector3(...index.centre(t)) : centreMoyen('cerveau'); })();
  function brancher(mat, sys) {
    const cfg = MODES[sys]; if (!cfg || !mat || mat.userData.fluxSys === sys) return;
    mat.userData.fluxSys = sys; const o = origines[cfg.source];
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = global.uT; sh.uniforms.uInv = global.uInv; sh.uniforms.uOn = global.uOn;
      sh.uniforms.uOrigine = { value: o }; sh.uniforms.uSens = { value: cfg.sens }; sh.uniforms.uMode = { value: cfg.mode }; sh.uniforms.uFluxCol = { value: new THREE.Vector3(...cfg.couleur) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vFluxPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvFluxPos = (uInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform float uOn; uniform float uSens; uniform int uMode; uniform vec3 uOrigine; uniform vec3 uFluxCol;\nvarying vec3 vFluxPos;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uOn > 0.5) {
  float d = length(vFluxPos - uOrigine); float p = 0.0;
  if (uMode == 1) { p = smoothstep(0.62, 1.0, sin(d * 26.0 * uSens - uT * 3.2)); }
  else if (uMode == 2) { float b = sin(uT * 7.5); p = pow(max(b, 0.0), 6.0) * 0.8 + 0.1 * pow(max(sin(uT * 7.5 - 1.2), 0.0), 4.0); }
  else { p = smoothstep(0.75, 1.0, sin(d * 14.0 - uT * 1.4) * sin(vFluxPos.x * 40.0 + uT * 0.7)); }
  totalEmissiveRadiance += uFluxCol * p * 1.1;
}`);
    };
    mat.customProgramCacheKey = () => 'flux-' + sys; mat.needsUpdate = true;
  }
  return {
    brancher, global, origines, systemes: Object.keys(MODES),
    activer(oui) { global.uOn.value = oui ? 1 : 0; },
    actif: () => global.uOn.value > 0.5,
    maj(t) { global.uT.value = t; racine.updateWorldMatrix(true, false); global.uInv.value.copy(racine.matrixWorld).invert(); }
  };
}
