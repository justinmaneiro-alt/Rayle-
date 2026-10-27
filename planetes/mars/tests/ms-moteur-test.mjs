// « Teste ma stratégie » (V1) : validation, signaux sans regard vers le futur, sorties (objectif, suiveur, signal), test complet sur des marchés FABRIQUÉS (avantage planté / hasard pur),
// jeu final non touché, compteur de variantes, verdicts, simulation prop. Lancer :  node planetes/mars/tests/ms-moteur-test.mjs
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { decouper } from '../pc/agent-btc/evaluation.js';
import { verifierSignaux, couper } from '../pc/agent-m6/causalite.js';
import { marcheM5, DERIVE_PLANTEE } from './synth-m5.mjs';
import { marcheMixte } from './synth-btc.mjs';
import { validerStrategie, strategieVide, decrireStrategie, cleStrategie, depuisRegleLab, validerCondition } from '../pc/agent-ms/strategie-ms.js';
import { signauxMS, niveauStop, masqueEntree } from '../pc/agent-ms/signaux-ms.js';
import { simulerMS } from '../pc/agent-ms/simulation-ms.js';
import { testerStrategie, verdictMS, risqueSurajustement, grouperPaires, courbesCapital, simulationProp, serieDePertes, SEUILS_MS } from '../pc/agent-ms/test-ms.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const base = (o = {}) => ({ nom: 'Test', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 30 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, sortie: { type: 'cible_R', R: 2 }, ...o });

// ── 1. validation et description ──
{
  const r = validerStrategie(base());
  v('stratégie valide acceptée', r.ok && r.strategie.conditions.length === 1, JSON.stringify(r.erreurs));
  v('stratégie vide refusée (aucune condition)', !validerStrategie({ ...base(), conditions: [] }).ok);
  v('condition inconnue refusée', !validerStrategie(base({ conditions: [{ type: 'astrologie' }] })).ok);
  v('RSI hors bornes refusé', !validerStrategie(base({ conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 5 }] })).ok);
  v('côté inconnu refusé', !validerStrategie(base({ cote: 'milieu' })).ok);
  v('stop inconnu / hors bornes refusé', !validerStrategie(base({ stop: { type: 'magique' } })).ok && !validerStrategie(base({ stop: { type: 'atr', tf: 'h1', k: 50 } })).ok);
  v('stop fixe accepté, avertissement s’il sort des limites du moteur', validerStrategie(base({ stop: { type: 'fixe', pct: 1 } })).ok && validerStrategie(base({ stop: { type: 'fixe', pct: 0.2 } })).avertissements.length === 1);
  v('sortie : objectif / suiveur / signal acceptés, hors bornes refusés', validerStrategie(base({ sortie: { type: 'suiveur', k: 3, tf: 'h1' } })).ok && validerStrategie(base({ sortie: { type: 'signal', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '>', seuil: 70 }] } })).ok && !validerStrategie(base({ sortie: { type: 'cible_R', R: 99 } })).ok && !validerStrategie(base({ sortie: { type: 'signal', conditions: [] } })).ok);
  v('conditions extra : zone de prix et heures', validerCondition({ type: 'zoneprix', bas: 60000, haut: 65000 }).ok && !validerCondition({ type: 'zoneprix', bas: 65000, haut: 60000 }).ok && validerCondition({ type: 'heures', de: 8, a: 17 }).ok && !validerCondition({ type: 'heures', de: 8, a: 8 }).ok);
  v('filtres : pas de range, heures, risque maximal', (() => { const s = validerStrategie(base({ filtres: { pasRange: true, heures: { de: 7, a: 20 }, risqueMaxPct: 0.5 } })); return s.ok && s.strategie.filtres.pasRange && s.strategie.filtres.heures.de === 7 && s.strategie.filtres.risqueMaxPct === 0.5; })() && !validerStrategie(base({ filtres: { risqueMaxPct: 9 } })).ok);
  v('un champ inconnu est supprimé (jamais appliqué)', !('danger' in validerStrategie({ ...base(), danger: 'x', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 30, evil: 1 }] }).strategie.conditions[0]));
  const d = decrireStrategie(validerStrategie(base({ filtres: { pasRange: true } })).strategie);
  v('description en français : entrée, filtre, stop, sortie', d.length >= 4 && /Entrée si/.test(d.join(' ')) && /Filtre/.test(d.join(' ')) && /Stop/.test(d.join(' ')) && /Sortie/.test(d.join(' ')) && !d.join(' ').match(/undefined|NaN|\[object/), d.join(' | '));
  v('clé de stratégie : insensible au nom, sensible aux règles', cleStrategie(validerStrategie(base()).strategie) === cleStrategie(validerStrategie(base({ nom: 'Autre nom', notes: 'x' })).strategie) && cleStrategie(validerStrategie(base()).strategie) !== cleStrategie(validerStrategie(base({ conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }] })).strategie));
  v('une règle du laboratoire devient une stratégie', depuisRegleLab({ nom: 'Idée', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).ok);
  v('stratégie vide : valeurs par défaut sûres', strategieVide().stop.type === 'atr' && strategieVide().sortie.R === 2);
}

