// M6c : détecteur de régime, règles par régime, simulateur à stop suiveur, précision du détecteur.
// Lancer :  node planetes/mars/tests/m6c-detecteur-test.mjs
import { regrouper, MS } from '../pc/agent-btc/colonnes.js';
import { detecter, decrire, segments, adx, CODES, REGIMES } from '../pc/agent-m6c/detecteur-regime.js';
import { contexteRegime, REGLES, ORDRE_REGLES, combinaisonsRegle, signauxCroisement } from '../pc/agent-m6c/regles-regime.js';
import { simulerSuiveur } from '../pc/agent-m6c/simulateur-suiveur.js';
import { precisionDetecteur } from '../pc/agent-m6c/precision-detecteur.js';
import { CRITERES_M6C, empreinteM6c } from '../pc/agent-m6c/criteres-m6c.js';
import { empreinteCriteres, CRITERES } from '../pc/agent-btc/criteres.js';
import { verifierColonnes, verifierSignaux, poisonner, couper, premiereDifference } from '../pc/agent-m6/causalite.js';
import { serieSynth, marcheMixte } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

// ── critères : v1 intacte, M6c figée ──
v('critères v1 intacts (empreinte c9995253)', empreinteCriteres(CRITERES) === 'c9995253', empreinteCriteres(CRITERES));
v('critères M6c : empreinte stable', empreinteM6c() === 'd8c5e758', empreinteM6c());
v('critères M6c : v2 exigée telle quelle (150 trades, +20 R)', CRITERES_M6C.base.horsEchantillon.tradesMin === 150 && CRITERES_M6C.base.objectif.rNetMin === 20 && CRITERES_M6C.base.horsEchantillon.esperanceMin === 0.25);

// ── détection sur des marchés fabriqués ──
const H1 = s => regrouper(s, MS.H1).serie;
const hausse = serieSynth({ segments: [{ n: 16000, derive: 0.02, bruit: 0.12, volume: 100 }], graine: 5 }), baisse = serieSynth({ segments: [{ n: 16000, derive: -0.02, bruit: 0.12, volume: 100 }], graine: 6 });
const plat = serieSynth({ segments: [{ n: 16000, derive: 0, bruit: 0.14, volume: 100, retour: 0.06 }], graine: 7 });
const part = (det, code) => { let k = 0, tot = 0; for (let i = 400; i < det.n; i++) { tot++; if (det.regime[i] === code) k++; } return k / tot; };
const dH = detecter(H1(hausse)), dB = detecter(H1(baisse)), dP = detecter(H1(plat));
v('marché qui monte : tendance haussière dominante', part(dH, CODES.HAUSSIER) > 0.5 && part(dH, CODES.BAISSIER) < 0.05, part(dH, CODES.HAUSSIER).toFixed(2));
v('marché qui baisse : tendance baissière dominante', part(dB, CODES.BAISSIER) > 0.5 && part(dB, CODES.HAUSSIER) < 0.05, part(dB, CODES.BAISSIER).toFixed(2));
v('marché sans direction : range détecté, pas de tendance dominante', part(dP, CODES.RANGE) > 0.15 && part(dP, CODES.HAUSSIER) + part(dP, CODES.BAISSIER) < 0.25, [part(dP, CODES.RANGE), part(dP, CODES.HAUSSIER), part(dP, CODES.BAISSIER)].map(x => x.toFixed(2)).join('/'));
{ const i = (() => { for (let q = dP.n - 1; q > 400; q--) if (dP.regime[q] === CODES.RANGE) return q; return -1; })(), d = i > 0 ? decrire(dP, H1(plat), i) : null;
  v('un range a des bornes cohérentes, des touches et un âge', !!d && d.haut > d.bas && d.touchesHaut >= 2 && d.touchesBas >= 2 && d.ageH >= 0 && d.milieu > d.bas && d.milieu < d.haut);
  v('la phrase du range cite les bornes et dit « je ne propose aucune position »', !!d && /range entre/.test(d.phrase) && /aucune position/.test(d.phrase)); }
{ const sg = segments(dP, H1(plat), { min: 6 }); v('segments : consécutifs, sans trou, sans chevauchement', sg.length > 1 && sg.every((x, k) => k === 0 || x.t0 === sg[k - 1].t1) && sg.every(x => x.t1 > x.t0)); }
{ const a = adx(Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]), Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]), Float64Array.from([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5, 25.5, 26.5, 27.5, 28.5, 29.5]));
  v('ADX d’une droite parfaite : très élevé et +DI > −DI', a.adx[29] > 90 && a.plus[29] > a.moins[29], a.adx[29]); }
