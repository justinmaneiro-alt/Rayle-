/* Tests purs des contrôles qualité de la nuit (v6, B2). node trader-pro/tests/controle-qualite-test.mjs */
import { controlerBougies, controlerCoherence, controlerCalendriers, persistance, rapport } from '../commun/controle-qualite.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.now() - 200 * H;
const serie = (n, f = i => 100 + Math.sin(i / 5) * 2) => Array.from({ length: n }, (_, i) => { const c = f(i); return [T0 + i * H, c - 0.1, c + 1, c - 1, c, 10]; });
v(controlerBougies('bougies-X-1h.json', { b: serie(150) }, { unite: '1h', actif: 'or' }).length === 0, 'série saine : aucun problème');
v(controlerBougies('f', { b: [] }).some(p => p.type === 'vide' && p.gravite === 'grave'), 'fichier vide : grave');
const S1 = serie(150); S1[148] = [S1[148][0], 150, 151, 149, 150, 1]; S1[149] = [S1[149][0], 100, 101, 99, 100, 1];
const P1 = controlerBougies('f', { b: S1 }, { unite: '1h', actif: 'or' }); v(P1.some(p => p.type === 'aberrant' && p.gravite === 'grave'), 'saut aberrant sur les dernières bougies : grave (' + P1.map(p => p.type).join() + ')');
const S2 = serie(150); S2[20] = [S2[20][0], 300, 301, 299, 300, 1]; S2[21] = S2[21]; const P2 = controlerBougies('f', { b: S2 }, { unite: '1h', actif: 'or', recentes: 48 }); v(P2.some(p => p.type === 'aberrant' && p.gravite === 'info'), 'saut ancien : simple information');
const S3 = serie(150); S3.push(S3[10]); v(controlerBougies('f', { b: S3 }, { unite: '1h' }).some(p => p.type === 'doublons'), 'doublons repérés');
const S4 = serie(150); S4[50] = [S4[50][0], 0, 0, 0, 0, 0]; S4[51] = [S4[51][0], null, 1, 1, 1, 1]; S4[52] = [S4[52][0], 0, 0, 0, 0, 0]; S4[53] = [S4[53][0], 0, 0, 0, 0, 0]; v(controlerBougies('f', { b: S4 }, { unite: '1h' }).some(p => p.type === 'nulles' && p.gravite === 'grave'), 'valeurs nulles : grave au-delà de 3');
const S5 = serie(150).filter((_, i) => i < 60 || i > 80); v(controlerBougies('f', { b: S5 }, { unite: '1h', actif: 'BTC_USD' }).some(p => p.type === 'trous'), 'trou de 20 bougies sur un marché 24/7');
v(!controlerBougies('f', { b: S5 }, { unite: '1h', actif: '_NDX' }).some(p => p.type === 'trous'), 'pas de contrôle de trous sur un marché qui ferme');
const S6 = serie(150); S6[30] = [S6[30][0], 100, 99, 101, 100, 1]; v(controlerBougies('f', { b: S6 }, { unite: '1h' }).some(p => p.type === 'incoherentes'), 'bougie incohérente (haut < bas)');
/* cohérence entre fenêtres */
const bou = { GC_F: serie(100, () => 3500) }; v(controlerCoherence({ or: { prix: 3505 } }, bou).length === 0, 'même prix partout (0,14 % d\'écart) : cohérent');
const C = controlerCoherence({ or: { prix: 3700 } }, bou); v(C.length === 1 && C[0].gravite === 'grave' && /3700/.test(C[0].detail), 'prix de 5,7 % différent entre deux fenêtres : grave');
v(controlerCoherence({ btc: { prix: 1 } }, bou).length === 0, 'actif sans bougies comparables : ignoré');
/* un seul calendrier */
const N = Date.now(), ev = (min, titre) => ({ t: new Date(N + min * 60e3).toISOString(), titre }); const A = [ev(60, 'Fed Chair speaks'), ev(120, 'US CPI m/m'), ev(180, 'Jobless Claims')];
v(controlerCalendriers(A, A.map(e => ({ ...e })), { maintenant: N }).length === 0, 'même calendrier dans les deux fichiers : cohérent'); v(controlerCalendriers(A, [ev(60, 'Fed Chair speaks'), ev(500, 'Autre')], { maintenant: N }).some(p => p.type === 'calendriers-differents'), 'calendriers différents repérés');
/* persistance : alerte Telegram seulement si un problème grave persiste */
const graves = [{ gravite: 'grave', fichier: 'f', type: 'aberrant', detail: 'x' }, { gravite: 'info', fichier: 'g', type: 'doublons', detail: 'y' }];
let r1 = rapport({ problemes: graves, precedent: null, maintenant: 1000 }); v(r1.graves === 1 && r1.aAlerter.length === 0 && r1.consecutif['f|aberrant'].nuits === 1, 'nuit 1 : noté, pas d\'alerte');
let r2 = rapport({ problemes: graves, precedent: r1, maintenant: 2000 }); v(r2.aAlerter.length === 1 && r2.consecutif['f|aberrant'].nuits === 2, 'nuit 2 de suite : alerte');
let r3 = rapport({ problemes: graves, precedent: r2, maintenant: 3000 }); v(r3.aAlerter.length === 0, 'nuit 3 : pas de nouvelle alerte (une seule fois par épisode)');
let r4 = rapport({ problemes: [], precedent: r3, maintenant: 4000 }); v(r4.graves === 0 && Object.keys(r4.consecutif).length === 0 && /aucun problème/.test(r4.resume), 'problème disparu : compteur remis à zéro');
let r5 = rapport({ problemes: [graves[1]], precedent: null }); v(r5.aAlerter.length === 0 && /aucun problème grave/.test(r5.resume), 'seulement des informations : jamais d\'alerte');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `controle-qualite-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
