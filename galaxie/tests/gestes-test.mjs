// Tests du moteur de gestes (phase 11) SANS caméra : suites de repères synthétiques (core/gestes/main-synthetique.js, pas des enregistrements réels) et fichiers JSON rejoués.
// Lancer : node galaxie/tests/gestes-test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const R = createRequire(import.meta.url), C = R('../../core/gestes/gestes-calcul.js'), H = R('../../core/gestes/main-synthetique.js'); R('../../core/commun/telecommande-calcul.js'); const T = globalThis.TeleCalcul;
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const rejouer = (frames, opt) => { const m = C.creerMoteur(opt), msgs = [], ev = []; let etat = null; for (const f of frames) { const s = m.traiter(f); msgs.push(...s.msgs); ev.push(...s.evenements); etat = s.etat; } return { msgs, ev, etat, m }; };
const compter = (l, a) => l.filter(x => x.a === a).length;
const somme = (l, a, k) => l.filter(x => x.a === a).reduce((s, x) => s + (x[k] || 0), 0);
const OPT = { ecran: { l: 1920, h: 1080 } };

// ── géométrie : poses reconnues ──
for (const [pose, attendu] of [['ouverte', 'ouverte'], ['pointer', 'pointer'], ['poing', 'poing']]) {
  const pts = H.creerMain({ pose }).pts.map(p => [p[0] * 4 / 3, p[1], 0]);
  v('pose « ' + pose + ' » reconnue', C.poseBrute(pts, false) === attendu, C.poseBrute(pts, false) + ' ' + JSON.stringify(C.doigtsTendus(pts)));
}
const ptsP = (pince, autres) => H.creerMain({ pose: 'pince', pince, autres }).pts.map(p => [p[0] * 4 / 3, p[1], 0]);
v('pincement : fermé < seuil, ouvert > seuil', C.pincement(ptsP(1, 'ouverts')) < C.DEFAUTS.seuilFerme && C.pincement(ptsP(0, 'ouverts')) > C.DEFAUTS.seuilOuvre, C.pincement(ptsP(1, 'ouverts')).toFixed(2) + ' / ' + C.pincement(ptsP(0, 'ouverts')).toFixed(2));
v('taille de la main indépendante de la distance à la caméra', Math.abs(C.pincement(H.creerMain({ pose: 'pince', taille: 0.1 }).pts.map(p => [p[0] * 4 / 3, p[1], 0])) - C.pincement(H.creerMain({ pose: 'pince', taille: 0.3 }).pts.map(p => [p[0] * 4 / 3, p[1], 0]))) < 0.03);
v('pose indépendante de la rotation de la main', ['ouverte', 'pointer', 'poing'].every(p => [0.4, -0.5, 1.2].every(a => C.poseBrute(H.creerMain({ pose: p, angle: a }).pts.map(q => [q[0] * 4 / 3, q[1], 0]), false) === p)));

// ── pointeur ──
const p1 = rejouer(H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1.2), OPT);
v('index tendu qui se déplace vers la droite : le curseur va à droite (miroir de la caméra) sans clic', p1.msgs.filter(m => m.a === 'pointeur').length > 5 && somme(p1.msgs, 'pointeur', 'dx') < -300 && compter(p1.msgs, 'clic') === 0 && Math.abs(somme(p1.msgs, 'pointeur', 'dy')) < 40, JSON.stringify({ dx: somme(p1.msgs, 'pointeur', 'dx'), dy: somme(p1.msgs, 'pointeur', 'dy') }));
const p1b = rejouer(H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1.2), { ...OPT, miroir: false });
v('sans miroir (caméra du téléphone non inversée) : le sens est inversé', somme(p1b.msgs, 'pointeur', 'dx') > 300);
const p2 = rejouer(H.suites.pointer(0.3, 0.3, 0.3, 0.6, 1), OPT);
v('index qui descend : le curseur descend', somme(p2.msgs, 'pointeur', 'dy') > 200);
v('chaque message est accepté par la liste blanche de la télécommande (même protocole que la tablette)', [...p1.msgs, ...p2.msgs].every(m => T.valider(m) !== null));
const imm = rejouer(H.suites.immobile('pointer', 1.5, { bruit: 0.0015, alea: H.alea(7) }), OPT);
v('main immobile qui tremble (σ = 0,15 % de l’image) : le curseur ne bouge pas (filtre One Euro + zone morte)', Math.abs(somme(imm.msgs, 'pointeur', 'dx')) + Math.abs(somme(imm.msgs, 'pointeur', 'dy')) < 30, JSON.stringify(imm.msgs.slice(0, 2)));
const mvB = rejouer(H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1.2, { bruit: 0.002, alea: H.alea(11) }), OPT);
v('même mouvement avec tremblement : trajet conservé à 15 % près', Math.abs(somme(mvB.msgs, 'pointeur', 'dx') / somme(p1.msgs, 'pointeur', 'dx') - 1) < 0.15, somme(mvB.msgs, 'pointeur', 'dx') + ' vs ' + somme(p1.msgs, 'pointeur', 'dx'));
v('pose « ouverte » ou « poing » : le curseur ne bouge pas', compter(rejouer(H.suites.balayage(0.3, 0.32, 0.3), OPT).msgs, 'pointeur') === 0 && compter(rejouer(H.suites.immobile('poing', 0.5), OPT).msgs, 'pointeur') === 0);

