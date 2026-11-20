/* ═════════════ HISTORIQUE LONG DU TERMINAL (v4) : Daily 15-20 ans, H4 8 ans, H1 3 ans, découpés par année et compressés ═════════════
   Tâche planifiée GitHub Actions (.github/workflows/historique.yml) → branche orpheline « historique » : <actif>/<unité>/<année>.json.gz + index.json.
   Le Terminal charge les années à la demande quand on fait défiler vers la gauche (trader-pro/terminal/histo-long.js).
   Sources gratuites, sans clé (premier choix, repli automatique) :
     · or, EUR/USD : Dukascopy (paquet npm « dukascopy-node », cours bid, volume de ticks) ; repli Yahoo (GC=F, EURUSD=X) en Daily.
     · Nasdaq 100, S&P 500 : Daily = Yahoo (^NDX, ^GSPC, depuis 1985 / 1927) ; H4 et H1 = Dukascopy (indices CFD USATECH / USA500) ; sans Dukascopy : pas d'H4/H1 long (écrit dans l'index).
     · Bitcoin, Solana : Binance (miroir public data-api.binance.vision : l'API principale refuse les serveurs américains) ; Bitcoin avant 2017 : Yahoo BTC-USD (Daily).
   ÉCART MESURÉ : pour chaque actif et unité, rapport médian (cours du Terminal en direct / cours de l'historique long) sur les bougies communes (instantané « pro » de la branche donnees) ;
   écrit dans index.json (ecart) et appliqué par le Terminal à tout l'historique long (recalage multiplicatif, sans regard vers l'avenir). Rien n'est inventé : source absente = unité absente.
   Format d'une bougie : [t en secondes, o, h, l, c, v]. Données de marché publiques seulement. */
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';

const H = 3600e3, J = 86400e3;
export const PROFONDEUR_ANNEES = Object.freeze({ J: 40, H4: 8, H1: 3 });
export const ACTIFS = Object.freeze([
  { id: 'or', nom: 'Or (XAU/USD)', duka: 'xauusd', yahoo: 'GC=F', sourceJ: 'duka', depuis: '2003-05-05', pro: 'or' },
  { id: 'us100', nom: 'Nasdaq 100', duka: 'usatechidxusd', yahoo: '^NDX', sourceJ: 'yahoo', depuis: '2012-01-01', pro: 'us100' },
  { id: 'us500', nom: 'S&P 500', duka: 'usa500idxusd', yahoo: '^GSPC', sourceJ: 'yahoo', depuis: '2012-01-01', pro: 'us500' },
  { id: 'eurusd', nom: 'EUR/USD', duka: 'eurusd', yahoo: 'EURUSD=X', sourceJ: 'duka', depuis: '2003-05-05', pro: 'eurusd' },
  { id: 'btc', nom: 'Bitcoin', binance: 'BTCUSDT', yahoo: 'BTC-USD', sourceJ: 'binance', depuis: '2017-08-17', pro: 'btc' },
  { id: 'sol', nom: 'Solana', binance: 'SOLUSDT', yahoo: 'SOL-USD', sourceJ: 'binance', depuis: '2020-08-11', pro: 'sol' }
]);

