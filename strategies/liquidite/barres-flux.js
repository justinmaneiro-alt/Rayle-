/* ═════════════ BARRES DE FLUX M15 AVEC EMPREINTE (V4, phases 2 et 3 ; module pur, testé : galaxie/tests/flux-historique-test.mjs) ═════════════
   Les transactions (aggTrades) sont résumées par bougie de 15 minutes alignée sur les bougies M15 de l'agent : volume agressif acheteur / vendeur en dollars, nombre de transactions, plus gros trade, et
   l'EMPREINTE (footprint) = le volume acheteur et vendeur par tranche de prix (0,02 %). C'est ce qui permet, sur des années, le profil de volume, l'absorption et le delta par niveau, SANS le carnet
   d'ordres (qui n'existe pas en historique gratuit). Une barre : { t, achatUsd, venteUsd, n, plusGrosUsd, ouv, haut, bas, cloture, fp: [[k, achatUsd, venteUsd], …] triée par k }.
   k = floor(ln(prix) / ln(1,0002)) ; le prix du centre de la tranche k vaut prixDeTranche(k). */
export const PAS_TRANCHE = 1.0002, LN_PAS = Math.log(PAS_TRANCHE), MS15 = 900000;
export const trancheDe = prix => Math.floor(Math.log(prix) / LN_PAS);
export const prixDeTranche = k => Math.exp((k + 0.5) * LN_PAS);

export class AgregateurBarres {
  /* `surBarre(barre)` est appelé à la fermeture de chaque barre M15 (la barre en cours se ferme quand une transaction d'une barre suivante arrive, ou à `finir()`). */
  constructor(surBarre) { this.surBarre = surBarre; this.courante = null; this.dernierT = -Infinity; this.fp = new Map(); this.desordre = 0; }
  ajouter(tMs, prix, qte, vendeurAgresseur) {
    const t = Math.floor(tMs / MS15) * MS15;
    if (t < this.dernierT) { this.desordre++; return; }                                           // transaction plus vieille que la barre en cours : ignorée et comptée
    if (!this.courante || t !== this.courante.t) { this.fermer(); this.courante = { t, achatUsd: 0, venteUsd: 0, n: 0, plusGrosUsd: 0, ouv: prix, haut: prix, bas: prix, cloture: prix }; this.dernierT = t; }
    const c = this.courante, usd = prix * qte, k = trancheDe(prix); let e = this.fp.get(k); if (!e) this.fp.set(k, e = [0, 0]);
    if (vendeurAgresseur) { c.venteUsd += usd; e[1] += usd; } else { c.achatUsd += usd; e[0] += usd; }
    c.n++; if (usd > c.plusGrosUsd) c.plusGrosUsd = usd; if (prix > c.haut) c.haut = prix; if (prix < c.bas) c.bas = prix; c.cloture = prix;
  }
  fermer() {
    const c = this.courante; if (!c) return; c.fp = [...this.fp.entries()].sort((a, b) => a[0] - b[0]).map(([k, [a, v]]) => [k, Math.round(a), Math.round(v)]);
    c.achatUsd = Math.round(c.achatUsd); c.venteUsd = Math.round(c.venteUsd); c.plusGrosUsd = Math.round(c.plusGrosUsd); this.fp = new Map(); this.courante = null; this.surBarre(c);
  }
  finir() { this.fermer(); }
}
/* Delta (achat − vente) de la barre et point de contrôle de la barre (tranche au plus gros volume). */
export const deltaBarre = b => b.achatUsd - b.venteUsd;
export function pocBarre(b) { let m = -1, k = null; for (const [kk, a, v] of b.fp) if (a + v > m) { m = a + v; k = kk; } return k == null ? null : prixDeTranche(k); }

/* Profil de volume (en dollars par tranche) sur une suite de barres : { poc, vah, val, tranches: Map(k → { achat, vente }) }, zone de valeur à `part` (70 %) du volume. */
export function profilVolume(barres, { part = 0.7 } = {}) {
  const m = new Map(); let total = 0;
  for (const b of barres) for (const [k, a, v] of b.fp) { let e = m.get(k); if (!e) m.set(k, e = { achat: 0, vente: 0 }); e.achat += a; e.vente += v; total += a + v; }
  if (!m.size) return null;
  const ks = [...m.keys()].sort((a, b) => a - b), vol = k => { const e = m.get(k); return e ? e.achat + e.vente : 0; };
  let poc = ks[0]; for (const k of ks) if (vol(k) > vol(poc)) poc = k;
  let lo = poc, hi = poc, cum = vol(poc); const kMin = ks[0], kMax = ks[ks.length - 1];
  while (cum < total * part && (lo > kMin || hi < kMax)) { const bas = lo > kMin ? vol(lo - 1) : -1, haut = hi < kMax ? vol(hi + 1) : -1; if (haut >= bas) { hi++; cum += vol(hi); } else { lo--; cum += vol(lo); } }
  return { poc: prixDeTranche(poc), vah: prixDeTranche(hi + 1), val: prixDeTranche(lo), pocK: poc, total, tranches: m, kMin, kMax };
}
/* Nœuds de gros volume (HVN) et trous de volume (LVN) d'un profil : lissage sur 3 tranches, pics locaux au-dessus de `facteurHvn` × la médiane, creux sous `facteurLvn` × la médiane (entre deux pics). */
export function noeudsVolume(profil, { facteurHvn = 1.6, facteurLvn = 0.35 } = {}) {
  if (!profil) return { hvn: [], lvn: [] };
  const ks = []; for (let k = profil.kMin; k <= profil.kMax; k++) ks.push(k);
  const v = ks.map(k => { const e = profil.tranches.get(k); return e ? e.achat + e.vente : 0; }), lisse = v.map((x, i) => (x + (v[i - 1] ?? x) + (v[i + 1] ?? x)) / 3);
  const triee = lisse.filter(x => x > 0).sort((a, b) => a - b), med = triee.length ? triee[triee.length >> 1] : 0, hvn = [], lvn = [];
  for (let i = 1; i < lisse.length - 1; i++) {
    if (lisse[i] > lisse[i - 1] && lisse[i] >= lisse[i + 1] && lisse[i] >= facteurHvn * med) hvn.push({ prix: prixDeTranche(ks[i]), volumeUsd: v[i], force: lisse[i] / med });
    if (lisse[i] < lisse[i - 1] && lisse[i] <= lisse[i + 1] && lisse[i] <= facteurLvn * med && i > 3 && i < lisse.length - 4) lvn.push({ prix: prixDeTranche(ks[i]), volumeUsd: v[i], force: med ? lisse[i] / med : 0 });
  }
  return { hvn, lvn, medianeUsd: med };
}
