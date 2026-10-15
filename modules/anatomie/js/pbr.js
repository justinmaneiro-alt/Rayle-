/* ═════════════ MATÉRIAUX PBR PROCÉDURAUX (aucune image à télécharger) ═════════════
   creerMateriauPBR(THREE, type, couleur, options) → MeshPhysicalMaterial dont le shader est enrichi :
     os      : (attribut aFibre.x : 0 diaphyse, 1 épiphyse) teinte ivoire clair → jaune rosé aux extrémités ; micro-relief poreux (normales perturbées), variations de teinte ivoire / jaune / gris, rugosité variable, diffusion sous la surface simulée
               (lueur chaude aux bords : la lumière traverse l'os mince) ;
     muscle  : stries de fibres le long du muscle (attribut aFibre : u = longueur, v = tour), micro-relief fibreux, teinte rouge / rose, tendons blanc nacré
               aux extrémités, reflet humide (clearcoat) ;
     tendon  : (extrémités des muscles) blanc nacré, vernis humide plus brillant que la chair ;
     cartilage : bleu-blanc laiteux, très lisse et humide ; ligament : blanc nacré fibreux, fibres étirées ;
     nerf    : brillant nacré jaune ; organe : tissu humide (clearcoat, sheen) ; peau : voile translucide.
   Anisotropie : les stries de rugosité suivent les fibres (reflets étirés dans le sens du muscle) ; l'anisotropie native de three.js demande des tangentes (UV) que ces géométries n'ont pas.
   Ces effets sont dessinés par le GPU en coordonnées de l'objet : aucune texture, donc rien à charger ni à mettre en cache. */

const GLSL_BRUIT = `
float h31(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vn3(p); p*=2.07; a*=0.5; } return s; }
float h21f(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21f(i),h21f(i+vec2(1,0)),f.x),mix(h21f(i+vec2(0,1)),h21f(i+vec2(1,1)),f.x),f.y); }
`;
// perturbation de la normale par le gradient écran d'une hauteur h (même méthode que three.js pour le bump mapping)
const GLSL_BUMP = `
vec3 bumpNormal(vec3 pos, vec3 n, float h, float k){
  vec3 sx=dFdx(pos), sy=dFdy(pos); vec3 r1=cross(sy,n), r2=cross(n,sx); float det=dot(sx,r1);
  vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2); return normalize(abs(det)*n-k*grad);
}
`;

// occlusion ambiante cuite (aFibre.y, 0 = dégagé, 1 = fond d'un creux) : assombrit l'éclairage indirect (fort) et un peu le direct, pour que les creux restent sombres à tous les niveaux de qualité
const AO_CUITE = `{ float aoc=1.0-clamp(vFib.y,0.0,1.0)*0.92; reflectedLight.indirectDiffuse*=aoc; reflectedLight.indirectSpecular*=aoc; reflectedLight.directDiffuse*=mix(1.0,aoc,0.4); reflectedLight.directSpecular*=mix(1.0,aoc,0.4); }`;

/** Niveau Éco : matériau standard (sans les shaders de texture) qui garde malgré tout l'occlusion ambiante cuite et la teinte diaphyse / épiphyse de l'os */
export function ajouterAOCuite(m) {
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aFibre;\nvarying vec2 vFib;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFib=aFibre;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFib;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb*vec3(1.04,1.03,1.02),diffuseColor.rgb*vec3(1.0,0.91,0.8),clamp(vFib.x,0.0,1.0)*0.6)*(1.0-0.5*clamp(vFib.y,0.0,1.0));')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + AO_CUITE);
  };
  m.customProgramCacheKey = () => 'os-eco-ao';
  return m;
}

const PROFILS = {
  os: { rough: .62, clearcoat: .12, clearcoatRoughness: .55, sheen: 0, bump: .0011 },
  muscle: { rough: .5, clearcoat: .55, clearcoatRoughness: .32, sheen: .5, bump: .0009 },
  nerf: { rough: .38, clearcoat: .6, clearcoatRoughness: .25, sheen: 0, bump: 0 },
  organe: { rough: .42, clearcoat: .7, clearcoatRoughness: .22, sheen: .6, bump: .0007 },
  cartilage: { rough: .26, clearcoat: .85, clearcoatRoughness: .14, sheen: .25, bump: .0003 },
  ligament: { rough: .42, clearcoat: .45, clearcoatRoughness: .3, sheen: .45, bump: .0005 },
  peau: { rough: .8, clearcoat: 0, clearcoatRoughness: 1, sheen: .3, bump: 0 }
};

