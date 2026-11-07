/* ═════════════ BOUGIES DE L'OR (pur, testé) ═════════════
   Prix : Kraken Futures PF_XAUUSD (le perpétuel que Justin regarde). Volume et delta : Binance XAUUSDT (référence liquide, ~100 × Kraken).
   Format commun : { t (ms, ouverture), o, h, l, c, v, d? (delta = achats agresseurs − ventes agresseurs, Binance seulement) }. */
export function depuisKraken(json) {
  return (json && json.candles || []).map(x => ({ t: +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume }))
    .filter(b => Number.isFinite(b.t) && b.h >= b.l && b.c > 0).sort((a, b) => a.t - b.t);
}
export function depuisBinance(rows) {
  return (rows || []).map(r => { const v = +r[5], achat = +r[9]; return { t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v, d: achat - (v - achat), usd: +r[7] }; })
    .filter(b => Number.isFinite(b.t) && b.c > 0).sort((a, b) => a.t - b.t);
}
/* fusionne une liste dans une autre (même t = remplacée), triée */
export function fusionner(base, ajout) {
  const m = new Map(base.map(b => [b.t, b])); for (const b of ajout) m.set(b.t, b);
  return [...m.values()].sort((a, b) => a.t - b.t);
}
/* bougie en cours mise à jour par une transaction (prix p, quantité q, temps t) */
export function appliquerTransaction(bougies, periodeMs, tr) {
  if (!(tr.p > 0) || !tr.t) return bougies;
  const t0 = Math.floor(tr.t / periodeMs) * periodeMs, der = bougies[bougies.length - 1];
  if (der && der.t === t0) { der.h = Math.max(der.h, tr.p); der.l = Math.min(der.l, tr.p); der.c = tr.p; der.v += tr.q || 0; }
  else if (!der || t0 > der.t) bougies.push({ t: t0, o: der ? der.c : tr.p, h: Math.max(tr.p, der ? der.c : tr.p), l: Math.min(tr.p, der ? der.c : tr.p), c: tr.p, v: tr.q || 0 });
  return bougies;
}
/* regroupe des bougies fines en bougies plus longues (périodes alignées sur l'UTC) */
export function regrouperBougies(fines, periodeMs) {
  const o = []; let cur = null;
  for (const b of fines) {
    const t0 = Math.floor(b.t / periodeMs) * periodeMs;
    if (!cur || cur.t !== t0) { cur = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, d: b.d || 0 }; o.push(cur); }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; cur.d += b.d || 0; }
  }
  return o;
}
/* ATR de Wilder ; renvoie un tableau aligné (null avant n bougies) */
export function atr(b, n = 14) {
  const o = new Array(b.length).fill(null); let a = null, s = 0;
  for (let i = 1; i < b.length; i++) {
    const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    if (i <= n) { s += tr; if (i === n) { a = s / n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; }
  }
  return o;
}
export const derniereValeur = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
export function mediane(x) { const s = x.filter(Number.isFinite).slice().sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
/* ATR H1 valable à l'instant t (sans regarder le futur : dernière H1 CLOSE avant t) */
export function atrA(h1, atrH1, t) {
  let lo = 0, hi = h1.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (h1[m].t + 3600e3 <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  for (let i = k; i >= 0; i--) if (atrH1[i] != null) return atrH1[i];
  return null;
}
/* écart Kraken − Binance : médiane des écarts de clôture sur les bougies communes (les plus récentes) */
export function ecartMesure(kraken, binance, n = 48) {
  const m = new Map(binance.map(b => [b.t, b.c])), e = [];
  for (let i = kraken.length - 1; i >= 0 && e.length < n; i--) { const c = m.get(kraken[i].t); if (c) e.push(kraken[i].c - c); }
  return e.length >= 5 ? { ecart: mediane(e), n: e.length } : { ecart: null, n: e.length };
}
/* EMA simple (biais H1) */
export function ema(valeurs, n) { const k = 2 / (n + 1); let e = null; return valeurs.map(v => (e = e == null ? v : v * k + e * (1 - k))); }
/* biais H1 figé : clôture au-dessus des EMA 20 et 50 H1 et EMA 20 > EMA 50 = haussier ; l'inverse = baissier ; sinon neutre */
export function biaisH1(h1) {
  if (h1.length < 60) return { biais: 'inconnu', texte: 'pas assez de bougies H1' };
  const c = h1.map(b => b.c), e20 = ema(c, 20), e50 = ema(c, 50), i = c.length - 1;
  if (c[i] > e20[i] && e20[i] > e50[i]) return { biais: 'haussier', texte: 'clôture H1 au-dessus des moyennes 20 et 50, la 20 au-dessus de la 50' };
  if (c[i] < e20[i] && e20[i] < e50[i]) return { biais: 'baissier', texte: 'clôture H1 sous les moyennes 20 et 50, la 20 sous la 50' };
  return { biais: 'neutre', texte: 'moyennes H1 mêlées' };
}
/* moyenne mobile simple (MA200 H1 du journal) */
export function sma(valeurs, n) { const o = []; let s = 0; for (let i = 0; i < valeurs.length; i++) { s += valeurs[i]; if (i >= n) s -= valeurs[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; }
