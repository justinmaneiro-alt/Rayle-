import '../../strategies/familles-v6.js';
// Tests de l'optimisation guidée (V6) : elle converge vers la bonne zone avec peu d'évaluations, reste reproductible, compte TOUT ce qu'elle essaie, ne regarde que le bloc d'entraînement initial.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/optimisation-guidee-test.mjs
import { rechercheGuidee, espaceDe, petiteGrille, plageGuidage } from '../../strategies/optimisation-guidee.js';
import { decouper } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { combinaisons } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// paysage connu : l'optimum est en ema = 37, stopATR = 2,3, sortie « suiveur » ; le reste est médiocre
const grille = { ema: [10, 20, 50, 100], stopATR: [1, 2, 3, 4], sortie: ['fixe', 'partielle', 'suiveur'] };
let appels = 0, plagesVues = new Set();
const paysage = (p, plage) => { appels++; plagesVues.add(JSON.stringify(plage)); const bonus = p.sortie === 'suiveur' ? 0.1 : p.sortie === 'partielle' ? 0.03 : 0; return { n: 120, esperance: 0.45 - ((p.ema - 37) / 60) ** 2 - ((p.stopATR - 2.3) / 2) ** 2 + bonus }; };
const plage = { de: 0, a: 20000 };
const r = rechercheGuidee({ id: 'x', evaluateur: paysage, plage, graine: 4, grilleBase: grille, iterations: 5, population: 16, elite: 4 });
v('converge près de l’optimum (ema ≈ 37, stop ≈ 2,3 ATR, sortie suiveuse)', r.meilleur && Math.abs(r.meilleur.params.ema - 37) < 10 && Math.abs(r.meilleur.params.stopATR - 2.3) < 0.8 && r.meilleur.params.sortie === 'suiveur', JSON.stringify(r.meilleur && r.meilleur.params));
v('…en bien moins d’évaluations qu’une grille fine de l’espace (ici ≤ 120 contre plus de 1000)', r.evaluees.length <= 120 && appels === r.evaluees.length, appels + ' évaluations');
v('elle ne regarde que la plage d’entraînement qu’on lui donne', plagesVues.size === 1 && plagesVues.has(JSON.stringify(plage)));
v('chaque paramètre évalué est listé (compteur de variantes honnête) et unique', r.explorees.length === r.evaluees.length && new Set(r.explorees.map(p => JSON.stringify(p))).size === r.explorees.length);
const r2 = rechercheGuidee({ id: 'x', evaluateur: paysage, plage, graine: 4, grilleBase: grille, iterations: 5, population: 16, elite: 4 }), r3 = rechercheGuidee({ id: 'x', evaluateur: paysage, plage, graine: 5, grilleBase: grille, iterations: 5, population: 16, elite: 4 });
v('reproductible : même graine, mêmes essais', JSON.stringify(r2.explorees) === JSON.stringify(r.explorees));
v('une autre graine explore d’autres points (les rondes successives apportent du nouveau)', JSON.stringify(r3.explorees) !== JSON.stringify(r.explorees));
const nb = combinaisons(r.grille).length;
v('la grille à valider est PETITE (≤ 27 variantes) et centrée sur la bonne zone', nb <= 27 && nb >= 1 && r.grille.sortie.includes('suiveur') && r.grille.ema.some(x => Math.abs(x - 37) < 12), JSON.stringify(r.grille));
v('espace de recherche : intervalles élargis pour les nombres, listes pour les choix', (() => { const e = espaceDe(grille); return e.ema.type === 'nombre' && e.ema.min < 10 && e.ema.max > 100 && e.ema.entier && e.sortie.type === 'choix' && e.stopATR.type === 'nombre'; })());
v('paramètres entiers restent entiers', r.evaluees.every(x => Number.isInteger(x.params.ema)));
v('un pic isolé sur peu de trades ne gagne pas (minimum de trades exigé)', (() => { const pic = (p, pl) => ({ n: p.ema > 90 ? 5 : 100, esperance: p.ema > 90 ? 5 : 0.1 }); const rr = rechercheGuidee({ id: 'x', evaluateur: pic, plage, grilleBase: grille, tradesMin: 20 }); return rr.meilleur && rr.meilleur.params.ema <= 90; })());
v('rien de prometteur (toutes les espérances négatives) : la grille de retour est l’originale élargie ou l’élite, jamais vide', (() => { const nul = () => ({ n: 100, esperance: -0.3 }); const rr = rechercheGuidee({ id: 'x', evaluateur: nul, plage, grilleBase: grille }); return rr.positives === 0 && Object.keys(rr.grille).length === 3 && Object.values(rr.grille).every(a => a.length >= 1); })());
v('petiteGrille plafonne le nombre de combinaisons', (() => { const elite = Array.from({ length: 8 }, (_, i) => ({ params: { a: i, b: i * 2, c: i * 3, d: 'x' + (i % 4) } })); const g = petiteGrille({ a: [1, 2], b: [1, 2], c: [1, 2], d: ['x']}, elite, undefined, 27); return Object.values(g).reduce((s, x) => s * x.length, 1) <= 27; })());

// ── avec le vrai moteur de backtest sur des bougies synthétiques : plage = premier bloc d'entraînement du walk-forward ──
const m = marcheMixte(170000, 5), dec = decouper(m), pg = plageGuidage(dec);
v('plage de guidage = premier bloc d’entraînement, avant tout bloc de test et avant le jeu final', pg && pg.a === dec.folds[0].train[1] && pg.a < dec.folds[0].test[0] + 1 && pg.a < dec.finA, JSON.stringify(pg));
const ctx = construireContexte(m);
const reel = rechercheGuidee({ ctx, id: 'tendance_pullback_h4', config: { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02 }, plage: pg, graine: 2, iterations: 2, population: 8, elite: 3, tradesMin: 15 });
import('../../strategies/familles-v6.js');
v('avec le vrai moteur : des variantes évaluées, une petite grille, jamais plus de 27 combinaisons', reel.evaluees.length >= 8 && combinaisons(reel.grille).length <= 27, reel.evaluees.length + ' évaluations, grille ' + JSON.stringify(reel.grille));
console.log('Optimisation guidée : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
