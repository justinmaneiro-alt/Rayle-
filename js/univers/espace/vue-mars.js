// VUE « MARS » du thème Espace : « Atterrir sur Mars » (approche, entrée atmosphérique avec flammes, parachute, rétrofusées, grue céleste, poussière, ciel rosé et deux lunes),
// puis la maquette 3D du rover (Perseverance : modèle NASA ; Curiosity : modèle procédural) avec pièces cliquables, légendes et présentation parlée.
// Contrat d'une vue : voir vue-systeme.js. Commandes : 'atterrir' · 'rover' ({nom}) · 'presenter' ({nom: 'perseverance'|'curiosity'|'mars'}) · 'piece' ({nom}) · 'orbite' · 'autre-rover'.
import { creerDecor, hauteur } from './mars/decor.js?v=2026.10.15.4';
import { creerEDL } from './mars/edl.js?v=2026.10.15.4';
import { creerRover } from './mars/rover.js?v=2026.10.15.4';
import { ROVERS, composerRover, NOM_ANGLE, reponseRover } from '../donnees/rovers.js?v=2026.10.15.4';
import { ASTRES } from '../donnees/planetes.js?v=2026.10.15.4';

const RAD = Math.PI / 180;
const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const NOMS_ROVERS = { perseverance: ['perseverance', 'perseverence', 'persy', 'rover perseverance', 'mars 2020'], curiosity: ['curiosity', 'curiosite', 'rover curiosity', 'msl'] };
export function trouverRover(nom) { const n = norm(nom).replace(/^(?:le |la |l |rover )+/, ''); for (const [id, l] of Object.entries(NOMS_ROVERS)) if (l.some(x => x === n || n.includes(x))) return id; return null; }
const R_MARS = 100, KM = R_MARS / 3389.5;                                   // scène orbitale : Mars = 100 unités (1 km = 0,0295 unité)

