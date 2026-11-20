/* ═════════════ MODE VOLUME : FLUX EN DIRECT (Binance et Kraken, WebSocket publics, sans clé) — v4 ═════════════
   Analyseurs PURS (testés) + petits dépôts en mémoire + connexion WebSocket avec reconnexion. Aucun ordre n'est jamais envoyé : lecture seule.
   Binance (perpétuels) : transactions agrégées (aggTrade : côté de l'AGRESSEUR), carnet 20 niveaux toutes les 100 ms, bougie en cours (kline : volume et volume acheteur).
   Kraken Futures : transactions (feed « trade » : côté), carnet (« book_snapshot » puis « book » par niveau).
   Un côté « m: true » (maker = acheteur) signifie que l'agresseur est le VENDEUR (convention Binance). */
export const BINANCE_WS = 'wss://fstream.binance.com/stream?streams=';   // ancienne adresse unique : ne livre plus les transactions (aggTrade) ni les bougies (constaté le 20/11/2026), seulement le carnet
export const BINANCE_WS_MARCHE = 'wss://fstream.binance.com/market/stream?streams=';   // transactions agrégées et bougies
export const BINANCE_WS_PUBLIC = 'wss://fstream.binance.com/public/stream?streams=';   // carnet
export const KRAKEN_WS = 'wss://futures.kraken.com/ws/v1';
export const SYMBOLES_LIVE = Object.freeze({ or: { binance: 'xauusdt', kraken: 'PF_XAUUSD' }, btc: { binance: 'btcusdt', kraken: 'PF_XBTUSD' }, sol: { binance: 'solusdt', kraken: 'PF_SOLUSD' } });

/* ───── analyseurs ───── */
export function parseBinance(msg) {
  const d = msg && msg.data, s = msg && msg.stream; if (!d || !s) return null;
  if (d.e === 'aggTrade') return { type: 'trade', source: 'Binance', t: d.T, prix: +d.p, qte: +d.q, cote: d.m ? 'vente' : 'achat', id: d.a };
  if (/@depth/.test(s) && (d.b || d.bids)) { const b = (d.b || d.bids).map(x => [+x[0], +x[1]]).filter(x => x[1] > 0), a = (d.a || d.asks).map(x => [+x[0], +x[1]]).filter(x => x[1] > 0); return { type: 'carnet', source: 'Binance', t: d.T || d.E || Date.now(), bids: b.sort((x, y) => y[0] - x[0]), asks: a.sort((x, y) => x[0] - y[0]) }; }
  if (d.e === 'kline' && d.k) { const k = d.k; return { type: 'bougie', source: 'Binance', intervalle: k.i, bougie: { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, bv: +k.V }, close: !!k.x }; }
  return null;
}
/* Kraken : maintient un carnet complet à partir du snapshot puis des deltas */
export function creerCarnetKraken() {
  const bids = new Map(), asks = new Map();
  const vue = () => ({ bids: [...bids.entries()].sort((a, b) => b[0] - a[0]).slice(0, 25), asks: [...asks.entries()].sort((a, b) => a[0] - b[0]).slice(0, 25) });
  return {
    appliquer(m) {
      if (!m) return null;
      if (m.feed === 'book_snapshot') { bids.clear(); asks.clear(); for (const x of m.bids || []) if (x.qty > 0) bids.set(+x.price, +x.qty); for (const x of m.asks || []) if (x.qty > 0) asks.set(+x.price, +x.qty); return { type: 'carnet', source: 'Kraken', t: m.timestamp || Date.now(), ...vue() }; }
      if (m.feed === 'book') { const M = m.side === 'buy' ? bids : asks; if (+m.qty > 0) M.set(+m.price, +m.qty); else M.delete(+m.price); return { type: 'carnet', source: 'Kraken', t: m.timestamp || Date.now(), ...vue() }; }
      return null;
    }
  };
}
export function parseKrakenTrade(m) { return m && m.feed === 'trade' && m.price > 0 ? { type: 'trade', source: 'Kraken', t: m.time || Date.now(), prix: +m.price, qte: +m.qty, cote: m.side === 'sell' ? 'vente' : 'achat' } : null; }

