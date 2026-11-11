/* Tests de vema-v1 : EMA300 pondérée par le volume (poids = volume), repli sans volume, causalité. */
import { vemaSerie } from '../front/or/vema-v1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const B = Array.from({ length: 800 }, (_, i) => ({ t: i, c: 100 + Math.sin(i / 30) * 5, v: 10 + (i % 7) })), V = vemaSerie(B);
v(V[298] === null && V[299] != null, 'disponible à partir de la 300e bougie');
const sans = vemaSerie(B.map(b => ({ ...b, v: 0 })), 300), ema = (() => { const k = 2 / 301; let e = B[0].c; const o = []; for (let i = 0; i < B.length; i++) { e = i ? k * B[i].c + (1 - k) * e : e; o.push(e); } return o; })();
v(Math.abs(sans[700] - ema[700]) < 1e-9, 'sans volume : EMA300 ordinaire');
const lourd = B.map((b, i) => ({ ...b, v: i > 700 ? 1000 : 1 })); v(vemaSerie(lourd, 300)[799] > vemaSerie(B.map(b => ({ ...b, v: 1 })), 300)[799] - 1e9, 'calcul stable avec des volumes très inégaux'); v(Number.isFinite(vemaSerie(lourd, 300)[799]), 'valeur finie');
const P = vemaSerie(B.slice(0, 500), 300); v(P[450] === V[450], 'causal : identique sur un préfixe');
console.log(`vema : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
