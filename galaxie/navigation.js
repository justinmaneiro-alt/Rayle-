import * as THREE from 'three';

/* ═════════════ NAVIGATION (souris sur PC) ═════════════
   Glisser gauche : tourner · Molette : zoom · Glisser droit : déplacer (vue d'ensemble) · Survol : nom
   Clic : sélectionner (sur le soleil Raylé : parler / couper la conversation) · Double-clic : voler jusqu'à la cible et entrer · Échap : retour · H : accueil
   Tout passe par les méthodes allerA / retour / selectionner : la voix (sous-prompt 4) appellera les mêmes. */

const ACCUEIL = { yaw: 0.42, pitch: 0.3, dist: 130 };
const PITCH_MAX = 1.45;
const DUREE_VOL = 2.4;
const ENTREE_RAYONS = 3.6;   // en zoomant sur une planète à module (la Terre) : en dessous de cette distance (en rayons) son orbite s'engage toute seule
const facile = e => (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
const angleCourt = (de, vers) => { let d = (vers - de) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export function creerNavigation({ camera, canvas, cibles, pickers, ui, surTouche = {}, surSoleil = null, surEntree = null, clicEntre = null }) {
  const parId = new Map(cibles.map(c => [c.id, c]));
  const pos = id => { const v = new THREE.Vector3(); parId.get(id).obj.getWorldPosition(v); return v; };
  const dMin = id => (id ? Math.max(parId.get(id).rayon * 1.7, 1.2) : 6);
  const dMax = id => (id ? 90 : 200);

  const etat = { focus: null, selection: null, survol: null, sas: false, actif: true };
  const cible = new THREE.Vector3(0, 0, 0);
  let yaw = ACCUEIL.yaw, pitch = ACCUEIL.pitch, logD = Math.log(ACCUEIL.dist), logCible = logD;
  let vYaw = 0, vPitch = 0, vol = null, inactif = 0;
  let glisse = null, souris = { x: -1, y: -1, dedans: false };
  let entreeVoulue = false, entreeBloquee = 0;   // l'entrée par zoom ne part que d'un coup de molette vers l'avant, jamais d'elle-même (pas de clignotement après une sortie)
  let delegue = null;   // une planète en orbite (ex. la Terre) peut prendre en charge la souris : { pointerdown, pointermove, pointerup, wheel, dblclick }
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const evt = (nom, detail) => window.dispatchEvent(new CustomEvent('galaxie:' + nom, { detail }));

  /* ── Sélection, vol, retour ── */
  function selectionner(id) {
    if (id && !parId.has(id)) return false;
    etat.selection = id; ui.carte(id ? parId.get(id) : null);
    evt('selection', { id });
    return true;
  }
  function allerA(id, { entrer = false } = {}) {
    const c = parId.get(id); if (!c) return false;
    const p = pos(id), dir = new THREE.Vector3(-p.x, 0, -p.z);   // la caméra se place du côté du soleil
    const yawFinal = dir.lengthSq() > 1e-6 ? Math.atan2(dir.z, dir.x) + 0.45 : yaw;
    vol = { t: 0, de: { cible: cible.clone(), logD, yaw, pitch }, vers: { id, logD: Math.log(Math.max(c.rayon * 4.2, 3.5)), yaw: yawFinal, pitch: 0.28 }, entrer };
    fermerSas(); selectionner(id); etat.focus = null; vYaw = vPitch = 0;
    evt('vol', { vers: id });
    return true;
  }
  function retour() {
    if (etat.sas) { fermerSas(); }
    vol = { t: 0, de: { cible: cible.clone(), logD, yaw, pitch }, vers: { id: null, logD: Math.log(ACCUEIL.dist), yaw, pitch: ACCUEIL.pitch, pos: new THREE.Vector3() }, entrer: false };
    fermerSas(); selectionner(null); etat.focus = null; vYaw = vPitch = 0;
    evt('vol', { vers: null });
  }
  function interrompreVol() { if (!vol) return; etat.focus = vol.vers.id; logCible = logD; vol = null; }
  /* Arrivée sur une planète : si son module prend le relais (surEntree renvoie vrai), on n'affiche pas le sas ; Échap ferme quand même (événement « sortie »). */
  function ouvrirSas(id, rapide = false) {
    etat.sas = true; entreeVoulue = false;
    let pris = false; try { pris = !!(surEntree && surEntree(id, rapide)); } catch (x) { console.error('[galaxie] module de planète :', x); }
    if (!pris) ui.sas(parId.get(id));
    evt('entree', { id });
  }
  function fermerSas() { if (etat.sas) { etat.sas = false; ui.sas(null); evt('sortie', {}); } }

  /* ── Pointeur ── */
  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    souris.x = e.clientX - r.left; souris.y = e.clientY - r.top; souris.dedans = true;
    ndc.set(souris.x / r.width * 2 - 1, -(souris.y / r.height) * 2 + 1);
  }
  function viser() {
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects(pickers, false)[0];
    return h ? h.object.userData.cible : null;
  }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (delegue && delegue.pointerdown) return delegue.pointerdown(e);
    pointer(e); canvas.setPointerCapture(e.pointerId);
    glisse = { x: e.clientX, y: e.clientY, bouton: e.button, bouge: 0 };
    interrompreVol();   // un geste de l'utilisateur interrompt le vol
    inactif = 0;
  });
  canvas.addEventListener('pointermove', e => {
    if (delegue && delegue.pointermove) return delegue.pointermove(e);
    pointer(e); inactif = 0;
    if (!glisse) return;
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
    glisse.x = e.clientX; glisse.y = e.clientY; glisse.bouge += Math.abs(dx) + Math.abs(dy);
    if (glisse.bouton === 0) { vYaw = -dx * 0.0052 * 60; vPitch = dy * 0.0052 * 60; yaw += -dx * 0.0052; pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch + dy * 0.0052)); }
    else if (!etat.focus) {                       // déplacer la vue (vue d'ensemble seulement)
      const k = Math.exp(logD) * 0.0016, droite = new THREE.Vector3(), haut = new THREE.Vector3();
      camera.matrixWorld.extractBasis(droite, haut, new THREE.Vector3());
      cible.addScaledVector(droite, -dx * k).addScaledVector(haut, dy * k);
    }
  });
  const fin = e => {
    if (delegue && delegue.pointerup) return delegue.pointerup(e);
    if (glisse && glisse.bouge < 5 && glisse.bouton === 0) { pointer(e); const c = viser();
      if (c && c.type === 'soleil' && surSoleil) { selectionner(null); try { surSoleil(); } catch (x) { console.error('[galaxie] clic sur Raylé :', x); } }   // un seul clic : conversation (le deuxième la coupe)
      else if (c && clicEntre && clicEntre.has(c.id)) allerA(c.id, { entrer: true });   // planète à module (la Terre) : un clic suffit, vol cinématique jusqu'à l'orbite
      else selectionner(c ? c.id : null); }
    glisse = null; try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
  };
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', e => { if (delegue && delegue.pointercancel) return delegue.pointercancel(e); glisse = null; });
  canvas.addEventListener('pointerleave', () => { souris.dedans = false; });
  canvas.addEventListener('dblclick', e => { if (delegue) return delegue.dblclick && delegue.dblclick(e); pointer(e); const c = viser(); if (c) allerA(c.id, { entrer: c.entrable !== false }); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); if (delegue) return delegue.wheel && delegue.wheel(e);
    inactif = 0;
    if (e.deltaY < 0 && clicEntre && !etat.sas) {               // molette vers l'avant : sur la Terre, la caméra vole vers elle ; déjà près d'elle, le zoom continue jusqu'à l'orbite
      pointer(e); const c = viser();
      if (c && clicEntre.has(c.id) && etat.focus !== c.id && !(vol && vol.vers.id === c.id)) { allerA(c.id, { entrer: true }); entreeVoulue = true; return; }
      if (etat.focus && clicEntre.has(etat.focus)) entreeVoulue = true;
    }
    interrompreVol();
    logCible = Math.max(Math.log(dMin(etat.focus)), Math.min(Math.log(dMax(etat.focus)), logCible + e.deltaY * 0.0011 * (e.deltaMode === 1 ? 33 : 1)));
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (!etat.actif || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
    if (e.key === 'Escape') { if (etat.sas) fermerSas(); else if (etat.focus || vol) retour(); else selectionner(null); }
    else if (e.key === 'h' || e.key === 'H') retour();
    else if ((e.key === 'o' || e.key === 'O') && surTouche.orbites) surTouche.orbites();
  });

  /* ── Mise à jour à chaque image ── */
  const tmp = new THREE.Vector3();
  function maj(dt) {
    inactif += dt;
    // Les zones de sélection grossissent avec la distance pour rester faciles à viser
    const dCam = Math.exp(logD);
    for (const p of pickers) { const c = p.userData.cible; const echelle = p.parent ? p.parent.getWorldScale(tmp).x : 1; p.scale.setScalar(Math.max(c.rayon * 1.25, dCam * 0.022) / echelle); }

    if (vol) {
      vol.t += dt / DUREE_VOL; const e = facile(Math.min(vol.t, 1));
      const fin = vol.vers.id ? pos(vol.vers.id) : vol.vers.pos;
      cible.lerpVectors(vol.de.cible, fin, e);
      logD = vol.de.logD + (vol.vers.logD - vol.de.logD) * e + Math.sin(Math.PI * e) * 0.18 * Math.abs(vol.vers.logD - vol.de.logD);
      logCible = logD;
      yaw = vol.de.yaw + angleCourt(vol.de.yaw, vol.vers.yaw) * e; pitch = vol.de.pitch + (vol.vers.pitch - vol.de.pitch) * e;
      if (vol.t >= 1) {
        etat.focus = vol.vers.id; const entrer = vol.entrer, id = vol.vers.id; vol = null;
        if (entrer && id) ouvrirSas(id);
        evt('arrive', { id: etat.focus });
      }
    } else {
      if (etat.focus) cible.lerp(pos(etat.focus), 1 - Math.exp(-dt * 14));   // suit la planète sur son orbite
      if (!glisse) {                                                           // inertie de la rotation
        yaw += vYaw * dt; pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch + vPitch * dt));
        const f = Math.exp(-dt * 5); vYaw *= f; vPitch *= f;
      }
      logD += (logCible - logD) * (1 - Math.exp(-dt * 9));
      if (entreeVoulue && !delegue && !etat.sas && etat.focus && clicEntre && clicEntre.has(etat.focus) && performance.now() > entreeBloquee && logD < Math.log(parId.get(etat.focus).rayon * ENTREE_RAYONS)) ouvrirSas(etat.focus, true);
      if (!etat.focus && !etat.sas && inactif > 14 && !etat.selection) yaw += dt * 0.02;   // dérive lente quand on ne touche à rien
    }
    const d = Math.exp(logD), cp = Math.cos(pitch);
    camera.position.set(cible.x + Math.cos(yaw) * cp * d, cible.y + Math.sin(pitch) * d, cible.z + Math.sin(yaw) * cp * d);
    camera.lookAt(cible);

    // Survol : le nom de l'astre seulement (aucun contour)
    let survol = null;
    if (souris.dedans && !glisse && !vol) survol = viser();
    if ((survol && survol.id) !== etat.survol) { etat.survol = survol ? survol.id : null; canvas.style.cursor = survol ? 'pointer' : 'default'; }
    const montrer = survol;
    if (montrer) {
      const p = pos(montrer.id).project(camera);
      const h = canvas.clientHeight, w = canvas.clientWidth;
      const rEcran = montrer.rayon / (Math.exp(logD) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (h / 2);
      ui.etiquette(montrer, (p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, Math.max(rEcran, 9), p.z < 1);
    } else ui.etiquette(null);
    const idFil = vol ? vol.vers.id : etat.focus;
    ui.fil(idFil ? parId.get(idFil) : null);
  }

  return {
    maj, allerA, retour, selectionner, fermerSas,
    /* Retour par zoom depuis l'orbite : la caméra de la galaxie se place là où regardait celle du globe (direction dans le repère du monde), à rayons × le rayon de la planète. */
    apresSortieZoom({ yaw: lacet, pitch: tangage, rayons }) {
      const id = etat.focus; if (!id) return;
      vol = null; vYaw = vPitch = 0; cible.copy(pos(id));
      yaw = lacet; pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, tangage)); logD = logCible = Math.log(Math.min(dMax(id), parId.get(id).rayon * rayons));
      entreeVoulue = false; entreeBloquee = performance.now() + 1600;
    },
    deleguer(h) { delegue = h || null; if (h) { glisse = null; ui.etiquette(null); } },
    /* Place la caméra tout de suite (sans vol) : tests, captures, reprise. angle = écart (rad) par rapport au côté éclairé ; id nul = vue d'ensemble. */
    placer(id, { angle = 0.45, pitch = 0.28, distance, point = null, yaw: lacet = null } = {}) {   // point = [x,y,z] : regarde ce point de l'espace (tests, captures)
      vol = null; fermerSas(); vYaw = vPitch = 0;
      if (!id) { cible.set(...(point || [0, 0, 0])); etat.focus = null; yaw = lacet ?? ACCUEIL.yaw; pitch = point ? pitch : ACCUEIL.pitch; logD = logCible = Math.log(distance || ACCUEIL.dist); return; }
      const c = parId.get(id), p = pos(id), dir = new THREE.Vector3(-p.x, 0, -p.z);
      cible.copy(p); etat.focus = id; selectionner(id);
      yaw = (dir.lengthSq() > 1e-6 ? Math.atan2(dir.z, dir.x) : yaw) + angle; this.pitchInit = pitch;
      logD = logCible = Math.log(distance || Math.max(c.rayon * 4.2, 3.5));
      this.pitchSet(pitch);
    },
    pitchSet(p) { pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p)); },
    activer(oui) { etat.actif = !!oui; if (!oui) { glisse = null; souris.dedans = false; ui.etiquette(null); } },
    etat: () => ({ focus: etat.focus, selection: etat.selection, survol: etat.survol, sas: etat.sas, vol: !!vol, distance: Math.exp(logD) }),
    cibles: () => cibles.map(c => c.id)
  };
}