/* ───── empreinte (footprint) : volume acheteur / vendeur par niveau de prix à l'intérieur de chaque bougie ───── */
export function creerEmpreinte({ pas = 1, max = 400 } = {}) {
  const bougies = new Map();   // tBougie → Map(niveau → { a, v })
  return {
    pas, ajouter(tBougie, prix, qte, cote) { let m = bougies.get(tBougie); if (!m) { m = new Map(); bougies.set(tBougie, m); if (bougies.size > max) bougies.delete(bougies.keys().next().value); } const n = Math.round(prix / pas) * pas, k = +n.toFixed(8); const e = m.get(k) || { a: 0, v: 0 }; if (cote === 'achat') e.a += qte; else e.v += qte; m.set(k, e); },
    niveaux(tBougie) { const m = bougies.get(tBougie); return m ? [...m.entries()].map(([p, e]) => ({ prix: p, achat: e.a, vente: e.v })).sort((a, b) => b.prix - a.prix) : []; },
    a(tBougie) { return bougies.has(tBougie); }, nBougies: () => bougies.size, effacer: () => bougies.clear()
  };
}
/* pas de niveau lisible pour une empreinte : ≈ 0,02 % du prix, arrondi à 1 / 2 / 5 × 10ⁿ */
export function pasEmpreinte(prix) { const brut = prix * 0.0002, e = Math.pow(10, Math.floor(Math.log10(brut))), r = brut / e; return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * e; }

/* ───── carte de chaleur de la liquidité : instantanés du carnet toutes les `ms`, derniers `max` gardés ───── */
export function creerChaleur({ ms = 10000, max = 1080 } = {}) {
  const L = []; let dernier = 0;
  return { ajouter(book, t = Date.now()) { if (!book || t - dernier < ms) return false; dernier = t; L.push({ t, bids: book.bids.slice(0, 25), asks: book.asks.slice(0, 25) }); if (L.length > max) L.shift(); return true; }, liste: () => L, vider() { L.length = 0; dernier = 0; } };
}

/* ───── gros flux : grosses transactions récentes ───── */
export function creerFlux({ max = 60, taillesMax = 600 } = {}) {
  const gros = [], tailles = [];
  return { ajouter(tr, seuilFn) { tailles.push(tr.qte); if (tailles.length > taillesMax) tailles.shift(); const s = seuilFn(tailles); if (tr.qte >= s) { gros.unshift({ ...tr, seuil: s }); if (gros.length > max) gros.pop(); return true; } return false; }, liste: () => gros, tailles: () => tailles };
}

/* ───── connexions ───── */
export function ouvrir(url, { surMessage, surEtat = () => {}, abonner = null, delaiMax = 15000, WS = globalThis.WebSocket } = {}) {
  let ws = null, ferme = false, essai = 0, minuteur = null;
  function connecter() {
    if (ferme || !WS) return; surEtat({ etat: essai ? 'reconnexion' : 'connexion' });
    try { ws = new WS(url); } catch (e) { surEtat({ etat: 'erreur', raison: String(e && e.message || e) }); planifier(); return; }
    ws.onopen = () => { essai = 0; surEtat({ etat: 'connecte' }); if (abonner) try { abonner(ws); } catch (e) { /* abonnement impossible */ } };
    ws.onmessage = ev => { try { surMessage(JSON.parse(ev.data)); } catch (e) { /* message illisible : ignoré */ } };
    ws.onerror = () => surEtat({ etat: 'erreur', raison: 'connexion refusée ou coupée' });
    ws.onclose = () => { if (!ferme) { surEtat({ etat: 'coupe' }); planifier(); } };
  }
  function planifier() { clearTimeout(minuteur); essai++; minuteur = setTimeout(connecter, Math.min(delaiMax, 1000 * Math.pow(1.7, essai))); }
  connecter();
  return { fermer() { ferme = true; clearTimeout(minuteur); try { ws && ws.close(); } catch (e) { /* déjà fermée */ } } };
}
export function urlBinance(actif, intervalle) { const s = SYMBOLES_LIVE[actif]; if (!s) return null; return BINANCE_WS + [`${s.binance}@aggTrade`, `${s.binance}@depth20@100ms`, `${s.binance}@kline_${intervalle}`].join('/'); }
export function abonnementKraken(actif) { const s = SYMBOLES_LIVE[actif]; return s ? [{ event: 'subscribe', feed: 'book', product_ids: [s.kraken] }, { event: 'subscribe', feed: 'trade', product_ids: [s.kraken] }] : []; }
/* adresses actuelles des perpétuels Binance : deux connexions (marché : transactions + bougie ; public : carnet) */
export function urlsBinance(actif, intervalle) { const s = SYMBOLES_LIVE[actif]; if (!s) return null; return { marche: BINANCE_WS_MARCHE + [`${s.binance}@aggTrade`, `${s.binance}@kline_${intervalle}`].join('/'), public: BINANCE_WS_PUBLIC + `${s.binance}@depth20@100ms` }; }
