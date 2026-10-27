// Fausses réponses des sources du hub Finance pour les tests Chrome (aucun réseau réel). Formats identiques aux vraies sources (sondées le 2026-10-22).
import { SYMBOLES_NDX } from '../planetes/mars/pc/finance/heatmap-calcul.js';
const NOW = Date.UTC(2026, 9, 22, 9, 0);
const iso = t => new Date(t).toISOString();
const rfc = t => new Date(t).toUTCString();

function cftc(url) {
  const code = decodeURIComponent((url.match(/cftc_contract_market_code%3D%27([^%]+)%27/) || [])[1] || ''), tff = /gpe5-46if/.test(url);
  const n = +((url.match(/\$limit=(\d+)/) || [])[1] || 10);
  const rows = Array.from({ length: n }, (_, i) => {
    const d = iso(Date.parse('2026-10-13T00:00:00Z') - i * 7 * 86400e3).slice(0, 19), net = 20000 - i * 150;
    return tff ? { id: code + i, market_and_exchange_names: 'FAUX - TEST', report_date_as_yyyy_mm_dd: d, cftc_contract_market_code: code, open_interest_all: '300000', dealer_positions_long_all: '10000', dealer_positions_short_all: '40000', asset_mgr_positions_long: '90000', asset_mgr_positions_short: '20000', lev_money_positions_long: String(60000 + net), lev_money_positions_short: '70000', other_rept_positions_long: '5000', other_rept_positions_short: '4000', nonrept_positions_long_all: '6000', nonrept_positions_short_all: '7000' }
      : { id: code + i, market_and_exchange_names: 'FAUX - TEST', report_date_as_yyyy_mm_dd: d, cftc_contract_market_code: code, open_interest_all: '500000', prod_merc_positions_long: '20000', prod_merc_positions_short: '150000', swap_positions_long_all: '40000', swap__positions_short_all: '60000', m_money_positions_long_all: String(160000 + net), m_money_positions_short_all: '50000', other_rept_positions_long: '30000', other_rept_positions_short: '20000', nonrept_positions_long_all: '25000', nonrept_positions_short_all: '15000' };
  });
  return { type: 'application/json', corps: JSON.stringify(rows) };
}
function tresor() {
  const l = ['Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"'];
  for (let k = 0; k < 60; k++) { const d = new Date(NOW - k * 86400e3); if ([0, 6].includes(d.getUTCDay())) continue; const b = k * 0.003; l.push(String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear() + ',' + [4.09 - b, 4.12 - b, 4.16 - b, 4.25 - b, 4.34 - b, 4.35 - b, 4.52 - b, 4.81 - b, 4.89 - b, 4.95 - b, 5.03 - b, 5.13 - b * 2, 5.47 - b, 5.42 - b].map(x => x.toFixed(2)).join(',')); }
  return { type: 'text/csv', corps: l.join('\n') };
}
function bls(url) {
  const s = (url.match(/data\/([A-Z0-9]+)/) || [])[1], base = { CUSR0000SA0: 330, CUUR0000SA0: 330, CUSR0000SA0L1E: 332, LNS14000000: 4.2, CES0000000001: 158000 }[s] || 100, inc = { CUSR0000SA0: 0.7, CUUR0000SA0: 0.6, CUSR0000SA0L1E: 0.6, LNS14000000: 0, CES0000000001: 140 }[s] || 0;
  const data = Array.from({ length: 36 }, (_, i) => { const k = 2026 * 12 + 8 - i; return { year: String(Math.floor(k / 12)), period: 'M' + String((k % 12) + 1).padStart(2, '0'), periodName: 'x', value: String((base - i * inc).toFixed(3)) }; });
  return { type: 'application/json', corps: JSON.stringify({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ seriesID: s, data }] } }) };
}
const item = (titre, lien, t, desc = '') => '<item><title><![CDATA[' + titre + ']]></title><link>' + lien + '</link><pubDate>' + rfc(t) + '</pubDate><description><![CDATA[' + desc + ']]></description></item>';
const rss = items => '<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>' + items.join('') + '</channel></rss>';
function flux(id) {
  const T = NOW - 3600e3, U = 'https://exemple.test/' + id + '/';
  const jeux = {
    cnbc_top: [['Stocks rally as Nvidia earnings beat expectations and Fed signals rate cuts', 1], ['Ten tips for decorating your living room', 2]],
    cnbc_finance: [['Gold hits record high as safe-haven demand rises', 3], ['Bitcoin slumps below $80,000 as ETF outflows grow', 4]],
    marketwatch: [['US CPI jumps more than expected, Treasury yields surge', 5]], marketwatch_marches: [['Dollar index falls as traders eye payrolls report', 6]],
    bloomberg_marches: [['Nasdaq 100 futures slide as AI chip worries return', 7]], ft: [['Fed holds rates steady and signals two cuts', 8]], echos: [['La BCE maintient ses taux directeurs, l’inflation recule', 9]],
    yahoo_nasdaq: [['Nasdaq tumbles as Tesla results disappoint', 10]], yahoo_or: [['Gold steadies near record as dollar slips', 11]], yahoo_btc: [['Bitcoin ETF flows turn positive', 12]], yahoo_dollar: [['Dollar edges higher before CPI', 13]], yahoo_taux: [['10-year Treasury yield rises to 5.1%', 14]], coindesk: [['Crypto exchange hack drains $90 million', 15]],
    fed_presse: [['Federal Reserve Board announces final rule on stress test transparency', 16]], fed_monetaire: [['Federal Reserve issues FOMC statement', 17]], fed_discours: [['Speech by Chair on the economic outlook', 18]],
    bce_presse: [['ECB keeps interest rates unchanged', 19]], boe: [['Bank of England holds Bank Rate at 4%', 20]], boj: [['Bank of Japan Accounts (October 20)', 21]], bns: [['SNB leaves policy rate unchanged', 22]], boc: [['Bank of Canada maintains policy rate', 23]], rba: [['RBA board decision', 24]],
    bce_pubs: [['ECB Economic Bulletin Issue 7', 25]], bri_pub: [['BIS Quarterly Review', 26]], bri_discours: [['Central banking in testing times', 27]], ing_think: [['ING Think: why the Fed may cut again', 28]]
  };
  const l = jeux[id]; if (!l) return null;
  return { type: 'application/xml', corps: rss(l.map(([t, k]) => item(t, U + k, T - k * 600e3, 'Résumé court de l’article ' + k))) };
}
const ff = () => JSON.stringify([
  { title: 'CPI m/m', country: 'USD', date: iso(NOW - 3 * 3600e3).replace('Z', '+00:00'), impact: 'High', forecast: '0.3%', previous: '0.4%' },
  { title: 'Unemployment Claims', country: 'USD', date: iso(NOW + 4 * 3600e3), impact: 'Medium', forecast: '230K', previous: '228K' },
  { title: 'ECB Press Conference', country: 'EUR', date: iso(NOW + 26 * 3600e3), impact: 'High', forecast: '', previous: '' },
  { title: 'Bank Holiday', country: 'JPY', date: iso(NOW + 30 * 3600e3), impact: 'Holiday', forecast: '', previous: '' }]);
