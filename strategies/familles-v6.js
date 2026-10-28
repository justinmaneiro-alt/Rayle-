import { FAMILLES } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { ema, sma, pivots } from '../planetes/mars/pc/agent-btc/indic.js';
import { rsi } from '../planetes/mars/pc/agents-v2/familles-v2.js';
import './familles-v3.js';

/* ═════════════ FAMILLES DE LA V6 : DES STRATÉGIES OÙ LES FRAIS PÈSENT PEU (module pur, testé : galaxie/tests/familles-v6-test.mjs) ═════════════
   Le diagnostic (docs/COUTS_EN_R.md) l'a montré : en M15, avec des stops serrés, les frais mangent l'avantage (jusqu'à 0,4 R par trade). Ces six familles décident donc sur des bougies H1 et H4,
   dimensionnent le stop par l'ATR (ou par la structure du marché), élargissent un stop trop serré pour garder les frais sous ≈ 0,08 R, exigent un rapport gain / risque d'au moins 1,5 à l'entrée, peuvent
   entrer en ORDRE LIMITE (maker, avec un modèle de remplissage honnête) et sortir de façon plus riche (objectif, partielle, stop suiveur). Chaque famille garde son HYPOTHÈSE écrite : qui perd, qui gagne, pourquoi.
   Les signaux sont CAUSAUX : à l'index M15 i, seules les bougies H1 / H4 déjà FERMÉES à cet instant servent (alignement par ctx.h1.idx / ctx.h4.idx) ; la validation le vérifie (« poison du futur »).
   Exécution : strategies/simulateur-riche.js (les signaux portent riche: true). Aucun ordre réel : recherche et simulation. */
const DEPART = 800;
const N = n => new Float64Array(n).fill(NaN);
const cache = (ctx, cle, f) => { if (!ctx.cache.has(cle)) ctx.cache.set(cle, f()); return ctx.cache.get(cle); };
const surM15 = (src, idx, n) => { const out = N(n); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = src[k]; } return out; };
const PLAFOND_COUT_R = 0.08, RR_MIN = 1.5;
const SORTIES = Object.freeze({ fixe: { type: 'fixe' }, partielle: { type: 'partielle', partielleR: 1, partielleFraction: 0.5 }, suiveur: { type: 'suiveur', suiveurActiveR: 1, suiveurAtr: 2 } });
/* Signaux de base : marqués `riche`, avec les options communes (stop minimum automatique pour des frais ≤ 0,08 R, rapport gain / risque minimal 1,5, détention de 10 jours au plus). */
function base(ctx, p, extra = {}) {
  const n = ctx.n, o = { riche: true, sens: new Int8Array(n), stop: new Float64Array(n), R: p.R || 2, atr: cache(ctx, 'v6atrH1', () => ctx.h1.atr), options: { stopMinAuto: true, coutPlafondR: PLAFOND_COUT_R, rrMin: RR_MIN, maxBarres: 960, sortie: SORTIES[p.sortie] || SORTIES.fixe, ...extra } };
  if (p.entree === 'limite') { o.limite = N(n); o.ttl = p.ttl || 12; }
  return o;
}
const h1 = ctx => ctx.h1.serie, aH1 = ctx => cache(ctx, 'v6aH1', () => ctx.h1.prep.atr);
const emaH1 = (ctx, p) => cache(ctx, 'v6emaH1:' + p, () => ema(h1(ctx).c, p));
const nouvelleBarreH1 = (ctx, i) => { const k = ctx.h1.idx[i]; return k >= 1 && ctx.h1.idx[i - 1] !== k; };
const maxSur = (x, a, b) => { let m = -Infinity; for (let j = a; j <= b; j++) if (x[j] > m) m = x[j]; return m; };
const minSur = (x, a, b) => { let m = Infinity; for (let j = a; j <= b; j++) if (x[j] < m) m = x[j]; return m; };
const moy = (x, a, b) => { let s = 0; for (let j = a; j <= b; j++) s += x[j]; return s / (b - a + 1); };
const jourDe = t => Math.floor(t / 86400e3);

