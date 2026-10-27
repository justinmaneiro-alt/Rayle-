// Hub Finance avec de VRAIES donnees (reseau reel, depuis ce PC) : le Worker est simule par la liste blanche reelle du module worker/src/finance/finance.js (memes adresses, meme passerelle).
// Montre les resultats lisibles ; aucun secret. Lancer :  node planetes/mars/tests/finance-reel.mjs
import { creerFinance } from '../pc/finance/donnees.js';
import { resoudre } from '../../../worker/src/finance/finance.js';
import { phraseCot } from '../pc/finance/cot-calcul.js';
import { phraseTaux } from '../pc/finance/taux-calcul.js';
import { phraseCalendrier } from '../pc/finance/calendrier-calcul.js';
import { phraseBanque } from '../pc/finance/flux-calcul.js';
import { phraseHeatmap } from '../pc/finance/heatmap-calcul.js';
import { phraseSec } from '../pc/finance/sec-calcul.js';
const UA = 'Mozilla/5.0 (compatible; RayleAssistant/1.0; usage personnel)';
const get = async (url, entetes = {}) => { const r = await fetch(url, { headers: { 'User-Agent': UA, ...entetes }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
const reseau = {
  workerPret: () => true,
  direct: async (url, { json = false } = {}) => (json ? (await get(url)).json() : (await get(url)).text()),
  brut: async id => { const s = resoudre(id, {}); if (!s) throw new Error('source inconnue'); return (await get(s.url, s.entetes || {})).text(); },
  calendrierPublic: async () => (await get('https://nfs.faireconomy.media/ff_calendar_thisweek.json')).json()
};
const F = creerFinance({ reseau, stockage: null });
const aff = (titre, r, extra) => console.log('\n== ' + titre + ' : ' + r.etat + ' · ' + r.etiquette + (r.raison ? ' · ' + r.raison : '') + (r.source ? ' · ' + r.source : '') + '\n' + (extra || ''));
let r = await F.cot('XAU'); aff('COT or', r, r.etat === 'ok' && phraseCot('XAU', r.analyse));
r = await F.cot('NDX'); aff('COT Nasdaq 100', r, r.etat === 'ok' && phraseCot('NDX', r.analyse) + '\n' + r.analyse.categories.map(c => '   ' + c.nom + ' net ' + c.net + ' (var ' + c.variation + ', pct ' + c.percentile + ' ' + (c.extreme || '') + ')').join('\n'));
r = await F.cot('BTC'); aff('COT Bitcoin', r, r.etat === 'ok' && phraseCot('BTC', r.analyse));
r = await F.courbe(); aff('Courbe des taux', r, r.etat === 'ok' && phraseTaux(r.courbe));
r = await F.bls(); aff('BLS', r, r.etat === 'ok' && Object.entries(r.donnees).map(([k, v]) => '   ' + k + ' dernier ' + v[0].annee + '-' + v[0].mois + ' = ' + v[0].valeur).join('\n'));
r = await F.calendrier(); aff('Calendrier', r, r.etat === 'ok' && r.sources.map(s => '   ' + s.id + ' ' + s.etat + (s.n != null ? ' (' + s.n + ')' : '') + (s.raison ? ' ' + s.raison : '')).join('\n') + '\n' + phraseCalendrier(r.evenements, { max: 4 }) + '\n   avec réel : ' + r.evenements.filter(e => e.reel).map(e => e.titre + '=' + e.reel).join(' | '));
for (const g of ['banques', 'actus', 'institutions']) { r = await F.flux(g); aff('Flux ' + g, r, r.etat === 'ok' && r.sources.map(s => '   ' + s.id + ' ' + s.etat + (s.n != null ? ' (' + s.n + ')' : '') + (s.raison ? ' ' + s.raison : '')).join('\n') + '\n   ' + r.items.slice(0, 3).map(i => '[' + i.classe.impact + '/' + i.classe.actifs.join(',') + '] ' + i.titre.slice(0, 90)).join('\n   ')); if (g === 'banques') console.log(phraseBanque('Fed', r.items)); }
r = await F.heatmap(); aff('Heatmap', r, r.etat === 'ok' && phraseHeatmap(r.resume) + '\n   manquants : ' + r.resume.manquants);
r = await F.sec('NVDA'); aff('SEC NVDA', r, r.etat === 'ok' && phraseSec(r.resume));
