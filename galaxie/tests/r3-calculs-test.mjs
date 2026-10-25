import * as D from '../../core/commun/dossiers-calcul.js';
import * as G from '../../core/commun/gestes-calcul.js';
import { creerCalcul } from '../../core/commun/fenetres-calcul.js';
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };

/* dossiers */
const dos = [{ id: 'a', ids: ['1', '2'] }, { id: 'b', ids: ['3'] }];
ok(D.verifierDossiers(dos, ['1', '2', '3']).length === 0, 'rangement cohérent');
ok(D.verifierDossiers(dos, ['1', '2', '3', '4']).join().includes('oubliée'), 'fenêtre oubliée détectée');
ok(D.verifierDossiers([...dos, { id: 'c', ids: ['1'] }], ['1', '2', '3']).join().includes('deux dossiers'), 'doublon détecté');
ok(D.verifierDossiers([{ id: 'v', ids: [] }], []).join().includes('vide'), 'dossier vide détecté');
ok(D.dossierDe(dos, '3') === 'b' && D.dossierDe(dos, 'z') === null, 'dossierDe');
const c = D.carrousel(7, 3, { largeurCarte: 360, largeurEcran: 1280 });
ok(c[3].x === 0 && c[3].echelle === 1 && c[3].opacite === 1 && c[3].rot === 0, 'carte centrale devant, droite, opaque');
ok(c[4].x > 0 && c[2].x < 0 && c[4].x === -c[2].x, 'symétrie droite / gauche');
ok(c[5].opacite < c[4].opacite && c[5].z < c[4].z && c[5].echelle < c[4].echelle, 'plus loin = plus transparent, plus reculé, plus petit');
ok(c[3].zIndex > c[4].zIndex, 'la centrale est au premier plan');
ok(c.every(k => Number.isFinite(k.x) && Number.isFinite(k.z)), 'valeurs finies');
ok(D.carrousel(3, 1.5).length === 3, 'centre fractionnaire accepté');
ok(D.centreApresGlisse(2, 120, 120, 5) === 1 && D.centreApresGlisse(0, 500, 100, 5) === 0 && D.centreApresGlisse(4, -900, 100, 5) === 4, 'glissement borné');
ok(D.centreFinal(2.4, 5) === 2 && D.centreFinal(2.4, 5, -2) === 3 && D.centreFinal(9, 5) === 4, 'centre final arrondi');
ok(D.toucheCarrousel('ArrowRight', 0, 3) === 1 && D.toucheCarrousel('ArrowLeft', 0, 3) === 0 && D.toucheCarrousel('End', 0, 3) === 2, 'flèches du carrousel');
ok(D.centreMolette(1, 100, 3) === 2 && D.centreMolette(1, -100, 3) === 0, 'molette du carrousel');
const ent = [{ vue: 'Mars', dossier: 'Macro', titre: 'Taux et inflation' }, { vue: 'Mars', dossier: 'Graphiques', titre: 'Bitcoin' }, { vue: 'Anatomie', dossier: 'Os', titre: 'Fémur' }];
ok(D.filtrerTiroir(ent, 'inflation').length === 1 && D.filtrerTiroir(ent, 'FEMUR').length === 1 && D.filtrerTiroir(ent, 'mars').length === 2 && D.filtrerTiroir(ent, '').length === 3, 'recherche sans accent ni casse');
const gr = D.grouperTiroir(ent); ok(gr.length === 2 && gr[0].dossiers.length === 2, 'regroupement par vue et dossier');

