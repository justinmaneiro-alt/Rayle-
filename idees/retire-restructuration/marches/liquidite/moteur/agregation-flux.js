/* ═════════════ AGRÉGATION DES FLUX (V4, phase 2 ; module pur, testé : galaxie/tests/flux-agregation-test.mjs) ═════════════
   Trois briques : (1) les transactions agrégées par seconde (volume agressif acheteur / vendeur) ; (2) un seuil ADAPTATIF de « gros ordre » (quantile élevé des tailles de niveaux récemment vues) ;
   (3) le détecteur d'événements gros ordres : apparition, retrait (l'ordre disparaît sans avoir été exécuté : candidat « faux mur »), exécution (il disparaît pendant que des transactions le touchent). */

/* ── (1) transactions par seconde. `vendeurAgresseur` = true quand c'est le VENDEUR qui a frappé le carnet (le trade est une vente au marché : Binance m = true ; Kraken side = 'sell'). ── */
export class AgregateurTrades {
  constructor() { this.raz(); }
  raz() { this.achatUsd = 0; this.venteUsd = 0; this.achatQte = 0; this.venteQte = 0; this.n = 0; this.plusGros = null; this.ouv = null; this.haut = -Infinity; this.bas = Infinity; this.dernier = null; }
  ajouter({ prix, qte, vendeurAgresseur }) {
    const usd = prix * qte; this.n++;
    if (vendeurAgresseur) { this.venteUsd += usd; this.venteQte += qte; } else { this.achatUsd += usd; this.achatQte += qte; }
    if (!this.plusGros || usd > this.plusGros.usd) this.plusGros = { prix, qte, usd, cote: vendeurAgresseur ? 'vente' : 'achat' };
    if (this.ouv == null) this.ouv = prix; if (prix > this.haut) this.haut = prix; if (prix < this.bas) this.bas = prix; this.dernier = prix;
  }
  /* Rend le résumé de la seconde puis remet à zéro (null s'il n'y a eu aucune transaction). */
  vider() {
    if (!this.n) return null;
    const r = { n: this.n, achatUsd: this.achatUsd, venteUsd: this.venteUsd, achatQte: this.achatQte, venteQte: this.venteQte, deltaUsd: this.achatUsd - this.venteUsd, ouv: this.ouv, haut: this.haut, bas: this.bas, cloture: this.dernier, plusGros: this.plusGros };
    this.raz(); return r;
  }
}

/* ── (2) quantile glissant : mémoire circulaire de tailles, quantile recalculé de temps en temps (jamais à chaque mise à jour). ── */
export class SeuilAdaptatif {
  constructor({ capacite = 20000, quantile = 0.995, minEchantillons = 1500, plancherUsd = 0, recalculMs = 10000 } = {}) {
    Object.assign(this, { capacite, quantile, minEchantillons, plancherUsd, recalculMs }); this.tampon = new Float64Array(capacite); this.n = 0; this.pos = 0; this.valeur = Infinity; this.dernierCalcul = 0;
  }
  ajouter(usd) { this.tampon[this.pos] = usd; this.pos = (this.pos + 1) % this.capacite; if (this.n < this.capacite) this.n++; }
  /* Seuil courant (Infinity tant qu'il n'y a pas assez d'échantillons : aucun événement inventé au démarrage). */
  seuil(t) {
    if (t - this.dernierCalcul >= this.recalculMs && this.n >= this.minEchantillons) {
      const c = Float64Array.from(this.tampon.subarray(0, this.n)).sort(); this.valeur = Math.max(this.plancherUsd, c[Math.min(this.n - 1, Math.floor(this.quantile * this.n))]); this.dernierCalcul = t;
    }
    return this.valeur;
  }
}

/* ── (3) événements gros ordres ── */
export class DetecteurGrosOrdres {
  /* `plancherUsd` : jamais d'événement sous ce montant, même si le quantile est bas. `fenetreExecMs` : une transaction à ce prix dans cette fenêtre explique la disparition (exécution). */
  constructor({ plancherUsd = 20000, fenetreExecMs = 1500, quantile = 0.995, minEchantillons = 1500 } = {}) {
    this.seuilAdapt = new SeuilAdaptatif({ plancherUsd, quantile, minEchantillons }); this.fenetreExecMs = fenetreExecMs; this.trades = new Map(); this.apparus = new Map(); this.evenements = [];
  }
  /* À appeler pour chaque transaction (avant ou après les mises à jour du carnet de la même milliseconde : la fenêtre de 1,5 s absorbe l'ordre d'arrivée). */
  noterTrade(prix, qte, t) {
    const e = this.trades.get(prix); if (e && t - e.t < this.fenetreExecMs) { e.qte += qte; e.t = t; } else this.trades.set(prix, { qte, t });
    if (this.trades.size > 4000) { for (const [p, v] of this.trades) if (t - v.t > this.fenetreExecMs) this.trades.delete(p); }
  }
  /* À appeler pour chaque niveau modifié (prix, quantité avant, quantité après), en base ; `cote` 'bid' | 'ask'. Rend l'événement créé ou null. */
  niveau(cote, prix, avant, apres, t) {
    const nAv = avant * prix, nAp = apres * prix; if (apres > 0) this.seuilAdapt.ajouter(nAp);
    const seuil = this.seuilAdapt.seuil(t), cle = cote + prix, suivi = this.apparus.get(cle);
    if (!suivi) {                                                                                   // pas encore suivi comme « gros »
      if (nAp < seuil) return null;
      if (this.apparus.size > 5000) this.nettoyer(t);
      if (nAv < seuil * 0.5) { this.apparus.set(cle, { t, ref: nAp }); return this.pousser({ t, type: 'apparition', cote, prix, usd: nAp, seuil }); }
      this.apparus.set(cle, { t: null, ref: nAp }); return null;                                  // déjà gros avant qu'on le voie : on le suit sans inventer son apparition
    }
    if (nAp > suivi.ref) suivi.ref = nAp;
    if (nAp <= suivi.ref * 0.3) {                                                                   // disparition (ou presque) : exécuté, ou retiré sans être touché
      this.apparus.delete(cle);
      const tr = this.trades.get(prix), execute = tr && t - tr.t < this.fenetreExecMs && tr.qte * prix >= (suivi.ref - nAp) * 0.3;
      return this.pousser({ t, type: execute ? 'execution' : 'retrait', cote, prix, usd: suivi.ref - nAp, seuil, dureeMs: suivi.t != null ? t - suivi.t : null });
    }
    if (nAp < seuil * 0.5) this.apparus.delete(cle);                                                // plus assez gros : on arrête de le suivre, sans événement
    return null;
  }
  nettoyer(t) { for (const [k, v] of this.apparus) if (v.t != null && t - v.t > 6 * 3600e3) this.apparus.delete(k); }
  pousser(e) { this.evenements.push(e); return e; }
  /* Récupère les événements accumulés (et les efface). */
  prendre() { const e = this.evenements; this.evenements = []; return e; }
  seuil(t = Date.now()) { return this.seuilAdapt.seuil(t); }
}
