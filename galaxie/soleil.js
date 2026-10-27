import * as THREE from 'three';

/* ═════════════ LE SOLEIL = RAYLÉ : l'entité du skin neurone, portée en 3D ═════════════
   Le skin d'origine (skins/neurone/entite.js) dessine des milliers de points sur fond noir ; ici ils deviennent des neurones (points à cœur
   blanc) reliés par de très fins fils, en plusieurs couches concentriques, au contour irrégulier presque polygonal, avec un cœur dense bleu-cyan
   et une densité qui diminue vers l'extérieur (génération : galaxie/reseau.js).
   Repris tels quels de entite.js : les ÉTATS (veille, écoute, réflexion, parole, alerte) et leurs réglages (agitation, rotation, rayon, éclat,
   vitesse), la respiration, la lente rotation, la réaction à l'amplitude (voix) et le lissage des transitions.
   Au repos et en écoute, l'entité est cyan et blanche ; réflexion, parole et alerte gardent les couleurs de entite.js.
   Impulsions : des étincelles courent le long des fils, et par moments l'entité s'illumine presque entièrement en blanc (une onde part du cœur),
   puis revient au cyan.
   Halo et cœur lumineux sont volontairement discrets : le soleil éclaire les planètes sans les masquer. */
import { creerEtat } from '../skins/neurone/etats-reseau.js';
import { VERT_NOEUDS, FRAG_NOEUDS, VERT_LIENS, FRAG_LIENS } from '../skins/neurone/shaders-reseau.js';
import { preparerDonnees } from '../skins/neurone/donnees-reseau.js';
import { NB_NEURONES_MAX, genererReseau, aretesPour } from './reseau.js';
export { NB_NEURONES_MAX };

/* Les états, les shaders, les tableaux de sommets et la machine d'état sont dans skins/neurone/ : l'accueil les utilise aussi (même rendu). */

