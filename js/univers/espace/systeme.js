// Système solaire : le Soleil, les huit planètes (textures réelles, anneaux de Saturne, lunes principales), les orbites, Cérès, Vesta et la ceinture d'astéroïdes.
// Positions héliocentriques réelles à la date du globe (éléments orbitaux de Schlyter : précision de l'ordre du degré). Repère : plan de l'écliptique = plan XZ, y vers le haut.
// Échelles : « didactique » (défaut) = distances vraies (1 UA = 60 unités), planètes agrandies d'un MÊME facteur (×390 : leurs tailles relatives sont exactes), Soleil réduit à 9 unités ;
//            « réelle » = tout à la vraie échelle (les planètes sont alors de simples points : zoomer pour les trouver).
// creerSysteme(ctx) → { groupe, maj(dt, t, ts, tSim, camera), positionMonde(id), rayon(id), pick(camera, x, y, w, h), echelle(mode), nommes, detruire() }
import { ASTRES, ORDRE_PLANETES, LUNES, UA_KM, positionHelio, pointsOrbite } from '../donnees/planetes.js?v=2026.10.15.4';
import { creerCeinture, textureRoche, geometrieRocher } from './asteroides.js?v=2026.10.15.4';

export const UA_U = 60;                                     // unités par UA
const BOOST = 390, RAD = Math.PI / 180;
const TEX = { mercure: 'espace/mercure-', venus: 'espace/venus-', mars: 'espace/mars-', jupiter: 'espace/jupiter-', saturne: 'espace/saturne-', uranus: 'espace/uranus-', neptune: 'espace/neptune-' };
// éléments approchés de Cérès et Vesta (JPL, ordre de grandeur : « positions indicatives »)
const PETITS = { ceres: { a: 2.767, e: .0758, i: 10.59, N: 80.3, w: 73.6, M0: 95, periodeJ: 1681.6 }, vesta: { a: 2.362, e: .0887, i: 7.14, N: 103.8, w: 151.2, M0: 20, periodeJ: 1325.4 } };