// ── clic, double clic, saisie ──
const c1 = rejouer(H.suites.pincer(0.1), OPT);
v('pincer puis relâcher vite = un clic', compter(c1.msgs, 'clic') === 1 && c1.msgs.find(m => m.a === 'clic').n === 1 && compter(c1.msgs, 'verrou') === 0, JSON.stringify(c1.msgs.map(m => m.a)));
v('le curseur ne dérive pas pendant le clic (le doigt qui se rapproche du pouce)', Math.abs(somme(c1.msgs, 'pointeur', 'dx')) < 60, String(somme(c1.msgs, 'pointeur', 'dx')));
const d1 = rejouer(H.concatener(H.suites.pincer(0.08, {}, 6, 0), H.suites.pincer(0.08, {}, 2, 6)), OPT);
v('deux pincements rapprochés = double clic (le second porte n = 2)', compter(d1.msgs, 'clic') === 2 && d1.msgs.filter(m => m.a === 'clic')[1].n === 2, JSON.stringify(d1.msgs.filter(m => m.a === 'clic')));
const lent = rejouer(H.concatener(H.suites.pincer(0.08), H.suites.immobile('pointer', 1.2), H.suites.pincer(0.08)), OPT);
v('deux clics espacés = deux clics simples', lent.msgs.filter(m => m.a === 'clic').every(m => m.n === 1) && compter(lent.msgs, 'clic') === 2);
const s1 = rejouer(H.suites.saisir(0.5, 0.25, 0.1, 0.7), OPT);
v('pincer et tenir = saisie, puis le déplacement suit la main, puis relâcher libère', compter(s1.msgs, 'verrou') === 1 && compter(s1.msgs, 'lacher') === 1 && compter(s1.msgs, 'clic') === 0 && s1.msgs.findIndex(m => m.a === 'verrou') < s1.msgs.findIndex(m => m.a === 'pointeur') && s1.msgs.at(-1).a === 'lacher', JSON.stringify(s1.msgs.map(m => m.a).filter((x, i, l) => l[i - 1] !== x)));
v('la saisie déplace le curseur dans le bon sens (main vers la droite = curseur vers la gauche, miroir)', somme(s1.msgs, 'pointeur', 'dx') < -250 && somme(s1.msgs, 'pointeur', 'dy') > 60, JSON.stringify({ dx: somme(s1.msgs, 'pointeur', 'dx'), dy: somme(s1.msgs, 'pointeur', 'dy') }));
v('événements pour l’écran d’aide : clic, saisie, lâcher', s1.ev.some(e => e.type === 'saisie') && s1.ev.some(e => e.type === 'lacher') && c1.ev.some(e => e.type === 'clic'));
const perte = rejouer(H.concatener(H.suites.saisir(0.5, 0.0, 0.0, 0.1).slice(0, 26), H.suites.vide(1)), OPT);
v('main qui disparaît en pleine saisie : lâcher automatique (jamais d’objet resté accroché)', compter(perte.msgs, 'verrou') === 1 && compter(perte.msgs, 'lacher') === 1, JSON.stringify(perte.msgs.map(m => m.a)));

