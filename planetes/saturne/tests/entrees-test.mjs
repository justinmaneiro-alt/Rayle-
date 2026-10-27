/* S1 : entrées du pilote (clavier, souris, manette standard, joystick / HOTAS simulés) : zones mortes, calibrage, profils, fusion, schéma des commandes. */
import * as E from '../pc/entrees-calcul.js';
let ok = 0, ko = 0;
const v = (nom, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + nom + (d ? ' — ' + d : '')); };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const manette = (axes = [0, 0, 0, 0], pressed = []) => ({ id: 'Xbox 360 (STANDARD GAMEPAD)', mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });

// ── mathématiques
v('zone morte : rien sous le seuil, continue au seuil, 1 à pleine course', E.zoneMorte(0.05, 0.1) === 0 && proche(E.zoneMorte(0.1, 0.1), 0) && proche(E.zoneMorte(1, 0.1), 1) && proche(E.zoneMorte(-0.55, 0.1), -0.5));
v('courbe : exposant 2 = fin au centre, 1 = linéaire', proche(E.courbe(0.5, 2), 0.25) && proche(E.courbe(-0.5, 1), -0.5));
v('normaliser : centre décalé et course asymétrique', proche(E.normaliser(0.2, { centre: 0.2, min: -0.8, max: 1 }), 0) && proche(E.normaliser(1, { centre: 0.2, min: -0.8, max: 1 }), 1) && proche(E.normaliser(-0.8, { centre: 0.2, min: -0.8, max: 1 }), -1) && proche(E.normaliser(-0.3, { centre: 0.2, min: -0.8, max: 1 }), -0.5));
v('normaliser : valeur absurde (NaN, hors course) → 0 ou bornée', E.normaliser(NaN) === 0 && E.normaliser(9) === 1 && E.normaliser(-9) === -1);
const cal = E.calibrer([0.04, 0.05, 0.06, 0.05], [-0.7, 0.9, 0.2]);
v('calibrage : centre = moyenne du repos, extrêmes relevés', proche(cal.centre, 0.05) && cal.min === -0.7 && cal.max === 0.9, JSON.stringify(cal));
const calFaible = E.calibrer([0], [0.05, -0.02]);
v('calibrage : axe presque non bougé → plage utilisable par défaut (pas de division par zéro)', calFaible.max - calFaible.centre >= 0.2 && calFaible.centre - calFaible.min >= 0.2);
v('valeur d’axe : inversion + zone morte + sensibilité + courbe, bornée', proche(E.valeurAxe(-1, { inv: true, zm: 0.1, sens: 1, expo: 1 }), 1) && E.valeurAxe(0.05, { zm: 0.1 }) === 0 && E.valeurAxe(1, { zm: 0, sens: 3, expo: 1 }) === 1);

// ── manette standard simulée
const std = E.profilStandard('x'), mem = {};
let r = E.lireManette(manette([0, -1, 0, 0]), std, mem);
v('stick gauche vers l’avant → avancer (axe inversé)', proche(r.trans[2], 1) && r.trans[0] === 0, JSON.stringify(r.trans));
r = E.lireManette(manette([1, 0, 0, 0]), std, mem);
v('stick gauche à droite → translation à droite', proche(r.trans[0], 1));
r = E.lireManette(manette([0, 0, -1, -1]), std, mem);
v('stick droit : gauche + haut → lacet à gauche (nez à gauche) et tangage (nez haut)', r.rot[1] > 0.9 && r.rot[0] > 0.9, JSON.stringify(r.rot));
r = E.lireManette(manette([0.05, -0.05, 0.04, 0.03]), std, mem);
v('zone morte : un stick qui tremble ne bouge pas le vaisseau', r.trans.every(x => x === 0) && r.rot.every(x => x === 0));
const gp = manette([0, 0, 0, 0]); gp.buttons[7] = { pressed: true, value: 0.5 }; gp.buttons[6] = { pressed: false, value: 0 };
r = E.lireManette(gp, std, mem);
v('gâchette droite à moitié → monter à 50 %', proche(r.trans[1], 0.5, 0.06), r.trans[1].toFixed(2));
r = E.lireManette(manette([0, 0, 0, 0], [5]), std, mem);
v('épaule droite → roulis à droite', proche(r.rot[2], 1));
r = E.lireManette(manette([0, 0, 0, 0], [0]), std, {});
v('bouton A maintenu → postcombustion', r.post === true && r.frein === false);
r = E.lireManette(manette([0, 0, 0, 0], [1]), std, {});
v('bouton B maintenu → frein', r.frein === true);
const m2 = {};
const e1 = E.lireManette(manette([0, 0, 0, 0], [9]), std, m2).evenements, e2 = E.lireManette(manette([0, 0, 0, 0], [9]), std, m2).evenements, e3 = E.lireManette(manette([0, 0, 0, 0], []), std, m2).evenements, e4 = E.lireManette(manette([0, 0, 0, 0], [9]), std, m2).evenements;
v('bouton d’action : un seul événement par pression (front montant)', e1.length === 1 && e1[0] === 'vue' && e2.length === 0 && e3.length === 0 && e4.length === 1);

