/* Tests de la recherche « or » (données synthétiques : aucune donnée Dukascopy requise) : causalité de toutes les familles, accord des deux simulateurs, gel de la liste, statistiques. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { construire } from '../recherche-or/contexte.mjs'; import { SPECS, signaux } from '../recherche-or/familles.mjs'; import { essai, enchainer } from '../recherche-or/simulateur.mjs'; import { rejouer } from '../recherche-or/simulateur2.mjs';
import { holm, resume, phi, prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
// série synthétique : marche aléatoire à volatilité variable, 400 jours de bougies H1 (UTC) + M15 cohérentes, spread 0,3 à 0,8
const rnd = prng(7), h1 = [], m15 = []; let p = 1500; const t0 = Date.UTC(2015, 0, 5);
for (let k = 0; k < 400 * 24; k++) { const t = t0 + k * 3600e3; const vol = 1.5 + 2 * Math.abs(Math.sin(k / 97)) + (k % 24 >= 7 && k % 24 < 17 ? 1.5 : 0); let o = p, h = p, l = p; const q = []; for (let s = 0; s < 4; s++) { const o2 = p; p += (rnd() - 0.49) * vol; q.push({ t: t + s * 900e3, o: o2, h: Math.max(o2, p) + rnd() * 0.5, l: Math.min(o2, p) - rnd() * 0.5, c: p, v: 50 + rnd() * 100 }); } for (const b of q) { h = Math.max(h, b.h); l = Math.min(l, b.l); m15.push(b); } h1.push({ t, o, h, l, c: p, v: q.reduce((s, b) => s + b.v, 0), sp: 0.3 + rnd() * 0.5 }); }
const X = construire({ h1, m15 });
// 1) liste figée inchangée
const F = JSON.parse(fs.readFileSync(new URL('../recherche-or/liste-figee.json', import.meta.url), 'utf8'));
v(crypto.createHash('sha256').update(JSON.stringify(SPECS)).digest('hex') === F.sha256_liste, 'la liste des variantes ne correspond plus à l\'empreinte figée'); v(SPECS.length === 67 && new Set(SPECS.map(s => s.id)).size === 67, '67 variantes à identifiants uniques');
// 2) causalité : les signaux calculés sur un préfixe sont identiques à ceux de la série complète (hors les dernières bougies)
const N1 = 6500, Xp = construire({ h1: h1.slice(0, N1), m15: m15.filter(b => b.t < h1[N1].t) }); let nSig = 0;
for (const s of SPECS) { const a = signaux(s, Xp).filter(x => x.i < N1 - 30), b = signaux(s, X).filter(x => x.i < N1 - 30); nSig += b.length; v(JSON.stringify(a) === JSON.stringify(b), `famille ${s.id} : signaux différents sur préfixe (regard vers le futur ?)`); }
v(nSig > 200, `assez de signaux synthétiques pour tester (${nSig})`);
// 3) accord des deux simulateurs sur 300 trades, toutes gestions
const B = h1.map(b => ({ ...b })); let accord = 0, tot = 0; for (let k = 0; k < 300; k++) { const i = 250 + Math.floor(rnd() * (X.n - 300)), d = rnd() < 0.5 ? 1 : -1, cfg = [[1.5, 'fixe'], [1, 'trail'], [1.5, 'be'], [1, 'fixe']][k % 4]; const a = essai(X, i, d, cfg[0], cfg[1]), b = rejouer(B, i, d, cfg[0], cfg[1]); if (!a || !b) continue; tot++; if (Math.abs(a.Rbrut - b.Rbrut) < 1e-9 && Math.abs(a.Rc - b.Rc) < 1e-9 && Math.abs(a.Rk - b.Rk) < 1e-9 && a.jSortie === b.barSortie) accord++; }
v(tot > 250 && accord === tot, `simulateurs en accord ${accord}/${tot}`);
// 4) cas connus du simulateur : stop touché d'abord ; sortie par temps ; entrée à l'ouverture suivante
const Y = { n: 12, t: Array.from({ length: 12 }, (_, i) => i * 3600e3), o: Array(12).fill(100), h: Array(12).fill(101), l: Array(12).fill(99), c: Array(12).fill(100), atr: Array(12).fill(1), sp: Array(12).fill(0), an: Array(12).fill(2015) };
Y.o[3] = 100; Y.l[3] = 98; let r = essai(Y, 2, 1, 1.5, 'fixe'); v(r.raison === 'stop' && Math.abs(r.Rbrut + 1) < 1e-9 && r.e === 3, 'stop touché sur la bougie d\'entrée = −1 R');
r = essai(Y, 5, 1, 1.5, 'fixe'); v(r.raison === 'temps' && r.jSortie === 11 && Math.abs(r.Rbrut) < 1e-9, 'sortie par temps à la 6e bougie');
Y.o[7] = 96; r = essai(Y, 5, 1, 1.5, 'fixe'); v(r.raison === 'stop' && r.sortie === 96 && r.Rbrut < -1, 'gap au-delà du stop : sortie à l\'ouverture (pire que −1 R)');
r = essai(Y, 8, -1, 1, 'fixe'); v(r && r.d === -1, 'vente simulée');
// 5) un seul trade à la fois
const T = enchainer(X, signaux(SPECS.find(s => s.id === 'd1'), X), SPECS.find(s => s.id === 'd1')); let chev = 0; for (let k = 1; k < T.length; k++) if (T[k].i < T[k - 1].jSortie) chev++; v(T.length > 5 && chev === 0, 'aucun chevauchement de trades');
// 6) statistiques
v(Math.abs(phi(1.96) - 0.975) < 1e-3, 'loi normale'); const h = holm([0.01, 0.04, 0.03]); v(Math.abs(h[0] - 0.03) < 1e-12 && Math.abs(h[2] - 0.06) < 1e-12 && Math.abs(h[1] - 0.06) < 1e-12, 'Holm'); const rs = resume([1, -1, 1, 1]); v(Math.abs(rs.moy - 0.5) < 1e-12 && rs.n === 4, 'résumé');
console.log(`recherche-or : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
