/* Contexte causal par bougie H1 : tout ce qui est calculé à l'indice i n'utilise que les bougies 0..i (clôture de i). Utilisé par les familles et le simulateur. */
import { annee } from './donnees.mjs';
const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
export function construire({ h1, m15 }) {
  const n = h1.length, t = h1.map(b => b.t), o = h1.map(b => b.o), h = h1.map(b => b.h), l = h1.map(b => b.l), c = h1.map(b => b.c), v = h1.map(b => b.v), sp = h1.map(b => b.sp);
  const tr = i => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]);
  const atr = sma(Array.from({ length: n }, (_, i) => tr(i)), 14), atr100 = sma(atr.map(x => x ?? 0), 100);
  const sma20 = sma(c, 20), sma50 = sma(c, 50), sma200 = sma(c, 200);
  const hr = t.map(x => new Date(x).getUTCHours()), jour = t.map(x => Math.floor(x / 864e5)), semaine = t.map(x => Math.floor((x / 864e5 + 3) / 7)); // semaine commençant le lundi (1970-01-01 = jeudi)
  const rsi = (() => { const o2 = new Array(n).fill(null); let g = 0, p = 0; for (let i = 1; i < n; i++) { const d = c[i] - c[i - 1]; const G = Math.max(d, 0), P = Math.max(-d, 0); if (i <= 14) { g += G; p += P; if (i === 14) { g /= 14; p /= 14; o2[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p); } } else { g = (g * 13 + G) / 14; p = (p * 13 + P) / 14; o2[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p); } } return o2; })();
  // agrégats par jour UTC
  const jours = [];
  for (let i = 0; i < n; i++) {
    if (!jours.length || jours[jours.length - 1].j !== jour[i]) jours.push({ j: jour[i], i0: i, i1: i, o: o[i], h: h[i], l: l[i], c: c[i], iH: i, iL: i });
    else { const J = jours[jours.length - 1]; if (h[i] > J.h) { J.h = h[i]; J.iH = i; } if (l[i] < J.l) { J.l = l[i]; J.iL = i; } J.c = c[i]; J.i1 = i; }
  }
  const dayOf = new Array(n); for (let k = 0; k < jours.length; k++) for (let i = jours[k].i0; i <= jours[k].i1; i++) dayOf[i] = k;
  // tendance Jour : clôture de la veille vs SMA50 des clôtures journalières (veille incluse) ; connue dès l'ouverture du jour
  const smaJ = sma(jours.map(J => J.c), 50), tJour = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { const k = dayOf[i] - 1; if (k >= 50 && smaJ[k] != null) tJour[i] = jours[k].c > smaJ[k] ? 1 : jours[k].c < smaJ[k] ? -1 : 0; }
  const tH4 = new Array(n).fill(0); for (let i = 0; i < n; i++) if (sma200[i] != null) tH4[i] = c[i] > sma200[i] ? 1 : -1; // H4 ≈ SMA200 en H1 (= SMA50 des H4)
  // semaines
  const sem = [];
  for (let i = 0; i < n; i++) { if (!sem.length || sem[sem.length - 1].s !== semaine[i]) sem.push({ s: semaine[i], i0: i, o: o[i], h: h[i], l: l[i] }); else { const S = sem[sem.length - 1]; if (h[i] > S.h) S.h = h[i]; if (l[i] < S.l) S.l = l[i]; } }
  const semOf = new Array(n); for (let k = 0; k < sem.length; k++) for (let i = sem[k].i0; i < (sem[k + 1]?.i0 ?? n); i++) semOf[i] = k;
  const pdh = new Array(n).fill(null), pdl = new Array(n).fill(null), pdc = new Array(n).fill(null), pwh = new Array(n).fill(null), pwl = new Array(n).fill(null), dOpen = new Array(n), wOpen = new Array(n);
  const pdiH = new Array(n).fill(null), pdiL = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const k = dayOf[i]; if (k > 0) { const V = jours[k - 1]; pdh[i] = V.h; pdl[i] = V.l; pdc[i] = V.c; pdiH[i] = V.iH; pdiL[i] = V.iL; }
    const ks = semOf[i]; if (ks > 0) { pwh[i] = sem[ks - 1].h; pwl[i] = sem[ks - 1].l; }
    dOpen[i] = jours[k].o; wOpen[i] = sem[ks].o;
  }
  // plages de séance du jour (connues seulement après leur fin) : Asie 0–7, Londres 7–13 (UTC)
  const asie = new Array(n).fill(null), lon = new Array(n).fill(null);
  for (let k = 0; k < jours.length; k++) {
    let ah = -Infinity, al = Infinity, lh = -Infinity, ll = Infinity;
    for (let i = jours[k].i0; i <= jours[k].i1; i++) {
      if (hr[i] < 7) { ah = Math.max(ah, h[i]); al = Math.min(al, l[i]); } else if (hr[i] < 13) { lh = Math.max(lh, h[i]); ll = Math.min(ll, l[i]); }
      if (hr[i] >= 7 && ah > -Infinity) asie[i] = { h: ah, l: al };
      if (hr[i] >= 13 && lh > -Infinity) lon[i] = { h: lh, l: ll };
    }
  }
  // plages d'ouverture de New York (13:30–14:00 et 13:30–14:30 UTC) depuis les M15
  const m15ParJour = new Map();
  for (const b of m15) { const j = Math.floor(b.t / 864e5), s = (b.t % 864e5) / 6e4; if (!m15ParJour.has(j)) m15ParJour.set(j, []); m15ParJour.get(j).push({ s, b }); }
  const ny30 = new Array(n).fill(null), ny60 = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const L = m15ParJour.get(jour[i]); if (!L) continue;
    const plage = (a, z) => { const q = L.filter(x => x.s >= a && x.s < z); if (q.length < (z - a) / 15) return null; return { h: Math.max(...q.map(x => x.b.h)), l: Math.min(...q.map(x => x.b.l)) }; };
    if (hr[i] >= 14) ny30[i] = plage(810, 840); // plage de 30 min complète à 14:00 : utilisable par la bougie 14:00 (clôture 15:00)
    if (hr[i] >= 15) ny60[i] = plage(810, 870); // 60 min complète à 14:30 : bougie 15:00
  }
  // VWAP de séance (jour UTC), pondéré par le volume de ticks ; valeurs à la clôture de i
  const vw = new Array(n).fill(null), vsd = new Array(n).fill(null);
  for (let k = 0; k < jours.length; k++) {
    let sv = 0, spv = 0, spv2 = 0;
    for (let i = jours[k].i0; i <= jours[k].i1; i++) { const p = (h[i] + l[i] + c[i]) / 3, w = v[i] > 0 ? v[i] : 1e-6; sv += w; spv += w * p; spv2 += w * p * p; const m = spv / sv; vw[i] = m; vsd[i] = Math.sqrt(Math.max(0, spv2 / sv - m * m)); }
  }
  // VWAP ancré (de l'indice a à i, inclus)
  const pv = new Float64Array(n + 1), vv = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const w = v[i] > 0 ? v[i] : 1e-6; pv[i + 1] = pv[i] + w * (h[i] + l[i] + c[i]) / 3; vv[i + 1] = vv[i] + w; }
  const avwap = (a, i) => (vv[i + 1] - vv[a] > 0 ? (pv[i + 1] - pv[a]) / (vv[i + 1] - vv[a]) : null);
  // profil de volume de la VEILLE (zone de valeur 70 %, POC) depuis les M15 : volume réparti sur [bas, haut] de chaque M15, cases de 1 $
  const profils = new Map();
  for (const [j, L] of m15ParJour) {
    const map = new Map(); let tot = 0;
    for (const { b } of L) { const lo = Math.floor(b.l), hi = Math.floor(b.h), nb = hi - lo + 1, w = (b.v > 0 ? b.v : 1e-6) / nb; for (let p = lo; p <= hi; p++) { map.set(p, (map.get(p) || 0) + w); tot += w; } }
    if (!map.size) continue;
    const cases = [...map].sort((x, y) => x[0] - y[0]); let poc = cases[0]; for (const q of cases) if (q[1] > poc[1]) poc = q;
    let a = cases.findIndex(q => q[0] === poc[0]), z = a, acc = poc[1];
    while (acc < 0.7 * tot && (a > 0 || z < cases.length - 1)) { const g = a > 0 ? cases[a - 1][1] : -1, d = z < cases.length - 1 ? cases[z + 1][1] : -1; if (g >= d) { a--; acc += cases[a][1]; } else { z++; acc += cases[z][1]; } }
    profils.set(j, { poc: poc[0] + 0.5, val: cases[a][0], vah: cases[z][0] + 1 });
  }
  const vp = new Array(n).fill(null); for (let i = 0; i < n; i++) { const k = dayOf[i]; if (k > 0) vp[i] = profils.get(jours[k - 1].j) ?? null; }
  const medVol20 = new Array(n).fill(null); for (let i = 20; i < n; i++) { const q = v.slice(i - 20, i).sort((x, y) => x - y); medVol20[i] = (q[9] + q[10]) / 2; }
  return { n, t, o, h, l, c, v, sp, atr, atr100, sma20, sma50, sma200, rsi, hr, jour, dayOf, jours, sem, semOf, tJour, tH4, pdh, pdl, pdc, pwh, pwl, pdiH, pdiL, dOpen, wOpen, asie, lon, ny30, ny60, vw, vsd, avwap, vp, medVol20, an: t.map(annee), tr };
}
