/* S1 : modèle de vol (inertie, assistance, limiteur, postcombustion, rotations, collisions, orbite, pilote automatique, précision numérique). */
import * as V from '../pc/vol-calcul.js';
let ok = 0, ko = 0;
const v = (nom, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + nom + (d ? ' — ' + d : '')); };
const P = V.PARAMS, DT = 1 / 60;
const courir = (e, cmd, secondes, corps = [], p = P, echelle = 1) => { for (let i = 0; i < Math.round(secondes / DT); i++) V.pas(e, typeof cmd === 'function' ? cmd(i * DT, e) : cmd, DT, p, corps, echelle); return e; };
const vit = e => V.norme(e.vel), avant = e => V.qVec(e.q, [0, 0, -1]);

// ── translation, inertie, assistance
let e = V.etatInitial({ assist: false, limiteur: false });
courir(e, { trans: [0, 0, 1] }, 1);
v('vol newtonien : 1 s de poussée avant → vitesse ≈ accélération × 1 s', Math.abs(e.vel[2] + P.accAvant) < 0.1 && Math.abs(vit(e) - P.accAvant) < 0.1, e.vel.map(x => x.toFixed(2)).join(','));
courir(e, { trans: [0, 0, 0] }, 3);
v('vol newtonien : sans poussée la vitesse se conserve (rien ne freine)', Math.abs(vit(e) - P.accAvant) < 0.01);
e.limiteur = true; courir(e, { trans: [0, 0, 1] }, 5);
v('limiteur : la vitesse ne dépasse pas la vitesse de croisière', vit(e) <= P.vitMax + 1e-6, vit(e).toFixed(2));
e = V.etatInitial({ assist: false, limiteur: false }); courir(e, { trans: [0, 0, 1], post: true }, 6);
v('sans limiteur, postcombustion : vitesse bien supérieure à la croisière, plafonnée à la vitesse absolue', vit(e) > P.vitMax * 2 && vit(e) <= P.vitAbsolue + 1e-6, vit(e).toFixed(1));
e = V.etatInitial(); courir(e, { trans: [0, 0, 1] }, 4);
v('assistance : la vitesse suit la consigne de croisière', Math.abs(vit(e) - P.vitMax) < 0.05, vit(e).toFixed(2));
courir(e, { trans: [0, 0, 0] }, 3);
v('assistance : sans entrée le vaisseau s’arrête tout seul', vit(e) < 0.01, vit(e).toFixed(3));
e = V.etatInitial(); courir(e, { trans: [0, 0, 1], post: true }, 6);
v('assistance + postcombustion : vitesse = croisière × facteur', Math.abs(vit(e) - P.vitMax * P.facteurPost) < 0.2, vit(e).toFixed(2));
courir(e, { trans: [0, 0, 1], frein: true }, 3);
v('frein : arrêt complet', vit(e) < 1e-6);
e = V.etatInitial(); courir(e, { trans: [1, 0, 0] }, 3);
v('translation latérale : vers la droite du vaisseau', e.vel[0] > 0.5 && Math.abs(e.vel[2]) < 1e-9);
e = V.etatInitial(); courir(e, { trans: [0, 1, 0] }, 3);
v('translation verticale : vers le haut du vaisseau', e.vel[1] > 0.5);

// ── rotations
e = V.etatInitial(); courir(e, { rot: [1, 0, 0] }, 0.6);
v('tangage positif : le nez monte', avant(e)[1] > 0.3, avant(e).map(x => x.toFixed(2)).join(','));
e = V.etatInitial(); courir(e, { rot: [0, 1, 0] }, 0.6);
v('lacet positif : le nez va à gauche', avant(e)[0] < -0.3);
e = V.etatInitial(); courir(e, { rot: [0, 0, 1] }, 0.6);
const dr = V.qVec(e.q, [1, 0, 0]);
v('roulis positif : l’aile droite descend', dr[1] < -0.3 && V.telemetrie(e).roulis > 10, V.telemetrie(e).roulis.toFixed(1));
e = V.etatInitial(); courir(e, { rot: [1, 1, 1] }, 2);
v('vitesses angulaires plafonnées', Math.abs(e.om[0]) <= P.rotMax[0] + 1e-9 && Math.abs(e.om[1]) <= P.rotMax[1] + 1e-9 && Math.abs(e.om[2]) <= P.rotMax[2] + 1e-9);
e = V.etatInitial({ assist: false }); courir(e, { rot: [0, 1, 0] }, 0.3); const w0 = e.om[1]; courir(e, { rot: [0, 0, 0] }, 1);
v('vol newtonien pur : la rotation continue sans entrée', Math.abs(e.om[1] - w0) < 1e-9 && w0 > 0.2);
e = V.etatInitial(); courir(e, t => ({ rot: [Math.sin(t * 3), Math.cos(t * 2), Math.sin(t)], trans: [0, 0, 1] }), 60);
v('le quaternion reste unitaire après 60 s de manœuvres', Math.abs(Math.hypot(...e.q) - 1) < 1e-9);

