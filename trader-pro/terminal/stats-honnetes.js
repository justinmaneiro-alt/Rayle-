/* ═════════════ LA PREUVE, AVEC LES COÛTS XTB (v6, B5) — pur et testé ═════════════
   1. COÛTS : spread typique et swap par instrument (valeurs INDICATIVES, modifiables : xStation → spécification de l'instrument fait foi), retirés de chaque résultat en R.
   2. TEST HONNÊTE : les règles de chaque flèche sont FIGÉES avant mesure (voir stats-fleches.js : cible 2 R, stop derrière la mèche, aucun paramètre ajusté sur les résultats). Chaque type est mesuré sur la période
      d'APPRENTISSAGE (les 70 % les plus anciens) puis sur une période JAMAIS UTILISÉE (les 30 % les plus récents) ; les deux sont affichés côte à côte. Nettement pire sur la période jamais vue : badge « fragile ».
   3. SUIVI RÉEL : chaque flèche émise depuis la mise en service est enregistrée avec son résultat réel (cible 2 R ou stop, coûts compris) ; comparaison continue « réel contre testé » ; dégradation sur les 30 derniers cas signalée.
   Aucun ordre n'est jamais passé : lecture seule. */
import { PARAMS_STATS, TYPES_STATS, simuler, evenementsMA200, evenementsNiveaux, evenementsFibo } from './stats-fleches.js';
import { evenementsVolume } from '../volume/volume-calcul.js';

/* spread (unités de prix) et swap par nuit (unités de prix, pour 1 unité détenue, signe = coût) — typiques, à vérifier dans xStation */
export const COUTS_DEFAUT = Object.freeze({ or: { spread: 0.4, swapNuit: 0.15 }, us100: { spread: 1.8, swapNuit: 0.8 }, us500: { spread: 0.6, swapNuit: 0.3 }, btc: { spread: 35, swapNuit: 12 }, sol: { spread: 0.18, swapNuit: 0.06 }, eurusd: { spread: 0.00009, swapNuit: 0.00002 } });
export const NOTE_COUTS = 'Spreads et swaps typiques INDICATIFS (non lus chez XTB) : à vérifier et modifier dans « Coûts XTB » ; sans eux, les résultats seraient trop beaux.';
const J = 86400e3, PAS = { H4: 4 * 3600e3, J };
export const lireCouts = (id, surcharge = {}) => ({ ...(COUTS_DEFAUT[id] || { spread: 0, swapNuit: 0 }), ...(surcharge[id] || {}) });

