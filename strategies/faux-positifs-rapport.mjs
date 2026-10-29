// Mesure le risque de fausses validations et écrit docs/FAUX_POSITIFS.md. Lancer : node strategies/faux-positifs-rapport.mjs
import fs from 'node:fs';
import { mesurerEtDurcir, scenarioIndependant, scenarioAmas, LIMITE_FAUX_POSITIFS } from './faux-positifs.js';
const pct = x => (x * 100).toFixed(1).replace('.', ',') + ' %';
const r = mesurerEtDurcir({ simulationsA: 1000, simulationsB: 300 });
const dur = [
  scenarioIndependant({ simulations: 1000, K: 1000, n: 150, graine: 7 }),
  scenarioIndependant({ simulations: 1000, K: 30, n: 400, graine: 8 }),
  scenarioAmas({ simulations: 200, K: 300, amas: 30, jours: 250, graine: 9 })
];
const L = [];
L.push('# Risque de fausses validations (V7, phase 2)', '', 'Mesuré le ' + new Date().toISOString().slice(0, 10) + ' par `node strategies/faux-positifs-rapport.mjs` (module `strategies/faux-positifs.js`, test `galaxie/tests/faux-positifs-test.mjs`).', '',
  '**Question** : quand on teste beaucoup de stratégies qui n’ont *aucun* avantage réel (rendements purement aléatoires, espérance nette exactement nulle), à quelle fréquence la meilleure est-elle déclarée « Validée » au niveau équilibré (v4) ?', '',
  '**Méthode (volontairement sévère)** : on prend la meilleure des K variantes sur les *mêmes* trades qui servent ensuite à la juger, et on ne vérifie que la partie statistique de « Validée » (espérance ≥ +0,12 R, ≥ 150 trades, borne basse du bootstrap > 0, Sharpe déflaté ≥ 95 % avec le nombre effectif d’essais). Tous les autres garde-fous (walk-forward, jeu final ouvert une fois, rapport de l’Auditeur…) ne font qu’ajouter de la prudence. Un trade vaut +2 R avec une probabilité de 1/3, sinon −1 R : espérance exactement nulle.', '',
  '**Limite annoncée : ' + pct(LIMITE_FAUX_POSITIFS) + '.**', '', '## Résultats', '', '| Scénario | Simulations | Fausses validations | Taux |', '|---|---|---|---|');
for (const e of r.essais) for (const s of [e.A, e.B]) L.push('| ' + s.scenario + ' (K = ' + s.K + (s.n ? ', ' + s.n + ' trades' : ', ' + s.jours + ' jours') + ', plancher de N effectif ' + Math.round(e.plancherPart * 100) + ' % du total) | ' + s.simulations + ' | ' + s.fauxPositifs + ' | **' + pct(s.taux) + '** |');
L.push('', '## Scénarios plus durs', '', '| Scénario | Simulations | Fausses validations | Taux |', '|---|---|---|---|');
for (const s of dur) L.push('| ' + s.scenario + ' (K = ' + s.K + (s.n ? ', ' + s.n + ' trades' : ', ' + s.jours + ' jours') + ') | ' + s.simulations + ' | ' + s.fauxPositifs + ' | **' + pct(s.taux) + '** |');
L.push('', '## Conclusion', '', r.ok ? '- Le taux de fausses validations reste sous la limite de ' + pct(LIMITE_FAUX_POSITIFS) + (r.durci ? ', mais seulement après durcissement automatique : le nombre effectif d’essais est plafonné à au moins ' + Math.round(r.plancherRetenu * 100) + ' % du nombre total de variantes.' : ' avec la correction par nombre effectif d’essais **telle quelle** : aucun durcissement n’a été nécessaire.') : '- **La limite est dépassée** même au plancher maximal : ne pas utiliser le niveau équilibré avant correction.',
  '- Cela ne dit pas qu’une stratégie « Validée » gagnera de l’argent : cela dit qu’une stratégie sans aucun avantage a très peu de chances de passer le filtre statistique.',
  '- Le niveau « Candidate » (≥ +0,08 R, ≥ 100 trades) est volontairement plus permissif : il autorise seulement la simulation en direct, jamais une alerte d’entrée. Il n’est donc pas compté ici.', '',
  '*Les résultats passés ne garantissent rien. Aucun ordre n’est exécuté.*', '');
fs.writeFileSync(new URL('../docs/FAUX_POSITIFS.md', import.meta.url), L.join('\n'));
fs.writeFileSync(new URL('./faux-positifs-resultat.json', import.meta.url), JSON.stringify({ plancherRetenu: r.plancherRetenu, ok: r.ok, limite: LIMITE_FAUX_POSITIFS }, null, 2) + '\n');
console.log('docs/FAUX_POSITIFS.md écrit ; ok =', r.ok, 'plancher =', r.plancherRetenu);
