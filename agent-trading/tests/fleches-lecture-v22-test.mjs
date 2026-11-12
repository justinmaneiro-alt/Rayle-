/* Flèches de lecture v2.2 : zone cassée, chute en escalier (base / divergence / relance), contre-tendance, cas de contrôle, chute du 12 novembre, levelId, sceau.
   node agent-trading/tests/fleches-lecture-v22-test.mjs   (--sceller écrit l'empreinte) */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as FL from '../front/or/fleches-lecture-v22.js';
import { atrSerie } from '../front/or/fleches-terminal-v1.js';
import { zonesDessinees } from '../recherche-or/zones-h1-rejeu.mjs';
import { charger } from '../recherche-or/donnees.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const sceau = path.join(ici, '../front/or/fleches-lecture-v22.sceau.json'), src = path.join(ici, '../front/or/fleches-lecture-v22.js');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (process.argv.includes('--sceller')) fs.writeFileSync(sceau, JSON.stringify({ version: 'fleches-lecture-v22', scelle_le: '2026-11-12', sha256: sha(src), note: 'Empreinte SHA-256 de fleches-lecture-v22.js (fins de ligne normalisées), posée APRÈS les tests ; règles ajustées après avoir vu des exemples (aucune preuve de performance).' }, null, 1) + '\n');
v('sceau de fleches-lecture-v22', sha(src) === JSON.parse(fs.readFileSync(sceau, 'utf8')).sha256);

/* ── scénarios fabriqués (ATR ≈ 1) ── */
const bar = (i, o, h, l, c) => ({ t: Date.UTC(2026, 0, 1) + i * H, o, h, l, c, v: 100 });
const plat = (n, niv = 100, amp = 0.5) => Array.from({ length: n }, (_, i) => { const c = niv + (i % 2 ? amp : -amp) * 0.3; return bar(i, c, c + amp, c - amp, c); });
const calc = (L, Z) => FL.calculer(L, Z, { maintenant: L[L.length - 1].t + H });
const zone = (L, i, o) => ({ id: 'z', cote: 'support', bas: 97, haut: 98, tDebut: L[i].t, tFin: null, force: 3, nom: 'S test', ...o });
{ // zone cassée : plus aucun rebond haussier après une clôture à > 0,3 ATR en dessous
  const L = plat(60, 102); const n = L.length; L.push(bar(n, 99, 99.2, 96, 96.3)); for (let k = 1; k < 6; k++) L.push(bar(n + k, 96.3, 98.4, 96.2, 98.3)); for (let k = 6; k < 12; k++) L.push(bar(n + k, 98.3, 100, 98.1, 99.8));
  const r = calc(L, [zone(L, n - 3)]); v('zone cassée : aucun rebond haussier ensuite', r.fleches.filter(f => f.levelId !== 'MA200' && f.dir > 0).length === 0, JSON.stringify(r.fleches.map(f => [f.type, f.i - n])));
}
// chute en escalier fabriquée : zone 1 (support 109-110) cassée, puis contact de la zone 2 (support 99-100) sur un nouveau plus bas
function escalier(suite) {
  const L = plat(60, 112); let n = L.length;
  for (let k = 0; k < 6; k++) L.push(bar(n + k, 111 - k * 0.4, 111.2 - k * 0.4, 110.2 - k * 0.4, 110.6 - k * 0.4));   // descente
  n = L.length; L.push(bar(n, 108.6, 108.8, 105.0, 105.3));                  // casse la zone 1 (clôture sous 109 - 0,3)
  for (let k = 1; k < 8; k++) L.push(bar(n + k, 105.3 - k * 0.8, 105.5 - k * 0.8, 104.0 - k * 0.8, 104.6 - k * 0.8));
  n = L.length; L.push(bar(n, 99.9, 100.0, 98.4, 99.2));                      // contact de la zone 2 (99-100), nouveau plus bas
  return suite(L, n);
}
const Z2 = (L, i1) => [{ id: 'z1', cote: 'support', bas: 109, haut: 110, tDebut: L[40].t, tFin: L[i1 - 8].t, force: 3 }, { id: 'z2', cote: 'support', bas: 98.5, haut: 100, tDebut: L[40].t, tFin: null, force: 3 }];
{
  const r = escalier((L, n) => { L.push(bar(n + 1, 99.2, 100.8, 99.1, 100.6)); L.push(bar(n + 2, 100.6, 101.0, 100.2, 100.5)); for (let k = 3; k < 6; k++) L.push(bar(n + k, 100.4, 100.6, 99.4, 99.9)); return { L, n }; });
  const f = calc(r.L, Z2(r.L, r.n - 1)).fleches.filter(x => /^z2@/.test(x.levelId) && x.dir > 0);
  const sans = f.filter(x => !x.raison);
  v('chute en escalier : aucune flèche d’achat « nue » sur la zone suivante (sans base, divergence ou relance)', sans.length === 0, JSON.stringify(f.map(x => [x.type, x.i - r.n, x.raison])));
}
{ // base de 8 bougies sans nouveau plus bas (étendue ≤ 1,5 ATR) : condition a vraie ; une chute continue : fausse
  const L = plat(60, 100, 0.5), A = atrSerie(L), n = L.length; for (let k = 0; k < 10; k++) L.push(bar(n + k, 99.9, 100.5, 99.5, k % 2 ? 100.2 : 99.8)); const A2 = atrSerie(L);
  v('condition a : base de 8 bougies sans nouveau plus bas, étendue ≤ 1,5 ATR', FL.base(L, A2, L.length - 1, 1) === true);
  const M = plat(60, 110, 0.5), m0 = M.length; for (let k = 0; k < 10; k++) M.push(bar(m0 + k, 109 - k, 109.2 - k, 108 - k, 108.3 - k));
  v('chute continue : pas de base', FL.base(M, atrSerie(M), M.length - 1, 1) === false);
}
{ // contre-tendance : achat sous une MA200 qui baisse, sans chute en escalier → marquée contre-tendance
  const L = []; for (let i = 0; i < 260; i++) { const c = 140 - i * 0.12 + (i % 2 ? 0.2 : -0.2); L.push(bar(i, c, c + 0.4, c - 0.4, c)); } const n = L.length, b = L[n - 1].c;
  L.push(bar(n, b, b + 0.1, b - 1.2, b - 1.0)); L.push(bar(n + 1, b - 1.0, b + 0.5, b - 1.1, b + 0.4)); for (let k = 2; k < 8; k++) L.push(bar(n + k, b + 0.4, b + 0.9, b + 0.2, b + 0.7));
  const z = { id: 'zc', cote: 'support', bas: b - 1.3, haut: b - 0.4, tDebut: L[n - 5].t, tFin: null, force: 2 }, f = calc(L, [z]).fleches.filter(x => x.levelId !== 'MA200' && x.dir > 0);
  v('flèche contre la MA200 descendante : marquée contre-tendance', f.length >= 1 && f.every(x => x.contreTendance === true) && /contre-tendance/.test(f[0].nom), JSON.stringify(f.map(x => [x.type, x.i - n, x.contreTendance])));
}

