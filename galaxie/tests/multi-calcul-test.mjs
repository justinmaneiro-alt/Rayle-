// Tests des calculs du mode multi-écrans (positions simulées : aucun écran réel nécessaire). Lancer :  node galaxie/tests/multi-calcul-test.mjs
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../../core/multi/multi-calcul.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// Les trois écrans de Justin (relevés sur son PC) : principal 1920×1080, second à droite, un vertical à gauche décalé en hauteur
const BRUT = [
  { id: '\\\\.\\DISPLAY3', x: -1080, y: -81, w: 1080, h: 1920 },
  { id: '\\\\.\\DISPLAY2', x: 1920, y: 0, w: 1920, h: 1080 },
  { id: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 1920, h: 1080, primaire: true }
];
const E3 = M.normaliserEcrans(BRUT);
v('3 écrans : principal d’abord, puis de gauche à droite', E3.map(e => e.numero).join() === '1,3,2', E3.map(e => e.numero).join());
v('orientations détectées (vertical = plus haut que large)', E3.find(e => e.numero === 3).orientation === 'vertical' && E3.find(e => e.numero === 2).orientation === 'horizontal');
v('numéros pris du nom Windows (\\\\.\\DISPLAY2 → 2)', E3.find(e => e.id.endsWith('DISPLAY2')).numero === 2);
v('écrans invalides ignorés', M.normaliserEcrans([null, { w: 0, h: 10 }, { id: 'a', x: 0, y: 0, w: 100, h: 50 }, 'x']).length === 1);
v('aucun principal indiqué : le plus à gauche le devient', M.normaliserEcrans([{ id: 'a', x: 500, w: 10, h: 10 }, { id: 'b', x: 0, w: 10, h: 10 }]).find(e => e.primaire).id === 'b');
v('liste vide ou absurde : pas d’erreur', M.normaliserEcrans(undefined).length === 0 && M.normaliserEcrans('?').length === 0);

// Disposition par défaut : principal = Raylé, écran 2 = actualités, vertical = fil + conversation
const D3 = M.dispositionDefaut(BRUT), id = n => E3.find(e => e.numero === n).id;
const types = i => (D3.ecrans[i] || []).map(m => m.type).join('+');
v('défaut : écran principal = Raylé', types(id(1)) === 'rayle');
v('défaut : écran 2 = actualités', types(id(2)) === 'actus');
v('défaut : écran vertical = fil + conversation', types(id(3)) === 'fil+conversation');
const E2 = [BRUT[2], BRUT[1]], D2 = M.dispositionDefaut(E2);
v('2 écrans : Raylé + actualités, pas d’écran fantôme', Object.keys(D2.ecrans).length === 2);
const D1 = M.dispositionDefaut([BRUT[2]]);
v('1 écran : seulement Raylé', Object.keys(D1.ecrans).length === 1 && Object.values(D1.ecrans)[0][0].type === 'rayle');
v('0 écran : rien, sans planter', Object.keys(M.dispositionDefaut([]).ecrans).length === 0);
v('identifiants de modules uniques', new Set(Object.values(D3.ecrans).flat().map(m => m.id)).size === 4);

// Fenêtres à ouvrir
const S3 = M.fenetresSouhaitees(D3, BRUT, E3[0].id);
v('3 écrans : 2 fenêtres satellites, la principale reste normale', S3.satellites.length === 2 && S3.principal.normal && S3.absents.length === 0);
v('identifiants de fenêtres sûrs (lettres, chiffres, tirets)', S3.satellites.every(s => /^[a-z0-9-]+$/.test(s.id)), S3.satellites.map(s => s.id).join());
v('identifiants de fenêtres différents', new Set(S3.satellites.map(s => s.id)).size === 2);
const S2 = M.fenetresSouhaitees(D3, E2, E2[0].id);
v('2 écrans seulement : une fenêtre ; le vertical absent est signalé, pas ouvert', S2.satellites.length === 1 && S2.absents.length === 1, JSON.stringify([S2.satellites.length, S2.absents]));
const S1 = M.fenetresSouhaitees(D3, [BRUT[2]], BRUT[2].id);
v('1 écran seulement : aucune fenêtre, pas de plantage', S1.satellites.length === 0 && S1.absents.length === 2);
v('écran principal avec un autre module que Raylé : fenêtre principale non « normale »', !M.fenetresSouhaitees({ ecrans: { [E3[0].id]: [M.creerModule('actus')] } }, BRUT, E3[0].id).principal.normal);
v('écran principal vide ou Raylé seul : accueil normal', M.principalNormal([]) && M.principalNormal([M.creerModule('rayle')]) && !M.principalNormal([M.creerModule('rayle'), M.creerModule('meteo')]));

