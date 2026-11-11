/* Tests de ma-evenements-v1 : cassure, vraie cassure (clôtures / retest), fausse cassure, rebond, classification, SMA jour, non-repaint sur des préfixes, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as M from '../front/or/ma-evenements-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5);
const bar = (i, o, h, l, c, vol = 100) => ({ t: t0 + i * H, o, h, l, c, v: vol });
/* 260 bougies plates (alternance 100,2 / 99,8) puis la suite décrite par des triplets [c, h, l] */
function serie(suite, basDernier = true) { const B = []; for (let i = 0; i < 260; i++) { const c = (i % 2 === 1) === basDernier ? 99.8 : 100.2, o = i ? B[i - 1].c : c; B.push(bar(i, o, Math.max(o, c) + 1, Math.min(o, c) - 1, c)); } for (const [c, h, l] of suite) { const i = B.length, o = B[i - 1].c; B.push(bar(i, o, h ?? Math.max(o, c) + 0.5, l ?? Math.min(o, c) - 0.5, c)); } return B; }
const types = r => r.events.map(e => e.type + (e.dir > 0 ? '+' : '-')).join(' ');
// SMA
const S = M.smaH1([1, 2, 3, 4].map((c, i) => bar(i, c, c, c, c)), 2); v(S[0] === null && S[1] === 1.5 && S[3] === 3.5, 'SMA H1 : moyenne glissante, null au départ');
// cassure + vraie cassure par 3 clôtures
let B = serie([[102], [102.6], [103.2], [103.8]]); let r = M.analyser(B);
v(types(r) === 'cassure+ confirmee+', 'cassure puis 3 clôtures au-delà = confirmée : ' + types(r));
const cas = r.events[0], conf = r.events[1];
v(cas.i === 260 && cas.t === B[260].t && cas.tCloture === B[260].t + H, 'la cassure est posée à la clôture de sa bougie');
v(conf.i === 263 && conf.motif === 'clotures' && conf.ref === cas.id, 'confirmée à la 3e clôture suivante, rattachée à la cassure');
v(cas.profil && ['faible', 'moyen', 'fort'].includes(cas.profil.corps) && cas.profil.session && cas.profil.h4, 'la cassure porte son profil (six caractéristiques)');
// écart trop petit : pas de cassure
B = serie([[100.3], [100.4]]); v(types(M.analyser(B)) === '', 'écart < 0,25 ATR : pas de cassure');
// retest qui tient
B = serie([[102], [101.5, 102, 99.9], [102.5]]); r = M.analyser(B); const ma262 = r.ma[261];
v(types(r).startsWith('cassure+ confirmee+') && r.events[1].motif === 'retest' && r.events[1].i === 261, 'retest de la MA qui tient en clôture = confirmée (' + types(r) + ', MA ' + ma262.toFixed(2) + ')');
// fausse cassure : retour du côté d'origine
B = serie([[102], [102.4], [99.0]]); r = M.analyser(B);
v(types(r).startsWith('cassure+ fausse-') && r.events[1].ref === r.events[0].id && r.events[1].delaiBougies === 2, 'retour sous la MA dans les 6 bougies = fausse cassure, réintégration (' + types(r) + ')');
// expiration : 6 bougies sans issue (reste au-dessus sans 3 clôtures consécutives ni retest : impossible) -> on fabrique une oscillation sur la MA (clôture exactement sur la MA)
B = serie([[102], [102.5], [103], [103.5], [104], [104.5], [105]]); r = M.analyser(B, { R: { ...M.P, clotures: 99 } }); // sans 3 clôtures possibles ni retest ni retour
v(r.events.some(e => e.type === 'expiree') && r.events.filter(e => e.type === 'expiree')[0].i === 266, 'sans issue en 6 bougies : cassure non tranchée, posée à la 6e bougie (' + types(r) + ')');
// cassure baissière (miroir)
B = serie([[98], [97.4], [96.8], [96.2]], false); v(types(M.analyser(B)) === 'cassure- confirmee-', 'cassure baissière confirmée');
// rebond : au-dessus de la MA, la mèche touche (≤ 0,25 ATR) puis clôture ≥ 0,5 ATR au-dessus
B = serie([[104], [106], [107], [107.5]]); { const ma = M.smaH1(B)[263]; B.push(bar(B.length, 107.5, 108, ma + 0.1, 107.8)); B.push(bar(B.length, 107.8, 109.5, 107.6, 109)); } r = M.analyser(B);
const rb = r.events.filter(e => e.type === 'rebond'); v(rb.length === 1 && rb[0].dir === 1 && rb[0].i === B.length - 1 && rb[0].extremeI === B.length - 2, 'rebond sur la MA : extrême puis clôture à ≥ 0,5 ATR, posé à la clôture (' + types(r) + ')');
// pas de rebond si la clôture passe de l'autre côté entre-temps
B = serie([[104], [106], [107], [107.5]]); { const ma = M.smaH1(B)[263]; B.push(bar(B.length, 107.5, 108, ma - 3, ma - 2)); B.push(bar(B.length, ma - 2, ma + 4, ma - 2.2, ma + 3.5)); } r = M.analyser(B);
v(!r.events.some(e => e.type === 'rebond'), 'clôture de l\'autre côté entre l\'extrême et la sortie : pas de rebond');
// classification : volume et extension
B = serie([[102]]); B[260].v = 400; const p = M.profilCassure(B, M.smaH1(B), M.analyser(B).atr, 260, 1, new Array(B.length).fill(1)); v(p.volume === 'haut' && p.h4 === 'avec' && p.extension === 'courte', 'classification : volume haut, H4 avec, extension courte');
// issue de continuation
const Bc = serie([[100]]); for (const c of [101, 103, 107]) Bc.push(bar(Bc.length, Bc[Bc.length - 1].c, c + 0.2, c - 0.5, c)); const a = 2; v(M.issueContinuation(Bc, 260, 1, a) === 1, 'continuation : +2 ATR avant −1 ATR = 1'); const Bd = serie([[100]]); for (const c of [99, 94]) Bd.push(bar(Bd.length, Bd[Bd.length - 1].c, Bd[Bd.length - 1].c, c - 0.2, c)); v(M.issueContinuation(Bd, 260, 1, a) === -1, 'continuation ratée : −1 ATR d\'abord = −1');
// mots honnêtes
v(M.motMesure({ recent: { n: 40, icPart: [0.5, 0.7], basePart: 0.4 }, long: { n: 300, icPart: [0.46, 0.55], basePart: 0.38 } }) === 'au-dessus de la base', 'mot : au-dessus seulement si les deux fenêtres dépassent de plus de 5 points');
v(M.motMesure({ recent: { n: 10, icPart: [0.5, 0.9], basePart: 0.4 }, long: { n: 300, icPart: [0.4, 0.5], basePart: 0.38 } }) === 'pas nettement différent de la base', 'mot : n < 30 ou écart faible = pas nettement différent');
v(M.etiquette({ type: 'confirmee', dir: 1 }, { evenements: { cassure_confirmee: { haussier: { long: { n: 52, taux: 0.44 } } } } }) === 'Cassure confirmée · continuation 44 %, n = 52', 'étiquette « continuation 44 %, n = 52 »');
v(/pas assez de données/.test(M.etiquette({ type: 'confirmee', dir: 1 }, { evenements: { cassure_confirmee: { haussier: { long: { n: 12, taux: 0.9 } } } } })), 'n < 30 : « pas assez de données »');
// SMA jour : appliquée au jour suivant seulement, jamais avec le jour en cours
{ const Bj = []; for (let i = 0; i < 24 * 230; i++) { const c = 100 + Math.floor(i / 24); Bj.push(bar(i, c, c + 1, c - 1, c)); } const sj = M.smaJour(Bj, 200); v(sj[0] === null && sj[24 * 205] != null, 'SMA jour : disponible après 200 jours'); const Bk = Bj.slice(0, 24 * 220 + 5); const sk = M.smaJour(Bk, 200); let egal = true; for (let i = 0; i < Bk.length; i++) if (sk[i] !== sj[i]) egal = false; v(egal, 'SMA jour : identique sur un préfixe (aucune donnée du futur ni du jour en cours)'); }
// non-repaint : marche aléatoire, préfixes
{ const g = prng(7); const Bw = []; let c = 100; for (let i = 0; i < 1500; i++) { const o = c; c = o + (g() - 0.5) * 3 + Math.sin(i / 40) * 0.4; Bw.push(bar(i, o, Math.max(o, c) + g(), Math.min(o, c) - g(), c, 50 + g() * 100)); }
  const pleine = M.analyser(Bw); let bon = true, essais = 0; for (let k = 300; k <= 1500; k += 4) { const pre = M.analyser(Bw.slice(0, k)); essais++; const ref = pleine.events.filter(e => e.i < k).map(e => e.id + '|' + e.i + '|' + (e.profil ? e.profil.session + e.profil.corps + e.profil.h4 : '')); const got = pre.events.map(e => e.id + '|' + e.i + '|' + (e.profil ? e.profil.session + e.profil.corps + e.profil.h4 : '')); if (ref.join() !== got.join()) { bon = false; console.log('repaint au préfixe', k, ref.length, got.length); break; } }
  v(bon && essais > 250, 'non-repaint : les événements d\'un préfixe sont exactement ceux de la série entière (' + essais + ' préfixes) ; ' + pleine.events.length + ' événements'); v(['cassure', 'confirmee', 'fausse', 'rebond'].every(t => pleine.events.some(e => e.type === t)), 'les quatre sortes d\'événements apparaissent sur une longue série'); }
