/* STATISTIQUES RÉELLES de boites-v1 (Dukascopy XAU/USD, H1) — STRATEGIE-RAYLE.md §4.
   Événement = ARRIVÉE sur une zone valide (formée avant, non invalidée) : la bougie i touche le voisinage (≤ 0,25 ATR) d'une zone que la bougie i−1 n'atteignait pas, venant du bon côté
   (zone au-dessus du prix = vente, en dessous = achat). Mesure depuis la CLÔTURE de la bougie d'arrivée : le prix atteint +1 ATR loin de la zone (retournement) AVANT 1 ATR dans l'autre sens (cassure), la clôture d'arrivée étant la référence des deux barrières, dans les 12 bougies ; les deux dans la même bougie = cassure (prudent). taux = part des issues TRANCHÉES (retournement / retournement + cassure) ; n = arrivées, nT = issues tranchées.
   Base = la même mesure sur TOUTES les bougies (référence = la clôture, sens de l'approche = signe de c − c[−3]). Par côté et par classe de confluence, 18 derniers mois ET 2015–2025 séparément ;
   nT < 30 = « pas assez de données ». Écrit front/or/boites-stats.json et RAPPORT-BOITES-OR.md (local). */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { charger } from './donnees.mjs'; import * as Z from '../front/or/boites-v1.js'; import { wilson } from '../front/or/ma-evenements-v1.js';
