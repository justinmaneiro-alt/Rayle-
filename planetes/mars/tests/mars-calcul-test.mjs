import * as M from '../pc/mars-calcul.js';
let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// Position : aller-retour longitude/latitude, repère local
for (const [lon, lat] of [[77.5, 18.4], [-120, -35], [0, 0], [179, 60], [-179.5, -80]]) {
  const r = M.lonLatDeDir(M.dirDeLonLat(lon, lat));
  v('aller-retour ' + lon + '/' + lat, proche(r.lat, lat, 1e-6) && proche(((r.lon - lon + 540) % 360) - 180, 0, 1e-6), JSON.stringify(r));
}
const b = M.baseLocale(M.BASE.lon, M.BASE.lat);
v('base locale : vecteurs unitaires et orthogonaux', proche(M.norme(b.est), 1) && proche(M.norme(b.nord), 1) && proche(M.norme(b.haut), 1) && proche(M.scal(b.est, b.nord), 0) && proche(M.scal(b.est, b.haut), 0) && proche(M.scal(b.nord, b.haut), 0));
v('est × nord = haut (repère direct)', M.norme(M.ajouter(M.vect(b.est, b.nord), M.mul(b.haut, -1))) < 1e-9);
v('le nord pointe vers le pôle nord (+y)', b.nord[1] > 0.9, JSON.stringify(b.nord));
const bEst = M.dirDeLonLat(M.BASE.lon + 0.1, M.BASE.lat);
v('l’est est bien le sens des longitudes croissantes', M.scal(M.ajouter(bEst, M.mul(b.haut, -1)), b.est) > 0);
v('texture : longitude -180 → bord gauche (u = 0)', proche(M.dirDeLonLat(-180, 0)[0], -1, 1e-9));

// Soleil
const midi = M.soleilLocal(12), matin = M.soleilLocal(6), soir = M.soleilLocal(18), minuit = M.soleilLocal(0);
v('soleil à midi : haut dans le ciel', midi.elev > 75, midi.elev);
v('soleil à midi : au sud (hémisphère nord, déclinaison < latitude)', midi.azim > 135 && midi.azim < 225, midi.azim);
v('le soleil se lève à l’est et se couche à l’ouest', matin.azim < 120 && soir.azim > 240, matin.azim + ' / ' + soir.azim);
v('minuit : soleil sous l’horizon', minuit.elev < -40, minuit.elev);
v('composantes du soleil : vecteur unitaire', proche(Math.hypot(soir.e, soir.n, soir.u), 1, 1e-9));
const dep = M.soleilLocal(M.HEURE_DEPART);
v('heure de départ : soleil bas mais levé (lumières visibles, ciel doré)', dep.elev > 3 && dep.elev < 20, dep.elev);
v('nuit() : 0 de jour, 1 la nuit, croissante au coucher', M.nuit(60) === 0 && M.nuit(-20) === 1 && M.nuit(-2) > M.nuit(2));
v('jour() : 1 de jour, 0 la nuit', M.jour(60) === 1 && M.jour(-20) === 0);

// Terre dans le ciel : visible le soir (après le coucher du soleil), pas toujours
let visible = 0;
for (let h = 0; h < 24; h += 0.25) { const t = M.objetCeleste(h, M.BASE.lat, M.TERRE_CIEL.angleHoraire, M.TERRE_CIEL.declinaison); const s = M.soleilLocal(h); if (t.elev > 5 && s.elev < -2) visible++; }
v('la Terre est visible un moment après le coucher du soleil', visible > 4, visible + ' quarts d’heure');

// Phobos : se lève à l’ouest, se couche à l’est, petit
let leve = null, couche = null, prec = M.lune(M.PHOBOS, 0, M.BASE.lon, M.BASE.lat), maxDiam = 0, enHaut = 0;
for (let t = 0.02; t < 80; t += 0.02) {
  const p = M.lune(M.PHOBOS, t, M.BASE.lon, M.BASE.lat); maxDiam = Math.max(maxDiam, p.diametreRealDeg); if (p.elev > 0) enHaut++;
  if (prec.elev < 0 && p.elev >= 0 && !leve) leve = p;
  if (prec.elev > 0 && p.elev <= 0 && leve && !couche) couche = p;
  prec = p;
}
v('Phobos se lève à l’ouest', leve && leve.azim > 200, leve && leve.azim);
v('Phobos se couche à l’est', couche && couche.azim < 160, couche && couche.azim);
v('Phobos est visible une partie du temps (pas tout le temps)', enHaut > 600 && enHaut < 3500, enHaut + ' / 4000');
v('Phobos : diamètre réel entre 0,1° et 0,3°', maxDiam < 0.3 && maxDiam > 0.1, maxDiam);
const p3 = M.lune(M.PHOBOS, 3, 0, 0);
v('Phobos : diamètre affiché = ×6 environ', proche(p3.diametreAffichageDeg / p3.diametreRealDeg, 6, 0.05));

