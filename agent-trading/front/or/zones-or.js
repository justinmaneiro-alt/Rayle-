/* ═════════════ ZONES DE RETOURNEMENT : historique réel, taux de réaction mesuré contre le hasard, confluence (pur, testé) ═════════════
   Règle « zones-or-v1 » (config-or.js) : un TEST commence quand une bougie M15 touche la zone [bas, haut] alors que la clôture précédente était
   au-dessus (test d'un support) ou au-dessous (test d'une résistance). La zone TIENT si le prix s'en éloigne d'au moins 0,5 ATR H1 du côté d'où
   il venait AVANT de la dépasser de 0,25 ATR H1 de l'autre côté ; les deux dans la même bougie = « ne tient pas » (prudent).
   Un nouveau test n'est compté qu'après que le prix s'est éloigné d'au moins 0,5 ATR H1 de la zone. Tests non résolus : exclus.
   ATR H1 = celui de la dernière H1 close au début du test (jamais de futur). */
import { REGLES } from './config-or.js';
import { atrA } from './bougies-or.js';
import { niveauxCles, zonesVolume, cleJour } from './niveaux-or.js';

const M15 = 15 * 60e3;
/* tests d'une zone sur des bougies M15 (indices i0 → i1), résolution permise jusqu'à iMax */
export function testsZone(m15, h1, atrH1, zone, { i0 = 1, i1 = m15.length - 1, iMax = m15.length - 1, R = REGLES.reaction } = {}) {
  const res = []; let arme = true;
  for (let i = Math.max(1, i0); i <= i1; i++) {
    const b = m15[i], prec = m15[i - 1].c, a = atrA(h1, atrH1, b.t); if (!a) continue;
    if (!arme) { if (b.c > zone.haut + R.rejet * a || b.c < zone.bas - R.rejet * a) arme = true; continue; }
    if (b.l > zone.haut || b.h < zone.bas) continue;
    const sens = prec > zone.haut ? 'support' : prec < zone.bas ? 'resistance' : null; if (!sens) continue;
    let issue = null, j = i;
    for (; j <= iMax; j++) {
      const x = m15[j];
      const casse = sens === 'support' ? x.l <= zone.bas - R.depassement * a : x.h >= zone.haut + R.depassement * a;
      const tient = sens === 'support' ? x.h >= zone.haut + R.rejet * a : x.l <= zone.bas - R.rejet * a;
      if (casse) { issue = 'cassee'; break; }
      if (tient && j > i) { issue = 'tenue'; break; }   // dans la bougie du toucher, l'ordre haut / bas est inconnu : seule la cassure y compte
    }
    if (issue) res.push({ t: b.t, sens, issue, iFin: j });
    arme = false; if (issue) i = Math.max(i, j);
  }
  return res;
}
export const bilanTests = T => ({ tests: T.length, tenues: T.filter(x => x.issue === 'tenue').length });

