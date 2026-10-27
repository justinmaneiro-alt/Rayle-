import { PAS_M15 } from './sources.js';

/* ═════════════ SÉRIES EN COLONNES (module pur, testé : agent-donnees-test.mjs) ═════════════
   Pour le moteur de backtest (des centaines de milliers de bougies, des milliers de passes) on travaille en colonnes de Float64Array : rapide, sans allocation, transférable à un Worker.
   Serie = { n, t, o, h, l, c, v, vb } ; vb = volume acheteur agressif (NaN si la source ne le donne pas : delta ESTIMÉ). t = instant d'OUVERTURE de la bougie. */
export const CHAMPS = ['t', 'o', 'h', 'l', 'c', 'v', 'vb'];

export function serieVide(n = 0) { const s = { n }; for (const k of CHAMPS) s[k] = new Float64Array(n); return s; }
export function depuisBougies(bougies) {
  const s = serieVide(bougies.length);
  bougies.forEach((b, i) => { s.t[i] = b.t; s.o[i] = b.o; s.h[i] = b.h; s.l[i] = b.l; s.c[i] = b.c; s.v[i] = b.v; s.vb[i] = b.vb == null ? NaN : b.vb; });
  return s;
}
export function versBougies(s, a = 0, b = s.n) {
  const out = []; for (let i = a; i < b; i++) out.push({ t: s.t[i], o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i], v: s.v[i], vb: Number.isNaN(s.vb[i]) ? NaN : s.vb[i] }); return out;
}
export function tranche(s, a, b) { const o = { n: b - a }; for (const k of CHAMPS) o[k] = s[k].slice(a, b); return o; }
/* Fusionne deux séries (une bougie par instant ; en cas de doublon, la seconde gagne), triée. */
export function fusionner(a, b) {
  const m = new Map(); for (const x of versBougies(a)) m.set(x.t, x); for (const x of versBougies(b)) m.set(x.t, x);
  return depuisBougies([...m.values()].sort((u, v) => u.t - v.t));
}
/* Lacunes : intervalles où des bougies manquent (écart entre deux ouvertures > pas). */
export function lacunes(s, pas = PAS_M15) {
  const out = []; for (let i = 1; i < s.n; i++) { const e = s.t[i] - s.t[i - 1]; if (e > pas + 1) out.push({ de: s.t[i - 1] + pas, a: s.t[i], manquantes: Math.round(e / pas) - 1 }); } return out;
}

/* Regroupe des bougies M15 contiguës en bougies plus longues (H1, H4, D1). Seules les bougies COMPLÈTES (toutes les sous-bougies présentes) sont rendues : jamais de bougie en cours,
   jamais de bougie bâtie sur un trou. vb : somme si toutes les sous-bougies l'ont, sinon NaN. Retour : { serie, finDe:Int32Array } où finDe[k] = index (dans s) de la DERNIÈRE sous-bougie de la bougie k
   (sert à aligner sans regard vers le futur : la bougie k n'est connue qu'à la clôture de cette sous-bougie). */
export function regrouper(s, ms) {
  const k = Math.round(ms / PAS_M15), idx = [], out = [], fins = [];
  let cle = null, debut = 0;
  const ferme = (a, b) => {                                    // sous-bougies a..b-1
    if (b - a !== k) return;
    let hh = -Infinity, ll = Infinity, v = 0, vb = 0, connu = true;
    for (let i = a; i < b; i++) { if (s.h[i] > hh) hh = s.h[i]; if (s.l[i] < ll) ll = s.l[i]; v += s.v[i]; if (Number.isNaN(s.vb[i])) connu = false; else vb += s.vb[i]; }
    out.push({ t: s.t[a], o: s.o[a], h: hh, l: ll, c: s.c[b - 1], v, vb: connu ? vb : NaN }); fins.push(b - 1);
  };
  for (let i = 0; i < s.n; i++) {
    const c = Math.floor(s.t[i] / ms);
    if (c !== cle) { if (cle !== null) ferme(debut, i); cle = c; debut = i; }
  }
  if (cle !== null) ferme(debut, s.n);
  // une bougie « complète » doit aussi être contiguë : k sous-bougies de bon bucket suffisent car les doublons sont impossibles (une par instant)
  return { serie: depuisBougies(out), finDe: Int32Array.from(fins) };
}
export const MS = { M15: 900e3, H1: 3600e3, H4: 14400e3, D1: 86400e3 };

/* Concatène des séries déjà triées et disjointes (blocs mensuels) ; si l'ordre n'est pas strict, retombe sur la fusion (une bougie par instant). */
export function concatener(liste) {
  let n = 0; for (const s of liste) n += s.n;
  const out = serieVide(n); let p = 0;
  for (const s of liste) { for (const k of CHAMPS) out[k].set(s[k], p); p += s.n; }
  for (let i = 1; i < n; i++) if (!(out.t[i] > out.t[i - 1])) return liste.reduce((a, b) => (a.n ? fusionner(a, b) : b), serieVide(0));
  return out;
}
