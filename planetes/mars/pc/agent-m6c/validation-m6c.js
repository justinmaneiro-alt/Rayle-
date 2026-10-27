import { walkForward, statsSur, jugerHorsEchantillon, monteCarlo, score, parTrimestre, jugerJeuFinal } from '../agent-btc/evaluation.js';
import { lignesM5 } from '../agent-btc/criteres-v2.js';
import { cleParams } from '../agent-btc/hypotheses.js';
import { statistiques } from '../agent-btc/moteur.js';
import { alea } from '../mars-calcul.js';
import { CRITERES_M6C } from './criteres-m6c.js';
import { REGLES, combinaisonsRegle, signauxCroisement } from './regles-regime.js';
import { simulerSuiveur } from './simulateur-suiveur.js';

/* ═════════════ VALIDATION DES RÈGLES PAR RÉGIME (M6c ; module pur, testé : m6c-validation-test.mjs) ═════════════
   Réutilise le protocole existant (walk-forward à paramètres rechoisis sur l'entraînement, Monte Carlo, voisins, comparaisons multiples, critères v2 INTACTS) et ajoute les lignes de criteres-m6c.js :
   entrées aléatoires, croisement de moyennes mobiles, gain du filtre de régime, achat-conservation, stabilité par année et par régime, côtés long / court.
   TOUT ce module travaille sur la zone de recherche A. Le jeu final n'est touché que par `jugerFinal`, appelé UNE fois et seulement si tout passe. */
const CONFIG = { risquePct: 1 };
const L = (critere, valeur, seuil, ok, unite = '') => ({ critere, valeur, seuil, ok, unite });
const blocs = decoupe => decoupe.folds.map(f => f.test);
const dans = (trades, de, a) => trades.filter(x => x.entree >= de && x.entree < a);
export const esperanceDe = trades => (trades.length ? trades.reduce((s, x) => s + x.R, 0) / trades.length : null);

/* Simule des signaux sur la réunion des blocs de test : un résultat par bloc, trades mis bout à bout. */
export function simulerSurBlocs(ctx, signaux, decoupe, config = CONFIG) {
  const tous = []; for (const [de, a] of blocs(decoupe)) tous.push(...simulerSuiveur(ctx.m15, signaux, config, { de, a }).trades);
  return tous;
}

/* Évalue toutes les variantes d'une règle sur la zone A : une simulation continue par variante. */
export function evaluerLignes(ctx, id, decoupe, config = CONFIG, { filtre = null } = {}) {
  const regle = REGLES[id], lignes = [];
  for (const params of combinaisonsRegle(id)) {
    const p = filtre == null ? params : { ...params, filtre };
    const sig = regle.signaux(ctx, p), sim = simulerSuiveur(ctx.m15, sig, config, { de: 0, a: decoupe.finA });
    lignes.push({ params: p, trades: sim.trades, evenements: sig.evenements });
  }
  return lignes;
}

/* Voisins d'une variante dans la grille : un paramètre décalé d'un cran (valeurs voisines dans la liste ordonnée). */
export function voisinsGrille(id, params) {
  const g = REGLES[id].grille(), out = [];
  for (const k of Object.keys(g)) { const i = g[k].indexOf(params[k]); for (const d of [-1, 1]) if (i + d >= 0 && i + d < g[k].length) out.push({ ...params, [k]: g[k][i + d] }); }
  return out;
}
export function robustesseGrille(id, lignes, retenu, decoupe, config = CONFIG) {
  const par = new Map(lignes.map(l => [cleParams(l.params), l])), centre = par.get(cleParams(retenu));
  const stat = l => statsSur(l.trades, 0, decoupe.finA, config), c = centre ? stat(centre).esperance : null, res = [];
  for (const v of voisinsGrille(id, retenu)) { const l = par.get(cleParams(v)); if (l) { const s = stat(l); res.push({ params: v, n: s.n, esperance: s.esperance }); } }
  const ok = res.filter(r => r.n >= 10 && r.esperance != null), pos = ok.filter(r => r.esperance > 0).length, mediane = ok.length ? ok.map(r => r.esperance).sort((a, b) => a - b)[ok.length >> 1] : null;
  return { voisins: res, testables: ok.length, partPositive: ok.length ? pos / ok.length : null, mediane, centre: c };
}
const meilleureLigne = (lignes, decoupe, config) => { let m = null, sc = -Infinity; for (const l of lignes) { const s = score(statsSur(l.trades, 0, decoupe.finA, config), 30); if (s > sc) { sc = s; m = l; } } return m; };

