/* ═════════════ CARNET KRAKEN EN DIRECT (WebSocket public de Kraken Futures, depuis le navigateur, sans clé) ═════════════
   Chaque actif affiche SON instrument (même symbole que l'agent : PF_XBTUSD, PF_ETHUSD, PF_HYPEUSD, PF_XAUUSD, PF_SPYXUSD, PF_QQQXUSD).
   • Profondeur : le flux « book » de Kraken Futures envoie le carnet COMPLET (tous les niveaux) puis chaque modification : c'est le maximum de l'API.
   • Intégrité : l'API Futures ne fournit PAS de checksum (seul le WebSocket spot v2 en a un) → contrôle par numéros de séquence : un trou = carnet
     faux → on se réabonne (jamais de carnet « réparé » à l'aveugle). Contrôle du symbole de chaque message (jamais deux carnets mélangés).
   • Reconnexion automatique (1 s → 15 s), relance si aucun message depuis 30 s.
   • Contrôle du prix : le milieu du carnet doit rester à moins de 0,1 % du prix de l'actif affiché ; sinon erreur claire, carnet masqué.
   Les fonctions de calcul sont pures (testées dans tests/front-test.mjs). */
export const URL_WS = 'wss://futures.kraken.com/ws/v1';
export const SEUIL_ECART = 0.001;   // 0,1 %

/* ── état du carnet (pur) ── */
export function carnetVide(symbole) { return { symbole, seq: null, bids: new Map(), asks: new Map(), tick: null, t: 0, pret: false }; }
export function appliquerInstantane(c, m) {
  c.bids = new Map(m.bids.map(x => [x.price, x.qty])); c.asks = new Map(m.asks.map(x => [x.price, x.qty]));
  c.seq = m.seq; c.tick = m.tickSize || c.tick; c.t = m.timestamp || Date.now(); c.pret = true; return true;
}
/* renvoie false si le message est d'un autre instrument ou s'il y a un trou de séquence (carnet à redemander) */
export function appliquerDelta(c, m) {
  if (m.product_id !== c.symbole || !c.pret) return false;
  if (c.seq != null && m.seq !== c.seq + 1) return false;
  const cote = m.side === 'buy' ? c.bids : c.asks;
  if (m.qty > 0) cote.set(m.price, m.qty); else cote.delete(m.price);
  c.seq = m.seq; c.t = m.timestamp || Date.now(); return true;
}
export function meilleurs(c) {
  let bid = -Infinity, ask = Infinity;
  for (const p of c.bids.keys()) if (p > bid) bid = p;
  for (const p of c.asks.keys()) if (p < ask) ask = p;
  return Number.isFinite(bid) && Number.isFinite(ask) ? { bid, ask, milieu: (bid + ask) / 2, spread: ask - bid } : null;
}
/* regroupement par pas de prix (acheteurs arrondis vers le bas, vendeurs vers le haut), cumul depuis le meilleur prix */
export function regrouper(c, pas) {
  const g = (m, bas) => { const o = new Map(); for (const [p, q] of m) { const k = Math.round((bas ? Math.floor(p / pas + 1e-9) : Math.ceil(p / pas - 1e-9)) * pas * 1e8) / 1e8; o.set(k, (o.get(k) || 0) + q); } return o; };
  const b = [...g(c.bids, true)].sort((x, y) => y[0] - x[0]), a = [...g(c.asks, false)].sort((x, y) => x[0] - y[0]);
  let s = 0; const bids = b.map(([p, q]) => [p, q, s += q]); s = 0; const asks = a.map(([p, q]) => [p, q, s += q]);
  return { bids, asks, pas };
}
/* déséquilibre acheteurs / vendeurs dans ± fenetre (0,5 % par défaut) autour du milieu : part des acheteurs (0–1) */
export function desequilibre(c, milieu, fenetre = 0.005) {
  let qb = 0, qa = 0;
  for (const [p, q] of c.bids) if (p >= milieu * (1 - fenetre)) qb += q;
  for (const [p, q] of c.asks) if (p <= milieu * (1 + fenetre)) qa += q;
  return qb + qa > 0 ? qb / (qb + qa) : null;
}
/* contrôle : milieu du carnet vs prix de l'actif affiché */
export function controlePrix(milieu, prix, seuil = SEUIL_ECART) {
  if (!(milieu > 0) || !(prix > 0)) return { ok: null, ecart: null };
  const ecart = Math.abs(milieu - prix) / prix; return { ok: ecart <= seuil, ecart };
}
/* pas de regroupement proposés : multiples du tick de l'instrument */
export function pasProposes(tick, prix) {
  const L = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].map(k => Math.round(k * tick * 1e8) / 1e8);
  return L.filter(p => !(prix > 0) || p <= prix * 0.01);
}
/* seuil des grosses transactions : 90e centile du montant des 500 dernières, au moins 5 000 $ */
export function seuilGros(montants) {
  if (montants.length < 20) return 5000;
  const s = montants.slice().sort((a, b) => a - b); return Math.max(5000, s[Math.floor(s.length * 0.9)]);
}

