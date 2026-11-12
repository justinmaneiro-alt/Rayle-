/* Flèches simples : critères d'acceptation (rejeu or 2026 + série Kraken), scénarios fabriqués, sceau.   node agent-trading/tests/fleches-simples-test.mjs   (--sceller écrit l'empreinte) */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as FS from '../front/or/fleches-simples.js';
import { atrSerie } from '../front/or/fleches-terminal-v1.js';
import { serieDuka, serieKraken, analyse, max600 } from '../recherche-or/fleches-simples-rejeu.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const sceau = path.join(ici, '../front/or/fleches-simples.sceau.json'), src = path.join(ici, '../front/or/fleches-simples.js');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (process.argv.includes('--sceller')) fs.writeFileSync(sceau, JSON.stringify({ version: 'fleches-simples-v1', scelle_le: '2026-11-12', sha256: sha(src), note: 'Empreinte SHA-256 de fleches-simples.js, posée APRÈS les tests ; seuils choisis en regardant des exemples (aucune preuve de performance).' }, null, 1) + '\n');
v('sceau de fleches-simples', sha(src) === JSON.parse(fs.readFileSync(sceau, 'utf8')).sha256);

/* ── scénarios fabriqués ── */
const bar = (i, o, h, l, c) => ({ t: Date.UTC(2026, 0, 1) + i * H, o, h, l, c, v: 100 });
const plat = (n, niv = 100, amp = 0.5) => Array.from({ length: n }, (_, i) => { const c = niv + (i % 2 ? amp : -amp) * 0.3; return bar(i, c, c + amp, c - amp, c); });
const calc = (L, Z) => FS.calculer(L, Z, { maintenant: L[L.length - 1].t + H });
{ // MA200 : zigzag autour de la MA = rien ; cassure à ≥ 1,4 ATR = une flèche ; retour rapide = pas de flèche inverse dans les 24 bougies
  const L = plat(230); for (let k = 0; k < 30; k++) L.push(bar(230 + k, 98.5, 98.9, 98.1, 98.5)); const n = L.length;
  for (let k = 0; k < 20; k++) L.push(bar(n + k, 100, 101, 99, k % 2 ? 100.4 : 99.4));
  v('zigzag autour de la MA200 : aucune flèche', calc(L, []).fleches.length === 0, JSON.stringify(calc(L, []).fleches.map(f => f.i - n)));
  const M = plat(230); for (let k = 0; k < 30; k++) M.push(bar(230 + k, 98.5, 98.9, 98.1, 98.5)); const m = M.length;
  for (let k = 0; k < 3; k++) M.push(bar(m + k, 100.5, 101.2, 100.2, 100.8)); M.push(bar(m + 3, 100.8, 102.6, 100.7, 102.5)); M.push(bar(m + 4, 102.5, 102.7, 99.2, 99.4)); for (let k = 5; k < 14; k++) M.push(bar(m + k, 99.4, 99.7, 98.9, 99.2));
  const f = calc(M, []).fleches.filter(x => x.type === 'ma_cassure');
  v('cassure franche (≥ 1,4 ATR) : une flèche cyan, à la bougie de confirmation, aucune flèche inverse dans les 24 bougies', f.length === 1 && f[0].dir === 1 && f[0].i >= m + 3, JSON.stringify(f.map(x => [x.dir, x.i - m])));
  v('aucun texte ni retest ni fausse cassure : types MA200 / retournement seulement', Object.keys(FS.TYPES).join() === 'ma_cassure,retournement');
}
const zone = (L, i, o) => ({ id: 'z', cote: 'support', bas: 97, haut: 98, tDebut: L[i].t, tFin: null, force: 20, nom: 'S test', ...o });
{ // zone majeure : retournement = flèche ; zone mineure = rien ; zone cassée = rien
  const L = plat(60, 102); const n = L.length; for (let k = 0; k < 3; k++) L.push(bar(n + k, 98.5, 98.9, 97.2, 97.6)); L.push(bar(n + 3, 97.7, 99.2, 97.6, 98.9)); for (let k = 4; k < 10; k++) L.push(bar(n + k, 99, 101, 98.8, 100.5));
  const Zm = [zone(L, n - 3)], f = calc(L, Zm).fleches;
  v('zone majeure (20 touches) : une flèche d’achat au retournement', f.length === 1 && f[0].dir === 1 && f[0].type === 'retournement' && f[0].i === n + 3 && f[0].levelId === FS.idNiveau(Zm[0]), JSON.stringify(f.map(x => [x.type, x.i - n])));
  v('zone mineure (2 touches, hors des 4 plus touchées) : aucune flèche', calc(L, [zone(L, n - 3, { force: 2, id: 'm' }), ...[1, 2, 3, 4].map(k => zone(L, n - 3, { id: 'g' + k, force: 30 - k, bas: 140 + k * 5, haut: 141 + k * 5 }))]).fleches.filter(x => x.levelId.startsWith('m@')).length === 0);
  const C = plat(60, 102), c0 = C.length; C.push(bar(c0, 99, 99.2, 95.5, 95.8)); for (let k = 1; k < 6; k++) C.push(bar(c0 + k, 95.8, 98.5, 95.7, 98.4)); for (let k = 6; k < 12; k++) C.push(bar(c0 + k, 98.4, 100.5, 98.2, 100));
  v('zone cassée : aucune flèche de rebond ensuite (aucun achat dans une chute)', calc(C, [zone(C, c0 - 3)]).fleches.filter(x => x.type === 'retournement').length === 0);
  const R = plat(60, 102), r0 = R.length; for (let k = 0; k < 40; k++) R.push(bar(r0 + k, 98.2, 98.9, 97.6, 98.3));
  const fr = calc(R, [zone(R, r0 - 3)]).fleches.filter(x => x.type === 'retournement'); v('une zone touchée en continu : au plus une flèche par 24 bougies', fr.every((x, k) => k === 0 || x.i - fr[k - 1].i >= 24), JSON.stringify(fr.map(x => x.i - r0)));
  const Rt = calc(L, [zone(L, n - 3, { retournee: true })]).fleches.filter(x => x.type === 'retournement'); v('zone au rôle récent : pas de flèche avant un premier retournement confirmé', Rt.length === 0);
}

