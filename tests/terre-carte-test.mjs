// La Terre sert de carte : style MapLibre (détail progressif), bascule globe ↔ carte, géocodage (cache, limites), itinéraires, outils earth.*, phrases.   node tests/terre-carte-test.mjs
// Tout est testé hors ligne : le réseau est simulé, aucune requête ne part. Le rendu réel (tuiles, fondu, vol de caméra) se vérifie dans un navigateur.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { construireStyle, zoomPourDistance, distancePourZoom, opaciteCarte, D_OUVRE, D_PLEIN, ZOOM_MIN_CARTE, zoomDepuisNiveau, nomDuZoom, zoomPourBoite, zoomPourLieu, cerclePoly, distanceKm, NIVEAUX, ZOOMS_NOMMES, GLYPHES, TUILES } from '../js/univers/espace/carte-style.js';
import { creerGeocodeur, calculerRoute, duree, kmTexte, liensExternes, norm, PROFILS } from '../js/univers/espace/lieux.js';
import { Z_SORTIE } from '../js/univers/espace/carte-terre.js';

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e && e.stack || e); process.exitCode = 1; } };
const plat = o => JSON.parse(JSON.stringify(o));

/* ═════════ géométrie globe ↔ carte ═════════ */
await t('zoom ↔ distance : aller-retour exact, à toutes les latitudes', () => {
  for (const lat of [0, 20, 43.6, 60, 75]) for (const d of [1.012, 1.05, 1.08, 1.16, 1.4, 3.6]) {
    const z = zoomPourDistance(d, lat, 800); assert.ok(Math.abs(distancePourZoom(z, lat, 800) - d) < 1e-9, `lat ${lat} d ${d}`);
  }
});
await t('plus on s’approche du sol, plus le zoom de la carte est grand', () => {
  let z0 = -1; for (const d of [3.6, 1.6, 1.3, 1.16, 1.1, 1.08, 1.04, 1.012]) { const z = zoomPourDistance(d, 45, 800); assert.ok(z > z0, d); z0 = z; }
});
await t('la bande de bascule est cohérente : la carte reste dans ses zooms utiles', () => {
  const zO = zoomPourDistance(D_OUVRE, 43.6, 700), zP = zoomPourDistance(D_PLEIN, 43.6, 700);
  assert.ok(zO >= ZOOM_MIN_CARTE - .6 && zO < zP, `ouverture ${zO}`); assert.ok(zP > Z_SORTIE, 'on entre dans la carte au-dessus du zoom de sortie');
  assert.ok(Z_SORTIE > zO - .3, 'le globe ne reprend jamais la main au-dessus de la bande de fondu, sinon un aller-retour sautille');
});
await t('opacité de la carte : 0 loin, 1 près, monotone et continue', () => {
  assert.equal(opaciteCarte(3.6), 0); assert.equal(opaciteCarte(D_OUVRE), 0); assert.equal(opaciteCarte(D_PLEIN), 1); assert.equal(opaciteCarte(1.012), 1);
  let p = 0; for (let d = D_OUVRE; d >= D_PLEIN; d -= .002) { const o = opaciteCarte(d); assert.ok(o >= p - 1e-12); assert.ok(o - p < .05, 'pas de saut'); p = o; }
  assert.ok(Math.abs(opaciteCarte((D_OUVRE + D_PLEIN) / 2) - .5) < .01);
});
await t('un dézoom dans la carte retombe sur la même image que le globe (même distance)', () => {
  for (const z of [6.4, 6.8, 7.5]) { const d = distancePourZoom(z, 46, 700); assert.ok(Math.abs(zoomPourDistance(d, 46, 700) - z) < 1e-9); }
});
await t('distance entre deux points (Castres–Toulouse ≈ 62 km)', () => {
  const d = distanceKm({ lat: 43.6132, lon: 2.2448 }, { lat: 43.6045, lon: 1.4442 }); assert.ok(d > 58 && d < 68, d);
});
await t('zoom pour une boîte : Castres tient à l’écran, la France entière donne un zoom de pays', () => {
  const z = zoomPourBoite([43.556, 43.670, 2.156, 2.333], 1000, 700, 60); assert.ok(z > 10.5 && z < 12.5, z);
  const f = zoomPourBoite([41.3, 51.1, -5.2, 9.6], 1000, 700, 60); assert.ok(f > 4.2 && f < 5.6, f);
});
await t('cercle de précision : fermé, rayon respecté (±1 %)', () => {
  const c = cerclePoly(43.6, 2.2, 500).geometry.coordinates[0]; assert.deepEqual(c[0], c[c.length - 1]);
  for (const [lon, lat] of c) { const d = distanceKm({ lat: 43.6, lon: 2.2 }, { lat, lon }) * 1000; assert.ok(Math.abs(d - 500) < 6, d); }
});

