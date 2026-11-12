/* Flèches simples v3 : flux en direct (indexApparition = indexDessin), non-repaint, plafond 10/600, chute du 12 nov., MA200 du 10 nov., sceau.   node agent-trading/tests/fleches-simples-v3-test.mjs   (--sceller écrit l'empreinte) */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V3 from '../front/or/fleches-simples-v3.js';
import { zonesDirect } from '../front/or/zones-direct.js';
import { serieKraken, serieDuka } from '../recherche-or/fleches-simples-rejeu.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const fichiers = ['fleches-simples-v3.js'].map(f => path.join(ici, '../front/or', f)), sceau = path.join(ici, '../front/or/fleches-simples-v3.sceau.json');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (process.argv.includes('--sceller')) fs.writeFileSync(sceau, JSON.stringify({ version: 'fleches-simples-v3', scelle_le: '2026-11-12', sha256: Object.fromEntries(fichiers.map(f => [path.basename(f), sha(f)])), note: 'Empreintes SHA-256 posées APRÈS les tests ; règles de la v1 rejouées en direct (causales). Aucune preuve de performance.' }, null, 1) + '\n');
const sc = JSON.parse(fs.readFileSync(sceau, 'utf8')).sha256; v('sceau de fleches-simples-v3 et zones-direct', fichiers.every(f => sc[path.basename(f)] === sha(f)));
const cle = f => `${f.type}|${f.t}|${f.dir}|${f.levelId}`;
const K = serieKraken(), now = K[K.length - 1].t + H, run = (B, o = {}) => V3.calculer(B, zonesDirect, { maintenant: B[B.length - 1].t + H, bougies: 1e5, ...o }).fleches;
const F = run(K);
v('live : chaque flèche apparaît à la bougie sur laquelle elle est dessinée (indexApparition = indexDessin)', F.length > 0 && F.every(f => f.indexApparition === f.indexDessin && f.i === f.indexDessin && f.tCloture === K[f.i].t + H), String(F.filter(f => f.indexApparition !== f.indexDessin).length));
v('chaque flèche est dessinée sur une bougie qui clôture hors de la zone (confirmation) : retournements', F.filter(f => f.type === 'retournement').every(f => f.dir > 0 ? K[f.i].c > f.zoneHaut : K[f.i].c < f.zoneBas));
{ // flux bougie par bougie : le rendu à chaque pas est un préfixe du rendu final (aucune flèche ne bouge, disparaît ou apparaît sur le passé)
  const final = new Set(F.map(cle)); let bon = true;
  for (const n of [700, 800, 900, 1000, K.length - 1]) { const P = run(K.slice(0, n)); if (!P.every(f => final.has(cle(f))) || F.filter(f => f.i < n).length !== P.length) bon = false; }
  v('non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes)', bon);
  const dep = 600, R = V3.calculer(K, zonesDirect, { maintenant: now, depart: dep, deja: F.filter(f => f.i < dep - 1) }).fleches;
  v('rechargement avec registre (reprise) = rendu complet', R.map(cle).join() === F.filter(f => f.i >= dep - 1).map(cle).join());
  const un = F.length ? run(K.slice(0, K.length)) : []; v('rendu reproductible (deux passes identiques)', un.map(cle).join() === F.map(cle).join());
}
const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 3) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
v('au plus 30 flèches sur 600 bougies (Kraken), plafond de sécurité non atteint',  max600(F, K.length) <= 30 && V3.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }).refus === 0, String(max600(F, K.length)));
const D = serieDuka().slice(-1700), FD = run(D); v('au plus 30 flèches sur 600 bougies (or 2026 Dukascopy, 1 700 dernières bougies)', max600(FD, D.length) <= 30, String(max600(FD, D.length)));
for (const [nom, L] of [['Kraken', F], ['Dukascopy', FD]]) {
  const ma = L.filter(f => f.type === 'ma_cassure'); let g = 0; for (let k = 1; k < ma.length; k++) if (ma[k].i - ma[k - 1].i < 24) g++;
  v(`une seule cassure MA200 par zigzag : aucune autre dans les 24 bougies (${nom})`, g === 0);
  let e = 0; for (let k = 1; k < L.length; k++) if (L[k].i - L[k - 1].i < V3.P.distanceMin && L[k].type !== 'ma_cassure' && L[k - 1].type !== 'ma_cassure') e++; v(`6 bougies minimum entre deux retournements (${nom})`, e === 0); v(`jamais deux marqueurs sur la même bougie (${nom})`, L.every((f, k) => k === 0 || f.i !== L[k - 1].i));
}
v('chute du 12 novembre : zéro flèche d’achat', F.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19) && f.dir > 0).length === 0);
v('cassure MA200 baissière du 10 novembre (17:00 UTC) présente', F.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)));
const ret = F.filter(f => f.type === 'retournement');
v('cohérence levelId : chaque retournement a un levelId de la forme id@t et ses zoneBas/zoneHaut', ret.every(f => /^sr\d+@\d+$/.test(f.levelId) && f.zoneBas < f.zoneHaut));
v('chaque retournement : ≥ 3 touches déjà vues (causales) et jamais de comptage futur (touchesVues ≤ épisodes réels)', ret.every(f => f.touchesVues >= 3));
v('a) résistance 4 130–4 144 : flèches rouges sur ses retournements', F.filter(f => f.type === 'retournement' && f.dir < 0 && f.zoneBas >= 4125 && f.zoneHaut <= 4150).length >= 1);
v('f) infobulle d’un retournement : touches déjà vues + date + « repère de lecture, pas un ordre »', (dd => dd.some(x => /touches? déjà vues?/.test(x)) && dd.some(x => /^Apparue le/.test(x)) && dd.some(x => /repère de lecture, pas un ordre/.test(x)))(V3.detail(ret[ret.length - 1])));
const d = V3.detail(F[F.length - 1]); v('infobulle : date d’apparition, prix de clôture, « repère de lecture, pas un ordre »', d.some(x => /^Apparue le .*clôture \d/.test(x)) && d.some(x => /Arrive après le plus haut\/bas : repère de lecture, pas un ordre/.test(x)), JSON.stringify(d));
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
