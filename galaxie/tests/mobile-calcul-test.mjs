// V8 : calculs purs de la coque mobile (core/mobile/mobile-calcul.js). Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/mobile-calcul-test.mjs
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../../core/mobile/mobile-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const T = 1_800_000_000_000;

// navigation
v('5 entrées au plus dans la barre du bas', M.ONGLETS.length === 5 && M.ONGLETS.filter(o => o.central).length === 1 && M.ONGLETS[2].id === 'voix');
// fraîcheur
v('âge : à l’instant', M.age(T - 10e3, T) === "à l'instant");
v('âge : minutes, heures, jours', M.age(T - 5 * 60e3, T) === 'il y a 5 min' && M.age(T - 3 * 3600e3, T) === 'il y a 3 h' && M.age(T - 2 * 86400e3, T) === 'il y a 2 j');
v('âge : date inconnue plutôt qu’un faux chiffre', M.age(undefined, T) === 'date inconnue');
v('mise à jour', M.miseAJour(T - 12 * 60e3, T) === 'mise à jour il y a 12 min');
// retrait progressif
v('retrait progressif plafonné à 5 min', M.delaiReessai(0) === 15000 && M.delaiReessai(2) === 60000 && M.delaiReessai(99) === 300000 && M.delaiReessai(-3) === 15000);
// cache
let d = M.decisionCache({ t: T - 60e3, ttl: 300e3, maintenant: T, enLigne: true }); v('cache frais : montré, pas de rechargement', d.montrer && !d.rafraichir && !d.perime);
d = M.decisionCache({ t: T - 900e3, ttl: 300e3, maintenant: T, enLigne: true }); v('cache ancien : montré tout de suite ET rechargé en arrière-plan', d.montrer && d.rafraichir && d.perime);
d = M.decisionCache({ t: T - 900e3, ttl: 300e3, maintenant: T, enLigne: false }); v('hors ligne : on montre la copie, sans rechargement', d.montrer && !d.rafraichir && d.perime);
d = M.decisionCache({ ttl: 300e3, maintenant: T }); v('pas de cache : rien à montrer (squelette)', !d.montrer && d.rafraichir);
// erreurs
v('503 « en préparation » devient une phrase claire', /préparent/.test(M.messageErreur(new Error('HTTP 503 · actualités en préparation'))) && !/503/.test(M.messageErreur(new Error('HTTP 503 · actualités en préparation'))));
v('limite D1 : phrase claire', /limitée/.test(M.messageErreur(new Error('La liaison Worker est limitée'))));
v('verrouillé : phrase claire', /verrouillée/.test(M.messageErreur(new Error('Worker verrouillé'))));
v('réseau : phrase claire', /réseau/.test(M.messageErreur(new TypeError('Failed to fetch'))));
v('jamais [object Object]', !/object/.test(M.messageErreur({})));
// dégradation automatique
let s = M.suivreImages({ seuil: 40, fenetre: 3000 });
s.echantillon(30, 0); s.echantillon(30, 1500); v('30 i/s pendant 1,5 s : pas encore', s.niveau() === 0);
s.echantillon(30, 3100); v('30 i/s pendant plus de 3 s : niveau 1', s.niveau() === 1);
s.echantillon(30, 6200); v('toujours lent : niveau 2', s.niveau() === 2);
s.echantillon(30, 9300); v('le niveau ne dépasse pas 2', s.niveau() === 2);
s = M.suivreImages({}); s.echantillon(30, 0); s.echantillon(60, 1000); s.echantillon(30, 2000); s.echantillon(30, 3500); v('un retour à 60 i/s remet le compte à zéro', s.niveau() === 0);
v('cadence : 60 normale, 30 en économie, 0 masqué', M.cadenceCible({}) === 60 && M.cadenceCible({ economie: true }) === 30 && M.cadenceCible({ reduit: true }) === 30 && M.cadenceCible({ masque: true, economie: true }) === 0);
// positions
v('statut live : en attente', M.statutLive({ statut: 'en_attente', tValide: T + 1000 }, T).code === 'attente');
v('statut live : ouverte', M.statutLive({ statut: 'ouverte' }, T).code === 'ouverte');
v('statut live : cible / stop', M.statutLive({ statut: 'cloturee', resultat: { R: 2 } }).code === 'cible' && M.statutLive({ statut: 'cloturee', resultat: { R: -1 } }).code === 'stop');
v('statut live : expirée (statut ou validité dépassée)', M.statutLive({ statut: 'expiree' }).code === 'expiree' && M.statutLive({ statut: 'en_attente', tValide: T - 1 }, T).code === 'expiree');
v('sens', M.sensTexte({ sens: 1 }) === 'ACHAT' && M.sensTexte({ sens: -1 }) === 'VENTE');
const niv = M.niveauxPosition({ sens: 1, limite: 100, stop: 98, cible: 104, cible2: null, zone: [101, 99] });
v('niveaux : entrée, stop, cibles filtrées, zone ordonnée', niv.entree === 100 && niv.stop === 98 && niv.cibles.length === 1 && niv.zone[0] === 99 && niv.zone[1] === 101);
v('distance à l’entrée en %', Math.abs(M.distanceEntree({ limite: 99 }, 100) + 1) < 1e-9 && M.distanceEntree({}, 100) === null);
// graphique
const bg = Array.from({ length: 20 }, (_, i) => [T + i * 900e3, 100 + i, 102 + i, 98 + i, 101 + i, 10 + (i % 3)]);
v('VWAP entre le plus bas et le plus haut', (() => { const x = M.vwap(bg); return x > 98 && x < 122; })());
v('VWAP sans volume : null (rien d’inventé)', M.vwap([[1, 1, 2, 0.5, 1.5]]) === null);
const pv = M.profilVolume(bg, 10);
v('profil de volume : POC dans la plage, parts ≤ 1, max = 1', pv && pv.poc >= pv.bas && pv.poc <= pv.haut && pv.cases.every(c => c.part <= 1) && Math.max(...pv.cases.map(c => c.part)) === 1);
v('profil de volume sans volume : null', M.profilVolume([[1, 1, 2, 0.5, 1.5], [2, 1, 2, 0.5, 1.5], [3, 1, 2, 0.5, 1.5]]) === null);
v('delta : null sans volume acheteur', M.deltaBougie([1, 1, 2, 1, 1.5, 10]) === null && M.deltaBougie([1, 1, 2, 1, 1.5, 10, 7]) === 4);
// courbe de capital
const c = M.courbePath([[1, 0], [2, 2], [3, 1], [4, 3]], 300, 100);
v('courbe : tracé, ligne zéro, dernier point, fin', c && /^M/.test(c.d) && c.fin === 3 && c.zero > 0 && c.dernier.length === 2 && /Z$/.test(c.aire));
v('courbe : moins de deux points = rien', M.courbePath([[1, 1]], 300, 100) === null);
// calendrier thermique
const fin = Date.UTC(2026, 9, 29, 12);   // jeudi 29 octobre 2026
const cal = M.calendrierThermique({ '2026-10-28': 2, '2026-10-27': -1 }, { semaines: 4, fin });
v('calendrier : 4 semaines × 7 jours', cal.cases.length === 28 && cal.max === 2);
const c28 = cal.cases.find(x => x.jour === '2026-10-28'), c27 = cal.cases.find(x => x.jour === '2026-10-27');
v('calendrier : intensités (+1 le meilleur jour, −0,5 pour −1)', c28.intensite === 1 && c27.intensite === -0.5 && c28.col === 3);
v('calendrier : jours futurs marqués, jours sans trade à zéro', cal.cases.find(x => x.jour === '2026-10-30').futur === true && cal.cases.find(x => x.jour === '2026-10-26').R === null);
const h = M.hebdoDepuisJours({ '2026-10-20': 1, '2026-10-21': 2, '2026-10-13': -0.5 }, 0.5, { semaines: 3, fin });
v('hebdo : % = R × risque, objectifs +1 % / +2 %', h.length === 3 && h[2].pct === 1.5 && h[2].objectif1 === true && h[2].objectif2 === false && h[1].pct === -0.25, JSON.stringify(h));
// stories
v('stories : suivante / précédente en boucle', M.prochaineCarte(2, 3) === 0 && M.precedenteCarte(0, 3) === 2 && M.prochaineCarte(0, 0) === 0);
v('stories : balayage gauche = suivante, droit = précédente, petit geste = rien', M.carteApresGeste(1, 4, -80) === 2 && M.carteApresGeste(1, 4, 80) === 0 && M.carteApresGeste(1, 4, 10) === 1 && M.carteApresGeste(3, 4, -80) === 3);
// formats
v('formats français', /80/.test(M.prix(80848.64)) && M.prix(NaN) === '—');
v('formats : pourcent et R avec signe', M.pourcent(1.234) === '+1,2 %' && M.pourcent(-0.5) === '−0,5 %' && M.R(0.123) === '+0,12 R' && M.R(NaN) === '—');
v('échappement HTML', M.esc('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
v('nouvelle version : seulement si différente', M.versionPlusRecente('1', '2') && !M.versionPlusRecente('2', '2') && !M.versionPlusRecente('2', null));
// routage des commandes
const r = t => (M.routeCommande(t) || {}).ecran || null;
v('« mode galaxie » / « ouvre la galaxie » : refus poli', r('ouvre la galaxie') === 'galaxie-refus' && r('mode galaxie') === 'galaxie-refus');
v('« donne-moi l’actualité en France » : actus', r('donne-moi l’actualité en France') === 'actus' && r('les infos') === 'actus' && r('affiche les actualités') === 'actus');
v('« affiche le terminal » : terminal', r('affiche le terminal') === 'terminal' && r('ouvre le terminal de trading') === 'terminal');
v('« ouvre l’agent », positions du jour : agent', r('ouvre l’agent') === 'agent' && r('montre-moi les positions du jour') === 'agent' && r('affiche kepler') === 'agent');
v('carte et réglages', r('ouvre la carte') === 'carte' && r('ouvre les réglages') === 'reglages');
v('une phrase ordinaire n’est pas interceptée', r('quelle heure est-il') === null && r('parle-moi de Napoléon') === null);
console.log(`\nCoque mobile : ${ok} vérifications réussies, ${ko} échec(s).`); process.exit(ko ? 1 : 0);
