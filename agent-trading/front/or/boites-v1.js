/* ═════════════ BOÎTES DE RETOURNEMENT — règle figée « boites-v1 » (SHA-256 dans boites-v1.sceau.json, posé AVANT l'affichage et AVANT les statistiques) ═════════════
   Document de référence : STRATEGIE-RAYLE.md §4. Fonctions pures, sans DOM. Bougies H1 CLOSES { t, o, h, l, c, v }.
   Niveaux candidats : swings H4 (fractale de 5, connus à la clôture de la 5e bougie H4 suivante), haut/bas de la veille et de la semaine précédente (jour de marché ict-v1),
   niveaux de volume (POC, VAH, VAL, nœuds) du profil des 5 jours de marché COMPLETS qui précèdent le jour en cours (figé pour la journée). Confluence = nombre de natures différentes
   dans une fenêtre de ±0,3 ATR. Une zone est invalidée par une clôture H1 à plus de 0,25 ATR (ATR à la formation) au-delà : elle ne revient pas. Tout est causal : l'état à la bougie i
   ne dépend que des bougies ≤ i. Une description, jamais un ordre. */
import { atrSerie, agreger, analyser as analyserStructure } from './structure-marche-v1.js';
import { jourMarche, jours } from './ict-v1.js';

export const VERSION = 'boites-v1', FIGEES_LE = '2026-11-11';
export const P = Object.freeze({
  fenetre: 0.3,            // ±0,3 ATR autour du centre : largeur de regroupement 0,6 ATR
  confluenceMin: 2, probaMin: 0.5, nMin: 15, distanceMaxAtr: 4, maxParCote: 2,
  hauteurMinAtr: 0.1, hauteurMaxAtr: 0.3,   // hauteur dessinée
  prolongement: 40,        // bougies à droite au maximum
  invalidationAtr: 0.25, arriveeAtr: 0.25,
  gainAtr: 1, perteAtr: 1, bougies: 12,      // retournement = +1 ATR (loin de la zone) avant 1 ATR au-delà (cassure), 12 bougies depuis la clôture d'arrivée
  swingK: 5, swingsMax: 30, ageSwing: 700, profilJours: 5, vaPct: 0.7
});
export const NATURES = Object.freeze({ swing_h4: 'swing H4', veille: 'veille', semaine: 'semaine précédente', volume: 'volume' });
export const TEXTE_REGLES = 'Boîtes v1 : niveaux = swings H4, haut/bas de la veille et de la semaine, niveaux de volume (POC, VAH, VAL, nœuds) ; zone = au moins 2 natures différentes dans ±0,3 ATR ; affichée si la probabilité mesurée de retournement (+1 ATR avant −1 ATR de cassure, 12 bougies) est ≥ 50 % avec n ≥ 15, à ≤ 4 ATR du prix, 2 au plus de chaque côté.';
const H = 3600e3;

