// Sources en direct avec de VRAIES donnees (reseau reel depuis ce PC) ; le Worker est simule par la vraie liste blanche de worker/src/finance/finance.js.
// Lancer :  node planetes/mars/tests/direct-reel.mjs
import { creerDirect } from '../../../core/direct/donnees-direct.js';
import { resoudre } from '../../../worker/src/finance/finance.js';
import { phraseEvenements } from '../../../core/direct/evenements-calcul.js';
const UA = 'Mozilla/5.0 (compatible; RayleAssistant/1.0; usage personnel)';
const get = async (url, entetes = {}) => { const r = await fetch(url, { headers: { 'User-Agent': UA, ...entetes }, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
const reseau = { workerPret: () => true, direct: async (url, { json = false } = {}) => (json ? (await get(url)).json() : (await get(url)).text()), brut: async id => { const s = resoudre(id, {}); if (!s) throw new Error('source inconnue'); return (await get(s.url, s.entetes || {})).text(); }, calendrierPublic: async () => [] };
const D = creerDirect({ reseau });
const aff = (t, r, x) => console.log('\n== ' + t + ' : ' + r.etat + ' · ' + r.etiquette + (r.raison ? ' · ' + r.raison : '') + (r.source ? ' · ' + r.source : '') + '\n' + (x || ''));
let r = await D.evenements(); aff('Evenements', r, r.etat === 'ok' && r.sources.map(s => '   ' + s.id + ' ' + s.etat + (s.n != null ? ' (' + s.n + ')' : '') + (s.raison ? ' ' + s.raison : '')).join('\n') + '\n' + phraseEvenements(r.evenements, null) + '\n' + phraseEvenements(r.evenements, 'seisme') + '\n   types : ' + JSON.stringify(r.evenements.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {})) + ' · fusion USGS+GDACS : ' + r.evenements.filter(e => e.sources).length);
r = await D.communiques(); aff('Communiques', r, r.etat === 'ok' && r.sources.map(s => '   ' + s.id + ' ' + s.etat + (s.n != null ? ' (' + s.n + ')' : '') + (s.raison ? ' ' + s.raison : '')).join('\n') + '\n   ' + r.items.slice(0, 3).map(i => i.source + ' : ' + i.titre.slice(0, 80)).join('\n   '));
for (const id of ['bbc_global', 'npr_news', 'dw_europe', 'cbc_monde', 'inter_8h20']) { r = await D.podcasts(id); aff('Podcast ' + id, r, r.etat === 'ok' && r.episodes.length + ' épisodes ; dernier : ' + r.episodes[0].titre.slice(0, 70) + ' (' + r.episodes[0].duree + ') ' + r.episodes[0].audio.slice(0, 60)); }
r = await D.social(); aff('Reseaux sociaux verifies', r, r.etat === 'ok' && r.comptes.map(c => '   ' + c.plateforme + ' ' + c.nom + ' ' + c.etat + (c.raison ? ' ' + c.raison : '')).join('\n') + '\n   ' + r.messages.slice(0, 3).map(m => '[' + m.compte + '] ' + m.texte.slice(0, 80)).join('\n   '));
r = await D.ephemeride('fr'); aff('Ephemeride (fr)', r, r.etat === 'ok' && r.evenements.slice(0, 3).map(e => '   ' + e.annee + ' : ' + e.texte.slice(0, 90)).join('\n'));
r = await D.actualiteWikipedia(); aff('Wikipedia dans l actualite', r, r.etat === 'ok' && r.nouvelles.slice(0, 2).map(e => '   ' + e.texte.slice(0, 100)).join('\n'));
r = await D.wikinews(); aff('Wikinews', r, r.etat === 'ok' && JSON.stringify({ ferme: r.wikinews.ferme, le: r.wikinews.fermeLe && new Date(r.wikinews.fermeLe).toISOString().slice(0, 10) }));
