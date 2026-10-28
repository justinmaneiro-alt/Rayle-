import { fusionConfig, ouvrirPosition, evaluerBougie, resultatPosition } from '../planetes/mars/pc/agent-btc/moteur.js';
import { cleParams } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { sprt, voieClassique, regrouper, SPRT } from './sequentiel.js';
import { CRITERES3 } from './criteres-v3.js';

/* ═════════════ LA PÉPINIÈRE LIVE (V4, phase 7 ; module pur, testé : galaxie/tests/pepiniere-test.mjs) ═════════════
   Jusqu'à 50 candidates tournent EN PARALLÈLE en simulation (paper trading) sur le marché RÉEL : chacune a ses entrées et sorties enregistrées, avec les MÊMES frais, spread et glissement que le backtest (briques
   de moteur.js). C'est ainsi qu'on accumule de vrais trades HORS ÉCHANTILLON sans attendre le passé. Deux sortes de candidates :
   · « historique » : une famille (V3, V4, hypothèse du Chercheur) + ses paramètres ; ses trades viennent du compte simulé du service (surveillance-commune.js) sur les bougies M15 fermées ;
   · « carnet » : une des 5 familles du carnet d'ordres (familles-carnet.js) ; ses entrées viennent des propositions de la carte de liquidité, simulées sur les barres d'une minute enregistrées.
   Chaque candidate est jugée par le test séquentiel (sequentiel.js, voie supplémentaire « à valider par Justin ») ; la voie classique reste intacte. Rien n'est un ordre ; la simulation de 4 semaines OU 30 trades
   avant toute alerte d'entrée réelle (criteres-v3) est CONSERVÉE : une acceptation séquentielle ne la remplace pas. */
export const PEPINIERE = Object.freeze({ max: 50, semainesMin: CRITERES3.simulationDirect.semainesMin, tradesMin: CRITERES3.simulationDirect.tradesMin, maxBarres1m: 180 });
export const etatPepiniereVide = () => ({ version: 1, candidates: [], vus: {}, K: 0, journal: [] });
export const idCandidate = c => c.famille + ':' + c.paire + ':' + (c.type === 'carnet' ? 'carnet' : cleParams(c.params || {}));
const noter = (pep, t, texte) => { pep.journal.push({ t, texte: String(texte).slice(0, 220) }); if (pep.journal.length > 300) pep.journal.splice(0, pep.journal.length - 300); };

/* Ajoute une candidate (jamais deux fois : `vus` garde tout ce qui est passé par la pépinière, y compris les retirées ; K = nombre de comparaisons, ne baisse jamais). Si la pépinière est pleine, on
   remplace la moins prometteuse seulement si elle a déjà `tradesMin` trades et une moyenne ≤ 0 ; sinon la nouvelle attend. Rend { ok, raison }. */
export function ajouterCandidate(pep, c, t = Date.now()) {
  const id = idCandidate(c); if (pep.vus[id]) return { ok: false, raison: 'déjà passée par la pépinière' };
  const actives = pep.candidates.filter(x => x.statut === 'active');
  if (actives.length >= PEPINIERE.max) {
    const pire = actives.filter(x => x.trades.length >= PEPINIERE.tradesMin && moyenne(x.trades) <= 0).sort((a, b) => moyenne(a.trades) - moyenne(b.trades))[0];
    if (!pire) return { ok: false, raison: 'pépinière pleine (' + PEPINIERE.max + ') : aucune candidate à remplacer' };
    pire.statut = 'retiree'; pire.raisonFin = 'remplacée (moyenne ≤ 0 après ' + pire.trades.length + ' trades)'; pire.fin = t; noter(pep, t, pire.nom + ' ' + pire.paire + ' retirée pour faire de la place.');
  }
  pep.vus[id] = t; pep.K++;
  pep.candidates.push({ id, famille: c.famille, params: c.params || {}, paire: c.paire, nom: c.nom || c.famille, source: c.source || 'recherche', type: c.type || 'historique', debut: t, statut: 'active', trades: [], position: null, pendante: null, suivi: null, sprt: null });
  noter(pep, t, 'entrée en pépinière : ' + (c.nom || c.famille) + ' ' + c.paire + ' (' + (c.source || 'recherche') + ').'); return { ok: true, id };
}
export const moyenne = trades => (trades.length ? trades.reduce((a, x) => a + x.R, 0) / trades.length : null);