/* ═════════ niveaux de zoom nommés (earth.set_zoom) ═════════ */
await t('set_zoom : nombres, noms, pluriels, accents, « niveau … »', () => {
  assert.equal(zoomDepuisNiveau(12), 12); assert.equal(zoomDepuisNiveau('12'), 12); assert.equal(zoomDepuisNiveau('niveau 14'), 14); assert.equal(zoomDepuisNiveau('12,5'), 12.5);
  assert.equal(zoomDepuisNiveau(40), 19); assert.equal(zoomDepuisNiveau(-3), 0);
  assert.equal(zoomDepuisNiveau('rue'), ZOOMS_NOMMES.rue); assert.equal(zoomDepuisNiveau('les rues'), ZOOMS_NOMMES.rue); assert.equal(zoomDepuisNiveau('niveau ville'), ZOOMS_NOMMES.ville);
  assert.equal(zoomDepuisNiveau('département'), ZOOMS_NOMMES.departement); assert.equal(zoomDepuisNiveau('région'), ZOOMS_NOMMES.region); assert.equal(zoomDepuisNiveau('bâtiment'), ZOOMS_NOMMES.batiment);
  assert.equal(zoomDepuisNiveau('n’importe quoi'), null); assert.equal(zoomDepuisNiveau(''), null); assert.equal(zoomDepuisNiveau(null), null);
});
await t('chaque niveau nommé tombe dans la bonne tranche de détail', () => {
  assert.equal(nomDuZoom(ZOOMS_NOMMES.pays), 'les pays'); assert.equal(nomDuZoom(ZOOMS_NOMMES.region), 'les régions'); assert.equal(nomDuZoom(ZOOMS_NOMMES.departement), 'les départements');
  assert.equal(nomDuZoom(ZOOMS_NOMMES.ville), 'les villes'); assert.equal(nomDuZoom(ZOOMS_NOMMES.rue), 'les rues'); assert.equal(nomDuZoom(ZOOMS_NOMMES.monde), 'le monde');
});
await t('zoom adapté au type de lieu (ville, sommet, adresse, pays…)', () => {
  assert.equal(zoomPourLieu({ type: 'city' }), 11.5); assert.equal(zoomPourLieu({ type: 'peak' }), 12); assert.equal(zoomPourLieu({ type: 'house' }), 17.5); assert.equal(zoomPourLieu({ type: 'country' }), 5);
  assert.equal(zoomPourLieu({ type: 'tourism' }), 15.5); assert.equal(zoomPourLieu({ type: 'inconnu' }), 13); assert.equal(zoomPourLieu({ zoom: 9 }), 9);
});

