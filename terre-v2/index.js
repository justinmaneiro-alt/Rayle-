/* ═════════════ TERRE 2.0 (PC uniquement, chargée à la demande) ═════════════
   Globe CesiumJS (Apache-2.0) par-dessus la galaxie : fond d'image sans clé (NASA GIBS + EOX Sentinel-2 cloudless), zoom continu jusqu'aux villes,
   relief et bâtiments 3D avec un jeton Cesium ion gratuit (sinon globe lisse, sans erreur), Google Photorealistic 3D seulement avec une clé.
   Couches (couches/*.js), modes de vision (vision.js), recherche de lieu (Nominatim), FPS et qualité automatique, HUD verre sombre.
   Repli : bouton « Terre classique » (planetes/terre/pc/index.js) et repli automatique si Cesium ne se charge pas.
   Même contrat que les autres modules de planète : entrer(G) / sortir(). API pour Raylé : window.Terre2 (phase 9 : ordres.js). */
import * as CFG from './config.js';
import { COUCHES } from './couches/index.js';
import { MODES, creerVision } from './vision.js';

let inst = null, enCours = null;
export function entrer(G, options = {}) {
  if (!enCours) enCours = (async () => { if (!inst) inst = construire(G); await inst.entrer(options); })().finally(() => { enCours = null; });
  return enCours;
}
export const sortir = () => inst && inst.sortir();
export const CLE_VUE = 'rayle_terre_vue';
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* chargement de Cesium depuis le CDN (une seule fois) */
let promesseCesium = null;
export function chargerCesium(base = CFG.CESIUM_BASE) {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (promesseCesium) return promesseCesium;
  window.CESIUM_BASE_URL = base;
  promesseCesium = new Promise((ok, ko) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'Widgets/widgets.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = base + 'Cesium.js'; s.async = true;
    const minuterie = setTimeout(() => ko(new Error('Cesium ne répond pas (CDN)')), 30000);
    s.onload = () => { clearTimeout(minuterie); window.Cesium ? ok(window.Cesium) : ko(new Error('Cesium absent')); };
    s.onerror = () => { clearTimeout(minuterie); promesseCesium = null; ko(new Error('Cesium introuvable (hors ligne ?)')); };
    document.head.appendChild(s);
  });
  return promesseCesium;
}

export const CREDITS = [
  'Globe : CesiumJS (Apache-2.0)',
  'Image du globe : NASA GIBS Blue Marble (domaine public)',
  'Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020), CC BY-NC-SA 4.0',
  'Relief et bâtiments 3D (avec jeton) : Cesium ion World Terrain, Cesium OSM Buildings © OpenStreetMap contributors',
  'Recherche : Nominatim © OpenStreetMap contributors (ODbL) ; secours Open-Meteo Geocoding (CC BY 4.0)',
  'Idées des couches : God’s Eye View (MIT), voir THIRD_PARTY_NOTICES.md'
];

