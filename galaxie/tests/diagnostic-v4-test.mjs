import { entonnoir, parFamilleActif, normaliserCritere, hasard, balayerFamille, conclusion } from '../../strategies/diagnostic-v4.js';
import { empreinteV3 } from '../../strategies/criteres-v3.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { walkForward } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { serieSynth } from '../../planetes/mars/tests/synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

v('critères v3 inchangés (empreinte c9b4ddd4)', empreinteV3() === 'c9b4ddd4');
v('« parmi 3117 variantes » et « parmi 12 variantes » sont le même critère', normaliserCritere('Sharpe parmi 3117 variantes') === normaliserCritere('Sharpe parmi 12 variantes'));

const bt = [
  { famille: 'a', paire: 'BTC', statut: 'non_validee', esperance: 0.3, trades: 80, ratees: ['X', 'Y parmi 10 variantes'] },
  { famille: 'a', paire: 'BTC', statut: 'non_validee', esperance: 0.1, trades: 400, ratees: ['X', 'Y parmi 99 variantes', 'Z'] },
  { famille: 'b', paire: 'SOL', statut: 'non_validee', esperance: -0.2, trades: 500, ratees: ['X'] }
];
const e = entonnoir(bt);
v('entonnoir : 3 évaluations, critère X raté 3 fois', e.evaluations === 3 && e.criteres[0].critere === 'X' && e.criteres[0].rate === 3);
v('entonnoir : « raté seulement celui-là » compté', e.criteres.find(c => c.critere === 'X').seul === 1);
v('entonnoir : Y regroupé malgré N différents', e.criteres.find(c => /^Y/.test(c.critere)).rate === 2);
const pf = parFamilleActif(bt, { tradesMin: 150 });
v('presque = espérance positive et trop peu de trades', pf.presque.length === 1 && pf.presque[0].trades === 80 && pf.liste[0].esperance === 0.3);

// hasard sur une marche sans avantage : l'espérance nette est négative (les frais) et l'espérance brute proche de zéro
const m15 = serieSynth({ segments: [{ n: 20000, derive: 0, bruit: 0.15, volume: 100 }], graine: 5 }), ctx = construireContexte(m15), plage = { de: 0, a: m15.n };
const h = hasard(ctx, { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 }, plage, { essais: 8 });
v('hasard : des essais ont assez de trades', h.essais >= 4, JSON.stringify(h));
v('hasard sans avantage : espérance NETTE négative (les frais)', h.esperanceMoyenne < 0, String(h.esperanceMoyenne));
v('hasard : les frais coûtent un peu de R par trade', h.coutsMoyens > 0.05, String(h.coutsMoyens));
v('hasard : reproductible (graine)', JSON.stringify(hasard(ctx, { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 }, plage, { essais: 3 })) === JSON.stringify(hasard(ctx, { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 }, plage, { essais: 3 })));

const b = balayerFamille(ctx, 'tendance_ma', { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 }, plage);
v('balayage : toutes les variantes de la grille évaluées', b.variantes > 0 && b.positivesBrutes >= b.positivesNettes, JSON.stringify({ n: b.variantes, brutes: b.positivesBrutes, nettes: b.positivesNettes }));

// verdicts
const base = { variantes: 10, avecAssezDeTrades: 10, positivesNettes: 0, positivesBrutes: 0, nettesSeuil: 0 };
v('verdict : données insuffisantes', /INSUFFISANTES/.test(conclusion({ entonnoirRes: e, balayages: [{ ...base, avecAssezDeTrades: 0 }], pairesHasard: [] }).verdict));
v('verdict : les frais mangent l’avantage', /FRAIS/.test(conclusion({ entonnoirRes: e, balayages: [{ ...base, positivesBrutes: 3 }], pairesHasard: [] }).verdict));
v('verdict : mal armé', /MAL ARMÉ/.test(conclusion({ entonnoirRes: e, balayages: [{ ...base, positivesBrutes: 3, positivesNettes: 2 }], pairesHasard: [] }).verdict));
v('verdict : jamais « il faut assouplir les critères »', !/assouplir les crit/.test(conclusion({ entonnoirRes: e, balayages: [{ ...base, positivesNettes: 2, positivesBrutes: 3, nettesSeuil: 1 }], pairesHasard: [] }).verdict.replace(/pas des critères plus faciles/, '')));

// walk-forward : un trade entré avant la fin de l'entraînement mais SORTI après n'entre pas dans le score d'entraînement
const mk = (entree, sortie, R) => ({ entree, sortie, t: entree, tSortie: sortie, R, barres: sortie - entree + 1, sens: 1, Rbrut: R, coutsR: 0, distancePct: 1 });
const decoupe = { folds: [{ train: [0, 100], test: [100, 200], debutTest: 0, finTest: 0 }] };
const trades = []; for (let i = 0; i < 20; i++) trades.push(mk(i * 4, i * 4 + 2, -0.5));
const tricheur = [...trades, mk(98, 150, 50)];                      // gain énorme réalisé PENDANT le test, entré juste avant la coupe
const sain = trades;
const wf1 = walkForward([{ params: { a: 1 }, trades: tricheur }, { params: { a: 2 }, trades: sain }], decoupe, {});
v('walk-forward : le trade à cheval sur la coupe ne sert pas à choisir les paramètres', wf1.blocs[0].params && wf1.blocs[0].entrainement.n === 20, JSON.stringify(wf1.blocs[0].entrainement && wf1.blocs[0].entrainement.n));

console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
