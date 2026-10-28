// Tests du travailleur V6 : tâche guidée, famille filtrée, compteur de variantes honnête, jeu final jamais touché, coûts de couts.json.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/travailleur-v6-test.mjs
import { executerTacheSync, chargerFinancement } from '../../agent-pc/travailleur.mjs';
import { integrerResultat, empreinteTache, cleVariante } from '../../agent-pc/recherche.mjs';
import { decouper } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { combinaisons } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { etatInitial } from '../../strategies/agent-etat.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { lireCoutsReglage } from '../../agent-pc/couts-reglage.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

const m = marcheMixte(170000, 5), dec = decouper(m), debutFinal = dec.debutFinal, series = { BTC: m, SOL: m, DOGE: m };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-trv-')), contexte = { paires: ['BTC', 'SOL', 'DOGE'], variantesAvant: 1000, couts: lireCoutsReglage(dossier), ouverturesParPaire: {} };

// ── tâche guidée ──
const grilleBase = { ema: [20, 50], stopATR: [2, 3], R: [2, 3], sortie: ['fixe', 'partielle', 'suiveur'] };
const g1 = executerTacheSync({ type: 'guidee', ronde: 1, gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: grilleBase, debutFinal }, contexte, series);
const r = g1.resumes[0];
v('tâche guidée : un résumé de validation COMPLET (walk-forward, critères) avec la trace du guidage', r.famille === 'tendance_pullback_h4' && r.type === 'guidee' && r.guidage && r.guidage.evaluations >= 16 && Array.isArray(r.variantesExplorees) && r.variantesExplorees.length === r.guidage.evaluations, JSON.stringify(r.guidage && { e: r.guidage.evaluations, p: r.guidage.positives }));
v('…la grille validée est petite (≤ 27 variantes)', r.grille && combinaisons(r.grille).length <= 27 && combinaisons(r.grille).length >= 1, JSON.stringify(r.grille));
v('…le résumé porte coût moyen en R, rapport gain / risque et mois de test (pour les meilleures pistes)', 'coutMoyenR' in r && 'moisTest' in r && r.moisTest > 12 && 'rrMoyen' in r);
v('…l’identifiant de la ronde est distinct (plusieurs rondes ne s’écrasent pas)', r.id.endsWith('#1'));
v('le jeu final n’a PAS été ouvert (aucun jeuFinal dans un résultat non validé) et le coffre reste intact', !r.jeuFinal || r.statut === 'validee_backtest');
v('reproductible : la même ronde donne les mêmes essais', JSON.stringify(executerTacheSync({ type: 'guidee', ronde: 1, gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: grilleBase, debutFinal }, contexte, series).resumes[0].variantesExplorees) === JSON.stringify(r.variantesExplorees));
const g2 = executerTacheSync({ type: 'guidee', ronde: 2, gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: grilleBase, debutFinal }, contexte, series).resumes[0];
v('une autre ronde explore d’autres points', JSON.stringify(g2.variantesExplorees) !== JSON.stringify(r.variantesExplorees));

// ── compteur de variantes : tout ce qui est essayé compte, jamais de double comptage, jamais de baisse ──
const etat = etatInitial(1761600000000), avant = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0);
const resume1 = JSON.parse(JSON.stringify(r)); const nGrille = combinaisons(resume1.grille).length, nExplorees = new Set(resume1.variantesExplorees.map(p => cleVariante(resume1.famille, resume1.paire, p))).size;
integrerResultat(etat, resume1, { famille: 'tendance_pullback_h4', paire: 'BTC', type: 'guidee', grille: resume1.grille, debutFinal }, 1761600000000);
const apres = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0);
v('le compteur monte du nombre de points DISTINCTS essayés (guidage + petite grille, sans doublon)', apres - avant >= nExplorees && apres - avant <= nExplorees + nGrille, (apres - avant) + ' pour ' + nExplorees + ' explorées et ' + nGrille + ' en grille');
v('la liste détaillée n’est pas gardée dans l’état (seul le compteur la retient)', !('variantesExplorees' in etat.backtests[0]) && JSON.stringify(etat.backtests).length < 20000);
const resume2 = JSON.parse(JSON.stringify(r)); integrerResultat(etat, resume2, { famille: 'tendance_pullback_h4', paire: 'BTC', type: 'guidee', grille: resume2.grille, debutFinal }, 1761600000001);
v('rejouer la même ronde ne fait JAMAIS monter le compteur une seconde fois', Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0) === apres);
const avantRonde2 = apres; integrerResultat(etat, JSON.parse(JSON.stringify(g2)), { famille: 'tendance_pullback_h4', paire: 'BTC', type: 'guidee', grille: g2.grille, debutFinal }, 1761600000002);
v('une autre ronde ajoute ses nouveaux points', Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0) > avantRonde2);

// ── Sharpe déflaté : les essais du guidage comptent dans le nombre de variantes ──
{
  const sans = executerTacheSync({ type: 'exploration', gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: r.grille, debutFinal }, { ...contexte, variantesAvant: 1000 }, series).resumes[0];
  v('le nombre de variantes pris en compte par la validation inclut les essais du guidage (donc un seuil plus sévère)', r.nVariantes > sans.nVariantes, r.nVariantes + ' contre ' + sans.nVariantes);
}

