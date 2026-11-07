/* ═════════════ HEURE DE PARIS ET HEURES DU MARCHÉ DE L'OR (pur, testé) ═════════════
   Lightweight Charts affiche le temps en UTC : on décale chaque horodatage du décalage de Paris À CET INSTANT (heure d'été comprise).
   Marché de l'or de référence (COMEX / au comptant) : fermé du vendredi 17:00 au dimanche 18:00 heure de New York, pause quotidienne 17:00–18:00.
   Le perpétuel Kraken (indice Pyth 24/7) continue de coter pendant la fermeture : prix et volume y sont alors peu représentatifs. */
const fmtCache = new Map();
function parties(t, tz) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }); fmtCache.set(tz, f); }
  const o = {}; for (const p of f.formatToParts(new Date(t))) o[p.type] = p.value; return o;
}
/* décalage (ms) d'un fuseau à l'instant t */
export function decalage(t, tz = 'Europe/Paris') {
  const p = parties(t, tz);
  const loc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return loc - Math.floor(t / 1000) * 1000;
}
/* temps « Lightweight Charts » (secondes) affichant l'heure de Paris */
export const tempsGraphique = t => Math.floor((t + decalage(t)) / 1000);
/* temps du graphique strictement croissants : au passage à l'heure d'hiver, une heure de Paris se répète (deux bougies auraient le même temps) */
export function tempsMonotones(L) { let p = -Infinity; return L.map(t => { let s = tempsGraphique(t); if (s <= p) s = p + 1; p = s; return s; }); }
export const depuisTempsGraphique = s => { const approx = s * 1000; return approx - decalage(approx - decalage(approx)); };
const JOURS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
export function heureLocale(t, tz) { const p = parties(t, tz); return { j: JOURS[p.weekday], h: +p.hour, m: +p.minute, date: `${p.year}-${p.month}-${p.day}` }; }
export const heureParis = t => { const p = parties(t, 'Europe/Paris'); return `${p.hour}:${p.minute}`; };
export const dateParis = t => heureLocale(t, 'Europe/Paris').date;

/* état du marché de référence à l'instant t */
export function marcheOr(t) {
  const { j, h } = heureLocale(t, 'America/New_York');
  if (j === 6 || (j === 5 && h >= 17) || (j === 0 && h < 18)) return { ouvert: false, raison: 'week-end', texte: 'Marché de l’or fermé (week-end) : le perpétuel Kraken continue, prix et volume peu représentatifs.' };
  if (h === 17) return { ouvert: false, raison: 'pause', texte: 'Pause quotidienne du marché de l’or (17 h – 18 h à New York).' };
  return { ouvert: true, raison: null, texte: null };
}
/* séances figées (heure de Paris) : Asie 00:00–08:00, Londres 08:00–14:30, New York 14:30–22:00, soir 22:00–24:00 */
export function seance(t) {
  const { h, m } = heureLocale(t, 'Europe/Paris'), x = h + m / 60;
  return x < 8 ? 'Asie' : x < 14.5 ? 'Londres' : x < 22 ? 'New York' : 'soir';
}
/* retard de la donnée : dernière bougie / transaction trop vieille pour un marché ouvert */
export function retard(tDernier, maintenant, ouvert, seuilMs = 3 * 60e3) {
  if (!tDernier) return { enRetard: true, minutes: null, texte: 'Aucune donnée reçue de Kraken.' };
  const d = maintenant - tDernier;
  if (ouvert && d > seuilMs) return { enRetard: true, minutes: Math.round(d / 60e3), texte: `Donnée Kraken en retard : dernière mise à jour il y a ${Math.round(d / 60e3)} min.` };
  return { enRetard: false, minutes: Math.round(d / 60e3), texte: null };
}
