/* Tests purs : analyse technique, COT, calendrier, séries. node trader-pro/tests/analyse-test.mjs */
import { sma, ema, rsi, atr, regrouper, enH4, tendance, niveauxCles, etalerEtiquettes, correlation, H, serieSma, projeter, fusionnerNiveaux } from '../commun/analyse.js';
import { depuisSnapshotJour, rendementsCommuns, corrFenetre, glissante, significativite, matrice, corrActifTaux } from '../commun/series.js';
import { indexCot, analyserCot, lectureCot } from '../marches/cot.js';
import { nombre, surprise, filtrer, lireEvenements, compteARebours } from '../marches/calendrier.js';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/* sma / ema / rsi */
const s = sma([1, 2, 3, 4, 5], 3); v(s[0] === null && s[1] === null && s[2] === 2 && s[4] === 4, 'sma 3');
v(ema([1, 2, 3, 4, 5], 3)[4] > 3.5 && ema([1, 2, 3, 4, 5], 3)[1] === null, 'ema');
const montee = Array.from({ length: 30 }, (_, i) => 100 + i); v(rsi(montee, 14)[29] === 100, 'rsi tout haussier = 100');
const alt = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : -1)); const r = rsi(alt, 14)[59]; v(r > 40 && r < 60, 'rsi alterné ~50 : ' + r);
v(rsi([1, 2, 3], 14).every(x => x === null), 'rsi trop court = null');
/* atr */
const Bp = Array.from({ length: 30 }, (_, i) => ({ t: i * H, o: 100, h: 102, l: 98, c: 100, v: 1 })); v(proche(atr(Bp, 14)[29], 4), 'atr constant = 4');
/* regroupement H4 ancré à 22 h UTC */
const base = Date.UTC(2026, 10, 9, 22); const B1 = Array.from({ length: 8 }, (_, i) => ({ t: base + i * H, o: i, h: i + 1, l: i - 1, c: i + 0.5, v: 1 }));
const h4 = enH4(B1, base + 100 * H); v(h4.length === 2 && h4[0].t === base && h4[0].o === 0 && h4[0].c === 3.5 && h4[0].h === 4 && h4[0].l === -1 && h4[1].t === base + 4 * H, 'enH4 : 2 bougies, valeurs OHLC');
v(h4[0].enCours === false, 'bougie close non « en cours »'); v(enH4(B1, base + 5 * H)[1].enCours === true, 'dernière bougie en cours');
const trou = [{ t: base, o: 1, h: 2, l: 0, c: 1, v: 1 }, { t: base + 60 * H, o: 5, h: 6, l: 4, c: 5, v: 1 }]; v(enH4(trou, base + 99 * H).length === 2, 'un trou ne crée pas de bougie vide');
/* tendance */
const hausse = Array.from({ length: 260 }, (_, i) => ({ t: i * H, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 1 })); v(tendance(hausse).sens === 'haussière' && tendance(hausse).ma200 != null, 'tendance haussière avec MA200');
const baisse = hausse.map(b => ({ ...b, c: 400 - (b.c - 100), h: 401 - (b.c - 100), l: 399 - (b.c - 100) })); v(tendance(baisse).sens === 'baissière', 'tendance baissière');
v(tendance(hausse.slice(0, 40)).sens === 'indéterminée', 'trop peu de bougies = indéterminée');
/* niveaux clés : un double sommet à 120 et un double creux à 90 sur un range */
const rng = []; for (let i = 0; i < 300; i++) { const p = 105 + 15 * Math.sin(i / 8); rng.push({ t: i * H, o: p, h: p + 1, l: p - 1, c: p, v: 1 }); }
const nv = niveauxCles(rng); v(nv.resistances.length >= 1 && nv.supports.length >= 1, 'niveaux : au moins un de chaque côté');
v(nv.resistances.length <= 3 && nv.supports.length <= 3, 'niveaux : 3 maximum de chaque côté');
const tous = [...nv.resistances, ...nv.supports].sort((a, b) => a.prix - b.prix); v(tous.every((x, i) => i === 0 || x.prix - tous[i - 1].prix >= nv.atr * 0.99), 'niveaux séparés d\'au moins 1 ATR');
const dec = etalerEtiquettes([{ prix: 100 }, { prix: 100.1 }, { prix: 100.2 }], 100, 16); v(dec.length === 3, 'étaler : 3 décalages');
const pos = [100, 100.1, 100.2].map((p, i) => -p * 100 + dec[i]).sort((a, b) => a - b); v(pos.every((y, i) => i === 0 || y - pos[i - 1] >= 15.99), 'étiquettes jamais chevauchées');
/* corrélation */
v(proche(correlation([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12]), 1), 'corrélation +1'); v(proche(correlation([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1]), -1), 'corrélation −1'); v(correlation([1, 2], [1, 2]) === null, 'corrélation : trop peu de points');
/* séries */
const mk = (f, n = 80) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), t: Date.UTC(2026, 0, 1 + i), c: f(i) }));
const A = mk(i => 100 * Math.exp(0.01 * i + 0.05 * Math.sin(i))), Bn = mk(i => 50 * Math.exp(0.02 * i + 0.1 * Math.sin(i))), Cn = mk(i => 80 * Math.exp(-0.02 * i - 0.1 * Math.sin(i)));
v(corrFenetre(A, Bn, 60).r > 0.99, 'actifs liés : corr > 0,99'); v(corrFenetre(A, Cn, 60).r < -0.99, 'actifs opposés : corr < −0,99');
const sansJour = A.filter((_, i) => i !== 40); v(rendementsCommuns(sansJour, Bn).ra.length === 78, 'jour manquant : rendement sur l’intervalle commun aux deux séries (aucune valeur inventée)');
v(glissante(A, Bn, 30).length > 40 && glissante(A, Bn, 30).every(x => x.r > 0.9), 'corrélation glissante'); v(matrice({ a: A, b: Cn }, ['a', 'b'], 30)[0][1].r < -0.9, 'matrice');
const sg = significativite(0.9, 60); v(sg.p < 0.001 && sg.ic[0] > 0.8 && sg.ic[1] < 0.96, 'significativité forte'); const sf = significativite(0.05, 60); v(sf.p > 0.5 && sf.ic[0] < 0 && sf.ic[1] > 0, 'significativité faible');
v(depuisSnapshotJour({ b: [[Date.UTC(2026, 0, 2), 10, 11], [Date.UTC(2026, 0, 2, 5), 10, 12], [Date.UTC(2026, 0, 3), 0, 0]] }).length === 1, 'snapshot jour : doublon fusionné, zéro rejeté');
/* projection sans regarder le futur */
const gros = [{ t: 0, v: 10 }, { t: 4 * H, v: 20 }, { t: 8 * H, v: 30 }], fins = Array.from({ length: 12 }, (_, i) => ({ t: i * H }));
const pj = projeter(gros, 4 * H, fins); v(pj.length === 8 && pj[0].t === 4 * H && pj[0].v === 10, 'projeter : rien avant la fermeture de la 1re grande bougie'); v(pj.find(p => p.t === 8 * H).v === 20 && pj.find(p => p.t === 7 * H).v === 10, 'projeter : la valeur de la bougie en cours n’est jamais utilisée');
v(serieSma(hausse, 200).length === 61, 'serieSma : 61 points sur 260 bougies'); v(fusionnerNiveaux([[{ prix: 100 }], [{ prix: 100.5 }, { prix: 110 }]], 1).length === 2, 'fusion de niveaux proches');
const taux = mk(i => 4 + 0.01 * i + 0.02 * Math.sin(i)), orInv = mk(i => 1000 * Math.exp(-(0.01 * i + 0.02 * Math.sin(i)) * 3));
v(corrActifTaux(orInv, taux, 60).r < -0.9, 'or contre variation du taux réel : corrélation négative'); 
/* COT */
const serie = Array.from({ length: 200 }, (_, i) => ({ date: new Date(Date.UTC(2023, 0, 3 + 7 * i)).toISOString().slice(0, 10), oi: 1000 + i, spec: { long: 0, court: 0, net: i < 199 ? Math.round(100 * Math.sin(i / 10)) : 400 }, comm: { long: 0, court: 0, net: -i } }));
const ix = indexCot(serie.map(x => x.spec.net)); v(ix[10] === null && ix[60] !== null, 'COT index : null avant 52 semaines'); v(ix[199] === 100, 'COT index : 100 au plus haut');
const an = analyserCot({ inst: 'OR', libelle: 'Or', nomSpec: 'Fonds', nomComm: 'Commerciaux', serie }); v(an.dernier.extremeSpec === 'haut' && an.barres[199].spec === 400 - serie[198].spec.net, 'COT : extrême haut et variation hebdo');
v(/extrême acheteur/.test(lectureCot(an, 'l’or')), 'COT : lecture en clair'); v(analyserCot({ serie: [] }) === null, 'COT vide = null');
/* calendrier */
v(nombre('2.6%') === 2.6 && nombre('225K') === 225000 && nombre('-0.14%') === -0.14 && nombre('') === null && nombre('abc') === null, 'nombre()');
v(surprise({ titre: 'CPI m/m', prevu: '0.3%', actuel: '0.4%' }).sens === 'mieux', 'surprise haussière'); v(surprise({ titre: 'Unemployment Rate', prevu: '4.2%', actuel: '4.4%' }).sens === 'moins bien', 'chômage plus haut = moins bien');
v(surprise({ titre: 'x', prevu: '', actuel: '1' }) === null, 'surprise sans prévu = null');
const ev = lireEvenements({ evenements: [{ title: 'A', country: 'USD', date: '2026-11-16T08:30:00-05:00', impact: 'High', forecast: '1', previous: '2' }, { title: 'B', country: 'JPY', date: '2026-11-16T08:30:00-05:00', impact: 'High' }, { title: 'C', country: 'USD', date: '2026-11-16T09:00:00-05:00', impact: 'Low' }] });
v(ev.length === 3 && ev[0].impact === 'fort', 'événements lus'); v(filtrer(ev, { impacts: ['fort'], actif: 'or', maintenant: ev[0].t - 1e6 }).length === 1, 'filtre impact + actif (devise USD)');
v(compteARebours(1000 + 3 * 3600e3 + 5 * 60e3, 1000) === '3 h 05 min', 'compte à rebours');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
