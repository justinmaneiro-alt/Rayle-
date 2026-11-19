/* Tests purs des niveaux tracés à la main : modèle, Fibonacci, états, flèches à la clôture, pas de doublon, pas de regard vers l'avenir. node trader-pro/tests/niveaux-test.mjs */
import { creer, modifier, fibo, ancrageAuto, bande, evaluer, fusionnerEvenements, libelle, phrase, PAS, COULEURS, FIB } from '../terminal/niveaux.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H4 = PAS.H4, T0 = Date.UTC(2026, 0, 5);
/* bougies de base : 105, amplitude 2 (ATR ≈ 2), volume 100 ; `speciales` : { index: [o, h, l, c, v] } */
function bougies(n, speciales = {}, base = [105, 106, 104, 105, 100]) { return Array.from({ length: n }, (_, i) => { const [o, h, l, c, vol] = speciales[i] || base; return { t: T0 + i * H4, o, h, l, c, v: vol }; }); }
const apres = B => B[B.length - 1].t + H4 + 1;   // toutes les bougies sont closes
const N = 60, unite = 'H4';
const horiz = (p, cree = T0 + 5 * H4) => creer('horizontale', { p, unite, cree });

/* ───── modèle ───── */
v(horiz(100).p === 100 && horiz(100).type === 'horizontale' && horiz(100).alerte === true && horiz(100).verrou === false, 'ligne horizontale créée, alertes actives, non verrouillée');
v(creer('horizontale', { p: -1, unite }) === null && creer('horizontale', { p: 100, unite: 'M5' }) === null && creer('inconnu', { p: 1, unite }) === null, 'validation stricte (prix, unité, type)');
const tl = creer('tendance', { t1: T0 + 10 * H4, p1: 100, t2: T0, p2: 90, unite }); v(tl.t1 === T0 && tl.p1 === 90 && tl.t2 === T0 + 10 * H4 && tl.p2 === 100, 'trendline : points triés dans le temps');
const bx = creer('boite', { t1: T0 + 20 * H4, p1: 90, t2: T0 + 10 * H4, p2: 100, unite }); v(bx.t1 === T0 + 10 * H4 && bx.t2 === T0 + 20 * H4 && bx.bas === 90 && bx.haut === 100, 'boîte étirable dans tous les sens : bornes normalisées');
v(creer('boite', { t1: T0, p1: 90, t2: T0, p2: 100, unite }) === null && creer('boite', { t1: T0, p1: 90, t2: T0 + H4, p2: 90, unite }) === null, 'boîte plate ou sans largeur refusée');
v(modifier(horiz(100), { p: 101 }).p === 101 && modifier(horiz(100), { couleur: COULEURS[2], verrou: true }).verrou === true && modifier(horiz(100), { couleur: '#123456' }).couleur === COULEURS[0], 'modification : prix, couleur sobre, verrou');
const b2 = modifier(bx, { bas: 85, haut: 110 }); v(b2.bas === 85 && b2.haut === 110, 'boîte : modification des bords');
v(COULEURS.length === 4, 'quatre couleurs sobres');

/* ───── bande ───── */
v(bande(horiz(100), 0).bas === 100, 'bande horizontale'); v(bande(tl, T0 - 1) === null && Math.abs(bande(tl, T0 + 5 * H4).bas - 95) < 1e-9, 'trendline : valeur interpolée, rien avant le premier point'); v(bande(bx, T0) === null && bande(bx, T0 + 12 * H4).haut === 100, 'boîte : active à partir de son bord gauche');

