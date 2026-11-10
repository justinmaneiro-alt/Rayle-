/* ═════════════ ÉTUDE « STRUCTURE » : RÈGLES FIGÉES `structure-v1` (2026-11-10, écrites AVANT tout calcul sur de vraies bougies) ═════════════
   Trois familles inspirées de la façon de lire le marché de Justin : A vente sur retest (tendance baissière, niveau cassé ou ligne descendante),
   B achat après balayage d'un creux majeur, C rejet aux bords d'un range. Pures, causales (une décision à la bougie H1 i n'utilise que les
   bougies ≤ i ; l'entrée se fait à l'ouverture de i + 1). Prix seulement (le volume n'est jamais lu). Simulation, JAMAIS un ordre.
   L'empreinte SHA-256 de CE fichier est notée dans RAPPORT-STRUCTURE.md avant l'étude ; le script d'étude refuse de tourner si elle change.
   Aucune variante n'est ajoutée ni retouchée après les résultats. Le même code sert à l'alerte « setup possible » (information de lecture). */

export const VERSION = 'structure-v1';
export const FIGEES_LE = '2026-11-10';
export const H1 = 3600e3, H4 = 4 * H1, J = 86400e3;

export const P = Object.freeze({
  atrN: 14,             // ATR = moyenne simple des 14 dernières étendues vraies (H1 pour le stop, unité H4 / Jour pour les niveaux et les ranges)
  fractaleK: 20,        // grande fractale : plus haut (plus bas) strict des 20 bougies avant et des 20 après (H4 ou Jour), connue à la clôture de la 20e après
  pivotK: 5,            // pivot « candidat » de niveau horizontal : 5 bougies de chaque côté
  fenetreFractalesJ: 730,   // les grandes fractales retenues sont celles formées dans les 730 derniers jours
  fenetreNiveauxJ: 365,     // les touches d'un niveau horizontal sont comptées sur les 365 derniers jours
  touchesNiveau: 8,     // niveau horizontal majeur : au moins 8 touches distinctes
  tolNiveauAtr: 0.5,    // une touche = un extrême (haut ou bas) d'une bougie d'unité à au plus 0,5 ATR d'unité du niveau
  ecartTouches: 3,      // deux touches distinctes : au moins 3 bougies d'unité entre elles
  casseRecent: 120,     // niveau « cassé » : une clôture d'unité de l'autre côté dans les 120 dernières bougies d'unité
  mecheMin: 0.4,        // mèche de rejet : au moins 40 % de l'étendue de la bougie H1
  approcheAtr: 0.25,    // le retest atteint le niveau à 0,25 ATR H1 près (par en dessous / par au-dessus)
  perceMaxAtr: 1,       // et ne le dépasse pas de plus de 1 ATR H1
  stopAtr: 0.25,        // stop au-delà de l'extrême du retest / du balayage / du bord, + 0,25 ATR H1
  rMinAB: 3,            // familles A et B : trade écarté si R < 3
  balayageBougies: 3,   // famille B : le retour au-dessus doit venir au plus 3 bougies H1 après la bougie qui perce
  rangeBougies: 40,     // famille C : fenêtre de 40 bougies d'unité
  rangeTouches: 3,      // au moins 3 touches sur chaque bord
  rangeToucheAtr: 0.25, // touche d'un bord : extrême à 0,25 ATR d'unité du bord
  rangeLargeurAtr: 3,   // largeur du range : au moins 3 ATR d'unité
  rangeRetrait: 0.1,    // cible = bord opposé moins 10 % de la largeur
  tenueMaxH: 240,       // sortie au plus tard 240 bougies H1 (10 jours) après l'entrée, à la clôture
  sma: 200, penteH: 24, // régime (tirages au hasard seulement) : SMA 200 H1 et pente sur 24 h
  risquePct: 0.5        // fiche d'alerte : taille à 0,5 % de risque
});

