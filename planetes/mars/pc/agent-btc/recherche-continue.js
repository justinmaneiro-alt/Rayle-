import { CRITERES2, lignesM5, avancement } from './criteres-v2.js';
import { empreinteCriteres } from './criteres.js';
import { construireContexte } from './contexte.js';
import { alignerDeriv } from './micro-mesures.js';
import { FAMILLES, cleParams, voisins } from './hypotheses.js';
import { evaluerVariante, jugerHorsEchantillon, jugerJeuFinal, monteCarlo, robustesse as robustesseFamille, score, seuilComparaisonsMultiples, statsSur, walkForward } from './evaluation.js';
import { simuler, statistiques } from './moteur.js';
import { chantierDuNiveau, NB_CHANTIERS, NIVEAUX } from './familles-m5.js';
import { cleRegle, decrireRegle, regleAleatoire, validerRegle, voisinsRegle } from './regles-lab.js';
import { enrichirTrades } from './contexte-trades.js';
import { intervalleEsperance, sharpeDeflate } from './stats-m5.js';
import { correlations } from './portefeuille.js';
import { appliquerContraintes, uniteAutorisee } from './profil-agent.js';
import { chantiersICT } from '../agent-m6/ict.js';              // M6 : enregistre aussi les familles ICT et figures dans le registre du moteur (utile dans le Worker de calcul)

/* ═════════════ RECHERCHE SANS FIN (M5 ; module pur, testé : m5-recherche-test.mjs) ═════════════
   L'agent cherche TANT QUE l'objectif n'est pas atteint (nombre de stratégies validées et complémentaires = cible du profil, 3 par défaut, 5 au plus), par tranches de budget, en reprenant
   exactement où il s'était arrêté (l'état est un objet JSON : stocké dans le navigateur ou dans un fichier du Veilleur). Il élargit ses familles par NIVEAUX (familles-m5.js) puis génère des règles
   aléatoires à l'infini. Aucun appel à l'IA.
   PROTOCOLE (identique pour tout chantier, y compris une idée de l'utilisatrice) :
   1. Dépistage sur les premiers 45 % de la zone de recherche SEULEMENT : le meilleur jeu de paramètres doit avoir ≥ 30 trades, une espérance ≥ +0,1 R et un facteur de profit ≥ 1,05.
   2. Walk-forward sur la SUITE de la zone (blocs de 6 mois jamais vus par le dépistage ; paramètres rechoisis à chaque bloc sur l'entraînement seulement), tous les blocs bout à bout.
   3. Juge : TOUS les critères de la version 1 (au moins aussi stricts) + objectif +20 R sur ≥ 150 trades + intervalle de confiance + Sharpe déflaté avec le nombre TOTAL de variantes testées
      (cumulé depuis le début, jamais remis à zéro) + Monte Carlo + robustesse des paramètres voisins.
   4. Jeu final (les derniers 25 % des données) ouvert UNE fois par stratégie ; il est partagé par plusieurs candidates : la k-ième ouverture exige en plus une espérance au-dessus du maximum
      attendu du hasard parmi k ouvertures ; après 5 ouvertures la fenêtre est épuisée et il faut 6 mois de données fraîches (voir `decouperM5`).
   5. Validation = tous les critères ET jeu final. Sinon rejet. Les seuils ne sont JAMAIS modifiés pour sauver un candidat. */
const MOIS_MS = 30.4375 * 86400e3, PAS = 900e3;
const indexDepuis = (t, x) => { let a = 0, b = t.length; while (a < b) { const m = (a + b) >> 1; if (t[m] < x) a = m + 1; else b = m; } return a; };
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const FRACTION_DEPISTAGE = 0.45;                  // part de la zone de recherche réservée au dépistage ; le walk-forward ne commence qu'APRÈS
export const OUVERTURES_PAR_FENETRE = CRITERES2.jeuFinalPartage.ouverturesMax;

export function etatInitial() {
  return { version: 1, creeLe: null, niveau: 0, curseur: 0, graine: 1, N: 0, compteurs: {}, finalistes: [], presque: [], pistes: [], idees: [], strategiesValidees: 0, objectifAtteint: false, termine: false, journalCourt: [], registreNiveaux: [], dernierChantier: null, miseAJourLe: null,
    file: [], ictFait: false, focus: null, pivots: [], suivi: [] };         // M6 : file de chantiers prioritaires (ICT, résiduels), focus de tirage après un pivot, journal des pivots, suivi de la progression pour la stagnation
}

