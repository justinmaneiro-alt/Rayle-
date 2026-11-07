/* Niveaux, liquidité et flèches sur les VRAIES données (Kraken par le relais, Binance), toutes les périodes : node agent-trading/tests/niveaux-reel.mjs
   Affiche les bandes choisies, la liquidité, le nombre de flèches, le bilan et le temps de calcul. Lecture seulement, rien n'est écrit. */
import { chargerHistorique, serieAffichee } from '../front/or/historique-or.js';
import { ecartMesure } from '../front/or/bougies-or.js';
import { niveauxPeriode, liquidite, fleches, bilanFleches } from '../front/or/niveaux-periode.js';
const maintenant = Date.now(), H15 = await chargerHistorique('M15', { maintenant }), ecart = ecartMesure(H15.k, H15.vol).ecart;
console.log('écart Kraken − Binance', ecart);
for (const P of (process.argv[2] || 'M5,M15,H1,H4,J').split(',')) {
  const H = P === 'M15' ? H15 : await chargerHistorique(P, { maintenant }), S = serieAffichee(H, H.k, ecart), V = new Map(H.vol.map(b => [b.t, b.v])), prix = H.k.at(-1).c;
  const t0 = performance.now(), N = niveauxPeriode(S, { periode: P, maintenant, prix }), t1 = performance.now();
  const L = liquidite(S, { periode: P, maintenant, prix, a: N.a, pivotsL: N.pivots, i0: N.i0 }), t2 = performance.now();
  const F = fleches(S, { periode: P, maintenant, volumes: V }), t3 = performance.now(), Bi = bilanFleches(S, F, { periode: P, maintenant }), t4 = performance.now();
  const vue = S.slice(-150), hi = Math.max(...vue.map(b => b.h)), lo = Math.min(...vue.map(b => b.l));
  console.log(`\n── ${P} : ${S.length} bougies, prix ${prix}, ATR ${N.a.toFixed(2)}, vue 150 : ${lo.toFixed(0)} → ${hi.toFixed(0)}`);
  for (const b of N.bandes) console.log(`  ${b.fort ? '■' : '□'} ${b.texte}${b.extreme ? ' (extrême)' : ''}`);
  for (const z of L.zones) console.log('  ┄', z.texte); console.log(`  balayages : ${L.balayages.length}`);
  console.log(`  flèches : ${F.length} (${F.filter(f => f.sens === 'hausse').length} ↑) · ${Bi.texte}`);
  console.log(`  temps : niveaux ${(t1 - t0).toFixed(0)} ms, liquidité ${(t2 - t1).toFixed(0)} ms, flèches ${(t3 - t2).toFixed(0)} ms, bilan ${(t4 - t3).toFixed(0)} ms`);
}