/* variantes, aucune autre ; toutes comptent dans la correction de Holm (20) */
export const VARIANTES = Object.freeze([
  ...['H4', 'J'].flatMap(tf => ['niveau', 'ligne'].flatMap(src => ['balayage', 'simple'].map(b => Object.freeze({ id: `A-${tf}-${src}-${b}`, famille: 'A', tf, src, balayage: b === 'balayage' })))),
  ...['H4', 'J'].flatMap(tf => ['fractale', 'niveau'].map(src => Object.freeze({ id: `B-${tf}-${src}`, famille: 'B', tf, src }))),
  ...['H4', 'J'].flatMap(tf => [2, 3].flatMap(rMin => ['balayage', 'simple'].map(b => Object.freeze({ id: `C-${tf}-R${rMin}-${b}`, famille: 'C', tf, rMin, balayage: b === 'balayage' }))))
]);

export const TEXTE_REGLES = `Règles figées ${VERSION} (écrites le ${FIGEES_LE}, avant le premier calcul ; empreinte SHA-256 du fichier notée dans le rapport avant l'étude) :
Commun : entrées sur bougies H1 closes, à l'ouverture de la bougie H1 suivante ; ATR = moyenne simple des 14 dernières étendues vraies ; une seule position à la fois par variante ; stop prioritaire si stop et cible sont touchés dans la même bougie ; ouverture au-delà du stop ou de la cible = sortie à l'ouverture ; sortie au plus tard 240 bougies H1 (10 jours) après l'entrée, à la clôture ; prix seulement. Niveaux lus sur H4 ou Jour (agrégés en UTC).
Grandes fractales : plus haut (bas) strict des 20 bougies d'unité avant et des 20 après, connue à la clôture de la 20e après, formée dans les 730 derniers jours. Niveau horizontal majeur : prix d'un pivot de 5 bougies d'unité, avec au moins 8 touches distinctes (extrême d'une bougie d'unité à 0,5 ATR d'unité du niveau, 3 bougies d'écart) sur les 365 derniers jours ; niveaux à moins de 0,5 ATR d'unité regroupés (le plus touché gagne).
FAMILLE A, vente sur retest (8 variantes : unité H4/Jour × niveau/ligne × avec/sans balayage) :
- tendance de fond baissière : les deux derniers grands sommets (fractales) sont descendants et la clôture H1 est sous le dernier ;
- résistance : (niveau) niveau horizontal majeur AU-DESSUS de la clôture, ancien support = clôture d'unité au-dessus de lui dans les 120 dernières bougies d'unité ; (ligne) droite passant par les deux derniers grands sommets, prolongée ;
- bougie de rejet H1 : haut à ≥ résistance − 0,25 ATR H1 et à ≤ résistance + 1 ATR H1, clôture sous la résistance, mèche haute ≥ 40 % de l'étendue ; variante « balayage » : le haut dépasse strictement la résistance ;
- stop = haut de la bougie de rejet + 0,25 ATR H1 ; cible = prochain grand creux (fractale) sous l'entrée ; trade écarté sans cible ou si R < 3.
FAMILLE B, achat après balayage (4 variantes : unité H4/Jour × creux fractal / niveau majeur) :
- un grand creux (fractale) ou niveau majeur L ; une bougie H1 perce sous L (bas < L) alors que la précédente clôturait au-dessus ; au plus 3 bougies H1 plus tard (même bougie comprise) une bougie clôture de nouveau au-dessus de L, les clôtures intermédiaires restant ≤ L ; entrée à la bougie suivante ;
- stop = plus bas du balayage − 0,25 ATR H1 ; cible = prochain grand sommet (fractale) au-dessus de l'entrée ; écarté si R < 3. Achats seulement.
FAMILLE C, rejet aux extrêmes d'un range (8 variantes : unité H4/Jour × R mini 2/3 × avec/sans balayage) :
- range : sur les 40 dernières bougies d'unité closes, bord haut = plus haut, bord bas = plus bas ; au moins 3 touches distinctes (extrême à 0,25 ATR d'unité du bord) sur chaque bord ; largeur ≥ 3 ATR d'unité ;
- vente au bord haut (achat au bord bas, miroir) : bougie H1 dont le haut est à ≥ bord − 0,25 ATR d'unité et ≤ bord + 0,25 ATR d'unité, clôture sous le bord, mèche haute ≥ 40 % de l'étendue ; variante « balayage » : le haut dépasse strictement le bord ;
- stop = max(bord, haut) + 0,25 ATR H1 ; cible = bord opposé moins 10 % de la largeur ; écarté si R < R mini (2 ou 3).
Protocole : calibration PAXG Binance sept. 2020 → 31/12/2023 ; hors échantillon PAXG 01/01/2024 → 31/10/2025 (déjà regardé par les tests MA200 et swing : à dire) ; contrôle final XAUUSDT Binance, PF_XAUUSD Kraken, PAXG après le 01/11/2025. Quatre jeux de frais (zéro, maker, taker, stress), décision sur « futures taker ». 1000 tirages au hasard (même période, même régime, même sens, même stop en ATR, même cible en R). Holm sur 20 variantes. Retenue seulement si hors échantillon : ≥ 100 trades, R net moyen > 0 avec IC 95 % > 0, p de Holm < 0,05 ; ET R net moyen > 0 en calibration.`;