const fedJson = () => JSON.stringify({ events: [{ title: 'FOMC Meeting', time: '2:00 p.m.', month: '2026-10', days: '28', type: 'FOMC', description: '&lt;p&gt;Two-day meeting, October 27 - 28&lt;/p&gt;' }, { title: 'FOMC Press Conference', time: '2:30 p.m.', month: '2026-10', days: '28', type: 'FOMC', description: '' }, { title: 'FOMC Minutes', time: '2:00 p.m.', month: '2026-11', days: '18', type: 'FOMC', description: '&lt;p&gt;Meeting of October 27-28&lt;/p&gt;' }] });
const ics = () => 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261110T083000\nSUMMARY:Consumer Price Index\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261106T083000\nSUMMARY:Employment Situation\nEND:VEVENT\nEND:VCALENDAR\n';
const av = () => 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay\nAAPL,APPLE INC,2026-10-29,2026-09-30,1.85,USD,post-market\nMSFT,MICROSOFT CORP,2026-10-28,2026-09-30,3.1,USD,post-market\nZZZ,HORS LISTE,2026-10-28,2026-09-30,1,USD,pre-market\n';
function spark(n) {
  const out = {}; for (const [i, s] of SYMBOLES_NDX.slice(n * 20, n * 20 + 20).entries()) { const pct = ((n * 20 + i) % 11 - 5) * 0.8; out[s] = { timestamp: [1, 2, 3, 4, 5].map(k => (NOW - (5 - k) * 86400e3) / 1000), symbol: s, close: [100, 101, 102, 103, 100 * (1 + pct / 100) + 3.0], chartPreviousClose: 100 + 3.0 / (1 + pct / 100) * 0 + 0, fulldayPrice: 100 * (1 + pct / 100) }; out[s].chartPreviousClose = 100; }
  return { type: 'application/json', corps: JSON.stringify(out) };
}
const sec = () => JSON.stringify({ cik: '320193', name: 'Test', filings: { recent: { form: ['4', '8-K', '10-Q', '8-K'], filingDate: ['2026-10-20', '2026-10-15', '2026-08-01', '2026-07-30'], accessionNumber: ['0000320193-26-000001', '0000320193-26-000002', '0000320193-26-000003', '0000320193-26-000004'], primaryDocument: ['a.xml', 'b.htm', 'c.htm', 'd.htm'], items: ['', '5.02,9.01', '', '2.02,9.01'], reportDate: ['', '', '2026-06-27', ''] } } });