// sceau
{ const f = new URL('../front/or/ma-evenements-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/ma-evenements-v1.sceau.json', import.meta.url), 'utf8')); const sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(s.version === M.VERSION && s.sha256 === sha, 'sceau SHA-256 de ma-evenements-v1.js'); }
// statistiques publiées : cohérentes avec le sceau, aucun mot fort sans effectif
{ const st = JSON.parse(fs.readFileSync(new URL('../front/or/ma-stats.json', import.meta.url), 'utf8')), sc = JSON.parse(fs.readFileSync(new URL('../front/or/ma-evenements-v1.sceau.json', import.meta.url), 'utf8')); v(st.sha256 === sc.sha256, 'ma-stats.json calculé avec la règle scellée actuelle');
  let petit = true, mot = true; for (const t of Object.values(st.evenements)) for (const d of Object.values(t)) for (const c of Object.values(d)) { if (c.n < 30 && c.verdict !== 'pas assez de données') petit = false; if (/au-dessus/.test(c.verdict || '') && !(c.icPart[0] > c.basePart + 0.05)) mot = false; }
  v(petit && mot, 'n < 30 = « pas assez de données » ; « au-dessus de la base » seulement si la borne basse dépasse la base de 5 points'); v(st.gestion.rebond && st.gestion.fausse_cassure && st.gestion.tirages === 1000, 'test de gestion contre 1 000 tirages présent'); }
console.log(`ma-evenements : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