/* ───────────── briques ───────────── */
export function agreger(B, P0) {
  const out = []; let g = null;
  for (const b of B) { const t = Math.floor(b.t / P0) * P0;
    if (!g || g.t !== t) { if (g) out.push(g); g = { t, o: b.o, h: b.h, l: b.l, c: b.c }; }
    else { if (b.h > g.h) g.h = b.h; if (b.l < g.l) g.l = b.l; g.c = b.c; } }
  if (g) out.push(g);
  return out;
}
export function atrSimple(B, n = P.atrN) {
  const o = new Array(B.length).fill(null); let s = 0; const tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c));
  for (let i = 1; i < B.length; i++) { s += tr(i); if (i > n) s -= tr(i - n); if (i >= n) o[i] = s / n; }
  return o;
}
export function sma(v, n) { const o = new Array(v.length).fill(null); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
/* pivots stricts de k bougies de chaque côté ; tConf = clôture de la k-ième bougie après ; renvoyés par tConf croissant */
export function pivots(B, k, P0) {
  const o = [];
  for (let i = k; i + k < B.length; i++) {
    let s = true, c = true;
    for (let d = 1; d <= k && (s || c); d++) { if (!(B[i].h > B[i - d].h && B[i].h > B[i + d].h)) s = false; if (!(B[i].l < B[i - d].l && B[i].l < B[i + d].l)) c = false; }
    const tConf = B[i + k].t + P0;
    if (s) o.push({ i, t: B[i].t, p: B[i].h, sorte: 'sommet', tConf });
    if (c) o.push({ i, t: B[i].t, p: B[i].l, sorte: 'creux', tConf });
  }
  return o.sort((a, b) => a.tConf - b.tConf || a.t - b.t);
}
const borne = (arr, f) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f(arr[m])) lo = m + 1; else hi = m; } return lo; };