/* Entrées aléatoires : mêmes blocs de test, mêmes paramètres que la règle dans chaque bloc, mêmes stops, même éligibilité (régime), même densité de signaux. */
export function hasardAleatoire(ctx, id, wf, decoupe, { tirages = CRITERES_M6C.hasard.tirages, graine = 20261023, config = CONFIG } = {}) {
  const regle = REGLES[id], n = ctx.n, sens = new Int8Array(n), stop = new Float64Array(n), suivi = new Float64Array(n), cible = new Float64Array(n).fill(NaN);
  const plans = [], cacheSig = new Map();
  decoupe.folds.forEach((f, k) => {
    const b = wf.blocs[k]; if (!b || !b.params) return; const cle = cleParams(b.params);
    if (!cacheSig.has(cle)) { const s = regle.signaux(ctx, b.params); cacheSig.set(cle, { sig: s.sens, elig: regle.eligibles(ctx, b.params) }); }
    const { sig, elig } = cacheSig.get(cle), [de, a] = f.test, idx = []; let nSig = 0;
    for (let i = de; i < a - 1; i++) { if (elig[i] !== 0) idx.push(i); if (sig[i] !== 0) nSig++; }
    if (idx.length) plans.push({ de, a, idx, p: Math.min(1, nSig / idx.length), params: b.params, elig });
  });
  const rnd = alea(graine), esp = [];
  for (let t = 0; t < tirages; t++) {
    const tous = [];
    for (const pl of plans) {
      const touches = [];
      for (const i of pl.idx) {
        if (rnd() >= pl.p) continue;
        const s = pl.elig[i] === 2 ? (rnd() < 0.5 ? 1 : -1) : pl.elig[i], bld = regle.construire(ctx, pl.params, i, s); if (!bld) continue;
        sens[i] = s; stop[i] = bld.stop; suivi[i] = bld.suivi || 0; cible[i] = bld.cible != null ? bld.cible : NaN; touches.push(i);
      }
      tous.push(...simulerSuiveur(ctx.m15, { sens, stop, suivi, cible }, config, { de: pl.de, a: pl.a }).trades);
      for (const i of touches) { sens[i] = 0; cible[i] = NaN; }
    }
    esp.push(esperanceDe(tous) == null ? 0 : esperanceDe(tous));
  }
  esp.sort((a, b) => a - b); return esp;
}
const centileDe = (tri, x) => { let k = 0; for (const y of tri) if (y < x) k++; return tri.length ? k / tri.length : null; };

