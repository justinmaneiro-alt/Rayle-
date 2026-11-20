/* Tests purs des repères ICT (v6, A4). Usage : node trader-pro/tests/ict-test.mjs */
import { jourDe, semaineDe, moisDe, agreger, reperes, premiumDiscount, fairValueGaps, orderBlocks, egaux, balayages, sessions, lecture, volumeRelatifJour, atrDaily, J, H } from '../volume/ict-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const D = (s, h = 0) => Date.parse(s + 'T00:00:00Z') + h * H;
/* semaines du lundi au dimanche, mois, bougies qui ouvrent la veille au soir (forex) */
v(semaineDe(D('2026-11-16')) === semaineDe(D('2026-11-22')) && semaineDe(D('2026-11-15')) !== semaineDe(D('2026-11-16')), 'semaine : du lundi au dimanche');
v(jourDe(D('2026-11-15', 22)) === jourDe(D('2026-11-16')), 'une bougie forex ouverte le dimanche 22 h UTC appartient à la séance du lundi'); v(moisDe(D('2026-11-30')) !== moisDe(D('2026-12-01')), 'mois : 30/11 ≠ 01/12');
/* série de 60 jours : jour i : o = 100 + i, h = o + 3, l = o − 2, c = o + 1 */
const B = Array.from({ length: 60 }, (_, i) => ({ t: D('2026-09-22') + i * J, o: 100 + i, h: 103 + i, l: 98 + i, c: 101 + i, v: 1000 }));   // dernier jour = 2026-11-20 (vendredi)
const now = D('2026-11-20', 12);
const R = reperes(B, now); const pdh = R.niveaux.find(n => n.id === 'PDH'), pdl = R.niveaux.find(n => n.id === 'PDL');
v(pdh.prix === B[58].h && pdl.prix === B[58].l, 'PDH / PDL = haut et bas de la veille (' + pdh.prix + ' / ' + pdl.prix + ')');
const semC = B.filter(b => semaineDe(b.t) === semaineDe(now)), semP = B.filter(b => semaineDe(b.t) === semaineDe(now) - 1);
v(R.niveaux.find(n => n.id === 'PWH').prix === Math.max(...semP.map(b => b.h)) && R.niveaux.find(n => n.id === 'PWL').prix === Math.min(...semP.map(b => b.l)), 'PWH / PWL = semaine précédente terminée (lundi 09/11 → dimanche 15/11)');
const moisP = B.filter(b => moisDe(b.t) === moisDe(now) - 1); v(R.niveaux.find(n => n.id === 'PMH').prix === Math.max(...moisP.map(b => b.h)) && R.niveaux.find(n => n.id === 'PML').prix === Math.min(...moisP.map(b => b.l)), 'PMH / PML = octobre complet');
v(R.ouvertures.find(o => o.id === 'OJ').prix === B[59].o && R.ouvertures.find(o => o.id === 'OS').prix === semC[0].o && R.ouvertures.find(o => o.id === 'OM').prix === B.find(b => moisDe(b.t) === moisDe(now)).o, 'ouvertures du jour, de la semaine et du mois');
/* si la dernière bougie est déjà terminée (lendemain), c'est elle la veille */
const R2 = reperes(B, D('2026-11-21', 3)); v(R2.niveaux.find(n => n.id === 'PDH').prix === B[59].h && !R2.ouvertures.find(o => o.id === 'OJ'), 'bougie terminée → c\'est la veille, pas d\'ouverture du jour');
/* premium / discount */
const pd = premiumDiscount(B, { maintenant: now }); v(pd && Math.abs(pd.equilibre - (pd.haut + pd.bas) / 2) < 1e-9 && pd.zone === 'premium', 'premium : prix au-dessus de 50 % de la semaine précédente');
const bas = premiumDiscount([...B.slice(0, 59), { ...B[59], o: 100, h: 101, l: 90, c: 92 }], { maintenant: now }); v(bas.zone === 'discount', 'discount : prix sous 50 % du range');
/* FVG */
const F0 = Array.from({ length: 40 }, (_, i) => ({ t: D('2026-10-01') + i * J, o: 100, h: 101, l: 99, c: 100, v: 1 }));
F0[20] = { ...F0[20], h: 101, l: 99, o: 100, c: 100.5 }; F0[21] = { ...F0[21], o: 101, h: 110, l: 100.9, c: 109 }; F0[22] = { ...F0[22], o: 109, h: 112, l: 106, c: 111 };   // trou entre 101 (haut bougie 20) et 106 (bas bougie 22)
for (let i = 23; i < 40; i++) F0[i] = { ...F0[i], o: 111, h: 113, l: 109, c: 112 };
const f = fairValueGaps(F0); v(f.length === 1 && f[0].sens === 'haussier' && f[0].bas === 101 && f[0].haut === 106, 'FVG haussier ouvert détecté 101–106 (' + JSON.stringify(f.map(x => [x.bas, x.haut])) + ')');
const F1 = F0.map(b => ({ ...b })); F1[30] = { ...F1[30], l: 95 }; v(fairValueGaps(F1).length === 0, 'FVG comblé (une bougie traverse toute la zone) → retiré');
const F2 = F0.map(b => ({ ...b })); F2[30] = { ...F2[30], l: 104 }; const f2 = fairValueGaps(F2); v(f2.length === 1 && f2[0].haut === 104, 'FVG comblé en partie → zone réduite (101–104)');
/* égaux hauts */
const E = Array.from({ length: 50 }, (_, i) => ({ t: D('2026-10-01') + i * J, o: 100, h: 101, l: 99, c: 100, v: 1 })); E[20] = { ...E[20], h: 105 }; E[30] = { ...E[30], h: 105.05 };
const eg = egaux(E); v(eg.some(x => x.type === 'haut' && Math.abs(x.prix - 105.05) < 0.01 && x.marque === '$$$'), 'égaux hauts repérés avec la marque $$$ (' + JSON.stringify(eg.map(x => [x.type, x.prix])) + ')');
const E2 = E.map(b => ({ ...b })); E2[40] = { ...E2[40], h: 106 }; v(!egaux(E2).some(x => x.type === 'haut' && Math.abs(x.prix - 105.05) < 0.01), 'égaux hauts déjà balayés → retirés');
/* balayage : mèche au-dessus du niveau puis clôture dessous */
const S = E.map(b => ({ ...b })); S[45] = { ...S[45], h: 107, c: 104 }; const sw = balayages(S, [{ id: 'EQH', prix: 105.05, type: 'haut', depuis: S[30].t }]); v(sw.length === 1 && sw[0].sens === 'baissier' && sw[0].t === S[45].t, 'balayage : mèche > niveau et clôture en deçà → « sweep »');
const S2 = E.map(b => ({ ...b })); S2[45] = { ...S2[45], h: 107, c: 106 }; S2[46] = { ...S2[46], c: 104 }; v(balayages(S2, [{ id: 'EQH', prix: 105.05, type: 'haut', depuis: S2[30].t }]).length === 1, 'balayage : retour à la bougie suivante');
const S3 = E.map(b => ({ ...b })); S3[45] = { ...S3[45], h: 107, c: 106 }; S3[46] = { ...S3[46], c: 106.5 }; v(balayages(S3, [{ id: 'EQH', prix: 105.05, type: 'haut', depuis: S3[30].t }]).length === 0, 'cassure franche (pas de retour) : pas de balayage');
/* order block : bougie baissière puis déplacement haussier qui casse le plus haut des 10 bougies précédentes */
const O = Array.from({ length: 40 }, (_, i) => ({ t: D('2026-10-01') + i * J, o: 100, h: 101.5, l: 98.5, c: 100.2, v: 1 })); O[25] = { ...O[25], o: 101, h: 101.5, l: 99, c: 99.5 }; O[26] = { ...O[26], o: 99.6, h: 108, l: 99.5, c: 107 };
for (let i = 27; i < 40; i++) O[i] = { ...O[i], o: 107, h: 108.5, l: 106, c: 107.5 };
const ob = orderBlocks(O); v(ob.length >= 1 && ob[0].sens === 'haussier' && ob[0].bas === 99 && ob[0].haut === 101.5, 'order block haussier : dernière bougie baissière avant le déplacement (' + JSON.stringify(ob.map(x => [x.sens, x.bas, x.haut])) + ')');
const O2 = O.map(b => ({ ...b })); O2[35] = { ...O2[35], c: 97 }; v(!orderBlocks(O2).some(x => x.bas === 99 && x.sens === 'haussier'), 'order block invalidé par une clôture sous son bas');
/* sessions */
const H1 = Array.from({ length: 48 }, (_, i) => ({ t: D('2026-11-19') + i * H, o: 100, h: 100 + (i % 24), l: 99 - (i % 24) / 10, c: 100, v: 1 })); const ss = sessions(H1);
v(ss.length === 6 && ss[0].id === 'asie' && ss[0].t0 === D('2026-11-19') && ss[0].t1 === D('2026-11-19', 8) && ss[0].haut === 107, 'sessions : 3 par jour sur 2 jours, Asie 00–08 UTC, haut = 107 (' + ss.length + ')');
/* lecture en une ligne */
const L = lecture({ B: F0.concat(F0.slice(0, 5).map((b, i) => ({ ...b, t: F0[39].t + (i + 1) * J, o: 111, h: 113, l: 109, c: 112 }))), fmt: x => String(Math.round(x)), maintenant: F0[39].t + 3 * J }); v(/premium|discount|équilibre/.test(L) && /FVG Daily/.test(L), 'lecture : place dans le range + FVG (« ' + L + ' »)'); v(lecture({ B: [] }).includes('Pas assez'), 'lecture : pas assez de bougies');
/* volume relatif */
const VR = Array.from({ length: 30 }, (_, i) => ({ t: D('2026-10-22') + i * J, o: 1, h: 2, l: 0.5, c: 1, v: 100 })); VR[29].v = 70; const vr = volumeRelatifJour(VR, { maintenant: VR[29].t + 12 * H - 6 * H + 6 * H }); v(vr && Math.abs(vr.moyenne - 100) < 1e-9 && vr.ratio > -0.5 && vr.ratio < 0.5, 'volume relatif : jour à mi-séance comparé à la moyenne de 20 jours (' + (vr && vr.ratio.toFixed(2)) + ')');
v(atrDaily(Array.from({ length: 100 }, (_, i) => ({ t: D('2026-09-01') + i * H * 4, o: 1, h: 3, l: 1, c: 2 })), 'H4') > 0, 'ATR Daily calculé depuis des bougies H4');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `ict-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
