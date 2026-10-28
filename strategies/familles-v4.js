import { FAMILLES } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { emaM15 } from '../planetes/mars/pc/agent-btc/contexte.js';
import { attacherFluxBougies, absorptionVec, divergenceVec, balayagesVec } from './liquidite/contexte-flux.js';

/* ═════════════ FAMILLES V4 : VOLUME, LIQUIDITÉ, FLUX (phase 5 ; module pur, testé : galaxie/tests/familles-v4-test.mjs) ═════════════
   Chaque famille a son HYPOTHÈSE ÉCONOMIQUE (qui perd de l'argent, et pourquoi cette stratégie peut gagner à sa place) — écrite ici et dans docs/AGENT.md avant tout test. Peu de paramètres, bornés,
   justifiés : pas de grille aveugle. Même format que les autres familles : `grille()` et `signaux(ctx, p)` qui rend { sens, stop, R } pour chaque bougie M15 FERMÉE (causal : le signal en i n'utilise que
   les barres 0..i et des périodes FINIES ; la validation le vérifie par le « test du poison du futur »). Même moteur de backtest, mêmes frais, mêmes critères : rien n'est assoupli.
   Deux sortes :
   · HISTORIQUES (6 familles) : testables sur des années avec les bougies (delta réel « taker » de Binance depuis 2017) et, pour la famille du profil de volume, l'empreinte aggTrades quand elle est installée ;
   · CARNET (strategies/familles-carnet.js) : reposent sur le carnet d'ordres, sans historique gratuit → testées sur les jours ENREGISTRÉS et en pépinière live (phase 7), jamais « validées » sur des années. */
const DEPART = 400;
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const minSur = (x, i, k) => { let m = Infinity; for (let j = Math.max(0, i - k + 1); j <= i; j++) if (x[j] < m) m = x[j]; return m; };
const maxSur = (x, i, k) => { let m = -Infinity; for (let j = Math.max(0, i - k + 1); j <= i; j++) if (x[j] > m) m = x[j]; return m; };

/* Filtres de contexte communs (famille 9 de la V4) : régime H1 (0 transition, 1 tendance haussière, 2 tendance baissière, 3 range), volatilité (ATR relatif), session UTC, financement extrême. Rend un
   masque Uint8Array (1 = on peut trader) ; 'aucun' laisse tout passer. Mis en cache. */
export function masqueContexte(ctx, nom) {
  if (!nom || nom === 'aucun') return null; const cle = 'v4masque:' + nom; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  const n = ctx.n, m = new Uint8Array(n), ph = ctx.h1.phase, t = ctx.m15.t;
  for (let i = 0; i < n; i++) {
    const h = new Date(t[i]).getUTCHours();
    if (nom === 'range') m[i] = ph[i] === 3 ? 1 : 0;
    else if (nom === 'tendance') m[i] = ph[i] === 1 || ph[i] === 2 ? 1 : 0;
    else if (nom === 'hors_range') m[i] = ph[i] !== 3 ? 1 : 0;
    else if (nom === 'session_us') m[i] = h >= 13 && h < 21 ? 1 : 0;                       // séance américaine : 13 h – 21 h UTC
    else if (nom === 'session_eu_us') m[i] = h >= 7 && h < 21 ? 1 : 0;
    else if (nom === 'calme') m[i] = ctx.atr15[i] > 0 && ctx.atr15[i] / ctx.m15.c[i] < 0.004 ? 1 : 0;
    else m[i] = 1;
  }
  ctx.cache.set(cle, m); return m;
}
const passe = (m, i) => !m || m[i] === 1;

/* ── 1. Balayage de liquidité puis retour (sweep & reclaim) ── */
const BALAYAGE_RETOUR = {
  id: 'balayage_retour', nom: 'Balayage de liquidité puis retour (sweep & reclaim)',
  description: 'Le prix perce un plus haut (ou plus bas) ÉGAL, ou l’extrême du jour / de la semaine précédents, prend les stops qui s’y trouvent, puis referme de l’autre côté du niveau dans la même bougie. On entre contre le balayage ; stop au-delà de la mèche.',
  hypothese: 'Qui perd : ceux qui posent leur stop juste au-delà d’un plus haut / bas évident (le « stop-hunt » des gros ordres est connu : le prix va chercher cette liquidité pour exécuter un gros ordre en face). Pourquoi on peut gagner à leur place : une mèche qui referme sous le niveau signale que l’achat forcé des stops est épuisé et qu’il n’y a plus d’acheteurs à ce prix ; le risque (stop au-delà de la mèche) est petit et connu.',
  grille: () => ({ minTouches: [2, 3], pad: [0.2, 0.5], R: [2, 3, 4], volume: [0, 1], contexte: ['aucun', 'hors_range'] }),
  signaux(ctx, p) {
    const n = ctx.n, o = fabrique(n), bal = balayagesVec(ctx, p.minTouches), { m15 } = ctx, a15 = ctx.atr15, vm = ctx.volMoy20, mask = masqueContexte(ctx, p.contexte); o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const s = bal.sens[i]; if (!s || !(a15[i] > 0) || !passe(mask, i)) continue;
      if (p.volume && !(vm[i] > 0 && m15.v[i] >= 1.3 * vm[i])) continue;                               // balayage « climactique » : gros volume
      o.sens[i] = s; o.stop[i] = s > 0 ? m15.l[i] - p.pad * a15[i] : m15.h[i] + p.pad * a15[i];
    }
    return o;
  }
};