/* Achat-conservation sur les blocs de test mis bout à bout : rendement, creux, rapport. */
export function achatConservation(ctx, decoupe) {
  const c = ctx.m15.c; let eq = 1, pic = 1, dd = 0;
  for (const [de, a] of blocs(decoupe)) { const base = c[Math.max(0, de - 1)]; let eq0 = eq; for (let i = de; i < a; i++) { eq = eq0 * c[i] / base; if (eq > pic) pic = eq; if ((pic - eq) / pic > dd) dd = (pic - eq) / pic; } }
  const ret = (eq - 1) * 100; return { rendementPct: ret, ddPct: dd * 100, rapport: dd > 0 ? ret / (dd * 100) : null };
}
export function parAnnee(trades) { const m = new Map(); for (const x of trades) { const a = new Date(x.t).getUTCFullYear(); const e = m.get(a) || { annee: a, n: 0, R: 0 }; e.n++; e.R += x.R; m.set(a, e); } return [...m.values()].sort((a, b) => a.annee - b.annee); }
export function parRegime(trades) { const m = new Map(); for (const x of trades) { const e = m.get(x.regime) || { regime: x.regime, n: 0, R: 0, gagnants: 0 }; e.n++; e.R += x.R; if (x.R > 0) e.gagnants++; m.set(x.regime, e); } return [...m.values()].map(e => ({ ...e, esperance: e.R / e.n, taux: e.gagnants / e.n })); }
export function parCote(trades) { const f = s => { const t = trades.filter(x => x.sens === s); return { n: t.length, esperance: esperanceDe(t), R: t.reduce((a, x) => a + x.R, 0) }; }; return { long: f(1), court: f(-1) }; }

