/* ═════════════ OUTILS « INSTITUTIONNELS » DU GRAPHIQUE DE L'OR (pur, testé) ═════════════
   Tout est calculé sur les bougies Kraken PF_XAUUSD déjà chargées (volume réel Kraken `v`) et sur les transactions Kraken en direct (CVD) : aucune valeur inventée.
   Informations de lecture, jamais un ordre. Heure de Paris (Europe/Paris, heure d'été comprise).
   Séances (Paris) : Asie 01:00–09:00 · Londres 09:00–15:30 · New York 15:30–22:00 (documenté, identique partout). */
import { heureLocale, dateParis } from './temps-or.js';
export const SEANCES = Object.freeze([{ id: 'asie', nom: 'Asie', de: 60, a: 540 }, { id: 'londres', nom: 'Londres', de: 540, a: 930 }, { id: 'ny', nom: 'New York', de: 930, a: 1320 }]);
export const minutesParis = t => { const p = heureLocale(t, 'Europe/Paris'); return p.h * 60 + p.m; };
export const seanceDe = t => { const m = minutesParis(t); const s = SEANCES.find(q => m >= q.de && m < q.a); return s ? s.id : null; };
const poids = b => (b.v > 0 ? b.v : 0);
const pt = b => (b.h + b.l + b.c) / 3;

