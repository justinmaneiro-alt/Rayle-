/* Tests purs d'ict-v2 (moteur ICT multi-unités) avec des bougies synthétiques. Usage : node trader-pro/tests/ict-v2-test.mjs */
import * as V from '../../agent-trading/front/or/ict-v2.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 10, 2, 0, 0);   // lundi 2 novembre 2026, 00:00 UTC
const bar = (i, o, c, h, l, pas = H) => ({ t: T0 + i * pas, o, c, h: h ?? Math.max(o, c) + 0.2, l: l ?? Math.min(o, c) - 0.2, v: 100 });
/* plateau sans swing ni écart : bougies qui se chevauchent, plus haut 100,7 et plus bas 99,0 identiques (aucun swing strict) */
const plateau = (n, pas = H) => Array.from({ length: n }, (_, i) => (i % 2 ? bar(i, 99.7, 100.3, 100.7, 99.0, pas) : bar(i, 100.3, 99.7, 100.7, 99.0, pas)));
const suite = (base, L, pas = H) => { const o = base.slice(); for (const [a, c, h, l] of L) o.push(bar(o.length, a, c, h, l, pas)); return o; };
const analyser = (B, opt = {}) => V.analyser(B, { unite: 'H1', ...opt });
const obDe = (an, i) => an.ob.filter(z => z.iCandidate === i);
const P60 = plateau(60);

/* ── 0. la série plateau ne produit aucun swing ni zone parasite ── */
{ const an = analyser(P60); v(an.ok && an.ob.length === 0 && an.fvg.length === 0 && an.structure.swings.H.length === 0, 'plateau : aucun swing, aucun FVG, aucun order block'); v(an.tendance.sens === 'indecise', 'plateau : tendance indécise'); }

/* ── 1. order blocks ── */
const c = 60;   // indice de la candidate (bougie baissière)
{ // mèche seule au-delà de la candidate : pas d'order block
  const B = suite(P60, [[100.4, 99.4, 100.6, 99.2], [99.5, 100.3, 102.8, 99.4], [100.3, 100.4, 100.9, 99.8], [100.4, 100.2, 100.8, 99.9], [100.2, 100.3, 100.7, 99.9]]);
  const an = analyser(B); v(obDe(an, c).length === 0, 'une mèche seule au-delà de la candidate ne crée pas d\'order block'); }
{ // FVG trois bougies plus tard : pas d'order block
  const B = suite(P60, [[100.4, 99.4, 100.6, 99.2], [99.5, 101.0, 101.2, 99.4], [101.0, 101.2, 101.5, 100.5], [101.2, 101.4, 101.6, 100.9], [101.5, 102.5, 102.8, 102.0], [102.5, 102.6, 103.0, 102.2]]);
  const an = analyser(B); v(obDe(an, c).length === 0, 'un FVG trois bougies plus tard ne valide pas l\'order block'); }
