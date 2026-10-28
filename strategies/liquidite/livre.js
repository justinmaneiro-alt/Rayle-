/* ═════════════ LIVRE D'ORDRES (V4, phase 2 ; module pur, testé : galaxie/tests/flux-livre-test.mjs) ═════════════
   Un carnet agrégé par niveau de prix, comme celui que reçoit Bookmap : { prix → quantité } de chaque côté. Aucune identité d'acteur (les flux publics n'en donnent pas).
   Limite honnête : l'instantané de départ des échanges ne contient que les N meilleurs niveaux (Binance : 5 000 au comptant, 1 000 en futures ; Kraken : 500). Au-delà, on ne connaît un niveau que s'il a
   BOUGÉ depuis le début ; `limites` garde la plage garantie complète pour que les tranches lointaines ne soient jamais présentées comme « vides » alors qu'elles sont « non observées ». */
export class Livre {
  constructor() { this.bids = new Map(); this.asks = new Map(); this.limites = { bas: null, haut: null }; this.misesAJour = 0; }
  vider() { this.bids.clear(); this.asks.clear(); this.limites = { bas: null, haut: null }; }
  /* Applique des niveaux [[prix, quantité], …] (nombres ou textes). Quantité 0 = niveau supprimé. `surChangement(prix, avant, apres, cote)` est appelé pour chaque niveau modifié (facultatif). */
  appliquer(cote, niveaux, surChangement = null) {
    const m = cote === 'bid' ? this.bids : this.asks;
    for (let i = 0; i < niveaux.length; i++) {
      const n = niveaux[i], p = typeof n[0] === 'number' ? n[0] : parseFloat(n[0]), q = typeof n[1] === 'number' ? n[1] : parseFloat(n[1]);
      if (!(p > 0) || !(q >= 0)) continue;
      const avant = m.get(p) || 0;
      if (q === 0) m.delete(p); else m.set(p, q);
      if (surChangement && avant !== q) surChangement(p, avant, q, cote);
    }
    this.misesAJour++;
  }
  /* Instantané complet : remplace tout. La plage garantie = du dernier niveau reçu côté acheteur au dernier niveau côté vendeur. */
  charger(bids, asks) {
    this.vider(); this.appliquer('bid', bids); this.appliquer('ask', asks);
    let bas = Infinity, haut = -Infinity; for (const p of this.bids.keys()) if (p < bas) bas = p; for (const p of this.asks.keys()) if (p > haut) haut = p;
    this.limites = { bas: Number.isFinite(bas) ? bas : null, haut: Number.isFinite(haut) ? haut : null };
  }
  meilleurs() {
    let b = 0, a = Infinity; for (const p of this.bids.keys()) if (p > b) b = p; for (const p of this.asks.keys()) if (p < a) a = p;
    return { bid: b > 0 ? b : null, ask: Number.isFinite(a) ? a : null };
  }
  estCroise() { const { bid, ask } = this.meilleurs(); return bid != null && ask != null && bid >= ask; }
  taille() { return this.bids.size + this.asks.size; }
  /* Retire les niveaux qui croisent le carnet (restes d'un trou de synchronisation). Rend le nombre de niveaux retirés. */
  nettoyerCroisement() {
    let n = 0; for (let k = 0; k < 1000 && this.estCroise(); k++) {
      const { bid, ask } = this.meilleurs(), plusGros = this.bids.get(bid) >= this.asks.get(ask);
      if (plusGros) this.asks.delete(ask); else this.bids.delete(bid); n++;
    }
    return n;
  }
  /* Profondeur par tranches de prix autour du milieu (en dollars : prix × quantité). bid[0] = juste sous le milieu, ask[0] = juste au-dessus. `pasPct` en % du prix (0,02 = 2 points de base).
     Rend { bid, ask, milieu, meilleurBid, meilleurAsk, spreadPct, couvBasPct, couvHautPct } ; couv* = jusqu'où (en %) le carnet est garanti complet. null si le carnet est vide. */
  tranches(pasPct = 0.02, demiLargeurPct = 3, sortieBid = null, sortieAsk = null) {
    const { bid: mb, ask: ma } = this.meilleurs(); if (mb == null || ma == null) return null;
    const milieu = (mb + ma) / 2, n = Math.round(demiLargeurPct / pasPct), pas = milieu * pasPct / 100;
    const bid = sortieBid && sortieBid.length === n ? sortieBid.fill(0) : new Float64Array(n), ask = sortieAsk && sortieAsk.length === n ? sortieAsk.fill(0) : new Float64Array(n);
    for (const [p, q] of this.bids) { const k = Math.floor((milieu - p) / pas); if (k >= 0 && k < n) bid[k] += p * q; }
    for (const [p, q] of this.asks) { const k = Math.floor((p - milieu) / pas); if (k >= 0 && k < n) ask[k] += p * q; }
    const cb = this.limites.bas != null ? Math.min(demiLargeurPct, Math.max(0, (milieu - this.limites.bas) / milieu * 100)) : demiLargeurPct, ch = this.limites.haut != null ? Math.min(demiLargeurPct, Math.max(0, (this.limites.haut - milieu) / milieu * 100)) : demiLargeurPct;
    return { bid, ask, milieu, meilleurBid: mb, meilleurAsk: ma, spreadPct: (ma - mb) / milieu * 100, couvBasPct: cb, couvHautPct: ch, pasPct };
  }
}
/* Somme des `x` premières pourcents d'un tableau de tranches (ex. profondeur à 0,5 %). */
export function profondeurJusqua(tableau, pasPct, pct) { const n = Math.min(tableau.length, Math.round(pct / pasPct)); let s = 0; for (let i = 0; i < n; i++) s += tableau[i]; return s; }
/* Déséquilibre (bid − ask) / (bid + ask), entre −1 (tout vendeur) et +1 (tout acheteur) ; null s'il n'y a rien. */
export const desequilibre = (b, a) => (b + a > 0 ? (b - a) / (b + a) : null);