/* ───── Fibonacci ───── */
const fb = creer('fibo', { t1: T0, p1: 100, t2: T0 + 10 * H4, p2: 200, unite }), F = fibo(fb);
v(F.dir === 1 && Math.abs(F.zone.haut - 150) < 1e-9 && Math.abs(F.zone.bas - 129.5) < 1e-9, 'zone 0,5–0,705 d’une impulsion haussière 100 → 200 : 129,5 à 150');
v(Math.abs(F.premium.haut - 138.2) < 1e-9 && Math.abs(F.premium.bas - 129.5) < 1e-9, 'sous-zone premium 0,618–0,705'); v(Math.abs(F.ligne382.prix - 161.8) < 1e-9, '0,382 en ligne fine : 161,8');
v(Math.abs(F.objectifs[0].prix - 227.2) < 1e-9 && Math.abs(F.objectifs[1].prix - 261.8) < 1e-9, 'objectifs 1,272 et 1,618 : 227,2 et 261,8'); v(F.invalidation === 100, '100 % = point de départ = invalidation');
const Fb = fibo(creer('fibo', { t1: T0, p1: 200, t2: T0 + 10 * H4, p2: 100, unite })); v(Fb.dir === -1 && Math.abs(Fb.zone.bas - 150) < 1e-9 && Math.abs(Fb.zone.haut - 170.5) < 1e-9 && Math.abs(Fb.objectifs[0].prix - 72.8) < 1e-9, 'impulsion baissière : zone symétrique, objectifs sous le creux');
v(Object.keys(F).sort().join() === 'A,B,dir,invalidation,ligne382,objectifs,premium,tA,tB,zone' && FIB.extensions.join() === '1.272,1.618', 'Fibonacci : seulement les niveaux demandés');
/* ancrage auto : zigzag creux (100) → sommet (160) */
const zig = []; for (let i = 0; i < 80; i++) { const p = i < 30 ? 130 - i : i < 55 ? 100 + (i - 30) * 2.4 : 160 - (i - 55) * 1.5; zig.push({ t: T0 + i * H4, o: p, h: p + 1, l: p - 1, c: p, v: 100 }); }
const an = ancrageAuto(zig); v(an && Math.abs(an.p1 - 99) < 3 && Math.abs(an.p2 - 161) < 3 && an.t1 < an.t2, 'ancrage auto : dernier creux majeur → sommet majeur : ' + JSON.stringify(an)); v(ancrageAuto(zig.slice(0, 20)) === null, 'ancrage auto : pas assez de bougies → rien');

/* ───── rebond confirmé ───── */
const reb = bougies(N, { 40: [102, 103, 99.5, 102.5, 300] }), e1 = evaluer(horiz(100), reb, { maintenant: apres(reb) });
v(e1.evenements.length === 1 && e1.evenements[0].type === 'rebond' && e1.evenements[0].dir === 1 && e1.evenements[0].t === T0 + 40 * H4, 'support : rebond confirmé (touche + clôture au-dessus + mèche + volume) : ' + JSON.stringify(e1.evenements.map(e => e.type)));
v(Math.abs(e1.evenements[0].volRatio - 3) < 1e-9 && e1.evenements[0].tFin === T0 + 41 * H4, 'volume ×3 et heure de clôture exacte');
v(e1.etat === 'touché', 'état « touché » après un rebond');
v(evaluer(horiz(100), bougies(N), { maintenant: apres(reb) }).etat === 'actif', 'état « actif » tant que le prix ne touche pas');
const faibleVol = bougies(N, { 40: [102, 103, 99.5, 102.5, 50] }); const ev0 = evaluer(horiz(100), faibleVol, { maintenant: apres(faibleVol) }); v(ev0.evenements.length === 0 && ev0.etat === 'touché', 'volume sous la moyenne : touché mais aucune flèche');
const sansMeche = bougies(N, { 40: [99.6, 103, 99.5, 102.5, 300] }); v(evaluer(horiz(100), sansMeche, { maintenant: apres(sansMeche) }).evenements.length === 0, 'sans mèche de rejet nette : aucune flèche');
const sansTouche = bougies(N, { 40: [103, 104, 100.6, 103.8, 300] }); v(evaluer(horiz(100), sansTouche, { maintenant: apres(sansTouche) }).evenements.length === 0, 'le prix ne touche pas le niveau : aucune flèche');
const mauvaisCote = bougies(N, { 40: [102, 103, 99.5, 99.8, 300] }); v(evaluer(horiz(100), mauvaisCote, { maintenant: apres(mauvaisCote) }).evenements.filter(e => e.type === 'rebond').length === 0, 'clôture sous le support : pas un rebond');
const sansVolume = bougies(N, { 40: [102, 103, 99.5, 102.5, 0] }, [105, 106, 104, 105, 0]); const rsv = evaluer(horiz(100), sansVolume, { maintenant: apres(sansVolume) }); v(rsv.evenements.length === 1 && rsv.evenements[0].volRatio === null && /volume indisponible/.test(libelle(rsv.evenements[0])), 'série sans volume : condition ignorée et dite');
/* résistance : rejet par le haut */
const res = bougies(N, { 40: [108, 110.5, 107.6, 108.2, 300] }, [103, 104, 102, 103, 100]); const er = evaluer(horiz(110), res, { maintenant: apres(res) }); v(er.evenements.length === 1 && er.evenements[0].dir === -1 && er.evenements[0].type === 'rebond', 'résistance : rejet confirmé (flèche vers le bas)');

/* ───── jamais pendant que la bougie se forme ───── */
const enCours = evaluer(horiz(100), reb, { maintenant: T0 + 40 * H4 + H4 / 2 }); v(enCours.evenements.length === 0, 'bougie en formation : aucune flèche (évaluation à la clôture seulement)');
v(evaluer(horiz(100), reb, { maintenant: T0 + 41 * H4 }).evenements.length === 1, 'à la clôture exacte : la flèche apparaît');

