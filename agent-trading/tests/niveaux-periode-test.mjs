/* Tests des niveaux de la période affichée, de la liquidité et des flèches de rebond : node agent-trading/tests/niveaux-periode-test.mjs
   Dont le test d'ABSENCE DE REDESSIN : l'historique est rejoué bougie par bougie ; les flèches déjà posées ne changent jamais. */
import assert from 'node:assert/strict';
import { pivots, niveauxPeriode, liquidite, fleches, bilanFleches, REGLES_FLECHES } from '../front/or/niveaux-periode.js';
import { nomClair } from '../front/or/reperes-or.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 6, 1);
const bougie = (i, o, h, l, c, v = 100, pas = H) => ({ t: T0 + i * pas, o, h, l, c, v });
const fin = (B, pas = H) => B[B.length - 1].t + pas;

// pivots : sommet = plus haut strict des k bougies de chaque côté
const P5 = [1, 2, 5, 2, 1, 2, 3, 2, 1].map((x, i) => bougie(i, x, x + 0.5, x - 0.5, x));
eq(pivots(P5, 2, 0, 8).map(p => `${p.sorte}@${p.i}`), ['sommet@2', 'creux@4', 'sommet@6'], 'sommets et creux confirmés');
eq(pivots(P5, 2, 0, 8, 5).length, 1, 'un pivot n’est confirmé qu’après k bougies');

// onde régulière en H1 sur 40 jours : sommets ~2100, creux ~1900 → une résistance et un support forts ; jamais deux bandes à moins de 1 ATR
const r = alea(3), onde = [];
for (let i = 0; i < 40 * 24; i++) { const m = 2000 + 100 * Math.sin(i / 12) + (r() - 0.5) * 6, o = m + (r() - 0.5) * 8; onde.push(bougie(i, o, Math.max(o, m) + 4 + r() * 3, Math.min(o, m) - 4 - r() * 3, m, 50 + r() * 100)); }
const N = niveauxPeriode(onde, { periode: 'H1', maintenant: fin(onde), prix: 2000 });
const R_ = N.bandes.filter(b => b.cote === 'resistance'), S_ = N.bandes.filter(b => b.cote === 'support');
ok(R_.length >= 1 && R_.length <= 4 && S_.length >= 1 && S_.length <= 4, `au plus 4 au-dessus et 4 au-dessous (${R_.length} / ${S_.length})`);
ok(R_.some(b => b.fort && b.haut > 2085 && b.touches >= 5), 'résistance forte sur les sommets répétés');
ok(S_.some(b => b.fort && b.bas < 1915 && b.touches >= 5), 'support fort sur les creux répétés');
const tri = N.bandes.slice().sort((x, y) => x.bas - y.bas);
ok(tri.every((b, i) => !i || b.bas - tri[i - 1].haut >= N.a - 1e-9), 'deux bandes affichées sont espacées d’au moins 1 ATR');
ok(N.bandes.every(b => /^(Résistance|Support) [\d ]+(–[\d ]+)? · \d+ touches?$/.test(b.texte)), 'étiquettes courtes en français');
const hi = Math.max(...onde.slice(-150).map(b => b.h)), lo = Math.min(...onde.slice(-150).map(b => b.l));
ok(N.bandes.some(b => hi >= b.bas - N.a && hi <= b.haut + N.a) && N.bandes.some(b => lo >= b.bas - N.a && lo <= b.haut + N.a), 'plus haut et plus bas visibles couverts par une bande');
ok(N.bandes.filter(b => b.fort).length <= 4, 'au plus 2 bandes fortes par côté');

