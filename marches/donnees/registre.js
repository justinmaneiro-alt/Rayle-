/* ═════════════ REGISTRE DES SOURCES (RAYLE MARCHÉS) ═════════════
   Une entrée par source : nom, adresse, fréquence, clé requise ou non, limites d'appels, conditions d'utilisation. La santé (OK / lent / en panne, dernier succès) est tenue par le hub.
   Règle : seules les sources testées en direct le 2026-11-14 (marches/tests/sonde-reelle.mjs) sont ACTIVES par défaut ; les fragiles ou à clé sont facultatives (defaut:false).
   Les sources abandonnées (testées, inutilisables) sont listées dans ABANDONNEES avec la raison : le rapport les reprend. */
export const SOURCES = [
  { id: 'fred', nom: 'FRED (Réserve fédérale de Saint-Louis)', groupe: 'macro', url: 'https://fred.stlouisfed.org/graph/fredgraph.csv', docs: 'https://fred.stlouisfed.org/docs/api/fred/', cle: false, defaut: true, ttl: 3600, delai: 25000, ecartMin: 500, limite: 'export CSV public, 14 appels (une série chacun) par heure au plus ici ; pas de limite publiée', conditions: 'données publiques ; certaines séries tierces (ex. NASDAQ100, indices S&P) peuvent avoir un copyright : usage personnel, affichage limité à la dernière valeur et à une courte courbe', frequence: 'quotidien' },
  { id: 'kraken', nom: 'Kraken (API publique)', groupe: 'prix', url: 'https://api.kraken.com/0/public/', docs: 'https://docs.kraken.com/api/', cle: false, defaut: true, ttl: 20, delai: 10000, ecartMin: 1000, limite: 'limite publique ≈ 1 appel / s', conditions: 'API publique de lecture', frequence: 'temps_reel' },
  { id: 'binance', nom: 'Binance (spot et dérivés, API publique)', groupe: 'prix', url: 'https://fapi.binance.com/', docs: 'https://developers.binance.com/', cle: false, defaut: true, ttl: 60, delai: 10000, ecartMin: 1000, limite: 'poids par IP ; inaccessible depuis certains pays (HTTP 451) : alors « indisponible »', conditions: 'API publique de lecture', frequence: 'temps_reel' },
  { id: 'deribit', nom: 'Deribit (options Bitcoin, DVOL)', groupe: 'crypto', url: 'https://www.deribit.com/api/v2/public/', docs: 'https://docs.deribit.com/', cle: false, defaut: true, ttl: 120, delai: 15000, ecartMin: 1000, limite: 'API publique, limite par IP', conditions: 'API publique de lecture', frequence: 'temps_reel' },
  { id: 'altme', nom: 'alternative.me (indice peur et avidité crypto)', groupe: 'crypto', url: 'https://api.alternative.me/fng/', docs: 'https://alternative.me/crypto/fear-and-greed-index/', cle: false, defaut: true, ttl: 1800, delai: 10000, ecartMin: 2000, limite: '60 appels / min', conditions: 'usage libre avec mention de la source (alternative.me)', frequence: 'quotidien' },
  { id: 'mempool', nom: 'mempool.space (chaîne Bitcoin)', groupe: 'crypto', url: 'https://mempool.space/api/', docs: 'https://mempool.space/docs/api/rest', cle: false, defaut: true, ttl: 120, delai: 10000, ecartMin: 1000, limite: 'appels raisonnables', conditions: 'API publique, usage raisonnable', frequence: 'temps_reel' },
  { id: 'defillama', nom: 'DefiLlama (TVL, stablecoins)', groupe: 'crypto', url: 'https://api.llama.fi/', docs: 'https://defillama.com/docs/api', cle: false, defaut: true, ttl: 1800, delai: 25000, ecartMin: 3000, limite: 'API ouverte, usage raisonnable', conditions: 'API publique gratuite, attribution à DefiLlama', frequence: 'quotidien' },
  { id: 'bce', nom: 'BCE (portail de données SDMX)', groupe: 'macro', url: 'https://data-api.ecb.europa.eu/service/data/', docs: 'https://data.ecb.europa.eu/help/api/overview', cle: false, defaut: true, ttl: 3600, delai: 20000, ecartMin: 1500, limite: 'API ouverte', conditions: 'réutilisation autorisée avec mention de la BCE', frequence: 'quotidien' },
  { id: 'frankfurter', nom: 'Frankfurter (taux de change basés BCE)', groupe: 'prix', url: 'https://api.frankfurter.dev/v1/', docs: 'https://frankfurter.dev/', cle: false, defaut: true, ttl: 3600, delai: 10000, ecartMin: 1000, limite: 'API ouverte', conditions: 'données de référence de la BCE, publiées vers 16 h CET', frequence: 'quotidien' },
  { id: 'eurostat', nom: 'Eurostat (inflation zone euro)', groupe: 'macro', url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/', docs: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started', cle: false, defaut: true, ttl: 21600, delai: 20000, ecartMin: 1500, limite: 'API ouverte', conditions: 'réutilisation libre avec mention d\'Eurostat', frequence: 'mensuel' },
  { id: 'insee', nom: 'INSEE (Banque de données macro-économiques)', groupe: 'macro', url: 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/', docs: 'https://www.insee.fr/fr/information/2868055', cle: false, defaut: true, ttl: 21600, delai: 20000, ecartMin: 1500, limite: 'API ouverte', conditions: 'licence ouverte Etalab', frequence: 'mensuel' },
  { id: 'cftc', nom: 'CFTC (Commitments of Traders)', groupe: 'positions', url: 'https://publicreporting.cftc.gov/resource/', docs: 'https://publicreporting.cftc.gov/', cle: false, defaut: true, ttl: 21600, delai: 25000, ecartMin: 1500, limite: 'API Socrata sans jeton : limitée par IP', conditions: 'données publiques ; rapport du mardi publié le vendredi (les semaines de blocage administratif peuvent le décaler)', frequence: 'hebdomadaire' },
  { id: 'edgar', nom: 'SEC EDGAR', groupe: 'institutions', url: 'https://data.sec.gov/submissions/', docs: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces', cle: false, defaut: true, ttl: 1800, delai: 15000, ecartMin: 200, limite: '10 appels / s maximum, en-tête User-Agent obligatoire (variable SEC_UA)', conditions: 'accès équitable : identifier l\'application et un contact dans le User-Agent', frequence: 'evenement' },
  { id: 'cboe', nom: 'CBOE (VIX, ratios put/call)', groupe: 'prix', url: 'https://cdn.cboe.com/', docs: 'https://www.cboe.com/', cle: false, defaut: true, ttl: 1800, delai: 20000, ecartMin: 1500, limite: 'fichiers statiques publics', conditions: 'données publiques du site CBOE, usage personnel', frequence: 'quotidien' },
  { id: 'fomc', nom: 'Réserve fédérale : calendrier FOMC', groupe: 'calendrier', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', docs: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', cle: false, defaut: true, ttl: 21600, delai: 15000, ecartMin: 1000, limite: 'une page', conditions: 'domaine public (gouvernement fédéral des États-Unis)', frequence: 'evenement' },
  { id: 'bce-cal', nom: 'BCE : calendrier du Conseil des gouverneurs', groupe: 'calendrier', url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', docs: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', cle: false, defaut: true, ttl: 21600, delai: 15000, ecartMin: 1000, limite: 'une page', conditions: 'réutilisation autorisée avec mention de la BCE', frequence: 'evenement' },
  { id: 'bls-cal', nom: 'BLS : calendrier des publications', groupe: 'calendrier', url: 'https://www.bls.gov/schedule/news_release/bls.ics', docs: 'https://www.bls.gov/schedule/news_release/', cle: false, defaut: true, ttl: 21600, delai: 20000, ecartMin: 1000, limite: 'un fichier', conditions: 'domaine public (gouvernement fédéral des États-Unis)', frequence: 'evenement' },
  { id: 'rss-officiels', nom: 'Flux RSS officiels (Fed, BCE, BLS)', groupe: 'actualites', url: 'https://www.federalreserve.gov/feeds/press_all.xml', docs: '', cle: false, defaut: true, ttl: 900, delai: 15000, ecartMin: 500, limite: 'un appel par flux et par quart d\'heure', conditions: 'titres, courts résumés et liens seulement', frequence: 'evenement' },
  { id: 'rss-medias', nom: 'Flux RSS de médias financiers et généralistes', groupe: 'actualites', url: '', docs: '', cle: false, defaut: true, ttl: 900, delai: 15000, ecartMin: 500, limite: 'un appel par flux et par quart d\'heure', conditions: 'titres, courts résumés et liens seulement, jamais le texte intégral', frequence: 'evenement' },
  { id: 'gdelt', nom: 'GDELT (suivi mondial des événements)', groupe: 'actualites', url: 'https://api.gdeltproject.org/api/v2/doc/doc', docs: 'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/', cle: false, defaut: true, ttl: 1800, delai: 20000, ecartMin: 6000, limite: '1 appel toutes les 5 secondes (HTTP 429 sinon)', conditions: 'libre, citer GDELT', frequence: 'evenement' },
  { id: 'yahoo', nom: 'Yahoo Finance (point d\'accès NON documenté)', groupe: 'prix', url: 'https://query1.finance.yahoo.com/v8/finance/chart/', docs: '', cle: false, defaut: false, ttl: 300, delai: 10000, ecartMin: 2000, limite: 'non documentée, peut être bloquée à tout moment', conditions: 'non officielle, fragile : FACULTATIVE, DÉSACTIVÉE par défaut (variable MARCHES_YAHOO=1), jamais indispensable', frequence: 'differe' },
  { id: 'finnhub', nom: 'Finnhub (clé gratuite)', groupe: 'prix', url: 'https://finnhub.io/api/v1/quote', docs: 'https://finnhub.io/docs/api', cle: 'FINNHUB_KEY', defaut: false, ttl: 300, delai: 10000, ecartMin: 1100, limite: '60 appels / min (offre gratuite)', conditions: 'clé gratuite personnelle ; prix des actions et ETF américains', frequence: 'differe' },
  { id: 'twelvedata', nom: 'Twelve Data (clé gratuite)', groupe: 'prix', url: 'https://api.twelvedata.com/quote', docs: 'https://twelvedata.com/docs', cle: 'TWELVEDATA_KEY', defaut: false, ttl: 600, delai: 10000, ecartMin: 8000, limite: '8 appels / min, 800 / jour (offre gratuite)', conditions: 'clé gratuite personnelle', frequence: 'differe' }
];
export const parId = new Map(SOURCES.map(s => [s.id, s]));

/* Sources testées puis abandonnées (rapport RAPPORT-RAYLE-MARCHES.md) */
export const ABANDONNEES = [
  { id: 'stooq', nom: 'Stooq (CSV)', raison: 'HTTP 404 puis 403 le 2026-11-14 : le service exige désormais une clé / un navigateur ; plus de CSV anonyme exploitable.' },
  { id: 'cme-comex', nom: 'CME : stocks Comex (Gold_Stocks.xls)', raison: 'fichier Excel binaire (.xls) : pas de lecteur fiable sans dépendance ; non intégré plutôt que mal lu.' },
  { id: 'gld-avoirs', nom: 'Avoirs du SPDR Gold Shares (GLD)', raison: 'l\'archive publique est un PDF graphique, pas une série de données lisible.' },
  { id: 'cboe-putcall', nom: 'CBOE : ratio put/call (totalpc.csv)', raison: 'le fichier public s’arrête en octobre 2019 : plus de donnée vivante, non intégré.' },
  { id: 'echos-rss', nom: 'Les Échos (flux RSS)', raison: 'HTTP 404 le 2026-11-14 : flux retiré.' },
  { id: 'rss-tresor', nom: 'Flux RSS du Trésor américain', raison: 'l\'adresse du flux répond HTTP 404 (page HTML) : aucun flux RSS officiel stable trouvé.' },
  { id: 'banque-france', nom: 'Banque de France (flux RSS, calendrier)', raison: 'HTTP 403 pour les clients automatisés.' },
  { id: 'comex-reglements', nom: 'Règlements différés CME', raison: 'fichiers de rapports de livraison en .xls ou PDF : mêmes raisons que les stocks Comex.' }
];

/* Séries FRED : [identifiant mesure, série FRED, libellé, unité, fréquence, retard de publication, variante] ; variante 'ga' = glissement annuel calculé à partir de la série elle-même */
export const SERIES_FRED = [
  ['taux.reel10', 'DFII10', 'Taux réel américain à 10 ans (TIPS)', '%', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['taux.ust2', 'DGS2', 'Rendement du Trésor américain à 2 ans', '%', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['taux.ust10', 'DGS10', 'Rendement du Trésor américain à 10 ans', '%', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['taux.ust30', 'DGS30', 'Rendement du Trésor américain à 30 ans', '%', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['taux.pente10_2', 'T10Y2Y', 'Écart de rendement 10 ans moins 2 ans', 'pt de %', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['taux.fed', 'DFEDTARU', 'Taux directeur de la Fed (borne haute de la fourchette)', '%', 'quotidien', 'à la décision du FOMC'],
  ['marche.vix.fred', 'VIXCLS', 'VIX (clôture, via FRED)', 'pts', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['usd.large', 'DTWEXBGS', 'Indice du dollar large (Fed, pondéré par les échanges)', 'indice', 'hebdomadaire', 'avec 1 semaine de retard'],
  ['us100.fred', 'NASDAQ100', 'Nasdaq 100 (clôture quotidienne)', 'pts', 'quotidien', 'avec 1 jour ouvré de retard'],
  ['chf.fred', 'DEXSZUS', 'Franc suisse pour 1 dollar (Fed H.10)', 'CHF', 'hebdomadaire', 'avec 1 semaine de retard'],
  ['macro.cpi', 'CPIAUCSL', 'Inflation américaine (CPI, glissement annuel)', '%', 'mensuel', 'environ 2 semaines après la fin du mois', 'ga'],
  ['macro.chomage', 'UNRATE', 'Taux de chômage américain', '%', 'mensuel', 'le premier vendredi du mois suivant'],
  ['macro.m2', 'M2SL', 'Masse monétaire M2 américaine (glissement annuel)', '%', 'mensuel', 'environ 1 mois de retard', 'ga'],
  ['macro.credit', 'BAMLH0A0HYM2', 'Écart de crédit haut rendement (ICE BofA)', 'pt de %', 'quotidien', 'avec 1 jour ouvré de retard']
];

/* Contrats COT : [clé, code CFTC, libellé, jeu de données Socrata, colonnes spéculateurs long/court, colonnes commerciaux long/court] */
export const CONTRATS_COT = [
  ['or', '088691', 'Or (COMEX)', '72hh-3qpy', 'm_money_positions_long_all', 'm_money_positions_short_all', 'prod_merc_positions_long', 'prod_merc_positions_short', 'Money managers'],
  ['us100', '209742', 'Nasdaq 100 mini (CME)', 'gpe5-46if', 'lev_money_positions_long', 'lev_money_positions_short', 'dealer_positions_long_all', 'dealer_positions_short_all', 'Leveraged funds'],
  ['btc', '133741', 'Bitcoin (CME)', 'gpe5-46if', 'lev_money_positions_long', 'lev_money_positions_short', 'dealer_positions_long_all', 'dealer_positions_short_all', 'Leveraged funds'],
  ['usd', '098662', 'Indice dollar (ICE)', 'gpe5-46if', 'lev_money_positions_long', 'lev_money_positions_short', 'dealer_positions_long_all', 'dealer_positions_short_all', 'Leveraged funds'],
  ['chf', '092741', 'Franc suisse (CME)', 'gpe5-46if', 'lev_money_positions_long', 'lev_money_positions_short', 'dealer_positions_long_all', 'dealer_positions_short_all', 'Leveraged funds']
];

/* Flux RSS : [id, nom, adresse, groupe, langue] */
export const FLUX = [
  ['fed', 'Réserve fédérale (communiqués)', 'https://www.federalreserve.gov/feeds/press_all.xml', 'officiel', 'en'],
  ['bce', 'BCE (communiqués)', 'https://www.ecb.europa.eu/rss/press.html', 'officiel', 'en'],
  ['bls', 'BLS (dernières publications)', 'https://www.bls.gov/feed/bls_latest.rss', 'officiel', 'en'],
  ['figaro-eco', 'Le Figaro Économie', 'https://www.lefigaro.fr/rss/figaro_economie.xml', 'media', 'fr'],
  ['lemonde-eco', 'Le Monde Économie', 'https://www.lemonde.fr/economie/rss_full.xml', 'media', 'fr'],
  ['bbc-eco', 'BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'media', 'en'],
  ['cnbc', 'CNBC Markets', 'https://www.cnbc.com/id/10000664/device/rss/rss.html', 'media', 'en'],
  ['marketwatch', 'MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', 'media', 'en'],
  ['guardian-eco', 'The Guardian Business', 'https://www.theguardian.com/uk/business/rss', 'media', 'en']
];
export const MOTS_ACTIFS = {
  or: /\b(gold|or\b|xau|bullion|precious|metaux? precieux|comex)/i,
  us100: /\b(nasdaq|us100|tech|wall street|s&p|nvidia|apple|microsoft|stocks?|actions?|bourse)\b/i,
  btc: /\b(bitcoin|btc|crypto|ether|etf bitcoin|stablecoin)/i,
  usd: /\b(dollar|usd|dxy|greenback|fed\b|federal reserve|treasury|yields?|taux|inflation|cpi|payrolls?|emploi)/i,
  chf: /\b(franc suisse|swiss franc|chf|snb|banque nationale suisse|safe[- ]haven|valeur refuge)/i
};
