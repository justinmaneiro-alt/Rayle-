import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { simuler, statistiques, CONFIG_DEFAUT } from '../../planetes/mars/pc/agent-btc/moteur.js';
import { alea } from '../../planetes/mars/pc/mars-calcul.js';
import { verifierCausalite } from '../validation-v3.js';
import { enrichirTrades } from '../../planetes/mars/pc/agent-btc/contexte-trades.js';
import { famille } from '../familles-v3.js';

/* ═════════════ L'AUDITEUR (V4, phase 6 ; module pur, testé : galaxie/tests/equipe-test.mjs) ═════════════
   Le deuxième rôle interne de Kepler : il essaie de CASSER chaque candidate AVANT tout feu vert, et rien n'est « validé » sans son rapport écrit. Il ne remplace aucun critère de validation (v1, v2, v3 :
   intacts) : ses tests s'AJOUTENT. Tests :
   1. fuite du futur (poison : signaux identiques quand on coupe la série, 10 coupes) ;
   2. signaux MÉLANGÉS : mêmes barres, sens tiré au sort → l'espérance observée doit battre 95 % des essais (p ≤ 0,05) ;
   3. stratégie ALÉATOIRE de même fréquence (barres tirées au hasard, mêmes distances de stop) → idem ;
   4. frais × 2 : l'espérance reste positive ;
   5. exécution décalée d'une bougie : l'espérance reste positive et ≥ la moitié de l'originale ;
   6. dépendance à quelques trades : sans les 3 meilleurs trades, l'espérance reste positive ;
   7. mois : au moins 55 % des mois (avec ≥ 2 trades) sont positifs ; 8. régimes : détail par régime (information, le critère v3 s'applique déjà) ;
   9. sensibilité aux paramètres : reprise du résultat des voisins de la validation (information).
   Chaque test dit ce qu'il a mesuré et pourquoi il a échoué. Tout est déterministe (graine fixe). Aucune IA : le modèle de langage ne juge jamais. */
export const SEUILS_AUDITEUR = Object.freeze({ simulations: 200, pMax: 0.05, moisPositifsMin: 0.55, moisTradesMin: 2, sansMeilleursN: 3, decalage: 1, fraisFacteur: 2, graine: 20261028, coupes: 10 });
const mois = t => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const T = (nom, ok, valeur, seuil, explication) => ({ nom, ok, valeur, seuil, explication });
const espDe = (m15, sig, config, plage) => { const sim = simuler(m15, sig, config, plage), st = statistiques(sim.trades, { barres: plage.a - plage.de, risquePct: (config && config.risquePct) || 1 }); return { st, trades: sim.trades }; };
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));

/* Copie des signaux avec décalage d'une bougie (l'entrée a lieu une bougie plus tard). */
export function decaler(sig, k = 1) { const n = sig.sens.length, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: sig.R }; for (let i = 0; i + k < n; i++) if (sig.sens[i]) { o.sens[i + k] = sig.sens[i]; o.stop[i + k] = sig.stop[i]; } return o; }
/* Signaux tirés au sort : `barres` = indices ; sens aléatoire ou conservé ; stop à la même distance de la clôture. */
function signauxAleatoires(m15, base, rng, { melangerSens, barresAuHasard, de, a }) {
  const n = m15.n, idx = []; for (let i = de; i < a - 1; i++) if (base.sens[i]) idx.push(i);
  const o = { sens: new Int8Array(n), stop: new Float64Array(n), R: base.R };
  for (const i of idx) {
    const dist = Math.abs(m15.c[i] - base.stop[i]), j = barresAuHasard ? de + 300 + Math.floor(rng() * Math.max(1, a - de - 400)) : i, s = melangerSens || barresAuHasard ? (rng() < 0.5 ? 1 : -1) : base.sens[i];
    if (o.sens[j]) continue; o.sens[j] = s; o.stop[j] = s > 0 ? m15.c[j] - dist : m15.c[j] + dist;
  }
  return o;
}

/* `candidate` : { id (famille), params, paire, nom }. `m15` : série de la zone de RECHERCHE (jamais le jeu final : l'appelant la coupe). `config` : coûts de la paire. `preparer` : attache les couches de flux au
   contexte (comme dans la validation). `resultatValidation` : sortie de validerV3 (pour reprendre régimes et voisins). Rend { ok, tests[], rapport[] (lignes en français), resume (3 lignes) }. */
