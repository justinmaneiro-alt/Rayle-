/* Flèches de lecture (fleches-lecture-v1) : pas de grappe, plafond, aucune flèche sans MA200 ou gros niveau, aucun repaint, scénarios fabriqués, sceau. node agent-trading/tests/fleches-lecture-test.mjs */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as FL from '../front/or/fleches-lecture-v1.js';
import { charger } from '../recherche-or/donnees.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
v('sceau de fleches-lecture-v1', sha(path.join(ici, '../front/or/fleches-lecture-v1.js')) === JSON.parse(fs.readFileSync(path.join(ici, '../front/or/fleches-lecture-v1.sceau.json'), 'utf8')).sha256, 'le fichier a changé depuis le sceau');

/* ── données réelles : XAU/USD H1 2025-2026 ── */
const D = charger({ debut: 2025, fin: 2026 }), B = D.h1.filter(b => !(b.h === b.l && !b.v)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), now = B[B.length - 1].t + H;
const R = FL.calculer(B, { maintenant: now, jours: null }), F = R.fleches;
v('des flèches sont produites sur l’historique', F.length > 20, String(F.length));
let grappes = 0; for (let k = 1; k < F.length; k++) if (F[k].i - F[k - 1].i < FL.P.grappe) grappes++;
v('(i) jamais plus d’une flèche par fenêtre de 12 bougies', grappes === 0, grappes + ' grappes');
let max = 0; for (let d = 0; d + 600 <= B.length; d += 6) max = Math.max(max, F.filter(f => f.i >= d && f.i < d + 600).length);
v('(ii) au plus 12 flèches visibles sur 600 bougies H1', max <= 12, 'maximum ' + max);
v('(iii) chaque flèche est liée à la MA200 ou à un gros niveau', F.every(f => (f.source === 'MA200' && f.type.startsWith('ma_')) || (f.type.startsWith('niv_') && f.zone && f.source)));
v('types autorisés seulement', F.every(f => Object.keys(FL.TYPES).includes(f.type)));
v('aucune flèche VWAP / POC / veille / ronde dans les types', !Object.keys(FL.TYPES).some(t => /vwap|poc|veille|semaine|rond|propos/i.test(t)));
v('flèches posées à la clôture de leur bougie', F.every(f => f.tCloture === B[f.i].t + H));
// aucun repaint : rejouer bougie par bougie sur les 300 dernières bougies
let ecarts = 0; const cle = f => f.id; const tout = F.map(cle), pas = 300;
for (let i = B.length - pas; i < B.length; i += 7) { const pref = B.slice(0, i + 1), r = FL.calculer(pref, { maintenant: pref[i].t + H, jours: null }); const avant = r.fleches.map(cle), attendu = tout.filter((id, k) => F[k].i <= i && !F[k].masquee); if (avant.join(';') !== attendu.join(';')) ecarts++; }
v('aucun repaint (rejeu bougie par bougie)', ecarts === 0, ecarts + ' différences');
v('résultat mesuré à 6, 12 et 24 bougies (null tant que non clos)', F.every(f => f.resultat && Object.keys(f.resultat).join() === '6,12,24'));
const bil = FL.bilan(B, F); v('bilan : « pas assez de données » sous 30', Object.values(bil).every(o => Object.values(o.horizons).every(h => h.n >= 30 || h.texte === 'pas assez de données')));