/* ── 2. Absorption à un extrême ── */
const ABSORPTION = {
  id: 'absorption_extreme', nom: 'Absorption à un extrême',
  description: 'Un volume agressif énorme (delta ≥ 2 à 3 fois le delta typique) est exécuté contre un extrême récent SANS que le prix avance : des ordres limites encaissent. On entre dans le sens de l’absorption ; stop au-delà de la bougie.',
  hypothese: 'Qui perd : ceux qui vendent au marché dans un creux (ou achètent dans un sommet) en pensant que ça continue. Pourquoi on peut gagner à leur place : quand des ventes massives n’abaissent pas le prix, quelqu’un de plus gros achète tout (ordres limites, souvent un acteur qui accumule) ; l’agression s’épuise et le prix repart. Limite : à M15 on voit l’absorption sur la bougie entière, pas niveau par niveau (l’empreinte aggTrades affine quand elle est installée).',
  grille: () => ({ facteur: [2, 3], tol: [0.15, 0.35], proximite: [0.5, 1], pad: [0.2, 0.5], R: [2, 3] }),
  signaux(ctx, p) {
    const n = ctx.n, o = fabrique(n), ab = absorptionVec(ctx, p.facteur, p.tol), { m15 } = ctx, a15 = ctx.atr15; o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const s = ab.sens[i]; if (!s || !(a15[i] > 0)) continue;
      if (s > 0 && !(m15.l[i] <= minSur(m15.l, i, 96) + p.proximite * a15[i])) continue;                 // l'absorption se produit près du plus bas des 96 dernières bougies (24 h)
      if (s < 0 && !(m15.h[i] >= maxSur(m15.h, i, 96) - p.proximite * a15[i])) continue;
      o.sens[i] = s; o.stop[i] = s > 0 ? m15.l[i] - p.pad * a15[i] : m15.h[i] + p.pad * a15[i];
    }
    return o;
  }
};

/* ── 3. Divergence de delta / CVD aux extrêmes ── */
const DIVERGENCE_CVD = {
  id: 'divergence_cvd', nom: 'Divergence prix / CVD aux extrêmes',
  description: 'Le prix fait un nouveau plus haut (bas) sur la fenêtre mais le CVD (achats − ventes agressifs cumulés du jour) ne le confirme pas : le mouvement n’est pas porté par les agresseurs. On entre à l’inverse sur une bougie de confirmation.',
  hypothese: 'Qui perd : ceux qui achètent la cassure d’un plus haut qui n’est pas soutenue par un vrai flux acheteur. Pourquoi on peut gagner à leur place : un sommet sans flux est souvent dû à des stops déclenchés (pas à de la demande) ; une fois ces stops consommés, rien ne soutient le prix.',
  grille: () => ({ fenetre: [24, 48, 96], confirme: [0, 1], pad: [0.2, 0.5], R: [2, 3] }),
  signaux(ctx, p) {
    const n = ctx.n, o = fabrique(n), dv = divergenceVec(ctx, p.fenetre), { m15 } = ctx, a15 = ctx.atr15; o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const s = dv[i]; if (!s || !(a15[i] > 0)) continue;
      if (p.confirme && !(s > 0 ? m15.c[i] > m15.o[i] : m15.c[i] < m15.o[i])) continue;                // bougie de confirmation dans le sens du retournement
      o.sens[i] = s; o.stop[i] = s > 0 ? minSur(m15.l, i, 8) - p.pad * a15[i] : maxSur(m15.h, i, 8) + p.pad * a15[i];
    }
    return o;
  }
};

