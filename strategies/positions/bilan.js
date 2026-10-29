import { alea } from '../../planetes/mars/pc/mars-calcul.js';
import { simulerRiche } from '../simulateur-riche.js';
import { AGENTS } from './agents.js';

/* ═════════════ BILAN HONNÊTE DES POSITIONS PROPOSÉES (V7, phase 4 ; module pur, testé : galaxie/tests/positions-bilan-test.mjs) ═════════════
   Pour chaque agent : propositions de la semaine / du mois, entrées exécutées (ordre limite touché), taux de réussite, rapport gain / risque RÉALISÉ, résultat en R et en % (au risque par trade choisi par Justin,
   0,5 % par défaut), pire série perdante, comparaison avec des positions prises AU HASARD, résultat par semaine avec une fourchette (bootstrap) et UNE phrase d'état honnête.
   Tout vient de la simulation (frais et glissement réalistes) : rien n'est retouché, rien n'est promis. Les « % par semaine » sont des estimations à partir du passé, pas des promesses. */
const JOUR = 86400e3, SEMAINE = 7 * JOUR;
const moy = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
export const fr = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));
export const signe = (x, d = 1) => (x == null ? '—' : (x >= 0 ? '+' : '−') + fr(Math.abs(x), d));
export const PAS_UNE_PROMESSE = 'Estimation à partir du passé, pas une promesse.';
const semaineDe = t => Math.floor((t / JOUR + 3) / 7);

export function pireSerie(R) { let pire = 0, c = 0; for (const x of R) { if (x <= 0) { c++; if (c > pire) pire = c; } else c = 0; } return pire; }

/* Résultats par semaine (en % du capital, au risque `risquePct` par trade) sur les semaines ÉCOULÉES depuis la première proposition ; les semaines sans trade valent 0. */
export function resultatsHebdo(closes, risquePct, maintenant) {
  if (!closes.length) return { semaines: [], n: 0 };
  const par = new Map(); for (const p of closes) { const s = semaineDe(p.resultat.tSortie); par.set(s, (par.get(s) || 0) + p.resultat.R * risquePct); }
  const s0 = semaineDe(Math.min(...closes.map(p => p.t))), s1 = semaineDe(maintenant) - 1;            // la semaine en cours n'est pas finie : on ne la compte pas
  const semaines = []; for (let s = s0; s <= s1; s++) semaines.push({ semaine: s, pct: par.get(s) || 0 });
  return { semaines, n: semaines.length };
}
/* Fourchette (bootstrap) du résultat hebdomadaire moyen + part de semaines à +1 % / +2 %. `graine` fixe. */
export function fourchetteHebdo(semaines, { tirages = 2000, graine = 20261029 } = {}) {
  const n = semaines.length; if (n < 4) return { assez: false, n, part1: n ? semaines.filter(s => s.pct >= 1).length / n : null, part2: n ? semaines.filter(s => s.pct >= 2).length / n : null };
  const a = alea(graine), m = []; for (let k = 0; k < tirages; k++) { let s = 0; for (let i = 0; i < n; i++) s += semaines[Math.floor(a() * n)].pct; m.push(s / n); } m.sort((x, y) => x - y);
  const pct = semaines.map(s => s.pct), q = p => m[Math.min(tirages - 1, Math.floor(p * tirages))];
  return { assez: true, n, moyenne: moy(pct), bas: q(0.05), haut: q(0.95), part1: semaines.filter(s => s.pct >= 1).length / n, part2: semaines.filter(s => s.pct >= 2).length / n, probPositive: m.filter(x => x > 0).length / tirages };
}

/* Positions « prises au hasard » : mêmes distances (en proportion du prix), même nombre, sens et barres tirés au sort sur la même période. Rend l'espérance moyenne de `simulations` tirages. */
export function baselineHasard(m15, props, config, { simulations = 30, graine = 20261029 } = {}) {
  const util = props.filter(p => p.limite && p.stop && p.cible); if (util.length < 5) return { assez: false, n: util.length };
  const a = alea(graine), n = m15.n, t0 = Math.min(...util.map(p => p.t)); let i0 = 0; while (i0 < n && m15.t[i0] < t0) i0++;
  const moyens = [];
  for (let s = 0; s < simulations; s++) {
    const sens = new Int8Array(n), stop = new Float64Array(n), lim = new Float64Array(n).fill(NaN), cib = new Float64Array(n).fill(NaN);
    for (const p of util) { if (n - i0 < 20) break; const i = i0 + Math.floor(a() * (n - i0 - 10)), d = a() < 0.5 ? 1 : -1, px = m15.c[i], f = px / p.limite, off = Math.abs(p.limite - (p.zone ? (p.zone[0] + p.zone[1]) / 2 : p.limite)) * f; if (sens[i]) continue;
      sens[i] = d; lim[i] = px - d * Math.max(off, 0.0002 * px); stop[i] = lim[i] - d * Math.abs(p.limite - p.stop) * f; cib[i] = lim[i] + d * Math.abs(p.cible - p.limite) * f; }
    const r = simulerRiche(m15, { riche: true, sens, stop, limite: lim, cible: cib, ttl: 12, R: 2, options: { stopMinAuto: true, coutPlafondR: 0.08, rrMin: 1.5, maxBarres: 96, sortie: { type: 'fixe' }, ttlBarres: 12 } }, config, { de: i0, a: n });
    const R = r.trades.map(x => x.R); if (R.length) moyens.push(moy(R));
  }
  return { assez: moyens.length > 0, n: util.length, esperance: moyens.length ? moy(moyens) : null, tirages: moyens.length };
}

