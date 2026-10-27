import { alea, wilson, resumeR, pct, qualiteEchantillon, AVERTISSEMENT } from './stats-m6.js';
import { fusionRegles, limites } from './gardien.js';

/* ═════════════ SIMULATION DE RÉUSSITE DE L'ÉVALUATION (« machine à remonter le temps » adaptée ; M6, module pur, testé : planetes/mars/tests/m6-eval-test.mjs) ═════════════
   À partir des VRAIES statistiques d'une stratégie (la liste de ses R nets par trade, sa fréquence) et de TA situation (gain actuel, pic d'équité, limites du compte), on joue des milliers de scénarios :
   probabilité d'atteindre +10 % AVANT de toucher le drawdown (6 %) ou la perte du jour (3 %), pour plusieurs risques par trade, avec :
   - le hasard du tirage ET l'incertitude de l'échantillon (on retire d'abord un échantillon par bootstrap, puis des trajectoires dedans) → une FOURCHETTE, jamais un chiffre unique ;
   - la rejouée de l'histoire réelle : chaque trade passé sert de point de départ (les départs se chevauchent : la fourchette en tient compte).
   Hypothèses dites tout haut : trades indépendants (la vraie série a de la mémoire : séries de pertes), risque fixe en dollars (pas de composition), un trade se juge à sa clôture (le latent entre l'entrée
   et la sortie n'est pas simulé : un drawdown en équité peut tomber plus tôt que ce modèle ne le voit), frais déjà dans les R. La précision dépend de la taille de l'échantillon ; ce n'est PAS une promesse. */
const poisson = (a, lambda) => { if (lambda <= 0) return 0; const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= a(); } while (p > L && k < 50); return k - 1; };
const quantile = (tab, q) => { const s = tab.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))] : null; };

/* Plancher du drawdown selon le mode (même règle que le gardien). */
function plancher(R, L, pic, equite) {
  if (R.modeDrawdown === 'fixe') return R.capital - L.drawdown;
  let p = pic - L.drawdown; if (R.plafondTrailing === 'capital_initial') p = Math.min(p, R.capital); return p;
}
/* Une trajectoire : rend { issue: 'objectif'|'drawdown'|'jour'|'delai', jours }. */
function trajectoire(a, tirerR, { R, L, risqueUSD, gain0, pic0, lambdaJour, horizon, arretJour }) {
  let E = R.capital + gain0, pic = Math.max(pic0, E);
  for (let d = 0; d < horizon; d++) {
    const E0 = E, n = poisson(a, lambdaJour);
    for (let k = 0; k < n; k++) {
      if (arretJour && E0 - E >= L.perteJour * R.arretJourPartPct / 100) break;                       // garde-fou : on arrête de trader pour la journée
      E += risqueUSD * tirerR(); if (E > pic) pic = E;
      if (E - R.capital >= L.objectif) return { issue: 'objectif', jours: d + 1 };
      if (E <= plancher(R, L, pic, E)) return { issue: 'drawdown', jours: d + 1 };
      if (E0 - E >= L.perteJour) return { issue: 'jour', jours: d + 1 };
    }
  }
  return { issue: 'delai', jours: horizon };
}
/* Un niveau de risque : bootstrap extérieur × trajectoires intérieures. */
function unNiveau(Rtrades, risquePct, cfg, graine, arretJour) {
  const { R, L, gain0, pic0, lambdaJour, horizon, nExt, nInt } = cfg, a = alea(graine), risqueUSD = R.capital * risquePct / 100, n = Rtrades.length;
  const part = { objectif: [], drawdown: [], jour: [], delai: [] }; let jours = [];
  for (let b = 0; b < nExt; b++) {
    const ech = new Float64Array(n); for (let i = 0; i < n; i++) ech[i] = Rtrades[Math.floor(a() * n)];
    const tirer = () => ech[Math.floor(a() * n)], c = { objectif: 0, drawdown: 0, jour: 0, delai: 0 };
    for (let p = 0; p < nInt; p++) { const t = trajectoire(a, tirer, { R, L, risqueUSD, gain0, pic0, lambdaJour, horizon, arretJour }); c[t.issue]++; if (t.issue === 'objectif') jours.push(t.jours); }
    for (const k of Object.keys(c)) part[k].push(c[k] / nInt);
  }
  const moy = x => x.reduce((s, y) => s + y, 0) / x.length, F = x => ({ moy: moy(x), bas: quantile(x, 0.05), haut: quantile(x, 0.95) });
  return { risquePct, risqueUSD, pObjectif: F(part.objectif), pDrawdown: F(part.drawdown), pJour: F(part.jour), pDelai: F(part.delai), joursMedian: jours.length ? quantile(jours, 0.5) : null, trajectoires: nExt * nInt };
}