// ── 1. Tendance H4, repli sur H1 ──
const TENDANCE_PULLBACK_H4 = {
  id: 'tendance_pullback_h4', nom: 'Tendance H4, repli sur H1', unite: 'H4/H1',
  description: 'Quand la tendance H4 est confirmée (haussière ou baissière), on attend un repli en H1 sous la moyenne exponentielle, puis une clôture H1 qui la reprend : on entre dans le sens de la tendance. Stop en multiples de l’ATR H1 (élargi si les frais dépasseraient 0,08 R), objectif de 2 à 3 R, sortie fixe, partielle ou suiveuse. Peu de trades, stops larges, frais faibles.',
  hypothese: 'Qui perd : ceux qui vendent chaque repli dans une tendance installée, et ceux qui sortent trop tôt d’une position gagnante. Qui gagne : celui qui accepte un stop large et un objectif plus grand que le risque. Pourquoi ça pourrait durer : les tendances de fond sont alimentées par des flux lents (ETF, trésoreries, levier) qui ne s’arrêtent pas sur un repli de quelques heures. Risque : les marchés latéraux où la tendance H4 est en train de se retourner.',
  grille: () => ({ ema: [20, 50], stopATR: [2, 3], R: [2, 3], sortie: ['fixe', 'partielle', 'suiveur'] }),
  signaux(ctx, p) {
    const n = ctx.n, o = base(ctx, p), H = h1(ctx), e = emaH1(ctx, p.ema), a = aH1(ctx), idx = ctx.h1.idx;
    for (let i = DEPART; i < n; i++) {
      if (!nouvelleBarreH1(ctx, i)) continue; const k = idx[i], at = a[k]; if (!(at > 0) || !(e[k] > 0) || !(e[k - 1] > 0)) continue; const ph4 = ctx.h4.phase[i];
      if (ph4 === 1 && H.c[k] > e[k] && H.c[k - 1] <= e[k - 1]) { o.sens[i] = 1; o.stop[i] = H.c[k] - p.stopATR * at; }
      else if (ph4 === 2 && H.c[k] < e[k] && H.c[k - 1] >= e[k - 1]) { o.sens[i] = -1; o.stop[i] = H.c[k] + p.stopATR * at; }
    }
    return o;
  }
};

// ── 2. Cassure H1 avec volume, entrée sur retest en ordre limite ──
const CASSURE_H1_RETEST = {
  id: 'cassure_h1_retest', nom: 'Cassure H1 avec volume, retest en ordre limite', unite: 'H1',
  description: 'Une clôture H1 au-delà du plus haut (ou plus bas) des N dernières bougies H1, avec un volume supérieur à 1,3 fois la normale, annonce une cassure. On entre au marché, ou — moins cher — avec un ordre limite posé sur le niveau cassé (retest) : il n’est rempli que si le prix revient VRAIMENT le traverser. Stop de l’autre côté du niveau, objectif de 2 à 3 R.',
  hypothese: 'Qui perd : ceux qui avaient placé leur stop ou leur ordre juste au-delà du niveau (leurs ordres alimentent la cassure) et ceux qui vendent le haut d’un range. Qui gagne : celui qui entre sur la confirmation par le volume. Pourquoi ça pourrait durer : une cassure avec volume révèle un déséquilibre réel entre acheteurs et vendeurs. Risque : les fausses cassures (traitées par la famille « balayage de liquidité ») et les retests qui ne reviennent jamais (l’ordre limite n’est alors pas rempli : on le compte).',
  grille: () => ({ N: [24, 48, 96], filtreH4: [0, 1], entree: ['marche', 'limite'], stopATR: [1, 1.5], R: [2, 3] }),
  signaux(ctx, p) {
    const n = ctx.n, o = base(ctx, p, { ttlBarres: 16 }), H = h1(ctx), a = aH1(ctx), idx = ctx.h1.idx;
    for (let i = DEPART; i < n; i++) {
      if (!nouvelleBarreH1(ctx, i)) continue; const k = idx[i], at = a[k]; if (!(at > 0) || k < p.N + 22) continue;
      const hh = maxSur(H.h, k - p.N, k - 1), ll = minSur(H.l, k - p.N, k - 1), hhPrec = maxSur(H.h, k - 1 - p.N, k - 2), llPrec = minSur(H.l, k - 1 - p.N, k - 2), vm = moy(H.v, k - 20, k - 1), ph4 = ctx.h4.phase[i];
      if (!(vm > 0) || !(H.v[k] >= 1.3 * vm)) continue;
      if (H.c[k] > hh && H.c[k - 1] <= hhPrec && !(p.filtreH4 && ph4 === 2)) { o.sens[i] = 1; o.stop[i] = hh - p.stopATR * at; if (o.limite) o.limite[i] = hh; }
      else if (H.c[k] < ll && H.c[k - 1] >= llPrec && !(p.filtreH4 && ph4 === 1)) { o.sens[i] = -1; o.stop[i] = ll + p.stopATR * at; if (o.limite) o.limite[i] = ll; }
    }
    return o;
  }
};