/* gestes */
const C = creerCalcul({ haut: 64, bas: 70 }), ecran = { l: 1600, h: 900 };
const v = G.vitesse([{ t: 0, x: 0, y: 0 }, { t: 50, x: 50, y: 0 }, { t: 100, x: 150, y: 0 }]); ok(v.vx > 1 && v.vy === 0, 'vitesse mesurée');
ok(G.vitesse([]).vx === 0 && G.vitesse([{ t: 0, x: 0, y: 0 }]).vx === 0, 'vitesse sans échantillon');
let s = { vx: 2, vy: 0 }, tot = 0; for (let i = 0; i < 200 && !s.fini; i++) { const p = G.pasInertie(s, 16); tot += p.dx; s = { ...p }; }
ok(s.fini && tot > 0 && Math.abs(tot - G.distanceInertie({ vx: 2, vy: 0 }).dx) / tot < 0.1, 'l’inertie ralentit et s’arrête, distance ≈ théorique (' + Math.round(tot) + ')');
ok(G.estLance({ vx: 1, vy: 0 }) && !G.estLance({ vx: 0.05, vy: 0.05 }), 'seuil de lancer');
ok(G.classerBalayage(5, 120, 100) === 'bas' && G.classerBalayage(0, -120, 100) === 'haut' && G.classerBalayage(0, 120, 600) === null && G.classerBalayage(100, 100, 50) === null && G.classerBalayage(0, 30, 20) === null, 'balayage vertical rapide seulement');
const util = { x: 10, y: 64, l: 1580, h: 766 };
const a1 = G.aimanter({ x: 14, y: 70, l: 300, h: 200 }, [], util, 10); ok(a1.x === 10 && a1.y === 64 && a1.collee, 'colle aux bords gauche et haut (14 → 10, 70 → 64)');
const a2 = G.aimanter({ x: 100, y: 300, l: 300, h: 200 }, [], util, 10); ok(!a2.collee && a2.x === 100, 'loin des bords : rien ne bouge');
const a3 = G.aimanter({ x: 505, y: 300, l: 300, h: 200 }, [{ x: 100, y: 280, l: 400, h: 240 }], util, 10); ok(a3.x === 500, 'colle au bord d’une autre fenêtre (505 → 500)');
const a4 = G.aimanter({ x: 505, y: 800, l: 300, h: 200 }, [{ x: 100, y: 100, l: 400, h: 100 }], util, 10); ok(a4.x === 505, 'ignore une fenêtre sans recouvrement en projection');
const r0 = { x: 400, y: 300, l: 500, h: 400 };
let r = G.redimBord(r0, 'e', 100, 0, C, ecran); ok(r.l === 600 && r.x === 400, 'bord est');
r = G.redimBord(r0, 'w', -100, 0, C, ecran); ok(r.l === 600 && r.x === 300, 'bord ouest garde le bord droit');
r = G.redimBord(r0, 'n', 0, -100, C, ecran); ok(r.h === 500 && r.y === 200, 'bord nord garde le bas');
r = G.redimBord(r0, 'se', 50, 50, C, ecran); ok(r.l === 550 && r.h === 450, 'coin sud-est');
r = G.redimBord(r0, 'e', -5000, 0, C, ecran); ok(r.l === C.MINI_L, 'jamais sous le minimum');
r = G.redimBord(r0, 'e', 9000, 0, C, ecran); ok(C.dansEcran(r, ecran), 'jamais hors de l’écran');
ok(G.echelleMolette(-100) > 1 && G.echelleMolette(100) < 1 && G.echelleMolette(0) === 1, 'molette : haut agrandit, bas réduit');
ok(G.limiterRotation(30) === 8 && G.limiterRotation(-30) === -8 && G.limiterRotation(3) === 3, 'rotation légère bornée');
ok(Math.abs(G.deltaAngle(350, 10) - (-20)) < 1e-9 && Math.abs(G.angleEntre({ x: 0, y: 0 }, { x: 1, y: 1 }) - 45) < 1e-9, 'angles');
ok(G.pasClavier('ArrowLeft').dx === -24 && G.pasClavier('ArrowDown', { maj: true }).dh === 24 && G.pasClavier('a') === null && G.pasClavier('ArrowRight', { ctrl: true }).dx === 96, 'pas clavier');
ok(G.fenetreSuivante(['a', 'b', 'c'], 'c') === 'a' && G.fenetreSuivante(['a', 'b', 'c'], 'a', true) === 'c' && G.fenetreSuivante([], 'a') === null && G.fenetreSuivante(['a', 'b'], 'zz') === 'a', 'Tab en boucle');
const liste = Array.from({ length: 5 }, (_, i) => ({ id: 'f' + i, x: 0, y: 0, l: 520, h: 400 }));
const cas = G.cascade(liste, ecran, C); ok(cas.length === 5 && cas.every(q => C.dansEcran(q, ecran)) && cas[1].x > cas[0].x && cas[1].y > cas[0].y, 'cascade dans l’écran, décalée');
const car = G.carrouselFenetres(liste, ecran, C, 2); ok(car.length === 5 && car.every(q => C.dansEcran(q, ecran)) && car[2].l > car[0].l && car[2].zOrdre > car[1].zOrdre && car[0].x < car[2].x && car[4].x > car[2].x, 'carrousel de fenêtres : centrale plus grande et devant');
ok(G.cascade([], ecran, C).length === 0 && G.carrouselFenetres([], ecran, C).length === 0, 'listes vides');
const petit = { l: 390, h: 800 }; ok(G.carrouselFenetres(liste, petit, C, 0).every(q => Number.isFinite(q.x) && Number.isFinite(q.y)), 'carrousel sur écran étroit : valeurs finies');
console.log(`R3 calculs : ${n - ko}/${n} vérifications`); process.exit(ko ? 1 : 0);
