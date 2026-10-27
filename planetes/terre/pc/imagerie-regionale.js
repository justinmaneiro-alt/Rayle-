/* ═════════════ IMAGERIE AÉRIENNE RÉGIONALE (pur : construit des adresses, ne fait aucune requête) ═════════════
   Sentinel-2 (10 m/pixel) s'arrête au niveau 14 : de près, le sol est un agrandissement flou. Plusieurs États publient leurs photographies
   aériennes en données ouvertes (5 à 50 cm/pixel). Chaque source ci-dessous a été vérifiée le 2026-10-24 : tuiles accessibles sans clé, CORS ouvert,
   licence libre qui autorise l'usage dans Raylé, crédit exact affiché dans l'interface (panneau « Crédits et licences » + ligne du bas quand
   la source est à l'écran). Les boîtes englobantes sont larges : en dehors de la couverture réelle, le serveur répond 404 ou une image blanche,
   le Worker de tuiles passe alors à la source suivante (voir worker-tuiles.js) et retient l'échec.
   Sources REFUSÉES (licence ou conditions) : Esri World Imagery, Google, Bing, Mapbox (conditions d'usage / clé obligatoire) ;
   Denmark Dataforsyningen, Lantmäteriet (Suède), NLS Finlande, LINZ (clé obligatoire) ; Land NRW/Berlin etc. (couverture partielle, à ajouter plus tard). */
export const Z_DEBUT_REGIONAL = 12;      // en dessous, Blue Marble / Sentinel-2 suffisent

const J = (t, tpl) => tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
export const SOURCES_REGIONALES = [
  { id: 'ign', nom: 'IGN (France)', zMax: 18, boite: [[-5.3, 41.2, 9.7, 51.2], [-61.9, 15.8, -60.9, 16.6], [-61.4, 14.3, -60.8, 14.95], [-54.7, 2.0, -51.5, 5.9], [55.1, -21.5, 55.9, -20.8], [44.9, -13.1, 45.4, -12.6]],
    url: t => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${t.z}&TILEROW=${t.y}&TILECOL=${t.x}`,
    credit: '© IGN — BD ORTHO / Géoplateforme (Licence Ouverte Etalab 2.0)', lien: 'https://geoservices.ign.fr/bdortho' },
  { id: 'swisstopo', nom: 'swisstopo (Suisse)', zMax: 18, boite: [[5.9, 45.8, 10.6, 47.9]],
    url: t => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${t.z}/${t.x}/${t.y}.jpeg`,
    credit: 'SWISSIMAGE © swisstopo (données ouvertes OGD, source obligatoire)', lien: 'https://www.swisstopo.admin.ch/fr/geodata/images/ortho/swissimage10.html' },
  { id: 'pnoa', nom: 'PNOA (Espagne)', zMax: 18, boite: [[-9.5, 35.9, 4.4, 43.9], [-18.2, 27.5, -13.3, 29.5]],
    url: t => `https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix=${t.z}&TileRow=${t.y}&TileCol=${t.x}`,
    credit: 'PNOA © Instituto Geográfico Nacional de España (CC BY 4.0)', lien: 'https://pnoa.ign.es/' },
  { id: 'pdok', nom: 'PDOK (Pays-Bas)', zMax: 18, boite: [[3.3, 50.7, 7.3, 53.6]],
    url: t => `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/${t.z}/${t.x}/${t.y}.jpeg`,
    credit: 'Luchtfoto © Beeldmateriaal Nederland / PDOK (CC BY 4.0)', lien: 'https://www.pdok.nl/introductie/-/article/luchtfoto-pdok' },
  { id: 'basemapat', nom: 'basemap.at (Autriche)', zMax: 18, boite: [[9.5, 46.3, 17.2, 49.1]],
    url: t => `https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/${t.z}/${t.y}/${t.x}.jpeg`,
    credit: 'Orthophoto © basemap.at / Geoland.at (CC BY 4.0)', lien: 'https://basemap.at/' },
  { id: 'cuzk', nom: 'ČÚZK (Tchéquie)', zMax: 18, boite: [[12.0, 48.5, 18.9, 51.1]],
    url: t => `https://ags.cuzk.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/${t.z}/${t.y}/${t.x}`,
    credit: 'Ortofoto © ČÚZK (CC BY 4.0)', lien: 'https://ags.cuzk.cz/' },
  { id: 'gsi', nom: 'GSI (Japon)', zMax: 18, boite: [[122.9, 24.0, 146.0, 45.6]],
    url: t => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${t.z}/${t.x}/${t.y}.jpg`,
    credit: '地理院タイル © 国土地理院 (GSI Japan, conditions d’utilisation du gouvernement japonais v2, compatibles CC BY 4.0)', lien: 'https://maps.gsi.go.jp/development/ichiran.html' },
  { id: 'usgs', nom: 'USGS (États-Unis)', zMax: 16, boite: [[-125.0, 24.4, -66.9, 49.6], [-160.4, 18.8, -154.7, 22.3], [-168.0, 54.0, -130.0, 71.5]],
    url: t => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${t.z}/${t.y}/${t.x}`,
    credit: 'Imagery courtesy of the U.S. Geological Survey, The National Map (domaine public)', lien: 'https://www.usgs.gov/faqs/are-usgs-data-public-domain' }
];
export const parId = id => SOURCES_REGIONALES.find(s => s.id === id) || null;

/* Les sources qui peuvent couvrir le point (lon, lat), la plus précise (zMax le plus grand) d'abord. */
export function sourcesPour(lon, lat, sources = SOURCES_REGIONALES) {
  return sources.filter(s => s.boite.some(([o, a, e, n]) => lon >= o && lon <= e && lat >= a && lat <= n)).sort((a, b) => b.zMax - a.zMax);
}
/* Niveau maximal utile d'une tuile : 16 par défaut (Sentinel-2 agrandi deux fois), plus si une source régionale couvre le lieu. */
export function zMaxLocal(lon, lat, { zMaxProfil = 18, zMaxSentinel = 16, sources = SOURCES_REGIONALES } = {}) {
  const s = sourcesPour(lon, lat, sources)[0];
  return Math.min(zMaxProfil, s ? Math.max(zMaxSentinel, s.zMax) : zMaxSentinel);
}
/* Adresses candidates pour la tuile (z,x,y) de centre (lon, lat) : [{ source, url, z, x, y, rect }] ; rect = sous-rectangle de la tuile source qui couvre la tuile affichée. */
export function candidates(z, x, y, lon, lat, sources = SOURCES_REGIONALES) {
  if (z < Z_DEBUT_REGIONAL) return [];
  return sourcesPour(lon, lat, sources).map(s => {
    const zs = Math.min(z, s.zMax), d = z - zs, n = 2 ** d;
    const t = { z: zs, x: x >> d, y: y >> d };
    return { source: s.id, url: s.url(t), z: zs, x: t.x, y: t.y, rect: d ? [(x & (n - 1)) / n, (y & (n - 1)) / n, 1 / n] : [0, 0, 1] };
  });
}
