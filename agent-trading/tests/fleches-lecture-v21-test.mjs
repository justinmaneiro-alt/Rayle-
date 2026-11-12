/* Flèches de lecture v2.1 (tous les tests v2 + anti-grappe MA200 + zones fines) : une seule source de vérité (zones dessinées), rebonds, cassure MA200, aucun repaint, sceau.
   node agent-trading/tests/fleches-lecture-v2-test.mjs   (--sceller écrit l'empreinte) */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as FL from '../front/or/fleches-lecture-v21.js';
import { normaliserZones } from '../front/or/zones-fines-v1.js';
import { atrSerie } from '../front/or/fleches-terminal-v1.js';
import { zonesDessinees } from '../recherche-or/zones-h1-rejeu.mjs';
import { charger } from '../recherche-or/donnees.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const sceau = path.join(ici, '../front/or/fleches-lecture-v21.sceau.json'), src = path.join(ici, '../front/or/fleches-lecture-v21.js');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (process.argv.includes('--sceller')) fs.writeFileSync(sceau, JSON.stringify({ version: 'fleches-lecture-v21', scelle_le: '2026-11-12', sha256: sha(src), note: 'Empreinte SHA-256 de fleches-lecture-v21.js (fins de ligne normalisées), posée APRÈS les tests ; règles ajustées après avoir vu le rejeu de la v2 (aucune preuve de performance).' }, null, 1) + '\n');
v('sceau de fleches-lecture-v21', sha(src) === JSON.parse(fs.readFileSync(sceau, 'utf8')).sha256);
const bar = (i, o, h, l, c) => ({ t: Date.UTC(2026, 0, 1) + i * H, o, h, l, c, v: 100 });
const plat = (n, niv = 100, amp = 0.5) => Array.from({ length: n }, (_, i) => { const c = niv + (i % 2 ? amp : -amp) * 0.3; return bar(i, c, c + amp, c - amp, c); });
const calc = (L, Z) => FL.calculer(L, Z, { maintenant: L[L.length - 1].t + H });
const zone = (L, i, o) => ({ id: 'z1', cote: 'support', bas: 97, haut: 98, tDebut: L[i].t, tFin: null, force: 3, nom: 'Support test', ...o });

