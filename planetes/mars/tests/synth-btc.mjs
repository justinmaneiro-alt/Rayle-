import { alea } from '../pc/mars-calcul.js';
import { depuisBougies } from '../pc/agent-btc/colonnes.js';

/* Bougies M15 SYNTHÉTIQUES déterministes pour les tests (jamais montrées comme réelles). `segments` : [{ n, derive (en % par bougie), bruit (en % du prix), volume, retour (rappel vers `ancre` : marché en range) }].
   Chaque bougie a un volume et un volume acheteur cohérent avec sa direction (clôture haute = plus d'acheteurs). */
export const T0 = Date.UTC(2024, 0, 1);
export function bougiesSynth({ segments, graine = 1, t0 = T0, prix = 40000, avecVb = true }) {
  const a = alea(graine), out = []; let c = prix, i = 0;
  for (const seg of segments) {
    for (let k = 0; k < seg.n; k++, i++) {
      const o = c, rappel = seg.retour ? seg.retour * ((seg.ancre || prix) - o) / o : 0, ch = (seg.derive || 0) / 100 + rappel + (a() - 0.5) * 2 * (seg.bruit || 0.15) / 100, cl = o * (1 + ch);
      const h = Math.max(o, cl) * (1 + a() * (seg.bruit || 0.15) / 100 * 0.6), l = Math.min(o, cl) * (1 - a() * (seg.bruit || 0.15) / 100 * 0.6);
      const v = (seg.volume || 100) * (0.6 + a() * 0.8), part = h > l ? (cl - l) / (h - l) : 0.5;
      out.push({ t: t0 + i * 900e3, o, h, l, c: cl, v, vb: avecVb ? v * (0.25 + 0.5 * part) : NaN }); c = cl;
    }
  }
  return out;
}
export const serieSynth = opts => depuisBougies(bougiesSynth(opts));
/* Un marché qui alterne range, hausse, range, baisse… (n bougies au total, à peu près). */
export function marcheMixte(n = 20000, graine = 3) {
  const segments = [], motifs = [{ derive: 0, bruit: 0.12 }, { derive: 0.012, bruit: 0.15 }, { derive: 0, bruit: 0.14 }, { derive: -0.012, bruit: 0.16 }];
  let reste = n, k = 0; const a = alea(graine * 7);
  while (reste > 0) { const m = motifs[k++ % motifs.length], len = Math.min(reste, 500 + Math.floor(a() * 900)); segments.push({ ...m, n: len, volume: 80 + a() * 80 }); reste -= len; }
  return serieSynth({ segments, graine });
}
