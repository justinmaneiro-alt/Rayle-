/* Tests purs des échelles du graphique (v4.1) : zoom d'intervalle, pincement, double appui, zones. node trader-pro/tests/echelles-test.mjs */
import { zoomerIntervalle, facteursPincement, zoomerLogique, estDoubleAppui, zoneDe } from '../commun/echelles.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
/* zoom vertical linéaire : le prix sous le curseur ne bouge pas */
let r = zoomerIntervalle(100, 200, 150, 2); v(proche(r.from, 125) && proche(r.to, 175), 'facteur 2 autour du milieu : 125 – 175');
r = zoomerIntervalle(100, 200, 100, 2); v(proche(r.from, 100) && proche(r.to, 150), 'facteur 2 autour du bas : le bas reste à 100');
r = zoomerIntervalle(100, 200, 150, 0.5); v(proche(r.from, 50) && proche(r.to, 250), 'facteur 0,5 : on dézoome (50 – 250)');
r = zoomerIntervalle(100, 200, 120, 4); v(proche((120 - r.from) / (r.to - 120), 20 / 80), 'le point sous le curseur garde sa position relative');
v(zoomerIntervalle(100, 200, 150, 0).from === 100 && zoomerIntervalle(200, 100, 150, 2).from === 200 && zoomerIntervalle(NaN, 100, 50, 2).to === 100, 'facteur nul ou intervalle invalide : inchangé');
r = zoomerIntervalle(100, 400, 200, 2, { log: true }); v(proche(Math.log(200 / r.from), Math.log(200 / 100) / 2, 1e-9) && proche(Math.log(r.to / 200), Math.log(400 / 200) / 2, 1e-9), 'échelle logarithmique : le zoom se fait sur les logarithmes');
const a = zoomerIntervalle(100, 200, 150, 2), b = zoomerIntervalle(a.from, a.to, 150, 0.5); v(proche(b.from, 100) && proche(b.to, 200), 'zoom puis dézoom du même facteur : retour exact');
/* pincement */
let F = facteursPincement(100, 5, 150, 5); v(proche(F.fx, 1.5) && F.fy === 1 && F.horizontal && !F.vertical, 'pincement horizontal : largeur ×1,5, hauteur inchangée');
F = facteursPincement(4, 120, 4, 60); v(F.fx === 1 && proche(F.fy, 0.5) && !F.horizontal && F.vertical, 'pincement vertical : hauteur ×0,5, largeur inchangée');
F = facteursPincement(80, 80, 160, 120); v(proche(F.fx, 2) && proche(F.fy, 1.5) && F.horizontal && F.vertical, 'pincement diagonal : les deux directions');
F = facteursPincement(100, 100, 1000, 1); v(F.fx === 6 && F.fy === 0.2, 'facteurs bornés (0,2 à 6) : un doigt qui saute ne casse pas l’échelle');
v(facteursPincement(0, 0, 0, 0).fx === 1 && facteursPincement(NaN, 100, 10, 10).fx === 1, 'doigts confondus : aucun changement');
r = zoomerLogique(10, 110, 60, 2); v(proche(r.from, 35) && proche(r.to, 85), 'plage logique : facteur 2 autour du centre');
/* double appui, zones */
v(estDoubleAppui({ t: 0, x: 100, y: 100 }, { t: 300, x: 110, y: 105 }) && !estDoubleAppui({ t: 0, x: 100, y: 100 }, { t: 600, x: 100, y: 100 }) && !estDoubleAppui({ t: 0, x: 100, y: 100 }, { t: 100, x: 200, y: 100 }) && !estDoubleAppui(null, { t: 1, x: 1, y: 1 }), 'double appui : < 380 ms et < 32 px');
v(zoneDe(950, 300, 1000, 600, 60, 26) === 'prix' && zoneDe(400, 590, 1000, 600, 60, 26) === 'temps' && zoneDe(400, 300, 1000, 600, 60, 26) === 'graphique' && zoneDe(990, 595, 1000, 600, 60, 26) === 'prix', 'zones : axe des prix à droite (prioritaire au coin), axe du temps en bas, graphique');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
