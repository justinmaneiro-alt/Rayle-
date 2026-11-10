/* ÉTUDE « FENÊTRE GLISSANTE RÉCENTE » (walk-forward mensuel, 18 derniers mois). Règles, grilles et liste fermée figées avec SHA-256 (liste-recent-figee.json) AVANT tout calcul.
   Pour chaque mois M de novembre 2025 à aujourd'hui, le paramètre de chaque variante est choisi sur les 6 mois qui précèdent M (trades CLOS avant le 1er de M), puis appliqué tel quel pendant M.
   Grille : stop initial ∈ {1 ; 1,5 ; 2} ATR (variantes 1, 2, 5, 6) ; rapport mèche/étendue ∈ {0,4 ; 0,5 ; 0,6} (variante 4). Défaut si moins de 5 trades d'apprentissage : 1,5 ATR / 0,5. Choix = meilleur R net moyen du scénario le plus défavorable (CFD ou Kraken).
   Variante 3 (« famille q, lecture de Justin ») : les règles n'ont été fournies nulle part (ni dans la conversation ni dans le dépôt) : NON TESTABLE, comptée dans Holm avec p = 1 ; rien n'est inventé à sa place. */
import { SPECS_GROS } from './familles-gros.mjs';
export const GRILLE_STOP = Object.freeze([1, 1.5, 2]), GRILLE_MECHE = Object.freeze([0.4, 0.5, 0.6]), DEFAUT_STOP = 1.5, DEFAUT_MECHE = 0.5, MIN_APPRENTISSAGE = 5, MOIS_APPRENTISSAGE = 6, LIMITE_BOUGIES = 48, FRACTALE = 60;
export const DEBUT_ETUDE = Date.UTC(2025, 4, 1), PREMIER_MOIS = [2025, 10];   // données depuis mai 2025 ; premier mois évalué : novembre 2025 (mois = 0-11)
export const SPECS_R = Object.freeze([
  { id: 'r1', libelle: 'Démarrage confirmé + au moins 1 précurseur · stop suiveur 3 ATR (sans sortie par le temps)', base: 'gros', chandelier: 3, filtre: false, grille: 'stop' },
  { id: 'r2', libelle: 'Démarrage confirmé + au moins 1 précurseur · stop suiveur 2 ATR', base: 'gros', chandelier: 2, filtre: false, grille: 'stop' },
  { id: 'r3', libelle: 'Famille q « lecture de Justin » · stop suiveur 3 ATR', base: 'q', chandelier: 3, filtre: false, grille: 'stop', indisponible: 'règles de la famille q non fournies : non testable' },
  { id: 'r4', libelle: 'Rejet sur niveau rond de 100 $ · sortie sur le niveau suivant', base: 'rond100', chandelier: null, cible: 'niveau-suivant', filtre: false, grille: 'meche' },
  { id: 'r5', libelle: 'Rebond sur niveau H4 (swing 60 bougies) avec balayage et réintégration · stop suiveur 3 ATR', base: 'swing60', chandelier: 3, filtre: false, grille: 'stop' },
  { id: 'r6', libelle: 'Variante 1 avec filtre de coût (ATR H1 ≥ 5 × coût aller-retour)', base: 'gros', chandelier: 3, filtre: true, grille: 'stop' }
]);
export const specGrosC1 = SPECS_GROS.find(s => s.id === 'g-C1-ch3');   // seulement pour `min` et `qui` (au moins 1 des 4 précurseurs)
/* pivots de swing (fractale 60 : plus haut / plus bas STRICT des 60 bougies avant ET des 60 bougies après ; connu à la clôture de la 60e bougie après) */
export function pivots(X, K = FRACTALE) {
  const n = X.n, H = [], L = [];
  for (let j = K; j < n - K; j++) { let h = true, l = true; for (let k = 1; k <= K && (h || l); k++) { if (X.h[j] <= X.h[j - k] || X.h[j] <= X.h[j + k]) h = false; if (X.l[j] >= X.l[j - k] || X.l[j] >= X.l[j + k]) l = false; } if (h) H.push(j); if (l) L.push(j); }
  return { H, L };
}
/* signaux de la base, pour un paramètre de grille (mèche) : [{ i, d, cible? }] */
export function signauxBase(spec, X, ctx, meche = DEFAUT_MECHE) {
  const out = [], n = X.n;
  if (spec.base === 'gros') return ctx.sigsC1;
  if (spec.base === 'rond100') {
    for (let i = 110; i < n - 1; i++) { const rng = Math.max(1e-9, X.h[i] - X.l[i]), L1 = Math.floor(X.h[i] / 100) * 100, L2 = Math.ceil(X.l[i] / 100) * 100;
      if (L1 > Math.max(X.o[i], X.c[i]) && L1 <= X.h[i] && (X.h[i] - Math.max(X.o[i], X.c[i])) / rng >= meche && X.c[i] < L1) out.push({ i, d: -1, niveau: L1, cible: L1 - 100 });
      else if (L2 < Math.min(X.o[i], X.c[i]) && L2 >= X.l[i] && (Math.min(X.o[i], X.c[i]) - X.l[i]) / rng >= meche && X.c[i] > L2) out.push({ i, d: 1, niveau: L2, cible: L2 + 100 }); }
    return out;
  }
  if (spec.base === 'swing60') {
    const { H, L } = ctx.piv; let ph = 0, pl = 0;
    for (let i = 110; i < n - 1; i++) { while (ph < H.length && H[ph] + FRACTALE < i) ph++; while (pl < L.length && L[pl] + FRACTALE < i) pl++;   // confirmés AVANT la bougie i
      const hs = H.slice(Math.max(0, ph - 8), ph).map(j => X.h[j]), ls = L.slice(Math.max(0, pl - 8), pl).map(j => X.l[j]);
      const haut = hs.some(v => X.h[i] > v && X.c[i] < v), bas = ls.some(v => X.l[i] < v && X.c[i] > v);
      if (haut && !bas) out.push({ i, d: -1 }); else if (bas && !haut) out.push({ i, d: 1 }); }
    return out;
  }
  return out;
}
