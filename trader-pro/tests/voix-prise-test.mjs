/* Tests de la saisie rapide d'un trade à la voix. node trader-pro/tests/voix-prise-test.mjs */
import { analyserPrise, intention, repondre } from '../commun/voix-trader.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
let p = analyserPrise('Rayle, j’ai acheté l’or à 3 620, stop 3 600, setup rebond MA200');
v(p && p.sens === 'BUY' && p.actif === 'or' && p.prix === 3620 && p.stop === 3600 && p.setup === 'rebond-ma200' && p.setupDit === true, 'exemple du cahier des charges : ' + JSON.stringify(p));
p = analyserPrise('j’ai vendu le nasdaq à 21500 stop 21650 cible 21000 setup cassure de niveau en H4'); v(p.sens === 'SELL' && p.actif === 'us100' && p.prix === 21500 && p.stop === 21650 && p.cible === 21000 && p.setup === 'cassure-niveau' && p.unite === 'H4', 'vente du Nasdaq avec cible et unité : ' + JSON.stringify(p));
p = analyserPrise('je viens d’acheter bitcoin à 98 000,5 setup fibonacci'); v(p.prix === 98000.5 && p.setup === 'fibonacci' && p.actif === 'btc', 'nombre avec séparateur de milliers et virgule décimale');
p = analyserPrise('j’ai acheté l’or à 3620'); v(p.setup === 'autre' && p.setupDit === false, 'sans setup : « autre » (et Rayle le dit)');
p = analyserPrise('j’ai acheté l’or'); v(p.incomplet === 'prix', 'sans prix : incomplet');
v(analyserPrise('j’ai acheté du pain à 3 euros') === null && analyserPrise('quel est mon risque') === null && analyserPrise('achète l’or à 3600') === null && analyserPrise('j’ai acheté et vendu l’or à 3600') === null, 'phrases ordinaires ou ambiguës : ignorées');
v(analyserPrise('j’ai acheté le US100 à 21 000 setup rebond MA 200').prix === 21000, '« US100 » et « MA 200 » ne sont pas pris pour le prix');
v(intention('j’ai acheté l’or à 3620, setup rebond de niveau').type === 'prise', 'intention « prise »');
const notees = []; const S = { prise: async d => { notees.push(d); return { ...d, id: 'x' }; } };
const sp = s => String(s).replace(/[  ]/g, ' ');   // espaces insécables des nombres français → espaces
let r = sp(await repondre('Rayle, j’ai acheté l’or à 3 620, stop 3 600, setup rebond MA200', S));
v(notees.length === 1 && notees[0].ticker === 'GOLD' && notees[0].sens === 'BUY' && notees[0].prix === 3620 && notees[0].stop === 3600 && notees[0].setup === 'rebond-ma200' && notees[0].source === 'voix', 'le trade est enregistré (GOLD, achat, 3 620, stop 3 600, rebond MA200, source voix)');
v(/^C’est noté : achat d’or à 3 620, stop 3 600, setup rebond MA200\./.test(r) && /rapprocherai de ton import XTB/.test(r), 'réponse de Rayle : ' + r);
r = sp(await repondre('j’ai vendu le nasdaq à 21500', S)); v(/vente du Nasdaq 100 à 21 500/.test(r) && /classé « autre »/.test(r), 'vente sans setup : classé « autre » : ' + r);
r = await repondre('j’ai acheté l’or', S); v(/Il me manque le prix d’entrée/.test(r) && notees.length === 2, 'sans prix : rien d’enregistré, Rayle demande le prix');
const refuse = await repondre('j’ai acheté l’or à 3600', { prise: async () => null }); v(/pas pu noter/.test(refuse), 'enregistrement impossible : dit honnêtement');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
