/* Tests purs des aides à la décision : taille XTB, régime, voyant, annonces. node trader-pro/tests/aides-test.mjs */
import { calculerTaille, CONTRATS_XTB, efficacite, percentileAtr, niveauVol, regime, voyant, typeAnnonce, bandesAnnonces, dansBande, SEUIL_TENDANCE } from '../terminal/aides.js';
import { contexteEvenement, libelleContexte } from '../terminal/contexte.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/* ───── taille ───── */
let t = calculerTaille({ entree: 3600, stop: 3590, objectif: 3630, risqueEur: 100, contrat: 100, eurUsd: 1.1 });
v(t.sens === 'achat' && proche(t.perteParLot, 10 * 100 / 1.1, 1e-9), 'or : perte par lot = 10 $ × 100 oz / 1,1 = ' + t.perteParLot.toFixed(2) + ' €');
v(t.lots === 0.11 && t.risqueReel <= 100.0000001 && t.risqueReel > 99, 'lots arrondis vers le BAS au pas de 0,01 : ' + t.lots + ' lot, risque réel ' + t.risqueReel.toFixed(2));
v(proche(t.R, 3) && proche(t.gainCible, t.lots * 30 * 100 / 1.1, 1e-6), 'gain à la cible en € et en R : ' + t.gainCible.toFixed(0) + ' € · ' + t.R + ' R');
t = calculerTaille({ entree: 3600, stop: 3610, objectif: 3570, risqueEur: 100, contrat: 100, eurUsd: 1.1 }); v(t.sens === 'vente' && t.R === 3 && t.coherent === true, 'vente : sens déduit du stop, R positif');
t = calculerTaille({ entree: 3600, stop: 3590, objectif: 3580, risqueEur: 100, contrat: 100, eurUsd: 1.1 }); v(t.R < 0 && t.coherent === false && t.gainCible < 0, 'objectif du mauvais côté : R négatif, signalé');
t = calculerTaille({ entree: 3600, stop: 3590, objectif: 3630, risqueEur: 100, contrat: 100, eurUsd: null }); v(t.sansTaux === true && t.lots === undefined && proche(t.R, 3), 'taux EUR/USD inconnu : pas de lots inventés');
t = calculerTaille({ entree: 3600, stop: 3000, objectif: 3700, risqueEur: 5, contrat: 100, eurUsd: 1.1 }); v(t.lots === 0 && t.trop_petit === true && t.risqueMinimal > 5, 'risque trop petit pour 0,01 lot : lots = 0 et risque minimal indiqué (' + t.risqueMinimal.toFixed(0) + ' €)');
v(calculerTaille({ entree: 100, stop: 100, risqueEur: 100, contrat: 1, eurUsd: 1 }) === null && calculerTaille({ entree: 100, stop: 90, risqueEur: 0, contrat: 1, eurUsd: 1 }) === null, 'entrée = stop ou risque nul : pas de calcul');
t = calculerTaille({ entree: 60000, stop: 59000, objectif: 62000, risqueEur: 100, contrat: 1, eurUsd: 1.1 }); v(t.lots === 0.11 && proche(t.perteParLot, 1000 / 1.1), 'bitcoin : 1 lot = 1 BTC');
v(CONTRATS_XTB.or.contrat === 100 && CONTRATS_XTB.or.verifie === true && CONTRATS_XTB.us100.verifie === false && CONTRATS_XTB.sol.verifie === false, 'contrats : certains vérifiés, les autres marqués « à vérifier » (champ modifiable)');
v(calculerTaille({ entree: 3600, stop: 3590, objectif: 3630, risqueEur: 100, contrat: 100, devise: 'EUR' }).lots === 0.1, 'instrument coté en euros : pas de conversion');

/* ───── régime ───── */
const barres = (c, v0 = 100) => c.map((x, i) => ({ t: i * 3600e3, o: x, h: x + 1, l: x - 1, c: x, v: v0 }));
const droite = barres(Array.from({ length: 60 }, (_, i) => 100 + i * 2)), bruit = barres(Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1.5 : -1.5)));
v(proche(efficacite(droite), 1) && efficacite(bruit) < 0.1, 'efficacité de Kaufman : 1 pour une ligne droite, proche de 0 pour du bruit');
v(regime(droite, null, 'H4').type === 'tendance' && regime(bruit, null, 'H4').type === 'range', 'badge : « tendance » / « range »');
v(/flèches MA200/.test(regime(droite, null, 'H4').phrase) && /rebonds sur niveaux tracés/.test(regime(bruit, null, 'H4').phrase), 'phrase courte selon le régime');
v(efficacite(barres([1, 2, 3])) === null && regime(barres([1, 2, 3]), null).type === null, 'trop peu de bougies : rien d’inventé');
v(SEUIL_TENDANCE === 0.3, 'seuil de tendance documenté (0,30)');
/* percentile de l'ATR sur un an : volatilité d'abord faible puis très forte */
const jours = Array.from({ length: 300 }, (_, i) => { const a = i < 270 ? 1 : 8, x = 100 + (i % 2 ? a : -a); return { t: i * 86400e3, o: x, h: x + a, l: x - a, c: x, v: 1 }; });
v(percentileAtr(jours, 'J') > 0.9 && niveauVol(percentileAtr(jours, 'J')) === 'haute', 'ATR au sommet de l’année : volatilité haute (' + percentileAtr(jours, 'J').toFixed(2) + ')');
const calme = Array.from({ length: 300 }, (_, i) => { const a = i < 270 ? 8 : 1, x = 100 + (i % 2 ? a : -a); return { t: i * 86400e3, o: x, h: x + a, l: x - a, c: x, v: 1 }; }); v(niveauVol(percentileAtr(calme, 'J')) === 'basse', 'ATR au plus bas de l’année : volatilité basse');
v(percentileAtr(jours.slice(0, 100), 'J') === null, 'moins d’un an d’historique : pas de percentile (repli sur le Jour)');
v(regime(droite, jours, 'H1').baseVol === 'J' && regime(droite, jours, 'H1').vol === 'haute', 'H1 sans un an de bougies : volatilité mesurée sur le Jour (dit)');
v(niveauVol(0.5) === 'normale' && niveauVol(null) === null, 'seuils 25 % / 75 %');

