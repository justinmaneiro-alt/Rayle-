/* ═════════════ REJEU PAS À PAS (M6 ; module pur, testé : planetes/mars/tests/m6-graphique-test.mjs) ═════════════
   Rejoue un trade ou une période bougie par bougie, comme si on était à l'époque : à chaque pas on ne voit QUE le passé (jamais la bougie suivante), les indicateurs sont recalculés sur ce passé,
   la position apparaît à son entrée, le stop / l'objectif se déclenchent à leur bougie. Le contrôleur ne dessine rien : il rend l'état à afficher. */
export function creerRejeu({ bougies, debut = 1, entree = null, vitesse = 1 }) {
  if (!bougies || bougies.length < 2) throw new Error('rejeu : il faut au moins deux bougies');
  let i = Math.max(1, Math.min(bougies.length, debut)), v = vitesse;
  const etat = () => {
    const vues = bougies.slice(0, i), der = vues[vues.length - 1], out = { i, total: bougies.length, derniere: der, vues, fini: i >= bougies.length, vitesse: v, position: null };
    if (entree) {
      const pris = der.t >= entree.t, sorti = entree.tSortie != null && der.t >= entree.tSortie;
      out.position = pris ? { sens: entree.sens, entree: entree.prixEntree, stop: entree.stop, cible: entree.cible, sortie: sorti ? { prix: entree.prixSortie, motif: entree.motif, R: entree.R, t: entree.tSortie } : null, ouverte: !sorti } : null;
      out.phrase = !pris ? 'Avant l’entrée : on attend le signal.' : sorti ? 'Sortie (' + entree.motif + ') : ' + (entree.R >= 0 ? '+' : '−') + Math.abs(entree.R).toFixed(2).replace('.', ',') + ' R.' : 'Position ouverte ' + (entree.sens > 0 ? '(achat)' : '(vente)') + ' : stop ' + entree.stop + ', objectif ' + entree.cible + '.';
    }
    return out;
  };
  return {
    etat,
    pas(d = 1) { i = Math.max(1, Math.min(bougies.length, i + d)); return etat(); },
    allerA(t) { let k = bougies.findIndex(b => b.t >= t); if (k < 0) k = bougies.length - 1; i = k + 1; return etat(); },
    allerAuDebut() { i = 1; return etat(); },
    vitesse(x) { v = Math.max(0.25, Math.min(16, x)); return v; },
    delaiMs: () => Math.round(700 / v)
  };
}
/* Fenêtre de bougies autour d'un trade pour le rejeu : 20 bougies avant l'entrée, 8 après la sortie. */
export function fenetreTrade(trade, pas = 900e3) { return { t0: trade.t - 20 * pas, t1: (trade.tSortie || trade.t) + 8 * pas }; }
