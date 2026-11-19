/* Tests purs de la couverture. node trader-pro/tests/couverture-test.mjs */
import { corrPaire, matriceCorr, beta, stabilite, backtest, verdict, classerCouvertures, maxDrawdown, UNIVERS_COUV } from '../couverture/calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let graine = 12345; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296 - 0.5; };
const N = 700, jours = i => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
const bruit = Array.from({ length: N }, () => alea() * 0.04);   // rendements de X
const serie = r => { let p = 100; return r.map((x, i) => ({ d: jours(i), t: Date.UTC(2024, 0, 1 + i), c: (p *= Math.exp(x)) })); };
const X = bruit, Ypos = bruit.map(x => 0.8 * x + alea() * 0.008), Yneg = bruit.map(x => -1.2 * x + alea() * 0.008), Yind = Array.from({ length: N }, () => alea() * 0.04);
const S = { XAUUSD: serie(X), US100: serie(Ypos), BTC: serie(Yneg), SOL: serie(Yind), WTI: serie(Yind.map(x => x * 1.1)) };
const A = { id: 'XAUUSD', serie: S.XAUUSD }, B = { id: 'US100', serie: S.US100 }, C = { id: 'BTC', serie: S.BTC };
v(corrPaire(A, B, 250).r > 0.9, 'corrélation positive forte'); v(corrPaire(A, C, 250).r < -0.9, 'corrélation négative forte'); v(corrPaire(A, B, 30).n === 30, 'fenêtre de 30 jours');
const m = matriceCorr(S, ['XAUUSD', 'US100', 'BTC'], 90); v(m[0][0].r === 1 && m[0][1].r > 0.9 && m[1][2].r < -0.8, 'matrice : diagonale 1, signes'); v(Math.abs(m[0][1].r - m[1][0].r) < 1e-9, 'matrice symétrique');
v(Math.abs(beta(X, Ypos) - 1.2) < 0.2, 'bêta de X sur Y ≈ 1/0,8 : ' + beta(X, Ypos).toFixed(2));
v(stabilite(X, Ypos) > 0.9, 'stabilité d\'un lien réel élevée'); v(stabilite(X, Yind) == null || stabilite(X, Yind) < 0.9, 'stabilité d\'un lien nul pas élevée');
const bt = backtest(A, B, +1); v(bt && bt.reductionVol > 0.5, 'backtest : couverture par un actif corrélé réduit la vol de plus de 50 % (' + (bt && bt.reductionVol.toFixed(2)) + ')'); v(bt.couverte.length === bt.seule.length && bt.jours === 250, 'backtest : 250 jours');
const btI = backtest(A, { id: 'SOL', serie: S.SOL }, +1); v(btI.reductionVol < 0.1, 'backtest : un actif indépendant ne réduit presque rien (' + btI.reductionVol.toFixed(2) + ')');
const cher = backtest(A, B, +1, { spreadPct: 2, swapAnPct: 20 }); v(cher.finCouverte < bt.finCouverte, 'les coûts (spread, swap) réduisent le résultat couvert');
/* sens : achat de X, Y corrélé → couverture à la VENTE ; Z anti-corrélé → couverture à l'ACHAT */
const R = classerCouvertures(S, 'XAUUSD', +1, { notionnel: 10000 }), parId = Object.fromEntries(R.map(r => [r.id, r]));
v(R.length >= 3, 'plusieurs candidats classés'); v(parId.US100.sensCouverture === -1, 'actif corrélé : couverture dans le sens opposé'); v(parId.BTC.sensCouverture === +1, 'actif anti-corrélé : couverture dans le même sens');
v(Math.abs(parId.US100.tailleNotionnel - 10000 * Math.abs(parId.US100.beta)) < 1e-6, 'taille = |bêta| × notionnel');
v(R[0].id === 'US100' || R[0].id === 'BTC', 'les meilleurs candidats sont les liés : ' + R[0].id); v(['SOL', 'WTI'].every(id => parId[id].verdict.niveau === 'a-eviter'), 'indépendants : à éviter');
v(parId.US100.verdict.niveau === 'fiable' && parId.BTC.verdict.niveau === 'fiable', 'liens réels et stables : fiable');
const Rv = classerCouvertures(S, 'XAUUSD', -1); v(Rv.find(r => r.id === 'US100').sensCouverture === +1, 'vente de X : couverture corrélée à l\'achat');
v(!R.some(r => r.id === 'XAUUSD'), 'X ne se couvre pas par lui-même'); v(classerCouvertures({}, 'XAUUSD', 1).length === 0, 'sans série : aucun candidat (rien d\'inventé)');
v(verdict({ r250: 0.1, stab: 0.9, p: 0.5, reductionVol: 0.01 }).niveau === 'a-eviter', 'verdict : lien faible'); v(verdict({ r250: 0.7, stab: 0.6, p: 0.001, reductionVol: 0.4 }).niveau === 'fragile', 'verdict : instable = fragile');
v(maxDrawdown([0, 5, 3, 8, 2, 9]) === -6, 'drawdown max'); v(UNIVERS_COUV.every(a => a.id && a.court && a.nom), 'univers complet');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