/* Découpage M5 : zone de recherche A, dépistage [0, finS), blocs du walk-forward de finS à finA, jeu final [finA, n). `coffre.ouverts` = ouvertures déjà faites. */
export function decouperM5(m15, coffre = { ouverts: [] }, c = CRITERES2) {
  const n = m15.n, t = m15.t, d = c.decoupage, t0 = t[0], t1 = t[n - 1] + PAS, mois = (t1 - t0) / MOIS_MS;
  if (mois < d.moisMinHistorique) return { ok: false, raison: 'Historique de ' + fmt(mois, 1) + ' mois : il en faut au moins ' + d.moisMinHistorique + '.' };
  const ouverts = (coffre && coffre.ouverts) || [];
  let debutFinal = t[Math.floor(n * d.fractionRecherche)], ouverturesFenetre = 0, brule = null;
  if (ouverts.length) {
    const dernier = ouverts.reduce((a, o) => (o.debut >= a.debut ? o : a)), memes = ouverts.filter(o => o.debut === dernier.debut);
    if (memes.length >= c.jeuFinalPartage.ouverturesMax) {                                       // fenêtre épuisée : il faut des données fraîches
      const tB = Math.max(...memes.map(o => o.fin)), moisFrais = (t1 - tB) / MOIS_MS; brule = dernier;
      if (moisFrais < 6) return { ok: true, n, jeuFinal: null, attente: { jusquau: tB + 6 * MOIS_MS, moisFrais }, ...zones(m15, indexDepuis(t, tB), c), brule };
      debutFinal = tB;
    } else { debutFinal = dernier.debut; ouverturesFenetre = memes.length; }
  }
  const finA = indexDepuis(t, debutFinal), z = zones(m15, finA, c);
  if (z.moisZoneA < d.moisMinHistorique) return { ok: false, raison: 'Zone de recherche de ' + fmt(z.moisZoneA, 1) + ' mois seulement : le jeu final consommé laisse trop peu de données (il en faut ' + d.moisMinHistorique + ').' };
  return { ok: true, n, jeuFinal: [finA, n], debutFinal, moisFinal: (t1 - debutFinal) / MOIS_MS, ouverturesFenetre, brule, ...z };
}
function zones(m15, finA, c) {
  const t = m15.t, t0 = t[0], tA = t[Math.min(finA, m15.n - 1)], moisA = (tA - t0) / MOIS_MS, finS = Math.floor(finA * FRACTION_DEPISTAGE), tS = t[finS], folds = [];
  let debutTest = tS;
  while (debutTest < tA - 1) {
    const finTest = Math.min(tA, debutTest + c.decoupage.blocTestMois * MOIS_MS);
    if (finTest - debutTest >= c.decoupage.blocTestMois * MOIS_MS * 0.5) { const i0 = indexDepuis(t, debutTest), i1 = finTest >= tA ? finA : indexDepuis(t, finTest); folds.push({ train: [0, i0], test: [i0, i1], debutTest, finTest }); }
    debutTest = finTest;
  }
  return { finA, finS, folds, moisZoneA: moisA, moisDepistage: (tS - t0) / MOIS_MS, moisWalkForward: moisA - (tS - t0) / MOIS_MS };
}

const compact = st => st && ({ n: st.n, esperance: st.esperance, factProfit: Number.isFinite(st.factProfit) ? st.factProfit : null, tauxReussite: st.tauxReussite, ddR: st.ddR, Rtotal: st.Rtotal, parSemaine: st.parSemaine, ecartType: st.ecartType });
const compacterTrades = (trades) => trades.map(x => ({ t: x.t, tSortie: x.tSortie, signal: x.signal, entree: x.entree, sortie: x.sortie, sens: x.sens, prixEntree: x.prixEntree, stop: x.stop, cible: x.cible, prixSortie: x.prixSortie, motif: x.motif, R: x.R, barres: x.barres, phase: x.phase, phaseH4: x.phaseH4, regime: x.regime, session: x.session, vol: x.vol, jour: x.jour, saison: x.saison, trimestre: x.trimestre, annee: x.annee, volRel: x.volRel, deltaSens: x.deltaSens }));
/* Évaluation d'une variante AVEC les contraintes du profil (règles interdites) : ce qui est validé respecte ces règles. */
function evalVar(rt, famille, params, plage) {
  const sig = appliquerContraintes(rt.ctx, FAMILLES[famille].signaux(rt.ctx, params), rt.profil), sim = simuler(rt.m15, sig, rt.config, plage);
  return { params, trades: sim.trades, stats: statistiques(sim.trades, { barres: plage.a - plage.de, risquePct: sim.config.risquePct }) };
}
const nomVariante = v => (v.famille === 'regle' ? decrireRegle(v.params) : cleParams(v.params));
const cleVariante = v => (v.famille === 'regle' ? cleRegle(v.params) : cleParams(v.params));
const voisinsDe = (v, gen) => (v.famille === 'regle' ? voisinsRegle(v.params).map(p => ({ famille: 'regle', params: p })) : voisins(v.famille, v.params, gen).map(p => ({ famille: v.famille, params: p })));