const B_OB = suite(P60, [[100.4, 99.4, 100.6, 99.2], [99.5, 102.5, 102.8, 99.4], [102.5, 103.5, 104.0, 102.0], [103.5, 104.0, 104.4, 103.0], [104.0, 104.2, 104.6, 103.5]]);
{ // reversal candle qui clôture au-delà + FVG immédiat : order block valide
  const an = analyser(B_OB), z = obDe(an, c)[0]; v(!!z && z.dir === 1 && z.statut === 'frais', 'reversal candle + FVG immédiat : order block haussier valide, frais');
  v(z && z.bas === 99.2 && z.haut === 100.6 && Math.abs(z.meanThreshold - 99.9) < 1e-9, 'zone = plus haut / plus bas de la candidate, mean threshold = milieu');
  v(z && z.iReversal === 61 && z.fvg.iMilieu === 61, 'la bougie du milieu du FVG est la reversal candle');
  v(z && z.liquidite === false && z.fort === false, 'sans prise de liquidité ni cassure de structure : ni liquidité ni fort');
  v(an.pdArrays.some(x => x.type === 'OB' && x.id === z.id), 'l\'order block frais est listé dans les PD arrays'); }
{ // FVG sur la bougie suivante (milieu = r+1) : valide aussi
  const B = suite(P60, [[100.4, 99.4, 100.6, 99.2], [99.5, 101.0, 101.2, 99.4], [101.0, 102.0, 102.2, 100.5], [102.0, 102.8, 103.0, 101.6], [102.8, 103.0, 103.4, 102.5]]);
  const an = analyser(B), z = obDe(an, c)[0]; v(!!z && z.fvg.iMilieu === 62, 'FVG sur la bougie qui suit la reversal candle : order block valide'); }
{ // sweep : un creux est balayé par la candidate → liquidite true
  const base = suite(P60, [[100.0, 99.0, 100.2, 98.0], [99.0, 99.8, 100.1, 98.8], [99.8, 100.1, 100.6, 99.2], [100.1, 99.9, 100.5, 99.3]]);   // creux à 98,0 (STL confirmé), puis retour au plateau
  const n0 = base.length, B = suite(base, [[100.0, 97.8, 100.1, 97.2], [97.9, 101.5, 101.8, 97.8], [101.5, 102.5, 103.0, 101.0], [102.5, 103.0, 103.4, 102.2], [103.0, 103.2, 103.6, 102.8]]), an = analyser(B), z = obDe(an, n0)[0];
  v(!!z && z.liquidite === true, 'la candidate balaie un creux (STL) : liquidite = true'); v(!!z && z.fort === true && z.casse === 'STH', 'la reversal candle casse aussi un sommet de structure (STH) : fort'); }
{ // consolidation sous la zone : stopsDerriere
  const B = suite(P60, [[100.4, 99.5, 100.5, 99.3], [99.5, 102.5, 102.8, 99.4], [102.5, 103.5, 104.0, 102.0], [103.5, 104.0, 104.4, 103.0], [104.0, 104.2, 104.6, 103.5]]);
  const z = obDe(analyser(B), c)[0]; v(!!z && z.stopsDerriere === true, 'consolidation (≥ 4 bougies) aux creux intacts juste sous la zone : stopsDerriere = true');
  const sans = obDe(analyser(suite(P60, [[100.4, 97.4, 100.5, 96.8], [97.5, 101.5, 101.8, 97.4], [101.5, 102.5, 103.0, 101.0], [102.5, 103.0, 103.4, 102.2], [103.0, 103.2, 103.6, 102.8]])), c)[0];
  v(!!sans && sans.stopsDerriere === false, 'zone loin sous les creux de la consolidation : stopsDerriere = false');
  const casse = obDe(analyser(suite(B, [[104.0, 98.0, 104.1, 97.5], [98.0, 98.4, 99.0, 97.9]])), c)[0]; v(!!casse && casse.stopsDerriere === false, 'creux balayés depuis : plus de stops derrière'); }
{ // statuts : frais → testé → cassé → breaker
  const test = obDe(analyser(suite(B_OB, [[104.2, 103.0, 104.3, 100.3], [103.0, 103.5, 103.8, 102.5]])), c)[0]; v(test && test.statut === 'teste', 'le prix revient dans la zone : testé');
  const an = analyser(suite(B_OB, [[104.2, 98.5, 104.3, 98.0], [98.5, 98.0, 98.9, 97.6]])), z = obDe(an, c)[0]; v(z && z.statut === 'casse' && !!z.breaker && z.breaker.dir === -1, 'clôture sous l\'extrémité opposée : cassé, devient un breaker baissier');
  v(an.pdArrays.some(x => x.type === 'breaker') && !an.pdArrays.some(x => x.type === 'OB' && x.id === z.id), 'le breaker est listé, l\'order block cassé ne l\'est plus'); }