// ── 2. aucun regard vers le futur (poison du futur) ──
const M = marcheMixte(12000, 9), COUPES = [4001, 7003, 10007];
const ctxDe = s => construireContexte(s);
const STRATS = {
  rsi: validerStrategie(base()).strategie,
  ema: validerStrategie(base({ conditions: [{ type: 'ema', tf: 'h1', periode: 50, position: 'avec' }, { type: 'rsi', tf: 'm15', periode: 14, op: '<', seuil: 50 }], cote: 'les-deux' })).strategie,
  cassure: validerStrategie(base({ conditions: [{ type: 'cassure', tf: 'm15', N: 48 }, { type: 'volume', min: 1.2 }], filtres: { pasRange: true } })).strategie,
  heures: validerStrategie(base({ conditions: [{ type: 'heures', de: 13, a: 17 }, { type: 'regime', valeurs: ['haussier', 'range'] }], stop: { type: 'structure', L: 24, pad: 0.3 } })).strategie,
  zone: validerStrategie(base({ conditions: [{ type: 'zoneprix', bas: Math.min(...M.c) * 0.99, haut: Math.max(...M.c) * 1.01 }, { type: 'rsi', tf: 'm15', periode: 14, op: '<', seuil: 40 }], stop: { type: 'fixe', pct: 1.2 } })).strategie
};
for (const [id, strat] of Object.entries(STRATS)) {
  const r = verifierSignaux(s => signauxMS(ctxDe(s), strat), M, COUPES);
  const plein = signauxMS(ctxDe(M), strat); let n = 0; for (let i = 0; i < M.n; i++) if (plein.sens[i]) n++;
  v('signaux « ' + id + ' » : aucune fuite du futur (' + n + ' signaux)', r.ok && n > 5, JSON.stringify(r.violations && r.violations[0]) + ' n=' + n);
}
{
  const f = s => { const c = ctxDe(s), t = signauxMS(c, STRATS.rsi); return { sens: t.sens, stop: t.stop }; };
  const triche = s => { const t = f(s), sens = Int8Array.from(t.sens), st = Float64Array.from(t.stop); for (let i = 0; i < sens.length - 1; i++) if (s.c[i + 1] > s.c[i] * 1.001) { sens[i] = 1; st[i] = s.c[i] * 0.99; } return { sens, stop: st }; };
  const coupesTriche = [4000, 7000, 10000].map(x => { let i = x; while (!(M.c[i + 1] > M.c[i] * 1.001)) i++; return i; });   // coupes placées où la bougie SUIVANTE monte : la triche y laisse une trace
  v('le harnais attrape une stratégie qui triche (signal qui lit la bougie suivante)', !verifierSignaux(triche, M, coupesTriche).ok);
}
// la simulation d'une sortie sur signal ne lit pas le futur : les trades fermés avant la coupe sont identiques sur la série coupée
{
  const strat = validerStrategie(base({ conditions: [{ type: 'rsi', tf: 'm15', periode: 14, op: '<', seuil: 35 }], sortie: { type: 'signal', conditions: [{ type: 'rsi', tf: 'm15', periode: 14, op: '>', seuil: 60 }] } })).strategie;
  const plein = simulerMS(ctxDe(M), strat, {}, {}).trades; let tout = true, compte = 0;
  for (const c of [5001, 8001]) {
    const coupee = couper(M, c), t2 = simulerMS(ctxDe(coupee), strat, {}, {}).trades, t1 = plein.filter(x => x.sortie < c - 1);
    for (const x of t1) { const y = t2.find(z => z.entree === x.entree); if (!y || Math.abs(y.R - x.R) > 1e-9 || y.sortie !== x.sortie) tout = false; compte++; }
  }
  v('sortie sur signal : trades identiques sur la série coupée (' + compte + ' comparés)', tout && compte > 5);
  const motifs = new Set(plein.map(x => x.motif));
  v('sortie sur signal : des sorties « signal » ont lieu', motifs.has('signal'), [...motifs].join());
}

