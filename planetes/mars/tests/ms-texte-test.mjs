// « Teste ma stratégie » : lecture locale d'un texte français (sans IA). Lancer :  node planetes/mars/tests/ms-texte-test.mjs
import { lireTexteFrancais } from '../pc/agent-ms/lecture-texte.js';
import { decrireStrategie } from '../pc/agent-ms/strategie-ms.js';
let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const cond = (r, type) => (r.strategie ? r.strategie.conditions.find(c => c.type === type) : null);

let r = lireTexteFrancais('Achète quand le RSI H1 passe sous 30 et que le prix est au-dessus de l’EMA 200, stop 1,5 ATR, objectif 2 R');
v('achat : côté long, RSI et EMA lus', r.strategie && r.strategie.cote === 'long' && cond(r, 'rsi') && cond(r, 'rsi').op === '<' && cond(r, 'rsi').seuil === 30 && cond(r, 'rsi').tf === 'h1' && cond(r, 'ema') && cond(r, 'ema').periode === 200 && cond(r, 'ema').position === 'avec', JSON.stringify(r.strategie));
v('stop 1,5 ATR et objectif 2 R lus', r.strategie.stop.type === 'atr' && r.strategie.stop.k === 1.5 && r.strategie.sortie.type === 'cible_R' && r.strategie.sortie.R === 2, JSON.stringify([r.strategie.stop, r.strategie.sortie]));
v('stratégie valide, rien d’appliqué sans validation (validation.ok seulement)', r.validation.ok && r.nonCompris.length === 0, JSON.stringify([r.validation, r.nonCompris]));
v('ce qui a été compris est listé en français', r.compris.length >= 3 && r.compris.some(x => /RSI 14/.test(x)) && r.compris.some(x => /Stop : 1.5 ATR/.test(x)));
v('description relisible sans undefined', !decrireStrategie(r.strategie).join(' ').match(/undefined|NaN|\[object/));

r = lireTexteFrancais('Vends quand le RSI 14 en M15 dépasse 75 et que le prix est sous la moyenne mobile 50 en H4. Stop de 1 %. Stop suiveur 3 ATR');
v('vente : RSI converti dans le sens du trade (au-dessus de 75 → bas 25 miroir)', r.strategie.cote === 'short' && cond(r, 'rsi') && cond(r, 'rsi').op === '<' && cond(r, 'rsi').seuil === 25 && cond(r, 'rsi').tf === 'm15', JSON.stringify(r.strategie.conditions));
v('vente : prix sous l’EMA 50 H4 → « avec » (dans le sens de la vente)', cond(r, 'ema') && cond(r, 'ema').position === 'avec' && cond(r, 'ema').tf === 'h4' && cond(r, 'ema').periode === 50);
v('stop fixe 1 % et stop suiveur lus', r.strategie.stop.type === 'fixe' && r.strategie.stop.pct === 1 && r.strategie.sortie.type === 'suiveur' && r.strategie.sortie.k === 3, JSON.stringify([r.strategie.stop, r.strategie.sortie]));

r = lireTexteFrancais('Long seulement. Cassure du plus haut de 48 bougies en H1 avec un volume supérieur à 1,5 fois la moyenne. Pas d’entrée en range. Entre 8h et 17h.');
v('cassure, volume, filtre « pas en range » et heures', cond(r, 'cassure') && cond(r, 'cassure').N === 48 && cond(r, 'cassure').tf === 'h1' && cond(r, 'volume') && cond(r, 'volume').min === 1.5 && r.strategie.filtres.pasRange === true && r.strategie.filtres.heures && r.strategie.filtres.heures.de === 8, JSON.stringify(r.strategie));
v('heures : avertissement UTC', r.avertissements.some(a => /UTC/.test(a)));

r = lireTexteFrancais('Achète en tendance haussière pendant la session de Londres, sors quand le RSI dépasse 70');
v('régime haussier + session Londres', cond(r, 'regime') && cond(r, 'regime').valeurs[0] === 'haussier' && cond(r, 'session') && cond(r, 'session').valeurs[0] === 1, JSON.stringify(r.strategie.conditions));
v('sortie sur signal : RSI au-dessus de 70', r.strategie.sortie.type === 'signal' && r.strategie.sortie.conditions[0].type === 'rsi' && r.strategie.sortie.conditions[0].op === '>' && r.strategie.sortie.conditions[0].seuil === 70, JSON.stringify(r.strategie.sortie));
v('l’entrée ne contient pas la condition de sortie', !r.strategie.conditions.some(c => c.type === 'rsi'));

r = lireTexteFrancais('Achète si le prix reste entre 60 000 et 65 000, stop 2 %, objectif 3 R, risque maximum 0,5 %');
v('zone de prix et risque maximal', cond(r, 'zoneprix') && cond(r, 'zoneprix').bas === 60000 && cond(r, 'zoneprix').haut === 65000 && r.strategie.filtres.risqueMaxPct === 0.5 && r.strategie.sortie.R === 3, JSON.stringify(r.strategie));

r = lireTexteFrancais('Achète sur un signal de la lune quand les astres sont alignés');
v('ce qui n’est pas compris est dit', r.nonCompris.length >= 1 && r.validation.ok === false && r.strategie.conditions.length === 0, JSON.stringify([r.nonCompris, r.validation]));
r = lireTexteFrancais('Achète si le RSI est sous 30');
v('valeurs par défaut annoncées (stop et sortie non précisés)', r.avertissements.some(a => /Stop non précisé/.test(a)) && r.avertissements.some(a => /Sortie non précisée/.test(a)));
r = lireTexteFrancais('Si le RSI est sous 30 alors entrer');
v('côté non précisé : achat et vente, annoncé', r.strategie.cote === 'les-deux' && r.avertissements.some(a => /Côté non précisé/.test(a)));
v('texte vide : pas de stratégie', lireTexteFrancais('   ').strategie === null && lireTexteFrancais(null).strategie === null);
r = lireTexteFrancais('RSI sous 3');
v('valeur absurde : refusée par la validation, jamais acceptée telle quelle', !r.validation || !r.validation.ok || !cond(r, 'rsi'));
v('un texte hostile ne casse rien', (() => { try { lireTexteFrancais('<script>alert(1)</script> RSI > '.repeat(200)); lireTexteFrancais('x'.repeat(100000)); return true; } catch (e) { return false; } })());

console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
