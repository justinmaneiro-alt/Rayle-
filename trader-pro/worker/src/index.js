/* ═════════════ WORKER « RAYLE PORTEFEUILLE » (Cloudflare) : stockage D1 de l'historique XTB + alertes de prix par Telegram ═════════════
   Worker DÉDIÉ (le Worker principal « rayle » n'est jamais touché). Aucun secret dans ce fichier : PORTEFEUILLE_CODE, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID sont des secrets Cloudflare.
   Déploiement : voir trader-pro/worker/LISEZMOI.md. */
import { traiter, entetesCors, autoriser } from './coeur.js';
import { traiterLT, lotLongTerme, alertesInvest } from './long-terme.js';
import { depotD1 } from './depot-d1.js';
import { evaluerAlertes, texteAlerte } from '../../marches/alertes.js';

let depot = null;
export default {
  async fetch(req, env) { if (!env.DB) return new Response(JSON.stringify({ error: 'base D1 non liée : voir LISEZMOI.md' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); depot = depot || depotD1(env.DB); const lt = await traiterLT(req, env, depot, { cors: entetesCors(req, env), autoriser }); if (lt) return lt; return traiter(req, env, depot); },
  /* toutes les 5 minutes : prix des actifs concernés, alertes franchies → message Telegram (si les secrets existent), puis marquées « envoyées » */
  async scheduled(event, env, ctx) { if (!env.DB) return; depot = depot || depotD1(env.DB); ctx.waitUntil(verifierAlertes(env, depot)); ctx.waitUntil(alertesInvest(env, depot).catch(() => { /* ré-essai au prochain passage */ })); }
};
const nomActif = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', dxy: 'Dollar (DXY)' };
async function prixServeur(actifs, fetchFn = fetch) {
  const out = {};
  const j = async (u, ms = 8000) => { const r = await fetchFn(u, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'rayle-portefeuille' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
  await Promise.all([...new Set(actifs)].map(async a => {
    try {
      if (a === 'or') { const d = await j('https://futures.kraken.com/derivatives/api/v3/tickers/PF_XAUUSD'); if (d.ticker && d.ticker.markPrice) out.or = { prix: +d.ticker.markPrice, t: Date.now(), source: 'Kraken PF_XAUUSD (perpétuel)' }; }
      else if (a === 'btc' || a === 'sol') { const p = a === 'btc' ? 'XBTUSD' : 'SOLUSD', d = await j('https://api.kraken.com/0/public/Ticker?pair=' + p), k = Object.values(d.result || {})[0]; if (k && k.c) out[a] = { prix: +k.c[0], t: Date.now(), source: 'Kraken (direct)' }; }
      else { const d = await j(`https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/pro-${a}.json`, 10000); if (d && Number.isFinite(d.prix)) out[a] = { prix: d.prix, t: d.tPrix || d.t, source: 'instantané du robot' }; }
    } catch (e) { /* cet actif n'a pas de prix : ses alertes attendent */ }
  }));
  return out;
}
export async function verifierAlertes(env, depot, fetchFn = fetch) {
  const A = (await depot.kvLire('alertes')) || []; const attente = A.filter(a => !a.declenchee); if (!attente.length) return { evaluees: 0 };
  const prix = await prixServeur(attente.map(a => a.actif), fetchFn), r = evaluerAlertes(A, prix); if (!r.declenchees.length) return { evaluees: attente.length, declenchees: 0 };
  const envoyees = new Set();
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) for (const a of r.declenchees) {
    try { const res = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: '🔔 Alerte Rayle : ' + texteAlerte(a, nomActif[a.actif] || a.actif, 2) + '\n(Prix indicatif, lecture seule : aucun ordre.)' }), signal: AbortSignal.timeout(8000) }); if (res.ok) envoyees.add(a.id); } catch (e) { /* retentera : l'alerte reste marquée non envoyée */ }
  }
  await depot.kvEcrire('alertes', r.alertes.map(a => (envoyees.has(a.id) ? { ...a, envoyee: true } : a)));
  return { evaluees: attente.length, declenchees: r.declenchees.length, envoyees: envoyees.size };
}