/* contexte d'une unité (H4 ou Jour) : ATR, grandes fractales, pivots candidats ; tout est interrogé « à l'instant t » (pur, sans mémoire de position) */
export function contexteUnite(Ub, pas) {
  const A = atrSimple(Ub), F = pivots(Ub, P.fractaleK, pas), PV = pivots(Ub, P.pivotK, pas), fins = Ub.map(b => b.t + pas), cache = new Map();
  const nFermees = t => borne(fins, x => x <= t);   // nombre de bougies d'unité closes à l'instant t
  const connues = (L, t) => { const n = borne(L, x => x.tConf <= t); return L.slice(0, n); };
  /* grandes fractales connues à t et formées dans les 730 derniers jours */
  const grandes = (t, sorte) => connues(F, t).filter(f => f.sorte === sorte && f.t >= t - P.fenetreFractalesJ * J);
  /* niveaux horizontaux majeurs à l'instant t : [{ p, touches }] */
  function niveaux(t) {
    const n = nFermees(t); if (n < 2 || A[n - 1] == null) return [];
    if (cache.has(n)) return cache.get(n);
    const W = Math.ceil(P.fenetreNiveauxJ * J / pas), deb = Math.max(0, n - W), tol = P.tolNiveauAtr * A[n - 1], ext = [];
    for (let k = deb; k < n; k++) { ext.push([Ub[k].h, k]); ext.push([Ub[k].l, k]); }
    ext.sort((a, b) => a[0] - b[0]);
    const cand = connues(PV, t).filter(v => v.i >= deb), res = [];
    for (const v of cand) {
      let lo = borne(ext, e => e[0] < v.p - tol), hi = borne(ext, e => e[0] <= v.p + tol); const idx = []; for (let q = lo; q < hi; q++) idx.push(ext[q][1]);
      idx.sort((a, b) => a - b); let nb = 0, der = -1e9; for (const k of idx) if (k - der >= P.ecartTouches) { nb++; der = k; }
      if (nb >= P.touchesNiveau) res.push({ p: v.p, touches: nb });
    }
    res.sort((a, b) => b.touches - a.touches || a.p - b.p); const out = [];
    for (const r of res) if (!out.some(o => Math.abs(o.p - r.p) <= tol)) out.push(r);
    cache.set(n, out); if (cache.size > 64) cache.delete(cache.keys().next().value);
    return out;
  }
  const clotureAuDessus = (t, L, dir) => { const n = nFermees(t); for (let k = Math.max(0, n - P.casseRecent); k < n; k++) if ((Ub[k].c - L) * dir > 0) return true; return false; };
  return { Ub, A, pas, nFermees, grandes, niveaux, clotureAuDessus };
}
export function contexte(C, { H4b, Jb }) {
  const Ah = atrSimple(C), M = sma(C.map(b => b.c), P.sma);
  return { A: Ah, M, U: { H4: contexteUnite(H4b, H4), J: contexteUnite(Jb, J) } };
}
/* régime d'une bougie H1 (utilisé seulement pour apparier les tirages au hasard) */
export function regimeH1(C, ctx, i) { const m = ctx.M[i], m0 = ctx.M[i - P.penteH]; if (m == null || m0 == null || !ctx.A[i]) return null; return C[i].c > m && m - m0 > 0 ? 'haussier' : C[i].c < m && m - m0 < 0 ? 'baissier' : 'neutre'; }

const mecheHaute = b => (b.h - Math.max(b.o, b.c)) / (b.h - b.l || 1), mecheBasse = b => (Math.min(b.o, b.c) - b.l) / (b.h - b.l || 1);
const toucheNb = (Ub, deb, n, f) => { let nb = 0, der = -1e9; for (let k = deb; k < n; k++) if (f(Ub[k]) && k - der >= P.ecartTouches) { nb++; der = k; } return nb; };

/* ─────────────────────────────────────────────────────────────────────────
   Évalue la bougie H1 close i pour la variante v. `entree` = prix d'entrée supposé (étude : ouverture de i + 1 ; alerte : clôture de i).
   Renvoie null ou { sens, stop, objectif, entree, dist, distATR, objR, niveau, type }.
   ───────────────────────────────────────────────────────────────────────── */
