/* Test pur : registre des flèches Daily sur l'appareil. Usage : node trader-pro/tests/fleches-registre-test.mjs */
import assert from 'node:assert/strict';
import { flechesDe, nouvellesFleches, lireRegistre, barresDaily, CLE_REGISTRE } from '../terminal/fleches-registre.js';
import { RETENUE, calculer, J } from '../terminal/fleches-daily.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, egal = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const faux = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
function graine(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function serie(N, t0) { const r = graine(9), B = []; let c = 1000; for (let i = 0; i < N; i++) { const o = c, d = (r() - 0.5) * 14 + Math.sin(i / 38) * 9; c = Math.max(50, o + d); B.push({ t: t0 + i * J, o, h: Math.max(o, c) + r() * 6, l: Math.min(o, c) - r() * 6, c, v: 0 }); } return B; }
const t0 = Date.UTC(2021, 0, 4), B = serie(1100, t0), fin = B[B.length - 1].t + J + 3600e3;
/* week-end : écarté pour l'or et les indices, gardé pour le Bitcoin */
const j7 = Array.from({ length: 14 }, (_, i) => ({ t: Date.UTC(2026, 0, 5) + i * J, o: 1, h: 1, l: 1, c: 1 })); ok(barresDaily('or', j7).every(b => ![0, 6].includes(new Date(b.t).getUTCDay())) && barresDaily('or', j7).length === 10, 'or : pas de samedi ni de dimanche'); egal(barresDaily('btc', j7).length, 14, 'bitcoin : 7 jours sur 7');
const st = faux(); const reg = flechesDe('btc', B, { maintenant: fin, stockage: st });
const attendu = calculer(B, RETENUE.methode, RETENUE.params); egal(reg.length, attendu.length, 'le registre contient les flèches de la méthode retenue'); ok(reg.length > 5, 'des flèches (' + reg.length + ')');
egal(lireRegistre('btc', st).length, reg.length, 'registre écrit sur l’appareil'); ok(st.m.has(CLE_REGISTRE('btc')), 'clé de stockage');
const reg2 = flechesDe('btc', B, { maintenant: fin, stockage: st }); egal(reg2.map(f => f.id), reg.map(f => f.id), 'relire ne change rien');
/* la bougie du jour en cours est écartée : à la veille de la clôture, la dernière flèche possible n'existe pas encore */
const tot = flechesDe('btc', B, { maintenant: B[B.length - 1].t + 0.5 * J, stockage: faux() }); ok(tot.length <= reg.length, 'sans la bougie du jour en cours');
/* alertes : une flèche récente et jamais annoncée est annoncée UNE fois */
const last = reg[reg.length - 1], proche = last.tCloture + 2 * 3600e3, a1 = nouvellesFleches('btc', reg, { maintenant: proche, stockage: st }); ok(a1.some(f => f.id === last.id), 'la flèche de la veille est nouvelle');
egal(nouvellesFleches('btc', reg, { maintenant: proche + 3600e3, stockage: st }).length, 0, 'une flèche n’est annoncée qu’une fois');
ok(a1.every(f => proche - f.tCloture < 36 * 3600e3), 'jamais une flèche de plus de 36 h');
const st2 = faux(); const regV = flechesDe('btc', B, { maintenant: fin, stockage: st2 }); egal(nouvellesFleches('btc', regV, { maintenant: fin + 40 * 24 * 3600e3, stockage: st2 }).length, 0, 'une vieille flèche n’est pas annoncée'); ok(regV.every(f => f.vueLe), 'et elle est marquée vue');
/* données insuffisantes */
egal(flechesDe('btc', B.slice(0, 30), { maintenant: fin, stockage: faux() }), [], 'moins de 60 bougies : aucune flèche, rien d’inventé');
console.log(`fleches-registre-test : ${n} vérifications, tout passe`);