/* ───── voyant ───── */
const A = (d, h) => ({ J: { sens: [{ sens: d }] }, H4: { sens: [{ sens: h }] } });
v(voyant(A(1, 1)).etat === 'vert' && voyant(A(-1, -1)).etat === 'vert', 'voyant vert : Daily et H4 dans le même sens');
v(voyant(A(1, -1)).etat === 'orange' && /non alignées/.test(voyant(A(1, -1)).texte), 'voyant orange : sens contraires');
v(voyant(A(0, 1)).etat === 'gris' && voyant(null).etat === 'gris', 'voyant gris : indéterminé');

/* ───── contexte d'une flèche ───── */
const An = { H4: { unite: 'H4', B: [{ t: 0 }, { t: 4 * 3600e3 }], M: [100, 110], sens: [{ tFin: 1, sens: 1 }] }, J: { unite: 'J', B: [{ t: 0 }], M: [100], sens: [{ tFin: 1, sens: 1 }] } };
let c = contexteEvenement(An, { dir: -1, entree: 90, tFin: 12 * 3600e3, unite: 'H4' }); v(c.contreTendance === true && c.ma === -1 && c.aligne === true && /contre-tendance/.test(libelleContexte(c)) && /sous la MA200/.test(libelleContexte(c)), 'flèche vendeuse alors que le Daily est haussier : « contre-tendance » : ' + libelleContexte(c));
c = contexteEvenement(An, { dir: 1, entree: 120, tFin: 12 * 3600e3, unite: 'H4' }); v(c.contreTendance === false && /au-dessus de la MA200/.test(libelleContexte(c)) && !/contre-tendance/.test(libelleContexte(c)), 'flèche dans le sens du Daily : pas de « contre-tendance »');
v(/pendant annonce/.test(libelleContexte({ ...c, annonce: true })), '« pendant annonce » ajouté au libellé'); v(contexteEvenement(null, { dir: 1 }) === null && libelleContexte(null) === '', 'sans analyse : rien');

/* ───── annonces ───── */
v(typeAnnonce('Non-Farm Employment Change', 'USD') === 'NFP' && typeAnnonce('CPI m/m', 'USD') === 'CPI' && typeAnnonce('FOMC Statement', 'USD') === 'Fed' && typeAnnonce('Federal Funds Rate', 'USD') === 'Fed' && typeAnnonce('Main Refinancing Rate', 'EUR') === 'BCE' && typeAnnonce('Advance GDP q/q', 'USD', 'High') === 'PIB US', 'types : Fed, CPI, NFP, BCE, PIB US');
v(typeAnnonce('Retail Sales m/m', 'USD') === null && typeAnnonce('CPI y/y', 'JPY') === null && typeAnnonce('Prelim GDP Price Index y/y', 'USD') === null, 'les autres annonces ne comptent pas');
const H = 3600e3, T0 = Date.UTC(2026, 10, 20, 13, 30), ev = [{ t: T0, titre: 'Non-Farm Employment Change', pays: 'USD', impact: 'fort' }, { t: T0 + 100 * H, titre: 'CPI m/m', pays: 'USD', impact: 'faible' }, { t: T0 + 2 * H, titre: 'FOMC Statement', pays: 'USD', impact: 'fort' }, { t: T0 + 30 * H, titre: 'Retail Sales m/m', pays: 'USD', impact: 'fort' }];
const bd = bandesAnnonces(ev); v(bd.length === 1 && bd[0].t1 === T0 - H && bd[0].t2 === T0 + 3 * H && /NFP/.test(bd[0].type) && /Fed/.test(bd[0].type), 'bandes de 1 h avant à 1 h après, fusionnées quand elles se touchent, impact faible ignoré : ' + JSON.stringify(bd.map(b => b.type)));
v(dansBande(T0 - H / 2, bd) && dansBande(T0 + 3 * H, bd) && !dansBande(T0 - 2 * H, bd) && !dansBande(T0 + 4 * H, bd), 'une flèche dans la bande est « pendant annonce »');
v(bandesAnnonces([]).length === 0 && bandesAnnonces(null).length === 0, 'calendrier vide : aucune bande');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