/* intervalle de Wilson 95 % */
export function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
/* test de deux proportions (bilatéral) → p-valeur */
export function deuxProportions(k1, n1, k2, n2) {
  if (!n1 || !n2) return null;
  const p = (k1 + k2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); if (!se) return 1;
  const z = Math.abs(k1 / n1 - k2 / n2) / se; return Math.min(1, 2 * (1 - phi(z)));
}
export function phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
/* correction de Holm : renvoie les p-valeurs ajustées dans l'ordre d'origine */
export function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(x => x[0] != null).sort((a, b) => a[0] - b[0]), m = idx.length, o = ps.map(() => null); let max = 0;
  idx.forEach(([p, i], r) => { max = Math.max(max, Math.min(1, (m - r) * p)); o[i] = max; });
  return o;
}
/* générateur pseudo-aléatoire reproductible */
export function alea(graine = 12345) { let s = graine >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ÉTUDE : taux de réaction par type de niveau sur l'historique, contre 1000 niveaux tirés au hasard (mêmes jours, même règle) */
export const TYPES = ['veille', 'semaine', 'seance', 'rond', 'volume'];
export const NOMS_TYPES = { veille: 'veille (haut / bas)', semaine: 'semaine précédente', seance: 'extrêmes de séance', rond: 'niveaux ronds de 50 $', volume: 'zones de volume' };
export function etudeReaction(m15, h1, atrH1, { tirages = REGLES.hasard, graine = 7, demiLargeur = 0.1 } = {}) {
  const jours = [], idx = new Map();
  m15.forEach((b, i) => { const k = cleJour(b.t); if (!idx.has(k)) { idx.set(k, { k, i0: i, i1: i }); jours.push(idx.get(k)); } else idx.get(k).i1 = i; });
  const comptes = Object.fromEntries(TYPES.map(t => [t, { tests: 0, tenues: 0 }])), hasard = { tests: 0, tenues: 0 }, hasardVol = { tests: 0, tenues: 0 }, joursValides = [], largeurs = [];
  for (let d = 5; d < jours.length; d++) {
    const J = jours[d]; if (J.i1 - J.i0 < 20) continue;
    const t = m15[J.i0].t, a = atrA(h1, atrH1, t); if (!a) continue;
    const fen = m15.slice(Math.max(0, J.i0 - 8 * 96), J.i0), iMax = Math.min(m15.length - 1, J.i1 + 5 * 96);
    joursValides.push({ J, a, iMax, fen });
    const niv = niveauxCles(fen, t, { prix: m15[J.i0 - 1].c });
    for (const n of niv) { const z = { bas: n.p - demiLargeur * a, haut: n.p + demiLargeur * a }; const r = bilanTests(testsZone(m15, h1, atrH1, z, { i0: J.i0, i1: J.i1, iMax })); comptes[n.type].tests += r.tests; comptes[n.type].tenues += r.tenues; }
    for (const z of zonesVolume(fen, t)) { largeurs.push((z.haut - z.bas) / a); const r = bilanTests(testsZone(m15, h1, atrH1, z, { i0: J.i0, i1: J.i1, iMax })); comptes.volume.tests += r.tests; comptes.volume.tenues += r.tenues; }
  }
  const rnd = alea(graine);
  for (let k = 0; k < tirages && joursValides.length; k++) {
    const { J, a, iMax, fen } = joursValides[Math.floor(rnd() * joursValides.length)];
    const veille = fen.slice(-96); const lo = Math.min(...veille.map(b => b.l)), hi = Math.max(...veille.map(b => b.h)), e = hi - lo;
    const p = lo - 0.5 * e + rnd() * 2 * e, z = { bas: p - demiLargeur * a, haut: p + demiLargeur * a };
    const r = bilanTests(testsZone(m15, h1, atrH1, z, { i0: J.i0, i1: J.i1, iMax })); hasard.tests += r.tests; hasard.tenues += r.tenues;
    // zones de volume : comparées à des zones au hasard de MÊME LARGEUR (une zone large tient plus souvent, par construction)
    if (largeurs.length) { const w = largeurs[Math.floor(rnd() * largeurs.length)] * a / 2, zv = { bas: p - w, haut: p + w }; const rv = bilanTests(testsZone(m15, h1, atrH1, zv, { i0: J.i0, i1: J.i1, iMax })); hasardVol.tests += rv.tests; hasardVol.tenues += rv.tenues; }
  }
  const base = t => t === 'volume' ? hasardVol : hasard;
  const ps = TYPES.map(t => { const H = base(t); return comptes[t].tests >= REGLES.minCas && H.tests >= REGLES.minCas ? deuxProportions(comptes[t].tenues, comptes[t].tests, H.tenues, H.tests) : null; }), adj = holm(ps);
  const fH = H => ({ ...H, taux: H.tests ? H.tenues / H.tests : null, ic: wilson(H.tenues, H.tests), tirages });
  const parType = Object.fromEntries(TYPES.map((t, i) => { const c = comptes[t], ok = c.tests >= REGLES.minCas, H = fH(base(t)); return [t, { ...c, taux: c.tests ? c.tenues / c.tests : null, ic: wilson(c.tenues, c.tests), assez: ok && H.tests >= REGLES.minCas, p: ps[i], pHolm: adj[i], hasard: H }]; }));
  return { version: REGLES.version, debut: m15[0] && m15[0].t, fin: m15.length && m15[m15.length - 1].t, jours: joursValides.length, parType, hasard: fH(hasard), hasardVolume: fH(hasardVol) };
}
/* phrase honnête pour un type */
export function texteType(etude, type) {
  const r = etude && etude.parType[type], h = r && r.hasard; if (!r || !h) return 'mesure indisponible';
  if (!r.assez) return `pas assez de données (${r.tests} cas, il en faut ${REGLES.minCas})`;
  const pc = x => Math.round(x * 100) + ' %', sig = r.pHolm != null && r.pHolm < 0.05;
  return `${NOMS_TYPES[type]} : a tenu ${pc(r.taux)} des ${r.tests} tests, contre ${pc(h.taux)} pour des ${type === 'volume' ? 'zones au hasard de même largeur' : 'niveaux au hasard'}${sig ? (r.taux > h.taux ? ' (mieux que le hasard)' : ' (moins bien que le hasard)') : ' (pas de différence nette avec le hasard)'}`;
}

/* ZONES DE RETOURNEMENT du moment : niveaux clés et zones de volume regroupés, historique réel, confluence ; 3 à 5 zones les plus proches */
export function zonesRetournement({ niveaux, volumes, prix, a, m15, h1, atrH1, max = REGLES.zonesMax, demiLargeur = 0.1 }) {
  if (!a || !prix) return [];
  const brut = [
    ...volumes.map(v => ({ bas: v.bas, haut: v.haut, types: ['volume'], noms: ['Zone de volume'], vol: true })),
    ...niveaux.map(n => ({ bas: n.p - demiLargeur * a, haut: n.p + demiLargeur * a, types: [n.type], noms: [n.nom], vol: false }))
  ].sort((x, y) => x.bas - y.bas);
  const fus = [];
  for (const z of brut) {
    const d = fus[fus.length - 1];
    if (d && z.bas <= d.haut + 0.25 * a) { d.haut = Math.max(d.haut, z.haut); d.bas = Math.min(d.bas, z.bas); d.types.push(...z.types); d.noms.push(...z.noms); d.vol = d.vol || z.vol; }
    else fus.push({ ...z, types: [...z.types], noms: [...z.noms] });
  }
  // une zone fusionnée trop large (> 1 ATR) est ramenée autour de son centre
  for (const z of fus) if (z.haut - z.bas > a) { const c = (z.haut + z.bas) / 2; z.bas = c - a / 2; z.haut = c + a / 2; }
  const proches = fus.map(z => ({ ...z, dist: prix > z.haut ? prix - z.haut : prix < z.bas ? z.bas - prix : 0 })).sort((x, y) => x.dist - y.dist).slice(0, max);
  return proches.map(z => {
    const T = m15 && m15.length > 2 ? testsZone(m15, h1, atrH1, z) : [], b = bilanTests(T), cles = [...new Set(z.types.filter(t => t !== 'volume'))];
    const score = (z.vol ? 1 : 0) + Math.min(2, cles.length) + Math.min(3, b.tenues * 0.5);
    const p = (z.bas + z.haut) / 2, cote = p < prix ? 'support' : 'resistance';
    return { id: `z${Math.round(p * 10)}`, bas: z.bas, haut: z.haut, p, cote, types: [...new Set(z.types)], noms: [...new Set(z.noms)], vol: z.vol, cles, ...b, score, dist: z.dist, distAtr: z.dist / a };
  }).sort((x, y) => y.score - x.score || x.dist - y.dist);
}
export function texteHistorique(z) {
  if (!z.tests) return 'jamais testée sur la période chargée';
  return `testée ${z.tests} fois, a tenu ${z.tenues}`;
}