/* ── 2. structure et tendance ── */
/* chemin en zigzag : points [prix, nombre de bougies] ; la dernière bougie de chaque segment pointe 0,5 au-delà (swing strict) */
function chemin(depart, segments, pas = H, t0 = 0) {
  const o = []; let p = depart; for (const [cible, k] of segments) { for (let j = 0; j < k; j++) { const a = p + (cible - p) * j / k, b = p + (cible - p) * (j + 1) / k, fin = j === k - 1, up = cible > p;
    o.push({ t: T0 + (t0 + o.length) * pas, o: a, c: b, h: Math.max(a, b) + (fin && up ? 0.5 : 0.2), l: Math.min(a, b) - (fin && !up ? 0.5 : 0.2), v: 100 }); } p = cible; }
  return o;
}
const miroir = (B, m) => B.map(b => ({ ...b, o: 2 * m - b.o, c: 2 * m - b.c, h: 2 * m - b.l, l: 2 * m - b.h }));
const avant = chemin(100, [[100, 1]]);   // placeholder évité : le plateau sert de départ
const HAUSSE = [[98, 2], [101, 2], [95, 3], [108, 8], [104, 4], [113, 8], [109, 4], [111, 3], [109.5, 2]];   // STH 108, STL 104, STH 113 (ITH), STL 109, STH 111
const base = plateau(50).concat(chemin(100, HAUSSE, H, 50));
{ const an = analyser(base); v(an.structure.ITH.some(x => Math.abs(x.p - 113.5) < 0.1), 'ITH détecté : STH 113 encadré par deux STH plus bas'); v(an.tendance.sens === 'indecise', 'avant toute cassure d\'ITH / ITL : tendance indécise'); }
{ // cassure d'un simple STH (111 → au-dessus de 111,5 sans atteindre l'ITH) : tendance inchangée, marquée bruit
  const B2 = base.concat(chemin(109.5, [[112.6, 2]], H, base.length));
  const an = analyser(B2); v(an.tendance.sens === 'indecise', 'cassure d\'un simple STH : la tendance ne change pas'); v(an.tendance.bruit.some(x => x.type === 'STH' && x.note === 'bruit'), 'la cassure du STH est marquée « bruit »'); }
{ // cassure d'ITH en clôture avec déplacement
  const fin = base.concat([{ t: T0 + base.length * H, o: 109.5, c: 115.5, h: 115.8, l: 109.4, v: 100 }, { t: T0 + (base.length + 1) * H, o: 115.5, c: 116.0, h: 116.4, l: 115.1, v: 100 }]);
  const an = analyser(fin); v(an.tendance.sens === 'haussiere', 'cassure de l\'ITH en clôture : tendance haussière'); const d = an.tendance.derniereCassure;
  v(d && d.niveau === 'ITH' && d.deplacement === true && d.type === 'BOS', 'dernière cassure : ITH, avec déplacement ' + JSON.stringify(d && { type: d.type, niveau: d.niveau, dep: d.deplacement }));
  v(an.tendance.itl && an.tendance.itl.p < 111, 'l\'ITL de référence est renvoyé');
  // mèche au-dessus de l'ITH sans clôture au-delà : pas de changement
  const meche = base.concat([{ t: T0 + base.length * H, o: 109.5, c: 112.9, h: 114.5, l: 109.4, v: 100 }, { t: T0 + (base.length + 1) * H, o: 112.9, c: 112.5, h: 113.0, l: 112.0, v: 100 }]); v(analyser(meche).tendance.sens === 'indecise', 'une mèche au-dessus de l\'ITH sans clôture au-delà ne change rien');
  // symétrique : tendance baissière
  const bas = analyser(miroir(fin, 100)); v(bas.tendance.sens === 'baissiere' && bas.tendance.derniereCassure.niveau === 'ITL', 'cas symétrique : cassure d\'un ITL, tendance baissière'); }
{ // tendance baissière puis cassure d'un STH seulement : reste baissière ; cassure de l'ITH : MSS
  const fin = base.concat([{ t: T0 + base.length * H, o: 109.5, c: 115.5, h: 115.8, l: 109.4, v: 100 }]), bas = miroir(fin, 100);
  const apresSTH = bas.concat(chemin(bas[bas.length - 1].c, [[bas[bas.length - 1].c + 1.5, 2], [bas[bas.length - 1].c + 0.5, 2]], H, bas.length)); const an = analyser(apresSTH); v(an.tendance.sens === 'baissiere', 'tendance baissière : la cassure d\'un simple STH ne la renverse pas'); }
{ // range : les deux côtés cassés à tour de rôle
  const r = plateau(50).concat(chemin(100, [[108, 6], [103, 4], [109, 6], [102, 4], [106, 4]], H, 50)); const an = analyser(r); v(['indecise', 'haussiere', 'baissiere'].includes(an.tendance.sens), 'range : la tendance est toujours un des trois états'); }

