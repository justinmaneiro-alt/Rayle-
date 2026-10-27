/* ═════════════ RAPPORTS COT DE LA CFTC (M2b ; module pur, testé : finance-test.mjs) ═════════════
   Source : données ouvertes de la CFTC (publicreporting.cftc.gov, Socrata), gratuites, sans clé, CORS ouvert : appelées directement par le navigateur (aucune modification du Worker).
   - TFF « Traders in Financial Futures » (Nasdaq 100, S&P 500, Bitcoin CME, dollar ICE, euro, yen, bons du Trésor 10 ans, VIX) : dealers, gérants d'actifs, fonds à effet de levier, autres, petits opérateurs.
   - « Disaggregated » (or, argent, pétrole WTI) : producteurs/commerciaux, swap dealers, gérants de fonds spéculatifs (« managed money »), autres, petits opérateurs.
   Les positions sont celles du MARDI, publiées le VENDREDI vers 15 h 30 heure de New York (≈ 21 h 30 à Paris) : donnée DIFFÉRÉE par nature. Rayle ne la présente jamais comme du temps réel.
   Lecture : position NETTE = longs − courts par catégorie ; variation = net de la semaine − net de la semaine précédente ; percentile = rang du net actuel parmi les 156 dernières semaines (3 ans).
   Un percentile extrême (≥ 90 ou ≤ 10) dit que la position est extrême PAR RAPPORT À SON HISTOIRE ; ce n'est pas un signal d'achat ou de vente. */
