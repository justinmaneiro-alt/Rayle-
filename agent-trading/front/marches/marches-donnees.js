/* Données de la fenêtre « Marchés » du carrousel (miniature et grande fenêtre) : annonces, actualités, cours rapides.
   Tout passe par la couche de données (instantanés, lecture directe, copie locale datée). Fonctions pures testées : agent-trading/tests/marches-fenetre-test.mjs. */
import { lireRoute, lireBougies, krakenSpot } from '../donnees/routes.js';
import { lireEvenements, evenementsMajeurs } from '../../../trader-pro/marches/calendrier.js';

export const IMPACT = { High: 'fort', Medium: 'moyen', Low: 'faible', Holiday: 'férié' };
export const ACTIFS = Object.freeze([
  { id: 'btc', nom: 'Bitcoin', sym: 'BTC-USD', live: 'BTC-USD', dec: 0, mots: /bitcoin|btc|crypto/i, cot: 'BTC', pays: [] },
  { id: 'or', nom: 'Or', sym: 'GC=F', live: null, dec: 1, mots: /\bgold\b|\bxau\b|bullion|precious|\bor\b/i, cot: 'OR', pays: ['USD'] },
  { id: 'us100', nom: 'Nasdaq 100', sym: '^NDX', live: null, dec: 0, mots: /nasdaq|tech stocks|big tech|equities/i, cot: 'NASDAQ', pays: ['USD'] },
  { id: 'us500', nom: 'S&P 500', sym: '^GSPC', live: null, dec: 0, mots: /s&p|stocks|wall street|equities/i, cot: 'SP500', pays: ['USD'] },
  { id: 'sol', nom: 'Solana', sym: 'SOL-USD', live: 'SOL-USD', dec: 2, mots: /solana|\bsol\b|crypto/i, cot: 'SOL', pays: [] }
]);
export const parId = Object.freeze(Object.fromEntries(ACTIFS.map(a => [a.id, a])));

/* calendrier Forex Factory (JSON) → événements triés, heure en ms */
export function lireCalendrier(d) { return lireEvenements(d); }   // v4 : une seule lecture du calendrier (trader-pro/marches/calendrier.js)
export function prochaines(liste, maintenant, { impacts = ['fort'], max = 6, pays = null } = {}) { return evenementsMajeurs(liste, maintenant, { impacts, max, pays }); }   // v4 : même fenêtre et même classement que la Couverture et le Terminal
export function compteARebours(t, maintenant) {
  const s = Math.round((t - maintenant) / 1000); if (s <= 0) return s > -900 ? 'publiée à l’instant' : 'passée';
  const j = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return j ? `${j} j ${h} h` : h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(sec).padStart(2, '0')} s`;
}
export const heureParis = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const variation = (prix, veille) => (Number.isFinite(prix) && Number.isFinite(veille) && veille !== 0 ? (prix / veille - 1) * 100 : null);
export const formatPrix = (v, dec = 2) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[  ]/g, ' ') : '—');

/* actualités liées à un actif (mots du titre et du résumé) */
export function actusPourActif(items, actif, max = 6) { const a = typeof actif === 'string' ? parId[actif] : actif; if (!a) return []; return (items || []).filter(x => a.mots.test(`${x.titre} ${x.resume || ''}`)).slice(0, max); }

/* ───── lectures (réseau via la couche) ───── */
export async function calendrierSemaine(opts = {}) { const r = await lireRoute('/__calendrier2', opts); return { ...r, liste: lireCalendrier(r.donnees) }; }
export async function actualites(q = 'marches', n = 40, opts = {}) { const r = await lireRoute(`/__actus?q=${q}&n=${n}`, opts); return { ...r, items: (r.donnees && r.donnees.items) || [] }; }
/* cours rapides : Yahoo (instantané, différé) ; Bitcoin et Solana aussi en direct par Kraken */
export async function coursRapides(opts = {}) {
  const y = await lireRoute('/__yahoo?syms=' + encodeURIComponent('GC=F,^NDX,^GSPC,BTC-USD') + '&range=2y', opts).catch(() => null); const out = {};
  for (const a of ACTIFS) { const c = y && y.donnees && y.donnees.cotes && y.donnees.cotes[a.sym]; if (c && !c.erreur) { const sr = Array.isArray(c.serie) && c.serie.length > 1 ? c.serie[c.serie.length - 2].c : c.veille; out[a.id] = { prix: c.prix, veille: sr, t: c.tPrix || (y.donnees && y.donnees.t), origine: 'instantané', retard: 'différé' }; } }
  await Promise.all(ACTIFS.filter(a => a.live).map(async a => { try { const k = await krakenSpot(a.live, '1h', opts); if (k.prix) { const veille = k.bougies.length > 24 ? k.bougies[k.bougies.length - 24].c : ((out[a.id] && out[a.id].veille) ?? null); out[a.id] = { prix: k.prix, veille, t: k.tPrix, origine: 'direct (Kraken)', retard: 'temps réel' }; } } catch (e) { /* on garde l'instantané */ } }));
  return { cours: out, fraicheur: y ? { origine: y.origine, t: y.t, horsLigne: y.horsLigne } : null };
}
export { lireBougies };
