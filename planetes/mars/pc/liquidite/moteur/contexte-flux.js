import { trancheDe, prixDeTranche, profilDepuisTranches, noeudsVolume, MS15 } from './barres-flux.js';
import { divergencePrixCvd } from './flux-indicateurs.js';
import { balayagesLiquidite } from './pieges-stops.js';

/* ═════════════ FLUX DANS LE CONTEXTE DES STRATÉGIES (V4, phase 5 ; module pur, testé : galaxie/tests/familles-v4-test.mjs) ═════════════
   Le contexte d'une série M15 (`construireContexte`) reçoit deux couches de FLUX, toutes deux CAUSALES (la valeur en i n'utilise que les barres 0..i, ou des périodes déjà FINIES) :
   1. `ctx.fl` — à partir des bougies seules (volume acheteur « taker » de Binance : delta réel depuis 2017) : achat / vente en dollars, delta, CVD du jour, divergence prix / CVD, absorption.
   2. `ctx.fp` — si l'historique des transactions (aggTrades) est installé : l'EMPREINTE (volume par prix) résumée par barre et par période : plus gros trade, niveau d'absorption exact, profil du jour
      et de la semaine PRÉCÉDENTS (POC, zone de valeur, nœuds de gros volume HVN et trous LVN).
   Une couche absente est DITE (`ctx.fp.ok === false`) : les familles qui en ont besoin ne produisent alors aucun signal, jamais de valeur inventée. */
const mediane = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

/* ── 1. flux à partir des bougies ── */
export function attacherFluxBougies(ctx) {
  if (ctx.fl) return ctx.fl;
  const { m15, n } = ctx, achat = new Float64Array(n), vente = new Float64Array(n), delta = new Float64Array(n), cvd = new Float64Array(n), typique = new Float64Array(n);
  let somme = 0, jour = -1, ema = 0, vu = 0, ok = 0;
  for (let i = 0; i < n; i++) {
    const vb = m15.vb ? m15.vb[i] : NaN, v = m15.v[i], c = m15.c[i];
    if (Number.isFinite(vb) && v >= 0) { achat[i] = vb * c; vente[i] = (v - vb) * c; ok++; } else { achat[i] = NaN; vente[i] = NaN; }
    delta[i] = Number.isFinite(achat[i]) ? achat[i] - vente[i] : NaN;
    const j = Math.floor(m15.t[i] / 86400e3); if (j !== jour) { jour = j; somme = 0; } if (Number.isFinite(delta[i])) somme += delta[i]; cvd[i] = somme;
    typique[i] = ema;                                                                                // delta typique = moyenne mobile exponentielle des |delta| des barres PRÉCÉDENTES (causale)
    if (Number.isFinite(delta[i])) { vu++; ema = vu < 30 ? ema + (Math.abs(delta[i]) - ema) / vu : ema + (Math.abs(delta[i]) - ema) / 96; }
  }
  const fl = { ok: ok > 0.5 * n, couverture: ok / Math.max(1, n), achat, vente, delta, cvd, typique };
  fl.deltaRel = i => { const t = achat[i] + vente[i]; return t > 0 ? (achat[i] - vente[i]) / t : 0; };
  ctx.fl = fl; return fl;
}
/* Absorption causale : pour la barre i, +1 si les ventes agressives sont énormes (|delta| ≥ facteur × delta typique) mais le prix n'a pas baissé (clôture ≥ ouverture − tol × ATR) ;
   −1 pour des achats énormes sans hausse. Résultat mis en cache par (facteur, tol). */
export function absorptionVec(ctx, facteur = 2, tolAtr = 0.25) {
  const cle = 'abs:' + facteur + ':' + tolAtr; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  const fl = attacherFluxBougies(ctx), n = ctx.n, sens = new Int8Array(n), force = new Float32Array(n), { o, c } = ctx.m15, atr = ctx.atr15;
  for (let i = 100; i < n; i++) {
    const d = fl.delta[i], t = fl.typique[i], a = atr[i]; if (!Number.isFinite(d) || !(t > 0) || !(a > 0) || Math.abs(d) < facteur * t) continue;
    const progres = c[i] - o[i];
    if (d < 0 && progres >= -tolAtr * a) { sens[i] = 1; force[i] = Math.abs(d) / t; } else if (d > 0 && progres <= tolAtr * a) { sens[i] = -1; force[i] = Math.abs(d) / t; }
  }
  const r = { sens, force }; ctx.cache.set(cle, r); return r;
}
export function divergenceVec(ctx, fenetre = 48) {
  const cle = 'div:' + fenetre; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  const fl = attacherFluxBougies(ctx), d = divergencePrixCvd(ctx.m15.c, fl.cvd, { fenetre }); ctx.cache.set(cle, d); return d;
}
/* Balayages de liquidité (sweep & reclaim) : une seule passe, mise en cache. */
export function balayagesVec(ctx, minTouches = 2) {
  const cle = 'sweep:' + minTouches; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  const r = balayagesLiquidite(ctx.m15, ctx.atr15, { minTouches }); ctx.cache.set(cle, r); return r;
}

