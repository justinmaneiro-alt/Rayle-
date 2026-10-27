import { phi, phiInv, moments, sharpeHasard, sharpeDeflate, intervalleEsperance } from '../pc/agent-btc/stats-m5.js';
import { CRITERES, empreinteCriteres } from '../pc/agent-btc/criteres.js';
import { CRITERES2, avancement, lignesM5 } from '../pc/agent-btc/criteres-v2.js';
import { alea } from '../pc/mars-calcul.js';
let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const somme = x => x.reduce((s, y) => s + y, 0);

v('phi(0)=0,5', proche(phi(0), 0.5, 1e-7)); v('phi(1,96)≈0,975', proche(phi(1.96), 0.975, 1e-4)); v('phiInv(0,975)≈1,96', proche(phiInv(0.975), 1.959964, 1e-5));
v('phiInv inverse de phi', [0.01, 0.2, 0.5, 0.9, 0.999].every(p => proche(phi(phiInv(p)), p, 1e-6)));
const s10 = sharpeHasard(10, 1 / 150), s1000 = sharpeHasard(1000, 1 / 150), s1e5 = sharpeHasard(100000, 1 / 150);
v('seuil du hasard croît avec le nombre de variantes', s10 < s1000 && s1000 < s1e5, [s10, s1000, s1e5].join());
v('N=1 → pas de correction', sharpeHasard(1, 0.01) === 0);
// stratégie « chanceuse » : la meilleure de 3000 stratégies sans aucun avantage
const a = alea(7), gauss = () => { let s = 0; for (let i = 0; i < 12; i++) s += a(); return s - 6; };
let meilleur = null, srMax = -Infinity;
for (let k = 0; k < 3000; k++) { const R = Array.from({ length: 150 }, () => gauss()); const m = moments(R); const sr = m.moy / m.sigma; if (sr > srMax) { srMax = sr; meilleur = R; } }
const dChance = sharpeDeflate(meilleur, 3000), dSeul = sharpeDeflate(meilleur, 1);
v('la meilleure de 3000 stratégies sans avantage paraît bonne seule (DSR N=1 > 95 %)', dSeul.dsr > 0.95, dSeul.dsr);
v('mais le Sharpe déflaté (N=3000) la démasque (< 95 %)', dChance.dsr < 0.95, dChance.dsr);
const vrai = Array.from({ length: 400 }, () => 0.3 + gauss());
v('une vraie stratégie (+0,3 R × 400) survit à 3000 variantes', sharpeDeflate(vrai, 3000).dsr > 0.95, sharpeDeflate(vrai, 3000).dsr);
v('plus de variantes = DSR plus bas', sharpeDeflate(vrai, 100000).dsr <= sharpeDeflate(vrai, 100).dsr);
v('trop peu de trades → null', sharpeDeflate([1, -1, 2], 10).dsr === null);
const ic = intervalleEsperance(vrai); v('IC contient la moyenne, bonne largeur', ic.bas < ic.moy && ic.moy < ic.haut && proche(ic.haut - ic.bas, 2 * 1.96 / Math.sqrt(400), 0.03), JSON.stringify(ic));
// critères : v1 intacte, v2 ne fait que durcir
v('critères v1 inchangés (empreinte c9995253)', empreinteCriteres(CRITERES) === 'c9995253', empreinteCriteres(CRITERES));
v('v2 : version 2, empreinte différente', CRITERES2.version === 2 && empreinteCriteres(CRITERES2) !== empreinteCriteres(CRITERES));
const plusStrict = (k, a1, b1) => (['drawdownMaxR', 'parSemaineMax', 'concentrationMax'].includes(k) ? b1 <= a1 : b1 >= a1);
v('v2 : chaque seuil hors échantillon est au moins aussi strict que v1', Object.keys(CRITERES.horsEchantillon).every(k => plusStrict(k, CRITERES.horsEchantillon[k], CRITERES2.horsEchantillon[k])));
v('v2 : robustesse, Monte Carlo, comparaisons, jeu final identiques à v1', JSON.stringify([CRITERES2.robustesse, CRITERES2.monteCarlo, CRITERES2.comparaisonsMultiples, CRITERES2.jeuFinal]) === JSON.stringify([CRITERES.robustesse, CRITERES.monteCarlo, CRITERES.comparaisonsMultiples, CRITERES.jeuFinal]));
v('v2 est gelée', Object.isFrozen(CRITERES2) && Object.isFrozen(CRITERES2.objectif));
v('espérance minimale conservée à +0,25 R', CRITERES2.horsEchantillon.esperanceMin === 0.25);
const av = avancement({ Rtotal: 14, n: 120 }); v('avancement « +14,0 R sur 120 trades, objectif… »', av.texte.startsWith('+14,0 R sur 120 trades, objectif +20 R sur 150 trades') && av.echantillonInsuffisant && !av.atteint, av.texte);
v('avancement atteint / haut', avancement({ Rtotal: 25, n: 160 }).atteint && !avancement({ Rtotal: 25, n: 160 }).hautAtteint && avancement({ Rtotal: 31, n: 160 }).hautAtteint);
const L = lignesM5({ trades: vrai.map(R => ({ R })), stats: { n: 400, Rtotal: somme(vrai) } }, 3000);
v('lignes M5 : 4 lignes, une vraie stratégie passe', L.lignes.length === 4 && L.lignes.every(l => l.ok), JSON.stringify(L.lignes.map(l => [l.critere.slice(0, 20), l.ok])));
const L2 = lignesM5({ trades: meilleur.map(R => ({ R })), stats: { n: 150, Rtotal: somme(meilleur) } }, 3000);
v('lignes M5 : la chanceuse échoue', L2.lignes.some(l => !l.ok));
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
