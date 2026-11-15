/* Tests de la lecture H4 / Jour. node trader-pro/tests/lecture-hj-test.mjs [instantané pro-or.json facultatif] */
import fs from 'node:fs';
import { lireHJ, projeterMA, clotures, idSignal, bilanRapide } from '../terminal/lecture-hj.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let graine = 5; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
const J = 86400e3, H = 3600e3, T0 = Date.UTC(2024, 0, 1);
function serie(n) { const j = [], h4 = []; let p = 100; for (let i = 0; i < n; i++) { const o = p; p = Math.max(5, p + 0.06 + Math.sin(i / 7) * 0.5 + alea() * 1.4); j.push({ t: T0 + i * J, o, h: Math.max(o, p) + Math.abs(alea()), l: Math.min(o, p) - Math.abs(alea()), c: p }); let q = o; for (let k = 0; k < 6; k++) { const c = k === 5 ? p : o + (p - o) * (k + 1) / 6 + alea() * 0.3; h4.push({ t: T0 + i * J + k * 4 * H, o: q, h: Math.max(q, c) + Math.abs(alea()) * 0.3, l: Math.min(q, c) - Math.abs(alea()) * 0.3, c }); q = c; } } return { j, h4, prix: p, tPrix: T0 + n * J }; }
const d = serie(700), now = T0 + 700 * J, L = lireHJ(d, { maintenant: now, jours: 400 });
v(L.ok && [1, 0, -1].includes(L.biais), 'lecture produite : biais ' + L.biaisTexte); v(Math.abs(L.ma200J - d.j.slice(-200).reduce((s, b) => s + b.c, 0) / 200) < 0.5, 'MA200 J = moyenne des 200 dernières clôtures jour');
v(L.niveaux.filter(n => n.cote === 'R').length <= 3 && L.niveaux.filter(n => n.cote === 'S').length <= 3, '3 niveaux au plus de chaque côté'); v(L.niveaux.every(n => n.cote === 'R' ? n.prix > L.prix : n.prix <= L.prix), 'résistances au-dessus, supports au-dessous');
const ns = [...L.niveaux].sort((a, b) => a.prix - b.prix); v(ns.every((n, i) => !i || n.prix - ns[i - 1].prix >= L.atrH4 * 0.99), 'niveaux séparés d\'au moins 1 ATR H4 : les étiquettes ne se chevauchent jamais');
v(L.signaux.every(s => s.tCloture <= now && s.tCloture >= now - 400 * J), 'signaux : clôturés et dans la fenêtre'); v(L.signaux.every((s, i, a) => !i || a[i - 1].tCloture >= s.tCloture), 'signaux triés du plus récent au plus ancien');
/* seules les bougies clôturées comptent : on coupe au milieu d'une bougie jour et d'une bougie H4 */
const milieu = lireHJ(d, { maintenant: d.j[500].t + 12 * H, jours: 400 }); v(milieu.derniereJ === d.j[499].t, 'la bougie Jour en cours est écartée'); v(milieu.derniereH4 + 4 * H <= d.j[500].t + 12 * H, 'la bougie H4 en cours est écartée');
v(clotures(d.j, J, d.j[10].t + 5 * H).length === 10, 'clôtures : une bougie non terminée n\'est jamais comptée');
/* non-redessin : lecture à l'instant T puis plus tard, les signaux passés sont identiques */
const A = lireHJ(d, { maintenant: T0 + 600 * J, jours: 400 }), B = lireHJ(d, { maintenant: T0 + 650 * J, jours: 400 }); v(A.signaux.filter(s => s.tCloture >= T0 + 250 * J).every(s => B.signaux.some(x => idSignal('or', x) === idSignal('or', s) && x.sl === s.sl && x.tp === s.tp)), 'les signaux passés ne changent pas quand le temps avance');
const P = projeterMA(L, d.h4.slice(-200)); v(P.j.length > 100 && P.h4.length > 100, 'MA projetées sur les bougies affichées'); v(P.j.every((p, i, a) => !i || p.t > a[i - 1].t), 'projection ordonnée');
v(lireHJ({ j: d.j.slice(0, 100), h4: d.h4.slice(0, 300) }, { maintenant: now }).ok === false, 'trop peu de bougies : pas de lecture, une raison claire');
const bq = bilanRapide(d, 'J'); v(bq === null || bq.n >= 0, 'bilan rapide');
const fichier = process.argv[2]; if (fichier && fs.existsSync(fichier)) { const r = JSON.parse(fs.readFileSync(fichier, 'utf8')), conv = L2 => L2.map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] })), D = { ...r, j: conv(r.j), h4: conv(r.h4) }, LL = lireHJ(D, { maintenant: Date.now() }); v(LL.ok, 'réel : lecture de l\'instantané'); console.log('  réel :', JSON.stringify({ biais: LL.biaisTexte, prix: LL.prix, ma200J: LL.ma200J, ma200H4: LL.ma200H4, niveaux: LL.niveaux.map(n => n.nom + ' ' + n.src + ' ' + n.prix.toFixed(0)).join(', '), signaux: LL.signaux.slice(0, 4).map(s => s.tf + (s.dir > 0 ? '↑' : '↓') + ' ' + new Date(s.tCloture).toISOString().slice(0, 10) + ' ' + s.type), contacts: LL.contacts.map(c => c.type) })); }
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
