/* ═════════════ « MES ACTIFS » : CHER OU PAS CHER ? (v7, phase 3) — module PUR, testé ═════════════
   Chaque actif (Bitcoin, Solana, or, Nasdaq 100, S&P 500, pétrole) a une liste d'indicateurs calculés chaque jour (outils-donnees/invest/mes-actifs.mjs).
   Un indicateur porte : sa valeur, son historique, son percentile (position dans SA propre histoire), un score de -1 (à éviter) à +1 (très attractif), un type et sa source.
   Verdict par horizon = moyenne pondérée des scores (le poids dépend du type d'indicateur et de l'horizon), mis sur l'échelle 0–100 de la fenêtre Investissement
   (Très attractif ≥ 72, Attractif ≥ 58, Neutre ≥ 42, Peu attractif ≥ 28, À éviter). Confiance : part des indicateurs disponibles × accord entre eux. Lecture seule, jamais un ordre. */
import { libelleDe, LIBELLES } from './modele.js';

export const HORIZONS_MA = Object.freeze([
  { id: 'tactique', nom: '1–10 jours', i: 0 }, { id: 'swing', nom: '1–6 mois', i: 1 }, { id: 'moyen', nom: '1–3 ans', i: 2 }, { id: 'long', nom: '5–10 ans', i: 3 }]);
/* poids par type d'indicateur et par horizon (tactique, swing, moyen, long) */
export const POIDS = Object.freeze({ valeur: [0.1, 0.5, 1, 1], tendance: [1, 0.8, 0.3, 0.1], sentiment: [0.7, 0.5, 0.2, 0], saison: [0.5, 0.4, 0.2, 0], macro: [0.3, 0.7, 1, 0.6] });
export const TYPES = Object.freeze({ valeur: 'valorisation', tendance: 'tendance', sentiment: 'positionnement', saison: 'saisonnalité', macro: 'macro' });

/* percentile (0–100) de v dans la liste de valeurs ; null s'il y a moins de 8 valeurs */
export function percentile(valeurs, v) {
  const L = (valeurs || []).filter(Number.isFinite); if (L.length < 8 || !Number.isFinite(v)) return null; let moins = 0, egal = 0; for (const x of L) { if (x < v) moins++; else if (x === v) egal++; }
  return Math.round((moins + egal / 2) / L.length * 1000) / 10;
}
/* score −1…+1 depuis le percentile : « cher si haut » → un percentile bas est attractif */
export const scoreDepuisPercentile = (p, sens) => (p == null ? null : Math.max(-1, Math.min(1, ((sens === 'cher_si_haut' ? 50 - p : p - 50) / 50) * 1.15)));
export const sur100 = s => Math.round((50 + 50 * s) * 10) / 10;

/* verdict d'un actif sur un horizon : { score100, libelle, confiance, pourquoi[3], contributions[] } */
export function verdictHorizon(indicateurs, horizonId) {
  const h = HORIZONS_MA.find(x => x.id === horizonId) || HORIZONS_MA[2], tous = (indicateurs || []).filter(x => POIDS[x.type] && POIDS[x.type][h.i] > 0);
  const avec = tous.filter(x => Number.isFinite(x.score)), poidsTot = tous.reduce((s, x) => s + POIDS[x.type][h.i], 0), poidsOk = avec.reduce((s, x) => s + POIDS[x.type][h.i], 0);
  if (!avec.length || poidsOk < 0.5) return { score100: null, libelle: LIBELLES.ND, confiance: 0, pourquoi: ['Pas assez d’indicateurs disponibles pour cet horizon.'], contributions: [] };
  const moy = avec.reduce((s, x) => s + POIDS[x.type][h.i] * x.score, 0) / poidsOk, ecart = Math.sqrt(avec.reduce((s, x) => s + POIDS[x.type][h.i] * (x.score - moy) ** 2, 0) / poidsOk);
  const confiance = Math.round(100 * Math.max(0, Math.min(1, (poidsOk / poidsTot) * (1 - Math.min(1, ecart / 1.2)) * Math.min(1, avec.length / 4))));
  const contributions = avec.map(x => ({ id: x.id, nom: x.nom, type: x.type, score: x.score, poids: POIDS[x.type][h.i], apport: POIDS[x.type][h.i] * x.score / poidsOk, texte: x.texte, percentile: x.percentile })).sort((a, b) => Math.abs(b.apport) - Math.abs(a.apport));
  const score100 = sur100(moy);
  return { score100, libelle: libelleDe(score100), confiance, pourquoi: contributions.slice(0, 3).map(phrasePourquoi), contributions };
}
export function phrasePourquoi(c) {
  const sens = c.score >= 0.35 ? 'plutôt favorable' : c.score >= 0.1 ? 'légèrement favorable' : c.score > -0.1 ? 'neutre' : c.score > -0.35 ? 'légèrement défavorable' : 'plutôt défavorable';
  const pos = c.percentile != null ? ` (plus haut que ${Math.round(c.percentile)} % de son historique)` : '';
  return `${c.nom} : ${c.texte || '—'}${pos} → ${sens}.`;
}
export const verdictsActif = ind => Object.fromEntries(HORIZONS_MA.map(h => [h.id, verdictHorizon(ind, h.id)]));