export function auditer(candidate, m15, { config = {}, preparer = null, resultatValidation = null, ctx = null, seuils = SEUILS_AUDITEUR, plage = null, maintenant = Date.now() } = {}) {
  const fam = famille(candidate.id); if (!fam) return { ok: false, tests: [T('Stratégie connue', false, null, 'oui', 'famille inconnue : ' + candidate.id)], rapport: ['Stratégie inconnue : audit impossible.'], resume: ['Audit impossible : stratégie inconnue.'] };
  const tests = [], pl = plage || { de: 0, a: m15.n };
  const c = ctx || (() => { const x = construireContexte(m15); if (preparer) preparer(x); return x; })();
  // 1. causalité (plus de coupes que la validation)
  const caus = verifierCausalite(fam, candidate.params, m15, { coupes: seuils.coupes, preparer });
  tests.push(T('Aucune fuite du futur (10 coupes)', caus.ok, caus.ecarts, '0 écart', caus.ok ? 'les signaux sont identiques quand on coupe la série juste après un signal' : caus.ecarts + ' écarts : la stratégie regarde des bougies postérieures (premier écart en coupe ' + (caus.premiere && caus.premiere.coupe) + ')'));
  if (!caus.ok) return conclure(candidate, tests, maintenant);                         // inutile de continuer : une stratégie qui triche est rejetée
  const sig = fam.signaux(c, candidate.params), base = espDe(m15, sig, config, pl), esp = base.st.esperance, n = base.st.n;
  if (!(n >= 30)) { tests.push(T('Assez de trades pour être audité', false, n, '≥ 30', 'seulement ' + n + ' trades dans la zone de recherche')); return conclure(candidate, tests, maintenant); }
  // 2 et 3. mélange et aléatoire
  const rng = alea(seuils.graine), simsM = [], simsA = [];
  for (let k = 0; k < seuils.simulations; k++) { simsM.push(espDe(m15, signauxAleatoires(m15, sig, rng, { melangerSens: true, barresAuHasard: false, ...pl }), config, pl).st.esperance); simsA.push(espDe(m15, signauxAleatoires(m15, sig, rng, { melangerSens: false, barresAuHasard: true, ...pl }), config, pl).st.esperance); }
  const pVal = sims => (sims.filter(x => x != null && x >= esp).length + 1) / (sims.length + 1);
  const pM = pVal(simsM), pA = pVal(simsA);
  tests.push(T('Signaux mélangés (sens tiré au sort, mêmes bougies)', pM <= seuils.pMax, pM, '≤ ' + seuils.pMax, 'p = ' + fmt(pM, 3) + ' : ' + (pM <= seuils.pMax ? 'le sens choisi par la stratégie apporte de l’information' : 'tirer le sens au hasard fait aussi bien dans ' + Math.round(pM * 100) + ' % des cas')));
  tests.push(T('Stratégie aléatoire de même fréquence', pA <= seuils.pMax, pA, '≤ ' + seuils.pMax, 'p = ' + fmt(pA, 3) + ' : ' + (pA <= seuils.pMax ? 'les entrées choisies battent des entrées au hasard' : 'des entrées au hasard (mêmes distances de stop) font aussi bien dans ' + Math.round(pA * 100) + ' % des cas')));
  // 4. frais x2
  const cfg2 = { ...CONFIG_DEFAUT, ...config, fraisPct: (config.fraisPct ?? CONFIG_DEFAUT.fraisPct) * seuils.fraisFacteur, spreadPct: (config.spreadPct ?? CONFIG_DEFAUT.spreadPct) * seuils.fraisFacteur, glissementPct: (config.glissementPct ?? CONFIG_DEFAUT.glissementPct) * seuils.fraisFacteur };
  const e2 = espDe(m15, sig, cfg2, pl).st.esperance; tests.push(T('Frais, spread et glissement × 2', e2 != null && e2 > 0, e2, '> 0 R', 'espérance ' + fmt(e2) + ' R avec des coûts doublés (' + fmt(esp) + ' R avec les coûts normaux)'));
  // 5. exécution décalée
  const ed = espDe(m15, decaler(sig, seuils.decalage), config, pl).st.esperance; tests.push(T('Exécution décalée d’une bougie', ed != null && ed > 0 && ed >= 0.5 * esp, ed, '> 0 et ≥ 50 % de ' + fmt(esp), 'espérance ' + fmt(ed) + ' R quand on entre une bougie plus tard'));
  // 6. dépendance à quelques trades
  const R = base.trades.map(t => t.R).sort((a, b) => b - a), sans = R.slice(seuils.sansMeilleursN), moy = sans.length ? sans.reduce((a, b) => a + b, 0) / sans.length : null;
  tests.push(T('Sans les ' + seuils.sansMeilleursN + ' meilleurs trades', moy != null && moy > 0, moy, '> 0 R', 'espérance ' + fmt(moy) + ' R sans ses ' + seuils.sansMeilleursN + ' meilleurs trades (' + fmt(esp) + ' R avec)'));
  // 7. mois
  const pm = new Map(); for (const t of base.trades) { const k = mois(t.t), e = pm.get(k) || { n: 0, R: 0 }; e.n++; e.R += t.R; pm.set(k, e); }
  const ms = [...pm.values()].filter(x => x.n >= seuils.moisTradesMin), part = ms.length ? ms.filter(x => x.R > 0).length / ms.length : null;
  tests.push(T('Mois positifs (≥ ' + seuils.moisTradesMin + ' trades dans le mois)', part != null && part >= seuils.moisPositifsMin, part, '≥ ' + Math.round(seuils.moisPositifsMin * 100) + ' %', ms.length + ' mois évalués, ' + Math.round((part || 0) * 100) + ' % positifs'));
  // 8 et 9. informations
  let regimes = null; try { const en = enrichirTrades(base.trades, c), r = {}; for (const k of ['hausse', 'baisse', 'range']) { const x = en.filter(t => t.regime === k); r[k] = { n: x.length, esperance: x.length ? x.reduce((a, t) => a + t.R, 0) / x.length : null }; } regimes = r; } catch (e) { /* facultatif */ }
  const voisins = resultatValidation && resultatValidation.lignes ? resultatValidation.lignes.find(l => /Voisins des paramètres/.test(l.critere)) : null;
  const rapport = lignesRapport(candidate, tests, { esp, n, regimes, voisins, e2, ed });
  return conclure(candidate, tests, maintenant, rapport, { esperance: esp, trades: n, pMelange: pM, pAleatoire: pA });
}
function lignesRapport(candidate, tests, { esp, n, regimes, voisins, e2, ed }) {
  const L = ['# Rapport de l’Auditeur — ' + (candidate.nom || candidate.id) + ' · ' + (candidate.paire || '?'), '', 'Mesuré sur la zone de RECHERCHE seulement (le jeu final n’est jamais touché). Ces tests s’ajoutent aux critères de validation ; ils ne les remplacent pas.', '', 'Espérance de référence : ' + fmt(esp) + ' R par trade sur ' + n + ' trades.', ''];
  for (const t of tests) L.push('- ' + (t.ok ? 'RÉUSSI' : 'ÉCHOUÉ') + ' · ' + t.nom + ' : ' + t.explication + ' (seuil : ' + t.seuil + ').');
  if (regimes) { L.push('', 'Par régime (information) : ' + Object.entries(regimes).map(([k, v]) => k + ' ' + v.n + ' trades, ' + fmt(v.esperance) + ' R').join(' ; ') + '.'); }
  if (voisins) L.push('Sensibilité aux paramètres (information, reprise de la validation) : ' + (voisins.ok ? 'réussie' : 'ratée') + ' — ' + fmt(voisins.valeur) + ' de voisins positifs.');
  return L;
}
function conclure(candidate, tests, maintenant, rapport = null, mesures = {}) {
  const ok = tests.every(t => t.ok), rate = tests.filter(t => !t.ok);
  const resume = [ok ? 'L’Auditeur n’a pas réussi à casser cette stratégie (' + tests.length + ' tests passés).' : 'L’Auditeur la rejette : ' + rate.map(t => t.nom).slice(0, 3).join(' ; ') + '.', 'Rien n’est validé sans ce rapport ; ces tests s’ajoutent aux critères.', 'Hypothèse de backtest, pas une promesse de gain.'];
  return { ok, t: maintenant, candidate: { id: candidate.id, nom: candidate.nom, paire: candidate.paire }, tests, rapport: rapport || ['# Rapport de l’Auditeur — ' + (candidate.nom || candidate.id), '', ...tests.map(t => '- ' + (t.ok ? 'RÉUSSI' : 'ÉCHOUÉ') + ' · ' + t.nom + ' : ' + t.explication)], resume, ...mesures };
}
export const rapportMarkdown = a => a.rapport.join('\n') + '\n';