/* ── 3. sommets et creux égaux ── */
{ const eg = plateau(50).concat(chemin(100, [[110, 6], [105, 4], [110.04, 4], [106, 4]], H, 50)); const an = analyser(eg);
  const e = an.liquidites.find(x => x.type === 'EQH'); v(!!e && !e.balayee && Math.abs(e.p - 110.54) < 0.7, 'EQH : deux sommets à moins de 0,1 ATR, non balayés' + (e ? '' : ' (aucun EQH)'));
  v(!an.liquidites.some(x => x.type === 'EQH' && Math.abs(x.p - 110.54) > 5), 'aucun EQH parasite');
  const apres = analyser(eg.concat([{ t: T0 + eg.length * H, o: 106, c: 106.5, h: 111.6, l: 105.8, v: 100 }, { t: T0 + (eg.length + 1) * H, o: 106.5, c: 107, h: 107.4, l: 106, v: 100 }]));
  const e2 = apres.liquidites.find(x => x.type === 'EQH'); v(!e2 || e2.balayee === true, 'EQH balayé par une mèche : il n\'est plus actif'); v(apres.liquidites.filter(x => x.type === 'EQH' && !x.balayee).length === 0, 'aucun EQH actif après le balayage');
  const loin = plateau(50).concat(chemin(100, [[110, 6], [105, 4], [111.2, 4], [106, 4]], H, 50)); v(!analyser(loin).liquidites.some(x => x.type === 'EQH' && !x.balayee && x.p > 109), 'deux sommets à plus de 0,1 ATR : pas d\'EQH'); }

/* ── 4. biais du jour (méthode PDH / PDL sur la bougie journalière d'hier) ── */
const J = 86400e3, jb = (i, o, c, h, l) => ({ t: T0 + i * J, o, c, h, l, v: 100 }), plJ = Array.from({ length: 45 }, (_, i) => (i % 2 ? jb(i, 104, 106, 107, 103) : jb(i, 106, 104, 107, 103)));
const biais = Y => V.analyser(plJ.concat([jb(45, 105, 105, 110, 100), Y]), { unite: 'J' }).biaisDuJour;
v(biais(jb(46, 108, 112, 113, 107)).sens === 'haussier', 'biais : clôture au-dessus du PDH → haussier');
v(biais(jb(46, 108, 108, 112, 103)).sens === 'baissier', 'biais : mèche au-dessus du PDH et clôture en dessous → baissier');
v(biais(jb(46, 101, 98, 102, 96)).sens === 'baissier', 'biais : clôture sous le PDL → baissier');
v(biais(jb(46, 99, 103, 108, 98)).sens === 'haussier', 'biais : mèche sous le PDL et clôture au-dessus → haussier');
{ const b = biais(jb(46, 104, 106, 108, 103)); v(b.sens === null && b.cas === 'inside_day', 'biais : inside day → aucun biais'); }