/* Robustesse des voisins (même mesure que evaluation.js:robustesse, mais pour une variante quelconque : famille ou règle). */
function robustesseVariante(rt, v, plage, gen) {
  const res = [], centre = evalVar(rt, v.famille, v.params, plage).stats.esperance;
  for (const w of voisinsDe(v, gen)) { const e = evalVar(rt, w.famille, w.params, plage); res.push({ n: e.stats.n, esperance: e.stats.esperance }); }
  const valides = res.filter(r => r.n >= 10 && r.esperance != null), pos = valides.filter(r => r.esperance > 0).length, mediane = valides.length ? valides.map(r => r.esperance).sort((a, b) => a - b)[valides.length >> 1] : null;
  return { testables: valides.length, partPositive: valides.length ? pos / valides.length : null, mediane, centre };
}

/* Évalue UN chantier. `rt` = environnement { ctx, m15, dec, config, cr, etat, coffre, derives }. Rend { decision: 'depistage'|'rejet'|'candidat', raison, … }.
   Chaque variante évaluée augmente etat.N (le compteur qui durcit le seuil du hasard). */
export function evaluerChantier(rt, chantier, { cede = () => {}, arret = () => false } = {}) {
  const { ctx, dec, config, cr, etat } = rt, zone = { de: 0, a: dec.finA }, lignes = [];
  const ajouter = v => { lignes.push({ ...evalVar(rt, v.famille, v.params, zone), famille: v.famille }); etat.N++; };
  const variantes = chantier.variants;
  const compteurNiveau = (etat.compteurs[chantier.niveau] = etat.compteurs[chantier.niveau] || { chantiers: 0, variantes: 0, depistes: 0, finalistes: 0 });
  compteurNiveau.chantiers++;
  // règle seule (niveau 5) : on dépiste d'abord la règle, ses voisins ne sont évalués que si elle passe
  const seule = variantes.length === 1 && chantier.niveau >= 5;
  for (const v of (seule ? variantes : variantes)) { if (arret()) return { decision: 'interrompu' }; ajouter(v); compteurNiveau.variantes++; }
  const dep = cr.recherche, classees = lignes.map(l => ({ l, sc: score(statsSur(l.trades, 0, dec.finS, config), dep.tradesMin) })).filter(x => x.sc > -Infinity).sort((a, b) => b.sc - a.sc);
  if (!classees.length) { compteurNiveau.depistes++; return { decision: 'depistage', raison: 'Aucune variante n’atteint ' + dep.tradesMin + ' trades sur la période de dépistage.' }; }
  const sD = statsSur(classees[0].l.trades, 0, dec.finS, config);
  if (sD.esperance < dep.esperanceMin || (sD.factProfit != null && sD.factProfit < dep.factProfitMin)) { compteurNiveau.depistes++; return { decision: 'depistage', raison: 'Dépistage : espérance ' + fmt(sD.esperance) + ' R et facteur de profit ' + fmt(sD.factProfit) + ' sur ' + sD.n + ' trades (seuils ≥ ' + dep.esperanceMin + ' R et ≥ ' + dep.factProfitMin + ').', depistage: compact(sD) }; }
  if (seule) {                                           // la règle isolée a passé le dépistage : on évalue son voisinage (comptées dans N) pour le walk-forward et la robustesse
    for (const w of voisinsDe(variantes[0], 0)) { if (arret()) return { decision: 'interrompu' }; ajouter(w); compteurNiveau.variantes++; }
  }
  compteurNiveau.finalistes++;
  // meilleure variante (zone A entière) = paramètres figés de la candidate ; walk-forward avec re-choix par bloc sur l'entraînement
  const sur = lignes.map(l => ({ l, sc: score(statsSur(l.trades, 0, dec.finA, config), cr.recherche.tradesMin) })).filter(x => x.sc > -Infinity).sort((a, b) => b.sc - a.sc), best = sur[0] && sur[0].l;
  if (!best) return { decision: 'rejet', raison: 'Aucune variante n’atteint le minimum de trades sur la zone de recherche.' };
  const wf = walkForward(lignes, dec, config, cr), mc = monteCarlo(wf.trades, { simulations: cr.monteCarlo.simulations });
  const rob = robustesseVariante(rt, { famille: best.famille, params: best.params }, zone, chantier.gen || 0);
  const juge = jugerHorsEchantillon(wf, { nVariantes: etat.N, mc, robuste: rob, c: cr }), extra = lignesM5(wf, etat.N, cr);
  const tout = [...juge.lignes, ...extra.lignes], echecs = tout.filter(x => !x.ok);
  const base = { variante: { famille: best.famille, params: best.params }, zoneA: compact(statsSur(best.trades, 0, dec.finA, config)), depistage: compact(sD), oos: compact(wf.stats), courbeR: Array.from(wf.stats.courbeR || []), lignes: tout, mc, ic: extra.ic, dsr: extra.dsr, robustesse: { partPositive: rob.partPositive, mediane: rob.mediane, centre: rob.centre, testables: rob.testables }, trimestres: juge.trimestres, avancement: avancement(wf.stats, cr), wf };
  if (!echecs.length) return { decision: 'candidat', raison: 'Tous les critères hors échantillon sont tenus : ' + wf.stats.n + ' trades, ' + fmt(wf.stats.Rtotal, 1) + ' R net, espérance ' + fmt(wf.stats.esperance) + ' R.', ...base };
  return { decision: 'rejet', raison: (wf.stats.n ? 'Hors échantillon : ' + wf.stats.n + ' trades, ' + fmt(wf.stats.Rtotal, 1) + ' R net, espérance ' + fmt(wf.stats.esperance) + ' R. ' : '') + 'Critères non tenus : ' + echecs.map(x => x.critere + ' (' + (x.valeur == null ? '—' : fmt(x.valeur)) + x.unite + ', seuil ' + x.seuil + ')').join(' ; ') + '.', echecs: echecs.map(x => x.critere), ...base };
}

