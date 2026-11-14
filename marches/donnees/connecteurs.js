/* ═════════════ CONNECTEURS (RAYLE MARCHÉS) ═════════════
   Chaque « lot » lit une ou plusieurs adresses d'UNE source et rend { mesures: [...], items: [...], points: { idMesure: [[ms, valeur]…] } }.
   Contexte reçu : { get(sourceId, url, { type, entetes }), maintenant(), env }. Un lot qui échoue LÈVE une erreur (le hub s'occupe du repli) : jamais de zéro de remplacement.
   Aucune valeur n'est calculée « de mémoire » : tout vient de la réponse de la source ; les seuls calculs sont des différences et glissements annuels écrits en clair dans la note. */
import { mesure, mesureTexte } from './normaliser.js';
import { lireFred, lireBce, lireInsee, lireEurostat, lireIcs, lireFomc, lireBceCalendrier, lireRss, lireCsv } from './analyseurs.js';
import { SERIES_FRED, CONTRATS_COT, FLUX, MOTS_ACTIFS, parId } from './registre.js';

const nom = id => parId.get(id).nom;
const dernier = pts => pts[pts.length - 1], avantDernier = pts => pts.length > 1 ? pts[pts.length - 2] : null;
const fin = (pts, n) => pts.slice(Math.max(0, pts.length - n));
const ISO = ms => new Date(ms).toISOString().slice(0, 10);

/* mesure issue d'une série [[ms, valeur]] : dernière valeur, valeur précédente, courbe courte */
function depuisSerie(pts, p, now) {
  if (!pts || !pts.length) throw new Error('série vide : ' + p.id);
  const d = dernier(pts), a = avantDernier(pts);
  return { m: mesure({ ...p, valeur: d[1], horodatage: d[0], precedente: a ? a[1] : null, serie: fin(pts, 60), recuLe: now() }, now()), pts };
}
const glissementAnnuel = pts => { const out = []; for (let i = 12; i < pts.length; i++) if (pts[i - 12][1]) out.push([pts[i][0], (pts[i][1] / pts[i - 12][1] - 1) * 100]); return out; };

/* ─── FRED : un seul appel pour toutes les séries ─── */
async function lotFred(c) {
  const debut = ISO(c.maintenant() - 800 * 864e5), brut = {}, erreurs = [];
  for (const [, serieId] of SERIES_FRED) {   // une série par appel : FRED répond un ZIP dès que plusieurs séries de fréquences différentes sont demandées
    try { Object.assign(brut, lireFred(await c.get('fred', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + serieId + '&cosd=' + debut, { type: 'text' }))); } catch (e) { erreurs.push(serieId + ' : ' + e.message); }
  }
  const mesures = [], points = {};
  for (const [id, serieId, libelle, unite, frequence, delai, variante] of SERIES_FRED) {
    try {
      if (!brut[serieId]) throw new Error('série non reçue');
      let pts = brut[serieId]; if (variante === 'ga') pts = glissementAnnuel(pts);
      const r = depuisSerie(pts, { id, libelle, unite, source: 'FRED · ' + serieId, sourceId: 'fred', url: 'https://fred.stlouisfed.org/series/' + serieId, frequence, delaiPublication: delai, note: variante === 'ga' ? 'glissement annuel calculé sur 12 mois à partir de la série ' + serieId : '' }, c.maintenant);
      mesures.push(r.m); points[id] = r.pts;
    } catch (e) { erreurs.push(serieId + ' : ' + e.message); }
  }
  if (!mesures.length) throw new Error('aucune série FRED lisible : ' + erreurs.join(' ; '));
  return { mesures, points, partiel: erreurs };
}