/* Bilan d'UN agent (ou de tous si agent = null). `props` = propositions de l'état. */
export function bilanAgent(props, { agent = null, risquePct = 0.5, maintenant = Date.now(), hasard = null, depuis = null } = {}) {
  const l = props.filter(p => (!agent || p.agent === agent) && (!depuis || p.t >= depuis)), closes = l.filter(p => p.statut === 'cloturee' && p.resultat), R = closes.map(p => p.resultat.R);
  const semaine = l.filter(p => maintenant - p.t < SEMAINE).length, mois = l.filter(p => maintenant - p.t < 30 * JOUR).length;
  const gagnants = R.filter(x => x > 0), perdants = R.filter(x => x <= 0), total = R.reduce((a, b) => a + b, 0), jours = l.length ? Math.max(1, Math.round((maintenant - Math.min(...l.map(p => p.t))) / JOUR)) : 0;
  const hebdo = resultatsHebdo(closes, risquePct, maintenant), four = fourchetteHebdo(hebdo.semaines);
  const out = { agent, nom: agent ? AGENTS[agent].nom : 'Tous les agents', propositions: l.length, semaine, mois, expirees: l.filter(p => ['expiree', 'partie_sans_nous', 'refusee', 'perdue'].includes(p.statut)).length, enAttente: l.filter(p => p.statut === 'en_attente').length, ouvertes: l.filter(p => p.statut === 'ouverte').length, executees: closes.length + l.filter(p => p.statut === 'ouverte').length, cloturees: closes.length,
    tauxReussite: R.length ? gagnants.length / R.length : null, rrRealise: gagnants.length && perdants.length ? moy(gagnants) / -moy(perdants) : null, esperance: moy(R), Rtotal: total, pctTotal: total * risquePct, risquePct, pireSerie: pireSerie(R), jours,
    hasard, hebdo: four, semainesAnalysees: hebdo.n, ecartHasard: hasard && hasard.assez && R.length ? moy(R) - hasard.esperance : null };
  out.phrase = phraseEtat(out);
  return out;
}
/* UNE phrase d'état honnête : « 31 jours : +4,2 R sur 22 trades, preuve encore insuffisante ». */
export function phraseEtat(b) {
  if (!b.propositions) return 'Aucune position proposée pour l’instant : rien à bilanter.';
  if (!b.cloturees) return b.jours + ' jour' + (b.jours > 1 ? 's' : '') + ' : ' + b.propositions + ' position(s) proposée(s), aucune terminée (' + b.enAttente + ' en attente, ' + b.ouvertes + ' ouverte(s)) : preuve insuffisante.';
  const preuve = b.cloturees < 30 ? 'preuve encore insuffisante (moins de 30 trades)' : b.hebdo && b.hebdo.assez && b.hebdo.bas > 0 ? 'résultat positif avec une fourchette entièrement au-dessus de zéro, à confirmer' : 'preuve encore insuffisante (la fourchette inclut zéro ou le négatif)';
  return b.jours + ' jours : ' + signe(b.Rtotal, 1) + ' R sur ' + b.cloturees + ' trade' + (b.cloturees > 1 ? 's' : '') + ' (' + signe(b.pctTotal, 1) + ' % à ' + fr(b.risquePct) + ' % de risque par trade), ' + preuve + '.';
}
/* Résultat hebdomadaire en une phrase avec fourchette. */
export function phraseHebdo(b) {
  const h = b.hebdo; if (!h || !h.n) return 'Pas encore de semaine complète. ' + PAS_UNE_PROMESSE;
  const part = 'Sur ' + h.n + ' semaine' + (h.n > 1 ? 's' : '') + ' simulée' + (h.n > 1 ? 's' : '') + ' : ' + Math.round((h.part1 || 0) * 100) + ' % à +1 % ou plus, ' + Math.round((h.part2 || 0) * 100) + ' % à +2 % ou plus';
  if (!h.assez) return part + ' (trop peu de semaines pour une fourchette). ' + PAS_UNE_PROMESSE;
  return part + ' ; moyenne ' + signe(h.moyenne, 2) + ' % par semaine, fourchette à 90 % de ' + signe(h.bas, 2) + ' à ' + signe(h.haut, 2) + ' % (probabilité d’une moyenne positive : ' + Math.round(h.probPositive * 100) + ' %). ' + PAS_UNE_PROMESSE;
}
export function bilanComplet(props, opts = {}) { return { tous: bilanAgent(props, { ...opts, agent: null }), parAgent: Object.keys(AGENTS).map(a => bilanAgent(props, { ...opts, agent: a })) }; }