v('noms des régimes', REGIMES[0].includes('transition') && REGIMES[3] === 'range');

// ── poison du futur : le détecteur, les règles, la précision ne regardent jamais l'avenir ──
const M = marcheMixte(9000, 4), COUPES = [4003, 6007, 8011];
const detCols = s => { const h = regrouper(s, MS.H1), d = detecter(h.serie); return { regime: d.regime, volatil: d.volatil, structure: d.structure, haut: d.boiteHaut, bas: d.boiteBas, th: d.touchesHaut, tb: d.touchesBas, age: d.age, comp: d.compression, adx: d.adx, atr: d.atr }; };
// les colonnes H1 sont indexées par bougie H1 : on compare à l'index H1 de la coupe (la coupe laisse intactes les H1 complètes avant elle)
{ const plein = detCols(M); let viol = null, testes = 0;
  for (const i of COUPES) for (const methode of ['poison', 'coupe']) {
    const autre = detCols(methode === 'poison' ? poisonner(M, i) : couper(M, i)), hmax = Math.floor((i + 1) / 4) - 1;      // dernière bougie H1 entièrement avant la coupe
    for (const nom of Object.keys(plein)) { testes++; const d = premiereDifference(plein[nom], autre[nom], 250, hmax, 1e-9); if (d && !viol) viol = { nom, methode, i, ...d }; }
  }
  v('détecteur : aucune fuite du futur (' + testes + ' contrôles, colonnes H1 jusqu’à la coupe)', !viol, JSON.stringify(viol)); }
{ const F = id => s => { const c = contexteRegime(s), r = REGLES[id].signaux(c, REGLES[id].defaut); return { sens: r.sens, stop: r.stop }; };
  for (const id of ORDRE_REGLES) { const r = verifierSignaux(F(id), M, COUPES, { de: 900 }); v('règle ' + id + ' : aucune fuite du futur', r.ok, JSON.stringify(r.violations[0])); } }
{ const r = verifierSignaux(s => { const c = contexteRegime(s), x = signauxCroisement(c); return { sens: x.sens, stop: x.stop }; }, M, COUPES, { de: 900 }); v('croisement de moyennes mobiles : aucune fuite du futur', r.ok, JSON.stringify(r.violations[0])); }
{ // l'harnais attrape une fuite volontaire dans une règle (garde-fou du test lui-même)
  const triche = s => { const c = contexteRegime(s), r = REGLES.tendance_cassure.signaux(c, REGLES.tendance_cassure.defaut), sens = new Int8Array(s.n); for (let i = 0; i < s.n - 1; i++) sens[i] = s.c[i + 1] > s.c[i] ? 1 : -1; return { sens, stop: r.stop }; };
  v('le harnais attrape une règle qui triche', !verifierSignaux(triche, M, COUPES, { de: 900 }).ok); }

