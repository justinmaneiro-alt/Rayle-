// Météo et heure réelles du thème « Bataille navale » : vent, pluie, orage, brouillard, nuages, houle, aube / jour / crépuscule / nuit.
// Source unique : le moteur d'ambiance de Raylé (RayleUI.ambiance : Open-Meteo, sans clé, position de l'appareil ou lieu des Réglages, cache de 15 min). S'il manque (hors de la page),
// repli sur un appel direct à Open-Meteo avec la position donnée ; sans réseau : ciel clair, vent faible (et la source « simulée » est annoncée).
// Fonctions pures (testées) : houleDepuisVent(), echelleBeaufort(), phaseJournee(), directionTexte(), lireMeteo(options).
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* quota */ } };

// Hauteur significative de la houle (m) pour un vent établi (modèle de mer pleinement développée : Hs ≈ 0,0246 U², U en m/s), bornée pour rester lisible à l'écran
export function houleDepuisVent(ms) { const h = .0246 * ms * ms; return Math.max(.35, Math.min(5.5, h)); }
export function echelleBeaufort(ms) {
  const lim = [.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7], noms = ['calme', 'très légère brise', 'légère brise', 'petite brise', 'jolie brise', 'bonne brise', 'vent frais', 'grand frais', 'coup de vent', 'fort coup de vent', 'tempête', 'violente tempête', 'ouragan'];
  let i = 0; while (i < lim.length && ms >= lim[i]) i++; return { force: i, nom: noms[i] };
}
export function directionTexte(deg) { const n = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est', 'est-sud-est', 'sud-est', 'sud-sud-est', 'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest']; return n[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }
// altitude du Soleil (degrés) → moment : même seuils que ui/astro.js
export function phaseJournee(alt, matin) { if (alt > 6) return 'jour'; if (alt < -6) return 'nuit'; return matin ? 'aube' : 'crepuscule'; }
const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// WMO : 0 clair · 1-3 nuageux · 45/48 brouillard · 51-57 bruine · 61-67 pluie · 71-77 neige · 80-82 averses · 95-99 orage
export function depuisCodeWMO(code, nuagesPct = 0) {
  const c = +code || 0; return {
    nuages: Math.max(nuagesPct / 100, c >= 3 ? .85 : c >= 1 ? .35 : 0, c >= 45 ? .9 : 0), brouillard: c === 45 || c === 48 ? .8 : 0,
    pluie: (c >= 51 && c <= 57) ? .35 : (c >= 61 && c <= 67) || (c >= 80 && c <= 82) ? (c >= 65 || c >= 82 ? .9 : .6) : c >= 95 ? .9 : 0, orage: c >= 95 ? (c >= 96 ? 1 : .8) : 0, neige: c >= 71 && c <= 77 ? .7 : 0,
  };
}
const meteoDefaut = (lat, lon) => ({ source: 'simulée (réseau indisponible)', lieu: 'position inconnue', lat, lon, nuages: .2, pluie: 0, orage: 0, brouillard: 0, ventMs: 5, ventDir: 250, temperature: null, jour: 1 });

// lit la météo du moment ; renvoie un objet normalisé {source, lieu, lat, lon, nuages, pluie, orage, brouillard, ventMs, ventDir (d'où vient le vent, degrés), houle, beaufort, moment, soleilAlt, jour 0..1}
export async function lireMeteo({ lat, lon, ts = Date.now() } = {}) {
  const UI = typeof window !== 'undefined' ? window.RayleUI : null, A = UI && UI.astro;
  let m = null;
  try {
    const amb = UI && UI.ambiance;
    if (amb && amb.etat) {
      const e = amb.etat(), l = amb.lisse ? amb.lisse() : {};
      if (e && e.lieu) { lat = lat == null ? e.lieu.lat : lat; lon = lon == null ? e.lieu.lon : lon; }
      if (e && e.vent) m = { source: 'ambiance Raylé (Open-Meteo)', lieu: (e.lieu && e.lieu.nom) || '', lat, lon, nuages: l.nuages != null ? l.nuages : (e.meteo === 'nuageux' ? .8 : .2), pluie: Math.max(l.pluie || 0, e.meteo === 'pluie' || e.meteo === 'orage' ? .8 : 0), orage: l.orage || (e.meteo === 'orage' ? 1 : 0), brouillard: l.brouillard || 0, ventMs: Math.max(0, (e.vent.kmh || 0) / 3.6), ventDir: e.vent.direction || 0, temperature: e.temperature };
    }
  } catch (er) { /* on tente l'appel direct */ }
  if (!m && lat != null && lon != null) {
    try {
      const cle = 'rayle_navale_meteo_' + lat.toFixed(1) + '_' + lon.toFixed(1), c = JSON.parse(lsGet(cle) || 'null');
      if (c && Date.now() - c.t < 15 * 60e3) m = c.v;
      else {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) + '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation&wind_speed_unit=ms&timezone=auto');
        if (!r.ok) throw new Error('Open-Meteo ' + r.status);
        const d = (await r.json()).current, w = depuisCodeWMO(d.weather_code, d.cloud_cover);
        m = Object.assign({ source: 'Open-Meteo', lieu: '', lat, lon, ventMs: d.wind_speed_10m, ventDir: d.wind_direction_10m, temperature: d.temperature_2m }, w); lsSet(cle, JSON.stringify({ t: Date.now(), v: m }));
      }
    } catch (e) { m = null; }
  }
  if (!m) m = meteoDefaut(lat == null ? 46 : lat, lon == null ? 2 : lon);
  // houle : mesure réelle (API marine) si on est en mer, sinon déduite du vent
  m.houle = houleDepuisVent(m.ventMs); m.houleSource = 'déduite du vent';
  m.beaufort = echelleBeaufort(m.ventMs); m.ventTexte = directionTexte(m.ventDir);
  // jour / nuit : Soleil réel au lieu et à l'heure donnés
  if (A && m.lat != null) { const p = A.position(ts, m.lat, m.lon); m.soleilAlt = p.altitude; m.moment = phaseJournee(p.altitude, p.matin); m.jour = lisse(-8, 12, p.altitude); m.lune = A.lune(ts); }
  else { m.soleilAlt = 40; m.moment = 'jour'; m.jour = 1; m.lune = { phase: .5, eclairee: 1 }; }
  return m;
}
// météo imposée (test, « mets une tempête », « fais nuit ») : surcharge des valeurs
export function surcharger(m, o = {}) {
  const r = Object.assign({}, m);
  if (o.moment) { r.moment = o.moment; r.jour = { jour: 1, aube: .5, crepuscule: .45, nuit: 0 }[o.moment]; r.soleilAlt = { jour: 45, aube: 2, crepuscule: -1, nuit: -30 }[o.moment]; }
  if (o.meteo === 'tempete') Object.assign(r, { ventMs: 22, nuages: 1, pluie: .9, orage: 1 });
  else if (o.meteo === 'pluie') Object.assign(r, { ventMs: Math.max(r.ventMs, 9), nuages: .9, pluie: .8, orage: 0 });
  else if (o.meteo === 'brouillard') Object.assign(r, { ventMs: Math.min(r.ventMs, 3), nuages: .6, brouillard: .9, pluie: 0, orage: 0 });
  else if (o.meteo === 'clair') Object.assign(r, { nuages: .15, pluie: 0, orage: 0, brouillard: 0 });
  else if (o.meteo === 'calme') Object.assign(r, { ventMs: 1.5, nuages: .25, pluie: 0, orage: 0 });
  if (o.vent != null) r.ventMs = o.vent;
  r.houle = houleDepuisVent(r.ventMs); r.beaufort = echelleBeaufort(r.ventMs); r.ventTexte = directionTexte(r.ventDir);
  return r;
}
export function resume(m) {
  const qs = [];
  qs.push(m.moment === 'nuit' ? 'Il fait nuit' : m.moment === 'aube' ? 'C’est l’aube' : m.moment === 'crepuscule' ? 'C’est le crépuscule' : 'Il fait jour');
  qs.push('vent de ' + m.ventTexte + ', force ' + m.beaufort.force + ' (' + m.beaufort.nom + '), ' + Math.round(m.ventMs * 3.6) + ' kilomètres par heure');
  if (m.orage > .3) qs.push('orage'); else if (m.pluie > .3) qs.push('pluie'); if (m.brouillard > .3) qs.push('brouillard'); else if (m.nuages > .7) qs.push('ciel couvert'); else if (m.nuages < .25) qs.push('ciel dégagé');
  qs.push('houle d’environ ' + m.houle.toFixed(1).replace('.', ',') + ' mètre' + (m.houle >= 2 ? 's' : ''));
  return qs.join(', ') + '.';
}
