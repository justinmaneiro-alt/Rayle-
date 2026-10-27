import { creerHistorique } from './historique.js';
import { tranche } from './colonnes.js';
import { construireContexte } from './contexte.js';
import { FAMILLES, cleParams } from './hypotheses.js';
import { lireMarche } from './lecture.js';
import { evaluerBougie, fusionConfig, ouvrirPosition, resultatPosition, semaineUTC, statistiques } from './moteur.js';
import { rechercher } from './boucle.js';
import { CRITERES, texteCriteres } from './criteres.js';
import { creerDeriv } from './deriv-donnees.js';
import { alignerDeriv, lireMicro } from './micro-mesures.js';
import { MICRO_AVEC_DERIVES } from './hypotheses-micro.js';

/* ═════════════ L'AGENT BTC (M3c ; testé : planetes/mars/tests/agent-live-test.mjs avec de fausses sources et un faux Worker) ═════════════
   Rassemble : l'historique (IndexedDB), la lecture du marché, la recherche de stratégie (Worker de navigateur), le suivi en direct en M15, les alertes PRÉPARATION / ENTRÉE, le compte simulé.
   AUCUN ordre n'est jamais envoyé, AUCUNE clé de courtier n'existe : l'agent explique et alerte. Les alertes d'ENTRÉE ne viennent que d'une stratégie VALIDÉE (critères passés, jeu final ouvert une
   fois) ; le « mode observation » (désactivé par défaut) montre en plus les setups d'une candidate NON validée, étiquetés ainsi, sans alerte d'entrée et dans un compte simulé séparé.
   Limites assumées : l'agent ne calcule que quand l'application Rayle est ouverte (le navigateur est le seul moteur) ; hors ligne, les bougies manquantes sont rattrapées à la réouverture mais les
   entrées qui auraient eu lieu entre-temps ne sont pas rejouées. Ce n'est pas un conseil financier : les résultats passés ne garantissent rien. */
export const REGLAGES_DEFAUT = Object.freeze({ capital: 10000, risquePct: 1, maxParSemaine: 3, reposHeures: 4, observation: false, charge: 'normale', notifications: true, fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02, annees: 4 });
const FENETRE_LIVE = 16000;                       // bougies M15 utilisées pour le suivi en direct (≈ 167 jours : assez pour chauffer toutes les moyennes et les phases)
const MAX_JOURNAL = 400, MAX_ALERTES = 60, PAS = 900e3;
const clone = o => JSON.parse(JSON.stringify(o));

/* Worker « de secours » exécuté dans le même processus (tests Node, navigateur sans Worker). Même protocole que worker-recherche.js. */
export function creerWorkerEnProcessus() {
  const w = { onmessage: null, arret: false, terminate() { w.arret = true; },
    postMessage(m) {
      if (m.type === 'arret') { w.arret = true; return; }
      if (m.type !== 'demarrer') return; w.arret = false;
      rechercher({ m15: m.m15, config: m.config, budget: m.budget, coffre: m.coffre, nVarianteDepart: m.nVarianteDepart, generationsMax: m.generationsMax, criteres: m.criteres || CRITERES, ...(m.familles ? { familles: m.familles } : {}), derivBrut: m.derivBrut || null, surEvenement: ev => w.onmessage && w.onmessage({ data: ev }), cede: () => new Promise(r => setTimeout(r, 0)), arret: () => w.arret })
        .catch(e => w.onmessage && w.onmessage({ data: { type: 'erreur', message: String(e && e.message || e) } }));
    } };
  return w;
}

