import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { combinaisons, cleParams, FAMILLES } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { decouper, evaluerVariante, walkForward, monteCarlo, robustesse, jugerHorsEchantillon } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { lignesM5 } from '../planetes/mars/pc/agent-btc/criteres-v2.js';
import { sharpeDeflate } from '../planetes/mars/pc/agent-btc/stats-m5.js';
import { enrichirTrades } from '../planetes/mars/pc/agent-btc/contexte-trades.js';
import { CRITERES, empreinteCriteres } from '../planetes/mars/pc/agent-btc/criteres.js';
import { CRITERES2 } from '../planetes/mars/pc/agent-btc/criteres-v2.js';
import { CRITERES3, empreinteV3 } from './criteres-v3.js';
import { intervalleBootstrap, simulerProp, parRegime } from './stats-v3.js';
import { famille } from './familles-v3.js';

/* ═════════════ VALIDATION V3 D'UNE STRATÉGIE (module pur, testé : galaxie/tests/strategies-v3-test.mjs) ═════════════
   UN seul protocole, écrit avant les tests (strategies/CRITERES.md) :
   0. CAUSALITÉ : les signaux calculés sur un début de série doivent être identiques à ceux de la série entière. Une stratégie qui « triche avec le futur » est REJETÉE, même si elle est « rentable ».
   1. découpage : 75 % zone de recherche (entraînement + walk-forward, au moins 4 blocs de test), 25 % JEU FINAL qui n'est JAMAIS ouvert ici ;
   2. toutes les variantes de la grille sont simulées avec frais, spread et glissement ; walk-forward : paramètres rechoisis sur l'entraînement SEUL ;
   3. critères v1 (empreinte c9995253) + v2 (Sharpe déflaté avec le nombre TOTAL de variantes) + ajouts V3 : intervalle bootstrap, compte prop (creux ≤ 6 %, journée ≤ 3 %), régimes, autres actifs.
   Résultat : « validée en backtest » ne veut PAS dire « rentable demain » : la suite est une simulation en direct (4 semaines ou 30 trades) avant la moindre alerte d'entrée réelle. */
export const STATUTS_V3 = Object.freeze({ validee_backtest: 'VALIDÉE EN BACKTEST', non_validee: 'NON VALIDÉE', rejetee_causalite: 'REJETÉE : TRICHE AVEC LE FUTUR', insuffisant: 'HISTORIQUE INSUFFISANT' });
const L = (critere, valeur, seuil, ok, unite = '') => ({ critere, valeur, seuil, ok, unite });
const comparer = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* Test du « poison du futur » : les signaux calculés sur un DÉBUT de série doivent être identiques à ceux de la série entière. Les coupes sont placées JUSTE APRÈS des signaux réels (un signal qui
   a besoin de bougies postérieures ne peut pas être reproduit quand on les retire) et à quelques endroits au hasard. `fam` = objet famille (signaux(ctx, p)). Rend { ok, ecarts, coupes, premiere }. */
export function verifierCausalite(fam, params, m15, { coupes = CRITERES3.causalite.coupes, fenetre = 30000, preparer = null } = {}) {
  const n = Math.min(m15.n, fenetre), debut = Math.max(0, m15.n - n), base = tranche(m15, debut, debut + n), ctxDe = serie => { const c = construireContexte(serie); if (preparer) preparer(c); return c; };   // `preparer` : attache les couches de flux (V4) comme dans la vraie évaluation
  const plein = fam.signaux(ctxDe(base), params);
  const idx = []; for (let i = 450; i < n - 450; i++) if (plein.sens[i] !== 0) idx.push(i);
  const positions = [];
  for (let c = 0; c < coupes && idx.length; c++) positions.push(idx[Math.floor((c + 0.5) * idx.length / coupes)] + 1);          // juste après un signal
  for (let c = 1; c <= 2; c++) positions.push(Math.floor(n * (0.4 + 0.25 * c)));                                                   // et deux coupes quelconques
  let ecarts = 0, premiere = null, testees = 0;
  for (const k of positions) {
    if (!(k > 450 && k < n)) continue; testees++;
    const court = fam.signaux(ctxDe(tranche(base, 0, k)), params);
    for (let i = 0; i < k; i++) {
      const diffSens = court.sens[i] !== plein.sens[i], diffStop = court.sens[i] !== 0 && plein.sens[i] !== 0 && Math.abs(court.stop[i] - plein.stop[i]) > 1e-9 * Math.max(1, Math.abs(plein.stop[i]));
      if (diffSens || diffStop) { ecarts++; if (premiere == null) premiere = { coupe: k, index: i }; }
    }
  }
  return { ok: ecarts === 0, ecarts, coupes: testees, premiere };
}

