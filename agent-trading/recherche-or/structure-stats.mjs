/* STATISTIQUES RÉELLES de la structure de marché v1 (Dukascopy XAU/USD H1 et H4, fractales de 5 bougies) : pour chaque situation (impulsion contre la tendance, changement de caractère, retournement confirmé),
   fréquence avec laquelle (r) la tendance d'origine reprend (nouveau sommet/creux au-delà de l'extrême de l'impulsion) et (q) le prix fait un nouveau creux/sommet dans le nouveau sens (au-delà du repère de l'événement),
   dans les 6, 12 et 24 bougies suivantes ; séparément sur les 18 derniers mois et sur 2015–2025 ; comparée à la fréquence de base (toutes les bougies dans la même tendance, mêmes horizons, repère = extrême des 20 dernières bougies).
   n < 30 → « pas assez de données ». Écrit front/or/structure-marche-stats.json (versionné, lu par l'interface) et RAPPORT-STRUCTURE-OR.md (local). */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { charger } from './donnees.mjs'; import * as SM from '../front/or/structure-marche-v1.js';
const H = 3600e3, HOR = [6, 12, 24], FEN = { recent: [Date.UTC(2025, 4, 1), Infinity], long: [Date.UTC(2015, 0, 1), Date.UTC(2026, 0, 1)] };
const D = charger({ debut: 2014, fin: 2026 }), H1 = D.h1.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), H4 = SM.agreger(H1, 4 * H).filter((b, i, A) => b.n === 4 || i < A.length - 1);
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n); return [c - h, c + h]; };
const prop = (k, n) => ({ k, n, p: n ? k / n : null, ic: wilson(k, n) });
function mesurer(B, periode) {
  const R = SM.analyser(B, { K: 5, periode }), n = B.length, out = {};
  const hi = (a, b) => { let m = -Infinity; for (let k = a; k <= b; k++) m = Math.max(m, B[k].h); return m; }, lo = (a, b) => { let m = Infinity; for (let k = a; k <= b; k++) m = Math.min(m, B[k].l); return m; };
  const apres = (i, N, dir, niveau) => { for (let k = i + 1; k <= Math.min(n - 1, i + N); k++) if (dir > 0 ? B[k].h > niveau : B[k].l < niveau) return true; return false; };   // dir > 0 : franchit un niveau vers le haut
  const types = { impulsion: 'impulsion', choch: 'choch', confirme: 'confirme' };
  for (const [nom, ty] of Object.entries(types)) {
    out[nom] = {};
    for (const [fen, [d0, d1]] of Object.entries(FEN)) {
      const E = R.events.filter(e => e.type === ty && e.t >= d0 && e.t < d1 && e.i + 24 < n), S = { n: E.length, assez: E.length >= 30, dirOrigine: null };
      const comp = (liste, ref) => Object.fromEntries(HOR.flatMap(N => [[`r${N}`, prop(liste.filter(x => apres(x.i, N, x.dO, x.extreme)).length, liste.length)], [`q${N}`, prop(liste.filter(x => apres(x.i, N, -x.dO, x.refNouveau)).length, liste.length)]]));
      // repère du nouvel extrême = extrême du nouveau sens JUSQU'À la bougie de l'événement INCLUSE (pour « confirmé », la bougie de confirmation a déjà cassé le plus bas : sans cette précaution la mesure serait un truisme à 100 %)
      const L = E.map(e => ({ i: e.i, dO: -e.dir, extreme: e.extreme, refNouveau: e.dir < 0 ? Math.min(e.refNouveau, B[e.i].l) : Math.max(e.refNouveau, B[e.i].h) })); Object.assign(S, comp(L)); S.nHaussiereOrigine = L.filter(x => x.dO > 0).length;
      // base : toutes les bougies dont la tendance est celle d'origine (haussière puis baissière), repères = extrême des 20 dernières bougies
      const Bs = []; for (let i = 25; i < n - 24; i++) { if (B[i].t < d0 || B[i].t >= d1 || R.tendance[i] === 0) continue; const dO = R.tendance[i]; Bs.push({ i, dO, extreme: dO > 0 ? hi(i - 19, i) : lo(i - 19, i), refNouveau: dO > 0 ? lo(i - 19, i) : hi(i - 19, i) }); }
      // la base est pondérée comme les événements (part de tendances haussières / baissières) pour rester comparable
      const part = L.length ? L.filter(x => x.dO > 0).length / L.length : 0.5, Bu = Bs.filter(x => x.dO > 0), Bd = Bs.filter(x => x.dO < 0), baseP = {}; for (const N of HOR) for (const [c, f] of [['r', x => apres(x.i, N, x.dO, x.extreme)], ['q', x => apres(x.i, N, -x.dO, x.refNouveau)]]) { const pu = Bu.length ? Bu.filter(f).length / Bu.length : 0, pd = Bd.length ? Bd.filter(f).length / Bd.length : 0, p = part * pu + (1 - part) * pd, nn = Bs.length; baseP[c + N] = { p, n: nn, ic: wilson(Math.round(p * nn), nn) }; }
      S.base = baseP; S.dirOrigine = part >= 0.5 ? 1 : -1; out[nom][fen] = S;
    }
  }
  return { out, nEvenements: R.events.length };
}
const stats = { version: SM.VERSION, calcule: new Date().toISOString().slice(0, 10), source: 'Dukascopy XAU/USD (bid), H1 et H4 agrégé, fractales de 5 bougies', fenetres: { recent: '2025-05-01 → aujourd\'hui (18 mois)', long: '2015–2025' }, horizons: HOR, sha256_module: JSON.parse(fs.readFileSync(new URL('../front/or/structure-marche-v1.sceau.json', import.meta.url), 'utf8')).sha256 };
const h1 = mesurer(H1, H), h4 = mesurer(H4, 4 * H); stats.H1 = h1.out; stats.H4 = h4.out; fs.writeFileSync(new URL('../front/or/structure-marche-stats.json', import.meta.url), JSON.stringify(stats));
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %'), L = ['# Structure de marché v1 : statistiques réelles (local)', '', `Module scellé ${stats.sha256_module.slice(0, 16)}… · Dukascopy XAU/USD · calculé le ${stats.calcule}. r = la tendance d'origine reprend (au-delà de l'extrême de l'impulsion) ; q = nouveau creux/sommet dans le nouveau sens. Entre parenthèses : base (toutes les bougies de même tendance).`, ''];
for (const tf of ['H1', 'H4']) for (const ty of ['impulsion', 'choch', 'confirme']) for (const fen of ['recent', 'long']) { const S = stats[tf][ty][fen]; L.push(`**${tf} · ${ty} · ${fen === 'recent' ? '18 derniers mois' : '2015–2025'}** : n = ${S.n}${S.assez ? '' : ' → pas assez de données (< 30)'}`); if (S.n) L.push('  ' + HOR.map(N => `${N} bougies : reprise ${pc(S['r' + N].p)} [${pc(S['r' + N].ic[0])}–${pc(S['r' + N].ic[1])}] (base ${pc(S.base['r' + N].p)}) · nouveau ${S.dirOrigine > 0 ? 'creux' : 'sommet'} ${pc(S['q' + N].p)} [${pc(S['q' + N].ic[0])}–${pc(S['q' + N].ic[1])}] (base ${pc(S.base['q' + N].p)})`).join('\n  ')); L.push(''); }
fs.writeFileSync(new URL('./RAPPORT-STRUCTURE-OR.md', import.meta.url), L.join('\n')); console.log(L.join('\n'));