// Plan : ouvrir / fermer / garder, et déplacement d’un écran (position changée)
const sat = S3.satellites, idsSat = sat.map(s => s.id);
let plan = M.planDeFenetres(sat, []);
v('plan : tout ouvrir au départ', plan.ouvrir.length === 2 && plan.fermer.length === 0);
plan = M.planDeFenetres(sat, idsSat);
v('plan : rien à faire si tout est ouvert', plan.ouvrir.length === 0 && plan.fermer.length === 0 && plan.garder.length === 2);
plan = M.planDeFenetres([sat[0]], idsSat);
v('plan : fermer la fenêtre qui n’est plus voulue', plan.fermer.length === 1 && plan.fermer[0] === sat[1].id);
plan = M.planDeFenetres(sat, [sat[0].id]);
v('plan : ouvrir seulement la manquante (fermer une fenêtre n’arrête pas les autres)', plan.ouvrir.length === 1 && plan.ouvrir[0].id === sat[1].id);
const emp = { [sat[0].id]: { x: sat[0].ecran.x + 400, y: sat[0].ecran.y, w: sat[0].ecran.w, h: sat[0].ecran.h } };
v('plan : fenêtre hors de sa place → à replacer (pas « gardée »)', M.planDeFenetres(sat, idsSat, emp).garder.length === 1);

// Édition : ajout, ordre, taille, déplacement entre écrans
let d = M.dispositionVide(), r;
r = M.ajouterModule(d, 'A', 'rayle'); d = r.disp;
r = M.ajouterModule(d, 'A', 'meteo'); d = r.disp;
r = M.ajouterModule(d, 'A', 'actus', { portee: 'monde' }, 0); d = r.disp;
v('ajout à une position précise', d.ecrans.A.map(m => m.type).join() === 'actus,rayle,meteo' && d.ecrans.A[0].params.portee === 'monde');
const mid = d.ecrans.A[1].id;
d = M.redimensionner(d, 'A', mid, 2);
v('taille : +2 sur la part', d.ecrans.A[1].part === 3);
d = M.redimensionner(d, 'A', mid, 50); v('taille bornée à 6', d.ecrans.A[1].part === 6);
d = M.redimensionner(d, 'A', mid, -50); v('taille bornée à 1', d.ecrans.A[1].part === 1);
const rep = M.repartition([{ id: 'a', part: 1 }, { id: 'b', part: 3 }]);
v('répartition proportionnelle (25 % / 75 %)', rep[0].pourcent === 25 && rep[1].pourcent === 75);
r = M.deplacerModule(d, 'A', mid, 'A', 0); d = r.disp;
v('réorganiser sur le même écran (glisser-déposer)', d.ecrans.A[0].id === mid && d.ecrans.A.length === 3);
r = M.deplacerModule(d, 'A', mid, 'B'); d = r.disp;
v('passer un module sur un autre écran', d.ecrans.B.length === 1 && d.ecrans.B[0].id === mid && d.ecrans.A.length === 2);
r = M.deplacerModule(d, 'B', mid, 'A', 1); d = r.disp;
v('retour : l’écran vidé disparaît, le module garde son identifiant', !d.ecrans.B && d.ecrans.A[1].id === mid);
v('déplacer un module inconnu : erreur claire, disposition intacte', !!M.deplacerModule(d, 'A', 'zzz', 'B').erreur);
for (let i = 0; i < 6; i++) d = M.ajouterModule(d, 'A', 'fil').disp;
v('6 modules au plus par écran', d.ecrans.A.length === 6 && !!M.ajouterModule(d, 'A', 'fil').erreur);
d = M.retirerModule(d, 'A', mid); v('retirer un module', !d.ecrans.A.some(m => m.id === mid));
let e0 = M.dispositionVide(); e0 = M.ajouterModule(e0, 'N', 'vide').disp;
v('écran noir : un second « vide » est refusé', !!M.ajouterModule(e0, 'N', 'vide').erreur);
const rem = M.ajouterModule(e0, 'N', 'meteo').disp; v('remplir un écran noir enlève le noir', rem.ecrans.N.length === 1 && rem.ecrans.N[0].type === 'meteo');
const avant = JSON.stringify(D3); M.ajouterModule(D3, id(1), 'meteo'); M.retirerModule(D3, id(1), D3.ecrans[id(1)][0].id);
v('les fonctions ne modifient pas leur argument', JSON.stringify(D3) === avant);

