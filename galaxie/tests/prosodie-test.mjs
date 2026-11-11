// Prosodie de Raylé : découpe, pauses, débit, hauteur, nettoyage. node galaxie/tests/prosodie-test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const charger = f => { const m = { exports: {} }; new Function('module', 'exports', 'window', fs.readFileSync(f, 'utf8'))(m, m.exports, undefined); return m.exports; };
const P = charger('core/voice/prosodie.js'), N = charger('core/voice/normalisation-fr.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const seg = t => P.depuisTexte(t, N.normaliser);

// nettoyage
v('adresse web retirée', !/http|www|lemonde/.test(P.nettoyer('Voir https://www.lemonde.fr/a/b?x=1 maintenant.')));
v('courriel retiré', !/@/.test(P.nettoyer('Écris à test@exemple.fr demain.')));
v('domaine dit sans suffixe', /exemple/.test(P.nettoyer('Sur exemple.fr aujourd’hui')) && !/\.fr/.test(P.nettoyer('Sur exemple.fr aujourd’hui')));
v('symboles retirés', !/[#*_|~<>\[\]\\/]/.test(P.nettoyer('## Titre *gras* a|b c/d')));
v('séparateur · devient une pause', /,/.test(P.nettoyer('Or · 3 985')));

// découpe en phrases
let s = seg('Bonjour Justin. Tout va bien ? Super !');
v('trois phrases', s.length === 3, JSON.stringify(s.map(x => x.texte)));
v('pause après le point > virgule', P.PAUSES['.'] > P.PAUSES[',']);
v('pause d’une phrase finissant par ?', s[1].pause === P.PAUSES['?']);
v('la dernière phrase n’a pas de pause', s[s.length - 1].pause === 0);
v('une question monte', s[1].hauteur > 0);
v('une exclamation monte un peu', s[2].hauteur > 0 && s[2].vitesse > 1);

// phrase longue coupée aux virgules
const longue = 'Le marché américain a ouvert en hausse ce matin, porté par les valeurs technologiques, mais les investisseurs restent prudents avant la réunion de la banque centrale de demain.';
s = seg(longue);
v('phrase longue coupée', s.length >= 2, s.length + ' segments');
v('coupe douce : pause courte', s[0].pause === P.PAUSES[','] || s[0].pause === P.PAUSES[';']);
v('aucun segment de moins de 4 mots dans une coupe', s.every(x => (x.texte.match(/\p{L}+/gu) || []).length >= 4));
v('rien n’est perdu à la découpe', s.map(x => x.texte).join(' ').replace(/[,.;:\s]+/g, ' ').trim() === N.normaliser(longue).replace(/[,.;:\s]+/g, ' ').trim());

// paragraphes
s = seg('Première idée.\nDeuxième idée.');
v('saut de ligne : pause plus longue', s[0].pause === P.PAUSES['\n'], String(s[0].pause));

// points de suspension
s = seg('Je ne sais pas… Peut-être demain.');
v('points de suspension : ralenti et plus grave', s[0].vitesse < 1 && s[0].hauteur < 0);

// cas réels
s = seg('Le US100 gagne +1,25 % à 21 345,5 points ; voir https://www.lemonde.fr/x.');
v('pas d’adresse dans le texte lu', !s.some(x => /http|www|\.fr/.test(x.texte)), JSON.stringify(s.map(x => x.texte)));
v('nombres en lettres', s.some(x => /vingt et un mille/.test(x.texte)));
v('texte vide → aucun segment', P.decouper('').length === 0 && P.decouper('   ').length === 0 && P.decouper(null).length === 0);
v('tous les facteurs restent dans des bornes sûres', ['Oui ? Non ! Peut-être… D’accord, allons-y, vite, maintenant.'].every(t => seg(t).every(x => x.vitesse >= 0.9 && x.vitesse <= 1.1 && Math.abs(x.hauteur) <= 6 && x.pause >= 0 && x.pause <= 800)));
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