/* ── 4. Continuation par flux acheteur / vendeur persistant (version « transactions » de la continuation par déséquilibre) ── */
const CONTINUATION_FLUX = {
  id: 'continuation_flux', nom: 'Continuation par flux agressif persistant',
  description: 'En tendance H1, le delta (achats − ventes agressifs) reste du même signe sur `k` bougies M15 de suite avec une intensité minimale : la pression est persistante. On entre dans le sens de la tendance ; stop sous le plus bas des `k + 2` dernières bougies.',
  hypothese: 'Qui perd : ceux qui prennent le contre-pied d’une tendance alors que le flux agressif la porte encore. Pourquoi on peut gagner à leur place : un flux persistant d’agresseurs est de la demande réelle (pas un simple mouvement de stops) ; les ordres limites en face sont consommés les uns après les autres. La version CARNET (pression du livre + delta) est dans familles-carnet.js : sans historique, elle se prouve en direct.',
  grille: () => ({ k: [3, 5], seuil: [0.06, 0.12], pad: [0.3, 0.6], R: [3, 4.5], exigeH4: [0, 1] }),
  signaux(ctx, p) {
    const n = ctx.n, o = fabrique(n), fl = attacherFluxBougies(ctx), { m15 } = ctx, a15 = ctx.atr15, ph = ctx.h1.phase, e20 = emaM15(ctx, 20); o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const a = a15[i]; if (!(a > 0) || (ph[i] !== 1 && ph[i] !== 2)) continue; const s = ph[i] === 1 ? 1 : -1;
      if (p.exigeH4 && ctx.h4.phase[i] !== ph[i]) continue;
      let somme = 0, vol = 0, bons = 0; for (let j = i - p.k + 1; j <= i; j++) { const d = fl.delta[j]; if (!Number.isFinite(d)) { bons = -99; break; } somme += d; vol += fl.achat[j] + fl.vente[j]; if (d * s > 0) bons++; }
      if (bons < p.k - 1 || !(vol > 0) || somme * s / vol < p.seuil) continue;
      if (!(s > 0 ? m15.c[i] > e20[i] : m15.c[i] < e20[i])) continue;                                     // le prix est bien du bon côté de sa moyenne courte
      o.sens[i] = s; o.stop[i] = s > 0 ? minSur(m15.l, i, p.k + 2) - p.pad * a : maxSur(m15.h, i, p.k + 2) + p.pad * a;
    }
    return o;
  }
};

/* ── 5. Retour vers un nœud de gros volume depuis un trou de volume (LVN → HVN) — a besoin de l'empreinte aggTrades ── */
const RETOUR_NOEUD_VOLUME = {
  id: 'retour_noeud_volume', nom: 'Retour vers un nœud de volume depuis un trou (LVN → HVN)',
  description: 'Le prix est dans un TROU de volume (LVN) du profil de la veille, c’est-à-dire une zone où peu d’échanges ont eu lieu : le prix la traverse vite jusqu’au nœud de gros volume (HVN) ou au POC le plus proche. On entre vers ce nœud ; stop au-delà du trou.',
  hypothese: 'Qui perd : ceux qui s’attendent à ce que le prix s’installe dans une zone où personne n’a voulu échanger la veille. Pourquoi on peut gagner à leur place : le profil de volume mesure où le marché a accepté des prix ; les trous sont rejetés et les nœuds attirent (valeur acceptée). Il faut l’empreinte aggTrades (profil réel de la veille) : sans elle, aucun signal.',
  grille: () => ({ tol: [0.25, 0.5], pad: [0.4, 0.8], R: [1.5, 2.5], hvnMax: [3, 6] }),
  signaux(ctx, p) {
    const n = ctx.n, o = fabrique(n), fp = ctx.fp, { m15 } = ctx, a15 = ctx.atr15; o.R = p.R; if (!fp || !fp.ok) return o;
    for (let i = DEPART; i < n; i++) {
      const a = a15[i], jid = fp.jourIdx[i]; if (!(a > 0) || jid < 0 || !fp.present[i]) continue; const J = fp.jours[jid]; if (!J.lvn.length || m15.t[i] - J.fin > 86400e3) continue;   // le profil doit être celui de la veille
      const px = m15.c[i]; let lvn = null, dl = Infinity; for (const x of J.lvn) { const d = Math.abs(px - x); if (d < dl) { dl = d; lvn = x; } } if (!(dl <= p.tol * a)) continue;
      const cibles = [J.poc, ...J.hvn].filter(x => Math.abs(x - px) >= 1 * a && Math.abs(x - px) <= p.hvnMax * a); if (!cibles.length) continue;
      let cible = cibles[0]; for (const x of cibles) if (Math.abs(x - px) < Math.abs(cible - px)) cible = x; const s = cible > px ? 1 : -1, stop = s > 0 ? px - p.pad * a : px + p.pad * a, risque = Math.abs(px - stop);
      if (Math.abs(cible - px) < 0.8 * p.R * risque) continue;                                              // la cible doit être atteignable avec le multiple visé
      o.sens[i] = s; o.stop[i] = stop;
    }
    return o;
  }
};

