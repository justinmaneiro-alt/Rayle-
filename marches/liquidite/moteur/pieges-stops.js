/* ═════════════ PISCINES DE LIQUIDITÉ (STOPS) ET LIQUIDATIONS (V4, phase 3 ; module pur, testé : galaxie/tests/liquidite-test.mjs) ═════════════
   Là où les stops s'accumulent : plus hauts / plus bas ÉGAUX, plus hauts / plus bas du jour et de la semaine précédents, ronds psychologiques, bornes du range. Au-dessus d'un plus haut, ce sont des stops
   d'acheteurs à découvert (ordres d'achat) ; sous un plus bas, des stops d'acheteurs (ordres de vente). Un balayage (sweep) prend ces ordres puis le prix revient.
   Les amas de liquidations sont ESTIMÉS (hypothèse sur l'effet de levier et la répartition long / short) : ils sont toujours étiquetés « estimé », jamais présentés comme observés.
   Tout est CAUSAL : un pivot n'est connu qu'`kConf` barres après lui, un niveau « du jour précédent » seulement une fois le jour terminé. */

/* Tolérance d'égalité : 0,12 % du prix ou 0,25 ATR, le plus grand. */
const tolEgal = (prix, atr, tolPct, tolAtr) => Math.max(prix * tolPct / 100, (atr > 0 ? atr * tolAtr : 0));

/* Parcourt la série UNE fois et rend, pour chaque barre i : le tableau des événements de balayage (sweep & reclaim) et les piscines connues à cet instant (sur demande via `etatEn(i)` : on garde un
   instantané léger seulement pour les barres demandées par `garder`). `atr` : ATR M15 (Float64Array). */
export function balayagesLiquidite(m15, atr, { kConf = 3, tolPct = 0.12, tolAtr = 0.25, minTouches = 2, ageMax = 2500, marge = 0.0, reprise = 0, avecJourSemaine = true, ronds = null, garder = null } = {}) {
  const n = m15.n, sens = new Int8Array(n), niveau = new Float64Array(n), type = new Array(n).fill(null), touches = new Int16Array(n), force = new Float64Array(n), poolHaut = new Float64Array(n).fill(NaN), poolBas = new Float64Array(n).fill(NaN);
  const hautsP = [], basP = [], etats = new Map();                                    // piscines : { prix, touches, depuis, type, balayee }
  let jour = -1, jH = -Infinity, jL = Infinity, jPH = null, jPL = null, sem = -1, sH = -Infinity, sL = Infinity, sPH = null, sPL = null;
  const swingH = j => { for (let k = 1; k <= kConf; k++) if (!(m15.h[j] > m15.h[j - k]) || !(m15.h[j] >= m15.h[j + k])) return false; return true; };
  const swingB = j => { for (let k = 1; k <= kConf; k++) if (!(m15.l[j] < m15.l[j - k]) || !(m15.l[j] <= m15.l[j + k])) return false; return true; };
  for (let i = 0; i < n; i++) {
    const t = m15.t[i], a = atr[i] > 0 ? atr[i] : 0, j = i - kConf;
    // 1) pivots confirmés (le pivot j est connu à la clôture de la barre j + kConf)
    if (j >= kConf) {
      if (swingH(j)) { const p = m15.h[j], tol = tolEgal(p, a, tolPct, tolAtr); const q = hautsP.find(x => !x.balayee && x.type === 'egaux' && Math.abs(x.prix - p) <= tol); if (q) { q.touches++; q.prix = Math.max(q.prix, p); } else hautsP.push({ prix: p, touches: 1, depuis: j, type: 'egaux', balayee: false }); }
      if (swingB(j)) { const p = m15.l[j], tol = tolEgal(p, a, tolPct, tolAtr); const q = basP.find(x => !x.balayee && x.type === 'egaux' && Math.abs(x.prix - p) <= tol); if (q) { q.touches++; q.prix = Math.min(q.prix, p); } else basP.push({ prix: p, touches: 1, depuis: j, type: 'egaux', balayee: false }); }
    }
    // 2) niveaux du jour et de la semaine PRÉCÉDENTS (connus une fois la période finie)
    if (avecJourSemaine) {
      const d = Math.floor(t / 86400e3), s = Math.floor((t / 86400e3 + 3) / 7);
      if (d !== jour) { if (jour >= 0) { jPH = jH; jPL = jL; retirer(hautsP, 'jour_prec'); retirer(basP, 'jour_prec'); hautsP.push({ prix: jPH, touches: 1, depuis: i, type: 'jour_prec', balayee: false }); basP.push({ prix: jPL, touches: 1, depuis: i, type: 'jour_prec', balayee: false }); } jour = d; jH = -Infinity; jL = Infinity; }
      if (s !== sem) { if (sem >= 0) { sPH = sH; sPL = sL; retirer(hautsP, 'semaine_prec'); retirer(basP, 'semaine_prec'); hautsP.push({ prix: sPH, touches: 1, depuis: i, type: 'semaine_prec', balayee: false }); basP.push({ prix: sPL, touches: 1, depuis: i, type: 'semaine_prec', balayee: false }); } sem = s; sH = -Infinity; sL = Infinity; }
    }
    // 3) balayage : la barre prend le niveau puis REVIENT (clôture du bon côté)
    let meilleur = null;
    for (const q of hautsP) if (!q.balayee && (q.touches >= minTouches || q.type !== 'egaux') && m15.h[i] > q.prix * (1 + marge / 100)) { q.balayee = true; if (m15.c[i] < q.prix - reprise * a && (!meilleur || q.touches > meilleur.touches)) meilleur = { ...q, sens: -1 }; }
    for (const q of basP) if (!q.balayee && (q.touches >= minTouches || q.type !== 'egaux') && m15.l[i] < q.prix * (1 - marge / 100)) { q.balayee = true; if (m15.c[i] > q.prix + reprise * a && (!meilleur || q.touches > meilleur.touches)) meilleur = { ...q, sens: 1 }; }
    if (meilleur) { sens[i] = meilleur.sens; niveau[i] = meilleur.prix; type[i] = meilleur.type; touches[i] = meilleur.touches; force[i] = a > 0 ? Math.abs((meilleur.sens < 0 ? m15.h[i] - meilleur.prix : meilleur.prix - m15.l[i])) / a : 0; }
    // 3 bis) piscine NON balayée la plus proche au-dessus et en dessous de la clôture (connue à la clôture de la barre i : causale)
    { let ph = Infinity, pb = -Infinity; const px = m15.c[i]; for (const q of hautsP) if (!q.balayee && (q.touches >= minTouches || q.type !== 'egaux') && q.prix > px && q.prix < ph) ph = q.prix; for (const q of basP) if (!q.balayee && (q.touches >= minTouches || q.type !== 'egaux') && q.prix < px && q.prix > pb) pb = q.prix; if (ph < Infinity) poolHaut[i] = ph; if (pb > -Infinity) poolBas[i] = pb; }
    // 4) mise à jour du jour / semaine en cours APRÈS les tests (la barre i n'est pas encore « précédente »)
    if (m15.h[i] > jH) jH = m15.h[i]; if (m15.l[i] < jL) jL = m15.l[i]; if (m15.h[i] > sH) sH = m15.h[i]; if (m15.l[i] < sL) sL = m15.l[i];
    // 5) ménage : piscines balayées ou trop vieilles
    if ((i & 63) === 0) { purge(hautsP, i, ageMax); purge(basP, i, ageMax); }
    if (garder && garder(i)) etats.set(i, { hauts: hautsP.filter(x => !x.balayee).map(x => ({ ...x })), bas: basP.filter(x => !x.balayee).map(x => ({ ...x })) });
  }
  return { sens, niveau, type, touches, force, poolHaut, poolBas, etatEn: i => etats.get(i) || null, piscinesFinales: () => ({ hauts: hautsP.filter(x => !x.balayee), bas: basP.filter(x => !x.balayee) }) };
}
function retirer(liste, type) { for (let k = liste.length - 1; k >= 0; k--) if (liste[k].type === type) liste.splice(k, 1); }
function purge(liste, i, ageMax) { for (let k = liste.length - 1; k >= 0; k--) if (liste[k].balayee || i - liste[k].depuis > ageMax) liste.splice(k, 1); }

