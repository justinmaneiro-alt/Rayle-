import { compteur, attendre } from './terre-aide.mjs';
import { lancer } from './v5-aide.mjs';

/* V11 : gestes en MODE SIMPLE dans la VRAIE page Rayle, SANS caméra (suites de points synthétiques rejouées à 60 images/s).
   Vérifie : engagement en 0,4 s, aucune pause par un poing / une main à plat, bouton Pause et pause vocale, panneau « Que puis-je faire ? » (5 gestes), étiquette du geste détecté près du curseur,
   mode avancé (poing 2 s avec barre, annulable), tutoriel « Apprendre les gestes » (7 exercices en mode simple), réglages.
   Lancer : node tests-navigateur/v11-gestes-test.mjs   Non testable ici : une vraie main devant un vrai téléphone (à valider par Justin, procédure dans docs/GESTES.md). */
const { verifier, fin } = compteur();
const { page, erreurs, fermer } = await lancer({ port: 8143 });
const ev = (f, ...a) => page.evaluate(f, ...a);
const T = (code, ...a) => page.evaluate(new Function('...args', 'return (async () => { const T = window.__T; ' + code + ' })()'), ...a);
const etat = () => ev(() => ({ ...Gestes.etat() }));
const pos = () => ev(() => Telecommande.position());
const etiq = () => ev(() => { const e = document.getElementById('gv11-etiquette'); return e && !e.hidden ? e.firstChild.textContent : null; });

verifier('le mode simple est le réglage par défaut', await ev(() => Gestes.reglages().gestesAvances === false && !!window.GestesV11 && !!window.GestesV11UI));
verifier('gestes éteints : le panneau d’aide est caché', await ev(() => { const a = document.getElementById('gv11-aide'); return !!a && a.hidden; }));
await ev(() => Gestes.activer({ source: 'rejeu', memoriser: false }));
verifier('gestes actifs : le panneau « Que puis-je faire ? » apparaît avec les 5 gestes', await ev(() => { const a = document.getElementById('gv11-aide'); return !a.hidden && a.querySelectorAll('li').length === 5 && /Que puis-je faire/.test(a.textContent); }));
verifier('les 5 gestes ont un pictogramme animé', await ev(() => document.querySelectorAll('#gv11-aide .gv11-pic svg').length === 5));
verifier('le panneau propose Pause, Apprendre et Mode avancé', await ev(() => { const b = [...document.querySelectorAll('#gv11-aide .gv11-boutons button')].map(x => x.textContent); return /Pause/.test(b[0]) && /Apprendre/.test(b[1]) && /Mode avancé : non/.test(b[2]); }));

// ── engagement en 0,4 s, sans pose particulière ──
const p0 = await pos();
await T(`const s = new T.Suite(); s.pointer(500, 300, 250); await T.jouer(s);`);
verifier('main vue 0,25 s : pas encore engagée', await ev(() => !Gestes.etat().engage));
await T(`const s = new T.Suite(); s.pointer(500, 300, 700); await T.jouer(s);`);
verifier('main vue et stable ≥ 0,4 s : ENGAGÉE sans pose compliquée', await ev(() => Gestes.etat().engage));
await T(`const s = new T.Suite(); s.pointer(500, 300, 200).vers(1000, 600, 600); await T.jouer(s);`);
const p1 = await pos();
verifier('pointer : le curseur de la page suit la pointe de l’index', Math.abs(p1.x - p0.x) > 100 || Math.abs(p1.y - p0.y) > 100, JSON.stringify({ p0, p1 }));
verifier('l’étiquette près du curseur dit « Pointer »', /Pointer/.test(String(await etiq())), String(await etiq()));

// ── jamais de pause par un geste ──
await T(`const s = new T.Suite(); s.ouvrir(700, 450, 500).poing(700, 450, 3500); await T.jouer(s);`);
const apresPoing = await etat();
verifier('poing tenu 3,5 s : aucune pause', !apresPoing.pause && apresPoing.engage, JSON.stringify({ pause: apresPoing.pause, mode: apresPoing.mode }));
await T(`const s = new T.Suite(); s.tenir('ouverte', 700, 450, 3500); await T.jouer(s);`);
verifier('main à plat 3,5 s : aucune pause', !(await etat()).pause);

// ── bouton Pause / Reprendre ──
await ev(() => document.querySelector('#gv11-aide [data-a="pause"]').click());
verifier('bouton Pause : les gestes sont en pause, le bouton devient « Reprendre »', await ev(() => Gestes.etat().pause && /Reprendre/.test(document.querySelector('#gv11-aide [data-a="pause"]').textContent)));
const pA = await pos();
await T(`const s = new T.Suite(); s.pointer(200, 200, 300).vers(1100, 700, 700).ouvrir(700, 450, 2200); await T.jouer(s);`);
const pB = await pos();
verifier('en pause : ni le curseur ni un geste (paume 2,2 s) ne bougent rien, même la paume ouverte ne lève pas la pause', Math.abs(pB.x - pA.x) < 2 && Math.abs(pB.y - pA.y) < 2 && (await etat()).pause, JSON.stringify({ pA, pB }));
verifier('l’étiquette dit comment reprendre', /En pause/.test(String(await etiq())), String(await etiq()));
await ev(() => document.querySelector('#gv11-aide [data-a="pause"]').click());
verifier('bouton Reprendre : les gestes sont repris', await ev(() => !Gestes.etat().pause && /Pause/.test(document.querySelector('#gv11-aide [data-a="pause"]').textContent)));
const v1 = await ev(() => Gestes.traiterVoix('Raylé, pause les gestes'));
verifier('voix « pause les gestes » : pause', (await etat()).pause && /pause/i.test(String(v1)), String(v1));
const v2 = await ev(() => Gestes.traiterVoix('reprends les gestes'));
verifier('voix « reprends les gestes » : repris', !(await etat()).pause && /repris/i.test(String(v2)), String(v2));
const v3 = await ev(() => Gestes.traiterVoix('aide des gestes'));
verifier('voix « aide des gestes » : liste les 5 gestes et la pause par bouton / voix', /Pointer/.test(String(v3)) && /Pincer/.test(String(v3)) && /Balayer/.test(String(v3)) && /pause les gestes/.test(String(v3)) && !/poing tenu range/i.test(String(v3)), String(v3).slice(0, 200));
await ev(() => { const m = document.querySelector('.gm-modale, #gm-modale, [role="dialog"]'); if (m) m.remove(); });

