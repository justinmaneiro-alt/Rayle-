/* ═════════════ CALENDRIER ÉCONOMIQUE : lecture, filtres, surprise ═════════════
   Source : flux public de la semaine (Forex Factory) publié par le robot. Champs : title, country (devise), date (ISO), impact, forecast, previous, actual (quand la source le fournit).
   « Publié » n'est affiché que s'il est fourni par la source ; la surprise n'est calculée que si prévu ET publié sont des nombres. */

export const IMPACT = { High: 'fort', Medium: 'moyen', Low: 'faible', Holiday: 'férié' };
/* devises qui font bouger un actif (liaison descriptive, utilisée par le filtre « par actif ») */
export const DEVISES_ACTIF = Object.freeze({ or: ['USD'], us100: ['USD'], us500: ['USD'], btc: ['USD'], sol: ['USD'], dxy: ['USD'], eurusd: ['EUR', 'USD'] });
const INVERSE = /unemployment|jobless|claims|inventor|deficit/i;   // pour ces indicateurs, un chiffre plus haut est plutôt mauvais pour la devise

export function lireEvenements(d) {
  const L = d && Array.isArray(d.evenements) ? d.evenements : [];
  return L.map(x => ({ t: Date.parse(x.date), titre: String(x.title || ''), pays: String(x.country || ''), impact: IMPACT[x.impact] || String(x.impact || '').toLowerCase(), prevu: x.forecast || '', precedent: x.previous || '', actuel: x.actual || '' }))
    .filter(x => Number.isFinite(x.t) && x.titre).sort((a, b) => a.t - b.t);
}
/* « 2.6% », « -0.14% », « 225K », « 1.2M », « 3.85|2.1 » → nombre (le premier), sinon null */
export function nombre(s) {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*([KMBT%]?)/i.exec(String(s == null ? '' : s)); if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.')), u = m[2].toUpperCase(); return v * (u === 'K' ? 1e3 : u === 'M' ? 1e6 : u === 'B' ? 1e9 : u === 'T' ? 1e12 : 1);
}
/* surprise = publié − prévu ; sens = « mieux » / « moins bien » que prévu pour la devise */
export function surprise(e) {
  const a = nombre(e.actuel), f = nombre(e.prevu); if (a == null || f == null) return null;
  const ecart = a - f; if (Math.abs(ecart) < 1e-9) return { ecart: 0, sens: 'conforme' };
  const meilleur = INVERSE.test(e.titre) ? ecart < 0 : ecart > 0; return { ecart, sens: meilleur ? 'mieux' : 'moins bien' };
}
export function filtrer(liste, { impacts = ['fort'], actif = null, maintenant = Date.now(), depuisMs = 3 * 3600e3, max = 40 } = {}) {
  const dev = actif && DEVISES_ACTIF[actif] ? DEVISES_ACTIF[actif] : null;
  return liste.filter(x => x.t > maintenant - depuisMs && impacts.includes(x.impact) && (!dev || dev.includes(x.pays))).slice(0, max);
}
export function compteARebours(t, maintenant) {
  const s = Math.round((t - maintenant) / 1000); if (s <= 0) return s > -900 ? 'publiée à l’instant' : 'passée';
  const j = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return j ? `${j} j ${h} h` : h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(sec).padStart(2, '0')} s`;
}
export const heureParis = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
