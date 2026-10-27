import { ancetre, lonDeX, latDeY } from './geo.js';
import { candidates as candidatesRegionales, SOURCES_REGIONALES } from './imagerie-regionale.js';

/* ═════════════ SOURCES DE TUILES (pur : construit des adresses, ne fait aucune requête) ═════════════
   Tous ces serveurs sont des CDN publics sans clé, avec CORS ouvert. Licences et limites : planetes/terre/PLAN.md et galaxie/CREDITS.md.
   Aucune clé ni donnée personnelle ne passe par ici. */
/* Les tests de bout en bout remplacent ces adresses par un faux serveur local (window.__RAYLE_TERRE_TEST__, défini avant le chargement de la page). */
const T = (typeof globalThis !== 'undefined' && globalThis.__RAYLE_TERRE_TEST__) || {};
export const GIBS = T.gibs || 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8';
export const EOX = T.eox || 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g';
export const RELIEF = T.relief || 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium';        // adresse « virtual-host » : l'autre n'a pas CORS
export const RELIEF_SECOURS = 'https://tiles.mapterhorn.com';
export const VECTEUR_TILEJSON = T.vecteur || 'https://tiles.openfreemap.org/planet';

export const Z_GIBS = 8;           // dernier niveau de la couche NASA
export const Z_EOX = 14;           // dernier niveau utile de Sentinel-2 (10 m)
export const Z_RELIEF = 12;        // niveau maximal de relief demandé (≈ 27 m/pixel à 45°) : au-delà, sous-rectangle du parent
export const Z_VECTEUR = 14;       // dernier niveau des tuiles vectorielles OpenFreeMap
export const GIBS_RACINE = T.gibsRacine || 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const Z_VIIRS = 9;          // dernier niveau de l'imagerie quotidienne VIIRS (≈ 250 m)
export const Z_EOX_DEBUT = 6;      // à partir de ce niveau, Sentinel-2 remplace Blue Marble (si l'imagerie haute résolution est autorisée)

/* Quelle image pour la tuile (z,x,y) ? → { url, source, rect } (rect : sous-rectangle de l'image source qui couvre la tuile) */
export function imagerie(z, x, y, { eox = true, jour = null } = {}) {
  /* jour : date AAAA-MM-JJ → image satellite du jour de la NASA (VIIRS, avec ses vrais nuages) à la place de Blue Marble ; Sentinel-2 prend alors le relais plus bas */
  const debutEox = jour ? Z_VIIRS : Z_EOX_DEBUT;
  const sourceEox = eox && z >= debutEox;
  const zs = Math.min(z, sourceEox ? Z_EOX : (jour ? Z_VIIRS : Z_GIBS)), a = ancetre(z, x, y, zs);
  let url, source;
  if (sourceEox) { url = `${EOX}/${a.zs}/${a.ys}/${a.xs}.jpg`; source = 'eox'; }
  else if (jour) { url = `${GIBS_RACINE}/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${jour}/GoogleMapsCompatible_Level9/${a.zs}/${a.ys}/${a.xs}.jpg`; source = 'viirs'; }
  else { url = `${GIBS}/${a.zs}/${a.ys}/${a.xs}.jpeg`; source = 'gibs'; }
  return { url, source, rect: [a.ox, a.oy, a.k], zSource: a.zs };
}
export function relief(z, x, y) {
  const a = ancetre(z, x, y, Math.max(0, Math.min(z - 2, Z_RELIEF)));   // 2 niveaux plus grossier : 16 tuiles d'image partagent une tuile de relief
  return { url: `${RELIEF}/${a.zs}/${a.xs}/${a.ys}.png`, rect: [a.ox, a.oy, a.k], zSource: a.zs };
}
/* modele : adresse type lue dans le TileJSON d'OpenFreeMap, ex. https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf */
export function vecteur(modele, z, x, y) {
  const a = ancetre(z, x, y, Math.min(z, Z_VECTEUR));
  return { url: modele.replace('{z}', a.zs).replace('{x}', a.xs).replace('{y}', a.ys), rect: [a.ox, a.oy, a.k], zSource: a.zs };
}
/* Décodage Terrarium : hauteur en mètres = (R × 256 + G + B / 256) − 32768. */
export const hauteurTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

