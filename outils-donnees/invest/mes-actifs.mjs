/* Mes actifs (v7) : indicateurs « cher ou pas cher » de Bitcoin, Solana, or, Nasdaq 100, S&P 500 et pétrole. Sources gratuites sans clé :
   FRED (CSV public), Yahoo Finance, multpl.com (PER, CAPE), CFTC (open data), Coin Metrics (API communautaire : MVRV), DefiLlama (frais, TVL), CoinGecko (capitalisation), OKX (financement).
   Usage : node outils-donnees/invest/mes-actifs.mjs --sortie sortie      → sortie/mes-actifs.json
   Un indicateur dont la source ne répond pas est RETIRÉ proprement (liste « absentes » du fichier, affichée dans la fenêtre) ; rien n'est inventé. */
import fs from 'node:fs';
import path from 'node:path';
import { percentile, scoreDepuisPercentile, verdictsActif } from '../../trader-pro/invest/mes-actifs-calcul.js';

const sortie = process.argv.includes('--sortie') ? process.argv[process.argv.indexOf('--sortie') + 1] : 'sortie';
const UA = { 'User-Agent': 'Mozilla/5.0 (Rayle mes-actifs)' }, DEPOT = 'justinmaneiro-alt/Rayle-';
const get = async (url, { json = true, ms = 30000, essais = 2 } = {}) => { let derniere; for (let i = 0; i < essais; i++) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return json ? await r.json() : await r.text(); } catch (e) { derniere = e; await new Promise(r => setTimeout(r, 1500)); } } throw new Error(url.split('?')[0].slice(0, 70) + ' : ' + (derniere && derniere.message)); };

