import * as THREE from 'three';

/* ═════════════ PLANÈTES ═════════════
   Chaque planète : un pivot d'orbite (tourne autour du soleil) → un groupe incliné (axe) → la sphère qui tourne sur elle-même.
   Les planètes « en attente » sont atténuées. L'identifiant de planète est rangé dans userData pour la sélection (sous-prompt 2). */

const ATMO_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vMonde; varying vec3 vVue; varying vec3 vCentre;
  void main(){
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 m = modelMatrix * vec4(position, 1.0);
    vMonde = m.xyz; vVue = normalize(cameraPosition - m.xyz);
    vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }`;
/* Diffusion atmosphérique simplifiée. Halo (uVoile = 0) : intensité = exp(-altitude / épaisseur) au point où le rayon de vue passe au plus près
   de la planète ; elle est donc maximale tout contre le bord et s'éteint avec la hauteur. Voile (uVoile = 1) : fine brillance du bord sur la surface.
   Dans les deux cas : plus fort côté soleil, et couleur de crépuscule sur la ligne jour/nuit. */
const ATMO_FRAG = /* glsl */`
  uniform vec3 uCouleur, uCrepuscule; uniform float uForce, uEpaisseur, uRayon, uVoile;
  varying vec3 vN; varying vec3 vMonde; varying vec3 vVue; varying vec3 vCentre;
  void main(){
    vec3 s = normalize(-vCentre);
    float limbe, d;
    if (uVoile > 0.5) {
      vec3 n = normalize(vN);
      limbe = pow(1.0 - abs(dot(n, normalize(vVue))), 2.4);
      d = dot(n, s);
    } else {
      vec3 rd = normalize(vMonde - cameraPosition);
      vec3 pc = cameraPosition + rd * dot(vCentre - cameraPosition, rd);
      vec3 npc = pc - vCentre;
      float h = max(length(npc) - uRayon, 0.0) / uRayon;
      limbe = exp(-h / uEpaisseur);
      d = dot(normalize(npc), s);
    }
    float jour = smoothstep(-0.30, 0.50, d);
    float crep = smoothstep(-0.40, 0.0, d) * (1.0 - smoothstep(0.0, 0.40, d));
    vec3 col = mix(uCouleur, uCrepuscule, clamp(crep * 1.3, 0.0, 1.0));
    float a = limbe * (jour + crep * 0.8 + 0.12) * uForce;   // + une fine lueur côté nuit
    gl_FragColor = vec4(col * a, a);
  }`;

const TERRE_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vMonde;
  void main(){
    vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
    vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }`;
const TERRE_FRAG = /* glsl */`
  uniform sampler2D uJour, uNuit; uniform float uAttenuation;
  varying vec2 vUv; varying vec3 vN; varying vec3 vMonde;
  void main(){
    vec3 n = normalize(vN), l = normalize(-vMonde);
    float d = dot(n, l);
    float jour = smoothstep(-0.12, 0.18, d);
    vec3 cj = texture2D(uJour, vUv).rgb * (max(d, 0.0) * 1.35 + 0.025);
    vec3 cn = texture2D(uNuit, vUv).rgb * 1.6 + texture2D(uJour, vUv).rgb * vec3(0.09, 0.125, 0.24);   // villes + relief à peine visible, teinte bleutée
    gl_FragColor = vec4(mix(cn, cj, jour) * uAttenuation, 1.0);
  }`;

