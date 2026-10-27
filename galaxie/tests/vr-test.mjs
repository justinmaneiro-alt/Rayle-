// Calculs de la réalité virtuelle (phase 12), sans casque : placement des fenêtres, visée, zones, déplacement, cliquet, téléportation, vignette, vol, redimensionnement.
// Lancer : node galaxie/tests/vr-test.mjs
import { createRequire } from 'node:module';
const V = createRequire(import.meta.url)('../../core/vr/vr-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const proche = (a, b, t = 1e-6) => Math.abs(a - b) <= t, pv = (a, b, t = 1e-6) => a.every((x, i) => proche(x, b[i], t));

// ── quaternions ──
v('rotation d’un quart de tour autour de Y : −Z devient −X', pv(V.tourner([0, 0, -1], V.quatLacet(Math.PI / 2)), [-1, 0, 0]));
v('cap de la tête : regard vers −Z = 0, vers −X = +π/2', proche(V.lacetDe(V.quatLacet(0)), 0) && proche(V.lacetDe(V.quatLacet(Math.PI / 2)), Math.PI / 2));
// ── placement ──
const rang = V.disposerPanneaux(5, { rayon: 1.7, hauteurOeil: 1.5, arcDeg: 180 });
v('5 fenêtres sur un arc : toutes à 1,7 m de la tête et à hauteur des yeux', rang.length === 5 && rang.every(p => proche(Math.hypot(p.pos[0], p.pos[2]), 1.7, 1e-6) && p.pos[1] === 1.5));
v('la fenêtre du milieu est droit devant (−Z), les autres de part et d’autre', pv(rang[2].pos, [0, 1.5, -1.7]) && rang[0].pos[0] > 0 && rang[4].pos[0] < 0);
v('chaque fenêtre regarde l’utilisateur (sa normale pointe vers la tête)', rang.every(p => { const n = V.tourner([0, 0, 1], V.quatLacet(p.yaw)), versTete = [-p.pos[0], 0, -p.pos[2]], m = Math.hypot(...versTete); return proche(n[0], versTete[0] / m, 1e-6) && proche(n[2], versTete[2] / m, 1e-6); }));
v('deux rangées au-delà de 6 fenêtres, sans chevauchement vertical', (r => new Set(r.map(p => p.rang)).size === 2 && Math.abs(r[0].pos[1] - r[11].pos[1]) > 0.5)(V.disposerPanneaux(12, { parRang: 6 })));
v('une seule fenêtre : devant ; zéro : rien', pv(V.disposerPanneaux(1)[0].pos, [0, 1.5, -1.7]) && V.disposerPanneaux(0).length === 0);
v('l’arc se centre sur un autre cap (centre de la pièce déplacé)', pv(V.disposerPanneaux(1, { centre: [2, 0, 3] })[0].pos, [2, 1.5, 1.3]));
// ── visée ──
const pan = { pos: [0, 1.5, -2], quat: [0, 0, 0, 1], l: 1, h: 0.6 };
const h1 = V.intersectionRayonPanneau([0, 1.5, 0], [0, 0, -1], pan);
v('rayon droit sur le centre du panneau : t = 2, uv = (0,5 ; 0,5)', h1 && proche(h1.t, 2) && pv(h1.uv, [0.5, 0.5]) && !h1.deDos);
const h2 = V.intersectionRayonPanneau([0, 1.5, 0], [0.2, 0.1, -1], pan);
v('rayon en haut à droite : uv à droite et en haut', h2 && h2.uv[0] > 0.5 && h2.uv[1] < 0.5, JSON.stringify(h2 && h2.uv));
v('rayon qui rate le panneau, parallèle, ou dirigé vers l’arrière : aucun point', V.intersectionRayonPanneau([0, 1.5, 0], [2, 0, -1], pan) === null && V.intersectionRayonPanneau([0, 1.5, 0], [1, 0, 0], pan) === null && V.intersectionRayonPanneau([0, 1.5, 0], [0, 0, 1], pan) === null);
const tourne = { pos: [-2, 1.5, 0], quat: V.quatLacet(Math.PI / 2), l: 1, h: 0.6 };
v('panneau tourné d’un quart de tour (à gauche, face à la tête) : visée au centre', (h => h && pv(h.uv, [0.5, 0.5], 1e-6))(V.intersectionRayonPanneau([0, 1.5, 0], [-1, 0, 0], tourne)));
v('un panneau vu de dos est signalé', V.intersectionRayonPanneau([0, 1.5, -4], [0, 0, 1], pan).deDos === true);
const vise = V.panneauVise([0, 1.5, 0], [0, 0, -1], [{ ...pan, pos: [0, 1.5, -3] }, pan, { ...pan, pos: [0, 1.5, -1], visible: false }]);
v('le panneau le plus proche est visé, les cachés sont ignorés', vise && vise.indice === 1);
v('zones : titre en haut, coin en bas à droite, corps ailleurs', V.zonePanneau([0.5, 0.03]) === 'titre' && V.zonePanneau([0.97, 0.97]) === 'coin' && V.zonePanneau([0.5, 0.5]) === 'corps' && V.zonePanneau([0.97, 0.5]) === 'corps');
v('uv → coordonnées de la page', (p => p.x === 150 && p.y === 175)(V.uvVersElement([0.5, 0.25], { left: 100, top: 100, width: 100, height: 300 })));
// ── déplacement ──
v('stick poussé en avant (axe Y = −1 sur un contrôleur WebXR), regard vers −Z : on avance vers −Z', (d => d[2] < -0.1 && Math.abs(d[0]) < 1e-9 && d[1] === 0)(V.deplacementFluide({ stick: [0, -1], cap: 0, dt: 0.1 })));
v('regard tourné de 90° à gauche : avancer = vers −X', (d => d[0] < -0.1 && Math.abs(d[2]) < 1e-6)(V.deplacementFluide({ stick: [0, -1], cap: Math.PI / 2, dt: 0.1 })));
v('pas de côté à droite', (d => d[0] > 0.1)(V.deplacementFluide({ stick: [1, 0], cap: 0, dt: 0.1 })));
v('zone morte : le tremblement du stick ne déplace pas', V.deplacementFluide({ stick: [0.1, 0.1], cap: 0, dt: 1 }).every(x => x === 0));
v('vitesse maximale = 2,2 m/s', proche(Math.hypot(...V.deplacementFluide({ stick: [0, 1], cap: 0, dt: 1 })), 2.2, 1e-6));
// ── cliquet ──
let st = null, a = V.cliquetRotation(st, 0.9, 0.016); v('poussée franche : un cran de 30° (stick à droite = tourne à droite)', a.deltaDeg === -30);
a = V.cliquetRotation(a.etat, 0.9, 0.016); v('stick maintenu : pas de second cran avant d’être relâché', a.deltaDeg === 0);
a = V.cliquetRotation(a.etat, 0, 0.5); a = V.cliquetRotation(a.etat, -0.9, 0.016); v('relâché puis poussé à gauche : cran de +30°', a.deltaDeg === 30);
a = V.cliquetRotation(null, 0.4, 0.016); v('poussée faible (< 0,7) : rien', a.deltaDeg === 0);
// ── téléportation ──
const arc = V.arcTeleportation([0, 1.2, 0], [0, 0.35, -1], { solY: 0 });
v('arc de téléportation : retombe au sol devant l’utilisateur', arc.impact && arc.impact[1] === 0 && arc.impact[2] < -2 && arc.points.length > 5 && arc.points[0][1] === 1.2);
v('arc dirigé vers le bas : retombe presque tout de suite, très près', (a => a.impact && Math.hypot(a.impact[0], a.impact[2]) < 2.5)(V.arcTeleportation([0, 1.2, 0], [0, -0.5, -1])));
v('portée limitée', V.arcTeleportation([0, 1.2, 0], [0, 0.6, -1], { portee: 1 }).impact === null);
// ── vignette ──
v('vignette : nulle à l’arrêt, forte en mouvement rapide ou rotation rapide', V.vignetteCible(0, 0) === 0 && V.vignetteCible(2.4, 0) === 1 && V.vignetteCible(0, 120) > 0.8 && V.vignetteCible(1.2, 0) > 0.4 && V.vignetteCible(1.2, 0) < 0.6);
v('vignette : monte vite, descend lentement', V.lisserVignette(0, 1, 0.1) > 0.5 && V.lisserVignette(1, 0, 0.1) > 0.8);
v('vignette réglable (force)', V.vignetteCible(2.4, 0, { force: 0.5 }) === 0.5);
// ── vol ──
const vol = V.volLibre({ vitesse: [0, 0, 0], direction: [0, 0, -1], poussee: 1, distance: 100, dt: 0.1 });
v('vol : la gâchette accélère dans la direction de la manette', vol.vitesse[2] < 0 && Math.abs(vol.vitesse[0]) < 1e-9 && proche(vol.deplacement[2], vol.vitesse[2] * 0.1));
let vit = [0, 0, 0]; for (let i = 0; i < 400; i++) vit = V.volLibre({ vitesse: vit, direction: [0, 0, -1], poussee: 1, distance: 10, dt: 0.05 }).vitesse;
v('vol : vitesse plafonnée selon la distance au corps le plus proche', Math.hypot(...vit) <= V.vitesseMaxSelonDistance(10) + 1e-6 && Math.hypot(...vit) > V.vitesseMaxSelonDistance(10) * 0.5);
v('vol : plus loin des corps = plus vite', V.vitesseMaxSelonDistance(1000) > V.vitesseMaxSelonDistance(10) && V.vitesseMaxSelonDistance(1e9) === 2500);
let lent = [0, 0, -50]; for (let i = 0; i < 100; i++) lent = V.volLibre({ vitesse: lent, direction: [0, 0, -1], poussee: 0, distance: 10, dt: 0.05 }).vitesse;
v('vol : sans poussée la vitesse s’amortit jusqu’à l’arrêt', Math.hypot(...lent) < 0.5);
// ── redimensionnement, taille ──
v('redimensionner : la manette qui s’éloigne agrandit, bornes respectées', V.redimensionner(1, 0.5, 1) === 2 && V.redimensionner(1, 0.5, 5) === 3 && V.redimensionner(1, 1, 0.1) === 0.4);
v('taille du panneau : proportions de l’élément, bornées', (t => proche(t.l, 1.2, 1e-9) && proche(t.h, 0.72, 1e-9))(V.taillePanneau(1200, 720, { metresPour1000px: 1 })) && V.taillePanneau(5000, 100).l === 1.8 && V.taillePanneau(100, 100).l === 0.35);
v('rafraîchissement : visé ou actif 4 fois par seconde, visible 1 fois, hors du champ 1 fois / 4 s', V.intervalleRaster({ vise: true }) === 250 && V.intervalleRaster({ dansChamp: true }) === 1000 && V.intervalleRaster({}) === 4000);
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
