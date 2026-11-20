/* ═════════════ SUIVI DU MODÈLE PAR LUI-MÊME (module PUR, testé ; aucun poste utilisateur requis) ═════════════
   Chaque 1er du mois, la tâche planifiée (GitHub Actions, voir .github/workflows/invest.yml) enregistre un INSTANTANÉ de tous les scores et verdicts de chaque horizon dans data/snapshots/AAAA-MM.json
   (format colonnes, compact ; git le compresse). Chaque mois, elle mesure la performance RÉELLE (variation de cours) depuis chaque instantané : « Très attractif » contre « Neutre » contre « À éviter »,
   et contre l'indice de référence du pays, à 1, 3, 6 et 12 mois. Honnêteté : peu de recul = « trop tôt pour conclure » ; variation de cours en devise de cotation (dividendes, change et frais non inclus) ;
   les variations extrêmes (> +300 % ou < −80 %, splits probables) sont écartées. Seules les actions sont mesurées. */
import { verdictLigne, LIBELLES } from './modele.js';

export const HORIZONS = ['tactique', 'swing', 'moyen', 'long'], ECHEANCES = [1, 3, 6, 12];
export const CODES = Object.freeze({ [LIBELLES.TRES]: 0, [LIBELLES.ATTR]: 1, [LIBELLES.NEUTRE]: 2, [LIBELLES.PEU]: 3, [LIBELLES.EVITER]: 4, [LIBELLES.ND]: 5 });
export const GROUPES = Object.freeze([['TRES', 0, 'Très attractif'], ['ATTR', 1, 'Attractif'], ['NEUTRE', 2, 'Neutre'], ['PEU', 3, 'Peu attractif'], ['EVITER', 4, 'À éviter']]);
const fin = x => typeof x === 'number' && Number.isFinite(x);
/* indice de référence de chaque pays : instrument de l'index XTB (classe « indice ») */
export const BENCH_PAYS = Object.freeze({ US: 'US500', FR: 'FRA40', DE: 'DE40', UK: 'UK100', ES: 'SPA35', IT: 'ITA40', NL: 'NED25', CH: 'SUI20' });
export const benchDe = l => BENCH_PAYS[l.p] || (l.z === 'Europe' ? 'EU50' : 'US500');
export const moisDe = t => new Date(t).toISOString().slice(0, 7);

/* lignes de l'index (toutes classes) → instantané colonnes. Le swing est évalué sans saisonnalité (dépend de la fenêtre choisie). */
export function creerInstantane(lignes, manifeste, { maintenant = Date.now() } = {}) {
  const act = lignes.filter(l => l.c === 'action' && fin(l.px) && l.px > 0), idx = {}; for (const l of lignes) if (l.c === 'indice' && fin(l.px) && l.px > 0) idx[l.id] = l.px;
  const h = {}; for (const H of HORIZONS) { const V = act.map(l => verdictLigne(l, H, { ajust: (manifeste && manifeste.ajust) || {} })); h[H] = { s: V.map(v => (fin(v.score) ? Math.round(v.score * 10) / 10 : null)), l: V.map(v => (CODES[v.lib] ?? 5)) }; }
  return { version: 1, mois: moisDe((manifeste && manifeste.t) || maintenant), t: (manifeste && manifeste.t) || maintenant, enregistre: maintenant, modele: { ajust: (manifeste && manifeste.ajust) || {}, version: manifeste && manifeste.version }, n: act.length, ids: act.map(l => l.id), p: act.map(l => l.p || null), z: act.map(l => l.z || null), px: act.map(l => l.px), b: act.map(benchDe), h, idx };
}
/* ───── mesure ───── */
const moisNum = m => { const [a, b] = m.split('-').map(Number); return a * 12 + b - 1; };
const med = a => { const v = a.filter(fin).sort((x, y) => x - y); if (!v.length) return null; const k = v.length >> 1; return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2; };
const moy = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const ABERRANT = Object.freeze({ min: -0.8, max: 3 });
/* snaps : instantanés (tous les mois disponibles) ; renvoie les mesures par horizon, échéance et groupe */
export function mesurer(snaps) {
  const S = snaps.slice().sort((a, b) => a.mois.localeCompare(b.mois)), mesures = {}; for (const H of HORIZONS) { mesures[H] = {}; for (const d of ECHEANCES) mesures[H][d] = {}; }
  const acc = {}; let aberrants = 0;
  for (const A of S) {
    const pos = new Map(A.ids.map((id, i) => [id, i]));
    for (const d of ECHEANCES) {
      const B = S.find(x => moisNum(x.mois) - moisNum(A.mois) === d); if (!B) continue; const posB = new Map(B.ids.map((id, i) => [id, i]));
      for (const H of HORIZONS) for (let i = 0; i < A.ids.length; i++) {
        const j = posB.get(A.ids[i]); if (j == null) continue; const code = A.h[H].l[i]; if (code > 4) continue; const r = B.px[j] / A.px[i] - 1; if (!fin(r) || r < ABERRANT.min || r > ABERRANT.max) { if (fin(r) && H === 'moyen') aberrants++; continue; }
        const ba = A.idx[A.b[i]], bb = B.idx[A.b[i]], rb = fin(ba) && fin(bb) && ba > 0 ? bb / ba - 1 : null, k = H + '|' + d + '|' + code; (acc[k] = acc[k] || { r: [], x: [], b: [] }).r.push(r); if (rb != null) { acc[k].b.push(rb); acc[k].x.push(r - rb); }
      }
    }
  }
  for (const H of HORIZONS) for (const d of ECHEANCES) for (const [id, code] of GROUPES.map(g => [g[0], g[1]])) { const a = acc[H + '|' + d + '|' + code]; if (a) mesures[H][d][id] = { n: a.r.length, moy: moy(a.r), med: med(a.r), exces: moy(a.x), nIndice: a.b.length, indice: moy(a.b) }; }
  const n = S.length, recul = n ? Math.max(0, moisNum(S[n - 1].mois) - moisNum(S[0].mois)) : 0;
  return { version: 1, genere: S.length ? new Date(S[S.length - 1].t).toISOString() : null,   /* déterministe : le fichier ne change que si un nouvel instantané arrive */ snapshots: S.map(s => ({ mois: s.mois, t: s.t, n: s.n })), aberrants, mesures, recul: { mois: recul, snapshots: n, message: messageRecul(n, recul, S) } };
}
export function messageRecul(n, recul, S = []) {
  if (!n) return 'Aucun instantané pour le moment : le premier est enregistré le 1er du mois.';
  if (n === 1) { const d = new Date(S[0].t); d.setUTCMonth(d.getUTCMonth() + 1); return `Premier instantané du ${new Date(S[0].t).toLocaleDateString('fr-FR')} : première mesure à 1 mois vers le ${d.toLocaleDateString('fr-FR')}. Trop tôt pour conclure.`; }
  if (recul < 12) return `${recul} mois de recul : trop tôt pour conclure (il faut au moins 12 mois, et plusieurs centaines d’observations par groupe, pour juger un modèle).`;
  return `${recul} mois de recul : lecture possible, mais une différence entre groupes n’a de valeur que si elle est stable d’un mois à l’autre et large par rapport au bruit (voir le nombre d’observations).`;
}