export default async function creerVue(P) {
  const { THREE, noyau, hud, camera, ctrl, ctx, scene, q } = P, vec = P.vec, esc = P.esc, pont = P.pont;
  hud.charge('Mars…', .6);
  const groupe = new THREE.Group(); groupe.name = 'vue-mars'; scene.add(groupe); groupe.visible = false;
  const libres = [];

  /* ───── scène orbitale : Mars, atmosphère, Soleil ───── */
  const orbite = new THREE.Group(); groupe.add(orbite);
  const texMars = await noyau.texture(q.tex >= 4096 ? 'espace/mars-2k.webp' : 'espace/mars-1k.webp').catch(() => null);
  const mars = new THREE.Mesh(new THREE.SphereGeometry(R_MARS, 96, 48), new THREE.MeshStandardMaterial({ map: texMars, color: texMars ? 0xffffff : 0xb5583a, roughness: 1, metalness: 0 })); libres.push(mars.geometry, mars.material); orbite.add(mars);
  const matAtmo = new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uSun: { value: vec(1, .2, .3).normalize() } }, vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vP=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 vN; varying vec3 vP; uniform vec3 uSun; void main(){ float rim=pow(clamp(1.-abs(dot(normalize(vN),vec3(0.,0.,1.))),0.,1.),2.4); float l=smoothstep(-.4,.5,dot(normalize(vP),uSun)); gl_FragColor=vec4(vec3(1.,.62,.42)*rim*(.15+.85*l)*1.1,rim*(.2+.8*l)); }' }); libres.push(matAtmo);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_MARS * 1.045, 64, 32), matAtmo); libres.push(atmo.geometry); orbite.add(atmo);
  const solOrb = new THREE.DirectionalLight(0xfff2e0, 3.2); orbite.add(solOrb); orbite.add(solOrb.target); const ambOrb = new THREE.AmbientLight(0x2a1b17, .5); orbite.add(ambOrb);
  const sunO = vec(1, .22, .35).normalize(); solOrb.position.copy(sunO).multiplyScalar(500); matAtmo.uniforms.uSun.value.copy(sunO);

  /* ───── surface, rover, EDL (créés à la demande) ───── */
  const decor = creerDecor(THREE, { q }); decor.groupe.visible = false; groupe.add(decor.groupe);
  let rovers = {}, rover = null, edl = null, roverId = 'perseverance';
  async function assurerRover(id) {
    if (!rovers[id]) { hud.legende('Chargement de la maquette 3D de ' + ROVERS[id].nom + '…', 0); rovers[id] = await creerRover(ctx, id); hud.legende(null); }
    return rovers[id];
  }
  const tele = (() => { const d = document.createElement('div'); d.className = 'univ-tele'; d.hidden = true; d.innerHTML = '<div><small>ALTITUDE</small><b data-k="alt">—</b></div><div><small>VITESSE</small><b data-k="vit">—</b></div><div><small>PHASE</small><b data-k="phase">—</b></div>'; document.getElementById('vueUnivers').appendChild(d); return d; })();
  const majTele = (alt, vit, phase) => { tele.querySelector('[data-k=alt]').textContent = alt; tele.querySelector('[data-k=vit]').textContent = vit; tele.querySelector('[data-k=phase]').textContent = phase; };
  const km = n => (n >= 10 ? Math.round(n).toLocaleString('fr-FR') : n.toFixed(1).replace('.', ',')) + ' km', kmh = n => Math.round(n / 10) * 10, kmhT = n => kmh(n).toLocaleString('fr-FR') + ' km/h';

  let etape = 'orbite', actif = false, enSequence = false, suivi = null, presEnCours = 0;
  function etapeOrbite() { etape = 'orbite'; orbite.visible = true; decor.groupe.visible = false; P.ciel.groupe.visible = true; scene.fog = null; }
  function etapeSurface() { etape = 'surface'; orbite.visible = false; decor.groupe.visible = true; P.ciel.groupe.visible = false; scene.fog = decor.brume; }
  function fermerSurface() { scene.fog = null; P.ciel.groupe.visible = true; }

  /* ───── narration (ne bloque pas l'animation) ───── */
  async function narrer(lignes, vivant) { const Pt = pont(); for (const l of lignes) { if (!vivant()) return; hud.legende(l, 9000); if (Pt.dire) { if ((await Pt.dire(l)) === false) return; } else await noyau.attendre(Math.min(7, 2 + l.length / 45)); } }

  /* ───── l'atterrissage : cinématique passable ───── */
  async function atterrir(opts = {}) {
    const R = ROVERS[opts.rover || roverId], id = ++presEnCours, Pt = pont(), epoque = Pt.epoque ? Pt.epoque() : 0, vivant = () => id === presEnCours && (!Pt.epoque || Pt.epoque() === epoque);
    enSequence = true; hud.carte(null); ctrl.c.enabled = false; ctrl.c.autoRotate = false; clearRovers(); tele.hidden = false;
    rover = await assurerRover(opts.rover || roverId); roverId = rover.def.id;
    if (!edl) edl = creerEDL(THREE, { q, rover: rover.groupe }); else { rover.groupe.removeFromParent(); edl.setRover(rover.groupe); edl.etage.add(rover.groupe); }
    groupe.add(edl.racine); edl.reinit(); decor.poussiere.vider();
    const lignes = [
      'Nous approchons de Mars à plus de vingt mille kilomètres par heure. Le vaisseau va traverser l’atmosphère en environ sept minutes : les ingénieurs l’appellent « les sept minutes de terreur ».',
      'L’entrée dans l’atmosphère commence à environ 125 kilomètres d’altitude. Le bouclier thermique monte à plus de 1 300 degrés, et tout se passe sans aucune aide de la Terre.',
      'À environ 11 kilomètres d’altitude, le parachute s’ouvre à plus de 1 500 kilomètres par heure ; sa voile mesure plus de vingt mètres de large.',
      'Le bouclier se détache, et un radar scrute le sol pour mesurer la vitesse et l’altitude.',
      'À environ deux kilomètres, la coque et le parachute se séparent, et huit rétrofusées s’allument pour freiner la descente.',
      'Maintenant, la grue céleste : l’étage de descente reste en vol stationnaire et fait descendre le rover au bout de trois câbles.',
      'Contact : le rover touche le sol à moins de trois kilomètres par heure. Les câbles sont coupés, et l’étage s’éloigne pour s’écraser plus loin.',
    ];
    let ligneIdx = 0, passee = false, fini = false, tCoque = null; const dire = () => { if (ligneIdx < lignes.length && vivant()) narrer([lignes[ligneIdx++]], vivant); };
    await noyau.cinematique(async api => {
      // ── 1. approche, entrée atmosphérique (scène orbitale : la capsule est agrandie) ──
      etapeOrbite(); edl.placer('entree'); edl.racine.scale.setScalar(.34); camera.far = 5000; majTele('—', '—', 'APPROCHE');
      P.suivreTerre(false); mars.rotation.y = 0;
      const th0 = -2.6, dth = .42, sensTh = 1, tang = th => vec(-Math.sin(th) * sensTh, 0, Math.cos(th) * sensTh), radial = th => vec(Math.cos(th), 0, Math.sin(th));
      const pose = u => { const th = th0 + dth * u, r = R_MARS + (u < .4 ? (400 - 275 * u / .4) * KM : (125 - 113 * Math.pow((u - .4) / .6, 1.35)) * KM + 0 ); return { th, r, p: radial(th).multiplyScalar(r), t: tang(th), up: radial(th) }; };
      sunO.set(Math.cos(th0 + dth * .5 + .5), .3, Math.sin(th0 + dth * .5 + .5)).normalize(); solOrb.position.copy(sunO).multiplyScalar(500); matAtmo.uniforms.uSun.value.copy(sunO);
      dire();
      await api.tween(9, e => { const k = pose(e * .4); edl.racine.position.copy(k.p); edl.racine.quaternion.setFromUnitVectors(vec(0, 1, 0), k.t.clone().multiplyScalar(.93).addScaledVector(k.up, -.37).normalize().negate()); const cam = k.p.clone().addScaledVector(k.t, -9 + e * 3).addScaledVector(k.up, 2.6 + (1 - e) * 5).addScaledVector(vec(0, 1, 0), 1.2); camera.position.copy(cam); camera.lookAt(k.p.clone().addScaledVector(k.t, 2)); const alt = 400 - 275 * e; majTele(km(alt), kmhT(20400), 'CROISIÈRE'); }, { ease: noyau.EASE.lineaire });
      dire();
      await api.tween(11, e => {
        const u = .4 + .6 * e, k = pose(u); edl.racine.position.copy(k.p); edl.racine.quaternion.setFromUnitVectors(vec(0, 1, 0), k.t.clone().multiplyScalar(.8).addScaledVector(k.up, -.6).normalize().negate());
        edl.etat.plasma = Math.min(1, e * 4) * (1 - Math.max(0, (e - .78) / .22) * .6);
        const sh = (1 - e) * .0; camera.position.copy(k.p.clone().addScaledVector(k.t, -6.5).addScaledVector(k.up, 2.0).addScaledVector(vec(0, 1, 0), 1.0)).add(vec((Math.random() - .5) * .06 * edl.etat.plasma, (Math.random() - .5) * .06 * edl.etat.plasma, 0)); camera.lookAt(k.p.clone().addScaledVector(k.t, 1.2));
        const alt = 125 - 113 * Math.pow(e, 1.35), vit = 20400 - (20400 - 1500) * Math.pow(e, .62); majTele(km(alt), kmhT(vit), 'ENTRÉE ATMOSPHÉRIQUE');
      }, { ease: noyau.EASE.lineaire });
      // ── 2. coupure : on passe à la scène de surface, à 11 km d'altitude ──
      await noyau.fondu(true); edl.etat.plasma = 0; etapeSurface(); edl.racine.scale.setScalar(1); edl.racine.quaternion.identity(); edl.placer('parachute'); edl.etat.chute = 0; decor.poussiere.vider();
      const ground = x => hauteur(x, 0);
      const rig = edl.racine; rig.position.set(900, 11000, -2500); majTele('11,0 km', kmhT(1500), 'OUVERTURE DU PARACHUTE'); await noyau.fondu(false); dire();
      const cam1 = (e) => { camera.position.set(rig.position.x + 70, rig.position.y - 20 - (1 - e) * 8, rig.position.z + 95); camera.lookAt(rig.position.x, rig.position.y + 14, rig.position.z); };
      cam1(0);
      await api.tween(3.2, e => { edl.etat.chute = e * e * (3 - 2 * e); edl.etat.balance = 0; cam1(e); majTele('11,0 km', kmhT(1500 - 450 * e), 'GONFLAGE DU PARACHUTE'); }, { ease: noyau.EASE.lineaire });
      // le bouclier thermique se détache et tombe
      dire(); let bou = 0; edl.bouclier.visible = true; const bouP = vec(0, 0, 0);
      await api.tween(7.5, e => { rig.position.y = 11000 - 3400 * e; rig.position.x = 900 - 520 * e; rig.position.z = -2500 + 1400 * e; bou += .016; edl.bouclier.position.set(bouP.x + 3 * e * 8, -e * e * 160 - e * 12, bouP.z + 4 * e * 6); edl.bouclier.rotation.set(e * 3.2, e * 1.2, e * 1.8); edl.bouclier.visible = e < .98; cam1(e); majTele(km((rig.position.y - ground(rig.position.x)) / 1000), kmhT(1050 - 520 * e), 'SÉPARATION DU BOUCLIER'); }, { ease: noyau.EASE.lineaire });
      await api.tween(6, e => { rig.position.y = 7600 - 5400 * e; rig.position.x = 380 - 300 * e; rig.position.z = -1400 + 1100 * e; edl.etat.balance = Math.sin(e * 9) * .08; camera.position.set(rig.position.x + 55, rig.position.y - 14, rig.position.z + 80); camera.lookAt(rig.position.x, rig.position.y + 10, rig.position.z); majTele(km((rig.position.y - ground(rig.position.x)) / 1000), kmhT(530 - 220 * e), 'DESCENTE SOUS PARACHUTE'); }, { ease: noyau.EASE.lineaire });
      // ── 3. descente motorisée : la coque et le parachute se séparent, huit rétrofusées ──
      dire(); edl.placer('descente'); rig.add(edl.coque, edl.parachute); edl.coque.visible = true; edl.parachute.visible = true; edl.etage.visible = true; edl.etage.position.set(0, 0, 0);
      const sepP = rig.position.clone(); tCoque = new THREE.Group(); scene.add(tCoque); tCoque.position.copy(sepP); tCoque.add(edl.coque, edl.parachute); edl.etat.cable = 0;
      await api.tween(3, e => { tCoque.position.set(sepP.x - e * 40, sepP.y + e * e * 60 - e * 10, sepP.z - e * 30); tCoque.rotation.z = e * .5; edl.etat.flammes = e; majTele(km((rig.position.y - ground(rig.position.x)) / 1000), kmhT(310 - 80 * e), 'RÉTROFUSÉES'); camera.position.set(rig.position.x + 26, rig.position.y - 6, rig.position.z + 34); camera.lookAt(rig.position.x, rig.position.y - 1, rig.position.z); }, { ease: noyau.EASE.lineaire });
      tCoque.visible = false; const y0 = rig.position.y;
      await api.tween(10, e => {
        const a = y0 - (y0 - 11.5) * (1 - Math.pow(1 - e, 1.6)); rig.position.set(80 - 80 * e, a, 300 - 300 * e); edl.etat.flammes = 1;
        const bas = a < 90; camera.position.set(rig.position.x + 22 - e * 6, Math.max(2.6, a - 8 - 20 * (1 - e)) + (bas ? 0 : 0), rig.position.z + 30 - e * 10); camera.lookAt(rig.position.x, rig.position.y - 2, rig.position.z);
        if (a < 120 && Math.random() < .9) decor.poussiere.emettre(rig.position.x, hauteur(rig.position.x, rig.position.z) + .3, rig.position.z, Math.floor(1 + (1 - a / 120) * 7), 16, 8);
        const v = 230 - 215 * Math.min(1, e * 1.15); majTele(km(Math.max(a, 0) / 1000), kmhT(v), 'DESCENTE MOTORISÉE');
      }, { ease: noyau.EASE.lineaire });
      // ── 4. la grue céleste : le rover descend au bout de trois câbles ──
      dire();
      await api.tween(7, e => { edl.etat.cable = 9.3 * e * e * (3 - 2 * e); edl.etat.flammes = 1 - .2 * e; rig.position.y = 11.5 - .8 * e; decor.poussiere.emettre(0, .3, 0, 10, 15, 8); camera.position.set(17 - 5 * e, 3.4 + 1.2 * e, 22 - 7 * e); camera.lookAt(0, 5.5 - 1.2 * e, 0); majTele(Math.max(0, Math.round(rig.position.y - 1.7 - edl.etat.cable)).toString() + ' m', '≈ 2 km/h', 'GRUE CÉLESTE'); }, { ease: noyau.EASE.lineaire });
      // ── 5. contact, câbles coupés, l'étage s'éloigne ──
      dire(); edl.etat.coupe = true; rover.groupe.removeFromParent(); decor.groupe.add(rover.groupe); rover.groupe.position.set(0, hauteur(0, 0), 0); rover.groupe.rotation.set(0, 2.2, 0);
      const rig0 = rig.position.clone(); majTele('0 m', '0 km/h', 'CONTACT');
      await api.tween(6, e => { rig.position.set(rig0.x + e * e * 90, rig0.y + e * 42 - e * e * 8, rig0.z - e * e * 40); rig.rotation.z = -e * .6; edl.etat.flammes = e < .8 ? 1 : 0; decor.poussiere.emettre(0, .3, 0, e < .35 ? 6 : 0, 14, 8); camera.position.set(11 + e * 3, 2.4 + e * .8, 14 - e * 3); camera.lookAt(0, 1.2 + e * 5, 0); }, { ease: noyau.EASE.lineaire });
      edl.etage.visible = false; rig.visible = false; tele.hidden = true; scene.remove(tCoque); fini = true;
      ctrl.c.autoRotate = false; passee = api.passee;
    }, { passable: true, fin: () => { enSequence = false; } });
    if (passee) { try { pont().arreter && pont().arreter(); } catch (e) { /* rien à couper */ } }
    // skip ou fin : on arrive toujours au même état final
    edl.racine.visible = false; edl.etat.flammes = 0; tele.hidden = true; if (rover.groupe.parent !== decor.groupe) { rover.groupe.removeFromParent(); decor.groupe.add(rover.groupe); } rover.groupe.position.set(0, hauteur(0, 0), 0); etapeSurface();
    if (!vivant()) { enSequence = false; return { ok: false, texte: 'Atterrissage interrompu.' }; }
    await montrerRover(roverId, { arriveeAuSol: true });
    const fin = R.nom + ' est posée dans le ' + R.site.nom + '. Son signal met environ onze minutes pour atteindre la Terre. Touche une pièce du rover pour la découvrir.';
    hud.legende(fin, 10000); if (Pt.dire && vivant()) Pt.dire(fin);
    return { ok: true, texte: R.nom + ' a atterri dans le ' + R.site.nom + '.' };
  }
  function clearRovers() { etiqRover(false); if (rover) rover.surligner(null); }

  /* ───── le rover posé : orbite autour de lui, pièces cliquables ───── */
  let hotspots = [];
  function etiqRover(oui) { ctx.etiquettes.vider('rov:'); hotspots = []; if (!oui || !rover) return; rover.pieces.forEach((p, i) => { if (!p.objets.length) return; hotspots.push(p.id); ctx.etiquettes.ajouter({ id: 'rov:' + p.id, html: '<span class="univ-pastille appareil" style="background:rgba(255,170,40,.95);box-shadow:0 0 0 2px #fff,0 0 12px rgba(255,170,40,.8)">' + (i + 1) + '</span>', classe: 'actu', position: () => rover.groupe.localToWorld(p.centre.clone().add(p.centre.clone().sub(vec(0, 1.1, 0)).setLength(.5)).add(vec(0, .12, 0))), alpha: () => actif && etape === 'surface' && !enSequence ? 1 : 0, onClick: () => fichePiece(p.id) }); }); }
  function fichePiece(pid) {
    const p = rover.pieces.find(x => x.id === pid); if (!p) return; rover.surligner(pid);
    hud.carte({ titre: '🔧 ' + p.nom, html: '<p>' + esc(p.texte) + '</p>', actions: [{ texte: '🔊 Lire', clic: () => pont().dire && pont().dire(p.nom + '. ' + p.texte) }, { texte: '🎬 Présenter ' + rover.def.nom, clic: () => presenter(roverId) }, { texte: '✕', clic: () => { rover.surligner(null); hud.carte(null); } }] });
  }
  async function montrerRover(id, { arriveeAuSol = false } = {}) {
    rover = await assurerRover(id); roverId = id; actif = true;
    // un seul rover dans la scène à la fois
    for (const r of Object.values(rovers)) if (r !== rover && r.groupe.parent) r.groupe.removeFromParent();
    if (!arriveeAuSol) { etapeSurface(); P.suivreTerre(false); }
    if (rover.groupe.parent !== decor.groupe) decor.groupe.add(rover.groupe); rover.groupe.position.set(0, hauteur(0, 0), 0); rover.groupe.visible = true; decor.lumiere.target.position.set(0, 0, 0);
    if (edl) edl.racine.visible = false;
    ctrl.c.enabled = true; ctrl.c.minDistance = 2.4; ctrl.c.maxDistance = 90; ctrl.c.target.set(0, 1.1, 0);
    const dest = vec(8.2, 3.0, -7.4);
    if (arriveeAuSol || etape !== 'surface') { camera.position.copy(dest); camera.lookAt(0, 1.1, 0); ctrl.c.update(); }
    else await noyau.cinematique(async api => { const c0 = camera.position.clone(), t0 = ctrl.c.target.clone(); await api.tween(2.4, e => { camera.position.lerpVectors(c0, dest, e); const r = t0.clone().lerp(vec(0, 1.1, 0), e); camera.lookAt(r); ctrl.c.target.copy(r); }); ctrl.c.update(); });
    etiqRover(true); P.majMenu();
    hud.carte({ titre: '🤖 ' + rover.def.nom, html: '<p>' + esc(rover.def.programme) + ' · ' + esc(rover.def.site.nom) + '</p><p><small>' + esc(rover.def.dimensions[0]) + '</small></p><p><small>Maquette : ' + esc(rover.source) + '. Touche une pastille numérotée, tourne et zoome pour observer.</small></p>', actions: [{ texte: '🎬 Présenter', clic: () => presenter(roverId) }, { texte: '🔁 ' + (id === 'perseverance' ? 'Curiosity' : 'Perseverance'), clic: () => montrerRover(id === 'perseverance' ? 'curiosity' : 'perseverance') }] });
    return { ok: true, texte: 'Voici ' + ROVERS[id].nom + '.' };
  }

  /* ───── présentation parlée du rover (angles au hasard) ───── */
  async function presenter(nom, options = {}) {
    const Pt = pont(); const rid = trouverRover(nom) || (norm(nom) === 'mars' ? null : roverId);
    if (!rid) { return presenterMars(options); }
    const n = ++presEnCours, epoque = Pt.epoque ? Pt.epoque() : 0, vivant = () => n === presEnCours && (!Pt.epoque || Pt.epoque() === epoque);
    await montrerRover(rid); const texte = composerRover(rid, { angles: options.angles || 3, rnd: options.rnd || Math.random });
    ctrl.c.autoRotate = true; ctrl.c.autoRotateSpeed = .8;
    for (let i = 0; i < texte.segments.length && vivant(); i++) {
      const seg = texte.segments[i], p = rover.pieces[i % rover.pieces.length]; if (i > 0 && i < texte.segments.length - 1 && p && p.objets.length) rover.surligner(p.id); else rover.surligner(null);
      hud.carte({ titre: '🤖 ' + ROVERS[rid].nom, html: '<p><small>' + esc(NOM_ANGLE[seg.angle] || (seg.angle === 'intro' ? 'Introduction' : 'Pour finir')) + ' · ' + (i + 1) + '/' + texte.segments.length + '</small></p><p>' + esc(seg.texte) + '</p>', actions: [{ texte: '⏹ Arrêter', clic: () => { presEnCours++; try { Pt.arreter && Pt.arreter(); } catch (e) { /* rien */ } hud.carte(null); rover.surligner(null); } }] });
      if (Pt.dire) { if ((await Pt.dire(seg.texte)) === false) break; } else await noyau.attendre(Math.min(8, 2 + seg.texte.length / 40));
    }
    ctrl.c.autoRotate = false; rover.surligner(null);
    return { ok: true, texte: texte.segments.map(s => s.texte).join(' ') };
  }
  async function presenterMars() { const r = await P.allerVue('systeme', { cible: 'mars' }); const v = P.vue(); return v && v.commande ? v.commande('presenter', { nom: 'mars' }) : r; }

  /* ───── contrat de vue ───── */
  async function entrer(opts = {}) {
    actif = true; groupe.visible = true; P.suivreTerre(false); hud.charge(null);
    const mode = opts.mode || 'atterrir';
    if (mode === 'rover') { etapeSurface(); rover = await assurerRover(opts.rover || roverId); await montrerRover(opts.rover || roverId, { arriveeAuSol: true }); return; }
    if (mode === 'orbite') { etapeOrbite(); const c = ctrl.c; camera.position.set(0, 60, 330); camera.lookAt(0, 0, 0); c.target.set(0, 0, 0); c.minDistance = 118; c.maxDistance = 900; c.enabled = true; c.update(); return; }
    atterrir({ rover: opts.rover }).catch(e => { console.warn('[mars] atterrissage', e); enSequence = false; hud.legende('Atterrissage impossible : ' + (e && e.message || e), 8000); });   // la séquence se joue d'elle-même (elle dure plus d'une minute) : on ne bloque pas le fondu d'entrée
  }
  function sortir() { actif = false; groupe.visible = false; presEnCours++; enSequence = false; clearRovers(); tele.hidden = true; fermerSurface(); decor.poussiere.vider(); P.ciel.groupe.visible = true; ctrl.c.autoRotate = false; ctrl.c.minDistance = 1.012; }
  function maj(dt, t) {
    if (etape === 'surface') { decor.majCiel(t, camera); decor.poussiere.maj(dt); if (edl) edl.maj(dt, t); camera.near = .08; camera.far = 40000; }
    else { if (edl && edl.racine.visible) edl.maj(dt, t); camera.near = .02; camera.far = 6000; mars.rotation.y += dt * .004; }
    camera.updateProjectionMatrix();
  }
  function tap() { /* les pièces se choisissent par leurs pastilles */ }
  function menu() {
    return [{ id: 'atterrir', texte: '🚀 Atterrir sur Mars', titre: 'Approche, entrée atmosphérique, parachute et grue céleste', clic: () => atterrir({ rover: roverId }) },
      { id: 'persy', texte: '🤖 Perseverance', titre: 'Maquette 3D du rover Perseverance', actif: roverId === 'perseverance' && etape === 'surface', clic: () => montrerRover('perseverance') },
      { id: 'curio', texte: '🤖 Curiosity', titre: 'Maquette 3D du rover Curiosity', actif: roverId === 'curiosity' && etape === 'surface', clic: () => montrerRover('curiosity') },
      { id: 'presrover', texte: '🎬 Présenter le rover', titre: 'Raylé présente le rover (angles au hasard)', clic: () => presenter(roverId) },
      { id: 'orbmars', texte: '🔴 Mars vue de l’espace', titre: 'Mars en orbite', clic: () => { etapeOrbite(); etiqRover(false); hud.carte(null); const c = ctrl.c; c.enabled = true; camera.position.set(0, 60, 330); c.target.set(0, 0, 0); c.minDistance = 118; c.maxDistance = 900; c.update(); } }];
  }
  async function commande(nom, a = {}) {
    switch (nom) {
      case 'atterrir': return atterrir({ rover: a.rover && trouverRover(a.rover) || undefined });
      case 'rover': { const id = trouverRover(a.nom || '') || roverId; return montrerRover(id); }
      case 'presenter': { const id = trouverRover(a.nom || ''); if (id || norm(a.nom || '') === 'mars') return presenter(a.nom, a); return undefined; }
      case 'autre-rover': return montrerRover(roverId === 'perseverance' ? 'curiosity' : 'perseverance');
      case 'piece': { if (!rover) return undefined; const n = norm(a.nom || ''); const p = rover.pieces.find(x => norm(x.nom).includes(n) || norm(x.id) === n || (n && norm(x.texte).includes(n) && n.length > 4)); if (!p) return { ok: false, texte: 'Je ne trouve pas cette pièce sur ' + rover.def.nom + '. Essaie : roues, bras, mât, antenne, générateur, caméras.' }; fichePiece(p.id); return { ok: true, texte: p.nom + '. ' + p.texte }; }
      case 'question': { const t = reponseRover(trouverRover(a.rover || '') || roverId, a.sujet); return t ? { ok: true, texte: t } : undefined; }
      case 'orbite': { etapeOrbite(); return { ok: true, texte: 'Voici Mars.' }; }
      default: return undefined;
    }
  }
  const etat = () => ({ vue: 'mars', etape, rover: roverId, enSequence, maquette: rover ? rover.source : null, pieces: rover ? rover.pieces.filter(p => p.objets.length).length : 0 });
  function detruire() { actif = false; scene.remove(groupe); libres.forEach(x => { try { x.dispose(); } catch (e) { /* déjà libéré */ } }); decor.detruire(); if (edl) edl.detruire(); Object.values(rovers).forEach(r => r.detruire()); tele.remove(); }
  return { id: 'mars', entrer, sortir, maj, tap, menu, commande, etat, detruire, near: () => (etape === 'surface' ? .08 : .02), ctrlAvant: c => { c.rotateSpeed = .6; c.zoomSpeed = 1; }, _: { decor, rovers: () => rovers, edl: () => edl, atterrir, montrerRover, fichePiece, etapeSurface, etapeOrbite } };
}