export function creerAgent({ stockage, lire, maintenant = () => Date.now(), creerWorker = null, surChangement = () => {}, surAlerte = () => {}, periodeMs = 60000, criteres = CRITERES, lireOctets = null, inflater = null } = {}) {
  const histo = creerHistorique({ stockage, lire, maintenant, annees: REGLAGES_DEFAUT.annees });
  // M4 : données gratuites des contrats à terme (financement, intérêt ouvert, ratios) : facultatives, activées par l'utilisateur (≈ 1 500 petits fichiers au premier passage)
  const deriv = lireOctets && inflater ? creerDeriv({ stockage, lireJson: lire, lireOctets, inflater, maintenant, annees: REGLAGES_DEFAUT.annees }) : null;
  let micro = null, progresDeriv = null;
  let etat = { reglages: { ...REGLAGES_DEFAUT }, verdict: null, journal: [], coffre: { ouverts: [] }, nVariantes: 0, alertes: [], compte: { ouvertes: [], fermees: [], attente: [] }, derniereTraitee: null, creeLe: null };
  let lecture = null, lectureDe = -1, setup = null, progresDonnees = null, recherche = { enCours: false, phase: null, fait: 0, total: 0, famille: null, generation: 0, N: 0, depuis: null, erreur: null };
  let timer = null, worker = null, detruit = false, miseAJourEnCours = false, ctxLive = null, dernierMotifSetup = null;

  const notifier = () => { try { surChangement(); } catch (e) { /* un écouteur défaillant ne casse pas l'agent */ } };
  let ecritureEnCours = null;
  async function sauver() {
    if (ecritureEnCours) return ecritureEnCours;
    ecritureEnCours = (async () => { await Promise.resolve(); ecritureEnCours = null; try { await stockage.ecrire('agent', { valeur: legerPourDisque() }); } catch (e) { /* disque plein : tant pis */ } })();
    return ecritureEnCours;
  }
  const legerPourDisque = () => { const e = clone(etat); if (e.verdict && e.verdict.strategie) delete e.verdict.strategie.tradesFinal; if (e.verdict) { delete e.verdict.journal; delete e.verdict.coffre; delete e.verdict.config; } return e; };
  async function chargerEtat() {
    const r = await stockage.lire('agent');
    if (r && r.valeur) { const v = r.valeur; etat = { ...etat, ...v, reglages: { ...REGLAGES_DEFAUT, ...(v.reglages || {}) }, compte: { ouvertes: [], fermees: [], attente: [], ...(v.compte || {}) }, coffre: v.coffre || { ouverts: [] } }; }
    else etat.creeLe = maintenant();
  }
  const cfg = () => fusionConfig({ risquePct: etat.reglages.risquePct, fraisPct: etat.reglages.fraisPct, spreadPct: etat.reglages.spreadPct, glissementPct: etat.reglages.glissementPct, maxParSemaine: etat.reglages.maxParSemaine, reposBarres: Math.round(etat.reglages.reposHeures * 4) });

  /* ── Stratégie suivie en direct ── */
  function strategieSuivie() {
    const v = etat.verdict; if (!v || !v.strategie) return null;
    if (v.etat === 'validee') return { ...v.strategie, validee: true };
    if (etat.reglages.observation && (v.etat === 'rejetee' || v.etat === 'attente_jeu_final')) return { ...v.strategie, validee: false };
    return null;
  }
  const etatStrategie = () => (recherche.enCours ? 'en_recherche' : !etat.verdict ? 'jamais' : etat.verdict.etat);

  /* ── Compte simulé : une logique d'exécution unique avec le backtest (moteur.js) ── */
  function capitalCourant(groupe) { let c = etat.reglages.capital; for (const t of etat.compte.fermees) if (t.groupe === groupe) c += t.pnl; return c; }
  function avancerCompte(bougie) {
    const c = cfg(), compte = etat.compte; let change = false;
    // ordres en attente : exécution à l'ouverture de la bougie qui suit le signal
    for (const a of compte.attente.slice()) {
      if (bougie.t < a.tSignal + PAS) continue;
      compte.attente = compte.attente.filter(x => x !== a); change = true;
      if (bougie.t > a.tSignal + PAS) { a.annule = 'signal trop ancien (l’application n’a pas tourné)'; continue; }
      const pos = ouvrirPosition(c, a.sens, bougie.o, a.stop, a.R);
      if (!pos) { a.annule = 'distance au stop hors limites à l’exécution'; continue; }
      const risque = capitalCourant(a.groupe) * etat.reglages.risquePct / 100;
      compte.ouvertes.push({ ...a, pos, entreeT: bougie.t, risqueCash: risque, quantite: risque / pos.dist, detenues: 0 });
    }
    for (const p of compte.ouvertes.slice()) {
      p.detenues++;
      const ex = evaluerBougie(c, p.pos, bougie, p.detenues === 1, p.detenues);
      if (!ex) continue;
      const r = resultatPosition(c, p.pos, ex.prix);
      compte.ouvertes = compte.ouvertes.filter(x => x !== p); change = true;
      compte.fermees.push({ id: p.id, groupe: p.groupe, famille: p.famille, t: p.entreeT, tSortie: bougie.t + PAS, sens: p.sens, prixEntree: p.pos.fill, stop: p.pos.stop, cible: p.pos.cible, prixSortie: ex.prix, motif: ex.motif, R: r.R, risqueCash: p.risqueCash, pnl: p.risqueCash * r.R, barres: p.detenues, distancePct: p.pos.pct });
    }
    return change;
  }

  /* ── Lecture du marché (recalculée à chaque nouvelle bougie fermée) ── */
  function recalculerLecture() {
    const s = histo.serie(); if (!s.n) { lecture = null; return; }
    if (lectureDe === s.t[s.n - 1]) return;
    const fenetre = s.n > 30000 ? tranche(s, s.n - 30000, s.n) : s;
    lecture = lireMarche(fenetre); lectureDe = s.t[s.n - 1];
    recalculerMicro(s);
  }
  /* Microstructure (sessions, zones de liquidité, VWAP, prix ronds, flux, financement, intérêt ouvert, indice de liquidations ESTIMÉ) : sur les 6 000 dernières bougies, à chaque nouvelle bougie fermée. */
  const brutDeriv = () => { const r = deriv ? deriv.brut() : null; return r && (r.funding.length || r.metrics.length) ? r : null; };
  function recalculerMicro(s) {
    try { const fen = s.n > 6000 ? tranche(s, s.n - 6000, s.n) : s, raw = brutDeriv(), d = raw ? alignerDeriv(fen.t, raw) : null; micro = lireMicro(construireContexte(fen, { deriv: d }), d); }
    catch (e) { micro = { ok: false, raison: 'Mesures de microstructure indisponibles : ' + String(e && e.message || e) }; }
  }

  /* ── Détection des setups sur la dernière bougie fermée ── */
  function limites(t) {
    const c = etat.compte, semaine = semaineUTC(t), r = etat.reglages;
    if (c.ouvertes.length || c.attente.length) return 'une position simulée est déjà en cours ou en attente (une seule à la fois)';
    const vues = [...c.fermees.map(x => x.t), ...c.ouvertes.map(x => x.entreeT)], alertesEntree = etat.alertes.filter(a => a.type === 'ENTREE' && a.groupe === 'valide');
    const cetteSemaine = alertesEntree.filter(a => semaineUTC(a.tSignal) === semaine).length;
    if (cetteSemaine >= r.maxParSemaine) return 'limite de ' + r.maxParSemaine + ' position(s) par semaine atteinte (' + cetteSemaine + ' cette semaine)';
    const derniere = c.fermees.length ? Math.max(...c.fermees.map(x => x.tSortie)) : -Infinity;
    if (t - derniere < r.reposHeures * 3600e3) return 'repos de ' + r.reposHeures + ' h après la dernière sortie';
    return null;
  }
  function evaluerSetup() {
    const strat = strategieSuivie(), s = histo.serie();
    if (!strat) { setup = { statut: 'aucun', raison: etat.verdict ? (etat.verdict.etat === 'aucune' ? 'Aucune stratégie robuste n’a été trouvée : pas de setup à proposer.' : 'La stratégie n’est pas validée : pas de setup à proposer.') : 'Aucune recherche de stratégie n’a encore été faite : pas de setup.' }; return; }
    if (s.n < 3000) { setup = { statut: 'aucun', raison: 'Historique insuffisant pour suivre la stratégie.' }; return; }
    const i = s.n - 1, tBarre = s.t[i], fen = s.n > FENETRE_LIVE ? tranche(s, s.n - FENETRE_LIVE, s.n) : s, raw = brutDeriv(), ctx = construireContexte(fen, { deriv: raw ? alignerDeriv(fen.t, raw) : null }), j = fen.n - 1, F = FAMILLES[strat.famille];
    if (MICRO_AVEC_DERIVES.has(strat.famille) && !(ctx.deriv && ctx.deriv.disponible && (strat.famille === 'financement_extreme' ? ctx.deriv.disponible.funding : ctx.deriv.disponible.oi))) { setup = { statut: 'aucun', raison: 'La stratégie suivie a besoin des données de financement ou d’intérêt ouvert, qui ne sont pas chargées : pas de setup.' }; return; }
    ctxLive = ctx;
    const sig = F.signaux(ctx, strat.params), groupe = strat.validee ? 'valide' : 'candidate', ph = lecture && lecture.phase ? lecture.phase.phase : null;
    if (sig.sens[j] !== 0) {
      const motifLimite = limites(tBarre);
      const sens = sig.sens[j], px = fen.c[j], stop = sig.stop[j], dist = Math.abs(px - stop), c = cfg(), pos = ouvrirPosition(c, sens, px, stop, strat.params.R);
      if (!pos) { setup = { statut: 'aucun', raison: 'Signal ignoré : stop trop proche ou trop loin du prix (hors des limites de risque).' }; return; }
      if (motifLimite) { setup = { statut: 'bloque', sens, raison: 'Signal détecté mais non proposé : ' + motifLimite + '.', t: tBarre + PAS }; return; }
      const id = groupe + ':' + tBarre, deja = etat.alertes.find(a => a.id === 'E:' + id);
      const risque = capitalCourant(groupe) * etat.reglages.risquePct / 100, qte = risque / pos.dist;
      const vol = lecture ? lecture.volume.relatif4h : null, alignee = lecture && ((sens > 0 && lecture.phase.code === 1) || (sens < 0 && lecture.phase.code === 2));
      const alerte = { id: 'E:' + id, type: 'ENTREE', groupe, validee: strat.validee, t: tBarre + PAS, tSignal: tBarre, sens, entree: px, stop, cible: px + sens * strat.params.R * dist, R: strat.params.R, risquePct: etat.reglages.risquePct, risqueCash: risque, quantite: qte, notionnel: qte * px, distancePct: dist / px * 100,
        phase: ph, qualite: alignee && vol != null && vol >= 1.2 ? 'forte' : 'moyenne', famille: strat.famille, nomStrategie: FAMILLES[strat.famille].nom, params: strat.params,
        invalidation: 'Le setup n’est plus valable si le prix touche ' + Math.round(stop).toLocaleString('fr-FR') + ' avant l’entrée, ou si l’entrée n’est pas prise dans les deux bougies M15 qui suivent.',
        texte: (sens > 0 ? 'ACHAT' : 'VENTE') + ' Bitcoin vers ' + Math.round(px).toLocaleString('fr-FR') + ' · stop ' + Math.round(stop).toLocaleString('fr-FR') + ' · objectif ' + Math.round(px + sens * strat.params.R * dist).toLocaleString('fr-FR') + ' (' + strat.params.R + ' R)' + (strat.validee ? '' : ' · STRATÉGIE NON VALIDÉE (observation)') };
      setup = { statut: 'entree', ...alerte };
      if (!deja) {
        etat.alertes.unshift(alerte); etat.alertes.length = Math.min(etat.alertes.length, MAX_ALERTES);
        etat.compte.attente.push({ id: alerte.id, groupe, famille: strat.famille, tSignal: tBarre, sens, stop, R: strat.params.R });
        if (strat.validee) surAlerte(alerte);              // pas d'alerte d'entrée pour une stratégie non validée : seulement visible dans le panneau
      }
      return;
    }
    const ap = F.approche ? F.approche(ctx, strat.params, j) : null;
    if (ap && !limites(tBarre)) {
      const px = fen.c[j], dist = Math.abs(px - ap.niveau), atr = ctx.h1.atr[j];
      const alerte = { id: 'P:' + groupe + ':' + strat.famille + ':' + ap.sens + ':' + Math.floor(tBarre / 3600e3), type: 'PREPARATION', groupe, validee: strat.validee, t: tBarre + PAS, tSignal: tBarre, sens: ap.sens, niveau: ap.niveau, prix: px, distanceATR: atr > 0 ? dist / atr : null, phase: ph, famille: strat.famille, nomStrategie: FAMILLES[strat.famille].nom,
        texte: 'PRÉPARATION · ' + ap.texte + ' (niveau ' + Math.round(ap.niveau).toLocaleString('fr-FR') + ', prix ' + Math.round(px).toLocaleString('fr-FR') + ')' };
      setup = { statut: 'preparation', ...alerte };
      if (!etat.alertes.find(a => a.id === alerte.id)) { etat.alertes.unshift(alerte); etat.alertes.length = Math.min(etat.alertes.length, MAX_ALERTES); if (strat.validee) surAlerte(alerte); }
      return;
    }
    const motif = limites(tBarre);
    setup = { statut: 'aucun', raison: motif ? 'Pas de setup : ' + motif + '.' : 'Pas de setup : aucune condition de la stratégie n’est réunie, le prix n’est pas près d’une zone de déclenchement.' };
  }

  async function traiterNouvelles(nouvelles) {
    let change = false;
    for (const b of nouvelles) { if (etat.derniereTraitee != null && b.t <= etat.derniereTraitee) continue; if (avancerCompte(b)) change = true; etat.derniereTraitee = b.t; }
    recalculerLecture(); evaluerSetup(); await sauver(); notifier(); return change;
  }

  /* ── Données ── */
  async function synchroniser() {
    progresDonnees = { phase: 'telechargement', bougies: 0 }; notifier();
    try {
      await histo.synchroniser({ surProgres: p => { progresDonnees = p.phase === 'termine' ? null : p; notifier(); } });
    } catch (e) { progresDonnees = { phase: 'erreur', message: String(e && e.message || e) }; notifier(); return false; }
    progresDonnees = null; const s = histo.serie();
    if (s.n) { if (etat.derniereTraitee == null) etat.derniereTraitee = s.t[s.n - 1]; recalculerLecture(); evaluerSetup(); await sauver(); }
    notifier(); return s.n > 0;
  }
  async function miseAJour() {
    if (miseAJourEnCours || detruit) return; miseAJourEnCours = true;
    try {
      if (!histo.serie().n) { await synchroniser(); return; }
      const r = await histo.actualiser();
      if (r.nouvelles && r.nouvelles.length) await traiterNouvelles(r.nouvelles); else notifier();
      if (deriv && deriv.etat().majLe && maintenant() - deriv.etat().majLe > 3 * 3600e3 && !derivEnCours) synchroniserDeriv();   // mise à jour douce des dérivés déjà activés
    } catch (e) { notifier(); } finally { miseAJourEnCours = false; }
  }
  async function demarrer({ synchro = true, boucle = true } = {}) {
    await chargerEtat(); await histo.charger(); if (deriv) { try { await deriv.charger(); } catch (e) { /* disque illisible : on repart de zéro */ } }
    const s = histo.serie(); if (s.n) { recalculerLecture(); evaluerSetup(); }
    notifier();
    if (synchro) await synchroniser();
    if (boucle && !timer) timer = setInterval(miseAJour, periodeMs);
    return instantane();
  }

  /* ── Dérivés (M4) : téléchargement à la demande, puis mise à jour douce ── */
  let derivEnCours = false;
  async function synchroniserDeriv() {
    if (!deriv || derivEnCours) return false; derivEnCours = true; progresDeriv = { phase: 'demarrage' }; notifier();
    try {
      await deriv.synchroniser({ surProgres: p => { progresDeriv = p.phase === 'termine' ? null : p; notifier(); } });
      progresDeriv = null; const s = histo.serie(); if (s.n) { lectureDe = -1; recalculerMicro(s); evaluerSetup(); } notifier(); return true;
    } catch (e) { progresDeriv = { phase: 'erreur', message: String(e && e.message || e) }; notifier(); return false; }
    finally { derivEnCours = false; }
  }

  /* ── Recherche de stratégie (Worker de navigateur) ── */
  function lancerRecherche({ generationsMax = 2, budget = {}, familles = undefined } = {}) {
    if (recherche.enCours) return false;
    const s = histo.serie(); if (!s.n) return false;
    const fabrique = creerWorker || creerWorkerEnProcessus; worker = fabrique();
    recherche = { enCours: true, phase: 'demarrage', fait: 0, total: 0, famille: null, generation: 0, N: etat.nVariantes, depuis: maintenant(), erreur: null };
    worker.onmessage = async ev => {
      const m = ev.data || ev;
      if (m.type === 'journal') { etat.journal.push(m.entree); if (etat.journal.length > MAX_JOURNAL) etat.journal.splice(0, etat.journal.length - MAX_JOURNAL); }
      else if (m.type === 'progres') recherche = { ...recherche, phase: m.phase, fait: m.fait || 0, total: m.total || 0, famille: m.famille || null, generation: m.generation || 0, N: m.N };
      else if (m.type === 'erreur') { recherche = { ...recherche, enCours: false, erreur: m.message }; try { worker.terminate && worker.terminate(); } catch (e) { /* fini */ } worker = null; }
      else if (m.type === 'fin') {
        const v = m.verdict; etat.nVariantes = v.nVariantes; if (v.coffre) etat.coffre = v.coffre;
        const garde = { ...v }; delete garde.journal; delete garde.coffre; delete garde.config;
        // une stratégie VALIDÉE n'est jamais écrasée par une recherche qui n'aboutit pas : on garde la validée et on note le résultat de la dernière recherche à part
        etat.derniereRecherche = { etat: garde.etat, resume: garde.resume, finiLe: garde.finiLe, nVariantes: garde.nVariantes };
        if (!(etat.verdict && etat.verdict.etat === 'validee' && garde.etat !== 'validee')) etat.verdict = garde;
        recherche = { ...recherche, enCours: false, phase: 'fini' }; try { worker.terminate && worker.terminate(); } catch (e) { /* fini */ } worker = null;
        // une nouvelle stratégie remplace l'ancienne : le compte simulé repart sur les nouvelles règles seulement pour les nouvelles positions (l'historique est conservé)
        recalculerLecture(); evaluerSetup(); await sauver();
      }
      notifier();
    };
    worker.postMessage({ type: 'demarrer', m15: s, config: cfg(), budget, coffre: etat.coffre, nVarianteDepart: etat.nVariantes, charge: etat.reglages.charge, generationsMax, criteres, familles, derivBrut: brutDeriv() });
    notifier(); return true;
  }
  function arreterRecherche() { if (worker && recherche.enCours) { worker.postMessage({ type: 'arret' }); return true; } return false; }

  async function reglages(patch) {
    const r = etat.reglages, n = { ...r };
    for (const [k, v] of Object.entries(patch || {})) {
      if (!(k in REGLAGES_DEFAUT)) continue;
      if (typeof REGLAGES_DEFAUT[k] === 'number') { const x = Number(v); if (!Number.isFinite(x)) continue; n[k] = k === 'risquePct' ? Math.min(5, Math.max(0.1, x)) : k === 'maxParSemaine' ? Math.min(5, Math.max(1, Math.round(x))) : k === 'reposHeures' ? Math.min(48, Math.max(0, x)) : k === 'capital' ? Math.max(100, x) : x; }
      else if (k === 'charge') n[k] = ['douce', 'normale', 'max'].includes(v) ? v : r.charge; else n[k] = !!v;
    }
    etat.reglages = n; evaluerSetup(); await sauver(); notifier(); return n;
  }
  async function reinitialiserCompte() { etat.compte = { ouvertes: [], fermees: [], attente: [] }; etat.alertes = []; evaluerSetup(); await sauver(); notifier(); }

  /* ── Instantané pour l'interface, la table, la voix ── */
  function statsCompte(groupe) { const t = etat.compte.fermees.filter(x => x.groupe === groupe); const st = statistiques(t.map(x => ({ ...x })), { barres: 0, risquePct: etat.reglages.risquePct }); const premier = t.length ? Math.min(...t.map(x => x.t)) : null; const sem = premier ? Math.max(1, (maintenant() - premier) / (7 * 86400e3)) : null; return { ...st, parSemaine: sem && st.n ? st.n / sem : null, capitalFinal: capitalCourant(groupe), capital0: etat.reglages.capital, courbe: courbeCapital(t) }; }
  function courbeCapital(t) { let c = etat.reglages.capital; const out = [c]; for (const x of t) { c += x.pnl; out.push(c); } return out; }
  function instantane() {
    const s = histo.serie(), d = histo.etat(), v = etat.verdict, strat = v && v.strategie;
    return {
      donnees: { n: s.n, debut: d.debut, fin: d.fin, source: d.source, secours: d.secours, deltaReelPct: d.deltaReelPct, lacunes: (d.lacunes || []).length, majLe: d.majLe, erreur: d.erreur, annees: d.annees, progres: progresDonnees, prix: s.n ? s.c[s.n - 1] : null },
      lecture, micro, deriv: deriv ? { possible: true, ...deriv.etat(), progres: progresDeriv } : { possible: false }, setup, etatStrategie: etatStrategie(), recherche: { ...recherche },
      derniereRecherche: etat.derniereRecherche || null,
      verdict: v ? { etat: v.etat, resume: v.resume, nVariantes: v.nVariantes, finiLe: v.finiLe, dureeMs: v.dureeMs, criteres: v.criteres, rejetees: v.rejetees || null } : null,
      strategie: strat ? { nom: strat.nom, famille: strat.famille, description: strat.description, params: strat.params, validee: v.etat === 'validee', horsEchantillon: strat.horsEchantillon, juge: strat.juge, mc: strat.mc, robustesse: strat.robustesse, jeuFinal: strat.jeuFinal, suivie: !!strategieSuivie() } : null,
      journal: etat.journal.slice(-120), alertes: etat.alertes.slice(0, 30), compte: { ouvertes: etat.compte.ouvertes.map(p => ({ id: p.id, groupe: p.groupe, sens: p.sens, entree: p.pos.fill, stop: p.pos.stop, cible: p.pos.cible, risqueCash: p.risqueCash, quantite: p.quantite, entreeT: p.entreeT })), attente: etat.compte.attente.slice(), fermees: etat.compte.fermees.slice(-50), valide: statsCompte('valide'), candidate: statsCompte('candidate') },
      reglages: { ...etat.reglages }, criteres: { version: criteres.version, textes: texteCriteres(criteres) }, coffre: etat.coffre, nVariantes: etat.nVariantes
    };
  }
  async function vider() { await histo.vider(); lecture = null; lectureDe = -1; setup = null; notifier(); }
  function detruire() { detruit = true; if (timer) clearInterval(timer); timer = null; if (worker) { try { worker.terminate(); } catch (e) { /* fini */ } } }
  return { demarrer, synchroniser, synchroniserDeriv, miseAJour, lancerRecherche, arreterRecherche, reglages, reinitialiserCompte, instantane, vider, detruire, historique: histo, _etat: () => etat, _traiter: traiterNouvelles };
}
