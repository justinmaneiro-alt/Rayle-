// Tests de la mini-carte du pad (V2 phase 4) : liste blanche des nouvelles actions, nettoyage de la carte, géométrie, lisseur 30 messages/s.  Lancer : node galaxie/tests/carte-pad-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = undefined;
require('../../core/commun/telecommande-calcul.js');
const T = globalThis.TeleCalcul;
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// ── liste blanche ──
v('fenetre_deplace valide', JSON.stringify(T.valider({ a: 'fenetre_deplace', id: 'p-cot', dx: 0.1, dy: -0.05 })) === '{"a":"fenetre_deplace","id":"p-cot","dx":0.1,"dy":-0.05}');
v('fenetre_deplace : identifiant avec espace refusé', T.valider({ a: 'fenetre_deplace', id: 'p cot', dx: 0, dy: 0 }) === null);
v('fenetre_deplace : identifiant vide / trop long / script refusé', T.valider({ a: 'fenetre_deplace', id: '', dx: 0, dy: 0 }) === null && T.valider({ a: 'fenetre_deplace', id: 'a'.repeat(61), dx: 0, dy: 0 }) === null && T.valider({ a: 'fenetre_deplace', id: '<script>', dx: 0, dy: 0 }) === null);
v('fenetre_deplace : déplacement borné à ±1 écran', T.valider({ a: 'fenetre_deplace', id: 'x', dx: 5, dy: 0 }).dx === 1);
v('fenetre_deplace : NaN refusé', T.valider({ a: 'fenetre_deplace', id: 'x', dx: NaN, dy: 0 }) === null && T.valider({ a: 'fenetre_deplace', id: 'x', dx: 'a', dy: 0 }) === null);
v('fenetre_taille : échelle bornée 0,5…2', T.valider({ a: 'fenetre_taille', id: 'x', ech: 9 }).ech === 2 && T.valider({ a: 'fenetre_taille', id: 'x', ech: 0.1 }).ech === 0.5 && T.valider({ a: 'fenetre_taille', id: 'x', ech: -1 }) === null);
v('fenetre_act : focus / ranger / fermer / reduire / agrandir', ['focus', 'ranger', 'fermer', 'reduire', 'agrandir'].every(a => T.valider({ a: 'fenetre_act', id: 'x', act: a })));
v('fenetre_act : action inconnue refusée', T.valider({ a: 'fenetre_act', id: 'x', act: 'supprimer_disque' }) === null);
v('objet : tourner / pan / zoom / choisir / fin', ['tourner', 'pan', 'zoom', 'choisir', 'fin'].every(g => T.valider({ a: 'objet', g, dx: 0.1, dy: 0.1, delta: 5 })));
v('objet : geste inconnu refusé', T.valider({ a: 'objet', g: 'exploser' }) === null);
v('objet : identifiant facultatif', T.valider({ a: 'objet', g: 'zoom', delta: 10 }) !== null && T.valider({ a: 'objet', id: 'mars', g: 'zoom', delta: 10 }).id === 'mars');
v('modes carte et pad3d acceptés, mode inconnu refusé', T.valider({ a: 'mode', m: 'carte' }) && T.valider({ a: 'mode', m: 'pad3d' }) && T.valider({ a: 'mode', m: 'xx' }) === null);
v('anciennes actions inchangées', T.valider({ a: 'pointeur', dx: 3, dy: 4 }) && T.valider({ a: 'clic', n: 1 }) && T.valider({ a: 'rm -rf' }) === null);