/* Ouverture du jeu final pour une candidate (UNE fois). Rend { ok, stats, lignes, trades, ouverture, raison }. */
export function ouvrirJeuFinal(rt, cand, chantier, maintenant) {
  const { ctx, m15, dec, config, cr, coffre } = rt, k = (dec.ouverturesFenetre || 0) + 1, [a, b] = dec.jeuFinal;
  const sig = appliquerContraintes(ctx, FAMILLES[cand.variante.famille].signaux(ctx, cand.variante.params), rt.profil), sim = simuler(m15, sig, config, { de: a, a: b });
  const st = statistiques(sim.trades, { barres: b - a, risquePct: sim.config.risquePct }), jf = jugerJeuFinal(st, cr.jeuFinal), lignes = jf.lignes.slice();
  if (k > 1) { const seuil = seuilComparaisonsMultiples(k, st.ecartType, st.n, 1); lignes.push({ critere: 'Espérance > hasard attendu parmi ' + k + ' ouvertures du même jeu final', valeur: st.esperance, seuil: '> ' + fmt(seuil), ok: st.esperance != null && st.esperance > seuil, unite: ' R' }); }
  const ok = lignes.every(l => l.ok);
  const ouverture = { debut: dec.debutFinal != null ? dec.debutFinal : m15.t[a], fin: m15.t[m15.n - 1] + PAS, ouvertLe: maintenant, famille: cand.variante.famille, cle: cleVariante(cand.variante), cleBase: chantier.variants.length === 1 ? cleVariante(chantier.variants[0]) : null, chantier: chantier.id, nom: chantier.nom, k, verdict: ok ? 'validee' : 'rejetee', stats: compact(st) };
  coffre.ouverts = [...(coffre.ouverts || []), ouverture];
  return { ok, stats: st, lignes, trades: sim.trades, ouverture, k };
}

