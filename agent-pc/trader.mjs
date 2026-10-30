// MODE TRADER DE KEPLER SUR LE PC (V12) : à chaque clôture de bougie M15, le moteur Trader (strategies/trader/) propose des positions RÉELLES sur BTC, SOL et DOGE (niveau « À l'essai » tant que la
// preuve manque), les suit automatiquement en simulation prudente (frais et glissement), tient le bilan par type de setup et promeut / rétrograde / désactive les types d'après les trades suivis EN AVANT.
// Tout est PROPOSITION et SIMULATION : aucun ordre n'est passé, aucune clé de courtier n'existe ici. Les critères de validation (criteres-v3/v4) ne sont ni lus ailleurs ni modifiés.
// État : trader.json (écrit de façon atomique), vue publiée dans etat.vuePubliee (routes /__agent/trader, paquet mobile).
import fs from 'node:fs';
import path from 'node:path';
import { lireJson, ecrireJson } from './etat-agent.mjs';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { preparer, proposer, STYLES, SETUPS, ORDRE_SETUPS } from '../strategies/trader/moteur.js';
import { simuler, COUTS_TRADER, GESTIONS } from '../strategies/trader/suivi.js';
import { bilanTrader, cleType, objectifHebdo, phraseEchantillon } from '../strategies/trader/bilan.js';
import { majTypes, actifDansRegime, NIVEAUX_TRADER, BANDEAU_ESSAI } from '../strategies/trader/niveaux.js';
import { retroTest, comparerGestion } from '../strategies/trader/retrotest.js';
import { configRicheDe, lireCoutsReglage } from './couts-reglage.mjs';
import { fr, prixTexte, PAS } from '../strategies/trader/outils.js';

export const FICHIER_TRADER = 'trader.json', FICHIER_COMMANDES_TRADER = 'trader-commandes.json';
const JOUR = 86400e3, FENETRE = 12000, MAX_PROPOSITIONS = 3000;
export const AVERTISSEMENT = 'Propositions et simulations seulement : aucun ordre n’est passé, aucun gain n’est garanti. Une position proposée n’est pas une promesse : la preuve se construit trade après trade.';
export const REGLAGES_DEFAUT = Object.freeze({ style: 'equilibre', niveauMin: 'a_lessai', actifs: ['BTC', 'SOL', 'DOGE'], setups: ORDRE_SETUPS, alertesObservation: false, risquePct: 0.5, afficherDemo: false, gestion: 'partielle' });
const NIVEAUX_ORDRE = { a_lessai: 1, candidate: 2, validee: 3 };

export function creerEtatTrader() { return { schema: 1, propositions: [], types: {}, journalNiveaux: [], reglages: {}, dernierCalcul: {}, refusJour: {}, analyses: {}, retro: {}, gestion: null, jourRetro: null, jourRapport: null, bougies: {}, dernierCycle: null, demarreLe: null }; }

