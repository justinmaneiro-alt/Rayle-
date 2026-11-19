/* ═════════════ CALCUL DE LA LISTE (module PUR, testé ; tourne dans un Web Worker, avec repli sur le fil principal) ═════════════
   Entrées : lignes de l'index (modele.js : mesures `r` et facteurs `f`), horizon, fenêtre de détention (mois d'achat → mois de vente), filtres, tri.
   Sorties : ordre des lignes, score / verdict / confiance par ligne, comptes par verdict, statistiques de saisonnalité de la fenêtre.
   Le facteur « saisonnalité » dépend de la fenêtre choisie : il est recalculé ici à chaque changement (rendement médian, % d'années positives, excès contre l'indice, percentile dans la classe et la zone). */
import { verdictLigne, percentilesNeutres, LIBELLES, ORDRE_LIBELLE } from './modele.js';
import { statsFenetre, decoder } from './saison.js';

const fin = x => typeof x === 'number' && Number.isFinite(x);
const sans = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/* classes de capitalisation : petite < 2 Md€, moyenne 2-10, grande 10-200, méga > 200 */
export const CAPS = Object.freeze(['petite', 'moyenne', 'grande', 'méga']);

/* statistiques de saisonnalité de chaque ligne pour la fenêtre (matrices décodées mises en cache dans `cache`) */
export function saisonDeLignes(lignes, encodes, ref, a, b, cache = new Map()) {
  const out = new Array(lignes.length).fill(null);
  lignes.forEach((l, i) => { const e = encodes[l.id]; if (!e) return; let M = cache.get(l.id); if (!M) { M = decoder(e); cache.set(l.id, M); } const refE = ref && ref[l.p] ? ref[l.p] : null; let Mb = null; if (refE) { Mb = cache.get('ref:' + l.p); if (!Mb) { Mb = decoder(refE); cache.set('ref:' + l.p, Mb); } } out[i] = statsFenetre(M, a, b, Mb); });
  /* score de saisonnalité : moyenne des percentiles (médiane, % positif, excès) dans la classe et la zone ; « non significatif » sous 10 ans */
  const L = lignes.map((l, i) => ({ ...l, _s: out[i] && out[i].significatif ? out[i] : null }));
  const P = [percentilesNeutres(L, l => (l._s ? l._s.median : null), () => '—', l => l.c + '|' + l.z, 1), percentilesNeutres(L, l => (l._s ? l._s.pctPositif : null), () => '—', l => l.c + '|' + l.z, 1), percentilesNeutres(L, l => (l._s && fin(l._s.excesMedian) ? l._s.excesMedian : null), () => '—', l => l.c + '|' + l.z, 1)];
  return out.map((s, i) => { if (!s) return null; const v = P.map(p => p[i]).filter(fin); return { ...s, annees: undefined, score: s.significatif && v.length ? v.reduce((x, y) => x + y, 0) / v.length : null }; });
}
/* filtres : tous optionnels */
export function passeFiltres(l, F, sai) {
  if (F.classe && l.c !== F.classe) return false; if (F.zone && l.z !== F.zone) return false; if (F.pays && l.p !== F.pays) return false; if (F.secteur && l.s !== F.secteur) return false;
  if (F.caps && F.caps.length && l.c === 'action' && !F.caps.includes(l.sc)) return false; if (F.exclureMega && l.sc === 'méga') return false;
  if (F.pea && !l.pea) return false; if (F.dispo === 'reel' && !/réel/.test(l.da || '')) return false; if (F.dispo === 'cfd' && !/CFD/.test(l.da || '')) return false; if (F.palier && l.pal !== F.palier) return false;
  if (F.qMin && !(l.f && fin(l.f.qua) && l.f.qua >= F.qMin)) return false; if (F.liqMin && !(fin(l.liqM) && l.liqM >= F.liqMin)) return false; if (F.dyMin && !(l.r && fin(l.r.dy) && l.r.dy >= F.dyMin)) return false;
  if (F.valMin && !(l.f && fin(l.f.val) && l.f.val >= F.valMin)) return false; if (F.saisonSignificative && !(sai && sai.significatif)) return false;
  const t = sans(F.texte).trim(); if (t && !(sans(l.id).includes(t) || sans(l.n).includes(t) || sans(l.y).includes(t) || sans(l.isin).includes(t))) return false;
  if (F.liste && !F.liste.includes(l.id)) return false;
  return true;
}
export const CLES_TRI = Object.freeze({ id: l => sans(l.id), n: l => sans(l.n), p: l => sans(l.p), s: l => sans(l.s), px: l => l.px, score: (l, v) => v.score, lib: (l, v) => ORDRE_LIBELLE[v.lib], mos: l => l.r && l.r.mos, mom: l => l.f && l.f.mom, sai: (l, v, s) => (s ? s.median : null), qua: l => l.f && l.f.qua, ris: l => l.f && l.f.ris, conf: (l, v) => v.conf, cap: l => l.cap, dy: l => l.r && l.r.dy });
export function calculerListe(lignes, { horizon = 'moyen', fenetre = { a: 1, b: 3 }, filtres = {}, tri = 'score', sens = -1, ajust = {}, encodes = null, ref = null, cache = new Map(), verdict = '' } = {}) {
  const besoinSaison = !!encodes && (horizon === 'swing' || filtres.saisonSignificative || tri === 'sai'), S = besoinSaison ? saisonDeLignes(lignes, encodes, ref, fenetre.a, fenetre.b, cache) : new Array(lignes.length).fill(null);
  const V = lignes.map((l, i) => verdictLigne(l, horizon, { ajust, saison: S[i] && fin(S[i].score) ? { score: S[i].score } : null }));
  const comptes = {}; let idx = [];
  for (let i = 0; i < lignes.length; i++) { if (!passeFiltres(lignes[i], filtres, S[i])) continue; comptes[V[i].lib] = (comptes[V[i].lib] || 0) + 1; if (verdict && V[i].lib !== verdict) continue; if (filtres.scoreMin && !(V[i].score >= filtres.scoreMin)) continue; idx.push(i); }
  const f = CLES_TRI[tri] || CLES_TRI.score, texte = ['id', 'n', 'p', 's'].includes(tri), val = i => f(lignes[i], V[i], S[i]);
  idx.sort((x, y) => { const a = val(x), b = val(y), ax = texte ? !a : !fin(a), ay = texte ? !b : !fin(b); if (ax || ay) return ax === ay ? lignes[x].id.localeCompare(lignes[y].id) : ax ? 1 : -1; return ((a < b ? -1 : a > b ? 1 : 0) * sens) || lignes[x].id.localeCompare(lignes[y].id); });
  return { ordre: idx, verdicts: V, saison: S, comptes, total: idx.length };
}
/* préréglages (filtres + horizon + tri) */
export const PREREGLAGES = Object.freeze({
  pepites: { nom: 'Pépites 1–3 ans hors méga-caps', horizon: 'moyen', filtres: { classe: 'action', exclureMega: true, qMin: 60, liqMin: 1 }, verdict: '', tri: 'score', sens: -1 },
  saisonMois: { nom: 'Swing saisonnier du mois', horizon: 'swing', filtres: { classe: 'action', liqMin: 5, saisonSignificative: true }, verdict: '', tri: 'score', sens: -1, fenetreMois: true },
  qualitePrix: { nom: 'Qualité à prix raisonnable', horizon: 'moyen', filtres: { classe: 'action', qMin: 70, valMin: 50 }, verdict: '', tri: 'score', sens: -1 },
  dividendes: { nom: 'Dividendes solides', horizon: 'long', filtres: { classe: 'action', dyMin: 0.03, qMin: 55 }, verdict: '', tri: 'dy', sens: -1 },
  pea: { nom: 'PEA', horizon: 'moyen', filtres: { pea: true }, verdict: '', tri: 'score', sens: -1 }
});
