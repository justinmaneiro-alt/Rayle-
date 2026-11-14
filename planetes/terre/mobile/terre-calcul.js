/* Calculs PURS de la Terre mobile (sans navigateur, testés) : position du Soleil, conversions lat/lon ↔ vecteur, choix de la résolution, séismes. */
export const RAYON = 1;
const RAD = Math.PI / 180;

/* point sous le Soleil (déclinaison + angle horaire) à partir d'une date : précision de l'ordre du degré, suffisante pour le terminateur */
export function pointSousSoleil(ms) {
  const d = new Date(ms), j = ms / 86400000 + 2440587.5 - 2451545.0;                 // jours depuis J2000
  const L = (280.460 + 0.9856474 * j) % 360, g = ((357.528 + 0.9856003 * j) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, eps = (23.439 - 0.0000004 * j) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = ((18.697374558 + 24.06570982441908 * j) % 24 + 24) % 24;             // heures
  let lon = (alpha / RAD) - gmst * 15; lon = ((lon + 540) % 360) - 180;
  return { lat: decl / RAD, lon, date: d };
}
/* lat/lon (degrés) → vecteur ; convention de la sphère de Three.js (texture équirectangulaire) : lon 0 / lat 0 vers +X, l'est vers -Z, le nord vers +Y */
export function versVecteur(lat, lon, r = RAYON) { const la = lat * RAD, lo = lon * RAD; return { x: r * Math.cos(la) * Math.cos(lo), y: r * Math.sin(la), z: -r * Math.cos(la) * Math.sin(lo) }; }
export function depuisVecteur({ x, y, z }) { const r = Math.hypot(x, y, z) || 1; return { lat: Math.asin(y / r) / RAD, lon: Math.atan2(-z, x) / RAD }; }
/* intersection d'un rayon (origine o, direction d normalisée) avec la sphère unité : point ou null (premier contact, côté caméra) */
export function toucherSphere(o, d, r = RAYON) { const b = o.x * d.x + o.y * d.y + o.z * d.z, c = o.x * o.x + o.y * o.y + o.z * o.z - r * r, disc = b * b - c; if (disc < 0) return null; const t = -b - Math.sqrt(disc); if (t < 0) return null; return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t }; }
/* distance angulaire (degrés) entre deux points lat/lon */
export function distanceAngulaire(a, b) { const A = versVecteur(a.lat, a.lon), B = versVecteur(b.lat, b.lon); return Math.acos(Math.max(-1, Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z))) / RAD; }
/* code météo Open-Meteo (WMO) → texte français */
export function texteMeteo(code) { const T = { 0: 'ciel dégagé', 1: 'peu nuageux', 2: 'partiellement nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard givrant', 51: 'bruine légère', 53: 'bruine', 55: 'bruine forte', 61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 71: 'neige faible', 73: 'neige', 75: 'forte neige', 80: 'averses', 81: 'averses fortes', 82: 'averses violentes', 95: 'orage', 96: 'orage et grêle', 99: 'orage violent' }; return T[code] || 'conditions inconnues'; }

/* résolution des textures selon l'appareil : { basse: toujours, haute: null | '4k' } ; jamais plus que la texture maximale du GPU ni la mémoire disponible */
export function choisirResolution({ maxTexture = 4096, memoireGo = 4, mode = 'telephone', qualite = 'auto', economie = false } = {}) {
  if (qualite === 'economie' || economie) return { basse: '1k', haute: null, nuages: false, etoiles: 300, ratio: 1 };
  const peutHaute = maxTexture >= 4096 && (memoireGo >= 3 || qualite === 'elevee');
  if (qualite === 'elevee') return { basse: '1k', haute: peutHaute ? '4k' : null, nuages: true, etoiles: 900, ratio: Math.min(2, mode === 'pc' ? 2 : 2) };
  return { basse: '1k', haute: peutHaute ? '4k' : null, nuages: mode !== 'telephone' || memoireGo >= 4, etoiles: mode === 'telephone' ? 450 : 800, ratio: mode === 'telephone' ? 2 : 2 };
}

/* séismes USGS (GeoJSON) → liste triée par magnitude décroissante ; jamais de valeur inventée : champs absents ignorés */
export function lireSeismes(geojson, max = 60) {
  const F = geojson && Array.isArray(geojson.features) ? geojson.features : [];
  return F.map(f => { const c = f.geometry && f.geometry.coordinates, p = f.properties || {}; if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !Number.isFinite(p.mag)) return null;
    return { id: f.id, lon: c[0], lat: c[1], prof: Number.isFinite(c[2]) ? c[2] : null, mag: p.mag, lieu: p.place || '', t: p.time, lien: /^https:\/\/earthquake\.usgs\.gov\//.test(p.url || '') ? p.url : null }; })
    .filter(Boolean).sort((a, b) => b.mag - a.mag).slice(0, max);
}
export const rayonSeisme = mag => 0.006 + Math.max(0, mag - 2) * 0.004;
export const couleurSeisme = mag => (mag >= 6 ? '#ff5d5d' : mag >= 5 ? '#ff9c4a' : mag >= 4 ? '#f1d34f' : '#8fd0e3');

/* progression du chargement : fichiers pondérés par leur taille (octets) */
export function progression(etats) { let tot = 0, fait = 0; for (const e of Object.values(etats)) { tot += e.total || 0; fait += Math.min(e.charge || 0, e.total || 0); } return tot > 0 ? Math.max(0, Math.min(1, fait / tot)) : 0; }

/* inertie de la rotation au doigt : applique un amortissement ; renvoie la nouvelle vitesse (rad/s) */
export const amortir = (v, dt, k = 3.2) => (Math.abs(v) < 0.002 ? 0 : v * Math.exp(-k * dt));
export const limiterLat = lat => Math.max(-85, Math.min(85, lat));
export const limiterDistance = d => Math.max(1.35, Math.min(9, d));
