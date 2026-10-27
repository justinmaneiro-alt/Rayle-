// Tests de l'entité partagée (états, shaders, données). Lancer :  node galaxie/tests/etats-reseau-test.mjs
import fs from 'node:fs';
import { ETATS, CLES, CASCADES, creerEtat, srgbVersLineaire, ampSimulee } from '../../skins/neurone/etats-reseau.js';
import * as SH from '../../skins/neurone/shaders-reseau.js';
import { preparerDonnees } from '../../skins/neurone/donnees-reseau.js';
import { genererReseau } from '../reseau.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { cond ? ok++ : ko++; if (!cond) console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); };
const alea = (graine => () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; })(42);

// États : mêmes noms qu'à l'origine, couleurs dans [0,1]
for (const n of ['idle', 'veille', 'listening', 'thinking', 'speaking', 'alerte', 'deverrouille', 'verrouille']) v('état ' + n, !!ETATS[n]);
v('idle : cyan et blanc', ETATS.idle.c[2] > 0.9 && ETATS.idle.c[1] > 0.7 && ETATS.idle.c[0] < 0.4 && ETATS.idle.d.every(x => x > 0.8));
v('réflexion, parole, alerte gardent les couleurs d\'origine', ETATS.thinking.c[0] === 0.78 && ETATS.speaking.c[0] === 1.0 && ETATS.alerte.c[1] === 0.40);
v('toutes les valeurs sont définies', Object.values(ETATS).every(e => CLES.every(k => Number.isFinite(e[k])) && e.c.length === 3 && e.d.length === 3 && e.flash > 0));
v('sRGB → linéaire', Math.abs(srgbVersLineaire(1) - 1) < 1e-6 && srgbVersLineaire(0) === 0 && Math.abs(srgbVersLineaire(0.5) - 0.2140) < 1e-3);
v('amplitude simulée : nulle au repos, vive en parole', ampSimulee('idle', 3) === 0 && ampSimulee('speaking', 3) > 0.1);

// Machine : transition douce, flashs, amplitude réelle
const m = creerEtat(12, alea);
v('départ en idle', m.nomEtat === 'idle' && Math.abs(m.v.c[1] - 0.78) < 1e-9);
m.etat('speaking'); let t = 0; for (let i = 0; i < 20; i++) { t += 0.016; m.maj(t, 0.016); }
v('transition progressive (pas de saut)', m.v.c[0] > 0.28 && m.v.c[0] < 0.9, m.v.c[0].toFixed(2));
for (let i = 0; i < 400; i++) { t += 0.016; m.maj(t, 0.016); }
v('converge vers l\'état parole', Math.abs(m.v.c[0] - 1.0) < 0.02 && Math.abs(m.v.c[1] - 0.25) < 0.02);
let flashMax = 0; for (let i = 0; i < 3000; i++) { t += 0.016; m.maj(t, 0.016); flashMax = Math.max(flashMax, m.v.flash); }
v('des flashs blancs se produisent', flashMax > 0.8, flashMax.toFixed(2));
const m2 = creerEtat(12, alea); m2.riche(false); let f2 = 0; for (let i = 0; i < 3000; i++) { m2.maj(i * 0.016, 0.016); f2 = Math.max(f2, m2.v.flash); }
v('pas de flash en mode non riche', f2 === 0 && m2.v.impulsions === 0);
const m3 = creerEtat(12, alea); m3.amplitude(() => 0.8); for (let i = 0; i < 100; i++) m3.maj(i * 0.016, 0.016);
v('l\'amplitude réelle fait réagir', m3.v.amp > 0.7, m3.v.amp.toFixed(2));
m3.amplitude(() => { throw new Error('x'); }); m3.maj(5, 0.016); v('une amplitude qui plante ne casse rien', Number.isFinite(m3.v.amp));
const m4 = creerEtat(12, alea); m4.etat('alerte'); m4.fixer(); v('fixer saute à l\'état', Math.abs(m4.v.c[0] - 1) < 1e-9 && m4.v.c[2] === 0.08);
const m5 = creerEtat(12, alea); m5.etat('verrouille'); for (let i = 0; i < 2000; i++) m5.maj(i * 0.016, 0.016);
v('verrouillé : gris et sans flash', Math.abs(m5.v.c[0] - 0.5) < 0.02 && m5.v.flash === 0);
v('couleurs dans [0,1] et lumière cyan clair', m.v.c.every(x => x >= 0 && x <= 1.0001) && m.v.lumiere.every(x => x >= 0.8 && x <= 1.0001));