// ── 3. Retour vers la moyenne dans un range H1 ──
const RETOUR_MOYENNE_H1 = {
  id: 'retour_moyenne_h1', nom: 'Retour vers la moyenne en range H1', unite: 'H1',
  description: 'Quand le marché évolue dans une boîte (H1 en phase « range »), une clôture H1 au-delà de la bande de Bollinger (20 bougies, k écarts-types) avec un RSI H1 étiré annonce souvent un retour vers la moyenne. L’objectif est la moyenne mobile elle-même (exigence : au moins 1,5 fois le risque), le stop est en multiples de l’ATR H1. Entrée au marché ou ordre limite un peu plus loin.',
  hypothese: 'Qui perd : ceux qui poursuivent un mouvement déjà étiré dans un marché sans tendance. Qui gagne : celui qui vend la force et achète la faiblesse dans un range. Pourquoi ça pourrait durer : l’excès de court terme s’épuise quand aucun flux de fond ne le soutient. Risque : la sortie du range (le stop est alors touché) ; la famille n’agit jamais quand H1 n’est pas en range.',
  grille: () => ({ kBande: [2, 2.5], rsiBas: [30, 35], stopATR: [1.5, 2.5], entree: ['marche', 'limite'] }),
  signaux(ctx, p) {
    const n = ctx.n, o = base(ctx, p, { maxBarres: 192, ttlBarres: 8 }), H = h1(ctx), a = aH1(ctx), idx = ctx.h1.idx, m = cache(ctx, 'v6sma20H1', () => sma(H.c, 20)), r = cache(ctx, 'v6rsiH1', () => rsi(H.c, 14));
    const cible = o.cible = N(n), sd = cache(ctx, 'v6sd20H1', () => { const out = N(H.n); for (let k = 19; k < H.n; k++) { let s = 0; for (let j = k - 19; j <= k; j++) s += (H.c[j] - m[k]) ** 2; out[k] = Math.sqrt(s / 20); } return out; });
    for (let i = DEPART; i < n; i++) {
      if (!nouvelleBarreH1(ctx, i) || ctx.h1.phase[i] !== 3) continue; const k = idx[i], at = a[k]; if (!(at > 0) || !(sd[k] > 0) || !(r[k] >= 0)) continue;
      if (H.c[k] < m[k] - p.kBande * sd[k] && r[k] <= p.rsiBas) { o.sens[i] = 1; o.stop[i] = H.c[k] - p.stopATR * at; cible[i] = m[k]; if (o.limite) o.limite[i] = H.c[k] - 0.3 * at; }
      else if (H.c[k] > m[k] + p.kBande * sd[k] && r[k] >= 100 - p.rsiBas) { o.sens[i] = -1; o.stop[i] = H.c[k] + p.stopATR * at; cible[i] = m[k]; if (o.limite) o.limite[i] = H.c[k] + 0.3 * at; }
    }
    return o;
  }
};

