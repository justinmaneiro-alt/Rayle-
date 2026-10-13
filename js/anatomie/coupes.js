/* ═════════════ SURFACE DE SECTION (« cap ») DU PLAN DE COUPE ═════════════
   Sans cap, un os coupé par le plan de coupe est une coquille vide : on voit l'intérieur des faces arrière. Méthode du tampon de pochoir (stencil) :
     1. chaque maillage d'os reçoit deux fantômes qui n'écrivent que dans le pochoir (faces arrière : +1, faces avant : −1, coupés par le plan global du moteur) ;
        le pochoir reste non nul exactement là où le plan traverse de la matière ;
     2. un grand carré posé sur le plan ne se dessine que là où le pochoir est non nul (puis le remet à zéro) : c'est la surface de section.
   Matériau de la surface : os spongieux (travées d'os ivoire autour de cavités médullaires rosées) ; la fine corticale n'est pas dessinée (elle se confond avec le bord de l'os).
   Les fantômes sont créés à la demande (seulement tant qu'une coupe est active) et ignorés par la sélection. Nécessite un tampon de pochoir dans le canvas (stencil: true) et dans la cible du post-traitement. */

const GLSL = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
// travées : réseau de crêtes (distance au bord de cellules de Voronoï approchée par deux bruits crêtés décalés)
float travees(vec2 p){ float a=1.0-abs(2.0*vn(p)-1.0), b=1.0-abs(2.0*vn(p*1.9+17.3)-1.0); return a*0.6+b*0.4; }
`;

export function materielCap(THREE) {
  const m = new THREE.MeshStandardMaterial({ color: 0xe6d5b4, roughness: .78, metalness: 0, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp });
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCap;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCap=position.xy;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCap;\n' + GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 p=vCap*380.0; float t=travees(p), grand=vn(vCap*26.0);
          float os=smoothstep(0.40,0.52,t+0.14*(grand-0.5));                                       // 1 : travée osseuse, 0 : cavité
          vec3 travee=mix(vec3(0.93,0.85,0.68),vec3(0.84,0.72,0.52),vn(vCap*95.0));
          vec3 moelle=mix(vec3(0.46,0.22,0.15),vec3(0.62,0.34,0.24),vn(vCap*60.0+4.0))*(0.7+0.3*grand);
          diffuseColor.rgb=mix(moelle,travee,os); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*0.55;');       // la coupe regarde souvent vers le bas, hors de la lumière principale : autoéclairage doux
  };
  m.customProgramCacheKey = () => 'cap-spongieux';
  return m;
}

export class CapsCoupe {
  constructor(THREE, parent) {
    this.THREE = THREE; this.parent = parent; this.fantomes = []; this.cap = null; this.cle = '';
    this.matAvant = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.FrontSide, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
    this.matArriere = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.BackSide, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
    this.matCap = materielCap(THREE);
  }
  /** plan : THREE.Plane du moteur (ou null : tout retirer) ; entrees : Map des structures du moteur. À rappeler quand un modèle change (GLB chargé) ou quand la coupe bouge. */
  maj(plan, entrees) {
    const T = this.THREE;
    if (!plan) { this.vider(); return 0; }
    const os = [...entrees.values()].filter(e => e.type === 'os' && e.obj.visible !== false);
    const cle = os.map(e => e.sid + (e.glb ? '+' : '')).join('|');
    if (cle !== this.cle) {                                   // les os affichés ont changé : on refait les fantômes
      this.retirerFantomes(); this.cle = cle;
      for (const e of os) e.obj.traverse(o => {
        if (!o.isMesh || o.userData.capFantome || !o.geometry || !o.geometry.attributes.position) return;
        for (const [mat, ordre] of [[this.matArriere, 1], [this.matAvant, 1]]) {
          const f = new T.Mesh(o.geometry, mat); f.renderOrder = ordre; f.userData.capFantome = true; f.raycast = () => { }; f.frustumCulled = false;
          o.add(f); this.fantomes.push(f);
        }
      });
    }
    if (!this.cap) {
      this.cap = new T.Mesh(new T.PlaneGeometry(3, 3), this.matCap); this.cap.renderOrder = 2; this.cap.raycast = () => { }; this.cap.frustumCulled = false; this.cap.userData.capFantome = true;
      this.cap.onAfterRender = r => { try { r.clearStencil(); } catch (x) { } };
      this.parent.add(this.cap);
    }
    // le carré se pose sur le plan (légèrement du côté conservé pour ne pas être lui-même coupé)
    const n = plan.normal;
    this.cap.position.copy(n).multiplyScalar(-plan.constant + .0004);
    this.cap.lookAt(this.cap.position.clone().add(n));
    this.cap.visible = true;
    return this.fantomes.length;
  }
  retirerFantomes() { this.fantomes.forEach(f => f.parent && f.parent.remove(f)); this.fantomes = []; this.cle = ''; }
  vider() { this.retirerFantomes(); if (this.cap) this.cap.visible = false; }
  dispose() { this.vider(); if (this.cap) { this.parent.remove(this.cap); this.cap.geometry.dispose(); this.cap = null; } this.matAvant.dispose(); this.matArriere.dispose(); this.matCap.dispose(); }
}
