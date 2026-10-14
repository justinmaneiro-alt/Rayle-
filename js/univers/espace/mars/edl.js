// Entrée, descente et atterrissage (EDL) d'un rover martien : capsule (bouclier thermique + coque arrière), parachute, étage de descente à huit rétrofusées et « grue céleste »
// (le rover descend au bout de trois câbles), avec plasma d'entrée, flammes et poussière. Dimensions d'après le vaisseau de Perseverance : capsule 4,5 m, parachute 21,5 m,
// câbles de 7,6 m. Les suspentes du parachute sont raccourcies (32 m) pour garder tout le vaisseau dans le champ de la caméra.
// creerEDL(THREE, {q, rover}) → { racine, placer(phase), maj(dt, t), etat, bouclier, coque, parachute, etage, rover, flammes, plasma, detruire() }
//   phases : 'entree' (bouclier + coque, plasma) · 'parachute' (voile gonflée) · 'descente' (étage + rover, rétrofusées) · 'sol' (rover seul)
//   etat   : { plasma 0..1, chute 0..1, flammes 0..1, cable (longueur 0..7,6 m), coupe (câbles coupés) }
export function creerEDL(THREE, { q, rover: rover0 }) {
  let rover = rover0; const setRover = g => { rover = g; };                      // le rover suspendu peut changer (Perseverance, Curiosity)
  const racine = new THREE.Group(); racine.name = 'edl'; const libres = [], vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: .4 }, o)); libres.push(m); return m; };
  const geo = g => { libres.push(g); return g; };
  const etat = { plasma: 0, chute: 0, flammes: 0, cable: 0, coupe: false, balance: 0 };

  /* ───── bouclier thermique et coque arrière ───── */
  const bouclier = new THREE.Group(), coque = new THREE.Group(); racine.add(bouclier, coque);
  const matBouclier = mat(0x2c231e, { roughness: .95, metalness: .1, emissive: 0xff5a14, emissiveIntensity: 0 });
  const hs = new THREE.Mesh(geo(new THREE.CylinderGeometry(2.25, .3, .85, 40)), matBouclier); hs.position.y = -.43; bouclier.add(hs);
  const bague = new THREE.Mesh(geo(new THREE.TorusGeometry(2.2, .06, 8, 48)), mat(0x9a9a9a)); bague.rotation.x = Math.PI / 2; bague.position.y = 0; bouclier.add(bague);
  const bs = new THREE.Mesh(geo(new THREE.CylinderGeometry(.75, 2.2, 1.9, 40, 1, true)), mat(0xe9e7e2, { roughness: .5, metalness: .3, side: THREE.DoubleSide })); bs.position.y = .95; coque.add(bs);
  const sommet = new THREE.Mesh(geo(new THREE.CylinderGeometry(.75, .75, .18, 24)), mat(0xbcbcbc)); sommet.position.y = 1.95; coque.add(sommet);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, t = new THREE.Mesh(geo(new THREE.CylinderGeometry(.09, .09, .22, 10)), mat(0x1e1e22)); t.position.set(Math.cos(a) * 1.62, .85, Math.sin(a) * 1.62); t.rotation.z = Math.cos(a) * .6; t.rotation.x = -Math.sin(a) * .6; coque.add(t); }   // propulseurs d'attitude

  /* ───── parachute : voile (gores orange et blanc) + suspentes ───── */
  const parachute = new THREE.Group(); racine.add(parachute);
  const tex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); const N = 48; for (let i = 0; i < N; i++) { g.fillStyle = i % 2 ? '#f3efe9' : (i % 6 === 0 ? '#ff7a1a' : '#ff5a00'); g.fillRect(i * 512 / N, 0, 512 / N + 1, 128); } g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 116, 512, 12); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; libres.push(t); return t; })();
  const R_VOILE = 10.75, L_SUSP = 32, nSusp = 48;
  const voile = new THREE.Mesh(geo(new THREE.SphereGeometry(R_VOILE, 48, 16, 0, Math.PI * 2, 0, 1.18)), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .9, metalness: 0, emissive: 0x331100, emissiveIntensity: .25 })); libres.push(voile.material);
  parachute.add(voile);
  const posS = new Float32Array(nSusp * 6), gS = geo(new THREE.BufferGeometry()); gS.setAttribute('position', new THREE.BufferAttribute(posS, 3));
  const suspentes = new THREE.LineSegments(gS, new THREE.LineBasicMaterial({ color: 0xf4efe6, transparent: true, opacity: .8 })); libres.push(suspentes.material); suspentes.frustumCulled = false; parachute.add(suspentes);
  // la voile est un dôme dont la base (rayon de bord) est à y = R·cos(1,18) ; on pose le sommet de la capsule à (0, 0) et la voile au-dessus à L_SUSP
  const yBord = R_VOILE * Math.cos(1.18), rBord = R_VOILE * Math.sin(1.18);
  function majVoile(k, sway) {
    const g = Math.max(.001, k);
    voile.scale.set(g, g, g); voile.position.set(Math.sin(sway) * 1.2 * g, L_SUSP - yBord * g, Math.cos(sway * .7) * .8 * g); voile.rotation.z = Math.sin(sway) * .05;
    const top = vec(0, 1.95, 0);
    for (let i = 0; i < nSusp; i++) { const a = i / nSusp * 6.2832, bx = Math.cos(a) * rBord * g + voile.position.x, bz = Math.sin(a) * rBord * g + voile.position.z; posS.set([top.x, top.y, top.z, bx, voile.position.y + yBord * g, bz], i * 6); }
    gS.attributes.position.needsUpdate = true; parachute.visible = k > .002;
  }

  /* ───── étage de descente : huit rétrofusées, flammes, trois câbles vers le rover ───── */
  const etage = new THREE.Group(); racine.add(etage);
  const or = mat(0xcf9f48, { metalness: .8, roughness: .35 }), blanc = mat(0xe8e6e0), noir = mat(0x1d1e22, { roughness: .7 }), bronze = mat(0x8a6a3a, { metalness: .9, roughness: .4 });
  const corps = new THREE.Mesh(geo(new THREE.BoxGeometry(2.6, .45, 1.7)), or); etage.add(corps);
  const dessus = new THREE.Mesh(geo(new THREE.BoxGeometry(2.0, .12, 1.3)), blanc); dessus.position.y = .3; etage.add(dessus);
  const boite = new THREE.Mesh(geo(new THREE.CylinderGeometry(.5, .5, .5, 20)), blanc); boite.position.y = .6; etage.add(boite);
  const flammes = [], matFlamme = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); libres.push(matFlamme);
  const geoFl = geo(new THREE.ConeGeometry(.3, 1, 14, 1, true)); geoFl.rotateX(Math.PI); geoFl.translate(0, -.5, 0);        // pointe vers le bas : large à la tuyère, fine au bout
  { const p = geoFl.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, -p.getY(i))), k = 1 - .82 * t; c.set([1 * k, (.86 - .55 * t) * k, (.55 - .5 * t) * k], i * 3); } geoFl.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  for (let k = 0; k < 8; k++) {
    const s = k < 4 ? -1 : 1, i = k % 4, x = (i % 2 ? 1 : -1) * 1.1, z = (i < 2 ? -1 : 1) * .72, bras = new THREE.Mesh(geo(new THREE.BoxGeometry(.7, .09, .09)), noir); bras.position.set(x * .9 + s * .05, -.08, z * .85); etage.add(bras);
    const buse = new THREE.Mesh(geo(new THREE.CylinderGeometry(.12, .3, .5, 16, 1, true)), bronze); buse.position.set(x * 1.22 + s * .12, -.34, z); buse.material.side = THREE.DoubleSide; etage.add(buse);
    const f = new THREE.Mesh(geoFl, matFlamme); f.position.set(buse.position.x, buse.position.y - .2, z); f.userData.base = 1; f.visible = false; etage.add(f); flammes.push(f);
  }
  const lumFlamme = new THREE.PointLight(0xff9a40, 0, 60, 1.4); lumFlamme.position.set(0, -1.2, 0); etage.add(lumFlamme);
  const posC = new Float32Array(6 * 3 * 2), gC = geo(new THREE.BufferGeometry()); gC.setAttribute('position', new THREE.BufferAttribute(posC, 3));
  const cables = new THREE.LineSegments(gC, new THREE.LineBasicMaterial({ color: 0xe8e0d0 })); libres.push(cables.material); cables.frustumCulled = false; etage.add(cables);
  const POINTS_CABLE = [[.9, -.2, .5], [-.9, -.2, .5], [0, -.2, -.8]];                // fixations sous l'étage ; le rover est suspendu dessous
  function majCables() {
    if (rover.parent !== etage) { cables.visible = false; return; }                // le rover est posé : plus de câbles
    const L = etat.cable, yR = -1.7 - L;                                              // le rover pend à 1,7 m sous l'étage (câbles rentrés), puis descend jusqu'à 7,6 m de plus
    rover.position.set(0, yR - 0, 0);
    let i = 0; for (const [x, y, z] of POINTS_CABLE) { posC.set([x, y, z, x * .55, yR + 1.45, z * .55], i * 6); i++; }
    gC.attributes.position.needsUpdate = true; cables.visible = !etat.coupe;
  }
  etage.add(rover);                                                                    // le rover est un enfant de l'étage tant qu'il est suspendu

  /* ───── plasma d'entrée : traînée de particules + onde de choc ───── */
  const NP = q.fumee > .5 ? 520 : 240, pP = new Float32Array(NP * 3), pV = new Float32Array(NP * 3), pT = new Float32Array(NP), pC = new Float32Array(NP * 3);
  const gP = geo(new THREE.BufferGeometry()); gP.setAttribute('position', new THREE.BufferAttribute(pP, 3)); gP.setAttribute('color', new THREE.BufferAttribute(pC, 3)); gP.boundingSphere = new THREE.Sphere(vec(0, 0, 0), 200);
  const rond = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); libres.push(t); return t; })();
  const plasmaPts = new THREE.Points(gP, new THREE.PointsMaterial({ size: 16, map: rond, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .95 })); libres.push(plasmaPts.material); plasmaPts.frustumCulled = false; racine.add(plasmaPts);
  const gl = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(.25, 'rgba(255,190,100,.8)'); gr.addColorStop(.6, 'rgba(255,90,20,.3)'); gr.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; libres.push(t); return t; })();
  const sillage = new THREE.Sprite(new THREE.SpriteMaterial({ map: gl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); libres.push(sillage.material); sillage.position.set(0, 2.2, 0); racine.add(sillage);
  const choc = new THREE.Sprite(new THREE.SpriteMaterial({ map: gl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); libres.push(choc.material); choc.position.set(0, -1.2, 0); racine.add(choc);
  let curseur = 0;
  function emettrePlasma(n, intensite) { for (let k = 0; k < n; k++) { const i = curseur++ % NP, a = Math.random() * 6.283, r = 1.4 + Math.random() * .9; pP[i * 3] = Math.cos(a) * r; pP[i * 3 + 1] = -.5 + Math.random() * .4; pP[i * 3 + 2] = Math.sin(a) * r; pV[i * 3] = Math.cos(a) * (2 + Math.random() * 6); pV[i * 3 + 1] = 28 + Math.random() * 40; pV[i * 3 + 2] = Math.sin(a) * (2 + Math.random() * 6); pT[i] = 1; } }
  function majPlasma(dt) {
    const I = etat.plasma;
    if (I > .02) emettrePlasma(Math.floor(NP * dt * 1.6 * I) + (Math.random() < NP * dt * 1.6 * I % 1 ? 1 : 0), I);
    for (let i = 0; i < NP; i++) { if (pT[i] <= 0) { pC[i * 3] = pC[i * 3 + 1] = pC[i * 3 + 2] = 0; continue; } pT[i] -= dt * 1.2; pP[i * 3] += pV[i * 3] * dt; pP[i * 3 + 1] += pV[i * 3 + 1] * dt; pP[i * 3 + 2] += pV[i * 3 + 2] * dt; const a = Math.max(0, pT[i]); pC[i * 3] = a * 1.0 * I + a * .2; pC[i * 3 + 1] = a * a * .62 * I; pC[i * 3 + 2] = a * a * a * .25 * I; }
    gP.attributes.position.needsUpdate = true; gP.attributes.color.needsUpdate = true;
    sillage.material.opacity = Math.min(.85, I * .9); sillage.scale.set(8 + 10 * I, 14 + 22 * I, 1);
    matBouclier.emissiveIntensity = I * 1.6; choc.material.opacity = Math.min(.9, I * 1.05); choc.scale.setScalar(5 + 9 * I + Math.sin(performance.now() * .03) * .8);
  }

  /* ───── phases et mise à jour ───── */
  function placer(phase) {
    bouclier.visible = phase === 'entree' || phase === 'parachute'; coque.visible = phase === 'entree' || phase === 'parachute';
    plasmaPts.visible = choc.visible = sillage.visible = phase === 'entree'; parachute.visible = phase === 'parachute';
    etage.visible = phase === 'descente' || phase === 'sol' || phase === 'parachute'; if (phase === 'parachute') { boite.visible = true; }
    // sous le parachute et pendant l'entrée, l'étage et le rover sont à l'abri sous la coque
    etage.position.set(0, phase === 'entree' || phase === 'parachute' ? 1.1 : 0, 0); etage.scale.setScalar(phase === 'entree' || phase === 'parachute' ? 1 : 1);
    if (phase === 'entree') { etage.visible = false; }
    if (phase === 'sol') { etage.visible = false; }
  }
  function maj(dt, t) {
    majPlasma(dt); majVoile(etat.chute, t * .8 + etat.balance); majCables();
    for (const f of flammes) { const k = etat.flammes; f.visible = k > .02; if (k > .02) { f.scale.set((.75 + Math.random() * .5) * (.7 + .5 * k), (.8 + Math.random() * .7) * (1.2 + 1.8 * k) * k, (.75 + Math.random() * .5) * (.7 + .5 * k)); } }
    lumFlamme.intensity = etat.flammes * (80 + Math.random() * 40);
  }
  function detruire() { libres.forEach(x => { try { x.dispose(); } catch (e) { /* déjà libéré */ } }); }
  // remet tout en place pour rejouer l'atterrissage (pièces ré-attachées, positions et rotations d'origine)
  function reinit() {
    racine.add(bouclier, coque, parachute, etage); etage.add(rover);
    for (const g of [bouclier, coque, parachute, etage]) { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.visible = true; }
    racine.position.set(0, 0, 0); racine.rotation.set(0, 0, 0); racine.scale.setScalar(1); racine.visible = true;
    Object.assign(etat, { plasma: 0, chute: 0, flammes: 0, cable: 0, coupe: false, balance: 0 }); placer('entree');
  }
  placer('entree');
  return { reinit, setRover, racine, placer, maj, etat, bouclier, coque, parachute, etage, rover, flammes, plasmaPts, choc, lumFlamme, detruire, matBouclier, yBord, rBord };
}
