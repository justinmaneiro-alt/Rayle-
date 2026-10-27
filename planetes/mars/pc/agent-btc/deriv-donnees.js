/* ═════════════ DONNÉES GRATUITES DES CONTRATS À TERME BTC (M4 ; module pur à réseau injecté, testé : agent-micro-test.mjs) ═════════════
   Sondées en vrai le 2026-10-22 depuis le PC (docs/sources-micro-btc.json) :
   - FINANCEMENT : Binance fapi.binance.com/fapi/v1/fundingRate (historique COMPLET depuis 2019, 1 000 lignes par requête, CORS ouvert, sans clé).
   - INTÉRÊT OUVERT, ratios long/short des comptes et des gros comptes, ratio acheteur/vendeur agressif des contrats : archives quotidiennes de data.binance.vision
     (data/futures/um/daily/metrics/BTCUSDT/…zip, pas de 5 minutes, depuis 2020-09, CORS ouvert, zip + CSV, sans clé) ; les 30 derniers jours (et « aujourd'hui », absent des archives) viennent de
     fapi.binance.com/futures/data/… (openInterestHist, globalLongShortAccountRatio, topLongShortPositionRatio, takerlongshortRatio ; CORS ouvert, 30 jours maximum).
   - LIQUIDATIONS : aucune source gratuite COMPLÈTE (Binance allForceOrders retiré : 404 ; OKX ne donne que les toutes dernières ; pas d'archive). Pas de donnée : un indice ESTIMÉ est fabriqué
     dans micro-mesures.js. AUCUN montant de liquidation n'est présenté comme réel.
   Tout vient de Binance seulement (une plateforme) : c'est dit dans l'interface. Une donnée absente reste absente. */
export const URL_FUNDING = (t0, limite = 1000) => 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=' + t0 + '&limit=' + limite;
export const URL_ARCHIVE = jour => 'https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-' + jour + '.zip';
export const URL_RECENT = {
  oi: (t0, t1) => 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=500&startTime=' + t0 + '&endTime=' + t1,
  lsComptes: (t0, t1) => 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=500&startTime=' + t0 + '&endTime=' + t1,
  lsGros: (t0, t1) => 'https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=5m&limit=500&startTime=' + t0 + '&endTime=' + t1,
  taker: (t0, t1) => 'https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=5m&limit=500&startTime=' + t0 + '&endTime=' + t1
};
const JOUR = 86400e3, PAS5 = 300e3;
export const jourISO = t => new Date(t).toISOString().slice(0, 10);

