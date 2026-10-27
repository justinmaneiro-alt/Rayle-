/* ═════════════ INDICATEURS TECHNIQUES (module pur, calculés DANS LE NAVIGATEUR ; testés : planetes/mars/tests/trading-indicateurs-test.mjs) ═════════════
   Bougies : [{ t (ms), o, h, l, c, v }] de la plus ancienne à la plus récente. Chaque série rendue a la même longueur que les bougies ; `null` tant que l'indicateur
   n'a pas assez de recul. Mêmes méthodes que TradingView et que le Worker (EMA amorcée par la moyenne simple, RSI et ATR de Wilder), vérifiées contre le code du Worker dans le test. */
export const nul = n => new Array(n).fill(null);

export function sma(v, p) {
  const out = nul(v.length); if (v.length < p) return out;
  let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= p) s -= v[i - p]; if (i >= p - 1) out[i] = s / p; }
  return out;
}
export function ema(v, p) {
  const out = nul(v.length); if (v.length < p) return out;
  let e = 0; for (let i = 0; i < p; i++) e += v[i]; e /= p; out[p - 1] = e;
  const k = 2 / (p + 1);
  for (let i = p; i < v.length; i++) { e = v[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
/* EMA d'une série qui contient des null au début (ex. la ligne MACD) : démarre au premier segment de p valeurs. */
export function emaPartielle(v, p) {
  const out = nul(v.length), debut = v.findIndex(x => x != null);
  if (debut < 0 || v.length - debut < p) return out;
  const seg = ema(v.slice(debut), p);
  for (let i = 0; i < seg.length; i++) out[debut + i] = seg[i];
  return out;
}
export function rsi(c, p = 14) {
  const out = nul(c.length); if (c.length <= p) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= p; l /= p; out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
export function atr(b, p = 14) {
  const out = nul(b.length); if (b.length < p) return out;
  const tr = b.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c))));
  let a = 0; for (let i = 0; i < p; i++) a += tr[i]; a /= p; out[p - 1] = a;
  for (let i = p; i < b.length; i++) { a = (a * (p - 1) + tr[i]) / p; out[i] = a; }
  return out;
}
export function macd(c, rapide = 12, lent = 26, signal = 9) {
  const er = ema(c, rapide), el = ema(c, lent), ligne = c.map((_, i) => (er[i] != null && el[i] != null ? er[i] - el[i] : null));
  const sig = emaPartielle(ligne, signal);
  return { macd: ligne, signal: sig, histogramme: ligne.map((m, i) => (m != null && sig[i] != null ? m - sig[i] : null)) };
}
/* Bandes de Bollinger : moyenne simple ± k écarts-types (écart-type de la population, comme TradingView). */
export function bollinger(c, p = 20, k = 2) {
  const mid = sma(c, p), haut = nul(c.length), bas = nul(c.length);
  for (let i = p - 1; i < c.length; i++) {
    let s = 0; for (let j = i - p + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / p); haut[i] = mid[i] + k * sd; bas[i] = mid[i] - k * sd;
  }
  return { milieu: mid, haut, bas };
}
/* VWAP par séance : le cumul repart à zéro quand la clé de séance change (par défaut, le jour UTC). Sans volume (somme nulle) : null. */
export const jourUTC = t => Math.floor(t / 86400e3);
export function vwap(b, cleSeance = x => jourUTC(x.t)) {
  const out = nul(b.length); let cle = null, pv = 0, v = 0;
  for (let i = 0; i < b.length; i++) {
    const k = cleSeance(b[i]); if (k !== cle) { cle = k; pv = 0; v = 0; }
    const vol = b[i].v > 0 ? b[i].v : 0, tp = (b[i].h + b[i].l + b[i].c) / 3;
    pv += tp * vol; v += vol; out[i] = v > 0 ? pv / v : null;
  }
  return out;
}
/* Y a-t-il du volume exploitable ? (au moins 60 % des bougies avec un volume > 0) */
export function aDuVolume(b) { if (!b.length) return false; let n = 0; for (const x of b) if (x.v > 0) n++; return n >= b.length * 0.6; }

/* Profil de volume : le volume de chaque bougie est réparti uniformément sur la plage [bas, haut] de la bougie, puis cumulé par tranche de prix.
   Rend { niveaux:[{ prix, volume }] (du bas vers le haut), poc (prix du plus gros volume), vah / val (zone de valeur contenant 70 % du volume) }. */
export function profilVolume(b, tranches = 48, partValeur = 0.7) {
  const sel = b.filter(x => x.v > 0 && x.h >= x.l);
  if (sel.length < 2) return null;
  let min = Infinity, max = -Infinity; for (const x of sel) { if (x.l < min) min = x.l; if (x.h > max) max = x.h; }
  if (!(max > min)) return null;
  const pas = (max - min) / tranches, vol = new Array(tranches).fill(0);
  for (const x of sel) {
    const i0 = Math.min(tranches - 1, Math.floor((x.l - min) / pas)), i1 = Math.min(tranches - 1, Math.floor((x.h - min) / pas));
    if (i0 === i1) { vol[i0] += x.v; continue; }
    const etendue = x.h - x.l;
    for (let i = i0; i <= i1; i++) { const a = Math.max(x.l, min + i * pas), z = Math.min(x.h, min + (i + 1) * pas); if (z > a) vol[i] += x.v * (z - a) / etendue; }
  }
  const total = vol.reduce((s, v) => s + v, 0); let ip = 0; for (let i = 1; i < tranches; i++) if (vol[i] > vol[ip]) ip = i;
  let lo = ip, hi = ip, cumul = vol[ip];
  while (cumul < total * partValeur && (lo > 0 || hi < tranches - 1)) {
    const dessous = lo > 0 ? vol[lo - 1] : -1, dessus = hi < tranches - 1 ? vol[hi + 1] : -1;
    if (dessus >= dessous) { hi++; cumul += vol[hi]; } else { lo--; cumul += vol[lo]; }
  }
  const centre = i => min + (i + 0.5) * pas;
  return { niveaux: vol.map((v, i) => ({ prix: centre(i), volume: v })), poc: centre(ip), vah: min + (hi + 1) * pas, val: min + lo * pas, min, max, total };
}

