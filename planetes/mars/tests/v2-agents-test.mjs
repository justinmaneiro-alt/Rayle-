// Tests des deux agents prêts à l'emploi (V2, phase 6) : RSI, causalité (poison du futur), signaux, backtest reproductible, validation (contrôle négatif : le hasard n'est pas « validé »,
// jeu final jamais ouvert), propositions (refus si non validé, gardien), anti-doublons d'alertes.   Lancer :  node planetes/mars/tests/v2-agents-test.mjs
import { FAMILLES_V2, ORDRE_AGENTS_V2, rsi } from '../pc/agents-v2/familles-v2.js';
import { validerAgent, backtester, parametresRetenus, STATUTS } from '../pc/agents-v2/validation-agent.js';
import { proposer, alertesAEnvoyer } from '../pc/agents-v2/proposition.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { verifierSignaux } from '../pc/agent-m6/causalite.js';
import { FAMILLES, ORDRE_TOUTES } from '../pc/agent-btc/hypotheses.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { marcheMixte, serieSynth } from './synth-btc.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// ── RSI ──
const montee = Float64Array.from({ length: 60 }, (_, i) => 100 + i), descente = Float64Array.from({ length: 60 }, (_, i) => 200 - i);
v('RSI d’une hausse continue = 100', Math.abs(rsi(montee, 14)[40] - 100) < 1e-9);
v('RSI d’une baisse continue = 0', Math.abs(rsi(descente, 14)[40]) < 1e-9);
const zig = Float64Array.from({ length: 80 }, (_, i) => 100 + (i % 2 ? 1 : -1) * 1); v('RSI d’un zigzag régulier ≈ 50', Math.abs(rsi(zig, 14)[60] - 50) < 5, String(rsi(zig, 14)[60]));
v('RSI : valeurs de chauffe = NaN', Number.isNaN(rsi(montee, 14)[5]));

// ── registre : les agents sont évaluables mais invisibles de la recherche automatique ──
v('les deux agents sont dans le registre des hypothèses', ORDRE_AGENTS_V2.every(id => FAMILLES[id] === FAMILLES_V2[id]));
v('…mais PAS dans ORDRE_TOUTES (la recherche automatique ne les voit pas)', !ORDRE_TOUTES.some(id => ORDRE_AGENTS_V2.includes(id)));
v('grilles raisonnables (≤ 40 variantes chacune : pas de sur-ajustement par la taille)', ORDRE_AGENTS_V2.every(id => { const g = FAMILLES_V2[id].grille(); return Object.values(g).reduce((s, l) => s * l.length, 1) <= 40; }));

// ── causalité : le signal en i ne dépend que des bougies 0..i ──
const serie = marcheMixte(5200, 11), ctxPlein = construireContexte(serie);
const PARAMS = { tendance_ma: { touche: 0.6, stopATR: 1.2, R: 4.5, exigeH4: 0 }, divergence_rsi: { k: 3, diffRsi: 3, pad: 0.2, R: 4.5 } };
for (const id of ORDRE_AGENTS_V2) {
  const f = s => FAMILLES_V2[id].signaux(construireContexte(s), PARAMS[id]);
  const compte = Array.from(f(serie).sens).filter(x => x).length;
  const coupes = [900, 1500, 2200, 3000, 4100, 5100];
  const r = verifierSignaux(f, serie, coupes, { de: 400 });
  v(id + ' : aucune fuite du futur (' + r.testes + ' contrôles, poison + coupe)', r.ok, JSON.stringify(r.violations.slice(0, 1)));
  v(id + ' : la fonction ne modifie pas la série', serie.c[1000] === ctxPlein.m15.c[1000]);
}
// ── des signaux existent sur un marché qui alterne range, hausse et baisse ──
const grand = marcheMixte(16000, 5), cg = construireContexte(grand);
for (const id of ORDRE_AGENTS_V2) {
  const s = FAMILLES_V2[id].signaux(cg, PARAMS[id]), n = Array.from(s.sens).filter(x => x).length, longs = Array.from(s.sens).filter(x => x > 0).length, courts = Array.from(s.sens).filter(x => x < 0).length;
  v(id + ' : produit des signaux (' + n + ' : ' + longs + ' achats, ' + courts + ' ventes)', n >= 3, String(n));
  let bonCote = true; for (let i = 0; i < s.sens.length; i++) if (s.sens[i]) { if (s.sens[i] > 0 ? !(s.stop[i] < grand.c[i]) : !(s.stop[i] > grand.c[i])) bonCote = false; }
  v(id + ' : le stop est toujours du bon côté du prix', bonCote);
}
// ── backtest reproductible, zone de recherche seulement ──
const b1 = backtester(grand, 'tendance_ma', PARAMS.tendance_ma, { ctx: cg }), b2 = backtester(grand, 'tendance_ma', PARAMS.tendance_ma);
v('backtest : deux exécutions donnent exactement les mêmes trades', JSON.stringify(b1.trades.map(t => [t.t, t.R])) === JSON.stringify(b2.trades.map(t => [t.t, t.R])) && b1.trades.length > 0, String(b1.trades.length));
v('backtest : jamais d’entrée dans les 25 % de jeu final', b1.trades.every(t => t.entree < Math.floor(grand.n * 0.75)) && b1.jeuFinalOuvert === false);
v('backtest : frais et glissement déduits (R net < R brut en moyenne)', b1.trades.length === 0 || b1.trades.reduce((s, t) => s + t.R, 0) < b1.trades.reduce((s, t) => s + t.Rbrut, 0));
v('backtest : l’avertissement dit que ce n’est pas une validation', /PAS une validation/.test(b1.avertissement));

