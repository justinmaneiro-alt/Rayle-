/* Simulateur d'intérêts composés (pur) : versement mensuel, trois scénarios de rendement annuel aux hypothèses VISIBLES (aucune promesse : ce sont des hypothèses, pas des prévisions). */
export const VERSION = 'compose-v1';
export const SCENARIOS = Object.freeze([{ id: 'prudent', nom: 'Prudent', rendement: 0.03 }, { id: 'central', nom: 'Central', rendement: 0.06 }, { id: 'optimiste', nom: 'Optimiste', rendement: 0.09 }]);
/* valeur au bout de `annees`, rendement annuel r composé mensuellement, versements en fin de mois ; renvoie { valeur, verse, gain, serie: [{ annee, valeur, verse }] } */
export function composer({ initial = 0, mensuel = 0, annees = 10, rendement = 0.06 } = {}) {
  const i = Math.pow(1 + rendement, 1 / 12) - 1; let v = initial, verse = initial; const serie = [{ annee: 0, valeur: v, verse }];
  for (let m = 1; m <= annees * 12; m++) { v = v * (1 + i) + mensuel; verse += mensuel; if (m % 12 === 0) serie.push({ annee: m / 12, valeur: v, verse }); }
  return { valeur: v, verse, gain: v - verse, serie };
}
export const trois = p => SCENARIOS.map(s => ({ ...s, ...composer({ ...p, rendement: s.rendement }) }));