/* Rapport complet. entree = { R: [R nets], tradesParSemaine, regles, gain (équité − capital), pic (pic d'équité), risquesPct?, horizonJours?, graine?, nExt?, nInt? }. */
export function simulerEvaluation(entree) {
  const Rl = (entree.R || []).filter(Number.isFinite), n = Rl.length;
  if (n < 8) return { ok: false, erreur: 'il faut au moins 8 trades d’historique pour simuler (il y en a ' + n + ')' };
  const regles = fusionRegles(entree.regles), L = limites(regles), gain0 = Number.isFinite(entree.gain) ? entree.gain : 0, pic0 = Number.isFinite(entree.pic) ? entree.pic : regles.capital + gain0;
  const freq = entree.tradesParSemaine > 0 ? entree.tradesParSemaine : 2, cfg = { R: regles, L, gain0, pic0, lambdaJour: freq / 7, horizon: entree.horizonJours || 90, nExt: entree.nExt || 40, nInt: entree.nInt || 150 };
  const risques = entree.risquesPct || [0.25, 0.5, 0.75, 1, 1.5, 2], graine = entree.graine == null ? 20261023 : entree.graine;
  const niveaux = risques.map((r, i) => ({ ...unNiveau(Rl, r, cfg, graine + i * 101, false), avecGarde: unNiveau(Rl, r, cfg, graine + i * 101 + 7, true) }));
  const res = resumeR(Rl), maxP = Math.max(...niveaux.map(x => x.pObjectif.moy));
  const bons = niveaux.filter(x => maxP > 0 && x.pObjectif.moy >= 0.9 * maxP && x.pDrawdown.moy + x.pJour.moy <= 1 - x.pObjectif.moy + 1e-9);
  const plage = maxP >= 0.15 && res.esperance > 0 && bons.length ? { de: Math.min(...bons.map(x => x.risquePct)), a: Math.max(...bons.map(x => x.risquePct)) } : null;
  const histo = entree.trades ? rejouerHistorique({ trades: entree.trades, risquePct: plage ? plage.de : (entree.risqueRef || regles.risqueParTradePct), regles, gain: gain0, pic: pic0, horizonJours: cfg.horizon }) : null;
  const sortie = { ok: true, n, tradesParSemaine: freq, horizonJours: cfg.horizon, esperance: res.esperance, ic: res.ic, taux: res.taux, niveaux, plage, historique: histo, echantillon: qualiteEchantillon(n), depart: { gain: gain0, pic: pic0, reste: L.objectif - gain0 }, hypotheses: HYPOTHESES, avertissement: AVERTISSEMENT };
  sortie.phrases = phrases(sortie, regles, L);
  return sortie;
}
export const HYPOTHESES = Object.freeze(['trades indépendants entre eux (la vraie série a de la mémoire : séries de pertes)', 'risque fixe en dollars, sans composition', 'un trade se juge à sa clôture : le latent entre l’entrée et la sortie n’est pas simulé', 'frais, spread et glissement déjà dans les R', 'fréquence moyenne constante (tirage de Poisson)']);