/* ── données réelles : cas de contrôle et cohérence ── */
const D = charger({ debut: 2026, fin: 2026 }), B = D.h1.filter(b => !(b.h === b.l && !b.v)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), now = B[B.length - 1].t + H;
const Z = zonesDessinees(B, now), ids = new Set(Z.map(FL.idNiveau)), F = FL.calculer(B, Z, { maintenant: now }).fleches, jour = f => new Date(f.tCloture).toISOString().slice(0, 10);
v('(cohérence) chaque flèche a un levelId présent dans les zones dessinées (ou MA200)', F.every(f => f.levelId === 'MA200' || ids.has(f.levelId)));
v('couleur / sens : chaque flèche a un sens ±1 et un type connu', F.every(f => (f.dir === 1 || f.dir === -1) && Object.keys(FL.TYPES).includes(f.type)));
v('(a) rebond haussier ~3 870 le 2 novembre', F.some(f => f.dir > 0 && f.levelId !== 'MA200' && f.zoneBas <= 3890 && f.zoneHaut >= 3850 && jour(f) === '2026-11-02'));
v('(b) cassure MA200 du 4 novembre', F.filter(f => f.type === 'ma_cassure' && f.dir > 0 && jour(f) === '2026-11-04').length === 1);
const c = F.filter(f => f.dir < 0 && f.levelId !== 'MA200' && f.zoneHaut >= 4131 && f.zoneBas <= 4156 && f.tCloture >= Date.UTC(2026, 9, 19));
v('(c) 6 rebonds baissiers sur 4 131–4 156', c.length >= 6, String(c.length));
let proche = 0; for (const f of F) for (const g of F) if (g !== f && g.dir === f.dir && g.i < f.i && f.i - g.i < FL.P.distanceMin) proche++;
v('au moins 6 bougies entre deux flèches de même sens', proche === 0, String(proche));
const A = atrSerie(B); let ancres = 0;
for (const f of F.filter(x => x.levelId !== 'MA200')) { const cassee = (() => { const z = Z.find(q => FL.idNiveau(q) === f.levelId), k0 = Math.max(z ? B.findIndex(b => b.t >= z.tDebut) : 0, f.i - 3); for (let k = k0; k <= f.i; k++) if (f.dir > 0 ? B[k].c < f.zoneBas - 0.3 * A[k] : B[k].c > f.zoneHaut + 0.3 * A[k]) return true; return false; })(); if (cassee) ancres++; }
v('aucune flèche de rebond posée sur une zone déjà cassée (clôture à > 0,3 ATR de l’autre côté)', ancres === 0, String(ancres));

/* ── chute du 12 novembre (série Kraken) ── */
const K = JSON.parse(fs.readFileSync(path.join(ici, '../recherche-or/donnees/kraken-xau-h1-chute-12-nov.json'), 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
const nowK = K[K.length - 1].t + H, ZK = zonesDessinees(K, nowK), FK = FL.calculer(K, ZK, { maintenant: nowK }).fleches, AK = atrSerie(K);
const chute = FK.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 16) && f.dir > 0 && f.levelId !== 'MA200');
v('chute du 12 novembre : aucune flèche d’achat sans condition de stabilisation (base, divergence ou relance)', chute.every(f => ['base', 'divergence', 'relance'].includes(f.raison)), JSON.stringify(chute.map(f => [new Date(f.tCloture).toISOString().slice(11, 16), f.raison])));
v('chute du 12 novembre : aucune flèche d’achat sur une zone DÉJÀ cassée au moment de la flèche', chute.every(f => { for (let k = Math.max(0, f.i - 2); k <= f.i; k++) if (K[k].c < f.zoneBas - 0.3 * AK[k]) return false; return true; }));
v('chute du 12 novembre : la v2.2 pose au plus autant d’achats que la v2.1', chute.length <= 3, String(chute.length));
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
