// Lieux et itinéraires de la carte de la Terre : géocodage gratuit avec cache et respect des limites, calcul d'itinéraire.
// Aucun accès au DOM : tout le réseau passe par `fetchT` (injectable), ce qui permet de tout tester hors ligne (tests/terre-carte-test.mjs).
//
// Ordre de recherche d'un lieu (le premier qui répond gagne) :
//   1. mémoire de la session et cache durable (localStorage, 30 jours) ;
//   2. lieux déjà connus de Raylé (grandes villes, capitales, monuments : aucun réseau) ;
//   3. adresse de France (numéro + rue, code postal) → API Adresse / Géoplateforme (data.geopf.fr, repli api-adresse.data.gouv.fr) ;
//   4. nom de commune de France → geo.api.gouv.fr (la plus peuplée l'emporte : « Castres » = Tarn, pas Aisne) ;
//   5. tout le reste du monde → Nominatim (1 requête par seconde au plus, file d'attente, résultats gardés) ;
//   6. repli : si Nominatim est injoignable, l'API Adresse pour un nom de France.
// Itinéraires : routing.openstreetmap.de (voiture, vélo, à pied), secours OSRM de démonstration (voiture), en usage léger.
import { zoomPourLieu } from './carte-style.js?v=2026.10.15.7';