/* ═════════ style : détail progressif ═════════ */
const style = construireStyle({ urlRegions: 'x/regions.json', urlDepartements: 'x/departements.json', nomsPays: { FR: 'France', JP: 'Japon' } });
const L = id => style.layers.find(l => l.id === id);
const min = id => { const l = L(id); assert.ok(l, 'couche absente : ' + id); return l.minzoom == null ? 0 : l.minzoom; };
const max = id => { const l = L(id); return l.maxzoom == null ? 24 : l.maxzoom; };
await t('style : valide structurellement (ids uniques, sources existantes, JSON pur, sans clé API)', () => {
  assert.equal(style.version, 8); const ids = style.layers.map(l => l.id); assert.equal(new Set(ids).size, ids.length);
  for (const l of style.layers) { if (l.source) assert.ok(style.sources[l.source], l.id + ' : source ' + l.source); if (l.type !== 'background') assert.ok(l.source, l.id); }
  assert.deepEqual(JSON.parse(JSON.stringify(style)), style, 'pas de valeur undefined'); assert.ok(!/key=|apikey|token/i.test(JSON.stringify(style)), 'aucune clé');
  assert.equal(style.sources.omt.url, TUILES); assert.ok(/openfreemap\.org/.test(TUILES)); assert.equal(style.glyphs, GLYPHES); assert.ok(!/tile\.openstreetmap\.org/.test(JSON.stringify(style)), 'jamais les tuiles OSM directes');
  assert.ok(/OpenStreetMap/.test(style.sources.omt.attribution) && /OpenFreeMap/.test(style.sources.omt.attribution) && /IGN/.test(style.sources.omt.attribution), 'attribution complète');
});
await t('style : les couches vectorielles visent des couches OpenMapTiles qui existent', () => {
  const OMT = new Set(['aerodrome_label', 'aeroway', 'boundary', 'building', 'housenumber', 'landcover', 'landuse', 'mountain_peak', 'park', 'place', 'poi', 'transportation', 'transportation_name', 'water', 'water_name', 'waterway']);
  for (const l of style.layers.filter(l => l.source === 'omt')) assert.ok(OMT.has(l['source-layer']), l.id + ' → ' + l['source-layer']);
});
await t('monde : pays et océans visibles dès le zoom 0–1, pas de rues', () => {
  assert.ok(min('nom-pays') <= 1); assert.ok(min('limite-pays') === 0); assert.ok(min('nom-mer') <= 1);
  for (const id of ['nom-route', 'numeros', 'bati', 'nom-lieudit', 'nom-poi', 'route-locale', 'route-chemin']) assert.ok(min(id) >= 12.4, id + ' ne doit pas apparaître à l’échelle d’un pays');
});
await t('zoom moyen : régions puis départements de France (contours officiels), villes principales', () => {
  assert.ok(min('fr-regions') < min('fr-departements'), 'les régions viennent avant les départements'); assert.ok(min('fr-regions') <= 4 && max('fr-regions') >= 9);
  assert.ok(min('fr-departements') >= 6 && min('fr-departements') <= 7, 'départements dès le zoom 6–7'); assert.ok(max('fr-departements') >= 11);
  assert.ok(min('fr-regions-noms') >= 5 && min('fr-departements-noms') > min('fr-regions-noms'));
  assert.ok(min('nom-ville') <= 5 && min('nom-etat') >= 4);
  assert.equal(style.sources['fr-regions'].data, 'x/regions.json'); assert.equal(style.sources['fr-departements'].data, 'x/departements.json');
});
await t('zoom fort : villes, villages, communes, routes principales PUIS secondaires, rivières, forêts', () => {
  assert.ok(min('nom-ville') < min('nom-bourg') && min('nom-bourg') < min('nom-village'), 'ville < bourg < village');
  assert.ok(min('nom-village') >= 10 && min('nom-village') <= 11.5);
  const ordre = ['route-autoroute', 'route-nationale', 'route-primaire', 'route-secondaire', 'route-tertiaire', 'route-locale', 'route-chemin'];
  for (let i = 1; i < ordre.length; i++) assert.ok(min(ordre[i]) > min(ordre[i - 1]), ordre[i - 1] + ' avant ' + ordre[i]);
  assert.ok(min('route-autoroute') <= 5 && min('route-secondaire') >= 9 && min('route-secondaire') <= 11);
  assert.ok(min('rivieres') <= 8 && min('nom-riviere') >= 9 && min('ruisseaux') >= 11.5, 'rivières avant ruisseaux');
  assert.ok(min('sol-bois') <= 6, 'forêts lisibles de loin'); assert.ok(min('limite-commune') >= 11 && min('limite-commune') <= 12, 'limites communales vers le zoom 12');
  assert.ok(min('nom-sommet') >= 8 && min('nom-sommet') <= 10);
});
await t('zoom très fort : rues, noms de rues, lieux-dits, hameaux, bâtiments, numéros', () => {
  assert.ok(min('nom-hameau') >= 12.5 && min('nom-hameau') <= 14); assert.ok(min('nom-lieudit') >= 14.5 && min('nom-lieudit') <= 16);
  assert.ok(min('nom-route') >= 13 && min('nom-route') <= 14.5); assert.ok(min('bati') >= 13 && min('bati') <= 14.5); assert.ok(min('numeros') >= 17.5);
  assert.ok(min('nom-lieudit') > min('nom-hameau') && min('nom-hameau') > min('nom-village'), 'lieux-dits après hameaux après villages');
});
await t('pas de surcharge : une étiquette n’occupe pas tous les zooms (elle naît ET s’efface, ou elle est remplacée par plus fin)', () => {
  const sy = style.layers.filter(l => l.type === 'symbol');
  assert.ok(sy.length >= 18, 'beaucoup de couches d’étiquettes progressives: ' + sy.length);
  for (const l of sy) { assert.ok((l.minzoom || 0) >= 0); if (/^nom-(pays|etat)$|fr-regions-noms|fr-departements-noms/.test(l.id)) assert.ok(l.maxzoom != null && l.maxzoom <= 11, l.id + ' doit s’effacer avant les noms de communes'); }
  for (const l of sy.filter(l => l.layout['text-padding'] !== undefined)) assert.ok(l.layout['text-padding'] >= 1, 'collisions gérées : ' + l.id);
});
await t('noms de pays en français quand la page les fournit', () => {
  const f = L('nom-pays').layout['text-field']; assert.equal(f[0], 'match'); assert.ok(f.includes('Japon') && f.includes('France'));
  const sans = construireStyle({}); assert.ok(!sans.sources['fr-regions'] && !sans.layers.some(l => l.id.startsWith('fr-')), 'sans fichiers France, pas de couches France'); assert.notEqual(sans.layers.find(l => l.id === 'nom-pays').layout['text-field'][0], 'match');
});
await t('les niveaux de détail documentés (NIVEAUX) correspondent au style', () => {
  assert.deepEqual(NIVEAUX.map(n => n.id), ['monde', 'regions', 'departements', 'villes', 'rues']);
  for (let i = 1; i < NIVEAUX.length; i++) assert.ok(NIVEAUX[i].zoom[0] > NIVEAUX[i - 1].zoom[0]);
  assert.ok(min('fr-regions') >= NIVEAUX[1].zoom[0] - .5 && min('fr-departements') >= NIVEAUX[2].zoom[0] - .5);
  assert.ok(min('nom-route') >= NIVEAUX[4].zoom[0] - .5);
});
await t('le style est sobre : thème sombre (fond très foncé, aucun fond blanc)', () => {
  const bg = L('fond').paint['background-color']; const n = parseInt(bg.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; assert.ok(r + g + b < 150, bg);
  assert.ok(style.layers.filter(l => l.type === 'fill').every(l => { const c = l.paint['fill-color']; return typeof c !== 'string' || (parseInt(c.slice(1), 16) >> 16) < 80; }), 'fonds sombres');
});

/* ═════════ géocodage ═════════ */
const reponse = (corps, ok = true, status = 200) => ({ ok, status, json: async () => corps });
function banc(routes, opts = {}) {
  const urls = [], dates = []; let t0 = 1e12;
  const maintenant = () => t0, pause = async ms => { t0 += ms; };
  const fetchT = async url => {
    urls.push(url); dates.push(t0);
    for (const [re, rep] of routes) if (re.test(url)) { const r = typeof rep === 'function' ? rep(url) : rep; if (r instanceof Error) throw r; return r; }
    throw new Error('requête inattendue : ' + url);
  };
  const stock = opts.stockage || (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; })();
  const g = creerGeocodeur({ fetchT, maintenant, pause, stockage: stock, connus: opts.connus || null });
  return { g, urls, dates, stock, avance: ms => { t0 += ms; } };
}
const COMMUNES = reponse([{ nom: 'Castres', centre: { type: 'Point', coordinates: [3.2576, 49.803] }, population: 246, departement: { code: '02', nom: 'Aisne' } }, { nom: 'Castres', centre: { type: 'Point', coordinates: [2.2448, 43.6132] }, population: 42505, departement: { code: '81', nom: 'Tarn' }, contour: { type: 'Polygon', coordinates: [[[2.156, 43.556], [2.333, 43.556], [2.333, 43.670], [2.156, 43.670], [2.156, 43.556]]] } }]);
const NOMINATIM_MB = reponse([{ lat: '45.8326', lon: '6.8652', display_name: 'Mont Blanc, Haute-Savoie, Auvergne-Rhône-Alpes, France', name: 'Mont Blanc', addresstype: 'peak', category: 'natural', boundingbox: ['45.82', '45.85', '6.84', '6.89'] }]);