// ── deux mains ──
const z1 = rejouer(H.suites.deuxPincesEcart(0.2, 0.55, 1), OPT);
v('deux mains pincées qui s’écartent = zoom positif (agrandir), sans clic ni saisie', somme(z1.msgs, 'zoom', 'delta') > 300 && compter(z1.msgs, 'clic') === 0 && compter(z1.msgs, 'verrou') === 0, String(somme(z1.msgs, 'zoom', 'delta')));
const z2 = rejouer(H.suites.deuxPincesEcart(0.55, 0.2, 1), OPT);
v('deux mains pincées qui se rapprochent = zoom négatif (réduire)', somme(z2.msgs, 'zoom', 'delta') < -300);
const r1 = rejouer(H.suites.deuxOuvertesRotation(0, 0.9, 1), OPT), r2 = rejouer(H.suites.deuxOuvertesRotation(0, -0.9, 1), OPT);
v('deux mains ouvertes qui tournent = pivoter l’objet 3D, dans les deux sens', r1.msgs.some(m => m.a === 'objet' && m.g === 'tourner') && Math.sign(somme(r1.msgs, 'objet', 'dx')) === -Math.sign(somme(r2.msgs, 'objet', 'dx')) && Math.abs(somme(r1.msgs, 'objet', 'dx')) > 0.2, JSON.stringify({ a: somme(r1.msgs, 'objet', 'dx'), b: somme(r2.msgs, 'objet', 'dx') }));
v('deux mains ouvertes immobiles : aucune rotation', compter(rejouer(H.suites.deuxOuvertesRotation(0.2, 0.2, 1), OPT).msgs, 'objet') === 0);
v('messages de rotation et de zoom acceptés par la liste blanche', [...r1.msgs, ...z1.msgs].every(m => T.valider(m) !== null));

// ── balayage, poing, pause ──
const b1 = rejouer(H.suites.balayage(0.25, 0.8, 0.35), OPT), b2 = rejouer(H.suites.balayage(0.8, 0.25, 0.35), OPT);
v('main ouverte qui balaie = faire défiler, un seul balayage, deux sens opposés', compter(b1.msgs, 'defile') === 1 && compter(b2.msgs, 'defile') === 1 && Math.sign(b1.msgs.find(m => m.a === 'defile').dx) === -Math.sign(b2.msgs.find(m => m.a === 'defile').dx) && b1.ev.some(e => e.type === 'balayage'), JSON.stringify([b1.msgs, b2.msgs]));
v('main ouverte lente : pas de balayage', compter(rejouer(H.suites.balayage(0.4, 0.6, 2.0), OPT).msgs, 'defile') === 0);
const f1 = rejouer(H.suites.immobile('poing', 1.2), OPT);
v('poing tenu 650 ms = « ranger », un seul événement', f1.ev.filter(e => e.type === 'ranger').length === 1);
v('poing bref : rien', rejouer(H.suites.immobile('poing', 0.3), OPT).ev.filter(e => e.type === 'ranger').length === 0);
const pa = rejouer(H.concatener(H.suites.deuxPoings(2), H.suites.pincer(0.1), H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1)), OPT);
v('deux poings tenus 1,5 s = gestes en pause : plus aucun message ensuite', pa.ev.some(e => e.type === 'pause' && e.actif) && compter(pa.msgs, 'clic') === 0 && compter(pa.msgs, 'pointeur') === 0, JSON.stringify(pa.ev));
const pa2 = rejouer(H.concatener(H.suites.deuxPoings(2), H.suites.deuxPoings(2), H.suites.pincer(0.1)), OPT);
v('deux poings tenus de nouveau = reprise des gestes', pa2.ev.some(e => e.type === 'pause' && !e.actif) && compter(pa2.msgs, 'clic') === 1);
const mp = C.creerMoteur(OPT); mp.pause(true); let sansEffet = true; for (const f of H.suites.pincer(0.1)) { const s = mp.traiter(f); if (s.msgs.length) sansEffet = false; }
v('mode « gestes désactivés » (pause) : aucune action', sansEffet);