// liquidité : deux sommets égaux, puis une bougie qui les dépasse (balayage)
const L0 = [];
for (let i = 0; i < 80; i++) { const m = 1000 + 20 * Math.sin(i / 4); L0.push(bougie(i, m, m + 2, m - 2, m)); }
const zone = (B, max) => liquidite(B, { periode: 'H1', maintenant: fin(B), prix: 1000, a: 3, i0: 0 });
const avant = zone(L0);
ok(avant.zones.some(z => z.sorte === 'haute' && z.raisons.includes('sommets égaux') && /^Liquidité haute [\d ]+ \(.*sommets égaux/.test(z.texte)), 'sommets égaux → « Liquidité haute … (sommets égaux) »');
const pointe = [...L0, bougie(80, 1018, 1030, 1015, 1016)], apres = zone(pointe);
ok(!apres.zones.some(z => z.raisons.includes('sommets égaux') && z.sorte === 'haute' && z.p < 1030), 'la zone balayée disparaît');
ok(apres.balayages.some(b => b.sorte === 'haute' && b.t === pointe[80].t), 'une marque reste sur la bougie qui l’a balayée');

// flèche : le prix touche une résistance, puis une bougie clôture à l'écart avec une mèche de rejet et un volume ≥ médiane
const F0 = [];
for (let i = 0; i < 60; i++) { const m = 1000 + 30 * Math.sin(i / 5); F0.push(bougie(i, m - 1, m + 2, m - 2, m, 100)); }
const res = Math.max(...F0.slice(0, 50).map(b => b.h));
const rejet = (v, iSup = 0) => [...F0, bougie(60 + iSup, res - 6, res + 0.2, res - 7, res - 6.5, v)];
const f1 = fleches(rejet(500), { periode: 'H1', maintenant: fin(rejet(500)) });
ok(f1.some(f => f.i === 60 && f.sens === 'baisse'), 'flèche rouge sur la bougie de confirmation (résistance)');
ok(!fleches(rejet(10), { periode: 'H1', maintenant: fin(rejet(10)) }).some(f => f.i === 60), 'pas de flèche si le volume est sous la médiane');
const enCours = rejet(500); ok(!fleches(enCours, { periode: 'H1', maintenant: fin(enCours) - 60e3 }).some(f => f.i === 60), 'aucune flèche sur une bougie pas encore close');

// ABSENCE DE REDESSIN : marche au hasard de 700 bougies M15, rejouée bougie par bougie
const M = [], ra = alea(11); let p = 2000;
for (let i = 0; i < 700; i++) { const o = p, c = o + (ra() - 0.5) * 6, h = Math.max(o, c) + ra() * 4, l = Math.min(o, c) - ra() * 4; M.push(bougie(i, o, h, l, c, 50 + ra() * 150, 15 * 60e3)); p = c; }
const tout = fleches(M, { periode: 'M15', maintenant: fin(M, 15 * 60e3) }), cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`;
ok(tout.length >= 5, `des flèches sur la marche au hasard (${tout.length})`);
let ecarts = 0;
for (let i = 40; i < M.length; i++) {
  const pref = M.slice(0, i + 1), F = fleches(pref, { periode: 'M15', maintenant: fin(pref, 15 * 60e3) });
  const attendu = tout.filter(f => f.i <= i).map(cle).join(';'), vu = F.map(cle).join(';');
  if (attendu !== vu) ecarts++;
}
eq(ecarts, 0, 'rejeu bougie par bougie : les flèches ne changent jamais, ne bougent jamais, ne disparaissent jamais');
// attente de 60 minutes sur le même niveau (M5)
const tropProches = tout.some((f, i) => tout.some((g, j) => j > i && g.sens === f.sens && Math.abs(g.niveau - f.niveau) < 0.5 * f.atr && g.t - f.t < REGLES_FLECHES.attenteMin * 60e3));
ok(!tropProches, '60 minutes avant une autre flèche sur le même niveau');

// bilan honnête
eq(bilanFleches(M, tout.slice(0, 5), { periode: 'M15', maintenant: fin(M, 15 * 60e3) }).assez, false, 'moins de 30 flèches : pas assez de données');
const grand = []; let q = 2000; const rg = alea(5);
for (let i = 0; i < 4000; i++) { const o = q, c = o + (rg() - 0.5) * 6, h = Math.max(o, c) + rg() * 4, l = Math.min(o, c) - rg() * 4; grand.push(bougie(i, o, h, l, c, 50 + rg() * 150, 15 * 60e3)); q = c; }
const Fg = fleches(grand, { periode: 'M15', maintenant: fin(grand, 15 * 60e3) }), Bg = bilanFleches(grand, Fg, { periode: 'M15', maintenant: fin(grand, 15 * 60e3) });
ok(Bg.assez && Bg.tirages > 900 && /au hasard aux mêmes heures/.test(Bg.texte) && !/\bR\b|gain|promesse de/.test(Bg.texte.replace('pas une promesse', '')), `bilan contre le hasard, sans gain en R (${Bg.texte.slice(0, 90)}…)`);

eq(nomClair('Londres haut'), 'plus haut de la séance de Londres'); eq(nomClair('Rond 4100'), 'niveau rond 4 100');
console.log(`niveaux-periode-test : ${n} vérifications OK`);
