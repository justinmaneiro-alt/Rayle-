/* ═════════════ BILAN DES FLÈCHES (pur, sans DOM, testé) : trades simulés, statistiques, comparaison au hasard, correction de Holm ═════════════
   Module NOUVEAU (2026-11-13) : ne modifie aucune règle de flèche. Outil de mesure honnête, jamais un ordre ni une promesse de gain.
   Trade simulé (une règle, écrite AVANT de voir les résultats) :
     entrée = clôture de la bougie de confirmation ; stop = bord extérieur de la zone + 0,2 ATR (signal-niveaux.js) ; TP1 à 1 R, TP2 à 2 R ;
     la moitié de la position sort à TP1, l'autre moitié à TP2 ; le stop reste à sa place après TP1 (pas de passage à l'équilibre) ;
     sortie forcée à la clôture de la 48e bougie suivante ; stop et cible dans la même bougie : le stop ; stop ouvert au-delà (trou) : exécuté à l'ouverture.
   Frais : spread + glissement, en points de base du prix d'entrée, aller-retour (défaut 1,0 + 0,5 pb = 0,60 $ à 4 000 $), retirés du résultat en R (frais / risque).
   Comparaison au hasard : 1 000 tirages de N entrées aléatoires (même sens, même nombre de trades, mêmes règles de sortie, stop de même taille en ATR tiré parmi ceux des vraies flèches).
   Holm : correction pour les variantes testées ; « mieux que le hasard » seulement si n ≥ 30 ET p corrigée < 0,05. */
import { niveauxSignal } from './signal-niveaux.js';

export const PARAMS = Object.freeze({ maxBougies: 48, partTp1: 0.5, spreadPb: 1.0, glissementPb: 0.5, nMin: 30, tirages: 1000, alpha: 0.05, risque: 0.005 });
export const fraisUsd = (prix, p = PARAMS) => prix * (p.spreadPb + p.glissementPb) / 1e4;

/* trade simulé sur une série B (bougies H1 closes, tri croissant). i0 = indice de la bougie de confirmation. Renvoie null si le signal n'a pas de stop calculable ou si la série s'arrête avant l'issue. */
export function simulerTrade(B, i0, n, p = PARAMS) {
  if (!n || !(n.r > 0) || i0 < 0 || i0 >= B.length) return null;
  const dir = n.dir, E = n.entree, r = n.r; let tp1 = false, Rr = null, sortie = null, raison = null;
  const fin = Math.min(B.length - 1, i0 + p.maxBougies);
  for (let k = i0 + 1; k <= fin; k++) {
    const b = B[k]; let stop = dir > 0 ? b.l <= n.stop : b.h >= n.stop;
    if (stop) { const px = dir > 0 ? Math.min(n.stop, b.o) : Math.max(n.stop, b.o); const R = (px - E) * dir / r; Rr = tp1 ? p.partTp1 * 1 + (1 - p.partTp1) * R : R; sortie = k; raison = tp1 ? 'tp1-puis-stop' : 'stop'; break; }
    const t1 = dir > 0 ? b.h >= n.tp1 : b.l <= n.tp1, t2 = dir > 0 ? b.h >= n.tp2 : b.l <= n.tp2;
    if (t1) tp1 = true;
    if (t2) { Rr = p.partTp1 * 1 + (1 - p.partTp1) * 2; sortie = k; raison = 'tp2'; break; }
  }
  if (Rr == null) {
    if (i0 + p.maxBougies > B.length - 1) return null;   // pas encore terminé : jamais compté
    const R = (B[fin].c - E) * dir / r; Rr = tp1 ? p.partTp1 * 1 + (1 - p.partTp1) * R : R; sortie = fin; raison = tp1 ? 'tp1-puis-temps' : 'temps';
  }
  const frais = fraisUsd(E, p) / r;
  return { dir, i0, iSortie: sortie, tEntree: B[i0].t + 3600e3, tSortie: B[sortie].t + 3600e3, entree: E, stop: n.stop, tp1: n.tp1, tp2: n.tp2, r, rAtr: n.rAtr, R: Rr, Rnet: Rr - frais, frais, raison, tp1Atteint: tp1 };
}

/* flèches → trades (retournements et rebonds de base, colorées = pas contre-tendance ; les flèches invalidées comptent : l'invalidation n'est pas connue à l'entrée) */
export function tradesDeFleches(B, fleches, { indexDe = null, p = PARAMS, inclureMa = false } = {}) {
  const idx = indexDe || new Map(B.map((b, i) => [b.t, i])), out = [];
  for (const f of fleches) {
    if (f.contre || f.masquee) continue; if (f.type === 'ma_cassure' && !inclureMa) continue;
    const i0 = idx.get(f.t); if (i0 == null) continue;
    const t = simulerTrade(B, i0, niveauxSignal(f), p); if (t) { t.id = f.id; t.type = f.type; t.invalidee = !!f.invalidee; t.niveauNom = f.niveauNom || null; t.atr = f.atr; out.push(t); }
  }
  return out.sort((x, y) => x.tEntree - y.tEntree);
}

