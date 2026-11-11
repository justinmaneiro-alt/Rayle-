import { construireCarte, detecterMurs, fiabiliteMur, tauxLeurres } from './carte-chaleur.js';
import { serieDesequilibre, pressionCarnet, cumulDelta } from './flux-indicateurs.js';
import { profilVolume, noeudsVolume, trancheDe, prixDeTranche } from './barres-flux.js';
import { balayagesLiquidite, piscinesAutour, amasLiquidationEstimes } from './pieges-stops.js';
import { carteAimants } from './aimants.js';

/* ═════════════ ANALYSE DE LIQUIDITÉ D'UN ACTIF (V4, phases 3 et 4 ; module pur, testé : galaxie/tests/liquidite-analyse-test.mjs) ═════════════
   Assemble tout le moteur à partir de DONNÉES DÉJÀ CHARGÉES (le service PC les lit sur le disque, le navigateur en mode direct les a en mémoire). Rend ce que la fenêtre « Carte de liquidité » affiche :
   murs et leur fiabilité, pression du carnet, CVD récent, profil de volume, piscines de stops, liquidations estimées et la carte des aimants (« où va le marché ? »). Une source absente est DITE
   (`sources`), jamais remplacée par une valeur inventée. */
export const barresDepuisBougies = (m15, { n = 600 } = {}) => {
  // Profil APPROXIMATIF quand l'historique des transactions n'est pas là : le volume de chaque bougie est réparti uniformément entre son plus bas et son plus haut.
  const out = [], de = Math.max(0, m15.n - n);
  for (let i = de; i < m15.n; i++) {
    const k0 = trancheDe(m15.l[i]), k1 = trancheDe(m15.h[i]), nb = k1 - k0 + 1, usd = (m15.v[i] || 0) * m15.c[i], fp = [];
    for (let k = k0; k <= k1; k++) fp.push([k, usd / nb / 2, usd / nb / 2]);
    out.push({ t: m15.t[i], achatUsd: usd / 2, venteUsd: usd / 2, fp, ouv: m15.o[i], cloture: m15.c[i], haut: m15.h[i], bas: m15.l[i], n: 0, plusGrosUsd: 0 });
  }
  return out;
};
/* Histogramme du profil pour le dessin : ≈ `n` groupes de tranches → [[prix, dollars], …]. */
export function histoProfil(profil, n = 80) {
  if (!profil) return []; const pas = Math.max(1, Math.ceil((profil.kMax - profil.kMin + 1) / n)), out = [];
  for (let k = profil.kMin; k <= profil.kMax; k += pas) { let usd = 0; for (let j = k; j < k + pas && j <= profil.kMax; j++) { const e = profil.tranches.get(j); if (e) usd += e.achat + e.vente; } out.push([prixDeTranche(k + (pas - 1) / 2), usd]); }
  return out;
}
const atrSimple = (m15, k = 14) => { const n = m15.n; if (n < k + 2) return null; let s = 0; for (let i = n - k; i < n; i++) s += Math.max(m15.h[i] - m15.l[i], Math.abs(m15.h[i] - m15.c[i - 1]), Math.abs(m15.l[i] - m15.c[i - 1])); return s / k; };

/* entrees : { actif, venue, maintenant, donnees: { entete, enregistrements } (profondeur), evenements: [], trades: [{ t, achatUsd, venteUsd }], barresProfil: [] | null, m15: colonnes | null, metrics: [[t, oiBase, oiUsd, topC, topP, comptes, taker]] | null,
              derives: [{ t, interetOuvert, mark, ratioComptes }] | null, liquidationsObs: [], joursCarnet, ronds: [] } */