export async function creerSysteme(ctx) {
  const { THREE, noyau, q } = ctx;
  const groupe = new THREE.Group(); groupe.name = 'systeme-solaire';
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const ecl = p => vec(p.x * UA_U, p.z * UA_U, -p.y * UA_U);        // écliptique → monde
  let mode = 'didactique';
  const aff = id => { const a = ASTRES[id]; return a.rayonKm / UA_KM * UA_U * (mode === 'reelle' ? 1 : BOOST); };
  const rSoleil = () => mode === 'reelle' ? ASTRES.soleil.rayonKm / UA_KM * UA_U : 9;
  const res = q.tex >= 4096 ? '2k.webp' : '1k.webp';
  const texCharge = async (nom, srgb = true) => { try { return await noyau.texture(nom, { srgb }); } catch (e) { return null; } };
  const libres = [], planetes = new Map(), etiquettes = [];

  /* ───── Soleil ───── */
  const soleil = new THREE.Group(); groupe.add(soleil);
  // Soleil : shader d'émission (granulation, taches, assombrissement du bord, lente rotation) + couronne qui ondule + halos ; aucune texture à télécharger
  const uSoleil = { uT: { value: 0 } };
  const disque = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.ShaderMaterial({ uniforms: uSoleil, vertexShader: "varying vec3 vP; varying vec3 vN; varying vec3 vV;\nvoid main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }", fragmentShader: "precision highp float;\nuniform float uT; varying vec3 vP; varying vec3 vN; varying vec3 vV;\nfloat h(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\nfloat bruit(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);\n  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),\n             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }\nfloat fbm(vec3 p){ float s = 0.0, a = .5; for (int k = 0; k < 4; k++){ s += a * bruit(p); p = p * 2.03 + 11.7; a *= .5; } return s; }\nvoid main(){\n  vec3 p = normalize(vP);\n  float gran = fbm(p * 7.0 + vec3(0.0, uT * .06, 0.0));                    // granulation : cellules qui bouillonnent\n  float fin = fbm(p * 19.0 - vec3(uT * .09, 0.0, 0.0));\n  float tache = smoothstep(.62, .78, fbm(p * 2.4 + 3.0 + vec3(0.0, 0.0, uT * .004)));   // taches sombres, très lentes\n  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);          // assombrissement du bord\n  float bord = pow(mu, .55);\n  vec3 chaud = vec3(1.0, .93, .70), orange = vec3(1.0, .52, .12), sombre = vec3(.35, .10, .02);\n  vec3 c = mix(orange, chaud, smoothstep(.42, .88, gran * .75 + fin * .25));\n  c = mix(c, sombre, tache * .85);\n  c *= .55 + .9 * bord;\n  c += vec3(.35, .22, .08) * pow(1.0 - mu, 3.0) * .6;                    // fine lueur du limbe\n  gl_FragColor = vec4(c * 1.12, 1.0);\n}", toneMapped: false })); soleil.add(disque);
  const couronne = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ uniforms: uSoleil, vertexShader: "varying vec3 vP; varying vec3 vN; varying vec3 vV;\nvoid main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }", fragmentShader: "precision highp float;\nuniform float uT; varying vec3 vP; varying vec3 vN; varying vec3 vV;\nfloat h(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\nfloat bruit(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);\n  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),\n             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }\nvoid main(){\n  float mu = abs(dot(normalize(vN), normalize(vV)));\n  float k = pow(clamp(1.0 - mu, 0.0, 1.0), 3.4);                          // la lueur est plus forte près du disque\n  float jet = .65 + .7 * bruit(normalize(vP) * 5.0 + vec3(uT * .05, 0.0, uT * .03));   // jets qui ondulent\n  gl_FragColor = vec4(vec3(1.0, .62, .22) * k * jet * 1.0, k * jet * .8);\n}", transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); soleil.add(couronne);
  libres.push(disque.geometry, disque.material, couronne.geometry, couronne.material);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; { const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,245,210,1)'); gr.addColorStop(.12, 'rgba(255,225,150,.8)'); gr.addColorStop(.35, 'rgba(255,170,70,.28)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const texHalo = new THREE.CanvasTexture(cv); texHalo.colorSpace = THREE.SRGBColorSpace; libres.push(texHalo);
  const halo1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5 }));
  soleil.add(halo1, halo2);
  const lumiere = new THREE.PointLight(0xfff0dc, Math.PI * 1.05, 0, 0); soleil.add(lumiere);      // portée infinie, pas d'atténuation : le Soleil éclaire toutes les planètes
  const ambiante = new THREE.AmbientLight(0x23304a, .55); groupe.add(ambiante);

  /* ───── planètes ───── */
  async function creerPlanete(id) {
    const d = ASTRES[id], r = aff(id);
    const pivot = new THREE.Group(); groupe.add(pivot);
    const incl = new THREE.Group(); incl.rotation.z = -d.axe * RAD; pivot.add(incl);          // inclinaison de l'axe
    const geo = new THREE.SphereGeometry(1, q.segs, q.segs / 2); libres.push(geo);
    let carte = null; if (TEX[id]) carte = await texCharge(TEX[id] + res); else if (id === 'terre') carte = await texCharge('terre-jour-2048.jpg');
    const mat = new THREE.MeshStandardMaterial({ map: carte, color: carte ? 0xffffff : d.couleur, roughness: id === 'terre' ? .7 : .92, metalness: 0, emissive: 0x000000 }); libres.push(mat);
    if (id === 'terre') { const nuit = await texCharge('terre-nuit-2048.jpg'); if (nuit) { mat.emissiveMap = nuit; mat.emissive.setRGB(1, .8, .5); mat.emissiveIntensity = .55; } }
    const corps = new THREE.Mesh(geo, mat); corps.scale.setScalar(r); incl.add(corps);
    const P = { id, data: d, pivot, incl, corps, lunes: [], rayon: r, mat };
    if (id === 'terre') {
      const nuages = await texCharge('nuages-2048.jpg', false);
      if (nuages) { const mn = new THREE.MeshStandardMaterial({ alphaMap: nuages, color: 0xffffff, transparent: true, opacity: .85, depthWrite: false, roughness: 1 }); libres.push(mn); const c = new THREE.Mesh(geo, mn); c.scale.setScalar(r * 1.012); incl.add(c); P.nuages = c; }
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0x5aa0ff, transparent: true, opacity: .16, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })); libres.push(atmo.geometry, atmo.material); atmo.scale.setScalar(r * 1.09); incl.add(atmo); P.atmo = atmo; P.atmoK = 1.09;
    } else if (id === 'venus') {
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: .13, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })); libres.push(atmo.geometry, atmo.material); atmo.scale.setScalar(r * 1.06); incl.add(atmo); P.atmo = atmo;
    } else if (id === 'mars') {
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffb38a, transparent: true, opacity: .09, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })); libres.push(atmo.geometry, atmo.material); atmo.scale.setScalar(r * 1.04); incl.add(atmo); P.atmo = atmo; P.atmoK = 1.04;
    } else if (id === 'neptune') {
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0x5f8cff, transparent: true, opacity: .13, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })); libres.push(atmo.geometry, atmo.material); atmo.scale.setScalar(r * 1.05); incl.add(atmo); P.atmo = atmo; P.atmoK = 1.05;
    }
    // anneaux
    if (id === 'saturne') {
      const tr = await texCharge('espace/saturne-anneaux.webp'); const ri = 1.24, ro = 2.27, g = new THREE.RingGeometry(ri, ro, 160, 1), pos = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - ri) / (ro - ri), .5); }
      const m = new THREE.MeshStandardMaterial({ map: tr, transparent: true, side: THREE.DoubleSide, roughness: .9, depthWrite: false, color: tr ? 0xffffff : 0xcdbb94, opacity: .95 }); libres.push(g, m);
      const an = new THREE.Mesh(g, m); an.rotation.x = -Math.PI / 2; an.scale.setScalar(r); incl.add(an); P.anneaux = an;
      // Ombres (calcul analytique, sans carte d'ombre) : le Soleil est à l'origine ; centre de la planète, rayon et normale du plan des anneaux sont mis à jour à chaque image
      const U = { uPC: { value: new THREE.Vector3() }, uPR: { value: r }, uRN: { value: new THREE.Vector3(0, 1, 0) }, uRi: { value: ri }, uRo: { value: ro } }; P.ombres = U;
      const ajoutFrag = (shader, code) => { Object.assign(shader.uniforms, U);
        shader.vertexShader = 'varying vec3 vWP;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = 'varying vec3 vWP; uniform vec3 uPC; uniform float uPR; uniform vec3 uRN; uniform float uRi; uniform float uRo;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + code); };
      // anneaux : dans l'ombre du globe, ils s'assombrissent (bord adouci)
      m.onBeforeCompile = sh => ajoutFrag(sh, 'vec3 s = normalize(-vWP); vec3 oc = vWP - uPC; float b = dot(oc, s); float d2 = dot(oc, oc) - b * b; float ombre = (b < 0.0) ? 1.0 - smoothstep(uPR * .96, uPR * 1.04, sqrt(max(d2, 0.0))) : 0.0; gl_FragColor.rgb *= 1.0 - .88 * ombre;');
      // globe : la bande d'ombre des anneaux (le rayon vers le Soleil traverse le plan des anneaux entre leurs rayons intérieur et extérieur)
      mat.onBeforeCompile = sh => ajoutFrag(sh, 'vec3 s = normalize(-vWP); float dn = dot(s, uRN); float ombre = 0.0; if (abs(dn) > .02) { float t = dot(uPC - vWP, uRN) / dn; if (t > 0.0) { float rho = length(vWP + s * t - uPC) / uPR; ombre = smoothstep(uRi - .02, uRi + .03, rho) * (1.0 - smoothstep(uRo - .05, uRo, rho)); } } gl_FragColor.rgb *= 1.0 - .55 * ombre;');
      mat.needsUpdate = true;
    } else if (id === 'uranus') {
      const g = new THREE.RingGeometry(1.64, 2.0, 96), m = new THREE.MeshBasicMaterial({ color: 0x9fb4b8, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }); libres.push(g, m);
      const an = new THREE.Mesh(g, m); an.rotation.x = -Math.PI / 2; an.scale.setScalar(r); incl.add(an); P.anneaux = an;
    }
    // lunes
    for (const L of LUNES[id] || []) {
      const rl = L.rayonKm / UA_KM * UA_U * (mode === 'reelle' ? 1 : BOOST), t = L.texture ? await texCharge(L.texture) : null;
      const m = new THREE.MeshStandardMaterial({ map: t, color: t ? 0xffffff : L.couleur, roughness: .95 }); libres.push(m);
      const g = new THREE.SphereGeometry(1, 40, 20); libres.push(g); const mesh = new THREE.Mesh(g, m); mesh.scale.setScalar(Math.max(rl, r * .018));
      (id === 'terre' ? pivot : incl).add(mesh);
      const orb = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, k) => vec(Math.cos(k / 96 * 6.2832), 0, Math.sin(k / 96 * 6.2832)))), new THREE.LineBasicMaterial({ color: 0x6f86a8, transparent: true, opacity: .28, depthWrite: false })); libres.push(orb.geometry, orb.material);
      (id === 'terre' ? pivot : incl).add(orb);
      P.lunes.push({ L, mesh, orb, phase: Math.random() * 6.2832, rl });
    }
    // marqueur à taille d'écran constante (visible de loin)
    const anneau = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = 'rgba(200,225,255,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 24, 0, 6.2832); g.stroke(); const t = new THREE.CanvasTexture(c); libres.push(t); return t; })();
    P.marqueur = new THREE.Sprite(new THREE.SpriteMaterial({ map: anneau, sizeAttenuation: false, depthTest: false, transparent: true, opacity: .8 })); P.marqueur.scale.setScalar(.026); P.marqueur.renderOrder = 9; libres.push(P.marqueur.material); pivot.add(P.marqueur);
    // orbite
    if (id !== 'soleil') {
      const pts = pointsOrbite(id, Date.now(), 256).map(ecl), l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: id === 'terre' ? 0x6fb0ff : 0x8a96b0, transparent: true, opacity: id === 'terre' ? .55 : .32, depthWrite: false })); l.frustumCulled = false; libres.push(l.geometry, l.material); groupe.add(l); P.orbite = l;
    }
    planetes.set(id, P); return P;
  }
  for (const id of ORDRE_PLANETES) await creerPlanete(id);

  /* ───── Cérès, Vesta, ceinture ───── */
  const rocheTex = textureRoche(THREE, 11); libres.push(rocheTex);
  const petits = new Map();
  for (const [id, e] of Object.entries(PETITS)) {
    const d = ASTRES[id], m = new THREE.MeshStandardMaterial({ map: rocheTex, bumpMap: rocheTex, bumpScale: 1.5, color: d.couleur, roughness: .95 }); libres.push(m);
    const g = id === 'vesta' ? geometrieRocher(THREE, 2, 3) : new THREE.SphereGeometry(1, 40, 20); libres.push(g);
    const mesh = new THREE.Mesh(g, m); groupe.add(mesh); petits.set(id, { id, mesh, e, data: d });
  }
  const ceinture = creerCeinture(THREE, { nb: q.asteroides, uaUnites: UA_U, taille: 4 }); groupe.add(ceinture.groupe); libres.push({ dispose: ceinture.detruire });

  /* ───── mise à jour ───── */
  const tmp = vec(0, 0, 0), qTmp = new THREE.Quaternion();
  function placer(ts, tSim, tReel, camPos) {
    for (const [id, P] of planetes) {
      const h = positionHelio(id, ts); if (!h) continue; P.pivot.position.copy(ecl(h));
      // rotation propre : vraie période, jouée ×60 en temps réel (plus le temps accéléré)
      const periode = Math.abs(P.data.rotationH) * 3600, sens = P.data.rotationH < 0 ? -1 : 1;
      if (periode) P.corps.rotation.y = sens * 6.2832 * ((tSim + tReel * 60) / periode);
      if (P.spinAngle) P.corps.rotation.y += P.spinAngle;                       // « fais tourner » : rotation visible en plus de la vraie
      if (P.nuages) P.nuages.rotation.y = P.corps.rotation.y * 1.03;
      for (const m of P.lunes) {
        const T = Math.abs(m.L.periodeJ) * 86400, ang = m.phase + Math.sign(m.L.periodeJ) * 6.2832 * ((tSim + tReel * 400) / T);
        const dist = mode === 'reelle' ? m.L.distRp * ASTRES[id].rayonKm / UA_KM * UA_U : P.rayon * (m.L.distRp < 1.7 ? m.L.distRp : 1.7 + .95 * Math.log(m.L.distRp));
        m.mesh.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist); m.orb.scale.setScalar(dist);
        m.orb.visible = camPos.distanceTo(P.pivot.position) < P.rayon * 60;
      }
      P.marqueur.visible = true;
    }
    for (const p of petits.values()) {
      const e = p.e, d = (ts - 946728000000) / 864e5 + 1.5, M = (e.M0 + 360 * d / e.periodeJ) * RAD, v = M + 2 * e.e * Math.sin(M), r = e.a * (1 - e.e * e.e) / (1 + e.e * Math.cos(v)), u = v + e.w * RAD, N = e.N * RAD, i = e.i * RAD;
      const X = r * (Math.cos(N) * Math.cos(u) - Math.sin(N) * Math.sin(u) * Math.cos(i)), Y = r * (Math.sin(N) * Math.cos(u) + Math.cos(N) * Math.sin(u) * Math.cos(i)), Z = r * Math.sin(u) * Math.sin(i);
      p.mesh.position.set(X * UA_U, Z * UA_U, -Y * UA_U); const rr = Math.max(p.data.rayonKm / UA_KM * UA_U * (mode === 'reelle' ? 1 : BOOST * 1.6), .3); p.mesh.scale.setScalar(rr); p.mesh.rotation.y = tReel * .2;
    }
  }
  function maj(dt, t, ts, tSim, camera) {
    soleil.position.set(0, 0, 0); disque.scale.setScalar(rSoleil()); couronne.scale.setScalar(rSoleil() * 1.4); uSoleil.uT.value = t; disque.rotation.y = t * .015;
    const c = camera.getWorldPosition(tmp).length(); const k = Math.max(1, c / 160);
    halo1.scale.setScalar(rSoleil() * 4.2 * Math.min(k, 6)); halo2.scale.setScalar(rSoleil() * 12 * Math.min(k, 6));
    for (const P of planetes.values()) if (P.spinV) P.spinAngle = (P.spinAngle || 0) + P.spinV * dt;
    placer(ts, tSim, t, camera.getWorldPosition(vec(0, 0, 0))); ceinture.maj(tSim, t);
    for (const [id, P] of planetes) {
      P.corps.scale.setScalar(P.rayon);
      if (P.ombres) { P.pivot.getWorldPosition(P.ombres.uPC.value); P.ombres.uPR.value = P.rayon; P.ombres.uRN.value.set(0, 1, 0).applyQuaternion(P.incl.getWorldQuaternion(qTmp)); }
    }
  }
  function echelle(m) {
    if (m !== 'reelle' && m !== 'didactique') return false; mode = m; ceinture.reglerTaille(m === 'reelle' ? .02 : 4); ceinture.poussiere.visible = m !== 'reelle';
    for (const [id, P] of planetes) { P.rayon = aff(id); P.corps.scale.setScalar(P.rayon); if (P.atmo) P.atmo.scale.setScalar(P.rayon * (P.atmoK || 1.06)); if (P.anneau) { /* à l'échelle du corps */ } if (P.anneaux) P.anneaux.scale.setScalar(P.rayon); if (P.nuages) P.nuages.scale.setScalar(P.rayon * 1.012); for (const l of P.lunes) l.mesh.scale.setScalar(Math.max(l.L.rayonKm / UA_KM * UA_U * (mode === 'reelle' ? 1 : BOOST), P.rayon * .018)); P.marqueur.scale.setScalar(mode === 'reelle' ? .02 : .026); }
    return true;
  }
  const positionMonde = id => { if (id === 'soleil') return vec(0, 0, 0); const P = planetes.get(id); if (P) return P.pivot.getWorldPosition(vec(0, 0, 0)); const p = petits.get(id); return p ? p.mesh.position.clone() : null; };
  const rayon = id => id === 'soleil' ? rSoleil() : planetes.has(id) ? planetes.get(id).rayon : petits.has(id) ? petits.get(id).mesh.scale.x : 1;
  // sélection par l'écran : le corps (ou son marqueur) le plus proche du doigt, dans un rayon de 24 px
  function pick(camera, x, y, w, h) {
    let best = null, bd = 28;
    const test = (id, pos, r) => {
      const p = pos.clone().project(camera); if (p.z > 1) return; const sx = (p.x * .5 + .5) * w, sy = (-p.y * .5 + .5) * h, dist = camera.position.distanceTo(pos);
      const rpx = r / (dist * Math.tan(camera.fov * RAD / 2)) * h / 2, d = Math.hypot(sx - x, sy - y) - Math.max(rpx, 0); if (d < bd) { bd = d; best = id; }
    };
    test('soleil', vec(0, 0, 0), rSoleil());
    for (const [id, P] of planetes) test(id, P.pivot.getWorldPosition(vec(0, 0, 0)), P.rayon);
    for (const p of petits.values()) test(p.id, p.mesh.position, p.mesh.scale.x * 1.2);
    return best;
  }
  function qualite(nq) { /* segments fixés à la création ; la ceinture garde son nombre */ }
  function detruire() { libres.forEach(x => { try { x.dispose(); } catch (e) { /* déjà libéré */ } }); }
  // Fait tourner une planète sur elle-même (rad/s) ; tourner(null) arrête. Le Soleil et les petits corps n'ont pas de rotation visible : renvoie false.
  let tourne = null;
  function tourner(id, v = .6) { for (const P of planetes.values()) P.spinV = 0; tourne = null; if (!id) return true; const P = planetes.get(id); if (!P) return false; P.spinV = v; tourne = id; return true; }
  const nommes = { soleil, planetes, petits };
  return { groupe, maj, positionMonde, rayon, pick, echelle, tourner, tourne: () => tourne, echelleActuelle: () => mode, nommes, detruire, ceinture, lumiere, soleilMesh: soleil, qualite, ecl };
}