/* Rejoue l'histoire réelle : chaque trade passé est un point de départ ; on applique la suite RÉELLE des R (avec leurs dates) à ta situation jusqu'à une issue. */
export function rejouerHistorique({ trades, risquePct, regles, gain = 0, pic = null, horizonJours = 90 }) {
  const R = fusionRegles(regles), L = limites(R), liste = trades.filter(x => Number.isFinite(x.R) && Number.isFinite(x.tSortie)).sort((a, b) => a.tSortie - b.tSortie), risqueUSD = R.capital * risquePct / 100, pic0 = pic == null ? R.capital + gain : pic;
  const issues = { objectif: 0, drawdown: 0, jour: 0, delai: 0, incomplet: 0 };
  for (let s = 0; s < liste.length; s++) {
    let E = R.capital + gain, pk = Math.max(pic0, E), jourCourant = null, E0 = E, issue = null; const t0 = liste[s].tSortie;
    for (let i = s; i < liste.length && !issue; i++) {
      const x = liste[i], jour = Math.floor(x.tSortie / 86400e3);
      if (jour !== jourCourant) { jourCourant = jour; E0 = E; }
      if ((x.tSortie - t0) / 86400e3 > horizonJours) { issue = 'delai'; break; }
      E += risqueUSD * x.R; if (E > pk) pk = E;
      if (E - R.capital >= L.objectif) issue = 'objectif'; else if (E <= plancher(R, L, pk, E)) issue = 'drawdown'; else if (E0 - E >= L.perteJour) issue = 'jour';
    }
    issues[issue || 'incomplet']++;
  }
  const complets = liste.length - issues.incomplet;
  return { departs: liste.length, complets, ...issues, pObjectif: wilson(issues.objectif, complets), note: 'Les départs se chevauchent (un même trade appartient à beaucoup de scénarios) : la fourchette est plus étroite que la vraie incertitude.' };
}

function phrases(s, regles, L) {
  const p = [], $ = x => Math.round(x).toLocaleString('fr-FR') + ' $', ref = s.niveaux.find(x => x.risquePct === (s.plage ? s.plage.de : regles.risqueParTradePct)) || s.niveaux[Math.min(1, s.niveaux.length - 1)];
  p.push('D’après ' + s.n + ' trades (échantillon ' + s.echantillon + '), R moyen ' + (s.esperance >= 0 ? '+' : '−') + Math.abs(s.esperance).toFixed(2).replace('.', ',') + ' (intervalle ' + (s.ic.bas != null ? s.ic.bas.toFixed(2).replace('.', ',') + ' à ' + s.ic.haut.toFixed(2).replace('.', ',') : '—') + '), environ ' + s.tradesParSemaine + ' trade(s) par semaine, il te reste ' + $(s.depart.reste) + ' à gagner.');
  p.push('Avec ' + ref.risquePct.toString().replace('.', ',') + ' % de risque par trade (' + $(ref.risqueUSD) + ') : atteindre +' + regles.objectifPct + ' % avant une limite dans ' + pct(ref.pObjectif.moy) + ' des scénarios (fourchette ' + pct(ref.pObjectif.bas) + ' à ' + pct(ref.pObjectif.haut) + '), toucher le drawdown dans ' + pct(ref.pDrawdown.moy) + ', la perte du jour dans ' + pct(ref.pJour.moy) + ', ni l’un ni l’autre en ' + s.horizonJours + ' jours dans ' + pct(ref.pDelai.moy) + '.');
  p.push(s.plage ? 'Plage de risque raisonnable pour cette stratégie : de ' + String(s.plage.de).replace('.', ',') + ' % à ' + String(s.plage.a).replace('.', ',') + ' % par trade (au-delà, les limites du compte se touchent plus vite que l’objectif).' : 'Aucun niveau de risque ne donne une probabilité raisonnable : l’espérance de cette stratégie est trop faible ou incertaine pour viser l’objectif.');
  if (s.historique && s.historique.complets) p.push('En rejouant l’histoire réelle de la stratégie (' + s.historique.complets + ' départs), l’objectif est atteint dans ' + pct(s.historique.pObjectif.p) + ' des cas.');
  p.push('La précision dépend de la taille de l’échantillon' + (s.n < 150 ? ' (ici ' + s.n + ' trades : peu)' : '') + '. ' + s.avertissement);
  return p;
}
