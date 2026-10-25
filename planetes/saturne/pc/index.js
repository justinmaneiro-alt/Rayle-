import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import * as V from './vol-calcul.js';
import * as E from './entrees-calcul.js';
import { creerVaisseau, creerSillage, ECHELLE } from './vaisseau-3d.js';
import { creerCockpit, YEUX, BORNES_MARCHE } from './cockpit-3d.js';
import { creerSalleMedicale } from './salle-medicale.js';
import { creerChargeurModeles } from './chargeur-modeles.js';

/* ═════════════ SATURNE : LE VAISSEAU D'ANATOMIE « VÉSALE » (module PC) ═════════════
   Appelé par la galaxie quand la caméra arrive sur Saturne (manifeste modules.pc.entree). `entrer(G)` : fondu, la galaxie dessine la scène du système solaire avec NOTRE caméra
   (G.surcharger), la souris est déléguée ici (G.nav.deleguer) ; Échap ramène à la galaxie (événement galaxie:sortie). Le vaisseau, son cockpit et ses flammes vivent dans une scène
   à part dessinée en seconde passe sur la même image (même profondeur : les planètes passent devant ou derrière lui), avec leur propre éclairage et leurs ombres.
   Trois vues : extérieure (autour du vaisseau), cockpit (assis ou debout) et libre (caméra détachée). Pilotage : vol-calcul.js (assisté ou newtonien, limiteur, postcombustion,
   pilote automatique, orbite) alimenté par entrees-calcul.js (clavier, souris, manette, joystick). Salle médicale : scène à part (table holographique, modèles lourds).
   Préparation WebXR (non implémentée) : la pose de la tête est calculée à part (teteLocale), pas fusionnée avec celle du vaisseau ; un casque pourra la remplacer. */
let inst = null, enCours = null;
const attendre = ms => new Promise(r => setTimeout(r, ms));
export function entrer(G, options = {}) {
  if (!enCours) enCours = (async () => { inst = inst || await construire(G); await inst.entrer(options); })().finally(() => { enCours = null; });
  return enCours;
}
export const sortir = () => inst && inst.sortir();

/* Profil de qualité : trois niveaux (la galaxie fournit « haute », « moyenne » ou « basse » ; le mode jeu force « basse »). */
export function profil(niveau, jeu = false) {
  if (jeu || niveau === 'basse') return { niveau: 'basse', detail: 0, ombres: 0, sillage: 0, projecteurs: false, dprCockpit: 0.5, fov: 62 };
  if (niveau === 'moyenne') return { niveau: 'moyenne', detail: 1, ombres: 1024, sillage: 240, projecteurs: false, dprCockpit: 0.75, fov: 62 };
  return { niveau: 'haute', detail: 2, ombres: 2048, sillage: 520, projecteurs: true, dprCockpit: 1, fov: 62 };
}
const CLE_REG = 'rayle_saturne_reglages';
function lireReg() { try { const o = JSON.parse(localStorage.getItem(CLE_REG) || '{}'); return { fov: Math.max(45, Math.min(100, +o.fov || 62)), echelle: o.echelle === 'reelle' ? 'reelle' : 'comprimee', sourisVol: o.sourisVol !== false }; } catch (e) { return { fov: 62, echelle: 'comprimee', sourisVol: true }; } }
function ecrireReg(r) { try { localStorage.setItem(CLE_REG, JSON.stringify(r)); } catch (e) { /* stockage indisponible */ } }