/* phrase parlée : « L'or sur 1 à 3 ans : neutre (confiance 62 %). Pourquoi : … » */
export function phraseVerdict(nom, ind, horizonId = 'moyen') {
  const h = HORIZONS_MA.find(x => x.id === horizonId) || HORIZONS_MA[2], v = verdictHorizon(ind, h.id);
  if (v.score100 == null) return `Je n’ai pas assez de données pour juger ${nom} sur ${h.nom}.`;
  const lib = v.libelle.toLowerCase(), cher = v.score100 < 42 ? 'plutôt cher' : v.score100 >= 58 ? 'plutôt bon marché' : 'ni cher ni bon marché';
  return `${nom} sur ${h.nom} : ${lib}, donc ${cher}, avec ${v.confiance} pour cent de confiance. ${v.pourquoi.slice(0, 2).map(t => t.replace(/→/g, ':').replace(/\s*\([^)]*\)/g, '')).join(' ')} Information de marché, jamais un conseil.`;
}
/* reconnaissance d'une demande « est-ce que l'or est cher ? », « où en est le Bitcoin sur 1 à 3 ans ? » */
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const ACTIFS_MA = Object.freeze([
  { id: 'btc', nom: 'Bitcoin', re: /\b(bitcoin|btc)\b/ }, { id: 'sol', nom: 'Solana', re: /\b(solana|sol)\b/ }, { id: 'or', nom: 'L’or', re: /\b(l or|or|gold|xau)\b/ },
  { id: 'us100', nom: 'Le Nasdaq 100', re: /\b(nasdaq|us100|nasdaq 100)\b/ }, { id: 'us500', nom: 'Le S&P 500', re: /\b(s p 500|sp500|s p|us500|standard and poor)\b/ }, { id: 'petrole', nom: 'Le pétrole', re: /\b(petrole|wti|brent|baril)\b/ }]);
export function intentionMesActifs(texte) {
  const n = norm(texte).replace(/^(hey |dis moi |dis )?rayle /, ''); if (!n) return null;
  const horizonDit = /\b(1 a 3 ans|5 a 10 ans|1 a 6 mois|1 a 10 jours|long terme|moyen terme|court terme|tres long terme)\b/.test(n);
  if (!(/\b(cher|chere|bon marche|surevalue|sous evalue|valorise|prix raisonnable|attractif)\b/.test(n) || (/\bou en est\b/.test(n) && horizonDit))) return null;   // « où en est le bitcoin » seul reste une question de prix
  if (/\b(action|actions|societe|etf)\b/.test(n) && !/\b(nasdaq|s p|sp500|us500|us100)\b/.test(n)) return null;
  const A = ACTIFS_MA.find(a => a.re.test(n)); if (!A) return null;
  const h = /\b(1 a 10 jours|quelques jours|court terme|cette semaine|tactique)\b/.test(n) ? 'tactique' : /\b(1 a 6 mois|quelques mois|swing)\b/.test(n) ? 'swing' : /\b(5 a 10 ans|long terme|tres long terme)\b/.test(n) ? 'long' : 'moyen';
  return { type: 'mesactifs', actif: A.id, nom: A.nom, horizon: h };
}
