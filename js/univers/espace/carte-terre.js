// La Terre sert de CARTE : le globe 3D descend, en continu, vers une carte détaillée (MapLibre GL JS, tuiles OpenFreeMap).
// creerCarteTerre(P) → { maj, globeInutile, preparer, montrerLieu, montrerRoute, montrerAppareils, fixerZoom, effacer, cacher, reinit, etat, detruire, … }
//   P = { THREE, noyau, ctx, hud, camera, ctrl, G, vol, latLonVec, suivreTerre, distCam }  (fournis par theme-espace.js)
//
// Bascule globe ↔ carte (aucun saut) : la caméra du globe et la carte regardent la même région à la même échelle (zoomPourDistance), si bien que
//   • au-dessus de D_OUVRE le globe est seul ; entre D_OUVRE et D_PLEIN la carte apparaît en fondu enchaîné par-dessus le globe ;
//   • sous D_PLEIN la carte seule : elle reçoit les gestes (glisser, pincer, molette) et le globe cesse d'être dessiné ;
//   • en dézoomant dans la carte, le fondu repart dans l'autre sens et le globe reprend la main.
// MapLibre est chargé à la demande (js/vendor/maplibre/, UMD) : rien n'est téléchargé tant qu'on reste loin du sol.
import { construireStyle, zoomPourDistance, distancePourZoom, opaciteCarte, D_OUVRE, D_PLEIN, ZOOM_MIN_CARTE, ZOOM_MAX_CARTE, distanceKm, zoomDepuisNiveau, zoomPourBoite, zoomPourLieu, nomDuZoom, cerclePoly } from './carte-style.js?v=2026.10.15.8';

const BASE_LIB = new URL('../../vendor/maplibre/', import.meta.url).href;
const URL_REGIONS = new URL('../../../assets/geo/france-regions.json', import.meta.url).href;
const URL_DEPARTEMENTS = new URL('../../../assets/geo/france-departements.json', import.meta.url).href;
export const Z_SORTIE = 6.35;                           // sous ce zoom, le globe reprend les gestes
const D_PRECHARGE = 1.32;                        // à cette distance du centre de la Terre, on charge MapLibre et le style en avance
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let libP = null;
export function chargerMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (libP) return libP;
  libP = new Promise((ok, ko) => {
    if (!document.querySelector('link[data-maplibre]')) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = BASE_LIB + 'maplibre-gl.css'; css.dataset.maplibre = '1'; document.head.appendChild(css); }
    const sc = document.createElement('script'); sc.src = BASE_LIB + 'maplibre-gl.js';
    sc.onload = () => window.maplibregl ? ok(window.maplibregl) : ko(new Error('MapLibre absent après chargement'));
    sc.onerror = () => { libP = null; ko(new Error('MapLibre introuvable')); };
    document.head.appendChild(sc);
  });
  return libP;
}
function webglPossible() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

