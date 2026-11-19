/* Tests purs des statistiques de flèches. node trader-pro/tests/stats-fleches-test.mjs */
import { simuler, agreger, mediane, statsUnite, phraseStats, evenementsMA200, evenementsNiveaux, evenementsFibo, TYPES_STATS, PARAMS_STATS } from '../terminal/stats-fleches.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H4 = 4 * 3600e3, T0 = Date.UTC(2024, 0, 1);
const mk = (n, f) => Array.from({ length: n }, (_, i) => { const [o, h, l, c, vol] = f(i); return { t: T0 + i * H4, o, h, l, c, v: vol ?? 100 }; });
/* signal à l'indice 5 : achat à 100, mèche basse à 98 (risque 2, ATR 1 < 2) → stop 98, cible 104 */
const base = (apres) => mk(140, i => (i === 5 ? [99, 101, 98, 100] : i > 5 ? apres(i - 5) : [100, 100.5, 99.5, 100]));
let B = base(k => (k < 4 ? [100, 100.5, 99.5, 100.2] : [100.2, 104.5, 100, 104]));
let s = simuler(B, 5, 1, 1); v(s.issue === 'gagne', 'cible à 2 R atteinte avant le stop : gagné');
B = base(k => (k < 3 ? [100, 100.5, 99.5, 100] : k === 3 ? [100, 100.2, 97.5, 98.5] : [100, 105, 99.9, 104])); s = simuler(B, 5, 1, 1); v(s.issue === 'perdu', 'stop touché avant la cible : perdu');
B = base(k => (k === 2 ? [100, 105, 97, 100] : [100, 100.4, 99.6, 100])); s = simuler(B, 5, 1, 1); v(s.issue === 'perdu', 'stop et cible dans la même bougie : le stop d’abord (hypothèse prudente)');
B = base(() => [100, 100.4, 99.6, 100.1]); s = simuler(B, 5, 1, 1); v(s.issue === 'expire' && Math.abs(s.R[10] - 0.05) < 1e-9 && Math.abs(s.R[20] - 0.05) < 1e-9, 'ni stop ni cible en 100 bougies : expiré ; R à 10 et 20 bougies = (clôture − entrée) / risque');
B = base(k => (k === 3 ? [100, 100.2, 97.5, 98.5] : [100, 100.4, 99.6, 101])); s = simuler(B, 5, 1, 1); v(s.R[10] === -1 && s.R[20] === -1, 'stop touché avant l’échéance : −1 R à 10 et 20 bougies');
/* distance de stop : au moins 1 ATR */
B = base(() => [100, 100.4, 99.6, 100]); B[5] = { ...B[5], l: 99.8 }; s = simuler(B, 5, 1, 1.5); B[6] = { ...B[6], l: 98.5, h: 100.1, c: 99 }; const s2 = simuler(B, 5, 1, 1.5); v(s2.issue === 'perdu', 'mèche à 0,2 mais ATR 1,5 : le stop est à 1,5 du prix d’entrée (touché par 98,5)');
/* vente : symétrique */
const vente = mk(140, i => (i === 5 ? [101, 102, 99, 100] : i > 5 && i < 9 ? [100, 100.3, 99.7, 99.9] : i === 9 ? [100, 100.1, 95.5, 96] : [100, 100.4, 99.6, 100])); v(simuler(vente, 5, -1, 1).issue === 'gagne', 'vente : cible 2 R sous le prix');
/* données trop récentes */
const court = mk(12, () => [100, 100.5, 99.5, 100]); v(simuler(court, 5, 1, 1).issue === 'ouvert' && simuler(court, 5, 1, 1).R[20] === undefined, 'bougies manquantes : « ouvert », R à 20 bougies absent (pas inventé)');
/* agrégation */
const Bg = mk(300, i => [100, 100.5, 99.5, 100]); for (const i of [10, 60, 110]) { Bg[i] = { ...Bg[i], l: 98, c: 100 }; Bg[i + 2] = { ...Bg[i + 2], h: 104.5 }; } Bg[160] = { ...Bg[160], l: 98 }; Bg[162] = { ...Bg[162], l: 97 };
const ag = agreger(Bg, [10, 60, 110, 160, 220].map(i => ({ i, dir: 1, atr: 1 })));
v(ag.n === 5 && ag.gagnes === 3 && ag.perdus === 1 && ag.nonResolus === 1 && Math.abs(ag.taux - 0.75) < 1e-9, 'agrégation : 3 gagnés, 1 perdu, 1 non résolu → taux 75 % sur les cas résolus : ' + JSON.stringify([ag.n, ag.gagnes, ag.perdus, ag.nonResolus, ag.taux]));
v(Math.abs(ag.esperance - 1.25) < 1e-9, 'espérance en R : (3 × 2 − 1) / 4 = 1,25');
v(ag.significatif === false, 'moins de 30 cas : non significatif');
v(mediane([1, 3, 2]) === 2 && mediane([1, 2, 3, 4]) === 2.5 && mediane([]) === null && mediane([null, 4]) === 4, 'médiane');
/* phrases */
v(phraseStats('l’or', 'H4', { n: 142, taux: 0.58, rMed20: 0.9 }) === 'Historique de ce type de flèche sur l’or H4 : 58 % · +0,9 R médian (20 bougies) · 142 cas', 'phrase : ' + phraseStats('l’or', 'H4', { n: 142, taux: 0.58, rMed20: 0.9 }));
v(/non significatif/.test(phraseStats('l’or', 'J', { n: 12, taux: 0.8, rMed20: 1 })) && /12 cas seulement/.test(phraseStats('l’or', 'J', { n: 12, taux: 0.8, rMed20: 1 })), 'moins de 30 cas : « non significatif »');
v(/−0,4 R/.test(phraseStats('Solana', 'J', { n: 50, taux: 0.3, rMed20: -0.4 })) && /Jour/.test(phraseStats('Solana', 'J', { n: 50, taux: 0.3, rMed20: -0.4 })), 'R médian négatif avec le vrai signe moins ; « Jour »');
v(/aucun cas/.test(phraseStats('l’or', 'H4', { n: 0 })), 'aucun cas');
/* chaîne complète sur une série synthétique (tendances et corrections) */
let g = 7; const al = () => { g = (g * 1664525 + 1013904223) % 4294967296; return g / 4294967296 - 0.5; };
let px = 1000; const serie = []; for (let i = 0; i < 3000; i++) { const reg = Math.sin(i / 160) * 0.6 + al() * 0.8; const o = px; px = Math.max(10, px + reg * 4); const h = Math.max(o, px) + Math.abs(al()) * 3, l = Math.min(o, px) - Math.abs(al()) * 3; serie.push({ t: T0 + i * H4, o, h, l, c: px, v: 100 + Math.abs(al()) * 200 }); }
const st = statsUnite(serie, 'H4'); v(st && st.bougies === 3000 && TYPES_STATS.every(t => st.types[t.id] && st.types[t.id].n >= 0), 'statistiques calculées pour les 5 types');
v(st.types['ma200-cassure'].n >= 2 && st.types['ma200-rebond'].n >= 1 && st.types['niveau-rebond'].n >= 1 && st.types['niveau-cassure'].n >= 1, 'des flèches de chaque famille existent sur la série : ' + TYPES_STATS.map(t => t.id + '=' + st.types[t.id].n).join(' '));
for (const t of TYPES_STATS) { const x = st.types[t.id]; v(x.taux == null || (x.taux >= 0 && x.taux <= 1), t.id + ' : taux entre 0 et 1'); v(x.resolus + x.nonResolus === x.n, t.id + ' : gagnés + perdus + non résolus = total'); }
v(JSON.stringify(statsUnite(serie, 'H4')) === JSON.stringify(st), 'déterministe');
v(statsUnite(serie.slice(0, 100), 'H4') === null, 'moins de 260 bougies : pas de statistiques');
/* aucun regard vers l'avenir : les événements d'un préfixe sont les mêmes que ceux du début de la série complète */
const e1 = evenementsNiveaux(serie.slice(0, 1500), 'H4')['niveau-rebond'].filter(x => x.i < 1000).map(x => x.i + ':' + x.dir).join(), e2 = evenementsNiveaux(serie, 'H4')['niveau-rebond'].filter(x => x.i < 1000).map(x => x.i + ':' + x.dir).join();
v(e1 === e2 && e1.length > 0, 'niveaux simulés : mêmes flèches sur un préfixe et sur la série entière (pas de regard vers l’avenir)');
const f1 = evenementsFibo(serie.slice(0, 1500), 'H4')['fibo-rebond'].filter(x => x.i < 1000).map(x => x.i + ':' + x.dir).join(), f2 = evenementsFibo(serie, 'H4')['fibo-rebond'].filter(x => x.i < 1000).map(x => x.i + ':' + x.dir).join();
v(f1 === f2, 'Fibonacci simulé : même propriété');
const m1 = evenementsMA200(serie.slice(0, 1500), 'H4')['ma200-cassure'].filter(x => x.i < 1000).map(x => x.i + ':' + x.dir).join(), m2 = evenementsMA200(serie, 'H4')['ma200-cassure'].filter(x => x.i < 1000).map(x => x.i + ':' + x.dir).join(); v(m1 === m2 && m1.length > 0, 'MA200 : même propriété');
v(PARAMS_STATS.cible === 2 && PARAMS_STATS.minSignificatif === 30 && PARAMS_STATS.horizons.join() === '10,20', 'paramètres : cible 2 R, seuil 30 cas, horizons 10 et 20 bougies');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
