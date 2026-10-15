// Style de la CARTE DE LA TERRE (MapLibre) et calculs purs globe ↔ carte. Aucun accès réseau, aucun DOM : testé par tests/terre-carte-test.mjs.
// Tuiles : OpenFreeMap (vectorielles, schéma OpenMapTiles, gratuites, sans clé, faites pour un usage applicatif) — données © OpenStreetMap.
// Détail PROGRESSIF : chaque couche a un minzoom/maxzoom (voir NIVEAUX) ; les étiquettes naissent et disparaissent avec le zoom, jamais toutes ensemble.
// France : régions et départements viennent des contours officiels (IGN Admin Express via data.gouv.fr, assets/geo/) ; les communes, villages et lieux-dits des tuiles.

export const R_TERRE = 6371008.8;                 // rayon moyen de la Terre (m)
export const FOV_CAMERA = 42;                     // champ vertical de la caméra du globe (degrés), voir theme-espace.js
export const TUILES = 'https://tiles.openfreemap.org/planet';            // TileJSON des tuiles vectorielles
export const GLYPHES = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · limites France : IGN / data.gouv.fr';

/* ───── géométrie globe ↔ carte ───── */
const RAD = Math.PI / 180;
const MPP0 = 40075016.686 / 512;                  // mètres par pixel au zoom 0 (tuiles de 512 px, équateur)
// Zoom de la carte qui montre la même région que la caméra du globe à la distance d (en rayons terrestres, depuis le CENTRE de la Terre), au-dessus de la latitude lat.
export function zoomPourDistance(d, lat, hauteurPx, fov = FOV_CAMERA) {
  const alt = Math.max(1e-6, d - 1) * R_TERRE;                           // altitude au nadir (m)
  const emprise = 2 * alt * Math.tan(fov * RAD / 2);                      // hauteur du terrain vu (m)
  const mpp = emprise / Math.max(1, hauteurPx);
  return Math.log2(MPP0 * Math.max(.05, Math.cos(lat * RAD)) / mpp);
}
export function distancePourZoom(z, lat, hauteurPx, fov = FOV_CAMERA) {
  const mpp = MPP0 * Math.max(.05, Math.cos(lat * RAD)) / Math.pow(2, z);
  const emprise = mpp * Math.max(1, hauteurPx);
  return 1 + emprise / (2 * Math.tan(fov * RAD / 2)) / R_TERRE;
}
// Bande de bascule (en distance au centre de la Terre) : au-dessus de D_OUVRE le globe seul ; entre les deux fondu enchaîné ; sous D_PLEIN la carte seule.
export const D_OUVRE = 1.16, D_PLEIN = 1.08;
export const ZOOM_MIN_CARTE = 5.3;                // la carte ne descend pas plus bas : au-delà c'est le globe qui reprend
export const ZOOM_MAX_CARTE = 19;
const lisse = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const opaciteCarte = d => lisse((D_OUVRE - d) / (D_OUVRE - D_PLEIN));    // 0 = globe seul, 1 = carte seule

export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD, x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742.0176 * Math.asin(Math.min(1, Math.sqrt(x)));
}