async function construire(G) {
  const racine = document.getElementById('vueGalaxie'), canvas = G.canvas, renderer = G.renderer;
  if (!document.getElementById('saturne-css')) { const l = document.createElement('link'); l.id = 'saturne-css'; l.rel = 'stylesheet'; l.href = new URL('./saturne.css', import.meta.url).href; document.head.appendChild(l); }

  // ── interface (DOM) ──
  const ui = document.createElement('div'); ui.id = 'saturne-ui'; ui.hidden = true;
  ui.innerHTML = '<div class="s-titre"><b>S A T U R N E</b><span>Vaisseau d’anatomie « Vésale »</span></div>'
    + '<div class="s-boutons"><div class="s-groupe" role="group" aria-label="Vue"><button type="button" data-vue="exterieur">Extérieur</button><button type="button" data-vue="cockpit">Cockpit</button><button type="button" data-vue="libre">Vue libre</button></div>'
    + '<button type="button" data-a="asseoir" title="S’asseoir / se lever (H)">S’asseoir</button><button type="button" data-a="salle" title="Salle médicale (M)">Salle médicale</button><button type="button" data-a="pilote" title="Pilote automatique : va sur…" hidden>Pilote auto</button><button type="button" data-a="commandes" title="Schéma des commandes (F1)">⌨ Commandes</button><button type="button" data-a="reglages" title="Réglage des manettes et joysticks">🎮 Manette</button><button type="button" data-a="quitter">Quitter ✕</button></div>'
    + '<div class="s-etat" id="s-etat"></div><div class="s-message" id="s-message" hidden></div><div class="s-fondu" id="s-fondu"></div><div class="s-panneau" id="s-panneau" hidden></div>';
  racine.appendChild(ui);
  const $ = id => ui.querySelector('#' + id), fonduEl = $('s-fondu'), messageEl = $('s-message'), etatEl = $('s-etat'), panneauEl = $('s-panneau');
  let minuteurMessage = 0;
  const dire = (txt, ms = 4500) => { messageEl.textContent = txt; messageEl.hidden = !txt; clearTimeout(minuteurMessage); if (txt && ms) minuteurMessage = setTimeout(() => { messageEl.hidden = true; }, ms); };
  const fondu = async (noir, ms = 450) => { fonduEl.style.transitionDuration = ms + 'ms'; fonduEl.classList.toggle('noir', noir); await attendre(ms + 30); };

  // ── état général ──
  let prof = profil(G.info().qualite, G.jeu()), reg = lireReg(), stock = E.lireStock(localStorage.getItem(E.CLE_STOCKAGE));
  let actif = false, transition = false, mode = 'off', vue = 'exterieur', assis = true, entreeFinie = false;
  let anat = null, anatPromesse = null, anatPanneau = null;
  let vaisseau = null, cockpit = null, sillage = null, salle = null, sceneV = null, passeV = null, sceneC = null, passeC = null, pivotC = null, interneC = null, lumSoleil = null, lumAmb = null, envRT = null, pmrem = null, camVol = null;
  let corps = [], corpsParId = new Map(), etat = null, auto = null, satGalaxie = null, kmParUnite = 4.7e6;
  let tTotal = 0, poussee = 0, derniereAlerteTexte = '', alertes = [], exposureAvant = null, ombreAvant = null;
  const touches = new Set(), memManette = {}, vecA = new THREE.Vector3(), vecB = new THREE.Vector3(), quatA = new THREE.Quaternion(), quatB = new THREE.Quaternion();
  const tete = { yaw: 0, pitch: 0 }, marche = { x: 0, z: -6.6 }, libre = { pivot: new THREE.Vector3(), az: 0.6, el: 0.3, dist: 6 }, ext = { az: 0.55, el: 0.22, dist: 4.6 };
  const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), depart: null, t: 0 };
  let souris = { dx: 0, dy: 0, verrou: false }, geste = null, panneauOuvert = null, manetteId = null;
  const commande = { trans: [0, 0, 0], rot: [0, 0, 0], post: false, frein: false, vitesseGaz: null };
  let entreesForcees = null;                                         // tests : commandes imposées

  const canvasEl = canvas, ecran = () => ({ l: canvasEl.clientWidth || innerWidth, h: canvasEl.clientHeight || innerHeight });

  // ── astres (positions monde mises à jour à chaque image) ──
  function chercherCorps() {
    corps = []; corpsParId.clear();
    const reg0 = G.registre, s = reg0.soleil;
    const ajoute = (id, nom, rayon, getPos) => { const c = { id, nom, rayon, pos: [0, 0, 0], vel: [0, 0, 0], getPos }; corps.push(c); corpsParId.set(id, c); };
    ajoute('soleil', 'le Soleil', s.rayon * 1.1, () => [0, 0, 0]);
    for (const p of reg0.planetes) { const o = G.systeme.parId(p.id); if (!o) continue; ajoute(p.id, p.nom, p.rayon, () => { o.porteur.getWorldPosition(vecA); return [vecA.x, vecA.y, vecA.z]; }); }
    for (const c of corps) { c.pos = c.getPos(); c.pre = c.pos.slice(); }
    const t = reg0.planetes.find(p => p.id === 'terre'); if (t && t.distance) kmParUnite = 149.6e6 / t.distance;
  }
  function majCorps(dt) {
    for (const c of corps) { const p = c.getPos(); if (dt > 1e-4) c.vel = c.vel.map((v, i) => v * 0.6 + 0.4 * (p[i] - c.pos[i]) / dt); c.pos = p; }
  }

  // ── construction des scènes du vaisseau ──
  function construireVaisseau() {
    sceneV = new THREE.Scene();
    lumAmb = new THREE.AmbientLight(0x5066c0, 0.42); sceneV.add(lumAmb);
    lumSoleil = new THREE.DirectionalLight(0xe6f8ff, 5); lumSoleil.castShadow = prof.ombres > 0; lumSoleil.shadow.mapSize.set(prof.ombres || 512, prof.ombres || 512);
    const sc = lumSoleil.shadow.camera; sc.left = -2.4; sc.right = 2.4; sc.top = 2.4; sc.bottom = -2.4; sc.near = 0.5; sc.far = 14; lumSoleil.shadow.bias = -0.0004; lumSoleil.shadow.normalBias = 0.004; sceneV.add(lumSoleil, lumSoleil.target);
    pmrem = new THREE.PMREMGenerator(renderer);
    import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { if (!pmrem) return; envRT = pmrem.fromScene(new RoomEnvironment(), 0.04); sceneV.environment = envRT.texture; sceneV.environmentIntensity = 0.35; }).catch(() => { /* reflets plus pauvres, rien de bloquant */ });
    vaisseau = creerVaisseau({ detail: prof.detail, graine: 11 });
    cockpit = creerCockpit({ detail: prof.detail });
    // l'intérieur du cockpit vit dans sa propre scène (ses lampes n'éclairent que lui, le Soleil ne le traverse pas) ; sa position suit celle du vaisseau
    sceneC = new THREE.Scene(); pivotC = new THREE.Group(); interneC = new THREE.Group(); interneC.scale.setScalar(ECHELLE); interneC.add(cockpit.groupe); pivotC.add(interneC); sceneC.add(pivotC);
    sceneC.add(new THREE.AmbientLight(0x202c3a, 0.5)); sceneV.add(vaisseau.groupe);
    if (prof.sillage) { sillage = creerSillage({ n: prof.sillage }); sceneV.add(sillage.pts); }
    vaisseau.groupe.traverse(o => { if (o.isMesh && prof.ombres) { o.castShadow = true; o.receiveShadow = true; } });
    cockpit.groupe.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = prof.ombres > 0; });
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  function disposerVaisseau() {
    if (cockpit) { cockpit.dispose(); cockpit = null; } sceneC = null; pivotC = null; interneC = null; if (vaisseau) { vaisseau.dispose(); vaisseau = null; } if (sillage) { sceneV.remove(sillage.pts); sillage.dispose(); sillage = null; }
    if (envRT) { envRT.dispose(); envRT = null; } if (pmrem) { pmrem.dispose(); pmrem = null; } sceneV = null; lumSoleil = lumAmb = null;
  }
  function brancherPasse() {
    const c = G.composer(); if (!c || !sceneV) return;
    if (!passeV) { passeV = new RenderPass(sceneV, camVol); passeV.clear = false; passeV.clearDepth = false; }
    if (!passeC) { passeC = new RenderPass(sceneC, camVol); passeC.clear = false; passeC.clearDepth = false; }
    if (!c.passes.includes(passeV)) c.insertPass(passeV, 1);
    if (!c.passes.includes(passeC)) c.insertPass(passeC, c.passes.indexOf(passeV) + 1);
    passeV.scene = sceneV; passeV.camera = camVol; passeC.scene = sceneC; passeC.camera = camVol;
  }
  function retirerPasse() { const c = G.composer(); if (c) for (const p of [passeV, passeC]) if (p && c.passes.includes(p)) c.removePass(p); passeV = passeC = null; }

  // ── état initial du vol : garé en orbite de Saturne, là où se trouve le vaisseau de la galaxie ──
  function positionnerDepart() {
    const sat = G.systeme.parId('saturne'), cs = G.registre.planetes.find(p => p.id === 'saturne'), idx = cs && cs.satellites ? cs.satellites.findIndex(s => s.id === 'vaisseau-anatomie') : -1;
    satGalaxie = sat && idx >= 0 ? sat.satellites[idx].vaisseau : null;
    const pos = satGalaxie ? satGalaxie.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(60, 0, -60), c = corpsParId.get('saturne');
    etat = V.etatInitial({ pos: [pos.x, pos.y, pos.z], assist: stock.global.assistanceDepart, limiteur: true });
    if (c) { const alt = Math.max(2, V.norme(V.sub(etat.pos, c.pos)) - c.rayon); V.entrerEnOrbite(etat, c, alt, { normale: [0, 1, 0], sens: 1 }); V.pas(etat, {}, 0.0, V.PARAMS, corps); }
    if (satGalaxie) satGalaxie.visible = false;
  }

  // ── caméra ──
  function teteLocale() {                                           // pose de la tête dans le repère du vaisseau (mètres) : prête pour un casque (WebXR) qui remplacerait yaw/pitch
    const y = assis ? YEUX.assis : new THREE.Vector3(marche.x, YEUX.debout.y, marche.z);
    return { pos: y, yaw: tete.yaw, pitch: tete.pitch };
  }
  const eyeCourant = new THREE.Vector3().copy(YEUX.assis);
  function poseCible(dt) {
    const g = vaisseau.groupe, q = quatA.set(...etat.q);
    if (vue === 'cockpit') {
      const th = teteLocale(); eyeCourant.lerp(th.pos, 1 - Math.exp(-dt * 5));
      vecB.copy(eyeCourant); vaisseau.interne.localToWorld(vecB);
      const tq = quatB.setFromEuler(new THREE.Euler(th.pitch, th.yaw, 0, 'YXZ'));
      return { pos: vecB.clone(), quat: q.clone().multiply(tq) };
    }
    if (vue === 'exterieur') {
      const off = new THREE.Vector3(Math.sin(ext.az) * Math.cos(ext.el), Math.sin(ext.el), Math.cos(ext.az) * Math.cos(ext.el)).multiplyScalar(ext.dist);
      off.applyQuaternion(q); const p = g.position.clone().add(off);
      const m = new THREE.Matrix4().lookAt(p, g.position.clone().add(new THREE.Vector3(0, 0.12, 0).applyQuaternion(q)), new THREE.Vector3(0, 1, 0).applyQuaternion(q));
      return { pos: p, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
    }
    const off = new THREE.Vector3(Math.sin(libre.az) * Math.cos(libre.el), Math.sin(libre.el), Math.cos(libre.az) * Math.cos(libre.el)).multiplyScalar(libre.dist), p = libre.pivot.clone().add(off);
    return { pos: p, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, libre.pivot, new THREE.Vector3(0, 1, 0))) };
  }
  function majCamera(dt) {
    const c = poseCible(dt);
    if (pose.t > 0 && pose.depart) {                                // transition douce entre deux vues
      pose.t = Math.max(0, pose.t - dt); const k = 1 - pose.t / 1.1, e = k * k * (3 - 2 * k);
      camVol.position.copy(pose.depart.pos).lerp(c.pos, e); camVol.quaternion.copy(pose.depart.quat).slerp(c.quat, e);
    } else { camVol.position.copy(c.pos); camVol.quaternion.copy(c.quat); }
    const proche = V.plusProche(etat.pos, corps), alt = proche ? Math.max(0, proche.alt) : 100;
    camVol.near = vue === 'cockpit' ? 0.004 : Math.max(0.004, Math.min(0.5, alt * 0.02)); camVol.far = 6000;
    if (camVol.fov !== reg.fov) camVol.fov = reg.fov; camVol.updateProjectionMatrix();
  }
  function changerVue(v, rapide = false) {
    if (!['exterieur', 'cockpit', 'libre'].includes(v) || v === vue) return;
    pose.depart = { pos: camVol.position.clone(), quat: camVol.quaternion.clone() }; pose.t = rapide ? 0.01 : 1.1;
    if (v === 'libre') { libre.pivot.copy(vaisseau.groupe.position); libre.dist = Math.max(ext.dist, 5); const d = camVol.position.clone().sub(libre.pivot); libre.az = Math.atan2(d.x, d.z); libre.el = Math.asin(Math.max(-1, Math.min(1, d.y / (d.length() || 1)))); libre.dist = d.length() || 6; }
    vue = v; vaisseau.vueInterieure(false);
    if (v === 'cockpit') { tete.yaw = 0; tete.pitch = 0; }
    majBoutons(); window.dispatchEvent(new CustomEvent('saturne:vue', { detail: { vue } }));
  }

  // ── entrées ──
  const TYPES_SAISIE = /^(INPUT|TEXTAREA|SELECT)$/;
  const saisie = e => e.target && (TYPES_SAISIE.test(e.target.tagName) || e.target.isContentEditable);
  const CODES_UTILISES = new Set(Object.values(E.CLAVIER).flat());
  function surTouche(e, bas) {
    if (!actif || saisie(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.dos-voile')) return;   // R3 : un dossier ouvert (carrousel) garde les flèches, Échap et Entrée
    if (mode === 'salle') {
      if (bas && (e.key === 'Escape' || e.code === 'KeyM')) { e.stopImmediatePropagation(); e.preventDefault(); api.sortirSalle(); return; }
      if (CODES_UTILISES.has(e.code)) { if (bas) touches.add(e.code); else touches.delete(e.code); e.stopImmediatePropagation(); e.preventDefault(); }
      return;
    }
    if (CODES_UTILISES.has(e.code)) {
      e.stopImmediatePropagation(); e.preventDefault();
      if (bas) { if (!e.repeat) { touches.add(e.code); declencher(e.code); } } else touches.delete(e.code);
    }
  }
  function declencher(code) {
    const a = Object.entries(E.CLAVIER).find(([k, l]) => l.includes(code) && ['assistance', 'limiteur', 'vue', 'pilote_auto', 'se_lever_asseoir', 'salle_medicale', 'recentrer', 'ecran_commandes'].includes(k));
    if (a) action(a[0]);
  }
  function action(nom) {
    if (transition) return;
    switch (nom) {
      case 'assistance': etat.assist = !etat.assist; dire('Assistance de vol ' + (etat.assist ? 'activée' : 'coupée : vol newtonien'), 2500); break;
      case 'limiteur': etat.limiteur = !etat.limiteur; dire('Limiteur de vitesse ' + (etat.limiteur ? 'activé' : 'coupé'), 2500); break;
      case 'vue': changerVue({ exterieur: 'cockpit', cockpit: 'libre', libre: 'exterieur' }[vue]); break;
      case 'pilote_auto': if (auto) { api.arreterAuto('Pilote automatique coupé.'); } break;
      case 'se_lever_asseoir': api.basculerAssis(); break;
      case 'salle_medicale': api.salleMedicale(); break;
      case 'recentrer': tete.yaw = tete.pitch = 0; ext.az = 0.55; ext.el = 0.22; break;
      case 'ecran_commandes': ouvrirPanneau('commandes'); break;
    }
  }
  const sourisFlux = e => { if (souris.verrou) { souris.dx += e.movementX || 0; souris.dy += e.movementY || 0; } };
  document.addEventListener('mousemove', sourisFlux);
  document.addEventListener('pointerlockchange', () => { souris.verrou = document.pointerLockElement === canvasEl; canvasEl.classList.toggle('s-verrou', souris.verrou); if (souris.verrou) dire('Souris capturée : elle pilote le vaisseau. Échap pour la libérer.', 3500); });
  window.addEventListener('keydown', e => surTouche(e, true), true); window.addEventListener('keyup', e => surTouche(e, false), true); window.addEventListener('blur', () => touches.clear());
  const handlers = {
    pointerdown(e) { if (transition) return; if (anat) anat.finSurvol(); canvasEl.setPointerCapture(e.pointerId); geste = { x: e.clientX, y: e.clientY, bouge: 0, bouton: e.button }; },
    pointermove(e) {
      if (!geste && mode === 'salle' && anat && !souris.verrou) { anat.survoler(e.clientX, e.clientY); return; }          // étiquette provisoire de la pièce survolée
      if (!geste || souris.verrou) return; const dx = e.clientX - geste.x, dy = e.clientY - geste.y; geste.x = e.clientX; geste.y = e.clientY; geste.bouge += Math.abs(dx) + Math.abs(dy);
      if (mode === 'salle') { salle.controle.glisser(dx, dy); return; }
      if (vue === 'cockpit') { tete.yaw = Math.max(-2.6, Math.min(2.6, tete.yaw - dx * 0.0045)); tete.pitch = Math.max(-1.2, Math.min(1.2, tete.pitch - dy * 0.0045)); }
      else if (vue === 'exterieur') { ext.az -= dx * 0.006; ext.el = Math.max(-1.3, Math.min(1.3, ext.el + dy * 0.005)); }
      else { libre.az -= dx * 0.006; libre.el = Math.max(-1.4, Math.min(1.4, libre.el + dy * 0.005)); }
    },
    pointerup(e) {
      try { canvasEl.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ }
      const g = geste; geste = null; if (!g || transition) return;
      if (g.bouge < 6 && g.bouton === 0 && mode === 'salle' && anat) { anat.clic(e.clientX, e.clientY, e.shiftKey); return; }
      if (g.bouge < 6 && g.bouton === 0 && mode === 'vol' && reg.sourisVol && vue !== 'libre' && !assisDebout()) { try { canvasEl.requestPointerLock(); } catch (x) { /* non disponible */ } }
    },
    pointercancel() { geste = null; },
    wheel(e) {
      if (transition) return; const d = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
      if (mode === 'salle') salle.controle.zoom(d);
      else if (vue === 'exterieur') ext.dist = Math.max(1.2, Math.min(40, ext.dist * Math.exp(d * 0.0012)));
      else if (vue === 'libre') libre.dist = Math.max(0.6, Math.min(400, libre.dist * Math.exp(d * 0.0012)));
      else reg.fov = Math.max(45, Math.min(100, reg.fov + d * 0.02));
    },
    dblclick(e) { /* aucune action : évite que la galaxie vole vers un astre */ }
  };
  const assisDebout = () => vue === 'cockpit' && !assis;

  // manette : première manette connectée, profil enregistré ou choisi d'après sa forme
  function lireManetteActive() {
    const liste = (navigator.getGamepads && navigator.getGamepads()) || []; let gp = null;
    for (const g of liste) if (g && g.connected) { gp = g; break; }
    if (!gp) { manetteId = null; return null; }
    if (manetteId !== gp.id) { manetteId = gp.id; dire('Manette détectée : ' + gp.id.slice(0, 48) + (stock.profils[gp.id] ? '' : ' (profil par défaut, réglable avec 🎮 Manette)'), 5000); }
    const profilM = stock.profils[gp.id] || E.profilPourManette(gp);
    return { gp, profil: profilM };
  }

  // ── commandes de vol de l'image : fusion clavier + souris + manette (+ pilote automatique) ──
  function lireCommandes(dt) {
    if (entreesForcees) return entreesForcees;
    if (mode !== 'vol' || vue === 'libre' || assisDebout()) return { trans: [0, 0, 0], rot: [0, 0, 0], post: false, frein: false, vitesseGaz: null };
    const clav = E.lireClavier(touches);
    let sour = null; if (souris.verrou) { sour = { trans: [0, 0, 0], rot: E.lireSouris(souris.dx, souris.dy, dt, { sens: stock.global.sensSouris, inverser: stock.global.inverserTangageSouris }), post: false, frein: false }; souris.dx = souris.dy = 0; }
    let man = null; const m = lireManetteActive();
    if (m) { man = E.lireManette(m.gp, m.profil, memManette, stock.global); for (const ev of man.evenements) { if (ev === 'postcombustion' || ev === 'frein') continue; action(ev); } }
    return E.fusionner(clav, sour, man);
  }
  const entreesActives = c => V.norme(c.trans) > 0.05 || V.norme(c.rot) > 0.15 || c.frein;

  // ── image ──
  let horlogeEcran = '', derniereBarre = 0;
  function majTelemetrieEcrans(dt) {
    const tele = V.telemetrie(etat, corps, { kmParUnite });
    const q = new THREE.Quaternion(...etat.q).invert(), cibles = [];
    for (const c of corps) { const d = vecA.set(c.pos[0] - etat.pos[0], c.pos[1] - etat.pos[1], c.pos[2] - etat.pos[2]), dist = d.length(); d.normalize().applyQuaternion(q); cibles.push({ id: c.id, nom: c.nom, distance: Math.max(0, dist - c.rayon), dir: [d.x, d.y, d.z] }); }
    cibles.sort((a, b) => a.distance - b.distance);
    const rayle = document.body.dataset.etat || 'idle';
    return { tele, nav: { cibles, km: kmParUnite, autopilote: auto ? { cible: auto.nom, dist: auto.dist || 0, etape: auto.etape || '' } : null }, att: { vmax: V.PARAMS.vitMax, vmaxPost: V.PARAMS.vitMax * V.PARAMS.facteurPost, km: kmParUnite }, sys: { energie: Math.max(0.05, 1 - 0.0 * tTotal), poussee, rayle, alertes, horloge: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) } };
  }
  function majVol(dt, t) {
    G.soleil.maj(t, dt); G.systeme.maj(t, dt); if (G.params().animerDecor) G.ceinture.maj(dt * 0.5);
    majCorps(dt);
    // pilote automatique
    let cmd = lireCommandes(dt);
    if (cmd.vitesseGaz !== null && cmd.vitesseGaz !== undefined && Math.abs(cmd.trans[2]) < 0.05) cmd = { ...cmd, trans: [cmd.trans[0], cmd.trans[1], cmd.vitesseGaz] };   // manette des gaz : vitesse voulue
    if (auto) {
      const c = corpsParId.get(auto.id), res = c ? V.piloteAuto(etat, c, { altitude: auto.altitude, echelle: echelleVitesse() }) : null;
      if (!res || entreesActives(cmd)) { api.arreterAuto(entreesActives(cmd) ? 'Pilote automatique coupé : tu reprends les commandes.' : 'Cible perdue.'); }
      else {
        auto.dist = res.dist; auto.etape = res.etape;
        if (res.arrive) { const c2 = c; V.entrerEnOrbite(etat, c2, auto.altitude, { normale: [0, 1, 0] }); const fin = auto.fin; const nom = auto.nom; auto = null; majBoutons(); dire('En orbite de ' + nom + '.', 4000); if (fin) fin({ ok: true, texte: 'Nous voici en orbite de ' + nom + '.' }); window.dispatchEvent(new CustomEvent('saturne:arrive', { detail: { id: c2.id } })); }
        else cmd = { ...res.cmd };
      }
    }
    const pas = Math.min(dt, 0.05), n = pas > 1 / 30 ? 2 : 1;
    let evt = {};
    for (let i = 0; i < n; i++) evt = V.pas(etat, cmd, pas / n, V.PARAMS, corps, echelleVitesse());
    if (evt.collision && !majVol.derniereCollision) { dire('Contact évité : le vaisseau frôle ' + (corpsParId.get(evt.collision) || {}).nom + '. Pas de traversée possible.', 2500); }
    majVol.derniereCollision = evt.collision || 0;
    poussee = Math.max(0, Math.min(1.6, (cmd.trans ? Math.max(0, cmd.trans[2]) * 0.8 + 0.2 * V.norme(cmd.trans) : 0) * (etat.post ? 1.6 : 1) * (auto ? 0.8 : 1)));
    if (etat.orbite) poussee = 0;
    // visuels
    vaisseau.groupe.position.set(...etat.pos); vaisseau.groupe.quaternion.set(...etat.q); vaisseau.groupe.updateMatrixWorld(true);
    pivotC.position.copy(vaisseau.groupe.position); pivotC.quaternion.copy(vaisseau.groupe.quaternion); pivotC.updateMatrixWorld(true);
    vaisseau.maj(dt, t, poussee, { projecteursOn: prof.projecteurs && V.plusProche(etat.pos, corps).alt < 6 && false });
    const d = majTelemetrieEcrans(dt); if (vue === 'cockpit' || t - derniereBarre > 0.25) cockpit.maj(dt, t, d, { trans: cmd.trans, rot: cmd.rot, gaz: cmd.vitesseGaz });
    if (sillage) { const quat = vaisseau.groupe.quaternion, arriere = vecA.set(0, 0, 1).applyQuaternion(quat), origines = vaisseau.buses.map(b => vaisseau.interne.localToWorld(b.position.clone())); sillage.maj(dt, origines, arriere.clone(), new THREE.Vector3(...etat.vel), poussee, ECHELLE * 0.9); sillage.mat.uniforms.uEchelle.value = ecran().h * 0.9; }
    // lumière du soleil sur le vaisseau (ombres) : direction réelle vers l'origine
    const dir = vecA.set(-etat.pos[0], -etat.pos[1], -etat.pos[2]).normalize(); lumSoleil.position.copy(vaisseau.groupe.position).addScaledVector(dir, 6); lumSoleil.target.position.copy(vaisseau.groupe.position);
    // marche à pied dans le pont
    if (vue === 'cockpit' && !assis) {
      const av = (touches.has('KeyW') ? 1 : 0) - (touches.has('KeyS') ? 1 : 0), la = (touches.has('KeyD') ? 1 : 0) - (touches.has('KeyA') ? 1 : 0), v = (touches.has('ShiftLeft') ? 3.4 : 1.8) * dt;
      const s = Math.sin(tete.yaw), c = Math.cos(tete.yaw);
      marche.x = Math.max(BORNES_MARCHE.xmin, Math.min(BORNES_MARCHE.xmax, marche.x + (la * c - av * s) * v)); marche.z = Math.max(BORNES_MARCHE.zmin, Math.min(BORNES_MARCHE.zmax, marche.z + (-av * c - la * s) * v));
    }
    majCamera(dt);
    if (t - derniereBarre > 0.25) { derniereBarre = t; majBarreEtat(d.tele); }
  }
  function echelleVitesse() { return reg.echelle === 'reelle' ? 0.35 : 1; }
  function majBarreEtat(tele) {
    const p = tele.proche;
    etatEl.textContent = 'VITESSE ' + tele.vitesse.toFixed(1).replace('.', ',') + ' u/s · CAP ' + String(Math.round(tele.cap)).padStart(3, '0') + '° · ' + (p ? p.nom.toUpperCase() + ' ' + Math.max(0, p.altitude).toFixed(1).replace('.', ',') + ' u' : '—') + ' · ' + (tele.orbite ? 'EN ORBITE' : auto ? 'PILOTE AUTO → ' + auto.nom.toUpperCase() : tele.assist ? 'ASSISTANCE' : 'VOL LIBRE') + (tele.post ? ' · POSTCOMBUSTION' : '');
  }
  function majSalle(dt, t) {
    G.soleil.maj(t, dt);                                              // le soleil continue de vivre derrière les murs
    if (salle) { const marcher = (touches.has('KeyW') ? 1 : 0) - (touches.has('KeyS') ? 1 : 0), lat = (touches.has('KeyD') ? 1 : 0) - (touches.has('KeyA') ? 1 : 0); if (marcher || lat) salle.controle.marcher(marcher, lat, dt); salle.maj(dt, t); }
  }
  function maj(dt, t) {
    tTotal += dt; if (!actif) return;
    if (mode === 'vol') { brancherPasse(); majVol(dt, tTotal); } else if (mode === 'salle') majSalle(dt, tTotal);
  }

  // ── interface : boutons, panneaux ──
  function majBoutons() {
    ui.querySelectorAll('[data-vue]').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
    const b = ui.querySelector('[data-a="asseoir"]'); b.hidden = vue !== 'cockpit'; b.textContent = assis ? 'Se lever' : 'S’asseoir';
    ui.querySelector('[data-a="pilote"]').hidden = !auto; if (auto) ui.querySelector('[data-a="pilote"]').textContent = 'Couper le pilote auto';
    ui.classList.toggle('s-cockpit', vue === 'cockpit' && mode === 'vol'); ui.classList.toggle('s-salle', mode === 'salle');
    ui.querySelector('[data-a="salle"]').textContent = mode === 'salle' ? 'Retour au cockpit' : 'Salle médicale';
  }
  async function ouvrirPanneau(quoi) {
    if (panneauOuvert === quoi) { panneauEl.hidden = true; panneauOuvert = null; return; }
    const M = await import('./panneau-commandes.js'); panneauOuvert = quoi; panneauEl.hidden = false;
    M.afficherPanneau(panneauEl, quoi, { stock, enregistrer: s => { stock = s; localStorage.setItem(E.CLE_STOCKAGE, E.ecrireStock(s)); }, reg, enregistrerReg: r => { Object.assign(reg, r); ecrireReg(reg); }, manette: lireManetteActive, fermer: () => { panneauEl.hidden = true; panneauOuvert = null; } });
  }
  ui.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.vue) { api.vue(b.dataset.vue); return; }
    const a = b.dataset.a; if (a === 'asseoir') api.basculerAssis(); else if (a === 'salle') api.salleMedicale(); else if (a === 'pilote') api.arreterAuto('Pilote automatique coupé.'); else if (a === 'commandes') ouvrirPanneau('commandes'); else if (a === 'reglages') ouvrirPanneau('manette'); else if (a === 'quitter') api.sortir();
  });
  window.addEventListener('galaxie:sortie', () => { if (actif) api.sortir(); });
  G.surChangement(() => { if (!actif) return; const p = profil(G.info().qualite, G.jeu()); if (p.niveau !== prof.niveau) { prof = p; if (mode === 'vol') { const e = etat; changerQualite(e); } } });
  function changerQualite(e) {                                        // reconstruit le vaisseau au niveau de détail voulu, sans toucher à l'état de vol
    const vueAvant = vue, assisAvant = assis; retirerPasse(); disposerVaisseau(); construireVaisseau(); vaisseau.vueInterieure(false); vue = vueAvant; assis = assisAvant; majBoutons();
  }

  // ── API ──
  const api = {
    async entrer({ rapide = false } = {}) {
      if (actif) return;
      actif = true; transition = true; entreeFinie = false; prof = profil(G.info().qualite, G.jeu());
      await fondu(true, rapide ? 140 : 380);
      camVol = new THREE.PerspectiveCamera(reg.fov, 1, 0.004, 6000); camVol.matrixAutoUpdate = true;
      chercherCorps(); construireVaisseau(); positionnerDepart();
      exposureAvant = null; ombreAvant = renderer.shadowMap.enabled; renderer.shadowMap.enabled = prof.ombres > 0;
      vue = 'exterieur'; assis = true; mode = 'vol'; eyeCourant.copy(YEUX.assis); ext.dist = 5.2; ext.az = 0.55; ext.el = 0.22; pose.t = 0; pose.depart = null;
      vaisseau.groupe.position.set(...etat.pos); vaisseau.groupe.quaternion.set(...etat.q); majCamera(0.016);
      G.nav.selectionner(null); G.nav.deleguer(handlers); G.surcharger({ scene: G.scene, camera: camVol, maj });
      brancherPasse(); racine.classList.add('saturne-actif'); ui.hidden = false; majBoutons();
      window.dispatchEvent(new CustomEvent('saturne:entree', {}));
      await attendre(rapide ? 40 : 120); await fondu(false, rapide ? 320 : 650);
      transition = false; entreeFinie = true;
      dire('Bienvenue à bord du Vésale. Touche C ou le bouton Cockpit pour entrer, F1 pour les commandes.', 6000);
    },
    async sortir() {
      if (!actif) return;
      transition = true; const rapide = false;
      if (document.pointerLockElement) document.exitPointerLock();
      await fondu(true, rapide ? 160 : 420);
      if (auto && auto.fin) auto.fin({ ok: false, erreur: 'sortie du vaisseau' }); auto = null;
      retirerPasse(); G.surcharger(null); G.nav.deleguer(null);
      renderer.shadowMap.enabled = ombreAvant === null ? false : ombreAvant; if (satGalaxie) satGalaxie.visible = true;
      if (anatPanneau) { anatPanneau.dispose(); anatPanneau = null; } if (anat) { if (anat.orchestre) anat.orchestre.dispose(); anat.dispose(); } anat = null; anatPromesse = null;
      if (salle) { salle.dispose(); salle = null; } disposerVaisseau(); if (panneauOuvert) { panneauEl.hidden = true; panneauOuvert = null; }
      actif = false; mode = 'off'; touches.clear(); geste = null;
      document.body.classList.remove('saturne-salle'); racine.classList.remove('saturne-actif'); ui.hidden = true; canvasEl.style.cursor = '';
      window.dispatchEvent(new CustomEvent('saturne:sortie', {}));
      await attendre(120); await fondu(false, 600); transition = false;
    },
    vue(v) { if (!actif || mode !== 'vol') return false; if (v === 'cockpit' && vue !== 'cockpit') { assis = true; } changerVue(v); return true; },
    basculerAssis() { if (!actif || mode !== 'vol' || vue !== 'cockpit') return false; assis = !assis; if (!assis) { marche.x = 0; marche.z = -6.6; } majBoutons(); dire(assis ? 'Tu t’assieds au poste de pilotage.' : 'Tu te lèves : WASD pour marcher dans le pont, M pour la salle médicale.', 3500); return true; },
    async salleMedicale() {
      if (!actif || transition) return false;
      if (mode === 'salle') return api.sortirSalle();
      transition = true; await fondu(true, 380);
      if (!salle) { salle = creerSalleMedicale({ renderer, detail: prof.detail }); await salle.pret; const { l, h } = ecran(); salle.redimensionner(l, h); }
      mode = 'salle'; if (passeV) passeV.enabled = false; if (passeC) passeC.enabled = false; exposureAvant = renderer.toneMappingExposure;
      api.anatomie().catch(err => dire('Anatomie indisponible : ' + (err && err.message || err), 6000));
      salle.controle.recentrer(); G.surcharger({ scene: salle.scene, camera: salle.camera, maj });
      majBoutons(); document.body.classList.add('saturne-salle'); window.dispatchEvent(new CustomEvent('saturne:salle', { detail: { dedans: true } }));
      await attendre(120); await fondu(false, 600); transition = false;
      dire('Salle médicale : glisse pour tourner autour de la table, molette pour zoomer, M ou Échap pour revenir.', 5000);
      return true;
    },
    async sortirSalle() {
      if (!actif || mode !== 'salle' || transition) return false;
      transition = true; await fondu(true, 380);
      mode = 'vol'; if (passeV) passeV.enabled = true; if (passeC) passeC.enabled = true; G.surcharger({ scene: G.scene, camera: camVol, maj });
      majBoutons(); document.body.classList.remove('saturne-salle'); window.dispatchEvent(new CustomEvent('saturne:salle', { detail: { dedans: false } }));
      await attendre(120); await fondu(false, 600); transition = false; return true;
    },
    /* « Raylé, emmène-moi sur Mars » : pilote automatique jusqu'à l'orbite de l'astre ; la promesse se résout à l'arrivée. */
    aller(id) {
      if (!actif || mode !== 'vol') return Promise.resolve({ ok: false, erreur: 'le vaisseau n’est pas ouvert' });
      const c = corpsParId.get(id); if (!c) return Promise.resolve({ ok: false, erreur: 'astre inconnu : ' + id });
      if (auto) api.arreterAuto('', true); etat.orbite = null;
      return new Promise(fin => { auto = { id, nom: c.nom, altitude: Math.max(c.rayon * 0.6, 1.5), fin, dist: 0, etape: 'alignement' }; majBoutons(); dire('Pilote automatique : cap sur ' + c.nom + '.', 3500); });
    },
    arreterAuto(texte = 'Pilote automatique coupé.', silencieux = false) { if (!auto) return false; const fin = auto.fin; auto = null; majBoutons(); if (texte && !silencieux) dire(texte, 3000); if (fin) fin({ ok: false, erreur: 'pilote automatique interrompu' }); return true; },
    stopper() { api.arreterAuto('', true); if (etat) { etat.orbite = null; } entreesForcees = { trans: [0, 0, 0], rot: [0, 0, 0], post: false, frein: true }; setTimeout(() => { entreesForcees = null; }, 3000); return true; },
    orbiter() { if (!etat) return false; const p = V.plusProche(etat.pos, corps); if (!p) return false; V.entrerEnOrbite(etat, p.corps, Math.max(p.alt, p.corps.rayon * 0.4, 1.5), { normale: [0, 1, 0] }); dire('En orbite de ' + p.corps.nom + '.', 3000); return p.corps.id; },
    /* Anatomie (S2) : visualiseur de la salle médicale, créé à la première demande (index et modèles dans assets-lourds/anatomie/). */
    anatomie() {
      if (anatPromesse) return anatPromesse;
      anatPromesse = (async () => {
        if (!salle) throw new Error('la salle médicale n’est pas ouverte');
        const { creerAnatomie } = await import('./anatomie-vue.js'), { creerPanneauAnatomie } = await import('./anatomie-panneau.js'), { creerOrchestre } = await import('./anatomie-orchestre.js');
        if (!document.getElementById('anatomie-css')) { const l = document.createElement('link'); l.id = 'anatomie-css'; l.rel = 'stylesheet'; l.href = new URL('./anatomie.css', import.meta.url).href; document.head.appendChild(l); }
        const a = await creerAnatomie({ api, salle, renderer, ui }); anat = a; (await import('./anatomie-nerfs.js')).declarerNerfs(a);
        a.orchestre = creerOrchestre({ anat: a, ui, ecran, panneau: () => anatPanneau }); a.fenetres = a.orchestre.glue;
        anatPanneau = creerPanneauAnatomie({ ui, obtenir: () => anat, dire, ouvrirCatalogue: t => a.orchestre.catalogue(t), ouvrirFenetres: act => a.orchestre.actionFenetres(act), arreter: () => a.orchestre.arreter(), ouvrirDossiers: () => a.orchestre.ouvrirDossiers() });
        a.abonner((type, d) => { if (type === 'systemes' && anatPanneau) anatPanneau.synchroniser(d); });
        a.afficherSysteme('os', { surProgres: (f, t) => anatPanneau && anatPanneau.etat('Chargement du squelette ' + f + '/' + t) }).then(() => anatPanneau && anatPanneau.etat('Squelette affiché. Les autres couches (muscles, vaisseaux, nerfs, organes, ligaments) s’activent avec les boutons ou à la voix.'), err => dire('Squelette indisponible : ' + (err && err.message || err), 6000));   // état par défaut : le squelette seul
        return a;
      })();
      anatPromesse.catch(() => { anatPromesse = null; });
      return anatPromesse;
    },
    anatomieObjet: () => anat,
    ouvrirPanneauCommandes: () => ouvrirPanneau('commandes'),
        reglerAssistance(oui) { if (etat) etat.assist = !!oui; return true; }, reglerLimiteur(oui) { if (etat) etat.limiteur = !!oui; return true; },
    /* Test et ordres : commandes imposées pendant `ms` millisecondes (null pour rendre la main). */
    forcerEntrees(c, ms = 0) { entreesForcees = c; if (c && ms) setTimeout(() => { if (entreesForcees === c) entreesForcees = null; }, ms); },
    etat: () => ({
      actif, mode, vue, assis, transition, entree: entreeFinie, qualite: prof.niveau, detail: prof.detail, auto: auto ? { id: auto.id, dist: auto.dist, etape: auto.etape } : null,
      vol: etat ? { pos: etat.pos.slice(), vel: etat.vel.slice(), vitesse: V.norme(etat.vel), q: etat.q.slice(), assist: etat.assist, limiteur: etat.limiteur, orbite: etat.orbite ? etat.orbite.corps : null, post: etat.post } : null,
      camera: camVol ? { pos: camVol.position.toArray(), near: camVol.near, fov: camVol.fov } : null, manette: manetteId, souris: souris.verrou, panneau: panneauOuvert, salle: !!salle, reg: { ...reg },
      telemetrie: etat ? V.telemetrie(etat, corps, { kmParUnite }) : null
    }),
    placer(o) { if (!etat) return; if (o.pos) etat.pos = o.pos.slice(); if (o.vel) etat.vel = o.vel.slice(); if (o.q) etat.q = o.q.slice(); if (o.orbite === null) etat.orbite = null; },
    corps: () => corps.map(c => ({ id: c.id, nom: c.nom, pos: c.pos.slice(), rayon: c.rayon })),
    ecran, dire, vaisseauObjet: () => vaisseau, cockpitObjet: () => cockpit, salleObjet: () => salle, camera: () => camVol, scenes: () => ({ vaisseau: sceneV, salle: salle && salle.scene }),
    /* Pour les modules d'anatomie (S2 et suivants) */
    modeles: creerChargeurModeles({ renderer }),
    reglages: () => ({ ...reg, stock }), regler(o) { Object.assign(reg, o); ecrireReg(reg); return { ...reg }; },
    mesures: () => G.mesures(1000)
  };
  window.Saturne = api;
  return api;
}
