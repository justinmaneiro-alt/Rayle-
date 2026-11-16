/* Test pur : flèches Daily (causalité, jamais redessinées, invariance par translation, registre, placement, évaluation). Usage : node trader-pro/tests/fleches-daily-test.mjs */
import assert from 'node:assert/strict'; import fs from 'node:fs';
import { RETENUE, METHODES, calculer, indicateurs, fusionnerRegistre, idFleche, cloturees, indexSurUnite, REPOS, J } from '../terminal/fleches-daily.js';
import { zigzag, evaluer, comparerHasard, atrPctMedian } from '../terminal/fleches-eval.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, egal = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
function graine(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
/* marche aléatoire avec de vraies vagues (tendance qui change) : de quoi produire des sommets et des creux nets */
function serie(N, seed = 3, t0 = Date.UTC(2020, 0, 1), base = 1000) {
  const r = graine(seed), B = []; let c = base;
  for (let i = 0; i < N; i++) { const o = c, d = (r() - 0.5) * 14 + Math.sin(i / 38) * 9 + Math.sin(i / 11) * 2.5; c = Math.max(50, o + d); B.push({ t: t0 + i * J, o, h: Math.max(o, c) + r() * 6, l: Math.min(o, c) - r() * 6, c, v: 1000 }); }
  return B;
}
const B = serie(1500), cle = a => a.map(f => f.i + ':' + f.dir).join(',');
let total = 0;
for (const [nom, M] of Object.entries(METHODES)) for (const params of M.grille) {
  const A = calculer(B, nom, params); total += A.length;
  /* 1. CAUSALITÉ : tronquer l'historique ne change aucune flèche déjà publiée */
  for (const m of [420, 700, 1100]) { const A2 = calculer(B.slice(0, m), nom, params); egal(cle(A2), cle(A.filter(f => f.i < m)), `${nom} ${JSON.stringify(params)} : les flèches avant le jour ${m} ne dépendent pas de l'avenir`); }
  /* 2. INVARIANCE PAR TRANSLATION : un recalage constant de l'historique ne change rien */
  const dec = B.map(b => ({ ...b, o: b.o + 321.5, h: b.h + 321.5, l: b.l + 321.5, c: b.c + 321.5 })); egal(cle(calculer(dec, nom, params)), cle(A), `${nom} ${JSON.stringify(params)} : insensible à un décalage constant des prix`);
  /* 3. forme : sens ±1, repos de 20 bougies entre deux flèches de même sens, flèche à la bougie qui confirme, extrême connu AVANT la flèche */
  ok(A.every(f => f.dir === 1 || f.dir === -1), nom + ' : sens ±1');
  for (const d of [-1, 1]) { const I = A.filter(f => f.dir === d).map(f => f.i); for (let i = 1; i < I.length; i++) ok(I[i] - I[i - 1] >= REPOS, nom + ' : repos de ' + REPOS + ' bougies'); }
  ok(A.every(f => f.t === B[f.i].t && f.tCloture === B[f.i].t + J && f.tExtreme <= f.t && f.decalageJours >= 0), nom + ' : date de la flèche = bougie qui confirme ; décalage ≥ 0');
  ok(A.every(f => (f.dir < 0 ? f.niveau === B[f.i].h : f.niveau === B[f.i].l)), nom + ' : niveau d’affichage = haut (flèche rouge) ou bas (flèche verte) de la bougie de confirmation');
}
ok(total > 20, 'les méthodes produisent des flèches sur une série ondulée (' + total + ')');
/* sens : une flèche rouge a un extrême plus haut que la clôture de confirmation ; verte l'inverse */
const P = calculer(B, 'pivot', { L: 8, R: 8, amp: 5 }); ok(P.length > 5, 'pivots trouvés'); ok(P.every(f => f.decalageJours === 8), 'pivot : décalage = R jours (série sans trou)');
ok(P.every(f => (f.dir < 0 ? B[f.k].h >= Math.max(...B.slice(f.k - 8, f.k + 9).map(b => b.h)) : B[f.k].l <= Math.min(...B.slice(f.k - 8, f.k + 9).map(b => b.l)))), 'pivot rouge = plus haut de la fenêtre ; vert = plus bas');
/* bougie en cours écartée */
const maint = B[B.length - 1].t + 0.5 * J; egal(cloturees(B, maint).length, B.length - 1, 'la bougie du jour en cours n’est pas utilisée');
/* ───── registre : une flèche publiée ne bouge plus jamais ───── */
const A0 = calculer(B.slice(0, 900), 'pivot', { L: 8, R: 8, amp: 5 }); let reg = fusionnerRegistre('or', [], A0); egal(reg.length, A0.length, 'premier remplissage');
const idsAvant = reg.map(f => f.id).join('|'); const reg2 = fusionnerRegistre('or', reg, calculer(B.slice(0, 900), 'pivot', { L: 8, R: 8, amp: 5 })); egal(reg2.map(f => f.id).join('|'), idsAvant, 'idempotent : rien de nouveau, rien ne change');
const A1 = calculer(B.slice(0, 1200), 'pivot', { L: 8, R: 8, amp: 5 }), reg3 = fusionnerRegistre('or', reg, A1); ok(reg3.length >= reg.length, 'les nouvelles flèches s’ajoutent'); egal(reg3.slice(0, reg.length).map(f => f.id), reg.map(f => f.id), 'les anciennes restent à leur place');
const fausse = [{ ...reg[0], tCloture: reg[0].tCloture }]; const modif = { ...reg[0], niveau: 1, methode: 'autre' }; const reg4 = fusionnerRegistre('or', [modif, ...reg.slice(1)], A0); egal(reg4[0].niveau, 1, 'une flèche déjà publiée n’est jamais réécrite par un recalcul');
const disparue = fusionnerRegistre('or', reg, []); egal(disparue.length, reg.length, 'une flèche qui ne se reproduirait plus (donnée corrigée en amont) reste affichée');
ok(reg.every(f => f.id === idFleche('or', f)), 'identifiants stables actif|jour|sens');
/* ───── placement sur H1 / H4 / Jour ───── */
const t0 = Date.UTC(2026, 5, 1), H1 = 3600e3, intra = Array.from({ length: 24 * 5 }, (_, i) => ({ t: t0 + i * H1 })), jTs = t0 + 2 * J;
egal(indexSurUnite(intra, jTs, H1), 24 * 2 + 23, 'H1 : dernière bougie de la journée');
const h4 = Array.from({ length: 6 * 5 }, (_, i) => ({ t: t0 + i * 4 * H1 })); egal(indexSurUnite(h4, jTs, 4 * H1), 6 * 2 + 5, 'H4 : dernière bougie H4 de la journée');
const jours = Array.from({ length: 10 }, (_, i) => ({ t: t0 + i * J })); egal(indexSurUnite(jours, jTs, J), 2, 'Jour : la bougie Daily elle-même'); egal(indexSurUnite(intra, t0 + 30 * J, H1), -1, 'journée hors de la plage affichée : pas de flèche');
/* ───── évaluation ───── */
const Z = []; { let p = 100; const r = graine(5); for (let i = 0; i < 600; i++) { const dir = Math.floor(i / 60) % 2 ? -1 : 1, o = p; p = o + dir * 1.1 + (r() - 0.5) * 0.6; Z.push({ t: t0 + i * J, o, h: Math.max(o, p) + 0.2, l: Math.min(o, p) - 0.2, c: p, v: 0 }); } }
const piv = zigzag(Z, 0.1); ok(piv.length >= 8 && piv.every((x, i) => i === 0 || x.type !== piv[i - 1].type), 'zigzag : pivots alternés (' + piv.length + ')');
const bonnes = piv.map(x => ({ i: Math.min(Z.length - 1, x.i + 5), t: Z[Math.min(Z.length - 1, x.i + 5)].t, dir: x.type === 'top' ? -1 : 1 })), ev = evaluer(Z, bonnes, piv, { lmax: 15 });
ok(ev.precision > 0.9 && ev.rappel > 0.9, 'des flèches posées 5 jours après chaque pivot sont toutes bonnes'); ok(Math.abs(ev.decalageMoyenJours - 5) < 0.01, 'décalage moyen = 5 jours');
const ratees = bonnes.map(f => ({ ...f, i: f.i + 40 })).filter(f => f.i < Z.length), ev2 = evaluer(Z, ratees, piv, { lmax: 15 }); ok(ev2.precision < 0.5, 'des flèches en retard de 40 jours sont fausses (' + ev2.precision + ')');
const dbl = evaluer(Z, [...bonnes, ...bonnes.map(f => ({ ...f, i: f.i + 1 }))].filter(f => f.i < Z.length), piv, { lmax: 15 }); ok(dbl.bonnes === ev.bonnes && dbl.fausses > 0, 'un pivot ne sert qu’une fois : les doublons sont faux');
const h = comparerHasard(Z, bonnes, piv, { essais: 120 }); ok(h.p < 0.1 && h.precisionHasard < ev.precision, 'des flèches parfaites battent le hasard (p = ' + h.p.toFixed(3) + ')');
ok(atrPctMedian(B) > 0, 'ATR % médian');
/* la méthode du code = celle du backtest */
const bt = JSON.parse(fs.readFileSync(new URL('../terminal/backtest-fleches.json', import.meta.url), 'utf8')); egal(bt.retenue, RETENUE.methode, 'la méthode retenue du backtest est celle du code'); egal(bt.methodes[bt.retenue].reglageChoisi, { ...RETENUE.params }, 'le réglage retenu du backtest est celui du code');
ok(Object.keys(METHODES).length === 3 && bt.protocole && bt.methodes.extreme && bt.methodes.pivot && bt.methodes.exces, 'trois méthodes candidates testées');
console.log(`fleches-daily-test : ${n} vérifications, tout passe`);