// ── 4. Stop derrière la structure, objectif sur l'aimant ──
function jours(ctx) {   // plus haut / plus bas du JOUR UTC PRÉCÉDENT, connus dès l'ouverture du jour (aucun regard vers le futur)
  return cache(ctx, 'v6jours', () => {
    const n = ctx.n, t = ctx.m15.t, pdh = N(n), pdl = N(n); let jc = -1, hc = -Infinity, lc = Infinity, hp = NaN, lp = NaN;
    for (let i = 0; i < n; i++) { const j = jourDe(t[i]); if (j !== jc) { if (jc >= 0) { hp = hc; lp = lc; } jc = j; hc = -Infinity; lc = Infinity; } hc = Math.max(hc, ctx.m15.h[i]); lc = Math.min(lc, ctx.m15.l[i]); pdh[i] = hp; pdl[i] = lp; }
    return { pdh, pdl };
  });
}
const STRUCTURE_AIMANTS = {
  id: 'structure_aimants', nom: 'Stop derrière la structure, objectif sur l’aimant', unite: 'H1',
  description: 'Dans le sens de la tendance H4, on achète le test d’un support (bas de la zone de valeur, point de contrôle ou dernier creux H1) quand une bougie H1 le touche puis referme au-dessus ; le stop se place derrière la zone de défense, l’objectif sur l’« aimant » le plus proche au-dessus (plus haut de la veille, haut de la zone de valeur, dernier sommet) à condition de rapporter au moins 1,5 fois le risque. Inverse pour les ventes.',
  hypothese: 'Qui perd : ceux qui posent leur stop sous un support évident (le prix va chercher cette liquidité) et ceux qui prennent leurs gains avant la zone suivante. Qui gagne : celui qui place son stop DERRIÈRE la zone et vise la zone suivante où se trouvent les ordres. Pourquoi ça pourrait durer : les zones de forte activité passée attirent le prix. Risque : un niveau qui cède franchement (le stop est touché) ; aucune entrée si l’objectif n’offre pas 1,5 fois le risque.',
  grille: () => ({ support: ['val', 'poc', 'swing'], prox: [0.3, 0.7], pad: [0.3, 0.6], sortie: ['fixe', 'partielle'] }),
  signaux(ctx, p) {
    const n = ctx.n, o = base(ctx, p), H = h1(ctx), a = aH1(ctx), idx = ctx.h1.idx, J = jours(ctx), cible = o.cible = N(n), pv = cache(ctx, 'v6piv', () => pivots(H.h, H.l, 3));
    for (let i = DEPART; i < n; i++) {
      if (!nouvelleBarreH1(ctx, i)) continue; const k = idx[i], at = a[k]; if (!(at > 0)) continue; const ph4 = ctx.h4.phase[i], c = H.c[k];
      const val = ctx.h1.val[i], poc = ctx.h1.poc[i], vah = ctx.h1.vah[i], swL = pv.bas[k], swH = pv.haut[k], pdh = J.pdh[i], pdl = J.pdl[i];
      if (ph4 === 1) {
        const D = p.support === 'val' ? val : p.support === 'poc' ? poc : swL; if (!(D > 0)) continue;
        if (H.l[k] <= D + p.prox * at && c > D) {
          const stop = D - p.pad * at, dist = c - stop; if (!(dist > 0)) continue;
          let m = Infinity; for (const x of [pdh, vah, swH, poc]) if (x > c + 1.5 * dist && x < m) m = x;     // l'aimant le plus proche qui offre au moins 1,5 fois le risque
          if (m < Infinity) { o.sens[i] = 1; o.stop[i] = stop; cible[i] = m; }
        }
      } else if (ph4 === 2) {
        const D = p.support === 'val' ? vah : p.support === 'poc' ? poc : swH; if (!(D > 0)) continue;
        if (H.h[k] >= D - p.prox * at && c < D) {
          const stop = D + p.pad * at, dist = stop - c; if (!(dist > 0)) continue;
          let m = -Infinity; for (const x of [pdl, val, swL, poc]) if (x > 0 && x < c - 1.5 * dist && x > m) m = x;
          if (m > -Infinity) { o.sens[i] = -1; o.stop[i] = stop; cible[i] = m; }
        }
      }
    }
    return o;
  }
};

