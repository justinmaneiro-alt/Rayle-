/* Flèches simples v4 (niveaux en trait plein seulement) : flux en direct (indexApparition = indexDessin), non-repaint, plafond 10/600, chute du 12 nov., MA200 du 10 nov., sceau.   node agent-trading/tests/fleches-simples-v4-test.mjs   (--sceller écrit l'empreinte) */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V4 from '../front/or/fleches-simples-v4.js';
import { zonesDirect } from '../front/or/zones-direct.js';
import { serieKraken, serieDuka } from '../recherche-or/fleches-simples-rejeu.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const fichiers = ['fleches-simples-v4.js'].map(f => path.join(ici, '../front/or', f)), sceau = path.join(ici, '../front/or/fleches-simples-v4.sceau.json');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (process.argv.includes('--sceller')) fs.writeFileSync(sceau, JSON.stringify({ version: 'fleches-simples-v4', scelle_le: '2026-11-12', sha256: Object.fromEntries(fichiers.map(f => [path.basename(f), sha(f)])), note: 'Empreintes SHA-256 posées APRÈS les tests ; règles de la v1 rejouées en direct (causales). Aucune preuve de performance.' }, null, 1) + '\n');
const sc = JSON.parse(fs.readFileSync(sceau, 'utf8')).sha256; v('sceau de fleches-simples-v4 et zones-direct', fichiers.every(f => sc[path.basename(f)] === sha(f)));
const cle = f => `${f.type}|${f.t}|${f.dir}|${f.levelId}`;
const K = serieKraken(), now = K[K.length - 1].t + H, run = (B, o = {}) => V4.calculer(B, zonesDirect, { maintenant: B[B.length - 1].t + H, bougies: 1e5, ...o }).fleches;
const F = run(K);
v('live : chaque flèche apparaît à la bougie sur laquelle elle est dessinée (indexApparition = indexDessin)', F.length > 0 && F.every(f => f.indexApparition === f.indexDessin && f.i === f.indexDessin && f.tCloture === K[f.i].t + H), String(F.filter(f => f.indexApparition !== f.indexDessin).length));
v('chaque flèche est dessinée sur une bougie qui clôture hors de la zone (confirmation) : retournements', F.filter(f => f.type === 'retournement').every(f => f.dir > 0 ? K[f.i].c > f.zoneHaut : K[f.i].c < f.zoneBas));
{ // flux bougie par bougie : le rendu à chaque pas est un préfixe du rendu final (aucune flèche ne bouge, disparaît ou apparaît sur le passé)
  const final = new Set(F.map(cle)); let bon = true;
  for (const n of [700, 800, 900, 1000, K.length - 1]) { const P = run(K.slice(0, n)); if (!P.every(f => final.has(cle(f))) || F.filter(f => f.i < n).length !== P.length) bon = false; }
  v('non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes)', bon);
  const dep = 600, R = V4.calculer(K, zonesDirect, { maintenant: now, depart: dep, deja: F.filter(f => f.i < dep - 1) }).fleches;
  v('rechargement avec registre (reprise) = rendu complet', R.map(cle).join() === F.filter(f => f.i >= dep - 1).map(cle).join());
  const un = F.length ? run(K.slice(0, K.length)) : []; v('rendu reproductible (deux passes identiques)', un.map(cle).join() === F.map(cle).join());
}
const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 3) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
v('au plus 30 flèches sur 600 bougies (Kraken), plafond de sécurité non atteint',  max600(F, K.length) <= 30 && V4.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }).refus === 0, String(max600(F, K.length)));
const D = serieDuka().slice(-1700), FD = run(D); v('au plus 30 flèches sur 600 bougies (or 2026 Dukascopy, 1 700 dernières bougies)', max600(FD, D.length) <= 30, String(max600(FD, D.length)));
for (const [nom, L] of [['Kraken', F], ['Dukascopy', FD]]) {
  const ma = L.filter(f => f.type === 'ma_cassure'); let g = 0; for (let k = 1; k < ma.length; k++) if (ma[k].i - ma[k - 1].i < 24) g++;
  v(`une seule cassure MA200 par zigzag : aucune autre dans les 24 bougies (${nom})`, g === 0);
  let e = 0; for (let k = 1; k < L.length; k++) if (L[k].i - L[k - 1].i < V4.P.distanceMin && L[k].type !== 'ma_cassure' && L[k - 1].type !== 'ma_cassure') e++; v(`6 bougies minimum entre deux retournements (${nom})`, e === 0); v(`jamais deux marqueurs sur la même bougie (${nom})`, L.every((f, k) => k === 0 || f.i !== L[k - 1].i));
}
v('chute du 12 novembre : zéro flèche d’achat', F.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19) && f.dir > 0).length === 0);
v('cassure MA200 baissière du 10 novembre (17:00 UTC) présente', F.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)));
const ret = F.filter(f => f.type === 'retournement');
v('levelId : chaque retournement porte un levelId (id@t) et son niveau (zoneBas ≤ zoneHaut)', ret.every(f => /^(sr\d+|nm\|[^|]+\|\d+)@\d+$/.test(f.levelId) && f.zoneBas <= f.zoneHaut));
v('a) chaque retournement est sur un niveau en TRAIT PLEIN : structure (niveaux-majeurs-v1) ou zone de swing active', ret.every(f => f.niveauStyle === 'trait plein' && (f.niveauType === 'structure' || f.niveauType === 'swing')));
v('a) type de structure limité à semaine / mois / profil semaine / profil mois (ni veille, ni ronds)', ret.filter(f => f.niveauType === 'structure').every(f => V4.TYPES_STRUCTURE.includes(f.typeStructure)));
v('a) zones de swing : ≥ 3 touches déjà vues ET étiquette à ≥ 3 touches', ret.filter(f => f.niveauType === 'swing').every(f => f.touchesVues >= 3 && f.touches >= 3));
{ // vérification INDÉPENDANTE : recalculer, à la clôture de la bougie de la flèche, la liste des niveaux dessinés ; le niveau de la flèche doit y figurer, actif (trait plein), jamais une trace en pointillé
  let bon = true, detailKo = '';
  for (const f of ret) {
    const S = K.slice(0, f.i + 1), maint = S[S.length - 1].t + H;
    if (f.niveauType === 'swing') { const Z = zonesDirect(S, maint).filter(z => z.actif !== false && z.tFin == null && Math.abs(z.bas - f.zoneBas) < 0.01 && Math.abs(z.haut - f.zoneHaut) < 0.01); if (!Z.length) { bon = false; detailKo = 'swing absent ' + f.tCloture; } }
    else { const N = V4.niveauxStructure(S).filter(q => Math.abs(q.p - f.zoneHaut) < 0.01 && q.nom === f.niveauNom); if (!N.length) { bon = false; detailKo = 'structure absente ' + f.tCloture; } }
  }
  v('a) test indépendant : à la clôture de chaque flèche, son niveau est bien dans la liste des niveaux tracés en trait plein', bon, detailKo);
}
v('structure : la valeur du niveau est celle d’une période PRÉCÉDENTE (ne dépend pas de la bougie suivante)', (() => { const S1 = K.slice(0, 900), S2 = K.slice(0, 905), a = V4.niveauxStructure(S1), b = V4.niveauxStructure(S2); const m = new Map(b.map(q => [q.nom + q.tDebut, q.p])); return a.every(q => !m.has(q.nom + q.tDebut) || Math.abs(m.get(q.nom + q.tDebut) - q.p) < 1e-9); })());
v('exclus : aucune flèche sur la veille, un rond, ou un pointillé', ret.every(f => !/veille|Rond|proposé/i.test(String(f.niveauNom || ''))));
v('b) VAH mensuel 4 146 : flèche rouge en novembre', F.some(f => f.type === 'retournement' && f.dir < 0 && f.niveauNom === 'VAH mensuel' && f.zoneHaut >= 4140 && f.zoneHaut <= 4150 && f.tCloture >= Date.UTC(2026, 10, 1)));
v('f) infobulle d’un retournement : niveau, date, « repère de lecture, pas un ordre »', (dd => dd.some(x => /trait plein/.test(x)) && dd.some(x => /^Apparue le/.test(x)) && dd.some(x => /repère de lecture, pas un ordre/.test(x)))(V4.detail(ret[ret.length - 1])));
v('f) infobulle d’une zone de swing : touches déjà vues', (dd => dd.some(x => /touches? déjà vues?/.test(x)))(V4.detail(ret.filter(f => f.niveauType === 'swing')[0])));
const d = V4.detail(F[F.length - 1]); v('infobulle : date d’apparition, prix de clôture, « repère de lecture, pas un ordre »', d.some(x => /^Apparue le .*clôture \d/.test(x)) && d.some(x => /Arrive après le plus haut\/bas : repère de lecture, pas un ordre/.test(x)), JSON.stringify(d));
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