/* Construit la preuve complète d'une stratégie validée (stockée dans la bibliothèque). */
export function construirePreuve(rt, cand, final, chantier, maintenant) {
  const { ctx, etat, cr } = rt, oos = enrichirTrades(cand.wf.trades, ctx), fin = enrichirTrades(final.trades, ctx);
  return {
    criteresVersion: cr.version, criteresEmpreinte: empreinteCriteres(cr), valideeLe: maintenant, chantier: chantier.id, niveau: chantier.niveau,
    horsEchantillon: { ok: true, lignes: cand.lignes, stats: cand.oos, courbeR: cand.courbeR, mc: cand.mc, ic: cand.ic, dsr: cand.dsr, robustesse: cand.robustesse, trimestres: cand.trimestres, trades: compacterTrades(oos) },
    jeuFinal: { ok: true, lignes: final.lignes, stats: compact(final.stats), courbeR: Array.from(final.stats.courbeR || []), trades: compacterTrades(fin), k: final.k, debut: final.ouverture.debut, fin: final.ouverture.fin },
    zoneA: cand.zoneA, depistage: cand.depistage, avancement: cand.avancement, nVariantesAvant: etat.N,
    testsAvant: { total: etat.N, parNiveau: JSON.parse(JSON.stringify(etat.compteurs)), finalistes: etat.finalistes.slice(-300) },
    attendu: { esperance: cand.oos.esperance, sigma: cand.oos.ecartType, ddP95: cand.mc ? cand.mc.ddP95 : null }
  };
}

const entreeCourte = (etat, e, maintenant) => { etat.journalCourt.push({ t: maintenant, ...e }); if (etat.journalCourt.length > 300) etat.journalCourt.splice(0, etat.journalCourt.length - 300); };

/* Une TRANCHE de recherche : avance jusqu'à épuisement du budget { chantiersMax, tempsMs }, puis rend. Appelable en boucle (le Worker / le Veilleur / le navigateur la rappellent).
   deps = { m15, config, bibliotheque, coffre, derivBrut, criteres, maintenant, surEvenement, cede, arret, profil }.
   Rend { etat, coffre, stop: 'budget'|'objectif'|'arret'|'attente_jeu_final'|'refus', evenements }. */