// ── nettoyage de la carte (le serveur relaie seulement ce qui passe ici) ──
const brut = { ecran: { l: 1920, h: 1080 }, fenetres: [{ id: 'w-heure', titre: 'Heure<script>alert(1)</script>', x: 0.1, y: 0.2, l: 0.3, h: 0.25, actif: true }, { id: 'bad id', x: 0, y: 0, l: 1, h: 1 }, { id: 'sans-taille', x: 0, y: 0, l: 0, h: 0 }, { id: 'nan', x: NaN, y: 0, l: 1, h: 1 }], objets: [{ id: 'scene', nom: 'Scène 3D', actif: true }, { id: 'x y', nom: 'refusé' }] };
const c = T.normaliserCarte(brut);
v('carte : 1 fenêtre valide seulement', c.fenetres.length === 1 && c.fenetres[0].id === 'w-heure', JSON.stringify(c.fenetres));
v('carte : balises < > retirées du titre', !/[<>]/.test(c.fenetres[0].titre), c.fenetres[0].titre);
v('carte : 1 objet valide', c.objets.length === 1 && c.objets[0].actif === true);
v('carte : écran conservé', c.ecran.l === 1920 && c.ecran.h === 1080);
v('carte : entrée invalide → carte vide', T.normaliserCarte(null).fenetres.length === 0 && T.normaliserCarte('x').objets.length === 0 && T.normaliserCarte({ fenetres: 'oui' }).fenetres.length === 0);
v('carte : plafond de 40 fenêtres et 16 objets', T.normaliserCarte({ fenetres: Array.from({ length: 100 }, (_, i) => ({ id: 'f' + i, x: 0, y: 0, l: 0.1, h: 0.1 })), objets: Array.from({ length: 50 }, (_, i) => ({ id: 'o' + i })) }).fenetres.length === 40 && T.normaliserCarte({ objets: Array.from({ length: 50 }, (_, i) => ({ id: 'o' + i })) }).objets.length === 16);

// ── géométrie ──
const boite = T.boiteDansZone({ x: 0, y: 0, l: 800, h: 600 }, { l: 1920, h: 1080 });
v('boîte : rapport 16/9 conservé et centré', Math.abs(boite.l / boite.h - 16 / 9) < 1e-9 && boite.l === 800 && Math.abs(boite.y - (600 - 450) / 2) < 1e-9, JSON.stringify(boite));
const boite2 = T.boiteDansZone({ x: 0, y: 0, l: 400, h: 800 }, { l: 1920, h: 1080 }); v('boîte : zone en hauteur', boite2.l === 400 && boite2.h < 800);
const r = T.versBoite({ x: 0.5, y: 0.5, l: 0.25, h: 0.25 }, boite); v('versBoite : un quart de l’écran', Math.abs(r.l - 200) < 1e-9 && Math.abs(r.x - (boite.x + 400)) < 1e-9);
const d = T.deplacementNorm(80, 45, boite); v('glisser de 80 px dans une boîte de 800 = 10 % de l’écran du PC', Math.abs(d.dx - 0.1) < 1e-9 && Math.abs(d.dy - 0.1) < 1e-9, JSON.stringify(d));
v('boîte de taille nulle : pas de division par zéro', T.deplacementNorm(10, 10, { l: 0, h: 0 }).dx === 0);

// ── lisseur : au plus 30 messages par seconde ──
let t = 0; const envoyes = []; const l = T.creerLisseur(m => envoyes.push(m), 33, () => t);
for (t = 0; t < 1000; t += 4) l.ajouter({ dx: 0.001, dy: 0.002 });   // un doigt qui envoie un événement toutes les 4 ms (250/s)
l.vider();
v('lisseur : ≤ 31 messages pour 1 s de glissé à 250 événements/s', envoyes.length <= 31 && envoyes.length >= 25, String(envoyes.length));
v('lisseur : aucun déplacement perdu (somme conservée)', Math.abs(envoyes.reduce((s, m) => s + m.dx, 0) - 0.25) < 1e-9 && Math.abs(envoyes.reduce((s, m) => s + m.dy, 0) - 0.5) < 1e-9);
const e2 = []; const l2 = T.creerLisseur(m => e2.push(m), 33, () => 0); l2.ajouter({ ech: 1.1 }); l2.ajouter({ ech: 1.1 }); l2.vider(); v('lisseur : les échelles se multiplient', e2.length === 1 && Math.abs(e2[0].ech - 1.21) < 1e-9, JSON.stringify(e2));
const e3 = []; const l3 = T.creerLisseur(m => e3.push(m), 33, () => 0); l3.vider(); v('lisseur : rien à envoyer = aucun message', e3.length === 0);
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
