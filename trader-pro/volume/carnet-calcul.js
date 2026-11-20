/* ═════════════ CARNET : CALCULS PURS (v6, A4) — regroupement par palier, cumul, gros ordres, persistance, déséquilibre ═════════════
   Un carnet = { bids: [[prix, quantité]…] (du meilleur vers le plus bas), asks: [[prix, quantité]…] (du meilleur vers le plus haut), t }.
   Avant la v6 le carnet n'avait que 20 niveaux au tick de la bourse : le même prix arrondi apparaissait plusieurs fois. Désormais chaque ligne = UN palier de prix (somme des quantités du palier). */
export const PALIERS = Object.freeze({ btc: [1, 5, 10, 50], or: [0.1, 0.5, 1, 5], sol: [0.01, 0.05, 0.1] });
export const PALIER_DEFAUT = Object.freeze({ btc: 10, or: 0.5, sol: 0.05 });
const EPS = 1e-9;
const arrondi = (x, pas) => +(Math.round(x / pas) * pas).toFixed(8);
const bas = (p, pas) => arrondi(Math.floor(p / pas + EPS) * pas, pas), haut = (p, pas) => arrondi(Math.ceil(p / pas - EPS) * pas, pas);
const mediane = L => { if (!L.length) return 0; const s = [...L].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* regroupe un côté : acheteurs arrondis vers le bas, vendeurs vers le haut (un ordre à 61 850,3 est vendeur au palier 61 860 de 10 $) ; trié du meilleur vers l'extérieur ; cumul croissant */
export function regrouperCote(niveaux, palier, cote) {
  const m = new Map(); for (const [p, q] of niveaux || []) { if (!(q > 0)) continue; const k = cote === 'achat' ? bas(p, palier) : haut(p, palier); m.set(k, (m.get(k) || 0) + q); }
  const L = [...m.entries()].sort((a, b) => (cote === 'achat' ? b[0] - a[0] : a[0] - b[0])); let cum = 0;
  return L.map(([prix, qte]) => { cum += qte; return { prix, qte, cumul: cum }; });
}
/* carnet affiché : n lignes par côté, spread et médian mesurés sur les meilleurs niveaux BRUTS ; gros ordres marqués sur les 50 premiers paliers (3 × la médiane) */
export function carnetRegroupe(book, palier, { n = 14, facteurGros = 3, premiers = 50 } = {}) {
  if (!book || !book.bids || !book.asks || !book.bids.length || !book.asks.length) return null;
  const ach = regrouperCote(book.bids, palier, 'achat'), ven = regrouperCote(book.asks, palier, 'vente');
  const med = mediane([...ach.slice(0, premiers), ...ven.slice(0, premiers)].map(x => x.qte)), seuil = med * facteurGros;
  const marque = L => L.map(x => ({ ...x, gros: seuil > 0 && x.qte > seuil }));
  const meilleurAchat = book.bids[0][0], meilleurVente = book.asks[0][0];
  return { achats: marque(ach.slice(0, n)), ventes: marque(ven.slice(0, n)), mediane: med, seuil, spread: meilleurVente - meilleurAchat, milieu: (meilleurVente + meilleurAchat) / 2, meilleurAchat, meilleurVente, maxQte: Math.max(1e-9, ...ach.slice(0, n).map(x => x.qte), ...ven.slice(0, n).map(x => x.qte)), maxCumul: Math.max(1e-9, ach.slice(0, n).at(-1) ? ach.slice(0, n).at(-1).cumul : 0, ven.slice(0, n).at(-1) ? ven.slice(0, n).at(-1).cumul : 0) };
}
/* gros ordres BRUTS (niveaux du carnet dont la quantité dépasse 3 × la médiane des 50 premiers niveaux du même côté) */
export function grosOrdresBruts(book, { facteur = 3, premiers = 50 } = {}) {
  const r = []; if (!book) return r;
  for (const [L, cote] of [[book.bids, 'achat'], [book.asks, 'vente']]) { if (!L || !L.length) continue; const med = mediane(L.slice(0, premiers).map(x => x[1])), s = med * facteur; for (const [p, q] of L) if (s > 0 && q > s) r.push({ prix: p, qte: q, cote }); }
  return r;
}
/* suivi de persistance : un gros ordre resté plus de `dureeMs` au même prix (et du même côté) est « persistant » ; il disparaît du suivi s'il est absent plus de 10 s */
export function creerSuiviGros({ dureeMs = 120000, absenceMs = 10000 } = {}) {
  const M = new Map();
  return {
    observer(book, now = Date.now()) {
      const vus = new Set(); for (const g of grosOrdresBruts(book)) { const k = g.cote + '|' + g.prix; vus.add(k); const e = M.get(k); if (e) { e.vu = now; e.qte = g.qte; } else M.set(k, { ...g, debut: now, vu: now }); }
      for (const [k, e] of M) if (!vus.has(k) && now - e.vu > absenceMs) M.delete(k);
    },
    persistants(now = Date.now()) { return [...M.values()].filter(e => now - e.debut >= dureeMs && now - e.vu <= absenceMs).map(e => ({ prix: e.prix, qte: e.qte, cote: e.cote, depuis: e.debut })); },
    taille: () => M.size, vider: () => M.clear()
  };
}
/* déséquilibre acheteurs / vendeurs sur n niveaux : ratio ∈ [−1, 1] = (A − V) / (A + V) */
export function desequilibreN(book, n) {
  if (!book || !book.bids || !book.asks) return null; const a = book.bids.slice(0, n).reduce((s, x) => s + x[1], 0), v = book.asks.slice(0, n).reduce((s, x) => s + x[1], 0), t = a + v; if (!(t > 0)) return null;
  return { acheteurs: a, vendeurs: v, ratio: (a - v) / t, part: a / t };
}
/* historique du déséquilibre (une mesure toutes les `pasMs`, 15 minutes gardées) pour la mini-courbe */
export function creerHistoDeseq({ pasMs = 5000, dureeMs = 15 * 60000 } = {}) {
  const L = []; let dernier = 0;
  return { ajouter(book, t = Date.now()) { if (t - dernier < pasMs) return false; const d10 = desequilibreN(book, 10), d25 = desequilibreN(book, 25); if (!d10 || !d25) return false; dernier = t; L.push({ t, r10: d10.ratio, r25: d25.ratio }); while (L.length && t - L[0].t > dureeMs) L.shift(); return true; }, liste: () => L, vider() { L.length = 0; dernier = 0; } };
}
/* points d'une mini-courbe SVG (largeur w, hauteur h) pour une liste de ratios ∈ [−1, 1] */
export function pointsCourbe(valeurs, w, h) { if (valeurs.length < 2) return ''; return valeurs.map((v, i) => `${(i / (valeurs.length - 1) * w).toFixed(1)},${((1 - (Math.max(-1, Math.min(1, v)) + 1) / 2) * h).toFixed(1)}`).join(' '); }
/* fusion d'un carnet profond (REST, 1 000 niveaux, quelques secondes de retard) et du flux (20 niveaux, 100 ms) : le flux fait foi dans sa plage de prix */
export function fusionnerCarnets(profond, flux) {
  if (!flux) return profond; if (!profond) return flux;
  const bids = [...flux.bids, ...(flux.bids.length ? profond.bids.filter(x => x[0] < flux.bids[flux.bids.length - 1][0]) : profond.bids)].sort((x, y) => y[0] - x[0]);
  const asks = [...flux.asks, ...(flux.asks.length ? profond.asks.filter(x => x[0] > flux.asks[flux.asks.length - 1][0]) : profond.asks)].sort((x, y) => x[0] - y[0]);
  return { type: 'carnet', t: flux.t || profond.t, bids, asks, profond: true };
}