// ── paramètres, calibration, validation ──
const cal = C.calibrerSeuils({ ouvert: Array(20).fill(0).map((_, i) => 0.85 + i * 0.01), ferme: Array(20).fill(0).map((_, i) => 0.1 + i * 0.005) });
v('calibration des seuils depuis les mesures de la personne', cal.ok && cal.seuilFerme > 0.15 && cal.seuilFerme < cal.seuilOuvre && cal.seuilOuvre < 0.7, JSON.stringify(cal));
v('calibration impossible si ouvert ≈ fermé : message clair', !C.calibrerSeuils({ ouvert: Array(10).fill(0.3), ferme: Array(10).fill(0.25) }).ok && /trop proches/.test(C.calibrerSeuils({ ouvert: Array(10).fill(0.3), ferme: Array(10).fill(0.25) }).raison));
v('calibration de la zone : étendue de la main', C.calibrerZone(Array.from({ length: 30 }, (_, i) => [0.2 + i * 0.01, 0.5])).zoneUtile > 0.25 && !C.calibrerZone([[0.5, 0.5]]).ok);
const plusSensible = rejouer(H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1.2), { ...OPT, zoneUtile: 0.3 }), moinsSensible = rejouer(H.suites.pointer(0.3, 0.4, 0.6, 0.4, 1.2), { ...OPT, zoneUtile: 0.9 });
v('zone utile plus petite = curseur plus rapide', Math.abs(somme(plusSensible.msgs, 'pointeur', 'dx')) > Math.abs(somme(moinsSensible.msgs, 'pointeur', 'dx')) * 2);
const good = { a: 'mains', t: 1000, ratio: 1.33, mains: [{ lat: 'Left', pts: H.creerMain({ pose: 'ouverte' }).pts }] };
v('validerMains : message correct accepté et arrondi', (m => m && m.mains.length === 1 && m.mains[0].pts.length === 21 && m.mains[0].pts.every(p => p.length === 3))(C.validerMains(good)));
v('validerMains : refuse trois mains, mauvais nombre de points, texte, valeurs absurdes, champs inconnus ignorés', C.validerMains({ ...good, mains: [good.mains[0], good.mains[0], good.mains[0]] }) === null && C.validerMains({ ...good, mains: [{ lat: 'Left', pts: good.mains[0].pts.slice(0, 20) }] }) === null && C.validerMains({ ...good, mains: [{ lat: 'Left', pts: good.mains[0].pts.map(() => ['a', 'b']) }] }) === null && C.validerMains({ ...good, mains: [{ lat: 'Milieu', pts: good.mains[0].pts }] }) === null && C.validerMains({ a: 'clic', n: 1 }) === null && C.validerMains(null) === null && C.validerMains({ ...good, t: NaN }) === null);
v('validerMains : coordonnées bornées', (m => m.mains[0].pts.every(p => p[0] >= -1 && p[0] <= 2))(C.validerMains({ ...good, mains: [{ lat: 'Left', pts: good.mains[0].pts.map(() => [999, -999, 0]) }] })));
v('validerMains n’ajoute aucune action de pilotage : une action de la télécommande n’est pas un message « mains »', C.validerMains({ a: 'commande', id: 'terre' }) === null);

// ── fichiers de repères enregistrés (rejeu) ──
const dossier = new URL('../../tests-navigateur/fixtures-gestes/', import.meta.url);
if (fs.existsSync(new URL('clic.json', dossier))) {
  for (const [fichier, test] of [['clic.json', r => compter(r.msgs, 'clic') === 1], ['saisie.json', r => compter(r.msgs, 'verrou') === 1 && compter(r.msgs, 'lacher') === 1], ['zoom-deux-mains.json', r => somme(r.msgs, 'zoom', 'delta') > 200], ['balayage.json', r => compter(r.msgs, 'defile') === 1], ['rotation-deux-mains.json', r => compter(r.msgs, 'objet') > 3], ['tremblement.json', r => compter(r.msgs, 'clic') === 0 && Math.abs(somme(r.msgs, 'pointeur', 'dx')) < 40]]) {
    const j = JSON.parse(fs.readFileSync(new URL(fichier, dossier), 'utf8')); v('fichier rejoué « ' + fichier + ' » (' + j.frames.length + ' images, ' + j.origine + ')', test(rejouer(j.frames, OPT)));
  }
} else console.log('(fichiers de rejeu absents : node tests-navigateur/fixtures-gestes/fabriquer.mjs)');
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