/* résultat d'un événement en R APRÈS coûts : gagné = +cible, perdu = −1, moins (spread + swap sur la durée de détention) / distance du stop */
export function resultatNet(B, ev, unite, couts, P = PARAMS_STATS) {
  const s = simuler(B, ev.i, ev.dir, ev.atr, P); if (!s || (s.issue !== 'gagne' && s.issue !== 'perdu')) return null;
  const b = B[ev.i], ext = ev.dir > 0 ? b.l : b.h, d = Math.max(Math.abs(b.c - ext), P.stopMinAtr * ev.atr); if (!(d > 0)) return null;
  /* durée de détention : jusqu'à la bougie de sortie (recalcul simple) */
  const stop = b.c - ev.dir * d, cible = b.c + ev.dir * P.cible * d; let k = 1; for (; ev.i + k < B.length && k <= P.maxBarres; k++) { const x = B[ev.i + k]; if (ev.dir > 0 ? x.l <= stop || x.h >= cible : x.h >= stop || x.l <= cible) break; }
  const nuits = Math.max(0, Math.round(k * PAS[unite] / J)), cout = (couts.spread || 0) + (couts.swapNuit || 0) * nuits, brut = s.issue === 'gagne' ? P.cible : -1;
  return { brut, net: brut - cout / d, coutR: cout / d, gagne: s.issue === 'gagne', t: b.t };
}
const agr = L => { const n = L.length; if (!n) return { n: 0, taux: null, brut: null, net: null, coutR: null }; const m = f => L.reduce((s, x) => s + f(x), 0) / n; return { n, taux: m(x => (x.gagne ? 1 : 0)), brut: m(x => x.brut), net: m(x => x.net), coutR: m(x => x.coutR) }; };
/* verdict : non significatif (< 30 cas appris ou < 15 vus), fragile (période jamais vue nettement pire : espérance −0,3 R ou taux −15 points), fiable (espérance nette > 0 des deux côtés), sinon « à surveiller » */
export function verdict(appr, test, { minAppr = PARAMS_STATS.minSignificatif, minTest = 15 } = {}) {
  if (appr.n < minAppr || test.n < minTest) return 'non significatif';
  if (test.net < appr.net - 0.3 || test.taux < appr.taux - 0.15) return 'fragile';
  return appr.net > 0 && test.net > 0 ? 'fiable' : 'à surveiller';
}
export function testerType(B, evenements, unite, couts, { partTest = 0.3, P = PARAMS_STATS } = {}) {
  const coupe = B.length ? B[Math.floor(B.length * (1 - partTest))].t : 0, R = evenements.map(ev => resultatNet(B, ev, unite, couts, P)).filter(Boolean);
  const appr = agr(R.filter(r => r.t < coupe)), test = agr(R.filter(r => r.t >= coupe)); return { coupe, apprentissage: appr, jamaisVu: test, verdict: verdict(appr, test) };
}
/* tous les types d'une série (mêmes événements que stats-fleches.js) */
export function statsHonnetesUnite(B, unite, id, surcharge = {}, opts = {}) {
  if (!B || B.length < 260) return null; const couts = lireCouts(id, surcharge); let EV = {}; if (B.filter(b => b.v > 0).length >= 0.8 * B.length) { try { EV = evenementsVolume(B, unite); } catch (e) { EV = {}; } }
  const E = { ...evenementsMA200(B, unite), ...evenementsNiveaux(B, unite), ...evenementsFibo(B, unite), ...EV }, types = {}; for (const t of TYPES_STATS) types[t.id] = testerType(B, E[t.id] || [], unite, couts, opts);
  return { bougies: B.length, debut: B[0].t, fin: B[B.length - 1].t, couts, types };
}
/* suivi réel : registre de flèches { id, actif, unite, type, dir, t, entree, stop, cible, resultat: null|{ issue:'gagne'|'perdu', R, net } } ; résolution à partir des bougies postérieures */
export function resoudreFleche(f, B, couts, P = PARAMS_STATS) {
  if (f.resultat) return f; const debut = f.tFin != null ? f.tFin : f.t + 1, apres = B.filter(b => b.t >= debut); const d = Math.abs(f.entree - f.stop); if (!(d > 0)) return f;
  for (let k = 0; k < apres.length && k <= P.maxBarres; k++) { const x = apres[k], stopT = f.dir > 0 ? x.l <= f.stop : x.h >= f.stop, cibleT = f.dir > 0 ? x.h >= f.cible : x.l <= f.cible; if (!stopT && !cibleT) continue;
    const issue = stopT ? 'perdu' : 'gagne', nuits = Math.round((x.t - f.t) / J), cout = (couts.spread || 0) + (couts.swapNuit || 0) * nuits, brut = issue === 'gagne' ? P.cible : -1; return { ...f, resultat: { issue, R: brut, net: brut - cout / d, tSortie: x.t } }; }
  return f;
}
/* dégradation : sur les 30 derniers cas RÉSOLUS d'un type, espérance nette nettement sous celle testée (−0,5 R) ou taux −20 points */
export function degradation(resolues, attendu, { n = 30 } = {}) {
  const D = resolues.slice(-n); if (D.length < n || !attendu || attendu.net == null) return { degrade: false, n: D.length, raison: D.length < n ? 'moins de ' + n + ' cas réels' : 'aucune référence testée' };
  const net = D.reduce((s, x) => s + x.resultat.net, 0) / D.length, taux = D.filter(x => x.resultat.issue === 'gagne').length / D.length;
  const degrade = net < attendu.net - 0.5 || (attendu.taux != null && taux < attendu.taux - 0.2); return { degrade, n: D.length, net, taux, attenduNet: attendu.net, attenduTaux: attendu.taux };
}
/* tableau de synthèse : une ligne par actif, unité et type de flèche */
export function synthese(stats, suivi = {}) {
  const L = []; for (const [id, A] of Object.entries((stats && stats.actifs) || {})) for (const u of ['H4', 'J']) { const s = A[u]; if (!s) continue; for (const t of TYPES_STATS) { const x = s.types[t.id]; if (!x) continue; const sr = (suivi[id] && suivi[id][u] && suivi[id][u][t.id]) || null, deg = sr && sr.degradation && sr.degradation.degrade;
    L.push({ actif: id, nom: A.nom, unite: u, type: t.id, typeNom: t.nom, reussite: x.apprentissage.taux, espNette: x.apprentissage.net, cas: x.apprentissage.n, jamaisVu: x.jamaisVu, statut: deg ? 'en dégradation' : x.verdict, reel: sr && sr.n ? sr : null }); } }
  return L;
}
