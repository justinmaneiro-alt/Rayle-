/* ═════════════ DONNÉES DU TERMINAL SERVIES PAR LE PC (serveur local, 127.0.0.1) — complément de terminal-sources.mjs ═════════════
   Pourquoi : Yahoo, la SEC, le Trésor, la CFTC et les flux de presse n'envoient pas tous un en-tête CORS ; le PC les lit à la place du navigateur.
   Données PUBLIQUES seulement, listes blanches, cache court, aucune clé. Erreur de source = réponse { erreur } explicite, jamais de valeur inventée.
     GET /__bougies?sym=^NDX&interval=1h&range=730d   → bougies OHLCV Yahoo (intraday : 1m 5m 15m 1h ; 1d)
     GET /__cot?inst=OR&n=160                          → positions nettes CFTC (fonds spéculatifs / commerciaux ou intermédiaires)
     GET /__actus?q=or&n=40                            → actualités de sources de presse financière (flux RSS publics), datées et liées
     GET /__banques?n=30                               → prévisions de banques relayées par la presse (titre, date, lien)
     GET /__institutions                               → 13F (SEC), World Gold Council, Fed, BCE, BRI : documents datés et liés
     GET /__sante                                      → série de santé du marché (taux réels, taux Fed, SPDR GLD…) : valeurs lues à la source
     GET /__calendrier2                                → calendrier économique de la semaine, TOUJOURS du JSON (jamais de HTML)               */
import zlib from 'node:zlib';
import { lireFlux } from './terminal-sources.mjs';

