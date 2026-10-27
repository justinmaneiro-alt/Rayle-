import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ORDRE, qualiteMemorisee, surveillerFps } from './qualite.js';
import { CLE as CLE_REGLAGES, appareilEffectif, ecrire as ecrireReglages, lire as lireReglages, niveauDeDepart, normaliser, parametres } from './reglages.js';
import { MesureFps, SondeGpu, banc as lancerBancMesure } from './mesure.js';
import { CEINTURE, CIEL, VITESSES } from './systeme.js';
import { registre as obtenirRegistre } from './registre.js';
import { creerSoleil } from './soleil.js';
import { creerPlanetes } from './planetes.js';
import { creerCiel } from './ciel.js';
import { creerCeinture } from './asteroides.js';
import { creerNavigation } from './navigation.js';
import { creerInterface } from './interface.js';
import { creerPanneau } from './panneau.js';

/* ═════════════ GALAXIE : scène 3D ═════════════
   Décor, soleil Raylé, planètes, navigation, manifestes, réglages et mesures. `demarrer()` crée la scène une fois
   (appelée par galaxie/vue.js à la première ouverture) ; pause() / reprendre() arrêtent et relancent le dessin. */
const $ = id => document.getElementById(id);
const TEXTURE_MODE_JEU = 1024;   // largeur maximale des textures en mode jeu (libère la mémoire vidéo)