/* ── Pivots, supports et résistances (même méthode que le Worker : worker/src/terminal/graphique.js) ── */
export function pivots(b, g) {
  const hauts = [], bas = [];
  for (let i = g; i < b.length - g; i++) {
    let h = true, l = true;
    for (let k = 1; k <= g; k++) {
      if (b[i].h <= b[i - k].h || b[i].h < b[i + k].h) h = false;
      if (b[i].l >= b[i - k].l || b[i].l > b[i + k].l) l = false;
    }
    if (h) hauts.push({ i, p: b[i].h }); if (l) bas.push({ i, p: b[i].l });
  }
  return { hauts, bas };
}
export const ATR_PROMINENCE = 1.5, ATR_ZONE = 0.75, ATR_MIN_PRIX = 0.5, ATR_MIN_ENTRE = 1;
function pivotsSignificatifs(b, g, a) {
  const pv = pivots(b, g), w = Math.max(g * 4, 12), n = b.length, hauts = [], bas = [];
  for (const x of pv.hauts) {
    let gauche = Infinity, droite = Infinity;
    for (let k = Math.max(0, x.i - w); k < x.i; k++) gauche = Math.min(gauche, b[k].l);
    for (let k = x.i + 1; k <= Math.min(n - 1, x.i + w); k++) droite = Math.min(droite, b[k].l);
    if (x.p - Math.max(gauche, droite) >= ATR_PROMINENCE * a) hauts.push(x);
  }
  for (const x of pv.bas) {
    let gauche = -Infinity, droite = -Infinity;
    for (let k = Math.max(0, x.i - w); k < x.i; k++) gauche = Math.max(gauche, b[k].h);
    for (let k = x.i + 1; k <= Math.min(n - 1, x.i + w); k++) droite = Math.max(droite, b[k].h);
    if (Math.min(gauche, droite) - x.p >= ATR_PROMINENCE * a) bas.push(x);
  }
  return { hauts, bas };
}
/* Rend { supports:[{ prix, touches, recent, force, distance_atr }], resistances:[…], atr } : au plus 3 de chaque côté, les plus proches du prix. */
export function niveauxCles(b, atrValeur) {
  const n = b.length; if (n < 30) return { supports: [], resistances: [], atr: null };
  const prix = b[n - 1].c, a = atrValeur || (b.slice(-14).reduce((s, x) => s + (x.h - x.l), 0) / 14) || prix * 0.002;
  const tol = Math.max(a * ATR_ZONE, prix * 0.0004), pts = [];
  for (const [k, g] of [3, 6].entries()) { const pv = pivotsSignificatifs(b, g, a); for (const x of pv.hauts.concat(pv.bas)) pts.push({ i: x.i, p: x.p, poids: k ? 2 : 1 }); }
  pts.sort((u, v) => u.p - v.p);
  const zones = [];
  for (const x of pts) {
    const z = zones[zones.length - 1];
    if (z && x.p - z.max <= tol) { z.max = x.p; z.somme += x.p * x.poids; z.poids += x.poids; z.touches++; z.dernier = Math.max(z.dernier, x.i); }
    else zones.push({ min: x.p, max: x.p, somme: x.p * x.poids, poids: x.poids, touches: 1, dernier: x.i });
  }
  const recent = d => d >= n - Math.round(n * 0.35);
  const niveaux = zones.map(z => ({ prix: z.somme / z.poids, touches: z.touches, recent: recent(z.dernier), force: z.poids + (recent(z.dernier) ? 1.5 : 0) }));
  const choisir = sens => {
    const ok = niveaux.filter(z => (sens === 'bas' ? z.prix <= prix - ATR_MIN_PRIX * a : z.prix >= prix + ATR_MIN_PRIX * a)).sort((u, v) => Math.abs(u.prix - prix) - Math.abs(v.prix - prix));
    const gardes = [];
    for (const z of ok) { if (gardes.every(q => Math.abs(q.prix - z.prix) >= ATR_MIN_ENTRE * a)) gardes.push(z); if (gardes.length === 3) break; }
    return gardes.sort((u, v) => (sens === 'bas' ? v.prix - u.prix : u.prix - v.prix));
  };
  const sortie = z => ({ prix: z.prix, touches: z.touches, recent: z.recent, force: z.force >= 5 ? 'forte' : z.force >= 3 ? 'moyenne' : 'faible', distance_atr: Math.abs(z.prix - prix) / a });
  return { supports: choisir('bas').map(sortie), resistances: choisir('haut').map(sortie), atr: a };
}

/* Tous les indicateurs d'un coup (le graphique en choisit l'affichage). */
export function calculerTout(b) {
  const c = b.map(x => x.c);
  return {
    ma20: sma(c, 20), ma50: sma(c, 50), ma200: sma(c, 200), ema20: ema(c, 20), ema50: ema(c, 50), ema200: ema(c, 200),
    rsi: rsi(c, 14), macd: macd(c), bollinger: bollinger(c), atr: atr(b, 14), vwap: vwap(b)
  };
}