/* ── scénarios fabriqués (ATR ≈ 1, MA200 ≈ 100) ── */
const bar = (i, o, h, l, c) => ({ t: Date.UTC(2026, 0, 1) + i * H, o, h, l, c, v: 100 });
function plat(n, niveau = 100, amp = 0.5) { const L = []; for (let i = 0; i < n; i++) { const c = niveau + (i % 2 ? amp : -amp) * 0.3; L.push(bar(i, c, c + amp, c - amp, c)); } return L; }
{ // fausse cassure : clôture au-dessus puis retour dans les 6 bougies → AUCUNE flèche MA200
  const L = plat(260); const n = L.length; L.push(bar(n, 100, 101.6, 99.9, 101.5)); L.push(bar(n + 1, 101.5, 102, 101, 101.8)); L.push(bar(n + 2, 101.8, 102, 99, 99.5)); for (let k = 3; k < 12; k++) L.push(bar(n + k, 99.6, 100.1, 99.2, 99.7));
  const r = FL.calculer(L, { maintenant: L[L.length - 1].t + H, jours: null, avecNiveaux: false });
  v('fausse cassure (retour sous 6 bougies) : aucune flèche', r.toutes.filter(f => f.type === 'ma_cassure').length === 0, JSON.stringify(r.toutes.map(f => f.type)));
}
{ // cassure confirmée : 6 clôtures au-dessus à ≥ 0,3 ATR → une flèche à la 6e bougie, puis repos de 24 bougies
  const L = plat(230); for (let k = 0; k < 30; k++) L.push(bar(230 + k, 98.5, 98.9, 98.1, 98.5)); const n = L.length; for (let k = 0; k < 14; k++) L.push(bar(n + k, 101.4, 102.2, 101.2, 101.6 + k * 0.05));
  const r = FL.calculer(L, { maintenant: L[L.length - 1].t + H, jours: null, avecNiveaux: false }), c = r.toutes.filter(f => f.type === 'ma_cassure');
  v('cassure confirmée : une seule flèche, à la 6e bougie après la cassure', c.length === 1 && c[0].i === n + FL.P.confirmation, JSON.stringify(c.map(f => f.i - n)));
  v('cassure confirmée : posée à la clôture, dans le sens de la cassure', c.length === 1 && c[0].dir > 0);
}
{ // cassure trop faible (< 0,3 ATR) : rien
  const L = plat(260); const n = L.length; for (let k = 0; k < 14; k++) L.push(bar(n + k, 100.2, 100.5, 100, 100.15));
  const r = FL.calculer(L, { maintenant: L[L.length - 1].t + H, jours: null, avecNiveaux: false });
  v('clôture à moins de 0,3 ATR de la MA : pas de cassure', r.toutes.filter(f => f.type === 'ma_cassure').length === 0);
}
{ // niveau : contact, 2 bougies dans le sens du rebond → signal précoce ; une seule flèche par touche
  const zone = { id: 'z1', bas: 119.5, haut: 120.5, nom: 'Support test', type: 'niveau_rebond' }, L = []; for (let i = 0; i < 30; i++) L.push(bar(i, 130, 130.6, 129.4, 130));
  const A = Array(L.length).fill(1);
  L.push(bar(30, 124, 124.5, 120.7, 120.8)); L.push(bar(31, 120.8, 121.2, 120.6, 120.85)); L.push(bar(32, 120.85, 121.3, 120.7, 120.92)); L.push(bar(33, 120.9, 122.5, 120.8, 122.2)); for (let k = 34; k < 45; k++) L.push(bar(k, 122.2, 122.6, 122.0, 122.4)); A.length = 0; for (let i = 0; i < L.length; i++) A.push(1);
  const r = FL.evenementsNiveaux(L, A, () => [zone]);
  v('niveau : contact enregistré (sans flèche à lui seul)', r.contacts.length >= 1);
  v('niveau : 2 bougies dans le sens du rebond = signal précoce, une seule flèche', r.fleches.length === 1 && r.fleches[0].type === 'niv_precoce', JSON.stringify(r.fleches.map(f => f.type)));
  v('niveau : la réaction ≥ 0,5 ATR vient ensuite : l’infobulle du signal précoce l’indique, sans seconde flèche', r.fleches.length === 1 && !!r.fleches[0].confirmeT && FL.detail(r.fleches[0]).some(x => /CONFIRMÉ/.test(x)));
  const L2 = L.slice(0, 31); L2.push(bar(31, 121.2, 123.5, 121.0, 123.2)); for (let k = 32; k < 40; k++) L2.push(bar(k, 123.2, 123.6, 122.8, 123.3));
  const r2 = FL.evenementsNiveaux(L2, Array(L2.length).fill(1), () => [zone]); v('niveau : réaction ≥ 0,5 ATR = rebond confirmé', r2.fleches.length === 1 && r2.fleches[0].type === 'niv_confirme', JSON.stringify(r2.fleches.map(f => f.type)));
}
{ // grappes : deux flèches à moins de 12 bougies → la seconde est masquée ; au-delà de 600 : plafond
  const f = (i, type) => ({ i, type, dir: 1 }); const d = FL.demasquer([f(100, 'niv_confirme'), f(105, 'ma_rebond'), f(120, 'niv_confirme')]);
  v('grappe : la seconde flèche (5 bougies plus tard) est masquée', d[0].masquee === false && d[1].masquee === true && d[2].masquee === false);
  const beaucoup = FL.demasquer(Array.from({ length: 40 }, (_, k) => f(k * 13, 'ma_rebond'))); v('plafond : 12 au plus sur 600 bougies', Math.max(...beaucoup.map(x => beaucoup.filter(y => !y.masquee && y.i >= x.i && y.i < x.i + 600).length)) <= 12);
}
console.log(`fleches-lecture : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
