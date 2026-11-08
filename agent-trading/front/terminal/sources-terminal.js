/* ═════════════ TERMINAL : SOURCES DE BOUGIES ET DE COTATIONS (navigateur ou Node : fetch injectable) ═════════════
   Kraken Futures : par le relais dédié « rayle-or-relais » (Kraken n'envoie pas d'en-tête CORS), paramètre &sym=.
   Le relais en ligne peut être une ANCIENNE version qui ignore &sym= (elle renverrait l'or pour tout) : avant de s'y fier pour un
   symbole, on vérifie que son ticker porte bien CE symbole (relaisCompatible). Sinon : repli explicite, jamais de prix d'un autre actif.
   Binance (futures et spot) : en direct, CORS ouvert. Erreurs explicites, jamais de bougie inventée. */
import { RELAIS } from '../or/config-or.js';
import { UNITES } from './actifs-terminal.js';

export const BINANCE_F = 'https://fapi.binance.com/fapi/v1/klines';
export const BINANCE_S = 'https://api.binance.com/api/v3/klines';
export const PAGE_KRAKEN = 2000, PAGE_BINANCE_F = 1500, PAGE_BINANCE_S = 1000;

async function json(url, fetchFn, ms = 15000) {
  const r = await fetchFn(url, { signal: globalThis.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
  if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`);
  return r.json();
}
const num = x => Number(x);
export const depuisKraken = d => (d && Array.isArray(d.candles) ? d.candles : []).map(c => ({ t: num(c.time), o: num(c.open), h: num(c.high), l: num(c.low), c: num(c.close), v: num(c.volume) })).filter(b => Number.isFinite(b.t) && b.c > 0);
export const depuisBinance = rows => (Array.isArray(rows) ? rows : []).map(r => ({ t: num(r[0]), o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[5]) })).filter(b => b.c > 0);

/* le relais sait-il servir ce symbole ? (une ancienne version renvoie toujours l'or) — mémorisé par relais et par symbole */
const compat = new Map();
export function relaisCompatible(sym, { fetchFn = fetch, relais = relaisCourant() } = {}) {
  const k = relais + '|' + sym;
  if (!compat.has(k)) compat.set(k, json(`${relais}/kraken/ticker?sym=${sym}`, fetchFn, 8000).then(d => !!(d && d.ticker && d.ticker.symbol === sym)).catch(() => false));
  return compat.get(k);
}
export const oublierCompat = () => compat.clear();

/* une fenêtre de bougies Kraken [de, a[ (ms) : ≤ 2000 bougies par appel (limite de l'API) */
export async function krakenFenetre(sym, unite, de, a, { fetchFn = fetch, relais = relaisCourant() } = {}) {
  const U = UNITES[unite], from = Math.floor(de / 1000), to = Math.floor(a / 1000);
  const L = depuisKraken(await json(`${relais}/kraken/bougies?sym=${sym}&res=${U.kraken}&from=${from}&to=${to}`, fetchFn));
  return L.filter(b => b.t >= de && b.t < a);
}
/* une page Binance (futures ou spot) commençant à « de » */
export async function binancePage(source, sym, unite, de, a, { fetchFn = fetch } = {}) {
  const U = UNITES[unite], base = source === 'binance-s' ? BINANCE_S : BINANCE_F, lim = source === 'binance-s' ? PAGE_BINANCE_S : PAGE_BINANCE_F;
  const L = depuisBinance(await json(`${base}?symbol=${sym}&interval=${U.binance}&startTime=${de}&endTime=${a - 1}&limit=${lim}`, fetchFn));
  return L.filter(b => b.t >= de && b.t < a);
}
/* page du Worker de Rayle (secours Nasdaq : Yahoo ^NDX) ; wjson fourni par la page Rayle (jeton) */
const IV_WORKER = { M5: '5min', M15: '15min', H1: '1h', H4: '4h', J: '1day' };
export async function workerPage(actif, unite, { wjson = globalThis.wjson } = {}) {
  if (typeof wjson !== 'function') throw new Error('Worker de Rayle non connecté');
  const d = await wjson(`/marche?actif=${actif}&intervalle=${IV_WORKER[unite]}&n=500`, 25000);
  return (Array.isArray(d && d.bougies) ? d.bougies : []).map(b => ({ t: num(b.t), o: num(b.o), h: num(b.h), l: num(b.l), c: num(b.c), v: num(b.v) || 0 })).filter(b => Number.isFinite(b.t) && b.c > 0).sort((x, y) => x.t - y.t);
}

/* cotations : tous les tickers du relais (nouvelle version) ; sinon chaque ticker vérifié un par un */
export async function tickers(syms, { fetchFn = fetch, relais = relaisCourant() } = {}) {
  try {
    const d = await json(`${relais}/kraken/tickers`, fetchFn, 8000);
    if (d && Array.isArray(d.tickers) && d.tickers.length) return Object.fromEntries(d.tickers.filter(t => syms.includes(t.symbol)).map(t => [t.symbol, t]));
  } catch (e) { /* ancienne version du relais : route inconnue */ }
  const out = {};
  await Promise.all(syms.map(async s => { try { const d = await json(`${relais}/kraken/ticker?sym=${s}`, fetchFn, 8000); if (d && d.ticker && d.ticker.symbol === s) out[s] = d.ticker; } catch (e) { /* inconnu */ } }));
  return out;
}
/* ticker 24 h Binance futures (volume relatif, cotation de secours d'une crypto) */
export async function ticker24hBinance(sym, { fetchFn = fetch } = {}) { return json(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`, fetchFn, 8000); }

/* ═════════════ CORRECTIONS (2026-11-08, suite de la phase A) ═════════════
   Relais : quand le terminal est servi par le PC (serveur local 127.0.0.1 / localhost), le PC lit Kraken lui-même (/__relais, même liste
   blanche que le relais dédié) : le Nasdaq, le Bitcoin, Solana et Dogecoin sont servis par Kraken sans redéployer quoi que ce soit.
   Sinon : le relais dédié en ligne (rayle-or-relais), tel quel. */
let RELAIS_COURANT = RELAIS, RELAIS_LOCAL = false;
export const relaisCourant = () => RELAIS_COURANT;
export const relaisEstLocal = () => RELAIS_LOCAL;
export function originePc(loc = globalThis.location) { return !!(loc && /^http:$/.test(loc.protocol) && /^(127\.0\.0\.1|localhost)$/.test(loc.hostname)) ? loc.origin : null; }
let choix = null;
export function choisirRelais({ fetchFn = (...a) => fetch(...a), loc = globalThis.location } = {}) {
  if (choix) return choix;
  const o = originePc(loc);
  choix = !o ? Promise.resolve(RELAIS_COURANT) : json(`${o}/__relais/kraken/ticker?sym=PF_US100USD`, fetchFn, 6000)
    .then(d => { if (d && d.ticker && d.ticker.symbol === 'PF_US100USD') { RELAIS_COURANT = o + '/__relais'; RELAIS_LOCAL = true; oublierCompat(); } return RELAIS_COURANT; })
    .catch(() => RELAIS_COURANT);
  return choix;
}
export const oublierChoixRelais = () => { choix = null; RELAIS_COURANT = RELAIS; RELAIS_LOCAL = false; };

/* rapports publics et cotations Yahoo : seulement par le PC (ces sites n'ont pas d'en-tête CORS) */
export async function rapportsPublics({ fetchFn = (...a) => fetch(...a), loc = globalThis.location } = {}) {
  const o = originePc(loc); if (!o) throw new Error('disponible quand Rayle tourne sur le PC (serveur local) : ces sites ne se lisent pas depuis une page web');
  return json(`${o}/__rapports`, fetchFn, 30000);
}
/* cotations journalières : PC (Yahoo) d'abord, sinon Worker de Rayle (route /marche, Y:SYMBOLE, déjà en ligne), sinon erreur */
export async function cotesJour(syms, { range = '5d', fetchFn = (...a) => fetch(...a), loc = globalThis.location, wjson = globalThis.wjson } = {}) {
  const o = originePc(loc);
  if (o) { try { const d = await json(`${o}/__yahoo?syms=${encodeURIComponent(syms.join(','))}&range=${range}`, fetchFn, 25000); if (d && d.cotes) return d; } catch (e) { /* repli */ } }
  if (typeof wjson === 'function') {
    const n = { '5d': 6, '1mo': 25, '3mo': 70, '6mo': 130 }[range] || 6, out = {};
    await Promise.all(syms.map(async s => { try { const d = await wjson(`/marche?actif=Y:${encodeURIComponent(s)}&intervalle=1day&n=${n}`, 20000); const B = (d && d.bougies) || [];
      const serie = B.map(b => ({ t: +b.t, c: +b.c })).filter(p => p.c > 0); out[s] = serie.length ? { sym: s, nom: s, prix: serie[serie.length - 1].c, veille: serie.length > 1 ? serie[serie.length - 2].c : null, tPrix: serie[serie.length - 1].t, serie } : { sym: s, erreur: 'aucune bougie' }; }
      catch (e) { out[s] = { sym: s, erreur: String(e.message || e) }; } }));
    return { t: Date.now(), source: 'Yahoo par le Worker de Rayle (différé possible)', cotes: out };
  }
  throw new Error('cotations des entreprises liées : ni serveur du PC ni Worker de Rayle connecté');
}

/* COT complet : CFTC « Legacy futures only » en DIRECT (publicreporting.cftc.gov, CORS ouvert, gratuit, sans clé) */
export const CFTC = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';
export const CODES_CFTC = Object.freeze({ XAU: { code: '088691', nom: 'Or (COMEX)' }, NDX: { code: '209742', nom: 'Nasdaq 100 E-mini (CME)' }, BTC: { code: '133741', nom: 'Bitcoin (CME)' } });
export async function cotCftc(cle, { semaines = 78, fetchFn = (...a) => fetch(...a) } = {}) {
  const C = CODES_CFTC[cle]; if (!C) throw new Error('pas de contrat CFTC pour ' + cle);
  const q = `$where=cftc_contract_market_code='${C.code}'&$order=report_date_as_yyyy_mm_dd DESC&$limit=${semaines}`;
  const L = await json(`${CFTC}?${q.replace(/ /g, '%20')}`, fetchFn, 20000);
  return { nom: C.nom, code: C.code, lignes: Array.isArray(L) ? L : [] };
}

/* acheteurs / vendeurs en dollars : Binance futures (ordres au marché acheteurs = « taker buy »), n dernières bougies */
export async function volNetBinance(sym, unite, n = 20, { fetchFn = (...a) => fetch(...a) } = {}) {
  const U = UNITES[unite]; const rows = await json(`${BINANCE_F}?symbol=${sym}&interval=${U.binance}&limit=${n}`, fetchFn, 10000);
  return (Array.isArray(rows) ? rows : []).map(r => ({ t: +r[0], usd: +r[7], achatUsd: +r[10] })).filter(x => Number.isFinite(x.usd));
}
/* calendrier de la semaine : Worker de Rayle (/calendar, déjà en ligne) d'abord, sinon le PC (/__calendrier) */
export async function calendrierBrut({ fetchFn = (...a) => fetch(...a), loc = globalThis.location, wjson = globalThis.wjson } = {}) {
  if (typeof wjson === 'function') { try { const l = await wjson('/calendar', 15000); if (Array.isArray(l)) return { liste: l, source: 'Worker de Rayle' }; } catch (e) { /* repli */ } }
  const o = originePc(loc); if (o) { const l = await json(`${o}/__calendrier`, fetchFn, 20000); if (Array.isArray(l)) return { liste: l, source: 'lu par le PC' }; }
  throw new Error('ni Worker de Rayle ni serveur du PC connecté');
}