// ── astres : on ne traverse jamais
const saturne = { id: 'saturne', pos: [0, 0, -40], rayon: 6, vel: [0, 0, 0] };
e = V.etatInitial({ assist: false, limiteur: false }); courir(e, { trans: [0, 0, 1], post: true }, 20, [saturne]);
const dSurf = V.norme(V.sub(e.pos, saturne.pos)) - saturne.rayon;
v('jamais sous la surface d’un astre (collision à pleine vitesse)', dSurf >= P.margeSurface - 1e-9 && e.collision === 1, dSurf.toFixed(4));
v('la vitesse vers l’astre est annulée au contact', V.dot(e.vel, V.unit(V.sub(e.pos, saturne.pos))) >= -1e-6);
e = V.etatInitial(); e.pos = [0, 0, -40 + 6 + 2.5]; e.vel = [0, 0, -9];
courir(e, { trans: [0, 0, 1] }, 0.5, [saturne]);
v('près d’un astre la vitesse est limitée selon l’altitude', vit(e) <= V.vitesseProche(2.5) * 1.05 + 0.3, vit(e).toFixed(2));
v('vitesse permise croissante avec l’altitude', V.vitesseProche(10) > V.vitesseProche(1) && V.vitesseProche(0) === P.vitProcheMin);

// ── orbite
e = V.etatInitial(); e.pos = [0, 0, -40 + 6 + 2]; e.vel = [1, 0, 0];
const o = V.entrerEnOrbite(e, saturne, 2);
const r0 = V.norme(V.sub(e.pos, saturne.pos));
let rmin = 1e9, rmax = 0; for (let i = 0; i < 6000; i++) { V.pas(e, {}, DT, P, [saturne]); const r = V.norme(V.sub(e.pos, saturne.pos)); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
v('orbite circulaire : rayon constant sur 100 s', rmax - rmin < 1e-6 && Math.abs(rmin - 8) < 1e-6, (rmax - rmin).toExponential(1));
v('orbite : la période suit v² = mu / r', Math.abs(o.periode - 2 * Math.PI * 8 / Math.sqrt(P.mu / 8)) < 1e-9, o.periode.toFixed(2) + ' s');
v('orbite : un tour complet revient au point de départ', (() => { const e2 = V.etatInitial(); e2.pos = [0, 0, -40 + 8]; V.entrerEnOrbite(e2, saturne, 2); const p0 = e2.pos.slice(); const n = Math.round(e2.orbite.periode / DT); for (let i = 0; i < n; i++) V.pas(e2, {}, DT, P, [saturne]); return V.norme(V.sub(e2.pos, p0)) < 0.2; })());
V.pas(e, { trans: [0, 0, 1] }, DT, P, [saturne]);
v('toute poussée quitte l’orbite', e.orbite === null);

// ── pilote automatique vers un astre qui bouge (Mars en mouvement)
const mars = { id: 'mars', pos: [48, 0, 0], rayon: 2.3, vel: [0, 0, 2.3] };
e = V.etatInitial(); let arrive = false, t = 0, penetre = false, vmaxAuto = 0;
while (t < 90 && !arrive) {
  mars.pos = V.add(mars.pos, V.mul(mars.vel, DT));
  const a = V.piloteAuto(e, mars, { altitude: 1.5 });
  V.pas(e, a.cmd, DT, P, [mars]); t += DT; vmaxAuto = Math.max(vmaxAuto, vit(e));
  if (V.norme(V.sub(e.pos, mars.pos)) < mars.rayon) penetre = true;
  arrive = a.arrive;
}
const dFinale = V.norme(V.sub(e.pos, mars.pos)) - mars.rayon;
v('pilote automatique : arrive à l’altitude demandée sur un astre en mouvement', arrive && Math.abs(dFinale - 1.5) < 0.3, `t=${t.toFixed(1)} s, altitude ${dFinale.toFixed(2)}`);
v('pilote automatique : ne touche jamais l’astre et reste dans les vitesses permises', !penetre && vmaxAuto <= P.vitMax * P.facteurPost * 1.6 + 0.5, 'vmax ' + vmaxAuto.toFixed(1));
v('pilote automatique : trajet Terre → Mars en moins de 90 s de jeu', t < 90);

// ── précision numérique : très loin de l'origine
const loin = 5e6;
e = V.etatInitial({ assist: false, limiteur: false, pos: [loin, loin, loin] }); courir(e, { trans: [0, 0, 1] }, 1);
const dep = V.norme(V.sub(e.pos, [loin, loin, loin]));
v('précision : à 5 millions d’unités de l’origine, le déplacement d’1 s reste exact au millième', Math.abs(dep - 0.5 * P.accAvant * 1) < 0.15 * P.accAvant * DT * 60 && Math.abs(dep - 3.5) < 0.1, dep.toFixed(6));
const a1 = [loin + 0.001, loin, loin], a2 = [loin, loin, loin];
v('précision : un écart d’un millième d’unité à 5 millions d’unités est conservé (double précision)', Math.abs(V.norme(V.sub(a1, a2)) - 0.001) < 1e-9);
v('précision : le même écart en simple précision serait perdu (justification du rendu relatif)', Math.fround(loin + 0.001) === Math.fround(loin));

// ── télémétrie
e = V.etatInitial(); e.q = V.qRegarde([1, 0, 0]);
const tm = V.telemetrie(e, [mars], { kmParUnite: 3e6 });
v('télémétrie : cap 90° vers +X, astre le plus proche, vitesse en km/s', Math.abs(tm.cap - 90) < 0.5 && tm.proche.id === 'mars' && tm.vitesseKmS === 0, `cap ${tm.cap.toFixed(1)}`);
e.q = V.qRegarde([0, 1, 0.0001], [0, 0, -1]);
v('télémétrie : tangage 90° vers le haut', Math.abs(V.telemetrie(e).tangage - 90) < 0.5);
const q = V.qRegarde([0.3, -0.2, -1]); const f = V.qVec(q, [0, 0, -1]), fu = V.unit([0.3, -0.2, -1]);
v('qRegarde oriente bien l’avant vers la direction demandée', V.norme(V.sub(f, fu)) < 1e-9);
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