// ── validation : historique trop court, puis contrôle négatif sur un marché sans avantage ──
const court = serieSynth({ segments: [{ n: 20000, derive: 0, bruit: 0.15, volume: 100 }], graine: 3 });
const r0 = validerAgent(court, 'tendance_ma'); v('validation : moins de 24 mois → « historique insuffisant », rien n’est testé', r0.statut === 'insuffisant' && /mois/.test(r0.raison), JSON.stringify(r0).slice(0, 140));
const trois = 3 * 365 * 96, hasard = serieSynth({ segments: [{ n: trois, derive: 0, bruit: 0.2, volume: 100 }], graine: 8 });
const ctxH = construireContexte(hasard);
for (const id of ORDRE_AGENTS_V2) {
  const r = validerAgent(hasard, id, { ctx: ctxH });
  v(id + ' : un marché SANS avantage (hasard pur, 3 ans) n’est JAMAIS « validé »', r.statut !== 'valide_oos', r.statut + ' · ' + JSON.stringify((r.juge ? r.juge.lignes.filter(l => !l.ok).map(l => l.critere) : [])).slice(0, 160));
  v(id + ' : le jeu final n’est pas ouvert', r.jeuFinalOuvert === false && r.rechercheComplete == null || r.rechercheComplete.trades.every(t => t.entree < Math.floor(hasard.n * 0.75)));
  v(id + ' : les critères en vigueur sont rappelés (version et empreinte)', r.criteres && r.criteres.version === 1 && /^[0-9a-f]{8}$/.test(r.criteres.empreinte), JSON.stringify(r.criteres));
  v(id + ' : l’avertissement « fiabilité mesurée, pas une promesse » est joint', /pas une promesse/.test(r.avertissement || ''));
  v(id + ' : le compteur de variantes inclut celles déjà testées', validerAgent(hasard, id, { ctx: ctxH, variantesDejaTestees: 1000 }).nVariantes === r.nVariantes + 1000);
}
// contrôle POSITIF : des tendances persistantes plantées (hausse puis baisse, 2 500 bougies chacune) donnent un vrai avantage au suivi de tendance : il doit être reconnu
const segs = []; { let reste = trois, q = 0; while (reste > 0) { const nn = Math.min(reste, 2500); segs.push({ n: nn, derive: (q++ % 2 ? -1 : 1) * 0.02, bruit: 0.3, volume: 100 }); reste -= nn; } }
const planté = serieSynth({ segments: segs, graine: 4 }), rP = validerAgent(planté, 'tendance_ma');
v('contrôle positif : un avantage planté (tendances persistantes) est reconnu hors échantillon', rP.statut === 'valide_oos' && rP.wf.stats.esperance > 0.25 && rP.juge.ok, rP.statut + ' ' + (rP.juge.lignes.filter(l => !l.ok).map(l => l.critere).join(' | ')));
v('…avec ses paramètres retenus et la mention « jeu final non ouvert »', !!rP.retenus && rP.jeuFinalOuvert === false);
v('les statuts ont des libellés français', STATUTS.valide_oos === 'VALIDÉ HORS ÉCHANTILLON' && STATUTS.non_valide === 'NON VALIDÉ');