{ // rebond depuis une base plate : flèche à la PREMIÈRE clôture hors de la zone
  const L = plat(60, 102); const n = L.length;
  for (let k = 0; k < 5; k++) L.push(bar(n + k, 98.5, 98.9, 97.2, 97.6));
  L.push(bar(n + 5, 97.7, 99.2, 97.6, 98.9));
  for (let k = 6; k < 12; k++) L.push(bar(n + k, 99, 101, 98.8, 100.5));
  const Z = [zone(L, n - 3)], r = calc(L, Z), f = r.fleches.filter(x => x.type === 'rebond');
  v('rebond depuis une base plate : une flèche, à la première clôture hors de la zone', f.length === 1 && f[0].i === n + 5 && f[0].dir === 1, JSON.stringify(f.map(x => x.i - n)));
  v('la flèche porte le levelId de la zone dessinée', f[0] && f[0].levelId === FL.idNiveau(Z[0]));
  v('issue (information) = confirmé (réaction >= 0,5 ATR)', f[0] && f[0].issue === 'confirmé', f[0] && f[0].issue);
}
{ // résistance : rebond baissier ; zone traversée = aucune flèche
  const L = plat(60, 98); const n = L.length; for (let k = 0; k < 3; k++) L.push(bar(n + k, 99.6, 100.2, 99.2, 99.9)); L.push(bar(n + 3, 99.9, 100.3, 98.6, 98.7)); for (let k = 4; k < 10; k++) L.push(bar(n + k, 98.6, 98.8, 96.5, 97));
  const r = calc(L, [zone(L, n - 3, { cote: 'resistance', bas: 99.6, haut: 100.4 })]);
  v('résistance : rebond baissier à la première clôture sous la zone', r.fleches.some(f => f.dir === -1 && f.type === 'rebond' && f.i === n + 3), JSON.stringify(r.fleches.map(f => [f.type, f.i - n])));
  const L2 = plat(60, 98); const m = L2.length; for (let k = 0; k < 8; k++) L2.push(bar(m + k, 99.7, 101.5, 99.5, 101 + k * 0.1));
  v('zone traversée par une clôture : aucune flèche de rebond', calc(L2, [zone(L2, m - 3, { cote: 'resistance', bas: 99.6, haut: 100.4 })]).fleches.filter(f => f.type.startsWith('rebond')).length === 0);
}
{ // aucun niveau dessiné = aucune flèche de niveau
  const L = plat(60, 102); const n = L.length; for (let k = 0; k < 5; k++) L.push(bar(n + k, 98.5, 98.9, 97.2, 97.6)); for (let k = 5; k < 12; k++) L.push(bar(n + k, 99, 101, 98.8, 100.5));
  v('sans zone dessinée : aucune flèche de niveau', calc(L, []).fleches.filter(f => f.levelId !== 'MA200').length === 0);
}
{ // variante 2 bougies
  const L = plat(60, 102); const n = L.length; L.push(bar(n, 99, 99.2, 97.0, 97.1)); L.push(bar(n + 1, 97.1, 97.8, 96.9, 97.5)); L.push(bar(n + 2, 97.5, 97.9, 97.3, 97.8)); for (let k = 3; k < 10; k++) L.push(bar(n + k, 98, 100, 97.9, 99.5));
  const r = calc(L, [zone(L, n - 3)]), f = r.fleches.find(x => x.dir === 1 && x.levelId !== 'MA200');
  v('variante « 2 bougies » : deux clôtures dans le sens après le contact', f && f.type === 'rebond2' && f.i === n + 2, JSON.stringify(r.fleches.map(x => [x.type, x.i - n])));
}
{ // une flèche par touche : prix qui reste dans la zone, au moins 12 bougies entre deux flèches du même niveau
  const L = plat(60, 102); const n = L.length; for (let k = 0; k < 40; k++) L.push(bar(n + k, 98.2, 98.9, 97.6, k % 3 ? 98.3 : 98.1));
  const f = calc(L, [zone(L, n - 3)]).fleches.filter(x => x.levelId !== 'MA200');
  let min = 1e9; for (let k = 1; k < f.length; k++) min = Math.min(min, f[k].i - f[k - 1].i);
  v('niveau resté touché : jamais deux flèches à moins de 12 bougies', f.length < 2 || min >= 12, JSON.stringify(f.map(x => x.i - n)));
}
{ // MA200
  const L = plat(230); for (let k = 0; k < 30; k++) L.push(bar(230 + k, 98.5, 98.9, 98.1, 98.5)); const n = L.length;
  for (let k = 0; k < 4; k++) L.push(bar(n + k, 101.4, 102.2, 101.2, 101.6)); L.push(bar(n + 4, 101.6, 101.8, 98.5, 98.7)); for (let k = 5; k < 12; k++) L.push(bar(n + k, 98.7, 99, 98.4, 98.6));
  const r = calc(L, []), c = r.fleches.filter(f => f.type === 'ma_cassure');
  v('cassure MA200 : flèche à la première clôture de l’autre côté', c.length >= 1 && c[0].i === n && c[0].dir === 1, JSON.stringify(c.map(f => f.i - n)));
  v('retour dans les 6 bougies : « fausse cassure », la flèche reste, pas de nouvelle flèche', c.length === 1 && c[0].fausse === true && FL.detail(c[0]).join(' ').includes('FAUSSE CASSURE'));
  v('cassure : type distinct des rebonds, levelId MA200', FL.TYPES.ma_cassure !== FL.TYPES.rebond && c[0].levelId === 'MA200');
  const L2 = plat(230); for (let k = 0; k < 30; k++) L2.push(bar(230 + k, 98.5, 98.9, 98.1, 98.5)); const m = L2.length;
  for (let k = 0; k < 10; k++) L2.push(bar(m + k, 101.4, 102.2, 101.2, 101.7)); L2.push(bar(m + 10, 101.2, 101.3, 99.5, 101.0)); for (let k = 11; k < 16; k++) L2.push(bar(m + k, 101.3, 102, 101.2, 101.7));
  const r2 = calc(L2, []);
  v('cassure confirmée puis retest', r2.fleches.some(f => f.type === 'ma_cassure' && !f.fausse) && r2.fleches.some(f => f.type === 'ma_retest' && f.dir === 1), JSON.stringify(r2.fleches.map(f => [f.type, f.i - m])));
  v('plus aucun « rebond sur la MA » parmi les types', !Object.keys(FL.TYPES).some(t => /ma_rebond/.test(t)));
}