export async function trancher(etat, deps) {
  const { m15, config = {}, bibliotheque, criteres = CRITERES2, maintenant = () => Date.now(), surEvenement = () => {}, cede = () => Promise.resolve(), arret = () => false, profil = {}, derivBrut = null } = deps;
  let coffre = deps.coffre || { ouverts: [] };
  const budget = { chantiersMax: 50, tempsMs: 60000, ...(deps.budget || {}) }, t0 = maintenant(), cible = Math.min(5, Math.max(1, profil.cible || 3));
  const evt = e => { const x = { t: maintenant(), ...e }; surEvenement(x); return x; };
  if (!etat.creeLe) etat.creeLe = maintenant();
  const dec = decouperM5(m15, coffre, criteres);
  if (!dec.ok) { evt({ type: 'refus', raison: dec.raison }); return { etat, coffre, stop: 'refus', raison: dec.raison }; }
  const ctx = construireContexte(m15, { deriv: derivBrut ? alignerDeriv(m15.t, derivBrut) : null });
  const rt = { ctx, m15, dec, config, cr: criteres, etat, coffre, profil };
  evt({ type: 'debut', niveau: etat.niveau, curseur: etat.curseur, N: etat.N, zone: { moisZoneA: dec.moisZoneA, moisDepistage: dec.moisDepistage, moisWalkForward: dec.moisWalkForward, blocs: dec.folds.length, moisFinal: dec.moisFinal || null } });
  let fait = 0, stop = 'budget';
  const valideesActuelles = () => (bibliotheque ? bibliotheque.liste().filter(s => ['validee', 'confirmee', 'surveillance'].includes(s.statut) && !s.redondante).length : etat.strategiesValidees);
  etat.objectifAtteint = valideesActuelles() >= cible;                         // recalculé à chaque tranche : une stratégie suspendue relance la recherche
  while (true) {
    if (arret()) { stop = 'arret'; break; }
    if (valideesActuelles() >= cible && !profil.continuerApresObjectif) { etat.objectifAtteint = true; stop = 'objectif'; break; }
    if (fait >= budget.chantiersMax || maintenant() - t0 > budget.tempsMs) break;
    const chantier = prochainChantier(etat, profil, { derivesDisponibles: !!derivBrut });
    if (!chantier) { etat.niveau++; etat.curseur = 0; continue; }
    if (chantier.saute) { avancerCurseur(etat); continue; }
    chantier.variants = chantier.variants.filter(v => uniteAutorisee(v, profil.unites ? profil : { unites: ['m15', 'h1', 'h4'] }));
    if (!chantier.variants.length) { avancerCurseur(etat, chantier); continue; }
    if ((coffre.ouverts || []).some(o => o.chantier === chantier.id || (chantier.variants.length === 1 && (o.cle === cleVariante(chantier.variants[0]) || o.cleBase === cleVariante(chantier.variants[0]))))) { avancerCurseur(etat, chantier); continue; }   // déjà passée au jeu final : jamais deux fois
    etat.dernierChantier = { id: chantier.id, nom: chantier.nom, niveau: chantier.niveau, t: maintenant() };
    evt({ type: 'chantier', chantier: { id: chantier.id, nom: chantier.nom, niveau: chantier.niveau, variantes: chantier.variants.length }, N: etat.N });
    const r = evaluerChantier(rt, chantier, { arret });
    if (r.decision === 'interrompu') { stop = 'arret'; break; }
    avancerCurseur(etat, chantier); fait++; etat.miseAJourLe = maintenant();
    if (r.decision === 'depistage') { if (chantier.niveau < 5 || chantier.file) { entreeCourte(etat, { chantier: chantier.id, nom: chantier.nom, niveau: chantier.niveau, decision: 'écarté au dépistage', raison: r.raison, N: etat.N }, maintenant()); evt({ type: 'journal', chantier: chantier.id, decision: 'depistage' }); } }
    else {
      const resume = { id: chantier.id, nom: chantier.nom, niveau: chantier.niveau, N: etat.N, decision: r.decision, oos: r.oos || null, echecs: r.echecs || [], variante: r.variante ? { famille: r.variante.famille, cle: cleVariante(r.variante) } : null, t: maintenant() };
      etat.finalistes.push(resume); if (etat.finalistes.length > 1000) etat.finalistes.splice(0, etat.finalistes.length - 1000);
      entreeCourte(etat, { chantier: chantier.id, nom: chantier.nom, niveau: chantier.niveau, decision: r.decision === 'candidat' ? 'candidate' : 'rejeté', raison: r.raison, N: etat.N, hypothese: r.variante ? nomVariante(r.variante) : null, oos: r.oos || null }, maintenant());
      if (r.decision === 'rejet') { majPresque(etat, chantier, r); evt({ type: 'journal', chantier: chantier.id, decision: 'rejet' }); }
      if (r.decision === 'candidat') {
        if (deps.sansJeuFinal) { evt({ type: 'candidat_sans_jeu_final', chantier: chantier.id, nom: chantier.nom, oos: r.oos }); etat.pistes.unshift({ chantier: chantier.id, nom: chantier.nom, raison: 'candidate : tous les critères hors échantillon tenus ; jeu final NON ouvert (essai à blanc)', variante: r.variante, oos: r.oos }); etat.pistes.length = Math.min(etat.pistes.length, 20); continue; }
        if (!dec.jeuFinal) { evt({ type: 'attente_jeu_final', chantier: chantier.id, raison: 'Candidate trouvée mais le jeu final est indisponible jusqu’au ' + new Date(dec.attente.jusquau).toISOString().slice(0, 10) }); etat.pistes.unshift({ chantier: chantier.id, nom: chantier.nom, raison: 'candidate en attente du jeu final', variante: r.variante }); etat.pistes.length = Math.min(etat.pistes.length, 20); stop = 'attente_jeu_final'; break; }
        const final = ouvrirJeuFinal(rt, r, chantier, maintenant()); coffre = rt.coffre; deps.coffre = coffre; dec.ouverturesFenetre = final.k; dec.jeuFinal = dec.jeuFinal;
        // la fenêtre peut être épuisée par cette ouverture : on la redécoupe pour la suite
        const dec2 = decouperM5(m15, coffre, criteres); Object.assign(dec, dec2); rt.dec = dec;
        const id = enregistrerCandidate(bibliotheque, chantier, r, final, rt, maintenant());
        if (final.ok) {
          etat.strategiesValidees = valideesActuelles() + (bibliotheque ? 0 : 1);
          evt({ type: 'validation', id, nom: chantier.nom, N: etat.N, oos: r.oos, jeuFinal: compact(final.stats) });
          entreeCourte(etat, { chantier: chantier.id, nom: chantier.nom, niveau: chantier.niveau, decision: 'VALIDÉE', raison: 'Jeu final ouvert une fois (' + final.k + 'e ouverture de cette fenêtre) : ' + final.stats.n + ' trades, ' + fmt(final.stats.Rtotal, 1) + ' R, espérance ' + fmt(final.stats.esperance) + ' R. Tous les critères tenus.', N: etat.N }, maintenant());
        } else {
          evt({ type: 'rejet_final', id, nom: chantier.nom, N: etat.N, jeuFinal: compact(final.stats), echecs: final.lignes.filter(l => !l.ok).map(l => l.critere) });
          entreeCourte(etat, { chantier: chantier.id, nom: chantier.nom, niveau: chantier.niveau, decision: 'REJETÉE au jeu final', raison: 'Jeu final ouvert : ' + final.stats.n + ' trades, ' + fmt(final.stats.Rtotal, 1) + ' R, espérance ' + fmt(final.stats.esperance) + ' R. Critères non tenus : ' + final.lignes.filter(l => !l.ok).map(l => l.critere).join(' ; ') + '.', N: etat.N }, maintenant());
          if (!dec.jeuFinal) { stop = 'attente_jeu_final'; break; }
        }
      }
    }
    evt({ type: 'progres', N: etat.N, niveau: etat.niveau, curseur: etat.curseur, fait });
    await cede();
  }
  evt({ type: 'tranche_finie', stop, fait, N: etat.N, niveau: etat.niveau });
  return { etat, coffre, stop, dec: { jeuFinal: !!dec.jeuFinal, ouverturesFenetre: dec.ouverturesFenetre || 0 } };
}