export function evaluerBarre(C, ctx, v, i, entree) {
  const b = C[i], a = ctx.A[i]; if (!a || !b) return null;
  const t = b.t + H1, u = ctx.U[v.tf];
  if (u.nFermees(t) < P.rangeBougies + 2) return null;
  if (v.famille === 'A') return evalA(C, ctx, v, i, entree, t, u, a);
  if (v.famille === 'B') return evalB(C, ctx, v, i, entree, t, u, a);
  return evalC(C, ctx, v, i, entree, t, u, a);
}
function finir({ sens, stop, obj, entree, a, niveau, type }) {
  const d = sens === 'achat' ? 1 : -1, risque = (entree - stop) * d; if (!(risque > 0) || obj == null || !((obj - entree) * d > 0)) return null;
  return { sens, stop, objectif: obj, entree, dist: risque, distATR: risque / a, objR: (obj - entree) * d / risque, niveau, type };
}
function evalA(C, ctx, v, i, entree, t, u, a) {
  const b = C[i], sommets = u.grandes(t, 'sommet'); if (sommets.length < 2) return null;
  const s1 = sommets[sommets.length - 2], s2 = sommets[sommets.length - 1]; if (!(s2.p < s1.p) || !(b.c < s2.p)) return null;   // sommets plus bas, clôture sous le dernier
  let L = null;
  if (v.src === 'ligne') { if (s2.t === s1.t) return null; L = s1.p + (s2.p - s1.p) * (t - s1.t) / (s2.t - s1.t); }
  else { let meilleur = null; for (const n of u.niveaux(t)) { if (!(n.p > b.c) || !u.clotureAuDessus(t, n.p, 1)) continue; if (b.h >= n.p - P.approcheAtr * a && b.h <= n.p + P.perceMaxAtr * a && (meilleur == null || Math.abs(b.h - n.p) < Math.abs(b.h - meilleur))) meilleur = n.p; } L = meilleur; }
  if (L == null || !(L > b.c)) return null;
  if (!(b.h >= L - P.approcheAtr * a && b.h <= L + P.perceMaxAtr * a)) return null;
  if (!(mecheHaute(b) >= P.mecheMin)) return null;
  if (v.balayage && !(b.h > L)) return null;
  const stop = b.h + P.stopAtr * a, creux = u.grandes(t, 'creux').map(f => f.p).filter(p => p < entree);
  const obj = creux.length ? Math.max(...creux) : null;   // prochain grand creux sous l'entrée
  const s = finir({ sens: 'vente', stop, obj, entree, a, niveau: L, type: v.src === 'ligne' ? 'ligne de tendance descendante' : 'ancien support' });
  return s && s.objR >= P.rMinAB ? s : null;
}
function evalB(C, ctx, v, i, entree, t, u, a) {
  const b = C[i]; if (i < P.balayageBougies + 1) return null;
  const cands = v.src === 'fractale' ? u.grandes(t, 'creux').map(f => f.p) : u.niveaux(t).map(n => n.p);
  let meilleur = null;
  for (const L of cands) {
    if (!(b.c > L)) continue;
    // bougie j qui perce (bas < L) alors que la précédente clôturait au-dessus ; clôtures de j à i − 1 ≤ L
    for (let j = i; j >= i - P.balayageBougies && j >= 1; j--) {
      if (j < i && !(C[j].c <= L)) break;
      if (C[j].l < L && C[j - 1].c > L) { let bas = Infinity; for (let q = j; q <= i; q++) bas = Math.min(bas, C[q].l); if (meilleur == null || L > meilleur.L) meilleur = { L, bas }; break; }
    }
  }
  if (!meilleur) return null;
  const stop = meilleur.bas - P.stopAtr * a, sommets = u.grandes(t, 'sommet').map(f => f.p).filter(p => p > entree), obj = sommets.length ? Math.min(...sommets) : null;
  const s = finir({ sens: 'achat', stop, obj, entree, a, niveau: meilleur.L, type: 'creux majeur balayé' });
  return s && s.objR >= P.rMinAB ? s : null;
}
function evalC(C, ctx, v, i, entree, t, u, a) {
  const b = C[i], n = u.nFermees(t), deb = n - P.rangeBougies, Au = u.A[n - 1]; if (deb < 0 || !(Au > 0)) return null;
  let H = -Infinity, Lo = Infinity; for (let k = deb; k < n; k++) { if (u.Ub[k].h > H) H = u.Ub[k].h; if (u.Ub[k].l < Lo) Lo = u.Ub[k].l; }
  const larg = H - Lo; if (larg < P.rangeLargeurAtr * Au) return null;
  const tol = P.rangeToucheAtr * Au;
  if (toucheNb(u.Ub, deb, n, x => x.h >= H - tol) < P.rangeTouches || toucheNb(u.Ub, deb, n, x => x.l <= Lo + tol) < P.rangeTouches) return null;
  let sens = null;
  if (b.h >= H - tol && b.h <= H + tol && b.c < H && mecheHaute(b) >= P.mecheMin && (!v.balayage || b.h > H)) sens = 'vente';
  else if (b.l <= Lo + tol && b.l >= Lo - tol && b.c > Lo && mecheBasse(b) >= P.mecheMin && (!v.balayage || b.l < Lo)) sens = 'achat';
  if (!sens) return null;
  const stop = sens === 'vente' ? Math.max(H, b.h) + P.stopAtr * a : Math.min(Lo, b.l) - P.stopAtr * a, obj = sens === 'vente' ? Lo + P.rangeRetrait * larg : H - P.rangeRetrait * larg;
  const s = finir({ sens, stop, obj, entree, a, niveau: sens === 'vente' ? H : Lo, type: 'bord de range' });
  return s && s.objR >= v.rMin ? { ...s, range: { haut: H, bas: Lo } } : null;
}