/* ── 2. empreinte (aggTrades) : résumé compact, chargé en flux ── */
export function creerCompacteur() {
  const barres = []; let jourCle = null, semCle = null, accJ = new Map(), accS = new Map(); const jours = [], semaines = [];
  const finirPeriode = (liste, acc, debut, fin) => { if (!acc.size) return; const p = profilDepuisTranches(acc), nv = noeudsVolume(p); liste.push({ debut, fin, poc: p.poc, vah: p.vah, val: p.val, hvn: nv.hvn.slice(0, 6).map(x => x.prix), lvn: nv.lvn.slice(0, 6).map(x => x.prix) }); };
  let debutJ = 0, debutS = 0, dernierT = 0;
  return {
    ajouter(b) {
      const j = Math.floor(b.t / 86400e3), s = Math.floor((b.t / 86400e3 + 3) / 7);
      if (j !== jourCle) { if (jourCle != null) finirPeriode(jours, accJ, debutJ, b.t); jourCle = j; accJ = new Map(); debutJ = b.t; }
      if (s !== semCle) { if (semCle != null) finirPeriode(semaines, accS, debutS, b.t); semCle = s; accS = new Map(); debutS = b.t; }
      let maxA = -1, kA = null, maxV = -1, kV = null, maxT = -1, kT = null;
      for (const [k, a, v] of b.fp) {
        for (const acc of [accJ, accS]) { let e = acc.get(k); if (!e) acc.set(k, e = { achat: 0, vente: 0 }); e.achat += a; e.vente += v; }
        if (a > maxA) { maxA = a; kA = k; } if (v > maxV) { maxV = v; kV = k; } if (a + v > maxT) { maxT = a + v; kT = k; }
      }
      barres.push([b.t, b.achatUsd, b.venteUsd, b.n, b.plusGrosUsd, kT == null ? null : Math.round(prixDeTranche(kT) * 1e6) / 1e6, kA == null ? null : Math.round(prixDeTranche(kA) * 1e6) / 1e6, kV == null ? null : Math.round(prixDeTranche(kV) * 1e6) / 1e6]); dernierT = b.t;
    },
    finir() { if (jourCle != null) { finirPeriode(jours, accJ, debutJ, dernierT + MS15); finirPeriode(semaines, accS, debutS, dernierT + MS15); } return { version: 1, barres, jours, semaines, debut: barres.length ? barres[0][0] : null, fin: dernierT || null }; }
  };
}
/* Attache l'empreinte compacte au contexte : ctx.fp = { ok, couverture, present, plusGros, nTrades, pocBarre, niveauAchat, niveauVente, jourIdx, semIdx, jours, semaines, de, a }.
   `jourIdx[i]` = index du DERNIER jour TERMINÉ avant la barre i (jamais le jour en cours) ; idem pour la semaine. */
export function attacherEmpreinte(ctx, compact) {
  const n = ctx.n, t = ctx.m15.t;
  if (!compact || !compact.barres || !compact.barres.length) { ctx.fp = { ok: false, raison: 'historique des transactions (aggTrades) non installé' }; return ctx.fp; }
  const present = new Uint8Array(n), plusGros = new Float64Array(n), nTr = new Float64Array(n), poc = new Float64Array(n).fill(NaN), nAch = new Float64Array(n).fill(NaN), nVen = new Float64Array(n).fill(NaN), achat = new Float64Array(n).fill(NaN), vente = new Float64Array(n).fill(NaN);
  const parT = new Map(); for (const b of compact.barres) parT.set(b[0], b); let ok = 0;
  for (let i = 0; i < n; i++) { const b = parT.get(t[i]); if (!b) continue; present[i] = 1; ok++; achat[i] = b[1]; vente[i] = b[2]; nTr[i] = b[3]; plusGros[i] = b[4]; if (b[5] != null) poc[i] = b[5]; if (b[6] != null) nAch[i] = b[6]; if (b[7] != null) nVen[i] = b[7]; }
  const jourIdx = new Int32Array(n).fill(-1), semIdx = new Int32Array(n).fill(-1); let kj = -1, ks = -1;
  for (let i = 0; i < n; i++) { while (kj + 1 < compact.jours.length && compact.jours[kj + 1].fin <= t[i]) kj++; while (ks + 1 < compact.semaines.length && compact.semaines[ks + 1].fin <= t[i]) ks++; jourIdx[i] = kj; semIdx[i] = ks; }
  ctx.fp = { ok: ok > 0, couverture: ok / Math.max(1, n), present, achat, vente, plusGros, nTrades: nTr, pocBarre: poc, niveauAchat: nAch, niveauVente: nVen, jourIdx, semIdx, jours: compact.jours, semaines: compact.semaines, de: compact.debut, a: compact.fin, mois: compact.debut != null ? (compact.fin - compact.debut) / (30.4375 * 86400e3) : 0 };
  return ctx.fp;
}
/* Dernière estimation « couverture de la zone testée » pour les rapports : de quand à quand l'empreinte couvre la série, en mois. */
export const couvertureEmpreinte = ctx => (ctx.fp && ctx.fp.ok ? { de: ctx.fp.de, a: ctx.fp.a, mois: ctx.fp.mois, part: ctx.fp.couverture } : null);
export { trancheDe };
