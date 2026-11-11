/* Tests de niveaux-majeurs-v1 : niveaux (veille, semaine, mois, profils, ronds), fusion à 0,5 ATR journalier, écart d'1 ATR, 3 meilleures de chaque côté, étiquette courte, causalité (non-repaint), sceau SHA-256, statistiques publiées. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as N from '../front/or/niveaux-majeurs-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5), g = prng(3), B = []; let c = 4000; for (let i = 0; i < 24 * 100; i++) { const o = c; c = o + (g() - 0.5) * 6 + Math.sin(i / 60) * 1.2; B.push({ t: t0 + i * H, o, h: Math.max(o, c) + g() * 2, l: Math.min(o, c) - g() * 2, c, v: 50 + g() * 100 }); }
const ctx = N.preparer(B), i = B.length - 1, r = N.niveauxMajeurs(ctx, i);
v(r.atrj > 0 && r.zones.length > 5, 'niveaux calculés (' + r.zones.length + ' zones, ATR journalier ' + (r.atrj && r.atrj.toFixed(1)) + ')');
const types = new Set(N.niveauxBruts(ctx, i).niveaux.map(x => x.type)); v(['veille', 'semaine', 'mois', 'profil_semaine', 'profil_mois'].every(t => types.has(t)) && (types.has('rond50') || types.has('rond100')), 'types : veille, semaine, mois, profils hebdo et mensuel, nombres ronds (' + [...types] + ')');
const nb = N.niveauxBruts(ctx, i).niveaux; const ronds = nb.filter(x => x.type.startsWith('rond')); v(ronds.every(x => x.p % 50 === 0) && ronds.filter(x => x.type === 'rond100').every(x => x.p % 100 === 0), 'ronds : multiples de 50 et de 100');
// fusion
const fz = N.fusionner([{ p: 100, type: 'veille', tf: 1, t: 0, nom: 'a' }, { p: 102, type: 'semaine', tf: 2, t: 0, nom: 'b' }, { p: 110, type: 'mois', tf: 3, t: 0, nom: 'c' }], 10); v(fz.length === 2 && fz[0].membres.length === 2 && fz[0].types.length === 2, 'fusion : deux niveaux à 0,2 ATR en une zone, le troisième à part');
// sélection : 3 de chaque côté, écart d'1 ATR
const zs = Array.from({ length: 20 }, (_, k) => ({ centre: 4000 + (k - 10) * 3, bas: 4000 + (k - 10) * 3, haut: 4000 + (k - 10) * 3, score: 20 - Math.abs(k - 9.5), types: ['veille'], membres: [{ type: 'veille', tf: 1, p: 4000, nom: 'Haut de la veille', t: 0 }] })), s = N.selectionner(zs, 4000, 10);
v(s.haut.length <= 3 && s.bas.length <= 3 && s.haut.length + s.bas.length >= 4, 'au plus 3 zones au-dessus et 3 en dessous'); const ecart = L => L.every((a, k) => L.every((b, q) => k === q || Math.abs(a.centre - b.centre) >= 10 - 1e-9)); v(ecart(s.haut) && ecart(s.bas), 'écart minimal d\'un ATR journalier entre deux zones affichées');
v(r.haut.every(z => z.bas > B[i].c) && r.bas.every(z => z.haut < B[i].c) && r.haut.length <= 3 && r.bas.length <= 3, 'au-dessus / en dessous du prix, 3 au plus de chaque côté');
v(r.zones.every(z => Number.isFinite(z.score) && z.touches >= 0 && z.poids > 0), 'score : poids, touches, ancienneté, volume');
v(/^[A-Za-zÀ-ÿ0-9\/\. ]+ [\d ]+( \+\d)?$/.test(N.etiquette(r.haut[0] || r.bas[0])) && N.etiquette(r.haut[0] || r.bas[0]).length < 30, 'étiquette courte : ' + N.etiquette(r.haut[0] || r.bas[0]));
// causalité : ajouter des bougies futures ne change pas les niveaux d'une bougie passée
{ const k = 24 * 60 + 5, a = N.niveauxMajeurs(N.preparer(B.slice(0, k + 1)), k), b = N.niveauxMajeurs(ctx, k); const f = x => JSON.stringify([x.haut.map(z => [z.centre, z.score]), x.bas.map(z => [z.centre, z.score])]); v(f(a) === f(b), 'non-repaint : mêmes niveaux et mêmes scores avec la série tronquée'); }
{ const f = new URL('../front/or/niveaux-majeurs-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/niveaux-majeurs-v1.sceau.json', import.meta.url), 'utf8')), sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(s.version === N.VERSION && s.sha256 === sha, 'sceau SHA-256');
  const j = JSON.parse(fs.readFileSync(new URL('../front/or/niveaux-majeurs-stats.json', import.meta.url), 'utf8')); v(j.sha256 === sha && j.types.aleatoire && N.TYPES.every(t => j.types[t]), 'statistiques calculées avec la règle scellée, un taux par type et pour des niveaux aléatoires'); v(Object.values(j.types).every(t => ['recent', 'long'].every(f => t[f].nT >= 30 || t[f].verdict === 'pas assez de données')), 'n < 30 = pas assez de données'); }
console.log(`niveaux-majeurs : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
