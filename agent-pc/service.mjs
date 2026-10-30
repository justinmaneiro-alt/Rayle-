// SERVICE DE L'AGENT SUR LE PC : Kepler, l'agent unique, tourne en arrière-plan sans que Rayle soit ouverte.
//   node agent-pc/service.mjs                 démarre (une seule instance) ; priorité BASSE du système
//   node agent-pc/service.mjs --statut        affiche l'état
//   node agent-pc/service.mjs --pause / --reprendre / --arreter / --charge faible|normal|fort / --retour-arriere [n°] / --rapport
// Un cycle (≈ 30 s) : (1) données (mise à jour QUOTIDIENNE complète, puis chaque minute les bougies fermées) ; (2) surveillance des stratégies actives (compte simulé, alertes) ;
// (3) recherche permanente par tranches (jamais pendant que tu joues, jamais en pause) ; (4) synchronisation avec le Worker (battement séparé toutes les 30 s : le Worker sait que le PC est là
// et ne double pas les alertes ; PC éteint = le Worker prend le relais) ; (5) rapport hebdomadaire. Aucun ordre n'est passé, aucune clé de courtier n'existe ici.
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dossierAgent, fichiersAgent, chargerEtat, sauverEtat, ajouterJournal, lireConfig, lireJson, ecrireJson, vivant } from './etat-agent.mjs';
import { creerDonnees, jourDe } from './donnees-agent.mjs';
import { creerSync, etatPourWorker } from './sync-worker.mjs';
import { creerPousseur } from './bundle-mobile.mjs';   // V8 : paquet mobile (téléphone et tablette) publié vers le Worker
import { ecrireRapport } from './llm.mjs';
import { planifier, lireCache, ecrireCache, executerTache, integrerResultat, CHARGES, GENERATIONS_MAX, empreinteTache } from './recherche.mjs';
import { lireEquipe, ecrireEquipe, executerChercheur, tachesHypotheses, marquerTest, ecrireRapportAuditeur, resumeEquipe, noter as noterEquipe } from './equipe/equipe.mjs';
import { enregistrerHypothese, construireFaitsChercheur } from '../strategies/equipe/chercheur.js';
import { calculerDiagnostic } from './diagnostic.mjs';
import { lireCoutsReglage, ecrireExemple, configRicheDe } from './couts-reglage.mjs';
import { estRiche } from '../strategies/direct-riche.js';
import { calculerCouts } from './couts-en-r.mjs';
import { lirePepiniere, alimenter, avancerPepiniere, resumePepiniere } from './pepiniere.mjs';
import { majOccasions, resumeOccasions, expliquerExemple, resumeExemples, ajusterRecherche, rapportQuotidien, alerteObservationTexte } from '../strategies/autonomie.js';
import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { journaliser, creerVersion, retourArriere, strategiesActives, statutAgent, promouvoir, mettreEnPause, jalon, versionActive, exporterRegles } from '../strategies/agent-etat.js';
import { surveillerRegle } from '../strategies/surveillance-commune.js';
import { enregistrerAlertes, construireAlerte, filtrerAlertes } from '../strategies/alertes-v3.js';
import { faitsRapport, rapportTemplate } from '../strategies/rapport-v3.js';
import { phraseFraisEtat } from '../strategies/agent-etat.js';
import { simulationTerminee } from '../strategies/agent-etat.js';
import { decouper } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { ORDRE_PAIRES, PAIRES_EXTRA } from '../planetes/mars/pc/agent-m6/paires.js';
import { planifierNiveaux } from './extension.mjs';
import { planAttente } from '../strategies/extension-recherche.js';
import { meilleuresPistes, lignesRapportPistes } from '../strategies/pistes.js';
import { creerDetecteurJeu } from '../app-pc/veilleur/charge-systeme.mjs';
import { dossierVeilleur } from '../app-pc/veilleur/dossier.mjs';
import { assurerEnregistreur, statutFlux } from './flux/service-flux.mjs';
import { statutService, verrouRespecte } from './service-statut.mjs';
import { creerVolume } from './volume-v14.mjs';      // V14 : tableau vivant (volume, carnet, portefeuille virtuel)
import { creerTrader } from './trader.mjs';      // V12 : mode Trader (positions réelles à chaque bougie, bilan en direct)
import { creerPositions } from './positions.mjs';      // V7 : les trois agents de positions (Rebond, Continuation, Extrêmes)

export const VERSION_SERVICE = 1;
export const CYCLE_MS = 30000, FENETRE_LIVE = 3000, FENETRE_RICHE = 6000, TRANCHE_MS = 4 * 60e3, JEUX_PAR_DEFAUT = ['valorant', 'cs2', 'csgo', 'fortniteclient-win64-shipping', 'eldenring', 'leagueclient', 'league of legends', 'overwatch', 'rocketleague', 'gta5', 'cyberpunk2077', 'baldursgate3', 'minecraft'];
const semaineISO = t => { const d = new Date(t), j = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), n = j.getUTCDay() || 7; j.setUTCDate(j.getUTCDate() + 4 - n); const a = new Date(Date.UTC(j.getUTCFullYear(), 0, 1)); return j.getUTCFullYear() + '-S' + String(Math.ceil(((j - a) / 86400e3 + 1) / 7)).padStart(2, '0'); };