// Shaders partagés : un seul texte pour la galaxie (Three.js) et l'accueil (natif)
for (const k of ['DERIVE', 'VERT_NOEUDS', 'FRAG_NOEUDS', 'VERT_LIENS', 'FRAG_LIENS']) v('shader ' + k, typeof SH[k] === 'string' && SH[k].length > 100);
v('les shaders ne déclarent ni matrices ni position (fournies par chaque moteur)', !/uniform mat4|attribute vec3 position/.test(SH.VERT_NOEUDS + SH.VERT_LIENS));
const lire = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const soleil = lire('galaxie/soleil.js'), accueil = lire('skins/neurone/entite-reseau.js');
for (const [nom, src] of [['soleil', soleil], ['accueil', accueil]]) {
  v(nom + ' : importe les shaders partagés', /shaders-reseau\.js/.test(src) && /VERT_NOEUDS/.test(src) && /FRAG_LIENS/.test(src));
  v(nom + ' : importe la machine d\'état partagée', /etats-reseau\.js/.test(src) && /creerEtat/.test(src));
  v(nom + ' : importe les données partagées', /donnees-reseau\.js/.test(src) && /preparerDonnees/.test(src));
  v(nom + ' : pas de copie locale des états ni des shaders', !/const ETATS\s*=/.test(src) && !/gl_FragColor\s*=\s*vec4\(col/.test(src.replace(/ENTETE_FS \+ `[\s\S]*?`/g, '')));
}
v('l\'accueil n\'embarque pas Three.js', !/from 'three'/.test(accueil));

// Données de rendu : déterministes, tailles cohérentes
const R = genererReseau(2500, 11), D1 = preparerDonnees(R), D2 = preparerDonnees(R);
v('données : tailles', D1.graine.length === R.N && D1.pL.length === R.aretes.length * 6 && D1.aU.length === R.aretes.length * 2 && D1.E === R.aretes.length);
v('données : déterministes', D1.graine[100] === D2.graine[100] && D1.aPh[50] === D2.aPh[50]);
v('données : valeurs finies', [D1.graine, D1.pL, D1.aU, D1.aPh, D1.aV, D1.aW, D1.aGr, D1.aRad].every(a => a.every(Number.isFinite)));


// ── Vie de l'entité (étincelles, vagues, pensées, regard, naissance, secousse) ──
const mv = creerEtat(12, alea); let tv = 0, maxEtinc = 0; const ondesVues = new Set();
for (let i = 0; i < 60 * 40; i++) { tv += 1 / 60; mv.maj(tv, 1 / 60); maxEtinc = Math.max(maxEtinc, mv.v.etincelles); mv.v.ondes.forEach(o => { if (o[1] > 0) ondesVues.add(o[0]); }); }
v('veille : des étincelles', maxEtinc > 0.9, maxEtinc.toFixed(2));
v('veille : des vagues et des pensées spontanées en 40 s (au moins 4)', ondesVues.size >= 4, String(ondesVues.size));
const compter = (m, secondes) => { const s = new Set(); let t = 0; for (let i = 0; i < 60 * secondes; i++) { t += 1 / 60; m.maj(t, 1 / 60); m.v.ondes.forEach(o => { if (o[1] > 0) s.add(o[0]); }); } return s.size; };
const mz = creerEtat(12, alea); mz.vie(0); const nz = compter(mz, 40);
v("vie(0) : plus d'étincelles, de vagues ni de pensées", mz.v.etincelles === 0 && nz === 0);
const mc = creerEtat(12, alea); mc.calme(true); const nc = compter(mc, 40);
v('animations réduites : aucune vie spontanée', mc.v.etincelles === 0 && nc === 0 && mc.v.flash === 0);
const mn = creerEtat(12, alea); mn.vie(0.45); const nn = compter(mn, 40);
v("vie réduite (léger) : des vagues, mais pas plus qu'en complet", nn > 0 && nn <= ondesVues.size + 1, nn + ' / ' + ondesVues.size);
// écoute / réflexion
const me = creerEtat(12, alea); me.etat('listening'); tv = 0; for (let i = 0; i < 300; i++) { tv += 1 / 60; me.maj(tv, 1 / 60); }
v('écoute : les filaments se resserrent vers le cœur', me.v.serre > 0.6 && me.v.tourb < 0.05, me.v.serre.toFixed(2));
me.amplitude(() => 0.9); for (let i = 0; i < 120; i++) { tv += 1 / 60; me.maj(tv, 1 / 60); }
v("écoute : l'entité s'éclaire au rythme de la voix", me.v.lum > ETATS.listening.lum * 1.6, me.v.lum.toFixed(2));
me.amplitude(null); me.etat('thinking'); for (let i = 0; i < 400; i++) { tv += 1 / 60; me.maj(tv, 1 / 60); }
v('réflexion : tourbillon, impulsions rapides, violet', me.v.tourb > 0.8 && me.v.pulse > 2.4 && me.v.c[0] > 0.7 && me.v.c[2] > 0.95, JSON.stringify([me.v.tourb, me.v.pulse]));
// parole : une vague à chaque pic de voix
const mp = creerEtat(12, alea); mp.etat('speaking'); const pics = new Set(); tv = 0;
mp.amplitude(() => 0.5 + 0.5 * Math.sin(tv * 8));
for (let i = 0; i < 60 * 6; i++) { tv += 1 / 60; mp.maj(tv, 1 / 60); mp.v.ondes.forEach(o => { if (o[1] > 0.3) pics.add(o[0]); }); }
v('parole : des vagues partent du cœur sur les pics de voix', pics.size >= 4, String(pics.size));
// alerte
const ma = creerEtat(12, alea); tv = 0; for (let i = 0; i < 60; i++) { tv += 1 / 60; ma.maj(tv, 1 / 60); }
ma.etat('alerte'); tv += 1 / 60; ma.maj(tv, 1 / 60);
v('alerte : secousse immédiate', ma.v.secousse > 0.7, ma.v.secousse.toFixed(2));
for (let i = 0; i < 40; i++) { tv += 1 / 60; ma.maj(tv, 1 / 60); }
v('alerte : flash dans la couleur orange', ma.v.flashCol[2] < 0.8 && ma.v.flashCol[0] > 0.95, JSON.stringify(ma.v.flashCol.map(x => +x.toFixed(2))));
for (let i = 0; i < 120; i++) { tv += 1 / 60; ma.maj(tv, 1 / 60); }
v('alerte : la secousse est courte (retombée en 2 s)', ma.v.secousse < 0.02, ma.v.secousse.toFixed(3));
const mca = creerEtat(12, alea); mca.calme(true); mca.etat('alerte'); mca.maj(0.1, 0.016); v('animations réduites : pas de secousse', mca.v.secousse === 0);
// transitions fluides
const mt = creerEtat(12, alea); tv = 0; let saut = 0, prec = mt.v.c.slice();
['idle', 'listening', 'thinking', 'speaking', 'alerte', 'veille', 'idle'].forEach(e => { mt.etat(e); for (let i = 0; i < 90; i++) { tv += 1 / 60; mt.maj(tv, 1 / 60); saut = Math.max(saut, Math.abs(mt.v.c[0] - prec[0]), Math.abs(mt.v.c[1] - prec[1]), Math.abs(mt.v.c[2] - prec[2])); prec = mt.v.c.slice(); } });
v("transitions fluides : les couleurs changent d'au plus 6 % par image", saut < 0.06, saut.toFixed(3));
// regard
const mr = creerEtat(12, alea); tv = 0; for (let i = 0; i < 30; i++) { tv += 1 / 60; mr.maj(tv, 1 / 60); }
mr.regard(1, 0); for (let i = 0; i < 90; i++) { tv += 1 / 60; mr.maj(tv, 1 / 60); }
v('regard à droite : inclinaison positive, bornée', mr.v.incl[0] > 0.25 && mr.v.incl[0] <= 0.34 + 1e-6, mr.v.incl[0].toFixed(3));
mr.regard(-5, 9); for (let i = 0; i < 90; i++) { tv += 1 / 60; mr.maj(tv, 1 / 60); }
v('regard : valeurs hors limites ramenées entre -1 et 1', mr.v.incl[0] < -0.25 && mr.v.incl[1] <= 0.26 + 1e-6 && mr.v.incl[1] > 0.2);
for (let i = 0; i < 60 * 5; i++) { tv += 1 / 60; mr.maj(tv, 1 / 60); }
v('regard : oublié sans mouvement (retour au centre)', Math.abs(mr.v.incl[0]) < 0.02 && Math.abs(mr.v.incl[1]) < 0.02);
const mrc = creerEtat(12, alea); mrc.calme(true); mrc.regard(1, 1); for (let i = 0; i < 90; i++) mrc.maj(1 + i / 60, 1 / 60); v('animations réduites : inclinaison très faible', mrc.v.incl[0] < 0.12);
// onde manuelle
const mo = creerEtat(12, alea); mo.maj(1, 0.016); mo.onde(1, 1.7); mo.maj(1.1, 0.016); mo.onde(0.5, 1); mo.maj(1.2, 0.016); mo.onde(0.5, 1); mo.maj(1.3, 0.016); mo.onde(0.9, 1);
v('ondes : trois emplacements, le plus ancien est remplacé', mo.v.ondes.filter(o => o[1] > 0).length === 3 && mo.v.ondes.every(o => o[0] >= 1.1), JSON.stringify(mo.v.ondes));
// naissance
const mb = creerEtat(12, alea); mb.naitre(2); v('naissance : démarre à zéro', mb.v.forme === 0 && mb.enNaissance);
const formes = []; tv = 0; for (let i = 0; i < 60 * 3; i++) { tv += 1 / 60; mb.maj(tv, 1 / 60); formes.push(mb.v.forme); }
v('naissance : croissante, terminée à 1, puis normale', formes.every((x, i) => i === 0 || x >= formes[i - 1] - 1e-9) && formes.at(-1) === 1 && !mb.enNaissance && formes[60] > 0.4 && formes[60] < 0.95, formes[60].toFixed(2));
const mb2 = creerEtat(12, alea); mb2.naitre(0); v('naissance 0 : tout de suite complète', mb2.v.forme === 1);
// robustesse
const mf = creerEtat(12, alea); tv = 0; mf.amplitude(() => alea());
for (let i = 0; i < 60 * 120; i++) { tv += 1 / 60; if (i % 300 === 0) mf.etat(['idle', 'veille', 'listening', 'thinking', 'speaking', 'alerte'][(i / 300) % 6 | 0]); if (i % 500 === 7) mf.onde(); if (i % 400 === 3) mf.regard(alea() * 2 - 1, alea() * 2 - 1); mf.maj(tv, 1 / 60); }
v('120 s de fonctionnement mouvementé : toutes les valeurs restent finies', [mf.v.lum, mf.v.echelle, mf.v.tour, mf.v.derive, mf.v.serre, mf.v.tourb, mf.v.pulse, mf.v.secousse, mf.v.etincelles, mf.v.forme, ...mf.v.incl, ...mf.v.flashCol, ...mf.v.ondes.flat()].every(Number.isFinite));


// ── Vie individuelle : cascades d'impulsions nerveuses, pointeur, intensités par mode, aucune allocation par image ──
const suivre = (m, secondes, fn) => { let t = m.v.temps; for (let i = 0; i < 60 * secondes; i++) { t += 1 / 60; m.maj(t, 1 / 60); fn && fn(); } };
const actives = m => m.v.casB.filter((b, i) => b[1] > 0 && m.v.temps - m.v.casA[i][3] < 3.4).length;
const sources = new Set(), journal = [];
const mc1 = creerEtat(12, alea); mc1.etat('veille'); let maxActives = 0;
suivre(mc1, 90, () => { mc1.v.casA.forEach((a, i) => { if (mc1.v.casB[i][1] > 0 && !sources.has(a[3])) { sources.add(a[3]); journal.push({ r: Math.hypot(a[0], a[1], a[2]), type: mc1.v.casB[i][2], vit: mc1.v.casB[i][0] }); } }); maxActives = Math.max(maxActives, actives(mc1)); });
v('veille : des cascades naissent régulièrement (≥ 20 en 90 s)', journal.length >= 20, String(journal.length));
v('veille : sources partout dans le nuage, y compris à la périphérie et près du cœur', journal.filter(j => j.r > 0.85).length >= journal.length * 0.15 && journal.filter(j => j.r < 0.45).length >= 3, JSON.stringify([journal.filter(j => j.r > 0.85).length, journal.filter(j => j.r < 0.45).length]));
v('veille : cascades du type « onde depuis un point », lentes', journal.every(j => j.type === 0 && j.vit < 0.8));
v('plusieurs cascades en même temps, jamais plus de 4', maxActives >= 2 && maxActives <= 4, String(maxActives));
const compte = (etat, secondes, vieN) => { const m = creerEtat(12, alea); if (vieN != null) m.vie(vieN); m.etat(etat); const s = new Set(); suivre(m, secondes, () => m.v.casA.forEach((a, i) => { if (m.v.casB[i][1] > 0) s.add(a[3]); })); return s.size; };
const nVeille = compte('veille', 30), nPense = compte('thinking', 30), nAlerte = compte('alerte', 30), nCoute = compte('listening', 30);
v('réflexion : cascades denses et rapides (≥ 4 fois la veille)', nPense >= nVeille * 4 || nPense >= 60, nVeille + ' / ' + nPense);
v('alerte : éclairs encore plus fréquents', nAlerte >= nPense * 0.9, nPense + ' / ' + nAlerte);
const mt1 = creerEtat(12, alea); mt1.etat('thinking'); suivre(mt1, 8);
v('réflexion : cascades violettes et rapides (vitesse ≥ 1,2)', mt1.v.cascCol[0] > 0.7 && mt1.v.cascCol[2] > 0.95 && mt1.v.cascCol[1] < 0.7 && mt1.v.casB.some(b => b[1] > 0 && b[0] >= 1.2), JSON.stringify(mt1.v.cascCol.map(x => +x.toFixed(2))));
const ml1 = creerEtat(12, alea); ml1.etat('listening'); const typesE = new Set(); suivre(ml1, 30, () => ml1.v.casB.forEach(b => { if (b[1] > 0) typesE.add(b[2]); }));
v('écoute : les cascades convergent vers le cœur (cônes de type 1)', typesE.has(1) && !typesE.has(2), [...typesE].join());
const mlv = creerEtat(12, alea); mlv.etat('listening'); mlv.amplitude(() => 0.95); const calmeVoix = compte('listening', 30);
const nVoixForte = (() => { const m = creerEtat(12, alea); m.etat('listening'); m.amplitude(() => 0.95); const s = new Set(); suivre(m, 30, () => m.v.casA.forEach((a, i) => { if (m.v.casB[i][1] > 0) s.add(a[3]); })); return s.size; })();
const nVoixFaible = (() => { const m = creerEtat(12, alea); m.etat('listening'); m.amplitude(() => 0.02); const s = new Set(); suivre(m, 30, () => m.v.casA.forEach((a, i) => { if (m.v.casB[i][1] > 0) s.add(a[3]); })); return s.size; })();
v('écoute : la cadence des cascades suit la voix (forte > faible)', nVoixForte > nVoixFaible * 1.5, nVoixFaible + ' → ' + nVoixForte);
const mp2 = creerEtat(12, alea); mp2.etat('speaking'); let tp = 0; mp2.amplitude(() => 0.5 + 0.5 * Math.sin(tp * 8)); const coeur = new Set();
for (let i = 0; i < 60 * 8; i++) { tp += 1 / 60; mp2.maj(tp, 1 / 60); mp2.v.casA.forEach((a, k) => { if (mp2.v.casB[k][1] > 0.45 && Math.hypot(a[0], a[1], a[2]) < 0.1 && mp2.v.casB[k][2] === 0) coeur.add(a[3]); }); }
v('parole : une vague d\'activation part du cœur à chaque pic de voix', coeur.size >= 5, String(coeur.size));
v('alerte : cascades les plus rapides (≥ 2) et orange', (() => { const m = creerEtat(12, alea); m.etat('alerte'); suivre(m, 6); return m.v.casB.some(b => b[1] > 0 && b[0] >= 2) && m.v.cascCol[0] > 0.95 && m.v.cascCol[2] < 0.4; })());
// modes : intensité de la vie individuelle
const niveaux = (n, calme, riche) => { const m = creerEtat(12, alea); m.vie(n); if (calme) m.calme(true); if (riche === false) m.riche(false); suivre(m, 1); return [m.v.vieIndiv, m.v.vieDerive, m.v.vieFils, m.v.vieNais]; };
v('complet : toute la vie individuelle', JSON.stringify(niveaux(1)) === '[1,1,1,1]');
v('normal : environ 70 %', niveaux(0.75).every(x => Math.abs(x - 0.7) < 1e-9));
v('léger : scintillement seulement (pas de dérive, de filaments vivants ni de naissances)', JSON.stringify(niveaux(0.45)) === '[1,0,0,0]');
v('animations réduites : presque rien (scintillement très faible)', JSON.stringify(niveaux(1, true)) === '[0.3,0,0,0]');
v('mode jeu (décor non riche) : rien', JSON.stringify(niveaux(1, false, false)) === '[0,0,0,0]');
const compteVie = n => compte('thinking', 30, n);
v('cadence des cascades : complet > normal > léger', compteVie(1) > compteVie(0.75) && compteVie(0.75) > compteVie(0.45) && compteVie(0.45) > 0, [compteVie(1), compteVie(0.75), compteVie(0.45)].join(' > '));
const mq = creerEtat(12, alea); mq.calme(true); mq.etat('thinking'); const nq = (() => { const s = new Set(); suivre(mq, 30, () => mq.v.casA.forEach((a, i) => { if (mq.v.casB[i][1] > 0) s.add(a[3]); })); return s.size; })();
v('animations réduites : aucune cascade spontanée', nq === 0);
// clic et pointeur
const mk = creerEtat(12, alea); suivre(mk, 1); mk.clic(0.5, -0.3);
const c0 = mk.v.casA.findIndex((a, i) => mk.v.casB[i][1] > 0);
v('un clic lance une cascade depuis le point touché (y inversé : écran vers nuage)', c0 >= 0 && Math.abs(mk.v.casA[c0][0] - 0.5) < 1e-9 && Math.abs(mk.v.casA[c0][1] - 0.3) < 1e-9 && mk.v.casB[c0][1] === 1);
const mkc = creerEtat(12, alea); mkc.calme(true); mkc.clic(0.1, 0.1); v('animations réduites : le clic ne lance rien', mkc.v.casB.every(b => b[1] === 0));
const mm = creerEtat(12, alea); suivre(mm, 1); mm.cascade(0, 0, 0, 1, 1, 0, 0.3); mm.cascade(1, 0, 0, 1, 1, 0, 0.3); mm.cascade(0, 1, 0, 1, 1, 0, 0.3); mm.cascade(0, 0, 1, 1, 1, 0, 0.3); mm.cascade(-1, 0, 0, 1, 1, 0, 0.3);
v('cascade manuelle : 4 emplacements, le plus ancien est remplacé', mm.v.casB.filter(b => b[1] > 0).length === 4 && mm.v.casA.some(a => a[0] === -1));
const mpt = creerEtat(12, alea); suivre(mpt, 1); mpt.pointeur(0.4, -0.2); suivre(mpt, 1);
v('pointeur : suivi doucement, force atteinte en complet', Math.abs(mpt.v.pointeur[0] - 0.4) < 0.02 && Math.abs(mpt.v.pointeur[1] + 0.2) < 0.02 && mpt.v.pointeur[2] > 0.95);
suivre(mpt, 4); v('pointeur : oublié après 2,5 s sans mouvement', mpt.v.pointeur[2] < 0.02);
const mpt2 = creerEtat(12, alea); mpt2.pointeur(3, 3); suivre(mpt2, 1); v('pointeur loin de l\'entité : ignoré', mpt2.v.pointeur[2] < 0.02);
const mpl = creerEtat(12, alea); mpl.vie(0.45); mpl.pointeur(0.2, 0.1); suivre(mpl, 1); v('léger : pas de réaction au pointeur', mpl.v.pointeur[2] < 0.02);
// aucune allocation par image : les tableaux restent les mêmes objets
const ma2 = creerEtat(12, alea), refs = [ma2.v.c, ma2.v.d, ma2.v.flashCol, ma2.v.cascCol, ma2.v.lumiere, ma2.v.incl, ma2.v.pointeur, ma2.v.casA, ma2.v.casB, ma2.v.ondes];
ma2.etat('thinking'); ma2.pointeur(0.2, 0.2); suivre(ma2, 5); ma2.clic(0.1, 0.1); suivre(ma2, 2);
v('aucune allocation par image : tous les tableaux de valeurs gardent le même objet', [ma2.v.c, ma2.v.d, ma2.v.flashCol, ma2.v.cascCol, ma2.v.lumiere, ma2.v.incl, ma2.v.pointeur, ma2.v.casA, ma2.v.casB, ma2.v.ondes].every((x, i) => x === refs[i]));
v('toutes les valeurs de cascade restent finies', ma2.v.casA.flat().every(Number.isFinite) && ma2.v.casB.flat().every(Number.isFinite) && ma2.v.pointeur.every(Number.isFinite) && ma2.v.cascCol.every(Number.isFinite));
v('chaque état a sa configuration de cascade complète', Object.keys(ETATS).every(k => CASCADES[k] && ['rate', 'vit', 'force', 'type', 'larg'].every(c => Number.isFinite(CASCADES[k][c])) && CASCADES[k].col.length === 3));

console.log(`${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
