/* Tests de golden-v1 : zone 61,8–78,6 % du dernier élan (achat après un élan haussier, vente après un élan baissier), élan minimal, invalidation, non-repaint sur des préfixes, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as G from '../front/or/golden-v1.js'; import { analyser, atrSerie } from '../front/or/structure-marche-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5);
const chemin = (pts, d0 = 100) => { const c = [d0]; let d = d0; for (const [fin, n] of pts) { for (let k = 1; k <= n; k++) c.push(d + (fin - d) * k / n); d = fin; } return c; };
const barres = cl => cl.map((c, i) => { const o = i ? cl[i - 1] : c; return { t: t0 + i * H, o, h: c + 0.3, l: c - 0.3, c }; });
// élan haussier 100 → 130 puis repli : zone d'achat entre 130 − 0,786×30 = 106,42 et 130 − 0,618×30 = 111,46
let B = barres(chemin([[115, 6], [100, 8], [130, 20], [118, 12]])), S = analyser(B, { periode: H }).swings, A = atrSerie(B), z = G.golden(B, S, A);
v(z && z.cote === 'achat' && Math.abs(z.bas - 106.42) < 0.5 && Math.abs(z.haut - 111.46) < 0.5, 'élan haussier : zone d\'achat 106,4–111,5 (' + (z && z.bas.toFixed(2) + '–' + z.haut.toFixed(2)) + ')');
v(z && !z.invalide && z.tPose > B[0].t && /^Golden zone d’achat/.test(G.etiquette(z)), 'posée à la confirmation du sommet, non invalidée');
// prix dans la zone
B = barres(chemin([[115, 6], [100, 8], [130, 20], [109, 12]])); z = G.golden(B, analyser(B, { periode: H }).swings, atrSerie(B)); v(z && z.dansLaZone, 'prix dans la zone : détecté');
// élan baissier 130 → 100 puis rebond : zone de vente 100 + 0,618×30 = 118,54 à 123,58
B = barres(chemin([[85, 6], [130, 8], [100, 20], [112, 12]])); z = G.golden(B, analyser(B, { periode: H }).swings, atrSerie(B)); v(z && z.cote === 'vente' && Math.abs(z.bas - 118.54) < 0.5 && Math.abs(z.haut - 123.58) < 0.5, 'élan baissier : zone de vente 118,5–123,6');
// invalidation : clôture sous l'origine 100
B = barres(chemin([[115, 6], [100, 8], [130, 20], [118, 12], [98, 10]])); z = G.golden(B, analyser(B, { periode: H }).swings, atrSerie(B)); v(!z || z.invalide || z.cote !== 'achat', 'clôture sous l\'origine de l\'élan : invalidée (ou remplacée par un nouvel élan)');
// élan trop petit
B = barres(chemin([[100.2, 6], [100, 8], [100.4, 20], [100.2, 12]])); v(G.golden(B, analyser(B, { periode: H }).swings, atrSerie(B)) === null, 'élan de moins de 2 ATR : aucune zone');
// non-repaint : la zone posée à k ne dépend pas de la suite
{ const g = prng(5), cl = []; let c = 100; for (let i = 0; i < 900; i++) { c += (g() - 0.5) * 3 + Math.sin(i / 25) * 0.9; cl.push(c); } const Bf = barres(cl), Sf = analyser(Bf, { periode: H }).swings, Af = atrSerie(Bf); let bon = true, n = 0;
  for (let k = 120; k <= 900; k += 5) { const a = G.golden(Bf.slice(0, k), analyser(Bf.slice(0, k), { periode: H }).swings, atrSerie(Bf.slice(0, k))), b = G.golden(Bf.slice(0, k), Sf.filter(s => s.conf <= k - 1), Af.slice(0, k)); n++; if (JSON.stringify(a && [a.id, a.bas, a.haut, a.tPose, a.tInval]) !== JSON.stringify(b && [b.id, b.bas, b.haut, b.tPose, b.tInval])) { bon = false; break; } }
  v(bon && n > 150, `non-repaint : zone identique avec la série tronquée (${n} préfixes)`); }
{ const f = new URL('../front/or/golden-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/golden-v1.sceau.json', import.meta.url), 'utf8')); v(s.version === G.VERSION && s.sha256 === crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'), 'sceau SHA-256 de golden-v1.js'); }
console.log(`golden : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
