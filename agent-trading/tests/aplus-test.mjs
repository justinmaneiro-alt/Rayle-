/* Tests de aplus-v1 : plan (stop 24 bougies borné 1,5–3 ATR, taille pour 0,25 % de 10 000 $), limites (3 par jour, 60 minutes), cinq conditions, phrase sans ordre, rejeu déterministe, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as AP from '../front/or/aplus-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5), g = prng(9), B = []; let c = 4000; for (let i = 0; i < 1400; i++) { const o = c; c = o + (g() - 0.5) * 8 + Math.sin(i / 45) * 3; B.push({ t: t0 + i * H, o, h: Math.max(o, c) + g() * 3, l: Math.min(o, c) - g() * 3, c, v: 50 + g() * 100 }); }
const A = new Array(B.length).fill(null); for (let i = 14; i < B.length; i++) { let s = 0; for (let k = i - 13; k <= i; k++) s += Math.max(B[k].h - B[k].l, Math.abs(B[k].h - B[k - 1].c), Math.abs(B[k].l - B[k - 1].c)); A[i] = s / 14; }
// plan
const pl = AP.plan(B, A, 800, 1); v(pl.distance >= 1.5 * A[800] - 1e-9 && pl.distance <= 3 * A[800] + 1e-9 && pl.stop < pl.entree, 'stop d\'achat sous l\'entrée, distance entre 1,5 et 3 ATR');
v(Math.abs(pl.risque$ - 25) < 1e-9 && Math.abs(pl.taille * pl.distance - 25) < 1e-9, 'taille : 25 $ (0,25 % de 10 000 $) / distance du stop'); const pv = AP.plan(B, A, 800, -1); v(pv.stop > pv.entree, 'stop de vente au-dessus de l\'entrée');
// limites
const ts = [Date.UTC(2026, 5, 1, 8), Date.UTC(2026, 5, 1, 9, 30), Date.UTC(2026, 5, 1, 11)]; v(AP.permis([], ts[0]) && !AP.permis([{ tCloture: ts[0] }], ts[0] + 30 * 60e3) && AP.permis([{ tCloture: ts[0] }], ts[1]), 'au moins 60 minutes entre deux alertes');
v(!AP.permis([{ tCloture: ts[0] }, { tCloture: ts[1] }, { tCloture: ts[2] }], Date.UTC(2026, 5, 1, 14)) && AP.permis([{ tCloture: ts[0] }, { tCloture: ts[1] }, { tCloture: ts[2] }], Date.UTC(2026, 5, 2, 8)), 'trois alertes par jour au plus, le compteur repart le lendemain (jour de Paris)');
// rejeu : déterministe, au plus 3 par jour, 60 minutes d'écart, condition 3 non évaluable
const r1 = AP.rejeu(B, { depuisI: 300 }), r2 = AP.rejeu(B, { depuisI: 300 }); v(JSON.stringify(r1.alertes.map(a => a.ev.id)) === JSON.stringify(r2.alertes.map(a => a.ev.id)) && r1.evenements.length > 6, 'rejeu déterministe (' + r1.evenements.length + ' événements, ' + r1.alertes.length + ' alertes)');
v(r1.evenements.every(e => e.conditions[2].ok === null && e.conditions.length === 5 && e.evaluables === 4), 'rejeu : condition 3 non évaluable, dite telle quelle');
const par = {}; for (const a of r1.alertes) { const j = new Date(a.tCloture).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }); par[j] = (par[j] || 0) + 1; } v(Object.values(par).every(x => x <= 3) && r1.alertes.every((a, k) => k === 0 || a.tCloture - r1.alertes[k - 1].tCloture >= 60 * 60e3), 'rejeu : limites respectées');
v(r1.alertes.every(a => a.conditions.filter(x => x.ok !== null).every(x => x.ok)), 'une alerte exige toutes les conditions évaluables');
// conditions en direct : carnet explicite
const ev = r1.evenements[5].ev, ctx = r1.ctx; v(AP.evaluer(ctx, ev, { carnet: true }).evaluables === 5 && AP.evaluer(ctx, ev, { carnet: false }).reunies === false, 'en direct les 5 conditions sont évaluées ; un carnet qui ne confirme pas bloque');
v(AP.evaluer(ctx, ev, { annonces: [B[ev.i].t + H + 10 * 60e3] }).conditions[4].ok === false, 'annonce majeure à 10 minutes : condition 5 fausse');
// résultat et phrase
const rs = AP.resultat(B, A, 800, 1, 12); v(rs && Number.isFinite(rs.R0) && rs.risque > 0, 'résultat à 12 bougies mesuré'); v(AP.resultat(B, A, 1398, 1, 12) === null, 'horizon non écoulé : pas de résultat');
const ph = AP.phrase({ ev: { dir: 1 }, plan: pl }, { n: 3, reussite: 0.6 }); v(/non prouvée : 3 alertes mesurées, il en faut 30/.test(ph) && /Ce n’est pas un ordre/.test(ph) && /0,25 %/.test(ph), 'phrase : taille pour 0,25 %, « non prouvée » sous 30 alertes, « pas un ordre » (' + ph.slice(0, 80) + '…)');
v(/Statistique réelle : 40 alertes, 55 %/.test(AP.phrase({ ev: { dir: -1 }, plan: pv }, { n: 40, reussite: 0.55 })), 'phrase : statistique réelle à partir de 30 alertes');
{ const f = new URL('../front/or/aplus-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/aplus-v1.sceau.json', import.meta.url), 'utf8')); v(s.version === AP.VERSION && s.sha256 === crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'), 'sceau SHA-256 de aplus-v1.js'); }
console.log(`aplus : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