/* Piscines AUTOUR d'un prix (pour la carte des aimants) : piscines non balayées de `balayagesLiquidite` + ronds psychologiques + extrêmes du range. Rend { hauts: [{prix, type, touches}], bas: […] }. */
export function piscinesAutour(piscines, prix, { ronds = [], pct = 3, hautRange = null, basRange = null } = {}) {
  const lim = prix * pct / 100, hauts = [], bas = [];
  for (const q of piscines.hauts || []) if (q.prix > prix && q.prix - prix <= lim) hauts.push({ prix: q.prix, type: q.type, touches: q.touches });
  for (const q of piscines.bas || []) if (q.prix < prix && prix - q.prix <= lim) bas.push({ prix: q.prix, type: q.type, touches: q.touches });
  for (const pas of ronds) { for (let r = Math.ceil((prix + 1e-12) / pas) * pas; r - prix <= lim; r += pas) hauts.push({ prix: r, type: 'rond', touches: 0, pas }); for (let r = Math.floor((prix - 1e-12) / pas) * pas; prix - r <= lim; r -= pas) bas.push({ prix: r, type: 'rond', touches: 0, pas }); }
  if (hautRange != null && hautRange > prix && hautRange - prix <= lim) hauts.push({ prix: hautRange, type: 'range', touches: 0 });
  if (basRange != null && basRange < prix && prix - basRange <= lim) bas.push({ prix: basRange, type: 'range', touches: 0 });
  const dedup = l => { l.sort((a, b) => a.prix - b.prix); const o = []; for (const x of l) { const p = o[o.length - 1]; if (p && Math.abs(p.prix - x.prix) / prix < 0.0004) { if ((x.touches || 0) > (p.touches || 0) || (p.type === 'rond' && x.type !== 'rond')) o[o.length - 1] = x; } else o.push(x); } return o; };
  return { hauts: dedup(hauts), bas: dedup(bas) };
}

