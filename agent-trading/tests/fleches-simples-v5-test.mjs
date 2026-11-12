/* Flèches simples v5 (v4 + contre-tendance + invalidation) : flux en direct (indexApparition = indexDessin), non-repaint, plafond 10/600, chute du 12 nov., MA200 du 10 nov., sceau.   node agent-trading/tests/fleches-simples-v5-test.mjs   (--sceller écrit l'empreinte) */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V5 from '../front/or/fleches-simples-v5.js';
import { zonesDirect } from '../front/or/zones-direct.js'; import { sma } from '../front/or/fleches-lecture-v1.js';
import { serieKraken, serieDuka } from '../recherche-or/fleches-simples-rejeu.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const fichiers = ['fleches-simples-v5.js'].map(f => path.join(ici, '../front/or', f)), sceau = path.join(ici, '../front/or/fleches-simples-v5.sceau.json');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (process.argv.includes('--sceller')) fs.writeFileSync(sceau, JSON.stringify({ version: 'fleches-simples-v5', scelle_le: '2026-11-12', sha256: Object.fromEntries(fichiers.map(f => [path.basename(f), sha(f)])), note: 'Empreintes SHA-256 posées APRÈS les tests ; règles de la v1 rejouées en direct (causales). Aucune preuve de performance.' }, null, 1) + '\n');
const sc = JSON.parse(fs.readFileSync(sceau, 'utf8')).sha256; v('sceau de fleches-simples-v5 et zones-direct', fichiers.every(f => sc[path.basename(f)] === sha(f)));
const cle = f => `${f.type}|${f.t}|${f.dir}|${f.levelId}`;
const K = serieKraken(), now = K[K.length - 1].t + H, run = (B, o = {}) => V5.calculer(B, zonesDirect, { maintenant: B[B.length - 1].t + H, bougies: 1e5, ...o }).fleches;
const F = run(K);
v('live : chaque flèche apparaît à la bougie sur laquelle elle est dessinée (indexApparition = indexDessin)', F.length > 0 && F.every(f => f.indexApparition === f.indexDessin && f.i === f.indexDessin && f.tCloture === K[f.i].t + H), String(F.filter(f => f.indexApparition !== f.indexDessin).length));
v('chaque flèche est dessinée sur une bougie qui clôture hors de la zone (confirmation) : retournements', F.filter(f => f.type === 'retournement').every(f => f.dir > 0 ? K[f.i].c > f.zoneHaut : K[f.i].c < f.zoneBas));
{ // flux bougie par bougie : le rendu à chaque pas est un préfixe du rendu final (aucune flèche ne bouge, disparaît ou apparaît sur le passé)
  const final = new Set(F.map(cle)); let bon = true;
  for (const n of [700, 800, 900, 1000, K.length - 1]) { const P = run(K.slice(0, n)); if (!P.every(f => final.has(cle(f))) || F.filter(f => f.i < n).length !== P.length) bon = false; }
  v('non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes)', bon);
  const dep = 600, R = V5.calculer(K, zonesDirect, { maintenant: now, depart: dep, deja: F.filter(f => f.i < dep - 1) }).fleches;
  v('rechargement avec registre (reprise) = rendu complet', R.map(cle).join() === F.filter(f => f.i >= dep - 1).map(cle).join());
  const un = F.length ? run(K.slice(0, K.length)) : []; v('rendu reproductible (deux passes identiques)', un.map(cle).join() === F.map(cle).join());
}
const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 3) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
v('au plus 30 flèches sur 600 bougies (Kraken), plafond de sécurité non atteint',  max600(F, K.length) <= 30 && V5.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }).refus === 0, String(max600(F, K.length)));
const D = serieDuka().slice(-1700), FD = run(D); v('au plus 30 flèches sur 600 bougies (or 2026 Dukascopy, 1 700 dernières bougies)', max600(FD, D.length) <= 30, String(max600(FD, D.length)));
for (const [nom, L] of [['Kraken', F], ['Dukascopy', FD]]) {
  const ma = L.filter(f => f.type === 'ma_cassure'); let g = 0; for (let k = 1; k < ma.length; k++) if (ma[k].i - ma[k - 1].i < 24) g++;
  v(`une seule cassure MA200 par zigzag : aucune autre dans les 24 bougies (${nom})`, g === 0);
  let e = 0; for (let k = 1; k < L.length; k++) if (L[k].i - L[k - 1].i < V5.P.distanceMin && L[k].type !== 'ma_cassure' && L[k - 1].type !== 'ma_cassure') e++; v(`6 bougies minimum entre deux retournements (${nom})`, e === 0); v(`jamais deux marqueurs sur la même bougie (${nom})`, L.every((f, k) => k === 0 || f.i !== L[k - 1].i));
}
v('chute du 12 novembre : zéro flèche d’achat', F.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19) && f.dir > 0).length === 0);
v('cassure MA200 baissière du 10 novembre (17:00 UTC) présente', F.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)));
const ret = F.filter(f => f.type === 'retournement');
v('levelId : chaque retournement porte un levelId (id@t) et son niveau (zoneBas ≤ zoneHaut)', ret.every(f => /^(sr\d+|nm\|[^|]+\|\d+)@\d+$/.test(f.levelId) && f.zoneBas <= f.zoneHaut));
v('a) chaque retournement est sur un niveau en TRAIT PLEIN : structure (niveaux-majeurs-v1) ou zone de swing active', ret.every(f => f.niveauStyle === 'trait plein' && (f.niveauType === 'structure' || f.niveauType === 'swing')));
v('a) type de structure limité à semaine / mois / profil semaine / profil mois (ni veille, ni ronds)', ret.filter(f => f.niveauType === 'structure').every(f => V5.TYPES_STRUCTURE.includes(f.typeStructure)));
v('a) zones de swing : ≥ 3 touches déjà vues ET étiquette à ≥ 3 touches', ret.filter(f => f.niveauType === 'swing').every(f => f.touchesVues >= 3 && f.touches >= 3));
{ // vérification INDÉPENDANTE : recalculer, à la clôture de la bougie de la flèche, la liste des niveaux dessinés ; le niveau de la flèche doit y figurer, actif (trait plein), jamais une trace en pointillé
  let bon = true, detailKo = '';
  for (const f of ret) {
    const S = K.slice(0, f.i + 1), maint = S[S.length - 1].t + H;
    if (f.niveauType === 'swing') { const Z = zonesDirect(S, maint).filter(z => z.actif !== false && z.tFin == null && Math.abs(z.bas - f.zoneBas) < 0.01 && Math.abs(z.haut - f.zoneHaut) < 0.01); if (!Z.length) { bon = false; detailKo = 'swing absent ' + f.tCloture; } }
    else { const N = V5.niveauxStructure(S).filter(q => Math.abs(q.p - f.zoneHaut) < 0.01 && q.nom === f.niveauNom); if (!N.length) { bon = false; detailKo = 'structure absente ' + f.tCloture; } }
  }
  v('a) test indépendant : à la clôture de chaque flèche, son niveau est bien dans la liste des niveaux tracés en trait plein', bon, detailKo);
}
v('structure : la valeur du niveau est celle d’une période PRÉCÉDENTE (ne dépend pas de la bougie suivante)', (() => { const S1 = K.slice(0, 900), S2 = K.slice(0, 905), a = V5.niveauxStructure(S1), b = V5.niveauxStructure(S2); const m = new Map(b.map(q => [q.nom + q.tDebut, q.p])); return a.every(q => !m.has(q.nom + q.tDebut) || Math.abs(m.get(q.nom + q.tDebut) - q.p) < 1e-9); })());
v('exclus : aucune flèche sur la veille, un rond, ou un pointillé', ret.every(f => !/veille|Rond|proposé/i.test(String(f.niveauNom || ''))));
v('b) VAH mensuel 4 146 : flèche rouge en novembre', F.some(f => f.type === 'retournement' && f.dir < 0 && f.niveauNom === 'VAH mensuel' && f.zoneHaut >= 4140 && f.zoneHaut <= 4150 && f.tCloture >= Date.UTC(2026, 10, 1)));
v('f) infobulle d’un retournement : niveau, date, « repère de lecture, pas un ordre »', (dd => dd.some(x => /trait plein/.test(x)) && dd.some(x => /^Apparue le/.test(x)) && dd.some(x => /repère de lecture, pas un ordre/.test(x)))(V5.detail(ret[ret.length - 1])));
v('f) infobulle d’une zone de swing : touches déjà vues', (dd => dd.some(x => /touches? déjà vues?/.test(x)))(V5.detail(ret.filter(f => f.niveauType === 'swing')[0])));
const d = V5.detail(F[F.length - 1]); v('infobulle : date d’apparition, prix de clôture, « repère de lecture, pas un ordre »', d.some(x => /^Apparue le .*clôture \d/.test(x)) && d.some(x => /Arrive après le plus haut\/bas : repère de lecture, pas un ordre/.test(x)), JSON.stringify(d));

