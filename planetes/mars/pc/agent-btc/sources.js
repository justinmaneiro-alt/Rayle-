/* ═════════════ SOURCES DE BOUGIES BITCOIN (M3a ; module pur, testé : planetes/mars/tests/agent-donnees-test.mjs) ═════════════
   Sonde réelle du 2026-10-21 depuis le PC (voir docs/sources-btc.json et docs/agent-btc.md) : Binance (data-api.binance.vision, CORS ouvert, 1000 bougies par requête, historique profond,
   ET volume acheteur « taker » : le delta est RÉEL) ; secours Bitstamp (BTC/USD réel, CORS ouvert, 1000 par requête, historique profond, sans séparation acheteur/vendeur : delta ESTIMÉ).
   Les autres (Kraken 721 bougies max, Coinbase 300, OKX 100 à 300, Bybit, Bitfinex sans CORS, Gemini) sont trop courtes ou fermées au navigateur pour un historique de plusieurs années.
   Une bougie : { t (ouverture, ms), o, h, l, c, v (volume en bitcoins), vb (volume acheteur agressif en bitcoins, NaN si la source ne le fournit pas) }. */
export const PAS_M15 = 900e3;

export const SOURCES = {
  binance: {
    id: 'binance', nom: 'Binance', symbole: 'BTCUSDT', paire: 'BTC/USDT', deltaReel: true, limite: 1000, pauseMs: 150,
    url: (t0, limite) => 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=' + limite + '&startTime=' + t0,
    analyser: j => { if (!Array.isArray(j)) throw new Error('réponse Binance inattendue'); return j.map(k => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], vb: k.length >= 10 ? +k[9] : NaN })); }
  },
  bitstamp: {
    id: 'bitstamp', nom: 'Bitstamp', symbole: 'btcusd', paire: 'BTC/USD', deltaReel: false, limite: 1000, pauseMs: 250,
    url: (t0, limite) => 'https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=900&limit=' + limite + '&start=' + Math.floor(t0 / 1000),
    analyser: j => { const l = j && j.data && j.data.ohlc; if (!Array.isArray(l)) throw new Error('réponse Bitstamp inattendue'); return l.map(k => ({ t: +k.timestamp * 1000, o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +k.volume, vb: NaN })); }
  }
};
export const ORDRE_SOURCES = ['binance', 'bitstamp'];

/* Une bougie est valide si tous ses nombres sont finis, positifs, et si bas ≤ ouverture, clôture ≤ haut. */
export const bougieValide = b => b && Number.isFinite(b.t) && [b.o, b.h, b.l, b.c].every(x => Number.isFinite(x) && x > 0) && b.h >= Math.max(b.o, b.c) - 1e-9 && b.l <= Math.min(b.o, b.c) + 1e-9 && Number.isFinite(b.v) && b.v >= 0;
export const alignerM15 = t => Math.floor(t / PAS_M15) * PAS_M15;

/* Télécharge les bougies M15 de [t0, t1[ (ms), page par page, sans doublon, triées. `lire(url)` rend le JSON (injecté : navigateur, Node ou test). `surPage({ bougies, fin })` rend le progrès.
   Une page vide avant t1 = la source n'a plus rien (ou fin de l'historique disponible) : on s'arrête. Erreur réseau : 2 nouvelles tentatives, puis l'erreur remonte (l'appelant bascule sur le secours). */
export async function telechargerPlage(source, lire, t0, t1, { surPage = () => {}, pause = ms => new Promise(r => setTimeout(r, ms)), arret = () => false } = {}) {
  const src = typeof source === 'string' ? SOURCES[source] : source, out = new Map();
  let curseur = alignerM15(t0), pages = 0;
  while (curseur < t1 && !arret()) {
    let page = null, derniere = null;
    for (let essai = 0; essai < 3; essai++) {
      try { page = src.analyser(await lire(src.url(curseur, src.limite))); break; }
      catch (e) { derniere = e; if (essai < 2) await pause(400 * (essai + 1)); }
    }
    if (!page) throw derniere || new Error('source indisponible');
    pages++;
    const valides = page.filter(bougieValide).filter(b => b.t >= curseur && b.t < t1);
    for (const b of valides) out.set(b.t, b);
    if (!page.length) break;
    const dernier = Math.max(...page.map(b => b.t));
    if (dernier < curseur) break;                       // la source ne progresse plus
    curseur = dernier + PAS_M15; surPage({ bougies: out.size, fin: dernier, pages });
    if (page.length < Math.min(src.limite, 50)) break; // dernière page (courte)
    await pause(src.pauseMs);
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}