const merc = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));
// Zoom MapLibre qui fait tenir la boîte [sud, nord, ouest, est] dans une fenêtre w×h (marge en pixels autour)
export function zoomPourBoite(box, w, h, marge = 60) {
  const [s, n, o, e] = box; let dLon = e - o; if (dLon < 0) dLon += 360;
  const dx = Math.max(1e-9, dLon / 360), dy = Math.max(1e-9, Math.abs(merc(n) - merc(s)) / (2 * Math.PI));
  const zx = Math.log2(Math.max(10, w - 2 * marge) / (512 * dx)), zy = Math.log2(Math.max(10, h - 2 * marge) / (512 * dy));
  return Math.min(zx, zy);
}
// Cercle de rayon `rayonM` mètres autour d'un point, en polygone GeoJSON (précision d'un appareil)
export function cerclePoly(lat, lon, rayonM, n = 48) {
  const pts = [], dLat = rayonM / 111320, dLon = rayonM / (111320 * Math.max(.01, Math.cos(lat * RAD)));
  for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

/* ───── niveaux de zoom nommés (set_zoom) ───── */
export const ZOOMS_NOMMES = { monde: 2, planete: 2, continent: 3, pays: 5, region: 7, departement: 8.4, ville: 11.5, commune: 11.5, quartier: 14, rue: 16, rues: 16, immeuble: 18, batiment: 18, maximum: 19 };
const sansAccent = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’-]/g, ' ').replace(/\s+/g, ' ').trim();
// 12 · "12" · "ville" · "niveau rue" · "niveau 14" → nombre entre 0 et 19, ou null
export function zoomDepuisNiveau(niveau) {
  if (typeof niveau === 'number' && isFinite(niveau)) return Math.max(0, Math.min(ZOOM_MAX_CARTE, niveau));
  const t = sansAccent(niveau).replace(/^(?:niveau|zoom|echelle)\s+/, '').replace(/^(?:de |du |d |la |le |l |les )/, '');
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Math.max(0, Math.min(ZOOM_MAX_CARTE, parseFloat(t.replace(',', '.'))));
  const k = ZOOMS_NOMMES[t] != null ? t : t.replace(/s$/, '');            // « les villes », « rues »
  return ZOOMS_NOMMES[k] != null ? ZOOMS_NOMMES[k] : null;
}
export function nomDuZoom(z) {
  if (z < 3.5) return 'le monde'; if (z < 6) return 'les pays'; if (z < 8) return 'les régions'; if (z < 10) return 'les départements';
  if (z < 13) return 'les villes'; if (z < 15) return 'les quartiers'; if (z < 17.5) return 'les rues'; return 'les bâtiments';
}
// Zoom adapté à un lieu : boîte englobante si on l'a, sinon type du lieu (pays, ville, pic, adresse…)
export function zoomPourLieu(lieu) {
  if (!lieu) return 12;
  const t = sansAccent(lieu.type || lieu.categorie || '');
  if (lieu.zoom != null) return lieu.zoom;
  if (/country|pays/.test(t)) return 5; if (/state|region|province/.test(t)) return 7; if (/county|departement/.test(t)) return 8.6;
  if (/city|ville|municipality|commune|town/.test(t)) return 11.5; if (/village|hamlet|suburb|quarter|neighbo/.test(t)) return 13.5;
  if (/peak|mountain|volcano|mont|massif|glacier/.test(t)) return 12; if (/street|road|rue|way|locality/.test(t)) return 16; if (/house|housenumber|building|address|numero/.test(t)) return 17.5;
  if (/monument|tourism|attraction|historic|castle|museum|memorial|ruins/.test(t)) return 15.5;
  return 13;
}

/* ───── niveaux de détail (documentation vivante : sert aussi aux tests) ───── */
export const NIVEAUX = [
  { id: 'monde', zoom: [0, 4], contenu: ['continents et océans', 'pays (frontières et noms)'] },
  { id: 'regions', zoom: [4, 8], contenu: ['régions de France (contours officiels)', 'grandes villes', 'autoroutes', 'États / provinces'] },
  { id: 'departements', zoom: [6.5, 11], contenu: ['départements de France (contours officiels et numéros)', 'villes moyennes', 'routes nationales', 'grands fleuves'] },
  { id: 'villes', zoom: [8, 14], contenu: ['villes, villages, noms de communes', 'routes principales puis secondaires', 'rivières', 'forêts et parcs', 'limites communales (z12+)', 'sommets'] },
  { id: 'rues', zoom: [13, 19], contenu: ['rues et chemins', 'noms de rues', 'lieux-dits et hameaux', 'bâtiments', 'numéros'] },
];