// ── joystick / HOTAS simulé : manette des gaz
const joy = E.profilJoystick('Thrustmaster'), hotas = { id: 'T.Flight Hotas', mapping: '', axes: [0.5, -0.5, 0.2, -1, 0, 0], buttons: Array.from({ length: 10 }, () => ({ pressed: false, value: 0 })) };
r = E.lireManette(hotas, joy, {});
v('HOTAS : roulis (axe 0), tangage (axe 1 inversé), lacet (axe 2)', r.rot[2] > 0.2 && r.rot[0] > 0.2 && r.rot[1] > 0, JSON.stringify(r.rot));
v('HOTAS : manette des gaz poussée en avant (axe −1, inversé par défaut) = 100 % de la vitesse voulue', proche(r.vitesseGaz, 1), String(r.vitesseGaz));
hotas.axes[3] = 1; r = E.lireManette(hotas, joy, {});
v('HOTAS : manette des gaz tirée en arrière (axe +1) = 0 %', proche(r.vitesseGaz, 0));
v('profil choisi selon la manette : standard / joystick', E.profilPourManette({ mapping: 'standard', id: 'a' }).type === 'standard' && E.profilPourManette({ mapping: '', id: 'b', axes: [0, 0, 0, 0, 0], buttons: [{}, {}, {}] }).type === 'joystick');

// ── profils : lecture sûre du stockage
const hostile = JSON.stringify({ version: 1, global: { sensSouris: 99, sensManette: -4, inverserTangageSouris: 'oui' }, profils: { a: { id: 'a', axes: { avance: { axe: 999, inv: 1 }, lacet: { axe: 2, zm: 5, sens: 100, expo: 0, centre: 'x', min: 9, max: -9 }, '__proto__': { axe: 1 } }, paires: { vertical: { haut: 7, bas: -3 } }, boutons: { vue: 4, postcombustion: 'x', pirate: 3 } }, '__proto__': { x: 1 } } });
const stock = E.lireStock(hostile);
v('stockage hostile : valeurs bornées, champs inconnus ignorés, pas de pollution de prototype', stock.global.sensSouris === 4 && stock.global.sensManette === 0.2 && stock.global.inverserTangageSouris === true && !({}).x && Object.keys(stock.profils).join() === 'a');
const pa = stock.profils.a;
v('profil : axe hors plage ignoré, zone morte / sensibilité / exposant bornés, course cohérente', pa.axes.avance === undefined && pa.axes.lacet && pa.axes.lacet.zm <= 0.6 && pa.axes.lacet.sens <= 3 && pa.axes.lacet.expo >= 1 && pa.axes.lacet.max > pa.axes.lacet.centre && pa.axes.lacet.min < pa.axes.lacet.centre, JSON.stringify(pa.axes.lacet));
v('profil : seuls les boutons valides sont gardés', pa.boutons.vue === 4 && pa.boutons.postcombustion === undefined && pa.boutons.pirate === undefined && pa.paires.vertical.haut === 7 && pa.paires.vertical.bas === undefined);
v('stockage illisible → valeurs par défaut', JSON.stringify(E.lireStock('{pas du json')) === JSON.stringify(E.STOCK_VIDE()) && JSON.stringify(E.lireStock(null)) === JSON.stringify(E.STOCK_VIDE()));
const aller = E.lireStock(E.ecrireStock({ ...E.STOCK_VIDE(), profils: { x: E.profilStandard('x') } }));
v('stockage : écriture puis lecture identiques', JSON.stringify(aller.profils.x.axes) === JSON.stringify(E.validerProfil(E.profilStandard('x')).axes) && aller.profils.x.boutons.vue === 9);

// ── clavier, souris, fusion
v('clavier : W + D + Maj → avant, droite, postcombustion', (() => { const k = E.lireClavier(new Set(['KeyW', 'KeyD', 'ShiftLeft'])); return k.trans[2] === 1 && k.trans[0] === 1 && k.post; })());
v('clavier : touches opposées s’annulent', (() => { const k = E.lireClavier(new Set(['KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight'])); return k.trans[2] === 0 && k.rot[1] === 0; })());
v('clavier : flèche haut = nez vers le bas (pilotage « manche »), flèche bas = nez vers le haut', E.lireClavier(new Set(['ArrowUp'])).rot[0] === -1 && E.lireClavier(new Set(['ArrowDown'])).rot[0] === 1);
const s = E.lireSouris(10, 0, 1 / 60, { sens: 1 }), s2 = E.lireSouris(0, 10, 1 / 60, { sens: 1 }), s3 = E.lireSouris(0, 10, 1 / 60, { sens: 1, inverser: true });
v('souris : à droite → lacet vers la droite ; vers le bas → nez vers le bas ; inversion possible', s[1] < 0 && s2[0] < 0 && s3[0] > 0 && Math.abs(E.lireSouris(1e5, 1e5, 1 / 60)[0]) <= 1);
const f = E.fusionner({ trans: [0.3, 0, 0.9], rot: [0, 0.2, 0], post: false }, { trans: [-0.8, 0.1, 0.2], rot: [0, -0.5, 0], post: true, vitesseGaz: 0.4 }, null);
v('fusion des sources : amplitude maximale par axe, postcombustion si l’une la demande', f.trans[0] === -0.8 && f.trans[2] === 0.9 && f.rot[1] === -0.5 && f.post && f.vitesseGaz === 0.4);

// ── schéma des commandes affiché
const sch = E.schemaCommandes(E.profilStandard('x'));
v('schéma : une ligne par fonction avec touche et bouton de manette', sch.length >= 20 && sch.every(l => l.fonction) && sch.some(l => l.clavier.includes('Maj')) && sch.some(l => /^bouton \d+$/.test(l.manette)) && sch.some(l => /^axe \d/.test(l.manette)) && sch.some(l => l.clavier.includes('↑')));
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
