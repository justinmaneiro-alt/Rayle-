import { atr, pivots, rangPercentile, sma } from '../agent-btc/indic.js';

/* ═════════════ DÉTECTEUR DE RÉGIME DE MARCHÉ (M6c ; module pur, déterministe, testé : planetes/mars/tests/m6c-detecteur-test.mjs) ═════════════
   Travaille sur des bougies H1 en colonnes ({ n, t, o, h, l, c, v }). La valeur à l'index i n'utilise QUE les bougies 0..i (aucun regard vers le futur ; le test « poison du futur » le vérifie).
   Quatre régimes : 1 TENDANCE HAUSSIÈRE · 2 TENDANCE BAISSIÈRE · 3 RANGE · 0 TRANSITION / VOLATIL.
   Règles (écrites a priori, valeurs usuelles, non optimisées) :
   - TENDANCE HAUSSIÈRE : clôture au-dessus de la MA200 H1, pente de la MA200 positive (sur 48 bougies), ADX(14) ≥ 20 avec +DI > −DI, et (sommets et creux montants confirmés OU ADX ≥ 25). Baissière : le miroir.
   - RANGE : ADX < 22, boîte des 72 dernières bougies (plus haut / plus bas), largeur entre 3 et 16 ATR, au moins 2 touches distinctes (espacées de 4 bougies) de CHAQUE borne
     (touche = extrême dans le dixième extérieur de la boîte), clôture à l'intérieur. On trace alors les bornes, leur âge (depuis la plus ancienne touche), le nombre de touches et la compression.
   - sinon TRANSITION / VOLATIL (l'étiquette « volatil » s'ajoute quand l'ATR dépasse 1,6 fois sa moyenne des 100 dernières bougies).
   Compression = largeur de Bollinger (20, 2σ) dans le 20e centile de ses 200 dernières valeurs. */
export const REGIMES = Object.freeze({ 0: 'transition / volatil', 1: 'tendance haussière', 2: 'tendance baissière', 3: 'range' });
export const CODES = Object.freeze({ TRANSITION: 0, HAUSSIER: 1, BAISSIER: 2, RANGE: 3 });
export const PARAMS_REGIME = Object.freeze({
  ma: 200, penteBarres: 48, adxPeriode: 14, adxTendance: 20, adxTendanceFort: 25, adxRange: 22, fenetreBoite: 72, largeurMinATR: 3, largeurMaxATR: 16, touchesMin: 2, zoneTouche: 0.1, espaceTouches: 4,
  bollingerPeriode: 20, compressionFenetre: 200, compressionCentile: 0.2, volatilRatio: 1.6, volatilFenetre: 100, pivotK: 3
});
const nan = n => { const a = new Float64Array(n); a.fill(NaN); return a; };