export const SERVICES = {
  nominatim: 'https://nominatim.openstreetmap.org/search',
  adresse: ['https://data.geopf.fr/geocodage/search', 'https://api-adresse.data.gouv.fr/search/'],
  communes: 'https://geo.api.gouv.fr/communes',
  routage: { voiture: 'routed-car', velo: 'routed-bike', pied: 'routed-foot' },
};
export const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`´]/g, ' ').replace(/[^a-z0-9 ,-]/g, ' ').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();

const CLE_CACHE = 'rayle_geo_cache_v2', DUREE_CACHE = 30 * 864e5, MAX_CACHE = 160;
const RE_ADRESSE = /(?:^|\s)\d{1,4}\s*(?:bis|ter)?\s*,?\s+(?:rue|avenue|av|boulevard|bd|chemin|route|impasse|place|allee|quai|cours|passage|square|lotissement|cite|residence|faubourg|esplanade|rond point|zone|za|zac)\b|\b\d{5}\b/;
const RE_NOM_SIMPLE = /^[a-z][a-z' -]{1,48}$/;

// Fetch avec délai maximal ; `fetchT(url, options, ms)` renvoie une Response (ou équivalent : ok, status, json())
export function fetchDelai(url, options = {}, ms = 12000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  return fetch(url, Object.assign({}, options, ctrl ? { signal: ctrl.signal } : {})).finally(() => { if (t) clearTimeout(t); });
}
function boiteDe(coords) {          // [[lon,lat],…] imbriqués → [sud, nord, ouest, est]
  let s = 90, n = -90, o = 180, e = -180;
  const parcours = a => { if (typeof a[0] === 'number') { if (a[1] < s) s = a[1]; if (a[1] > n) n = a[1]; if (a[0] < o) o = a[0]; if (a[0] > e) e = a[0]; } else for (const x of a) parcours(x); };
  parcours(coords); return s <= n ? [s, n, o, e] : null;
}
const typeAdresse = t => ({ housenumber: 'house', street: 'street', locality: 'locality', municipality: 'city', poi: 'poi' }[t] || t || 'place');

export function creerGeocodeur(opts = {}) {
  const fetchT = opts.fetchT || fetchDelai, maintenant = opts.maintenant || (() => Date.now()), pause = opts.pause || (ms => new Promise(r => setTimeout(r, ms)));
  const intervalle = opts.intervalle != null ? opts.intervalle : 1100, stockage = opts.stockage || null, connus = opts.connus || null;
  const zone = String(opts.zone || '-2,42,8,46').replace(/[^0-9.,-]/g, '');          // zone favorisée (sans exclure le reste du monde) : un homonyme du sud de la France gagne
  const memoire = new Map(); const stats = { requetes: 0, cache: 0, nominatim: 0, adresse: 0, communes: 0, connus: 0, echecs: 0 };
  let dernier = 0, file = Promise.resolve();

  // cache durable
  let durable = null;
  function lireDurable() {
    if (durable) return durable;
    try { durable = stockage ? JSON.parse(stockage.getItem(CLE_CACHE) || '{}') : {}; } catch (e) { durable = {}; }
    return durable;
  }
  function ecrireDurable(cle, lieu) {
    const d = lireDurable(); d[cle] = { t: maintenant(), lieu };
    const cles = Object.keys(d); if (cles.length > MAX_CACHE) for (const k of cles.sort((a, b) => d[a].t - d[b].t).slice(0, cles.length - MAX_CACHE)) delete d[k];
    try { stockage && stockage.setItem(CLE_CACHE, JSON.stringify(d)); } catch (e) { /* stockage plein ou refusé : le cache de session suffit */ }
  }
  function depuisCache(cle) {
    if (memoire.has(cle)) return { lieu: memoire.get(cle) };
    const d = lireDurable()[cle];
    if (d && maintenant() - d.t < DUREE_CACHE) { memoire.set(cle, d.lieu); return { lieu: d.lieu }; }
    return null;
  }

  async function json(url, ms) {
    stats.requetes++;
    const r = await fetchT(url, { headers: { Accept: 'application/json' } }, ms || 12000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  // Nominatim : une requête par seconde au plus, en file (conditions d'usage), jamais en rafale
  function nominatim(q) {
    const tache = file.then(async () => {
      const attente = dernier + intervalle - maintenant(); if (attente > 0) await pause(attente);
      dernier = maintenant(); stats.nominatim++;
      const l = await json(SERVICES.nominatim + '?format=jsonv2&limit=1&accept-language=fr&viewbox=' + zone + '&q=' + encodeURIComponent(q));
      const p = l && l[0]; if (!p) return null;
      const nom = String(p.display_name || q);
      return { lat: +p.lat, lon: +p.lon, nom, court: String(p.name || nom).split(',')[0], box: p.boundingbox ? p.boundingbox.map(Number) : null, type: (p.addresstype || p.type || p.category || 'place'), categorie: p.category, source: 'OpenStreetMap (Nominatim)' };
    });
    file = tache.catch(() => {});
    return tache;
  }
  async function adresse(q) {
    let derniere;
    for (const base of SERVICES.adresse) {
      try {
        stats.adresse++;
        const d = await json(base + '?limit=1&q=' + encodeURIComponent(q));
        const f = d && d.features && d.features[0]; if (!f) return null;
        const pr = f.properties || {}, [lon, lat] = f.geometry.coordinates;
        return { lat, lon, nom: pr.label || q, court: pr.name || pr.city || String(pr.label || q).split(',')[0], box: null, type: typeAdresse(pr.type), source: 'API Adresse (data.gouv.fr)', ville: pr.city, codePostal: pr.postcode };
      } catch (e) { derniere = e; }
    }
    throw derniere || new Error('API Adresse indisponible');
  }
  async function commune(q) {
    stats.communes++;
    const l = await json(SERVICES.communes + '?nom=' + encodeURIComponent(q) + '&fields=nom,centre,population,departement,contour&boost=population&limit=4');
    const cible = norm(q);
    const meilleurs = (l || []).filter(c => norm(c.nom) === cible).sort((a, b) => (b.population || 0) - (a.population || 0));
    const c = meilleurs[0]; if (!c || !c.centre) return null;
    const dep = c.departement ? ', ' + c.departement.nom : '';
    return { lat: c.centre.coordinates[1], lon: c.centre.coordinates[0], nom: c.nom + dep + ', France', court: c.nom, box: c.contour ? boiteDe(c.contour.coordinates) : null, type: 'city', population: c.population, departement: c.departement && c.departement.nom, source: 'geo.api.gouv.fr (communes de France)' };
  }

  async function geocoder(q) {
    const brut = String(q == null ? '' : q).trim(); if (!brut) return null;
    const cle = norm(brut); if (!cle) return null;
    const c = depuisCache(cle); if (c) { stats.cache++; return c.lieu; }
    let lieu = null, erreur = null;
    if (connus) { try { lieu = connus(brut); } catch (e) { lieu = null; } if (lieu) { stats.connus++; lieu = Object.assign({ court: lieu.nom, box: null, source: 'lieux connus de Raylé' }, lieu); } }
    if (!lieu && RE_ADRESSE.test(norm(brut))) { try { lieu = await adresse(brut); } catch (e) { erreur = e; } }
    if (!lieu && RE_NOM_SIMPLE.test(cle) && !/\b(?:france|espagne|italie|allemagne|usa|etats unis|canada|royaume uni)\b/.test(cle)) { try { lieu = await commune(brut); } catch (e) { erreur = e; } }
    if (!lieu) {
      try { lieu = await nominatim(brut); erreur = null; }
      catch (e) { erreur = e; if (RE_NOM_SIMPLE.test(cle)) { try { lieu = await adresse(brut); erreur = null; } catch (e2) { /* on garde l'erreur de Nominatim */ } } }
    }
    if (!lieu && erreur) { stats.echecs++; throw erreur; }       // réseau coupé : pas de cache d'un « introuvable » qui n'en est pas un
    if (lieu) { lieu.zoom = lieu.zoom != null ? lieu.zoom : zoomPourLieu(lieu); ecrireDurable(cle, lieu); }
    memoire.set(cle, lieu);
    return lieu;
  }
  return { geocoder, memoire, stats, vider() { memoire.clear(); durable = {}; try { stockage && stockage.setItem(CLE_CACHE, '{}'); } catch (e) { /* rien */ } }, nominatim, adresse, commune };
}

/* ───── itinéraires ───── */
export const PROFILS = { voiture: { url: 'routed-car', lib: 'en voiture', ico: '🚗' }, velo: { url: 'routed-bike', lib: 'à vélo', ico: '🚲' }, pied: { url: 'routed-foot', lib: 'à pied', ico: '🚶' } };
export async function calculerRoute(a, b, profil = 'voiture', { fetchT = fetchDelai } = {}) {
  if (!PROFILS[profil]) profil = 'voiture';
  const coord = a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat, fin = '?overview=full&geometries=geojson&steps=false';
  const essais = ['https://routing.openstreetmap.de/' + PROFILS[profil].url + '/route/v1/driving/' + coord + fin];
  if (profil === 'voiture') essais.push('https://router.project-osrm.org/route/v1/driving/' + coord + fin);
  let derniere;
  for (const u of essais) {
    try {
      const res = await fetchT(u, {}, 15000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (d.code !== 'Ok' || !d.routes || !d.routes[0]) throw new Error(d.code || 'aucun itinéraire');
      const r = d.routes[0];
      return { km: r.distance / 1000, min: r.duration / 60, coords: r.geometry.coordinates.map(c => [c[1], c[0]]), via: /openstreetmap\.de/.test(u) ? 'FOSSGIS' : 'OSRM', profil };
    } catch (e) { derniere = e; }
  }
  throw derniere || new Error('itinéraire indisponible');
}
export const duree = min => { const m = Math.round(min); if (m < 60) return m + ' minute' + (m > 1 ? 's' : ''); const h = Math.floor(m / 60), r = m % 60; return h + (h > 1 ? ' heures' : ' heure') + (r ? ' ' + r + (r > 1 ? ' minutes' : ' minute') : ''); };
export const kmTexte = km => km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : String(Math.round(km));
// Lien d'itinéraire / de lieu vers un service externe (le « pied » des anciens panneaux)
export function liensExternes(vue) {
  if (vue.route) return { osm: 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_' + ({ voiture: 'car', velo: 'bike', pied: 'foot' })[vue.profil] + '&route=' + vue.a.lat + '%2C' + vue.a.lon + '%3B' + vue.b.lat + '%2C' + vue.b.lon };
  return { osm: 'https://www.openstreetmap.org/?mlat=' + vue.lieu.lat + '&mlon=' + vue.lieu.lon + '#map=15/' + vue.lieu.lat + '/' + vue.lieu.lon };
}
