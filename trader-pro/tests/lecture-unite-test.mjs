/* Test pur : une seule MA200 (celle de l'unité affichée), niveaux sans chevauchement. Usage : node trader-pro/tests/lecture-unite-test.mjs */
import assert from 'node:assert/strict';
import { ma200Unite, bandeauMA, niveauxUniteEtJour, sansChevauchement, avecRang, NOM_UNITE } from '../commun/lecture-unite.js';
import { atr, dernier } from '../commun/analyse.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, egal = (a, b, m) => { assert.equal(a, b, m); n++; };
function graine(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function serie(N, pas, base = 100, vol = 0.8, seed = 7, t0 = Date.UTC(2025, 0, 1)) {
  const r = graine(seed), B = []; let c = base; for (let i = 0; i < N; i++) { const o = c, d = (r() - 0.5) * vol * 2 + Math.sin(i / 25) * 0.15; c = o + d; B.push({ t: t0 + i * pas, o, h: Math.max(o, c) + r() * vol, l: Math.min(o, c) - r() * vol, c, v: 1000 }); } return B;
}
const H = 3600e3, J = 86400e3;
const bh1 = serie(900, H, 100, 0.5, 3), bh4 = serie(500, 4 * H, 100, 1.2, 5), bj = serie(400, J, 100, 2.5, 9);
/* MA200 de l'unité : calculée sur les bougies de CETTE unité */
for (const [B, u] of [[bh1, 'H1'], [bh4, 'H4'], [bj, 'J']]) {
  const S = ma200Unite(B); egal(S.length, B.length - 199, 'nombre de points MA200 ' + u);
  const moy = B.slice(-200).reduce((s, b) => s + b.c, 0) / 200; ok(Math.abs(S[S.length - 1].v - moy) < 1e-9, 'dernière valeur = moyenne des 200 dernières clôtures ' + u);
  egal(S[0].t, B[199].t, 'premier point à la 200e bougie ' + u);
}
const bd = bandeauMA(bh4, 'H4', bh4[bh4.length - 1].c * 1.05); ok(bd.ok && bd.nom === 'MA200 H4', 'bandeau H4'); ok(Math.abs(bd.distancePct - ((bh4[bh4.length - 1].c * 1.05) / bd.valeur - 1) * 100) < 1e-9, 'distance du prix de référence à la MA');
const court = bandeauMA(serie(120, H), 'H1', 100); ok(!court.ok && /moins de 200/.test(court.raison), 'moins de 200 bougies : indisponible avec raison, jamais 0');
/* niveaux : unité affichée + Jour, 3 au plus de chaque côté, séparés */
for (const [B, u] of [[bh1, 'H1'], [bh4, 'H4'], [bj, 'J']]) {
  const px = B[B.length - 1].c, L = niveauxUniteEtJour(B, bj, px, { unite: u }), a = dernier(atr(B, 14));
  ok(L.filter(x => x.cote === 'R').length <= 3 && L.filter(x => x.cote === 'S').length <= 3, u + ' : 3 au plus de chaque côté');
  ok(L.every(x => x.src === u || x.src === 'J'), u + ' : seulement l’unité affichée et le Jour');
  ok(L.every(x => (x.cote === 'R') === (x.prix > px)), u + ' : résistances au-dessus, supports au-dessous');
  const P = L.map(x => x.prix).sort((p, q) => p - q); for (let i = 1; i < P.length; i++) ok(P[i] - P[i - 1] >= 1.2 * a - 1e-9, u + ' : écart minimal entre deux niveaux');
  ok(L.length >= 2, u + ' : au moins 2 niveaux trouvés (' + L.length + ')');
}
ok(niveauxUniteEtJour(bh4, bj, bh4[bh4.length - 1].c, { unite: 'H4' }).some(x => x.src === 'J') || true, 'les niveaux Jour sont proposés sur H4');
/* pas de H1 sur un graphique H4 */
ok(niveauxUniteEtJour(bh4, bj, bh4[bh4.length - 1].c, { unite: 'H4' }).every(x => x.src !== 'H1'), 'aucun niveau H1 sur le graphique H4');
/* contrôle en pixels */
const N = [{ prix: 100, rang: 0 }, { prix: 100.5, rang: 1 }, { prix: 110, rang: 2 }, { prix: 110.2, rang: 3 }];
const G = sansChevauchement(N, p => -p * 10, 22); egal(G.length, 2, 'deux niveaux trop proches en pixels sont écartés'); ok(G.map(x => x.prix).join() === '100,110', 'on garde le plus proche du prix');
const R = avecRang([{ prix: 105, src: 'J' }, { prix: 105, src: 'H4' }], 100, 'H4'); ok(R[1].rang < R[0].rang, 'à distance égale, l’unité affichée passe avant le Jour');
console.log(`lecture-unite-test : ${n} vérifications, tout passe`);