/* ── données réelles : or H1 2026, zones = celles du graphique ── */
const D = charger({ debut: 2026, fin: 2026 }), B = D.h1.filter(b => !(b.h === b.l && !b.v)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), now = B[B.length - 1].t + H;
const Z = zonesDessinees(B, now), ids = new Set(Z.map(FL.idNiveau)), R = FL.calculer(B, Z, { maintenant: now }), F = R.fleches;
v('des flèches sont produites', F.length > 20, String(F.length));
v('(cohérence) chaque flèche a un levelId présent dans les zones dessinées (ou MA200)', F.every(f => f.levelId === 'MA200' || ids.has(f.levelId)));
const A = atrSerie(B), vues = new Set(FL.evenementsNiveaux(B, A, Z).map(f => f.levelId)), lues = Z.filter(z => FL.evenementsNiveaux(B, A, [z]) !== null).length;
v('(cohérence) la liste surveillée est la liste dessinée : chaque zone dessinée est lue par le détecteur', lues === Z.length && [...vues].every(id => ids.has(id)));
v('chaque flèche est posée à la clôture de sa bougie', F.every(f => f.tCloture === B[f.i].t + H));
let proche = 0; for (const f of F) for (const g of F) if (g !== f && g.dir === f.dir && g.i < f.i && f.i - g.i < FL.P.distanceMin) proche++;
v('au moins 6 bougies entre deux flèches de même sens', proche === 0, String(proche));
const jour = f => new Date(f.tCloture).toISOString().slice(0, 10);
const a = F.filter(f => f.dir > 0 && f.levelId !== 'MA200' && f.zoneBas <= 3890 && f.zoneHaut >= 3850 && jour(f) === '2026-11-02');
const c = F.filter(f => f.type === 'ma_cassure' && f.dir > 0 && jour(f) === '2026-11-04'), d = F.filter(f => f.dir < 0 && f.levelId !== 'MA200' && f.zoneHaut >= 4131 && f.zoneBas <= 4156 && f.tCloture >= Date.UTC(2026, 9, 19));
v('(a) rebond haussier sur la zone verte ~3 870 / 3 890 (2 nov.)', a.length >= 1, JSON.stringify(a.map(f => f.tCloture)));
v('(b) cassure haussière de la MA200 (4 nov.)', c.length === 1);
v('(c) rebonds baissiers sur la résistance 4 131–4 156', d.length >= 3, String(d.length));
// aucun repaint : une flèche de rebond ou de MA200 déjà posée ne change ni de bougie ni de sens quand les bougies suivantes arrivent
let bouge = 0; const ref = new Map(FL.calculer(B, [], { maintenant: now }).fleches.map(f => [f.id, f]));   // MA200 seule : indépendante des zones
for (let i = B.length - 150; i < B.length; i += 15) {
  const pref = B.slice(0, i + 1), r = FL.calculer(pref, [], { maintenant: pref[i].t + H });
  for (const f of r.fleches) { const e = ref.get(f.id); if (f.levelId === 'MA200' && f.i < i - 8 && !e) { bouge++; console.log('  apparue :', f.id, 'au pas', i, 'fausse', f.fausse); } }
}
v('aucune flèche MA200 déjà posée n’apparaît ou ne disparaît après coup (rejeu bougie par bougie)', bouge === 0, String(bouge));

/* ── v2.1 : anti-grappe MA200 ── */
{
  const A21 = atrSerie(B), M21 = (await import('../front/or/fleches-lecture-v1.js')).sma(B), cass = FL.evenementsMa(B, A21, M21).filter(f => f.type === 'ma_cassure');
  let grappe = 0; for (let k = 1; k < cass.length; k++) { const d = cass[k].i - cass[k - 1].i, ecart = Math.abs(cass[k].prix - cass[k].niveau) / cass[k].atr; if (d < 24 && ecart < 1) grappe++; }
  v('anti-grappe : jamais 2 cassures MA200 dans les 24 bougies suivant une cassure (sauf clôture à >= 1 ATR)', grappe === 0, String(grappe));
  const ret = FL.evenementsMa(B, A21, M21), parCass = new Map(); let deux = 0; for (const f of ret.filter(x => x.type === 'ma_retest')) { parCass.set(f.cassureI, (parCass.get(f.cassureI) || 0) + 1); }
  for (const n of parCass.values()) if (n > 1) deux++;
  v('au plus un retest par cassure', deux === 0);
  v('aucun retest sur une cassure étiquetée fausse', ret.filter(x => x.type === 'ma_retest').every(r => { const c = ret.find(g => g.type === 'ma_cassure' && g.i === r.cassureI); return c && !c.fausse; }));
  // zigzag fabriqué autour de la MA : une seule flèche de cassure
  const L = plat(230); for (let k = 0; k < 30; k++) L.push(bar(230 + k, 98.5, 98.9, 98.1, 98.5)); const n = L.length;
  for (let k = 0; k < 20; k++) L.push(bar(n + k, 100, 101, 99, k % 2 ? 100.5 : 99.2)); const z = calc(L, []);
  v('zigzag autour de la MA200 : au plus 1 flèche MA200 en 20 bougies', z.fleches.filter(f => f.levelId === 'MA200').length <= 1, JSON.stringify(z.fleches.map(f => [f.type, f.i - n])));
  // zones fines
  const a = 5, mince = { id: 'm', cote: 'support', bas: 100, haut: 100.2, tDebut: 0, tFin: null }, autre = { id: 'n', cote: 'support', bas: 101, haut: 101.4, tDebut: 0, tFin: null }, loin = { id: 'l', cote: 'support', bas: 120, haut: 125, tDebut: 0, tFin: null };
  const Zn = normaliserZones([mince, autre, loin], a);
  v('zones fines : largeur minimale 0,3 ATR', Zn.every(q => q.haut - q.bas >= 0.3 * a - 1e-9), JSON.stringify(Zn.map(q => [q.bas, q.haut])));
  v('zones à moins de 0,3 ATR : fusionnées ; zone lointaine intacte', Zn.length === 2 && Zn.some(q => q.id === 'l' && q.bas === 120));
  v('rôles différents ou périodes disjointes : pas de fusion', normaliserZones([mince, { ...autre, cote: 'resistance' }], a).length === 2 && normaliserZones([{ ...mince, tFin: 5 }, { ...autre, tDebut: 9 }], a).length === 2);
  const AH = (await import('../front/or/zones-affichage-v1.js')).atrH1(B), Zr = zonesDessinees(B, now); v('zones dessinées du rejeu : toutes d’au moins 0,3 ATR', Zr.every(q => q.haut - q.bas >= 0.3 * AH * 0.999));
}
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