/* url (page ou Worker) → { type, corps } ou null. `etatWorker.brutAbsent` simule un Worker non déployé pour /finance/*. */
export function repondre(url, { workerBase = 'http://127.0.0.1:8797', brutAbsent = false, panne = new Set() } = {}) {
  const u = new URL(url);
  if (u.href.startsWith(workerBase)) {
    if (u.pathname === '/calendar') return { type: 'application/json', corps: ff() };
    if (u.pathname === '/finance/brut') {
      if (brutAbsent) return { statut: 404, type: 'application/json', corps: JSON.stringify({ error: 'route inconnue' }) };
      const id = u.searchParams.get('id'); if (panne.has(id)) return { statut: 502, type: 'application/json', corps: JSON.stringify({ error: 'source indisponible : HTTP 503' }) };
      if (id === 'fed_calendrier') return { type: 'application/json', corps: fedJson() };
      if (id === 'bls_ics') return { type: 'text/calendar', corps: ics() };
      if (id === 'av_resultats') return { type: 'text/csv', corps: av() };
      if (/^spark:\d$/.test(id)) return spark(+id.slice(6));
      if (/^sec:/.test(id)) return { type: 'application/json', corps: sec() };
      return flux(id);
    }
    return null;
  }
  if (/publicreporting\.cftc\.gov/.test(u.host)) return cftc(url);
  if (/home\.treasury\.gov/.test(u.host)) return tresor();
  if (/api\.bls\.gov/.test(u.host)) return bls(url);
  const m = { 'www.cnbc.com': null, 'feeds.content.dowjones.io': null, 'www.bankofcanada.ca': null };
  if (u.host in m) { const id = /100003114/.test(url) ? 'cnbc_top' : /10000664/.test(url) ? 'cnbc_finance' : /mw_topstories/.test(url) ? 'marketwatch' : /mw_marketpulse/.test(url) ? 'marketwatch_marches' : /bankofcanada/.test(url) ? 'boc' : null; return id ? flux(id) : null; }
  return null;
}
