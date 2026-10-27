import { CODES } from './detecteur-regime.js';
import { CRITERES_M6C } from './criteres-m6c.js';

/* ═════════════ PRÉCISION DU DÉTECTEUR DE RÉGIME (M6c ; module pur, testé : m6c-detecteur-test.mjs) ═════════════
   Question : le régime annoncé à la clôture de la bougie H1 i correspond-il à ce qui s'est passé ensuite (les `horizonH1` bougies suivantes) ? Mesure, jamais un réglage : le détecteur n'est pas ajusté sur ce résultat.
   - tendance haussière : « réussi » si la clôture finale est au-dessus de la clôture de départ ; baissière : au-dessous ;
   - range : « réussi » si AUCUNE clôture ne sort de la boîte élargie de 25 % de sa largeur de chaque côté pendant l'horizon.
   On compare au TAUX DE BASE (même événement, mesuré sur toutes les bougies qui ont une boîte de largeur comparable / sur toutes les bougies pour les tendances) : le « lift » = taux ÷ base.
   Sans ce rapport, un détecteur de tendance haussière paraîtrait bon dans un marché qui monte tout seul. Les points sont espacés (`pas`) pour limiter la dépendance entre mesures. */
export function precisionDetecteur(det, h1, { horizon = CRITERES_M6C.detecteur.horizonH1, pas = 6, c = CRITERES_M6C.detecteur } = {}) {
  const n = det.n, brut = { haussier: { k: 0, ok: 0 }, baissier: { k: 0, ok: 0 }, range: { k: 0, ok: 0 }, base: { haussier: 0, baissier: 0, tous: 0, range: { k: 0, ok: 0 } } };
  for (let i = 300; i < n - horizon; i += pas) {
    const a = h1.c[i], f = h1.c[i + horizon]; if (!(a > 0)) continue;
    brut.base.tous++; if (f > a) brut.base.haussier++; if (f < a) brut.base.baissier++;
    // boîte générique (72 bougies) pour la base du range : mêmes bornes que le détecteur mais sans condition de touches ni d'ADX
    let mx = -Infinity, mn = Infinity; for (let j = i - 71; j <= i; j++) { if (h1.h[j] > mx) mx = h1.h[j]; if (h1.l[j] < mn) mn = h1.l[j]; }
    const w = mx - mn, largeur = w / det.atr[i], sortie = (hi, lo, ww) => { for (let j = i + 1; j <= i + horizon; j++) if (h1.c[j] > hi + 0.25 * ww || h1.c[j] < lo - 0.25 * ww) return true; return false; };
    if (largeur >= det.params.largeurMinATR && largeur <= det.params.largeurMaxATR && a <= mx && a >= mn) { brut.base.range.k++; if (!sortie(mx, mn, w)) brut.base.range.ok++; }
    const r = det.regime[i];
    if (r === CODES.HAUSSIER) { brut.haussier.k++; if (f > a) brut.haussier.ok++; }
    else if (r === CODES.BAISSIER) { brut.baissier.k++; if (f < a) brut.baissier.ok++; }
    else if (r === CODES.RANGE) { const hi = det.boiteHaut[i], lo = det.boiteBas[i]; brut.range.k++; if (!sortie(hi, lo, hi - lo)) brut.range.ok++; }
  }
  const mk = (nom, x, base, evenement) => {
    const taux = x.k ? x.ok / x.k : null, lift = taux != null && base ? taux / base : null;
    return { regime: nom, evenement, n: x.k, taux, base, lift, ok: x.k >= c.echantillonMin && taux != null && taux >= c.tauxMin && lift != null && lift >= c.liftMin };
  };
  const bt = brut.base.tous || 1;
  return [mk('tendance haussière', brut.haussier, brut.base.haussier / bt, 'clôture plus haute ' + horizon + ' h plus tard'), mk('tendance baissière', brut.baissier, brut.base.baissier / bt, 'clôture plus basse ' + horizon + ' h plus tard'),
    mk('range', brut.range, brut.base.range.k ? brut.base.range.ok / brut.base.range.k : null, 'aucune clôture hors de la boîte élargie de 25 % pendant ' + horizon + ' h')];
}
