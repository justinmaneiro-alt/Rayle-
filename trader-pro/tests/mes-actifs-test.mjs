import { percentile, scoreDepuisPercentile, verdictHorizon, verdictsActif, phraseVerdict, intentionMesActifs, HORIZONS_MA, POIDS } from '../invest/mes-actifs-calcul.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const serie = Array.from({ length: 100 }, (_, i) => i + 1);
v(percentile(serie, 10) === 9.5 || Math.abs(percentile(serie, 10) - 9.5) < 1, 'percentile bas'); v(percentile(serie, 100) > 98, 'percentile haut'); v(percentile([1, 2, 3], 2) === null, 'moins de 8 valeurs : null');
v(scoreDepuisPercentile(5, 'cher_si_haut') > 0.9, 'percentile 5 « cher si haut » = très attractif'); v(scoreDepuisPercentile(95, 'cher_si_haut') < -0.9, 'percentile 95 = à éviter'); v(scoreDepuisPercentile(80, 'bon_si_haut') > 0.3, 'tendance haute = favorable'); v(scoreDepuisPercentile(null, 'cher_si_haut') === null, 'null');
const ind = (id, type, score, p = 50) => ({ id, nom: id, type, score, texte: 'valeur ' + id, percentile: p });
/* actif cher (valorisation haute) : mauvais à long terme, mais tendance forte : meilleur à court terme */
const cher = [ind('cape', 'valeur', -0.9, 96), ind('buffett', 'valeur', -0.8, 92), ind('mom', 'tendance', 0.8, 85), ind('saison', 'saison', 0.3, 60)];
const V = verdictsActif(cher);
v(V.long.score100 < 28 && V.long.libelle === 'À éviter', 'long terme : cher = à éviter (' + V.long.score100 + ')'); v(V.tactique.score100 > V.long.score100, 'à court terme la tendance l emporte');
v(V.moyen.pourquoi.length === 3 && V.moyen.pourquoi.every(t => t.includes('→')), 'Pourquoi en 3 points');
const bon = [ind('a', 'valeur', 0.9, 5), ind('b', 'valeur', 0.7, 12), ind('c', 'macro', 0.6, 20), ind('d', 'tendance', 0.1, 55)]; const B = verdictHorizon(bon, 'moyen'); v(B.libelle === 'Très attractif' && B.confiance > 50, 'bon marché : ' + B.libelle + ' ' + B.confiance);
const mixte = [ind('a', 'valeur', 0.9), ind('b', 'valeur', -0.9), ind('c', 'macro', 0.9), ind('d', 'macro', -0.9)]; v(verdictHorizon(mixte, 'moyen').confiance < verdictHorizon(bon, 'moyen').confiance, 'indicateurs qui se contredisent : confiance plus basse');
v(verdictHorizon([], 'moyen').libelle === 'Données insuffisantes' && verdictHorizon([{ id: 'x', nom: 'x', type: 'valeur', score: null }], 'long').score100 === null, 'sans donnée : insuffisant');
v(HORIZONS_MA.length === 4 && Object.keys(POIDS).every(k => POIDS[k].length === 4), 'quatre horizons');
v(/Bitcoin sur 1–3 ans|Bitcoin sur 1–3 ans/.test(phraseVerdict('Bitcoin', bon, 'moyen')) && /jamais un conseil/.test(phraseVerdict('Bitcoin', bon, 'moyen')), 'phrase parlée');
for (const [t, a, h] of [['Rayle, est-ce que l\'or est cher ?', 'or', 'moyen'], ['où en est le Bitcoin sur 1 à 3 ans ?', 'btc', 'moyen'], ['Rayle le S&P 500 est cher sur 5 à 10 ans', 'us500', 'long'], ['le pétrole est-il bon marché en ce moment', 'petrole', 'moyen'], ['Solana est elle chère à court terme', 'sol', 'tactique'], ['est-ce que le nasdaq est cher', 'us100', 'moyen']]) { const I = intentionMesActifs(t); v(I && I.actif === a && I.horizon === h, 'voix : ' + t + ' → ' + JSON.stringify(I)); }
v(intentionMesActifs('Rayle ouvre le terminal') === null && intentionMesActifs('est-ce que Airbus est cher') === null, 'pas de faux positif');
console.log(`mes-actifs : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
