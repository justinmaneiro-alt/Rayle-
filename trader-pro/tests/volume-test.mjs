/* Tests purs du mode Volume. node trader-pro/tests/volume-test.mjs */
import { profil, vwapAncre, indexAncrePeriode, pocsNus, pocsNusA, tousPocsPeriode, mfi, divergencesMfi, deltaBarre, cvd, deltaReel, volumeRelatif, volumeAnormal, niveauxVolume, flechesVolume, evenementsVolume, desequilibre, murs, seuilGrosses, enH4, TYPES_FLECHES_VOLUME } from '../volume/volume-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const H = 3600e3, T0 = Date.UTC(2026, 0, 5);   // lundi

/* ───── profil ───── */
const B1 = [{ t: 0, o: 100, h: 110, l: 100, c: 105, v: 100 }, { t: 1, o: 105, h: 106, l: 104, c: 105, v: 300 }, { t: 2, o: 105, h: 110, l: 100, c: 102, v: 100 }];
const P = profil(B1, { niveaux: 10 });
v(P && proche(P.total, 500) && Math.abs(P.bins.reduce((s, x) => s + x.v, 0) - 500) < 1e-6, 'profil : le volume total est conservé');
v(P.poc.prix > 104 && P.poc.prix < 106, 'POC sur la zone la plus échangée : ' + P.poc.prix.toFixed(1));
v(P.val <= P.poc.prix && P.vah >= P.poc.prix && P.vah > P.val, 'zone de valeur autour du POC : ' + P.val.toFixed(1) + ' – ' + P.vah.toFixed(1));
const dans = P.bins.filter(x => x.lo >= P.val - 1e-9 && x.hi <= P.vah + 1e-9).reduce((s, x) => s + x.v, 0); v(dans >= 0.7 * 500 - 1e-6, 'la zone de valeur contient au moins 70 % du volume : ' + (dans / 5).toFixed(0) + ' %');
/* deux sommets : 2 HVN et un LVN entre eux */
const bi = []; for (let i = 0; i < 40; i++) { const p = i < 20 ? 100 : 120; bi.push({ t: i, o: p, h: p + 2, l: p - 2, c: p, v: 100 }); } for (let i = 0; i < 6; i++) bi.push({ t: 100 + i, o: 110, h: 112, l: 108, c: 110, v: 10 });
const Pb = profil(bi, { niveaux: 30 }); v(Pb.hvn.length >= 2 && Pb.lvn.length >= 1 && Pb.lvn.some(l => l.prix > 104 && l.prix < 116), 'bimodal : 2 HVN, 1 LVN entre les deux (' + Pb.hvn.length + ' HVN, ' + Pb.lvn.length + ' LVN)');
v(profil([]) === null && profil([{ t: 0, o: 1, h: 1, l: 1, c: 1, v: 0 }]) === null, 'rien à profiler : null');

/* ───── delta ───── */
v(deltaBarre({ o: 1, h: 2, l: 1, c: 2, v: 100 }) === 100 && deltaBarre({ o: 2, h: 2, l: 1, c: 1, v: 100 }) === -100, 'delta estimé : clôture au plus haut = +volume ; au plus bas = −volume');
v(deltaBarre({ o: 1, h: 2, l: 1, c: 1.5, v: 100, bv: 70 }) === 40 && deltaReel([{ bv: 1 }, { bv: 2 }]) && !deltaReel([{ bv: 1 }, {}]), 'delta réel = 2 × acheteurs − volume ; « réel » seulement si toutes les bougies ont le côté');
v(cvd([{ o: 1, h: 2, l: 1, c: 2, v: 10 }, { o: 2, h: 2, l: 1, c: 1, v: 4 }]).join() === '10,6', 'CVD cumulé');

/* ───── VWAP ancré ───── */
const bw = [{ t: 0, o: 10, h: 12, l: 8, c: 10, v: 100 }, { t: 1, o: 10, h: 14, l: 10, c: 12, v: 300 }];
const W = vwapAncre(bw, 0);
v(proche(W[0].vwap, 10) && proche(W[1].vwap, (100 * 10 + 300 * (14 + 10 + 12) / 3) / 400) && W[1].sd > 0 && proche(W[1].bandes['+2'], W[1].vwap + 2 * W[1].sd), 'VWAP volume-pondéré et bandes ±2 σ');
v(vwapAncre(bw, 1).length === 1 && vwapAncre([{ t: 0, o: 1, h: 1, l: 1, c: 1, v: 0 }], 0)[0].vwap === null, 'ancre sur la bougie choisie ; sans volume : pas de VWAP inventé');
const sem = Array.from({ length: 24 * 21 }, (_, i) => ({ t: T0 + i * H, o: 100, h: 101, l: 99, c: 100, v: 1 })); const iA = indexAncrePeriode(sem, 'semaine');
v(sem[iA].t === T0 + 14 * 24 * H, 'ancre « semaine » = lundi 00:00 UTC de la semaine en cours');

