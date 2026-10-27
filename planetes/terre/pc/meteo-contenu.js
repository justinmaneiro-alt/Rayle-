/* ═════════════ CONTENU DE LA FENÊTRE MÉTÉO (pur) ═════════════
   Réponse du Worker (/meteo, données Open-Meteo) → textes français, icônes et tracés. Une valeur absente reste null et s'affiche « indisponible ». */
/* Codes météo WMO (https://open-meteo.com/en/docs) → texte français et icône */
const WMO = {
  0: ['Ciel dégagé', 'soleil'], 1: ['Plutôt dégagé', 'soleil-nuage'], 2: ['Partiellement nuageux', 'soleil-nuage'], 3: ['Couvert', 'nuage'],
  45: ['Brouillard', 'brouillard'], 48: ['Brouillard givrant', 'brouillard'],
  51: ['Bruine légère', 'pluie'], 53: ['Bruine', 'pluie'], 55: ['Bruine dense', 'pluie'], 56: ['Bruine verglaçante', 'pluie'], 57: ['Bruine verglaçante dense', 'pluie'],
  61: ['Pluie faible', 'pluie'], 63: ['Pluie', 'pluie'], 65: ['Pluie forte', 'pluie'], 66: ['Pluie verglaçante', 'pluie'], 67: ['Pluie verglaçante forte', 'pluie'],
  71: ['Neige faible', 'neige'], 73: ['Neige', 'neige'], 75: ['Neige forte', 'neige'], 77: ['Grains de neige', 'neige'],
  80: ['Averses faibles', 'pluie'], 81: ['Averses', 'pluie'], 82: ['Averses violentes', 'pluie'], 85: ['Averses de neige', 'neige'], 86: ['Fortes averses de neige', 'neige'],
  95: ['Orage', 'orage'], 96: ['Orage avec grêle', 'orage'], 99: ['Orage violent avec grêle', 'orage']
};
export const decrire = code => (code in WMO ? WMO[code][0] : null);
export const icone = code => (code in WMO ? WMO[code][1] : 'inconnu');
const ROSE = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est', 'est-sud-est', 'sud-est', 'sud-sud-est', 'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];
const ROSE_COURTE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export const directionVent = deg => (Number.isFinite(deg) ? ROSE[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : null);   // d'où vient le vent
export const directionCourte = deg => (Number.isFinite(deg) ? ROSE_COURTE[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : null);
export const nombre = (v, dec = 0, unite = '') => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dec).replace('.', ',') + unite : 'indisponible');
export const jourSemaine = (iso, i) => (i === 0 ? 'Aujourd’hui' : new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''));
export const heure = iso => String(iso || '').slice(11, 16).replace(':', ' h ').replace(/ h 00$/, ' h');
/* Intensité de pluie pour l'animation (0 à 1) à partir des mm de la dernière heure : « faible » ~0,1 mm, « forte » ≥ 4 mm */
export const intensitePluie = mm => (Number.isFinite(mm) && mm > 0 ? Math.min(1, Math.log10(1 + mm * 6) / Math.log10(25)) : 0);

/* Tracé des 24 prochaines heures : température (courbe) et pluie (barres) dans un cadre l×h. Renvoie des données de dessin, pas du HTML. */
export function tracerHeures(heures, l = 300, h = 70, marge = 6) {
  const pts = (heures || []).filter(x => Number.isFinite(x.temp));
  if (pts.length < 2) return null;
  const tmin = Math.min(...pts.map(p => p.temp)), tmax = Math.max(...pts.map(p => p.temp)), ecart = Math.max(tmax - tmin, 2);
  const pluieMax = Math.max(2, ...pts.map(p => p.pluie || 0));
  const dx = (l - 2 * marge) / (heures.length - 1);
  const x = i => marge + i * dx, y = t => marge + (1 - (t - tmin) / ecart) * (h - 2 * marge - 12);
  const courbe = heures.map((p, i) => (Number.isFinite(p.temp) ? [x(i), y(p.temp)] : null));
  const chemin = courbe.reduce((s, q, i) => (q ? s + (s && courbe[i - 1] ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1) : s), '');
  const barres = heures.map((p, i) => ({ x: x(i) - dx * 0.35, l: dx * 0.7, h: ((p.pluie || 0) / pluieMax) * 14, y: h - marge, mm: p.pluie || 0 }));
  return { chemin, barres, tmin, tmax, largeur: l, hauteur: h, labels: [{ x: x(0), t: heure(heures[0].h) }, { x: x(Math.floor(heures.length / 2)), t: heure(heures[Math.floor(heures.length / 2)].h) }, { x: x(heures.length - 1), t: heure(heures[heures.length - 1].h) }] };
}
/* Total de pluie annoncée sur les 24 prochaines heures (mm), ou null si le modèle ne le donne pas */
export const pluie24h = heures => { const v = (heures || []).map(h => h.pluie).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) : null; };

/* Phrase que Raylé peut dire : uniquement les valeurs reçues. */
export function phraseMeteo(m, nomLieu) {
  const a = m && m.actuel; if (!a || a.temp === null) return 'La météo est indisponible pour ce lieu.';
  const p = [];
  p.push('Météo' + (nomLieu ? ' à ' + nomLieu : '') + ' : ' + Math.round(a.temp) + ' degrés' + (decrire(a.code) ? ', ' + decrire(a.code).toLowerCase() : '') + '.');
  if (a.vent !== null) p.push('Vent ' + (directionVent(a.direction) ? 'de ' + directionVent(a.direction) + ', ' : '') + Math.round(a.vent) + ' kilomètres par heure.');
  const j = m.jours && m.jours[0]; if (j && j.tmax !== null && j.tmin !== null) p.push('Aujourd’hui, entre ' + Math.round(j.tmin) + ' et ' + Math.round(j.tmax) + ' degrés.');
  const mm = pluie24h(m.heures); if (mm !== null) p.push(mm < 0.1 ? 'Pas de pluie annoncée dans les vingt-quatre heures.' : 'Environ ' + mm.toFixed(1).replace('.', ',') + ' millimètre' + (mm >= 2 ? 's' : '') + ' de pluie annoncé dans les vingt-quatre heures.');
  p.push('Source : ' + (m.modele || 'Open-Meteo') + '.');
  return p.join(' ');
}