// ── règles : grilles, voisins, exemples fabriqués ──
for (const id of ORDRE_REGLES) { const n = combinaisonsRegle(id).length; v('grille ' + id + ' : ' + n + ' variantes, défaut dans la grille', n >= 6 && combinaisonsRegle(id).some(p => Object.keys(REGLES[id].defaut).every(k => p[k] === REGLES[id].defaut[k]))); }
{ // cassure de range fabriquée : range propre puis cassure haussière à fort volume puis retest qui tient
  const segs = [{ n: 1500, derive: 0.01, bruit: 0.1, volume: 100 }, { n: 700, derive: 0, bruit: 0.12, volume: 90, retour: 0.08 }, { n: 8, derive: 0.35, bruit: 0.05, volume: 500 }, { n: 12, derive: -0.12, bruit: 0.05, volume: 120 }, { n: 300, derive: 0.02, bruit: 0.08, volume: 110 }];
  const S = serieSynth({ segments: segs, graine: 11 }), ctx = contexteRegime(S);
  const imm = REGLES.cassure_range.signaux(ctx, { mode: 'immediat', score: 3, mult: 1.5 }), ret = REGLES.cassure_range.signaux(ctx, { mode: 'retest', score: 3, mult: 1.5 });
  const nImm = imm.sens.reduce((a, x) => a + (x ? 1 : 0), 0), nRet = ret.sens.reduce((a, x) => a + (x ? 1 : 0), 0);
  v('cassure_range : la cassure fabriquée est vue en mode immédiat', nImm >= 1 && imm.sens.some(x => x === 1), nImm);
  v('cassure_range : un signal porte stop, suivi et étiquette', (() => { const i = imm.sens.findIndex(x => x !== 0); return i > 0 && imm.stop[i] > 0 && imm.suivi[i] > 0 && imm.etiq[i] === 1; })());
  v('cassure_range : le retest est plus sélectif que l’immédiat', nRet <= nImm, nRet + '/' + nImm); }
{ // trade du range : jamais de signal hors range ; tendance : jamais de signal en range
  const ctx = contexteRegime(plat), r = REGLES.range_trade.signaux(ctx, REGLES.range_trade.defaut), t = REGLES.tendance_cassure.signaux(ctx, REGLES.tendance_cassure.defaut);
  let hors = 0, tendEnRange = 0; for (let i = 0; i < ctx.n; i++) { if (r.sens[i] && ctx.reg.regime[i] !== CODES.RANGE) hors++; if (t.sens[i] && ctx.reg.regime[i] === CODES.RANGE) tendEnRange++; }
  v('range_trade ne signale que dans un range', hors === 0, hors); v('la règle de tendance ne signale jamais en range (le filtre)', tendEnRange === 0, tendEnRange);
  v('range_trade : objectif entre les bornes, stop hors de la boîte', (() => { const i = r.sens.findIndex(x => x !== 0); if (i < 0) return true; const lo = ctx.reg.bas[i], hi = ctx.reg.haut[i]; return r.sens[i] > 0 ? r.stop[i] < lo && r.cible[i] > lo && r.cible[i] <= hi : r.stop[i] > hi && r.cible[i] < hi && r.cible[i] >= lo; })()); }