/* ───── POC nus ───── */
const mk = (s, base, vol) => Array.from({ length: 24 * 5 }, (_, i) => ({ t: T0 + s * 7 * 24 * H + i * H, o: base, h: base + 1, l: base - 1, c: base, v: vol }));
const S = [...mk(0, 100, 100), ...mk(1, 120, 100), ...mk(2, 110, 100)]; S.push({ t: T0 + 2 * 7 * 24 * H + 24 * 5 * H, o: 119, h: 121, l: 118, c: 119, v: 5 });
const N = pocsNus(S, 'semaine'); v(N.length === 1 && Math.abs(N[0].prix - 100) < 2 && N[0].nu, 'POC nu : la semaine 1 (100) jamais retouchée ; la semaine 2 (120) a été retouchée : ' + N.map(x => x.prix.toFixed(0)).join());
const tous = tousPocsPeriode(S, 'semaine'); v(pocsNusA(tous, 24 * 10).some(x => Math.abs(x.prix - 120) < 2) && !pocsNusA(tous, S.length - 1).some(x => Math.abs(x.prix - 120) < 2), 'POC nus tels que connus à la bougie i : 120 est nu avant d’être touché, plus après');

/* ───── MFI ───── */
const mont = Array.from({ length: 40 }, (_, i) => ({ t: i, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 100 })), M = mfi(mont); v(M[13] == null && M[14] === 100 && M[39] === 100, 'MFI 14 : 100 sur une hausse continue, null avant 14 bougies');
const des = Array.from({ length: 40 }, (_, i) => ({ t: i, o: 100 - i, h: 101 - i, l: 99 - i, c: 100 - i, v: 100 })); v(mfi(des)[39] === 0, 'MFI : 0 sur une baisse continue');
const dv = []; for (let i = 0; i < 60; i++) { const p = 100 + (i < 20 ? i : i < 30 ? 40 - i : i < 45 ? i - 20 : 70 - i); dv.push({ t: i, o: p, h: p + 1, l: p - 1, c: p, v: i < 20 ? 500 : i < 30 ? 100 : 60 }); }
const DV = divergencesMfi(dv, mfi(dv)); v(Array.isArray(DV) && DV.every(d => d.i > d.pivot), 'divergences : signalées après la confirmation du pivot (aucune information future)');

/* ───── volume relatif ───── */
const sv = Array.from({ length: 30 }, (_, i) => ({ v: i === 25 ? 500 : 100 })), vr = volumeRelatif(sv);
v(vr[24] === 1 && vr[25] === 5 && vr[10] === null && volumeAnormal(sv)[25] === true, 'RVOL et barres anormales (> 2× la moyenne)');

/* ───── carnet ───── */
const book = { bids: [[99, 10], [98, 10], [97, 10], [96, 50], [95, 10], [94, 10]], asks: [[100, 5], [101, 5], [102, 5], [103, 5], [104, 5], [105, 5]] };
const de = desequilibre(book, 3); v(proche(de.ratio, (30 - 15) / 45) && de.part > 0.5, 'déséquilibre acheteurs / vendeurs sur 3 niveaux : +' + de.ratio.toFixed(2));
const mu = murs(book); v(mu.length === 1 && mu[0].prix === 96 && mu[0].cote === 'achat', 'mur : l’ordre de 50 (≥ 4 × la médiane) à 96');
v(seuilGrosses(Array.from({ length: 100 }, (_, i) => (i === 99 ? 50 : 1))) >= 5 && seuilGrosses([1, 2]) === Infinity, 'seuil des grosses transactions : jamais de seuil inventé avec trop peu de données');

/* ───── H4 ───── */
const h4 = enH4([{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 10, bv: 6 }, { t: H, o: 2, h: 3, l: 2, c: 3, v: 20, bv: 5 }]); v(h4.length === 1 && h4[0].v === 30 && h4[0].bv === 11 && h4[0].h === 3, 'H1 → H4 : volumes et volumes acheteurs sommés');