/* ADX de Wilder (+DI, −DI, ADX). */
export function adx(h, l, c, p = 14) {
  const n = c.length, plus = nan(n), moins = nan(n), out = nan(n); if (n < 2 * p + 1) return { adx: out, plus, moins };
  let tr14 = 0, p14 = 0, m14 = 0;
  const tr = new Float64Array(n), pd = new Float64Array(n), md = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pd[i] = up > dn && up > 0 ? up : 0; md[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  for (let i = 1; i <= p; i++) { tr14 += tr[i]; p14 += pd[i]; m14 += md[i]; }
  const dx = nan(n);
  for (let i = p; i < n; i++) {
    if (i > p) { tr14 = tr14 - tr14 / p + tr[i]; p14 = p14 - p14 / p + pd[i]; m14 = m14 - m14 / p + md[i]; }
    const pi = tr14 > 0 ? 100 * p14 / tr14 : 0, mi = tr14 > 0 ? 100 * m14 / tr14 : 0; plus[i] = pi; moins[i] = mi;
    dx[i] = pi + mi > 0 ? 100 * Math.abs(pi - mi) / (pi + mi) : 0;
  }
  let a = 0; for (let i = p; i < 2 * p; i++) a += dx[i]; a /= p; out[2 * p - 1] = a;
  for (let i = 2 * p; i < n; i++) { a = (a * (p - 1) + dx[i]) / p; out[i] = a; }
  return { adx: out, plus, moins };
}
/* Largeur de Bollinger relative : 4σ / moyenne (écart-type de la fenêtre p). */
export function largeurBollinger(c, p = 20) {
  const n = c.length, out = nan(n), m = sma(c, p);
  for (let i = p - 1; i < n; i++) { let s = 0; for (let j = i - p + 1; j <= i; j++) { const d = c[j] - m[i]; s += d * d; } out[i] = 4 * Math.sqrt(s / p) / m[i]; }
  return out;
}

/* Détecte le régime sur toute la série H1. Rend des colonnes alignées sur les bougies H1. */
export function detecter(h1, P = PARAMS_REGIME) {
  const { n, h, l, c } = h1;
  const regime = new Uint8Array(n), volatil = new Uint8Array(n), structure = new Int8Array(n);
  const boiteHaut = nan(n), boiteBas = nan(n), touchesHaut = new Uint8Array(n), touchesBas = new Uint8Array(n), age = new Int32Array(n), compression = new Uint8Array(n);
  const a = atr(h, l, c, 14), ma = sma(c, P.ma), D = adx(h, l, c, P.adxPeriode), lb = largeurBollinger(c, P.bollingerPeriode), rangLb = rangPercentile(lb, P.compressionFenetre), atrMoy = sma(a, P.volatilFenetre), pv = pivots(h, l, P.pivotK);
  const pente = nan(n); for (let i = P.penteBarres; i < n; i++) if (Number.isFinite(ma[i]) && Number.isFinite(ma[i - P.penteBarres]) && a[i] > 0) pente[i] = (ma[i] - ma[i - P.penteBarres]) / a[i];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(rangLb[i]) && rangLb[i] <= P.compressionCentile) compression[i] = 1;
    if (Number.isFinite(a[i]) && Number.isFinite(atrMoy[i]) && a[i] > P.volatilRatio * atrMoy[i]) volatil[i] = 1;
    const hh = pv.haut[i], ph = pv.precHaut[i], bb = pv.bas[i], pb = pv.precBas[i];
    structure[i] = Number.isFinite(hh) && Number.isFinite(ph) && Number.isFinite(bb) && Number.isFinite(pb) ? (hh > ph && bb > pb ? 1 : hh < ph && bb < pb ? -1 : 0) : 0;
    if (!(Number.isFinite(ma[i]) && Number.isFinite(pente[i]) && Number.isFinite(D.adx[i]) && a[i] > 0)) continue;       // chauffe : transition par défaut
    const ax = D.adx[i], haussier = c[i] > ma[i] && pente[i] > 0 && ax >= P.adxTendance && D.plus[i] > D.moins[i] && (structure[i] === 1 || ax >= P.adxTendanceFort);
    const baissier = c[i] < ma[i] && pente[i] < 0 && ax >= P.adxTendance && D.moins[i] > D.plus[i] && (structure[i] === -1 || ax >= P.adxTendanceFort);
    if (haussier) { regime[i] = CODES.HAUSSIER; continue; }
    if (baissier) { regime[i] = CODES.BAISSIER; continue; }
    if (ax < P.adxRange && i >= P.fenetreBoite) {
      const d = i - P.fenetreBoite + 1; let mx = -Infinity, mn = Infinity; for (let j = d; j <= i; j++) { if (h[j] > mx) mx = h[j]; if (l[j] < mn) mn = l[j]; }
      const w = mx - mn, largeur = w / a[i];
      if (largeur >= P.largeurMinATR && largeur <= P.largeurMaxATR && c[i] <= mx && c[i] >= mn) {
        let th = 0, tb = 0, dernH = -1e9, dernB = -1e9, premiere = i;
        for (let j = d; j <= i; j++) {
          if (h[j] >= mx - P.zoneTouche * w) { if (j - dernH >= P.espaceTouches) { th++; if (j < premiere) premiere = j; } dernH = j; }
          if (l[j] <= mn + P.zoneTouche * w) { if (j - dernB >= P.espaceTouches) { tb++; if (j < premiere) premiere = j; } dernB = j; }
        }
        if (th >= P.touchesMin && tb >= P.touchesMin) { regime[i] = CODES.RANGE; boiteHaut[i] = mx; boiteBas[i] = mn; touchesHaut[i] = Math.min(255, th); touchesBas[i] = Math.min(255, tb); age[i] = i - premiere; }
      }
    }
  }
  return { n, regime, volatil, structure, boiteHaut, boiteBas, touchesHaut, touchesBas, age, compression, adx: D.adx, plusDI: D.plus, moinsDI: D.moins, atr: a, ma200: ma, pente, largeurBB: lb, params: P };
}