export const URL_COT = { tff: 'https://publicreporting.cftc.gov/resource/gpe5-46if.json', disagg: 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json' };
export const SEMAINES_COT = 156;

export const CONTRATS_COT = {
  NDX: { id: 'NDX', nom: 'Nasdaq 100 (E-mini, CME)', court: 'le Nasdaq 100', code: '209742', rapport: 'tff', terminal: 'US100', alias: ['nasdaq', 'nasdaq 100', 'nas100', 'us100', 'ndx'] },
  SPX: { id: 'SPX', nom: 'S&P 500 (E-mini, CME)', court: 'le S&P 500', code: '13874A', rapport: 'tff', terminal: null, alias: ['s&p', 's et p', 'sp500', 'spx', 'standard and poors'] },
  XAU: { id: 'XAU', nom: 'Or (COMEX)', court: 'l’or', code: '088691', rapport: 'disagg', terminal: 'XAU', alias: ['or', 'gold', 'xau'] },
  XAG: { id: 'XAG', nom: 'Argent (COMEX)', court: 'l’argent', code: '084691', rapport: 'disagg', terminal: null, alias: ['argent', 'silver', 'xag'] },
  BTC: { id: 'BTC', nom: 'Bitcoin (CME)', court: 'le Bitcoin', code: '133741', rapport: 'tff', terminal: 'BTC', alias: ['bitcoin', 'btc'] },
  USD: { id: 'USD', nom: 'Indice dollar (ICE)', court: 'le dollar', code: '098662', rapport: 'tff', terminal: 'DXY', alias: ['dollar', 'dxy', 'indice dollar'] },
  EUR: { id: 'EUR', nom: 'Euro (CME)', court: 'l’euro', code: '099741', rapport: 'tff', terminal: 'EURUSD', alias: ['euro', 'eur', 'eurusd'] },
  JPY: { id: 'JPY', nom: 'Yen japonais (CME)', court: 'le yen', code: '097741', rapport: 'tff', terminal: null, alias: ['yen', 'jpy'] },
  T10: { id: 'T10', nom: 'Bons du Trésor US 10 ans (CBOT)', court: 'les bons du Trésor à 10 ans', code: '043602', rapport: 'tff', terminal: null, alias: ['bons du tresor', 'treasury', 'taux 10 ans', 'obligations americaines'] },
  VIX: { id: 'VIX', nom: 'Futures VIX (CBOE)', court: 'le VIX', code: '1170E1', rapport: 'tff', terminal: null, alias: ['vix', 'volatilite'] },
  WTI: { id: 'WTI', nom: 'Pétrole WTI (NYMEX)', court: 'le pétrole', code: '067651', rapport: 'disagg', terminal: null, alias: ['petrole', 'wti', 'brut', 'oil'] }
};
export const ORDRE_COT = ['NDX', 'SPX', 'XAU', 'BTC', 'USD', 'EUR', 'JPY', 'T10', 'VIX', 'XAG', 'WTI'];

/* Catégories de chaque rapport : champs de la CFTC pour les longs et les courts. `spec` = catégorie des spéculateurs (mise en avant dans les phrases). */
export const CATEGORIES = {
  tff: [
    { id: 'dealer', nom: 'Dealers (intermédiaires)', long: 'dealer_positions_long_all', court: 'dealer_positions_short_all' },
    { id: 'asset_mgr', nom: 'Gérants d’actifs (institutionnels)', long: 'asset_mgr_positions_long', court: 'asset_mgr_positions_short' },
    { id: 'lev_money', nom: 'Fonds à effet de levier', long: 'lev_money_positions_long', court: 'lev_money_positions_short', spec: true },
    { id: 'other_rept', nom: 'Autres déclarants', long: 'other_rept_positions_long', court: 'other_rept_positions_short' },
    { id: 'nonrept', nom: 'Petits opérateurs', long: 'nonrept_positions_long_all', court: 'nonrept_positions_short_all' }
  ],
  disagg: [
    { id: 'prod_merc', nom: 'Producteurs / commerciaux', long: 'prod_merc_positions_long', court: 'prod_merc_positions_short' },
    { id: 'swap', nom: 'Swap dealers', long: 'swap_positions_long_all', court: 'swap__positions_short_all' },
    { id: 'm_money', nom: 'Gérants de fonds spéculatifs', long: 'm_money_positions_long_all', court: 'm_money_positions_short_all', spec: true },
    { id: 'other_rept', nom: 'Autres déclarants', long: 'other_rept_positions_long', court: 'other_rept_positions_short' },
    { id: 'nonrept', nom: 'Petits opérateurs', long: 'nonrept_positions_long_all', court: 'nonrept_positions_short_all' }
  ]
};

export const urlCot = (contrat, semaines = SEMAINES_COT + 2) => {
  const c = CONTRATS_COT[contrat]; if (!c) throw new Error('contrat COT inconnu');
  return URL_COT[c.rapport] + '?$limit=' + semaines + '&$order=report_date_as_yyyy_mm_dd%20DESC&$where=cftc_contract_market_code%3D%27' + c.code + '%27';
};

const entier = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
/* Lignes de la CFTC (plus récentes d'abord) → lignes normalisées du plus ancien au plus récent : { date, oi, cat: { id: { long, court, net } } }. Une ligne incomplète est écartée. */
export function normaliserCot(rows, rapport) {
  const cats = CATEGORIES[rapport]; if (!cats || !Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const date = String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10), oi = entier(r.open_interest_all); if (!date || oi == null) continue;
    const cat = {}; let ok = true;
    for (const c of cats) { const l = entier(r[c.long]), s = entier(r[c.court]); if (l == null || s == null) { ok = false; break; } cat[c.id] = { long: l, court: s, net: l - s }; }
    if (ok) out.push({ date, oi, cat });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* Rang percentile (0 = plus bas jamais vu sur la période, 100 = plus haut) du dernier élément de `serie`. */
export function percentile(serie, v = serie[serie.length - 1]) {
  if (serie.length < 20) return null;
  let moins = 0, egal = 0; for (const x of serie) { if (x < v) moins++; else if (x === v) egal++; }
  return Math.round((moins + egal / 2) / serie.length * 100);
}
export const extreme = p => (p == null ? null : p >= 90 ? 'haut' : p <= 10 ? 'bas' : null);

/* Analyse complète d'un contrat. */
export function analyserCot(lignes, rapport, { semaines = SEMAINES_COT } = {}) {
  const cats = CATEGORIES[rapport]; if (!cats || !lignes.length) return null;
  const L = lignes.slice(-semaines), der = L[L.length - 1], prec = L.length > 1 ? L[L.length - 2] : null;
  const categories = cats.map(c => {
    const net = L.map(x => x.cat[c.id].net), now = der.cat[c.id], p = percentile(net);
    return { id: c.id, nom: c.nom, spec: !!c.spec, long: now.long, court: now.court, net: now.net, variation: prec ? now.net - prec.cat[c.id].net : null, variationLong: prec ? now.long - prec.cat[c.id].long : null, variationCourt: prec ? now.court - prec.cat[c.id].court : null,
      netPctOI: der.oi ? now.net / der.oi * 100 : null, percentile: p, extreme: extreme(p), min: Math.min(...net), max: Math.max(...net), serie: net };
  });
  return { rapport, date: der.date, datePrecedente: prec && prec.date, oi: der.oi, variationOI: prec ? der.oi - prec.oi : null, semaines: L.length, dates: L.map(x => x.date), categories, publication: datePublication(der.date) };
}
/* Les positions du mardi sont publiées le vendredi suivant (15 h 30 à New York). */
export function datePublication(dateMardi) { const d = new Date(Date.parse(dateMardi + 'T00:00:00Z') + 3 * 86400e3); return d.toISOString().slice(0, 10); }

/* Fraîcheur : DIFFÉRÉ normalement ; PÉRIMÉ si la dernière date a plus de 12 jours (une publication manquée) ; RÉEL n'existe pas pour le COT. */
export function fraicheurCot(date, maintenant = Date.now()) {
  const ageJours = (maintenant - Date.parse(date + 'T00:00:00Z')) / 86400e3;
  return ageJours > 12 ? { etiquette: 'PÉRIMÉ', cls: 'ko', ageJours } : { etiquette: 'DIFFÉRÉ', cls: 'info', ageJours };
}

const f0 = x => (x == null ? 'inconnu' : Math.abs(Math.round(x)).toLocaleString('fr-FR'));
const jourFr = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
/* Phrase parlée sur la catégorie spéculative (ou une catégorie demandée), avec percentile et variation. */
export function phraseCot(contrat, a, categorieId = null) {
  const c = CONTRATS_COT[contrat]; if (!c || !a) return 'Je n’ai pas de rapport COT pour ' + (c ? c.court : 'ce marché') + ' pour le moment.';
  const cat = a.categories.find(x => x.id === categorieId) || a.categories.find(x => x.spec) || a.categories[0];
  const sens = cat.net > 0 ? 'net acheteur' : cat.net < 0 ? 'net vendeur' : 'à l’équilibre';
  let t = 'COT sur ' + c.court + ', positions du mardi ' + jourFr(a.date) + ' : ' + cat.nom.toLowerCase() + ', ' + sens + (cat.net ? ' de ' + f0(cat.net) + ' contrats' : '') + '.';
  if (cat.variation != null) t += ' Sur la semaine : ' + (cat.variation > 0 ? 'plus ' : cat.variation < 0 ? 'moins ' : 'aucun changement, ') + (cat.variation ? f0(cat.variation) + ' contrats.' : '');
  if (cat.percentile != null) t += ' C’est au ' + cat.percentile + 'e percentile des ' + Math.round(a.semaines / 52 * 10) / 10 + ' dernières années' + (cat.extreme === 'haut' ? ' : l’un des niveaux nets les plus acheteurs de la période' : cat.extreme === 'bas' ? ' : l’un des niveaux nets les plus vendeurs de la période' : '') + '.';
  return t + ' Donnée hebdomadaire différée, publiée le vendredi. Ce n’est pas un signal d’achat ou de vente.';
}

/* Contrat demandé à la voix (« le COT de l’or », « les positions des fonds sur le Nasdaq »). */
export function contratDeLaPhrase(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ');
  let meilleur = null, taille = 0;
  for (const c of Object.values(CONTRATS_COT)) for (const a of c.alias) if (a.length > taille && new RegExp('(^|[^a-z0-9])' + a.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&') + '([^a-z0-9]|$)').test(t)) { meilleur = c.id; taille = a.length; }
  return meilleur;
}
export const demandeCot = texte => { const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return /\b(cot|commitments? of traders|positions? (nettes? )?(des|de la) (fonds|speculateurs|gestionnaires|institutionnels|cftc)|rapport cftc|positionnement des fonds)\b/.test(t); };