/* statistiques d'un ensemble de trades (en R) */
export function stats(T, p = PARAMS) {
  const n = T.length; if (!n) return { n: 0, assez: false };
  const brut = T.map(t => t.R), net = T.map(t => t.Rnet), somme = L => L.reduce((s, x) => s + x, 0), pf = L => { const g = somme(L.filter(x => x > 0)), q = -somme(L.filter(x => x < 0)); return q > 0 ? g / q : g > 0 ? Infinity : null; };
  const moy = L => somme(L) / L.length, ecart = L => { const m = moy(L); return Math.sqrt(somme(L.map(x => (x - m) ** 2)) / Math.max(1, L.length - 1)); };
  let serie = 0, maxSerie = 0; for (const t of T) { if (t.Rnet < 0) { serie++; maxSerie = Math.max(maxSerie, serie); } else serie = 0; }
  return { n, assez: n >= p.nMin, reussite: T.filter(t => t.Rnet > 0).length / n, reussiteBrut: T.filter(t => t.R > 0).length / n, Rmoy: moy(brut), RmoyNet: moy(net), pf: pf(brut), pfNet: pf(net), ecartNet: ecart(net), serieMax: maxSerie, achats: T.filter(t => t.dir > 0).length, ventes: T.filter(t => t.dir < 0).length, raisons: T.reduce((o, t) => { o[t.raison] = (o[t.raison] || 0) + 1; return o; }, {}) };
}

/* courbes de capital : risque fixe par trade (0,5 %), sans composé (gain additif sur le capital initial) et composé ; drawdown maximal en % du capital */
export function courbes(T, p = PARAMS) {
  const L = T.slice().sort((x, y) => x.tSortie - y.tSortie); let simple = 1, compose = 1, pS = 1, pC = 1, ddS = 0, ddC = 0; const pts = [{ t: L.length ? L[0].tEntree : 0, simple: 1, compose: 1 }];
  for (const t of L) { simple += p.risque * t.Rnet; compose *= 1 + p.risque * t.Rnet; pS = Math.max(pS, simple); pC = Math.max(pC, compose); ddS = Math.max(ddS, 1 - simple / pS); ddC = Math.max(ddC, 1 - compose / pC); pts.push({ t: t.tSortie, simple, compose }); }
  return { points: pts, finSimple: simple, finCompose: compose, ddSimple: ddS, ddCompose: ddC };
}

/* générateur pseudo-aléatoire reproductible */
export function graine(s = 20261113) { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

/* hasard : pour un ensemble réel (sens dir, n trades, tailles de stop en ATR), 1 000 ensembles de n entrées aléatoires dans les bougies éligibles. Renvoie la distribution des R nets moyens et la place du réel. */
export function hasard(B, A, { dir, reels, eligibles, p = PARAMS, rnd = graine() }) {
  const n = reels.length; if (!n || !eligibles.length) return null;
  const rAtrs = reels.map(t => t.rAtr), moyReel = reels.reduce((s, t) => s + t.Rnet, 0) / n, dist = new Array(p.tirages);
  for (let k = 0; k < p.tirages; k++) {
    let s = 0, m = 0;
    for (let j = 0; j < n; j++) {
      let t = null;
      for (let essai = 0; essai < 6 && !t; essai++) {
        const i0 = eligibles[Math.floor(rnd() * eligibles.length)], a = A[i0], rAtr = rAtrs[Math.floor(rnd() * rAtrs.length)], E = B[i0].c;
        t = simulerTrade(B, i0, { dir, entree: E, stop: E - dir * rAtr * a, r: rAtr * a, rAtr, tp1: E + dir * rAtr * a, tp2: E + dir * 2 * rAtr * a }, p);
      }
      if (t) { s += t.Rnet; m++; }
    }
    dist[k] = m ? s / m : 0;
  }
  const sup = dist.filter(x => x >= moyReel).length, pVal = (sup + 1) / (p.tirages + 1), tri = dist.slice().sort((x, y) => x - y);
  return { n, moyReel, moyHasard: dist.reduce((s, x) => s + x, 0) / dist.length, q05: tri[Math.floor(0.05 * tri.length)], q50: tri[Math.floor(0.5 * tri.length)], q95: tri[Math.floor(0.95 * tri.length)], place: dist.filter(x => x < moyReel).length / dist.length, p: pVal };
}

/* Holm-Bonferroni : p ajustées (croissantes, plafonnées à 1) */
export function holm(ps) {
  const ordre = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p), m = ps.length, aj = new Array(m); let prec = 0;
  ordre.forEach((o, k) => { const v = Math.min(1, (m - k) * o.p); prec = Math.max(prec, v); aj[o.i] = prec; });
  return aj;
}
/* verdict en mots : jamais « mieux que le hasard » sans n ≥ 30 et p corrigée < 0,05 */
export function verdict(s, pAjustee, p = PARAMS) {
  if (!s || s.n < p.nMin) return 'pas assez de données';
  if (pAjustee != null && pAjustee < p.alpha && s.RmoyNet > 0) return 'mieux que le hasard (après correction de Holm)';
  return 'pas mieux que le hasard';
}