/* ───── séries ───── */
const fred = async id => (await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id, { json: false })).split('\n').slice(1).map(l => l.split(',')).map(([d, v]) => [Date.parse(d), parseFloat(v)]).filter(x => Number.isFinite(x[0]) && Number.isFinite(x[1]));
async function yahoo(sym, range = 'max', interval = '1wk') {
  const periode = range === 'max' ? `period1=-2000000000&period2=${Math.floor(Date.now() / 1000) + 86400}` : `range=${range}`, j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${periode}&interval=${interval}`), r = j.chart && j.chart.result && j.chart.result[0]; if (!r) throw new Error('Yahoo ' + sym + ' : vide');
  const t = r.timestamp || [], c = r.indicators.quote[0].close || []; return t.map((x, i) => [x * 1000, c[i]]).filter(x => Number.isFinite(x[1]) && x[1] > 0);
}
async function multpl(slug) {
  const h = await get('https://www.multpl.com/' + slug + '/table/by-month', { json: false }), L = [], re = /<td>([A-Z][a-z]{2} \d{1,2}, \d{4})<\/td>\s*<td>[\s\S]*?([\d.,]+)\s*<\/td>/g; let m;
  while ((m = re.exec(h))) { const t = Date.parse(m[1] + ' UTC'), v = parseFloat(m[2].replace(/,/g, '')); if (Number.isFinite(t) && Number.isFinite(v)) L.push([t, v]); }
  if (L.length < 100) throw new Error('multpl ' + slug + ' : table illisible'); return L.sort((a, b) => a[0] - b[0]);
}
const sma = (S, n) => S.map((_, i) => (i + 1 >= n ? S.slice(i + 1 - n, i + 1).reduce((s, x) => s + x[1], 0) / n : null));
const dernier = S => S[S.length - 1][1];
const mensuel = S => { const m = new Map(); for (const [t, v] of S) m.set(new Date(t).getUTCFullYear() * 12 + new Date(t).getUTCMonth(), [t, v]); return [...m.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]); };
const joindre = (A, B, f, tolMs = 40 * 86400e3) => { const out = []; let j = 0; for (const [t, a] of A) { while (j + 1 < B.length && B[j + 1][0] <= t) j++; const b = B[j]; if (b && Math.abs(b[0] - t) <= tolMs && b[0] <= t + tolMs) out.push([t, f(a, b[1])]); } return out; };
const reduire = (S, n = 120) => { if (S.length <= n) return S.map(([t, v]) => [Math.round(t / 1000), +v.toPrecision(6)]); const pas = (S.length - 1) / (n - 1); return Array.from({ length: n }, (_, i) => S[Math.round(i * pas)]).map(([t, v]) => [Math.round(t / 1000), +v.toPrecision(6)]); };
const nf = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');

/* indicateur : S = série historique de l'indicateur lui-même ; le percentile est calculé dessus. */
function ind({ id, nom, type, sens, S, fmt, source, aide, valeur = null, score = null, texte = null }) {
  const v = valeur != null ? valeur : S && S.length ? S[S.length - 1][1] : null, vals = S ? S.map(x => x[1]) : [], p = S ? percentile(vals, v) : null;
  const s = score != null ? score : scoreDepuisPercentile(p, sens);
  return { id, nom, type, sens, valeur: v, texte: texte || fmt(v), percentile: p, score: s, histo: S ? reduire(S) : [], source, aide, n: vals.length, depuis: S && S.length ? new Date(S[0][0]).toISOString().slice(0, 10) : null };
}
/* extension par rapport à la moyenne mobile 200 semaines, saisonnalité du mois, momentum 12 mois : communs */
const distanceMA = (W, n) => { const m = sma(W, n); return W.map(([t, v], i) => (m[i] ? [t, (v / m[i] - 1) * 100] : null)).filter(Boolean); };
const momentum = (W, n = 52) => W.map(([t, v], i) => (i >= n ? [t, (v / W[i - n][1] - 1) * 100] : null)).filter(Boolean);
function saisonnalite(M, mois = new Date().getUTCMonth()) {
  const par = Array.from({ length: 12 }, () => []); for (let i = 1; i < M.length; i++) par[new Date(M[i][0]).getUTCMonth()].push((M[i][1] / M[i - 1][1] - 1) * 100);
  const moy = par.map(L => (L.length ? L.reduce((s, x) => s + x, 0) / L.length : null)); if (moy[mois] == null || par[mois].length < 5) return null;
  const hausse = par[mois].filter(x => x > 0).length / par[mois].length; return { moyenne: moy[mois], hausse, n: par[mois].length, p: percentile(moy.filter(x => x != null), moy[mois]), toutes: moy };
}
const NOM_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function indSaison(M, id = 'saison') {
  const s = saisonnalite(M); if (!s) throw new Error('historique trop court'); const mois = NOM_MOIS[new Date().getUTCMonth()], score = Math.max(-1, Math.min(1, ((s.p == null ? 50 : s.p) - 50) / 50 * 0.8));
  return { id, nom: `Saisonnalité de ${mois}`, type: 'saison', sens: 'bon_si_haut', valeur: s.moyenne, texte: `${s.moyenne >= 0 ? '+' : '−'}${nf(Math.abs(s.moyenne))} % en moyenne en ${mois}, en hausse ${Math.round(s.hausse * 100)} % des ${s.n} années`, percentile: s.p, score, histo: s.toutes.map((v, i) => (v == null ? null : [i + 1, +v.toFixed(2)])).filter(Boolean), source: 'Calcul sur les clôtures mensuelles (Yahoo Finance)', aide: 'Rendement moyen du mois courant sur tout l’historique, classé parmi les 12 mois. Indicatif : la saisonnalité est faible et instable.', n: s.n, depuis: null, histoMois: true };
}
/* COT : indice 0–100 sur 3 ans des positions nettes des spéculateurs ; contrarien (extrême long = foule) */
function indCot(serie, nom, source) {
  const net = serie.map(x => [Date.parse(x.date), x.spec.net]).filter(x => Number.isFinite(x[0]) && Number.isFinite(x[1])); if (net.length < 60) throw new Error('COT trop court');
  const fen = net.slice(-156), v = net[net.length - 1][1], lo = Math.min(...fen.map(x => x[1])), hi = Math.max(...fen.map(x => x[1])), idx = hi > lo ? (v - lo) / (hi - lo) * 100 : 50;
  const S = net.map(([t], i) => { const f = net.slice(Math.max(0, i - 155), i + 1).map(x => x[1]), a = Math.min(...f), b = Math.max(...f); return [t, b > a ? (net[i][1] - a) / (b - a) * 100 : 50]; });
  return { id: 'cot', nom: 'Positionnement des spéculateurs (COT)', type: 'sentiment', sens: 'cher_si_haut', valeur: idx, texte: `indice ${Math.round(idx)} / 100 (${idx >= 80 ? 'foule acheteuse, risque de retournement' : idx <= 20 ? 'foule vendeuse, rebond possible' : 'pas d’extrême'})`, percentile: percentile(S.map(x => x[1]), idx), score: Math.max(-1, Math.min(1, (50 - idx) / 50 * 0.8)), histo: reduire(S), source, aide: 'Positions nettes des fonds spéculatifs (CFTC), normalisées sur 3 ans. Lecture contrarienne aux extrêmes.', n: S.length, depuis: new Date(S[0][0]).toISOString().slice(0, 10) };
}

/* ───── actifs ───── */
const absentes = [], dispo = [];
async function essayer(actif, nom, f, liste) { try { const r = await f(); if (r) liste.push(...[].concat(r)); dispo.push(actif + ' · ' + nom); } catch (e) { absentes.push({ actif, indicateur: nom, raison: String(e.message).slice(0, 140) }); } }
const cotBranche = async code => (await get(`https://raw.githubusercontent.com/${DEPOT}/donnees/cot-${code}.json`)).serie;

async function construire() {
  const R = {}; const t0 = Date.now();
  /* données communes */
  const [DFII, CPI, GDP, EQ, SPX, DXYs] = await Promise.all([fred('DFII10').catch(() => null), fred('CPIAUCSL').catch(() => null), fred('GDP').catch(() => null), fred('NCBEILQ027S').catch(() => null), yahoo('^GSPC', 'max', '1wk').catch(() => null), yahoo('DX-Y.NYB', 'max', '1wk').catch(() => null)]);
  const realRateMensuel = DFII ? mensuel(DFII) : null;

  /* ─ S&P 500 et Nasdaq 100 ─ */
  for (const [id, nom, xtb, sym, fredId] of [['us500', 'S&P 500', 'US500', '^GSPC', null], ['us100', 'Nasdaq 100', 'US100', '^NDX', null]]) {
    const L = []; let W; try { W = await yahoo(sym, 'max', '1wk'); } catch (e) { absentes.push({ actif: id, indicateur: 'Prix', raison: e.message }); continue; }
    const M = mensuel(W);
    if (id === 'us500') {
      let PE = null, CAPE = null; try { PE = await multpl('s-p-500-pe-ratio'); } catch (e) { absentes.push({ actif: id, indicateur: 'PER glissant', raison: e.message }); } try { CAPE = await multpl('shiller-pe'); } catch (e) { absentes.push({ actif: id, indicateur: 'CAPE', raison: e.message }); }
      if (PE) { dispo.push(id + ' · PER'); L.push(ind({ id: 'per', nom: 'PER glissant (bénéfices des 12 derniers mois)', type: 'valeur', sens: 'cher_si_haut', S: PE, fmt: v => nf(v) + ' ×', source: 'multpl.com (S&P 500)', aide: 'Prix de l’indice divisé par les bénéfices des 12 derniers mois, comparé à tout son historique (depuis 1871). Le PER prévisionnel n’a pas de source gratuite fiable : non utilisé.' })); }
      if (CAPE) { dispo.push(id + ' · CAPE'); L.push(ind({ id: 'cape', nom: 'CAPE de Shiller (bénéfices lissés sur 10 ans, corrigés de l’inflation)', type: 'valeur', sens: 'cher_si_haut', S: CAPE, fmt: v => nf(v) + ' ×', source: 'multpl.com (Shiller)', aide: 'Valorisation lissée du cycle : très au-dessus de sa médiane, les rendements des 10 ans suivants ont été plus faibles en moyenne.' })); }
      if (PE && realRateMensuel) { const S = joindre(PE, realRateMensuel, (pe, r) => 100 / pe - r); if (S.length > 60) { dispo.push(id + ' · prime de risque'); L.push(ind({ id: 'prime', nom: 'Rendement des bénéfices − taux réel US 10 ans (prime de risque)', type: 'valeur', sens: 'bon_si_haut', S, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v)) + ' points', source: 'multpl.com + FRED DFII10', aide: 'Rendement des bénéfices (100 / PER) moins le taux d’intérêt réel : plus il est bas, moins les actions rémunèrent le risque pris.' })); } }
    } else absentes.push({ actif: id, indicateur: 'PER, CAPE, prime de risque', raison: 'aucune source gratuite fiable du PER du Nasdaq 100 : indicateurs retirés (les mesures du S&P 500 ne sont pas reprises : elles ne décrivent pas l’indice)' });
    if (EQ && GDP) { const S = joindre(EQ, GDP, (e, g) => e / (g * 1000) * 100, 100 * 86400e3); if (S.length > 40) { dispo.push(id + ' · Buffett'); L.push(ind({ id: 'buffett', nom: 'Indicateur Buffett (actions américaines / PIB)', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 0) + ' % du PIB', source: 'FRED (NCBEILQ027S, GDP)', aide: 'Capitalisation des sociétés non financières américaines (comptes financiers de la Fed) rapportée au PIB, comparée à son historique depuis 1945. Mesure du marché américain entier, trimestrielle.' })); } } else absentes.push({ actif: id, indicateur: 'Indicateur Buffett', raison: 'FRED indisponible' });
    const D = distanceMA(W, 200); if (D.length > 60) L.push(ind({ id: 'ma200w', nom: 'Écart à la moyenne mobile 200 semaines', type: 'valeur', sens: 'cher_si_haut', S: D, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v)) + ' %', source: 'Yahoo Finance (' + sym + ')', aide: 'Distance du cours à sa moyenne mobile de 200 semaines (≈ 4 ans) : très au-dessus = étiré.' }));
    const MO = momentum(W); if (MO.length > 60) L.push(ind({ id: 'mom12', nom: 'Momentum 12 mois', type: 'tendance', sens: 'bon_si_haut', S: MO, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v)) + ' %', source: 'Yahoo Finance (' + sym + ')', aide: 'Variation sur 12 mois : la tendance persiste souvent à court et moyen terme.' }));
    try { L.push(indSaison(M)); } catch (e) { absentes.push({ actif: id, indicateur: 'Saisonnalité', raison: e.message }); }
    R[id] = { nom, xtb, verifieXtb: false, prix: dernier(W), tPrix: W[W.length - 1][0], devise: 'USD', indicateurs: L };
  }

  /* ─ Or ─ */
  { const L = []; let W; try { W = await yahoo('GC=F', 'max', '1wk'); } catch (e) { absentes.push({ actif: 'or', indicateur: 'Prix', raison: e.message }); W = null; }
    if (W) {
      if (DFII) { dispo.push('or · taux réels'); L.push(ind({ id: 'tips', nom: 'Taux réel US 10 ans (TIPS)', type: 'macro', sens: 'cher_si_haut', S: DFII.filter((_, i) => i % 5 === 0), fmt: v => nf(v, 2) + ' %', source: 'FRED DFII10', aide: 'Taux d’intérêt réel : quand il monte, l’or (qui ne rapporte rien) devient moins attractif. Ici « haut » = défavorable à l’or.' })); } else absentes.push({ actif: 'or', indicateur: 'Taux réels', raison: 'FRED indisponible' });
      if (DXYs) { dispo.push('or · dollar'); L.push(ind({ id: 'dxy', nom: 'Dollar (indice DXY)', type: 'macro', sens: 'cher_si_haut', S: DXYs, fmt: v => nf(v, 1), source: 'Yahoo Finance DX-Y.NYB', aide: 'Un dollar fort pèse en général sur l’or. « Haut » = défavorable.' })); } else absentes.push({ actif: 'or', indicateur: 'Dollar', raison: 'Yahoo indisponible' });
      await essayer('or', 'Ratio or / argent', async () => { const A = await yahoo('SI=F', 'max', '1wk'), S = joindre(W, A, (o, a) => o / a, 5 * 86400e3); if (S.length < 100) throw new Error('trop court'); return ind({ id: 'orarg', nom: 'Ratio or / argent', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 1) + ' ×', source: 'Yahoo Finance GC=F / SI=F', aide: 'Nombre d’onces d’argent pour une once d’or : haut = or cher par rapport à l’argent.' }); }, L);
      if (SPX) { const S = joindre(W, SPX, (o, s) => o / s * 1000, 5 * 86400e3); if (S.length > 100) { dispo.push('or · or/S&P'); L.push(ind({ id: 'orspx', nom: 'Ratio or / S&P 500', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 0), source: 'Yahoo Finance GC=F / ^GSPC', aide: 'Prix de l’or rapporté à l’indice actions (×1000) : haut = or cher par rapport aux actions.' })); } }
      { const m = sma(W, 200), Z = W.map(([t, v], i) => { if (!m[i] || i < 200) return null; const f = W.slice(i - 199, i + 1).map(x => x[1]), mu = m[i], sd = Math.sqrt(f.reduce((s, x) => s + (x - mu) ** 2, 0) / f.length); return sd > 0 ? [t, (v - mu) / sd] : null; }).filter(Boolean); if (Z.length > 60) L.push(ind({ id: 'z200w', nom: 'Écart à la moyenne 200 semaines (z-score)', type: 'valeur', sens: 'cher_si_haut', S: Z, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v)) + ' écart-type', source: 'Yahoo Finance GC=F', aide: 'Distance à la moyenne de 200 semaines, en écarts-types : au-dessus de +2 = étiré.' })); }
      await essayer('or', 'COT', async () => indCot(await cotBranche('OR'), 'COT', 'CFTC via la branche donnees de Rayle'), L);
      try { L.push(indSaison(mensuel(W))); } catch (e) { absentes.push({ actif: 'or', indicateur: 'Saisonnalité', raison: e.message }); }
      R.or = { nom: 'Or (XAU/USD)', xtb: 'GOLD', verifieXtb: true, prix: dernier(W), tPrix: W[W.length - 1][0], devise: 'USD', indicateurs: L };
    } }

  /* ─ Pétrole (WTI et Brent) ─ */
  { const L = []; let WTI = null, BRT = null; try { WTI = await fred('DCOILWTICO'); } catch (e) { absentes.push({ actif: 'petrole', indicateur: 'Prix WTI', raison: e.message }); } try { BRT = await fred('DCOILBRENTEU'); } catch (e) { /* Brent facultatif */ }
    if (WTI && CPI) {
      const cm = CPI, last = cm[cm.length - 1][1], M = mensuel(WTI), reel = M.map(([t, v]) => { let c = cm[0][1]; for (let i = cm.length - 1; i >= 0; i--) if (cm[i][0] <= t) { c = cm[i][1]; break; } return [t, v * last / c]; }), moy = reel.reduce((s, x) => s + x[1], 0) / reel.length, ecartS = reel.map(([t, v]) => [t, (v / moy - 1) * 100]);
      dispo.push('petrole · prix réel'); L.push(ind({ id: 'reel', nom: 'Prix du WTI corrigé de l’inflation, écart à sa moyenne depuis 1986', type: 'valeur', sens: 'cher_si_haut', S: ecartS, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' % (moyenne ' + nf(moy, 0) + ' $ d’aujourd’hui)', source: 'FRED DCOILWTICO + CPIAUCSL', aide: 'Prix du baril en dollars constants comparé à sa moyenne de longue période : très au-dessus = cher.' }));
      try { L.push(indSaison(M)); } catch (e) { absentes.push({ actif: 'petrole', indicateur: 'Saisonnalité', raison: e.message }); }
    } else absentes.push({ actif: 'petrole', indicateur: 'Prix réel', raison: 'FRED indisponible' });
    await essayer('petrole', 'COT', async () => { const u = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$where=' + encodeURIComponent("cftc_contract_market_code='067651'") + '&$limit=170&$order=' + encodeURIComponent('report_date_as_yyyy_mm_dd DESC'), J = await get(u); const serie = J.map(x => ({ date: x.report_date_as_yyyy_mm_dd.slice(0, 10), spec: { net: +x.m_money_positions_long_all - +x.m_money_positions_short_all } })).reverse(); return indCot(serie, 'COT', 'CFTC (open data, WTI NYMEX, fonds spéculatifs)'); }, L);
    await essayer('petrole', 'Structure de la courbe', async () => { const d = new Date(), a = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), 1)), code = 'FGHJKMNQUVXZ'[a.getUTCMonth()] + String(a.getUTCFullYear()).slice(2), F = await yahoo('CL=F', '5d', '1d'), B = await yahoo('CL' + code + '.NYM', '5d', '1d'), pct = (dernier(B) / dernier(F) - 1) * 100; return { id: 'courbe', nom: 'Courbe des futures (contrat à 12 mois contre le premier)', type: 'macro', sens: 'cher_si_haut', valeur: pct, texte: `${pct >= 0 ? 'contango' : 'backwardation'} de ${nf(Math.abs(pct))} % sur 12 mois`, percentile: null, score: Math.max(-1, Math.min(1, -pct / 8)), histo: [], source: 'Yahoo Finance CL=F et CL' + code + '.NYM', aide: 'Backwardation (contrat lointain moins cher) = marché physique tendu, plutôt favorable. Contango = marché approvisionné. Pas d’historique : score par règle (±8 % = maximum).', n: 1, depuis: null }; }, L);
    absentes.push({ actif: 'petrole', indicateur: 'Stocks de brut américains', raison: 'la série EIA n’est pas dans FRED ; l’API de l’EIA demande une clé gratuite (eia.gov/opendata) : à créer pour activer cet indicateur' });
    /* v7 : le prix affiché est celui du contrat à terme le plus proche (comme le CFD XTB), pas la dernière valeur FRED (au comptant, publiée avec plusieurs jours de retard) ; FRED reste la base des indicateurs */
    const [CLF, BZF] = await Promise.all([yahoo('CL=F', '5d', '1d').catch(() => null), yahoo('BZ=F', '5d', '1d').catch(() => null)]);
    if (WTI) R.petrole = { nom: 'Pétrole (WTI et Brent)', xtb: 'OIL.WTI / OIL', verifieXtb: false, prix: CLF && CLF.length ? dernier(CLF) : dernier(WTI), tPrix: CLF && CLF.length ? CLF[CLF.length - 1][0] : WTI[WTI.length - 1][0], prixSource: CLF && CLF.length ? 'contrat à terme WTI (Yahoo CL=F)' : 'WTI au comptant (FRED, différé de plusieurs jours)', prixBrent: BZF && BZF.length ? dernier(BZF) : BRT ? dernier(BRT) : null, devise: 'USD', indicateurs: L };
  }

  /* ─ Bitcoin ─ */
  { const L = []; let W = null; try { W = await yahoo('BTC-USD', 'max', '1wk'); } catch (e) { absentes.push({ actif: 'btc', indicateur: 'Prix', raison: e.message }); }
    if (W) {
      const D = await yahoo('BTC-USD', '2y', '1d').catch(() => null), m200 = D ? sma(D, 200) : null;
      if (D && m200[m200.length - 1]) { const S = D.map(([t, v], i) => (m200[i] ? [t, v / m200[i]] : null)).filter(Boolean); L.push(ind({ id: 'mayer', nom: 'Multiple de Mayer (prix / moyenne 200 jours)', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 2), source: 'Yahoo Finance BTC-USD', aide: 'Au-dessus de 2,4 historiquement surchauffé ; sous 1 = décote par rapport à la tendance.' })); dispo.push('btc · Mayer'); }
      const DW = distanceMA(W, 200); if (DW.length > 40) L.push(ind({ id: 'ma200w', nom: 'Écart à la moyenne mobile 200 semaines', type: 'valeur', sens: 'cher_si_haut', S: DW, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' %', source: 'Yahoo Finance BTC-USD', aide: 'La moyenne de 200 semaines a servi de plancher des fonds de cycle.' }));
      const MO = momentum(W); if (MO.length > 60) L.push(ind({ id: 'mom12', nom: 'Momentum 12 mois', type: 'tendance', sens: 'bon_si_haut', S: MO, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' %', source: 'Yahoo Finance BTC-USD', aide: 'Variation sur 12 mois.' }));
      let CM = null; await essayer('btc', 'MVRV et prix réalisé', async () => { const j = await get('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,PriceUSD&frequency=1d&start_time=2011-01-01&page_size=10000'); CM = j.data.map(x => [Date.parse(x.time), parseFloat(x.CapMVRVCur), parseFloat(x.PriceUSD)]).filter(x => Number.isFinite(x[1]) && Number.isFinite(x[2]) && x[1] > 0); if (CM.length < 1000) throw new Error('série trop courte'); const S = CM.map(x => [x[0], x[1]]), last = CM[CM.length - 1], realise = last[2] / last[1]; const o = ind({ id: 'mvrv', nom: 'MVRV (valeur de marché / valeur réalisée)', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 2), source: 'Coin Metrics (API communautaire)', aide: 'Compare le prix au prix moyen auquel les pièces ont été déplacées pour la dernière fois (prix réalisé). Au-dessus de 3,5 : sommets historiques ; sous 1 : prix sous le coût moyen, creux de cycle.' }); o.texte = `${nf(last[1], 2)} (prix réalisé ≈ ${nf(realise, 0)} $)`; return o; }, L);
      await essayer('btc', 'Financement des perpétuels', async () => { let H; try { H = (await get('https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100')).data.map(x => [+x.fundingTime, +x.fundingRate * 100]); } catch (e) { H = (await get('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200')).result.list.map(x => [+x.fundingRateTimestamp, +x.fundingRate * 100]); } H.sort((a, b) => a[0] - b[0]); if (H.length < 20) throw new Error('trop peu de relevés'); const moy7 = H.slice(-21).reduce((s, x) => s + x[1], 0) / Math.min(21, H.length), an = moy7 * 3 * 365, sc = Math.max(-1, Math.min(1, -(moy7 - 0.01) / 0.03)); return { id: 'financement', nom: 'Financement des perpétuels (moyenne 7 jours)', type: 'sentiment', sens: 'cher_si_haut', valeur: moy7, texte: `${nf(moy7, 4)} % par 8 h (≈ ${nf(an, 0)} % par an) : ${moy7 > 0.03 ? 'acheteurs à levier nombreux, risque de purge' : moy7 < 0 ? 'vendeurs dominants, carburant de rebond' : 'équilibré'}`, percentile: percentile(H.map(x => x[1]), moy7), score: sc, histo: reduire(H.map(x => [x[0], x[1]])), source: 'OKX (repli Bybit)', aide: 'Taux payé entre acheteurs et vendeurs de contrats perpétuels. Fortement positif = marché suracheté à levier.', n: H.length, depuis: new Date(H[0][0]).toISOString().slice(0, 10) }; }, L);
      await essayer('btc', 'COT', async () => indCot(await cotBranche('BTC'), 'COT', 'CFTC via la branche donnees de Rayle (contrat CME Bitcoin)'), L);
      try {
        const base = CM ? mensuel(CM.map(x => [x[0], x[2]])) : mensuel(W), HALV = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11)], dep = Date.UTC(2024, 3, 20), mois = Math.round((Date.now() - dep) / (30.44 * 86400e3));
        const at = (t) => { let k = null; for (const [x, v] of base) { if (x <= t) k = v; else break; } return k; }, rets = []; for (const h of HALV) { const a = at(h + mois * 30.44 * 86400e3), b = at(h + (mois + 6) * 30.44 * 86400e3); if (a && b && h + (mois + 6) * 30.44 * 86400e3 < Date.now()) rets.push((b / a - 1) * 100); }
        if (rets.length < 2) throw new Error('moins de 2 cycles comparables'); const moy = rets.reduce((s, x) => s + x, 0) / rets.length, sc = Math.max(-1, Math.min(1, moy / 80));
        L.push({ id: 'cycle', nom: 'Saisonnalité par cycle (6 mois qui suivent, même mois depuis le halving)', type: 'saison', sens: 'bon_si_haut', valeur: moy, texte: `mois ${mois} depuis le halving : ${rets.length} cycles passés, rendement moyen des 6 mois suivants ${moy >= 0 ? '+' : '−'}${nf(Math.abs(moy), 0)} % (${rets.map(r => (r >= 0 ? '+' : '−') + nf(Math.abs(r), 0) + ' %').join(', ')})`, percentile: null, score: sc, histo: [], source: 'Coin Metrics / Yahoo Finance, halvings 2012, 2016, 2020, 2024', aide: 'Trois cycles seulement : très peu de preuves statistiques, à prendre comme une curiosité.', n: rets.length, depuis: null }); dispo.push('btc · cycle');
      } catch (e) { absentes.push({ actif: 'btc', indicateur: 'Saisonnalité par cycle', raison: e.message }); }
      R.btc = { nom: 'Bitcoin', xtb: 'BITCOIN', verifieXtb: true, prix: dernier(W), tPrix: W[W.length - 1][0], devise: 'USD', indicateurs: L };
    } }

  /* ─ Solana ─ */
  { const L = []; let W = null; try { W = await yahoo('SOL-USD', 'max', '1wk'); } catch (e) { absentes.push({ actif: 'sol', indicateur: 'Prix', raison: e.message }); }
    if (W) {
      const D = await yahoo('SOL-USD', 'max', '1d').catch(() => null), m200 = D ? sma(D, 200) : null;
      if (D && m200[m200.length - 1]) { const S = D.map(([t, v], i) => (m200[i] ? [t, v / m200[i]] : null)).filter(Boolean); L.push(ind({ id: 'mayer', nom: 'Multiple de Mayer (prix / moyenne 200 jours)', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 2), source: 'Yahoo Finance SOL-USD', aide: 'Au-dessus de 2 : tendance très étirée ; sous 1 : décote par rapport à la moyenne.' })); }
      const DW = distanceMA(W, 200); if (DW.length > 30) L.push(ind({ id: 'ma200w', nom: 'Écart à la moyenne mobile 200 semaines', type: 'valeur', sens: 'cher_si_haut', S: DW, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' %', source: 'Yahoo Finance SOL-USD', aide: 'Historique court (Solana existe depuis 2020) : percentile peu robuste.' }));
      await essayer('sol', 'SOL / BTC', async () => { const B = await yahoo('BTC-USD', 'max', '1wk'), S = joindre(W, B, (s, b) => s / b * 1000, 5 * 86400e3); if (S.length < 100) throw new Error('trop court'); return ind({ id: 'solbtc', nom: 'Ratio SOL / BTC (×1000)', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 2), source: 'Yahoo Finance SOL-USD / BTC-USD', aide: 'Force de Solana par rapport au Bitcoin : haut = Solana déjà chère face au BTC.' }); }, L);
      await essayer('sol', 'Capitalisation / revenus du réseau', async () => { const [fees, cg] = await Promise.all([get('https://api.llama.fi/summary/fees/solana?dataType=dailyFees'), get('https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=365&interval=daily')]); const F = (fees.totalDataChart || []).map(x => [x[0] * 1000, +x[1]]), cap = cg.market_caps.map(x => [x[0], x[1]]); if (F.length < 120 || cap.length < 120) throw new Error('données insuffisantes'); const S = []; for (const [t, c] of cap) { const f = F.filter(x => x[0] <= t && x[0] > t - 30 * 86400e3); if (f.length >= 20) { const an = f.reduce((s, x) => s + x[1], 0) / f.length * 365; if (an > 0) S.push([t, c / an]); } } if (S.length < 60) throw new Error('série trop courte'); return ind({ id: 'capfrais', nom: 'Capitalisation / frais annualisés du réseau', type: 'valeur', sens: 'cher_si_haut', S, fmt: v => nf(v, 0) + ' ×', source: 'DefiLlama (frais) + CoinGecko (capitalisation, 1 an)', aide: 'Équivalent d’un PER pour un réseau : valeur de marché divisée par les frais payés par les utilisateurs (30 jours annualisés). Percentile calculé sur 1 an seulement.' }); }, L);
      await essayer('sol', 'TVL', async () => { const T = (await get('https://api.llama.fi/v2/historicalChainTvl/Solana')).map(x => [x.date * 1000, x.tvl]).filter(x => x[1] > 0); if (T.length < 200) throw new Error('trop court'); const S = T.map(([t, v], i) => (i >= 90 ? [t, (v / T[i - 90][1] - 1) * 100] : null)).filter(Boolean); return ind({ id: 'tvl', nom: 'Évolution de la TVL sur 90 jours', type: 'tendance', sens: 'bon_si_haut', S, fmt: v => (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' %', source: 'DefiLlama (TVL de Solana)', aide: 'Valeur déposée dans les applications de finance décentralisée sur Solana : en hausse = activité en croissance.' }); }, L);
      await essayer('sol', 'COT', async () => indCot(await cotBranche('SOL'), 'COT', 'CFTC via la branche donnees de Rayle'), L);
      try { L.push(indSaison(mensuel(W))); } catch (e) { absentes.push({ actif: 'sol', indicateur: 'Saisonnalité', raison: e.message }); }
      R.sol = { nom: 'Solana', xtb: 'SOLANA', verifieXtb: false, prix: dernier(W), tPrix: W[W.length - 1][0], devise: 'USD', indicateurs: L };
    } }
  return { R, ms: Date.now() - t0 };
}

