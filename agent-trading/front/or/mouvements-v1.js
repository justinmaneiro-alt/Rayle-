/* ═════════════ COUCHE « MOUVEMENTS H1 » : DÉFINITION FIGÉE `mouvements-v1` (2026-11-10, écrite et scellée AVANT tout affichage) ═════════════
   OUTIL DE LECTURE RÉTROSPECTIVE : ces mouvements sont repérés après coup, ils ne prédisent pas le suivant. Aucun signal, aucun ordre, aucune règle de flèche.
   L'empreinte SHA-256 de CE fichier (fins de ligne normalisées) est dans mouvements-v1.sceau.json ; un test la vérifie.
   Pure : aucune dépendance (ni navigateur, ni autre module). */
export const VERSION = 'mouvements-v1';
export const FIGEES_LE = '2026-11-10';
const H = 3600e3;
export const P = Object.freeze({
  minBougies: 4, maxBougies: 6,   // un mouvement dure de 4 à 6 bougies H1 consécutives
  maxContraires: 1,               // dont au plus 1 bougie contraire (haussier : clôture < ouverture ; baissier : clôture > ouverture ; une bougie sans corps n'est pas contraire)
  seuilDefautAtr: 1.5, seuilMinAtr: 1, seuilMaxAtr: 3,   // gain net minimal en ATR, réglable de 1 à 3, 1,5 par défaut
  atrN: 14,                       // ATR(14) H1 : moyenne simple des 14 dernières étendues vraies, mesurée à la bougie de départ (elle comprise)
  delaiFigeBougies: 5             // un mouvement n'est figé que lorsqu'aucune bougie future ne peut plus le déplacer (voir TEXTE_REGLES)
});
export const TEXTE_REGLES = `Définition figée ${VERSION} (${FIGEES_LE}) :
- Mouvement haussier : suite de 4 à 6 bougies H1 consécutives dont au plus 1 bougie contraire (clôture sous l'ouverture), dont la première et la dernière vont dans le sens du mouvement, avec un gain net (plus bas de la bougie de départ → plus haut de la bougie de fin) d'au moins 1,5 ATR(14) H1 mesuré à la bougie de départ. Baissier : symétrique (plus haut du départ → plus bas de la fin).
- Seuil réglable de 1 à 3 ATR (défaut 1,5).
- On garde le mouvement maximal, sans chevauchement : tous les candidats valides (chaque départ, chaque durée de 4 à 6, les deux sens) sont classés par gain en dollars décroissant (à égalité : plus long, puis plus ancien, puis haussier) et acceptés tant qu'ils ne recouvrent aucune bougie d'un mouvement déjà accepté.
- Non-repainting : seules les bougies CLOSES comptent. Un groupe de candidats qui se chevauchent est figé quand la dernière bougie close se trouve au moins 5 bougies après la fin du plus tardif d'entre eux (une durée maximale de 6 bougies interdit alors tout nouveau candidat de le toucher). Tant qu'il n'est pas figé, un mouvement est « en cours » (pointillés) et peut encore changer ; une fois figé il ne bouge plus jamais.
- Historique : toute la profondeur disponible. Unité : H1 seulement.`;

/* ATR(14) simple : valeur à la clôture de chaque bougie (null avant la 15e) */
export function atrSimple(B, n = P.atrN) {
  const o = new Array(B.length).fill(null); let s = 0; const tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c));
  for (let i = 1; i < B.length; i++) { s += tr(i); if (i > n) s -= tr(i - n); if (i >= n) o[i] = s / n; }
  return o;
}
const borneSeuil = x => Math.max(P.seuilMinAtr, Math.min(P.seuilMaxAtr, Number.isFinite(+x) ? +x : P.seuilDefautAtr));
/* bougies closes seulement (une bougie H1 est close quand t + 1 h ≤ maintenant) */
export const fermees = (B, maintenant = Infinity) => { let n = B.length; while (n > 0 && B[n - 1].t + H > maintenant) n--; return B.slice(0, n); };

/* tous les candidats valides pour un seuil donné */
export function candidats(B, seuilAtr = P.seuilDefautAtr, A = atrSimple(B)) {
  const seuil = borneSeuil(seuilAtr), out = [], n = B.length;
  for (let s = 1; s + P.minBougies - 1 < n; s++) {
    const a = A[s]; if (!a) continue;
    for (const d of [1, -1]) {
      const sens = b => (d > 0 ? b.c > b.o : b.c < b.o), contraire = b => (d > 0 ? b.c < b.o : b.c > b.o);
      if (!sens(B[s])) continue; let contr = 0;
      for (let e = s; e < n && e - s + 1 <= P.maxBougies; e++) {
        if (e > s && contraire(B[e])) contr++; if (contr > P.maxContraires) break;
        const L = e - s + 1; if (L < P.minBougies || !sens(B[e])) continue;
        const gain = d > 0 ? B[e].h - B[s].l : B[s].h - B[e].l;
        if (gain >= seuil * a) out.push({ i0: s, i1: e, d, gain, gainAtr: gain / a, atr: a, contraires: contr, bougies: L });
      }
    }
  }
  return out;
}
/* mouvements maximaux sans chevauchement + état figé / en cours. B = bougies (les non closes sont ignorées si `maintenant` est donné). */
export function detecter(B, { seuilAtr = P.seuilDefautAtr, maintenant = Infinity } = {}) {
  const C = fermees(B, maintenant), n = C.length, A = atrSimple(C), cand = candidats(C, seuilAtr, A);
  // groupes de candidats qui se chevauchent (intervalles fusionnés)
  const tri = cand.slice().sort((x, y) => x.i0 - y.i0 || x.i1 - y.i1), groupes = []; let g = null;
  for (const c of tri) { if (g && c.i0 <= g.fin) { g.fin = Math.max(g.fin, c.i1); g.cand.push(c); } else { g = { deb: c.i0, fin: c.i1, cand: [c] }; groupes.push(g); } }
  const moves = [];
  for (const gr of groupes) {
    const fige = n - 1 >= gr.fin + P.delaiFigeBougies, ordre = gr.cand.slice().sort((x, y) => y.gain - x.gain || y.bougies - x.bougies || x.i0 - y.i0 || y.d - x.d), pris = [];
    for (const c of ordre) if (!pris.some(p => c.i0 <= p.i1 && p.i0 <= c.i1)) pris.push(c);
    for (const c of pris) moves.push({ ...c, t0: C[c.i0].t, t1: C[c.i1].t, sens: c.d > 0 ? 'hausse' : 'baisse', depart: c.d > 0 ? C[c.i0].l : C[c.i0].h, fin: c.d > 0 ? C[c.i1].h : C[c.i1].l, enCours: !fige });
  }
  moves.sort((x, y) => x.i0 - y.i0);
  return { moves, n, version: VERSION, seuilAtr: borneSeuil(seuilAtr) };
}