/* Évalue UNE règle sur une paire : tout le protocole hors jeu final. `nAvant` = variantes déjà testées avant (compteur cumulatif de la paire). */
export function evaluerRegle({ ctx, id, decoupe, nAvant, c = CRITERES_M6C, config = CONFIG, tirages = c.hasard.tirages }) {
  const regle = REGLES[id], lignes = evaluerLignes(ctx, id, decoupe, config);
  const sansFiltre = regle.regime === 'tendance' ? evaluerLignes(ctx, id, decoupe, config, { filtre: 0 }) : [];
  const nVariantes = nAvant + lignes.length + sansFiltre.length;
  const wf = walkForward(lignes, decoupe, config), retenu = meilleureLigne(lignes, decoupe, config);
  const mc = monteCarlo(wf.trades), rob = retenu ? robustesseGrille(id, lignes, retenu.params, decoupe, config) : null;
  const juge = jugerHorsEchantillon(wf, { nVariantes, mc, robuste: rob, c: c.base }), extra = lignesM5(wf, nVariantes, c.base);
  const lignesTout = [...juge.lignes, ...extra.lignes], st = wf.stats, esp = st.esperance;
  // références
  const hasard = wf.trades.length >= 10 ? hasardAleatoire(ctx, id, wf, decoupe, { tirages, config }) : null, centile = hasard ? centileDe(hasard, esp == null ? -Infinity : esp) : null;
  lignesTout.push(L('Entrées aléatoires (mêmes stops, même régime) : centile de la règle', centile, '≥ ' + Math.round(c.hasard.centileMin * 100) + ' %', centile != null && centile >= c.hasard.centileMin));
  const cx = simulerSurBlocs(ctx, signauxCroisement(ctx, { trail: wf.blocs.find(b => b.params && b.params.trail) ? wf.blocs.find(b => b.params && b.params.trail).params.trail : 3, filtre: regle.regime === 'tendance' ? 1 : 0 }), decoupe, config), espCx = esperanceDe(cx);
  lignesTout.push(L('Croisement de moyennes mobiles (EMA 20/50 H1, mêmes stops) : espérance', espCx, '< ' + (esp == null ? '—' : esp.toFixed(3)), esp != null && espCx != null ? esp > espCx + c.croisement.margeMin : false, ' R'));
  let gainFiltre = null;
  if (sansFiltre.length) {
    const wf0 = walkForward(sansFiltre, decoupe, config); gainFiltre = esp != null && wf0.stats.esperance != null ? esp - wf0.stats.esperance : null;
    lignesTout.push(L('Gain du filtre de régime (avec − sans), R par trade', gainFiltre, '≥ +' + c.filtre.gainMinR, gainFiltre != null && gainFiltre >= c.filtre.gainMinR, ' R'));
  }
  const bh = achatConservation(ctx, decoupe), rapport = st.ddPct > 0 ? st.rendementPct / st.ddPct : null;
  lignesTout.push(L('Rendement ÷ creux face à l’achat-conservation (' + (bh.rapport == null ? '—' : bh.rapport.toFixed(2)) + ')', rapport, '≥ ' + (bh.rapport == null ? '—' : (bh.rapport * c.achatConservation.rapportMin).toFixed(2)), rapport != null && bh.rapport != null && rapport >= bh.rapport * c.achatConservation.rapportMin));
  const ans = parAnnee(wf.trades), utiles = ans.filter(a => a.n >= c.stabilite.tradesParAnneeMin), posAns = utiles.filter(a => a.R > 0).length;
  lignesTout.push(L('Années positives (≥ ' + c.stabilite.tradesParAnneeMin + ' trades)', utiles.length ? posAns / utiles.length : null, '≥ ' + Math.round(c.stabilite.anneesPositivesMin * 100) + ' %', utiles.length >= 3 && posAns / utiles.length >= c.stabilite.anneesPositivesMin));
  const regs = parRegime(wf.trades), mauvais = regs.filter(r => r.n >= c.stabilite.tradesParRegimeMin && r.esperance < c.stabilite.regimeAbsurdeR);
  lignesTout.push(L('Aucun régime (≥ ' + c.stabilite.tradesParRegimeMin + ' trades) à moins de ' + c.stabilite.regimeAbsurdeR + ' R', mauvais.length, '0', mauvais.length === 0));
  const cotes = parCote(wf.trades);
  const cotesOk = { long: cotes.long.n >= c.cotes.tradesMin && cotes.long.esperance > 0, court: cotes.court.n >= c.cotes.tradesMin && cotes.court.esperance > 0 };
  // mêmes paramètres sur les trois paires : la variante PAR DÉFAUT (déclarée avant les mesures), identique partout, sur les mêmes blocs de test
  const tDef = simulerSurBlocs(ctx, regle.signaux(ctx, regle.defaut), decoupe, config), defautOOS = { params: regle.defaut, n: tDef.length, esperance: esperanceDe(tDef) };
  const ok = lignesTout.every(l => l.ok);
  return { id, nVariantes, defautOOS, nLignes: lignes.length + sansFiltre.length, wf, retenu: retenu && retenu.params, lignes: lignesTout, ok, stats: st, mc, robustesse: rob, hasard: { centile, tirages: hasard ? hasard.length : 0, mediane: hasard ? hasard[hasard.length >> 1] : null }, croisement: { n: cx.length, esperance: espCx }, gainFiltre,
    achatConservation: bh, parAnnee: ans, parRegime: regs, cotes, cotesOk, evenements: retenu ? retenu.evenements : [], trimestres: parTrimestre(wf.trades) };
}

/* Décision finale d'une règle : 'SIGNAL' (tout passe, jeu final inclus) ou 'INFORMATION'. Le jeu final n'est ouvert qu'ici, UNE fois, si `pretPourFinal` ; `ouvrirFinal` est fourni par l'appelant (coffre). */
export function statutRegle({ resultat, positivesSurPaires, c = CRITERES_M6C, jeuFinal = null }) {
  const raisons = resultat.lignes.filter(l => !l.ok).map(l => l.critere);
  const pairesOk = positivesSurPaires >= c.paires.positivesMin; if (!pairesOk) raisons.push('Mêmes paramètres sur 3 paires : positive sur ' + positivesSurPaires + ' paire(s), il en faut ' + c.paires.positivesMin);
  if (raisons.length) return { statut: 'INFORMATION', raisons };
  if (!jeuFinal) return { statut: 'EN_ATTENTE_JEU_FINAL', raisons: [] };
  return jeuFinal.ok ? { statut: 'SIGNAL', raisons: [] } : { statut: 'INFORMATION', raisons: ['Jeu final : ' + jeuFinal.lignes.filter(l => !l.ok).map(l => l.critere).join(' ; ')] };
}
export { jugerJeuFinal, statistiques };