/* ── Financement ── */
export function analyserFunding(j) {
  if (!Array.isArray(j)) throw new Error('réponse de financement inattendue');
  return j.map(x => ({ t: +x.fundingTime, taux: +x.fundingRate })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.taux));
}
export async function telechargerFunding(lireJson, t0, t1, { pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const out = new Map(); let curseur = t0;
  for (let pages = 0; curseur < t1 && pages < 40; pages++) {
    const page = analyserFunding(await lireJson(URL_FUNDING(curseur)));
    if (!page.length) break;
    for (const x of page) out.set(x.t, x);
    const dernier = page[page.length - 1].t; if (dernier < curseur) break;
    curseur = dernier + 1; if (page.length < 100) break;
    await pause(120);
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

/* ── Zip : lecture d'un fichier unique (méthode 8 = deflate brut). `inflater(octets)` rend une promesse d'octets : zlib.inflateRaw côté Node, DecompressionStream('deflate-raw') côté navigateur. ── */
export async function lireZipTexte(octets, inflater) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (octets.length < 30 || dv.getUint32(0, true) !== 0x04034b50) throw new Error('archive zip invalide');
  let methode = dv.getUint16(8, true), taille = dv.getUint32(18, true);
  const nom = dv.getUint16(26, true), extra = dv.getUint16(28, true), debut = 30 + nom + extra;
  if (taille === 0) {                                     // tailles dans le répertoire central (drapeau « data descriptor »)
    let e = octets.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('répertoire zip introuvable');
    const c = dv.getUint32(e + 16, true); methode = dv.getUint16(c + 10, true); taille = dv.getUint32(c + 20, true);
  }
  const donnees = octets.subarray(debut, debut + taille);
  const brut = methode === 0 ? donnees : methode === 8 ? await inflater(donnees) : null;
  if (!brut) throw new Error('méthode de compression zip non gérée');
  return new TextDecoder().decode(brut);
}

/* ── Archive quotidienne de métriques : CSV → lignes de 5 minutes ──
   create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio */
export function analyserMetrics(csv) {
  const lignes = String(csv).split(/\r?\n/), out = [];
  for (let k = 1; k < lignes.length; k++) {
    const c = lignes[k].split(','); if (c.length < 8) continue;
    const t = Date.parse(c[0].replace(' ', 'T') + 'Z'); if (!Number.isFinite(t)) continue;
    const oi = +c[2], oiValeur = +c[3], lsGros = +c[5], lsComptes = +c[6], taker = +c[7];
    if (!(oi > 0)) continue;
    out.push({ t, oi, oiValeur, lsGros: Number.isFinite(lsGros) ? lsGros : NaN, lsComptes: Number.isFinite(lsComptes) ? lsComptes : NaN, taker: Number.isFinite(taker) ? taker : NaN });
  }
  return out;
}

/* ── Les 30 derniers jours : quatre requêtes parallèles fusionnées par instant ── */
export async function telechargerRecent(lireJson, t0, t1) {
  const parMs = new Map();
  const fusion = (cle, liste, champ, f) => { for (const x of liste) { const t = +x.timestamp; if (!Number.isFinite(t)) continue; const m = parMs.get(t) || { t }; f(m, x); parMs.set(t, m); } };
  for (let a = t0; a < t1; a += 500 * PAS5) {
    const b = Math.min(t1, a + 500 * PAS5 - 1);
    const [oi, lc, lg, tk] = await Promise.all(['oi', 'lsComptes', 'lsGros', 'taker'].map(k => lireJson(URL_RECENT[k](a, b)).catch(() => [])));
    fusion('oi', Array.isArray(oi) ? oi : [], 'oi', (m, x) => { m.oi = +x.sumOpenInterest; m.oiValeur = +x.sumOpenInterestValue; });
    fusion('lc', Array.isArray(lc) ? lc : [], 'lsComptes', (m, x) => { m.lsComptes = +x.longShortRatio; });
    fusion('lg', Array.isArray(lg) ? lg : [], 'lsGros', (m, x) => { m.lsGros = +x.longShortRatio; });
    fusion('tk', Array.isArray(tk) ? tk : [], 'taker', (m, x) => { m.taker = +x.buySellRatio; });
  }
  return [...parMs.values()].filter(m => m.oi > 0).map(m => ({ t: m.t, oi: m.oi, oiValeur: m.oiValeur, lsGros: m.lsGros ?? NaN, lsComptes: m.lsComptes ?? NaN, taker: m.taker ?? NaN })).sort((a, b) => a.t - b.t);
}

/* ── Stockage (même interface que l'historique des bougies : lire, ecrire, liste) ──
   Un enregistrement « DERIV:funding » ; un par mois « DERIV:metrics:AAAA-MM » (colonnes typées). */
const COLS = ['t', 'oi', 'oiValeur', 'lsGros', 'lsComptes', 'taker'];
const versColonnes = lignes => { const o = { n: lignes.length }; for (const c of COLS) o[c] = new Float64Array(lignes.length); lignes.forEach((l, i) => { for (const c of COLS) o[c][i] = l[c]; }); return o; };
const depuisColonnes = b => { const l = []; for (let i = 0; i < b.n; i++) { const x = {}; for (const c of COLS) x[c] = b[c][i]; l.push(x); } return l; };

export function creerDeriv({ stockage, lireJson, lireOctets, inflater, maintenant = () => Date.now(), annees = 4, concurrence = 6, pause } = {}) {
  let funding = [], metrics = [], meta = { majLe: null, erreur: null, jours: 0, joursManquants: 0 };
  const cleMois = t => 'DERIV:metrics:' + new Date(t).toISOString().slice(0, 7);

  async function charger() {
    const f = await stockage.lire('DERIV:funding'); funding = f && f.valeur ? f.valeur : [];
    const cles = (await stockage.liste()).filter(k => k.startsWith('DERIV:metrics:')).sort(), tout = [];
    for (const k of cles) { const b = await stockage.lire(k); if (b && b.t) tout.push(...depuisColonnes(b)); }
    metrics = tout.sort((a, b) => a.t - b.t);
    const m = await stockage.lire('DERIV:meta'); if (m && m.valeur) meta = { ...meta, ...m.valeur };
    return etat();
  }
  const etat = () => ({ funding: funding.length, metrics: metrics.length, debutFunding: funding.length ? funding[0].t : null, debutMetrics: metrics.length ? metrics[0].t : null, finMetrics: metrics.length ? metrics[metrics.length - 1].t : null, ...meta });
  async function ecrireMetrics(nouvelles) {
    const parMois = new Map(); for (const x of nouvelles) { const k = cleMois(x.t); if (!parMois.has(k)) parMois.set(k, []); parMois.get(k).push(x); }
    for (const [k, liste] of parMois) {
      const ancien = await stockage.lire(k), m = new Map(); if (ancien && ancien.t) for (const x of depuisColonnes(ancien)) m.set(x.t, x);
      for (const x of liste) m.set(x.t, x);
      await stockage.ecrire(k, versColonnes([...m.values()].sort((a, b) => a.t - b.t)));
    }
  }
  /* Complète l'historique jusqu'à maintenant. Premier passage : plusieurs minutes de téléchargement (≈ 1 500 petits fichiers) ; ensuite seulement les jours manquants. */
  async function synchroniser({ surProgres = () => {}, arret = () => false } = {}) {
    const t1 = maintenant(), depart = t1 - annees * 365.25 * JOUR;
    try {
      const dernierF = funding.length ? funding[funding.length - 1].t + 1 : depart;
      const nouveauxF = await telechargerFunding(lireJson, dernierF, t1, { pause });
      if (nouveauxF.length) { const m = new Map(funding.map(x => [x.t, x])); for (const x of nouveauxF) m.set(x.t, x); funding = [...m.values()].sort((a, b) => a.t - b.t); await stockage.ecrire('DERIV:funding', { valeur: funding }); }
      surProgres({ phase: 'financement', lignes: funding.length });
      // archives quotidiennes : tous les jours complets (jusqu'à avant-hier compris : celle d'hier peut ne pas être publiée) puis le récent par l'API
      const aTelecharger = []; const dejaJours = new Set(metrics.map(x => jourISO(x.t)));
      const finArchives = Math.floor((t1 - 2 * JOUR) / JOUR) * JOUR;
      for (let d = Math.floor(depart / JOUR) * JOUR; d <= finArchives; d += JOUR) { const j = jourISO(d); if (!dejaJours.has(j)) aTelecharger.push(j); }
      let faits = 0, manquants = 0, curseur = 0;
      const ouvrier = async () => {
        while (curseur < aTelecharger.length && !arret()) {
          const j = aTelecharger[curseur++];
          try { const txt = await lireZipTexte(await lireOctets(URL_ARCHIVE(j)), inflater); const lignes = analyserMetrics(txt); if (lignes.length) await ecrireMetrics(lignes); }
          catch (e) { manquants++; }
          faits++; if (faits % 20 === 0 || faits === aTelecharger.length) surProgres({ phase: 'archives', fait: faits, total: aTelecharger.length });
        }
      };
      await Promise.all(Array.from({ length: concurrence }, ouvrier));
      // récent (30 jours au plus) : OI, ratios, agressif
      const dernierM = (await (async () => { await charger(); return metrics.length ? metrics[metrics.length - 1].t : depart; })());
      const debutRecent = Math.max(dernierM + PAS5, t1 - 29 * JOUR);
      if (debutRecent < t1 - PAS5) { try { const rec = await telechargerRecent(lireJson, debutRecent, t1); if (rec.length) await ecrireMetrics(rec); } catch (e) { /* le récent est facultatif */ } }
      await charger();
      meta = { ...meta, majLe: maintenant(), erreur: null, joursManquants: manquants }; await stockage.ecrire('DERIV:meta', { valeur: meta });
      surProgres({ phase: 'termine' });
      return etat();
    } catch (e) { meta = { ...meta, erreur: String(e && e.message || e) }; throw e; }
  }
  return { charger, synchroniser, brut: () => ({ funding, metrics }), etat };
}