/* ───── style MapLibre ───── */
const P = {   // palette cohérente avec le thème Univers (sombre, lumineux, HUD)
  fond: '#040914', terre: '#0a1424', eau: '#05213f', eauBord: '#0d4f86', bois: '#0b2a2c', herbe: '#0b1c26', ferme: '#0c1a26', ville: '#0f1f36', parc: '#0d2d30', glace: '#16283f',
  routeAutoroute: '#ffb347', routePrincipale: '#7fe3ff', routeSecondaire: '#4fb6e6', routeLocale: '#3b7fa6', routePetite: '#2b5a78', rail: '#46607a', bati: '#18314f', batiHaut: '#244a74',
  texte: '#e6f7ff', texteDoux: '#9fc6dd', halo: '#02060f', pays: '#ff4fa3', limite: '#38d6ff', region: '#5aa8ff', departement: '#35c9a8', commune: '#2f6b86', accent: '#ff007f',
};
const POLICE = { reg: ['Noto Sans Regular'], gras: ['Noto Sans Bold'], ital: ['Noto Sans Italic'] };
const NOM = ['coalesce', ['get', 'name'], ['get', 'name_int']];
const NOM_INT = ['coalesce', ['get', 'name_en'], ['get', 'name_int'], ['get', 'name']];         // hors France : alphabet latin lisible
const e = (...paires) => ['interpolate', ['linear'], ['zoom'], ...paires.flat()];

function etiquette(id, src, couche, o) {
  return {
    id, type: 'symbol', source: src, 'source-layer': couche, minzoom: o.min, maxzoom: o.max, filter: o.filtre,
    layout: Object.assign({ 'text-field': o.champ || NOM, 'text-font': o.police || POLICE.reg, 'text-size': o.taille || 12, 'text-max-width': o.largeur || 8, 'text-padding': o.padding != null ? o.padding : 3, 'text-letter-spacing': o.espace || 0, 'symbol-sort-key': o.tri }, o.majuscules ? { 'text-transform': 'uppercase' } : {}, o.layout || {}),
    paint: { 'text-color': o.couleur || P.texte, 'text-halo-color': P.halo, 'text-halo-width': o.halo || 1.6, 'text-halo-blur': .6 },
  };
}