export function creerService({ dossier = dossierAgent(), maintenant = () => Date.now(), donnees = null, sync = null, ecrire = ecrireRapport, executer = executerTache, detecteur = null, fetchImpl = globalThis.fetch, paires: pairesBase = ORDRE_PAIRES, tranchesMs = TRANCHE_MS, sansPriorite = false, avecFlux = false, avecEquipe = false, avecPepiniere = false, avecPositions = false, avecTrader = false, avecVolume = false } = {}) {
  const F = fichiersAgent(dossier); fs.mkdirSync(dossier, { recursive: true });
  const extrasInit = (() => { const e = lireJson(F.etat, null); return Array.isArray(e && e.actifsExtra) ? e.actifsExtra.filter(x => PAIRES_EXTRA[x] && !pairesBase.includes(x)) : []; })();      // V6 : actifs ajoutés par Justin (--ajouter-actif)
  const paires = [...pairesBase, ...extrasInit];
  const config = lireConfig(dossier), S = sync || creerSync({ config, fetchImpl }), D = donnees || creerDonnees({ dossier: F.donnees, paires, maintenant, journal: m => journal('donnees', m) });
  const jeu = detecteur || creerDetecteurJeu({ dossier: dossierVeilleur() });
  let etat = chargerEtat(dossier, maintenant()), suivi = lireJson(F.suivi, {}) || {}, dernierJourDonnees = null, derniereTranche = 0, dernierBattement = 0, enCalcul = false, arretDemande = false, pausesLevees = {};
  const info = { version: VERSION_SERVICE, pid: process.pid, demarreLe: maintenant(), vivantLe: maintenant(), phase: 'demarrage', raison: null, erreurs: [], donnees: null, derniereRecherche: null, worker: { configure: S.configure, ok: null, t: null, msg: null }, jeu: false, tranchesFaites: 0 };
  const journal = (type, texte, donneesLog = null) => { journaliser(etat, type, texte, maintenant(), donneesLog); try { ajouterJournal({ type, texte }, dossier); } catch (e) { /* disque */ } };
  const erreur = (ou, e) => { const msg = ou + ' : ' + String(e && e.message || e).slice(0, 160); info.erreurs.unshift({ t: maintenant(), msg }); info.erreurs.length = Math.min(info.erreurs.length, 8); journal('erreur', msg); };
  const ecrireInfo = () => { info.vivantLe = maintenant(); try { ecrireJson(F.service, info); } catch (e) { /* tant pis */ } };
  const sauver = () => { etat.miseAJour = maintenant(); try { sauverEtat(etat, dossier); ecrireJson(F.suivi, suivi); } catch (e) { erreur('sauvegarde', e); } };
  const charge = () => CHARGES[etat.parametresRisque.charge] || CHARGES.normal;
  const pcInfo = () => ({ phase: info.phase, rechercheEnCours: enCalcul, enPreparation: Object.values(suivi).some(s => s && s.pendante), positionOuverte: Object.values(suivi).some(s => s && s.position), charge: etat.parametresRisque.charge });

  /* ── commandes (pause, reprise, charge, retour arrière, rapport) : du Worker (page, voix) ou du fichier de commandes local ── */
  async function appliquerCommande(c) {
    if (c.type === 'pause') { etat.parametresRisque.pause = true; journal('commande', 'Agent mis en pause.'); }
    else if (c.type === 'reprendre') { etat.parametresRisque.pause = false; journal('commande', 'Agent repris.'); }
    else if (c.type === 'charge' && CHARGES[c.valeur]) { etat.parametresRisque.charge = c.valeur; journal('commande', 'Charge de calcul : ' + c.valeur + '.'); }
    else if (c.type === 'retour_arriere') { const r = retourArriere(etat, c.numero || null, maintenant()); if (r.ok) { await pousserEtat({ forcer: true }); await alerter([construireAlerte('RAPPORT', { extra: { lignes: ['Retour arrière : la version v' + r.numero + ' est de nouveau active.'], semaine: 'retour-' + maintenant() } }, maintenant())]); } }
    else if (c.type === 'rapport') await faireRapport(true);
    else if (c.type === 'observation') { etat.parametresRisque.observation = !!c.valeur; journal('commande', 'Alertes observation (non validé) : ' + (c.valeur ? 'ACTIVÉES' : 'désactivées') + '.'); }
    else if (c.type === 'rapport_quotidien') await autonomieDuJour(true);
    else if (c.type === 'niveau_preuve') { etat.parametresRisque.niveauPreuve = c.valeur === 'strict' ? 'strict' : 'equilibre'; journal('commande', 'Niveau de preuve : ' + (c.valeur === 'strict' ? 'STRICT (v3)' : 'ÉQUILIBRÉ (v4)') + '.'); }
    else if (c.type === 'tests_multiples') { const on = c.valeur === 'corriges' || c.valeur === true; etat.parametresRisque.testsMultiplesCorriges = on; journal('commande', 'Tests multiples : règle de validation ' + (on ? 'CORRIGÉE (nombre effectif d’essais ; voie à valider par Justin) — la recherche est refaite avec cette règle' : 'ANCIENNE (tous les essais comptés ; règle par défaut)') + '. Les seuils des critères ne changent pas.'); }
    else if (c.type === 'exemple' || c.type === 'reglages') { const loc = path.join(dossier, 'positions-commandes.json'), l = lireJson(loc, []) || []; l.push({ type: c.type, valeur: c.valeur }); ecrireJson(loc, l.slice(-20)); journal('commande', 'Commande « ' + c.type + ' » reçue du téléphone, transmise aux positions.'); }   // V8 : revalidée par positions.mjs
    else if (c.type === 'ajouter_actif') { const id = String(c.valeur || '').toUpperCase(); if (!PAIRES_EXTRA[id] && !ORDRE_PAIRES.includes(id)) journal('commande', 'Actif inconnu : ' + id + ' (possibles : ' + Object.keys(PAIRES_EXTRA).join(', ') + ').'); else if (ORDRE_PAIRES.includes(id) || (etat.actifsExtra || []).includes(id)) journal('commande', id + ' est déjà dans la recherche.'); else { etat.actifsExtra = [...(etat.actifsExtra || []), id]; sauver(); journal('commande', 'Actif ' + id + ' ajouté à la recherche : arrête le service (node agent-pc/service.mjs --arreter), attends 1 minute et relance-le pour télécharger son historique public Binance (gratuit, plusieurs minutes). Le compteur de variantes de cet actif repart de zéro, celui des autres ne baisse pas.'); } }
  }
  async function lireCommandes() {
    const ids = [];
    if (S.configure) { try { const r = await S.battement(pcInfo()); info.worker = { configure: true, ok: true, t: maintenant(), msg: null }; for (const c of r.commandes || []) { await appliquerCommande(c); ids.push(c.id); } if (ids.length) await S.commandesTraitees(ids).catch(() => {}); } catch (e) { info.worker = { configure: true, ok: false, t: maintenant(), msg: String(e.message).slice(0, 100) }; } }
    const loc = path.join(dossier, 'commandes.json'), liste = lireJson(loc, null);                               // commandes locales (--pause, --reprendre… écrites par la ligne de commande)
    if (Array.isArray(liste) && liste.length) { try { fs.unlinkSync(loc); } catch (e) { /* déjà pris */ } for (const c of liste) await appliquerCommande(c); }
  }
  /* Synchronisation avec le Worker, ESPACÉE (limites gratuites de la base D1) : rien n'est envoyé si l'état n'a pas changé depuis le dernier envoi réussi (sauf un envoi de contrôle toutes les 10 minutes),
     et jamais plus d'un envoi toutes les 2 minutes, sauf `forcer` (nouvelle version, retour arrière). Le Worker refuse aussi ce qui n'a pas changé : double protection. */
  let dernierEnvoi = { h: null, t: 0 };
  async function pousserEtat({ forcer = false } = {}) {
    if (!S.configure) return null;
    const corps = etatPourWorker(etat), h = createHash('sha1').update(JSON.stringify([corps, suivi])).digest('hex'), t = maintenant();
    if (!forcer && dernierEnvoi.t && ((h === dernierEnvoi.h && t - dernierEnvoi.t < 10 * 60e3) || t - dernierEnvoi.t < 2 * 60e3)) return null;
    try {
      const r = await S.synchroniser(corps, suivi, pausesLevees, forcer); pausesLevees = {};
      if (!r || !r.differe) dernierEnvoi = { h, t };                                    // « différé » = le Worker est près de sa limite : on réessaiera au prochain cycle
      for (const [id, s] of Object.entries((r && r.suiviWorker) || {})) if (s && (suivi[id] == null || (s.derniereBarre || 0) > (suivi[id].derniereBarre || 0))) { suivi[id] = s; journal('sync', 'Le Worker a surveillé ' + id + ' pendant que le PC était éteint : son suivi est repris.'); }
      info.worker = { configure: true, ok: true, t: maintenant(), msg: r && r.differe ? 'Worker près de sa limite du jour : envoi différé' : null }; return r;
    } catch (e) { info.worker = { configure: true, ok: false, t: maintenant(), msg: String(e.message).slice(0, 100) }; return null; }
  }
  const pousserMobile = creerPousseur({ dossier, S, journal: m => journal('mobile', m), maintenant });
  /* Au démarrage : reprendre ce que le Worker a fait pendant que le PC était éteint (suivi plus récent, alertes, règles en pause pour dérive). */
  async function reprendreDepuisWorker() {
    if (!S.configure) return;
    try {
      const r = await S.etat(); if (!r || !r.etat) return;
      for (const [id, s] of Object.entries(r.suivi || {})) if (s && (suivi[id] == null || (s.derniereBarre || 0) > (suivi[id].derniereBarre || 0))) suivi[id] = s;
      const cles = new Set(etat.alertes.map(a => a.cle)); let n = 0; for (const a of r.etat.alertes || []) if (!cles.has(a.cle)) { etat.alertes.push(a); n++; }
      for (const [id, p] of Object.entries((r.meta && r.meta.pausesRegles) || {})) if (mettreEnPause(etat, id, 'dérive détectée par le Worker (CUSUM ' + (p.cusum ? p.cusum.toFixed(1) : '?') + ')', maintenant())) pausesLevees = pausesLevees;
      if (n) journal('sync', n + ' alerte(s) envoyée(s) par le Worker pendant l’absence du PC reprises dans le journal.');
    } catch (e) { /* Worker injoignable : on continue en local */ }
  }
  async function alerter(alertes) {
    const gardees = filtrerAlertes(etat, alertes, maintenant()); if (!gardees.length) return 0;
    enregistrerAlertes(etat, gardees);
    for (const a of gardees) { try { if (S.configure) await S.telegram(a.texte, a.type === 'ENTREE' ? 'ENTREE' : a.type === 'PREPARATION' ? 'PREPARATION' : 'OBSERVATION'); a.envoyee = true; } catch (e) { a.envoyee = false; info.erreurs.unshift({ t: maintenant(), msg: 'Telegram : ' + String(e.message).slice(0, 100) }); } }
    return gardees.length;
  }

  /* ── (1) données ── */
  async function donneesDuJour(force = false) {
    const aujourdhui = jourDe(maintenant());
    if (!force && dernierJourDonnees === aujourdhui) return null;
    info.phase = 'donnees'; ecrireInfo();
    const rapport = await D.maintenirChaqueJour({ surProgres: p => { info.raison = 'données ' + p.paire + ' (' + p.phase + ')'; ecrireInfo(); } });
    dernierJourDonnees = aujourdhui; info.donnees = rapport.map(r => ({ paire: r.paire, n: r.n, jourFin: r.jourFin, trous: r.trous, integrite: r.integrite && r.integrite.ok, financement: r.derives && r.derives.financement, intereOuvert: r.derives && r.derives.metrics, erreur: r.erreur || null }));
    etat.donnees = { majLe: maintenant(), paires: info.donnees };
    journal('donnees', 'Mise à jour quotidienne : ' + info.donnees.map(d => d.paire + ' ' + (d.n || 0) + ' bougies jusqu’au ' + d.jourFin).join(' · '));
    await revalider(); return rapport;
  }
  /* Revalidation quotidienne des stratégies actives : même calcul qu'en backtest, sur les bougies POSTÉRIEURES à leur validation (jamais une nouvelle sélection ; aucun variant compté). */
  async function revalider() {
    for (const s of strategiesActives(etat)) {
      try {
        const serie = D.serie(s.paire); if (!serie || serie.n < 2000 || !s.validation || !s.validation.t) continue;
        const r = suivi[s.id]; if (!r) continue;
        s.derniereRevalidation = { t: maintenant(), tradesDepuisValidation: r.trades.filter(x => x.t >= s.validation.t).length, avecDonneesJusquau: jourDe(serie.t[serie.n - 1]) };
      } catch (e) { erreur('revalidation ' + s.id, e); }
    }
  }

  /* ── (2) surveillance en direct ── */
  async function surveiller() {
    const regles = exporterRegles(etat); let nouvellesAlertes = 0;
    for (const regle of regles) {
      const serie = D.serie(regle.paire); if (!serie || serie.n < 1500) continue;
      const lim = estRiche(regle.famille) ? FENETRE_RICHE : FENETRE_LIVE;      // les familles de la V6 ont besoin de ≈ 4000 bougies pour chauffer les indicateurs H4
      const fen = serie.n > lim ? tranche(serie, serie.n - lim, serie.n) : serie, s = etat.strategies[regle.id];
      const alertesRec = etat.alertes.filter(a => maintenant() - a.t < 8 * 86400e3);
      const r = surveillerRegle({ regle, s, suivi: suivi[regle.id] || null, serie: fen, risque: etat.parametresRisque, alertesRecentes: alertesRec, maintenant: maintenant(), config: configRicheDe(regle.paire, lireCoutsReglage(dossier)) });
      if (r.erreur) continue;
      suivi[regle.id] = r.suivi; for (const x of r.suivi.trades) if (x.version == null) x.version = etat.active;   // version de l'agent qui a pris le trade (filtre de l'écran)
      // trades simulés clos → liste de l'état (affichage, rapport)
      for (const ev of r.evenements) if (ev.type === 'CLOTURE') { const id = regle.id + ':' + ev.trade.tSortie; if (!etat.tradesSimules.some(x => x.id === id)) etat.tradesSimules.push({ id, strategie: regle.id, paire: regle.paire, nom: regle.nom, mode: regle.mode, version: etat.active, ...ev.trade }); }
      if (etat.tradesSimules.length > 600) etat.tradesSimules.splice(0, etat.tradesSimules.length - 600);
      if (r.derive) { mettreEnPause(etat, regle.id, 'dérive détectée (CUSUM ' + r.cusum.toFixed(1) + ')', maintenant()); }
      nouvellesAlertes += await alerter(r.alertes);
    }
    // simulation terminée → alertes d'entrée réelles
    const resumes = {}; for (const s of strategiesActives(etat)) { const sv = suivi[s.id]; if (sv) { const R = sv.trades.map(x => x.R); resumes[s.id] = { n: R.length, esperance: R.length ? R.reduce((a, b) => a + b, 0) / R.length : null }; } }
    for (const id of promouvoir(etat, resumes, maintenant())) await alerter([construireAlerte('RAPPORT', { extra: { lignes: [etat.strategies[id].nom + ' ' + etat.strategies[id].paire + ' a terminé sa simulation en direct : ses alertes d’entrée sont maintenant réelles (preuve : backtest + ' + (resumes[id] ? resumes[id].n : 0) + ' trades simulés).'], semaine: 'promo-' + id }, }, maintenant())]);
    return nouvellesAlertes;
  }

  /* ── (2 quater) autonomie quotidienne (V4, phase 8) : diagnostic, ajustement de la recherche, occasions manquées, exemples de Justin, rapport Telegram du matin ── */
  async function autonomieDuJour(force = false) {
    const t = maintenant(), jour = jourDe(t); etat.autonomie = etat.autonomie || { jour: null, jourRapport: null, observationJour: { jour: null, n: 0 } };
    const A = etat.autonomie, neuf = A.jour !== jour; if (!neuf && !force && A.jourRapport === jour) return null;
    let diag = null; const series = {}; for (const p of paires) series[p] = D.serie(p);
    if (neuf || force) {
      try { const rc = calculerCouts(etat, series, { rapide: true, maintenant: t, reglage: lireCoutsReglage(dossier) }); etat.frais = { t, coutMoyenR: rc.synthese.coutMoyen, trades: rc.synthese.nTotal }; ecrireJson(path.join(dossier, 'couts-en-r.json'), rc); journal('autonomie', 'Frais moyens du jour : ' + (rc.synthese.coutMoyen == null ? 'inconnus' : rc.synthese.coutMoyen.toFixed(2).replace('.', ',') + ' R par trade') + '.'); } catch (e) { erreur('frais en R', e); }   // V6 phase 1
      try { diag = calculerDiagnostic(etat, series, { rapide: true, maintenant: t }); ecrireJson(path.join(dossier, 'diagnostic.json'), diag); const aj = ajusterRecherche(diag); etat.recherche.priorites = { ...aj, t }; journal('autonomie', 'Diagnostic du jour : ' + diag.conclusion.verdict.slice(0, 120) + (aj.raisons.length ? ' · Ajustement : ' + aj.raisons.slice(0, 2).join(' ') : '')); } catch (e) { erreur('diagnostic quotidien', e); }
      try {
        const occ = lireOcc(), pep = lirePepiniere(dossier), exemples = lireExemples(); let modif = false;
        for (const p of paires) { const s0 = series[p]; if (!s0 || s0.n < 3000) continue; const fen = tranche(s0, Math.max(0, s0.n - 8000), s0.n), ctx = construireContexte(fen), trades = [...etat.tradesSimules.filter(x => x.paire === p), ...pep.candidates.filter(c => c.paire === p).flatMap(c => c.trades)]; occ[p] = occ[p] || { liste: [] }; if (majOccasions(occ[p], ctx, trades)) modif = true;
          for (const ex of exemples) if (ex.actif === p && !ex.explication) { ex.explication = expliquerExemple(ex, ctx); modif = true; } }
        if (modif) { ecrireJson(fOcc, occ); fs.writeFileSync(fEx, exemples.map(x => JSON.stringify(x)).join('\n') + (exemples.length ? '\n' : ''), 'utf8'); }
      } catch (e) { erreur('occasions / exemples', e); }
      A.jour = jour;
    }
    if (A.jourRapport !== jour && (new Date(t).getUTCHours() >= 6 || force)) {
      try {
        let libre = null; try { const st = fs.statfsSync(dossier); libre = Number(st.bavail) * Number(st.bsize) / 1024 ** 3; } catch (e) { /* inconnu */ }
        diag = diag || lireJson(path.join(dossier, 'diagnostic.json'), null);
        const pistesL = lignesRapportPistes(meilleuresPistes(etat.backtests, { n: 3 }), phraseFraisEtat(etat)), att = etat.recherche.attente, niv = etat.recherche.niveaux, prochaine = att && att.attente ? 'Ce que je vais tenter : ' + (att.lignes[1] || att.phrase) : niv && etat.recherche.niveau != null ? 'Ce que je vais tenter : niveau ' + etat.recherche.niveau + ' de la recherche (' + niv[etat.recherche.niveau].nom + '), ' + (niv[etat.recherche.niveau].total - niv[etat.recherche.niveau].faits) + ' tâches restantes.' : null;
        const lignes = rapportQuotidien({ pistes: pistesL, prochaine, diag, etat, pepiniere: resumePepiniere(lirePepiniere(dossier), t), equipe: resumeEquipe(lireEquipe(dossier), etat, t), flux: (() => { try { return statutFlux(dossier); } catch (e) { return null; } })(), donnees: { trous: (etat.donnees && etat.donnees.paires || []).reduce((a, x) => a + (x.trous || 0), 0) }, disqueLibreGo: libre, pcVivant: true, occasions: occasionsResume(), exemples: exemplesResume(), positions: positions ? positions.lignesRapport([]) : null }, t);
        A.jourRapport = jour; etat.rapportQuotidien = { t, lignes }; journal('autonomie', 'Rapport quotidien écrit (' + lignes.length + ' lignes).'); await alerter([construireAlerte('RAPPORT', { extra: { lignes, semaine: 'quotidien-' + jour } }, t)]);
      } catch (e) { erreur('rapport quotidien', e); }
    }
    return { jour };
  }
  const observationActive = () => !!(etat.parametresRisque && etat.parametresRisque.observation);
  async function alertesObservation(entrees) {
    if (!observationActive() || !entrees.length) return 0; const t = maintenant(), jour = jourDe(t); const A = (etat.autonomie = etat.autonomie || { jour: null, jourRapport: null, observationJour: { jour: null, n: 0 } });
    if (A.observationJour.jour !== jour) A.observationJour = { jour, n: 0 }; let n = 0;
    for (const e of entrees) { if (A.observationJour.n >= 5) break; A.observationJour.n++; n += await alerter([construireAlerte('RAPPORT', { extra: { lignes: alerteObservationTexte(e), semaine: 'obs-' + e.id + '-' + e.t } }, t)]); }
    return n;
  }

  /* ── (2 bis) l'équipe : le Chercheur écrit ses hypothèses (une fois par jour, et quand la recherche stagne) ── */
  const fOcc = path.join(dossier, 'occasions.json'), fEx = path.join(dossier, 'exemples.jsonl');
  const lireOcc = () => lireJson(fOcc, {}) || {}, lireExemples = () => { try { return fs.readFileSync(fEx, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
  const occasionsResume = () => { const o = lireOcc(), tout = { liste: Object.values(o).flatMap(j => (j && j.liste) || []) }; return tout.liste.length ? resumeOccasions(tout) : null; };
  const exemplesResume = () => { const l = lireExemples(); return l.length ? resumeExemples(l) : null; };
  async function equipeDuJour(force = false) {
    const eq = lireEquipe(dossier), t = maintenant(), derniere = eq.chercheur.derniereExecution, memeJour = derniere && jourDe(derniere) === jourDe(t), stagne = !!(etat.recherche && etat.recherche.epuise);
    if (memeJour && !force && !(stagne && t - derniere > 2 * 3600e3)) return null;
    const series = {}; for (const p of paires) series[p] = D.serie(p); let diag = null;
    try { diag = calculerDiagnostic(etat, series, { rapide: true, maintenant: t }); ecrireJson(path.join(dossier, 'diagnostic.json'), diag); } catch (e) { erreur('diagnostic', e); }
    const faits = construireFaitsChercheur({ entonnoir: diag && diag.entonnoir, parFamille: diag && diag.parFamille, occasions: occasionsResume(), exemples: exemplesResume(), dejaTestees: eq.hypotheses.length, diagnosticVerdict: diag && diag.conclusion.verdict });
    const r = await executerChercheur({ dossier, equipe: eq, faits, maintenant: t, force: true, fetchImpl, preference: (lireJson(F.config, {}) || {}).modele || null, config, occasions: occasionsResume(), exemples: exemplesResume() });
    ecrireEquipe(r.equipe, dossier); for (const h of r.acceptees) enregistrerHypothese(h);
    journal('equipe', 'Le Chercheur a proposé ' + r.acceptees.length + ' hypothèse(s) (' + r.source + ')' + (stagne ? ' : la recherche avait épuisé son espace.' : '.')); return r;
  }

  /* ── (2 ter) pépinière live : jusqu'à 50 candidates en simulation sur le marché réel (V4, phase 7) ── */
  let dernierAlimentage = 0; const derniereAnalysePep = {};
  async function pepiniereTick() {
    const pep = lirePepiniere(dossier), t = maintenant(); if (t - dernierAlimentage > 6 * 3600e3) { dernierAlimentage = t; alimenter(pep, etat, paires, t); }
    const r = await avancerPepiniere({ dossier, pep, etat, serie: p => D.serie(p), paires, maintenant: t, derniereAnalyse: derniereAnalysePep });
    await alertesObservation(r.entrees || []);
    for (const c of r.changements) { journal('pepiniere', c.texte); if (c.type === 'acceptee') await alerter([construireAlerte('RAPPORT', { extra: { lignes: [c.texte], semaine: 'pep-' + c.id }, }, t)]); }
    return r;
  }

  /* ── (2 quinquies) V7 : positions du jour (Rebond, Continuation, Extrêmes), suivi, bilan, niveaux de preuve (v4 équilibré par défaut, v3 strict au choix) ── */
  const niveauPreuve = () => (etat.parametresRisque && etat.parametresRisque.niveauPreuve === 'strict' ? 'strict' : 'equilibre');
  const positions = avecPositions ? creerPositions({ dossier, D, paires, maintenant, journal, erreur, versionCriteres: niveauPreuve, pistesLignes: () => lignesRapportPistes(meilleuresPistes(etat.backtests, { n: 3 }), null), envoyer: async (texte, canal) => { if (S.configure) await S.telegram(texte, canal); } }) : null;

  /* ── (2 sexies) V12 : mode Trader (propositions « À l'essai » à chaque clôture M15, suivi simulé, bilan en direct, promotion / désactivation) ── */
  const trader = avecTrader ? creerTrader({ dossier, D, paires, maintenant, journal: (c, m) => journal(c, m), erreur, envoyer: async (texte, canal) => { if (S.configure) await S.telegram(texte, canal); } }) : null;

  /* ── (2 septies) V14 : tableau vivant de volume (propositions de volume, portefeuille virtuel, rejoué) ── */
  const volume = avecVolume ? creerVolume({ dossier, maintenant, journal: (c, m) => journal(c, m), erreur }) : null;

  /* ── (3) recherche permanente ── */
  const debutFinalPar = () => { const o = {}; for (const p of paires) { const c = etat.coffre && etat.coffre[p]; if (c && c.debutFinal) { o[p] = c.debutFinal; continue; } const s = D.serie(p); if (!s || s.n < 5000) continue; const d = decouper(s); if (d.ok) { (etat.coffre = etat.coffre || {})[p] = { debutFinal: d.debutFinal, ouvertures: [], fixeLe: maintenant() }; o[p] = d.debutFinal; journal('coffre', 'Jeu final de ' + p + ' fixé à partir du ' + jourDe(d.debutFinal) + ' (il ne bougera plus ; ouvert une seule fois par stratégie).'); } } return o; };
  async function peutChercher() {
    if (etat.parametresRisque.pause) return { ok: false, raison: 'agent en pause' };
    const j = await jeu.evaluer({ processusJeu: (lireJson(F.config, {}) || {}).processusJeu || JEUX_PAR_DEFAUT, pauseDansJeu: true }); info.jeu = !!j.jeu;
    if (j.jeu) return { ok: false, raison: 'pause : ' + j.raison };
    return { ok: true };
  }
  async function chercher() {
    if (enCalcul) return { fait: false };
    const ok = await peutChercher(); if (!ok.ok) { info.phase = ok.raison.startsWith('pause :') ? 'pause_jeu' : 'attente'; info.raison = ok.raison; return { fait: false, raison: ok.raison }; }
    const dfp = debutFinalPar(); if (!Object.keys(dfp).length) { info.raison = 'pas assez de données pour fixer le jeu final'; return { fait: false }; }
    const voieCorrigee = !!(etat.parametresRisque && etat.parametresRisque.testsMultiplesCorriges), reglageCouts = lireCoutsReglage(dossier), coutsEmp = (reglageCouts.source === 'fichier' ? reglageCouts.empreinte : '') + (voieCorrigee ? '|tmc' : '');   // V6 : la voie « tests multiples corrigés » (désactivée par défaut) change les résultats, donc l'empreinte       // V6 : les coûts de Justin (couts.json) comptent dans l'empreinte des tâches
    const caches = { has: emp => !!lireCache(F.cache, emp) }, derivesDispo = Object.fromEntries(paires.map(p => [p, fs.existsSync(path.join(F.donnees, 'derives-' + p.toLowerCase() + '.json'))]));
    const plan = planifierNiveaux(etat, { paires, debutFinal: dfp, cache: caches, priorites: etat.recherche && etat.recherche.priorites, revue: new Date(maintenant()).getUTCDay() === 0, couts: coutsEmp, derivesDispo }), taches = plan.taches.slice();   // V6 : niveaux 0 (base), 1 (guidée), 2 (filtrées)
    if (etat.recherche.niveau !== plan.niveau) { etat.recherche.niveau = plan.niveau; if (plan.niveau != null && plan.niveau > 0) journal('recherche', 'Niveau ' + plan.niveau + ' de la recherche : ' + plan.niveaux[plan.niveau].nom + ' (' + (plan.niveaux[plan.niveau].total - plan.niveaux[plan.niveau].faits) + ' tâches).'); }
    etat.recherche.niveaux = plan.niveaux.map(n => ({ id: n.id, nom: n.nom, total: n.total, faits: n.faits }));
    const equipe = lireEquipe(dossier); taches.unshift(...tachesHypotheses({ equipe, paires, debutFinal: dfp, cache: caches, empreinteTache: x => empreinteTache({ ...x, couts: coutsEmp }) }));                // V4 : les hypothèses du Chercheur passent en premier
    if (!taches.length) {   // V6 : plus d'impasse muette — tout l'espace ÉLARGI est exploré : on dit précisément ce qu'on attend et pour combien de temps
      const total = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0), att = planAttente({ niveaux: plan.niveaux, pistes: meilleuresPistes(etat.backtests, { n: 3 }), pepiniere: lirePepiniere(dossier), equipe: { derniereExecution: equipe.chercheur.derniereExecution }, reglage: reglageCouts, actifsExtra: etat.actifsExtra || [], maintenant: maintenant(), variantes: total });
      const avait = !!(etat.recherche.attente && etat.recherche.attente.attente); etat.recherche.attente = { t: maintenant(), ...att };
      info.phase = 'attente'; info.raison = att.lignes.join(' '); etat.recherche.enCours = null; etat.recherche.epuise = true; if (!avait) journal('recherche', 'Espace élargi épuisé. ' + att.lignes.join(' '));
      return { fait: false, raison: info.raison, attente: att };
    }
    etat.recherche.attente = null; etat.recherche.epuise = false; enCalcul = true; info.phase = 'recherche'; info.raison = null; ecrireInfo();
    const debut = maintenant(); let faites = 0;
    try {
      while (taches.length && maintenant() - debut < tranchesMs && !arretDemande) {
        const lot = taches.splice(0, charge()), total = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0);
        etat.recherche.enCours = lot.map(t => t.famille + ' ' + t.paire + (t.gen ? ' (génération ' + t.gen + ')' : '')).join(', '); ecrireInfo();
        const contexte = { paires, dossierDonnees: F.donnees, couts: reglageCouts, voieCorrigee, variantesAvant: total, ouverturesParPaire: Object.fromEntries(paires.map(p => [p, ((etat.coffre && etat.coffre[p]) ? etat.coffre[p].ouvertures.length : 0)])) };
        const res = await Promise.all(lot.map(t => executer(t, contexte).catch(e => ({ resumes: [{ famille: t.famille, paire: t.paire, type: t.type, statut: 'erreur', raison: String(e.message).slice(0, 150), t: maintenant() }] }))));
        const candidates = [];
        const eq = lireEquipe(dossier);
        res.forEach((r, k) => { const t = lot[k]; for (const resume of r.resumes) { if (resume.statut === 'erreur') { erreur('recherche ' + t.famille + ' ' + t.paire, new Error(resume.raison)); continue; }
          if (resume.auditeur) { try { ecrireRapportAuditeur(dossier, eq, { ok: resume.auditeur.ok, candidate: resume.auditeur.candidate, rapport: resume.auditeur.rapport, resume: resume.auditeur.resume, tests: resume.auditeur.tests }, maintenant()); } catch (e) { /* disque */ } delete resume.auditeur.rapport; }     // le rapport écrit va dans rapports/auditeur/ ; l'état garde le résumé
          candidates.push(...integrerResultat(etat, resume, { ...t, type: resume.type || t.type, grille: resume.grille || t.grille }, maintenant())); if (t.type === 'hypothese') marquerTest(eq, t, resume, paires, maintenant()); } if (!r.resumes.some(x => x.statut === 'erreur')) ecrireCache(F.cache, t.empreinte, { t: maintenant(), statuts: r.resumes.map(x => x.statut) }); faites++; });
        ecrireEquipe(eq, dossier);
        if (candidates.length) await nouvelleVersion(candidates);
        etat.recherche.derniere = maintenant(); etat.recherche.cycles++; sauver();
        const pc = await peutChercher(); if (!pc.ok) break;                                              // un jeu démarre : on s'arrête entre deux lots
      }
    } finally { enCalcul = false; etat.recherche.enCours = null; info.phase = 'attente'; info.tranchesFaites++; info.derniereRecherche = maintenant(); }
    return { fait: true, taches: faites };
  }
  async function nouvelleVersion(candidates) {
    const actuelles = strategiesActives(etat).map(s => ({ famille: s.famille, paire: s.paire, params: s.params, validation: s.validation && s.validation.statut === 'validee_backtest' ? s.validation : { ...(s.validation || {}), statut: 'validee_backtest' } }));
    const deja = new Set(actuelles.map(a => a.famille + a.paire + JSON.stringify(a.params))), neuves = candidates.filter(c => !deja.has(c.famille + c.paire + JSON.stringify(c.params)));
    if (!neuves.length) return;
    const v = creerVersion(etat, { candidates: [...actuelles, ...neuves], raison: neuves.map(n => n.famille + ' sur ' + n.paire).join(', ') + ' validée(s) (backtest hors échantillon + jeu final, ouvert une seule fois)' }, maintenant());
    await pousserEtat({ forcer: true });
    await alerter([construireAlerte('RAPPORT', { extra: { lignes: ['Nouvelle version v' + v.numero + ' active : ' + v.raison + '.', 'Elle commence par une simulation en direct (4 semaines et 30 trades) : ses alertes sont marquées SIMULATION jusque-là.'], semaine: 'version-' + v.numero }, }, maintenant())]);
  }

  /* ── (5) rapports ── */
  async function faireRapport(force = false) {
    const sem = semaineISO(maintenant()); if (!force && etat.rapport && etat.rapport.semaine === sem) return null;
    const faits = faitsRapport(etat, { pcVivant: true, rechercheEnCours: enCalcul }, maintenant()), pref = (lireJson(F.config, {}) || {}).modele || null;
    const r = await ecrire(faits, { fetchImpl, preference: pref, config });
    etat.rapport = { t: maintenant(), semaine: sem, lignes: r.lignes, source: r.source, faits: { variantes: faits.variantes, validees: faits.validees, version: faits.version } };
    journal('rapport', 'Rapport ' + sem + ' écrit (' + r.source + ').');
    if (!force || r.lignes.length) await alerter([construireAlerte('RAPPORT', { extra: { lignes: r.lignes, semaine: sem + (force ? '-demande-' + Math.floor(maintenant() / 60000) : '') } }, maintenant())]);
    return etat.rapport;
  }
  async function aucuneStrategie() {
    if (strategiesActives(etat).length) return;
    const variantes = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0);
    await alerter([construireAlerte('AUCUNE_STRATEGIE', { extra: { variantes } }, maintenant())]);
  }

  /* Un cycle complet. Rend un compte rendu (tests). */
  async function cycle() {
    const cr = { donnees: null, alertes: 0, recherche: null }; info.demarre = true;
    if (fs.existsSync(F.arret)) { arretDemande = true; return { ...cr, arret: true }; }
    try { await lireCommandes(); } catch (e) { erreur('commandes', e); }
    if (!etat.parametresRisque.pause) {
      try { cr.donnees = await donneesDuJour(); } catch (e) { erreur('données', e); }
      try { const maj = await D.actualiser(); info.derniereMaj = { t: maintenant(), ...maj }; } catch (e) { erreur('bougies', e); }
      if (avecFlux) { try { const r = assurerEnregistreur(dossier, { maintenant: maintenant() }); if (r === 'lance') journal('flux', 'Enregistreur du carnet (re)lancé.'); } catch (e) { erreur('flux', e); } }   // V4 : carnet d'ordres 24 h/24, relancé s'il s'arrête
      if (avecPepiniere) { try { cr.pepiniere = await pepiniereTick(); } catch (e) { erreur('pépinière', e); } }
      if (positions) { try { cr.positions = await positions.cycle(); } catch (e) { erreur('positions', e); } }
      if (trader) { try { cr.trader = await trader.cycle(); info.trader = { t: maintenant(), derniereBougie: Object.fromEntries(Object.entries(trader.etat().dernierCalcul)), suivies: trader.etat().propositions.filter(p => p.statut === 'en_attente' || p.statut === 'ouverte').length }; } catch (e) { erreur('mode Trader', e); } }
      if (volume) { try { cr.volume = await volume.cycle(); } catch (e) { erreur('tableau de volume', e); } }
      if (avecEquipe) { try { cr.autonomie = await autonomieDuJour(); } catch (e) { erreur('autonomie', e); } }
      if (avecEquipe) { try { cr.equipe = await equipeDuJour(); } catch (e) { erreur('équipe', e); } }
      try { cr.alertes = await surveiller(); } catch (e) { erreur('surveillance', e); }
      try { cr.recherche = await chercher(); } catch (e) { erreur('recherche', e); }
      try { const d = new Date(maintenant()); if (d.getUTCDay() === 0 && d.getUTCHours() >= 17) await faireRapport(); await aucuneStrategie(); } catch (e) { erreur('rapport', e); }
    } else { info.phase = 'pause'; info.raison = 'agent en pause'; }
    try { await pousserEtat(); } catch (e) { erreur('synchronisation', e); }
    try { await pousserMobile(); } catch (e) { erreur('paquet mobile', e); }
    sauver(); ecrireInfo(); return cr;
  }
  async function demarrer() {
    journal('service', 'Service de l’agent démarré (pid ' + process.pid + ').'); try { ecrireExemple(dossier); } catch (e) { /* dossier en lecture seule */ } try { await D.charger(); } catch (e) { erreur('chargement des données', e); }
    try { for (const h of lireEquipe(dossier).hypotheses) enregistrerHypothese(h); } catch (e) { erreur('équipe', e); }     // les familles issues des hypothèses du Chercheur doivent exister pour la surveillance
    await reprendreDepuisWorker(); sauver(); ecrireInfo();
  }
  function battementSepare() { if (!S.configure) return; S.battement(pcInfo()).then(r => { info.worker = { configure: true, ok: true, t: maintenant(), msg: null }; return r; }).catch(e => { info.worker = { configure: true, ok: false, t: maintenant(), msg: String(e.message).slice(0, 100) }; }); }
  function priorite() { if (sansPriorite) return; try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { journal('service', 'priorité basse impossible : ' + e.message); } }
  return { positions: () => positions, trader: () => trader, volume: () => volume, cycle, demarrer, battementSepare, priorite, autonomieDuJour, alertesObservation, equipeDuJour, pepiniereTick, resumePepiniere: () => resumePepiniere(lirePepiniere(dossier), maintenant()), resumeEquipe: () => resumeEquipe(lireEquipe(dossier), etat, maintenant()), etat: () => etat, suivi: () => suivi, info: () => info, donnees: D, fichiers: F, faireRapport, appliquerCommande, chercher, surveiller, donneesDuJour, pousserEtat, arreter: () => { arretDemande = true; }, statut: () => statutAgent(etat, { pcVivant: true, rechercheEnCours: enCalcul, enPreparation: pcInfo().enPreparation, positionOuverte: pcInfo().positionOuverte }) };
}