/* Prochain chantier : idées de l'utilisatrice en priorité, puis pistes proches, puis niveaux 0 à 4, puis règles aléatoires. */
export function prochainChantier(etat, profil = {}, { derivesDisponibles = false } = {}) {
  if (etat.idees.length) {
    const idee = etat.idees[0], v = validerRegle(idee.regle);
    if (!v.ok) { etat.idees.shift(); return { saute: true }; }
    return { id: 'idee:' + idee.id, nom: idee.nom || v.regle.nom, description: decrireRegle(v.regle), niveau: 5, idee: true, variants: [{ famille: 'regle', params: v.regle }], gen: 0 };
  }
  // M6 : file de chantiers prioritaires. Les concepts ICT et figures y sont mis UNE fois, dès que les niveaux finis 0 à 4 sont épuisés (jamais avant : l'ordre d'origine est respecté).
  etat.file = etat.file || [];
  if (etat.niveau >= 5 && !etat.ictFait) { etat.ictFait = true; for (const c of chantiersICT()) etat.file.push(c.id); }
  if (etat.file.length) {
    const c = chantierDeLaFile(etat.file[0], etat);
    if (!c) { etat.file.shift(); return { saute: true, id: 'file-inconnue' }; }
    return c;
  }
  if (etat.niveau <= 4) {
    const c = chantierDuNiveau(etat.niveau, etat.curseur, { derivesDisponibles });
    if (!c) return null;
    if (c.necessiteDerives && !derivesDisponibles) return { saute: true, id: c.id };
    if (c.id === 'prix_ronds@m' && profil.paire && profil.paire !== 'BTC') return { saute: true, id: c.id };      // M6 : ses pas (5 000 et 10 000 $) n'ont de sens que pour le bitcoin ; pour SOL et DOGE l'hypothèse n'est pas testée
    return c;
  }
  // niveau 5 : une règle sur trois est une mutation d'une piste proche (recherche locale : ses voisins, un par un, sans jamais en répéter), les autres sont tirées au hasard (graine incrémentée)
  const g = etat.graine;
  if (etat.presque.length && g % 3 === 0) {
    for (const p of etat.presque) {
      if (!p.regle) continue; const voisines = voisinsRegle(p.regle); p.curseurMut = p.curseurMut || 0;
      if (p.curseurMut < voisines.length) { const r = voisines[p.curseurMut++], base = p.nomBase || p.nom; return { id: 'mutation:' + g, nom: 'Variante d’une piste (' + base + ')', base, description: decrireRegle(r), niveau: 5, variants: [{ famille: 'regle', params: r }], gen: 0 }; }
    }
  }
  const r = regleAleatoire(g * 7919 + 13, etat.focus || null);
  if (!r) return { saute: true, id: 'vide:' + g };
  return { id: 'alea:' + g, nom: r.nom, description: decrireRegle(r), niveau: 5, variants: [{ famille: 'regle', params: r }], gen: 0 };
}
/* Chantier d'une file (identifiant → chantier) : « …@ict » (famille ICT / figure) ou « residuel:<n> » (piste proche + un filtre de contexte). */
const memoICT = new Map();
function chantierDeLaFile(id, etat) {
  if (/@ict$/.test(id)) { if (!memoICT.size) for (const c of chantiersICT()) memoICT.set(c.id, c); const c = memoICT.get(id); return c ? { ...c, file: true, variants: c.variants.slice() } : null; }
  const m = id.match(/^residuel:(\d+)$/); if (m) { const l = (etat.residuels || [])[Number(m[1])]; return l ? { id, nom: l.nom, description: l.description, niveau: 6, file: true, variants: l.regles.map(r => ({ famille: 'regle', params: r })), gen: 0 } : null; }
  return null;
}
function avancerCurseur(etat, chantier = null) {
  if (chantier && chantier.idee) { etat.idees.shift(); return; }
  if (chantier && chantier.file) { if (etat.file && etat.file[0] === chantier.id) etat.file.shift(); return; }
  if (etat.niveau <= 4) { etat.curseur++; const max = NB_CHANTIERS[etat.niveau]; if (etat.curseur >= max) { etat.registreNiveaux.push({ niveau: etat.niveau, finiLe: Date.now(), N: etat.N }); etat.niveau++; etat.curseur = 0; } return; }
  etat.graine++;
}
function majPresque(etat, chantier, r) {
  const o = r.oos; if (!o || o.n < 40 || !(o.esperance > 0)) return;
  const regle = r.variante && r.variante.famille === 'regle' ? r.variante.params : null;
  const cle = regle ? cleRegle(regle) : chantier.id; if (etat.presque.some(x => x.cle === cle)) return;           // une même règle n'entre qu'une fois
  etat.presque.push({ cle, nomBase: chantier.base || chantier.nom, id: chantier.id, nom: chantier.nom, niveau: chantier.niveau, esperance: o.esperance, n: o.n, Rtotal: o.Rtotal, echecs: r.echecs, regle, variante: r.variante, avancement: r.avancement ? { texte: r.avancement.texte, partR: r.avancement.partR, partTrades: r.avancement.partTrades } : null });
  etat.presque.sort((a, b) => b.Rtotal - a.Rtotal); etat.presque.length = Math.min(etat.presque.length, 12);
}

