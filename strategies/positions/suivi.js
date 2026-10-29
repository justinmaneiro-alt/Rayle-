import { statutDepuisSignal, optionsProposition, niveauAssezHaut, budgetJour } from './moteur.js';
import { detecterDerive } from '../stats-v3.js';
import { NIVEAUX } from '../criteres-v4.js';

/* ═════════════ SUIVI AUTOMATIQUE DES POSITIONS PROPOSÉES (V7, phase 4 ; module pur, testé : galaxie/tests/positions-suivi-test.mjs) ═════════════
   Chaque position proposée est enregistrée puis SUIVIE jusqu'à sa fin (ordre limite touché ou non, stop, cible, expiration) par la VRAIE simulation de la V6 (file d'attente honnête, frais, spread, glissement) :
   le résultat n'est jamais retouché. Les types de setup sont promus (Candidate → Validée) ou rétrogradés quand leurs statistiques le justifient, et l'écrit dans le journal.
   L'état est un objet JSON simple (sauvé par le service du PC, relu au démarrage). Aucun ordre n'est exécuté. */
export const SCHEMA_POSITIONS = 1;
export const creerEtatPositions = () => ({ schema: SCHEMA_POSITIONS, propositions: [], emises: [], types: {}, journalNiveaux: [], variantes: {}, jeuFinal: {}, exemples: [], hypotheses: [], occasions: { liste: [] }, mesures: {}, reglages: {}, dernierCalcul: {}, alertes: [], vue: {}, hasard: null, exploration: {}, parametresRetenus: {} });
const JOUR = 86400e3;

/* Enregistre les nouvelles propositions (une seule fois chacune, plafond quotidien respecté). Rend { nouvelles, refusees }. */
export function enregistrer(etat, propositions, maintenant, { maxParJour = 5 } = {}) {
  const vus = new Set(etat.propositions.map(p => p.id)), candidates = propositions.filter(p => !vus.has(p.id)).sort((a, b) => b.qualite - a.qualite);
  const b = budgetJour(candidates, etat.emises, maintenant, maxParJour);
  for (const p of b.acceptees) {
    const q = { id: p.id, actif: p.actif, famille: p.famille, agent: p.agent, tf: p.tf, type: p.type, nomType: p.nomType, sens: p.sens, t: p.t, tValide: p.tValide, zone: p.zone, limite: p.limite, stop: p.stop, cible: p.cible, cibleNom: p.cibleNom, cible2: p.cible2, rr: p.rr,
      raison: p.raison, invalidation: p.invalidation, confluence: { n: p.confluence.n, score: p.confluence.score, diamant: p.confluence.diamant, elements: p.confluence.elements.map(e => e.cle) }, regime: p.regime, preuve: { niveau: p.preuve.niveau, n: p.preuve.n ?? 0, esperance: p.preuve.esperance ?? null }, versionCriteres: p.versionCriteres,
      qualite: p.qualite, statut: p.statut, creeLe: maintenant, resultat: null };
    etat.propositions.push(q); etat.emises.push(maintenant);
  }
  etat.emises = etat.emises.filter(t => maintenant - t < 8 * JOUR);
  if (etat.propositions.length > 4000) etat.propositions.splice(0, etat.propositions.length - 4000);
  return { nouvelles: b.acceptees, refusees: b.refusees };
}

/* Index de la bougie M15 de la proposition. */
const indexDe = (m15, t) => { let lo = 0, hi = m15.n - 1; if (m15.t[0] > t) return -1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m15.t[k] <= t) lo = k; else hi = k - 1; } return m15.t[lo] === t ? lo : -1; };
/* Met à jour le statut de toutes les propositions encore ouvertes (en attente ou position ouverte). `series` : { actif: m15 }, `configDe(actif)` : coûts. Rend les propositions qui viennent de se terminer. */
export function majSuivi(etat, series, configDe, maintenant) {
  const terminees = [];
  for (const p of etat.propositions) {
    if (p.statut !== 'en_attente' && p.statut !== 'ouverte') continue;
    const m15 = series[p.actif]; if (!m15) continue; const i = indexDe(m15, p.t); if (i < 0) { if (maintenant - p.t > 3 * JOUR) { p.statut = 'perdue'; } continue; }
    const ttl = Math.round((p.tValide - p.t) / 900e3) - 1, st = statutDepuisSignal(m15, i, { sens: p.sens, stop: p.stop, limite: p.limite, cible: p.cible, ttl, R: 2, atr: null, options: optionsProposition(p.tf, ttl) }, configDe(p.actif));
    if (st.statut === 'cloturee') { const t = st.trade; p.statut = 'cloturee'; p.resultat = { R: t.R, Rbrut: t.Rbrut, coutsR: t.coutsTotalR != null ? t.coutsTotalR : t.coutsR, motif: t.motif, tEntree: t.t, tSortie: t.tSortie, prixEntree: t.prixEntree, prixSortie: t.prixSortie, barres: t.barres }; terminees.push(p); }
    else if (st.statut === 'ouverte') { p.statut = 'ouverte'; p.entreeTouchee = st.ouverte.t; }
    else if (st.statut === 'en_attente') p.statut = 'en_attente';
    else { p.statut = st.statut; p.resultat = null; terminees.push(p); }
  }
  return terminees;
}

