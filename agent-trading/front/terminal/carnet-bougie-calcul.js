/* ═════════════ TERMINAL : BOUGIE DU CARNET D'ORDRES (pur, testé : agent-trading/tests/terminal-b-test.mjs) ═════════════
   Pression nette = (volume acheteurs − volume vendeurs) / total, sur les N premiers niveaux ou à ± 0,5 % du prix. Valeur entre −1 et +1, 0 = équilibre.
   Une bougie par période (5 s, 15 s, 1 min, 5 min) : elle part de 0 (milieu), puis ouverture / plus haut / plus bas / clôture DE CETTE PRESSION.
   Le delta des échanges (achats au marché − ventes au marché) est cumulé sur la même période. Mesuré depuis l'ouverture du terminal : aucun historique ancien. */
export const PERIODES = Object.freeze({ '5s': 5e3, '15s': 15e3, '1m': 60e3, '5m': 300e3 });
export const MENTION_BOUGIE = 'Mesuré depuis l’ouverture du terminal, pas d’historique ancien.';
/* pression d'un carnet {bids: Map(prix→qté), asks: Map} : `niveaux` premiers niveaux de chaque côté, sinon la fenêtre ± fenetre autour du milieu */
export function pression(c, { niveaux = null, fenetre = 0.005 } = {}) {
  if (!c || !c.bids || !c.asks || !c.bids.size || !c.asks.size) return null;
  let bid = -Infinity, ask = Infinity; for (const p of c.bids.keys()) if (p > bid) bid = p; for (const p of c.asks.keys()) if (p < ask) ask = p;
  const mid = (bid + ask) / 2; let B, A;
  if (niveaux) { B = [...c.bids].sort((x, y) => y[0] - x[0]).slice(0, niveaux); A = [...c.asks].sort((x, y) => x[0] - y[0]).slice(0, niveaux); }
  else { B = [...c.bids].filter(([p]) => p >= mid * (1 - fenetre)); A = [...c.asks].filter(([p]) => p <= mid * (1 + fenetre)); }
  const vb = B.reduce((s, x) => s + x[1], 0), va = A.reduce((s, x) => s + x[1], 0), t = vb + va;
  return t > 0 ? { valeur: (vb - va) / t, acheteurs: vb, vendeurs: va, milieu: mid } : null;
}
export function creerBougiesCarnet(periode = '15s', { max = 240 } = {}) {
  const ms = PERIODES[periode]; if (!ms) throw new Error('période inconnue : ' + periode);
  const E = { ms, periode, bougies: [], courante: null, achats: 0, ventes: 0 };
  const fermer = () => { if (E.courante) { E.courante.delta = E.achats - E.ventes; E.courante.achats = E.achats; E.courante.ventes = E.ventes; E.bougies.push(E.courante); if (E.bougies.length > max) E.bougies.shift(); } E.courante = null; E.achats = 0; E.ventes = 0; };
  return {
    /* à appeler à chaque mise à jour du carnet : p = pression (−1..+1) */
    ajouterPression(t, p) {
      const k = Math.floor(t / ms) * ms;
      if (E.courante && E.courante.t !== k) fermer();
      if (!E.courante) E.courante = { t: k, o: 0, h: 0, l: 0, c: 0 };   // part du milieu (zéro)
      const b = E.courante; b.c = p; if (p > b.h) b.h = p; if (p < b.l) b.l = p;
    },
    ajouterEchange(t, q, cote) {
      const k = Math.floor(t / ms) * ms; if (E.courante && E.courante.t !== k) fermer();
      if (!E.courante) E.courante = { t: k, o: 0, h: 0, l: 0, c: 0 };
      if (cote === 'buy') E.achats += q; else E.ventes += q;
    },
    bougies() { return E.bougies.concat(E.courante ? [{ ...E.courante, delta: E.achats - E.ventes, achats: E.achats, ventes: E.ventes, ouverte: true }] : []); },
    derniere() { const L = this.bougies(); return L.length ? L[L.length - 1] : null; },
    periode: () => E.periode,
    vider() { E.bougies = []; E.courante = null; E.achats = 0; E.ventes = 0; }
  };
}
export function lectureBougieCarnet(b, fmt = x => String(x)) {
  if (!b) return `Pas encore de bougie du carnet. ${MENTION_BOUGIE}`;
  const pct = x => Math.round(x * 100), sens = b.c > 0.15 ? 'acheteuse' : b.c < -0.15 ? 'vendeuse' : 'équilibrée';
  return `Pression du carnet ${sens} : clôture ${pct(b.c)} %, plus haut ${pct(b.h)} %, plus bas ${pct(b.l)} %. Delta des échanges ${b.delta > 0 ? 'acheteur' : b.delta < 0 ? 'vendeur' : 'nul'} (${fmt(Math.abs(Math.round(b.delta * 1000) / 1000))}). ${MENTION_BOUGIE}`;
}
