/* SIMULATEUR de l'étude « fenêtre récente » : entrée à l'ouverture de i+1 ; stop initial = stopInit × ATR(i) (= 1 R) ; chandelier optionnel (N × ATR courant depuis le plus haut / bas atteint, jamais relâché) ;
   cible optionnelle (niveau de prix : sortie quand il est atteint, à l'ouverture si la bougie ouvre au-delà) ; AUCUNE sortie par le temps ; sécurité à 48 bougies ; stop supposé touché avant tout relèvement dans une bougie ; gap = ouverture.
   Frais : CFD = spread observé + 0,5 $ ; Kraken = 0,05 % par côté + 0,5 $. Filtre de coût optionnel : ATR(i) ≥ 5 × coût aller-retour du scénario. */
import { LIMITE_BOUGIES } from './familles-recent.mjs';
export const coutAR = (X, e, scen, entree, sortie) => (scen === 'cfd' ? X.sp[e] + 0.5 : 0.0005 * (entree + sortie) + 0.5);
export function essaiRecent(X, i, d, cfg, scen, cible = null) {
  const e = i + 1; if (e >= X.n) return null; const a = X.atr[i]; if (!(a > 0)) return null; const dist = cfg.stopInit * a, entree = X.o[e];
  if (cfg.filtre && a < 5 * coutAR(X, e, scen, entree, entree)) return null;
  let stop = entree - d * dist, ext = d > 0 ? X.h[e] : X.l[e], sortie = null, jS = null, raison = 'securite'; const dernier = Math.min(X.n - 1, e + LIMITE_BOUGIES - 1);
  for (let j = e; j <= dernier; j++) {
    if (j > e && (d > 0 ? X.o[j] <= stop : X.o[j] >= stop)) { sortie = X.o[j]; jS = j; raison = 'stop'; break; }
    if (d > 0 ? X.l[j] <= stop : X.h[j] >= stop) { sortie = stop; jS = j; raison = 'stop'; break; }
    if (cible != null && (d > 0 ? X.h[j] >= cible : X.l[j] <= cible)) { sortie = (d > 0 ? X.o[j] >= cible : X.o[j] <= cible) ? X.o[j] : cible; jS = j; raison = 'cible'; break; }
    if (j === dernier) { sortie = X.c[j]; jS = j; raison = 'securite'; break; }
    if (cfg.chandelier) { ext = d > 0 ? Math.max(ext, X.h[j]) : Math.min(ext, X.l[j]); if (X.atr[j] > 0) { const ch = ext - d * cfg.chandelier * X.atr[j]; stop = d > 0 ? Math.max(stop, ch) : Math.min(stop, ch); } }
  }
  const brut = d * (sortie - entree), cout = coutAR(X, e, scen, entree, sortie);
  return { i, e, d, entree, sortie, jSortie: jS, bougies: jS - e + 1, raison, dist, Rbrut: brut / dist, R: (brut - cout) / dist, t: X.t[e], tSortie: X.t[jS] };
}
export function enchainerRecent(X, sigs, cfg, scen, { de = -Infinity, a = Infinity } = {}) {
  const T = []; let libre = -1;
  for (const s of sigs) { if (s.i < libre) continue; const t = X.t[s.i + 1]; if (t == null || t < de || t >= a) continue; const r = essaiRecent(X, s.i, s.d, cfg, scen, s.cible ?? null); if (!r) continue; T.push(r); libre = r.jSortie; }
  return T;
}