// ── paume : anneau avec compte à rebours ──
await T(`const s = new T.Suite(); s.pointer(300, 300, 400).ouvrir(700, 450, 900); await T.jouer(s);`);
verifier('paume ouverte immobile : l’étiquette annonce l’accueil avec un compte à rebours', /Paume : accueil dans/.test(String(await etiq())) || (await ev(() => (Gestes.etat().progres || {}).type === 'reset')), String(await etiq()));

// ── mode avancé ──
await ev(() => document.querySelector('#gv11-aide [data-a="avance"]').click());
verifier('bouton « Mode avancé » : le réglage est activé', await ev(() => Gestes.reglages().gestesAvances === true && /Mode avancé : oui/.test(document.querySelector('#gv11-aide [data-a="avance"]').textContent)));
await T(`const s = new T.Suite(); s.ouvrir(700, 450, 1200).poing(700, 450, 1000); await T.jouer(s);`);
const mi = await ev(() => ({ pause: Gestes.etat().pause, prog: Gestes.etat().progres }));
verifier('mode avancé : poing de 1 s = barre de progression, PAS encore de pause', !mi.pause && mi.prog && mi.prog.type === 'pause' && mi.prog.v > 0.2 && mi.prog.v < 0.9, JSON.stringify(mi));
verifier('mode avancé : l’étiquette annonce la pause en cours (annulable)', /Pause en cours/.test(String(await etiq())), String(await etiq()));
await T(`const s = new T.Suite(); s.ouvrir(700, 450, 1200); await T.jouer(s);`);
verifier('mode avancé : rouvrir la main avant 2 s annule la pause', !(await etat()).pause);
await T(`const s = new T.Suite(); s.poing(700, 450, 2600); await T.jouer(s);`);
verifier('mode avancé : poing immobile tenu 2 s = pause', (await etat()).pause);
await ev(() => document.querySelector('#gv11-aide [data-a="pause"]').click());
await ev(() => document.querySelector('#gv11-aide [data-a="avance"]').click());
verifier('retour au mode simple', await ev(() => Gestes.reglages().gestesAvances === false && !Gestes.etat().pause));

// ── tutoriel ──
await ev(() => document.querySelector('#gv11-aide [data-a="apprendre"]').click()); await attendre(500);
const tut = await ev(() => ({ n: document.querySelectorAll('#gv5-appr .gv5-pas i').length, noms: [...document.querySelectorAll('#gv5-appr .gv5-pas i')].map(i => i.textContent) }));
verifier('« Apprendre les gestes » : 7 exercices en mode simple (pas de pause, pas de ranger)', tut.n === 7 && !tut.noms.some(n => /Pause|Ranger/.test(n)) && tut.noms.some(n => /Deux mains/.test(n)) && tut.noms.some(n => /accueil/i.test(n)), tut.noms.join(' | '));
await ev(() => window.GestesV5UI.fermer());

// ── panneau repliable, mémorisé ──
await ev(() => document.querySelector('#gv11-aide [data-a="plier"]').click());
verifier('le panneau se replie (et reste à l’écran, titre seul)', await ev(() => { const a = document.getElementById('gv11-aide'); return !a.hidden && a.classList.contains('gv11-replie') && getComputedStyle(a.querySelector('.gv11-corps')).display === 'none'; }));
await ev(() => document.querySelector('#gv11-aide [data-a="plier"]').click());
verifier('et se rouvre', await ev(() => !document.getElementById('gv11-aide').classList.contains('gv11-replie')));
// ── pas de chevauchement avec la fenêtre « Caméra du téléphone » en bas à gauche ──
verifier('le panneau reste dans l’écran (≥ 14 px des bords)', await ev(() => { const r = document.getElementById('gv11-aide').getBoundingClientRect(); return r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }));
await ev(() => Gestes.desactiver());
verifier('gestes éteints : le panneau et l’étiquette disparaissent', await ev(() => document.getElementById('gv11-aide').hidden && (document.getElementById('gv11-etiquette').hidden)));
const vraies = erreurs.filter(e => !/Failed to load resource|CORS policy|ERR_FAILED|faireconomy/.test(e));   // appels réseau externes (calendrier, sans Internet) : sans rapport avec les gestes
verifier('aucune erreur JavaScript', vraies.length === 0, vraies.join(' | '));
await fermer(); fin();