/* ── 5. même série, deux unités : les calculs se font sur les bougies de l'unité ── */
{ let x = 100, s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, H1b = []; for (let i = 0; i < 480; i++) { const o = x; x += (rnd() - 0.5) * 3; H1b.push({ t: T0 + i * H, o, c: x, h: Math.max(o, x) + rnd(), l: Math.min(o, x) - rnd(), v: 100 }); }
  const reg = (L, ms) => { const m = new Map(); for (const b of L) { const k = Math.floor(b.t / ms) * ms, g = m.get(k); if (!g) m.set(k, { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }); else { g.h = Math.max(g.h, b.h); g.l = Math.min(g.l, b.l); g.c = b.c; } } return [...m.values()]; };
  const H4b = reg(H1b, 4 * H), a1 = V.analyser(H1b, { unite: 'H1' }), a4 = V.analyser(H4b, { unite: 'H4' });
  v(a4.unite === 'H4' && a4.n === H4b.length && a1.n === H1b.length, 'chaque unité compte ses propres bougies (H1 ' + a1.n + ', H4 ' + a4.n + ')');
  v(Math.abs(a4.atr - V.atrSerie(H4b)[H4b.length - 1]) < 1e-9 && Math.abs(a1.atr - a4.atr) > 1e-6, 'l\'ATR de chaque analyse est celui de SON unité');
  const hauts = new Set(H4b.map(b => b.h)), bas = new Set(H4b.map(b => b.l)); const swH = a4.structure.swings.H, swL = a4.structure.swings.L;
  v(swH.length > 5 && swH.every(x => hauts.has(x.p)) && swL.every(x => bas.has(x.p)), 'les swings H4 sont des plus hauts / plus bas de bougies H4');
  v(a4.fvg.every(z => (z.t - H4b[0].t) % (4 * H) === 0), 'les FVG H4 sont posés sur des bougies H4');
  v(a1.structure.swings.H.length > a4.structure.swings.H.length, 'la même série donne plus de swings en H1 qu\'en H4 (unités distinctes)');
  v(a4.pdArrays.every(z => z.unite === 'H4') && a4.liquidites.every(z => z.unite === 'H4'), 'tous les éléments H4 portent l\'unité H4');
  v(a4.temps === null && a4.premiumDiscount !== undefined, 'pas de killzones en H4'); v(a1.temps !== null, 'killzones disponibles en H1'); }

