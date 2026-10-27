// Tests de l'analyse des demandes d'actualités de l'accueil. Lancer :  node galaxie/tests/actus-accueil-test.mjs
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../../core/commun/actus-accueil-contenu.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const o = (t, p, r) => { const c = A.commande(t); v('« ' + t + ' » → ' + p + '/' + r, c && c.action === 'ouvrir' && c.portee === p && c.rubrique === r, JSON.stringify(c)); };
const non = t => v('« ' + t + ' » : pas pour l’accueil', A.commande(t) === null, JSON.stringify(A.commande(t)));

o('Montre-moi les actualités', 'france', null);
o('les infos', 'france', null);
o("Les actus d'aujourd'hui", 'france', null);
o('à la une', 'france', null);
o('Ouvre l’actualité en France', 'france', null);
o('Affiche les actualités du monde', 'monde', null);
o("l'actualité dans le monde", 'monde', null);
o('quoi de neuf dans le monde', 'monde', null);
o('quoi de neuf', 'france', null);
o('les actus sport', 'france', 'sport');
o('actualités sportives', 'france', 'sport');
o("Donne-moi les infos économie dans le monde", 'monde', 'economie');
o('les actualités politiques en France', 'france', 'politique');
o('les actus santé', 'france', 'sante');
o('les actualités justice et faits divers'.replace(' et faits divers', ''), 'france', 'justice');
o('les faits divers'.replace('les faits divers', 'les infos faits divers'), 'france', 'justice');
o('les news high tech', 'france', 'sciences');
o('les actualités internationales', 'monde', 'international');
o('Raylé, les actualités', 'france', null);
o('s’il te plaît les actus culture', 'france', 'culture');

for (const t of ['ferme les actualités', 'Ferme la fenêtre des actus', 'enlève les infos']) v('fermer : ' + t, (A.commande(t) || {}).action === 'fermer', JSON.stringify(A.commande(t)));
for (const t of ['actualise les actualités', 'rafraîchis les actus', 'mets à jour les infos']) v('actualiser : ' + t, (A.commande(t) || {}).action === 'actualiser', JSON.stringify(A.commande(t)));

non('les actualités sur la guerre en Ukraine');
non('infos sur le bitcoin');
non('montre-moi les actualités sur la Terre');
non('va en France voir les actualités');
non('ouvre la galaxie');
non('quel temps fait-il');
non('tu as des nouvelles de ton côté'); // ne commence pas par le nom
non('explique-moi les actualités');
non('les actus sport et politique');
non('x'.repeat(200));
non('');

// sélection, lignes, pastilles, barre, phrase
const S = (id, cat, importance, titre = 'T' + id) => ({ id, cat, importance, titre });
const L = [S(1, 'sport', 2), S(2, 'sport', 9), S(3, 'economie', 5), S(4, 'sport', 1), S(5, 'sante', 4)];
v('sélection : rubrique filtrée, plus repris d’abord', A.selection(L, 'sport', 5).map(s => s.id).join() === '2,1,4');
v('sélection : sans rubrique, tout, trié, plafonné', A.selection(L, null, 3).map(s => s.id).join() === '2,3,5');
v('lignes selon le mode', A.lignes('complet') === 10 && A.lignes('normal') === 7 && A.lignes('leger') === 5);
v('pastilles : seulement les rubriques présentes, plus fournies d’abord', A.rubriquesPresentes(L).map(r => r.id).join() === 'sport,economie,sante' && A.rubriquesPresentes(L)[0].n === 3);
v('barre : bornée', A.barre(1) >= 0.12 && A.barre(20) === 1 && A.barre(4) === 0.5);
v('identifiant et titre', A.identifiant('france', null) === 'actus-france' && A.identifiant('monde', 'sport') === 'actus-monde-sport' && A.titreFenetre('france', null) === 'À la une · France' && A.titreFenetre('monde', 'sport') === 'Sport · Monde');
v('phrase : annonce + sujet le plus repris', /^Voici l’actualité en France\. Le plus repris : T2\.$/.test(A.phrase('france', null, A.selection(L, null, 3))), A.phrase('france', null, A.selection(L, null, 3)));
v('phrase : rubrique vide, honnête', /aucun sujet dans la rubrique culture/.test(A.phrase('france', 'culture', [])));
console.log(ko ? ko + ' échec(s), ' + ok + ' réussite(s)' : 'OK — ' + ok + ' vérifications');
process.exit(ko ? 1 : 0);