/* ───── une seule flèche par événement ───── */
const dbl = bougies(N, { 40: [102, 103, 99.5, 102.5, 300], 41: [101, 101.5, 100.8, 101, 100], 42: [101, 101.5, 99.6, 101.2, 300] }); v(evaluer(horiz(100), dbl, { maintenant: apres(dbl) }).evenements.length === 1, 'nouvelle touche sans éloignement de 1 ATR : pas de seconde flèche');
const dbl2 = bougies(N, { 40: [102, 103, 99.5, 102.5, 300], 41: [101, 101.5, 100.8, 101, 100], 42: [101, 101.5, 99.6, 101.2, 300], 43: [101.2, 104.5, 101, 104.3, 100], 44: [103, 103.5, 99.5, 102.8, 300] }), e2 = evaluer(horiz(100), dbl2, { maintenant: apres(dbl2) });
v(e2.evenements.length === 2 && e2.evenements.every(e => e.type === 'rebond'), 'après un éloignement d’au moins 1 ATR puis un retour : seconde flèche : ' + e2.evenements.length);

/* ───── cassure + retest ───── */
const cas = bougies(N, { 40: [104, 104.5, 96, 97, 300], 42: [98, 100.5, 97.8, 99, 120], 44: [98, 100.4, 97.5, 98.6, 120] }), ec = evaluer(horiz(100), cas, { maintenant: apres(cas) });
v(ec.evenements[0].type === 'cassure' && ec.evenements[0].dir === -1 && ec.evenements[0].t === T0 + 40 * H4, 'cassure confirmée : clôture sous le niveau d’au moins 0,25 ATR avec volume');
v(ec.evenements.length === 2 && ec.evenements[1].type === 'retest' && ec.evenements[1].dir === -1 && ec.evenements[1].t === T0 + 42 * H4, 'retest réussi de l’autre côté : seconde flèche, une seule par cassure : ' + ec.evenements.map(e => e.type).join());
v(ec.etat === 'retesté', 'état « retesté »');
const casSeule = bougies(N, { 40: [104, 104.5, 96, 97, 300] }); v(evaluer(horiz(100), casSeule, { maintenant: apres(casSeule) }).etat === 'cassé', 'état « cassé » tant que le retest n’a pas eu lieu');
const casFaible = bougies(N, { ...Object.fromEntries(Array.from({ length: 19 }, (_, k) => [41 + k, [99.8, 100.4, 99.2, 99.8, 100]])), 40: [104, 104.5, 99.7, 99.8, 300] }); v(evaluer(horiz(100), casFaible, { maintenant: apres(casFaible) }).evenements.length === 0, 'clôture sous le niveau de moins de 0,25 ATR : pas une cassure');
const sous = {}; for (let i = 41; i < N; i++) sous[i] = [97, 98, 96, 97, 100]; const casSansVol = bougies(N, { ...sous, 40: [104, 104.5, 96, 97, 60] }); v(evaluer(horiz(100), casSansVol, { maintenant: apres(casSansVol) }).evenements.length === 0, 'cassure sans volume : pas de flèche');
const casHaus = bougies(N, { 40: [96, 105, 95.5, 104, 300] }, [95, 96, 94, 95, 100]); const eh = evaluer(horiz(100), casHaus, { maintenant: apres(casHaus) }); v(eh.evenements.length === 1 && eh.evenements[0].dir === 1 && eh.evenements[0].type === 'cassure', 'cassure à la hausse d’une résistance : flèche vers le haut');