/* ── VWAP de séance (jour de Paris) : valeur à la CLÔTURE de chaque bougie, écart-type pondéré par le volume. Renvoie [{t, vwap, sd, jour}] */
export function vwapSeance(B) {
  const out = []; let jour = null, sv = 0, spv = 0, spv2 = 0;
  for (const b of B) {
    const j = dateParis(b.t); if (j !== jour) { jour = j; sv = spv = spv2 = 0; }
    const w = poids(b), p = pt(b); if (w <= 0) continue; sv += w; spv += w * p; spv2 += w * p * p;
    const m = spv / sv; out.push({ t: b.t, vwap: m, sd: Math.sqrt(Math.max(0, spv2 / sv - m * m)), jour });
  }
  return out;
}
/* ── VWAP ancré : depuis la bougie d'indice i0 jusqu'à la fin */
export function vwapAncre(B, i0) {
  const out = []; let sv = 0, spv = 0, spv2 = 0;
  for (let i = Math.max(0, i0); i < B.length; i++) { const b = B[i], w = poids(b), p = pt(b); if (w <= 0) continue; sv += w; spv += w * p; spv2 += w * p * p; const m = spv / sv; out.push({ t: b.t, vwap: m, sd: Math.sqrt(Math.max(0, spv2 / sv - m * m)) }); }
  return out;
}
/* ── jours et semaines (Paris) : agrégats connus, la période en cours est marquée `encours` */
export function jours(B) {
  const L = []; for (let i = 0; i < B.length; i++) { const b = B[i], j = dateParis(b.t); let J = L[L.length - 1]; if (!J || J.jour !== j) { J = { jour: j, i0: i, t0: b.t, o: b.o, h: b.h, l: b.l, c: b.c, iH: i, iL: i }; L.push(J); } else { if (b.h > J.h) { J.h = b.h; J.iH = i; } if (b.l < J.l) { J.l = b.l; J.iL = i; } J.c = b.c; } J.i1 = i; }
  return L;
}
export const cleSemaine = t => { const [a, m, j] = dateParis(t).split('-').map(Number); const d = new Date(Date.UTC(a, m - 1, j)); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); };
export function semaines(B) {
  const L = []; for (let i = 0; i < B.length; i++) { const b = B[i], s = cleSemaine(b.t); let S = L[L.length - 1]; if (!S || S.sem !== s) { S = { sem: s, i0: i, t0: b.t, o: b.o, h: b.h, l: b.l, c: b.c }; L.push(S); } else { if (b.h > S.h) S.h = b.h; if (b.l < S.l) S.l = b.l; S.c = b.c; } S.i1 = i; }
  return L;
}
/* ── niveaux : plus haut / bas de la veille et de la semaine précédente, ouvertures du jour et de la semaine */
export function niveauxPeriodes(B) {
  if (!B.length) return null; const J = jours(B), S = semaines(B), j = J[J.length - 1], s = S[S.length - 1], jv = J[J.length - 2] || null, sv = S[S.length - 2] || null;
  return { ouvJour: j.o, ouvJourT: j.t0, ouvSemaine: s.o, ouvSemaineT: s.t0, pdh: jv && jv.h, pdl: jv && jv.l, pdc: jv && jv.c, pdhT: jv && B[jv.iH].t, pdlT: jv && B[jv.iL].t, pwh: sv && sv.h, pwl: sv && sv.l, pwc: sv && sv.c, jourT0: jv && jv.t0, semT0: sv && sv.t0, i0Jour: j.i0, i0Semaine: s.i0, iHveille: jv && jv.iH, iLveille: jv && jv.iL };
}
/* ── profil de volume (volume réel Kraken réparti sur [bas, haut] de chaque bougie, cases de `pas` $) : POC, zone de valeur 70 % (VAL, VAH) */
export function profil(B, t0, t1, pas = 1) {
  const m = new Map(); let tot = 0, n = 0;
  for (const b of B) { if (b.t < t0 || b.t >= t1) continue; const w = poids(b); if (w <= 0) continue; n++; const lo = Math.floor(b.l / pas), hi = Math.floor(b.h / pas), nb = hi - lo + 1, x = w / nb; for (let k = lo; k <= hi; k++) { m.set(k, (m.get(k) || 0) + x); tot += x; } }
  if (!m.size) return null;
  const cases = [...m].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ p: (k + 0.5) * pas, v })); let ip = 0; for (let k = 1; k < cases.length; k++) if (cases[k].v > cases[ip].v) ip = k;
  let a = ip, z = ip, acc = cases[ip].v; while (acc < 0.7 * tot && (a > 0 || z < cases.length - 1)) { const g = a > 0 ? cases[a - 1].v : -1, d = z < cases.length - 1 ? cases[z + 1].v : -1; if (g >= d) { a--; acc += cases[a].v; } else { z++; acc += cases[z].v; } }
  return { poc: cases[ip].p, val: cases[a].p - pas / 2, vah: cases[z].p + pas / 2, cases, pas, total: tot, bougies: n, max: cases[ip].v };
}
export function profils(B, nv) {
  if (!B.length || !nv) return {}; const fin = B[B.length - 1].t + 1, J = jours(B), S = semaines(B), j = J[J.length - 1], jv = J[J.length - 2], s = S[S.length - 1];
  const etendue = Math.max(...B.slice(-200).map(b => b.h)) - Math.min(...B.slice(-200).map(b => b.l)), pas = etendue > 120 ? 1 : 0.5;
  return { seance: profil(B, j.t0, fin, pas), veille: jv ? profil(B, jv.t0, j.t0, pas) : null, semaine: profil(B, s.t0, fin, pas) };
}
/* ── plages de séance (Paris) du jour et de la veille ; balayages : une séance dépasse l'extrême d'une séance précédente PUIS une bougie clôture de nouveau à l'intérieur */
export function plagesSeances(B) {
  const J = jours(B); if (!J.length) return { plages: [], balayages: [] }; const plages = [], dernier = J.slice(-2);
  for (const D of dernier) for (const s of SEANCES) { let h = -Infinity, l = Infinity, t0 = null, t1 = null; for (let i = D.i0; i <= D.i1; i++) { if (seanceDe(B[i].t) !== s.id) continue; if (t0 == null) t0 = B[i].t; t1 = B[i].t + 1; if (B[i].h > h) h = B[i].h; if (B[i].l < l) l = B[i].l; } if (t0 != null) plages.push({ jour: D.jour, id: s.id, nom: s.nom, t0, t1, h, l }); }
  const bal = []; for (let k = 1; k < plages.length; k++) { const prec = plages[k - 1], cur = plages[k]; if (prec.id === cur.id) continue; for (let i = 0; i < B.length; i++) { const b = B[i]; if (b.t < cur.t0 || b.t >= cur.t1) continue; if (b.h > prec.h && b.c < prec.h) { bal.push({ t: b.t, p: prec.h, sens: 'haut', de: prec.nom, a: cur.nom }); break; } if (b.l < prec.l && b.c > prec.l) { bal.push({ t: b.t, p: prec.l, sens: 'bas', de: prec.nom, a: cur.nom }); break; } } }
  return { plages, balayages: bal };
}
/* ── niveaux ronds (pas de 50 ou 100 $) autour d'un prix : n de chaque côté */
export function ronds(prix, pas = 50, n = 4) { if (!(prix > 0)) return []; const b = Math.floor(prix / pas) * pas, L = []; for (let k = -n + 1; k <= n; k++) L.push(b + k * pas); return L; }
/* ── zones de liquidité : hauts/bas égaux (pivots à moins de `tol` × ATR) et extrêmes de pivot non touchés depuis */
export function liquidite(B, { atr = null, k = 3, tol = 0.1, max = 6 } = {}) {
  const a = atr || (() => { let s = 0, n = 0; for (let i = Math.max(1, B.length - 14); i < B.length; i++) { s += Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); n++; } return n ? s / n : 0; })(); if (!a) return { egaux: [], intacts: [] };
  const ph = [], pl = []; for (let i = k; i < B.length - k; i++) { let h = true, l = true; for (let j = 1; j <= k; j++) { if (B[i].h < B[i - j].h || B[i].h <= B[i + j].h) h = false; if (B[i].l > B[i - j].l || B[i].l >= B[i + j].l) l = false; } if (h) ph.push(i); if (l) pl.push(i); }
  const egaux = [], intacts = [];
  const scanner = (P, cle, signe) => { for (let x = 0; x < P.length; x++) { const i = P[x], p = B[i][cle]; let touche = false; for (let j = i + 1; j < B.length; j++) if (signe > 0 ? B[j].h > p : B[j].l < p) { touche = true; break; } if (!touche) intacts.push({ t: B[i].t, p, sens: signe > 0 ? 'haut' : 'bas' });
    for (let y = x + 1; y < P.length; y++) { const q = B[P[y]][cle]; if (Math.abs(q - p) <= tol * a) { let franchi = false; for (let j = P[y] + 1; j < B.length; j++) if (signe > 0 ? B[j].h > Math.max(p, q) + tol * a : B[j].l < Math.min(p, q) - tol * a) { franchi = true; break; } if (!franchi) egaux.push({ t0: B[i].t, t1: B[P[y]].t, p: (p + q) / 2, sens: signe > 0 ? 'haut' : 'bas', n: 2 }); } } } };
  scanner(ph, 'h', 1); scanner(pl, 'l', -1);
  const rec = L => L.sort((x, y) => (y.t ?? y.t1) - (x.t ?? x.t1)).slice(0, max); return { egaux: rec(egaux), intacts: rec(intacts), atr: a };
}
/* ── delta et CVD depuis les transactions Kraken en direct. Les transactions s'accumulent par bougie de `periode` ms : carte { [tBougie]: [achats, ventes] } (quantités, côté agresseur) */
export function accumuler(carte, trades, periode, dejaVu = null) {
  let nouveau = 0; for (const x of trades) { if (!x || !(x.q > 0) || !(x.t > 0)) continue; if (dejaVu && x.t <= dejaVu.t && dejaVu.cles.has(x.t + '|' + x.p + '|' + x.q)) continue; const k = Math.floor(x.t / periode) * periode, e = carte[k] || (carte[k] = [0, 0]); if (x.cote === 'buy') e[0] += x.q; else if (x.cote === 'sell') e[1] += x.q; nouveau++; }
  return nouveau;
}
export function delta(B, carte) {
  const bars = [], cvd = []; let c = 0, depuis = null;
  for (const b of B) { const e = carte[b.t]; if (!e) continue; if (depuis == null) depuis = b.t; const d = e[0] - e[1]; c += d; bars.push({ t: b.t, d, achats: e[0], ventes: e[1] }); cvd.push({ t: b.t, v: c }); }
  return { bars, cvd, depuis };
}
/* divergences (n bougies) : prix fait un plus haut mais le CVD non (baissière) ; prix fait un plus bas mais le CVD non (haussière) */
export function divergences(B, cvd, n = 20) {
  if (cvd.length < n + 2) return []; const m = new Map(cvd.map(x => [x.t, x.v])), L = B.filter(b => m.has(b.t)).slice(-(n * 3)), out = [];
  for (let i = n; i < L.length; i++) { const f = L.slice(i - n, i); const hP = Math.max(...f.map(b => b.h)), lP = Math.min(...f.map(b => b.l)), hC = Math.max(...f.map(b => m.get(b.t))), lC = Math.min(...f.map(b => m.get(b.t))), b = L[i];
    if (b.h > hP && m.get(b.t) < hC) out.push({ t: b.t, p: b.h, sens: 'baissiere' }); else if (b.l < lP && m.get(b.t) > lC) out.push({ t: b.t, p: b.l, sens: 'haussiere' }); }
  return out.filter((x, k) => !k || x.t - out[k - 1].t > 2 * (B[1] ? B[1].t - B[0].t : 900e3)).slice(-5);
}
export const LIBELLES = Object.freeze({
  vwap: 'VWAP de séance (±1 / ±2 σ)', vwapAncre: 'VWAP ancré (bas/haut de la veille, ouverture de semaine)', profil: 'Profil de volume (POC, VAH, VAL)', cvd: 'CVD et delta par bougie (direct Kraken)', veilleSemaine: 'Plus haut/bas de la veille et de la semaine', ouvertures: 'Ouvertures du jour et de la semaine',
  seances: 'Plages Asie / Londres / New York (Paris) et balayages', ronds: 'Niveaux ronds (50 $ / 100 $)', liquiditeZones: 'Zones de liquidité (hauts/bas égaux, extrêmes intacts)', carteCarnet: 'Carte thermique du carnet'
});
