/* ═════════════ SOURCES GRATUITES V2 : Yahoo Finance (prix, séries fondamentales, recherche), FRED, Banque mondiale, Nasdaq (module PUR : lecture de réponses ; fetch injectable) ═════════════
   - Prix : point d'accès public « chart » de Yahoo (sans clé) ; chandeliers journaliers sur 5 ans et clôtures mensuelles ajustées sur toute la durée, avec dividendes et splits.
   - Fondamentaux hors États-Unis : séries publiques « fundamentals-timeseries » de Yahoo (sans clé, environ 4 exercices annuels) — testées sur 20 sociétés européennes : 20 sur 20 exploitables.
   - Secteur et industrie : point d'accès public « search » de Yahoo. Aucun cookie ni « crumb » n'est utilisé.
   - Taux : FRED (CSV public, sans clé). Parité de pouvoir d'achat : Banque mondiale (JSON public). Calendrier des résultats américains : API publique du Nasdaq.
   Une donnée absente reste absente (null) : rien n'est inventé. */
import { normaliserSecteur } from './secteurs.js';

const fin = x => typeof x === 'number' && Number.isFinite(x);
export const URL_CHART = (sym, plage, pas, evenements = 'div,split') => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${plage}&interval=${pas}&events=${evenements}&includeAdjustedClose=true`;
export const TYPES_ANNUELS = Object.freeze({ TotalRevenue: 'rev', NetIncome: 'ni', EBIT: 'ebit', EBITDA: 'ebitda', GrossProfit: 'gp', OperatingCashFlow: 'ocf', CapitalExpenditure: 'capex', TotalAssets: 'assets', TotalLiabilitiesNetMinorityInterest: 'liab', StockholdersEquity: 'eq', TotalDebt: 'debt', CashCashEquivalentsAndShortTermInvestments: 'cash', CurrentAssets: 'ca', CurrentLiabilities: 'cl', RetainedEarnings: 're', DilutedEPS: 'eps', DilutedAverageShares: 'sh', TaxProvision: 'tax', PretaxIncome: 'pretax', InterestExpense: 'int', CashDividendsPaid: 'div', RepurchaseOfCapitalStock: 'buyback', OrdinarySharesNumber: 'shOrd', DepreciationAndAmortization: 'da' });
export const URL_SERIES = (sym, debut = 1262304000, finT = Math.floor(Date.now() / 1000)) => `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?type=${Object.keys(TYPES_ANNUELS).map(t => 'annual' + t).join(',')}&period1=${debut}&period2=${finT}`;
export const URL_RECHERCHE = sym => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=3&newsCount=0&listsCount=0`;

/* réponse « chart » → { devise (corrigée : GBp → GBP), k (facteur appliqué aux prix), nom, bourse, type, bougies, ajuste: [[t, clôture ajustée]], dividendes: [{ t, v }], splits, prix, tPrix } */
export function lireChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0]; if (!r || !r.meta) throw new Error('réponse Yahoo vide');
  const T = r.timestamp || [], Q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, adj = r.indicators && r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  const dev0 = r.meta.currency || null, k = dev0 === 'GBp' || dev0 === 'GBX' ? 0.01 : dev0 === 'ZAc' ? 0.01 : dev0 === 'ILA' ? 0.01 : 1, devise = dev0 === 'GBp' || dev0 === 'GBX' ? 'GBP' : dev0 === 'ZAc' ? 'ZAR' : dev0 === 'ILA' ? 'ILS' : dev0;
  const bougies = [], ajuste = [];
  T.forEach((t, i) => { const c = Q.close && Q.close[i]; if (!fin(c) || !(c > 0)) return; const o = Q.open && Q.open[i], h = Q.high && Q.high[i], l = Q.low && Q.low[i], v = Q.volume && Q.volume[i]; bougies.push({ t: t * 1000, o: fin(o) ? o * k : c * k, h: fin(h) ? h * k : c * k, l: fin(l) ? l * k : c * k, c: c * k, v: fin(v) ? v : 0 }); const a = adj && adj[i]; ajuste.push([t * 1000, (fin(a) && a > 0 ? a : c) * k]); });
  const ev = r.events || {}, dividendes = Object.values(ev.dividends || {}).map(d => ({ t: d.date * 1000, v: d.amount * k })).sort((a, b) => a.t - b.t);
  const splits = Object.values(ev.splits || {}).map(s => ({ t: s.date * 1000, num: s.numerator, den: s.denominator })).filter(s => s.num > 0 && s.den > 0).sort((a, b) => a.t - b.t);
  const px = fin(r.meta.regularMarketPrice) ? r.meta.regularMarketPrice * k : (bougies.length ? bougies[bougies.length - 1].c : null);
  return { devise, deviseBrute: dev0, k, nom: r.meta.longName || r.meta.shortName || null, bourse: r.meta.fullExchangeName || r.meta.exchangeName || null, type: r.meta.instrumentType || null, bougies, ajuste, dividendes, splits, prix: px, tPrix: (r.meta.regularMarketTime || 0) * 1000, fuseau: r.meta.exchangeTimezoneName || null };
}
/* clôtures mensuelles non ajustées [[t, c]] (pour les multiples historiques de valeur.js) à partir du chart mensuel */
export const mensuelBrut = ch => ch.bougies.map(b => [b.t, b.c]);