/* ───── flèches ───── */
function serie(n = 200) { const B = []; let p = 100; for (let i = 0; i < n; i++) { const w = Math.sin(i / 5) * 2 + ((i * 7919) % 13) / 13 - 0.5; const o = p, c = 100 + w; B.push({ t: T0 + i * 4 * H, o, h: Math.max(o, c) + 0.6, l: Math.min(o, c) - 0.6, c, v: 100 + ((i * 31) % 17) }); p = c; } return B; }
const Bs = serie(), F = flechesVolume(Bs, { unite: 'H4' });
v(Array.isArray(F) && F.every(f => TYPES_FLECHES_VOLUME.some(t => t.id === f.type) && f.i === Bs.findIndex(b => b.t === f.t) && /·/.test(f.libelle)), 'flèches : types connus, libellé, indexées sur la bougie de confirmation (' + F.length + ' flèches)');
const cut = 150, Fp = flechesVolume(Bs.slice(0, cut), { unite: 'H4' }), Fc = F.filter(f => f.i < cut - 1);
v(Fp.filter(f => f.i < cut - 1).map(f => f.type + f.i + f.dir).join() === Fc.map(f => f.type + f.i + f.dir).join(), 'aucune information future : un préfixe de la série donne les mêmes flèches');
const base = Array.from({ length: 100 }, (_, i) => ({ t: T0 + i * 4 * H, o: 100, h: 102, l: 98, c: 100 + (i % 2 ? 0.3 : -0.3), v: 100 }));
const PP = profil(base.slice(-60)), niv = PP.val;
const abs = { t: T0 + 100 * 4 * H, o: niv + 1.0, h: niv + 1.2, l: niv - 1.5, c: niv + 1.1, v: 400 };
const prev = { ...base[99], c: base[99].o - 1.5, l: base[99].o - 1.7 }; const Bz = [...base.slice(0, 99), prev, abs];
const Fa = flechesVolume(Bz, { unite: 'H4' }).filter(f => f.type === 'vol-absorption');
v(Fa.length === 1 && Fa[0].dir === 1 && Fa[0].i === 100 && /Absorption H4 · /.test(Fa[0].libelle) && /volume ×4,0/.test(Fa[0].libelle), 'absorption : une flèche d’achat sur la VAL : ' + (Fa[0] ? Fa[0].libelle : 'aucune'));
const cas = { t: T0 + 100 * 4 * H, o: PP.vah - 0.2, h: PP.vah + 3, l: PP.vah - 0.3, c: PP.vah + 2.5, v: 250 }; const Bc = [...base.slice(0, 99), { ...base[99], c: PP.vah - 0.5, h: PP.vah, l: PP.vah - 1 }, cas];
const Fcass = flechesVolume(Bc, { unite: 'H4' }).filter(f => f.type === 'vol-cassure'); v(Fcass.length >= 1 && Fcass[0].dir === 1 && /VAH/.test(Fcass[0].nomNiveau), 'cassure validée : flèche haussière sur la VAH');
const faible = { ...cas, v: 100 }; v(flechesVolume([...base.slice(0, 99), { ...base[99], c: PP.vah - 0.5, h: PP.vah, l: PP.vah - 1 }, faible], { unite: 'H4' }).filter(f => f.type === 'vol-cassure').length === 0, 'volume normal : pas de cassure validée');
const dup = flechesVolume(Bz, { unite: 'H4' }); v(new Set(dup.map(f => f.type + '|' + f.i)).size === dup.length, 'jamais deux flèches du même type sur la même bougie');
const ev = evenementsVolume(Bs, 'H4'); v(TYPES_FLECHES_VOLUME.every(t => Array.isArray(ev[t.id])), 'événements au format des statistiques');

/* ───── niveaux S/R par le volume ───── */
const NV = niveauxVolume(Bs); v(NV.niveaux.length >= 1 && NV.niveaux.length <= 5 && NV.niveaux.every((n, i, L) => i === 0 || L[i - 1].prix > n.prix) && NV.niveaux.every((n, i, L) => L.every((m, j) => i === j || Math.abs(m.prix - n.prix) >= NV.atr - 1e-9)), 'niveaux S/R : 1 à 5, séparés d’au moins 1 ATR, triés (' + NV.niveaux.length + ')');
v(niveauxVolume(Bs.slice(0, 10)).niveaux.length === 0, 'trop peu de bougies : aucun niveau');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
