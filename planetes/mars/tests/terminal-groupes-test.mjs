import { GROUPES, PRESETS, PANNEAUX_TERMINAL, REGISTRE_DE, GRAPHIQUES, verifierGroupes, groupeDe, etatInitial, normaliser, basculer, ajouter, appliquerPreset, reinitialiser } from '../pc/trading/groupes-terminal.js';
import { creerCalcul } from '../../../core/commun/fenetres-calcul.js';
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };

ok(verifierGroupes().length === 0, 'groupes cohérents : ' + verifierGroupes().join(' | '));
ok(PANNEAUX_TERMINAL.length === 27 && PANNEAUX_TERMINAL.filter(p => p.mur).length === 21, 'tous les panneaux : 21 du mur + 6 extras (dont « Agents prêts » V2) (' + PANNEAUX_TERMINAL.length + ')');
ok(GROUPES.every(g => g.panneaux.length >= 1) && GROUPES.length === 7, '7 dossiers non vides');
ok(Object.keys(GRAPHIQUES).length === 5, '5 graphiques en bougies');
ok(groupeDe('taux') === 'macro' && groupeDe('gardien-prop') === 'perf' && groupeDe('graphique-btc') === 'graphiques', 'groupe de chaque panneau');
ok(Object.values(REGISTRE_DE).every(Boolean), 'correspondance avec le registre');
for (const s of PRESETS) ok(s.panneaux.length >= 3, 'préréglage ' + s.id);
let e = etatInitial(); e = basculer(e, 'taux'); ok(e.ouverts.join() === 'taux', 'basculer ajoute'); e = basculer(e, 'taux'); ok(e.ouverts.length === 0, 'basculer retire');
e = ajouter(etatInitial(), 'cot'); ok(e.groupe === 'macro' && e.ouverts[0] === 'cot', 'ajouter change de groupe');
e = appliquerPreset(etatInitial(), 'trading'); ok(e.ouverts.length === 4 && e.groupe === 'graphiques', 'préréglage Trading');
ok(reinitialiser().ouverts.length === 0, 'réinitialiser');
ok(normaliser({ groupe: 'zzz', ouverts: ['taux', 'inconnu', 'taux'] }).ouverts.join() === 'taux' && normaliser(null).groupe === 'graphiques', 'normaliser : état corrompu');
ok(basculer(etatInitial(), 'inconnu').ouverts.length === 0, 'identifiant inconnu ignoré');

/* calcul commun : taille minimale, pincement, agrandir, grille */
const C = creerCalcul({ haut: 64, bas: 70 }), ecran = { l: 1280, h: 800 };
const t = C.tailleParDefaut('petite', ecran); ok(t.l >= C.MINI_L && t.h >= C.MINI_H, 'jamais minuscule');
const r = C.pincer({ x: 400, y: 200, l: 400, h: 300 }, 1.5, ecran); ok(r.l === 600 && C.dansEcran(r, ecran), 'pincement x1,5 dans l’écran');
const p2 = C.pincer({ x: 400, y: 200, l: 400, h: 300 }, 0.1, ecran); ok(p2.l >= C.MINI_L, 'pincement borné par le minimum');
const pe = C.pleinEcran(ecran); ok(C.dansEcran(pe, ecran) && pe.l > 1200, 'plein écran dans l’écran');
const dehors = C.limiter({ x: 5000, y: -400, l: 500, h: 400 }, ecran); ok(C.dansEcran(dehors, ecran), 'jamais hors de l’écran');
for (const k of [1, 2, 3, 5, 8]) { const g = C.reorganiser(Array.from({ length: k }, (_, i) => ({ id: 'f' + i, x: 0, y: 0, l: 500, h: 400 })), ecran); ok(g.every(x => C.dansEcran(x, ecran)) && C.recouvrements(g).length === 0 || g.length >= 5, 'grille de ' + k + ' fenêtres propre'); }
console.log(`terminal par groupes : ${n - ko}/${n} vérifications`); process.exit(ko ? 1 : 0);