export function analyserLiquidite(e, { plancherMurUsd = null, agregationS = 2 } = {}) {
  const sources = {}, avert = [], maintenant = e.maintenant || Date.now();
  const d = e.donnees, recs = d && d.enregistrements || []; sources.carnet = recs.length ? { ok: true, secondes: recs.length } : { ok: false, raison: 'aucune seconde de carnet enregistrée dans cette fenêtre' };
  let carte = null, murs = [], pression = null, prix = null, mids = [];
  if (recs.length) {
    carte = construireCarte(d, { agregationS }); mids = recs.map(r => [r.tSec * 1000, (r.meilleurBid + r.meilleurAsk) / 2]); prix = mids[mids.length - 1][1];
    const midA = t => { let lo = 0, hi = mids.length - 1; if (t <= mids[0][0]) return mids[0][1]; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (mids[m][0] <= t) lo = m; else hi = m - 1; } return mids[lo][1]; };
    const plancher = plancherMurUsd != null ? plancherMurUsd : (prix > 5000 ? 150000 : prix > 10 ? 25000 : 8000);                // plancher d'un « mur » en dollars, selon l'actif
    murs = detecterMurs(carte, { plancherUsd: plancher }); for (const m of murs) m.fiabilite = fiabiliteMur(m, e.evenements || [], { midA });
    pression = pressionCarnet(serieDesequilibre(recs.slice(-120), d.entete.pasPct));
    sources.leurres = tauxLeurres(e.evenements || [], { midA });
  } else if (e.m15 && e.m15.n) prix = e.m15.c[e.m15.n - 1];
  // CVD récent à partir des transactions agrégées par seconde
  let cvdRecent = null; const tr = e.trades || [];
  if (tr.length) { const delta = Float64Array.from(tr, x => x.achatUsd - x.venteUsd), c = cumulDelta(delta); cvdRecent = { dernier: c[c.length - 1], delta60s: delta.slice(-60).reduce((a, b) => a + b, 0), points: Array.from(c).filter((_, i) => i % Math.max(1, Math.floor(c.length / 120)) === 0) }; sources.trades = { ok: true, secondes: tr.length }; } else sources.trades = { ok: false, raison: 'pas de transactions dans la fenêtre' };
  // profil de volume
  let profil = null, noeuds = null;
  if (e.barresProfil && e.barresProfil.length) { profil = profilVolume(e.barresProfil); noeuds = noeudsVolume(profil); sources.profil = { ok: true, origine: 'transactions réelles (aggTrades)', barres: e.barresProfil.length }; }
  else if (e.m15 && e.m15.n > 100) { const b = barresDepuisBougies(e.m15); profil = profilVolume(b); noeuds = noeudsVolume(profil); sources.profil = { ok: true, origine: 'APPROXIMATIF : volume des bougies M15 réparti entre plus bas et plus haut (pas de transactions)', barres: b.length }; avert.push('Profil de volume approximatif (historique des transactions non installé).'); }
  else sources.profil = { ok: false, raison: 'ni transactions ni bougies' };
  // piscines de stops
  let piscines = null, atr = null;
  if (e.m15 && e.m15.n > 400) {
    const m = e.m15, n = m.n; atr = atrSimple(m); const a = new Float64Array(n); for (let i = 1; i < n; i++) a[i] = Math.max(m.h[i] - m.l[i], Math.abs(m.h[i] - m.c[i - 1]), Math.abs(m.l[i] - m.c[i - 1])); for (let i = n - 1; i >= 14; i--) { let s = 0; for (let k = 0; k < 14; k++) s += a[i - k]; a[i] = s / 14; }
    const bal = balayagesLiquidite(m, a, { garder: i => i === n - 1 }), pools = bal.etatEn(n - 1) || { hauts: [], bas: [] }; let hR = -Infinity, bR = Infinity; for (let i = Math.max(0, n - 192); i < n; i++) { if (m.h[i] > hR) hR = m.h[i]; if (m.l[i] < bR) bR = m.l[i]; }
    if (prix == null) prix = m.c[n - 1];
    piscines = piscinesAutour(pools, prix, { ronds: e.ronds || [], pct: 3, hautRange: hR, basRange: bR }); sources.stops = { ok: true, hauts: piscines.hauts.length, bas: piscines.bas.length };
    const dernierBalayage = (() => { for (let i = n - 1; i >= Math.max(0, n - 48); i--) if (bal.sens[i] !== 0) return { sens: bal.sens[i], niveau: bal.niveau[i], type: bal.type[i], il_y_a_barres: n - 1 - i }; return null; })(); sources.dernierBalayage = dernierBalayage;
  } else sources.stops = { ok: false, raison: 'pas assez de bougies M15' };
  // liquidations estimées (intérêt ouvert)
  let liquidations = null;
  const mx = e.metrics || [], dv = e.derives || [];
  if ((mx.length > 50 || dv.length > 20) && e.m15 && e.m15.n) {
    const m = e.m15, serie = [], pt = t => { let lo = 0, hi = m.n - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m.t[k] <= t) lo = k; else hi = k - 1; } return lo; };
    for (const r of mx) { const i = pt(r[0]); if (m.t[i] + 900000 < r[0]) continue; const ratio = r[5] > 0 ? r[5] / (1 + r[5]) : 0.5; serie.push({ t: r[0], haut: m.h[i], bas: m.l[i], cloture: m.c[i], oiUsd: r[2], partLong: ratio }); }
    const dernierMx = mx.length ? mx[mx.length - 1][0] : 0, oiVal = dv.filter(x => x.interetOuvert > 0 && x.mark > 0 && x.t > dernierMx);
    for (const x of oiVal) { const i = pt(x.t); serie.push({ t: x.t, haut: m.h[i], bas: m.l[i], cloture: m.c[i], oiUsd: x.interetOuvert * x.mark, partLong: x.ratioComptes > 0 ? x.ratioComptes / (1 + x.ratioComptes) : 0.5 }); }
    serie.sort((a, b) => a.t - b.t); if (serie.length > 20) { liquidations = amasLiquidationEstimes(serie.slice(-1200)); sources.liquidations = { ok: true, origine: 'ESTIMÉ à partir de l’intérêt ouvert (hypothèse de leviers)', pas: serie.length }; }
  }
  if (!liquidations) sources.liquidations = { ok: false, raison: 'pas d’intérêt ouvert disponible' };
  const aimants = prix ? carteAimants({ prix, atr, murs: murs.filter(m => m.actif && m.distancePct <= 3).slice(0, 25), profil, noeuds, piscines, liquidations, pression, joursCarnet: e.joursCarnet }) : null;
  if (aimants) avert.push(...aimants.avertissements.filter(x => !avert.includes(x)));
  return {
    actif: e.actif, venue: e.venue, t: maintenant, prix, joursCarnet: e.joursCarnet != null ? e.joursCarnet : null, sources, avertissements: avert,
    couverture: recs.length ? { basPct: recs[recs.length - 1].couvBasPct, hautPct: recs[recs.length - 1].couvHautPct } : null,
    murs: murs.slice(0, 30).map(m => ({ prix: m.prix, cote: m.cote, usdMax: m.usdMax, ratioMediane: m.ratioMediane, dureeS: m.dureeS, actif: m.actif, distancePct: m.distancePct, fiabilite: m.fiabilite })),
    pression, cvd: cvdRecent, profil: profil ? { poc: profil.poc, vah: profil.vah, val: profil.val, histo: histoProfil(profil), hvn: noeuds.hvn.slice(0, 8), lvn: noeuds.lvn.slice(0, 8) } : null,
    piscines, liquidations: liquidations ? { estime: true, amas: liquidations.amas.slice(0, 20), avertissement: liquidations.avertissement } : null, aimants
  };
}
