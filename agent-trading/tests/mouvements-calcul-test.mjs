/* Tests de la fiche, des statistiques et de l'export des mouvements : node agent-trading/tests/mouvements-calcul-test.mjs */
import * as C from '../front/or/mouvements-calcul.js';
let ok = 0, ko = 0; const t = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const H = 3600e3, rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
const r0 = rng(3), B = []; { let p = 1800; for (let k = 0; k < 8000; k++) { const o = p, c = o + (r0() - 0.5) * 7 + Math.sin(k / 30) * 1.6, h = Math.max(o, c) + r0() * 2.5, l = Math.min(o, c) - r0() * 2.5; B.push({ t: Date.UTC(2024, 0, 1) + k * H, o, h, l, c }); p = c; } }
const t0 = Date.now(), R = C.calculer(B, { maintenant: 1e15 }), ms = Date.now() - t0;
t('calcul rapide sur 8 000 bougies (< 800 ms)', ms < 800, ms + ' ms'); console.log(`  (${R.moves.length} mouvements en ${ms} ms)`);
t('stats : cohérentes', R.stats.n === R.moves.length && R.stats.hausse + R.stats.baisse === R.stats.n && R.stats.parHeure.reduce((a, b) => a + b, 0) === R.stats.n && Object.values(R.stats.parJour).reduce((a, b) => a + b, 0) === R.stats.n);
t('stats : par semaine = nombre / semaines', Math.abs(R.stats.parSemaine - R.stats.n / R.stats.semaines) < 1e-9 && R.stats.semaines > 40);
t('stats : médiane entre min et max', R.stats.ampleurMedUSD >= Math.min(...R.moves.map(m => m.gain)) && R.stats.ampleurMedUSD <= Math.max(...R.moves.map(m => m.gain)));
const m = R.moves[R.moves.length >> 1], F = C.fiche(m);
t('fiche : toutes les lignes demandées', /Départ/.test(F[1]) && /Durée/.test(F[2]) && /Ampleur/.test(F[3]) && /Niveau structurel/.test(F[4]) && /SMA 200 Jour/.test(F[5]) && /Rétrospectif/.test(F.join('|')), F.join(' / '));
t('heure de Paris : hiver UTC+1, été UTC+2', C.parisDe(Date.UTC(2026, 0, 15, 10)).heure === 11 && C.parisDe(Date.UTC(2026, 6, 15, 10)).heure === 12);
t('heure de Paris : minuit = 0 et pas 24', C.parisDe(Date.UTC(2026, 0, 14, 23)).heure === 0);
t('étiquette « +38 $ · 5 bougies »', C.etiquette({ d: 1, gain: 38.2, bougies: 5, enCours: false }) === '+38 $ · 5 bougies' && /en cours/.test(C.etiquette({ d: -1, gain: 12, bougies: 4, enCours: true })));
{ const idx = R.moves.findIndex(q => q.sma200J != null && q.niveau), q = R.moves[idx], R2 = C.calculer(B.slice(0, q.i1 + 1), { maintenant: 1e15 }), q2 = R2.moves.find(x => x.i0 === q.i0 && x.i1 === q.i1);
  t('niveau, SMA200 Jour et balayage identiques si on coupe les données après la fin du mouvement', q2 && q2.niveau && q2.niveau.prix === q.niveau.prix && q2.sma200J === q.sma200J && q2.balayage === q.balayage); }
t('SMA 200 Jour absente tant que l’historique est trop court', R.moves.filter(q => q.i0 < 24 * 150).every(q => q.sma200J == null));
const csv = C.versCSV(R.moves), lignes = csv.trim().split('\n'); t('CSV : une ligne par mouvement + en-tête, séparateur ;', lignes.length === R.moves.length + 1 && lignes[0].split(';').length === 17 && lignes[1].split(';').length === 17);
t('CSV : décimales à la française', /\d,\d/.test(lignes[1]));
const js = JSON.parse(C.versJSON(R.moves, { x: 1 })); t('JSON : mouvements + avertissement', js.mouvements.length === R.moves.length && /Rétrospectif/.test(js.avertissement) && js.x === 1);
console.log(`mouvements-calcul : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