export function creerMateriauPBR(THREE, type, couleur, options = {}) {
  const p = PROFILS[type] || PROFILS.os;
  const m = new THREE.MeshPhysicalMaterial(Object.assign({
    color: couleur, roughness: p.rough, metalness: 0, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness,
    sheen: p.sheen, sheenRoughness: .6, sheenColor: new THREE.Color(type === 'muscle' ? 0xff6a6a : 0xfff0d8), side: THREE.DoubleSide
  }, options));
  m.userData.pbr = type;
  if (type === 'peau' || type === 'nerf') return m;            // simples : pas de shader sur mesure
  const os = type === 'os', muscle = type === 'muscle', cart = type === 'cartilage', lig = type === 'ligament', org = type === 'organe';
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOPos;\nvarying vec2 vFib;\n' + (muscle || os ? 'attribute vec2 aFibre;\n' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOPos=position;\n' + (muscle || os ? 'vFib=aFibre;\n' : 'vFib=vec2(0.0);\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOPos;\nvarying vec2 vFib;\n' + GLSL_BRUIT + GLSL_BUMP)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (cart ? `
        { float v=fbm3(vOPos*40.0); diffuseColor.rgb=mix(vec3(0.72,0.82,0.86),vec3(0.86,0.90,0.88),v)*(0.94+0.1*vn3(vOPos*160.0)); }` : lig ? `
        { float fib=vn3(vOPos*vec3(260.0,26.0,260.0)); diffuseColor.rgb=mix(vec3(0.80,0.76,0.66),vec3(0.94,0.92,0.86),fib)*(0.92+0.12*fbm3(vOPos*50.0)); }` : muscle ? `
        { float fib=vn2(vec2(vFib.y*70.0, vFib.x*5.0)); float zone=fbm3(vOPos*38.0);
          vec3 chair=mix(vec3(0.62,0.12,0.11),vec3(0.80,0.30,0.28),zone);                        // rouge sombre ↔ rose
          chair*=0.82+0.36*fib;                                                                 // stries
          float tendon=smoothstep(0.16,0.06,vFib.x)+smoothstep(0.84,0.94,vFib.x);              // extrémités fibreuses, blanc nacré
          diffuseColor.rgb=mix(chair,vec3(0.90,0.86,0.78),clamp(tendon,0.0,1.0)); }` : `
        { float v=fbm3(vOPos*55.0), g=fbm3(vOPos*9.0+3.7);
          vec3 ivoire=${org ? 'diffuseColor.rgb' : 'vec3(0.90,0.84,0.70)'}, jaune=${org ? 'diffuseColor.rgb*vec3(1.0,0.93,0.9)' : 'vec3(0.84,0.74,0.52)'}, gris=${org ? 'diffuseColor.rgb*0.78' : 'vec3(0.70,0.68,0.62)'};      // organe : la couleur du matériau, avec les mêmes variations de teinte (et non l'ivoire de l'os)
          diffuseColor.rgb=mix(mix(ivoire,jaune,g),gris,smoothstep(0.55,0.9,v)*0.5)*(0.92+0.16*v);
          float epi=clamp(vFib.x,0.0,1.0);                                                       // diaphyse : ivoire plus clair ; épiphyse : plus jaune / rosé, un peu plus sombre
          diffuseColor.rgb=mix(diffuseColor.rgb*vec3(1.05,1.04,1.02),diffuseColor.rgb*vec3(1.0,0.90,0.78)+vec3(0.035,0.0,0.0),epi*0.7);
          diffuseColor.rgb*=1.0-0.55*clamp(vFib.y,0.0,1.0); }                                   // cavités (orbites, narines, creux entre les os) : occlusion ambiante cuite dans la géométrie (aFibre.y)`))
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + (os ? AO_CUITE : ''))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor*(0.78+0.5*fbm3(vOPos*70.0))' + (muscle ? '*(0.8+0.4*vn2(vec2(vFib.y*90.0,vFib.x*3.0)))' : lig ? '*(0.85+0.3*vn3(vOPos*vec3(260.0,26.0,260.0)))' : '') + ',0.14,1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (lig
        ? `{ float hf=vn3(vOPos*vec3(300.0,30.0,300.0)); normal=bumpNormal(-vViewPosition, normal, hf*${p.bump.toFixed(5)}, 1.0); }`
        : muscle
        ? `{ float hf=vn2(vec2(vFib.y*140.0, vFib.x*9.0))*0.7+fbm3(vOPos*90.0)*0.3; normal=bumpNormal(-vViewPosition, normal, hf*${p.bump.toFixed(5)}, 1.0); }`
        : `{ float hf=fbm3(vOPos*160.0)*0.65+vn3(vOPos*420.0)*0.35; normal=bumpNormal(-vViewPosition, normal, hf*${p.bump.toFixed(5)}, 1.0); }`))
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + (muscle ? `
        #ifdef USE_CLEARCOAT
        { float tendonW=clamp(smoothstep(0.16,0.06,vFib.x)+smoothstep(0.84,0.94,vFib.x),0.0,1.0);
          material.clearcoat=mix(material.clearcoat,1.0,tendonW); material.clearcoatRoughness=mix(material.clearcoatRoughness,0.1,tendonW); }
        #endif` : ''))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 vd=normalize(vViewPosition); float bord=pow(1.0-clamp(abs(dot(normalize(vNormal),vd)),0.0,1.0),2.2);
          totalEmissiveRadiance+=${muscle ? 'vec3(0.34,0.04,0.03)*0.35' : 'vec3(0.62,0.32,0.18)*0.30'}*bord${os ? '*(1.0-clamp(vFib.y,0.0,1.0))' : ''}; }`);       // diffusion sous la surface simulée : lueur chaude aux bords
  };
  m.customProgramCacheKey = () => 'pbr-' + type;
  return m;
}
