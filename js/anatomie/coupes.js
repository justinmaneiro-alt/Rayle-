/* ═════════════ SURFACE DE SECTION (« cap ») DU PLAN DE COUPE : os compact et os spongieux ═════════════
   Sans cap, un os coupé par le plan de coupe est une coquille vide : on voit l'intérieur des faces arrière. Méthode du tampon de pochoir (stencil) :
     1. chaque maillage d'os reçoit des fantômes qui n'écrivent que dans le pochoir (faces arrière : +1, faces avant : −1, coupés par le plan global du moteur) ;
        le pochoir reste non nul exactement là où le plan traverse de la matière ;
     2. un grand carré posé sur le plan ne se dessine que là où le pochoir est non nul : c'est la surface de section.
   Deux zones : chaque os reçoit deux jeux de fantômes, l'un sur sa surface (contour extérieur), l'autre rétréci vers l'intérieur le long des normales (contour de la cavité) ; la valeur du pochoir
   vaut alors 1 dans l'anneau (os COMPACT, la corticale : ivoire dense) et 2 au centre (os SPONGIEUX : travées d'os ivoire autour de cavités médullaires rosées). Un os long a une corticale épaisse à
   la diaphyse et fine aux épiphyses (attribut aFibre.x cuit dans le modèle) ; un os court ou plat n'est pas rétréci (toute sa section est dessinée en spongieux, sous une corticale trop fine pour se voir).
   Les fantômes sont créés à la demande (seulement tant qu'une coupe est active) et ignorés par la sélection. Nécessite un tampon de pochoir dans le canvas (stencil: true) et dans la cible du post-traitement. */

const GLSL = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
// travées : réseau de crêtes (distance au bord de cellules de Voronoï approchée par deux bruits crêtés décalés)
float travees(vec2 p){ float a=1.0-abs(2.0*vn(p)-1.0), b=1.0-abs(2.0*vn(p*1.9+17.3)-1.0); return a*0.6+b*0.4; }
`;

/** Pochoir commun aux deux surfaces de section : le fragment est dessiné si le pochoir vérifie `fonction` par rapport à `ref`, puis le pochoir est remis à zéro à cet endroit */
const pochoir = (THREE, fonction, ref) => ({ stencilWrite: true, stencilRef: ref, stencilFunc: fonction, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ZeroStencilOp });

/** Os spongieux : au centre de la section (pochoir ≥ 2) */
export function materielCap(THREE) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xe6d5b4, roughness: .78, metalness: 0, side: THREE.DoubleSide }, pochoir(THREE, THREE.GreaterStencilFunc, 1)));
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

/** Os compact : l'anneau de la section (pochoir = 1) : ivoire dense, grain très fin, presque sans cavités */
export function materielCorticale(THREE) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xeadfc6, roughness: .6, metalness: 0, side: THREE.DoubleSide }, pochoir(THREE, THREE.EqualStencilFunc, 1)));
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCap;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCap=position.xy;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCap;\n' + GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float g=vn(vCap*900.0), l=vn(vCap*140.0); diffuseColor.rgb=mix(vec3(0.90,0.84,0.70),vec3(0.96,0.92,0.82),g)*(0.93+0.1*l); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*0.5;');
  };
  m.customProgramCacheKey = () => 'cap-corticale';
  return m;
}

/** Fantôme de pochoir : n'écrit que dans le pochoir ; `epaisseur` (uniforme, en mètres) rétrécit le maillage le long de ses normales (contour de la cavité), atténuée vers les épiphyses */
function fantome(THREE, cote, operation, epaisseur) {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: cote, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: operation, stencilZFail: operation, stencilZPass: operation });
  const u = { valeur: epaisseur };
  m.onBeforeCompile = shader => {
    shader.uniforms.uEpaisseur = u;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uEpaisseur;\n#ifdef USE_FIBRE\nattribute vec2 aFibre;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_FIBRE\ntransformed -= normal * uEpaisseur * (1.0 - 0.75 * clamp(aFibre.x, 0.0, 1.0));\n#else\ntransformed -= normal * uEpaisseur;\n#endif');
  };
  m.defines = { USE_FIBRE: '' };
  m.customProgramCacheKey = () => 'cap-fantome-' + (epaisseur > 0 ? 'rétréci' : 'plein') + '-' + cote + '-' + operation;
  m.userData.u = u;
  return m;
}

export class CapsCoupe {
  constructor(THREE, parent) {
    this.THREE = THREE; this.parent = parent; this.fantomes = []; this.cap = null; this.corticale = null; this.cle = '';
    this.matCap = materielCap(THREE); this.matCorticale = materielCorticale(THREE);
    this.mats = [];                // matériaux des fantômes (libérés avec eux)
  }
  /** Épaisseur de la corticale d'un maillage : os long (étroit et allongé) → 20 % de sa plus petite dimension, au plus 4 mm ; os court ou plat → 0 (section entièrement spongieuse) */
  epaisseurCorticale(geo) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const s = geo.boundingBox.getSize(new this.THREE.Vector3()), d = [s.x, s.y, s.z].sort((a, b) => a - b);
    return d[2] > .05 && d[2] > 4 * d[1] ? Math.min(.004, .2 * d[0]) : 0;
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
        const ep = this.epaisseurCorticale(o.geometry);
        for (const [cote, operation] of [[T.BackSide, T.IncrementWrapStencilOp], [T.FrontSide, T.DecrementWrapStencilOp]]) for (const rayon of [0, ep]) {      // contour extérieur, puis contour de la cavité (identique si l'os n'est pas rétréci)
          const m = fantome(T, cote, operation, rayon); this.mats.push(m);
          const f = new T.Mesh(o.geometry, m); f.renderOrder = 1; f.userData.capFantome = true; f.raycast = () => { }; f.frustumCulled = false;
          o.add(f); this.fantomes.push(f);
        }
      });
    }
    if (!this.cap) {
      const plan3 = () => new T.PlaneGeometry(3, 3);
      this.corticale = new T.Mesh(plan3(), this.matCorticale); this.corticale.renderOrder = 2;
      this.cap = new T.Mesh(plan3(), this.matCap); this.cap.renderOrder = 3;
      for (const q of [this.corticale, this.cap]) { q.raycast = () => { }; q.frustumCulled = false; q.userData.capFantome = true; this.parent.add(q); }
      this.cap.onAfterRender = r => { try { r.clearStencil(); } catch (x) { } };        // dernière surface dessinée : on nettoie le pochoir pour l'image suivante
    }
    // les carrés se posent sur le plan (légèrement du côté conservé pour ne pas être eux-mêmes coupés)
    const n = plan.normal;
    for (const q of [this.corticale, this.cap]) { q.position.copy(n).multiplyScalar(-plan.constant + .0004); q.lookAt(q.position.clone().add(n)); q.visible = true; }
    return this.fantomes.length;
  }
  retirerFantomes() { this.fantomes.forEach(f => f.parent && f.parent.remove(f)); this.fantomes = []; this.mats.forEach(m => m.dispose()); this.mats = []; this.cle = ''; }
  vider() { this.retirerFantomes(); [this.cap, this.corticale].forEach(q => { if (q) q.visible = false; }); }
  dispose() {
    this.vider();
    [this.cap, this.corticale].forEach(q => { if (q) { this.parent.remove(q); q.geometry.dispose(); } }); this.cap = this.corticale = null;
    this.matCap.dispose(); this.matCorticale.dispose();
  }
}
