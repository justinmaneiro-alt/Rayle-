/* Tests de la structure de marché v1 : cas d'école (haussier, baissier, rebond, changement de caractère, retournement confirmé, invalidation), non-repaint sur des centaines de préfixes, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as S from '../front/or/structure-marche-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5);
// série à partir de points de passage (clôtures) : segments linéaires de `pas` bougies ; chaque bougie : mèches de 0,3
function serie(points, pas = 10, depart = 100) { const c = [depart], fins = []; let d = depart; for (const p of points) { for (let k = 1; k <= pas; k++) c.push(d + (p - d) * k / pas); fins.push([c.length - 1, p > d ? 1 : -1]); d = p; } const B = c.map((x, i) => { const o = i ? c[i - 1] : x; return { t: t0 + i * H, o, h: Math.max(o, x) + 0.3, l: Math.min(o, x) - 0.3, c: x, v: 100 }; }); for (const [i, s] of fins) { if (s > 0) B[i].h += 0.5; else B[i].l -= 0.5; } return B; }
const miroir = B => B.map(b => ({ ...b, o: 400 - b.o, h: 400 - b.l, l: 400 - b.h, c: 400 - b.c }));
const type = (R, t) => R.events.filter(e => e.type === t);
// zigzag haussier : creux 100, sommets 112, 118, 124 ; creux 106, 112
const montee = [112, 106, 118, 112, 124];
let B = serie(montee, 10), R = S.analyser(B); v(R.etat.tendance === 1, 'cas d\'école haussier : tendance haussière'); v(R.swings.some(s => s.type === 'H') && R.swings.some(s => s.type === 'L'), 'fractales détectées'); v(type(R, 'bos').some(e => e.dir === 1), 'cassure de structure haussière à la clôture au-dessus du dernier sommet');
const Rm = S.analyser(miroir(B)); v(Rm.etat.tendance === -1 && type(Rm, 'bos').some(e => e.dir === -1), 'cas d\'école baissier (miroir) : tendance baissière et cassure baissière');
// range : oscillation entre 100 et 110
const rg = S.analyser(serie([110, 100, 110, 100, 110, 100, 110, 100], 10)); v(rg.etat.tendance === 0, 'range : ni sommets ni creux croissants');
// rebond : repli de 3 ATR sans casser le creux protégé (112 → 118…124 → repli à 118)
B = serie([...montee, 118.5, 120], 10); R = S.analyser(B); const imp = type(R, 'impulsion'); v(imp.length >= 1 && imp[0].dir === -1 && imp[0].repliAtr >= 1.5 && imp[0].statut === 'actif', 'impulsion contre la tendance : rebond probable (repli ≥ 1,5 ATR, creux protégé intact)'); v(type(R, 'choch').length === 0, 'pas de changement de caractère');
v(imp[0].t === B[imp[0].i].t && imp[0].tCloture === imp[0].t + H, 'l\'événement est posé à la clôture de sa bougie');
// changement de caractère : la clôture passe sous le creux protégé 112
B = serie([...montee, 108], 10); R = S.analyser(B); const ch = type(R, 'choch'); v(ch.length === 1 && ch[0].dir === -1 && ch[0].niveau > 110 && B[ch[0].i].c < ch[0].niveau && B[ch[0].i - 1].c >= ch[0].niveau, 'CHoCH baissier à la première clôture sous le creux protégé'); v(ch[0].extreme >= 124, 'extrême de l\'impulsion = plus haut 124'); v(type(R, 'confirme').length === 0, 'pas de retournement confirmé sans rebond puis nouvelle cassure');
// retournement confirmé : CHoCH puis rebond (jusqu'à 116 < 124) puis nouvelle cassure sous le plus bas
B = serie([...montee, 108, 116, 100], 10); R = S.analyser(B); const cf = type(R, 'confirme'); v(cf.length === 1 && cf[0].dir === -1 && B[cf[0].i].c < cf[0].niveau && cf[0].ref === type(R, 'choch')[0].id, 'retournement confirmé : rebond sous l\'extrême puis clôture sous le plus bas'); v(type(R, 'choch')[0].statut === 'actif', 'le CHoCH confirmé n\'est pas invalidé');
const Rc = S.analyser(miroir(B)); v(type(Rc, 'confirme').length === 1 && type(Rc, 'confirme')[0].dir === 1, 'retournement confirmé haussier (miroir)');
// invalidation : après le CHoCH le prix reprend 124 en clôture avant toute confirmation
B = serie([...montee, 108, 126], 10); R = S.analyser(B); const ci = type(R, 'choch')[0]; v(ci && ci.statut === 'invalide' && ci.tInval > ci.t && /extrême/.test(ci.raisonInval), 'invalidation : la clôture reprend l\'extrême de l\'impulsion'); v(type(R, 'confirme').length === 0, 'rien n\'est confirmé après invalidation');
// l'invalidation ne déplace jamais l'événement
const R2 = S.analyser(serie([...montee, 108], 10)); v(R2.events.find(e => e.type === 'choch').i === ci.i, 'la bougie du CHoCH ne bouge pas quand il est invalidé plus tard');
// non-repaint : des centaines de préfixes d'une série aléatoire
const rnd = prng(321), W = []; let p = 1000; for (let i = 0; i < 2500; i++) { const o = p; p += (rnd() - 0.5) * 6 + Math.sin(i / 70) * 1.2; W.push({ t: t0 + i * H, o, h: Math.max(o, p) + rnd() * 2, l: Math.min(o, p) - rnd() * 2, c: p, v: 100 }); }
const cle = e => [e.type, e.dir, e.i, e.niveau, e.extreme].join('|'), full = S.analyser(W), nEv = full.events.length; v(nEv > 30, `assez d'événements pour tester (${nEv})`); let bad = 0, prefixes = 0;
for (let k = 0; k < 400; k++) { const m = 60 + Math.floor(rnd() * (W.length - 60)), pre = S.analyser(W.slice(0, m)), a = pre.events.map(cle).join(','), b = full.events.filter(e => e.i < m).map(cle).join(','); prefixes++; if (a !== b) bad++; if (pre.tendance.join('') !== full.tendance.slice(0, m).join('')) bad++; }
v(bad === 0 && prefixes === 400, `non-repaint : ${prefixes} préfixes identiques (événements et tendance)`);
// H4 par agrégation
const h4 = S.agreger(W.slice(0, 400), 4 * H); v(h4.length >= 99 && h4[0].h >= W[0].h && h4[0].l <= W[0].l, 'agrégation H4'); v(S.analyser(h4, { periode: 4 * H }).events.every(e => e.tCloture === e.t + 4 * H), 'tCloture H4');
// sceau SHA-256
const sceau = JSON.parse(fs.readFileSync(new URL('../front/or/structure-marche-v1.sceau.json', import.meta.url), 'utf8')); const src = fs.readFileSync(new URL('../front/or/structure-marche-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); v(sceau.sha256 === crypto.createHash('sha256').update(src).digest('hex'), 'sceau SHA-256 de structure-marche-v1.js conforme');
// statistiques mesurées (structure-marche-stats.json) : forme, n < 30 = « pas assez de données », aucun chiffre sans effectif
const st = JSON.parse(fs.readFileSync(new URL('../front/or/structure-marche-stats.json', import.meta.url), 'utf8')); let formes = true, coh = true;
for (const tf of ['H1', 'H4']) for (const ty of ['impulsion', 'choch', 'confirme']) for (const fen of ['recent', 'long']) { const x = st[tf] && st[tf][ty] && st[tf][ty][fen]; if (!x) { formes = false; continue; } if (x.assez !== (x.n >= 30)) coh = false; for (const N of [6, 12, 24]) for (const c of ['r', 'q']) { const q = x[c + N]; if (!q || q.n !== x.n || (q.p != null && (q.p < 0 || q.p > 1)) || !(q.ic[0] <= (q.p ?? 0) + 1e-9 && q.ic[1] >= (q.p ?? 1) - 1e-9)) formes = false; if (!x.base[c + N] || x.base[c + N].n < 1) formes = false; } }
v(formes, 'statistiques : 2 unités × 3 situations × 2 fenêtres × 3 horizons × 2 mesures, avec intervalle de confiance, effectif et base'); v(coh, 'statistiques : « assez de données » ⇔ n ≥ 30'); v(st.sha256_module === sceau.sha256, 'statistiques calculées avec le module scellé');
const pas = S.phraseStats(st, 'H4', 'confirme', 'recent'); v(pas.assez === false && /pas assez de données/.test(pas.texte), 'n < 30 : « pas assez de données »'); const ok1 = S.phraseStats(st, 'H1', 'choch', 'long'); v(ok1.assez && /\d+ cas/.test(ok1.texte) && /base/.test(ok1.texte), 'phrase de statistiques avec effectif et base');
console.log(`structure de marché : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