/* Candidates à partir des résultats de la recherche (backtests NON validés mais prometteurs : espérance > 0,10 R hors échantillon, ≥ 60 trades, sans fuite du futur) : elles gagnent le droit d'être
   regardées en direct, jamais celui d'être traitées comme validées. */
export function candidatesDepuisRecherche(etatAgent, { max = 30 } = {}) {
  const liste = (etatAgent.backtests || []).filter(b => b.statut === 'non_validee' && b.retenus && b.esperance > 0.10 && b.trades >= 60 && !(b.ratees || []).some(x => /Causalité/.test(x)));
  liste.sort((a, b) => b.esperance - a.esperance); const vus = new Set(), out = [];
  for (const b of liste) { const k = b.famille + b.paire + cleParams(b.retenus); if (vus.has(k)) continue; vus.add(k); out.push({ famille: b.famille, params: b.retenus, paire: b.paire, nom: b.nom || b.famille, source: 'recherche (non validée : à surveiller)', type: 'historique' }); if (out.length >= max) break; }
  return out;
}
export const candidatesCarnet = (familles, paires) => familles.flatMap(f => paires.map(p => ({ famille: f, params: {}, paire: p, nom: f, source: 'carnet d’ordres', type: 'carnet' })));

/* ── Trades : historiques (venant du compte simulé du service) ── */
export function integrerTradesHistoriques(cand, tradesSuivi) {
  let n = 0; const vus = new Set(cand.trades.map(x => x.tSortie));
  for (const x of tradesSuivi || []) if (!vus.has(x.tSortie)) { cand.trades.push({ t: x.t, tSortie: x.tSortie, sens: x.sens, R: x.R, motif: x.motif }); vus.add(x.tSortie); n++; }
  return n;
}
/* ── Trades carnet : simulation papier sur des barres d'une minute { t, o, h, l, c } avec les briques du moteur (même exécution que le backtest). `proposition` = sortie de familles-carnet. ── */
export function proposerEntreePapier(cand, proposition, t) {
  if (cand.position || cand.pendante) return false; if (cand.dernierSignal && t - cand.dernierSignal < 15 * 60e3) return false;                // pas de rafale : 15 minutes entre deux entrées
  cand.pendante = { sens: proposition.sens, stop: proposition.stop, R: proposition.R, t, raison: proposition.raison }; cand.dernierSignal = t; return true;
}
export function avancerPapier(cand, barre, config = {}) {
  const cfg = fusionConfig({ maxBarres: PEPINIERE.maxBarres1m, distanceMinPct: 0.10, ...config }); const clos = [];
  if (cand.pendante && barre.t > cand.pendante.t) {                                                                    // entrée à l'ouverture de la barre SUIVANTE
    const p = ouvrirPosition(cfg, cand.pendante.sens, barre.o, cand.pendante.stop, cand.pendante.R); if (p) cand.position = { ...p, tEntree: barre.t, barres: 0 }; cand.pendante = null;
  }
  if (cand.position) {
    cand.position.barres++; const ex = evaluerBougie(cfg, cand.position, barre, cand.position.barres === 1, cand.position.barres);
    if (ex) { const r = resultatPosition(cfg, cand.position, ex.prix), tr = { t: cand.position.tEntree, tSortie: barre.t, sens: cand.position.s, R: r.R, motif: ex.motif }; cand.trades.push(tr); clos.push(tr); cand.position = null; }
  }
  return clos;
}