await t('géocodage : lieux connus de Raylé sans aucun réseau', async () => {
  const { g, urls } = banc([], { connus: q => /^paris$/i.test(q) ? { lat: 48.85, lon: 2.35, nom: 'Paris', court: 'Paris', type: 'city' } : null });
  const l = await g.geocoder('Paris'); assert.equal(l.court, 'Paris'); assert.equal(urls.length, 0); assert.equal(l.zoom, 11.5); assert.match(l.source, /connus/);
});
await t('géocodage France : « Castres » = Tarn (la commune la plus peuplée de ce nom), avec boîte et population', async () => {
  const { g, urls } = banc([[/geo\.api\.gouv\.fr/, COMMUNES]]);
  const l = await g.geocoder('Castres'); assert.equal(l.departement, 'Tarn'); assert.equal(l.population, 42505); assert.ok(Math.abs(l.lat - 43.6132) < 1e-6);
  assert.deepEqual(l.box, [43.556, 43.67, 2.156, 2.333]); assert.equal(l.zoom, 11.5); assert.match(l.source, /geo\.api\.gouv\.fr/); assert.equal(urls.length, 1); assert.ok(/boost=population/.test(urls[0]));
  assert.ok(!urls.some(u => /nominatim/.test(u)), 'pas de Nominatim pour une commune française');
});
await t('géocodage : une adresse va à l’API Adresse (Géoplateforme), puis au repli data.gouv si elle est en panne', async () => {
  const adr = reponse({ features: [{ geometry: { coordinates: [2.3522, 48.8566] }, properties: { label: '10 Rue de Rivoli 75004 Paris', name: '10 Rue de Rivoli', type: 'housenumber', city: 'Paris', postcode: '75004' } }] });
  let b = banc([[/data\.geopf\.fr/, adr]]); let l = await b.g.geocoder('10 rue de Rivoli Paris'); assert.equal(l.type, 'house'); assert.equal(l.zoom, 17.5); assert.equal(l.codePostal, '75004'); assert.match(b.urls[0], /^https:\/\/data\.geopf\.fr\/geocodage\/search\?limit=1&q=/); assert.ok(!b.urls.some(u => /nominatim/.test(u)));
  b = banc([[/data\.geopf\.fr/, reponse({}, false, 503)], [/api-adresse\.data\.gouv\.fr/, adr]]); l = await b.g.geocoder('10 rue de Rivoli Paris'); assert.equal(l.court, '10 Rue de Rivoli'); assert.equal(b.urls.length, 2);
});
await t('géocodage monde : Nominatim, avec zone favorisée France, type « sommet » → zoom 12', async () => {
  const { g, urls } = banc([[/geo\.api\.gouv\.fr/, reponse([])], [/nominatim/, NOMINATIM_MB]]);
  const l = await g.geocoder('Mont-Blanc'); assert.equal(l.zoom, 12); assert.equal(l.court, 'Mont Blanc'); assert.deepEqual(l.box, [45.82, 45.85, 6.84, 6.89]); assert.match(l.source, /Nominatim/);
  assert.ok(urls.some(u => /viewbox=-2,42,8,46/.test(u)), 'viewbox France'); assert.ok(urls.some(u => /accept-language=fr/.test(u)));
});
await t('Nominatim : une requête par seconde AU PLUS, même en rafale', async () => {
  const { g, dates, urls } = banc([[/geo\.api\.gouv\.fr/, reponse([])], [/nominatim/, NOMINATIM_MB]]);
  await Promise.all([g.geocoder('Alpha'), g.geocoder('Bravo'), g.geocoder('Charlie')]);
  const nom = urls.map((u, i) => [u, dates[i]]).filter(([u]) => /nominatim/.test(u)).map(([, d]) => d); assert.equal(nom.length, 3);
  for (let i = 1; i < nom.length; i++) assert.ok(nom[i] - nom[i - 1] >= 1000, 'écart ' + (nom[i] - nom[i - 1]) + ' ms');
});
await t('cache : la même demande (casse, accents, article) ne refait aucune requête, et survit au redémarrage', async () => {
  const b = banc([[/geo\.api\.gouv\.fr/, COMMUNES]]); await b.g.geocoder('Castres'); const n = b.urls.length;
  await b.g.geocoder('castres'); await b.g.geocoder('  CASTRES '); assert.equal(b.urls.length, n); assert.equal(b.g.stats.cache, 2);
  const c = banc([], { stockage: b.stock }); const l = await c.g.geocoder('Castres'); assert.equal(c.urls.length, 0, 'cache durable'); assert.equal(l.departement, 'Tarn');
  assert.ok(Object.keys(JSON.parse(b.stock.m.rayle_geo_cache_v2)).length >= 1);
});
await t('cache : expire après 30 jours, et ne dépasse jamais 160 entrées', async () => {
  const b = banc([[/geo\.api\.gouv\.fr/, COMMUNES]]); await b.g.geocoder('Castres'); b.avance(31 * 864e5);
  const c = creerGeocodeur({ fetchT: async u => { c.n = (c.n || 0) + 1; return COMMUNES; }, maintenant: () => 1e12 + 31 * 864e5, pause: async () => {}, stockage: b.stock }); await c.geocoder('Castres'); assert.equal(c.n, 1, 'recalculé');
  const stock = { m: {}, getItem(k) { return this.m[k] || null; }, setItem(k, v) { this.m[k] = v; } }; let i = 0;
  const d = creerGeocodeur({ fetchT: async () => reponse({ features: [{ geometry: { coordinates: [1, 2] }, properties: { label: 'x', type: 'street' } }] }), maintenant: () => 1e12 + (i++), pause: async () => {}, stockage: stock });
  for (let k = 0; k < 200; k++) await d.geocoder(k + ' rue du Test');
  assert.ok(Object.keys(JSON.parse(stock.m.rayle_geo_cache_v2)).length <= 160);
});
await t('introuvable : null (et pas d’erreur) ; réseau coupé : erreur claire, rien de mémorisé', async () => {
  let b = banc([[/geo\.api\.gouv\.fr/, reponse([])], [/nominatim/, reponse([])]]); assert.equal(await b.g.geocoder('Zzzzzz'), null);
  b = banc([[/geo\.api\.gouv\.fr/, new Error('réseau coupé')], [/nominatim/, new Error('réseau coupé')], [/geopf|api-adresse/, new Error('réseau coupé')]]);
  await assert.rejects(() => b.g.geocoder('Castres'), /réseau coupé/); assert.equal(b.g.memoire.size, 0, 'une panne n’est pas un « introuvable »');
});
await t('Nominatim en panne : repli sur l’API Adresse pour un nom de commune de France', async () => {
  const adr = reponse({ features: [{ geometry: { coordinates: [4.83, 45.76] }, properties: { label: 'Lyon', name: 'Lyon', type: 'municipality', city: 'Lyon' } }] });
  const { g, urls } = banc([[/geo\.api\.gouv\.fr/, reponse([])], [/nominatim/, reponse({}, false, 429)], [/data\.geopf\.fr/, adr]]);
  const l = await g.geocoder('Lyonnais'); assert.equal(l.court, 'Lyon'); assert.ok(urls.some(u => /nominatim/.test(u)) && urls.some(u => /geopf/.test(u)));
});
await t('aucun service de tuiles OSM n’est jamais appelé par le géocodeur', async () => {
  const b = banc([[/geo\.api\.gouv\.fr/, COMMUNES], [/nominatim/, NOMINATIM_MB], [/geopf/, reponse({ features: [] })]]);
  for (const q of ['Castres', 'Mont-Blanc', '5 rue Victor Hugo 81100 Castres', 'Tokyo']) await b.g.geocoder(q).catch(() => {});
  assert.ok(b.urls.length > 0 && !b.urls.some(u => /tile\.openstreetmap\.org/.test(u)));
  assert.ok(b.urls.every(u => /^https:\/\/(?:nominatim\.openstreetmap\.org|data\.geopf\.fr|api-adresse\.data\.gouv\.fr|geo\.api\.gouv\.fr)\//.test(u)), 'seuls les services prévus');
});
await t('norm : accents, apostrophes, tirets', () => { assert.equal(norm('  Saint-Étienne-du-Rouvray '), 'saint etienne du rouvray'); assert.equal(norm('L’Isle-d’Abeau'), 'l isle d abeau'); });

/* ═════════ itinéraires ═════════ */
const OSRM = { code: 'Ok', routes: [{ distance: 62300, duration: 3300, geometry: { coordinates: [[2.2448, 43.6132], [1.8, 43.6], [1.4442, 43.6045]] } }] };
await t('itinéraire : FOSSGIS selon le profil, géométrie [lat, lon], distance et durée', async () => {
  const urls = []; const fetchT = async u => { urls.push(u); return reponse(OSRM); };
  for (const [p, seg] of [['voiture', 'routed-car'], ['velo', 'routed-bike'], ['pied', 'routed-foot']]) {
    const r = await calculerRoute({ lat: 43.6132, lon: 2.2448 }, { lat: 43.6045, lon: 1.4442 }, p, { fetchT });
    assert.ok(urls.at(-1).startsWith('https://routing.openstreetmap.de/' + seg + '/route/v1/driving/2.2448,43.6132;1.4442,43.6045')); assert.deepEqual(r.coords[0], [43.6132, 2.2448]); assert.equal(r.via, 'FOSSGIS');
    assert.ok(Math.abs(r.km - 62.3) < 1e-9 && Math.abs(r.min - 55) < 1e-9);
  }
});
await t('itinéraire : secours OSRM seulement en voiture ; profil inconnu = voiture ; échec franc sinon', async () => {
  let n = 0; const f = async u => { n++; if (/openstreetmap\.de/.test(u)) throw new Error('HTTP 502'); return reponse(OSRM); };
  const r = await calculerRoute({ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, 'voiture', { fetchT: f }); assert.equal(r.via, 'OSRM'); assert.equal(n, 2);
  n = 0; await assert.rejects(() => calculerRoute({ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, 'pied', { fetchT: f }), /HTTP 502/); assert.equal(n, 1, 'pas de secours à pied : OSRM démo ne sait faire que la voiture');
  await assert.rejects(() => calculerRoute({ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, 'voiture', { fetchT: async () => reponse({ code: 'NoRoute' }) }), /NoRoute/);
  assert.equal((await calculerRoute({ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, 'avion', { fetchT: async () => reponse(OSRM) })).profil, 'voiture');
});
await t('formats : durée, kilomètres, liens externes', () => {
  assert.equal(duree(1), '1 minute'); assert.equal(duree(45), '45 minutes'); assert.equal(duree(60), '1 heure'); assert.equal(duree(135), '2 heures 15 minutes'); assert.equal(duree(61), '1 heure 1 minute');
  assert.equal(kmTexte(7.34), '7,3'); assert.equal(kmTexte(62.3), '62'); assert.equal(Object.keys(PROFILS).join(), 'voiture,velo,pied');
  assert.match(liensExternes({ lieu: { lat: 1, lon: 2 } }).osm, /openstreetmap\.org\/\?mlat=1&mlon=2/); assert.match(liensExternes({ route: true, a: { lat: 1, lon: 2 }, b: { lat: 3, lon: 4 }, profil: 'pied' }).osm, /fossgis_osrm_foot&route=1%2C2%3B3%2C4/);
});

/* ═════════ outils earth.* exposés au cerveau (js/rayle/terre-outils.js) ═════════ */
const appels = []; let reponseTheme = { ok: true, texte: 'Voici Castres.' }, ouvert = true;
const ctx = { console, echecsActions: [], RayleUnivers: { estOuvert: () => ouvert, ouvrir: async () => { appels.push(['ouvrir']); ouvert = true; }, commande: async (nom, a) => { appels.push([nom, plat(a)]); return reponseTheme; } } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/terre-outils.js', import.meta.url), 'utf8') + '\nglobalThis.T=RayleTerre; globalThis.AGENT=terreAgent;', ctx);
const T = ctx.T;
await t('les 4 outils sont définis avec nom, alias sans point, description et schéma JSON valide', () => {
  assert.deepEqual(plat(T.OUTILS.map(o => o.nom)), ['earth.show_place', 'earth.show_route', 'earth.show_devices', 'earth.set_zoom']);
  for (const o of T.OUTILS) { assert.equal(o.alias, o.nom.replace('.', '_')); assert.match(o.alias, /^[a-zA-Z0-9_-]{1,64}$/, 'nom accepté par les API'); assert.ok(o.description.length > 40); assert.equal(o.parametres.type, 'object'); for (const r of o.parametres.required) assert.ok(o.parametres.properties[r], r); }
  assert.deepEqual(plat(T.OUTILS[0].parametres.required), ['query']); assert.deepEqual(plat(T.OUTILS[1].parametres.required), ['to']); assert.deepEqual(plat(T.OUTILS[3].parametres.required), ['level']); assert.deepEqual(plat(T.OUTILS[1].parametres.properties.mode.enum), ['voiture', 'velo', 'pied']);
});
await t('earth.show_place(query) → commande « lieu » du thème, sous les deux noms', async () => {
  appels.length = 0; const r = await T.executer('earth.show_place', { query: 'Castres' }); assert.deepEqual(appels, [['lieu', { requete: 'Castres' }]]); assert.equal(r.texte, 'Voici Castres.');
  appels.length = 0; await T.executer('earth_show_place', { query: 'le Mont-Blanc', zoom: 'rue' }); assert.deepEqual(appels, [['lieu', { requete: 'le Mont-Blanc', zoom: 'rue' }]]);
  appels.length = 0; assert.equal((await T.executer('earth.show_place', {})).ok, false); assert.equal(appels.length, 0, 'sans lieu, on ne dérange pas la carte');
});
await t('earth.show_route(from, to, mode) → « itineraire » ; sans from = ma position ; mode normalisé', async () => {
  appels.length = 0; await T.executer('earth.show_route', { from: 'Castres', to: 'Toulouse', mode: 'pied' }); assert.deepEqual(appels, [['itineraire', { de: 'Castres', vers: 'Toulouse', profil: 'pied' }]]);
  appels.length = 0; await T.executer('earth_show_route', { to: 'Toulouse' }); assert.deepEqual(appels, [['itineraire', { de: null, vers: 'Toulouse', profil: 'voiture' }]]);
  appels.length = 0; await T.executer('earth.show_route', { to: 'Albi', mode: 'à vélo' }); assert.equal(appels[0][1].profil, 'velo');
  assert.equal((await T.executer('earth.show_route', {})).ok, false);
});
await t('earth.show_devices([device]) et earth.set_zoom(level)', async () => {
  appels.length = 0; await T.executer('earth.show_devices', {}); await T.executer('earth.show_devices', { device: 'téléphone' }); await T.executer('earth.set_zoom', { level: 'rue' }); await T.executer('earth.set_zoom', { level: 14 });
  assert.deepEqual(appels, [['appareils', { nom: '' }], ['appareils', { nom: 'téléphone' }], ['zoom-carte', { niveau: 'rue' }], ['zoom-carte', { niveau: 14 }]]);
  assert.equal((await T.executer('earth.set_zoom', {})).ok, false); assert.equal((await T.executer('earth.inconnu', {})).ok, false);
});
await t('Univers fermé : il s’ouvre tout seul ; WebGL absent ou échec : réponse honnête avec le lien OpenStreetMap', async () => {
  ouvert = false; appels.length = 0; await T.executer('earth.show_place', { query: 'Albi' }); assert.equal(appels[0][0], 'ouvrir'); assert.equal(appels[1][0], 'lieu');
  ctx.RayleUnivers.commande = async () => { throw new Error('WebGL indisponible : la carte détaillée ne peut pas s’afficher'); };
  const r = await T.executer('earth.show_place', { query: 'Albi' }); assert.equal(r.ok, false); assert.match(r.texte, /ne peut pas s’afficher/); assert.match(r.texte, /openstreetmap\.org\/search\?query=Albi/);
  ctx.RayleUnivers.commande = async (nom, a) => { appels.push([nom, plat(a)]); return reponseTheme; };
});
await t('action du Worker (type « terre ») : exécutée, et un échec REMPLACE la réponse (jamais « c’est fait » à tort)', async () => {
  reponseTheme = { ok: true, texte: 'Voici Castres.' }; ctx.echecsActions.length = 0;
  assert.equal(await ctx.AGENT({ type: 'terre', outil: 'earth_show_place', args: { query: 'Castres' } }), 'Voici Castres.'); assert.equal(ctx.echecsActions.length, 0);
  reponseTheme = { ok: false, texte: 'Je n’ai pas trouvé « Zzz » sur la carte, Justin.' };
  assert.equal(await ctx.AGENT({ type: 'terre', outil: 'earth.show_place', args: { query: 'Zzz' } }), ''); assert.deepEqual(plat(ctx.echecsActions), ['Je n’ai pas trouvé « Zzz » sur la carte, Justin.']);
  reponseTheme = { ok: true, texte: 'Voici Castres.' };
});

/* ═════════ phrases : carte.js (lieux, itinéraires) et commandes-univers.js (zoom, effacer) ═════════ */
const norme = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cc = { console, norm: norme, epoch: 0, errMsg: e => String(e && e.message || e), addLine() {} }; cc.window = cc; vm.createContext(cc);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/carte.js', import.meta.url), 'utf8') + '\nglobalThis.AN=analyserCarte; globalThis.CMD=commandeCarte; globalThis.VUE=()=>carteVue;', cc);
const AN = p => { const r = cc.AN(p); return r && plat(r); };
await t('phrases : « montre-moi Castres », « montre le Mont-Blanc », « où est … », cartes explicites', () => {
  assert.deepEqual(AN('montre-moi Castres'), { type: 'lieu', lieu: 'Castres', explicite: false });
  assert.deepEqual(AN('Montre le Mont-Blanc'), { type: 'lieu', lieu: 'Mont-Blanc', explicite: false });
  assert.deepEqual(AN('affiche la Corse'), { type: 'lieu', lieu: 'Corse', explicite: false });
  assert.deepEqual(AN('montre-moi la carte de Bordeaux'), { type: 'lieu', lieu: 'Bordeaux', explicite: true });
  assert.deepEqual(AN('où est la gare de Lyon ?'), { type: 'lieu', lieu: 'la gare de Lyon', explicite: false });
  assert.deepEqual(AN('montre Albi sur la carte'), { type: 'lieu', lieu: 'Albi', explicite: true });
});
await t('phrases : itinéraires (avec départ, depuis ma position, profil)', () => {
  assert.deepEqual(AN('itinéraire de Castres à Toulouse'), { type: 'route', de: 'Castres', vers: 'Toulouse', profil: 'voiture' });
  assert.deepEqual(AN('itinéraire jusqu’à Toulouse'), { type: 'route', de: null, vers: 'Toulouse', profil: 'voiture' });
  assert.deepEqual(AN('itinéraire de Bordeaux à Toulouse à pied'), { type: 'route', de: 'Bordeaux', vers: 'Toulouse', profil: 'pied' });
  assert.deepEqual(AN('emmène-moi à Albi à vélo'), { type: 'route', de: null, vers: 'Albi', profil: 'velo' });
});
await t('phrases : les autres commandes ne sont pas volées (terminal, Bitcoin, quelle heure…)', () => {
  for (const p of ['montre-moi le Terminal', 'montre le Bitcoin', 'affiche le Graphique', 'quelle heure est-il', 'bonjour Rayle', 'où est ma souris']) assert.equal(AN(p), null, p);
});
await t('commandeCarte : appelle earth.show_place / earth.show_route et garde le dernier repère (pour l’envoi vers un autre appareil)', async () => {
  const vus = []; cc.RayleTerre = { executer: async (nom, a) => { vus.push([nom, plat(a)]); return nom === 'earth.show_place' ? { ok: true, texte: 'Voici Castres.', lieu: { lat: 1, lon: 2, nom: 'Castres', court: 'Castres' } } : { ok: true, texte: 'De A à B.', a: { court: 'A' }, b: { court: 'B' }, profil: 'pied', route: { km: 1 } }; } };
  assert.equal(await cc.CMD('montre-moi Castres'), 'Voici Castres.'); assert.deepEqual(vus.at(-1), ['earth.show_place', { query: 'Castres' }]); assert.equal(cc.VUE().lieu.court, 'Castres');
  assert.equal(await cc.CMD('itinéraire de Castres à Albi à pied'), 'De A à B.'); assert.deepEqual(vus.at(-1), ['earth.show_route', { from: 'Castres', to: 'Albi', mode: 'pied' }]); assert.equal(cc.VUE().profil, 'pied');
  cc.RayleTerre = { executer: async () => ({ ok: false, texte: 'Je n’ai pas trouvé « Truc » sur la carte, Justin.' }) };
  assert.equal(await cc.CMD('montre-moi Truc'), null, 'une demande incertaine non trouvée part à l’IA'); assert.match(await cc.CMD('montre-moi la carte de Truc'), /pas trouvé/, 'une demande explicite reçoit la réponse');
  assert.equal(await cc.CMD('quelle heure est-il'), null);
});
{
  const etat = { ouvert: true, theme: 'espace', scene: { carte: { marqueurs: ['lieu'] } } }, ap = [];
  const cu = { console, document: { addEventListener() {}, getElementById: () => null, baseURI: 'http://x/' }, RayleBus: { on() {}, emit() {} }, RayleRangement: { estRange: () => false }, commandeLocalisation: () => null, epoch: 0, addLine() {}, speak: async () => {}, cutAll() {}, workerReady: () => false, wjson: async () => ({}) };
  cu.window = cu; vm.createContext(cu);
  vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-univers.js', import.meta.url), 'utf8') + '\nglobalThis.__a=analyserUnivers; globalThis.__c=commandeUnivers;', cu);
  cu.RayleUnivers = cu.window.RayleUnivers = { estOuvert: () => etat.ouvert, etat: () => etat, ouvrir: async () => { etat.ouvert = true; }, commande: async (nom, a) => { ap.push([nom, plat(a)]); return { ok: true, texte: 'ok ' + nom }; }, charger: async () => ({}), fermer: async () => {} };
  const A = p => { const r = cu.__a(p); return r && plat(r); };
  await t('phrases : zoom par niveau (« zoome niveau rue », « zoom 12 », « zoome sur les villes »)', () => {
    assert.deepEqual(A('zoome niveau rue'), { type: 'espace', action: 'zoom-carte', niveau: 'rue' }); assert.equal(A('zoom niveau 12').niveau, '12'); assert.equal(A('mets le zoom au niveau 14').niveau, '14');
    assert.equal(A('zoome sur les villes').niveau, 'villes'); assert.equal(A('zoom département').niveau, 'departement'); assert.equal(A('passe en vue pays').niveau, 'pays'); assert.equal(A('zoome au niveau de la rue').niveau, 'rue');
    assert.equal(A('zoome').action, 'zoom', '« zoome » seul reste un zoom relatif'); assert.notEqual(A('zoome sur Lyon') && A('zoome sur Lyon').action, 'zoom-carte', 'une ville n’est pas un niveau de zoom');
  });
  await t('phrases : efface les repères (seulement s’il y en a), zoom exécuté par le thème', async () => {
    assert.deepEqual(A('efface les repères'), { type: 'espace', action: 'effacer-carte' }); assert.equal(A('enlève le marqueur').action, 'effacer-carte'); assert.equal(A('retire l’itinéraire').action, 'effacer-carte');
    ap.length = 0; assert.equal(await cu.__c('zoome niveau rue'), 'ok zoom-carte'); assert.deepEqual(ap.at(-1), ['zoom-carte', { nom: undefined, oui: undefined, type: undefined, vitesse: undefined, pause: undefined, reelle: undefined, presenter: undefined, rover: undefined, facteur: undefined, niveau: 'rue' }].map(x => plat(x)));
    assert.equal(await cu.__c('efface les repères'), 'ok effacer-carte');
    etat.scene = { carte: { marqueurs: [] } }; assert.equal(await cu.__c('efface les repères'), null, 'rien à effacer : laissé aux autres commandes (points du globe)');
    etat.ouvert = false; assert.equal(await cu.__c('zoome niveau rue'), null, 'Univers fermé : pas pour nous');
  });
}
console.log(ok + ' tests réussis');