/* simulation d'un trade à partir de l'ouverture de la bougie i + 1 (cible unique) */
export function simulerTrade(C, i, sens, stop, objectif, { tenue = P.tenueMaxH } = {}) {
  const e = C[i + 1].o, d = sens === 'achat' ? 1 : -1, risque = (e - stop) * d; if (!(risque > 0)) return null;
  for (let j = i + 1; j < C.length && j <= i + tenue; j++) {
    const b = C[j];
    if (j > i + 1) { if (d > 0 ? b.o <= stop : b.o >= stop) return { R: (b.o - e) * d / risque, j, sortie: 'stop (ouverture)' }; if (objectif != null && (d > 0 ? b.o >= objectif : b.o <= objectif)) return { R: (b.o - e) * d / risque, j, sortie: 'cible (ouverture)' }; }
    if (d > 0 ? b.l <= stop : b.h >= stop) return { R: -1, j, sortie: 'stop' };
    if (objectif != null && (d > 0 ? b.h >= objectif : b.l <= objectif)) return { R: (objectif - e) * d / risque, j, sortie: 'cible' };
  }
  if (i + tenue >= C.length) return null;   // tenue pas encore écoulée : trade non mesurable
  const k = i + tenue; return { R: (C[k].c - e) * d / risque, j: k, sortie: 'tenue' };
}
/* tous les trades d'une variante sur une série H1 (étude) */
export function signaux(C, ctx, v, { debut = 0 } = {}) {
  const out = []; let libre = 0;
  for (let i = Math.max(P.sma + P.penteH, debut); i + 1 < C.length; i++) {
    if (i < libre) continue;
    const s = evaluerBarre(C, ctx, v, i, C[i + 1].o); if (!s) continue;
    const x = simulerTrade(C, i, s.sens, s.stop, s.objectif); if (!x) continue;
    out.push({ i, t: C[i].t, regime: regimeH1(C, ctx, i) || 'neutre', ...s, ...x }); libre = x.j + 1;
  }
  return out;
}
/* setups EN COURS à la dernière bougie H1 close (alerte « setup possible », information de lecture, jamais un signal) : `entree` = clôture */
export function setupsEnCours(C, ctx, variantes = VARIANTES) {
  const i = C.length - 1, out = []; if (i < P.sma + P.penteH) return out;
  for (const v of variantes) { const s = evaluerBarre(C, ctx, v, i, C[i].c); if (s) out.push({ variante: v.id, famille: v.famille, tBougie: C[i].t, ...s }); }
  return out;
}
/* fiche d'un setup : entrée, stop, cible, R, taille à 0,5 % de risque (en unités d'or par 1 000 $ de capital) */
export function fiche(s, { capital = 10000, risquePct = P.risquePct } = {}) {
  const risqueUSD = capital * risquePct / 100, unites = risqueUSD / s.dist;
  return { variante: s.variante, sens: s.sens, entree: s.entree, stop: s.stop, cible: s.objectif, R: +s.objR.toFixed(2), niveau: s.niveau, type: s.type, risquePct, risqueUSD: +risqueUSD.toFixed(2), unites: +unites.toFixed(4), notionnel: +(unites * s.entree).toFixed(2) };
}