/* ───── fonctions pures (testées) ───── */
const arrondi = x => +Number(x).toPrecision(9);
export const compacter = B => B.map(b => [Math.round(b.t / 1000), arrondi(b.o), arrondi(b.h), arrondi(b.l), arrondi(b.c), Math.round(b.v || 0)]);
export const decompacter = L => L.map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v: v || 0 }));
/* H1 → H4 sur la grille UTC (0, 4, 8, 12, 16, 20 h), comme les bougies H4 Kraken du Terminal */
export function enH4(B1) {
  const out = []; let cur = null;
  for (const b of B1) { const t0 = Math.floor(b.t / (4 * H)) * 4 * H; if (!cur || cur.t !== t0) { cur = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; } }
  return out;
}
/* horodatage d'une bougie journalière ramené au 00:00 UTC du jour de calendrier le plus proche (Dukascopy ouvre à 21 h / 22 h UTC la veille ; Yahoo à l'ouverture de la bourse) */
export const jourUtc = t => Math.floor((t + 4 * H) / J) * J;
export function nettoyer(B) {
  const m = new Map(); for (const b of B) if (b && [b.o, b.h, b.l, b.c].every(x => Number.isFinite(x) && x > 0) && b.h >= b.l) m.set(b.t, b);
  return [...m.values()].sort((a, b) => a.t - b.t);
}
export const anneeDe = t => new Date(t).getUTCFullYear();
/* { 2019: [bougies], 2020: [...] } */
export function parAnnee(B) { const o = {}; for (const b of B) (o[anneeDe(b.t)] = o[anneeDe(b.t)] || []).push(b); return o; }
export const mediane = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/* rapport médian live / long sur les bougies communes. `cle` ramène un horodatage à une clé de comparaison (jour pour le Daily, heure exacte sinon). */
export function mesurerEcart(live, long, cle = t => t, { min = 20, fenetre = 250 } = {}) {
  const m = new Map(long.map(b => [cle(b.t), b.c])), r = [], d = []; let de = null, a = null;
  for (const b of live) { const g = m.get(cle(b.t)); if (g > 0 && b.c > 0) { r.push(b.c / g); d.push(b.c - g); de = de == null ? b.t : de; a = b.t; } }
  if (r.length < min) return { ratio: 1, n: r.length, mesure: false, raison: 'moins de ' + min + ' bougies communes' };
  if (r.length > fenetre) { r.splice(0, r.length - fenetre); d.splice(0, d.length - fenetre); }   // les plus récentes seulement : le raccord se joue là (un écart ancien ne dit rien du raccord actuel)
  const q = [...r].sort((x, y) => x - y), iq = Math.floor(r.length * 0.25), jq = Math.floor(r.length * 0.75);
  return { ratio: arrondi(mediane(r)), ecartMedian: arrondi(mediane(d)), n: r.length, de, a, dispersion: arrondi((q[jq] - q[iq])), mesure: true };
}
export const gz = obj => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });

/* ───── réseau ───── */
const UA = 'Mozilla/5.0 (compatible; Rayle-historique/1.0)';
async function json(url, fetchFn = fetch, essais = 3) {
  let derniere; for (let i = 0; i < essais; i++) { try { const r = await fetchFn(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(new URL(url).host + ' a répondu ' + r.status); return await r.json(); } catch (e) { derniere = e; await new Promise(res => setTimeout(res, 800 * (i + 1))); } }
  throw derniere;
}
export async function yahooJ(sym, fetchFn = fetch) {
  const j = await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=div`, fetchFn);
  const r = j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.timestamp) throw new Error('Yahoo : réponse vide pour ' + sym);
  const q = r.indicators.quote[0]; return nettoyer(r.timestamp.map((t, i) => ({ t: jourUtc(t * 1000), o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume ? q.volume[i] || 0 : 0 })));
}
export async function binanceKlines(symbole, intervalle, debut, fetchFn = fetch) {
  const pas = { '1d': J, '4h': 4 * H, '1h': H }[intervalle]; let t = debut, tout = [];
  for (let k = 0; k < 400; k++) {
    const L = await json(`https://data-api.binance.vision/api/v3/klines?symbol=${symbole}&interval=${intervalle}&startTime=${t}&limit=1000`, fetchFn);
    if (!Array.isArray(L) || !L.length) break; tout = tout.concat(L.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })));
    t = L[L.length - 1][0] + pas; if (L.length < 1000) break;
  }
  const maintenant = Date.now(); return nettoyer(tout).filter(b => b.t + pas <= maintenant);   // jamais la bougie en cours
}
async function dukascopy(instrument, timeframe, from, to) {
  const { getHistoricalRates } = await import('dukascopy-node');   // installé par le workflow (npm i --no-save dukascopy-node)
  const d = await getHistoricalRates({ instrument, dates: { from: new Date(from), to: new Date(to) }, timeframe, format: 'json', priceType: 'bid', volumes: true, ignoreFlats: true, useCache: false, batchSize: 10, pauseBetweenBatchesMs: 300 });
  return nettoyer(d.map(x => ({ t: x.timestamp, o: x.open, h: x.high, l: x.low, c: x.close, v: x.volume || 0 })));
}