/* ensembles : avant / après la date de réglage, achats / ventes / tous */
export function decouper(T, tReglage) {
  const avant = T.filter(t => t.tEntree < tReglage), apres = T.filter(t => t.tEntree >= tReglage), cote = (L, d) => d === 0 ? L : L.filter(t => t.dir === d);
  return { 'avant|tous': cote(avant, 0), 'avant|achats': cote(avant, 1), 'avant|ventes': cote(avant, -1), 'apres|tous': cote(apres, 0), 'apres|achats': cote(apres, 1), 'apres|ventes': cote(apres, -1) };
}
export const REGLAGE_T = Date.UTC(2026, 9, 1);   // 1er octobre 2026 : début de la période regardée pour régler les règles

/* ── bilan complet d'une série : trades, statistiques, hasard, Holm, verdicts, par ensemble (avant / après la période de réglage × tous / achats / ventes).
   B = bougies H1 closes, A = ATR (atrSerie), fleches = flèches du moteur (le filtrage « colorées » est fait ici), [de, a[ = période affichée (par entrée du trade). Même calcul que l'étude (RAPPORT-HISTORIQUE-FLECHES.md). */
/* bougie « active » : une flèche ne peut se poser que sur une bougie qui a bougé (week-ends et marché fermé : bougies plates, ATR proche de 0) ; sert à tirer les entrées au hasard */
export const actif = b => b.h > b.l && !(b.v === 0);
export function analyserEnsembles(B, A, fleches, { tReglage = REGLAGE_T, de = 0, a = Infinity, p = PARAMS, depart = 260, rnd = graine(), avecHasard = true } = {}) {
  const idx = new Map(B.map((b, i) => [b.t, i])), col = fleches.filter(f => !f.contre && f.type !== 'ma_cassure' && !f.masquee), T = tradesDeFleches(B, col, { indexDe: idx, p }).filter(t => t.tEntree >= de && t.tEntree < a);
  const ens = decouper(T, tReglage), cles = Object.keys(ens), S = {}, Hs = {};
  const eligibles = (d0, d1) => { const L = []; for (let i = Math.max(depart + 1, 40); i < B.length - p.maxBougies - 1; i++) { const t = B[i].t + 3600e3; if (t >= Math.max(d0, de) && t < Math.min(d1, a) && A[i] > 0 && actif(B[i])) L.push(i); } return L; };
  for (const c of cles) {
    S[c] = stats(ens[c], p); Hs[c] = null; if (!avecHasard || S[c].n < p.nMin) continue;
    const [per, cote] = c.split('|'), el = eligibles(per === 'avant' ? 0 : tReglage, per === 'avant' ? tReglage : Infinity), dir = cote === 'achats' ? 1 : cote === 'ventes' ? -1 : 0;
    if (dir) { Hs[c] = hasard(B, A, { dir, reels: ens[c], eligibles: el, p, rnd }); continue; }
    const ta = ens[c].filter(t => t.dir > 0), tv = ens[c].filter(t => t.dir < 0), ha = ta.length ? hasard(B, A, { dir: 1, reels: ta, eligibles: el, p, rnd }) : null, hv = tv.length ? hasard(B, A, { dir: -1, reels: tv, eligibles: el, p, rnd }) : null;
    if (!ha || !hv) { Hs[c] = ha || hv; continue; }
    const w = ta.length / (ta.length + tv.length); Hs[c] = { moyReel: S[c].RmoyNet, moyHasard: w * ha.moyHasard + (1 - w) * hv.moyHasard, p: Math.max(ha.p, hv.p), place: Math.min(ha.place, hv.place), q05: w * ha.q05 + (1 - w) * hv.q05, q95: w * ha.q95 + (1 - w) * hv.q95, n: ta.length + tv.length, melange: true };
  }
  const ps = cles.map(c => Hs[c] ? Hs[c].p : 1), aj = holm(ps), padj = {}, verd = {}; cles.forEach((c, j) => { padj[c] = Hs[c] ? aj[j] : null; verd[c] = verdict(S[c], padj[c], p); });
  return { T, ens, S, Hs, padj, verd, courbes: courbes(T, p) };
}