const AGENT = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) rayle-terminal', 'Accept': '*/*' };
const AGENT_SEC = { 'User-Agent': 'Rayle-terminal usage-personnel', 'Accept': 'application/json' };
const cache = new Map();
async function avecCache(cle, ttl, f) {
  const c = cache.get(cle), n = Date.now();
  if (c && n - c.t < ttl * 1000) return c.v;
  const v = await f(); cache.set(cle, { t: n, v }); if (cache.size > 300) cache.delete(cache.keys().next().value); return v;
}
async function lire(url, { ms = 15000, entetes = AGENT } = {}) {
  const r = await fetch(url, { headers: entetes, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(new URL(url).host + ' a répondu ' + r.status);
  return r.text();
}
const lireJson = async (url, o) => { const t = await lire(url, o); try { return JSON.parse(t); } catch (e) { throw new Error(new URL(url).host + ' a renvoyé autre chose que du JSON'); } };

/* ── bougies Yahoo ── */
export const SYMBOLES_BOUGIES = /^(\^?[A-Z0-9]{1,8}([.=-][A-Z0-9]{1,4})?|DX-Y\.NYB|[A-Z]{3}=X|[A-Z]{3,5}-USD|[A-Z]{1,5}=F)$/;
const INTERVALLES = { '1m': '7d', '5m': '60d', '15m': '60d', '1h': '730d', '1d': '10y' };
export function lireBougiesYahoo(d) {
  const r = d && d.chart && d.chart.result && d.chart.result[0]; if (!r) throw new Error((d && d.chart && d.chart.error && d.chart.error.description) || 'réponse vide');
  const t = r.timestamp || [], q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, m = r.meta || {}, B = [];
  for (let i = 0; i < t.length; i++) { const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i]; if (![o, h, l, c].every(Number.isFinite) || !(c > 0) || h < l) continue; B.push({ t: t[i] * 1000, o, h, l, c, v: Number.isFinite(q.volume && q.volume[i]) ? q.volume[i] : 0 }); }
  return { sym: m.symbol, nom: m.shortName || m.longName || m.symbol, devise: m.currency || '', bourse: m.fullExchangeName || m.exchangeName || '', prix: m.regularMarketPrice ?? null, tPrix: m.regularMarketTime ? m.regularMarketTime * 1000 : null, veille: m.chartPreviousClose ?? null, bougies: B };
}
export async function bougies(sym, interval = '1h', range = null) {
  if (!SYMBOLES_BOUGIES.test(String(sym || ''))) throw new Error('symbole refusé');
  if (!INTERVALLES[interval]) throw new Error('intervalle refusé');
  const R = range && /^(\d{1,3}(d|mo|y)|max)$/.test(range) ? range : INTERVALLES[interval];
  return avecCache(`b|${sym}|${interval}|${R}`, interval === '1d' ? 600 : 45, async () => {
    const o = lireBougiesYahoo(await lireJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${R}&interval=${interval}&includePrePost=false`, { ms: 20000 }));
    return { ...o, source: 'Yahoo Finance (lu par le PC)', intervalle: interval, t: Date.now() };
  });
}

/* ── COT (CFTC, rapport du mardi publié le vendredi) ── */
export const MARCHES_COT = Object.freeze({
  OR:     { ds: '72hh-3qpy', nom: 'GOLD - COMMODITY EXCHANGE INC.', genre: 'matieres', libelle: 'Or (COMEX)' },
  NASDAQ: { ds: 'gpe5-46if', nom: 'NASDAQ-100 Consolidated - CHICAGO MERCANTILE EXCHANGE', genre: 'financier', libelle: 'Nasdaq 100 (CME, consolidé)' },
  SP500:  { ds: 'gpe5-46if', nom: 'S&P 500 Consolidated - CHICAGO MERCANTILE EXCHANGE', genre: 'financier', libelle: 'S&P 500 (CME, consolidé)' },
  BTC:    { ds: 'gpe5-46if', nom: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE', genre: 'financier', libelle: 'Bitcoin (CME)' },
  SOL:    { ds: 'gpe5-46if', nom: 'SOL - CHICAGO MERCANTILE EXCHANGE', genre: 'financier', libelle: 'Solana (CME)' },
  DXY:    { ds: 'gpe5-46if', nom: 'USD INDEX - ICE FUTURES U.S.', genre: 'financier', libelle: 'Indice dollar (ICE)' },
  EURUSD: { ds: 'gpe5-46if', nom: 'EURO FX - CHICAGO MERCANTILE EXCHANGE', genre: 'financier', libelle: 'Euro (CME)' },
  USDCHF: { ds: 'gpe5-46if', nom: 'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE', genre: 'financier', libelle: 'Franc suisse (CME) : le sens est inversé pour USD/CHF' }
});
const nombre = x => { const v = Number(x); return Number.isFinite(v) ? v : null; };
export function normaliserCot(lignes, genre) {
  return (lignes || []).map(r => {
    const date = String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10);
    const spLong = nombre(genre === 'matieres' ? r.m_money_positions_long_all : r.lev_money_positions_long), spCourt = nombre(genre === 'matieres' ? r.m_money_positions_short_all : r.lev_money_positions_short);
    const coLong = nombre(genre === 'matieres' ? r.prod_merc_positions_long : r.dealer_positions_long_all), coCourt = nombre(genre === 'matieres' ? r.prod_merc_positions_short : r.dealer_positions_short_all);
    if (!date || spLong == null || spCourt == null) return null;
    return { date, oi: nombre(r.open_interest_all), spec: { long: spLong, court: spCourt, net: spLong - spCourt }, comm: coLong == null || coCourt == null ? null : { long: coLong, court: coCourt, net: coLong - coCourt } };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}
export function percentile(valeurs, v) { const L = valeurs.filter(Number.isFinite); if (!L.length || !Number.isFinite(v)) return null; return Math.round(100 * L.filter(x => x <= v).length / L.length); }
export async function cot(inst, n = 160) {
  const M = MARCHES_COT[inst]; if (!M) return { erreur: 'aucun rapport COT pour cet instrument' };
  const N = Math.max(10, Math.min(300, +n || 160));
  return avecCache(`cot|${inst}|${N}`, 3600, async () => {
    const u = `https://publicreporting.cftc.gov/resource/${M.ds}.json?$limit=${N}&$order=report_date_as_yyyy_mm_dd%20DESC&$where=` + encodeURIComponent(`market_and_exchange_names = '${M.nom.replace(/'/g, "''")}'`);
    const serie = normaliserCot(await lireJson(u, { ms: 25000 }), M.genre);
    if (!serie.length) throw new Error('aucune ligne CFTC');
    const nets = serie.map(x => x.spec.net), der = serie[serie.length - 1];
    return { inst, libelle: M.libelle, genre: M.genre, source: 'CFTC · Commitments of Traders (' + (M.genre === 'matieres' ? 'désagrégé, matières premières' : 'financiers (TFF)') + ')', nomSpec: M.genre === 'matieres' ? 'Fonds spéculatifs (managed money)' : 'Fonds à effet de levier (leveraged funds)', nomComm: M.genre === 'matieres' ? 'Commerciaux (producteurs et négociants)' : 'Intermédiaires financiers (dealers)', serie, dernier: der, percentileSpec: percentile(nets, der.spec.net), t: Date.now() };
  });
}

/* ── actualités et banques : flux publics de presse financière (liste blanche) ── */
export const FLUX_ACTUS = Object.freeze([
  { id: 'fxstreet', nom: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { id: 'cnbc', nom: 'CNBC · marchés', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { id: 'mining', nom: 'Mining.com · or', url: 'https://www.mining.com/commodity/gold/feed/' },
  { id: 'wgc', nom: 'World Gold Council', url: 'https://www.gold.org/rss.xml' },
  { id: 'fed', nom: 'Réserve fédérale', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
  { id: 'bce', nom: 'Banque centrale européenne', url: 'https://www.ecb.europa.eu/rss/press.html' }
]);
export const MOTS_THEMES = Object.freeze({
  or: /\b(gold|xau|bullion|precious|safe[- ]haven|silver|or\b|metaux?)\b/i,
  marches: /\b(fed|federal reserve|ecb|inflation|rates?|treasury|yields?|dollar|usd|stocks?|nasdaq|s&p|equities|oil|bitcoin|crypto|powell|lagarde|tariffs?|recession|jobs|cpi|payrolls)\b/i
});
export const FILTRE_ACTUS = (titre, resume, q) => { const t = `${titre} ${resume || ''}`; return q === 'tout' ? true : q === 'or' ? MOTS_THEMES.or.test(t) : MOTS_THEMES.marches.test(t) || MOTS_THEMES.or.test(t); };
async function fluxPresse(f) { return avecCache('rss|' + f.id, 600, async () => lireFlux(await lire(f.url, { ms: 15000 }), 25)); }
export async function actus(q = 'marches', n = 40) {
  const res = await Promise.all(FLUX_ACTUS.map(async f => { try { return { f, items: await fluxPresse(f), ok: true }; } catch (e) { return { f, items: [], ok: false, erreur: String(e.message || e) }; } }));
  const items = res.flatMap(r => r.items.filter(x => FILTRE_ACTUS(x.titre, x.resume, q)).map(x => ({ ...x, source: r.f.nom }))).sort((a, b) => (b.date || 0) - (a.date || 0));
  const vus = new Set(), uniques = items.filter(x => { const k = x.titre.toLowerCase().slice(0, 60); if (vus.has(k)) return false; vus.add(k); return true; });
  return { t: Date.now(), filtre: q, sources: res.map(r => ({ id: r.f.id, nom: r.f.nom, ok: r.ok, erreur: r.erreur || null, n: r.items.length })), items: uniques.slice(0, Math.max(5, Math.min(100, +n || 40))) };
}
const BANQUES = /(Goldman|JPMorgan|J\.P\. Morgan|UBS|Citi(group|bank)?|Morgan Stanley|Bank of America|BofA|HSBC|Deutsche|Barclays|Commerzbank|ANZ|Societe Generale|Société Générale|BNP|ING|Wells Fargo|Macquarie|Standard Chartered)/i;
export const PREVISION = /(forecast|prévision|forecasts|target|raises?|lifts?|cuts?|sees?|expects?|predicts?|outlook|price (target|prediction)|objectif)/i;
export async function banques(n = 30) {
  const reqs = ['gold price forecast bank', 'gold price target Goldman Sachs OR JPMorgan OR UBS OR Citi', 'Nasdaq S&P 500 forecast strategist target bank'];
  const res = await Promise.all(reqs.map(async q => { try { return avecCache('gn|' + q, 1800, async () => lireFlux(await lire('https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=' + encodeURIComponent(q + ' when:14d')), 30)); } catch (e) { return []; } }));
  const vus = new Set(), items = res.flat().filter(x => BANQUES.test(x.titre) && PREVISION.test(x.titre)).filter(x => { const k = x.titre.toLowerCase().slice(0, 70); if (vus.has(k)) return false; vus.add(k); return true; })
    .sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, Math.max(5, Math.min(60, +n || 30))).map(x => ({ titre: x.titre, lien: x.lien, date: x.date, banque: (x.titre.match(BANQUES) || [])[0] }));
  return { t: Date.now(), source: 'Google Actualités (flux public) : titres de la presse financière, avec lien et date', note: 'Rapports payants non accessibles : seuls les titres publics sont repris.', items };
}

/* ── institutions : 13F (SEC), World Gold Council, banques centrales ── */
export const FONDS_13F = Object.freeze([
  { cik: '0001067983', nom: 'Berkshire Hathaway' }, { cik: '0001350694', nom: 'Bridgewater Associates' }, { cik: '0001037389', nom: 'Renaissance Technologies' },
  { cik: '0001167557', nom: 'AQR Capital Management' }, { cik: '0001336528', nom: 'Pershing Square' }, { cik: '0001029160', nom: 'Soros Fund Management' }
]);
export async function depot13F(f) {
  return avecCache('13f|' + f.cik, 21600, async () => {
    const d = await lireJson(`https://data.sec.gov/submissions/CIK${f.cik}.json`, { entetes: AGENT_SEC, ms: 20000 }), r = d.filings && d.filings.recent; if (!r) throw new Error('réponse SEC vide');
    for (let i = 0; i < r.form.length; i++) if (/^13F-HR/.test(r.form[i])) {
      const acc = r.accessionNumber[i], dossier = acc.replace(/-/g, '');
      return { fonds: f.nom, cik: f.cik, formulaire: r.form[i], depose: r.filingDate[i], periode: r.reportDate[i], lien: `https://www.sec.gov/Archives/edgar/data/${parseInt(f.cik, 10)}/${dossier}/`, retard: 'Le 13F est publié jusqu’à 45 jours après la fin du trimestre : la photo est donc ancienne.' };
    }
    throw new Error('aucun 13F récent');
  });
}
export async function institutions() {
  const [r13, rap] = await Promise.all([
    Promise.all(FONDS_13F.map(async f => { try { return { ok: true, ...(await depot13F(f)) }; } catch (e) { return { ok: false, fonds: f.nom, erreur: String(e.message || e) }; } })),
    Promise.all([['wgc', 'World Gold Council', 'https://www.gold.org/rss.xml'], ['fed', 'Réserve fédérale (Fed)', 'https://www.federalreserve.gov/feeds/press_monetary.xml'], ['bce', 'Banque centrale européenne', 'https://www.ecb.europa.eu/rss/press.html'], ['bri', 'BRI · discours', 'https://www.bis.org/doclist/cbspeeches.rss']]
      .map(async ([id, nom, url]) => { try { return { id, nom, ok: true, items: (await avecCache('inst|' + id, 1800, async () => lireFlux(await lire(url), 12))).slice(0, 8) }; } catch (e) { return { id, nom, ok: false, erreur: String(e.message || e), items: [] }; } }))
  ]);
  return { t: Date.now(), f13: r13, flux: rap, ecartees: [{ nom: 'FMI (imf.org)', raison: 'le site refuse les lecteurs automatiques (403) : non disponible' }, { nom: 'Rapports payants (banques, Bloomberg, Refinitiv…)', raison: 'non accessibles : seuls les documents publics sont repris' }] };
}

/* ── santé du marché : sources que le navigateur ne peut pas lire seul ── */
export function lireTauxReels(csv) {
  const L = String(csv || '').trim().split(/\r?\n/); if (L.length < 2) return [];
  const en = L[0].split(',').map(s => s.replace(/"/g, '').trim()), i10 = en.findIndex(x => /^10 YR$/i.test(x)); if (i10 < 0) return [];
  return L.slice(1).map(l => { const c = l.split(','), m = (c[0] || '').replace(/"/g, '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/), v = parseFloat(c[i10]); return m && Number.isFinite(v) ? { date: `${m[3]}-${m[1]}-${m[2]}`, v } : null; }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}
export async function sante() {
  return avecCache('sante', 1800, async () => {
    const an = new Date().getUTCFullYear(), out = { t: Date.now(), reels: null, fed: null, erreurs: {} };
    await Promise.all([
      (async () => { try { const L = []; for (const y of [an - 1, an]) { try { L.push(...lireTauxReels(await lire(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { ms: 20000 }))); } catch (e) { if (y === an) throw e; } } out.reels = { source: 'Trésor américain · taux réels 10 ans (TIPS)', serie: L }; if (!L.length) throw new Error('aucune ligne'); } catch (e) { out.reels = null; out.erreurs.reels = String(e.message || e); } })(),
      (async () => { try { const d = await lireJson('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/260.json', { ms: 20000 }); const s = (d.refRates || []).map(x => ({ date: x.effectiveDate, v: Number(x.percentRate), bas: Number(x.targetRateFrom), haut: Number(x.targetRateTo) })).filter(x => Number.isFinite(x.v)).sort((a, b) => a.date.localeCompare(b.date)); if (!s.length) throw new Error('aucune ligne'); out.fed = { source: 'Fed de New York · taux effectif au jour le jour (EFFR) et fourchette cible', serie: s }; } catch (e) { out.fed = null; out.erreurs.fed = String(e.message || e); } })()
    ]);
    return out;
  });
}


/* ── GLD (SPDR Gold Shares) : tonnes d'or en dépôt, jour par jour (fichier Excel public de State Street, lu sans bibliothèque) ── */
export function fichiersZip(b) {
  const out = {}; let e = b.length - 22; while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--; if (e <= 0) throw new Error('archive illisible');
  const n = b.readUInt16LE(e + 10); let p = b.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const meth = b.readUInt16LE(p + 10), cs = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), lo = b.readUInt32LE(p + 42), nom = b.toString('utf8', p + 46, p + 46 + nl);
    const ln = b.readUInt16LE(lo + 26), le = b.readUInt16LE(lo + 28), ds = lo + 30 + ln + le;
    out[nom] = () => { const d = b.subarray(ds, ds + cs); return meth === 8 ? zlib.inflateRawSync(d) : d; }; p += 46 + nl + el + cl;
  }
  return out;
}
const MOIS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
export function lireGld(buf) {
  const z = fichiersZip(buf), ss = z['xl/sharedStrings.xml'] ? z['xl/sharedStrings.xml']().toString('utf8') : '';
  const strs = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
  const nom = Object.keys(z).filter(k => /worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => b.length - a.length || b.localeCompare(a)).find(k => (z[k]().toString('utf8').match(/<row /g) || []).length > 500);
  if (!nom) throw new Error('feuille de données introuvable'); const xml = z[nom]().toString('utf8'), lignes = [];
  for (const m of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const c = {}; for (const x of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<v>([\s\S]*?)<\/v>)?<\/c>)/g)) c[x[1]] = /t="s"/.test(x[2]) ? strs[+x[3]] : x[3];
    const d = String(c.A || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); if (!d || !MOIS[d[2]]) continue;
    const tonnes = parseFloat(c.J), close = parseFloat(c.B), vol = parseFloat(c.H); if (!Number.isFinite(tonnes) || !Number.isFinite(close)) continue;
    lignes.push({ date: `${d[3]}-${MOIS[d[2]]}-${d[1].padStart(2, '0')}`, tonnes, close, volume: Number.isFinite(vol) ? vol : null });
  }
  return lignes.sort((a, b) => a.date.localeCompare(b.date));
}
export async function gld() {
  return avecCache('gld', 21600, async () => {
    const r = await fetch('https://api.spdrgoldshares.com/api/v1/historical-archive?product=gld&exchange=NYSE&lang=en', { headers: AGENT, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('spdrgoldshares.com a répondu ' + r.status);
    const L = lireGld(Buffer.from(await r.arrayBuffer())); if (L.length < 10) throw new Error('fichier SPDR vide');
    return { source: 'SPDR Gold Shares (State Street) · tonnes d’or en dépôt dans le fonds GLD', serie: L.slice(-800), t: Date.now() };
  });
}

/* ── calendrier : toujours du JSON ── */
export async function calendrier2() {
  return avecCache('cal2', 1800, async () => {
    const t = await lire('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { ms: 15000 }); let j;
    try { j = JSON.parse(t); } catch (e) { throw new Error('la source du calendrier a répondu autre chose que du JSON (limite d’appels ?)'); }
    if (!Array.isArray(j)) throw new Error('calendrier : format inattendu');
    return { t: Date.now(), source: 'Forex Factory (flux public de la semaine)', evenements: j };
  });
}

export function gererDonnees(req, res, chemin) {
  const ok = (d) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(d)); };
  const ko = e => { res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ erreur: String(e && e.message || e) })); };
  if (req.method !== 'GET') { res.writeHead(405); res.end('GET seulement'); return true; }
  const u = new URL(req.url, 'http://x'), p = u.searchParams;
  const routes = {
    '/__bougies': () => bougies(p.get('sym'), p.get('interval') || '1h', p.get('range')),
    '/__cot': () => cot(p.get('inst'), p.get('n')),
    '/__actus': () => actus(p.get('q') || 'marches', p.get('n')),
    '/__banques': () => banques(p.get('n')),
    '/__institutions': () => institutions(),
    '/__sante': () => sante(),
    '/__gld': () => gld(),
    '/__calendrier2': () => calendrier2()
  };
  if (!routes[chemin]) return false;
  Promise.resolve().then(routes[chemin]).then(ok, ko); return true;
}
