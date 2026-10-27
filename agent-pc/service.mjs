// SERVICE DE L'AGENT SUR LE PC : Kepler, l'agent unique, tourne en arrière-plan sans que Rayle soit ouverte.
//   node agent-pc/service.mjs                 démarre (une seule instance) ; priorité BASSE du système
//   node agent-pc/service.mjs --statut        affiche l'état
//   node agent-pc/service.mjs --pause / --reprendre / --arreter / --charge faible|normal|fort / --retour-arriere [n°] / --rapport
// Un cycle (≈ 30 s) : (1) données (mise à jour QUOTIDIENNE complète, puis chaque minute les bougies fermées) ; (2) surveillance des stratégies actives (compte simulé, alertes) ;
// (3) recherche permanente par tranches (jamais pendant que tu joues, jamais en pause) ; (4) synchronisation avec le Worker (battement séparé toutes les 30 s : le Worker sait que le PC est là
// et ne double pas les alertes ; PC éteint = le Worker prend le relais) ; (5) rapport hebdomadaire. Aucun ordre n'est passé, aucune clé de courtier n'existe ici.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dossierAgent, fichiersAgent, chargerEtat, sauverEtat, ajouterJournal, lireConfig, lireJson, ecrireJson, vivant } from './etat-agent.mjs';
import { creerDonnees, jourDe } from './donnees-agent.mjs';
import { creerSync, etatPourWorker } from './sync-worker.mjs';
import { ecrireRapport } from './llm.mjs';
import { planifier, lireCache, ecrireCache, executerTache, integrerResultat, CHARGES, GENERATIONS_MAX } from './recherche.mjs';
import { journaliser, creerVersion, retourArriere, strategiesActives, statutAgent, promouvoir, mettreEnPause, jalon, versionActive, exporterRegles } from '../strategies/agent-etat.js';
import { surveillerRegle } from '../strategies/surveillance-commune.js';
import { enregistrerAlertes, construireAlerte, filtrerAlertes } from '../strategies/alertes-v3.js';
import { faitsRapport, rapportTemplate } from '../strategies/rapport-v3.js';
import { simulationTerminee } from '../strategies/agent-etat.js';
import { decouper } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { ORDRE_PAIRES } from '../planetes/mars/pc/agent-m6/paires.js';
import { creerDetecteurJeu } from '../app-pc/veilleur/charge-systeme.mjs';
import { dossierVeilleur } from '../app-pc/veilleur/dossier.mjs';

export const VERSION_SERVICE = 1;
export const CYCLE_MS = 30000, FENETRE_LIVE = 3000, TRANCHE_MS = 4 * 60e3, JEUX_PAR_DEFAUT = ['valorant', 'cs2', 'csgo', 'fortniteclient-win64-shipping', 'eldenring', 'leagueclient', 'league of legends', 'overwatch', 'rocketleague', 'gta5', 'cyberpunk2077', 'baldursgate3', 'minecraft'];
const semaineISO = t => { const d = new Date(t), j = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), n = j.getUTCDay() || 7; j.setUTCDate(j.getUTCDate() + 4 - n); const a = new Date(Date.UTC(j.getUTCFullYear(), 0, 1)); return j.getUTCFullYear() + '-S' + String(Math.ceil(((j - a) / 86400e3 + 1) / 7)).padStart(2, '0'); };

