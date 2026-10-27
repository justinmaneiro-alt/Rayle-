import * as THREE from 'three';
import { rasteriser, cibleDans, cliquerSur, rouler } from './vr-rasterizer.js';

/* ═════════════ RÉALITÉ VIRTUELLE (V2, phase 12) : WebXR + Three.js, DERRIÈRE UN DRAPEAU ═════════════
   Casque visé : Quest 2 (navigateur du casque, ou PC par Link / Air Link) et casques WMR / OpenXR (Acer…) : on teste l'API standard `immersive-vr`, pas le matériel.
   Deux modes : « salle » (Jarvis en VR : tes fenêtres en panneaux 3D autour de toi, l'entité Raylé à côté, ciel étoilé) et « galaxie » (vol libre entre les planètes avec la vraie scène).
   Fenêtres : chaque fenêtre de la page est rastérisée dans une texture (vr-rasterizer.js) ; viser + gâchette sur le corps = clic, sur la barre du haut = déplacer, sur le coin bas-droit =
   redimensionner ; grip = saisir et tenir le panneau comme une tablette ; stick droit vers le haut/bas sur un panneau = défiler.
   Confort : rotation par cliquet, vignette selon la vitesse, téléportation (A) ou déplacement fluide (stick gauche), vitesse réglable. Voix : la page continue de tourner (sous-titres + entité).
   Tout est inactif tant que le drapeau « Réalité virtuelle » n'est pas coché dans ⚙ (ou ?vr=1). JAMAIS TESTÉ DANS UN CASQUE : écrit pour l'API, vérifié avec un casque émulé (IWER) et par calcul pur. */
const V = window.VRCalcul;
const CLE = 'rayle_vr';
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { return {}; } };
const ecrire = o => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage refusé */ } };
let prefs = Object.assign({ actif: false, vignette: true, force: 1, cran: 30, vitesse: 2.2, deplacement: 'fluide', rayonFenetres: 1.7 }, lire());
const SELECTEURS = ['.gf:not([hidden])', '.saf:not([hidden])', '#panneaux .pn', '#tableau .tb-f', '#g1Fen', '#tele-fenetre'];
const drapeauActif = () => { try { return prefs.actif || /[?&]vr=1\b/.test(location.search); } catch (e) { return false; } };
const horloge = () => performance.now();