const { R, ms } = await construire();
for (const a of Object.values(R)) { a.indicateurs = a.indicateurs.filter(x => x && x.valeur != null); a.verdicts = Object.fromEntries(Object.entries(verdictsActif(a.indicateurs)).map(([k, v]) => [k, { score100: v.score100, libelle: v.libelle, confiance: v.confiance }])); }
const sortieJson = { t: Date.now(), version: 1, duree: ms, actifs: R, dispo, absentes };
fs.mkdirSync(sortie, { recursive: true }); fs.writeFileSync(path.join(sortie, 'mes-actifs.json'), JSON.stringify(sortieJson));
/* petit fichier d'état lu par la page « État des données » (le gros fichier fait ~90 Ko) */
fs.writeFileSync(path.join(sortie, 'mes-actifs-etat.json'), JSON.stringify({ t: sortieJson.t, actifs: Object.keys(R).length, indicateurs: dispo.length, absentes: absentes.length }));
console.log(`mes-actifs.json : ${Object.keys(R).length} actifs, ${dispo.length} indicateurs disponibles, ${absentes.length} absents, ${(JSON.stringify(sortieJson).length / 1024).toFixed(0)} Ko, ${(ms / 1000).toFixed(0)} s`);
for (const [k, a] of Object.entries(R)) console.log(' ', k, a.xtb, Math.round(a.prix * 100) / 100, a.indicateurs.map(i => i.id + ':' + (i.percentile ?? '-')).join(' '), '|', Object.values(a.verdicts).map(v => v.libelle + ' ' + v.confiance + '%').join(' / '));
for (const x of absentes) console.log('  absent :', x.actif, x.indicateur, '—', x.raison);