/* ── 6. Aimant de liquidité : suivre le prix vers la piscine de stops la plus proche, avec invalidation claire ── */
const AIMANT_PISCINE = {
  id: 'aimant_piscine', nom: 'Aimant de liquidité (piscine de stops la plus proche)',
  description: 'En tendance courte (EMA 20 M15 au-dessus / sous l’EMA 50 et clôture du bon côté), une piscine de stops NON balayée (plus hauts égaux, extrême du jour ou de la semaine précédents) se trouve à 1,5 – 8 ATR dans le sens du mouvement : on suit le prix vers elle ; stop sous le dernier creux ; l’objectif ne dépasse pas la piscine.',
  hypothese: 'Qui perd : ceux qui vendent / achètent à contre-courant juste avant que le marché aille chercher la liquidité qu’il voit. Pourquoi on peut gagner à leur place : les ordres de stop accumulés au-dessus d’un plus haut évident sont une cible naturelle pour les gros ordres (ils y trouvent la contrepartie) ; tant que la piscine n’est pas prise, elle attire. Invalidation claire : le dernier creux.',
  grille: () => ({ dmin: [1.5, 2.5], dmax: [5, 8], pad: [0.3, 0.6], R: [1.5, 2.5] }),
  signaux(ctx, p) {
    const n = ctx.n, o = fabrique(n), bal = balayagesVec(ctx, 2), { m15 } = ctx, a15 = ctx.atr15, e20 = emaM15(ctx, 20), e50 = emaM15(ctx, 50); o.R = p.R;
    for (let i = DEPART; i < n; i++) {
      const a = a15[i]; if (!(a > 0)) continue; const px = m15.c[i], ph = bal.poolHaut[i], pb = bal.poolBas[i];
      if (e20[i] > e50[i] && px > e20[i] && ph > 0) { const d = ph - px; if (d >= p.dmin * a && d <= p.dmax * a) { const stop = minSur(m15.l, i, 8) - p.pad * a, risque = px - stop; if (risque > 0 && p.R * risque <= 0.9 * d) { o.sens[i] = 1; o.stop[i] = stop; } } }
      else if (e20[i] < e50[i] && px < e20[i] && pb > 0) { const d = px - pb; if (d >= p.dmin * a && d <= p.dmax * a) { const stop = maxSur(m15.h, i, 8) + p.pad * a, risque = stop - px; if (risque > 0 && p.R * risque <= 0.9 * d) { o.sens[i] = -1; o.stop[i] = stop; } } }
    }
    return o;
  }
};

export const FAMILLES_V4 = { balayage_retour: BALAYAGE_RETOUR, absorption_extreme: ABSORPTION, divergence_cvd: DIVERGENCE_CVD, continuation_flux: CONTINUATION_FLUX, retour_noeud_volume: RETOUR_NOEUD_VOLUME, aimant_piscine: AIMANT_PISCINE };
Object.assign(FAMILLES, FAMILLES_V4);
export const ORDRE_V4 = ['balayage_retour', 'absorption_extreme', 'divergence_cvd', 'continuation_flux', 'aimant_piscine', 'retour_noeud_volume'];
export const NOMS_V4 = Object.freeze(Object.fromEntries(ORDRE_V4.map(id => [id, FAMILLES_V4[id].nom])));
/* Ce dont chaque famille a besoin : sert à dire, dans l'interface, d'où vient la preuve (années de bougies, empreinte aggTrades, carnet enregistré). */
export const EXIGENCES_V4 = Object.freeze({ balayage_retour: ['bougies'], absorption_extreme: ['bougies'], divergence_cvd: ['bougies'], continuation_flux: ['bougies'], aimant_piscine: ['bougies'], retour_noeud_volume: ['bougies', 'empreinte'] });
export function descriptionV4(id) { const f = FAMILLES_V4[id]; return f ? { id, nom: f.nom, description: f.description, hypothese: f.hypothese, grille: f.grille(), exigences: EXIGENCES_V4[id], type: 'historique' } : null; }
export const bibliothequeV4 = () => ORDRE_V4.map(descriptionV4);
export const tailleGrilleV4 = id => Object.values(FAMILLES_V4[id].grille()).reduce((a, v) => a * v.length, 1);