/* séries annuelles Yahoo → exercices au format de valeur.js ; + devise des comptes */
export function lireSeriesAnnuelles(json) {
  const R = json && json.timeseries && json.timeseries.result; if (!Array.isArray(R)) throw new Error('réponse Yahoo (séries) vide');
  const M = {}; let devise = null;
  for (const x of R) { const t = x.meta && x.meta.type && x.meta.type[0]; if (!t || !x[t]) continue; const champ = TYPES_ANNUELS[t.replace(/^annual/, '')]; if (!champ) continue; for (const d of x[t]) { if (!d || !d.asOfDate || !d.reportedValue || !fin(d.reportedValue.raw)) continue; if (d.periodType && d.periodType !== '12M') continue; (M[d.asOfDate] = M[d.asOfDate] || { fin: d.asOfDate })[champ] = d.reportedValue.raw; if (d.currencyCode && (champ === 'rev' || !devise)) devise = d.currencyCode; } }
  const annuel = Object.values(M).sort((a, b) => a.fin.localeCompare(b.fin)).map(o => {
    const finT = Date.parse(o.fin), e = o.ebit != null ? o.ebit : null;
    return { fin: o.fin, finT, filedT: finT + 100 * 86400e3, rev: o.rev ?? null, ni: o.ni ?? null, ocf: o.ocf ?? null, capex: o.capex != null ? Math.abs(o.capex) : null, da: o.da != null ? o.da : (o.ebitda != null && e != null ? o.ebitda - e : null), ebit: e, gp: o.gp ?? null, assets: o.assets ?? null, liab: o.liab ?? null, eq: o.eq ?? null, debt: o.debt ?? null, cash: o.cash ?? null, ca: o.ca ?? null, cl: o.cl ?? null, re: o.re ?? null, sh: o.sh ?? o.shOrd ?? null, eps: o.eps ?? null, tax: o.tax ?? null, pretax: o.pretax ?? null, int: o.int ?? null, div: o.div != null ? Math.abs(o.div) : null, buyback: o.buyback != null ? Math.abs(o.buyback) : null };
  }).filter(x => x.rev != null || x.ni != null || x.assets != null);
  const derniere = annuel.length ? annuel[annuel.length - 1] : null, sh = derniere ? (derniere.sh ?? null) : null;
  return { annuel, devise, actions: sh, actionsT: derniere ? derniere.finT : null };
}
/* réponse « search » → { nom, secteur (français), industrie, secteurBrut } pour le symbole demandé */
export function lireRecherche(json, sym) {
  const Q = (json && json.quotes) || [], q = Q.find(x => x.symbol === sym) || null; if (!q) return null;
  return { nom: q.longname || q.shortname || null, secteur: normaliserSecteur(q.sector || q.sectorDisp), industrie: q.industry || q.industryDisp || null, secteurBrut: q.sector || null, type: q.quoteType || null, bourse: q.exchDisp || null };
}
/* CSV FRED (« DATE,SERIE ») → [[t ms, valeur]] sans les valeurs manquantes (« . ») */
export function lireFred(csv) { const out = []; for (const l of String(csv || '').split(/\r?\n/).slice(1)) { const [d, v] = l.split(','); const x = parseFloat(v); if (d && Number.isFinite(x)) out.push([Date.parse(d), x]); } return out; }
export const URL_FRED = id => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`;
/* Banque mondiale : facteur de conversion PPA (unités de monnaie locale par dollar international) */
export const URL_PPP = pays => `https://api.worldbank.org/v2/country/${pays}/indicator/PA.NUS.PPP?format=json&per_page=8&mrv=6`;
export function lirePPP(json) { const L = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : []; const x = L.find(d => fin(d.value)); return x ? { valeur: x.value, annee: +x.date } : null; }
/* calendrier des résultats du Nasdaq pour un jour → liste de symboles américains */
export const URL_RESULTATS = jour => `https://api.nasdaq.com/api/calendar/earnings?date=${jour}`;
export function lireResultats(json) { const R = json && json.data && json.data.rows; return Array.isArray(R) ? R.map(x => ({ symbole: String(x.symbol || '').toUpperCase(), heure: x.time || '' })).filter(x => x.symbole) : []; }