// Dispositions enregistrées
let etat = M.etatInitial(BRUT);
v('état initial : une disposition « Défaut », inactif', etat.courante === 'Défaut' && !etat.actif && Object.keys(etat.dispositions).length === 1);
let x = M.enregistrerDisposition(etat, 'Trading', D3); etat = x.etat;
x = M.enregistrerDisposition(etat, '  Travail ', D1); etat = x.etat;
v('enregistrer plusieurs dispositions avec un nom', Object.keys(etat.dispositions).join() === 'Défaut,Trading,Travail' && etat.courante === 'Travail');
v('nom vide refusé', !!M.enregistrerDisposition(etat, '   ', D1).erreur);
v('nom trop long refusé', !!M.enregistrerDisposition(etat, 'x'.repeat(41), D1).erreur);
x = M.enregistrerDisposition(etat, 'trading', D1); v('même nom (casse différente) : met à jour sans doublon', Object.keys(x.etat.dispositions).length === 3 && x.nom === 'Trading');
x = M.renommerDisposition(etat, 'Travail', 'Détente'); etat = x.etat;
v('renommer (garde l’ordre et la courante)', Object.keys(etat.dispositions).join() === 'Défaut,Trading,Détente' && etat.courante === 'Détente');
v('renommer vers un nom pris : refusé', !!M.renommerDisposition(etat, 'Détente', 'trading').erreur);
x = M.dupliquerDisposition(etat, 'Trading', 'Trading 2'); const cp = x.etat.dispositions['Trading 2'];
v('dupliquer : copie avec de nouveaux identifiants de modules', !!cp && Object.values(cp.ecrans).flat().every(m => !Object.values(etat.dispositions.Trading.ecrans).flat().some(o => o.id === m.id)));
x = M.supprimerDisposition(etat, 'Détente'); etat = x.etat;
v('supprimer ; la courante bascule sur une autre', !etat.dispositions['Détente'] && !!etat.dispositions[etat.courante]);
etat = M.supprimerDisposition(M.supprimerDisposition(etat, 'Défaut').etat, 'Trading').etat;
v('la dernière disposition ne peut pas être supprimée', Object.keys(etat.dispositions).length === 1);
x = M.choisirDisposition(M.enregistrerDisposition(M.etatInitial(BRUT), 'Trading', D3).etat, 'TRADING');
v('choisir par le nom, sans tenir compte de la casse ni des accents', x.nom === 'Trading' && M.trouverDisposition({ dispositions: { Détente: {} } }, 'detente') === 'Détente');

// Réparation d’un état abîmé
v('état illisible : repris par défaut, sans erreur', M.normaliserEtat('n’importe quoi', BRUT).courante === 'Défaut' && M.normaliserEtat(null, BRUT).actif === false);
const abime = M.normaliserEtat({ actif: true, courante: 'Inconnue', dispositions: { Ok: { ecrans: { a: [{ type: 'meteo', part: 99 }, { type: 'disparu' }, null, { type: 'rayle', id: 'a b' }] } }, '': {}, X: 5 } }, BRUT);
v('état abîmé : types inconnus retirés, parts bornées, id invalides refaits, courante réparée',
  abime.actif === true && Object.keys(abime.dispositions).join() === 'Ok' && abime.courante === 'Ok' && abime.dispositions.Ok.ecrans.a.length === 2 && abime.dispositions.Ok.ecrans.a[0].part === 6 && /^[\w-]+$/.test(abime.dispositions.Ok.ecrans.a[1].id));
v('un module d’une planète future est accepté si son type est déclaré', M.normaliserEtat({ dispositions: { T: { ecrans: { a: [{ type: 'trading-mars' }] } } } }, BRUT, ['trading-mars']).dispositions.T.ecrans.a.length === 1);
v('écran absent : son réglage est conservé', !!M.normaliserEtat({ dispositions: { T: { ecrans: { 'ecran-debranche': [{ type: 'meteo' }] } } } }, [BRUT[2]]).dispositions.T.ecrans['ecran-debranche']);
const ET = JSON.parse(JSON.stringify(M.normaliserEtat(M.etatInitial(BRUT), BRUT))); v('aller-retour JSON stable', JSON.stringify(M.normaliserEtat(ET, BRUT).dispositions.Défaut.ecrans) === JSON.stringify(ET.dispositions.Défaut.ecrans));

// Dessin à l’échelle dans l’éditeur
const ech = M.echelleEditeur(E3, 480, 200);
const R = Object.fromEntries(ech.rects.map(r => [E3.find(e => e.id === r.id).numero, r]));
v('éditeur : tout tient dans la zone', ech.rects.every(r => r.left >= 0 && r.top >= 0 && r.left + r.width <= 480.01 && r.top + r.height <= 200.01));
v('éditeur : proportions respectées (écran 16/9, écran vertical 9/16)', Math.abs(R[2].width / R[2].height - 16 / 9) < 0.01 && Math.abs(R[3].width / R[3].height - 9 / 16) < 0.01);
v('éditeur : positions relatives (vertical à gauche du principal, second à droite)', R[3].left < R[1].left && R[2].left > R[1].left);
v('éditeur : le vertical dépasse vers le haut comme dans Windows (y = -81)', R[3].top < R[1].top);
v('éditeur : aucun écran → rien, sans erreur', M.echelleEditeur([], 100, 100).rects.length === 0);