export const CREDITS = [
  'Imagerie : NASA GIBS (Blue Marble, VIIRS) · EOxCloudless / EOX IT Services GmbH (Contient des données Copernicus Sentinel modifiées 2020, CC BY-NC-SA 4.0)',
  'Relief : © Mapterhorn (https://mapterhorn.com/attribution — sources ouvertes : Copernicus GLO-30, IGN RGE ALTI, swisstopo, USGS 3DEP, LiDAR nationaux… CC BY 4.0, Licence Ouverte, domaine public) · secours : AWS Terrain Tiles',
  'Actualités : titres et liens des flux RSS publics des médias cités (Le Monde, franceinfo, France 3 régions, La Dépêche, Sud Ouest, BBC, Al Jazeera…) · GDELT · catégories et lieux estimés par Raylé',
  'Radar de pluie : RainViewer (https://www.rainviewer.com/api.html) · Météo : Open-Meteo.com (CC BY 4.0)',
  'Cartes : © les contributeurs d’OpenStreetMap (ODbL) · OpenFreeMap · OpenMapTiles · Textures de la planète : Solar System Scope (CC BY 4.0) · three.js (MIT)'
];

/* Une ligne toujours visible en bas de l'écran ; le détail des licences est dans le panneau « Crédits et licences ». */
export const CREDITS_COURT = 'NASA GIBS · EOX Sentinel-2 (CC BY-NC-SA) · Relief AWS · © OpenStreetMap · OpenFreeMap · Open-Meteo · RainViewer · Solar System Scope';

/* ── Chaînes de candidats : la première réponse valable est utilisée (voir worker-tuiles.js) ── */
export const MAPTERHORN = 'https://tiles.mapterhorn.com';         // relief Terrarium 512 px, 30 m partout (z12), jusqu'à 25 cm là où des données ouvertes existent (z17)
export const Z_RELIEF_MAX = 17, Z_RELIEF_MONDE = 12;
export const EN_TEST = typeof globalThis !== 'undefined' && !!globalThis.__RAYLE_TERRE_TEST__;

/* Imagerie : source régionale précise si elle couvre le lieu, puis Sentinel-2 / Blue Marble (comme avant). Chaque candidat : { url, source, rect, zSource }. */
export function imagerieCandidats(z, x, y, opts = {}) {
  const base = imagerie(z, x, y, opts), liste = [];
  if (!EN_TEST && opts.regional !== false && z >= 12) {
    const lon = lonDeX(x + 0.5, z), lat = latDeY(y + 0.5, z);
    for (const c of candidatesRegionales(z, x, y, lon, lat)) liste.push({ url: c.url, source: c.source, rect: c.rect, zSource: c.z, xs: c.x, ys: c.y, regional: true });
  }
  liste.push({ url: base.url, source: base.source, rect: base.rect, zSource: base.zSource });
  if (base.source === 'eox') {                                   // Sentinel-2 n'a pas de tuile au large de certaines côtes : Blue Marble prend le relais (sinon un rectangle de texture mondiale floue)
    const bm = imagerie(z, x, y, { ...opts, eox: false, jour: null });
    liste.push({ url: bm.url, source: bm.source, rect: bm.rect, zSource: bm.zSource });
  }
  return liste;
}
/* Relief : Mapterhorn au niveau le plus fin utile (z − 1, jusqu'à 17), puis plus grossier jusqu'à 12 (global), puis AWS Terrarium en secours. */
export function reliefCandidats(z, x, y) {
  if (EN_TEST) { const r = relief(z, x, y); return [{ url: r.url, source: 'test', rect: r.rect, zSource: r.zSource, taille: 256 }]; }
  const liste = [], zTop = Math.min(Z_RELIEF_MAX, Math.max(0, z - 1));
  for (let zr = zTop; zr >= Math.min(Z_RELIEF_MONDE, zTop); zr--) {
    const a = ancetre(z, x, y, zr);
    liste.push({ url: `${MAPTERHORN}/${a.zs}/${a.xs}/${a.ys}.webp`, source: 'mapterhorn', rect: [a.ox, a.oy, a.k], zSource: a.zs, xs: a.xs, ys: a.ys, taille: 512 });
    if (zr <= Z_RELIEF_MONDE) break;
  }
  const r = relief(z, x, y);
  liste.push({ url: r.url, source: 'aws', rect: r.rect, zSource: r.zSource, taille: 256 });
  return liste;
}
export const CREDITS_REGIONAUX = SOURCES_REGIONALES.map(s => s.credit);