const H = 3600e3, FEN = { recent: [Date.UTC(2025, 4, 1), Infinity], long: [Date.UTC(2015, 0, 1), Date.UTC(2026, 0, 1)] };
const ouvert = b => !(b.h === b.l && !b.v);   // 29 % des bougies Dukascopy sont des bougies plates de week-end (volume nul) : retirées, elles dilueraient l'ATR
const D = charger({ debut: 2014, fin: 2026 }), B = D.h1.filter(ouvert).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), n = B.length;
const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL('../front/or/boites-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const prep = Z.preparer(B), A = prep.A, N = Z.P.bougies;
const dans = (t, f) => t >= FEN[f][0] && t < FEN[f][1];
/* issue depuis la clôture i : référence ref, retournement = mouvement de gainAtr dans le sens dirRet, cassure = mouvement de perteAtr dans le sens opposé ; +1 retournement, −1 cassure, 0 aucune */
function issue(i, ref, dirRet, a) {
  const cible = ref + dirRet * Z.P.gainAtr * a, casse = ref - dirRet * Z.P.perteAtr * a;
  for (let k = i + 1; k <= Math.min(n - 1, i + N); k++) { const b = B[k], rev = dirRet > 0 ? b.h >= cible : b.l <= cible, cas = dirRet > 0 ? b.l <= casse : b.h >= casse; if (cas) return -1; if (rev) return 1; }
  return 0;
}
// base : toutes les bougies, approche par le bas (zone de vente : retournement = baisse) ou par le haut
const base = { recent: { vente: { k: 0, c: 0 }, achat: { k: 0, c: 0 } }, long: { vente: { k: 0, c: 0 }, achat: { k: 0, c: 0 } } };
for (let i = 400; i < n - N; i++) { if (A[i] == null) continue; if (B[i].c === B[i - 3].c) continue; const mont = B[i].c - B[i - 3].c > 0, cote = mont ? 'vente' : 'achat', r = issue(i, B[i].c, mont ? -1 : 1, A[i]); for (const f of ['recent', 'long']) if (dans(B[i].t, f) && r !== 0) { base[f][cote].c++; if (r === 1) base[f][cote].k++; } }
// arrivées
const dernier = new Map(), E = [];
for (let i = 401; i < n - N; i++) {
  const a = A[i]; if (a == null || A[i - 1] == null) continue; const Zs = Z.zonesA(prep, i - 1), vo = Z.P.arriveeAtr * a;
  for (const z of Zs) {
    if (z.invalide) continue;
    const arrive = z.cote === 'vente' ? (B[i].h >= z.bas - vo && B[i - 1].h < z.bas - vo && B[i - 1].c < z.prix) : (B[i].l <= z.haut + vo && B[i - 1].l > z.haut + vo && B[i - 1].c > z.prix);
    if (!arrive) continue; const cle = z.id, last = dernier.get(cle); if (last != null && i - last < 24) continue; dernier.set(cle, i);
    // référence = la CLÔTURE de la bougie d'arrivée pour les deux barrières (comme la base). Piège évité : avec le centre de la zone comme référence, le prix arrive avant le centre, la cible de retournement est plus proche que celle de cassure et le taux est gonflé par construction.
    const dirRet = z.cote === 'vente' ? -1 : 1, r = issue(i, B[i].c, dirRet, a);
    E.push({ t: B[i].t, cote: z.cote, conf: Z.classeConf(z), natures: z.natures.join('+'), r });
  }
}
function cellule(L, f, cote) {
  const S = L.filter(e => dans(e.t, f)), k = S.filter(e => e.r === 1).length, nT = S.filter(e => e.r !== 0).length, b = base[f][cote], bp = b.c ? b.k / b.c : null, c = { n: S.length, nT, assez: nT >= 30 };
  if (!nT) { c.verdict = 'pas assez de données'; return c; } c.k = k; c.taux = k / nT; c.ic = wilson(k, nT); c.base = bp; c.verdict = !c.assez ? 'pas assez de données' : c.ic[0] > bp + 0.05 ? 'au-dessus de la base' : c.ic[1] < bp - 0.05 ? 'en dessous de la base' : 'pas nettement différent de la base'; return c;
}
const sortie = { version: Z.VERSION, sha256: sha, calcule: new Date().toISOString().slice(0, 10), source: 'Dukascopy XAU/USD (bid), H1', fenetres: { recent: "2025-05-01 → aujourd'hui (18 mois)", long: '2015–2025' }, mesure: '+1 ATR loin de la zone avant 1 ATR au-delà du centre, 12 bougies depuis la clôture d\'arrivée ; taux = part des issues tranchées', arrivees: E.length, zones: { vente: {}, achat: {} }, natures: { vente: {}, achat: {} }, base: {} };
for (const f of ['recent', 'long']) for (const cote of ['vente', 'achat']) sortie.base[`${cote}|${f}`] = { n: base[f][cote].c, taux: base[f][cote].c ? base[f][cote].k / base[f][cote].c : null };
for (const cote of ['vente', 'achat']) {
  const S = E.filter(e => e.cote === cote);
  for (const [nom, L] of [['tous', S], ...['conf=2', 'conf=3', 'conf=4+'].map(c => [c, S.filter(e => e.conf === c)])]) sortie.zones[cote][nom] = { recent: cellule(L, 'recent', cote), long: cellule(L, 'long', cote) };
  for (const nat of [...new Set(S.map(e => e.natures))].sort()) sortie.natures[cote][nat] = { recent: cellule(S.filter(e => e.natures === nat), 'recent', cote), long: cellule(S.filter(e => e.natures === nat), 'long', cote) };
}
fs.writeFileSync(new URL('../front/or/boites-stats.json', import.meta.url), JSON.stringify(sortie));
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %'), L = [`# Boîtes de retournement — statistiques réelles`, '', `Dukascopy XAU/USD H1 (${n} bougies). Règle ${Z.VERSION} (SHA-256 ${sha.slice(0, 12)}…). Calculé le ${sortie.calcule}. ${sortie.mesure}. ${E.length} arrivées sur une zone.`, '', '| côté | classe | fenêtre | arrivées | tranchées | retournement | IC 95 % | base | verdict |', '|---|---|---|---|---|---|---|---|---|'];
for (const cote of ['vente', 'achat']) for (const [k, o] of Object.entries(sortie.zones[cote])) for (const f of ['long', 'recent']) { const c = o[f]; L.push(`| ${cote} | ${k} | ${f} | ${c.n} | ${c.nT} | ${pc(c.taux)} | ${c.ic ? pc(c.ic[0]) + '–' + pc(c.ic[1]) : '—'} | ${pc(c.base)} | ${c.verdict || '—'} |`); }
L.push('', '## Par combinaison de natures (n ≥ 30 tranchées sur 2015–2025)', '', '| côté | natures | arrivées | tranchées | retournement | IC | base | verdict |', '|---|---|---|---|---|---|---|---|');
for (const cote of ['vente', 'achat']) for (const [k, o] of Object.entries(sortie.natures[cote])) { const c = o.long; if (c.nT >= 30) L.push(`| ${cote} | ${k} | ${c.n} | ${c.nT} | ${pc(c.taux)} | ${pc(c.ic[0])}–${pc(c.ic[1])} | ${pc(c.base)} | ${c.verdict} |`); }
fs.writeFileSync(new URL('./RAPPORT-BOITES-OR.md', import.meta.url), L.join('\n') + '\n'); console.log(L.join('\n'));