/* ───── construction d'un actif ───── */
export async function construireActif(a, { fetchFn = fetch, maintenant = Date.now(), log = () => {} } = {}) {
  const res = { id: a.id, nom: a.nom, unites: {}, notes: [] }, fin = maintenant, an = n => new Date(fin - n * 365.25 * J);
  const poser = (u, B, source) => { if (B && B.length > 30) res.unites[u] = { bougies: B, source }; };
  /* Daily */
  try {
    if (a.sourceJ === 'binance') {
      const B = await binanceKlines(a.binance, '1d', Date.parse(a.depuis), fetchFn); let avant = [];
      try { const Y = await yahooJ(a.yahoo, fetchFn); avant = Y.filter(b => !B.length || b.t < B[0].t); } catch (e) { res.notes.push('Yahoo Daily indisponible : ' + e.message); }
      poser('J', [...avant, ...B], `Binance ${a.binance}` + (avant.length ? ` ; avant le ${new Date(B[0].t).toISOString().slice(0, 10)} : Yahoo ${a.yahoo}` : ''));
    } else if (a.sourceJ === 'yahoo') { poser('J', await yahooJ(a.yahoo, fetchFn), `Yahoo Finance ${a.yahoo} (indice au comptant)`); }
    else { const B = (await dukascopy(a.duka, 'd1', Date.parse(a.depuis), fin)).map(b => ({ ...b, t: jourUtc(b.t) })); poser('J', nettoyer(B), `Dukascopy ${a.duka.toUpperCase()} (bid, volume de ticks)`); }
  } catch (e) {
    res.notes.push('Daily : ' + e.message);
    try { poser('J', await yahooJ(a.yahoo, fetchFn), `Yahoo Finance ${a.yahoo} (repli)`); } catch (e2) { res.notes.push('Daily repli : ' + e2.message); }
  }
  /* H1 et H4 */
  try {
    if (a.binance) {
      const B4 = await binanceKlines(a.binance, '4h', Math.max(Date.parse(a.depuis), an(PROFONDEUR_ANNEES.H4).getTime()), fetchFn); poser('H4', B4, `Binance ${a.binance}`);
      const B1 = await binanceKlines(a.binance, '1h', an(PROFONDEUR_ANNEES.H1).getTime(), fetchFn); poser('H1', B1, `Binance ${a.binance}`);
    } else if (a.duka) {
      const B1 = await dukascopy(a.duka, 'h1', Math.max(Date.parse(a.depuis), an(PROFONDEUR_ANNEES.H4).getTime()), fin);
      poser('H4', enH4(B1), `Dukascopy ${a.duka.toUpperCase()} (bid, volume de ticks), H4 construit depuis le H1`);
      poser('H1', B1.filter(b => b.t >= an(PROFONDEUR_ANNEES.H1).getTime()), `Dukascopy ${a.duka.toUpperCase()} (bid, volume de ticks)`);
    }
  } catch (e) { res.notes.push('H1/H4 : ' + e.message); }
  for (const u of Object.keys(res.unites)) log(`${a.id} ${u} : ${res.unites[u].bougies.length} bougies, ${res.unites[u].source}`);
  return res;
}
/* écart live / long à partir de l'instantané « pro » de la branche donnees (j, h4, h1) */
export function ecartsDe(pro, unites) {
  const out = {}; if (!pro) return out;
  const cle = { J: t => Math.floor(t / J), H1: t => Math.round(t / H) }, lire = k => (Array.isArray(pro[k]) ? pro[k].map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })) : []);
  if (unites.J) out.J = mesurerEcart(lire('j'), unites.J.bougies, cle.J, { fenetre: 250 });
  if (unites.H1) out.H1 = mesurerEcart(lire('h1'), unites.H1.bougies, cle.H1, { fenetre: 600 });
  /* H4 : la grille H4 du Terminal (décalée de 2 h pour l'instantané) ne coïncide pas avec la grille UTC de l'historique : l'écart H4 est celui du H1 (même niveau de prix), à défaut celui du Daily */
  if (unites.H4) out.H4 = out.H1 && out.H1.mesure ? { ...out.H1, deH1: true } : out.J ? { ...out.J, deJ: true } : undefined;
  return out;
}