/* ── critères d'acceptation sur l'or réel ── */
const D = serieDuka(), rd = analyse(D), K = serieKraken(), rk = analyse(K), jour = f => new Date(f.tCloture).toISOString().slice(0, 10);
v('1. au plus 10 flèches sur 600 bougies H1 (or 2026)', max600(rd.F, D.length) <= 10, String(max600(rd.F, D.length)));
v('1. au plus 10 flèches sur 600 bougies H1 (série Kraken, 600 dernières comprises)', max600(rk.F, K.length) <= 10 && rk.F.filter(f => f.i >= K.length - 600).length <= 10, String(max600(rk.F, K.length)));
for (const [nom, L] of [['or 2026', rd.F], ['Kraken', rk.F]]) {
  const ma = L.filter(f => f.type === 'ma_cassure'); let g = 0; for (let k = 1; k < ma.length; k++) if (ma[k].i - ma[k - 1].i < 24) g++;
  v(`2. aucune flèche MA200 dans les 24 bougies suivant une autre (${nom})`, g === 0, String(g));
  let e = 0; for (let k = 1; k < L.length; k++) if (L[k].i - L[k - 1].i < FS.P.distanceMin) e++; v(`7. aucune superposition : au moins 6 bougies entre deux flèches quelconques (${nom})`, e === 0, String(e));
  v(`levelId : chaque flèche est rattachée à une zone dessinée ou à la MA200 (${nom})`, L.every(f => f.levelId === 'MA200' || (nom === 'Kraken' ? rk.Z : rd.Z).some(z => FS.idNiveau(z) === f.levelId)));
  v(`Règle B : toute flèche de niveau est sur une zone majeure (≥ ${FS.P.majeurTouches} touches ou parmi les ${FS.P.majeurTop} plus touchées) (${nom})`, L.filter(f => f.type === 'retournement').every(f => f.touches >= FS.P.majeurTouches || FS.zonesMajeures(nom === 'Kraken' ? rk.Z : rd.Z).some(z => FS.idNiveau(z) === f.levelId)));
}
const chute = rk.F.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19) && f.dir > 0);
v('3. chute du 12 novembre : zéro flèche d’achat', chute.length === 0, String(chute.length));
v('4. cassure baissière de la MA200 du 10 novembre 16:00 : une flèche MA200 baissière apparaît à la bougie de confirmation', rk.F.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)), JSON.stringify(rk.F.filter(f => f.type === 'ma_cassure').map(f => new Date(f.tCloture).toISOString().slice(5, 16))));
const c6 = rd.F.filter(f => f.dir < 0 && f.type === 'retournement' && f.zoneHaut >= 4131 && f.zoneBas <= 4156 && f.tCloture >= Date.UTC(2026, 9, 19));
v('6. au moins la moitié des 6 rebonds baissiers sur 4 131–4 156 (cooldown 24 bougies)', c6.length >= 3, String(c6.length));
console.log('info : rebond haussier ~3 870 du 2 nov. :', rd.F.some(f => f.dir > 0 && f.type === 'retournement' && f.zoneBas <= 3890 && f.zoneHaut >= 3850 && jour(f) === '2026-11-02') ? 'flèche présente' : 'aucune flèche (zone à 1 touche : non majeure)');
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