function textureHalo() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d').createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(255,255,255,.35)'); g.addColorStop(.55, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  const x = c.getContext('2d'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function creerSoleil(rayon) {
  const groupe = new THREE.Group(); groupe.name = 'soleil';
  const reseau = genererReseau();
  const machine = creerEtat(rayon);
  const m = machine.v;
  const u = {
    uTemps: { value: 0 }, uDerive: { value: 0.02 }, uEchelle: { value: rayon }, uTour: { value: 0.1 }, uAmp: { value: 0 }, uFlash: { value: 0 }, uFront: { value: 0 },
    uLum: { value: 0.5 }, uVitesse: { value: 1 }, uImpulsions: { value: 1 }, uPx: { value: 1 }, uTaille: { value: 3.6 },
    uVieIndiv: { value: 1 }, uVieDerive: { value: 1 }, uVieFils: { value: 1 }, uVieNais: { value: 1 }, uPointeur: { value: new THREE.Vector3() },
    uCasA: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uCasB: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uCasCol: { value: new THREE.Color() },
    uSerre: { value: 0 }, uTourb: { value: 0 }, uSecousse: { value: 0 }, uForme: { value: 1 }, uEtincelles: { value: 1 }, uPulse: { value: 1 },
    uIncl: { value: new THREE.Vector2() }, uOndes: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }, uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }
  };

  // Neurones : points lumineux
  const D = preparerDonnees(reseau);
  const gN = new THREE.BufferGeometry();
  gN.setAttribute('position', new THREE.BufferAttribute(reseau.pos, 3));
  gN.setAttribute('aPoids', new THREE.BufferAttribute(reseau.poids, 1));
  gN.setAttribute('aGraine', new THREE.BufferAttribute(D.graine, 1));
  gN.setAttribute('aHub', new THREE.BufferAttribute(reseau.hub, 1));
  const noeuds = new THREE.Points(gN, new THREE.ShaderMaterial({ vertexShader: VERT_NOEUDS, fragmentShader: FRAG_NOEUDS, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  noeuds.frustumCulled = false;

  // Connexions : un segment par lien, avec les attributs qui pilotent les impulsions
  const E = D.E;
  const gL = new THREE.BufferGeometry();
  gL.setAttribute('position', new THREE.BufferAttribute(D.pL, 3));
  for (const [nom, tab] of [['aU', D.aU], ['aPh', D.aPh], ['aV', D.aV], ['aW', D.aW], ['aGr', D.aGr], ['aRad', D.aRad]]) gL.setAttribute(nom, new THREE.BufferAttribute(tab, 1));
  const liens = new THREE.LineSegments(gL, new THREE.ShaderMaterial({ vertexShader: VERT_LIENS, fragmentShader: FRAG_LIENS, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  liens.frustumCulled = false;

  // Halo très doux (cyan) et cœur lumineux : discrets, ils ne masquent pas les planètes
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureHalo(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(rayon * 3.2);
  const coeur = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureHalo(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  coeur.scale.setScalar(rayon * 1.15);

  const lumiere = new THREE.PointLight(0xe6f8ff, 5, 0, 0);   // sans atténuation : toutes les planètes sont éclairées, d'un cyan très clair
  groupe.add(liens, noeuds, coeur, halo, lumiere);

  const tmpC = new THREE.Color();
  gN.setDrawRange(0, reseau.N); gL.setDrawRange(0, E * 2);

  const api = {
    groupe, lumiere, reseau,
    etat: n => machine.etat(n),
    get nomEtat() { return machine.nomEtat; },
    /* Amplitude réelle de la voix (0..1) : fonction fournie par la page (celle de entite.js), sinon amplitude simulée. */
    amplitude: fn => machine.amplitude(fn),
    /* Un flash blanc tout de suite (tests, événements forts). */
    flash: (force = 1) => machine.flash(force),
    /* Vie : vague, regard (curseur), naissance, intensité de la vie spontanée (voir etats-reseau.js). */
    onde: (force, vitesse) => machine.onde(force, vitesse), cascade: (...a) => machine.cascade(...a), regard: (x, y) => machine.regard(x, y), naitre: d => machine.naitre(d), vie: n => machine.vie(n), machine,
    /* Couleurs courantes (sRGB, comme dans le skin) et intensités du halo et du cœur : pour les tests et le diagnostic. */
    couleurs: () => ({ c: m.c.slice(), d: m.d.slice() }),
    eclat: () => ({ amp: m.amp, halo: halo.material.opacity, coeur: coeur.material.opacity, lum: m.lum / (1 + m.amp * 0.3), flash: u.uFlash.value, lumiere: lumiere.color.toArray() }),
    /* Nombre de neurones affichés (qualité) : un sous-ensemble réparti partout, avec les connexions qui les relient. */
    nombre(k) { k = Math.max(100, Math.min(reseau.N, k)); gN.setDrawRange(0, k); gL.setDrawRange(0, aretesPour(reseau, k) * 2); },
    taille(px) { u.uTaille.value = px; },
    echelle(px) { u.uPx.value = px; },
    /* Décor riche (impulsions animées et flashs) : coupé en qualité basse et en mode jeu. */
    riche(oui) { machine.riche(oui); api.flashs = !!oui; u.uImpulsions.value = m.impulsions; if (!oui) u.uFlash.value = 0; },
    flashs: true,
    maj(t, dt) {
      machine.maj(t, dt);
      u.uTemps.value = m.temps; u.uLum.value = m.lum; u.uVitesse.value = m.vitesse; u.uAmp.value = m.amp;
      u.uDerive.value = m.derive; u.uTour.value = m.tour; u.uEchelle.value = m.echelle; u.uFlash.value = m.flash; u.uFront.value = m.front;
      u.uSerre.value = m.serre; u.uTourb.value = m.tourb; u.uSecousse.value = m.secousse; u.uForme.value = m.forme; u.uEtincelles.value = m.etincelles; u.uPulse.value = m.pulse;
      u.uIncl.value.set(m.incl[0], m.incl[1]); m.ondes.forEach((o, i) => u.uOndes.value[i].set(o[0], o[1], o[2])); u.uFlashCol.value.setRGB(...m.flashCol, THREE.SRGBColorSpace);
      u.uVieIndiv.value = m.vieIndiv; u.uVieDerive.value = m.vieDerive; u.uVieFils.value = m.vieFils; u.uVieNais.value = m.vieNais; u.uPointeur.value.set(m.pointeur[0], m.pointeur[1], m.pointeur[2]);
      for (let i = 0; i < 4; i++) { u.uCasA.value[i].set(m.casA[i][0], m.casA[i][1], m.casA[i][2], m.casA[i][3]); u.uCasB.value[i].set(m.casB[i][0], m.casB[i][1], m.casB[i][2], m.casB[i][3]); }
      u.uCasCol.value.setRGB(...m.cascCol, THREE.SRGBColorSpace);
      u.uC1.value.setRGB(...m.c, THREE.SRGBColorSpace); u.uC2.value.setRGB(...m.d, THREE.SRGBColorSpace);   // les couleurs sont données telles qu'affichées (sRGB)
      halo.material.color.copy(tmpC.setRGB(...m.c, THREE.SRGBColorSpace)); halo.material.opacity = m.haloOpacite;
      coeur.material.color.copy(tmpC.setRGB(...m.c, THREE.SRGBColorSpace)); coeur.material.opacity = m.coeurOpacite;   // cœur bleu-cyan lumineux
      lumiere.color.setRGB(...m.lumiere);   // même teinte que l'entité, très claire (cyan clair au repos)
    }
  };
  api.maj(0, 1);
  return api;
}
