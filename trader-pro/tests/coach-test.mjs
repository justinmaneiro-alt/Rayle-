/* Tests du coach (détections calculées). node trader-pro/tests/coach-test.mjs */
import fs from 'node:fs'; import path from 'node:path';
import { tradesSansStop, tradesTropGros, tradesRevenge, joursSurtrading, tradesApresSerie, pertesGardeesLongtemps, constats, piresEtMeilleurs, noteDiscipline, evolutionNote, rapportCalcule, texteRapport } from '../portefeuille/coach.js';
import { enrichir, resume, valeursDuPoint } from '../portefeuille/calcul.js';
import { importerXtb } from '../portefeuille/import-xtb.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let graine = 7; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
const H = 3600e3, J0 = Date.UTC(2026, 2, 2, 8, 0, 0);
let n = 0; const mk = (tOuv, dureeMin, pnl, o = {}) => ({ id: 'p' + (++n), ticker: 'GOLD', instrument: 'GOLD', sens: 'BUY', volume: 0.01, prixOuv: 4000, prixFerm: 4000 + pnl, tOuv, tFerm: tOuv + dureeMin * 60e3, pnl, brut: pnl, swap: 0, commission: 0, sl: 3990, tp: null, origine: 'x', commentaire: '', ...o });
const T = []; let t = J0;
for (let i = 0; i < 120; i++) { t += (2 + Math.floor(i / 20) * 0.3) * H; const gagne = alea() < 0.45; T.push(mk(t, gagne ? 40 : 35, gagne ? 8 + alea() * 4 : -(5 + alea() * 3))); }
/* 12 positions sans stop et perdantes */ for (let i = 0; i < 12; i++) { t += 3 * H; T.push(mk(t, 90, -15 - alea() * 5, { sl: null })); }
/* 10 positions trop grosses perdantes */ for (let i = 0; i < 10; i++) { t += 3 * H; T.push(mk(t, 50, -40, { volume: 0.05 })); }
/* revenge : 14 paires perte puis nouvelle position 5 minutes après */ for (let i = 0; i < 14; i++) { t += 4 * H; const perte = mk(t, 30, -8); T.push(perte); T.push(mk(perte.tFerm + 5 * 60e3, 20, -9)); }
/* un jour de surtrading : 30 positions en 5 heures */ const jourS = Date.UTC(2026, 5, 15, 7, 0, 0); for (let i = 0; i < 30; i++) T.push(mk(jourS + i * 10 * 60e3, 6, i % 2 ? -3 : 2));
const E = enrichir(T, valeursDuPoint(T));
v(tradesSansStop(E).length === 12, 'sans stop : 12 détectés'); const gros = tradesTropGros(E); v(gros.length >= 8 && gros.every(id => E.find(x => x.id === id).volume === 0.05), 'trop gros : détectés (' + gros.length + ')');
const rev = tradesRevenge(E); v(rev.length >= 14, 'revenge : au moins 14 détectés (' + rev.length + ')'); const st = joursSurtrading(E); v(st.jours.size === 1 && st.trades.length === 30, 'surtrading : le jour à 30 positions'); v(tradesApresSerie(E).length >= 1, 'après une série de pertes');
const pg = pertesGardeesLongtemps(E); v(pg.dg && pg.dp, 'durées gagnantes / perdantes mesurées');
const C = constats(E), ids = C.map(c => c.id); for (const k of ['stop', 'taille', 'revenge', 'surtrading']) v(ids.includes(k), 'constat présent : ' + k); v(C.find(c => c.id === 'stop').impact < 0 && C.find(c => c.id === 'taille').impact < 0, 'les erreurs signalées ont bien coûté de l’argent');
v(C.every(c => c.texte.length > 20 && Number.isFinite(c.part)), 'chaque constat explique ce qu’il a mesuré');
const propre = enrichir(Array.from({ length: 60 }, (_, i) => mk(J0 + i * 3 * H, 30, i % 2 ? 6 : -4)), {}), nP = noteDiscipline(propre), nS = noteDiscipline(E); v(nP.note > nS.note && nP.note >= 90, 'note : historique propre ' + nP.note + ' > historique fautif ' + nS.note); v(nS.note >= 0 && nS.note <= 100, 'note entre 0 et 100');
v(Object.values(nS.detail).reduce((s, d) => s + d.poids, 0) === 100, 'les poids font 100'); const ev = evolutionNote(E, { jours: 30, pas: 14, min: 10 }); v(ev.length >= 2 && ev.every(x => x.note >= 0 && x.note <= 100), 'évolution de la note dans le temps (' + ev.length + ' points)');
const R = rapportCalcule(E); v(R.erreurs.length === 3 && R.erreurs[0].impact <= R.erreurs[1].impact, '3 plus grosses erreurs, classées par coût'); v(R.regles.length === 3, '3 règles concrètes'); const tx = texteRapport(R, resume(E)); v(/note de discipline/.test(tx) && /Trois règles/.test(tx), 'texte du rapport lisible');
const pm = piresEtMeilleurs(E); v(Array.isArray(pm.pires) && pm.pires.every(x => x.n >= 15), 'pires créneaux : échantillon minimum respecté'); v(constats(E.slice(0, 20)).length === 0, 'moins de 30 positions : aucune conclusion');
let zip = null; try { zip = fs.readdirSync('donnees-privees').filter(f => /^\d+_.*\.zip$/.test(f)).map(f => path.join('donnees-privees', f))[0]; } catch (e) { /* */ }
if (zip) { const X = await importerXtb([{ nom: path.basename(zip), octets: new Uint8Array(fs.readFileSync(zip)) }]), E2 = enrichir(X.fermees), R2 = rapportCalcule(E2); v(R2.note && R2.note.note >= 0, 'réel : note de discipline calculée'); v(R2.erreurs.length > 0 && R2.regles.length === 3, 'réel : erreurs et règles produites'); v(evolutionNote(E2).length >= 3, 'réel : évolution de la note');
  console.log(`  réel : note ${R2.note.note}/100 ; constats ${R2.constats.map(c => c.id + '(' + c.n + ')').join(', ')} ; erreurs ${R2.erreurs.map(e => e.id).join(', ')}`); }
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