// ── 3. sorties : objectif, suiveur ──
{
  const ctx = ctxDe(M), ob = simulerMS(ctx, STRATS.rsi, {}, {}), su = simulerMS(ctx, validerStrategie(base({ sortie: { type: 'suiveur', k: 3, tf: 'h1' } })).strategie, {}, {});
  v('objectif en R : trades produits, motifs stop / cible / temps', ob.trades.length > 10 && ob.trades.every(x => ['stop', 'cible', 'temps'].includes(x.motif)), String(ob.trades.length));
  v('stop suiveur : trades produits, pas d’objectif fixe', su.trades.length > 10 && su.trades.every(x => x.cible == null), String(su.trades.length));
  v('une position à la fois (pas de chevauchement)', ob.trades.every((x, i) => i === 0 || x.entree > ob.trades[i - 1].sortie));
  v('R cohérents : jamais en dessous de −1 R de plus que les frais et gaps raisonnables', ob.trades.every(x => x.R > -2.5), String(Math.min(...ob.trades.map(x => x.R))));
  const fixe = simulerMS(ctx, validerStrategie(base({ stop: { type: 'fixe', pct: 1.0 } })).strategie, {}, {});
  v('stop fixe : distance du stop ≈ 1 % du prix', fixe.trades.length > 5 && fixe.trades.every(x => Math.abs(x.distancePct - 1) < 0.25), String(fixe.trades[0] && fixe.trades[0].distancePct));
  const court = simulerMS(ctx, validerStrategie(base({ cote: 'short', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 30 }] })).strategie, {}, {});
  v('court : tous les trades sont des ventes, stop au-dessus du prix', court.trades.length > 5 && court.trades.every(x => x.sens === -1 && x.stop > x.prixEntree));
}