export async function demarrer() {
  const canvas = $('scene3d');
  const registre = await obtenirRegistre();
  const SOLEIL = registre.soleil, PLANETES = registre.planetes;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) { $('chargement-texte').textContent = 'WebGL indisponible : ouvrez cette page dans Chrome ou Edge récent.'; throw e; }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 1);
  renderer.info.autoReset = false;   // compteurs cumulés sur toute l'image (le rendu fait plusieurs passes)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
  scene.add(new THREE.AmbientLight(0x5066c0, 0.42));   // lueur bleutée : on distingue le relief côté nuit, sans effacer la différence jour/nuit   // presque rien : la face cachée d'une planète est vraiment sombre

  // ── Réglages (sur l'appareil). Migration de l'ancien réglage de qualité, s'il existe.
  let reglages = lireReglages();
  try { if (localStorage.getItem(CLE_REGLAGES) === null) { const ancien = qualiteMemorisee(); if (ancien !== 'auto') reglages = normaliser({ ...reglages, qualite: ancien }); } } catch (e) {}
  const appareil = () => appareilEffectif(reglages);
  let niveauNom = niveauDeDepart(reglages);
  let jeu = false, enBanc = false, focus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  let params = parametres(reglages, niveauNom, { jeu, appareil: appareil() });
  const ecouteurs = new Set();
  const notifier = () => ecouteurs.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  // ── Textures : chacune est enregistrée pour pouvoir être réduite en mode jeu
  const gestion = new THREE.LoadingManager();
  gestion.onProgress = (u, fait, total) => { $('chargement-barre').style.width = Math.round(fait / total * 100) + '%'; $('chargement-texte').textContent = 'Chargement des mondes… ' + fait + '/' + total; };
  const chargeur = new THREE.TextureLoader(gestion);
  const textures = [];
  const anisotropie = () => Math.min(renderer.capabilities.getMaxAnisotropy(), params.anisotropie);
  const chargerTexture = nom => {
    const t = chargeur.load(new URL(nom, document.baseURI).href);   // chemin relatif à la racine du site, comme dans les manifestes
    t.colorSpace = /clouds/.test(nom) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  };
  function memoireTextures() { let o = 0; for (const t of textures) o += t.image && t.image.width ? t.image.width * t.image.height * 4 * 1.33 : 0; return o; }
  function reduireTextures(max) {
    for (const t of textures) {
      const src = t.userData.original || t.image; if (!src || !src.width) continue;
      const k = Math.min(1, max / src.width); if (k >= 1) continue;
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      t.userData.original = src; t.dispose(); t.image = c; t.needsUpdate = true;
    }
  }
  function restaurerTextures() {
    for (const t of textures) if (t.userData.original) { t.dispose(); t.image = t.userData.original; t.needsUpdate = true; delete t.userData.original; }
  }

  const soleil = creerSoleil(SOLEIL.rayon); scene.add(soleil.groupe);
  soleil.amplitude(() => (window.Entite ? window.Entite.info().amp : null));   // la voix fait vibrer le soleil comme l'entité d'origine
  const systeme = creerPlanetes({ config: PLANETES, chargerTexture, anisotropie, vitesses: VITESSES }); scene.add(systeme.racine);
  const textureCiel = chargerTexture(CIEL.texture);
  const ciel = creerCiel({ textureCiel, anisotropie }); scene.add(ciel.groupe);
  const ceinture = creerCeinture(CEINTURE); scene.add(ceinture.objet);

  // ── Rendu : scène → (bloom) → sortie avec tonalité
  let composer = null, passeBloom = null;
  function construireComposer() {
    if (composer) composer.dispose();
    const cible = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: params.msaa });
    composer = new EffectComposer(renderer, cible);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.dpr));
    composer.setSize(canvas.clientWidth, canvas.clientHeight);
    composer.addPass(new RenderPass(scene, camera));
    passeBloom = null;
    if (params.bloom) { passeBloom = new UnrealBloomPass(new THREE.Vector2(canvas.clientWidth, canvas.clientHeight), params.bloomForce, 0.7, 1.05); composer.addPass(passeBloom); }
    composer.addPass(new OutputPass());
  }
  function redimensionner() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, params.dpr);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); ciel.echelle(dpr); soleil.echelle(dpr);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
  }
  /* Recalcule les paramètres de rendu (niveau + réglages avancés + mode jeu) et les applique. */
  function appliquer() {
    params = parametres(reglages, niveauNom, { jeu, appareil: appareil() });
    systeme.vitesse(reglages.vitesse / 100);
    soleil.nombre(params.nuee); soleil.riche(params.riche); ciel.nombreEtoiles(params.etoiles); ciel.riche(params.riche); ceinture.detail(params.asteroidesDetail); ceinture.nombre(params.asteroides);
    redimensionner(); construireComposer();
    $('qualite-actuelle').textContent = jeu ? 'mode jeu' : niveauNom;
    $('qualite').value = reglages.qualite;
    notifier();
  }

  const select = $('qualite');
  select.addEventListener('change', () => regler({ qualite: select.value }));
  const surveillance = surveillerFps({
    baisser() {
      if (reglages.qualite !== 'auto' || jeu || enBanc) return;
      const i = ORDRE.indexOf(niveauNom);
      if (i < ORDRE.length - 1) { niveauNom = ORDRE[i + 1]; appliquer(); }
    }
  });
  window.addEventListener('resize', redimensionner);
  window.addEventListener('blur', () => { focus = false; });
  window.addEventListener('focus', () => { focus = true; });

  function regler(partiel) {
    const avant = reglages.qualite;
    reglages = normaliser({ ...reglages, ...partiel, jeu: { ...reglages.jeu, ...(partiel.jeu || {}) } });
    ecrireReglages(reglages);
    if (reglages.qualite !== avant || partiel.appareil !== undefined) niveauNom = niveauDeDepart(reglages);
    if (jeu) { if (reglages.jeu.reduireTextures) reduireTextures(TEXTURE_MODE_JEU); else restaurerTextures(); }
    appliquer();
    return reglages;
  }
  function reinitialiser() {
    reglages = normaliser(null); ecrireReglages(reglages); niveauNom = niveauDeDepart(reglages);
    if (jeu) { restaurerTextures(); if (reglages.jeu.reduireTextures) reduireTextures(TEXTURE_MODE_JEU); }
    appliquer(); return reglages;
  }

  // ── Navigation : le soleil, chaque planète et chaque vaisseau sont des cibles sélectionnables
  const cibles = [{ ...SOLEIL, obj: soleil.groupe }];
  const pickers = [];
  const zone = (cible, parent) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    m.userData.cible = cible; parent.add(m); pickers.push(m);
  };
  zone(cibles[0], soleil.groupe);
  for (const o of systeme.planetes) {
    const c = { ...o.config, obj: o.porteur };
    cibles.push(c); zone(c, o.porteur);
    o.config.satellites.forEach((s, i) => {
      const lune = s.type === 'lune';
      const cs = { id: s.id, nom: s.nom, theme: s.theme || (lune ? 'Satellite naturel de ' + o.config.nom : 'Vaisseau en orbite de ' + o.config.nom), etat: 'active', obj: o.satellites[i].vaisseau, rayon: lune ? s.rayon : 0.9, type: lune ? 'lune' : 'vaisseau', parent: o.config.id, ordres: [] };
      cibles.push(cs); zone(cs, o.satellites[i].vaisseau);
    });
  }
  const ui = creerInterface();
  /* Planètes dont le module prend le relais à l'arrivée (manifeste modules.pc.entree) : un clic suffit pour y aller. Seule la Terre en a un pour l'instant. */
  const AVEC_MODULE = new Set(PLANETES.filter(p => (p.id === 'terre' || p.id === 'mars' || p.id === 'saturne' || p.id === 'neptune') && p.etat === 'active' && p.modules && p.modules.pc && p.modules.pc.entree).map(p => p.id));
  /* Module d'une planète : celui du PC, sauf la Terre sur tablette et téléphone (carte plate légère, manifeste modules.tablette / telephone) ; réglage rayle_terre_vue : 'auto' | 'leger' | '3d'. */
  const cheminModule = p => {
    if (p.id === 'terre' && p.modules) {
      let pref = 'auto'; try { pref = localStorage.getItem('rayle_terre_vue') || 'auto'; } catch (e) { /* stockage refusé : automatique */ }
      const a = appareil(), leger = pref === 'leger' || (pref !== '3d' && a !== 'pc'), m = leger && (p.modules[a === 'pc' ? 'tablette' : a] || p.modules.tablette);
      if (m && m.entree) return m.entree;
    }
    return p.modules.pc.entree;
  };
  const entreePlanete = (id, rapide = false) => {
    const p = PLANETES.find(x => x.id === id);
    if (!AVEC_MODULE.has(id) || !p) return false;
    import(new URL(cheminModule(p), document.baseURI).href)
      .then(m => m.entrer(g, { rapide }))
      .catch(e => { console.error('[galaxie] module de ' + id + ' :', e); nav.fermerSas(); ui.avertir([{ id, erreurs: ['le module de la planète n’a pas pu démarrer : ' + (e && e.message || e)] }]); });
    return true;
  };
  const nav = creerNavigation({ camera, canvas, cibles, pickers, ui, surEntree: entreePlanete, clicEntre: AVEC_MODULE, surTouche: { orbites: () => orbites(!systeme.orbitesVisibles()) }, surSoleil: () => window.RayleBus && window.RayleBus.demander('rayle:conversation') });
  function orbites(oui) { systeme.orbites(oui); notifier(); return systeme.orbitesVisibles(); }
  ui.brancher(nav);
  // La Terre s'arrête de tourner quand on vole vers elle, et reprend en douceur quand on repart
  window.addEventListener('galaxie:vol', e => { for (const id of AVEC_MODULE) systeme.figer(id, !!(e.detail && e.detail.vers === id)); });
  window.addEventListener('galaxie:sortie', () => { for (const id of AVEC_MODULE) systeme.figer(id, false); });
  window.addEventListener('galaxie:entree', e => { if (e.detail && AVEC_MODULE.has(e.detail.id)) systeme.figer(e.detail.id, true); });   // entrée par zoom : la rotation s'arrête à l'orbite
  if (registre.problemes.length) ui.avertir(registre.problemes);

  // ── Mesures : images par seconde, coût du rendu (processeur et, si possible, carte graphique)
  const mesure = new MesureFps();
  const sonde = new SondeGpu(renderer.getContext());
  let cpuMs = null;
  function limiteEffective() {
    if (enBanc) return 0;                                               // le test mesure ce que le matériel sait faire
    if (jeu && reglages.jeu.pauseHorsFocus && !focus) return 10;        // fenêtre derrière le jeu : quasi à l'arrêt
    return params.fpsMax;
  }
  function mesures(fenetreMs = 5000) {
    const s = mesure.stats(fenetreMs), i = renderer.info;
    return {
      ...s, cpuMs, gpuMs: sonde.moy, gpuMesurable: sonde.disponible,
      niveau: niveauNom, jeu, dpr: params.dpr, appareil: appareil(), limite: limiteEffective(),
      appels: i.render.calls, triangles: i.render.triangles, texturesGpu: i.memory.textures, geometries: i.memory.geometries,
      memoireTextures: memoireTextures(), etoiles: params.etoiles, asteroides: params.asteroides
    };
  }

  // ── Boucle (arrêtée quand la vue est fermée ; limitée par fpsMax, par le mode jeu et par la perte de focus)
  const horloge = new THREE.Clock();
  let t = 0, accFps = 0, actif = false, dernier = 0, surcharge = null;
  function image(maintenant) {
    if (!actif) return;
    requestAnimationFrame(image);
    const fps = limiteEffective();
    if (fps && maintenant - dernier < 1000 / fps - 1.5) return;
    dernier = maintenant;
    const dt = Math.min(horloge.getDelta(), 0.1); t += dt;
    const rp = composer.passes[0], sc = surcharge ? surcharge.scene : scene, cm = surcharge ? surcharge.camera : camera;
    if (rp.scene !== sc) { rp.scene = sc; rp.camera = cm; }
    if (surcharge) {                                         // une planète en orbite (la Terre) dessine sa propre scène : la galaxie est en pause
      if (params.animerDecor) ciel.maj(dt);
      surcharge.maj(dt, t);
    } else {
      if (params.animerDecor) { ceinture.maj(dt * reglages.vitesse / 100); ciel.maj(dt); }
      soleil.maj(t, dt); systeme.maj(t, dt);
      nav.maj(dt);
    }
    renderer.info.reset();
    const d0 = performance.now();
    sonde.debut(); composer.render(dt); sonde.fin();
    const c = performance.now() - d0; cpuMs = cpuMs === null ? c : cpuMs * 0.95 + c * 0.05;
    sonde.relever();
    mesure.image(maintenant);
    surveillance.image();
    accFps += dt;
    if (accFps > 0.5) { accFps = 0; $('fps').textContent = reglages.afficherFps ? Math.round(mesure.stats(1000).fps || surveillance.fps) + ' i/s' : ''; }
  }
  gestion.onLoad = () => { $('chargement').classList.add('fini'); if (jeu && reglages.jeu.reduireTextures) { reduireTextures(TEXTURE_MODE_JEU); notifier(); } };
  const reprendre = () => { if (actif) return; actif = true; nav.activer(true); redimensionner(); horloge.getDelta(); mesure.reset(); requestAnimationFrame(image); };
  const pause = () => { actif = false; nav.activer(false); };

  /* Mode jeu : tout est allégé au maximum (rendu, particules, textures en mémoire vidéo, cadence) ;
     le choix de l'utilisateur reste intact et revient à la sortie. */
  function modeJeu(oui) {
    oui = !!oui;
    if (oui === jeu) return;
    jeu = oui;
    select.disabled = oui;
    if (oui && reglages.jeu.reduireTextures) reduireTextures(TEXTURE_MODE_JEU); else if (!oui) restaurerTextures();
    $('g-jeu').hidden = !oui;
    appliquer();
  }

  /* Test de performance : essaie chaque niveau quelques secondes, restaure l'état d'origine, renvoie la recommandation. */
  let benchEnCours = null;
  async function banc(progres = () => {}) {
    if (jeu) return { ok: false, erreur: 'désactive d’abord le mode jeu : il bride volontairement la galaxie' };
    if (!actif) return { ok: false, erreur: 'la galaxie doit être ouverte pour être mesurée' };
    if (benchEnCours) return benchEnCours;
    const avant = niveauNom;
    enBanc = true;
    benchEnCours = (async () => {
      try {
        const r = await lancerBancMesure({
          mesure, progres,
          appliquer: async n => { niveauNom = n; appliquer(); },
          attendre: ms => new Promise(res => setTimeout(res, ms)),
          extra: () => ({ cpuMs, gpuMs: sonde.moy })
        });
        g.dernierBanc = { ...r, date: Date.now(), appareil: appareil(), gpuMesurable: sonde.disponible };
        return { ok: true, ...g.dernierBanc };
      } finally { enBanc = false; niveauNom = avant; appliquer(); benchEnCours = null; }
    })();
    return benchEnCours;
  }

  const g = {
    scene, camera, renderer, soleil, systeme, ceinture, nav, registre, pause, reprendre, modeJeu, orbites, ciel, canvas,
    composer: () => composer, params: () => params,
    /* Une planète peut dessiner à la place de la galaxie : { scene, camera, maj(dt, t) } ; null rend la main. */
    surcharger(obj) { surcharge = obj || null; },
    surchargee: () => !!surcharge,
    texturesTerre() { const o = systeme.parId('terre'); return o ? { jour: o.sphere.material.uniforms.uJour.value, nuit: o.sphere.material.uniforms.uNuit.value, nuages: o.nuages ? o.nuages.material.alphaMap : null } : null; },
    coordonneesVueTerre() {      // où regarde la caméra de la galaxie, dans le repère de la Terre (longitude/latitude du point face à la caméra) : le globe détaillé s'y place
      const o = systeme.parId('terre'); if (!o) return null;
      o.sphere.updateWorldMatrix(true, false);
      const inv = o.sphere.matrixWorld.clone().invert();
      const loc = camera.position.clone().applyMatrix4(inv), dir = loc.clone().normalize();
      const haut = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld).transformDirection(inv).normalize();
      const dist = camera.position.distanceTo(o.sphere.getWorldPosition(new THREE.Vector3()));
      return { dir: [dir.x, dir.y, dir.z], haut: [haut.x, haut.y, haut.z], distance: dist, rayon: o.config.rayon };
    },
    /* Texture d'une planète de la galaxie (Mars : sa carte, partagée avec la scène en orbite ; réduite avec les autres en mode jeu). */
    texturesPlanete(id) { const o = systeme.parId(id); const m = o && o.sphere.material; return m ? { map: m.map || (m.uniforms && m.uniforms.uJour && m.uniforms.uJour.value) || null } : null; },
    /* Sortie d'une planète en dézoomant : la caméra de la galaxie reprend la direction (dirLocal : dans le repère de la planète), à rayons × son rayon. */
    orienterVersPlanete(id, dirLocal, rayons) {
      const o = systeme.parId(id); if (!o) return;
      o.sphere.updateWorldMatrix(true, false);
      const d = new THREE.Vector3(...dirLocal).transformDirection(o.sphere.matrixWorld);
      nav.apresSortieZoom({ yaw: Math.atan2(d.z, d.x), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))), rayons });
    },
    /* Sortie de la Terre en dézoomant : la caméra de la galaxie reprend la direction du globe (dirLocal : direction dans le repère de la Terre). */
    orienterVersTerre(dirLocal, rayons) {
      const o = systeme.parId('terre'); if (!o) return;
      o.sphere.updateWorldMatrix(true, false);
      const d = new THREE.Vector3(...dirLocal).transformDirection(o.sphere.matrixWorld);
      nav.apresSortieZoom({ yaw: Math.atan2(d.z, d.x), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))), rayons });
    },
    enMarche: () => actif, jeu: () => jeu, enBanc: () => enBanc,
    info: () => ({ qualite: niveauNom, fps: surveillance.fps, planetes: PLANETES.map(p => p.id), ignores: registre.problemes.map(p => p.id) }),
    qualite: nom => regler({ qualite: nom }),
    reglages: () => JSON.parse(JSON.stringify(reglages)), regler, reinitialiser,
    mesures, courbe: () => mesure.courbe(120), banc, memoireTextures,
    surChangement: f => { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    dernierBanc: null
  };
  window.Galaxie = g;
  // La Terre vue de loin : discrètes balises d'actualité (données réelles du Worker, rien sans Worker) ; secondaire, la galaxie n'en dépend pas
  if (!window.__RAYLE_SANS_VAISSEAU__) import(new URL('planetes/saturne/pc/vaisseau-galaxie.js', document.baseURI).href).then(m => m.remplacer(g)).catch(e => console.warn('[galaxie] vaisseau détaillé indisponible, silhouette provisoire conservée :', e && e.message || e));
  if (AVEC_MODULE.has('terre')) import(new URL('planetes/terre/pc/balises-lointaines.js', document.baseURI).href).then(m => { g.balisesLointaines = m.demarrer(g); }).catch(e => console.warn('[galaxie] balises d’actualité indisponibles :', e && e.message || e));
  appliquer();
  try { creerPanneau(g); } catch (e) { console.error('[galaxie] panneau de réglages indisponible :', e); }   // secondaire : navigation et ordres vocaux n'en dépendent pas
  return g;
}