// opts : { urlRegions, urlDepartements } (fichiers GeoJSON) ; { tuiles } pour les tests
export function construireStyle(opts = {}) {
  const urlTuiles = opts.tuiles || TUILES;
  const sources = { omt: { type: 'vector', url: urlTuiles, attribution: ATTRIBUTION } };
  if (opts.urlRegions) sources['fr-regions'] = { type: 'geojson', data: opts.urlRegions };
  if (opts.urlDepartements) sources['fr-departements'] = { type: 'geojson', data: opts.urlDepartements };
  const L = [];
  const add = (...l) => L.push(...l);

  // la terre ferme est le fond ; la mer est dessinée par-dessus (couche « eau »)
  add({ id: 'fond', type: 'background', paint: { 'background-color': P.terre } });
  add({ id: 'sol-bois', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], minzoom: 5, paint: { 'fill-color': P.bois, 'fill-opacity': e([5, .25], [9, .8]) } });
  add({ id: 'sol-herbe', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'grass'], minzoom: 8, paint: { 'fill-color': P.herbe, 'fill-opacity': e([8, .2], [12, .7]) } });
  add({ id: 'sol-champs', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'farmland'], minzoom: 10, paint: { 'fill-color': P.ferme, 'fill-opacity': .6 } });
  add({ id: 'sol-glace', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['ice', 'rock', 'sand']]], minzoom: 3, paint: { 'fill-color': P.glace, 'fill-opacity': .5 } });
  add({ id: 'sol-urbain', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['residential', 'commercial', 'retail', 'industrial', 'school', 'university', 'hospital']]], minzoom: 9, paint: { 'fill-color': P.ville, 'fill-opacity': e([9, .3], [13, .9]) } });
  add({ id: 'parcs', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 8, paint: { 'fill-color': P.parc, 'fill-opacity': e([8, .15], [12, .5]) } });
  add({ id: 'eau', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': P.eau, 'fill-antialias': true } });
  add({ id: 'eau-bord', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 6, paint: { 'line-color': P.eauBord, 'line-opacity': .5, 'line-width': e([6, .3], [14, 1.2]) } });
  add({ id: 'rivieres', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: ['==', ['get', 'class'], 'river'], minzoom: 7, paint: { 'line-color': P.eauBord, 'line-opacity': .9, 'line-width': e([7, .6], [12, 2], [16, 5]) } });
  add({ id: 'ruisseaux', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: ['in', ['get', 'class'], ['literal', ['stream', 'canal', 'drain', 'ditch']]], minzoom: 12, paint: { 'line-color': P.eauBord, 'line-opacity': .7, 'line-width': e([12, .5], [16, 2]) } });
  add({ id: 'bati', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13.5, paint: { 'fill-color': e([14, P.bati], [17, P.batiHaut]), 'fill-opacity': e([13.5, 0], [15, .85]) } });

  // routes : principales d'abord, puis secondaires, locales, chemins (progressif). Chaque route a une lueur (ligne floue) sous la ligne.
  const ROUTES = [
    ['autoroute', ['in', ['get', 'class'], ['literal', ['motorway']]], 4, P.routeAutoroute, [[4, .5], [8, 1.4], [12, 3], [16, 8]]],
    ['nationale', ['in', ['get', 'class'], ['literal', ['trunk']]], 5.5, P.routePrincipale, [[5.5, .4], [8, 1.2], [12, 2.6], [16, 7]]],
    ['primaire', ['==', ['get', 'class'], 'primary'], 7.5, P.routePrincipale, [[7.5, .4], [10, 1], [14, 3.4], [18, 12]]],
    ['secondaire', ['==', ['get', 'class'], 'secondary'], 9.5, P.routeSecondaire, [[9.5, .4], [12, 1.2], [15, 3.4], [18, 11]]],
    ['tertiaire', ['==', ['get', 'class'], 'tertiary'], 10.5, P.routeSecondaire, [[10.5, .3], [13, 1], [16, 3.4], [18, 10]]],
    ['locale', ['in', ['get', 'class'], ['literal', ['minor', 'service']]], 12.5, P.routeLocale, [[12.5, .3], [15, 1.2], [18, 6]]],
    ['chemin', ['in', ['get', 'class'], ['literal', ['path', 'track']]], 14, P.routePetite, [[14, .4], [17, 1.5]]],
  ];
  for (const [id, filtre, min, couleur, largeurs] of ROUTES) {
    add({ id: 'route-lueur-' + id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: min, filter: filtre, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': couleur, 'line-opacity': .18, 'line-blur': 3, 'line-width': e(...largeurs.map(([z, w]) => [z, w * 3])) } });
    add({ id: 'route-' + id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: min, filter: filtre, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': couleur, 'line-opacity': id === 'chemin' ? .7 : .95, 'line-width': e(...largeurs), 'line-dasharray': id === 'chemin' ? [2, 1.5] : undefined } });
  }
  add({ id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], minzoom: 8, paint: { 'line-color': P.rail, 'line-opacity': .8, 'line-width': e([8, .4], [14, 1.2]), 'line-dasharray': [3, 2] } });
  add({ id: 'piste', type: 'fill', source: 'omt', 'source-layer': 'aeroway', minzoom: 10, paint: { 'fill-color': P.routeSecondaire, 'fill-opacity': .35 } });

  // limites : pays (toujours), États/provinces hors France ; France = contours officiels (régions puis départements), communes depuis les tuiles
  add({ id: 'limite-pays', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': P.pays, 'line-opacity': .85, 'line-width': e([0, .5], [5, 1.2], [10, 2]) } });
  add({ id: 'limite-etat', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 4.5, maxzoom: 11, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'adm0_l'], 'France'], ['!=', ['get', 'adm0_r'], 'France']], paint: { 'line-color': P.region, 'line-opacity': .55, 'line-width': .8, 'line-dasharray': [4, 3] } });
  add({ id: 'limite-commune', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 11.2, filter: ['in', ['get', 'admin_level'], ['literal', [8, 9, 10]]], paint: { 'line-color': P.commune, 'line-opacity': e([11.2, 0], [12.5, .75]), 'line-width': e([11, .5], [16, 1.6]), 'line-dasharray': [3, 2] } });
  if (sources['fr-regions']) {
    add({ id: 'fr-regions-lueur', type: 'line', source: 'fr-regions', minzoom: 3.8, maxzoom: 9.5, paint: { 'line-color': P.region, 'line-opacity': e([3.8, 0], [5, .22], [9.5, 0]), 'line-blur': 3, 'line-width': e([4, 4], [8, 9]) } });
    add({ id: 'fr-regions', type: 'line', source: 'fr-regions', minzoom: 3.8, maxzoom: 10, paint: { 'line-color': P.region, 'line-opacity': e([3.8, 0], [5, .9], [9, .9], [10, 0]), 'line-width': e([4, .8], [8, 1.6]) } });
  }
  if (sources['fr-departements']) {
    add({ id: 'fr-departements', type: 'line', source: 'fr-departements', minzoom: 6.2, maxzoom: 12.5, paint: { 'line-color': P.departement, 'line-opacity': e([6.2, 0], [7.4, .75], [11, .75], [12.5, 0]), 'line-width': e([6.2, .5], [10, 1.4]), 'line-dasharray': [5, 2.5] } });
  }

  // étiquettes
  // noms de pays en français : table iso_a2 → nom fournie par la page (RaylePays) ; à défaut, le nom international des tuiles
  const nomsPays = opts.nomsPays && Object.keys(opts.nomsPays).length ? ['match', ['get', 'iso_a2'], ...Object.entries(opts.nomsPays).flat(), NOM_INT] : NOM_INT;
  add(etiquette('nom-pays', 'omt', 'place', { min: 1, max: 7, filtre: ['==', ['get', 'class'], 'country'], champ: nomsPays, majuscules: true, police: POLICE.gras, taille: e([1, 10], [4, 14], [7, 17]), espace: .12, tri: ['get', 'rank'], couleur: '#ffd9ec' }));
  add(etiquette('nom-etat', 'omt', 'place', { min: 4.5, max: 9, filtre: ['in', ['get', 'class'], ['literal', ['state', 'province']]], champ: NOM_INT, police: POLICE.ital, taille: e([4.5, 10], [8, 13]), majuscules: true, espace: .1, couleur: P.texteDoux }));
  if (sources['fr-regions']) add({ id: 'fr-regions-noms', type: 'symbol', source: 'fr-regions', minzoom: 5.2, maxzoom: 8.6, layout: { 'text-field': ['get', 'nom'], 'text-font': POLICE.ital, 'text-size': e([5.2, 11], [8, 15]), 'text-transform': 'uppercase', 'text-letter-spacing': .14, 'text-max-width': 9 }, paint: { 'text-color': '#b9d6ff', 'text-halo-color': P.halo, 'text-halo-width': 1.6, 'text-opacity': e([5.2, 0], [6, .95], [8, .95], [8.6, 0]) } });
  if (sources['fr-departements']) add({ id: 'fr-departements-noms', type: 'symbol', source: 'fr-departements', minzoom: 7.4, maxzoom: 11, layout: { 'text-field': ['concat', ['get', 'code'], ' · ', ['get', 'nom']], 'text-font': POLICE.reg, 'text-size': e([7.4, 10], [10, 13]), 'text-letter-spacing': .08, 'text-max-width': 9 }, paint: { 'text-color': '#9bf0d8', 'text-halo-color': P.halo, 'text-halo-width': 1.6, 'text-opacity': e([7.4, 0], [8.2, .9], [10.4, .9], [11, 0]) } });
  const VILLES = [   // [id, classes, minzoom, maxzoom, taille(z)]
    ['nom-ville', ['city'], 4, 15, [[4, 11], [8, 15], [12, 19]], POLICE.gras],
    ['nom-bourg', ['town'], 7.5, 16, [[7.5, 10], [12, 14], [15, 17]], POLICE.reg],
    ['nom-village', ['village'], 10.5, 17, [[10.5, 10], [14, 13], [17, 16]], POLICE.reg],
    ['nom-quartier', ['suburb', 'quarter'], 12, 17, [[12, 10], [15, 13]], POLICE.ital],
    ['nom-hameau', ['hamlet', 'neighbourhood'], 13, 18, [[13, 9], [16, 12]], POLICE.reg],
    ['nom-lieudit', ['isolated_dwelling', 'locality', 'farm'], 15, 19, [[15, 9], [18, 12]], POLICE.ital],
  ];
  for (const [id, classes, min, max, tailles, police] of VILLES) add(etiquette(id, 'omt', 'place', { min, max, filtre: ['in', ['get', 'class'], ['literal', classes]], taille: e(...tailles), police, tri: ['get', 'rank'], largeur: 7, couleur: id === 'nom-ville' ? '#ffffff' : P.texte }));
  add(etiquette('nom-ile', 'omt', 'place', { min: 6, max: 13, filtre: ['==', ['get', 'class'], 'island'], police: POLICE.ital, taille: 12, couleur: P.texteDoux }));
  add(etiquette('nom-mer', 'omt', 'water_name', { min: 1, max: 10, filtre: ['in', ['get', 'class'], ['literal', ['ocean', 'sea']]], champ: NOM_INT, police: POLICE.ital, taille: e([1, 11], [6, 15]), majuscules: true, espace: .3, couleur: '#7db7ea' }));
  add(etiquette('nom-lac', 'omt', 'water_name', { min: 8, max: 17, filtre: ['!', ['in', ['get', 'class'], ['literal', ['ocean', 'sea']]]], police: POLICE.ital, taille: e([8, 10], [14, 13]), couleur: '#7db7ea' }));
  add(etiquette('nom-riviere', 'omt', 'waterway', { min: 9.5, max: 18, filtre: ['==', ['get', 'class'], 'river'], police: POLICE.ital, taille: e([9.5, 10], [15, 13]), couleur: '#7db7ea', layout: { 'symbol-placement': 'line', 'text-letter-spacing': .15 } }));
  add(etiquette('nom-sommet', 'omt', 'mountain_peak', { min: 9, max: 18, filtre: ['==', ['get', 'class'], 'peak'], champ: ['concat', '▲ ', NOM, ['case', ['has', 'ele'], ['concat', '\n', ['get', 'ele'], ' m'], '']], taille: e([9, 10], [14, 12]), couleur: '#ffe7b0', tri: ['get', 'rank'], largeur: 8 }));
  add(etiquette('nom-parc', 'omt', 'park', { min: 10, max: 17, filtre: ['has', 'name'], police: POLICE.ital, taille: 11, couleur: '#8fe0c8', layout: { 'text-max-width': 6 } }));
  add(etiquette('nom-aeroport', 'omt', 'aerodrome_label', { min: 9, max: 17, taille: 11, couleur: '#cfe9ff' }));
  add(etiquette('nom-poi', 'omt', 'poi', { min: 15.5, max: 20, filtre: ['all', ['has', 'name'], ['<=', ['coalesce', ['get', 'rank'], 99], 25]], taille: 11, couleur: P.texteDoux, padding: 6 }));
  add({ id: 'nom-route', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13.5, filter: ['has', 'name'], layout: { 'text-field': NOM, 'text-font': POLICE.reg, 'text-size': e([13.5, 10], [18, 14]), 'symbol-placement': 'line', 'text-letter-spacing': .06, 'text-padding': 8, 'text-max-angle': 35 }, paint: { 'text-color': '#cfeeff', 'text-halo-color': P.halo, 'text-halo-width': 1.8 } });
  add({ id: 'ref-route', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 8, maxzoom: 14, filter: ['all', ['has', 'ref'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]]], layout: { 'text-field': ['get', 'ref'], 'text-font': POLICE.gras, 'text-size': 10, 'symbol-placement': 'line', 'text-padding': 30 }, paint: { 'text-color': P.routeAutoroute, 'text-halo-color': P.halo, 'text-halo-width': 1.8 } });
  add(etiquette('numeros', 'omt', 'housenumber', { min: 18, max: 22, champ: ['get', 'housenumber'], taille: 10, couleur: P.texteDoux, padding: 1 }));

  // JSON pur : retire les propriétés « undefined » (symbol-sort-key absent…) que le validateur de style refuserait
  return JSON.parse(JSON.stringify({ version: 8, name: 'Rayle Terre', glyphs: opts.glyphes || GLYPHES, sources, layers: L, transition: { duration: 200, delay: 0 } }));
}
