// Sonde REELLE (depuis ce PC) des sources gratuites du hub Finance : statut, delai, CORS (utilisable depuis le navigateur ?), taille, forme de la reponse.
// Aucune cle, aucun secret. Lancer :  node planetes/mars/outils-agent/sonde-sources-finance.mjs [filtre]   (ecrit docs/sources-finance.json si pas de filtre)
import fs from 'node:fs';
const ORIGINE = 'http://127.0.0.1:8000', UA = 'RayleHub/1.0 (assistant personnel, usage non commercial)';
const aujourdhui = new Date().toISOString().slice(0, 10), annee = new Date().getFullYear();
const S = [
  // COT
  ['cftc_tff', 'COT : TFF (futures financiers), Nasdaq-100 mini', 'https://publicreporting.cftc.gov/resource/gpe5-46if.json?$limit=2&$order=report_date_as_yyyy_mm_dd%20DESC&$where=cftc_contract_market_code%3D%27209742%27'],
  ['cftc_disagg', 'COT : Disaggregated (matieres), or', 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$limit=2&$order=report_date_as_yyyy_mm_dd%20DESC&$where=cftc_contract_market_code%3D%27088691%27'],
  ['cftc_legacy', 'COT : Legacy (deja dans le Worker)', 'https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=1&$order=report_date_as_yyyy_mm_dd%20DESC&$where=cftc_contract_market_code%3D%27133741%27'],
  // calendrier
  ['ff_semaine', 'Calendrier economique : Forex Factory (semaine)', 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'],
  ['ff_suivante', 'Calendrier economique : semaine suivante', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'],
  ['fed_fomc_page', 'Fed : calendrier FOMC (page officielle)', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'],
  ['bls_calendrier', 'BLS : calendrier des publications (page officielle)', 'https://www.bls.gov/schedule/news_release/current_year.htm'],
  ['nasdaq_earnings', 'Resultats d entreprises : API publique de nasdaq.com (non documentee)', 'https://api.nasdaq.com/api/calendar/earnings?date=' + aujourdhui],
  ['alphavantage_earn', 'Resultats : Alpha Vantage EARNINGS_CALENDAR (cle gratuite requise)', 'https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=demo'],
  // banques centrales (RSS)
  ['fed_presse', 'Fed : communiques (RSS)', 'https://www.federalreserve.gov/feeds/press_all.xml'],
  ['fed_monetaire', 'Fed : politique monetaire (RSS)', 'https://www.federalreserve.gov/feeds/press_monetary.xml'],
  ['fed_discours', 'Fed : discours (RSS)', 'https://www.federalreserve.gov/feeds/speeches.xml'],
  ['bce_presse', 'BCE : communiques (RSS)', 'https://www.ecb.europa.eu/rss/press.html'],
  ['bce_blog', 'BCE : blog (RSS)', 'https://www.ecb.europa.eu/rss/blog.html'],
  ['boe', 'Banque d Angleterre : actualites (RSS)', 'https://www.bankofengland.co.uk/rss/news'],
  ['boj', 'Banque du Japon : nouveautes (RSS)', 'https://www.boj.or.jp/en/rss/whatsnew.xml'],
  ['bns', 'BNS : communiques (RSS)', 'https://www.snb.ch/public/en/rss/pressrel'],
  ['boc', 'Banque du Canada : actualites (RSS)', 'https://www.bankofcanada.ca/content_type/press-releases/feed/'],
  ['rba', 'RBA : communiques (RSS)', 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml'],
  // taux
  ['treasury_csv', 'Tresor americain : courbe des taux (CSV officiel)', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/' + annee + '/all?type=daily_treasury_yield_curve&field_tdr_date_value=' + annee + '&page&_format=csv'],
  ['fred_csv_dgs10', 'FRED : DGS10 (CSV public, sans cle)', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10'],
  ['fred_csv_cpi', 'FRED : CPIAUCSL (CSV public)', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL'],
  ['fred_api', 'FRED : API officielle (cle gratuite requise)', 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=DEMO&file_type=json&limit=1'],
  // SEC
  ['sec_submissions', 'SEC EDGAR : depots d Apple (data.sec.gov)', 'https://data.sec.gov/submissions/CIK0000320193.json'],
  ['sec_tickers', 'SEC EDGAR : correspondance symboles/CIK', 'https://www.sec.gov/files/company_tickers.json'],
  ['sec_atom', 'SEC EDGAR : flux Atom des 8-K recents', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=10&output=atom'],
  // Nasdaq-100
  ['invesco_qqq', 'Invesco QQQ : composition (API du site)', 'https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF'],
  ['stooq_multi', 'Stooq : cotations de plusieurs valeurs en une requete (CSV)', 'https://stooq.com/q/l/?s=aapl.us+msft.us+nvda.us&f=sd2t2ohlcvp&h&e=csv'],
  ['wiki_ndx', 'Wikipedia : composition du Nasdaq-100 (API)', 'https://en.wikipedia.org/w/api.php?action=parse&page=Nasdaq-100&prop=wikitext&section=11&format=json'],
  // actualites financieres (RSS)
  ['yahoo_finance', 'Yahoo Finance (RSS)', 'https://finance.yahoo.com/news/rssindex'],
  ['cnbc_top', 'CNBC : une (RSS)', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
  ['cnbc_finance', 'CNBC : finance (RSS)', 'https://www.cnbc.com/id/10000664/device/rss/rss.html'],
  ['marketwatch', 'MarketWatch : Top Stories (RSS)', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['marketwatch_marches', 'MarketWatch : marketpulse (RSS)', 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse'],
  ['ft', 'Financial Times : accueil (RSS)', 'https://www.ft.com/rss/home'],
  ['bloomberg_marches', 'Bloomberg : marches (RSS)', 'https://feeds.bloomberg.com/markets/news.rss'],
  ['echos', 'Les Echos : Finance & Marches (RSS)', 'https://www.lesechos.fr/rss/finance-marches.xml'],
  ['boursorama', 'Boursorama : actualites (RSS)', 'https://www.boursorama.com/rss/actualites/economie'],
  ['investing', 'Investing.com : actualites (RSS)', 'https://www.investing.com/rss/news.rss'],
  ['seekingalpha', 'Seeking Alpha : market currents (RSS)', 'https://seekingalpha.com/market_currents.xml'],
  ['coindesk', 'CoinDesk (RSS)', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  // institutions et banques
  ['bce_pubs', 'BCE : publications (RSS)', 'https://www.ecb.europa.eu/rss/pub.html'],
  ['fmi', 'FMI : actualites (RSS)', 'https://www.imf.org/en/news/rss?language=eng'],
  ['bri_pub', 'BRI : publications (RSS)', 'https://www.bis.org/doclist/bis_fsi_publs.rss'],
  ['bri_discours', 'BRI : discours de banques centrales (RSS)', 'https://www.bis.org/doclist/cbspeeches.rss'],
  ['ocde', 'OCDE : actualites (RSS)', 'https://www.oecd.org/newsroom/index.xml'],
  ['ing_think', 'ING Think : analyses (RSS)', 'https://think.ing.com/rss'],
  ['bnp_eco', 'BNP Paribas Economic Research (RSS)', 'https://economic-research.bnpparibas.com/RSS/en-US'],
  ['natixis', 'Natixis Research (RSS)', 'https://www.research.natixis.com/Site/en/rss'],
  ['ca_eco', 'Credit Agricole : etudes economiques (RSS)', 'https://etudes-economiques.credit-agricole.com/rss.xml'],
  ['ny_fed', 'NY Fed : Liberty Street Economics (RSS)', 'https://libertystreeteconomics.newyorkfed.org/feed/'],
  ['stl_fed', 'St. Louis Fed : publications (RSS)', 'https://www.stlouisfed.org/rss/page%20resources/publications-rss.aspx']
];
const resultats = [];
const lim = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const [id, nom, url] of S) {
  if (lim && !lim.test(id)) continue;
  const t0 = Date.now(), r = { id, nom, url: url.replace(/(api_?key=)[^&]+/i, '$1***'), date: new Date().toISOString() };
  try {
    const rep = await fetch(url, { headers: { Origin: ORIGINE, 'User-Agent': /sec\.gov/.test(url) ? UA : 'Mozilla/5.0 (compatible; RayleHub/1.0)', Accept: '*/*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    r.statut = rep.status; r.ms = Date.now() - t0; r.cors = rep.headers.get('access-control-allow-origin') || null; r.type = (rep.headers.get('content-type') || '').split(';')[0];
    const txt = await rep.text(); r.octets = txt.length;
    r.nbItem = (txt.match(/<item[ >]|<entry[ >]/g) || []).length || null;
    r.extrait = txt.replace(/\s+/g, ' ').slice(0, 170);
  } catch (e) { r.erreur = String(e.message || e).slice(0, 120); r.ms = Date.now() - t0; }
  resultats.push(r);
  console.log(String(r.statut || 'ERR').padEnd(4) + (r.cors ? 'CORS ' : '     ') + String(r.ms).padStart(5) + 'ms ' + String(r.octets || 0).padStart(7) + 'o ' + (r.nbItem != null ? r.nbItem + ' it ' : '      ') + id.padEnd(20) + ' ' + (r.erreur || r.extrait).slice(0, 80));
  await new Promise(x => setTimeout(x, 250));
}
if (!lim) fs.writeFileSync(new URL('../../../docs/sources-finance.json', import.meta.url), JSON.stringify({ sondeLe: new Date().toISOString(), depuis: 'PC de Justin (France), Node', resultats }, null, 1));