/* ───── boîte et trendline ───── */
const boite = creer('boite', { t1: T0 + 5 * H4, p1: 98, t2: T0 + 50 * H4, p2: 102, unite }), boiteReb = bougies(N, { 40: [104, 104.5, 100.5, 103.8, 300] }); const eb = evaluer(boite, boiteReb, { maintenant: apres(boiteReb) });
v(eb.evenements.length === 1 && eb.evenements[0].type === 'rebond' && eb.evenements[0].niveau === 102, 'boîte : le prix entre dans la boîte puis clôture au-dessus : rebond (niveau = bord de la boîte)');
const boiteCass = bougies(N, { 40: [103, 103.5, 94, 95, 300] }); v(evaluer(boite, boiteCass, { maintenant: apres(boiteCass) }).evenements[0].type === 'cassure', 'boîte : clôture sous le bas de la boîte : cassure');
const tr = creer('tendance', { t1: T0 + 5 * H4, p1: 100, t2: T0 + 55 * H4, p2: 110, unite }), vT = bande(tr, T0 + 40 * H4 + H4 / 2).bas, trB = bougies(N, { 40: [vT + 2.5, vT + 3, vT - 0.5, vT + 2.6, 300] }, [vT + 5 + 0, vT + 6, vT + 4, vT + 5, 100]);
const trB2 = bougies(N).map((b, i) => { const z = bande(tr, b.t + H4 / 2); const base = z ? z.bas : 100; return i === 40 ? { ...b, o: base + 2.5, h: base + 3, l: base - 0.5, c: base + 2.6, v: 300 } : { ...b, o: base + 5, h: base + 6, l: base + 4, c: base + 5 }; });
v(evaluer(tr, trB2, { maintenant: apres(trB2) }).evenements.filter(e => e.type === 'rebond' && e.dir === 1).length === 1, 'trendline montante : rebond confirmé sur la ligne');
/* ───── Fibonacci : rebond dans la zone, sans autre flèche ───── */
const fibB = bougies(N, {}, [105, 106, 104, 105, 100]).map((b, i) => { const p = i < 20 ? 100 + i * 5 : i < 38 ? 195 - (i - 20) * 3 : 141; return { ...b, o: p, h: p + 1.5, l: p - 1.5, c: p, v: 100 }; });
fibB[39] = { t: fibB[39].t, o: 143, h: 146, l: 134, c: 152, v: 300 }; fibB[40] = { ...fibB[40], o: 152, h: 160, l: 151, c: 158 };
const fb2 = creer('fibo', { t1: T0, p1: 100, t2: T0 + 19 * H4, p2: 200, unite }), efb = evaluer(fb2, fibB.slice(0, 41), { maintenant: apres(fibB.slice(0, 41)) });
v(efb.evenements.length === 1 && efb.evenements[0].type === 'rebond' && efb.evenements[0].dir === 1 && efb.evenements[0].niveau === fibo(fb2).zone.haut, 'Fibonacci : rebond confirmé dans la zone 0,5–0,705 : flèche dans le sens de l’impulsion : ' + JSON.stringify(efb.evenements.map(e => [e.type, e.niveau])));
const fibInv = fibB.slice(0, 41).map((b, i) => (i >= 39 ? { ...b, o: 120, h: 121, l: 95, c: 96, v: 300 } : b)); const einv = evaluer(fb2, fibInv, { maintenant: apres(fibInv) }); v(einv.invalide === true && einv.etat === 'cassé' && einv.evenements.every(e => e.type === 'rebond' && e.dir === 1) , 'Fibonacci : clôture sous le 100 % = invalidation (état cassé, jamais de flèche de cassure)');

/* ───── pas de regard vers l'avenir ───── */
const H100 = horiz(100), complet = evaluer(H100, dbl2, { maintenant: apres(dbl2) }).evenements.map(e => e.id);
let sansFutur = true; for (let k = 25; k <= dbl2.length; k++) { const pre = evaluer(H100, dbl2.slice(0, k), { maintenant: apres(dbl2.slice(0, k)) }).evenements.map(e => e.id); const attendu = complet.filter(id => +id.split('|')[2] <= dbl2[k - 1].t); if (pre.join() !== attendu.join()) { sansFutur = false; console.log('   écart à k=' + k, pre, attendu); break; } }
v(sansFutur, 'l’évaluation sur un préfixe donne exactement les mêmes événements (aucun regard vers l’avenir)');
v(JSON.stringify(evaluer(H100, dbl2, { maintenant: apres(dbl2) })) === JSON.stringify(evaluer(H100, dbl2, { maintenant: apres(dbl2) })), 'évaluation déterministe');

/* ───── fusion et textes ───── */
const fu = fusionnerEvenements([{ ...e2.evenements[0], vueLe: 5 }], e2.evenements); v(fu.length === 2 && fu[0].vueLe === 5, 'fusion : un événement déjà enregistré ne bouge pas (vueLe conservé), pas de doublon');
v(fusionnerEvenements(fu, e2.evenements).length === 2, 'fusion idempotente');
const ev = e1.evenements[0]; v(libelle(ev) === 'Rebond H4 confirmé · niveau 100 · volume ×3,0', 'libellé : ' + libelle(ev)); v(phrase('Or', horiz(100), ev) === 'Or : rebond H4 confirmé sur ton niveau 100 (volume ×3,0)', 'phrase annoncée : ' + phrase('Or', horiz(100), ev));
v(phrase('Or', tl, { ...ev, type: 'retest' }).includes('retest H4 réussi sur ta trendline'), 'phrase du retest');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
