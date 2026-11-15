/* Tests du moteur de signaux H4 / Jour. node trader-pro/tests/signaux-hj-test.mjs */
import { signaux, simuler, statistiques, PARAMS } from '../terminal/signaux-hj.js';
import { sma, atr } from '../commun/analyse.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let graine = 99; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
const J0 = Date.UTC(2020, 0, 1), JOUR = 86400e3;
/* série journalière : tendance haussière avec vagues (pour avoir des pivots, des rebonds et des cassures) */
function marche(n, pente = 0.05, vol = 1.2) { const B = []; let p = 100; for (let i = 0; i < n; i++) { const o = p, vague = Math.sin(i / 7) * 1.5; p = Math.max(5, p + pente + vague * 0.35 + alea() * vol); const h = Math.max(o, p) + Math.abs(alea()) * vol * 0.8, l = Math.min(o, p) - Math.abs(alea()) * vol * 0.8; B.push({ t: J0 + i * JOUR, o, h, l, c: p }); } return B; }
const jour = marche(1400), S = signaux(jour, jour, 'J');
v(S.length >= 5 && S.length < 200, 'des signaux Jour, en nombre raisonnable : ' + S.length + ' sur 1400 jours (' + (S.length / 1400 * 30).toFixed(1) + ' par mois)');
const m200 = sma(jour.map(b => b.c), 200);
v(S.every(s => (s.dir === 1 ? jour[s.i].c > m200[s.i] : jour[s.i].c < m200[s.i])), 'biais : jamais d\'achat sous la MA200 J ni de vente au-dessus');
v(S.every(s => (s.dir === 1 ? s.sl < s.entree && s.entree < s.tp : s.sl > s.entree && s.entree > s.tp)), 'géométrie : stop, entrée, objectif dans le bon ordre'); v(S.every(s => s.rr >= PARAMS.rrMin - 1e-9 && s.rr <= PARAMS.rrMax + 1e-9 || !s.objectifNiveau && Math.abs(s.rr - PARAMS.rrDefaut) < 0.05), 'objectif : entre 2 et 6 R (ou 3 R par défaut)');
v(S.every(s => s.risque >= PARAMS.risqueMin * s.atr - 1e-6 && s.risque <= PARAMS.risqueMax * s.atr + 1e-6), 'risque entre 0,5 et 3 ATR');
v(S.every(s => ['rebond niveau', 'rebond MA200', 'cassure + retest'].includes(s.type) && s.tCloture === s.t + JOUR), 'types connus ; signal à la clôture de la bougie');
const par = {}; for (const s of S) { const k = s.dir; if (par[k] != null && s.i - par[k] < PARAMS.delai.J) v(false, 'délai minimal non respecté'); par[k] = s.i; } v(true, 'délai minimal entre deux signaux de même sens');
/* non-redessin : les signaux d'un historique tronqué sont exactement les premiers de l'historique complet */
let nonRedessin = true; for (const cut of [600, 800, 1000, 1200]) { const A = signaux(jour.slice(0, cut), jour.slice(0, cut), 'J'), B = S.filter(s => s.i < cut - 1); for (let k = 0; k < A.length; k++) { const a = A[k], b = B.find(x => x.i === a.i && x.dir === a.dir); if (!b || Math.abs(a.sl - b.sl) > 1e-9 || Math.abs(a.tp - b.tp) > 1e-9 || a.type !== b.type) nonRedessin = false; } if (A.length !== B.length) nonRedessin = false; } v(nonRedessin, 'AUCUN signal ne se redessine quand de nouvelles bougies arrivent');
v(signaux(jour.slice(0, 120), jour.slice(0, 120), 'J').length === 0, 'trop peu de bougies : aucun signal');
/* H4 : 6 bougies par jour */
const h4 = []; for (const b of jour) { let p = b.o; for (let k = 0; k < 6; k++) { const c = k === 5 ? b.c : b.o + (b.c - b.o) * (k + 1) / 6 + alea() * 0.4, o = p; h4.push({ t: b.t + k * 4 * 3600e3, o, h: Math.max(o, c) + Math.abs(alea()) * 0.3, l: Math.min(o, c) - Math.abs(alea()) * 0.3, c }); p = c; } }
const S4 = signaux(h4, jour, 'H4'); v(S4.length > S.length / 2, 'des signaux H4 aussi : ' + S4.length); v(S4.every(s => s.tCloture === s.t + 4 * 3600e3), 'H4 : signal à la clôture de la bougie H4');
v(S4.every(s => { const jr = jour.filter(b => b.t + JOUR <= s.tCloture).pop(); const m = sma(jour.map(b => b.c), 200)[jour.indexOf(jr)]; return s.dir === 1 ? jr.c > m : jr.c < m; }), 'H4 : biais donné par le dernier Jour CLÔTURÉ');
/* simulation */
const T = simuler(jour, S), st = statistiques(T); v(T.length > 0 && T.length <= S.length, 'simulation : ' + T.length + ' trades pour ' + S.length + ' signaux'); v(T.every(t => t.tEntree === jour[t.i + 1].t && t.entreeReelle === jour[t.i + 1].o), 'entrée à l\'ouverture de la bougie SUIVANTE (jamais à la clôture du signal)');
v(T.every(t => ['stop', 'objectif', 'durée'].includes(t.raison)), 'sorties connues'); v(T.filter(t => t.raison === 'objectif').every(t => t.r > 0) && T.filter(t => t.raison === 'stop').every(t => t.r <= 0.0001), 'objectif = gain, stop = perte');
const cher = statistiques(simuler(jour, S, { cout: 1 })); v(cher.rTotal < st.rTotal, 'les coûts réduisent le résultat'); v(st.winRate >= 0 && st.winRate <= 1 && st.courbe.length === T.length, 'statistiques');
/* stop prioritaire quand stop et objectif sont touchés dans la même bougie */
const mini = jour.slice(0, 300).map(b => ({ ...b })); const sig = { i: 100, t: mini[100].t, dir: 1, entree: mini[100].c, sl: mini[101].o - 2, tp: mini[101].o + 2, risque: 2, tf: 'J' }; mini[101] = { ...mini[101], h: mini[101].o + 5, l: mini[101].o - 5 }; v(simuler(mini, [sig])[0].raison === 'stop', 'stop et objectif dans la même bougie : le stop passe en premier (prudence)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