/* Paramètres retenus : ceux que le walk-forward a le plus souvent choisis. */
export function parametresRetenus(wf) {
  const compte = new Map();
  for (const b of wf.blocs) if (b.params) { const k = cleParams(b.params), e = compte.get(k) || { n: 0, params: b.params }; e.n++; compte.set(k, e); }
  let m = null; for (const e of compte.values()) if (!m || e.n > m.n) m = e;
  return m ? m.params : null;
}

/* Évalue UNE stratégie. `variantesAvant` = variantes déjà testées dans toute l'histoire de l'agent (le compteur ne baisse jamais). `autres` = [{ nom, m15 }] : les autres actifs (SOL, DOGE…) sur lesquels on
   applique les MÊMES paramètres retenus (aucun choix refait). `grille` : remplace la grille de la famille (tests ; la recherche réelle garde la grille d'origine). */
export function validerV3(m15Complet, id, { config = {}, variantesAvant = 0, ctx = null, autres = [], grille = null, surProgres = null, c3 = CRITERES3, debutFinal = null, preparer = null, preparerAutre = null } = {}) {
  const fam = famille(id); if (!fam) return { ok: false, id, statut: 'insuffisant', raison: 'stratégie inconnue : ' + id };
  // `debutFinal` (ms) : le jeu final commence là, FIXE (coffre) ; la recherche ne voit que ce qui précède. Sans lui : 75 % / 25 % du protocole d'origine.
  const avantFinal = x => { if (debutFinal == null) return x; let idx = 0; while (idx < x.n && x.t[idx] < debutFinal) idx++; return tranche(x, 0, idx); };
  const m15 = avantFinal(m15Complet), decoupage = debutFinal != null ? { ...CRITERES.decoupage, fractionRecherche: 1 } : CRITERES.decoupage;
  const dec = decouper(m15, decoupage), criteres = { v1: empreinteCriteres(), v2: CRITERES2.version, v3: empreinteV3(c3) };
  if (!dec.ok) return { ok: true, id, statut: 'insuffisant', raison: dec.raison, criteres, jeuFinalOuvert: false };
  if (dec.folds.length < c3.walkForward.fenetresMin) return { ok: true, id, statut: 'insuffisant', raison: 'Seulement ' + dec.folds.length + ' blocs de test hors échantillon (il en faut ' + c3.walkForward.fenetresMin + ').', criteres, jeuFinalOuvert: false };
  const g = grille || fam.grille(0), tout = combinaisons(g), parDefaut = tout[0];
  // 0. causalité
  const causal = verifierCausalite(fam, parDefaut, m15, { coupes: c3.causalite.coupes, preparer });
  if (!causal.ok) return { ok: true, id, nom: fam.nom, statut: 'rejetee_causalite', raison: 'Les signaux changent quand on ajoute des bougies APRÈS eux (' + causal.ecarts + ' écarts) : la stratégie regarde le futur.', causalite: causal, lignes: [L('Causalité (aucun regard vers le futur)', causal.ecarts, '= 0', false)], criteres, jeuFinalOuvert: false };
  const c = (ctx && debutFinal == null ? ctx : construireContexte(m15)), plage = { de: 0, a: dec.finA }; if (preparer) preparer(c);
  const lignesVar = []; let k = 0;
  for (const params of tout) { lignesVar.push(evaluerVariante(c, id, params, config, plage)); if (surProgres) surProgres(++k / tout.length); }
  const wf = walkForward(lignesVar, dec, config), mc = monteCarlo(wf.trades), retenus = parametresRetenus(wf), nVar = variantesAvant + lignesVar.length;
  const robuste = retenus ? robustesse(c, id, retenus, config, plage) : null;
  const juge1 = jugerHorsEchantillon(wf, { nVariantes: nVar, mc, robuste }), m5 = lignesM5(wf, nVar);
  const R = wf.trades.map(x => x.R), boot = intervalleBootstrap(R, { tirages: c3.bootstrap.tirages, niveau: c3.bootstrap.niveau, graine: c3.bootstrap.graine });
  const prop = simulerProp(wf.trades, c3.prop), regimes = parRegime(enrichirTrades(wf.trades, c), c3.robustesse.tradesParRegimeMin);
  const dsr = sharpeDeflate(R, nVar);
  // autres actifs : mêmes paramètres, zone de recherche de chaque actif
  const actifs = [{ nom: 'référence', n: wf.stats.n, esperance: wf.stats.esperance, positif: wf.stats.esperance > 0 && wf.stats.n >= c3.robustesse.tradesParActifMin }];
  for (const a of autres) {
    const ma = avantFinal(a.m15), da = decouper(ma, decoupage); if (!da.ok || !retenus) { actifs.push({ nom: a.nom, n: 0, esperance: null, positif: false, raison: da.ok ? 'pas de paramètres' : da.raison }); continue; }
    const ca = construireContexte(ma); if (preparerAutre) preparerAutre(ca, a.nom);
    const e = evaluerVariante(ca, id, retenus, config, { de: 0, a: da.finA });
    actifs.push({ nom: a.nom, n: e.stats.n, esperance: e.stats.esperance, positif: e.stats.esperance > 0 && e.stats.n >= c3.robustesse.tradesParActifMin });
  }
  const nbPositifs = actifs.filter(a => a.positif).length, solideSeul = dsr.dsr != null && dsr.dsr >= c3.robustesse.sinonUnActif.dsrMin && boot.bas != null && boot.bas >= c3.robustesse.sinonUnActif.basIcMin;
  const okActifs = autres.length === 0 ? null : (nbPositifs >= c3.robustesse.actifsPositifsMin || (nbPositifs >= 1 && solideSeul));
  const lignes = [
    L('Causalité (aucun regard vers le futur)', 0, '= 0', true),
    L('Blocs de test hors échantillon (walk-forward)', dec.folds.length, '≥ ' + c3.walkForward.fenetresMin, dec.folds.length >= c3.walkForward.fenetresMin),
    ...juge1.lignes, ...m5.lignes,
    L('Intervalle de confiance (bootstrap) à ' + Math.round(c3.bootstrap.niveau * 100) + ' % : borne basse', boot.bas, '> ' + c3.bootstrap.basMin, boot.bas != null && boot.bas > c3.bootstrap.basMin, ' R'),
    L('Compte prop : creux maximal simulé (' + c3.prop.risquePct + ' % de risque par trade)', prop.ddPct, '≤ ' + c3.prop.drawdownMaxPct, prop.ddPct <= c3.prop.drawdownMaxPct, ' %'),
    L('Compte prop : pire journée simulée', prop.pireJourPct, '≤ ' + c3.prop.perteJourMaxPct, prop.pireJourPct <= c3.prop.perteJourMaxPct, ' %'),
    L('Régimes positifs (hausse, baisse, range ; ≥ ' + c3.robustesse.tradesParRegimeMin + ' trades)', regimes.positifs + ' sur ' + regimes.evaluables, '≥ ' + c3.robustesse.regimesPositifsMin, regimes.evaluables >= c3.robustesse.regimesPositifsMin && regimes.positifs >= c3.robustesse.regimesPositifsMin)
  ];
  if (okActifs != null) lignes.push(L('Actifs positifs (mêmes paramètres)', nbPositifs + ' sur ' + actifs.length, '≥ ' + c3.robustesse.actifsPositifsMin + ' ou un seul avec preuve solide', okActifs));
  const ok = lignes.every(l => l.ok);
  return { ok: true, id, nom: fam.nom, statut: ok ? 'validee_backtest' : 'non_validee', lignes, ratees: lignes.filter(l => !l.ok).map(l => l.critere), retenus, nVariantes: nVar, variantesDeCetteEvaluation: lignesVar.length,
    wf: { stats: wf.stats, blocs: wf.blocs.length, tradesParBloc: wf.blocs.map(b => b.test && b.test.n) }, bootstrap: boot, prop, regimes: regimes.regimes, actifs, mc, causalite: causal, dsr,
    zoneRecherche: { de: m15.t[0], a: m15.t[dec.finA - 1], mois: dec.moisZoneA }, couvertureFlux: c.fp ? (c.fp.ok ? { de: c.fp.de, a: c.fp.a, mois: c.fp.mois } : { raison: c.fp.raison }) : null, jeuFinalOuvert: false, criteres,
    avertissement: 'Résultat de BACKTEST hors échantillon : les résultats passés ne garantissent rien. Aucun ordre n’est exécuté.' };
}
export { CRITERES, FAMILLES };