export const VR = (() => {
  let renderer = null, scene = null, camera = null, dolly = null, session = null, mode = 'salle', G = null, boucleActive = false, tPrec = 0, rayonVol = 0;
  const E = { entre: false, mode: 'salle', fps: 0, panneaux: 0, erreur: '', message: '', controleurs: 0, mains: false, deplacement: prefs.deplacement, vignette: 0, vitesse: 0 };
  const ecouteurs = []; const prevenir = () => ecouteurs.forEach(f => { try { f(E); } catch (e) { /* un écouteur fautif n'arrête pas les autres */ } });
  const panneaux = [], ctrls = [], tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  let orbe = null, sousTitres = null, vignetteMat = null, arcLigne = null, marqueur = null, etoiles = null, sol = null, carteAide = null, fonds = null, vitesseVol = [0, 0, 0], cliquetEtat = null, vignetteNiveau = 0, derniereRaster = 0, rasterEnCours = false, dernierePosTete = null, aideLaser = null;
  const texte = { contenu: '', jusqua: 0 };
  let ancienPause = false, defile = 0;   // défilement : 700 px/s, cumulé pour les cadences très rapides
  // sous-titres : la réponse de Raylé s'affiche à côté de son entité (écouteur posé une seule fois)
  try { if (window.RayleBus && window.RayleBus.on) window.RayleBus.on('raylé:reponse', d => { texte.contenu = String(d && d.texte || '').slice(0, 220); texte.jusqua = horloge() + 9000; }); } catch (e) { /* bus indisponible */ }

  async function disponible() {
    const r = { drapeau: drapeauActif(), xr: !!(typeof navigator !== 'undefined' && navigator.xr), vr: false, raison: '' };
    if (!r.drapeau) r.raison = 'La réalité virtuelle est désactivée (⚙ → Réalité virtuelle).'; else if (!r.xr) r.raison = 'Ce navigateur n’expose pas WebXR : ouvre Raylé dans le navigateur du casque (Quest) ou branche le casque au PC (Link, Air Link, Windows Mixed Reality).';
    else { try { r.vr = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { r.vr = false; } if (!r.vr) r.raison = 'Aucun casque VR détecté par le navigateur (WebXR « immersive-vr » indisponible).'; }
    return r;
  }

  // ── scène ──
  function fabriquerCarteAide() {
    if (carteAide && carteAide.isConnected) return carteAide;
    carteAide = document.createElement('div'); carteAide.id = 'vr-carte-aide';
    carteAide.style.cssText = 'position:fixed;left:-9999px;top:0;width:620px;padding:16px 18px;background:#0b121b;color:#e6eef2;font:20px/1.4 system-ui,sans-serif;border:2px solid #8fd0e3;box-sizing:border-box';
    carteAide.innerHTML = '<div class="vr-titre" style="font-size:26px;color:#8fd0e3;letter-spacing:.12em;margin-bottom:8px">RAYLÉ EN VR</div>' +
      '<div>Gâchette sur une fenêtre : clic. Gâchette sur la barre du haut : déplacer. Coin en bas à droite : redimensionner. Grip : saisir.</div>' +
      '<div style="margin-top:8px">Stick gauche : avancer. Stick droit : tourner par crans ; sur une fenêtre : défiler. A : se téléporter. B : replacer les fenêtres. X : salle ↔ galaxie.</div>' +
      '<div style="margin-top:8px;color:#c9b27a">Dis « Raylé » : sa réponse s’affiche à côté d’elle.</div><button id="vr-test-bouton" style="margin-top:14px;font:22px system-ui;padding:10px 18px;background:#123;color:#8fd0e3;border:2px solid #8fd0e3">Replacer les fenêtres</button><div id="vr-test-etat" style="margin-top:8px;color:#9fb3bd">Prêt.</div>';
    document.body.appendChild(carteAide);
    carteAide.querySelector('#vr-test-bouton').addEventListener('click', () => { recentrer(); const e = carteAide.querySelector('#vr-test-etat'); e.textContent = 'Fenêtres replacées (' + new Date().toLocaleTimeString('fr-FR') + ').'; });
    return carteAide;
  }
  function collecterFenetres() {
    const vus = new Set(), liste = [];
    for (const sel of SELECTEURS) for (const el of document.querySelectorAll(sel)) {
      if (vus.has(el) || el.closest('#vr-carte-aide')) continue; const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width < 90 || r.height < 60 || cs.display === 'none' || cs.visibility === 'hidden') continue; if ([...vus].some(p => p.contains(el) || el.contains(p))) continue;
      vus.add(el); const t = el.querySelector('.gf-titre,.saf-titre,.pn-tete h2,.pn-tete,.tb-t,header b,h3,h2'); liste.push({ el, titre: (t && t.textContent || el.dataset.id || 'Fenêtre').trim().slice(0, 40) });
    }
    return liste;
  }
  function creerPanneau(el, titre) {
    const r = el.getBoundingClientRect(), taille = V.taillePanneau(r.width, r.height), canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.minFilter = THREE.LinearFilter;
    const geo = new THREE.PlaneGeometry(1, 1), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 10;
    const cadre = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x8fd0e3, transparent: true, opacity: 0.35, toneMapped: false })); mesh.add(cadre);
    const barre = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0x8fd0e3, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); barre.position.set(0, 0.45, 0.001); mesh.add(barre);
    const coin = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xc9b27a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); coin.position.set(0.45, -0.45, 0.001); mesh.add(coin);
    const p = { el, titre, canvas, tex, mesh, cadre, barre, coin, l: taille.l, h: taille.h, echelle: 1, derniere: 0, ok: false, vise: false, visible: true, id: el.dataset.id || el.id || titre };
    mesh.scale.set(p.l, p.h, 1); scene.add(mesh); panneaux.push(p); return p;
  }
  /* Une texture dont le canevas change de taille doit être recréée (le GPU alloue sa mémoire une fois pour toutes) : dispose() la force. */
  function majTexture(p) { if (p.tw !== p.canvas.width || p.th !== p.canvas.height) { p.tex.dispose(); p.tw = p.canvas.width; p.th = p.canvas.height; } p.tex.needsUpdate = true; }
  function liberer(p) { scene.remove(p.mesh); p.tex.dispose(); p.mesh.geometry.dispose(); p.mesh.material.dispose(); const i = panneaux.indexOf(p); if (i >= 0) panneaux.splice(i, 1); }
  function posePanneau(p) { p.mesh.updateMatrixWorld(); const pos = new THREE.Vector3(), q = new THREE.Quaternion(); p.mesh.matrixWorld.decompose(pos, q, tmpV.set(1, 1, 1)); return { pos: pos.toArray(), quat: [q.x, q.y, q.z, q.w], l: p.l * p.echelle, h: p.h * p.echelle, visible: p.visible }; }
  /* Met la liste des panneaux en accord avec les fenêtres de la page (ajoute les nouvelles, retire les fermées) et replace seulement les nouvelles. */
  function synchroniser({ tout = false } = {}) {
    const fen = collecterFenetres(); if (!fen.length) fen.push({ el: fabriquerCarteAide(), titre: 'Raylé en VR' });
    else if (!panneaux.some(p => p.el === carteAide)) { /* la carte d'aide n'est montrée que sans fenêtre */ }
    const elements = new Set(fen.map(f => f.el)); for (const p of panneaux.slice()) if (!elements.has(p.el) || !p.el.isConnected) liberer(p);
    const nouveaux = []; for (const f of fen) if (!panneaux.some(p => p.el === f.el)) nouveaux.push(creerPanneau(f.el, f.titre));
    if (tout || nouveaux.length) placer(tout ? panneaux : nouveaux, tout);
    E.panneaux = panneaux.length; prevenir();
  }
  function placer(liste, tout) {
    camera.getWorldPosition(tmpV); camera.getWorldQuaternion(tmpQ); const cap = V.lacetDe([tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w]);
    const base = tout ? 0 : panneaux.length - liste.length, total = tout ? liste.length : panneaux.length;
    const poses = V.disposerPanneaux(total, { centre: [tmpV.x, 0, tmpV.z], rayon: prefs.rayonFenetres, hauteurOeil: tmpV.y > 0.6 ? tmpV.y - 0.05 : 1.55, capCentre: cap, parRang: 6, arcDeg: 170 });
    liste.forEach((p, i) => { const pose = poses[base + i] || poses[poses.length - 1]; p.mesh.position.set(pose.pos[0], pose.pos[1], pose.pos[2]); p.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw); p.echelle = 1; p.mesh.scale.set(p.l, p.h, 1); p.derniere = 0; });
  }
  const recentrer = () => { if (renderer) synchroniser({ tout: true }); };

  function creerOrbe() {
    const g = new THREE.Group(), n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 0.55 + Math.random() * 0.45; pos.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3); const c = Math.random() < 0.3 ? [1, 1, 1] : [0.56, 0.82, 0.89]; col.set(c, i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.012, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    const coeur = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    g.add(pts, coeur); g.userData = { pts, coeur }; g.scale.setScalar(0.28); return g;
  }
  function creerSousTitres() {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192; const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); mesh.renderOrder = 20; return { mesh, canvas, tex, dessine: 0 };
  }
  function dessinerSousTitres(t) {
    const s = sousTitres, c = s.canvas.getContext('2d'); c.clearRect(0, 0, s.canvas.width, s.canvas.height); if (!texte.contenu || t > texte.jusqua) { s.mesh.visible = false; return; }
    s.mesh.visible = true; c.fillStyle = 'rgba(6,10,16,0.82)'; c.fillRect(0, 0, 1024, 192); c.strokeStyle = '#8fd0e3'; c.lineWidth = 3; c.strokeRect(2, 2, 1020, 188); c.fillStyle = '#e6eef2'; c.font = '34px system-ui, sans-serif'; c.textBaseline = 'top';
    const mots = texte.contenu.split(/\s+/); let ligne = '', y = 14, n = 0; for (const m of mots) { const essai = ligne ? ligne + ' ' + m : m; if (c.measureText(essai).width > 980) { c.fillText(ligne, 20, y); y += 42; ligne = m; if (++n >= 3) { ligne = '…'; break; } } else ligne = essai; } if (ligne) c.fillText(ligne, 20, y); s.tex.needsUpdate = true;
  }
  function creerVignette() {
    vignetteMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, uniforms: { force: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float force; varying vec3 vP; void main(){ float c = -normalize(vP).z; float a = force * (1.0 - smoothstep(0.35, 0.82, c)); gl_FragColor = vec4(0.0, 0.0, 0.0, a); }' });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), vignetteMat); m.renderOrder = 9999; m.frustumCulled = false; return m;
  }
  function construire() {
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x03060b);
    camera = new THREE.PerspectiveCamera(70, 1, 0.02, 4000); dolly = new THREE.Group(); dolly.add(camera); scene.add(dolly);
    // ciel étoilé et sol de la salle
    const n = 2400, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 60 + Math.random() * 30; p.set([Math.cos(t) * s * r, Math.abs(u) * r + 1, Math.sin(t) * s * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); etoiles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe9ff, size: 0.25, sizeAttenuation: true, toneMapped: false })); scene.add(etoiles);
    sol = new THREE.Group(); const anneau = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.84, 64), new THREE.MeshBasicMaterial({ color: 0x8fd0e3, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); anneau.rotation.x = -Math.PI / 2; sol.add(anneau);
    const grille = new THREE.GridHelper(24, 24, 0x2d4a5c, 0x142330); grille.material.transparent = true; grille.material.opacity = 0.55; sol.add(grille); scene.add(sol);
    orbe = creerOrbe(); orbe.position.set(-1.25, 1.55, -1.1); scene.add(orbe);
    sousTitres = creerSousTitres(); sousTitres.mesh.position.set(-1.25, 1.05, -1.1); scene.add(sousTitres.mesh);
    camera.add(creerVignette());
    // trajectoire de téléportation et repère d'arrivée
    arcLigne = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 80 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xc9b27a, toneMapped: false })); arcLigne.visible = false; arcLigne.frustumCulled = false; scene.add(arcLigne);
    marqueur = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 32), new THREE.MeshBasicMaterial({ color: 0xc9b27a, side: THREE.DoubleSide, toneMapped: false })); marqueur.rotation.x = -Math.PI / 2; marqueur.visible = false; scene.add(marqueur);
    // manettes (ou mains) : rayon laser + petit repère
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i), laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x8fd0e3, transparent: true, opacity: 0.85, toneMapped: false })); laser.scale.z = 2; c.add(laser);
      const pt = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); pt.position.z = -2; pt.visible = false; c.add(pt);
      const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.09, 12), new THREE.MeshBasicMaterial({ color: 0x20303d, toneMapped: false })); corps.rotation.x = Math.PI / 2; corps.position.z = 0.03; c.add(corps);
      const etat = { i, obj: c, laser, pt, source: null, main: null, selection: false, tenu: null, vise: null, gachette: false, grip: false, a: false, b: false, cliquePosee: null, joints: null };
      c.addEventListener('connected', e => { etat.source = e.data; etat.main = e.data.handedness || null; E.controleurs = ctrls.filter(x => x.source).length; E.mains = ctrls.some(x => x.source && x.source.hand); prevenir(); });
      c.addEventListener('disconnected', () => { etat.source = null; etat.tenu = null; E.controleurs = ctrls.filter(x => x.source).length; prevenir(); });
      c.addEventListener('selectstart', () => { etat.selection = true; }); c.addEventListener('selectend', () => { etat.selection = false; });
      dolly.add(c); ctrls.push(etat);
      const main = renderer.xr.getHand(i); dolly.add(main); etat.main3d = main; etat.joints = new Map();
      main.addEventListener('connected', () => { E.mains = true; });
    }
  }
  function majMains() {
    for (const c of ctrls) { const hand = c.main3d, j = hand && hand.joints; if (!j || !c.source || !c.source.hand) continue;
      for (const nom of Object.keys(j)) { let m = c.joints.get(nom); if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: nom.endsWith('tip') ? 0xffffff : 0x8fd0e3, toneMapped: false })); hand.add(m); c.joints.set(nom, m); }
        const jt = j[nom]; if (jt.visible !== false) { m.position.copy(jt.position); m.quaternion.copy(jt.quaternion); m.visible = true; } else m.visible = false; } }
  }

  // ── boucle de rendu ──
  const stick = c => { const a = c.source && c.source.gamepad && c.source.gamepad.axes; return a ? [a[2] || 0, a[3] || 0] : [0, 0]; };
  const bouton = (c, k) => { const b = c.source && c.source.gamepad && c.source.gamepad.buttons[k]; return !!(b && b.pressed); };
  const rayon = c => { c.obj.updateWorldMatrix(true, false); const o = new THREE.Vector3(), q = new THREE.Quaternion(); c.obj.matrixWorld.decompose(o, q, tmpV.set(1, 1, 1)); const d = new THREE.Vector3(0, 0, -1).applyQuaternion(q); return { o, q, d }; };
  function teteMonde() { camera.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld); }
  function capTete() { camera.getWorldQuaternion(tmpQ); return V.lacetDe([tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w]); }
  function tournerAutourDeLaTete(deg) {
    const tete = teteMonde(), r = V.rad(deg), c = Math.cos(r), s = Math.sin(r), dx = dolly.position.x - tete.x, dz = dolly.position.z - tete.z;
    dolly.position.x = tete.x + dx * c + dz * s; dolly.position.z = tete.z - dx * s + dz * c; dolly.rotation.y += r;
  }
  function cliquerPanneau(p, uv) {
    const r = p.el.getBoundingClientRect(), pt = V.uvVersElement(uv, r), cible = cibleDans(p.el, pt.x, pt.y); cliquerSur(cible, pt.x, pt.y); p.derniere = 0; return cible;
  }
  function interactions(dt) {
    const poses = panneaux.map(posePanneau), tete = teteMonde();
    for (const p of panneaux) { p.vise = false; p.barre.material.opacity = 0; p.coin.material.opacity = 0; }
    for (const c of ctrls) {
      if (!c.source) { c.laser.visible = false; c.pt.visible = false; continue; } c.laser.visible = true;
      const { o, q, d } = rayon(c), hit = V.panneauVise([o.x, o.y, o.z], [d.x, d.y, d.z], poses);
      const gachette = bouton(c, 0) || c.selection, grip = bouton(c, 1);
      c.vise = hit; if (hit) { const p = panneaux[hit.indice]; p.vise = true; const z = V.zonePanneau(hit.uv); p.barre.material.opacity = z === 'titre' ? 0.35 : 0; p.coin.material.opacity = z === 'coin' ? 0.6 : 0; c.laser.scale.z = hit.t; c.pt.visible = true; c.pt.position.z = -hit.t; c.laser.material.color.setHex(z === 'corps' ? 0xffffff : 0xc9b27a); } else { c.laser.scale.z = 2.5; c.pt.visible = false; c.laser.material.color.setHex(0x8fd0e3); }
      // appui sur la gâchette
      if (gachette && !c.gachette && hit && !c.tenu) {
        const p = panneaux[hit.indice], z = V.zonePanneau(hit.uv);
        if (z === 'titre') c.tenu = { type: 'deplacer', p, dist: hit.t }; else if (z === 'coin') c.tenu = { type: 'redim', p, d0: Math.max(0.1, p.mesh.position.distanceTo(o)), e0: p.echelle }; else c.cliquePosee = { p, uv: hit.uv.slice(), t: horloge() };
      }
      if (!gachette && c.gachette) { if (c.tenu && c.tenu.type !== 'saisie') c.tenu = null; if (c.cliquePosee) { const cp = c.cliquePosee; c.cliquePosee = null; if (hit && panneaux[hit.indice] === cp.p && Math.hypot(hit.uv[0] - cp.uv[0], hit.uv[1] - cp.uv[1]) < 0.06) cliquerPanneau(cp.p, hit.uv); } }
      // grip : saisir et tenir le panneau comme une tablette
      if (grip && !c.grip && hit && !c.tenu) { const p = panneaux[hit.indice]; tmpM.copy(c.obj.matrixWorld).invert(); c.tenu = { type: 'saisie', p, decalage: tmpM.clone().multiply(p.mesh.matrixWorld) }; }
      if (!grip && c.grip && c.tenu && c.tenu.type === 'saisie') c.tenu = null;
      if (c.tenu) {
        const t = c.tenu, p = t.p;
        if (t.type === 'deplacer') { p.mesh.position.copy(o).addScaledVector(d, t.dist); const yaw = Math.atan2(tete.x - p.mesh.position.x, tete.z - p.mesh.position.z); p.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); }
        else if (t.type === 'redim') { p.echelle = V.redimensionner(t.e0, t.d0, p.mesh.position.distanceTo(o)); p.mesh.scale.set(p.l * p.echelle, p.h * p.echelle, 1); }
        else if (t.type === 'saisie') { tmpM.copy(c.obj.matrixWorld).multiply(t.decalage); tmpM.decompose(p.mesh.position, p.mesh.quaternion, tmpV); }
      }
      c.gachette = gachette; c.grip = grip;
      // stick droit sur un panneau : défiler (sinon : rotation par cliquet, traitée plus bas)
      const [sx, sy] = stick(c);
      if (c.main === 'right' || (!c.main && c.i === 1)) {
        if (hit && Math.abs(sy) > 0.25) { const p = panneaux[hit.indice], r = p.el.getBoundingClientRect(), pt = V.uvVersElement(hit.uv, r); defile += sy * 700 * dt; if (Math.abs(defile) >= 1) { rouler(cibleDans(p.el, pt.x, pt.y), pt.x, pt.y, 0, Math.round(defile)); defile -= Math.round(defile); } }
        else { const r = V.cliquetRotation(cliquetEtat, sx, dt, { angle: prefs.cran }); cliquetEtat = r.etat; if (r.deltaDeg) { tournerAutourDeLaTete(r.deltaDeg); vignetteNiveau = Math.max(vignetteNiveau, 0.55); } }
        const a = bouton(c, 4), b = bouton(c, 5);
        if (b && !c.b) recentrer(); c.b = b;
        // A : viser puis relâcher = se téléporter
        if (a) { const arc = V.arcTeleportation([o.x, o.y, o.z], [d.x, d.y, d.z], { solY: dolly.position.y }); const pts = arc.points.slice(0, 80); const attr = arcLigne.geometry.attributes.position; for (let i = 0; i < 80; i++) { const pt = pts[Math.min(i, pts.length - 1)]; attr.setXYZ(i, pt[0], pt[1], pt[2]); } attr.needsUpdate = true; arcLigne.visible = true; c.arc = arc; marqueur.visible = !!arc.impact; if (arc.impact) marqueur.position.set(arc.impact[0], arc.impact[1] + 0.02, arc.impact[2]); }
        else if (c.a) { arcLigne.visible = false; marqueur.visible = false; if (c.arc && c.arc.impact) { const tt = teteMonde(); dolly.position.x += c.arc.impact[0] - tt.x; dolly.position.z += c.arc.impact[2] - tt.z; vignetteNiveau = 0.8; } c.arc = null; }
        c.a = a;
      } else {
        const x = bouton(c, 4), y = bouton(c, 5);
        if (x && !c.a) basculerMode(); if (y && !c.b) { prefs.deplacement = prefs.deplacement === 'fluide' ? 'teleport' : 'fluide'; E.deplacement = prefs.deplacement; ecrire(prefs); prevenir(); } c.a = x; c.b = y;
      }
    }
  }
  function locomotion(dt) {
    const gauche = ctrls.find(c => c.source && (c.main === 'left' || (!c.main && c.i === 0))), tete = teteMonde(), avant = dolly.position.clone();
    if (mode === 'galaxie') {
      const droite = ctrls.find(c => c.source && c.main === 'right') || ctrls.find(c => c.source), poussee = droite ? (droite.source && droite.source.gamepad && droite.source.gamepad.buttons[0] ? droite.source.gamepad.buttons[0].value : 0) : 0, frein = gauche && gauche.source && gauche.source.gamepad && gauche.source.gamepad.buttons[0] ? gauche.source.gamepad.buttons[0].value : 0;
      const dir = droite ? rayon(droite).d : new THREE.Vector3(0, 0, -1), dist = distanceAuPlusProche(tete), k = dolly.scale.x || 1;
      const r = V.volLibre({ vitesse: vitesseVol, direction: [dir.x, dir.y, dir.z], poussee, distance: dist / k, dt, frein }); vitesseVol = r.vitesse; dolly.position.x += r.deplacement[0] * k; dolly.position.y += r.deplacement[1] * k; dolly.position.z += r.deplacement[2] * k;
      E.vitesse = Math.hypot(...vitesseVol);
    } else if (gauche && prefs.deplacement === 'fluide') {
      const d = V.deplacementFluide({ stick: stick(gauche), cap: capTete(), vitesse: prefs.vitesse, dt }); dolly.position.x += d[0]; dolly.position.z += d[2]; E.vitesse = Math.hypot(d[0], d[2]) / Math.max(dt, 1e-3);
    } else E.vitesse = 0;
    const vit = dolly.position.distanceTo(avant) / Math.max(dt, 1e-3) / (mode === 'galaxie' ? Math.max(1, vitesseMaxDe()) / 2.4 : 1);
    const cible = prefs.vignette ? V.vignetteCible(vit, 0, { force: prefs.force }) : 0; vignetteNiveau = Math.max(vignetteNiveau - dt * 1.4, 0); vignetteNiveau = V.lisserVignette(vignetteNiveau, Math.max(cible, 0), dt); E.vignette = vignetteNiveau; if (vignetteMat) vignetteMat.uniforms.force.value = prefs.vignette ? vignetteNiveau : 0;
  }
  const vitesseMaxDe = () => V.vitesseMaxSelonDistance(distanceAuPlusProche(teteMonde()));
  function distanceAuPlusProche(p) {
    let m = Math.hypot(p.x, p.y, p.z) - 6; if (G && G.systeme) for (const o of G.systeme.planetes) { const c = o.porteur.position, r = o.config.apparence ? o.config.apparence.rayon : 4; m = Math.min(m, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) - (r || 4)); }
    return Math.max(1, m);
  }
  function rasteriserSuite(t) {
    if (rasterEnCours || mode !== 'salle' || t - derniereRaster < 60) return; const tete = teteMonde(); camera.getWorldDirection(tmpV);
    let choix = null, retardMax = -1;
    for (const p of panneaux) {
      const versP = p.mesh.position.clone().sub(tete).normalize(), dansChamp = versP.dot(tmpV) > 0.4, iv = V.intervalleRaster({ vise: p.vise, dansChamp, focus: p.el.contains(document.activeElement) });
      const retard = p.ok ? (t - p.derniere) - iv : 1e9; if (retard >= 0 && retard > retardMax) { retardMax = retard; choix = p; }   // un seul panneau à la fois, le plus en retard
    }
    if (!choix) return; const p = choix; rasterEnCours = true; derniereRaster = t; p.derniere = t;
    rasteriser(p.el, p.canvas).then(r => { if (r.ok) { p.ok = true; majTexture(p); const asp = p.canvas.height / p.canvas.width; p.h = p.l * asp; p.mesh.scale.set(p.l * p.echelle, p.h * p.echelle, 1); } else p.erreur = r.raison; }).catch(e => { p.erreur = String(e && e.message || e); }).finally(() => { rasterEnCours = false; });
  }
  function animerOrbe(t, dt) {
    const etat = document.body.dataset.etat || 'idle', { pts, coeur } = orbe.userData; const vitesse = etat === 'thinking' ? 1.4 : etat === 'speaking' ? 0.5 : 0.18;
    pts.rotation.y += dt * vitesse; pts.rotation.x += dt * vitesse * 0.3;
    const pulse = etat === 'speaking' ? 1 + 0.12 * Math.sin(t / 90) + 0.06 * Math.sin(t / 37) : etat === 'listening' ? 0.9 + 0.03 * Math.sin(t / 300) : 1 + 0.02 * Math.sin(t / 900);
    orbe.scale.setScalar(0.28 * pulse); const col = etat === 'thinking' ? 0xb48cff : etat === 'listening' ? 0xffffff : 0x8fd0e3; pts.material.color && pts.material.color.setHex(0xffffff); coeur.material.color.setHex(col); coeur.material.opacity = etat === 'speaking' ? 0.8 : 0.5;
    // elle te regarde
    const tete = teteMonde(); orbe.rotation.y = Math.atan2(tete.x - orbe.position.x, tete.z - orbe.position.z);
  }
  function boucle(tms, frame) {
    const t = tms, dt = Math.min(0.1, Math.max(0.001, (t - (tPrec || t - 16)) / 1000)); E.fps = Math.round(1 / dt); tPrec = t;
    try {
      if (mode === 'galaxie' && G) { try { G.soleil.maj(t / 1000, dt); G.systeme.maj(t / 1000, dt); } catch (e) { /* scène de la galaxie indisponible */ } }
      if (renderer.xr.isPresenting) { interactions(dt); locomotion(dt); majMains(); }
      if (mode === 'salle') { animerOrbe(t, dt); dessinerSousTitres(t); etoiles.position.copy(teteMonde()); }
      if (renderer.xr.isPresenting) rasteriserSuite(t);
      if (Math.floor(t / 1000) !== Math.floor((t - dt * 1000) / 1000)) synchroniserSiBesoin();
      renderer.render(mode === 'galaxie' && G ? G.scene : scene, camera);
    } catch (e) { E.erreur = String(e && e.message || e); console.error('[VR]', e); }
  }
  let derniereSync = 0; function synchroniserSiBesoin() { const t = horloge(); if (t - derniereSync < 900) return; derniereSync = t; if (mode === 'salle') synchroniser(); }

  // ── modes ──
  function basculerMode(m) {
    const cible = m || (mode === 'salle' ? 'galaxie' : 'salle'); if (cible === mode || !renderer) return mode;
    if (cible === 'galaxie') {
      G = window.Galaxie; if (!G || !G.scene) { E.message = 'La galaxie n’est pas chargée : ouvre d’abord la vue galaxie (🌌).'; prevenir(); return mode; }
      try { ancienPause = false; G.pause && G.pause(); } catch (e) { /* galaxie déjà en pause */ }
      G.scene.add(dolly); const terre = G.systeme && G.systeme.planetes.find(o => o.config.id === 'terre'); dolly.scale.setScalar(2.2);
      if (terre) { const c = terre.porteur.position; dolly.position.set(c.x + 14, c.y + 3, c.z + 18); } else dolly.position.set(0, 20, 60); vitesseVol = [0, 0, 0];
      for (const p of panneaux) { p.mesh.visible = false; p.visible = false; } orbe.visible = false; sousTitres.mesh.visible = false; etoiles.visible = false; sol.visible = false; arcLigne.visible = false; marqueur.visible = false; mode = 'galaxie';
    } else {
      G && G.scene && G.scene.remove(dolly); scene.add(dolly); dolly.scale.setScalar(1); dolly.position.set(0, 0, 0); dolly.rotation.set(0, 0, 0); for (const p of panneaux) { p.mesh.visible = true; p.visible = true; } orbe.visible = true; etoiles.visible = true; sol.visible = true; mode = 'salle';
      try { G && G.reprendre && G.reprendre(); } catch (e) { /* ignoré */ } G = null; recentrer();
    }
    E.mode = mode; prevenir(); return mode;
  }
  // ── session ──
  async function entrer({ mode: m = 'salle' } = {}) {
    E.erreur = '';
    const d = await disponible(); if (!d.drapeau || !d.xr || !d.vr) { E.erreur = d.raison; prevenir(); throw new Error(d.raison); }
    if (session) return E;
    if (!renderer) { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); renderer.setPixelRatio(1); renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); try { renderer.xr.setFoveation(0.5); } catch (e) { /* non disponible */ } renderer.outputColorSpace = THREE.SRGBColorSpace; construire(); }
    const s = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: [], optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
    session = s; await renderer.xr.setSession(s); E.entre = true; E.mode = 'salle'; mode = 'salle'; dolly.position.set(0, 0, 0); dolly.scale.setScalar(1);
    s.addEventListener('end', fin); synchroniser({ tout: true });
    setTimeout(() => { if (E.entre && mode === 'salle') recentrer(); }, 800);   // la vraie hauteur des yeux n'est connue qu'après la première image
    tPrec = 0; renderer.setAnimationLoop(boucle); prevenir();
    if (m === 'galaxie') basculerMode('galaxie');
    return E;
  }
  function fin() {
    try { renderer.setAnimationLoop(null); } catch (e) { /* déjà arrêtée */ }
    if (mode === 'galaxie') { try { basculerMode('salle'); } catch (e) { /* retour à la salle impossible : on ferme quand même */ } }
    session = null; E.entre = false; E.controleurs = 0; for (const c of ctrls) { c.tenu = null; c.source = null; } prevenir();
    if (carteAide) { carteAide.remove(); carteAide = null; }
    for (const p of panneaux.slice()) liberer(p);
  }
  async function sortir() { if (session) { try { await session.end(); } catch (e) { fin(); } } return E; }

  /* Entrer en VR demande un geste de l'utilisateur (règle du navigateur) : une commande vocale ne peut pas ouvrir la session toute seule. Elle affiche donc un gros bouton à toucher. */
  async function demander() {
    const d = await disponible(); if (!d.drapeau || !d.xr || !d.vr) return { ok: false, raison: d.raison };
    if (document.getElementById('vr-demande')) return { ok: true, attente: true };
    const b = document.createElement('button'); b.id = 'vr-demande'; b.textContent = 'Entrer en VR'; b.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483000;font:28px system-ui,sans-serif;padding:22px 40px;background:#0b121b;color:#8fd0e3;border:2px solid #8fd0e3;cursor:pointer';
    b.addEventListener('click', async () => { b.remove(); try { await entrer(); } catch (e) { /* message déjà dans E.erreur */ } }); document.body.appendChild(b); return { ok: true, attente: true };
  }

  function regler(patch) { prefs = Object.assign(prefs, patch); ecrire(prefs); E.deplacement = prefs.deplacement; prevenir(); return { ...prefs }; }
  return { disponible, entrer, sortir, demander, basculerMode, recentrer, regler, reglages: () => ({ ...prefs }), etat: () => ({ ...E, mode, drapeau: drapeauActif() }), surEtat: f => { ecouteurs.push(f); }, drapeauActif,
    /* pour les tests : accès à l'intérieur (jamais utilisé par la page) */ _interne: () => ({ renderer, scene, camera, dolly, panneaux, ctrls, orbe }), _forcerRaster: async () => { for (const p of panneaux) { const r = await rasteriser(p.el, p.canvas); p.ok = r.ok; if (r.ok) majTexture(p); } } };
})();
window.RayleVR = VR;
