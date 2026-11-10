/* SIMULATEUR « gros mouvements » (1) : entrée à l'ouverture de i+1 ; stop initial 1,5 ATR(i) = 1 R ; chandelier N × ATR depuis le plus haut (bas) atteint, recalculé à la clôture de chaque bougie avec l'ATR de cette bougie,
   jamais relâché ; break-even optionnel après un plus haut ≥ +1 R (à partir de la bougie suivante) ; AUCUNE sortie par le temps ; sécurité : sortie à la clôture de la 48e bougie. Dans une bougie le stop est supposé touché avant tout
   relèvement (hypothèse défavorable) ; gap : sortie à l'ouverture. Frais : CFD = spread observé + 0,5 $ ; Kraken = 0,05 % par côté + 0,5 $ ; filtre de coût : ATR(i) ≥ 5 × coût aller-retour du scénario. */
import { STOP_INITIAL_ATR, LIMITE_BOUGIES, FILTRE_COUT } from './familles-gros.mjs';
export const coutAR = (X, e, scen, entree, sortie = entree) => (scen === 'cfd' ? X.sp[e] + 0.5 : 0.0005 * (entree + sortie) + 0.5);
export function essaiGros(X, i, d, cfg, scen) {
  const e = i + 1; if (e >= X.n) return null; const a = X.atr[i]; if (!(a > 0)) return null; const dist = STOP_INITIAL_ATR * a, entree = X.o[e];
  if (a < FILTRE_COUT * coutAR(X, e, scen, entree, entree)) return null;   // filtre de coût (estimation du coût avec le prix d'entrée pour les deux côtés)
  let stop = entree - d * dist, ext = d > 0 ? X.h[e] : X.l[e], be = false, sortie = null, jS = null, raison = 'securite'; const dernier = Math.min(X.n - 1, e + LIMITE_BOUGIES - 1);
  for (let j = e; j <= dernier; j++) {
    if (j > e && (d > 0 ? X.o[j] <= stop : X.o[j] >= stop)) { sortie = X.o[j]; jS = j; raison = 'stop'; break; }
    if (d > 0 ? X.l[j] <= stop : X.h[j] >= stop) { sortie = stop; jS = j; raison = 'stop'; break; }
    if (j === dernier) { sortie = X.c[j]; jS = j; raison = 'securite'; break; }
    ext = d > 0 ? Math.max(ext, X.h[j]) : Math.min(ext, X.l[j]);
    const ch = ext - d * cfg.chandelier * X.atr[j]; if (X.atr[j] > 0) stop = d > 0 ? Math.max(stop, ch) : Math.min(stop, ch);
    if (cfg.be && !be && d * (ext - entree) >= dist) { be = true; stop = d > 0 ? Math.max(stop, entree) : Math.min(stop, entree); }
  }
  const brut = d * (sortie - entree), cout = coutAR(X, e, scen, entree, sortie);
  return { i, e, d, entree, sortie, jSortie: jS, bougies: jS - e + 1, raison, dist, Rbrut: brut / dist, R: (brut - cout) / dist, an: X.an[e], t: X.t[e] };
}
export function enchainerGros(X, sigs, spec, scen, { de = -Infinity, a = Infinity } = {}) {
  const T = []; let libre = -1;
  for (const s of sigs) { if (s.i < libre) continue; const an = X.an[s.i + 1]; if (an == null || an < de || an > a) continue; const r = essaiGros(X, s.i, s.d, spec, scen); if (!r) continue; T.push(r); libre = r.jSortie; }
  return T;
}