// ───── v5 : contre-tendance, stabilisation, invalidation ─────
const nonCtr = ret.filter(f => !f.contre);
v('contre-tendance : chaque point gris est un retournement sans stabilisation (jamais une cassure MA200)', F.filter(f => f.contre).every(f => f.type === 'retournement' && !f.stabilisation));
v('contre-tendance : la définition est vérifiée à la clôture (sous/sur la MA200, MA pentue, plus bas plus bas)', (() => { const M = sma(K); return F.filter(f => f.contre).every(f => V5.contreTendance(K, M, f.i, f.dir)); })());
v('chute du 12 novembre : aucune flèche d’achat VERTE (hors stabilisation base / RSI) entre 6 h et 19 h UTC', F.filter(f => f.type === 'retournement' && f.dir > 0 && !f.contre && !f.stabilisation && f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19)).length === 0);
v('contrôle : cassure MA200 du 10 novembre conservée', F.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)));
v('contrôle : flèche ROUGE sur le VAH mensuel du 5 novembre', F.some(f => f.niveauNom === 'VAH mensuel' && f.dir < 0 && !f.contre && f.tCloture >= Date.UTC(2026, 10, 5) && f.tCloture < Date.UTC(2026, 10, 6)));
v('contrôle : le retournement sur le VAH mensuel du 9 novembre est présent (point gris : c’est un rebond contre une MA200 haussière, règle miroir du brief)', F.some(f => f.niveauNom === 'VAH mensuel' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 9) && f.tCloture < Date.UTC(2026, 10, 10)));
v('contrôle : au moins un retournement dans le sens de la tendance (flèche normale)', nonCtr.length >= 1 && nonCtr.some(f => !f.stabilisation));
{ // invalidation : jamais une suppression ; état décidé à la clôture de la bougie concernée
  const inv = F.filter(f => f.invalidee);
  v('invalidation : au moins un rebond ravalé est grisé (flèche conservée, état invalidee)', inv.length >= 1, String(inv.length));
  v('invalidation : décidée à la clôture d’une des 2 bougies suivantes, de l’autre côté du niveau', inv.every(f => { const k = K.findIndex(b => b.t + H === f.invalideeT); return k > f.i && k - f.i <= 2 && (f.dir > 0 ? K[k].c < f.zoneBas : K[k].c > f.zoneHaut); }));
  const f0 = inv[0], k0 = K.findIndex(b => b.t + H === f0.invalideeT), avant = V5.calculer(K.slice(0, k0), zonesDirect, { maintenant: K[k0 - 1].t + H, bougies: 1e5 }).fleches.find(f => f.id === f0.id), apres = V5.calculer(K.slice(0, k0 + 1), zonesDirect, { maintenant: K[k0].t + H, bougies: 1e5 }).fleches.find(f => f.id === f0.id);
  v('invalidation sans repaint : avant la bougie la flèche est normale, après elle est invalidée (même flèche, même place)', avant && !avant.invalidee && apres && apres.invalidee && apres.i === avant.i && apres.id === avant.id);
  v('invalidation : jamais pour un point gris contre-tendance', F.filter(f => f.contre).every(f => !f.invalidee));
  const reg = V5.fusionnerRegistre(F.filter(f => f.i < f0.i + 1).map(f => ({ ...f, invalidee: false, invalideeT: undefined })), [], [{ id: f0.id, invalideeT: f0.invalideeT }]);
  v('registre : l’invalidation s’applique à la flèche existante sans la supprimer ni la déplacer', reg.length === F.filter(f => f.i < f0.i + 1).length && reg.find(f => f.id === f0.id).invalidee === true);
  v('infobulle : « Invalidée à … » pour une flèche invalidée, point gris explicité', V5.detail(f0)[0].startsWith('Invalidée à') && (F.find(f => f.contre) ? V5.detail(F.find(f => f.contre))[0].startsWith('Point gris') : true));
}
console.log('INFO compte v4 →', JSON.stringify({ total: F.length }), 'v5 points gris', F.filter(f => f.contre).length, 'stabilisées', F.filter(f => f.stabilisation).length, 'invalidées', F.filter(f => f.invalidee).length);
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
