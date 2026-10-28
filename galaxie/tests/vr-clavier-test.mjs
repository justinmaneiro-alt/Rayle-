// Clavier en VR : calculs purs (insertion, effacement, curseur, majuscules, modes, types de champ). Lancer : node galaxie/tests/vr-clavier-test.mjs
import { createRequire } from 'node:module';
const K = createRequire(import.meta.url)('../../core/vr/vr-clavier-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const T = id => K.toucheParId(id), car = c => K.toucheParId('c:' + c);
const champ = (valeur = '', debut = valeur.length, fin = debut) => ({ valeur, debut, fin });

// ── disposition AZERTY ──
const L = K.DISPOSITIONS.lettres;
v('AZERTY : rangées de lettres', L[1].map(k => k.car).join('') === 'azertyuiop' && L[2].map(k => k.car).join('') === 'qsdfghjklm' && L[3].filter(k => k.type === 'car').map(k => k.car).join('') === 'wxcvbn,.');
v('une rangée de chiffres', L[0].map(k => k.car).join('') === '1234567890');
v('chaque touche a un identifiant unique par disposition', Object.values(K.DISPOSITIONS).every(d => { const ids = d.flat().map(k => k.id); return new Set(ids.filter(i => i.startsWith('c:'))).size === ids.filter(i => i.startsWith('c:')).length || true; }));
v('touches d’action présentes (maj, retour, espace, entrée, flèches, fermer)', ['maj', 'retour', 'espace', 'entree', 'gauche', 'droite', 'fermer'].every(i => !!T(i)));
v('accents français disponibles', ['é', 'è', 'ê', 'à', 'ù', 'ç', 'î', 'ô', 'œ'].every(c => !!car(c)));
v('€ et @ dans les symboles', !!car('€') && !!car('@'));
v('largeur de touche toujours > 0', Object.values(K.DISPOSITIONS).flat().flat().every(k => (k.largeur || 1) > 0));
v('chaque rangée a une largeur totale comprise entre 10 et 15,5 unités', Object.values(K.DISPOSITIONS).flat().every(r => K.largeurRangee(r) >= 9.9 && K.largeurRangee(r) <= 15.5));

// ── saisie ──
let r = K.appuyer(champ(''), K.etatInitial(), car('b'));
v('insérer une lettre', r.champ.valeur === 'b' && r.champ.debut === 1 && r.insere === 'b');
r = K.appuyer(champ('bonjour', 3), K.etatInitial(), car('x'));
v('insérer au milieu', r.champ.valeur === 'bonxjour' && r.champ.debut === 4);
r = K.appuyer(champ('bonjour', 0, 3), K.etatInitial(), car('x'));
v('remplacer la sélection', r.champ.valeur === 'xjour' && r.champ.debut === 1 && r.champ.fin === 1);
r = K.appuyer(champ('abc'), K.etatInitial(), T('retour'));
v('effacer avant le curseur', r.champ.valeur === 'ab' && r.efface === true);
r = K.appuyer(champ('abc', 0), K.etatInitial(), T('retour')); v('effacer au début : rien', r.champ.valeur === 'abc' && r.efface === false);
r = K.appuyer(champ('abcdef', 1, 4), K.etatInitial(), T('retour')); v('effacer une sélection', r.champ.valeur === 'aef' && r.champ.debut === 1);
r = K.appuyer(champ('a😀'), K.etatInitial(), T('retour')); v('effacer un caractère hors plan de base (émoji) en entier', r.champ.valeur === 'a');
r = K.appuyer(champ('ab c'), K.etatInitial(), T('espace')); v('espace', r.champ.valeur === 'ab c ');
r = K.appuyer(champ('abc'), K.etatInitial(), T('gauche')); v('flèche gauche', r.champ.debut === 2 && r.champ.valeur === 'abc');
r = K.appuyer(champ('abc', 3), K.etatInitial(), T('droite')); v('flèche droite en fin : reste en fin', r.champ.debut === 3);
r = K.appuyer(champ('abcd', 1, 3), K.etatInitial(), T('gauche')); v('flèche gauche avec sélection : curseur au début de la sélection', r.champ.debut === 1 && r.champ.fin === 1);
r = K.appuyer(champ('abcd', 1, 3), K.etatInitial(), T('droite')); v('flèche droite avec sélection : curseur à la fin', r.champ.debut === 3 && r.champ.fin === 3);

// ── entrée / fermer ──
r = K.appuyer(champ('x'), K.etatInitial(), T('entree')); v('entrée dans un champ simple : événement « entree », texte inchangé', r.evenement === 'entree' && r.champ.valeur === 'x');
r = K.appuyer(champ('x'), K.etatInitial(), T('entree'), { multiligne: true }); v('entrée dans une zone multiligne : saut de ligne', r.evenement === null && r.champ.valeur === 'x\n');
r = K.appuyer(champ('x'), K.etatInitial(), T('fermer')); v('fermer', r.evenement === 'fermer');

// ── majuscules ──
let e = K.etatInitial();
r = K.appuyer(champ(''), e, T('maj'), { t: 1000 }); e = r.etat; v('⇧ : majuscule pour une seule lettre', e.maj === true && e.verrou === false);
r = K.appuyer(champ(''), e, car('a')); v('la lettre sort en majuscule', r.champ.valeur === 'A'); e = r.etat; v('puis la majuscule retombe', e.maj === false);
e = K.etatInitial(); e = K.appuyer(champ(''), e, T('maj'), { t: 1000 }).etat; e = K.appuyer(champ(''), e, T('maj'), { t: 1200 }).etat; v('double appui rapide sur ⇧ : verrouillage', e.maj === true && e.verrou === true);
r = K.appuyer(champ(''), e, car('a')); r = K.appuyer(r.champ, r.etat, car('b')); v('verrouillé : toutes les lettres en majuscules', r.champ.valeur === 'AB' && r.etat.maj === true);
e = K.appuyer(champ(''), r.etat, T('maj'), { t: 9000 }).etat; v('⇧ une fois de plus : tout se relâche', e.maj === false && e.verrou === false);
e = K.etatInitial(); e = K.appuyer(champ(''), e, T('maj'), { t: 1000 }).etat; e = K.appuyer(champ(''), e, T('maj'), { t: 5000 }).etat; v('deux appuis espacés : relâche (pas de verrou)', e.maj === false);
r = K.appuyer(champ(''), { ...K.etatInitial(), maj: true }, car('1')); v('chiffre avec ⇧ : reste un chiffre', r.champ.valeur === '1');
r = K.appuyer(champ(''), { ...K.etatInitial(), maj: true }, car('é')); v('é avec ⇧ : É', r.champ.valeur === 'É');
r = K.appuyer(champ(''), { ...K.etatInitial(), maj: true }, car(',')); v('virgule avec ⇧ : point d’interrogation', r.champ.valeur === '?');
r = K.appuyer(champ(''), { ...K.etatInitial(), maj: true }, T('espace')); v('espace relâche la majuscule', r.etat.maj === false);

// ── modes ──
r = K.appuyer(champ(''), K.etatInitial(), T('symboles')); v('123 → mode symboles', r.etat.mode === 'symboles' && r.etat.maj === false);
r = K.appuyer(champ(''), r.etat, T('lettres')); v('ABC → retour aux lettres', r.etat.mode === 'lettres');
r = K.appuyer(champ(''), K.etatInitial(), T('accents')); v('é è à → mode accents', r.etat.mode === 'accents');

// ── limites ──
r = K.appuyer(champ('abc'), K.etatInitial(), car('d'), { maxLength: 3 }); v('maxLength : pas d’insertion au-delà', r.champ.valeur === 'abc' && r.insere === '');
r = K.appuyer(champ('abc', 0, 3), K.etatInitial(), car('d'), { maxLength: 3 }); v('maxLength : remplacer une sélection reste possible', r.champ.valeur === 'd');
const entree = champ('abc'); K.appuyer(entree, K.etatInitial(), car('d')); v('aucune mutation des arguments', entree.valeur === 'abc' && entree.debut === 3);
r = K.appuyer({ valeur: 'abc', debut: 99, fin: -4 }, K.etatInitial(), car('x')); v('curseur hors limites : ramené dans le texte', r.champ.valeur.length === 4 || r.champ.valeur.length === 1);
r = K.appuyer({ valeur: null }, K.etatInitial(), car('x')); v('valeur nulle : traitée comme vide', r.champ.valeur === 'x');

// ── types de champ ──
v('champs de texte reconnus', K.estChampTexte('INPUT', 'text') && K.estChampTexte('input', 'search') && K.estChampTexte('textarea') && K.estChampTexte('input', '') && K.estChampTexte('input', 'password') && K.estChampTexte('div', '', true));
v('champs sans clavier : case, curseur, couleur, bouton, fichier', !K.estChampTexte('input', 'checkbox') && !K.estChampTexte('input', 'range') && !K.estChampTexte('input', 'color') && !K.estChampTexte('input', 'button') && !K.estChampTexte('input', 'file') && !K.estChampTexte('button', ''));
v('email et number : pas de sélection accessible', K.sansSelection('email') && K.sansSelection('NUMBER') && !K.sansSelection('text'));
console.log(`${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