/* ── Liquidations ESTIMÉES : on suit l'intérêt ouvert. Quand il augmente de ΔOI à prix P, on suppose que de nouvelles positions s'ouvrent à P (part long = `partLong`), réparties sur des leviers typiques ;
      prix de liquidation long ≈ P (1 − 1/L + mm), court ≈ P (1 + 1/L − mm). Quand l'intérêt ouvert baisse, tous les amas se réduisent au prorata. Un amas dont le prix est traversé par le marché est
      considéré liquidé (il disparaît). ESTIMATION : jamais une mesure. `serie` = [{ t, haut, bas, cloture, oiUsd, partLong? }] triée dans le temps (pas de 5 min avec les metrics Binance). ── */
export const LEVIERS_DEFAUT = Object.freeze([[5, 0.15], [10, 0.3], [25, 0.3], [50, 0.17], [100, 0.08]]);
export function amasLiquidationEstimes(serie, { leviers = LEVIERS_DEFAUT, mm = 0.005, pasPct = 0.1, partLongDefaut = 0.5, plancherUsd = 0 } = {}) {
  const amas = []; let oiPrec = null;                                                  // { liq, cote, usd }
  for (const s of serie) {
    // 1) liquidations par le mouvement du pas courant
    for (let k = amas.length - 1; k >= 0; k--) { const a = amas[k]; if ((a.cote === 'long' && s.bas <= a.liq) || (a.cote === 'short' && s.haut >= a.liq)) amas.splice(k, 1); }
    // 2) variation de l'intérêt ouvert
    if (oiPrec != null && s.oiUsd > 0) {
      const d = s.oiUsd - oiPrec;
      if (d > 0) { const pl = s.partLong != null ? s.partLong : partLongDefaut; for (const [L, w] of leviers) { const usd = d * w; if (usd <= 0) continue; amas.push({ liq: s.cloture * (1 - 1 / L + mm), cote: 'long', usd: usd * pl, levier: L, t: s.t }); amas.push({ liq: s.cloture * (1 + 1 / L - mm), cote: 'short', usd: usd * (1 - pl), levier: L, t: s.t }); } }
      else if (d < 0 && oiPrec > 0) { const f = 1 + d / oiPrec; for (const a of amas) a.usd *= Math.max(0, f); }
    }
    if (s.oiUsd > 0) oiPrec = s.oiUsd;
  }
  // regroupement par tranche de prix
  const dernierPrix = serie.length ? serie[serie.length - 1].cloture : 0, pas = dernierPrix * pasPct / 100, m = new Map();
  for (const a of amas) { if (!(a.usd > plancherUsd)) continue; const k = a.cote + ':' + Math.round(a.liq / pas); const e = m.get(k) || { prix: 0, cote: a.cote, usd: 0, n: 0, leviers: new Set() }; e.prix += a.liq * a.usd; e.usd += a.usd; e.n++; e.leviers.add(a.levier); m.set(k, e); }
  const out = [...m.values()].map(e => ({ prix: e.prix / e.usd, cote: e.cote, usd: e.usd, leviers: [...e.leviers].sort((a, b) => a - b), estime: true })).sort((a, b) => b.usd - a.usd);
  return { amas: out, estime: true, avertissement: 'ESTIMATION : hypothèse sur les leviers et la répartition long / short ; les positions réelles ne sont pas publiques.' };
}

/* ── Cascades de liquidations OBSERVÉES (flux forceOrder) : suite de liquidations rapprochées dont le total dépasse `seuilUsd`. `liqs` = [{ t, cote: 'long'|'short', prix, usd }] triées. ── */
export function cascadesLiquidations(liqs, { fenetreS = 60, seuilUsd = 1e6 } = {}) {
  const out = []; let c = null;
  for (const l of liqs) {
    if (c && l.t - c.fin <= fenetreS * 1000) { c.fin = l.t; c.usd += l.usd; c[l.cote] += l.usd; c.n++; c.prixFin = l.prix; if (l.prix > c.haut) c.haut = l.prix; if (l.prix < c.bas) c.bas = l.prix; }
    else { if (c && c.usd >= seuilUsd) out.push(finir(c)); c = { debut: l.t, fin: l.t, usd: l.usd, long: l.cote === 'long' ? l.usd : 0, short: l.cote === 'short' ? l.usd : 0, n: 1, prixDebut: l.prix, prixFin: l.prix, haut: l.prix, bas: l.prix }; }
  }
  if (c && c.usd >= seuilUsd) out.push(finir(c)); return out;
}
const finir = c => ({ ...c, cote: c.long >= c.short ? 'long' : 'short', mouvementPct: (c.prixFin - c.prixDebut) / c.prixDebut * 100, dureeS: (c.fin - c.debut) / 1000 });
/* Une cascade est « finie » (épuisée) quand plus aucune liquidation n'est arrivée depuis `calmeS` secondes : on n'entre JAMAIS pendant la cascade. */
export const cascadeFinie = (c, maintenantMs, calmeS = 120) => maintenantMs - c.fin >= calmeS * 1000;