/* ── Jugement : test séquentiel pour chaque candidate active ; retrait des perdantes ; acceptation (voie supplémentaire) seulement après la simulation de 4 semaines ET 30 trades au moins. ── */
export function evaluer(pep, t = Date.now()) {
  const changements = [];
  for (const c of pep.candidates) {
    if (c.statut !== 'active' && c.statut !== 'acceptee_sequentielle') continue; const R = c.trades.map(x => x.R), s = sprt(R, { K: pep.K }), semaines = (t - c.debut) / (7 * 86400e3);
    c.sprt = { decision: s.decision, llr: s.llr, A: s.A, B: s.B, n: s.n, moyenne: s.moyenne, raison: s.raison, sigma: s.sigma, K: s.K, alpha: s.alpha }; c.semaines = semaines; c.classique = voieClassique(R);
    if (c.statut === 'active' && s.decision === 'rejeter' && s.n >= 10) { c.statut = 'retiree'; c.raisonFin = 'test séquentiel : ' + s.raison; c.fin = t; changements.push({ id: c.id, type: 'retiree', texte: c.nom + ' ' + c.paire + ' retirée : ' + s.raison }); noter(pep, t, c.nom + ' ' + c.paire + ' retirée (séquentiel) : ' + s.raison); }
    else if (c.statut === 'active' && s.decision === 'accepter' && semaines >= PEPINIERE.semainesMin && s.n >= PEPINIERE.tradesMin) { c.statut = 'acceptee_sequentielle'; c.accepteeLe = t; changements.push({ id: c.id, type: 'acceptee', texte: c.nom + ' ' + c.paire + ' : avantage prouvé par le test séquentiel après ' + s.n + ' trades simulés (voie supplémentaire, À VALIDER PAR JUSTIN ; critères intacts).' }); noter(pep, t, c.nom + ' ' + c.paire + ' acceptée par la voie séquentielle (' + s.n + ' trades).'); }
  }
  return changements;
}
/* Regroupement par IDÉE : même famille et mêmes paramètres sur les trois actifs → résultat par actif + éventuellement un résultat groupé jugé par le même test séquentiel. */
export function regroupements(pep, actifs = ['BTC', 'SOL', 'DOGE']) {
  const idees = new Map(); for (const c of pep.candidates) { if (c.type === 'carnet') continue; const k = c.famille + ':' + cleParams(c.params); const e = idees.get(k) || { famille: c.famille, nom: c.nom, params: c.params, par: {} }; e.par[c.paire] = c; idees.set(k, e); }
  const out = []; for (const e of idees.values()) { if (!actifs.every(a => e.par[a])) continue; const trades = Object.fromEntries(actifs.map(a => [a, e.par[a].trades.map(x => x.R)])), g = regrouper(trades, { actifs }); out.push({ famille: e.famille, nom: e.nom, parActif: g.parActif, regroupe: g.ok, raison: g.raison, sprt: g.ok ? sprt(g.R, { K: pep.K }) : null }); }
  return out;
}
export function resumePepiniere(pep, t = Date.now()) {
  const actives = pep.candidates.filter(c => c.statut === 'active'), acc = pep.candidates.filter(c => c.statut === 'acceptee_sequentielle'), ret = pep.candidates.filter(c => c.statut === 'retiree');
  return { actives: actives.length, acceptees: acc.length, retirees: ret.length, max: PEPINIERE.max, K: pep.K, tradesTotal: pep.candidates.reduce((a, c) => a + c.trades.length, 0),
    candidates: pep.candidates.map(c => ({ id: c.id, nom: c.nom, paire: c.paire, type: c.type, source: c.source, statut: c.statut, trades: c.trades.length, moyenne: moyenne(c.trades), jours: Math.floor((t - c.debut) / 86400e3), decision: c.sprt && c.sprt.decision, llr: c.sprt && c.sprt.llr, seuilAccepter: c.sprt && c.sprt.A, seuilRejeter: c.sprt && c.sprt.B, raisonFin: c.raisonFin || null })),
    lignes: ['La pépinière suit ' + actives.length + ' candidate(s) en simulation sur le marché réel (' + PEPINIERE.max + ' au plus), avec les mêmes frais que le backtest.', pep.candidates.reduce((a, c) => a + c.trades.length, 0) + ' trades simulés au total ; ' + acc.length + ' acceptée(s) par le test séquentiel (voie supplémentaire, à valider par Justin), ' + ret.length + ' retirée(s).', 'Ce sont des trades SIMULÉS : aucun ordre n’est passé, et le test séquentiel ne remplace aucun critère.'] };
}
export { SPRT };