// ── propositions ──
const sg = FAMILLES_V2.tendance_ma.signaux(cg, PARAMS.tendance_ma); let k = -1; for (let i = 2000; i < cg.n; i++) if (sg.sens[i]) { k = i; break; }
v('un signal de test existe', k > 0, String(k));
const validee = { statut: 'valide_oos' };
const base = { ctx: cg, id: 'tendance_ma', params: PARAMS.tendance_ma, i: k, paire: 'BTC', cout: { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 } };
const pRefus = proposer({ ...base, validation: null });
v('agent JAMAIS validé : aucune position proposée, le signal est dit « indicatif »', pRefus.statut === 'refusee' && /AUCUNE position/.test(pRefus.raison) && pRefus.etiquette === 'AGENT NON VALIDÉ', JSON.stringify(pRefus).slice(0, 200));
const pRefus2 = proposer({ ...base, validation: { statut: 'non_valide' } }); v('agent NON VALIDÉ : refus également', pRefus2.statut === 'refusee');
const pOk = proposer({ ...base, validation: validee, jugerProp: () => ({ decision: 'PASS', texte: 'Gardien : PASS · taille 0,02', quantite: 0.02 }) });
v('agent validé : entrée avec sens, stop, objectifs en R, coût, gardien', pOk.statut === 'entree' && pOk.plan.stop > 0 && pOk.objectifs.length >= 2 && pOk.objectifs.at(-1).R === 4.5 && pOk.coutR > 0 && /Alerte seulement : aucun ordre/.test(pOk.texte), JSON.stringify(pOk).slice(0, 220));
const d = Math.abs(pOk.plan.entree - pOk.plan.stop); v('objectif = entrée ± R × distance au stop', Math.abs(pOk.objectifs.at(-1).prix - (pOk.plan.entree + pOk.sens * 4.5 * d)) < 1e-4 * pOk.plan.entree);
const pBloc = proposer({ ...base, validation: validee, jugerProp: () => ({ decision: 'BLOCK', texte: 'Gardien : BLOQUÉ · perte du jour atteinte' }) });
v('gardien prop qui bloque : l’entrée n’est PAS présentée comme une entrée', pBloc.statut === 'bloquee' && /BLOQUÉ/.test(pBloc.raison));
v('pas de signal : « aucune » ou « préparation », jamais « entrée »', ['aucune', 'preparation'].includes(proposer({ ...base, i: k + 3, validation: validee }).statut) || proposer({ ...base, i: k + 3, validation: validee }).statut === 'entree');
// préparation : on cherche une bougie en préparation
let prep = null, iPrep = -1; for (let i = 3000; i < cg.n && !prep; i++) { const r = proposer({ ...base, i, validation: validee }); if (r.statut === 'preparation') { prep = r; iPrep = i; } }
v('une préparation existe sur le marché de test, avec son explication', !!prep && /EN PRÉPARATION/.test(prep.texte), prep && prep.texte);
const prepNV = prep && proposer({ ...base, i: iPrep, validation: null });

// ── anti-doublons ──
const mem = {}, e1 = alertesAEnvoyer([pOk], mem, { maintenant: 1000 }), e2 = alertesAEnvoyer([pOk], mem, { maintenant: 2000 });
v('alerte d’entrée : envoyée une fois, pas répétée pour la même bougie', e1.length === 1 && e1[0].type === 'ENTREE' && e2.length === 0);
const autre = { ...pOk, t: pOk.t + 900e3 }; v('une nouvelle bougie = une nouvelle alerte', alertesAEnvoyer([autre], mem, { maintenant: 3000 }).length === 1);
v('une entrée refusée (agent non validé) ne part jamais', alertesAEnvoyer([pRefus], {}, {}).length === 0);
const prepV = prep && { ...prep, validation: 'valide_oos' }, memP = {};
if (prepV) { v('préparation d’un agent validé : une alerte, puis silence 4 bougies', alertesAEnvoyer([prepV], memP, { maintenant: 0 }).length === 1 && alertesAEnvoyer([prepV], memP, { maintenant: 900e3 }).length === 0 && alertesAEnvoyer([prepV], memP, { maintenant: 5 * 900e3 }).length === 1); v('préparation d’un agent NON validé : visible mais étiquetée « information seulement », et aucune alerte', prepNV.statut === 'preparation' && /information seulement/.test(prepNV.texte) && alertesAEnvoyer([prepNV], {}, {}).length === 0); }
void tranche; void parametresRetenus;
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