export function creerService({ dossier = dossierAgent(), maintenant = () => Date.now(), donnees = null, sync = null, ecrire = ecrireRapport, executer = executerTache, detecteur = null, fetchImpl = globalThis.fetch, paires = ORDRE_PAIRES, tranchesMs = TRANCHE_MS, sansPriorite = false } = {}) {
  const F = fichiersAgent(dossier); fs.mkdirSync(dossier, { recursive: true });
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
    else if (c.type === 'retour_arriere') { const r = retourArriere(etat, c.numero || null, maintenant()); if (r.ok) { await pousserEtat(); await alerter([construireAlerte('RAPPORT', { extra: { lignes: ['Retour arrière : la version v' + r.numero + ' est de nouveau active.'], semaine: 'retour-' + maintenant() } }, maintenant())]); } }
    else if (c.type === 'rapport') await faireRapport(true);
  }
  async function lireCommandes() {
    const ids = [];
    if (S.configure) { try { const r = await S.battement(pcInfo()); info.worker = { configure: true, ok: true, t: maintenant(), msg: null }; for (const c of r.commandes || []) { await appliquerCommande(c); ids.push(c.id); } if (ids.length) await S.commandesTraitees(ids).catch(() => {}); } catch (e) { info.worker = { configure: true, ok: false, t: maintenant(), msg: String(e.message).slice(0, 100) }; } }
    const loc = path.join(dossier, 'commandes.json'), liste = lireJson(loc, null);                               // commandes locales (--pause, --reprendre… écrites par la ligne de commande)
    if (Array.isArray(liste) && liste.length) { try { fs.unlinkSync(loc); } catch (e) { /* déjà pris */ } for (const c of liste) await appliquerCommande(c); }
  }
  async function pousserEtat() {
    if (!S.configure) return null;
    try {
      const r = await S.synchroniser(etatPourWorker(etat), suivi, pausesLevees); pausesLevees = {};
      for (const [id, s] of Object.entries(r.suiviWorker || {})) if (s && (suivi[id] == null || (s.derniereBarre || 0) > (suivi[id].derniereBarre || 0))) { suivi[id] = s; journal('sync', 'Le Worker a surveillé ' + id + ' pendant que le PC était éteint : son suivi est repris.'); }
      info.worker = { configure: true, ok: true, t: maintenant(), msg: null }; return r;
    } catch (e) { info.worker = { configure: true, ok: false, t: maintenant(), msg: String(e.message).slice(0, 100) }; return null; }
  }
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
      const fen = serie.n > FENETRE_LIVE ? tranche(serie, serie.n - FENETRE_LIVE, serie.n) : serie, s = etat.strategies[regle.id];
      const alertesRec = etat.alertes.filter(a => maintenant() - a.t < 8 * 86400e3);
      const r = surveillerRegle({ regle, s, suivi: suivi[regle.id] || null, serie: fen, risque: etat.parametresRisque, alertesRecentes: alertesRec, maintenant: maintenant() });
      if (r.erreur) continue;
      suivi[regle.id] = r.suivi;
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
    const caches = { has: emp => !!lireCache(F.cache, emp) }, taches = planifier(etat, { paires, debutFinal: dfp, cache: caches });
    if (!taches.length) { info.phase = 'attente'; info.raison = 'espace de recherche défini épuisé (' + GENERATIONS_MAX + ' générations) : j’attends de nouvelles données ou de nouvelles idées'; etat.recherche.enCours = null; etat.recherche.epuise = true; return { fait: false, raison: info.raison }; }
    etat.recherche.epuise = false; enCalcul = true; info.phase = 'recherche'; info.raison = null; ecrireInfo();
    const debut = maintenant(); let faites = 0;
    try {
      while (taches.length && maintenant() - debut < tranchesMs && !arretDemande) {
        const lot = taches.splice(0, charge()), total = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0);
        etat.recherche.enCours = lot.map(t => t.famille + ' ' + t.paire + (t.gen ? ' (génération ' + t.gen + ')' : '')).join(', '); ecrireInfo();
        const contexte = { paires, dossierDonnees: F.donnees, variantesAvant: total, ouverturesParPaire: Object.fromEntries(paires.map(p => [p, ((etat.coffre && etat.coffre[p]) ? etat.coffre[p].ouvertures.length : 0)])) };
        const res = await Promise.all(lot.map(t => executer(t, contexte).catch(e => ({ resumes: [{ famille: t.famille, paire: t.paire, type: t.type, statut: 'erreur', raison: String(e.message).slice(0, 150), t: maintenant() }] }))));
        const candidates = [];
        res.forEach((r, k) => { const t = lot[k]; for (const resume of r.resumes) { if (resume.statut === 'erreur') { erreur('recherche ' + t.famille + ' ' + t.paire, new Error(resume.raison)); continue; } candidates.push(...integrerResultat(etat, resume, { ...t, type: resume.type || t.type, grille: resume.grille || t.grille }, maintenant())); } if (!r.resumes.some(x => x.statut === 'erreur')) ecrireCache(F.cache, t.empreinte, { t: maintenant(), statuts: r.resumes.map(x => x.statut) }); faites++; });
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
    await pousserEtat();
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
      try { cr.alertes = await surveiller(); } catch (e) { erreur('surveillance', e); }
      try { cr.recherche = await chercher(); } catch (e) { erreur('recherche', e); }
      try { const d = new Date(maintenant()); if (d.getUTCDay() === 0 && d.getUTCHours() >= 17) await faireRapport(); await aucuneStrategie(); } catch (e) { erreur('rapport', e); }
    } else { info.phase = 'pause'; info.raison = 'agent en pause'; }
    try { await pousserEtat(); } catch (e) { erreur('synchronisation', e); }
    sauver(); ecrireInfo(); return cr;
  }
  async function demarrer() {
    journal('service', 'Service de l’agent démarré (pid ' + process.pid + ').'); try { await D.charger(); } catch (e) { erreur('chargement des données', e); }
    await reprendreDepuisWorker(); sauver(); ecrireInfo();
  }
  function battementSepare() { if (!S.configure) return; S.battement(pcInfo()).then(r => { info.worker = { configure: true, ok: true, t: maintenant(), msg: null }; return r; }).catch(e => { info.worker = { configure: true, ok: false, t: maintenant(), msg: String(e.message).slice(0, 100) }; }); }
  function priorite() { if (sansPriorite) return; try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { journal('service', 'priorité basse impossible : ' + e.message); } }
  return { cycle, demarrer, battementSepare, priorite, etat: () => etat, suivi: () => suivi, info: () => info, donnees: D, fichiers: F, faireRapport, appliquerCommande, chercher, surveiller, donneesDuJour, pousserEtat, arreter: () => { arretDemande = true; }, statut: () => statutAgent(etat, { pcVivant: true, rechercheEnCours: enCalcul, enPreparation: pcInfo().enPreparation, positionOuverte: pcInfo().positionOuverte }) };
}

