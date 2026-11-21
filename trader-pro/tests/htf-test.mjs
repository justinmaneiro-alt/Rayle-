import { construireHtf, placerEtiquettes, MAX_ETIQUETTES } from '../volume/htf-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const D = 86400e3, lundi = Date.UTC(2026, 0, 5);
/* 60 semaines de Daily synthétiques : tendance + oscillation, volume ~100 */
const J = []; for (let i = 0; i < 60 * 7; i++) { const t = lundi - 60 * 7 * D + i * D, base = 3000 + i * 1.2 + 60 * Math.sin(i / 9), o = base, c = base + 20 * Math.sin(i * 1.7); J.push({ t, o, c, h: Math.max(o, c) + 15 + (i % 11) * 3, l: Math.min(o, c) - 15 - (i % 7) * 3, v: 100 + (i % 5) * 10 }); }
const R = construireHtf(J, { tf: 'S', n: 4, fmt: x => String(Math.round(x)), prixLive: J[J.length - 1].c });
v(R.ok && R.bougies.length === 4, '4 bougies Weekly'); v(R.bougies[3].enCours && !R.bougies[2].enCours, 'la dernière est en cours');
v(R.niveaux.length <= MAX_ETIQUETTES, 'au plus 6 étiquettes (' + R.niveaux.length + ')');
for (let i = 1; i < R.niveaux.length; i++) v(R.niveaux[i - 1].prix - R.niveaux[i].prix > (R.haut - R.bas) * 0.04 - 1e-9, 'niveaux séparés d au moins la tolérance');
v(R.niveaux.some(x => /PWH|PWL/.test(x.texte)), 'PWH / PWL présents'); v(R.bougies.every(b => b.amplitudePct > 0), 'amplitude %');
v(R.bougies.every(b => b.volRel > 0.3 && b.volRel < 3), 'volume relatif calculé');
v(R.support == null || R.support.prix < R.prix, 'support sous le prix'); v(R.resistance == null || R.resistance.prix > R.prix, 'résistance au-dessus');
v(!R.support || /^Support le plus proche : .+ \(−\d/.test(R.support.phrase), 'phrase du support : ' + (R.support && R.support.phrase));
for (const n of [3, 5]) v(construireHtf(J, { tf: 'S', n }).bougies.length === n, n + ' bougies');
v(construireHtf(J, { tf: 'J', n: 5 }).bougies.length === 5, 'Daily 5'); v(construireHtf(J, { tf: 'M', n: 4 }).ok, 'Monthly');
v(!construireHtf(J.slice(0, 10), { tf: 'S' }).ok, 'trop peu de données refusé');
const F = construireHtf(J, { tf: 'S', n: 5 }); const prixs = F.niveaux.map(x => x.prix); v(new Set(prixs.map(p => Math.round(p))).size === prixs.length, 'aucun doublon de prix');
const ys = placerEtiquettes([100, 101, 102, 103, 300, 301], 14, 0, 400), s = [...ys].sort((a, b) => a - b); v(s.every((y, i) => !i || y - s[i - 1] >= 14 - 1e-9), 'étiquettes espacées d au moins 14 px'); v(s[0] >= 0 && s[s.length - 1] <= 400, 'dans les bornes');
const J3 = J.map(b => ({ ...b })); for (const b of J3.slice(-14)) b.h += 400; const C = construireHtf(J3, { tf: 'S', n: 5 }); v(C.niveaux.some(x => (x.membres || []).some(m => /CE/.test(m))), 'CE sur longue mèche');
console.log(`htf : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
