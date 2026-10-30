/* ═════════════ SUIVI SIMULÉ D'UNE PROPOSITION (V12, phase 3 ; module pur, testé : galaxie/tests/trader-suivi-test.mjs) ═════════════
   Une proposition est un ORDRE LIMITE avec un stop, une cible 1 (sortie partielle de 50 %, stop remonté à l'entrée) et une cible 2. La simulation est volontairement PRUDENTE :
   - l'ordre n'est rempli que si le prix TRAVERSE le niveau (d'au moins `filePct`) : toucher ne suffit pas (file d'attente) ;
   - si le stop et la cible tombent dans la même bougie, le STOP gagne ; une cible n'est jamais comptée dans la bougie du remplissage ;
   - l'ordre est annulé si le prix atteint la cible 1 (ou le stop) avant d'être rempli, ou à l'expiration ;
   - frais maker à l'entrée et sur les cibles, frais taker + spread + glissement sur les stops et les sorties au temps, tout converti en R.
   Le résultat n'est jamais retouché. Aucun ordre réel n'existe ici. */
export const COUTS_TRADER = Object.freeze({ fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02, filePct: 0.01 });
export const GESTIONS = Object.freeze({
  partielle: 'cible 1 en partie (50 %), stop à l’entrée, reste vers la cible 2',
  cible_fixe: 'tout à la cible 1',
  suiveur: 'moitié à la cible 1 puis stop suiveur de 1,5 ATR',
  temps: 'sortie au temps (24 bougies) sans cible 2'
});
const coutR = (pct, prix, risque) => (pct / 100) * prix / risque;

/* Simule la proposition `p` (champs : sens, entree, stop, cible1, cible2, ttl, atr, i = index de la bougie de signal) sur la série `m15`, à partir de la bougie i + 1 jusqu'à `fin` (par défaut la fin de la série).
   Rend { statut: 'en_attente' | 'ouverte' | 'cloturee' | 'expiree' | 'annulee', R, Rbrut, couts, iEntree, iSortie, motif, partielle } ; R est net de frais. */
export function simuler(m15, p, { couts = COUTS_TRADER, gestion = 'partielle', fin = m15.n - 1, maxBarres = 96 } = {}) {
  const d = p.sens, E = p.entree, S = p.stop, T1 = p.cible1, T2 = p.cible2, risque = Math.abs(E - S), i0 = p.i;
  const tick = E * (couts.filePct / 100), ttl = p.ttl || 16;
  let rempli = -1;
  for (let q = i0 + 1; q <= fin; q++) {
    const h = m15.h[q], l = m15.l[q];
    const atteintT1 = d > 0 ? h >= T1 : l <= T1, atteintS = d > 0 ? l <= S : h >= S, traverse = d > 0 ? l < E - tick : h > E + tick;
    if (q - i0 > ttl && !traverse) return { statut: 'expiree', R: 0, motif: 'expirée : l’ordre n’a pas été touché dans le délai', iSortie: q };
    if (traverse) {
      if (atteintT1 && !(d > 0 ? m15.o[q] <= E : m15.o[q] >= E)) return { statut: 'annulee', R: 0, motif: 'annulée : la cible a été atteinte sans que l’ordre soit rempli', iSortie: q };
      rempli = q; break;
    }
    if (atteintT1 || atteintS) return { statut: 'annulee', R: 0, motif: atteintS ? 'annulée : le stop a été touché avant le remplissage' : 'annulée : la cible a été atteinte sans que l’ordre soit rempli', iSortie: q };
  }
  if (rempli < 0) return { statut: 'en_attente', R: 0 };
  const maker = couts.makerPct, taker = couts.fraisPct, lent = couts.spreadPct / 2 + couts.glissementPct;
  let stop = S, reste = 1, brut = 0, cout = coutR(maker, E, risque), partielle = false, iSortie = -1, motif = null, meilleur = E;
  const sortir = (q, prix, part, type) => {
    brut += part * d * (prix - E) / risque; reste -= part;
    cout += part * (type === 'maker' ? coutR(maker, prix, risque) : coutR(taker + lent, prix, risque));
  };
  // bougie du remplissage : seul le stop peut s'y produire
  if (d > 0 ? m15.l[rempli] <= S : m15.h[rempli] >= S) { sortir(rempli, S, 1, 'taker'); return fini(rempli, 'stop touché dans la bougie du remplissage'); }
  for (let q = rempli + 1; q <= fin; q++) {
    const h = m15.h[q], l = m15.l[q], c = m15.c[q];
    if (d > 0 ? l <= stop : h >= stop) { sortir(q, stop, reste, 'taker'); return fini(q, partielle ? (gestion === 'suiveur' && stop !== E ? 'stop suiveur touché' : 'stop remonté à l’entrée touché') : 'stop touché'); }
    if (!partielle && (d > 0 ? h >= T1 : l <= T1)) {
      if (gestion === 'cible_fixe') { sortir(q, T1, reste, 'maker'); return fini(q, 'cible 1 atteinte'); }
      if (gestion !== 'temps') { sortir(q, T1, 0.5, 'maker'); partielle = true; stop = E; meilleur = d > 0 ? Math.max(E, h) : Math.min(E, l); }
    }
    if (partielle) {
      if (gestion === 'suiveur') { meilleur = d > 0 ? Math.max(meilleur, h) : Math.min(meilleur, l); const ns = meilleur - d * 1.5 * (p.atr || risque); if (d > 0 ? ns > stop : ns < stop) stop = ns; }
      else if (gestion === 'partielle' && (d > 0 ? h >= T2 : l <= T2)) { sortir(q, T2, reste, 'maker'); return fini(q, 'cible 2 atteinte'); }
    }
    const barresOuvert = q - rempli, limite = gestion === 'temps' ? 24 : maxBarres;
    if (barresOuvert >= limite) { sortir(q, c, reste, 'taker'); return fini(q, gestion === 'temps' ? 'sortie au temps' : 'sortie à la durée maximale'); }
  }
  return { statut: 'ouverte', R: 0, Rbrut: brut, iEntree: rempli, partielle, resteOuvert: reste };
  function fini(q, texte) { iSortie = q; motif = texte; const R = brut - cout; return { statut: 'cloturee', R, Rbrut: brut, couts: cout, iEntree: rempli, iSortie, motif, partielle }; }
}