/* ── connexion (navigateur) ── */
export function creerFluxKraken({ surMaj, surEtat, WS = globalThis.WebSocket, horloge = () => Date.now() } = {}) {
  let ws = null, symbole = null, c = null, delai = 1000, relance = null, garde = null, dernierMsg = 0, ferme = false;
  const transactions = [], etat = { connexion: 'déconnecté', resync: 0, erreur: null };
  const dire = (k, v) => { etat[k] = v; surEtat && surEtat({ ...etat }); };
  function abonner() {
    if (!ws || ws.readyState !== 1 || !symbole) return;
    c = carnetVide(symbole); transactions.length = 0;
    ws.send(JSON.stringify({ event: 'subscribe', feed: 'book', product_ids: [symbole] }));
    ws.send(JSON.stringify({ event: 'subscribe', feed: 'trade', product_ids: [symbole] }));
  }
  function desabonner(s) { if (ws && ws.readyState === 1 && s) { ws.send(JSON.stringify({ event: 'unsubscribe', feed: 'book', product_ids: [s] })); ws.send(JSON.stringify({ event: 'unsubscribe', feed: 'trade', product_ids: [s] })); } }
  function resync() { const s = symbole; desabonner(s); etat.resync++; dire('connexion', 'resynchronisation'); abonner(); }
  function ouvrir() {
    if (ferme) return; clearTimeout(relance);
    try { ws = new WS(URL_WS); } catch (e) { dire('erreur', e.message); planifier(); return; }
    dire('connexion', 'connexion…');
    ws.onopen = () => { delai = 1000; dernierMsg = horloge(); dire('connexion', 'en direct'); dire('erreur', null); abonner(); };
    ws.onmessage = ev => {
      dernierMsg = horloge(); let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event) { if (m.event === 'error' || m.event === 'alert') dire('erreur', m.message || 'erreur Kraken'); return; }   // « subscribed », « info »… (portent aussi un champ feed)
      if (!c || (m.product_id && m.product_id !== symbole)) return;   // message d'un autre instrument (ancien abonnement) : ignoré
      if (m.feed === 'book' && !c.pret) return;                        // modification arrivée avant l'instantané : ignorée
      if (m.feed === 'book_snapshot') { appliquerInstantane(c, m); surMaj && surMaj(c, transactions); }
      else if (m.feed === 'book') { if (!appliquerDelta(c, m)) { resync(); return; } surMaj && surMaj(c, transactions); }
      else if (m.feed === 'trade' || m.feed === 'trade_snapshot') {
        for (const x of m.trades || [m]) if (x.product_id === symbole && x.price > 0) transactions.push({ t: x.time, p: x.price, q: x.qty, cote: x.side, usd: x.price * x.qty });
        if (transactions.length > 500) transactions.splice(0, transactions.length - 500);
        surMaj && surMaj(c, transactions);
      }
    };
    ws.onclose = () => { dire('connexion', 'reconnexion…'); planifier(); };
    ws.onerror = () => { dire('erreur', 'connexion Kraken interrompue'); };
  }
  function planifier() { if (ferme) return; clearTimeout(relance); relance = setTimeout(ouvrir, delai); delai = Math.min(15000, delai * 2); }
  garde = setInterval(() => { if (ws && ws.readyState === 1 && horloge() - dernierMsg > 30000) { try { ws.close(); } catch (e) { /* */ } } }, 5000);
  return {
    changer(s) { if (s === symbole) return; const ancien = symbole; symbole = s; if (!ws || ws.readyState > 1) ouvrir(); else if (ws.readyState === 1) { desabonner(ancien); abonner(); } },
    carnet: () => c, transactions: () => transactions, etat: () => ({ ...etat, age: c && c.t ? horloge() - c.t : null, dernierMsg }),
    fermer() { ferme = true; clearTimeout(relance); clearInterval(garde); try { ws && ws.close(); } catch (e) { /* */ } }
  };
}