// ── famille filtrée (exploration standard) ──
{
  const f = executerTacheSync({ type: 'exploration', gen: 0, famille: 'tendance_pullback_h4+tendance_h4', paire: 'SOL', grille: { ema: [20], stopATR: [2], R: [2], sortie: ['fixe'] }, debutFinal }, contexte, series).resumes[0];
  v('famille filtrée : résolue par son identifiant composé, résumé complet', f.famille === 'tendance_pullback_h4+tendance_h4' && f.statut && f.nom && /·/.test(f.nom), f.nom + ' ' + f.statut);
  const fin = executerTacheSync({ type: 'exploration', gen: 0, famille: 'tendance_ma+financement', paire: 'BTC', grille: { touche: [0.3], stopATR: [1.2], R: [3], exigeH4: [0] }, debutFinal }, contexte, series, {}, {}).resumes[0];
  v('filtre « financement » sans données de financement : aucun signal, jamais une valeur inventée', fin.trades === 0 || fin.statut === 'insuffisant' || fin.esperance == null, JSON.stringify({ n: fin.trades, s: fin.statut }));
  const d = path.join(dossier, 'derives-btc.json'); fs.writeFileSync(d, JSON.stringify({ funding: [{ t: 1, taux: 0.0001 }], metrics: [] }));
  v('chargement du financement depuis derives-<actif>.json (et null si absent)', chargerFinancement(dossier, 'BTC').length === 1 && chargerFinancement(dossier, 'SOL') === null);
}
// ── JEU FINAL INTACT : ni la recherche guidée, ni les familles filtrées, ni la validation ne voient ce qui suit `debutFinal` ──
{
  let idx = 0; while (idx < m.n && m.t[idx] < debutFinal) idx++;
  const coupee = { n: idx }; for (const k of ['t', 'o', 'h', 'l', 'c', 'v', 'vb']) coupee[k] = m[k].slice(0, idx);
  const seriesCoupees = { BTC: coupee, SOL: m, DOGE: m };
  const avecFinal = executerTacheSync({ type: 'guidee', ronde: 3, gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: grilleBase, debutFinal }, { ...contexte, paires: ['BTC'] }, { BTC: m }).resumes[0];
  const sansFinal = executerTacheSync({ type: 'guidee', ronde: 3, gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: grilleBase, debutFinal }, { ...contexte, paires: ['BTC'] }, { BTC: coupee }).resumes[0];
  v('recherche guidée + validation : le résultat est IDENTIQUE que le jeu final existe ou non dans les données (il n’est jamais lu)', avecFinal.trades === sansFinal.trades && avecFinal.esperance === sansFinal.esperance && JSON.stringify(avecFinal.grille) === JSON.stringify(sansFinal.grille) && JSON.stringify(avecFinal.variantesExplorees) === JSON.stringify(sansFinal.variantesExplorees), JSON.stringify({ a: avecFinal.trades, b: sansFinal.trades }));
  const f1 = executerTacheSync({ type: 'exploration', gen: 0, famille: 'cassure_h1_retest+seance_eu_us', paire: 'BTC', grille: { N: [24], filtreH4: [0], entree: ['marche'], stopATR: [1], R: [2] }, debutFinal }, { ...contexte, paires: ['BTC'] }, { BTC: m }).resumes[0];
  const f2 = executerTacheSync({ type: 'exploration', gen: 0, famille: 'cassure_h1_retest+seance_eu_us', paire: 'BTC', grille: { N: [24], filtreH4: [0], entree: ['marche'], stopATR: [1], R: [2] }, debutFinal }, { ...contexte, paires: ['BTC'] }, { BTC: coupee }).resumes[0];
  v('famille filtrée : idem (le jeu final ne guide aucun choix)', f1.trades === f2.trades && f1.esperance === f2.esperance);
  v('le jeu final contient au moins les 6 derniers mois (ici ' + Math.round((m.t[m.n - 1] - debutFinal) / (30.4375 * 86400e3)) + ' mois) et n’est ouvert que pour une stratégie VALIDÉE (aucune ouverture ici)', (m.t[m.n - 1] - debutFinal) / (30.4375 * 86400e3) >= 6 && !avecFinal.jeuFinal);
}
// ── les coûts de couts.json sont bien utilisés ──
{
  fs.writeFileSync(path.join(dossier, 'couts.json'), JSON.stringify({ BTC: { takerPct: 0.12, makerPct: 0.05, spreadPct: 0.04, glissementPct: 0.04 } }));
  const cher = executerTacheSync({ type: 'exploration', gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: { ema: [20], stopATR: [2], R: [2], sortie: ['fixe'] }, debutFinal }, { ...contexte, couts: lireCoutsReglage(dossier) }, series).resumes[0];
  const normal = executerTacheSync({ type: 'exploration', gen: 0, famille: 'tendance_pullback_h4', paire: 'BTC', grille: { ema: [20], stopATR: [2], R: [2], sortie: ['fixe'] }, debutFinal }, contexte, series).resumes[0];
  v('des frais plus élevés dans couts.json font baisser l’espérance nette (les vrais coûts de Justin comptent)', cher.esperance < normal.esperance && cher.coutMoyenR > normal.coutMoyenR, cher.esperance + ' / ' + normal.esperance);
}
console.log('Travailleur V6 : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
