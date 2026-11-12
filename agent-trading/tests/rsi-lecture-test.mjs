/* RSI 14 de Wilder et divergences (rsi-lecture-v1) : comparaison à un calcul de référence INDÉPENDANT sur 500 bougies, pivots confirmés, divergences, aucun repaint. node agent-trading/tests/rsi-lecture-test.mjs */
import * as R from '../front/or/rsi-lecture-v1.js'; import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
{ const ici = path.dirname(fileURLToPath(import.meta.url)), f = path.join(ici, '../front/or/rsi-lecture-v1.js'); const sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').split('\r\n').join('\n')).digest('hex'); v('sceau de rsi-lecture-v1', sha === JSON.parse(fs.readFileSync(f.replace('.js', '.sceau.json'), 'utf8')).sha256, 'le fichier a changé depuis le sceau'); }
let s = 41; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const H = 3600e3, N = 500; let c = 4000; const B = []; for (let i = 0; i < N; i++) { const o = c; c += (rnd() - 0.5) * 12 + Math.sin(i / 23) * 1.2; B.push({ t: 1.7e12 + i * H, o, h: Math.max(o, c) + rnd() * 3, l: Math.min(o, c) - rnd() * 3, c, v: 100 }); }
/* référence : RSI de Wilder écrit autrement (récurrence sur les moyennes, calcul du RS par division en fin) */
function reference(cl, n = 14) {
  const gains = [], pertes = []; for (let i = 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; gains.push(Math.max(d, 0)); pertes.push(Math.max(-d, 0)); }
  const res = Array(cl.length).fill(null); let ag = gains.slice(0, n).reduce((a, b) => a + b, 0) / n, ap = pertes.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const rsi = (g, p) => (p === 0 ? 100 : 100 - 100 / (1 + g / p)); res[n] = rsi(ag, ap);
  for (let k = n; k < gains.length; k++) { ag = (ag * (n - 1) + gains[k]) / n; ap = (ap * (n - 1) + pertes[k]) / n; res[k + 1] = rsi(ag, ap); }
  return res;
}
const a = R.rsiWilder(B.map(b => b.c)), ref = reference(B.map(b => b.c));
let maxEcart = 0, n = 0; for (let i = 0; i < N; i++) { if (ref[i] == null) { v('avant la 15e clôture : null', a[i] == null, i); continue; } maxEcart = Math.max(maxEcart, Math.abs(a[i] - ref[i])); n++; }
v('RSI de Wilder = référence sur 500 bougies (écart max < 1e-9)', maxEcart < 1e-9 && n === N - 14, 'écart ' + maxEcart + ', ' + n + ' valeurs');
v('RSI entre 0 et 100', a.every(x => x == null || (x >= 0 && x <= 100)));
// valeur de référence connue : série d'école (Wilder 1978) — 14 clôtures croissantes puis une baisse
const croiss = Array.from({ length: 15 }, (_, i) => 100 + i); v('hausse continue : RSI = 100', R.rsiWilder(croiss)[14] === 100);
const plat = Array(20).fill(50); v('prix plat : RSI = 50 (pas de division par zéro)', R.rsiWilder(plat)[19] === 50);
// pivots : confirmés par 5 bougies de chaque côté
const P = R.pivots(B); v('pivots trouvés', P.sommets.length > 5 && P.creux.length > 5, P.sommets.length + '/' + P.creux.length);
v('chaque pivot est connu 5 bougies plus tard', [...P.sommets, ...P.creux].every(p => p.connuI === p.i + 5));
v('un sommet est strictement le plus haut de ±5 bougies', P.sommets.every(p => { for (let j = p.i - 5; j <= p.i + 5; j++) if (j !== p.i && B[j].h >= B[p.i].h) return false; return true; }));
const D = R.divergences(B, a); v('des divergences existent sur 500 bougies aléatoires', D.length > 0, String(D.length));
v('distance entre pivots ≤ 60 bougies', D.every(d => d.i2 - d.i1 <= 60 && d.i2 > d.i1));
v('divergence haussière : creux plus bas, RSI plus haut', D.filter(d => d.dir > 0).every(d => d.p2 < d.p1 && d.r2 > d.r1));
v('divergence baissière : sommet plus haut, RSI plus bas', D.filter(d => d.dir < 0).every(d => d.p2 > d.p1 && d.r2 < d.r1));
v('la divergence est confirmée 5 bougies après le second pivot', D.every(d => d.confirmeI === d.i2 + 5));
// aucun repaint : calculée sur le préfixe jusqu'à sa confirmation, une divergence est identique
let repaint = 0; for (const d of D.slice(0, 25)) { const pref = B.slice(0, d.confirmeI + 1), r = R.divergences(pref, R.rsiWilder(pref.map(b => b.c))); if (!r.some(x => x.i1 === d.i1 && x.i2 === d.i2 && x.dir === d.dir)) repaint++; const avant = B.slice(0, d.confirmeI), r2 = R.divergences(avant, R.rsiWilder(avant.map(b => b.c))); if (r2.some(x => x.i1 === d.i1 && x.i2 === d.i2 && x.dir === d.dir)) repaint++; }
v('divergence absente avant sa confirmation, présente et identique ensuite (jamais redessinée)', repaint === 0, repaint + ' écarts');
// scénario fabriqué : deux creux, le second plus bas avec un RSI plus haut
{ const L = []; let p = 120; const push = (o, h, l, cl) => L.push({ t: 1.8e12 + L.length * H, o, h, l, c: cl, v: 1 });
  for (let i = 0; i < 40; i++) { p -= 1.2; push(p + 1, p + 1.5, p - 0.5, p); }                       // chute forte
  for (let i = 0; i < 12; i++) { p += 0.9; push(p - 0.9, p + 0.3, p - 1.2, p); }                       // rebond
  for (let i = 0; i < 25; i++) { p -= 0.6; push(p + 0.6, p + 0.7, p - 0.3, p); }                     // nouvelle baisse lente : creux plus bas, momentum plus faible
  for (let i = 0; i < 14; i++) { p += 0.6; push(p - 0.6, p + 0.4, p - 0.7, p); }
  const rr = R.rsiWilder(L.map(b => b.c)), dd = R.divergences(L, rr); v('scénario fabriqué : une divergence haussière est détectée', dd.some(d => d.dir > 0), JSON.stringify(dd.map(d => [d.dir, d.i1, d.i2]))); }
console.log(`rsi-lecture : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
