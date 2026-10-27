/* ═════════════ ÉVÉNEMENTS MACRO POUR LES ALERTES (pur ; testé : alertes-regles-test.mjs) ═════════════
   Adapte la réponse de la route /calendar du Worker (calendrier hebdomadaire public : { date, country, impact, title, forecast, previous, actual? }) au format d'`alertesMacro`.
   Aucune donnée inventée : un champ absent reste absent. Seuls les événements qui touchent le plus le Bitcoin sont gardés (dollar américain, plus les autres devises à fort impact). */
const PAYS_UTILES = new Set(['USD', 'EUR', 'GBP', 'JPY']);
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export function evenementsDepuisCalendrier(liste) {
  if (!Array.isArray(liste)) return [];
  const out = [];
  for (const e of liste) {
    const t = Date.parse(e && e.date), pays = String(e && e.country || '').toUpperCase(), impact = String(e && e.impact || '').toLowerCase();
    if (!Number.isFinite(t) || !PAYS_UTILES.has(pays) || !['high', 'medium', 'low'].includes(impact)) continue;
    const reel = e.actual != null && String(e.actual).trim() !== '' ? String(e.actual) : null;
    out.push({ id: pays + ':' + hash(String(e.date) + '|' + String(e.title)), titre: String(e.title || '').slice(0, 120), t, impact, pays,
      precedent: e.previous != null && String(e.previous) !== '' ? String(e.previous) : null, prevu: e.forecast != null && String(e.forecast) !== '' ? String(e.forecast) : null, reel });
  }
  return out;
}
