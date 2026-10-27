/* ═════════════ RECHERCHE DE LIEUX ═════════════
   Open-Meteo Geocoding API (gratuit, sans clé, données GeoNames, CC BY 4.0) : https://open-meteo.com/en/docs/geocoding-api
   Appelée directement par le navigateur avec le texte tapé ; aucune donnée de localisation de Justin ne passe par ici.
   `fetchFn` est injectable pour les tests (faux serveur). Source en panne → l'erreur remonte, l'appelant dit « indisponible ». */
export const ADRESSE = (typeof globalThis !== 'undefined' && globalThis.__RAYLE_TERRE_TEST__ && globalThis.__RAYLE_TERRE_TEST__.geocodage) || 'https://geocoding-api.open-meteo.com/v1/search';

/* Distance caméra (km) adaptée au type de lieu (code GeoNames). */
export function distanceVol(code) {
  const c = String(code || '');
  if (/^PCL/.test(c)) return 3200;               // pays
  if (c === 'ADM1') return 700;                  // région
  if (c === 'ADM2') return 160;                  // département
  if (c === 'PPLC') return 28;                   // capitale
  if (/^PPLA/.test(c)) return 18;                // chef-lieu
  if (/^PPL/.test(c)) return 9;                  // ville, village
  if (/^(MT|MTS|PK|VLC)/.test(c)) return 30;     // montagne, volcan
  if (/^(SEA|OCN|GULF|BAY)/.test(c)) return 2500;
  return 14;
}
export function nettoyer(r) {
  return {
    nom: r.name, pays: r.country || null, codePays: r.country_code || null, region: r.admin1 || null, lat: r.latitude, lon: r.longitude, code: r.feature_code || null,
    population: r.population || null, altitude: Number.isFinite(r.elevation) ? r.elevation : null, distance: distanceVol(r.feature_code)
  };
}
export async function chercher(texte, { fetchFn = (...a) => fetch(...a), langue = 'fr', n = 5, signal } = {}) {
  const q = String(texte || '').trim();
  if (q.length < 2) return [];
  const u = `${ADRESSE}?name=${encodeURIComponent(q)}&count=${n}&language=${langue}&format=json`;
  const rep = await fetchFn(u, { signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
  if (!rep.ok) throw new Error('recherche indisponible (HTTP ' + rep.status + ')');
  const j = await rep.json();
  return (j.results || []).filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).map(nettoyer);
}
export const libelle = r => [r.nom, r.region && r.region !== r.nom ? r.region : null, r.pays && r.pays !== r.nom ? r.pays : null].filter(Boolean).join(', ');