export function creerPlanetes({ config, chargerTexture, anisotropie, vitesses = { rotation: 1, orbite: 1 } }) {
  let facteur = 1;   // curseur « Vitesse du système » (1 = vitesse de base)
  const racine = new THREE.Group(); racine.name = 'planetes';
  const planetes = [], traces = [];
  const geoSphere = new THREE.SphereGeometry(1, 192, 96);

  for (const p of config) {
    const attenuee = p.etat === 'en_attente';
    const pivot = new THREE.Group(); pivot.name = 'orbite-' + p.id;
    const porteur = new THREE.Group(); porteur.position.x = p.distance;
    const axe = new THREE.Group(); axe.rotation.z = p.tilt;
    pivot.add(porteur); porteur.add(axe);

    const tex = chargerTexture(p.texture); tex.anisotropy = anisotropie();
    let matiere;
    if (p.nuit) {
      const nuit = chargerTexture(p.nuit); nuit.anisotropy = anisotropie();
      matiere = new THREE.ShaderMaterial({ vertexShader: TERRE_VERT, fragmentShader: TERRE_FRAG, uniforms: { uJour: { value: tex }, uNuit: { value: nuit }, uAttenuation: { value: 1 } } });
    } else {
      matiere = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    }
    const sphere = new THREE.Mesh(geoSphere, matiere);
    sphere.scale.setScalar(p.rayon); sphere.name = p.id; sphere.userData.planete = p.id;
    axe.add(sphere);
    if (attenuee) {
      if (matiere.uniforms) matiere.uniforms.uAttenuation.value = 0.32; else matiere.color = new THREE.Color(0.32, 0.32, 0.36);
    }

    let nuages = null;
    if (p.nuages) {
      const t = chargerTexture(p.nuages); t.anisotropy = anisotropie();
      nuages = new THREE.Mesh(geoSphere, new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: t, transparent: true, opacity: 0.85, roughness: 1, depthWrite: false }));
      nuages.scale.setScalar(p.rayon * 1.012); axe.add(nuages);
    }
    if (p.atmosphere) {
      const [r, g, b] = p.atmosphere.couleur;
      const [cr, cg, cb] = p.atmosphere.crepuscule || [1.0, 0.55, 0.3];
      const epaisseur = p.atmosphere.epaisseur || 0.045;
      const coque = (cote, echelle, voile, force) => {
        const m = new THREE.Mesh(geoSphere, new THREE.ShaderMaterial({
          vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, transparent: true, side: cote, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: { uCouleur: { value: new THREE.Color(r, g, b) }, uCrepuscule: { value: new THREE.Color(cr, cg, cb) }, uForce: { value: force * p.atmosphere.force * (attenuee ? 0.4 : 1) }, uEpaisseur: { value: epaisseur }, uRayon: { value: p.rayon }, uVoile: { value: voile } }
        }));
        m.scale.setScalar(p.rayon * echelle); axe.add(m); return m;
      };
      coque(THREE.BackSide, 1 + epaisseur * 6, 0, 1.6);   // halo extérieur (jusqu'à 6 épaisseurs d'altitude)
      coque(THREE.FrontSide, 1.012, 1, 0.6);              // voile sur la surface
    }
    if (p.anneaux) axe.add(creerAnneaux(p.anneaux, p.rayon, chargerTexture, anisotropie));

    // Trajectoire
    const pts = []; for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * p.distance, 0, Math.sin(a) * p.distance)); }
    const trace = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: attenuee ? 0x555577 : 0x8a7bff, transparent: true, opacity: attenuee ? 0.08 : 0.16, depthWrite: false }));
    trace.visible = false;   // cachées par défaut : touche O (ou « affiche les orbites »)
    traces.push(trace);
    racine.add(trace);

    const satellites = (p.satellites || []).map(s => { const o = creerSatellite(s, chargerTexture, anisotropie); porteur.add(o.pivot); return o; });

    racine.add(pivot);
    planetes.push({ config: p, pivot, porteur, axe, sphere, nuages, satellites, angle: p.phase, rot: 1, rotCible: 1 });
  }

  return {
    racine, planetes,
    maj(t, dt) {
      for (const o of planetes) {
        const p = o.config;
        o.rot += (o.rotCible - o.rot) * (1 - Math.exp(-dt * 2.2));   // la rotation s'arrête / reprend en douceur (planète en orbite)
        if (Math.abs(o.rotCible - o.rot) < 0.002) o.rot = o.rotCible;
        const kR = vitesses.rotation * facteur * o.rot, kO = vitesses.orbite * facteur;
        o.angle += dt * kO * (Math.PI * 2 / p.periode);
        o.pivot.rotation.y = -o.angle;
        o.sphere.rotation.y += dt * kR * p.rotation;
        if (o.nuages) o.nuages.rotation.y += dt * kR * p.rotation * 1.25;
        for (const s of o.satellites) s.maj(t, dt * kO);
      }
    },
    parId(id) { return planetes.find(o => o.config.id === id) || null; },
    vitesse(f) { facteur = f; },
    /* Arrête (oui) ou relance (non) en douceur la rotation d'une planète sur elle-même. */
    figer(id, oui) { const o = planetes.find(p => p.config.id === id); if (o) o.rotCible = oui ? 0 : 1; },
    orbites(oui) { for (const t of traces) t.visible = !!oui; },
    orbitesVisibles: () => traces.length > 0 && traces[0].visible
  };
}