// Voix
const A = (t, ctx) => M.analyserCommandeVoix(t, ctx);
for (const t of ['active le mode multi-écrans', 'Active le mode multi écrans', 'Raylé, active le mode multiécran', 'lance le mode multi-écrans', 'passe en mode multi-écrans', 'mets le mode multi-écrans', 'active le multi-écrans s’il te plaît'])
  v('voix activer : « ' + t + ' »', A(t)?.type === 'activer', JSON.stringify(A(t)));
for (const t of ['désactive le mode multi-écrans', 'Désactive le mode multi écrans', 'coupe le mode multi-écrans', 'quitte le mode multi-écrans', 'sors du mode multi-écrans', 'arrête le mode multi-écrans'])
  v('voix désactiver : « ' + t + ' »', A(t)?.type === 'desactiver', JSON.stringify(A(t)));
for (const [t, n] of [['mets la disposition Trading', 'trading'], ['Mets la disposition Trading', 'trading'], ['passe en disposition travail', 'travail'], ['charge la disposition détente', 'detente'], ['active la disposition Mes actus', 'mes actus'], ['change la disposition pour Trading', 'trading']]) {
  const a = A(t); v('voix disposition : « ' + t + ' »', a?.type === 'disposition' && a.nom === n, JSON.stringify(a));
}
v('voix : identifier les écrans', A('identifie les écrans')?.type === 'identifier' && A('montre-moi les écrans')?.type === 'identifier' && A('numérote mes écrans')?.type === 'identifier');
v('voix : « ferme tout » ignoré si le mode n’est pas actif (il ferme alors les fenêtres holographiques)', A('ferme tout') === null && A('ferme tout', { actif: false }) === null);
v('voix : « ferme tout » pris si le mode est actif', A('ferme tout', { actif: true })?.type === 'fermer_tout');
v('voix : « ferme toutes les fenêtres » → fermer tout', A('ferme toutes les fenêtres')?.type === 'fermer_tout');
const dep = A('envoie les actualités sur l’écran 2'); v('voix : envoyer les actualités sur l’écran 2', dep?.type === 'deplacer' && dep.module === 'actus' && dep.numero === 2, JSON.stringify(dep));
const dep2 = A('déplace le fil sur l’écran trois'); v('voix : déplacer le fil sur l’écran trois', dep2?.type === 'deplacer' && dep2.module === 'fil' && dep2.numero === 3, JSON.stringify(dep2));
v('voix : lister les dispositions', A('quelles sont mes dispositions')?.type === 'liste');
for (const t of ['quelle heure est-il', 'les actualités', 'ferme les actualités', 'montre-moi Saturne', 'active le mode jeu', 'mets de la musique', 'ouvre le terminal', 'désactive le micro', 'bonjour', '', 'ça va', 'mets la galaxie', 'passe en mode jeu'])
  v('voix : phrase ordinaire laissée à Raylé : « ' + t + ' »', A(t) === null, JSON.stringify(A(t)));
v('voix : phrase très longue ignorée', A('active le mode multi-écrans ' + 'blabla '.repeat(12)) === null);

// Messages du canal
const mv = M.messageValide;
v('canal : messages bien formés acceptés', mv({ t: 'bonjour', de: 'e1' }) && mv({ t: 'ligne', de: 'p', kind: 'ray', texte: 'salut' }) && mv({ t: 'raccourci', de: 'e1', nom: 'bascule' }) && mv({ t: 'deplacer', de: 'e1', module: 'm', de_ecran: 'a', vers: 'b' }) && mv({ t: 'taille', de: 'e1', module: 'm', de_ecran: 'a', delta: 1 }));
v('canal : messages mal formés refusés', !mv(null) && !mv('x') && !mv({}) && !mv({ t: 'inconnu', de: 'x' }) && !mv({ t: 'ligne', de: 'p', kind: 'zzz', texte: 'a' }) && !mv({ t: 'ligne', de: 'p', kind: 'ray' }) && !mv({ t: 'raccourci', de: 'x', nom: 'rm -rf' }) && !mv({ t: 'bonjour' }) && !mv({ t: 'bonjour', de: 'x'.repeat(100) }) && !mv({ t: 'taille', de: 'e1', module: 'm', de_ecran: 'a', delta: 'x' }));

console.log(ko ? ko + ' ÉCHEC(S), ' + ok + ' réussis' : 'multi-calcul : ' + ok + ' vérifications réussies');
process.exit(ko ? 1 : 0);
