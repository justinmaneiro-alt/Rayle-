/* ═════════════ TERMINAL : CARTE DE CHALEUR DU CARNET (pur, testé) ═════════════
   Une « colonne » par seconde : quantités du carnet regroupées par cases de prix fixes (pas « rond ») sur ± 1 % autour du milieu.
   Enregistrée à partir de l'activation : aucun historique ancien n'existe (Kraken ne fournit pas l'historique du carnet). */
export const FENETRE = 0.01, CASES_MAX = 120, OCTETS_COLONNE_FIXE = 96;

/* pas « rond » (1, 2, 2,5, 5 × 10^k) proche de la cible, jamais sous le tick */
export function pasRond(cible, tick = 0) {
  const e = 10 ** Math.floor(Math.log10(cible)); let best = e;
  for (const m of [1, 2, 2.5, 5, 10]) if (Math.abs(m * e - cible) < Math.abs(best - cible)) best = m * e;
  return tick > 0 ? Math.max(tick, Math.round(best / tick) * tick) : best;
}
export function pasPour(milieu, tick) { return pasRond(milieu * 2 * FENETRE / CASES_MAX, tick); }

/* colonne : { t, p0 (prix bas de la première case), pas, q : quantités en $ (acheteurs + vendeurs), cote : +1 acheteur dominant / −1 vendeur } */
export function colonne(c, t, pas) {
  let bid = -Infinity, ask = Infinity; for (const p of c.bids.keys()) if (p > bid) bid = p; for (const p of c.asks.keys()) if (p < ask) ask = p;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || !(pas > 0)) return null;
  const mid = (bid + ask) / 2, lo = Math.floor(mid * (1 - FENETRE) / pas) * pas, n = Math.min(CASES_MAX + 2, Math.ceil(mid * 2 * FENETRE / pas) + 1);
  const q = new Array(n).fill(0), s = new Array(n).fill(0);
  for (const [map, sg] of [[c.bids, 1], [c.asks, -1]]) for (const [p, x] of map) { const k = Math.floor((p - lo) / pas + 1e-9); if (k < 0 || k >= n) continue; q[k] += p * x; s[k] += sg * p * x; }
  return { t, p0: lo, pas, mid, q: q.map(v => Math.round(v)), cote: s.map(v => (v > 0 ? 1 : v < 0 ? -1 : 0)) };
}
export const octets = col => OCTETS_COLONNE_FIXE + col.q.length * 6;

/* agrégation des colonnes dans des intervalles (bougies) : quantité moyenne par case de prix */
export function agreger(cols, debut, ms) {
  const g = new Map();
  for (const c of cols) { const k = Math.floor((c.t - debut) / ms); let a = g.get(k); if (!a) g.set(k, a = { t: debut + k * ms, n: 0, cases: new Map() });
    a.n++; for (let i = 0; i < c.q.length; i++) if (c.q[i] > 0) { const p = +(c.p0 + i * c.pas).toFixed(10); const v = a.cases.get(p) || { q: 0, s: 0, pas: c.pas }; v.q += c.q[i]; v.s += c.cote[i]; a.cases.set(p, v); } }
  return [...g.values()].map(a => ({ t: a.t, cases: [...a.cases].map(([p, v]) => ({ p, pas: v.pas, q: v.q / a.n, cote: Math.sign(v.s) })) })).sort((x, y) => x.t - y.t);
}
/* intensité normalisée (0-1) : racine de q / 95e centile des quantités visibles */
export function echelle(blocs) { const all = []; for (const b of blocs) for (const c of b.cases) all.push(c.q); if (!all.length) return 1; all.sort((a, b) => a - b); return all[Math.floor(all.length * 0.95)] || all[all.length - 1] || 1; }
export const intensite = (q, ref) => Math.min(1, Math.sqrt(q / ref));

/* purge : supprimer les plus anciennes jusqu'à 90 % de la limite */
export function aPurger(tailleTotale, limite, colonnesAnciennes) {
  if (tailleTotale <= limite) return [];
  const cible = limite * 0.9, out = []; let t = tailleTotale;
  for (const c of colonnesAnciennes) { if (t <= cible) break; out.push(c.cle); t -= c.octets; }
  return out;
}