// ── 4. test complet : avantage planté / hasard pur ──
const DECOUPE_OK = m => decouper(m);
const planter = marcheM5({ n: 111000, graine: 21, derive: DERIVE_PLANTEE });
const hasardPur = marcheM5({ n: 111000, graine: 33, derive: () => 0 });
const ctxP = ctxDe(planter), ctxH = ctxDe(hasardPur), decP = DECOUPE_OK(planter), decH = DECOUPE_OK(hasardPur);
v('découpe : zone de recherche et jeu final séparés', decP.ok && decP.finA < planter.n && decP.finA / planter.n > 0.7 && decP.finA / planter.n < 0.8);
const avantage = validerStrategie(base({ nom: 'Envolée de 14 h', conditions: [{ type: 'heures', de: 13, a: 14 }], stop: { type: 'atr', tf: 'h1', k: 2 }, sortie: { type: 'cible_R', R: 2 } })).strategie;
const rP = testerStrategie({ ctx: ctxP, strat: avantage, decoupe: decP, nVariantes: 1, tirages: 120 });
v('avantage planté : test réussi, beaucoup de trades', rP.ok && rP.n >= 100, rP.ok ? String(rP.n) : rP.erreur);
v('avantage planté : espérance positive, intervalle au-dessus de zéro', rP.stats.esperance > 0.1 && rP.ic.bas > 0, JSON.stringify([rP.stats.esperance, rP.ic]));
v('avantage planté : bat les entrées aléatoires (centile ≥ 95 %)', rP.hasard && rP.hasard.centile >= 0.95, JSON.stringify(rP.hasard));
v('avantage planté : verdict « bat le hasard » avec une seule variante', rP.verdict.code === 'bat_le_hasard', JSON.stringify(rP.verdict));
v('jeu final NON touché : aucun trade ne démarre après la zone de recherche', rP.trades.every(x => x.entree < decP.finA) && rP.jeuFinalTouche === false);
v('rapport complet : par année, par régime, par bloc, côtés, série de pertes, Monte Carlo, achat-conservation', rP.parAnnee.length >= 2 && rP.parRegime.length >= 1 && rP.blocs.length >= 3 && rP.cotes.long.n === rP.n && rP.serieDePertes >= 0 && rP.mc && rP.achatConservation.rendementPct != null, JSON.stringify([rP.parAnnee.length, rP.parRegime.length, rP.blocs.length, rP.cotes.long.n, rP.n, rP.serieDePertes, !!rP.mc, rP.achatConservation]));
v('statistiques recalculées à la main : somme des R', Math.abs(rP.trades.reduce((s, x) => s + x.R, 0) - rP.stats.Rtotal) < 1e-9 && rP.stats.n === rP.n);
v('série de pertes : calcul exact', serieDePertes([{ R: 1 }, { R: -1 }, { R: -1 }, { R: 2 }, { R: -1 }]) === 2 && serieDePertes([]) === 0);
const r2v = testerStrategie({ ctx: ctxP, strat: avantage, decoupe: decP, nVariantes: 400, tirages: 0 });
v('compteur de variantes : à 400 variantes la barre du Sharpe déflaté monte', r2v.deflate && rP.deflate && r2v.deflate.sr0 > rP.deflate.sr0 && r2v.deflate.dsr <= rP.deflate.dsr, JSON.stringify([rP.deflate && rP.deflate.sr0, r2v.deflate && r2v.deflate.sr0]));
v('sur-ajustement affiché : faible / moyen / élevé selon le nombre de variantes', risqueSurajustement(1).niveau === 'faible' && risqueSurajustement(5).niveau === 'moyen' && risqueSurajustement(12).niveau === 'élevé' && /retouch/.test(risqueSurajustement(12).phrase));
const idee = validerStrategie(base({ conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 30 }, { type: 'ema', tf: 'h4', periode: 50, position: 'avec' }] })).strategie;
const rH = testerStrategie({ ctx: ctxH, strat: idee, decoupe: decH, nVariantes: 1, tirages: 120 });
v('hasard pur : jamais « bat le hasard » (aucun avantage n’existe)', rH.ok && rH.verdict.code !== 'bat_le_hasard', rH.ok ? rH.verdict.code + ' ' + rH.stats.esperance : rH.erreur);
v('hasard pur : l’espérance est négative ou proche de zéro (frais déduits)', rH.stats.esperance < 0.15, String(rH.stats.esperance));
const rare = testerStrategie({ ctx: ctxH, strat: validerStrategie(base({ conditions: [{ type: 'rsi', tf: 'h4', periode: 14, op: '<', seuil: 10 }, { type: 'volume', min: 5 }] })).strategie, decoupe: decH, nVariantes: 1, tirages: 0 });
v('peu de trades : « pas assez de trades pour conclure »', rare.ok && rare.n < SEUILS_MS.tradesMin && rare.verdict.code === 'pas_assez' && /au moins/.test(rare.verdict.raisons[0]), rare.ok ? rare.n + ' ' + rare.verdict.code : rare.erreur);
v('verdict : « ne bat pas » dit POURQUOI (raisons chiffrées)', (() => { const x = verdictMS({ stats: { n: 200, esperance: -0.1 }, ic: { bas: -0.2, haut: 0 }, hasard: { centile: 0.3 }, deflate: { dsr: 0.1 }, nVariantes: 7 }); return x.code === 'ne_bat_pas' && x.raisons.length === 4 && x.raisons.every(t => /\d/.test(t)); })());
v('verdict : aucune phrase ne contient undefined / NaN / [object Object]', [rP.verdict, rH.verdict, rare.verdict].every(x => !JSON.stringify(x).match(/undefined|NaN|\[object/)));
// reproductibilité : même stratégie, mêmes données, même graine → même rapport
{ const a = testerStrategie({ ctx: ctxP, strat: avantage, decoupe: decP, nVariantes: 1, tirages: 60, graine: 5 }), b = testerStrategie({ ctx: ctxDe(planter), strat: avantage, decoupe: decP, nVariantes: 1, tirages: 60, graine: 5 });
  v('reproductible : mêmes trades, même centile', a.n === b.n && a.stats.Rtotal === b.stats.Rtotal && a.hasard.centile === b.hasard.centile); }
// l'avantage vient-il des FILTRES ? « Achète à 13 h » (filtre) bat le hasard pur ; limité à ses filtres, le hasard fait aussi bien
{
  const parFiltre = validerStrategie(base({ nom: 'À 13 h', conditions: [], filtres: { heures: { de: 13, a: 14 } }, stop: { type: 'atr', tf: 'h1', k: 2 } })).strategie, r = testerStrategie({ ctx: ctxP, strat: parFiltre, decoupe: decP, nVariantes: 1, tirages: 80 });
  v('avantage porté par un FILTRE horaire : bat le hasard pur (toute bougie)', r.ok && r.hasard.centile >= 0.95 && r.verdict.code === 'bat_le_hasard', r.ok ? JSON.stringify([r.n, r.hasard, r.verdict.code]) : r.erreur);
  v('… mais pas le hasard limité aux mêmes heures : l’interface peut dire que l’avantage vient des filtres', r.hasardFiltres && r.hasardFiltres.centile < 0.95, JSON.stringify(r.hasardFiltres));
  v('sans filtre : pas de comparaison « limitée aux filtres »', rP.hasardFiltres === null);
}
// historique trop court
v('historique trop court : refus clair', !testerStrategie({ ctx: ctxDe(M), strat: STRATS.rsi, decoupe: decouper(M), nVariantes: 1 }).ok);

// ── 5. paires groupées, capital, simulation prop ──
{
  const g = grouperPaires({ BTC: rP, SOL: rH, DOGE: { ok: false } });
  v('groupe : deux paires utilisables, trades mis bout à bout, positives listées', g && g.paires.length === 2 && g.n === rP.n + rH.n && g.positives.includes('BTC'));
  v('groupe : aucune paire utilisable → null', grouperPaires({ BTC: { ok: false } }) === null);
  const cc = courbesCapital(rP.trades, { capital: 10000, risques: [0.25, 0.5, 1] });
  v('capital : trois risques, creux croissant avec le risque, courbe tracée', cc.length === 3 && cc[0].pireCreuxPct <= cc[1].pireCreuxPct + 1e-9 && cc[1].pireCreuxPct <= cc[2].pireCreuxPct + 1e-9 && cc[0].points.length > 5);
  const sp = simulationProp(rP.trades, { risques: [0.25, 0.5, 1] });
  v('prop : probabilités de toucher le jour (−3 %), le creux (−6 %) et d’atteindre +10 % avant', sp.ok && sp.niveaux.length === 3 && sp.niveaux.every(x => x.pObjectif.moy >= 0 && x.pObjectif.moy <= 1 && x.pDrawdown.moy >= 0 && x.pJour.moy >= 0) && sp.niveaux[0].avecGarde, sp.ok ? '' : sp.erreur);
  v('prop : moins de 8 trades → refus clair', !simulationProp([{ R: 1, t: 0, tSortie: 1 }]).ok);
}

console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