/* ── 6. premium / discount, checklist, affichage sobre ── */
{ const fin = base.concat([{ t: T0 + base.length * H, o: 109.5, c: 115.5, h: 115.8, l: 109.4, v: 100 }, { t: T0 + (base.length + 1) * H, o: 115.5, c: 113.8, h: 115.7, l: 113.6, v: 100 }]), an = analyser(fin, { maintenant: T0 + 400 * H });
  v(an.premiumDiscount && Math.abs(an.premiumDiscount.equilibre - (an.premiumDiscount.haut + an.premiumDiscount.bas) / 2) < 1e-9, 'équilibre = 50 % du dealing range');
  const p = an.premiumDiscount; v(p && Math.abs(p.oteAchat.haut - (p.haut - 0.62 * (p.haut - p.bas))) < 1e-9 && Math.abs(p.oteAchat.bas - (p.haut - 0.79 * (p.haut - p.bas))) < 1e-9, 'zone OTE 62–79 %');
  v(an.checklist.length === 10 && an.checklist.every(x => x.ok === true || x.ok === false || x.ok === null), 'checklist : dix conditions true / false / null');
  v(an.checklist.find(x => /annonce/.test(x.condition)).ok === null, 'annonces : null quand le calendrier est indisponible'); v(['achat', 'vente', 'neutre'].includes(an.penche.sens), 'penche : achat, vente ou neutre');
  const m = V.modeleAffichage(an); v(m.badge && /^Tendance H1 : /.test(m.badge.texte), 'badge « Tendance H1 : … »'); v(m.objets.length <= 12, 'au plus une douzaine d\'objets'); }
{ const J2 = plJ.concat([jb(45, 105, 105, 110, 100), jb(46, 108, 112, 113, 107)]), an = V.analyser(J2, { unite: 'J' }), m = V.modeleAffichage(an);
  v(an.temps === null && !m.killzones.length, 'pas de killzone en Daily'); v(an.plages && an.plages.length === 2 && an.plages[0].jours === 20, 'Daily : plages de 20 et 40 jours (60 absent faute de bougies)'); }
{ const pas = V.analyser(plateau(10), { unite: 'H1' }); v(pas.ok === false, 'trop peu de bougies : analyse refusée, jamais inventée'); v(V.analyser([], { unite: 'X' }) === null, 'unité inconnue : null'); }
/* ── 7. lecture_ict : une seule unité, résumé déterministe ── */
import { lectureIct, resumeIct } from '../../agent-trading/front/or/ict-lecture.js';
{ const fin = base.concat([{ t: T0 + base.length * H, o: 109.5, c: 115.5, h: 115.8, l: 109.4, v: 100 }, { t: T0 + (base.length + 1) * H, o: 115.5, c: 113.8, h: 115.7, l: 113.6, v: 100 }]);
  for (const u of ['M15', 'H1', 'H4', 'J']) { const pas = V.UNITES[u].ms, B = fin.map((b, i) => ({ ...b, t: T0 + i * pas })), an = V.analyser(B, { unite: u, maintenant: T0 + 400 * pas }), L = lectureIct(an, { actif: 'or' }), R = resumeIct(L), nom = V.UNITES[u].nom;
    v(L.unite === nom && L.source === 'ict-v2', 'lecture_ict ' + nom + ' : unité et source');
    v([...L.liquidites, ...L.pdArrays].every(x => x.unite === nom), 'lecture_ict ' + nom + ' : tous les éléments portent leur unité ' + nom);
    v(R.startsWith('En ' + nom + ' : '), 'résumé ' + nom + ' : commence par « En ' + nom + ' : »');
    const phrases = R.split(/(?<=\.) /).length; v(phrases >= 3 && phrases <= 6, 'résumé ' + nom + ' : 3 à 5 phrases (' + phrases + ')');
    v(!/ach[eè]te|vends/i.test(R), 'résumé ' + nom + ' : jamais « achète » ni « vends »');
    const autres = ['M15', 'H1', 'H4', 'Daily'].filter(x => x !== nom); v(autres.every(x => !new RegExp('\\b' + x + '\\b').test(R)), 'résumé ' + nom + ' : ne cite aucune autre unité'); }
  const sans = lectureIct(V.analyser(plateau(10), { unite: 'H1' }), { actif: 'or' }); v(!!sans.indisponible && /^En H1 : /.test(resumeIct(sans)), 'données insuffisantes : « indisponible », jamais de chiffre inventé'); }