/* ── ligne de commande ── */
const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const dossier = dossierAgent(), F = fichiersAgent(dossier), args = process.argv.slice(2), a = args[0]; fs.mkdirSync(dossier, { recursive: true });
  const demander = c => { const loc = path.join(dossier, 'commandes.json'), l = lireJson(loc, []) || []; l.push(c); ecrireJson(loc, l); console.log('Commande « ' + c.type + ' » transmise au service' + (lireJson(F.service) && vivant((lireJson(F.service) || {}).pid) ? '.' : ' (il n’est pas démarré : elle sera appliquée à son prochain démarrage).')); };
  if (a === '--statut') {
    const e = chargerEtat(dossier), i = lireJson(F.service, null), st = statutAgent(e, { pcVivant: !!(i && vivant(i.pid)) });
    console.log(JSON.stringify({ agent: e.identite.nom, statut: st.texte, phrase: st.phrase, versionActive: e.active, strategies: strategiesActives(e).map(s => s.nom + ' ' + s.paire + ' (' + s.phase + ')'), variantesTestees: Object.values(e.compteurVariantes).reduce((x, y) => x + y, 0), service: i ? { pid: i.pid, enMarche: vivant(i.pid) && Date.now() - i.vivantLe < 120000, phase: i.phase, raison: i.raison, worker: i.worker } : 'jamais démarré', rapport: e.rapport && e.rapport.lignes }, null, 1)); process.exit(0);
  }
  if (a === '--arreter') { fs.writeFileSync(F.arret, String(Date.now())); console.log('Arrêt demandé.'); process.exit(0); }
  if (a === '--pause') { demander({ type: 'pause' }); process.exit(0); }
  if (a === '--reprendre') { demander({ type: 'reprendre' }); process.exit(0); }
  if (a === '--charge') { demander({ type: 'charge', valeur: args[1] }); process.exit(0); }
  if (a === '--rapport') { demander({ type: 'rapport' }); process.exit(0); }
  if (a === '--retour-arriere') { demander({ type: 'retour_arriere', numero: args[1] ? Number(args[1]) : null }); process.exit(0); }
  try { const pid = Number(fs.readFileSync(F.verrou, 'utf8')); if (pid && pid !== process.pid && vivant(pid)) { console.log('Le service tourne déjà (pid ' + pid + ').'); process.exit(0); } } catch (e) { /* pas de verrou */ }
  fs.writeFileSync(F.verrou, String(process.pid)); try { fs.unlinkSync(F.arret); } catch (e) { /* rien */ }
  const s = creerService({ dossier }); s.priorite();
  let fini = false; const sortir = () => { if (fini) return; fini = true; try { s.info().phase = 'arrete'; s.cycle; fs.unlinkSync(F.verrou); } catch (e) { /* fini */ } process.exit(0); };
  process.on('SIGINT', sortir); process.on('SIGTERM', sortir);
  process.on('uncaughtException', e => { try { ajouterJournal({ type: 'erreur', texte: 'non gérée : ' + (e && e.message) }, dossier); } catch (x) { /* rien */ } });
  process.on('unhandledRejection', e => { try { ajouterJournal({ type: 'erreur', texte: 'promesse : ' + (e && e.message) }, dossier); } catch (x) { /* rien */ } });
  await s.demarrer(); setInterval(() => s.battementSepare(), 30000);
  let enCours = false; const tick = async () => { if (fini || enCours) return; enCours = true; try { const r = await s.cycle(); if (r.arret) return sortir(); } catch (e) { ajouterJournal({ type: 'erreur', texte: 'cycle : ' + e.message }, dossier); } finally { enCours = false; } };
  await tick(); setInterval(tick, CYCLE_MS);
}
export { semaineISO, versionActive, jalon, rapportTemplate, simulationTerminee };
