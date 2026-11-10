/* SIMULATEUR 1 (utilisé par la recherche). Règles documentées :
   - signal à la clôture de la bougie H1 i ; ENTRÉE à l'ouverture de i+1 (jamais avant) ;
   - stop = stopK × ATR14(i) (distance fixe, = 1 R) ; sortie par temps à la clôture de la bougie i+6 au plus ; un seul trade à la fois ;
   - les données sont des prix BID : le spread observé est payé une fois (scénario CFD) ; 0,5 $ de frais fixes (aller-retour) dans les deux scénarios ;
   - scénario Kraken Futures : 0,05 % par côté (sur le prix d'entrée et de sortie) + 0,5 $, sans spread ;
   - dans une même bougie, le STOP est supposé touché avant toute amélioration (stop suiveur, break-even) : hypothèse défavorable ;
   - gap : si une bougie ouvre au-delà du stop, la sortie se fait à l'ouverture (pire que le stop) ;
   - stop suiveur : après la clôture de chaque bougie, stop = max(stop, clôture − 1 distance) (achat) ; break-even : après un plus haut ≥ entrée + 1 R, le stop passe à l'entrée à partir de la bougie suivante.
   Le verdict se juge sur le scénario le plus défavorable. */
export const FRAIS_FIXE = 0.5, TAUX_KRAKEN = 0.0005, MAX_BOUGIES = 6;
export function essai(X, i, d, stopK, mgmt) {
  const e = i + 1; if (e + 0 >= X.n) return null; const dist = stopK * X.atr[i]; if (!(dist > 0)) return null;
  const entree = X.o[e]; let stop = entree - d * dist, sortie = null, jSortie = null, raison = 'temps', be = false;
  const dernier = Math.min(X.n - 1, e + MAX_BOUGIES - 1);
  for (let j = e; j <= dernier; j++) {
    if (j > e && X.t[j] - X.t[j - 1] > 6 * 3600e3 && false) { /* les week-ends sont des gaps normaux : traités par l'ouverture */ }
    const gapStop = d > 0 ? X.o[j] <= stop : X.o[j] >= stop;
    if (gapStop && j > e) { sortie = X.o[j]; jSortie = j; raison = 'stop'; break; }
    const touche = d > 0 ? X.l[j] <= stop : X.h[j] >= stop;
    if (touche) { sortie = stop; jSortie = j; raison = 'stop'; break; }
    if (j === dernier) { sortie = X.c[j]; jSortie = j; raison = 'temps'; break; }
    if (mgmt === 'trail') { const s2 = X.c[j] - d * dist; stop = d > 0 ? Math.max(stop, s2) : Math.min(stop, s2); }
    else if (mgmt === 'be') { if (!be && (d > 0 ? X.h[j] >= entree + dist : X.l[j] <= entree - dist)) { be = true; stop = entree; } }
  }
  const brut = d * (sortie - entree), cfd = X.sp[e] + FRAIS_FIXE, krk = TAUX_KRAKEN * (entree + sortie) + FRAIS_FIXE;
  return { i, e, d, entree, sortie, jSortie, raison, dist, Rbrut: brut / dist, Rc: (brut - cfd) / dist, Rk: (brut - krk) / dist, an: X.an[e], t: X.t[e] };
}
/* enchaîne les signaux : un seul trade à la fois (un signal n'est pris que si la bougie du signal est ≥ la bougie de sortie du trade précédent) */
export function enchainer(X, sigs, spec, { de = -Infinity, a = Infinity } = {}) {
  const T = []; let libre = -1;
  for (const s of sigs) { if (s.i < libre) continue; const an = X.an[s.i + 1]; if (an == null || an < de || an > a) continue; const r = essai(X, s.i, s.d, spec.stopK, spec.mgmt); if (!r) continue; T.push(r); libre = r.jSortie; }
  return T;
}