/* ─── Kraken ─── */
const premierResultat = j => { if (j.error && j.error.length) throw new Error('Kraken : ' + j.error.join(', ')); const k = Object.keys(j.result || {}).filter(x => x !== 'last'); if (!k.length) throw new Error('Kraken : réponse vide'); return j.result[k[0]]; };
async function lotKrakenSpot(c) {
  const j = await c.get('kraken', 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,PAXGUSD', { type: 'json' });
  if (j.error && j.error.length) throw new Error('Kraken : ' + j.error.join(', '));
  const r = j.result, cle = re => Object.keys(r).find(k => re.test(k)), t = now => now, now = c.maintenant();
  const btc = r[cle(/XBT|BTC/)], or = r[cle(/PAXG/)]; if (!btc && !or) throw new Error('Kraken : paires absentes');
  const mesures = [];
  if (btc) mesures.push(mesure({ id: 'btc.kraken', libelle: 'Bitcoin / dollar (Kraken)', valeur: Number(btc.c[0]), precedente: Number(btc.o), unite: '$', source: 'Kraken · XBT/USD', sourceId: 'kraken', url: 'https://www.kraken.com/prices/bitcoin', horodatage: now, frequence: 'temps_reel', note: 'précédente = ouverture du jour UTC' }, now));
  if (or) mesures.push(mesure({ id: 'or.paxg', libelle: 'Or : PAXG/USD (jeton adossé à l\'or, proxy du XAU/USD)', valeur: Number(or.c[0]), precedente: Number(or.o), unite: '$', source: 'Kraken · PAXG/USD', sourceId: 'kraken', url: 'https://www.kraken.com/prices/pax-gold', horodatage: now, frequence: 'temps_reel', note: 'PAXG est un jeton adossé à une once d\'or : proxy du cours de l\'or, ce n\'est PAS le XAU/USD au comptant ; précédente = ouverture du jour UTC' }, now));
  return { mesures };
}
async function lotKrakenJours(c) {
  const mesures = [], points = {}, now = c.maintenant();
  for (const [id, paire, libelle, note] of [['or.paxg.jour', 'PAXGUSD', 'Or : PAXG/USD (clôture quotidienne)', 'proxy de l\'or, voir or.paxg'], ['btc.kraken.jour', 'XBTUSD', 'Bitcoin / dollar (clôture quotidienne Kraken)', '']]) {
    const j = await c.get('kraken', 'https://api.kraken.com/0/public/OHLC?pair=' + paire + '&interval=1440', { type: 'json' }), lignes = premierResultat(j);
    const pts = lignes.map(l => [l[0] * 1000, Number(l[4])]).filter(p => isFinite(p[1]));
    const r = depuisSerie(pts, { id, libelle, unite: '$', source: 'Kraken · ' + paire + ' (bougies de 1 jour)', sourceId: 'kraken', url: 'https://docs.kraken.com/api/', frequence: 'quotidien', note }, c.maintenant);
    mesures.push(r.m); points[id] = r.pts;
  }
  return { mesures, points };
}
async function lotKrakenFutures(c) {
  const j = await c.get('kraken', 'https://futures.kraken.com/derivatives/api/v3/tickers', { type: 'json' });
  const t = (j.tickers || []).find(x => x.symbol === 'PF_XBTUSD'); if (!t) throw new Error('Kraken Futures : PF_XBTUSD absent');
  const ms = Date.parse(t.lastTime || j.serverTime), mesures = [];
  if (isFinite(Number(t.openInterest))) mesures.push(mesure({ id: 'btc.oi.kraken', libelle: 'Intérêt ouvert du perpétuel BTC (Kraken Futures)', valeur: Number(t.openInterest), unite: 'BTC', source: 'Kraken Futures · PF_XBTUSD', sourceId: 'kraken', url: 'https://futures.kraken.com/', horodatage: ms, frequence: 'temps_reel' }, c.maintenant()));
  if (isFinite(Number(t.fundingRate)) && Number(t.markPrice) > 0) mesures.push(mesure({ id: 'btc.funding.kraken', libelle: 'Financement du perpétuel BTC (Kraken Futures, taux horaire relatif)', valeur: Number(t.fundingRate) / Number(t.markPrice) * 100, unite: '% / h', source: 'Kraken Futures · PF_XBTUSD', sourceId: 'kraken', url: 'https://futures.kraken.com/', horodatage: ms, frequence: 'temps_reel', note: 'calculé : fundingRate (en $) ÷ prix de marque ; taux de la dernière heure' }, c.maintenant()));
  if (!mesures.length) throw new Error('Kraken Futures : champs absents');
  return { mesures };
}

/* ─── Binance ─── */
async function lotBinanceSpot(c) {
  const j = await c.get('binance', 'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT', { type: 'json' });
  return { mesures: [mesure({ id: 'btc.binance', libelle: 'Bitcoin / USDT (Binance, 24 h)', valeur: Number(j.lastPrice), precedente: Number(j.openPrice), unite: '$', source: 'Binance · BTCUSDT', sourceId: 'binance', url: 'https://www.binance.com/', horodatage: j.closeTime || c.maintenant(), frequence: 'temps_reel', note: 'précédente = prix il y a 24 h ; volume 24 h : ' + Math.round(Number(j.volume)) + ' BTC' }, c.maintenant()),
    mesure({ id: 'btc.volume24', libelle: 'Volume Bitcoin sur 24 h (Binance spot)', valeur: Number(j.volume), unite: 'BTC', source: 'Binance · BTCUSDT', sourceId: 'binance', url: 'https://www.binance.com/', horodatage: j.closeTime || c.maintenant(), frequence: 'temps_reel' }, c.maintenant())] };
}
async function lotBinanceDerives(c) {
  const mesures = [], now = c.maintenant(), erreurs = [];
  const essai = async (f) => { try { await f(); } catch (e) { erreurs.push(e.message); } };
  await essai(async () => { const j = await c.get('binance', 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', { type: 'json' }); mesures.push(mesure({ id: 'btc.funding', libelle: 'Financement du perpétuel BTC (Binance, par 8 h)', valeur: Number(j.lastFundingRate) * 100, unite: '%', source: 'Binance Futures · BTCUSDT', sourceId: 'binance', url: 'https://www.binance.com/en/futures/funding-history/perpetual/real-time-funding-rate', horodatage: j.time, frequence: 'temps_reel', note: 'taux appliqué au prochain règlement ; base indicative ' + (Number(j.markPrice) - Number(j.indexPrice)).toFixed(2) + ' $' }, now)); });
  await essai(async () => { const j = await c.get('binance', 'https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT', { type: 'json' }); mesures.push(mesure({ id: 'btc.oi', libelle: 'Intérêt ouvert du perpétuel BTC (Binance)', valeur: Number(j.openInterest), unite: 'BTC', source: 'Binance Futures · BTCUSDT', sourceId: 'binance', url: 'https://www.binance.com/en/futures/BTCUSDT', horodatage: j.time, frequence: 'temps_reel' }, now)); });
  await essai(async () => { const j = await c.get('binance', 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=2', { type: 'json' }); if (!Array.isArray(j) || !j.length) throw new Error('ratio long/short vide'); const d = j[j.length - 1], a = j.length > 1 ? j[j.length - 2] : null; mesures.push(mesure({ id: 'btc.longshort', libelle: 'Ratio comptes long / short (Binance, 1 h)', valeur: Number(d.longShortRatio), precedente: a ? Number(a.longShortRatio) : null, unite: '', source: 'Binance Futures · BTCUSDT', sourceId: 'binance', url: 'https://www.binance.com/en/futures-activity/leaderboard', horodatage: d.timestamp, frequence: 'differe', note: 'part de comptes long : ' + (Number(d.longAccount) * 100).toFixed(1) + ' %' }, now)); });
  if (!mesures.length) throw new Error(erreurs[0] || 'Binance dérivés indisponibles');
  return { mesures, partiel: erreurs };
}

/* ─── Deribit ─── */
async function lotDeribit(c) {
  const now = c.maintenant(), mesures = [], erreurs = [];
  const essai = async f => { try { await f(); } catch (e) { erreurs.push(e.message); } };
  await essai(async () => { const j = await c.get('deribit', 'https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd', { type: 'json' }); if (!j.result) throw new Error('Deribit : indice absent'); mesures.push(mesure({ id: 'btc.deribit', libelle: 'Indice Bitcoin / dollar (Deribit)', valeur: j.result.index_price, unite: '$', source: 'Deribit · btc_usd', sourceId: 'deribit', url: 'https://www.deribit.com/', horodatage: now, frequence: 'temps_reel' }, now)); });
  await essai(async () => { const j = await c.get('deribit', 'https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&resolution=3600&start_timestamp=' + (now - 3 * 864e5) + '&end_timestamp=' + now, { type: 'json' }); const d = j.result && j.result.data; if (!d || !d.length) throw new Error('DVOL vide'); const pts = d.map(x => [x[0] + 3600e3 > now ? now : x[0] + 3600e3, x[4]]); const r = depuisSerie(pts, { id: 'btc.dvol', libelle: 'DVOL : volatilité implicite 30 jours du Bitcoin', unite: '%', source: 'Deribit · DVOL (bougies de 1 h)', sourceId: 'deribit', url: 'https://www.deribit.com/statistics/BTC/volatility-index', frequence: 'temps_reel', note: 'dernière clôture horaire' }, c.maintenant); mesures.push(r.m); });
  await essai(async () => { const j = await c.get('deribit', 'https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option', { type: 'json' }); const l = j.result; if (!Array.isArray(l) || !l.length) throw new Error('options vides'); let p = 0, k = 0; for (const x of l) { const oi = Number(x.open_interest) || 0; if (/-P$/.test(x.instrument_name)) p += oi; else if (/-C$/.test(x.instrument_name)) k += oi; } if (!k) throw new Error('aucun call'); mesures.push(mesure({ id: 'btc.putcall', libelle: 'Ratio put / call des options Bitcoin (intérêt ouvert, Deribit)', valeur: p / k, unite: '', source: 'Deribit · options BTC', sourceId: 'deribit', url: 'https://www.deribit.com/options/BTC', horodatage: now, frequence: 'temps_reel', note: 'calculé : intérêt ouvert des puts ÷ celui des calls, ' + l.length + ' contrats' }, now)); });
  if (!mesures.length) throw new Error(erreurs[0] || 'Deribit indisponible');
  return { mesures, partiel: erreurs };
}

/* ─── alternative.me, mempool, DefiLlama ─── */
async function lotAltme(c) {
  const j = await c.get('altme', 'https://api.alternative.me/fng/?limit=2', { type: 'json' }); const d = j.data && j.data[0]; if (!d) throw new Error('indice peur/avidité vide');
  const a = j.data[1], m = mesure({ id: 'crypto.fng', libelle: 'Indice peur et avidité du marché crypto (0 = peur extrême, 100 = avidité extrême)', valeur: Number(d.value), precedente: a ? Number(a.value) : null, unite: '/ 100', source: 'alternative.me · Fear & Greed', sourceId: 'altme', url: 'https://alternative.me/crypto/fear-and-greed-index/', horodatage: Number(d.timestamp) * 1000, frequence: 'quotidien', note: 'classement de la source : ' + d.value_classification }, c.maintenant());
  return { mesures: [m] };
}
async function lotMempool(c) {
  const mesures = [], now = c.maintenant();
  const f = await c.get('mempool', 'https://mempool.space/api/v1/fees/recommended', { type: 'json' });
  const b = await c.get('mempool', 'https://mempool.space/api/v1/blocks', { type: 'json' }); const t = Array.isArray(b) && b[0]; if (!t) throw new Error('mempool : blocs absents');
  mesures.push(mesure({ id: 'btc.chaine.hauteur', libelle: 'Hauteur du dernier bloc Bitcoin', valeur: t.height, unite: 'bloc', source: 'mempool.space', sourceId: 'mempool', url: 'https://mempool.space/', horodatage: t.timestamp * 1000, frequence: 'differe', note: t.tx_count + ' transactions dans ce bloc' }, now));
  if (f && isFinite(f.fastestFee)) mesures.push(mesure({ id: 'btc.chaine.frais', libelle: 'Frais de transaction Bitcoin recommandés (le plus rapide)', valeur: f.fastestFee, unite: 'sat/vB', source: 'mempool.space', sourceId: 'mempool', url: 'https://mempool.space/', horodatage: now, frequence: 'temps_reel' }, now));
  return { mesures };
}
async function lotDefiLlama(c) {
  const mesures = [], now = c.maintenant(), erreurs = [];
  try { const j = await c.get('defillama', 'https://api.llama.fi/v2/historicalChainTvl', { type: 'json' }); const pts = j.map(x => [x.date * 1000, x.tvl]).filter(p => isFinite(p[1]) && p[1] > 0); const r = depuisSerie(pts, { id: 'defi.tvl', libelle: 'Valeur verrouillée dans la finance décentralisée (TVL, toutes chaînes)', unite: '$', source: 'DefiLlama · TVL', sourceId: 'defillama', url: 'https://defillama.com/', frequence: 'quotidien' }, c.maintenant); mesures.push(r.m); } catch (e) { erreurs.push('TVL : ' + e.message); }
  try { const j = await c.get('defillama', 'https://stablecoins.llama.fi/stablecoins?includePrices=false', { type: 'json' }); const l = j.peggedAssets; if (!Array.isArray(l)) throw new Error('liste absente'); const tot = l.reduce((s, x) => s + (x.circulating && Number(x.circulating.peggedUSD) || 0), 0); const prec = l.reduce((s, x) => s + (x.circulatingPrevWeek && Number(x.circulatingPrevWeek.peggedUSD) || 0), 0); mesures.push(mesure({ id: 'defi.stablecoins', libelle: 'Capitalisation totale des stablecoins (en dollars)', valeur: tot, precedente: prec || null, unite: '$', source: 'DefiLlama · stablecoins', sourceId: 'defillama', url: 'https://defillama.com/stablecoins', horodatage: now, frequence: 'quotidien', note: 'somme des actifs indexés sur le dollar ; précédente = il y a 7 jours' }, now)); } catch (e) { erreurs.push('stablecoins : ' + e.message); }
  if (!mesures.length) throw new Error(erreurs.join(' ; '));
  return { mesures, partiel: erreurs };
}

/* ─── BCE, Frankfurter, Eurostat, INSEE ─── */
async function lotBce(c) {
  const mesures = [], points = {}, erreurs = [];
  try { const pts = lireBce(await c.get('bce', 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=400&format=csvdata', { type: 'text' })); const r = depuisSerie(pts, { id: 'eurusd.bce', libelle: 'Euro en dollars (cours de référence de la BCE)', unite: '$', source: 'BCE · EXR D.USD.EUR', sourceId: 'bce', url: 'https://data.ecb.europa.eu/data/datasets/EXR', frequence: 'quotidien', delaiPublication: 'publié chaque jour ouvré vers 16 h (Francfort)' }, c.maintenant); mesures.push(r.m); points['eurusd.bce'] = r.pts; } catch (e) { erreurs.push('EXR : ' + e.message); }
  try { const pts = lireBce(await c.get('bce', 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?lastNObservations=6&format=csvdata', { type: 'text' })); const r = depuisSerie(pts, { id: 'taux.bce', libelle: 'Taux de la facilité de dépôt de la BCE (taux directeur)', unite: '%', source: 'BCE · FM DFR', sourceId: 'bce', url: 'https://data.ecb.europa.eu/data/datasets/FM', frequence: 'palier', delaiPublication: 'à la décision du Conseil des gouverneurs', note: 'la date est celle d\'entrée en vigueur du taux' }, c.maintenant); mesures.push(r.m); } catch (e) { erreurs.push('DFR : ' + e.message); }
  if (!mesures.length) throw new Error(erreurs.join(' ; '));
  return { mesures, points, partiel: erreurs };
}
async function lotFrankfurter(c) {
  const debut = ISO(c.maintenant() - 400 * 864e5);
  const j = await c.get('frankfurter', 'https://api.frankfurter.dev/v1/' + debut + '..?base=USD&symbols=CHF', { type: 'json' });
  const pts = Object.entries(j.rates || {}).map(([d, r]) => [Date.parse(d + 'T00:00:00Z'), r.CHF]).filter(p => isFinite(p[0]) && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const r = depuisSerie(pts, { id: 'chf.frankfurter', libelle: 'Franc suisse pour 1 dollar (taux de référence BCE via Frankfurter)', unite: 'CHF', source: 'Frankfurter · base BCE', sourceId: 'frankfurter', url: 'https://frankfurter.dev/', frequence: 'quotidien', delaiPublication: 'publié chaque jour ouvré vers 16 h (Francfort)' }, c.maintenant);
  return { mesures: [r.m], points: { 'chf.frankfurter': r.pts } };
}
async function lotEurostat(c) {
  const j = await c.get('eurostat', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?format=JSON&geo=EA&geo=FR&coicop=CP00&lastTimePeriod=14', { type: 'json' }), mesures = [], erreurs = [];
  for (const [geo, id, lib] of [['EA', 'macro.hicp.ea', 'Inflation zone euro (IPCH, glissement annuel)'], ['FR', 'macro.hicp.fr', 'Inflation France (IPCH, glissement annuel)']]) {
    try { const r = depuisSerie(lireEurostat(j, geo), { id, libelle: lib, unite: '%', source: 'Eurostat · prc_hicp_manr', sourceId: 'eurostat', url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr', frequence: 'mensuel', delaiPublication: 'estimation rapide fin de mois, définitif mi-mois suivant' }, c.maintenant); mesures.push(r.m); } catch (e) { erreurs.push(geo + ' : ' + e.message); }
  }
  if (!mesures.length) throw new Error(erreurs.join(' ; '));
  return { mesures, partiel: erreurs };
}
async function lotInsee(c) {
  const pts = lireInsee(await c.get('insee', 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/001759970?lastNObservations=14', { type: 'text' })), ga = glissementAnnuel(pts);
  if (!ga.length) throw new Error('INSEE : moins de 13 observations');
  const r = depuisSerie(ga, { id: 'macro.ipc.fr', libelle: 'Prix à la consommation en France (INSEE, série 001759970, glissement annuel)', unite: '%', source: 'INSEE · BDM 001759970', sourceId: 'insee', url: 'https://www.insee.fr/fr/statistiques/serie/001759970', frequence: 'mensuel', delaiPublication: 'environ 2 semaines après la fin du mois', note: 'glissement annuel calculé sur 12 mois à partir de l\'indice de la série 001759970' }, c.maintenant);
  return { mesures: [r.m] };
}

/* ─── CFTC (COT) ─── */
async function lotCot(c) {
  const mesures = [], points = {}, erreurs = [];
  for (const [cle, code, nomContrat, jeu, sl, ss, cl, cs, nomSpec] of CONTRATS_COT) {
    try {
      const url = 'https://publicreporting.cftc.gov/resource/' + jeu + '.json?$limit=60&$order=report_date_as_yyyy_mm_dd%20DESC&$where=cftc_contract_market_code%3D%27' + code + '%27';
      const rows = await c.get('cftc', url, { type: 'json' }); if (!Array.isArray(rows) || !rows.length) throw new Error('aucune ligne');
      const lignes = rows.map(r => ({ t: Date.parse(String(r.report_date_as_yyyy_mm_dd).slice(0, 10) + 'T00:00:00Z'), sl: Number(r[sl]), ss: Number(r[ss]), cl: Number(r[cl]), cs: Number(r[cs]), oi: Number(r.open_interest_all) })).filter(l => isFinite(l.t) && isFinite(l.sl) && isFinite(l.ss)).sort((a, b) => a.t - b.t);
      if (!lignes.length) throw new Error('colonnes absentes');
      const spec = lignes.map(l => [l.t, l.sl - l.ss]), comm = lignes.filter(l => isFinite(l.cl) && isFinite(l.cs)).map(l => [l.t, l.cl - l.cs]), dl = lignes[lignes.length - 1];
      const base = { sourceId: 'cftc', url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm', frequence: 'hebdomadaire', delaiPublication: 'le vendredi pour les positions du mardi précédent', unite: 'contrats' };
      const r1 = depuisSerie(spec, { ...base, id: 'cot.' + cle + '.spec', libelle: 'COT ' + nomContrat + ' : position nette des ' + nomSpec.toLowerCase() + ' (long − short)', source: 'CFTC · ' + nomContrat, note: 'positions du mardi ' + ISO(dl.t) + ' · intérêt ouvert ' + dl.oi + ' · hebdomadaire, jamais un signal d\'achat ou de vente' }, c.maintenant); mesures.push(r1.m); points['cot.' + cle + '.spec'] = r1.pts;
      if (comm.length) { const r2 = depuisSerie(comm, { ...base, id: 'cot.' + cle + '.comm', libelle: 'COT ' + nomContrat + ' : position nette des commerciaux / dealers', source: 'CFTC · ' + nomContrat }, c.maintenant); mesures.push(r2.m); points['cot.' + cle + '.comm'] = r2.pts; }
    } catch (e) { erreurs.push(nomContrat + ' : ' + e.message); }
  }
  if (!mesures.length) throw new Error(erreurs.join(' ; '));
  return { mesures, points, partiel: erreurs };
}

/* ─── SEC EDGAR : derniers dépôts de quelques entités (nom lu dans la réponse) ─── */
const CIK_SUIVIS = ['0001222333', '0001980994', '0001067839'];
async function lotEdgar(c) {
  const items = [], erreurs = [];
  for (const cik of CIK_SUIVIS) {
    try {
      const j = await c.get('edgar', 'https://data.sec.gov/submissions/CIK' + cik + '.json', { type: 'json' }), r = j.filings && j.filings.recent; if (!r || !r.form) throw new Error('dépôts absents');
      for (let i = 0; i < Math.min(5, r.form.length); i++) items.push({ type: 'depot', source: 'SEC EDGAR · ' + j.name, sourceId: 'edgar', titre: j.name + ' : ' + r.form[i] + (r.primaryDocDescription && r.primaryDocDescription[i] ? ' (' + r.primaryDocDescription[i] + ')' : ''), publieMs: Date.parse(r.filingDate[i] + 'T00:00:00Z'), lien: 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + String(r.accessionNumber[i]).replace(/-/g, '') + '/' + r.primaryDocument[i], actifs: [] });
    } catch (e) { erreurs.push(cik + ' : ' + e.message); }
  }
  if (!items.length) throw new Error(erreurs.join(' ; ') || 'aucun dépôt');
  return { mesures: [], items: items.sort((a, b) => b.publieMs - a.publieMs), partiel: erreurs };
}

/* ─── CBOE ─── */
async function lotCboe(c) {
  const mesures = [], points = {}, erreurs = [];
  try {
    const l = lireCsv(await c.get('cboe', 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { type: 'text' })), pts = [];
    for (const r of l.slice(1)) { const m = String(r[0]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) continue; const v = Number(r[4]); if (isFinite(v)) pts.push([Date.UTC(+m[3], +m[1] - 1, +m[2]), v]); }
    const r = depuisSerie(fin(pts, 400), { id: 'marche.vix', libelle: 'VIX : indice de volatilité implicite du S&P 500 (clôture)', unite: 'pts', source: 'CBOE · VIX_History', sourceId: 'cboe', url: 'https://www.cboe.com/tradable_products/vix/vix_historical_data/', frequence: 'quotidien', delaiPublication: 'fichier mis à jour après la clôture' }, c.maintenant); mesures.push(r.m); points['marche.vix'] = r.pts;
  } catch (e) { erreurs.push('VIX : ' + e.message); }
  if (!mesures.length) throw new Error(erreurs.join(' ; '));
  return { mesures, points, partiel: erreurs };
}

/* ─── calendriers officiels (heure de Paris à l'affichage) ─── */
async function lotCalendrier(c) {
  const items = [], erreurs = [], now = c.maintenant();
  try { for (const r of lireFomc(await c.get('fomc', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', { type: 'text' }))) if (Date.parse(r.fin + 'T23:00:00Z') > now - 7 * 864e5) items.push({ type: 'evenement', source: 'Réserve fédérale · calendrier FOMC', sourceId: 'fomc', titre: r.titre, jour: r.fin, debutJour: r.debut, dateMs: Date.parse(r.fin + 'T18:00:00Z'), heureConnue: false, importance: 'haute', actifs: ['or', 'us100', 'btc', 'usd', 'chf'], precedent: null, lien: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', note: 'décision publiée le dernier jour, 14 h heure de New York' }); } catch (e) { erreurs.push('FOMC : ' + e.message); }
  try { for (const r of lireBceCalendrier(await c.get('bce-cal', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', { type: 'text' }))) if (/monetary policy meeting/i.test(r.titre) && Date.parse(r.date + 'T23:00:00Z') > now - 7 * 864e5) items.push({ type: 'evenement', source: 'BCE · calendrier du Conseil des gouverneurs', sourceId: 'bce-cal', titre: 'BCE : ' + r.titre.replace(/Governing Council of the ECB: /, ''), jour: r.date, dateMs: Date.parse(r.date + 'T12:00:00Z'), heureConnue: false, importance: /press conference/i.test(r.titre) ? 'haute' : 'normale', actifs: ['usd', 'chf', 'or'], precedent: null, lien: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', note: '' }); } catch (e) { erreurs.push('BCE : ' + e.message); }
  try { for (const r of lireIcs(await c.get('bls-cal', 'https://www.bls.gov/schedule/news_release/bls.ics', { type: 'text' }))) if (r.debutMs > now - 2 * 864e5 && r.debutMs < now + 60 * 864e5) items.push({ type: 'evenement', source: 'BLS · calendrier des publications', sourceId: 'bls-cal', titre: 'BLS : ' + r.titre, jour: ISO(r.debutMs), dateMs: r.debutMs, heureConnue: r.heure, importance: r.importance === 'importante' ? 'haute' : 'normale', actifs: /employment|cpi|consumer price|producer price|payroll/i.test(r.titre) ? ['or', 'us100', 'btc', 'usd'] : [], precedent: null, lien: 'https://www.bls.gov/schedule/news_release/', note: '' }); } catch (e) { erreurs.push('BLS : ' + e.message); }
  if (!items.length) throw new Error(erreurs.join(' ; ') || 'aucun événement');
  return { mesures: [], items: items.sort((a, b) => a.dateMs - b.dateMs), partiel: erreurs };
}

/* ─── flux RSS (titres, résumés courts, liens) ─── */
const lotRss = groupe => async c => {
  const items = [], erreurs = [], liste = FLUX.filter(f => f[3] === groupe);
  await Promise.all(liste.map(async ([id, nomFlux, url, g, langue]) => {
    try { for (const a of lireRss(await c.get(groupe === 'officiel' ? 'rss-officiels' : 'rss-medias', url, { type: 'text' }), 12)) items.push({ type: 'actu', source: nomFlux, sourceId: groupe === 'officiel' ? 'rss-officiels' : 'rss-medias', fluxId: id, langue, groupe: g, titre: a.titre, resume: a.resume, lien: a.lien, publieMs: a.publieMs, actifs: actifsDe(a.titre + ' ' + a.resume) }); }
    catch (e) { erreurs.push(nomFlux + ' : ' + e.message); }
  }));
  if (!items.length) throw new Error(erreurs.join(' ; ') || 'aucun article');
  return { mesures: [], items: items.sort((a, b) => b.publieMs - a.publieMs), partiel: erreurs };
};
export const actifsDe = texte => Object.entries(MOTS_ACTIFS).filter(([, re]) => re.test(texte)).map(([k]) => k);

/* ─── GDELT (à la demande, 1 appel / 6 s) ─── */
export async function gdelt(c, q) {
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) + '&mode=artlist&format=json&maxrecords=15&sort=datedesc&timespan=2d';
  const j = await c.get('gdelt', url, { type: 'json' }); if (!j || !Array.isArray(j.articles)) throw new Error('GDELT : aucun article');
  return { mesures: [], items: j.articles.map(a => ({ type: 'actu', source: 'GDELT · ' + (a.domain || 'web'), sourceId: 'gdelt', titre: String(a.title || '').slice(0, 220), resume: '', lien: a.url, langue: a.language, publieMs: Date.parse(String(a.seendate).replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')), actifs: actifsDe(a.title || '') })).filter(a => a.titre && isFinite(a.publieMs)) };
}

/* ─── sources facultatives (désactivées par défaut) ─── */
async function lotYahoo(c) {
  const mesures = [], now = c.maintenant();
  for (const [sym, id, lib] of [['^NDX', 'us100.yahoo', 'Nasdaq 100 (Yahoo, non documenté, différé)'], ['GC=F', 'or.yahoo', 'Or : contrat à terme GC=F (Yahoo, non documenté, différé)']]) {
    const j = await c.get('yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=5d&interval=1d', { type: 'json' }), r = j.chart && j.chart.result && j.chart.result[0]; if (!r) throw new Error('Yahoo : ' + sym + ' absent');
    mesures.push(mesure({ id, libelle: lib, valeur: r.meta.regularMarketPrice, precedente: r.meta.chartPreviousClose, unite: r.meta.currency === 'USD' ? '$' : r.meta.currency || '', source: 'Yahoo Finance · ' + sym + ' (FACULTATIF)', sourceId: 'yahoo', url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(sym), horodatage: (r.meta.regularMarketTime || 0) * 1000, frequence: 'differe', note: 'point d\'accès non documenté : peut disparaître' }, now));
  }
  return { mesures };
}
async function lotFinnhub(c) {
  const k = c.env.FINNHUB_KEY; if (!k) throw new Error('clé FINNHUB_KEY absente');
  const j = await c.get('finnhub', 'https://finnhub.io/api/v1/quote?symbol=QQQ&token=' + encodeURIComponent(k), { type: 'json' });
  return { mesures: [mesure({ id: 'us100.finnhub', libelle: 'QQQ (ETF Nasdaq 100), cours différé (Finnhub)', valeur: j.c, precedente: j.pc, unite: '$', source: 'Finnhub · QQQ', sourceId: 'finnhub', url: 'https://finnhub.io/', horodatage: (j.t || 0) * 1000, frequence: 'differe', note: 'ETF suivant le Nasdaq 100, pas l\'indice lui-même' }, c.maintenant())] };
}
async function lotTwelve(c) {
  const k = c.env.TWELVEDATA_KEY; if (!k) throw new Error('clé TWELVEDATA_KEY absente');
  const j = await c.get('twelvedata', 'https://api.twelvedata.com/quote?symbol=QQQ&apikey=' + encodeURIComponent(k), { type: 'json' }); if (j.status === 'error') throw new Error('Twelve Data : ' + j.message);
  return { mesures: [mesure({ id: 'us100.twelvedata', libelle: 'QQQ (ETF Nasdaq 100), cours différé (Twelve Data)', valeur: Number(j.close), precedente: Number(j.previous_close), unite: '$', source: 'Twelve Data · QQQ', sourceId: 'twelvedata', url: 'https://twelvedata.com/', horodatage: (j.timestamp || 0) * 1000, frequence: 'differe', note: 'ETF suivant le Nasdaq 100, pas l\'indice lui-même' }, c.maintenant())] };
}

/* Lots : id, source du registre (santé), fonction, groupes de panneaux qui s'en servent */
export const LOTS = [
  { id: 'fred', source: 'fred', lire: lotFred }, { id: 'kraken-spot', source: 'kraken', ttl: 20, lire: lotKrakenSpot }, { id: 'kraken-jours', source: 'kraken', ttl: 3600, lire: lotKrakenJours },
  { id: 'kraken-futures', source: 'kraken', ttl: 60, lire: lotKrakenFutures }, { id: 'binance-spot', source: 'binance', lire: lotBinanceSpot }, { id: 'binance-derives', source: 'binance', lire: lotBinanceDerives },
  { id: 'deribit', source: 'deribit', lire: lotDeribit }, { id: 'altme', source: 'altme', lire: lotAltme }, { id: 'mempool', source: 'mempool', lire: lotMempool }, { id: 'defillama', source: 'defillama', lire: lotDefiLlama },
  { id: 'bce', source: 'bce', lire: lotBce }, { id: 'frankfurter', source: 'frankfurter', lire: lotFrankfurter }, { id: 'eurostat', source: 'eurostat', lire: lotEurostat }, { id: 'insee', source: 'insee', lire: lotInsee },
  { id: 'cftc', source: 'cftc', lire: lotCot }, { id: 'edgar', source: 'edgar', lire: lotEdgar }, { id: 'cboe', source: 'cboe', lire: lotCboe },
  { id: 'calendrier', source: 'fomc', ttl: 21600, lire: lotCalendrier, sources: ['fomc', 'bce-cal', 'bls-cal'] },
  { id: 'rss-officiels', source: 'rss-officiels', lire: lotRss('officiel') }, { id: 'rss-medias', source: 'rss-medias', lire: lotRss('media') },
  { id: 'yahoo', source: 'yahoo', lire: lotYahoo }, { id: 'finnhub', source: 'finnhub', lire: lotFinnhub }, { id: 'twelvedata', source: 'twelvedata', lire: lotTwelve }
];