// Entrée / sortie (hystérésis)
const S = M.SEUILS;
v('hystérésis : on ressort plus haut qu’on entre', S.SORTIE_BASE_DIST > S.ENTREE_DIST + 10);
v('sortie de la galaxie plus haut que l’arrivée', S.SORTIE_GALAXIE > S.ORBITE_DEPART + M.R);
const base = { distCentre: S.ENTREE_DIST - 1, angleBase: 5, molettePositive: true, maintenant: 10000, bloqueJusqua: 0 };
v('entrée par zoom : proche, face à la base, molette en avant', M.peutEntrer(base));
v('pas d’entrée sans molette', !M.peutEntrer({ ...base, molettePositive: false }));
v('pas d’entrée trop loin', !M.peutEntrer({ ...base, distCentre: S.ENTREE_DIST + 2 }));
v('pas d’entrée si la base est de côté', !M.peutEntrer({ ...base, angleBase: 30 }));
v('pas d’entrée pendant le blocage', !M.peutEntrer({ ...base, bloqueJusqua: 20000 }));
v('assistance : nulle loin', M.forceAssist(S.ASSIST_DIST + 1, 5) === 0);
v('assistance : nulle si la base est hors champ', M.forceAssist(S.ENTREE_DIST + 5, 60) === 0);
v('assistance : positive près et face à la base', M.forceAssist(S.ENTREE_DIST + 8, 10) > 0.2);
v('assistance : plus forte quand on est plus près', M.forceAssist(S.ENTREE_DIST + 2, 10) > M.forceAssist(S.ENTREE_DIST + 40, 10));
let c = 0, sortie = false;
for (let i = 0; i < 20 && !sortie; i++) { const r = M.pousser(c, 10, 150); c = r.cumul; sortie = r.sortir; }
v('pousser : il faut insister pour sortir', sortie && c === 0);
v('pousser : molette en avant remet à zéro', M.pousser(100, -5, 150).cumul === 0);

// Qualité
v('profil haute > moyenne > basse > jeu', M.profil('haute').rochers > M.profil('moyenne').rochers && M.profil('moyenne').rochers > M.profil('basse').rochers && M.profil('basse').rochers > M.profil('basse', true).rochers);
v('profil : ombres seulement en haute', M.profil('haute').ombres > 0 && M.profil('moyenne').ombres === 0 && M.profil('basse').ombres === 0 && M.profil('haute', true).ombres === 0);

// Terrain et bruit
v('bruit reproductible', M.fbm2(3.2, 4.1, 5, 7) === M.fbm2(3.2, 4.1, 5, 7));
v('bruit dans [0,1]', (() => { for (let i = 0; i < 500; i++) { const x = M.fbm2(i * 0.37, i * 0.91, 5, 1); if (x < 0 || x > 1) return false; } return true; })());
v('alea reproductible', M.alea(5)() === M.alea(5)() && M.alea(5)() !== M.alea(6)());
let pente = 0;
for (let a = 0; a < 360; a += 30) pente = Math.max(pente, Math.abs(M.altitudeSol(Math.cos(a * Math.PI / 180) * 18, Math.sin(a * Math.PI / 180) * 18)));
v('la plateforme de la base est plane (< 0,5 m à 18 m)', pente < 0.5, pente);
v('le relief lointain monte (crête de cratère)', M.altitudeSol(6000, 0) > 50, M.altitudeSol(6000, 0));

// Fenêtres holographiques
const f = M.dispositionFenetres(6);
v('6 fenêtres disposées', f.length === 6);
v('fenêtres : positions toutes différentes et au-dessus de la table', new Set(f.map(x => x.position.join())).size === 6 && f.every(x => x.position[1] > 1.1 && x.position[1] < 2.2));
v('fenêtres : autour de la table, à moins de 2,7 m', f.every(x => Math.hypot(x.position[0], x.position[2] + 0.6) < 2.7));
// 13 fenêtres : trois rangées 4 / 4 / 5, sans chevauchement
{
  const g = M.dispositionFenetres(13), rangs = [0, 1, 2].map(r => g.filter(x => x.rangee === r).length);
  v('13 fenêtres : trois rangées 4 / 4 / 5', g.length === 13 && rangs.join() === '4,4,5', rangs.join());
  let chevauche = false; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const a = g[i], b = g[j], dh = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]), dv = Math.abs(a.position[1] - b.position[1]); if (dv < a.hauteurFenetre * 0.98 && dh < a.largeur * 0.96) chevauche = true; }
  v('13 fenêtres : aucun chevauchement (rangées séparées d’au moins la hauteur d’une fenêtre, ou fenêtres séparées de leur largeur)', !chevauche);
  v('13 fenêtres : toutes entre 0,9 m et 3 m de haut, autour de la table à moins de 2,9 m', g.every(x => x.position[1] > 0.9 && x.position[1] < 2.9 && Math.hypot(x.position[0], x.position[2] + 0.6) < 2.9));
}
// 21 fenêtres (M6) : quatre rangées 5 / 5 / 5 / 6, sans chevauchement, sous le plafond de 3,5 m
{
  const g = M.dispositionFenetres(21), rangs = [0, 1, 2, 3].map(r => g.filter(x => x.rangee === r).length);
  v('21 fenêtres : quatre rangées 5 / 5 / 5 / 6', g.length === 21 && rangs.join() === '5,5,5,6', rangs.join());
  let chevauche = false; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const a = g[i], b = g[j], dh = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]), dv = Math.abs(a.position[1] - b.position[1]); if (dv < a.hauteurFenetre * 0.98 && dh < a.largeur * 0.96) chevauche = true; }
  v('21 fenêtres : aucun chevauchement', !chevauche);
  v('21 fenêtres : toutes sous le plafond (haut de fenêtre < 3,45 m) et à moins de 2,9 m de la table', g.every(x => x.position[1] + x.hauteurFenetre / 2 < 3.45 && x.position[1] > 0.9 && Math.hypot(x.position[0], x.position[2] + 0.6) < 2.9));
  v('13 fenêtres : disposition inchangée (4 / 4 / 5)', [0, 1, 2].map(r => M.dispositionFenetres(13).filter(x => x.rangee === r).length).join() === '4,4,5');
}
v('zone : x < 0 = bureau, sinon terminal', M.zoneDePosition(-1) === 'bureau' && M.zoneDePosition(2) === 'terminal');
v('bureau : « bientôt »', M.ZONES_BASE.bureau.etat === 'bientot' && /bientôt/.test(M.ZONES_BASE.bureau.message) && M.ZONES_BASE.terminal.etat === 'actif');
console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