/* ── ligne de commande ── */
const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const dossier = dossierAgent(), F = fichiersAgent(dossier), args = process.argv.slice(2), a = args[0]; fs.mkdirSync(dossier, { recursive: true });
  const demander = c => { const loc = path.join(dossier, 'commandes.json'), l = lireJson(loc, []) || []; l.push(c); ecrireJson(loc, l); console.log('Commande « ' + c.type + ' » transmise au service' + (lireJson(F.service) && vivant((lireJson(F.service) || {}).pid) ? '.' : ' (il n’est pas démarré : elle sera appliquée à son prochain démarrage).')); };
  if (a === '--statut') {
    const e = chargerEtat(dossier), i = lireJson(F.service, null), st = statutAgent(e, { pcVivant: !!(i && vivant(i.pid)) });
    const clair = statutService(i, !!(i && vivant(i.pid)), Date.now());
    console.log(JSON.stringify({ agent: e.identite.nom, serviceClair: clair.phrase, statut: st.texte, phrase: st.phrase, versionActive: e.active, strategies: strategiesActives(e).map(s => s.nom + ' ' + s.paire + ' (' + s.phase + ')'), variantesTestees: Object.values(e.compteurVariantes).reduce((x, y) => x + y, 0), service: i ? { pid: i.pid, enMarche: vivant(i.pid) && Date.now() - i.vivantLe < 120000, phase: i.phase, raison: i.raison, worker: i.worker } : 'jamais démarré', rapport: e.rapport && e.rapport.lignes, carnetOrdres: (() => { try { const f = statutFlux(dossier); return { resume: f.phrase, enregistre: f.enregistre, jours: f.jours, goUtilises: f.octets != null ? +(f.octets / 1024 ** 3).toFixed(2) : null, quotaGo: f.quotaGo, trous: f.trous, flux: f.fluxPrets }; } catch (x) { return 'indisponible : ' + x.message; } })() }, null, 1)); process.exit(0);
  }
  if (a === '--arreter') { fs.writeFileSync(F.arret, String(Date.now())); console.log('Arrêt demandé.'); process.exit(0); }
  if (a === '--pause') { demander({ type: 'pause' }); process.exit(0); }
  if (a === '--reprendre') { demander({ type: 'reprendre' }); process.exit(0); }
  if (a === '--charge') { demander({ type: 'charge', valeur: args[1] }); process.exit(0); }
  if (a === '--rapport') { demander({ type: 'rapport' }); process.exit(0); }
  if (a === '--rapport-quotidien') { demander({ type: 'rapport_quotidien' }); process.exit(0); }
  if (a === '--observation') { demander({ type: 'observation', valeur: args[1] === 'on' }); process.exit(0); }
  if (a === '--niveau-preuve') { demander({ type: 'niveau_preuve', valeur: args[1] === 'strict' ? 'strict' : 'equilibre' }); process.exit(0); }
  if (a === '--tests-multiples') { demander({ type: 'tests_multiples', valeur: args[1] === 'corriges' ? 'corriges' : 'anciens' }); process.exit(0); }
  if (a === '--ajouter-actif') { demander({ type: 'ajouter_actif', valeur: args[1] }); process.exit(0); }
  if (a === '--retour-arriere') { demander({ type: 'retour_arriere', numero: args[1] ? Number(args[1]) : null }); process.exit(0); }
  try { const pid = Number(fs.readFileSync(F.verrou, 'utf8')), v = verrouRespecte({ pidVerrou: pid, pidVivant: !!(pid && vivant(pid)), pidCourant: process.pid, info: lireJson(F.service, null), ageVerrou: Date.now() - fs.statSync(F.verrou).mtimeMs }); if (v.respecte) { console.log('Le service tourne déjà (pid ' + pid + ').'); process.exit(0); } if (pid && pid !== process.pid && vivant(pid)) console.log('Verrou périmé ignoré et remplacé : ' + v.raison + '.'); } catch (e) { /* pas de verrou */ }
  fs.writeFileSync(F.verrou, String(process.pid)); try { fs.unlinkSync(F.arret); } catch (e) { /* rien */ }
  const s = creerService({ dossier, avecFlux: true, avecEquipe: true, avecPepiniere: true, avecPositions: true, avecTrader: true, avecVolume: true }); s.priorite();
  let fini = false; const sortir = () => { if (fini) return; fini = true; try { s.info().phase = 'arrete'; s.cycle; fs.unlinkSync(F.verrou); } catch (e) { /* fini */ } process.exit(0); };
  process.on('SIGINT', sortir); process.on('SIGTERM', sortir);
  process.on('uncaughtException', e => { try { ajouterJournal({ type: 'erreur', texte: 'non gérée : ' + (e && e.message) }, dossier); } catch (x) { /* rien */ } });
  process.on('unhandledRejection', e => { try { ajouterJournal({ type: 'erreur', texte: 'promesse : ' + (e && e.message) }, dossier); } catch (x) { /* rien */ } });
  await s.demarrer(); setInterval(() => s.battementSepare(), 30000);
  let enCours = false; const tick = async () => { if (fini || enCours) return; enCours = true; try { const r = await s.cycle(); if (r.arret) return sortir(); } catch (e) { ajouterJournal({ type: 'erreur', texte: 'cycle : ' + e.message }, dossier); } finally { enCours = false; } };
  await tick(); setInterval(tick, CYCLE_MS);
}
export { semaineISO, versionActive, jalon, rapportTemplate, simulationTerminee };
