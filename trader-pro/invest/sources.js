/* ═════════════ SOURCES GRATUITES DE L'INVESTISSEMENT LONG TERME (module PUR : fetch injectable ; Worker Cloudflare, Node, navigateur) ═════════════
   - Fondamentaux : SEC EDGAR « companyfacts » (gratuit, sans clé). La SEC EXIGE un User-Agent qui identifie l'utilisateur (nom + adresse de contact) : il vient du secret SEC_USER_AGENT du Worker (jamais écrit dans le dépôt).
     Pour ne pas charger tout le JSON (plusieurs Mo), seuls les blocs des étiquettes utiles sont découpés dans le texte puis analysés (peu de temps de calcul : Worker gratuit).
   - Prix et historique mensuel (10 ans), splits : Yahoo Finance (point d'accès public « chart », sans clé).
   Aucune clé d'API, aucun service payant. Une donnée absente reste absente (null) : rien n'est inventé. */

export const UA_DEFAUT = 'Rayle-Invest outil de recherche personnel';
export const urlFaits = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
export const urlYahoo = (sym, plage = '11y') => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${plage}&interval=1mo&events=split`;

/* étiquettes us-gaap utiles : pour chaque champ, la première étiquette qui a une valeur à une date donnée gagne (les sociétés changent d'étiquette au fil des ans) */
export const ETIQUETTES = Object.freeze({
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'RevenuesNetOfInterestExpense', 'InterestAndDividendIncomeOperating'],
  ni: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  ocf: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements'],
  da: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAmortizationAndOther'],
  ebit: ['OperatingIncomeLoss'],
  gp: ['GrossProfit'],
  assets: ['Assets'], liab: ['Liabilities'],
  eq: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  debtT: ['LongTermDebt', 'DebtLongtermAndShorttermCombinedAmount', 'LongTermDebtAndCapitalLeaseObligations'], debtNC: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], debtC: ['LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'], sti: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
  ca: ['AssetsCurrent'], cl: ['LiabilitiesCurrent'], re: ['RetainedEarningsAccumulatedDeficit'],
  sh: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasicAndDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic'],
  eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
  int: ['InterestExpense', 'InterestExpenseDebt', 'InterestExpenseNonoperating'], tax: ['IncomeTaxExpenseBenefit'], pretax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic']
});
const FLUX = new Set(['int', 'rev', 'ni', 'ocf', 'capex', 'da', 'ebit', 'gp', 'sh', 'eps', 'tax', 'pretax']);   // valeurs sur une période (les autres : à une date)
const UNITE = { eps: 'USD/shares', sh: 'shares' };

/* découpe, dans le texte JSON, le bloc d'UNE étiquette (« "Nom":{ … } ») sans analyser le reste du fichier */
export function bloc(texte, etiquette) {
  const cle = '"' + etiquette + '":{', i = texte.indexOf(cle); if (i < 0) return null;
  let prof = 0, dansChaine = false, echap = false;
  for (let k = i + cle.length - 1; k < texte.length; k++) {
    const c = texte.charCodeAt(k);
    if (dansChaine) { if (echap) echap = false; else if (c === 92) echap = true; else if (c === 34) dansChaine = false; continue; }
    if (c === 34) dansChaine = true; else if (c === 123) prof++; else if (c === 125 && --prof === 0) { try { return JSON.parse(texte.slice(i + cle.length - 1, k + 1)); } catch (e) { return null; } }
  }
  return null;
}
const JOURS = 86400e3;
/* valeurs ANNUELLES d'une étiquette : { 'AAAA-MM-JJ' (fin d'exercice) → { v, filed } } (10-K, exercice complet ; en cas de doublon, la publication la plus récente) */
function annuelles(b, champ) {
  const unites = b && b.units ? b.units : null; if (!unites) return {}; const L = unites[UNITE[champ] || 'USD'] || []; const out = {};
  for (const x of L) {
    if (!x || !/^10-K/.test(x.form || '') || typeof x.val !== 'number' || !x.end) continue;
    if (FLUX.has(champ)) { if (!x.start) continue; const d = (Date.parse(x.end) - Date.parse(x.start)) / JOURS; if (d < 340 || d > 380) continue; }
    else if (x.start) continue;
    const o = out[x.end]; if (!o || (x.filed || '') > o.filed) out[x.end] = { v: x.val, filed: x.filed || '' };
  }
  return out;
}
/* texte JSON de companyfacts → { annuel: [...], actions, actionsT, nom } (voir valeur.js pour la forme des exercices) */
export function extraireFaits(texte) {
  if (typeof texte !== 'string' || texte.length < 2000 || !/\}\s*$/.test(texte.slice(-20))) throw new Error('réponse EDGAR tronquée ou vide');
  const brut = {};
  for (const [champ, noms] of Object.entries(ETIQUETTES)) {
    const merge = {};
    for (const nom of noms) { const b = bloc(texte, nom); if (!b) continue; for (const [end, o] of Object.entries(annuelles(b, champ))) if (!merge[end]) merge[end] = o; }
    brut[champ] = merge;
  }
  const fins = new Set([...Object.keys(brut.rev), ...Object.keys(brut.ni), ...Object.keys(brut.assets), ...Object.keys(brut.ocf)]);
  const g = (c, e) => (brut[c][e] ? brut[c][e].v : null);
  const annuel = [...fins].sort().map(e => {
    const eq = g('eq', e), assets = g('assets', e); let debt = g('debtT', e); if (debt == null) { const nc = g('debtNC', e), c = g('debtC', e); debt = nc == null && c == null ? null : (nc || 0) + (c || 0); }
    const cash = g('cash', e), sti = g('sti', e), filed = Math.max(...Object.keys(brut).map(c => (brut[c][e] ? Date.parse(brut[c][e].filed) || 0 : 0)));
    return { fin: e, finT: Date.parse(e), filedT: filed || Date.parse(e) + 60 * JOURS, rev: g('rev', e), ni: g('ni', e), ocf: g('ocf', e), capex: g('capex', e), da: g('da', e), ebit: g('ebit', e) != null ? g('ebit', e) : (g('pretax', e) != null && g('int', e) != null ? g('pretax', e) + g('int', e) : null), gp: g('gp', e), assets, liab: g('liab', e) != null ? g('liab', e) : (assets != null && eq != null ? assets - eq : null), eq, debt, cash: cash == null && sti == null ? null : (cash || 0) + (sti || 0), ca: g('ca', e), cl: g('cl', e), re: g('re', e), sh: g('sh', e) != null ? g('sh', e) : (g('ni', e) != null && g('eps', e) ? g('ni', e) / g('eps', e) : null), eps: g('eps', e), tax: g('tax', e), pretax: g('pretax', e) };
  }).filter(x => x.rev != null || x.ni != null || x.assets != null);
  /* nombre d'actions en circulation : dernière valeur de la page de garde (dei) */
  /* plusieurs catégories d'actions (A, B…) : la page de garde de la dernière publication donne une valeur par catégorie, on les additionne (valeurs distinctes d'une même publication) */
  let actions = null, actionsT = null; const d = bloc(texte, 'EntityCommonStockSharesOutstanding');
  if (d && d.units && d.units.shares) {
    const L = d.units.shares.filter(x => typeof x.val === 'number' && x.val > 0 && x.accn), dern = L.reduce((m, x) => ((x.filed || '') > m ? (x.filed || '') : m), '');
    const accn = (L.find(x => (x.filed || '') === dern) || {}).accn, mem = L.filter(x => x.accn === accn), vals = [...new Set(mem.map(x => x.val))];
    if (vals.length) { actions = vals.reduce((a, b) => a + b, 0); actionsT = Math.max(...mem.map(x => Date.parse(x.end || x.filed) || 0)); }
  }
  const m = texte.match(/"entityName":"((?:[^"\\]|\\.)*)"/);
  return { annuel, actions, actionsT, nom: m ? m[1] : null };
}

/* réponse « chart » de Yahoo → { prix, devise, nom, mensuel: [[t ms, clôture]], splits: [{ t, num, den }] } ; la clôture mensuelle est déjà ajustée des splits */
export function lireChartYahoo(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0]; if (!r || !r.meta) throw new Error('réponse Yahoo vide');
  const T = r.timestamp || [], C = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [], mensuel = [];
  T.forEach((t, i) => { if (typeof C[i] === 'number' && C[i] > 0) mensuel.push([t * 1000, C[i]]); });
  const splits = Object.values((r.events && r.events.splits) || {}).map(s => ({ t: s.date * 1000, num: s.numerator, den: s.denominator })).filter(s => s.num > 0 && s.den > 0).sort((a, b) => a.t - b.t);
  const prix = typeof r.meta.regularMarketPrice === 'number' ? r.meta.regularMarketPrice : (mensuel.length ? mensuel[mensuel.length - 1][1] : null);
  return { prix, devise: r.meta.currency || 'USD', nom: r.meta.longName || r.meta.shortName || null, mensuel, splits, t: (r.meta.regularMarketTime || 0) * 1000 };
}
const lireJson = async (fetchFn, url, opts, ms) => { const r = await fetchFn(url, { ...opts, signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined }); if (!r.ok) throw new Error(url.split('?')[0].split('/').slice(2, 3) + ' a répondu ' + r.status); return r; };
export async function lirePrix(sym, fetchFn = fetch, { plage = '11y', ms = 15000 } = {}) { const r = await lireJson(fetchFn, urlYahoo(sym, plage), { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }, ms); return lireChartYahoo(await r.json()); }
export async function lireFaits(cik, fetchFn = fetch, ua = UA_DEFAUT, { ms = 25000 } = {}) { const r = await lireJson(fetchFn, urlFaits(cik), { headers: { 'User-Agent': ua, Accept: 'application/json' } }, ms); return extraireFaits(await r.text()); }