function construire(G) {
  const racine = G.racine || document.getElementById('vueGalaxie') || document.body;
  if (!document.getElementById('terre2-css')) { const l = document.createElement('link'); l.id = 'terre2-css'; l.rel = 'stylesheet'; l.href = new URL('./terre2.css', import.meta.url).href; document.head.appendChild(l); }
  let actif = false, viewer = null, Cesium = null, reglages = CFG.lire(), vision = null, minuteries = [], couches = new Map(), tileset = null, google = null, labels = null, echelle = 1, fps = 0;
  const ui = document.createElement('div'); ui.id = 'terre2'; ui.hidden = true; ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', 'Terre 2.0');
  ui.innerHTML = `
    <div class="t2-globe"></div>
    <div class="t2-voile" data-voile><p>Terre 2.0 : chargement du globe…</p></div>
    <header class="t2-haut">
      <button type="button" class="t2-b" data-a="quitter" title="Retour à la galaxie (Échap)">‹ Galaxie</button>
      <form class="t2-recherche" role="search"><input type="search" autocomplete="off" placeholder="Chercher un lieu… (Entrée)" aria-label="Chercher un lieu"><button type="submit" class="t2-b" aria-label="Chercher">⌕</button></form>
      <div class="t2-resultats" hidden></div>
      <span class="t2-espace"></span>
      <span class="t2-fps" data-fps title="Images par seconde · qualité automatique">— i/s</span>
      <button type="button" class="t2-b" data-a="vision" title="Mode de vision (touche V)">Vision : <b data-vision>normal</b></button>
      <button type="button" class="t2-b" data-a="couches" aria-pressed="false" title="Couches (touche L)">Couches</button>
      <button type="button" class="t2-b" data-a="classique" title="Revenir à l’ancienne Terre">Terre classique</button>
    </header>
    <aside class="t2-panneau" data-panneau hidden aria-label="Couches"></aside>
    <div class="t2-info" role="status" aria-live="polite"></div>
    <div class="t2-legendes" data-legendes></div>
    <div class="t2-fiche" data-fiche hidden></div>
    <button type="button" class="t2-credits" data-a="credits">Crédits et licences</button>`;
  racine.appendChild(ui);
  const $ = s => ui.querySelector(s), info = $('.t2-info'), panneau = $('[data-panneau]'), resultats = $('.t2-resultats'), champ = $('.t2-recherche input'), fiche = $('[data-fiche]');
  let minuteurInfo = 0;
  const dire = (t, ms = 5000) => { info.textContent = t || ''; info.classList.toggle('vide', !t); clearTimeout(minuteurInfo); if (t && ms) minuteurInfo = setTimeout(() => dire(''), ms); };

  /* ── globe ── */
  async function creerGlobe() {
    Cesium = await chargerCesium();
    const j = CFG.jeton(reglages);
    Cesium.Ion.defaultAccessToken = j || '';
    viewer = new Cesium.Viewer($('.t2-globe'), {
      baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, animation: false, timeline: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false, creditContainer: document.createElement('div'), terrain: undefined,
      requestRenderMode: false, msaaSamples: 4
    });
    viewer.scene.globe.enableLighting = false; viewer.scene.globe.showGroundAtmosphere = true; viewer.scene.skyAtmosphere.show = true;
    viewer.scene.globe.maximumScreenSpaceError = 1.5; viewer.scene.highDynamicRange = false;
    // fond sans clé : GIBS (bas niveaux) puis EOX Sentinel-2 cloudless
    const L = viewer.imageryLayers;
    L.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', tilingScheme: new Cesium.WebMercatorTilingScheme(), maximumLevel: 8, credit: 'NASA GIBS' }));
    const eox = L.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg', tilingScheme: new Cesium.WebMercatorTilingScheme(), maximumLevel: 15, credit: 'Sentinel-2 cloudless by EOX' }));
    eox.minimumTerrainLevel = 0;
    if (j) await reliefEtBatiments(); else dire('Globe sans relief ni bâtiments 3D : jeton Cesium ion manquant (voir Couches).', 8000);
    if (reglages.google3d && reglages.cleGoogle) await villesGoogle();
    vision = creerVision(viewer, Cesium); vision.choisir(reglages.vision || 'normal'); $('[data-vision]').textContent = MODES[reglages.vision || 'normal'].nom;
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(2.35, 30, 2.2e7) });
    // FPS + qualité automatique
    let n = 0, t0 = performance.now();
    viewer.scene.postRender.addEventListener(() => {
      n++; const t = performance.now();
      if (t - t0 >= 1000) {
        fps = Math.round(n * 1000 / (t - t0)); n = 0; t0 = t; $('[data-fps]').textContent = fps + ' i/s' + (echelle < 1 ? ' · qualité ' + Math.round(echelle * 100) + ' %' : '');
        if (reglages.qualite === 'auto') { const e = CFG.ajusterQualite(echelle, fps); if (e !== echelle) { echelle = e; viewer.resolutionScale = e; if (tileset) tileset.maximumScreenSpaceError = e < 0.85 ? 24 : 16; } }
      }
    });
    // clic sur une entité d'une couche : petite fiche
    new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas).setInputAction(m => {
      const p = viewer.scene.pick(m.position), e = p && p.id; if (!e || !e.rayle) { fiche.hidden = true; return; }
      montrerFiche(e.rayle);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
  /* noms des lieux : CARTO exige désormais une clé (filigrane « API KEY REQUIRED ») → aucune source sans clé retenue, option désactivée (voir RAPPORT-NUIT.md) */
  function ajouterNoms() { }
  function retirerNoms() { if (labels && viewer) { viewer.imageryLayers.remove(labels, true); labels = null; } }
  async function reliefEtBatiments() {
    try {
      if (reglages.relief) viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain({ requestWaterMask: true, requestVertexNormals: true }));
      if (reglages.batiments && !tileset) { tileset = await Cesium.createOsmBuildingsAsync(); tileset.maximumScreenSpaceError = 16; viewer.scene.primitives.add(tileset); }
      return true;
    } catch (e) { dire('Relief et bâtiments 3D indisponibles : ' + (e && e.message || e) + ' (jeton refusé ? domaine non autorisé ?)', 10000); return false; }
  }
  function sansRelief() { if (!viewer) return; viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider(); if (tileset) { viewer.scene.primitives.remove(tileset); tileset = null; } }
  async function villesGoogle() {
    try { google = await Cesium.createGooglePhotorealistic3DTileset({ key: reglages.cleGoogle }); viewer.scene.primitives.add(google); viewer.scene.globe.show = false; return true; }
    catch (e) { google = null; dire('Villes photoréalistes Google indisponibles : ' + (e && e.message || e), 9000); return false; }
  }
  function sansGoogle() { if (google && viewer) { viewer.scene.primitives.remove(google); google = null; viewer.scene.globe.show = true; } }

  /* ── fiche d'une entité (avion, satellite, séisme, caméra…) ── */
  function montrerFiche(d) {
    fiche.innerHTML = `<b>${esc(d.titre)}</b>${(d.lignes || []).map(l => `<p>${esc(l)}</p>`).join('')}${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.titre)}" loading="lazy" referrerpolicy="no-referrer">` : ''}${d.source ? `<p class="t2-doux">Source : ${esc(d.source)}</p>` : ''}<button type="button" class="t2-b" data-a="fermer-fiche">Fermer</button>`;
    fiche.hidden = false;
  }

  /* ── couches ── */
  const ctxCouche = () => ({ Cesium, viewer, reglages, relais: CFG.RELAIS, dire, chargerScript });
  async function activerCouche(id, oui) {
    const def = COUCHES.find(c => c.id === id); if (!def || !viewer) return { ok: false, erreur: 'couche inconnue' };
    reglages.couches[id] = !!oui; CFG.ecrire(reglages);
    let c = couches.get(id);
    if (!oui) { if (c) { try { c.desactiver(); } catch (e) { /* */ } couches.delete(id); } rendrePanneau(); rendreLegendes(); return { ok: true }; }
    if (c) return { ok: true };
    const manque = def.cle && !reglages[def.cle];
    if (manque) { reglages.couches[id] = false; CFG.ecrire(reglages); rendrePanneau(); return { ok: false, cleManquante: true, erreur: def.procedure }; }
    c = def.creer(ctxCouche()); couches.set(id, c);
    try { await c.activer(); }
    catch (e) { couches.delete(id); try { c.desactiver(); } catch (x) { /* */ } reglages.couches[id] = false; CFG.ecrire(reglages); dire(`${def.nom} : source indisponible (${e && e.message || e}). Couche éteinte.`, 8000); rendrePanneau(); return { ok: false, erreur: String(e && e.message || e) }; }
    // rafraîchissement : si la source tombe, la couche s'éteint seule (2 échecs de suite), la Terre continue
    if (def.intervalle) {
      let echecs = 0;
      const m = setInterval(async () => { if (!couches.has(id)) return clearInterval(m); try { await c.rafraichir(); echecs = 0; } catch (e) { if (++echecs >= 2) { dire(`${def.nom} : la source ne répond plus, couche éteinte.`, 8000); activerCouche(id, false); } } }, def.intervalle);
      minuteries.push(m);
    }
    rendrePanneau(); rendreLegendes(); return { ok: true };
  }
  function rendreLegendes() {
    $('[data-legendes]').innerHTML = [...couches].map(([id, c]) => { const d = COUCHES.find(x => x.id === id); const e = c.etat ? c.etat() : {}; return `<div class="t2-leg"><b>${esc(d.nom)}</b> ${esc(d.legende || '')}${e.n != null ? ` · <span>${e.n}</span>` : ''}${e.heure ? ` · ${esc(e.heure)}` : ''}</div>`; }).join('');
  }
  function rendrePanneau() {
    const j = CFG.jeton(reglages);
    panneau.innerHTML = `<h3>Couches</h3>
      <ul class="t2-liste">${COUCHES.map(c => { const sansCle = c.cle && !reglages[c.cle]; return `<li><label><input type="checkbox" data-couche="${c.id}" ${couches.has(c.id) ? 'checked' : ''} ${sansCle ? 'disabled' : ''}> ${esc(c.nom)}</label> <small>${esc(sansCle ? 'clé manquante' : c.sourceCourte || '')}</small>${sansCle ? `<p class="t2-doux">${esc(c.procedure)}</p>` : ''}</li>`; }).join('')}</ul>
      <h3>Globe</h3>
      <ul class="t2-liste">
        <li><label><input type="checkbox" disabled> Noms des lieux</label> <small>aucune source sans clé (la recherche nomme les lieux)</small></li>
        <li><label><input type="checkbox" data-globe="relief" ${reglages.relief ? 'checked' : ''} ${j ? '' : 'disabled'}> Relief</label> <small>${j ? 'Cesium ion' : 'jeton manquant'}</small></li>
        <li><label><input type="checkbox" data-globe="batiments" ${reglages.batiments ? 'checked' : ''} ${j ? '' : 'disabled'}> Bâtiments 3D</label> <small>${j ? 'OSM Buildings' : 'jeton manquant'}</small></li>
        <li><label><input type="checkbox" data-globe="google3d" ${reglages.google3d ? 'checked' : ''} ${reglages.cleGoogle ? '' : 'disabled'}> Villes photoréalistes Google</label> <small>${reglages.cleGoogle ? 'payant au-delà du quota' : 'clé Google manquante'}</small></li>
        <li><label>Qualité <select data-qualite><option value="auto">automatique</option><option value="haute">haute</option></select></label></li>
      </ul>
      <details class="t2-cles"><summary>Jeton et clés (restent dans ce navigateur)</summary>
        <label>Jeton Cesium ion <input type="password" data-cle="jetonCesium" value="${esc(reglages.jetonCesium)}" autocomplete="off"></label>
        <label>Clé Google (3D photoréaliste) <input type="password" data-cle="cleGoogle" value="${esc(reglages.cleGoogle)}" autocomplete="off"></label>
        <label>Clé AISStream (bateaux) <input type="password" data-cle="cleAis" value="${esc(reglages.cleAis)}" autocomplete="off"></label>
        <label>MAP_KEY NASA FIRMS (incendies) <input type="password" data-cle="cleFirms" value="${esc(reglages.cleFirms)}" autocomplete="off"></label>
        <button type="button" class="t2-b" data-a="cles">Enregistrer et recharger le globe</button>
        <p class="t2-doux">${j ? 'Jeton Cesium présent.' : 'Sans jeton Cesium : globe sans relief ni bâtiments 3D.'} Procédure : RAPPORT-NUIT.md.</p>
      </details>`;
    const q = panneau.querySelector('[data-qualite]'); if (q) q.value = reglages.qualite === 'haute' ? 'haute' : 'auto';
  }
  panneau.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.couche) { const r = await activerCouche(t.dataset.couche, t.checked); if (r && r.cleManquante) dire(r.erreur, 9000); }
    else if (t.dataset.globe) {
      const k = t.dataset.globe; reglages[k] = t.checked; CFG.ecrire(reglages);
      if (k === 'noms') t.checked ? ajouterNoms() : retirerNoms();
      else if (k === 'relief' || k === 'batiments') { sansRelief(); if (reglages.relief || reglages.batiments) await reliefEtBatiments(); }
      else if (k === 'google3d') t.checked ? await villesGoogle() : sansGoogle();
    } else if (t.dataset.qualite) { reglages.qualite = t.value; CFG.ecrire(reglages); if (t.value === 'haute') { echelle = 1; viewer.resolutionScale = 1; } }
  });

  /* ── recherche de lieu (Nominatim, modérée : seulement à la validation, cache ; secours Open-Meteo) ── */
  const cacheRecherche = new Map(); let derniereRecherche = 0;
  async function chercher(q) {
    q = String(q || '').trim(); if (q.length < 2) return [];
    if (cacheRecherche.has(q.toLowerCase())) return cacheRecherche.get(q.toLowerCase());
    const attente = 1100 - (Date.now() - derniereRecherche); if (attente > 0) await new Promise(r => setTimeout(r, attente));
    derniereRecherche = Date.now();
    let liste = [];
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'jsonv2', limit: '5', 'accept-language': 'fr' }), { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      liste = (await r.json()).map(x => ({ nom: x.display_name, court: x.name || x.display_name.split(',')[0], lat: +x.lat, lon: +x.lon, bbox: x.boundingbox ? x.boundingbox.map(Number) : null, type: x.type, source: 'Nominatim' }));
    } catch (e) {
      try {
        const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: q, count: '5', language: 'fr' }), { signal: AbortSignal.timeout(10000) });
        liste = ((await r.json()).results || []).map(x => ({ nom: [x.name, x.admin1, x.country].filter(Boolean).join(', '), court: x.name, lat: x.latitude, lon: x.longitude, bbox: null, source: 'Open-Meteo' }));
      } catch (x) { liste = []; }
    }
    cacheRecherche.set(q.toLowerCase(), liste); return liste;
  }
  function aller(l, { hauteur = null, duree = 3 } = {}) {
    if (!viewer || !l) return false;
    if (l.bbox && !hauteur) { const [s, n, o, e] = l.bbox; viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(o, s, e, n), duration: duree }); }
    else viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(l.lon, l.lat, hauteur || 15000), duration: duree });
    dire('En route vers ' + (l.court || l.nom) + '.', 4000); return true;
  }
  /* zoom proche (« zoome sur la tour Eiffel ») : vue inclinée à ~600 m, cap au nord */
  function zoomerSur(l, distance = 700) {
    if (!viewer || !l) return false;
    const cible = Cesium.Cartesian3.fromDegrees(l.lon, l.lat, 0);
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(cible, 120), { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), distance), duration: 3 });
    dire('Zoom sur ' + (l.court || l.nom) + '.', 4000); return true;
  }
  $('.t2-recherche').addEventListener('submit', async e => {
    e.preventDefault(); const q = champ.value.trim(); if (q.length < 2) return;
    const liste = await chercher(q);
    if (!liste.length) { resultats.hidden = true; dire('Aucun lieu trouvé pour « ' + q + ' ».'); return; }
    if (liste.length === 1) { resultats.hidden = true; aller(liste[0]); return; }
    resultats.innerHTML = liste.map((l, i) => `<button type="button" data-res="${i}">${esc(l.nom)}</button>`).join(''); resultats.hidden = false; resultats._liste = liste;
  });
  resultats.addEventListener('click', e => { const b = e.target.closest('[data-res]'); if (!b) return; resultats.hidden = true; aller(resultats._liste[+b.dataset.res]); });

  /* ── boutons et clavier ── */
  ui.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'quitter') G.nav.fermerSas ? G.nav.fermerSas() : api.sortir();
    else if (a === 'couches') { panneau.hidden = !panneau.hidden; b.setAttribute('aria-pressed', String(!panneau.hidden)); if (!panneau.hidden) rendrePanneau(); }
    else if (a === 'vision') api.vision(MODES[vision ? vision.mode() : 'normal'].suivant);
    else if (a === 'classique') api.classique();
    else if (a === 'credits') ouvrirCredits();
    else if (a === 'fermer-fiche') fiche.hidden = true;
    else if (a === 'cles') { for (const i of panneau.querySelectorAll('[data-cle]')) reglages[i.dataset.cle] = i.value.trim(); CFG.ecrire(reglages); await api.recharger(); }
  });
  function ouvrirCredits() {
    const tout = CREDITS.concat(COUCHES.map(c => `${c.nom} : ${c.credit}`));
    if (window.Panneaux) window.Panneaux.ouvrir({ id: 'terre2-credits', type: 'holo-credits', titre: 'Crédits et licences (Terre 2.0)', icone: '◈', duree: 600000, corps: { html: '<ul class="t-credits">' + tout.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' } });
    else dire(tout.join(' · '), 20000);
  }
  const touches = e => {
    if (!actif || e.ctrlKey || e.metaKey || e.altKey) return;
    const saisie = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName); if (saisie) return;
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); api.vision(MODES[vision ? vision.mode() : 'normal'].suivant); }
    else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); $('[data-a="couches"]').click(); }
  };
  window.addEventListener('keydown', touches, true);
  window.addEventListener('galaxie:sortie', () => { if (actif) api.sortir(); });

  function chargerScript(url) {
    return new Promise((ok, ko) => { if ([...document.scripts].some(s => s.src === url)) return ok(); const s = document.createElement('script'); s.src = url; s.async = true; s.onload = ok; s.onerror = () => ko(new Error('script introuvable : ' + url)); document.head.appendChild(s); });
  }

  const api = {
    async entrer({ rapide = false } = {}) {
      if (actif) return; actif = true; reglages = CFG.lire(); window.Terre2 = api;
      G.nav.selectionner && G.nav.selectionner(null);
      G.nav.deleguer({ pointerdown() {}, pointermove() {}, pointerup() {}, pointercancel() {}, wheel() {}, dblclick() {} });
      ui.hidden = false; racine.classList.add('terre2-actif'); $('[data-voile]').hidden = false;
      try {
        if (!viewer) await creerGlobe();
        // la galaxie ne dessine presque plus rien pendant la Terre 2.0
        try { const THREE = await import('three'); G.surcharger({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 1, 0.1, 10), maj: () => {} }); } catch (e) { /* galaxie sans three : rien à faire */ }
      } catch (e) {
        console.warn('[terre-v2] repli sur la Terre classique :', e && e.message);
        actif = false; ui.hidden = true; racine.classList.remove('terre2-actif'); G.nav.deleguer(null);
        dire(''); window.dispatchEvent(new CustomEvent('terre2:repli', { detail: { raison: String(e && e.message || e) } }));
        const m = await import('../planetes/terre/pc/index.js'); return m.entrer(G, { rapide });
      }
      $('[data-voile]').hidden = true;
      for (const [id, oui] of Object.entries(reglages.couches)) if (oui && !couches.has(id)) activerCouche(id, true);
      window.dispatchEvent(new CustomEvent('terre:entree', { detail: { mode: 'v2' } }));
      dire('Terre 2.0 : glisser pour tourner, molette pour zoomer, clic droit pour incliner. V = vision, L = couches.', 7000);
    },
    async sortir() {
      if (!actif) return; actif = false; fiche.hidden = true; resultats.hidden = true; panneau.hidden = true;
      for (const [, c] of couches) try { c.desactiver(); } catch (e) { /* */ }
      couches.clear(); minuteries.forEach(clearInterval); minuteries = [];
      try { viewer && viewer.destroy(); } catch (e) { /* */ } viewer = null; tileset = null; google = null; labels = null; vision = null; echelle = 1;
      G.surcharger(null); G.nav.deleguer(null); racine.classList.remove('terre2-actif'); ui.hidden = true;
      window.dispatchEvent(new CustomEvent('terre:sortie', {}));
    },
    async recharger() { const garde = actif; if (viewer) { for (const [, c] of couches) try { c.desactiver(); } catch (e) { /* */ } couches.clear(); try { viewer.destroy(); } catch (e) { /* */ } viewer = null; tileset = null; google = null; labels = null; } if (garde) { await creerGlobe(); for (const [id, oui] of Object.entries(reglages.couches)) if (oui) await activerCouche(id, true); rendrePanneau(); } },
    /* « retour à la Terre classique » (la Terre par défaut) ; la Terre 2.0 est une option expérimentale (réglage rayle_terre_vue = 'v2' pour la garder) */
    async classique() { await api.sortir(); const m = await import('../planetes/terre/pc/index.js'); await m.entrer(G, { rapide: true }); return true; },
    vision(mode) { if (!vision || !MODES[mode]) return false; vision.choisir(mode); reglages.vision = mode; CFG.ecrire(reglages); $('[data-vision]').textContent = MODES[mode].nom; dire('Vision : ' + MODES[mode].nom + '.', 2500); return true; },
    activerCouche, couches: () => COUCHES.map(c => ({ id: c.id, nom: c.nom, active: couches.has(c.id), cle: c.cle || null, cleManquante: !!(c.cle && !reglages[c.cle]), procedure: c.procedure || null })),
    masquerCouches() { for (const id of [...couches.keys()]) activerCouche(id, false); return true; },
    chercher, aller, zoomerSur, montrerFiche,
    etat: () => ({ actif, globe: !!viewer, fps, echelle, jeton: !!CFG.jeton(reglages), relief: !!(viewer && !(viewer.scene.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)), batiments: !!tileset, google: !!google, vision: vision ? vision.mode() : null, couches: [...couches.keys()], hauteur: viewer ? viewer.camera.positionCartographic.height : null }),
    viewer: () => viewer, ui
  };
  return api;
}