function creerAnneaux({ interieur, exterieur, texture }, rayon, chargerTexture, anisotropie) {
  const geo = new THREE.RingGeometry(interieur, exterieur, 256, 1);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {   // u = distance au centre normalisée : la texture est une bande radiale
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - interieur) / (exterieur - interieur), 0.5);
  }
  const t = chargerTexture(texture); t.anisotropy = anisotropie();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, transparent: true, roughness: 1, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.name = 'anneaux';
  return m;
}

/* Silhouettes provisoires des deux vaisseaux (modèles définitifs dans les sprints Saturne et Jupiter). */
function creerSatellite(s, chargerTexture, anisotropie) {
  if (s.type === 'lune') return creerLune(s, chargerTexture, anisotropie);
  const pivot = new THREE.Group(), vaisseau = new THREE.Group();
  const coque = new THREE.MeshStandardMaterial({ color: s.type === 'arcadia' ? 0x3a3f4a : 0xc9ced8, roughness: 0.45, metalness: 0.85 });
  const lueur = new THREE.MeshBasicMaterial({ color: s.type === 'arcadia' ? 0x4de3ff : 0xff3399 });
  if (s.type === 'arcadia') {          // coque allongée, proue pointue, trois réacteurs
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.7, 14), coque); c.rotation.z = Math.PI / 2;
    const proue = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 14), coque); proue.rotation.z = -Math.PI / 2; proue.position.x = 1.12;
    const pont = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), coque); pont.position.set(-0.3, 0.26, 0);
    vaisseau.add(c, proue, pont);
    for (const z of [-0.12, 0, 0.12]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), lueur); r.position.set(-0.9, 0, z); vaisseau.add(r); }
  } else {                              // grand vaisseau d'anatomie : anneau tournant et fuseau central
    const fuseau = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 20), coque); fuseau.rotation.z = Math.PI / 2;
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 12, 48), coque); anneau.rotation.y = Math.PI / 2;
    const noyau = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), lueur); noyau.position.x = 0.95;
    vaisseau.add(fuseau, anneau, noyau);
  }
  vaisseau.scale.setScalar(1.4);
  vaisseau.userData.satellite = s.id;
  pivot.add(vaisseau);
  vaisseau.position.x = s.orbite; vaisseau.rotation.y = -Math.PI / 2;   // la proue suit la trajectoire
  let angle = Math.random() * 6.28;
  return {
    pivot, vaisseau,
    maj(t, dt) { angle += dt * (Math.PI * 2 / s.periode); pivot.rotation.y = -angle; }
  };
}

/* La Lune : sphère texturée, éclairée par le soleil (côté nuit sombre). Rotation synchrone : elle est fixe dans le repère qui tourne
   avec son orbite, donc elle montre toujours la même face à la Terre. */
function creerLune(s, chargerTexture, anisotropie) {
  const pivot = new THREE.Group();
  const tex = chargerTexture(s.texture); tex.anisotropy = anisotropie();
  const lune = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
  lune.scale.setScalar(s.rayon); lune.position.x = s.orbite;
  lune.rotation.y = Math.PI;   // la face visible (centre de la texture) regarde la Terre
  lune.userData.satellite = s.id; lune.name = s.id;
  pivot.add(lune);
  let angle = 1.7;
  return { pivot, vaisseau: lune, maj(t, dt) { angle += dt * (Math.PI * 2 / s.periode); pivot.rotation.y = -angle; } };
}