/* Description lisible du régime à l'index i (H1) : sert à l'affichage, à la voix et aux alertes. */
export function decrire(det, h1, i) {
  if (i < 0 || i >= det.n) return null;
  const code = det.regime[i], px = h1.c[i], nom = REGIMES[code], fmt = x => Math.round(x).toLocaleString('fr-FR');
  const o = { code, nom, volatil: !!det.volatil[i], compression: !!det.compression[i], adx: Number.isFinite(det.adx[i]) ? det.adx[i] : null, prix: px, t: h1.t[i] + 3600e3 };
  if (code === CODES.RANGE) { o.haut = det.boiteHaut[i]; o.bas = det.boiteBas[i]; o.touchesHaut = det.touchesHaut[i]; o.touchesBas = det.touchesBas[i]; o.ageH = det.age[i]; o.milieu = (o.haut + o.bas) / 2; }
  o.phrase = code === CODES.RANGE ? 'On est en range entre ' + fmt(o.bas) + ' et ' + fmt(o.haut) + ' (' + o.touchesBas + ' touches en bas, ' + o.touchesHaut + ' en haut, depuis ' + Math.round(o.ageH) + ' heures' + (o.compression ? ', volatilité comprimée' : '') + '). Je ne propose aucune position.'
    : code === CODES.HAUSSIER ? 'Tendance haussière' + (o.volatil ? ', marché agité' : '') + ' : prix au-dessus de la moyenne 200 heures, ADX ' + Math.round(o.adx) + '.'
    : code === CODES.BAISSIER ? 'Tendance baissière' + (o.volatil ? ', marché agité' : '') + ' : prix sous la moyenne 200 heures, ADX ' + Math.round(o.adx) + '.'
    : 'Transition' + (o.volatil ? ' avec volatilité élevée' : '') + ' : pas de tendance ni de range nets, je reste prudente.';
  return o;
}

/* Segments de régime consécutifs (pour colorer le graphique) : [{ t0, t1, code, haut?, bas? }]. Les segments de moins de `min` bougies sont fondus dans le précédent. */
export function segments(det, h1, { min = 6, depuis = 0, jusqu = det.n } = {}) {
  const out = []; let d = Math.max(0, depuis);
  for (let i = d; i < jusqu; i++) {
    const code = det.regime[i], dernier = out[out.length - 1];
    if (dernier && dernier.code === code) { dernier.t1 = h1.t[i] + 3600e3; dernier.n++; if (code === CODES.RANGE) { dernier.haut = det.boiteHaut[i]; dernier.bas = det.boiteBas[i]; } }
    else out.push({ code, t0: h1.t[i], t1: h1.t[i] + 3600e3, n: 1, haut: code === CODES.RANGE ? det.boiteHaut[i] : null, bas: code === CODES.RANGE ? det.boiteBas[i] : null });
  }
  const f = [];
  for (const s of out) { if (s.n < min && f.length) { f[f.length - 1].t1 = s.t1; f[f.length - 1].n += s.n; } else f.push(s); }
  const m = [];
  for (const s of f) { const d2 = m[m.length - 1]; if (d2 && d2.code === s.code) { d2.t1 = s.t1; d2.n += s.n; if (s.haut != null) { d2.haut = s.haut; d2.bas = s.bas; } } else m.push({ ...s }); }
  return m;
}