/* ── préparation (une fois par série ; tout est indexé par bougie et causal) ── */
export function preparer(B, R = P) {
  const n = B.length, A = atrSerie(B), H4 = agreger(B, 4 * H), sw = [];
  const K = R.swingK;
  for (let j = K; j + K < H4.length; j++) {
    let h = true, l = true; for (let k = 1; k <= K && (h || l); k++) { if (!(H4[j].h > H4[j - k].h && H4[j].h > H4[j + k].h)) h = false; if (!(H4[j].l < H4[j - k].l && H4[j].l < H4[j + k].l)) l = false; }
    const tConnu = H4[j + K].t + 4 * H;
    if (h) sw.push({ type: 'H', p: H4[j].h, tBar: H4[j].t, tConnu }); if (l) sw.push({ type: 'L', p: H4[j].l, tBar: H4[j].t, tConnu });
  }
  sw.sort((a, b) => a.tConnu - b.tConnu);
  const J = jours(B), jourDe = new Int32Array(n); J.forEach((g, d) => { for (let i = g.i0; i <= g.i1; i++) jourDe[i] = d; });
  const sem = new Map(); J.forEach((g, d) => { let w = sem.get(g.semaine); if (!w) { w = { cle: g.semaine, h: -Infinity, l: Infinity, d0: d, d1: d }; sem.set(g.semaine, w); } w.h = Math.max(w.h, g.h); w.l = Math.min(w.l, g.l); w.d1 = d; });
  const semL = [...sem.values()], semDe = J.map(g => semL.findIndex(w => w.cle === g.semaine));
  // tables creuses des clôtures (max / min sur un intervalle)
  const LOG = Math.max(1, Math.ceil(Math.log2(n + 1))), mx = [Float64Array.from(B, b => b.c)], mn = [Float64Array.from(B, b => b.c)];
  for (let k = 1; k < LOG; k++) { const pm = mx[k - 1], pn = mn[k - 1], m1 = new Float64Array(n), n1 = new Float64Array(n), d = 1 << (k - 1); for (let i = 0; i + (1 << k) <= n; i++) { m1[i] = Math.max(pm[i], pm[i + d]); n1[i] = Math.min(pn[i], pn[i + d]); } mx.push(m1); mn.push(n1); }
  const requete = (T, f, a, b) => { const k = Math.floor(Math.log2(b - a + 1)); return f(T[k][a], T[k][b - (1 << k) + 1]); };
  return { B, n, A, sw, J, jourDe, semL, semDe, profils: new Map(), mx, mn,
    maxClose: (a, b) => (b < a ? -Infinity : requete(mx, Math.max, a, b)), minClose: (a, b) => (b < a ? Infinity : requete(mn, Math.min, a, b)),
    premierIdx(t) { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t < t) lo = m + 1; else hi = m; } return lo; } };
}
/* profil de volume des 5 jours complets qui précèdent le jour d : POC, VAH, VAL, nœuds. Figé pour la journée d. */
function profilVolume(prep, d, R = P) {
  if (prep.profils.has(d)) return prep.profils.get(d); const { B, J, A } = prep; let res = null;
  if (d >= 1) {
    const d0 = Math.max(0, d - R.profilJours), i0 = J[d0].i0, i1 = J[d - 1].i1; let a = null; for (let i = J[d].i0; i >= 0 && a == null; i--) a = A[i];
    if (a != null && i1 >= i0) {
      let lo = Infinity, hi = -Infinity, vt = 0; for (let i = i0; i <= i1; i++) { lo = Math.min(lo, B[i].l); hi = Math.max(hi, B[i].h); vt += B[i].v || 0; }
      const bin = Math.max(0.05, 0.1 * a), nb = Math.max(1, Math.ceil((hi - lo) / bin) + 1), vol = new Float64Array(nb);
      if (vt > 0) {
        for (let i = i0; i <= i1; i++) { const b = B[i], v = b.v || 0; if (!v) continue; const k0 = Math.floor((b.l - lo) / bin), k1 = Math.max(k0, Math.floor((b.h - lo) / bin)), part = v / (k1 - k0 + 1); for (let k = k0; k <= k1; k++) vol[k] += part; }
        let poc = 0; for (let k = 1; k < nb; k++) if (vol[k] > vol[poc]) poc = k;
        let acc = vol[poc], a1 = poc, b1 = poc; const cible = R.vaPct * vt;
        while (acc < cible && (a1 > 0 || b1 < nb - 1)) { const g = a1 > 0 ? vol[a1 - 1] : -1, dr = b1 < nb - 1 ? vol[b1 + 1] : -1; if (g >= dr) { a1--; acc += vol[a1]; } else { b1++; acc += vol[b1]; } }
        const moy = vt / nb, noeuds = []; for (let k = 3; k < nb - 3; k++) { if (Math.abs(k - poc) < 3) continue; let max = true; for (let q = -3; q <= 3; q++) if (q && vol[k + q] > vol[k]) max = false; if (max && vol[k] >= 1.5 * moy) noeuds.push({ k, v: vol[k] }); }
        noeuds.sort((x, y) => y.v - x.v);
        res = { t: B[J[d].i0].t, poc: lo + (poc + 0.5) * bin, vah: lo + (b1 + 1) * bin, val: lo + a1 * bin, noeuds: noeuds.slice(0, 3).map(q => lo + (q.k + 0.5) * bin) };
      }
    }
  }
  prep.profils.set(d, res); return res;
}
/* niveaux candidats à la bougie i (clôture de i) */
export function niveauxA(prep, i, R = P) {
  const { B, J, jourDe, semL, semDe, sw } = prep, d = jourDe[i], L = [], tNow = B[i].t + H;
  // swings H4 connus à la clôture de i, les plus récents (au plus swingsMax, âge ≤ ageSwing bougies)
  let hi = 0, lo2 = 0, n2 = sw.length; while (lo2 < n2) { const m = (lo2 + n2) >> 1; if (sw[m].tConnu <= tNow) lo2 = m + 1; else n2 = m; } hi = lo2;
  for (let k = hi - 1, c = 0; k >= 0 && c < R.swingsMax; k--, c++) { const s = sw[k]; if (tNow - s.tBar > R.ageSwing * H) break; L.push({ nature: 'swing_h4', nom: s.type === 'H' ? 'Sommet H4' : 'Creux H4', p: s.p, t: s.tConnu }); }
  if (d >= 1) { const pj = J[d - 1], t0 = B[J[d].i0].t; L.push({ nature: 'veille', nom: 'Haut de la veille', p: pj.h, t: t0 }, { nature: 'veille', nom: 'Bas de la veille', p: pj.l, t: t0 }); }
  const w = semDe[d]; if (w >= 1) { const pw = semL[w - 1], t0 = B[J[semL[w].d0].i0].t; L.push({ nature: 'semaine', nom: 'Haut de la semaine précédente', p: pw.h, t: t0 }, { nature: 'semaine', nom: 'Bas de la semaine précédente', p: pw.l, t: t0 }); }
  const pf = profilVolume(prep, d, R); if (pf) { L.push({ nature: 'volume', nom: 'POC', p: pf.poc, t: pf.t }, { nature: 'volume', nom: 'VAH', p: pf.vah, t: pf.t }, { nature: 'volume', nom: 'VAL', p: pf.val, t: pf.t }); for (const q of pf.noeuds) L.push({ nature: 'volume', nom: 'Nœud de volume', p: q, t: pf.t }); }
  return L;
}
const mediane = v => { const s = v.slice().sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
/* zones à la bougie i : regroupement des niveaux, confluence ≥ 2, validité (non invalidée), côté (vente au-dessus du prix, achat en dessous) */
export function zonesA(prep, i, R = P) {
  const { B, A } = prep, a = A[i]; if (a == null || i < 30) return [];
  const L = niveauxA(prep, i, R).sort((x, y) => x.p - y.p), Z = [], c = B[i].c, largeur = 2 * R.fenetre * a;
  for (let s = 0; s < L.length;) {
    let e = s + 1; while (e < L.length && L[e].p - L[s].p <= largeur) e++;
    const G = L.slice(s, e), natures = new Set(G.map(q => q.nature)); s = e;
    if (natures.size < R.confluenceMin) continue;
    const prix = mediane(G.map(q => q.p)), h = Math.min(R.hauteurMaxAtr * a, Math.max(R.hauteurMinAtr * a, G[G.length - 1].p - G[0].p)), tF = Math.max(...G.map(q => q.t)), idxF = Math.min(i, prep.premierIdx(tF));
    const bas = prix - h / 2, haut = prix + h / 2, aF = A[idxF] ?? a;
    const cote = c < bas ? 'vente' : c > haut ? 'achat' : (prix - B[Math.max(0, i - 3)].c >= 0 ? 'vente' : 'achat');
    const mxC = prep.maxClose(idxF + 1, i), mnC = prep.minClose(idxF + 1, i);
    const invalide = cote === 'vente' ? mxC > haut + R.invalidationAtr * aF : mnC < bas - R.invalidationAtr * aF;
    let tInval = null; if (invalide) { for (let k = idxF + 1; k <= i; k++) if (cote === 'vente' ? B[k].c > haut + R.invalidationAtr * aF : B[k].c < bas - R.invalidationAtr * aF) { tInval = B[k].t + H; break; } }
    Z.push({ id: `${cote}|${Math.round(prix / 0.5)}`, cote, prix, bas, haut, conf: natures.size, natures: [...natures].sort(), niveaux: G.map(q => ({ nom: q.nom, nature: q.nature, p: q.p })), tFormation: tF, idxF, tInval, invalide: !!invalide, atr: a });
  }
  return Z;
}
export const classeConf = z => (z.conf >= 4 ? 'conf=4+' : `conf=${z.conf}`);
/* probabilité mesurée de la classe d'une zone (statistiques Dukascopy) */
export function probaZone(stats, z) {
  const c = stats && stats.zones && stats.zones[z.cote] && stats.zones[z.cote][classeConf(z)]; return c || null;
}
/* sélection à afficher : à ≤ 4 ATR, probabilité ≥ 50 % et n ≥ 15, 2 au plus de chaque côté ; sinon « Pas de zone forte à proximité » */
export function selectionner(zones, { prix, atr, stats, R = P, fenetreStats = 'long', tout = false } = {}) {   // tout = mode Complet : toutes les zones valides à ≤ 4 ATR, même sans probabilité suffisante
  const sortie = []; if (!atr) return { zones: [], message: 'Pas de zone forte à proximité' };
  for (const z of zones) {
    if (z.invalide) continue; const dist = z.bas > prix ? (z.bas - prix) / atr : z.haut < prix ? (prix - z.haut) / atr : 0; if (dist > R.distanceMaxAtr) continue;
    const cel = probaZone(stats, z), x = cel && cel[fenetreStats]; const qualifie = !!x && x.nT >= R.nMin && x.taux >= R.probaMin;   // taux = part des issues tranchées ; n = nombre d'issues tranchées
    if (!qualifie && !tout) continue;
    sortie.push({ ...z, distAtr: dist, proba: x ? x.taux : null, n: x ? x.nT : null, cellule: cel, qualifie });
  }
  const pick = cote => sortie.filter(z => z.cote === cote).sort((a, b) => a.distAtr - b.distAtr || b.proba - a.proba).slice(0, R.maxParCote);
  const L = [...pick('vente'), ...pick('achat')].sort((a, b) => b.prix - a.prix);
  return { zones: L, message: L.length ? null : 'Pas de zone forte à proximité' };
}
/* début et fin d'affichage d'une zone : de sa formation à 40 bougies à droite de la dernière bougie, ou jusqu'à l'invalidation */
export function etendue(z, tDerniere, R = P) { return { tDebut: z.tFormation, tFin: z.tInval != null ? z.tInval : tDerniere + R.prolongement * H }; }

/* ── ligne de retournement : le dernier creux (sommet) protégé de la structure H1 ── */
export function ligneRetournement(sm, B) {
  if (!sm || !sm.etat) return null; const e = sm.etat, ten = e.tendance;
  if (ten > 0 && e.protegeBas) return { dir: -1, p: e.protegeBas.p, tDebut: e.protegeBas.t, texte: `Retournement baissier si clôture H1 sous ${Math.round(e.protegeBas.p).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`, detail: ['dernier creux protégé de la structure H1 (fractale de 5)', 'tant que le prix clôture au-dessus, la tendance H1 haussière tient'] };
  if (ten < 0 && e.protegeHaut) return { dir: 1, p: e.protegeHaut.p, tDebut: e.protegeHaut.t, texte: `Retournement haussier si clôture H1 au-dessus de ${Math.round(e.protegeHaut.p).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`, detail: ['dernier sommet protégé de la structure H1 (fractale de 5)', 'tant que le prix clôture en dessous, la tendance H1 baissière tient'] };
  return null;
}
/* les 3 dernières cassures de structure (MSS = changement de caractère, BOS = cassure) en étiquettes courtes */
export function dernieresCassures(sm, B, max = 3) {
  if (!sm) return []; return sm.events.filter(e => e.type === 'bos' || e.type === 'choch').slice(-max).map(e => { const k = Math.max(0, e.i - 15); return { type: e.type === 'choch' ? 'MSS' : 'BOS', dir: e.dir, t: B[e.i].t, tNiveau: B[k].t, niveau: e.niveau }; });
}