// ── simulateur à stop suiveur ──
const bar = (t, o, h, l, c) => ({ t, o, h, l, c, v: 100, vb: NaN });
const mk = bs => { const n = bs.length, s = { n, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n), vb: new Float64Array(n).fill(NaN) }; bs.forEach((b, i) => { s.t[i] = b.t; s.o[i] = b.o; s.h[i] = b.h; s.l[i] = b.l; s.c[i] = b.c; s.v[i] = b.v; }); return s; };
const sig = (n, i, sens, stop, suivi, cible = NaN) => { const o = { sens: new Int8Array(n), stop: new Float64Array(n), suivi: new Float64Array(n), cible: new Float64Array(n).fill(NaN) }; o.sens[i] = sens; o.stop[i] = stop; o.suivi[i] = suivi; o.cible[i] = cible; return o; };
const T = 1.7e12, SANSCOUT = { fraisPct: 0, spreadPct: 0, glissementPct: 0, distanceMinPct: 0.01 };
{ // achat à 100, stop 98 (risque 2), suivi 2 : le prix monte à 110 puis redescend → sortie sur le stop suiveur à 108 = +4 R
  const bs = [bar(T, 100, 100.5, 99.5, 100), bar(T + 9e5, 100, 101, 99.9, 100.5), bar(T + 18e5, 100.5, 106, 100.4, 105), bar(T + 27e5, 105, 110, 104.8, 109), bar(T + 36e5, 109, 109.5, 107.9, 108.2), bar(T + 45e5, 108, 108.3, 105, 105.5), bar(T + 54e5, 105, 105, 104, 104.5)];
  const S = mk(bs), r = simulerSuiveur(S, sig(7, 0, 1, 98, 2), SANSCOUT, { de: 0, a: 7 }), x = r.trades[0];
  v('stop suiveur : un trade, sorti sur le stop suiveur', r.trades.length === 1 && x.motif === 'stop suiveur', JSON.stringify(x));
  v('stop suiveur : sortie à 108 = +4 R (extrême 110 − 2)', x && Math.abs(x.prixSortie - 108) < 1e-9 && Math.abs(x.R - 4) < 1e-9, x && x.R);
  v('stop suiveur : le stop ne recule jamais et dépasse le stop initial', x && x.stopFinal > x.stop && x.stopFinal === 108); }
{ // la bougie qui touche le stop suiveur ne sert pas à le relever avant d'être jugée : un nouveau haut dans la bougie du stop ne relève pas le stop de cette même bougie
  const bs = [bar(T, 100, 100.5, 99.5, 100), bar(T + 9e5, 100, 112, 97.5, 99), bar(T + 18e5, 99, 99.5, 98.5, 99)];
  const r = simulerSuiveur(mk(bs), sig(3, 0, 1, 98, 2), SANSCOUT, { de: 0, a: 3 }); v('stop initial prioritaire dans la bougie (stop et plus haut dans la même bougie → stop)', r.trades.length === 1 && r.trades[0].motif === 'stop' && Math.abs(r.trades[0].R + 1) < 1e-9, JSON.stringify(r.trades[0])); }
{ // cible absolue (trade du range) : atteinte → sortie à la cible
  const bs = [bar(T, 100, 100.5, 99.5, 100), bar(T + 9e5, 100, 101, 99.5, 100.5), bar(T + 18e5, 100.5, 104.2, 100.4, 104), bar(T + 27e5, 104, 104, 103, 103.5)];
  const r = simulerSuiveur(mk(bs), sig(4, 0, 1, 98, 0, 104), SANSCOUT, { de: 0, a: 4 }); v('cible absolue : sortie sur la cible (+2 R)', r.trades.length === 1 && r.trades[0].motif === 'cible' && Math.abs(r.trades[0].R - 2) < 1e-9, JSON.stringify(r.trades[0])); }
{ // vente symétrique
  const bs = [bar(T, 100, 100.5, 99.5, 100), bar(T + 9e5, 100, 100.1, 99, 99.2), bar(T + 18e5, 99.2, 99.3, 94, 95), bar(T + 27e5, 95, 96.1, 94.5, 96), bar(T + 36e5, 96, 96, 95.5, 95.7)];
  const r = simulerSuiveur(mk(bs), sig(5, 0, -1, 102, 2), SANSCOUT, { de: 0, a: 5 }); v('vente : stop suiveur descend puis sort (+2 R)', r.trades.length === 1 && r.trades[0].sens === -1 && Math.abs(r.trades[0].R - 2) < 1e-9, JSON.stringify(r.trades[0])); }
{ // position non terminée en fin de données : non comptée
  const bs = [bar(T, 100, 100.5, 99.5, 100), bar(T + 9e5, 100, 101, 99.9, 100.5), bar(T + 18e5, 100.5, 101, 100.2, 100.8)];
  const r = simulerSuiveur(mk(bs), sig(3, 0, 1, 98, 2), SANSCOUT, { de: 0, a: 3 }); v('position ouverte en fin de données : non comptée', r.trades.length === 0 && r.tronque === true); }
{ // frais et glissement réduisent le résultat
  const bs = [bar(T, 100, 100.5, 99.5, 100), bar(T + 9e5, 100, 101, 99.9, 100.5), bar(T + 18e5, 100.5, 106, 100.4, 105), bar(T + 27e5, 105, 110, 104.8, 109), bar(T + 36e5, 109, 109.5, 107.9, 108.2), bar(T + 45e5, 108, 108.3, 105, 105.5)];
  const sans = simulerSuiveur(mk(bs), sig(6, 0, 1, 98, 2), SANSCOUT, { de: 0, a: 6 }).trades[0], avec = simulerSuiveur(mk(bs), sig(6, 0, 1, 98, 2), { distanceMinPct: 0.01 }, { de: 0, a: 6 }).trades[0];
  v('les coûts réduisent le résultat en R', sans && avec && avec.R < sans.R && avec.coutsR > 0, sans && avec && (sans.R + ' / ' + avec.R)); }

// ── précision du détecteur ──
{ const p = precisionDetecteur(dH, H1(hausse)); v('précision : trois lignes, taux et base entre 0 et 1', p.length === 3 && p.every(x => x.taux == null || (x.taux >= 0 && x.taux <= 1)) && p[0].base > 0.5);
  v('précision sur marché qui monte : la tendance haussière réussit presque toujours (lift ≥ 1)', p[0].taux > 0.8 && p[0].lift >= 1, JSON.stringify(p[0])); }
{ const p = precisionDetecteur(detecter(H1(marcheMixte(20000, 8))), H1(marcheMixte(20000, 8))); v('précision : un marché mélangé donne des chiffres calculables', p.length === 3 && p.some(x => x.n > 0)); }

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