// ── 5. Cassure de la fourchette asiatique à l'ouverture de Londres ──
const OUVERTURE_SESSION = {
  id: 'ouverture_session', nom: 'Cassure de la fourchette asiatique à l’ouverture de Londres', unite: 'M15/session',
  description: 'La fourchette de la séance asiatique (00 h – 07 h UTC) est connue à 7 h. Entre 7 h et 10 h UTC, la première clôture M15 au-delà de son haut (ou de son bas) déclenche l’entrée, à condition que la fourchette ait une largeur raisonnable (entre un seuil et 4 ATR H1). Stop au bord opposé ou au milieu de la fourchette, objectif de 2 à 3 R, sortie au plus tard 10 heures plus tard. Une entrée par sens et par jour.',
  hypothese: 'Qui perd : ceux qui avaient parié sur la poursuite du calme asiatique, et les stops posés de part et d’autre de la fourchette. Qui gagne : celui qui trade l’arrivée des gros flux européens. Pourquoi ça pourrait durer : l’ouverture de Londres apporte chaque jour du volume et de la direction. Risque : les cassures sans suite (la sortie par le temps limite la perte).',
  grille: () => ({ largeurMin: [0.8, 1.5], stopSur: ['bord', 'milieu'], R: [2, 3], filtreH4: [0, 1] }),
  signaux(ctx, p) {
    const n = ctx.n, o = base(ctx, p, { maxBarres: 40 }), M = ctx.m15, a = ctx.h1.atr; let j0 = -1, hi = -Infinity, lo = Infinity, faitL = false, faitC = false;
    for (let i = 1; i < n; i++) {
      const j = jourDe(M.t[i]), h = Math.floor((M.t[i] % 86400e3) / 3600e3);
      if (j !== j0) { j0 = j; hi = -Infinity; lo = Infinity; faitL = faitC = false; }
      if (h < 7) { hi = Math.max(hi, M.h[i]); lo = Math.min(lo, M.l[i]); continue; }
      if (i < DEPART || h >= 10 || !(hi > lo) || !(a[i] > 0)) continue; const larg = (hi - lo) / a[i]; if (larg < p.largeurMin || larg > 4) continue; const ph4 = ctx.h4.phase[i];
      if (!faitL && M.c[i] > hi && M.c[i - 1] <= hi && !(p.filtreH4 && ph4 === 2)) { o.sens[i] = 1; o.stop[i] = p.stopSur === 'bord' ? lo - 0.1 * a[i] : (hi + lo) / 2; faitL = true; }
      else if (!faitC && M.c[i] < lo && M.c[i - 1] >= lo && !(p.filtreH4 && ph4 === 1)) { o.sens[i] = -1; o.stop[i] = p.stopSur === 'bord' ? hi + 0.1 * a[i] : (hi + lo) / 2; faitC = true; }
    }
    return o;
  }
};