/* ───── écriture : <actif>/<unité>/<année>.json.gz (seules les années qui changent sont réécrites : la courante, et celles qui manquent) ───── */
export function ecrire(dossier, res, { maintenant = Date.now() } = {}) {
  const anneeCourante = anneeDe(maintenant), index = {};
  for (const [u, { bougies, source }] of Object.entries(res.unites)) {
    const P = parAnnee(bougies), annees = Object.keys(P).map(Number).sort((a, b) => a - b), rep = path.join(dossier, res.id, u); fs.mkdirSync(rep, { recursive: true });
    for (const an of annees) { const f = path.join(rep, an + '.json.gz'); if (an >= anneeCourante - 1 || !fs.existsSync(f)) fs.writeFileSync(f, gz(compacter(P[an]))); }
    index[u] = { debut: bougies[0].t, fin: bougies[bougies.length - 1].t, annees, n: bougies.length, source };
  }
  return index;
}

/* ───── programme principal : node outils-donnees/historique-long.mjs --sortie <dossier> [--seulement or,btc] ───── */
const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
if (process.argv[1] && /historique-long\.mjs$/.test(process.argv[1])) {
  const sortie = path.resolve(arg('sortie') || 'historique-sortie'), seulement = (arg('seulement') || '').split(',').filter(Boolean), base = arg('base') || 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/';
  fs.mkdirSync(sortie, { recursive: true }); const fichierIndex = path.join(sortie, 'index.json'); let ancien = {}; try { ancien = JSON.parse(fs.readFileSync(fichierIndex, 'utf8')); } catch (e) { /* premier passage */ }
  const index = { t: Date.now(), format: '[t en secondes, o, h, l, c, v] ; un fichier gzip par année', actifs: { ...(ancien.actifs || {}) } }; let ok = 0, ko = 0;
  for (const a of ACTIFS.filter(x => !seulement.length || seulement.includes(x.id))) {
    try {
      const res = await construireActif(a, { log: console.log }); if (!Object.keys(res.unites).length) throw new Error('aucune unité : ' + res.notes.join(' ; '));
      const idx = ecrire(sortie, res); let pro = null; try { pro = await json(base + 'pro-' + a.pro + '.json'); } catch (e) { res.notes.push('instantané pro indisponible : ' + e.message); }
      const ecarts = ecartsDe(pro, res.unites); for (const u of Object.keys(idx)) idx[u].ecart = ecarts[u] || { ratio: 1, n: 0, mesure: false, raison: 'instantané du Terminal indisponible' };
      index.actifs[a.id] = { nom: a.nom, t: Date.now(), unites: idx, notes: res.notes }; ok++;
    } catch (e) { ko++; console.error('✗ ' + a.id + ' : ' + e.message); if (index.actifs[a.id]) index.actifs[a.id].erreur = String(e.message).slice(0, 200); }
  }
  fs.writeFileSync(fichierIndex, JSON.stringify(index));
  console.log(`historique : ${ok} actif(s) écrits, ${ko} en échec → ${sortie}`); process.exit(ok ? 0 : 1);
}
