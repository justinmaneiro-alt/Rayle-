/* Tables de correspondance XTB → Yahoo (symboles de cotation) pour l'univers v2. Les noms XTB (colonne de gauche) sont ceux de la table des marges officielle. */
export const PAYS_SUFFIXE = Object.freeze({ US: '', FR: '.PA', DE: '.DE', UK: '.L', ES: '.MC', IT: '.MI', NL: '.AS', BE: '.BR', PT: '.LS', CH: '.SW', SE: '.ST', NO: '.OL', DK: '.CO', FI: '.HE', PL: '.WA', CZ: '.PR' });
import { NOM_PAYS, DRAPEAU, zonePays } from '../../trader-pro/invest/pays.js';
export { NOM_PAYS, DRAPEAU, zonePays };
export const FOREX_DEVISES = new Set(['AUD', 'CAD', 'CHF', 'CNH', 'CZK', 'EUR', 'GBP', 'HUF', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'RON', 'SEK', 'SGD', 'TRY', 'USD', 'ZAR', 'BRL', 'CLP', 'ILS', 'INR', 'THB']);
const NORDIQUE_CLASSE = /^([A-Z0-9]{2,8})([AB])$/;
export function versYahooXtb(code, pays) {
  const S = PAYS_SUFFIXE[pays] || '';
  if (pays === 'US') return ({ BRKB: 'BRK-B', BFB: 'BF-B', GOOGC: 'GOOG', FWONA: 'FWONA', LENB: 'LEN-B', BRKA: 'BRK-A' })[code] || code;
  const base = code.replace(/\*$/, '');
  if ((pays === 'SE' || pays === 'DK') && base.length >= 4 && NORDIQUE_CLASSE.test(base) && !['GMAB', 'BAVA', 'SYDB'].includes(base)) return base.replace(NORDIQUE_CLASSE, '$1-$2') + S;
  if (pays === 'SE' && base === 'HMB') return 'HM-B' + S;
  return base + S;
}
/* variantes à essayer quand Yahoo ne connaît pas le symbole principal */
export function variantesYahoo(y) {
  const V = [y]; const m = /^(.+)-([AB])(\.ST|\.CO)$/.exec(y); if (m) V.push(m[1] + m[2] + m[3]);
  const n = /^([A-Z0-9]{2,7})([AB])(\.ST|\.CO)$/.exec(y); if (n) V.push(n[1] + '-' + n[2] + n[3]);
  const u = /^(.+)-([AB])$/.exec(y); if (u) V.push(u[1] + '.' + u[2]);
  const e1 = /^([A-Z]{2,5})1(\.MC)$/.exec(y); if (e1) V.push(e1[1] + e1[2]);   // IBE1.ES → IBE.MC
  const b = /^([A-Z]{2})([AB])(\.L)$/.exec(y); if (b) V.push(b[1] + '-' + b[2] + b[3]);   // BTA.L → BT-A.L
  return [...new Set(V)];
}
/* [nom XTB, symbole Yahoo, libellé, pays] */
export const INDICES_YAHOO = [
  ['US500', '^GSPC', 'S&P 500', 'US'], ['US100', '^NDX', 'Nasdaq 100', 'US'], ['US30', '^DJI', 'Dow Jones 30', 'US'], ['US2000', '^RUT', 'Russell 2000', 'US'], ['VIX', '^VIX', 'Indice de volatilité VIX', 'US'], ['USDIDX', 'DX-Y.NYB', 'Indice dollar', 'US'],
  ['FRA40', '^FCHI', 'CAC 40', 'FR'], ['DE40', '^GDAXI', 'DAX 40', 'DE'], ['DE30', '^GDAXI', 'DAX (ancien nom)', 'DE'], ['UK100', '^FTSE', 'FTSE 100', 'UK'], ['EU50', '^STOXX50E', 'Euro Stoxx 50', 'EU'], ['SPA35', '^IBEX', 'IBEX 35', 'ES'], ['ITA40', 'FTSEMIB.MI', 'FTSE MIB', 'IT'],
  ['NED25', '^AEX', 'AEX', 'NL'], ['SUI20', '^SSMI', 'SMI', 'CH'], ['AUT20', '^ATX', 'ATX', 'AT'], ['W20', 'WIG20.WA', 'WIG20', 'PL'], ['CZKCASH', null, 'PX (Prague)', 'CZ'], ['VSTOXX', null, 'VSTOXX', 'EU'],
  ['JP225', '^N225', 'Nikkei 225', 'JP'], ['JAP225', '^N225', 'Nikkei 225 (ancien nom)', 'JP'], ['AUS200', '^AXJO', 'ASX 200', 'AU'], ['AU200.cash', '^AXJO', 'ASX 200 (cash)', 'AU'], ['HK.cash', '^HSI', 'Hang Seng', 'HK'], ['HKComp', '^HSI', 'Hang Seng composite', 'HK'],
  ['CHN.cash', '^HSCE', 'Chine H-shares', 'CN'], ['CHNComp', '000001.SS', 'Shanghai Composite', 'CN'], ['CH50cash', null, 'Chine A50', 'CN'], ['KOSP200', '^KS200', 'KOSPI 200', 'KR'], ['BRAComp', '^BVSP', 'Bovespa', 'BR'], ['MEXComp', '^MXX', 'IPC Mexique', 'MX'], ['SG20cash', '^STI', 'Straits Times', 'SG'], ['VIET30', null, 'Vietnam 30', 'VN']
];
export const MATIERES = [
  ['GOLD', 'GC=F', 'Or'], ['SILVER', 'SI=F', 'Argent'], ['PLATINUM', 'PL=F', 'Platine'], ['PALLADIUM', 'PA=F', 'Palladium'], ['COPPER', 'HG=F', 'Cuivre'], ['ALUMINIUM', 'ALI=F', 'Aluminium'], ['NICKEL', null, 'Nickel'], ['ZINC', null, 'Zinc'],
  ['OIL', 'BZ=F', 'Pétrole Brent'], ['OIL.WTI', 'CL=F', 'Pétrole WTI'], ['NATGAS', 'NG=F', 'Gaz naturel'], ['GASOLINE', 'RB=F', 'Essence'], ['LSGASOIL', null, 'Gasoil'], ['EMISS', null, 'Quotas d’émission CO2'],
  ['CORN', 'ZC=F', 'Maïs'], ['WHEAT', 'ZW=F', 'Blé'], ['SOYBEAN', 'ZS=F', 'Soja'], ['SOYOIL', 'ZL=F', 'Huile de soja'], ['SUGAR', 'SB=F', 'Sucre'], ['COFFEE', 'KC=F', 'Café'], ['COCOA', 'CC=F', 'Cacao'], ['COTTON', 'CT=F', 'Coton'], ['CATTLE', 'LE=F', 'Bétail'], ['LEANHOGS', 'HE=F', 'Porc maigre']
];
export const CRYPTOS = [
  ['BITCOIN', 'BTC-USD', 'Bitcoin'], ['ETHEREUM', 'ETH-USD', 'Ethereum'], ['RIPPLE', 'XRP-USD', 'XRP'], ['SOLANA', 'SOL-USD', 'Solana'], ['BINANCECOIN', 'BNB-USD', 'BNB'], ['CARDANO', 'ADA-USD', 'Cardano'], ['DOGECOIN', 'DOGE-USD', 'Dogecoin'], ['TRON', 'TRX-USD', 'Tron'], ['AVALANCHE', 'AVAX-USD', 'Avalanche'],
  ['CHAINLINK', 'LINK-USD', 'Chainlink'], ['POLKADOT', 'DOT-USD', 'Polkadot'], ['LITECOIN', 'LTC-USD', 'Litecoin'], ['BITCOINCASH', 'BCH-USD', 'Bitcoin Cash'], ['STELLAR', 'XLM-USD', 'Stellar'], ['UNISWAP', 'UNI-USD', 'Uniswap'], ['COSMOS', 'ATOM-USD', 'Cosmos'], ['POLYGON', 'MATIC-USD', 'Polygon'],
  ['AAVE', 'AAVE-USD', 'Aave'], ['ALGORAND', 'ALGO-USD', 'Algorand'], ['APECOIN', 'APE-USD', 'ApeCoin'], ['CURVEDAO', 'CRV-USD', 'Curve DAO'], ['DECENTRALAND', 'MANA-USD', 'Decentraland'], ['DYDX', 'DYDX-USD', 'dYdX'], ['EOS', 'EOS-USD', 'EOS'], ['FANTOM', 'FTM-USD', 'Fantom'],
  ['FILECOIN', 'FIL-USD', 'Filecoin'], ['GALA', 'GALA-USD', 'Gala'], ['GRAPH', 'GRT-USD', 'The Graph'], ['INTERCOMP', 'ICP-USD', 'Internet Computer'], ['KUSAMA', 'KSM-USD', 'Kusama'], ['KYBER', 'KNC-USD', 'Kyber Network'], ['MAKER', 'MKR-USD', 'Maker'], ['MOONBEAM', 'GLMR-USD', 'Moonbeam'],
  ['SANDBOX', 'SAND-USD', 'The Sandbox'], ['STEPN', 'GMT-USD', 'STEPN'], ['SUSHI', 'SUSHI-USD', 'SushiSwap'], ['TEZOS', 'XTZ-USD', 'Tezos'], ['VECHAIN', 'VET-USD', 'VeChain'], ['WAVES', 'WAVES-USD', 'Waves'], ['ZCASH', 'ZEC-USD', 'Zcash']
];
/* [nom XTB (null = simple référence, non négociable), symbole Yahoo (prix) ou null, libellé, pays, série FRED (taux, gratuit sans clé) ou null] */
export const BOND_CFD = [
  ['TNOTE', 'ZN=F', 'T-Note 10 ans (contrat à terme américain)', 'US', 'DGS10'], ['BUND10Y', null, 'Bund 10 ans (contrat à terme allemand)', 'DE', 'IRLTLT01DEM156N'], ['SCHATZ2Y', null, 'Schatz 2 ans (contrat à terme allemand)', 'DE', null],
  [null, null, 'Taux États-Unis 2 ans', 'US', 'DGS2'], [null, null, 'Taux États-Unis 10 ans', 'US', 'DGS10'], [null, null, 'Taux réel États-Unis 10 ans (TIPS)', 'US', 'DFII10'], [null, null, 'Taux Allemagne 10 ans (Bund)', 'DE', 'IRLTLT01DEM156N'],
  [null, null, 'Taux France 10 ans (OAT)', 'FR', 'IRLTLT01FRM156N'], [null, null, 'Taux Italie 10 ans (BTP)', 'IT', 'IRLTLT01ITM156N'], [null, null, 'Taux Royaume-Uni 10 ans (Gilt)', 'UK', 'IRLTLT01GBM156N']
];