// ── 6. Balayage de liquidité sur un creux H1, confirmé par le delta ──
const BALAYAGE_H1_DELTA = {
  id: 'balayage_h1_delta', nom: 'Balayage de liquidité H1 confirmé par le delta', unite: 'H1',
  description: 'Une bougie H1 casse le plus bas (ou plus haut) des N dernières bougies H1 — là où se trouvent les stops — puis referme de l’autre côté du niveau : le prix est allé chercher la liquidité et revient. On exige que le volume agressif (delta H1) soit du bon côté. Entrée au marché ou ordre limite sur le niveau balayé ; stop au-delà de l’extrême du balayage ; objectif de 2,5 R ou le dernier sommet (creux) si c’est plus loin que 1,5 fois le risque.',
  hypothese: 'Qui perd : ceux dont les stops sont posés juste sous un creux évident. Qui gagne : ceux qui absorbent ces ordres et les revendent plus haut. Pourquoi ça pourrait durer : la chasse aux stops est un comportement mécanique des marchés à fort levier. Risque : une vraie cassure qui continue (le stop est touché) ; le delta aide à distinguer absorption et poursuite.',
  grille: () => ({ N: [24, 48], seuilDelta: [0, 0.1], entree: ['marche', 'limite'], cible: ['R', 'swing'] }),
  signaux(ctx, p) {
    const n = ctx.n, o = base(ctx, p, { ttlBarres: 12 }), H = h1(ctx), a = aH1(ctx), idx = ctx.h1.idx; o.R = 2.5; const cible = o.cible = N(n);
    const dr = cache(ctx, 'v6dr', () => { const out = N(H.n); for (let k = 0; k < H.n; k++) { if (!(H.v[k] > 0)) continue; if (!Number.isNaN(H.vb[k])) out[k] = (2 * H.vb[k] - H.v[k]) / H.v[k]; else { const e = H.h[k] - H.l[k]; out[k] = e > 0 ? (2 * H.c[k] - H.h[k] - H.l[k]) / e : 0; } } return out; });
    for (let i = DEPART; i < n; i++) {
      if (!nouvelleBarreH1(ctx, i)) continue; const k = idx[i], at = a[k]; if (!(at > 0) || k < p.N + 2) continue;
      const bas = minSur(H.l, k - p.N, k - 1), haut = maxSur(H.h, k - p.N, k - 1);
      if (H.l[k] < bas && H.c[k] > bas && dr[k] > p.seuilDelta) { o.sens[i] = 1; o.stop[i] = H.l[k] - 0.2 * at; if (o.limite) o.limite[i] = bas; if (p.cible === 'swing') cible[i] = haut; }
      else if (H.h[k] > haut && H.c[k] < haut && dr[k] < -p.seuilDelta) { o.sens[i] = -1; o.stop[i] = H.h[k] + 0.2 * at; if (o.limite) o.limite[i] = haut; if (p.cible === 'swing') cible[i] = bas; }
    }
    return o;
  }
};

export const FAMILLES_V6 = { tendance_pullback_h4: TENDANCE_PULLBACK_H4, cassure_h1_retest: CASSURE_H1_RETEST, retour_moyenne_h1: RETOUR_MOYENNE_H1, structure_aimants: STRUCTURE_AIMANTS, ouverture_session: OUVERTURE_SESSION, balayage_h1_delta: BALAYAGE_H1_DELTA };
for (const f of Object.values(FAMILLES_V6)) f.riche = true;
Object.assign(FAMILLES, FAMILLES_V6);
export const ORDRE_V6 = Object.freeze(Object.keys(FAMILLES_V6));
export const NOMS_V6 = Object.freeze(Object.fromEntries(Object.entries(FAMILLES_V6).map(([k, f]) => [k, f.nom])));
export const tailleGrilleV6 = id => Object.values(FAMILLES_V6[id].grille(0)).reduce((a, v) => a * v.length, 1);
export const hypotheseV6 = id => (FAMILLES_V6[id] || {}).hypothese || null;
export { SORTIES, PLAFOND_COUT_R, RR_MIN };
