/* ═════════════ ANALYSE TECHNIQUE PURE (navigateur et Node) : aucune donnée inventée ═════════════
   Bougie = { t (ms UTC), o, h, l, c, v }. Toutes les fonctions renvoient null quand il n'y a pas assez de bougies (jamais un zéro de remplacement). */

export const H = 3600e3, J = 86400e3;

/* ───── moyennes et oscillateurs ───── */
export function sma(valeurs, n) {
  const out = new Array(valeurs.length).fill(null); if (valeurs.length < n || n < 1) return out;
  let s = 0; for (let i = 0; i < valeurs.length; i++) { s += valeurs[i]; if (i >= n) s -= valeurs[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
export function ema(valeurs, n) {
  const out = new Array(valeurs.length).fill(null); if (valeurs.length < n) return out;
  const k = 2 / (n + 1); let e = 0; for (let i = 0; i < n; i++) e += valeurs[i]; e /= n; out[n - 1] = e;
  for (let i = n; i < valeurs.length; i++) { e = valeurs[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
/* RSI de Wilder */
export function rsi(valeurs, n = 14) {
  const out = new Array(valeurs.length).fill(null); if (valeurs.length <= n) return out;
  let g = 0, p = 0; for (let i = 1; i <= n; i++) { const d = valeurs[i] - valeurs[i - 1]; if (d >= 0) g += d; else p -= d; }
  g /= n; p /= n; out[n] = p === 0 ? 100 : 100 - 100 / (1 + g / p);
  for (let i = n + 1; i < valeurs.length; i++) { const d = valeurs[i] - valeurs[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; p = (p * (n - 1) + (d < 0 ? -d : 0)) / n; out[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p); }
  return out;
}
/* ATR de Wilder */
export function atr(B, n = 14) {
  const out = new Array(B.length).fill(null); if (B.length <= n) return out;
  const tr = B.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - B[i - 1].c), Math.abs(b.l - B[i - 1].c))));
  let a = 0; for (let i = 1; i <= n; i++) a += tr[i]; a /= n; out[n] = a;
  for (let i = n + 1; i < B.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}
export const dernier = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };

/* ───── regroupement de bougies ───── */
/* Bougies de `pas` ms alignées sur `ancre` (ms UTC) ; la dernière peut être en cours (enCours = true). Les trous (week-ends) ne créent pas de bougie vide. */
export function regrouper(B, pas, ancre = 0, maintenant = Date.now()) {
  const out = []; let cur = null;
  for (const b of B) {
    const k = Math.floor((b.t - ancre) / pas);
    if (!cur || cur.k !== k) { if (cur) out.push(cur); cur = { k, t: ancre + k * pas, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; }
    else { if (b.h > cur.h) cur.h = b.h; if (b.l < cur.l) cur.l = b.l; cur.c = b.c; cur.v += b.v || 0; }
  }
  if (cur) out.push(cur);
  return out.map(x => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, enCours: x.t + pas > maintenant }));
}
/* H4 : ancrées à 22 h UTC (début de la journée de l'or et du forex) → 22, 02, 06, 10, 14, 18 h UTC */
export const ANCRE_H4 = 22 * H;
export const enH4 = (B1h, maintenant = Date.now()) => regrouper(B1h, 4 * H, ANCRE_H4, maintenant);

/* ───── tendance ───── */
/* Lecture descriptive d'une unité de temps : prix / MA200 (si assez de bougies) et pente de la MA50. Jamais un signal. */
export function tendance(B) {
  const c = B.map(b => b.c), m50 = sma(c, 50), m200 = sma(c, 200), i = B.length - 1;
  if (i < 60) return { sens: 'indéterminée', raison: 'pas assez de bougies (' + B.length + ')', ma200: null, ma50: null };
  const p = c[i], a = m50[i], b = m200[i], pente = m50[i - 10] != null ? a - m50[i - 10] : null;
  if (b != null) {
    const haut = p > b, up = pente != null && pente > 0;
    if (haut && up) return { sens: 'haussière', raison: 'prix au-dessus de la MA200 et MA50 qui monte', ma200: b, ma50: a };
    if (!haut && pente != null && pente < 0) return { sens: 'baissière', raison: 'prix sous la MA200 et MA50 qui baisse', ma200: b, ma50: a };
    return { sens: 'neutre', raison: (haut ? 'prix au-dessus' : 'prix sous') + ' de la MA200 mais MA50 ' + (up ? 'qui monte' : 'qui baisse'), ma200: b, ma50: a };
  }
  const haut = p > a, up = pente != null && pente > 0;
  return { sens: haut && up ? 'haussière' : !haut && pente != null && pente < 0 ? 'baissière' : 'neutre', raison: 'MA200 indisponible (moins de 200 bougies) : lecture sur la MA50', ma200: null, ma50: a };
}

/* ───── niveaux clés ───── */
export function pivots(B, k = 5) {
  const out = [];
  for (let i = k; i < B.length - k; i++) {
    let hi = true, lo = true;
    for (let j = 1; j <= k; j++) { if (!(B[i].h > B[i - j].h && B[i].h >= B[i + j].h)) hi = false; if (!(B[i].l < B[i - j].l && B[i].l <= B[i + j].l)) lo = false; if (!hi && !lo) break; }
    if (hi) out.push({ i, t: B[i].t, prix: B[i].h, type: 'R' });
    if (lo) out.push({ i, t: B[i].t, prix: B[i].l, type: 'S' });
  }
  return out;
}
/* Niveaux les plus forts (au plus `max` au-dessus et `max` au-dessous du prix) : pivots regroupés quand ils sont à moins de `tol` (en ATR), force = touches + récence.
   Deux niveaux retenus sont toujours séparés d'au moins 1 ATR. */
export function niveauxCles(B, { k = 5, max = 3, tol = 0.6, sep = 1, fenetre = 400 } = {}) {
  const X = B.slice(-fenetre), a = dernier(atr(X, 14)); if (!a || X.length < 40) return { resistances: [], supports: [], atr: a || null };
  const P = pivots(X, k), n = X.length, pr = X[n - 1].c;
  const groupes = [];
  for (const p of P.sort((x, y) => x.prix - y.prix)) {
    const g = groupes[groupes.length - 1];
    if (g && p.prix - g.max <= tol * a) { g.pts.push(p); g.max = p.prix; } else groupes.push({ pts: [p], max: p.prix });
  }
  const niv = groupes.map(g => {
    const prix = g.pts.reduce((s, p) => s + p.prix, 0) / g.pts.length, touches = g.pts.length;
    const recent = Math.max(...g.pts.map(p => p.i)), recence = 1 - (n - 1 - recent) / n;
    return { prix, touches, derniere: X[recent].t, force: touches + 1.5 * recence };
  });
  const choisir = L => { const sel = []; for (const x of L.sort((p, q) => q.force - p.force)) { if (sel.length >= max) break; if (sel.every(s => Math.abs(s.prix - x.prix) >= sep * a)) sel.push(x); } return sel; };
  return { resistances: choisir(niv.filter(x => x.prix > pr)).sort((x, y) => x.prix - y.prix), supports: choisir(niv.filter(x => x.prix <= pr)).sort((x, y) => y.prix - x.prix), atr: a };
}

/* Étiquettes de niveaux qui ne se chevauchent jamais : renvoie pour chaque niveau un décalage vertical (en pixels) pour une échelle donnée. */
export function etalerEtiquettes(niveaux, pixelsParUnite, hauteur = 16) {
  const L = niveaux.map((n, i) => ({ i, y: -n.prix * pixelsParUnite })).sort((a, b) => a.y - b.y), pos = [];
  for (const x of L) { let y = x.y; if (pos.length && y - pos[pos.length - 1].y < hauteur) y = pos[pos.length - 1].y + hauteur; pos.push({ i: x.i, y }); }
  const dec = new Array(niveaux.length).fill(0); for (const p of pos) dec[p.i] = p.y - L.find(l => l.i === p.i).y; return dec;
}

/* ───── corrélations et statistiques ───── */
export const rendements = c => { const r = []; for (let i = 1; i < c.length; i++) r.push(c[i - 1] > 0 && c[i] > 0 ? Math.log(c[i] / c[i - 1]) : null); return r; };
export const moyenne = a => a.reduce((s, x) => s + x, 0) / a.length;
export function ecartType(a) { const m = moyenne(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); }
export function correlation(x, y) {
  const P = []; for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] != null && y[i] != null && Number.isFinite(x[i]) && Number.isFinite(y[i])) P.push([x[i], y[i]]);
  if (P.length < 5) return null; const mx = moyenne(P.map(p => p[0])), my = moyenne(P.map(p => p[1]));
  let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of P) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/* ───── séries pour les graphiques ───── */
export function serieSma(B, n) { const m = sma(B.map(b => b.c), n); return B.map((b, i) => ({ t: b.t, v: m[i] })).filter(p => p.v != null); }
/* Reporte une courbe d'une grande unité de temps (points { t (ouverture), v }) sur des bougies plus fines, SANS regarder le futur :
   à chaque bougie on prend la valeur de la dernière bougie de la grande unité déjà FERMÉE (t + pas ≤ t de la bougie). */
export function projeter(points, pas, B) {
  const out = []; let k = -1;
  for (const b of B) { while (k + 1 < points.length && points[k + 1].t + pas <= b.t) k++; if (k >= 0) out.push({ t: b.t, v: points[k].v }); }
  return out;
}
/* Fusionne des listes de niveaux ({ prix, etiquette, … }) : ordre de priorité = ordre des listes ; deux niveaux à moins de `sep` l'un de l'autre → on garde le premier */
export function fusionnerNiveaux(listes, sep) { const sel = []; for (const L of listes) for (const x of L) if (sel.every(s => Math.abs(s.prix - x.prix) >= sep)) sel.push(x); return sel; }
