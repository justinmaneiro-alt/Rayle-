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

/* ═════ v4 : UNE SEULE SOURCE DE CALENDRIER pour tout Rayle (carte et fenêtre Marchés, miniature d'accueil, Couverture d'événement, bandes d'annonces du Terminal) ═════
   Source unique : le flux « calendrier2.json » (Forex Factory) lu par lireEvenements. Classement unique ci-dessous : un discours n'est JAMAIS une décision de taux. */
export function classerEvenement(titre = '', pays = '') {
  const t = String(titre), usd = /USD|US/i.test(pays || 'USD');
  const discours = /speaks|speech|testimony|remarks|press conference|member|president|governor|chair/i.test(t) && !/statement|rate decision/i.test(t);
  const compteRendu = /minutes|meeting accounts|economic projections/i.test(t);
  if (discours) return { genre: 'Discours', code: null, etiquette: 'Discours' };
  if (compteRendu) return { genre: 'Compte rendu', code: null, etiquette: 'Compte rendu' };
  if (/federal funds rate|fomc (statement|rate)/i.test(t)) return { genre: 'Décision de taux', code: 'FOMC', etiquette: 'Décision de taux' };
  if (/main refinancing|deposit facility|ecb (rate|monetary)|monetary policy statement|rate statement/i.test(t) && (/EUR/i.test(pays) || /ecb/i.test(t))) return { genre: 'Décision de taux', code: 'BCE', etiquette: 'Décision de taux' };
  if (/non-?farm|nfp/i.test(t) && usd) return { genre: 'Statistique', code: 'NFP', etiquette: 'Statistique' };
  if (/\bcpi\b/i.test(t) && usd) return { genre: 'Statistique', code: 'CPI', etiquette: 'Statistique' };
  if (/\bgdp\b/i.test(t) && usd && !/price|deflator|prelim|final|annualized/i.test(t)) return { genre: 'Statistique', code: 'PIB US', etiquette: 'Statistique' };
  if (/rate decision|interest rate|official bank rate|cash rate|policy rate/i.test(t)) return { genre: 'Décision de taux', code: null, etiquette: 'Décision de taux' };
  return { genre: 'Statistique', code: null, etiquette: 'Statistique' };
}
/* annonces majeures à venir : même fenêtre partout (de 15 min avant à la fin de la semaine du flux) ; impact « fort » de la source */
export function evenementsMajeurs(liste, maintenant = Date.now(), { max = 12, pays = null, impacts = ['fort'] } = {}) {
  return (liste || []).filter(x => x.t > maintenant - 15 * 60e3 && impacts.includes(x.impact) && (!pays || !pays.length || pays.includes(x.pays))).map(x => ({ ...x, ...classerEvenement(x.titre, x.pays) })).slice(0, max);
}