export function creerCarteTerre(P) {
  const { THREE, noyau, ctx, hud, camera, ctrl, G } = P;
  const vue = ctx.canvas.parentNode;
  const boite = document.createElement('div'); boite.className = 'univ-terre-carte'; boite.setAttribute('aria-label', 'Carte détaillée de la Terre');
  ctx.canvas.after(boite);

  let map = null, ml = null, chargement = null, indisponible = null, mode = 'globe', opacite = 0, padPrec = 0, detruit = false;
  const marques = new Map();                     // id → { m (données), marker (MapLibre), etiquette (globe) }
  let route = null, routeGlobe = null, precisions = [];
  const tmp = new THREE.Vector3();
  const hauteur = () => Math.max(300, (noyau.dims().h) || innerHeight);
  const largeur = () => Math.max(300, (noyau.dims().w) || innerWidth);

  /* ───── création différée de la carte ───── */
  function nomsPays() {
    const o = {}; for (const p of (window.RaylePays || [])) o[p[1]] = p[3]; return o;
  }
  function preparer() {
    if (map) return Promise.resolve(map);
    if (chargement) return chargement;
    if (indisponible) return Promise.reject(new Error(indisponible));
    chargement = (async () => {
      if (!webglPossible()) throw new Error('WebGL indisponible : la carte détaillée ne peut pas s’afficher');
      ml = await chargerMapLibre();
      if (detruit) throw new Error('fermé');
      const style = construireStyle({ urlRegions: URL_REGIONS, urlDepartements: URL_DEPARTEMENTS, nomsPays: nomsPays() });
      const m = new ml.Map({ container: boite, style, center: [2.4, 46.6], zoom: 6, minZoom: ZOOM_MIN_CARTE - .4, maxZoom: ZOOM_MAX_CARTE + .4, attributionControl: false, renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0, fadeDuration: 120, bearingSnap: 0 });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
      await new Promise((ok, ko) => {
        const t = setTimeout(() => ko(new Error('le style de la carte n’a pas répondu (réseau ?)')), 25000);
        m.once('style.load', () => { clearTimeout(t); ok(); });
        let nbErr = 0; m.on('error', e => { if (nbErr++ < 6) console.warn('[carte]', e && e.error && e.error.message || e); });
      });
      if (detruit) { try { m.remove(); } catch (e) { /* rien */ } throw new Error('fermé'); }
      m.addSource('rayle-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'rayle-route-lueur', type: 'line', source: 'rayle-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4de3ff', 'line-width': 12, 'line-blur': 8, 'line-opacity': .55 } });
      m.addLayer({ id: 'rayle-route-trace', type: 'line', source: 'rayle-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c8f6ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 4, 17, 7] } });
      m.addSource('rayle-precision', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'rayle-precision-fond', type: 'fill', source: 'rayle-precision', paint: { 'fill-color': '#18bee6', 'fill-opacity': .14 } });
      m.addLayer({ id: 'rayle-precision-bord', type: 'line', source: 'rayle-precision', paint: { 'line-color': '#18bee6', 'line-width': 1.4, 'line-opacity': .8 } });
      m.on('zoom', majEtiquettesZoom);
      map = m; chargement = null;
      for (const x of marques.values()) poserMarqueurCarte(x);
      return m;
    })();
    chargement.catch(e => { indisponible = String(e && e.message || e); chargement = null; });
    return chargement;
  }
  const disponible = () => !indisponible;

  /* ───── marqueurs (légers) : une pastille sur la carte ET une étiquette sur le globe ───── */
  function elementMarque(m) {
    const d = document.createElement('div'); d.className = 'terre-marque ' + (m.type || 'lieu') + (m.moi ? ' moi' : '');
    const p = document.createElement('i'); p.className = 'tm-p'; if (m.icone) p.textContent = m.icone; if (m.couleur) p.style.setProperty('--tm', m.couleur);
    const n = document.createElement('b'); n.className = 'tm-n'; n.textContent = m.nom || '';
    d.append(p, n); return d;
  }
  function poserMarqueurCarte(x) {
    if (!map || !ml) return;
    if (x.marker) x.marker.remove();
    x.marker = new ml.Marker({ element: elementMarque(x.m), anchor: 'center' }).setLngLat([x.m.lon, x.m.lat]).addTo(map);
  }
  function majEtiquettesZoom() { if (!map) return; boite.classList.toggle('tm-noms', map.getZoom() >= (marques.size > 4 ? 10.5 : 7)); }
  function marquer(m) {
    const prec = marques.get(m.id); if (prec) retirerMarque(m.id);
    const x = { m, marker: null };
    marques.set(m.id, x);
    poserMarqueurCarte(x);
    ctx.etiquettes.ajouter({
      id: 'terre:' + m.id, classe: 'terre-pin', html: '<span class="univ-pastille" style="' + (m.couleur ? 'background:' + esc(m.couleur) + ';' : '') + '"><i>' + esc(m.icone || '📍') + '</i>' + esc(m.nom || '') + '</span>',
      position: () => P.latLonVec(m.lat, m.lon, 1.012).applyMatrix4(G.terre.matrixWorld), visible: (w, cam) => G.visible(w, cam), alpha: () => 1 - opacite,
    });
    x.etiquette = 'terre:' + m.id;
    majEtiquettesZoom();
    return x;
  }
  function retirerMarque(id) { const x = marques.get(id); if (!x) return; if (x.marker) x.marker.remove(); ctx.etiquettes.retirer('terre:' + id); marques.delete(id); }
  function effacerMarques(type) { for (const [id, x] of [...marques]) if (!type || x.m.type === type) retirerMarque(id); }

  /* ───── tracé d'itinéraire : sur la carte (ligne lumineuse) et sur le globe (ligne 3D) ───── */
  function tracerRoute(coords) {            // coords : [[lat, lon], …]
    route = coords;
    const donnees = { type: 'FeatureCollection', features: coords && coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(c => [c[1], c[0]]) } }] : [] };
    const poser = () => { const s = map && map.getSource('rayle-route'); if (s) s.setData(donnees); };
    if (map) poser(); else if (coords) preparer().then(poser).catch(() => {});
    if (routeGlobe) { G.terre.remove(routeGlobe); routeGlobe.geometry.dispose(); routeGlobe.material.dispose(); routeGlobe = null; }
    if (coords && coords.length > 1) {
      const pas = Math.max(1, Math.floor(coords.length / 500)), pts = [];
      for (let i = 0; i < coords.length; i += pas) pts.push(P.latLonVec(coords[i][0], coords[i][1], 1.004));
      pts.push(P.latLonVec(coords[coords.length - 1][0], coords[coords.length - 1][1], 1.004));
      routeGlobe = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x66e6ff, transparent: true, opacity: .95, depthWrite: false }));
      routeGlobe.renderOrder = 8; G.terre.add(routeGlobe);
    }
  }
  function cerclesPrecision(liste) {         // [{lat, lon, prec}] → disques de précision (utiles quand on zoome)
    precisions = liste || [];
    const donnees = { type: 'FeatureCollection', features: precisions.filter(p => p.prec > 0).map(p => cerclePoly(p.lat, p.lon, Math.max(8, p.prec))) };
    const poser = () => { const s = map && map.getSource('rayle-precision'); if (s) s.setData(donnees); };
    if (map) poser(); else if (precisions.length) preparer().then(poser).catch(() => {});
  }
  function effacer() {
    effacerMarques(); tracerRoute(null); cerclesPrecision([]); hud.carte(null);
  }

  /* ───── affichage : fondu, entrée et sortie du mode carte ───── */
  function appliquerOpacite(op) {
    opacite = op;
    boite.style.opacity = op >= .999 ? '1' : op.toFixed(3);
    boite.style.visibility = op > .001 ? 'visible' : 'hidden';
    boite.style.pointerEvents = mode === 'carte' ? 'auto' : 'none';
    vue.classList.toggle('terre-carte-pleine', op >= .999);
  }
  function entrerCarte() {
    if (mode === 'carte') return; mode = 'carte'; kPret = 1; ctrl.c.enabled = false; ctrl.c.autoRotate = false; appliquerOpacite(opacite);
    try { RayleBus.emit('terre:carte', { actif: true }); } catch (e) { /* bus absent */ }
  }
  function sortirCarte() {
    if (mode === 'globe') return; mode = 'globe'; if (!noyau.enCinematique()) ctrl.c.enabled = true;
    if (map) { const c = map.getCenter(), d = clamp(distancePourZoom(map.getZoom(), c.lat, hauteur()), 1.02, 160); camera.position.copy(P.latLonVec(c.lat, c.lng, d)); camera.lookAt(0, 0, 0); ctrl.c.target.set(0, 0, 0); ctrl.c.update(); }
    appliquerOpacite(opacite);
    try { RayleBus.emit('terre:carte', { actif: false }); } catch (e) { /* bus absent */ }
  }
  const centreGlobe = () => G.latLon(camera.getWorldPosition(tmp));
  // à appeler à chaque image quand la vue Terre est active
  // La carte n'apparaît (en fondu doux) que lorsque ses tuiles sont arrivées ; au bout de 4 s on l'affiche quand même (réseau lent : fond et repères seuls)
  let kPret = 0, attenteDepuis = 0;
  function pretVisuel(dt) {
    const ok = map.areTilesLoaded() && map.isStyleLoaded(), t = performance.now();
    if (ok) attenteDepuis = 0; else if (!attenteDepuis) attenteDepuis = t;
    const cible = ok || (attenteDepuis && t - attenteDepuis > 4000) ? 1 : 0;
    kPret += (cible - kPret) * Math.min(1, dt * 4); if (Math.abs(cible - kPret) < .01) kPret = cible;
    return kPret;
  }
  function maj(dt = .016) {
    if (!map) { if (!indisponible && !chargement && P.distCam() < D_PRECHARGE) preparer().catch(() => {}); return; }
    const H = hauteur(), d = P.distCam(), cin = noyau.enCinematique();
    // place laissée à l'entité Raylé (mode « côté ») : la carte décale son centre comme la caméra du globe
    const dec = noyau.decalage ? Math.round(noyau.decalage()) : 0;
    if (dec !== padPrec) { padPrec = dec; map.setPadding({ left: Math.max(0, 2 * dec), right: Math.max(0, -2 * dec), top: 0, bottom: 0 }); }
    if (mode === 'globe' || cin) {
      // le globe pilote la carte (elle est cachée ou en fondu)
      if (d < D_OUVRE + .03) { const p = centreGlobe(); map.jumpTo({ center: [p.lon, p.lat], zoom: clamp(zoomPourDistance(d, p.lat, H), ZOOM_MIN_CARTE - .4, ZOOM_MAX_CARTE), bearing: 0, pitch: 0 }); }
      if (d >= D_OUVRE) { kPret = 0; attenteDepuis = 0; }
      appliquerOpacite(opaciteCarte(d) * (d < D_OUVRE ? pretVisuel(dt) : 0));
      if (opacite >= .999 && mode === 'globe' && !cin) entrerCarte();        // pas pendant un vol : volerVers() passe la main à l'arrivée
    } else {
      // la carte pilote ; le globe la suit tant que le fondu n'est pas terminé (pour qu'un dézoom retombe sur la même image)
      const c = map.getCenter(), z = map.getZoom(), dEq = distancePourZoom(z, c.lat, H), op = opaciteCarte(dEq);
      if (op < .999) { camera.position.copy(P.latLonVec(c.lat, c.lng, clamp(dEq, 1.02, 160))); camera.lookAt(0, 0, 0); }
      appliquerOpacite(op);
      if (z < Z_SORTIE) sortirCarte();
    }
    if (mode === 'carte' && !cin) ctrl.c.enabled = false;
  }
  const globeInutile = () => mode === 'carte' && opacite >= .999;

  /* ───── mouvements de caméra ───── */
  const attendreFin = (ms = 8000) => new Promise(ok => { if (!map) return ok(); let fini = false; const f = () => { if (fini) return; fini = true; clearTimeout(t); ok(); }; const t = setTimeout(f, ms); map.once('moveend', f); });
  function posePourLieu(c) {                   // zoom et centre d'arrivée pour un lieu {lat, lon, box?, type?, zoom?}
    const H = hauteur(), W = largeur();
    let z = zoomPourLieu(c);
    if (c.box && c.box.length === 4) z = Math.min(zoomPourBoite(c.box, W, H, 70), z + 1.8);
    if (c.zoomCarte != null) z = c.zoomCarte;
    return { lat: c.lat, lon: c.lon, zoom: clamp(z, 3, ZOOM_MAX_CARTE - 1) };
  }
  // Vol complet : si on est loin, la caméra descend du globe jusqu'à la carte ; si on est déjà dans la carte et proche, simple glissement.
  async function volerVers(pose, { rapide = false } = {}) {
    const H = hauteur();
    if (pose.zoom < ZOOM_MIN_CARTE + .25 || indisponible) {                         // un pays entier ou plus : le globe suffit
      await volGlobe(pose.lat, pose.lon, clamp(distancePourZoom(pose.zoom, pose.lat, H), 1.18, 4.5)); return 'globe';
    }
    const prete = preparer();
    prete.catch(() => {});
    // pendant le vol du globe, la carte (cachée) charge déjà les tuiles de la destination : elle sera prête quand le fondu commencera
    prete.then(m => { if (mode === 'globe' && opacite <= 0.001) m.jumpTo({ center: [pose.lon, pose.lat], zoom: 7.2, bearing: 0, pitch: 0 }); }).catch(() => {});
    if (mode === 'carte' && map) {
      const c = map.getCenter();
      if (distanceKm({ lat: c.lat, lon: c.lng }, pose) < 450) { await glisserCarte(pose, rapide); return 'carte'; }
      // loin : on remonte vers le globe (la caméra suit), puis on redescend sur le lieu
      const dFin = distancePourZoom(Z_SORTIE + .4, c.lat, H);
      camera.position.copy(P.latLonVec(c.lat, c.lng, clamp(dFin, 1.02, 160))); camera.lookAt(0, 0, 0); ctrl.c.update();
      sortirCarte();
    }
    await volGlobe(pose.lat, pose.lon, clamp(distancePourZoom(7.2, pose.lat, H), 1.02, 1.1));
    try { await prete; } catch (e) { return 'globe'; }
    if (!map) return 'globe';
    map.jumpTo({ center: [pose.lon, pose.lat], zoom: clamp(zoomPourDistance(P.distCam(), pose.lat, H), ZOOM_MIN_CARTE, ZOOM_MAX_CARTE), bearing: 0, pitch: 0 });
    await new Promise(ok => { if (map.areTilesLoaded()) return ok(); const t = setTimeout(ok, 5000); map.once('idle', () => { clearTimeout(t); ok(); }); });   // les tuiles de la destination avant de passer la main
    if (!map) return 'globe';
    appliquerOpacite(1); entrerCarte();
    await glisserCarte(pose, rapide);
    return 'carte';
  }
  function volGlobe(lat, lon, dist) { return noyau.cinematique(api => P.vol(api, { lat, lon, dist })); }
  async function glisserCarte(pose, rapide) {
    if (!map) return;
    const loin = distanceKm({ lat: map.getCenter().lat, lon: map.getCenter().lng }, pose) > 25 || Math.abs(map.getZoom() - pose.zoom) > 2.5;
    const fin = attendreFin(rapide ? 3000 : 9000);
    if (loin && !rapide) map.flyTo({ center: [pose.lon, pose.lat], zoom: pose.zoom, speed: 1.15, curve: 1.4, essential: true });
    else map.easeTo({ center: [pose.lon, pose.lat], zoom: pose.zoom, duration: rapide ? 600 : 1800, essential: true });
    await fin;
  }

  /* ───── commandes de haut niveau ───── */
  async function montrerLieu(lieu, { pin = true, rapide = false } = {}) {
    effacerMarques('lieu'); effacerMarques('depart'); effacerMarques('arrivee'); tracerRoute(null);
    if (pin) marquer({ id: 'lieu', type: 'lieu', lat: lieu.lat, lon: lieu.lon, nom: lieu.court || lieu.nom, icone: '📍' });
    const pose = posePourLieu(lieu);
    const ou = await volerVers(pose, { rapide });
    return { ou, zoom: map ? map.getZoom() : null, pose };
  }
  async function montrerRoute({ a, b, route: r }) {
    effacerMarques('lieu'); effacerMarques('appareil');
    marquer({ id: 'depart', type: 'depart', lat: a.lat, lon: a.lon, nom: a.court || a.nom || 'Départ', icone: '🟢', couleur: '#17d98a' });
    marquer({ id: 'arrivee', type: 'arrivee', lat: b.lat, lon: b.lon, nom: b.court || b.nom || 'Arrivée', icone: '🏁', couleur: '#ff007f' });
    tracerRoute(r.coords);
    const lats = r.coords.map(c => c[0]), lons = r.coords.map(c => c[1]);
    const box = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
    const centre = { lat: (box[0] + box[1]) / 2, lon: (box[2] + box[3]) / 2 };
    const z = zoomPourBoite(box, largeur(), hauteur(), 90) - .15;
    // la route est dessinée AVANT le vol : en redescendant, on la voit se poser sur le globe puis sur la carte
    const ou = await volerVers({ lat: centre.lat, lon: centre.lon, zoom: clamp(z, 2.5, 15) }, {});
    return { ou, zoom: map ? map.getZoom() : null, box };
  }
  const iconeAppareil = g => g === 'tablette' ? '📱' : g === 'telephone' ? '📞' : '🖥';
  // pose (ou met à jour) les marqueurs et les disques de précision, sans bouger la caméra
  function poserAppareils(reperes) {
    effacerMarques('appareil'); cerclesPrecision((reperes || []).map(r => ({ lat: r.lat, lon: r.lon, prec: r.prec || 0 })));
    for (const r of reperes || []) marquer({ id: 'app-' + r.nom, type: 'appareil', lat: r.lat, lon: r.lon, nom: r.nom, icone: iconeAppareil(r.genre), moi: !!r.moi, couleur: '#18bee6' });
  }
  // tous les appareils sont marqués ; la caméra cadre ceux de `cible` (par défaut tous), avec la précision de la position quand il n'y en a qu'un
  async function montrerAppareils(reperes, { cible } = {}) {
    effacerMarques('lieu'); effacerMarques('depart'); effacerMarques('arrivee'); tracerRoute(null); hud.carte(null);        // un autre sujet : on repart d'une carte propre
    poserAppareils(reperes);
    const vises = cible && cible.length ? cible : reperes;
    if (!vises.length) return { ou: null };
    let pose;
    if (vises.length === 1) {
      const p = vises[0].prec || 0; pose = { lat: vises[0].lat, lon: vises[0].lon, zoom: p && p < 60 ? 16.5 : p < 400 ? 15 : p < 3000 ? 13 : 11 };
    } else {
      const lats = vises.map(r => r.lat), lons = vises.map(r => r.lon), box = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
      pose = { lat: (box[0] + box[1]) / 2, lon: (box[2] + box[3]) / 2, zoom: clamp(zoomPourBoite(box, largeur(), hauteur(), 110) - .3, 2.5, 15.5) };
    }
    const ou = await volerVers(pose, {});
    return { ou, zoom: map ? map.getZoom() : null };
  }
  // niveau : nombre (0–19) ou nom (monde, pays, région, département, ville, quartier, rue, bâtiment)
  async function fixerZoom(niveau) {
    const z = zoomDepuisNiveau(niveau); if (z == null) return { ok: false };
    const H = hauteur();
    if (mode === 'carte' && map && z >= Z_SORTIE + .3) { const f = attendreFin(3000); map.easeTo({ zoom: z, duration: 900, essential: true }); await f; return { ok: true, zoom: map.getZoom() }; }
    const p = mode === 'carte' && map ? { lat: map.getCenter().lat, lon: map.getCenter().lng } : centreGlobe();
    await volerVers({ lat: p.lat, lon: p.lon, zoom: z });
    return { ok: true, zoom: map && mode === 'carte' ? map.getZoom() : z };
  }
  // zoom relatif (« zoome », « recule ») : facteur < 1 = on s'approche
  async function zoomRelatif(facteur) {
    if (mode === 'carte' && map) {
      const z = clamp(map.getZoom() + Math.log2(1 / (facteur || .6)), ZOOM_MIN_CARTE - .2, ZOOM_MAX_CARTE);
      const f = attendreFin(3000); map.easeTo({ zoom: z, duration: 800, essential: true }); await f; return true;
    }
    return false;
  }

  /* ───── état, nettoyage ───── */
  function etat() {
    const base = { prete: !!map, indisponible, actif: mode === 'carte', opacite: +opacite.toFixed(2), marqueurs: [...marques.keys()], route: !!route, appareils: [...marques.values()].filter(x => x.m.type === 'appareil').length };
    if (map && mode === 'carte') { const c = map.getCenter(); return Object.assign(base, { zoom: +map.getZoom().toFixed(2), centre: { lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4) }, niveau: nomDuZoom(map.getZoom()) }); }
    return base;
  }
  function cacher() { mode = 'globe'; appliquerOpacite(0); effacerMarques(); ctrl.c.enabled = true; }
  function reinit() { mode = 'globe'; appliquerOpacite(0); }
  function detruire() {
    detruit = true; effacerMarques(); tracerRoute(null);
    if (map) { try { map.remove(); } catch (e) { /* déjà retirée */ } map = null; }
    boite.remove(); vue.classList.remove('terre-carte-pleine');
  }
  appliquerOpacite(0);
  return {
    maj, globeInutile, preparer, disponible, montrerLieu, montrerRoute, montrerAppareils, poserAppareils, fixerZoom, zoomRelatif, marquer, retirerMarque, effacer, effacerMarques, tracerRoute, cacher, reinit, etat, detruire,
    map: () => map, mode: () => mode, opacite: () => opacite, boite, entrerCarte, sortirCarte,
  };
}