/* Trades simulés en direct d'un type (propositions clôturées après leur émission, dans l'ordre). */
export function tradesLive(etat, cle) { return etat.propositions.filter(p => p.statut === 'cloturee' && p.resultat && (p.famille + '|' + p.type) === cle && p.actif === (cle.actif || p.actif)); }
export function liveParType(etat, maintenant) {
  const m = {};
  for (const p of etat.propositions) { if (p.statut !== 'cloturee' || !p.resultat) continue; const cle = p.actif + '|' + p.famille + '|' + p.type; (m[cle] = m[cle] || []).push(p); }
  const out = {};
  for (const [cle, l] of Object.entries(m)) { l.sort((a, b) => a.resultat.tSortie - b.resultat.tSortie); const R = l.map(x => x.resultat.R), sem = (l[l.length - 1].resultat.tSortie - l[0].t) / (7 * JOUR); out[cle] = { n: l.length, esperance: R.reduce((a, b) => a + b, 0) / R.length, semaines: Math.max(0, sem), R }; }
  void maintenant; return out;
}

/* Promotion / rétrogradation : compare le niveau mesuré à celui enregistré. La dérive en direct (CUSUM) rétrograde d'un cran un type Validée / Candidate. Écrit l'événement dans le journal. Rend les événements. */
export function majNiveaux(etat, mesure, maintenant) {
  const evenements = [], live = liveParType(etat, maintenant);
  for (const t of Object.values(mesure.types || {})) {
    const cle = mesure.actif + '|' + t.cle, ancien = etat.types[cle] ? etat.types[cle].niveau : null; let niveau = t.niveau, raison = t.pourquoi;
    const lv = live[cle];
    if (lv && (niveau === 'validee' || niveau === 'candidate') && lv.n >= 8 && t.esperance != null) {
      const sigma = Math.sqrt(lv.R.reduce((a, x) => a + (x - lv.esperance) ** 2, 0) / Math.max(1, lv.n - 1)) || 1, d = detecterDerive(lv.R, { attendu: t.esperance, sigma, seuil: 4, tradesMin: 8 });
      if (d.derive) { niveau = niveau === 'validee' ? 'candidate' : 'non_concluante'; raison = 'dérive en direct : ' + lv.n + ' trades simulés, espérance ' + (lv.esperance >= 0 ? '+' : '−') + Math.abs(lv.esperance).toFixed(2).replace('.', ',') + ' R au lieu de ' + t.esperance.toFixed(2).replace('.', ',') + ' R attendus (CUSUM ' + d.cusum.toFixed(1).replace('.', ',') + ').'; }
    }
    if (ancien !== niveau) {
      const monte = ancien && niveauAssezHaut(niveau, ancien) && niveau !== ancien, e = { t: maintenant, cle, actif: mesure.actif, de: ancien, vers: niveau, sens: ancien == null ? 'premiere_mesure' : monte ? 'promotion' : 'retrogradation', raison,
        texte: (ancien == null ? 'Première mesure : ' : monte ? 'PROMOTION : ' : 'RÉTROGRADATION : ') + t.nomType + ' (' + mesure.actif + ', ' + t.tf + ') passe de « ' + (ancien ? NIVEAUX[ancien] : '—') + ' » à « ' + NIVEAUX[niveau] + ' ». ' + raison };
      if (ancien != null || niveau === 'validee' || niveau === 'candidate') { evenements.push(e); etat.journalNiveaux.push(e); }
    }
    etat.types[cle] = { ordres: t.ordres || null, niveau, depuis: ancien === niveau && etat.types[cle] ? etat.types[cle].depuis : maintenant, esperance: t.esperance, n: t.n, nomType: t.nomType, actif: mesure.actif, tf: t.tf, agent: t.agent, type: t.type, famille: t.famille, fourchette: t.fourchette, tauxReussite: t.tauxReussite, rrMoyen: t.rrMoyen, coutMoyenR: t.coutMoyenR, versionCriteres: t.versionCriteres, pourquoi: raison, ratees: t.ratees, jeuFinal: t.jeuFinal, auditeur: t.auditeur ? { fait: t.auditeur.fait, ok: t.auditeur.ok } : null };
  }
  if (etat.journalNiveaux.length > 300) etat.journalNiveaux.splice(0, etat.journalNiveaux.length - 300);
  return evenements;
}

/* Les preuves au format attendu par `proposerPourActif` : { 'famille|type': { niveau, n, esperance, … } } pour UN actif. */
export function preuvesPourActif(etat, actif) {
  const out = {}; for (const [cle, t] of Object.entries(etat.types)) if (t.actif === actif) out[cle.slice(actif.length + 1)] = { niveau: t.niveau, n: t.n, esperance: t.esperance, tauxReussite: t.tauxReussite, rrMoyen: t.rrMoyen, fourchette: t.fourchette, versionCriteres: t.versionCriteres, pourquoi: t.pourquoi };
  return out;
}
