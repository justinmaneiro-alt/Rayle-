/* ÉTUDE « GROS MOUVEMENTS » : liste fermée de 24 variantes, figée avec SHA-256 (liste-gros-figee.json) AVANT tout calcul.
   ENTRÉE : famille p (démarrage confirmé, `familles.mjs` p2, définition inchangée) SEULEMENT si au moins un précurseur d'expansion est présent à la clôture de la bougie de confirmation i :
     P1 balayage du plus haut/bas de la veille (dans les 3 dernières bougies : mèche au-delà puis clôture en deçà) ; P2 ouverture de Londres (07h–09h Paris) ou de New York (14h30–16h30 Paris) : heure de Paris de l'OUVERTURE de la bougie i ;
     P3 clôture à plus de 1,5 écart-type du VWAP de séance ; P4 compression : ATR14 de la bougie i−1 sous sa médiane des 100 bougies précédentes. Les 4 testés seuls, puis « au moins 1 », « au moins 2 ».
   FILTRE DE COÛT : ATR H1 (bougie i) ≥ 5 × coût aller-retour du scénario (CFD : spread + 0,5 $ ; Kraken : 0,1 % du prix + 0,5 $), évalué séparément pour chaque scénario.
   SORTIES : AUCUNE sortie par le temps. Stop initial 1,5 ATR (= 1 R) ; stop suiveur « chandelier » à 2, 3 ou 4 ATR depuis le plus haut (bas) atteint, jamais relâché ; variante break-even après +1 R puis chandelier 3 ATR ; limite de sécurité à 48 bougies H1. */
export const ENTREES = Object.freeze([
  { id: 'P1', nom: 'balayage de la veille', min: 1, qui: [0] }, { id: 'P2', nom: 'ouverture de Londres ou de New York', min: 1, qui: [1] }, { id: 'P3', nom: 'prix à plus de 1,5 écart-type du VWAP', min: 1, qui: [2] }, { id: 'P4', nom: 'compression de volatilité', min: 1, qui: [3] },
  { id: 'C1', nom: 'au moins 1 précurseur', min: 1, qui: [0, 1, 2, 3] }, { id: 'C2', nom: 'au moins 2 précurseurs', min: 2, qui: [0, 1, 2, 3] }
]);
export const SORTIES = Object.freeze([{ id: 'ch2', nom: 'chandelier 2 ATR', chandelier: 2, be: false }, { id: 'ch3', nom: 'chandelier 3 ATR', chandelier: 3, be: false }, { id: 'ch4', nom: 'chandelier 4 ATR', chandelier: 4, be: false }, { id: 'be3', nom: 'break-even après +1 R puis chandelier 3 ATR', chandelier: 3, be: true }]);
export const STOP_INITIAL_ATR = 1.5, LIMITE_BOUGIES = 48, FILTRE_COUT = 5;
export const SPECS_GROS = ENTREES.flatMap(e => SORTIES.map(s => ({ id: `g-${e.id}-${s.id}`, famille: 'g-' + e.id, libelle: `Démarrage confirmé + ${e.nom} · ${s.nom}`, entree: e.id, sortie: s.id, min: e.min, qui: e.qui, chandelier: s.chandelier, be: s.be })));
/* précurseurs à la bougie i : tableau de 4 booléens (Uint8) par bougie. `parisMin[i]` = minutes depuis minuit (heure de Paris) de l'ouverture de la bougie i. */
export function precurseurs(X, parisMin) {
  const n = X.n, P = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  for (let i = 110; i < n; i++) {
    for (let k = i - 2; k <= i; k++) if (X.pdh[k] != null && ((X.h[k] > X.pdh[k] && X.c[k] < X.pdh[k]) || (X.l[k] < X.pdl[k] && X.c[k] > X.pdl[k]))) { P[0][i] = 1; break; }
    const m = parisMin[i]; if ((m >= 420 && m < 540) || (m >= 870 && m < 990)) P[1][i] = 1;
    if (X.vsd[i] > 0 && X.hr[i] >= 3 && X.jour[i] === X.jour[i]) { const z = (X.c[i] - X.vw[i]) / X.vsd[i]; if (Math.abs(z) > 1.5) P[2][i] = 1; }
    const q = []; for (let k = i - 100; k < i; k++) if (X.atr[k] != null) q.push(X.atr[k]); if (q.length > 60 && X.atr[i - 1] != null) { q.sort((a, b) => a - b); if (X.atr[i - 1] < (q[(q.length - 1) >> 1] + q[q.length >> 1]) / 2) P[3][i] = 1; }
  }
  return P;
}
export const sigsGros = (spec, base, P) => base.filter(s => { let k = 0; for (const j of spec.qui) k += P[j][s.i]; return k >= spec.min; });