export function creerTrader({ dossier, D, paires, maintenant = () => Date.now(), journal = () => {}, erreur = () => {}, envoyer = async () => {}, series = null } = {}) {
  const fichier = path.join(dossier, FICHIER_TRADER), fCommandes = path.join(dossier, FICHIER_COMMANDES_TRADER);
  let etat = lireJson(fichier, null); if (!etat || etat.schema !== 1) etat = creerEtatTrader();
  for (const [k, v] of Object.entries(creerEtatTrader())) if (etat[k] === undefined) etat[k] = v;
  if (!etat.demarreLe) etat.demarreLe = maintenant();
  const reglages = () => ({ ...REGLAGES_DEFAUT, ...(etat.reglages || {}) });
  const serieDe = a => (series ? series[a] : D.serie(a));
  const coutsDe = a => { try { const c = configRicheDe(a, lireCoutsReglage(dossier)); return { fraisPct: c.fraisPct, makerPct: c.makerPct, spreadPct: c.spreadPct, glissementPct: c.glissementPct, filePct: COUTS_TRADER.filePct }; } catch (e) { return COUTS_TRADER; } };
  const sauver = () => { try { etat.vuePubliee = vue(); ecrireJson(fichier, etat, { copies: 1 }); } catch (e) { erreur('sauvegarde du mode Trader', e); } };
  const niveauDe = p => (etat.types[cleType(p)] || { niveau: 'a_lessai' }).niveau;
  const indexDe = (m15, t) => { let lo = 0, hi = m15.n - 1; if (!m15.n || m15.t[0] > t) return -1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m15.t[k] <= t) lo = k; else hi = k - 1; } return m15.t[lo] === t ? lo : -1; };

  /* Commandes de l'écran : réglages (style, niveau minimal affiché, alertes d'observation, démo, setups), réactivation d'un type désactivé. */
  function lireCommandes() {
    const liste = lireJson(fCommandes, null); if (!Array.isArray(liste) || !liste.length) return 0;
    try { fs.unlinkSync(fCommandes); } catch (e) { /* déjà pris */ }
    for (const c of liste) {
      try {
        if (c.type === 'reglages') {
          const v = c.valeur || {}, n = { ...(etat.reglages || {}) };
          if (STYLES[v.style]) n.style = v.style;
          if (['a_lessai', 'candidate', 'validee'].includes(v.niveauMin)) n.niveauMin = v.niveauMin;
          if (typeof v.alertesObservation === 'boolean') n.alertesObservation = v.alertesObservation;
          if (typeof v.afficherDemo === 'boolean') n.afficherDemo = v.afficherDemo;
          if (Array.isArray(v.setups)) n.setups = v.setups.filter(s => SETUPS[s]);
          if (Array.isArray(v.actifs)) n.actifs = v.actifs.filter(a => paires.includes(a));
          if (v.risquePct != null) n.risquePct = Math.min(2, Math.max(0.05, +v.risquePct || 0.5));
          etat.reglages = n; journal('trader', 'Réglages du mode Trader modifiés : ' + Object.keys(v).join(', ') + '.');
        } else if (c.type === 'reactiver' && etat.types[c.valeur] && etat.types[c.valeur].niveau === 'desactive') {
          etat.types[c.valeur] = { ...etat.types[c.valeur], niveau: 'a_lessai', reactive: true, depuis: maintenant(), raison: 'Réactivé à la demande de Justin : le bilan repart de ses trades en avant.' };
          journal('trader', 'Type réactivé par Justin : ' + c.valeur + '.');
        }
      } catch (e) { erreur('commande du mode Trader', e); }
    }
    return liste.length;
  }

  /* Calcul en direct d'un actif à la clôture d'une nouvelle bougie M15. */
  async function calculerActif(a, R) {
    const s = serieDe(a); if (!s || s.n < 3000) return 0; const derniere = s.t[s.n - 1];
    if (etat.dernierCalcul[a] === derniere) return 0;
    const m15 = tranche(s, Math.max(0, s.n - FENETRE), s.n), i = m15.n - 1, P = preparer(m15), S = STYLES[R.style];
    const r = proposer(P, i, { style: R.style, actif: a, setups: R.setups }); let nouvelles = 0;
    etat.dernierCalcul[a] = derniere;
    etat.analyses[a] = { t: m15.t[i] + PAS, prix: m15.c[i], biais: r.analyse.biais, regime: r.analyse.regime, struct: r.analyse.struct };
    const bg = []; for (let q = Math.max(0, m15.n - 140); q < m15.n; q++) bg.push([m15.t[q], m15.o[q], m15.h[q], m15.l[q], m15.c[q]]); etat.bougies[a] = bg;
    const jour = Math.floor(m15.t[i] / JOUR), refus = (etat.refusJour[a] = (etat.refusJour[a] && etat.refusJour[a].jour === jour) ? etat.refusJour[a] : { jour, liste: [] });
    for (const x of r.refus) if (!refus.liste.some(y => y.setup === x.setup && y.sens === x.sens && y.pourquoi === x.pourquoi)) refus.liste.push({ ...x, t: m15.t[i] + PAS });
    refus.liste = refus.liste.slice(-30);
    const deLActif = etat.propositions.filter(p => p.actif === a && p.source !== 'retro');
    for (const p of r.propositions) {
      const tSig = m15.t[i];
      if (deLActif.filter(q => Math.floor(q.tSignal / JOUR) === jour && !q.fantome).length >= S.maxParJour) { refus.liste.push({ setup: p.setup, sens: p.sens, pourquoi: 'plafond de ' + S.maxParJour + ' propositions par jour atteint (style ' + S.nom + ')', t: tSig + PAS }); continue; }
      if (deLActif.some(q => q.setup === p.setup && q.sens === p.sens && tSig - q.tSignal < 8 * PAS)) continue;
      if (deLActif.filter(q => (q.statut === 'en_attente' || q.statut === 'ouverte') && !q.fantome).length >= 2) { refus.liste.push({ setup: p.setup, sens: p.sens, pourquoi: 'deux positions déjà en cours sur ' + a, t: tSig + PAS }); continue; }
      const cle = cleType(p), type = etat.types[cle], fantome = !!(type && type.niveau === 'desactive');
      const avant = etat.propositions.filter(q => q.source !== 'retro' && cleType(q) === cle && q.resultat && q.resultat.statut === 'cloturee').map(q => ({ R: q.resultat.R, regime: q.regime }));
      const g = actifDansRegime(avant, p.regime); let masque = null; if (!g.actif) { masque = g.raison; refus.liste.push({ setup: p.setup, sens: p.sens, pourquoi: g.raison, t: tSig + PAS }); }
      const rec = { id: p.id, actif: a, setup: p.setup, nom: p.nom, tf: p.tf, sens: p.sens, tSignal: tSig, t: p.t, entree: p.entree, stop: p.stop, cible1: p.cible1, cible1Nom: p.cible1Nom, cible2: p.cible2, cible2Nom: p.cible2Nom, rr: p.rr, rr2: p.rr2,
        distancePct: p.distancePct, raison: p.raison, invalidation: p.invalidation, confluences: p.confluences.map(c => c.texte), nConfluences: p.nConfluences, diamant: p.diamant, regime: p.regime, biais: p.biais, style: R.style, ttl: p.ttl, atr: p.atr,
        statut: 'en_attente', resultat: null, fantome: fantome || !!masque, masque, source: 'direct', creeLe: maintenant() };
      etat.propositions.push(rec); nouvelles++;
      if (!rec.fantome) await alerter(rec, R).catch(() => {});
    }
    if (etat.propositions.length > MAX_PROPOSITIONS) etat.propositions.splice(0, etat.propositions.length - MAX_PROPOSITIONS);
    return nouvelles;
  }
  async function alerter(p, R) {
    const niveau = niveauDe(p), texte = [(niveau === 'validee' ? 'Kepler — position proposée' : 'Kepler — Observation (non validé)') + ' · ' + p.actif + ' ' + p.tf, (p.sens > 0 ? 'ACHAT' : 'VENTE') + ' limite ' + prixTexte(p.entree) + ' · stop ' + prixTexte(p.stop) + ' · cible 1 ' + prixTexte(p.cible1) + ' · cible 2 ' + prixTexte(p.cible2) + ' · RR ' + fr(p.rr, 1),
      p.raison, 'Niveau : ' + NIVEAUX_TRADER[niveau] + (niveau === 'a_lessai' ? ' — pas de preuve statistique, le bilan se construit en direct.' : ''), AVERTISSEMENT].join('\n');
    if (niveau === 'validee') await envoyer(texte, 'ENTREE'); else if (R.alertesObservation) await envoyer(texte, 'OBSERVATION');
  }

  /* Suivi : rejoue la simulation de chaque proposition encore ouverte sur les bougies actuelles. Rend les propositions qui viennent de se terminer. */
  function suivre() {
    const terminees = [], cache = new Map();
    for (const p of etat.propositions) {
      if (p.source === 'retro' || (p.statut !== 'en_attente' && p.statut !== 'ouverte')) continue;
      const s = serieDe(p.actif); if (!s) continue;
      if (!cache.has(p.actif)) cache.set(p.actif, tranche(s, Math.max(0, s.n - FENETRE), s.n)); const m15 = cache.get(p.actif), i = indexDe(m15, p.tSignal);
      if (i < 0) { if (maintenant() - p.t > 3 * JOUR) { p.statut = 'perdue'; p.resultat = { statut: 'perdue', R: 0, motif: 'données manquantes pour suivre cette position' }; } continue; }
      const r = simuler(m15, { ...p, i }, { couts: coutsDe(p.actif), gestion: reglages().gestion, maxBarres: p.tf === 'H1' ? 192 : 96 });
      const avant = p.statut; p.statut = r.statut; p.resultat = r.statut === 'en_attente' ? null : r;
      if (r.iEntree != null) p.tEntree = m15.t[r.iEntree];
      if (r.iSortie != null) p.tSortie = m15.t[r.iSortie] + PAS;
      if (r.statut !== 'en_attente' && r.statut !== 'ouverte' && avant !== r.statut) terminees.push(p);
    }
    return terminees;
  }

  /* Tâche du jour : rétro-test à titre d'exemple, comparaison de gestion, mise à jour des niveaux. */
  async function tacheQuotidienne() {
    const jour = Math.floor(maintenant() / JOUR); if (etat.jourRetro === jour) return; etat.jourRetro = jour;
    const R = reglages(); const toutes = [];
    for (const a of R.actifs) {
      const s = serieDe(a); if (!s || s.n < 12000) continue;
      const mois = Math.min(12, Math.floor(s.n / 2920) - 2), r = retroTest(s, { actif: a, mois, style: R.style, couts: coutsDe(a) });
      etat.retro[a] = { etiquette: r.etiquette, de: r.de, a: r.a, n: r.propositions.length, stats: r.bilan.tous.stats, hasard: r.bilan.hasard && r.bilan.hasard[a], parSetup: r.bilan.parSetup.map(x => ({ setup: x.cle, stats: x.stats })), faux: r.bilan.tous.stats.n ? 1 - r.bilan.tous.stats.taux : null };
      for (const p of r.propositions) toutes.push(p);
      if (a === 'BTC') { const g = comparerGestion(s, r.propositions.map(p => ({ ...p, i: p.i + 0 })), { couts: coutsDe(a), coupe: Math.floor(s.n - mois * 2920 * 0.4) }); etat.gestion = { etiquette: 'rétro-test à titre d’exemple — pas une preuve', retenue: g.retenue, phrase: g.phrase, lignes: g.lignes.map(l => ({ gestion: l.gestion, texte: l.texte, etude: l.etude.esperance, inconnue: l.inconnue.esperance, nEtude: l.etude.n, nInconnue: l.inconnue.n })) }; }
      journal('trader', 'Rétro-test (exemple, pas une preuve) ' + a + ' : ' + r.propositions.length + ' propositions, ' + (r.bilan.tous.stats.esperance == null ? '—' : fr(r.bilan.tous.stats.esperance, 2) + ' R par trade') + '.');
    }
    void toutes;
  }
  function mettreAJourNiveaux() {
    const ev = majTypes(etat.types, etat.propositions, maintenant(), { cleDe: cleType });
    for (const e of ev) { etat.journalNiveaux.push(e); journal('trader', e.texte); envoyer(['Kepler — mode Trader', e.texte, AVERTISSEMENT].join('\n'), 'OBSERVATION').catch(() => {}); }
    if (etat.journalNiveaux.length > 300) etat.journalNiveaux.splice(0, etat.journalNiveaux.length - 300);
    return ev;
  }

  async function rapportDuMatin(force = false) {
    const t = maintenant(), jour = Math.floor(t / JOUR); if (!force && (etat.jourRapport === jour || new Date(t).getUTCHours() < 6 || !Object.keys(etat.dernierCalcul).length)) return false;
    etat.jourRapport = jour; await envoyer(['Kepler — mode Trader du ' + new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/'), ...lignesMatin(), AVERTISSEMENT].join('\n'), 'OBSERVATION').catch(() => {});
    journal('trader', 'Résumé du matin du mode Trader envoyé.'); return true;
  }
  function lignesMatin() {
    const v = vue(), L = [], act = v.actives.slice(0, 5);
    L.push(act.length ? act.length + ' position(s) à suivre :' : 'Aucune position proposée en ce moment.');
    for (const p of act) L.push('• ' + p.actif + ' ' + p.tf + ' ' + (p.sens > 0 ? 'ACHAT' : 'VENTE') + ' limite ' + prixTexte(p.entree) + ' / stop ' + prixTexte(p.stop) + ' / cible ' + prixTexte(p.cible1) + ' (' + p.niveauTexte + ')');
    L.push('Bilan simulé en direct : ' + v.bilan.phrase);
    return L;
  }

  /* Un cycle : commandes, calcul en direct, suivi, niveaux, tâche du jour, résumé du matin, sauvegarde. */
  async function cycle() {
    const cr = { nouvelles: 0, terminees: 0 }, R = reglages();
    try { lireCommandes(); } catch (e) { erreur('commandes du mode Trader', e); }
    for (const a of R.actifs) if (paires.includes(a)) { try { cr.nouvelles += await calculerActif(a, R); } catch (e) { erreur('mode Trader ' + a, e); } }
    try { const fin = suivre(); cr.terminees = fin.length; for (const p of fin) if (!p.fantome) journal('trader', 'Position ' + p.actif + ' ' + p.tf + ' (' + p.nom + ') terminée : ' + (p.resultat && p.resultat.statut === 'cloturee' ? (p.resultat.R >= 0 ? '+' : '−') + fr(Math.abs(p.resultat.R), 2) + ' R (' + p.resultat.motif + ')' : (p.resultat && p.resultat.motif) || p.statut) + '.'); } catch (e) { erreur('suivi du mode Trader', e); }
    try { mettreAJourNiveaux(); } catch (e) { erreur('niveaux du mode Trader', e); }
    try { await tacheQuotidienne(); } catch (e) { erreur('tâches du jour du mode Trader', e); }
    try { await rapportDuMatin(); } catch (e) { erreur('résumé du matin du mode Trader', e); }
    etat.dernierCycle = maintenant(); sauver(); return cr;
  }

  /* La vue publiée : positions actives avec niveau et confiance honnête, récentes, bilan, types, rétro-test (étiqueté), pourquoi pas plus, journal. */
  function confianceDe(p) {
    const t = etat.types[cleType(p)]; if (!t || !t.n) return 'Aucun trade terminé de ce type suivi en direct : pas assez de trades pour juger.';
    return phraseEchantillon({ n: t.n, esperance: t.esperance, ic: t.ic }) + ' (' + t.n + ' trade(s) en direct' + (t.ic ? ', espérance ' + fr(t.esperance, 2) + ' R, fourchette ' + fr(t.ic[0], 2) + ' à ' + fr(t.ic[1], 2) : '') + ')';
  }
  function enrichir(p) {
    const niveau = niveauDe(p);
    return { id: p.id, actif: p.actif, setup: p.setup, nom: p.nom, tf: p.tf, sens: p.sens, tSignal: p.tSignal, t: p.t, tValide: p.t + (p.ttl || 16) * PAS, entree: p.entree, stop: p.stop, cible1: p.cible1, cible1Nom: p.cible1Nom, cible2: p.cible2, cible2Nom: p.cible2Nom, rr: p.rr, rr2: p.rr2, raison: p.raison, invalidation: p.invalidation,
      confluences: p.confluences, nConfluences: p.nConfluences, diamant: p.diamant, regime: p.regime, style: p.style, statut: p.statut, statutTexte: statutTexte(p), resultat: p.resultat ? { statut: p.resultat.statut, R: p.resultat.R, motif: p.resultat.motif } : null, tEntree: p.tEntree || null, tSortie: p.tSortie || null,
      niveau, niveauTexte: NIVEAUX_TRADER[niveau], confiance: confianceDe(p), fantome: !!p.fantome, masque: p.masque || null, source: p.source };
  }
  const statutTexte = p => ({ en_attente: 'en attente (ordre limite pas encore touché)', ouverte: 'entrée touchée', cloturee: p.resultat ? 'terminée : ' + p.resultat.motif : 'terminée', expiree: 'expirée (ordre non touché)', annulee: 'annulée (' + ((p.resultat && p.resultat.motif) || 'le prix est parti sans nous') + ')', perdue: 'suivi impossible (données manquantes)' }[p.statut] || p.statut);
  function vue() {
    const R = reglages(), t = maintenant(), min = NIVEAUX_ORDRE[R.niveauMin] || 1, direct = etat.propositions.filter(p => p.source !== 'retro' && !p.fantome);
    const actives = direct.filter(p => (p.statut === 'en_attente' || p.statut === 'ouverte') && t < p.t + (p.ttl || 16) * PAS + 2 * 3600e3).map(enrichir).filter(p => (NIVEAUX_ORDRE[p.niveau] || 1) >= min).sort((a, b) => b.nConfluences - a.nConfluences || b.rr - a.rr);
    const recentes = direct.slice(-60).reverse().map(enrichir);
    const propsBilan = direct.map(p => ({ ...p, resultat: p.resultat, tSortie: p.tSortie })), bilan = bilanTrader(propsBilan, { risquePct: R.risquePct });
    const types = Object.entries(etat.types).map(([cle, x]) => ({ cle, nom: cle.split('|').map((v, i) => (i === 0 ? SETUPS[v] || v : v)).join(' · '), niveau: x.niveau, niveauTexte: NIVEAUX_TRADER[x.niveau], raison: x.raison, n: x.n, esperance: x.esperance, ic: x.ic, taux: x.taux, depuis: x.depuis, baisse: x.baisse && x.baisse.baisse ? x.baisse.texte : null }))
      .sort((a, b) => (b.esperance ?? -9) - (a.esperance ?? -9));
    const derniere = etat.dernierCycle, donnees = {}; for (const a of R.actifs) { const s = (() => { try { return serieDe(a); } catch (e) { return null; } })(); if (s && s.n) donnees[a] = { derniereBougie: s.t[s.n - 1] + PAS, ageMin: Math.round((t - (s.t[s.n - 1] + PAS)) / 60000) }; }
    const pourquoi = []; for (const a of Object.keys(etat.refusJour)) for (const x of (etat.refusJour[a].liste || []).slice(-6)) pourquoi.push({ actif: a, setup: SETUPS[x.setup] || x.setup, sens: x.sens, pourquoi: x.pourquoi, t: x.t });
    return { ok: true, version: 12, t, reglages: R, style: STYLES[R.style], styles: STYLES, setups: SETUPS, gestions: GESTIONS, niveaux: NIVEAUX_TRADER, bandeau: BANDEAU_ESSAI, avertissement: AVERTISSEMENT, actives, recentes, bilan: compactBilan(bilan), objectifHebdo: objectifHebdo(propsBilan, { risquePct: R.risquePct, maintenant: t }),
      types, retro: etat.retro, gestion: etat.gestion, analyses: etat.analyses, bougies: etat.bougies, donnees, dernierCycle: derniere, pourquoi: pourquoi.sort((a, b) => b.t - a.t).slice(0, 24), journalNiveaux: etat.journalNiveaux.slice(-30).reverse(),
      courbe: courbeR(propsBilan), fantomes: etat.propositions.filter(p => p.fantome && p.source !== 'retro').length };
  }
  const compactBilan = b => ({ phrase: b.phrase, risquePct: b.risquePct, totalPct: b.totalPct, tous: b.tous, parType: b.parType.map(x => ({ cle: x.cle, propositions: x.propositions, executees: x.executees, enAttente: x.enAttente, expirees: x.expirees, stats: x.stats })), parActif: b.parActif, parTf: b.parTf, parStyle: b.parStyle, parSetup: b.parSetup });
  function courbeR(props) {
    const c = props.filter(p => p.resultat && p.resultat.statut === 'cloturee' && p.tSortie).sort((a, b) => a.tSortie - b.tSortie); let cum = 0; const pts = c.map(p => { cum += p.resultat.R; return [p.tSortie, +cum.toFixed(3)]; });
    return pts.length > 200 ? pts.filter((_, i) => i % Math.ceil(pts.length / 200) === 0 || i === pts.length - 1) : pts;
  }
  return { cycle, vue, etat: () => etat, sauver, reglages, lireCommandes, rapportDuMatin, lignesMatin, calculerActif: a => calculerActif(a, reglages()), suivre, mettreAJourNiveaux, tacheQuotidienne };
}
