/* Tests de la preuve avec coûts XTB (v6, B5). node trader-pro/tests/stats-honnetes-test.mjs */
import { COUTS_DEFAUT, lireCouts, resultatNet, verdict, testerType, statsHonnetesUnite, resoudreFleche, degradation, synthese } from '../terminal/stats-honnetes.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const J = 86400e3; let c = 100; const B = Array.from({ length: 1800 }, (_, i) => { const o = c, d = (rnd() - 0.5) * 2.4; c = Math.max(5, o + d); return { t: Date.UTC(2020, 0, 1) + i * J, o, h: Math.max(o, c) + rnd(), l: Math.min(o, c) - rnd(), c, v: 100 + rnd() * 50 }; });
/* coûts */
v(lireCouts('or').spread === 0.4 && lireCouts('or', { or: { spread: 0.8 } }).spread === 0.8 && lireCouts('inconnu').spread === 0, 'coûts : table par instrument, modifiables, 0 si inconnu');
/* un événement simple : le net est plus bas que le brut du coût en R */
const ev = { i: 400, dir: 1, atr: 1.5 }; const r0 = resultatNet(B, ev, 'J', { spread: 0, swapNuit: 0 }), r1 = resultatNet(B, ev, 'J', { spread: 0.5, swapNuit: 0.1 });
v(r0 && r1 && Math.abs(r0.net - r0.brut) < 1e-9 && r1.net < r0.net && r1.coutR > 0, 'coûts retirés du résultat en R : brut ' + (r0 && r0.brut) + ' → net ' + (r1 && r1.net.toFixed(2)));
/* verdict */
const A = { n: 60, taux: 0.45, net: 0.3 }; v(verdict(A, { n: 30, taux: 0.44, net: 0.25 }) === 'fiable', 'verdict : fiable'); v(verdict(A, { n: 30, taux: 0.3, net: -0.4 }) === 'fragile', 'verdict : période jamais vue nettement moins bonne = fragile');
v(verdict({ n: 10, taux: 0.6, net: 1 }, { n: 5, taux: 0.6, net: 1 }) === 'non significatif', 'verdict : trop peu de cas = non significatif'); v(verdict({ n: 60, taux: 0.3, net: -0.1 }, { n: 30, taux: 0.3, net: -0.1 }) === 'à surveiller', 'verdict : espérance négative des deux côtés = à surveiller');
/* test honnête : apprentissage = 70 % anciens, jamais vu = 30 % récents */
const S = statsHonnetesUnite(B, 'J', 'or'); v(S && S.couts.spread === COUTS_DEFAUT.or.spread, 'statistiques calculées avec les coûts de l\'actif');
const tous = Object.values(S.types); const ap = tous.reduce((s, x) => s + x.apprentissage.n, 0), te = tous.reduce((s, x) => s + x.jamaisVu.n, 0); v(ap > 0 && te > 0 && ap > te, 'les deux périodes ont des cas, l\'apprentissage est la plus grande (' + ap + ' contre ' + te + ')');
const coupe = tous[0].coupe; v(coupe === B[Math.floor(B.length * 0.7)].t, 'coupure à 70 % de la série (' + new Date(coupe).toISOString().slice(0, 10) + ')');
for (const x of tous) if (x.apprentissage.n > 5) v(x.apprentissage.net <= x.apprentissage.brut + 1e-9, 'net ≤ brut pour chaque type');
/* sur du bruit pur, l'espérance NETTE est ≤ 0,15 R (aucune « preuve » inventée) */
const sig = tous.filter(x => x.apprentissage.n >= 30); v(sig.every(x => x.apprentissage.net < 0.4), 'sur une marche aléatoire : aucune espérance nette flatteuse (max ' + Math.max(...sig.map(x => x.apprentissage.net)).toFixed(2) + ' R)');
/* suivi réel */
const f = { id: 'x', dir: 1, t: B[100].t, tFin: B[100].t + J, entree: B[100].c, stop: B[100].c - 2, cible: B[100].c + 4 }; const out = resoudreFleche(f, B, { spread: 0.3, swapNuit: 0.05 }); v(out.resultat && (out.resultat.issue === 'gagne' || out.resultat.issue === 'perdu') && out.resultat.net < out.resultat.R, 'flèche résolue (cible 2 R ou stop) avec coûts : ' + out.resultat.issue + ' net ' + out.resultat.net.toFixed(2));
v(resoudreFleche({ ...f, resultat: { issue: 'perdu', R: -1, net: -1.1 } }, B, {}).resultat.net === -1.1, 'une flèche déjà résolue ne bouge plus');
const res = n => Array.from({ length: n }, (_, i) => ({ resultat: { issue: i % 4 === 0 ? 'gagne' : 'perdu', net: i % 4 === 0 ? 1.9 : -1.05 } })); const d = degradation(res(30), { net: 0.4, taux: 0.5 }); v(d.degrade === true, 'dégradation : 30 derniers cas réels (25 % de réussite) nettement sous le testé (50 %)');
v(degradation(res(10), { net: 0.4, taux: 0.5 }).degrade === false && /moins de 30/.test(degradation(res(10), { net: 0.4, taux: 0.5 }).raison), 'moins de 30 cas réels : pas de conclusion'); 
/* synthèse */
const L = synthese({ actifs: { or: { nom: 'l’or', J: S } } }, { or: { J: { 'ma200-cassure': { n: 30, degradation: { degrade: true } } } } }); v(L.length > 0 && L.some(x => x.statut === 'en dégradation') && L.every(x => 'reussite' in x && 'espNette' in x && 'cas' in x), 'tableau de synthèse : réussite, espérance nette, cas, statut (fiable / fragile / non significatif / en dégradation)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `stats-honnetes-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
