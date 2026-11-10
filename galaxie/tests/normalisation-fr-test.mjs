// Tests de la normalisation du français parlé (nombres, prix, heures, dates, sigles de marché, markdown). Lancer :  node galaxie/tests/normalisation-fr-test.mjs
import { createRequire } from 'node:module';
const N = createRequire(import.meta.url)('../../core/voice/normalisation-fr.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const eq = (entree, attendu) => { const r = N.normaliser(entree); v(entree, r === attendu, 'obtenu : ' + r + ' | attendu : ' + attendu); };
const contient = (entree, morceau) => { const r = N.normaliser(entree); v(entree + ' ⊃ ' + morceau, r.includes(morceau), 'obtenu : ' + r); };

// nombres
const e = N.entier;
[[0, 'zéro'], [1, 'un'], [16, 'seize'], [21, 'vingt et un'], [70, 'soixante-dix'], [71, 'soixante et onze'], [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [91, 'quatre-vingt-onze'],
 [100, 'cent'], [200, 'deux cents'], [201, 'deux cent un'], [1000, 'mille'], [2026, 'deux mille vingt-six'], [4070, 'quatre mille soixante-dix'], [80000, 'quatre-vingt mille'],
 [1000000, 'un million'], [2500000, 'deux millions cinq cent mille'], [3000000000, 'trois milliards']].forEach(([n, s]) => v('entier ' + n, e(n) === s, e(n)));
v('ordinal 2', N.ordinal(2) === 'deuxième'); v('ordinal 5', N.ordinal(5) === 'cinquième'); v('ordinal 21', N.ordinal(21) === 'vingt et unième');

// exemple du cahier des charges
eq('4 070,25', 'quatre mille soixante-dix virgule vingt-cinq.');
eq('4 070,25', 'quatre mille soixante-dix virgule vingt-cinq.');
eq('4070.25', 'quatre mille soixante-dix virgule vingt-cinq.');
eq('0,05', 'zéro virgule zéro cinq.');
eq('4 050,00', 'quatre mille cinquante.');
eq('4 050,50', 'quatre mille cinquante virgule cinquante.');
eq('1.250.000', 'un million deux cent cinquante mille.');
eq('4.070,25', 'quatre mille soixante-dix virgule vingt-cinq.');

// prix, devises, pourcentages, signes
eq('L\'or est à 4 070,25 $, au-dessus de la MA200.', 'L\'or est à quatre mille soixante-dix virgule vingt-cinq dollars, au-dessus de la moyenne mobile deux cents.');
eq('1 250 €', 'mille deux cent cinquante euros.');
eq('€ 20', 'vingt euros.');
eq('-1,5 %', 'moins un virgule cinq pour cent.');
eq('+0,25 %', 'plus zéro virgule vingt-cinq pour cent.');
eq('15-20 points', 'quinze à vingt points.');
contient('Volume 2,5M', 'deux virgule cinq millions');
contient('10k contrats', 'dix mille contrats');

// heures, dates, ordinaux
eq('14h30', 'quatorze heures trente.');
eq('14:30', 'quatorze heures trente.');
eq('9h05', 'neuf heures zéro cinq.');
eq('12:00', 'midi.');
eq('le 10/11/2026', 'le dix novembre deux mille vingt-six.');
eq('le 1er janvier', 'le premier janvier.');
eq('2026-11-10', 'dix novembre deux mille vingt-six.');
eq('la 3e zone', 'la troisième zone.');

// sigles et jargon de marché
contient('Le RSI 14 est à 71,5', 'R.S.I. quatorze est à soixante et onze virgule cinq');
contient('ATR 12,3', 'A.T.R. douze virgule trois');
contient('COT hebdomadaire', 'C.O.T. hebdomadaire');
contient('SL à 4 050, TP à 4 120', 'stop loss à quatre mille cinquante, take profit à quatre mille cent vingt');
contient('2 R de gain', 'deux erre de gain');
contient('en M15 puis H4', 'quinze minutes puis quatre heures');
contient('graphique D1', 'journalier');
contient('US100 et XAU/USD', 'U.S. cent');
contient('XAU/USD', 'or dollar');
contient('EMA50 et SMA200', 'moyenne mobile exponentielle cinquante');
contient('SMA200', 'moyenne mobile simple deux cents');
contient('FOMC demain', 'F.O.M.C.');
contient('le TPSL', 'T.P.S.L.');   // sans voyelle : épelé
contient('NFP à 14h30', 'N.F.P. à quatorze heures trente');
contient('DXY', 'indice dollar');
contient('MA200', 'moyenne mobile deux cents');   // jamais « M.A. deux cent »

// markdown, symboles, émojis
eq('**Point** : `niveau`', 'Point: niveau.');
eq('## Titre\nTexte', 'Titre. Texte.');
eq('- un\n- deux', 'un, deux.');
v('émoji', !/[\u{1F300}-\u{1FAFF}]/u.test(N.normaliser('Bien joué 🚀 !')));
v('lien', !/http/.test(N.normaliser('voir https://exemple.fr/x ici')));
v('marqueur [1]', !/\[1\]/.test(N.normaliser('Premier point [1] puis [2]')));
v('pas de symbole lu', !/[*_#`|~]/.test(N.normaliser('a * b _ c # d | e ~ f')));
contient('a → rebond', ', puis rebond');
contient('x ≥ 4', 'supérieur ou égal à');
contient('un point (important) ici', 'un point, important, ici');
contient('1/2', 'un sur deux');

// ponctuation et phrases
v('point final ajouté', /\.$/.test(N.normaliser('Bonjour')));
v('phrases séparées', N.phrases(N.normaliser('Le prix monte. La tendance est haussière. Prudence.')).length >= 1);
const longue = 'Le marché progresse depuis ce matin avec une pression acheteuse régulière, les volumes restent corrects, le carnet montre un déséquilibre favorable aux acheteurs, et le prix reste au-dessus de sa moyenne mobile sans jamais la retester sérieusement.';
const sortie = N.normaliser(longue);
v('phrase longue coupée', sortie.split(/(?<=[.!?])\s/).length >= 2, sortie);
v('phrase regroupée si trop courte', N.phrases('Oui. Non. D\'accord. Le marché est calme aujourd\'hui, rien à signaler.').length <= 2);

// dictionnaire modifiable
N.definirDictionnaire({ Raylé: 'Raylé', Kraken: 'Krakène', 'ff_siwis': 'f f siwis' });
v('dictionnaire', N.normaliser('Sur Kraken, le BTC monte').includes('Krakène'));
v('dictionnaire insensible à la casse', N.normaliser('sur kraken').includes('Krakène'));
v('dictionnaire sur mot entier', !N.normaliser('Krakenation').includes('Krakène'));
N.definirDictionnaire({});
v('dictionnaire vidé', !N.normaliser('Kraken').includes('Krakène'));

// robustesse
v('texte vide', N.normaliser('') === '' && N.normaliser(null) === '' && N.normaliser(undefined) === '');
v('que des symboles', N.normaliser('***___###') === '');

console.log(`${ok} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