/* Enregistre dans la bibliothèque : validée (preuve complète) ou rejetée au jeu final. */
function enregistrerCandidate(bib, chantier, r, final, rt, t) {
  if (!bib) return null;
  const regle = r.variante.famille === 'regle' ? r.variante.params : null, nom = chantier.nom;          // les paramètres figés sont dans la fiche (règles et preuves), pas dans le titre
  const s = bib.ajouter({ nom, famille: r.variante.famille, params: r.variante.params, regle, description: chantier.description, t });
  const preuve = construirePreuve(rt, r, final, chantier, t);
  if (final.ok) {
    bib.valider(s.id, preuve, t);
    // complémentarité : corrélation des R journaliers hors échantillon avec les stratégies déjà validées
    const autres = bib.liste().filter(x => x.id !== s.id && x.preuve && ['validee', 'confirmee', 'surveillance'].includes(x.statut));
    if (autres.length) {
      const c = correlations([{ id: s.id, nom: s.nom, trades: preuve.horsEchantillon.trades }, ...autres.map(x => ({ id: x.id, nom: x.nom, trades: x.preuve.horsEchantillon.trades }))]);
      const maxCorr = Math.max(...c.matrice[0].slice(1).map(x => (x == null ? -1 : x)));
      s.correlationMax = maxCorr; if (maxCorr > 0.7) { s.redondante = true; s.notes = 'Corrélée à ' + fmt(maxCorr) + ' avec une stratégie déjà validée : elle ne compte pas comme complémentaire.'; }
    }
  } else bib.rejeter(s.id, 'Jeu final non tenu : ' + final.lignes.filter(l => !l.ok).map(l => l.critere).join(' ; '), { ...preuve, jeuFinal: { ...preuve.jeuFinal, ok: false } }, t);
  return s.id;
}
export { NIVEAUX, intervalleEsperance, sharpeDeflate, statsSur };