/* ── 7 bis. top-down et verdict d'order block ── */
{ const { resumeTopDown, verdictOrderBlock } = await import('../../agent-trading/front/or/ict-lecture.js');
  const lec = (unite, sens) => ({ unite, prix: 100, tendance: { sens, pourquoi: 'x', ith: 105, itl: 95, derniereCassure: null }, liquidites: [], pdArrays: [], premiumDiscount: null, temps: null, biaisDuJour: null, checklist: [], penche: { sens: 'neutre', raisons: [], manque: [], inconnu: [], complete: false, invalidation: null } });
  const T = resumeTopDown([lec('M15', 'haussiere'), lec('H1', 'haussiere'), lec('Daily', 'baissiere'), lec('H4', 'baissiere')]);
  v(T.rubriques.map(r => r.unite).join() === 'Daily,H4,H1,M15', 'top-down : rubriques de la plus haute à la plus basse (Daily, H4, H1, M15)');
  v(/Le H4 est baissier, le H1 haussier : un achat en H1 irait contre la dynamique H4\./.test(T.liaison), 'top-down : la phrase de liaison signale la contradiction : ' + T.liaison);
  v(/même sens/.test(resumeTopDown([lec('Daily', 'haussiere'), lec('H4', 'haussiere'), lec('H1', 'haussiere'), lec('M15', 'haussiere')]).liaison), 'top-down : unités alignées → phrase de cohérence');
  const an = V.analyser(B_OB.concat(Array.from({ length: 3 }, (_, k) => bar(B_OB.length + k, 104.2, 104.3, 104.6, 103.9))), { unite: 'H1' }), L = lectureIct(an, { actif: 'or' }), vo = verdictOrderBlock(L);
  v(vo.ok && /1\) Prise de liquidité : non/.test(vo.texte) && /2\) Reversal candle qui CLÔTURE au-delà de la candidate : oui/.test(vo.texte) && /3\) FVG sur la reversal candle ou juste après : oui/.test(vo.texte) && /^En H1 : /.test(vo.texte), 'order block : les trois points de la checklist, un par un, avec oui / non : ' + vo.texte.slice(0, 160));
  v(/simple/.test(vo.texte) && /stops laissés derrière/.test(vo.texte) && !/ach[eè]te|vends/i.test(vo.texte), 'order block : simple ou fort, piège des stops laissés derrière, jamais d\'ordre');
  v(!verdictOrderBlock(lectureIct(V.analyser(P60, { unite: 'H1' }), { actif: 'or' })).ok, 'aucun order block ouvert : le verdict le dit'); }

/* ── 8. non-repaint : ce qui est posé à la clôture d'une bougie ne bouge plus quand la suite arrive ── */
{ let x = 100, s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, L = []; for (let i = 0; i < 600; i++) { const o = x; x += (rnd() - 0.5) * 3.2; L.push({ t: T0 + i * H, o, c: x, h: Math.max(o, x) + rnd() * 0.8, l: Math.min(o, x) - rnd() * 0.8, v: 100 }); }
  const plein = V.analyser(L, { unite: 'H1' }); let coherent = true, nFvg = 0, nOb = 0, nEv = 0;
  for (const n of [250, 330, 410, 500]) { const p = V.analyser(L.slice(0, n), { unite: 'H1' });
    for (const z of p.fvg) { nFvg++; const q = plein.fvg.find(y => y.id === z.id); if (!q || q.bas !== z.bas || q.haut !== z.haut || q.i !== z.i) coherent = false; }
    for (const z of p.ob) { nOb++; const q = plein.ob.find(y => y.id === z.id); if (!q || q.bas !== z.bas || q.haut !== z.haut || q.i !== z.i || q.liquidite !== z.liquidite && !z.liquidite && false) coherent = false; }
    for (const e of p.structure.evenements) { nEv++; const q = plein.structure.evenements.find(y => y.i === e.i && y.type === e.type && y.niveau === e.niveau); if (!q || q.nature !== e.nature || q.dir !== e.dir) coherent = false; }
    v(p.n === n, 'préfixe de ' + n + ' bougies : analysé tel quel'); }
  v(coherent && nFvg > 10 && nEv > 5, 'non-repaint : FVG (' + nFvg + '), order blocks (' + nOb + ') et cassures (' + nEv + ') posés ne changent ni de zone ni de bougie quand la suite arrive'); }

/* ── 9. sceau SHA-256 posé avant tout affichage ── */
{ const fs = await import('node:fs'), crypto = await import('node:crypto'); const sc = JSON.parse(fs.readFileSync(new URL('../../agent-trading/front/or/ict-v2.sceau.json', import.meta.url), 'utf8'));
  const h = crypto.createHash('sha256').update(fs.readFileSync(new URL('../../agent-trading/front/or/ict-v2.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(sc.version === 'ict-v2' && h === sc.sha256, 'sceau SHA-256 d\'ict-v2 : le fichier n\'a pas changé depuis le scellement'); }
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
void avant;
