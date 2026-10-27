// Rayle Veilleur - « chercheur » : la recherche de stratégies de l'agent BTC (M5) en ARRIÈRE-PLAN sur le PC.
//   node app-pc/veilleur/chercheur.mjs              démarre (une seule instance) ; priorité BASSE du système, jamais pendant que tu joues
//   node app-pc/veilleur/chercheur.mjs --statut     affiche l'état
//   node app-pc/veilleur/chercheur.mjs --arreter    demande l'arrêt propre
// Tout le travail est fait par le MÊME code que la page (pilote-coeur.js, recherche-continue.js) ; l'état est dans %LOCALAPPDATA%\Rayle\veilleur\pilote.json (voir pilote-fichier.mjs).
// Il fait trois choses, une fois par cycle (≈ 20 s) : (1) suivre le marché en direct (bougies M15 fermées, compte simulé, alertes) ; (2) chercher PAR TRANCHES, seulement dans les heures
// choisies, hors jeu, hors pause, tant que l'objectif n'est pas atteint ; (3) envoyer les notifications (Telegram par la route /telegram/envoyer du Worker, une seule fois chacune).
// Aucune IA, aucun ordre réel, aucun secret affiché ou journalisé (le jeton Telegram reste dans le Worker ; config.local.json ne contient que l'adresse du Worker et le jeton d'appareil).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { creerHistorique } from '../../planetes/mars/pc/agent-btc/historique.js';
import { tranche as tranchePlage } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { executerTranche } from '../../planetes/mars/pc/agent-btc/pilote-calcul.js';
import { dansLesHeures } from '../../planetes/mars/pc/agent-btc/profil-agent.js';
import { stockageFichier } from './stockage-fichier.mjs';
import { stockagePilote } from './pilote-fichier.mjs';
import { creerDetecteurJeu } from './charge-systeme.mjs';
import { dossierVeilleur } from './dossier.mjs';
import { paire as infoPaire, PAIRES, sourceBinance } from '../../planetes/mars/pc/agent-m6/paires.js';
import { analyserAssistant, limiterFrequence } from '../../planetes/mars/pc/agent-m6c/assistant-regime.js';
import { STATUTS_M6C } from '../../planetes/mars/pc/agent-m6c/resultats-m6c.js';
import { creerM6 } from '../../planetes/mars/pc/agent-m6/m6-etat.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { avancerMS, etatMSVide } from '../../planetes/mars/pc/agent-ms/alertes-ms.js';
import { validerStrategie } from '../../planetes/mars/pc/agent-ms/strategie-ms.js';
import { configMoteurDe } from '../../planetes/mars/pc/agent-m6/couts.js';

export const VERSION_CHERCHEUR = 1;
const CYCLE_MS = 20000, FENETRE_LIVE = 16000;
const lireJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
const ecrireJson = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); fs.renameSync(tmp, f); };
const vivant = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/* M6 : un chercheur PAR PAIRE (BTC = fichiers d'origine ; SOL et DOGE = fichiers suffixés). Les fichiers de configuration, du mode jeu et du compte (m6.json) sont communs. */
const suffixe = paire => (!paire || paire === 'BTC' ? '' : '-' + String(paire).toLowerCase());
export const fichiersChercheur = (dossier, paire = 'BTC') => ({ etat: path.join(dossier, 'chercheur' + suffixe(paire) + '.json'), arret: path.join(dossier, 'chercheur' + suffixe(paire) + '.arret'), verrou: path.join(dossier, 'chercheur' + suffixe(paire) + '.pid'), journal: path.join(dossier, 'chercheur' + suffixe(paire) + '.log'), config: path.join(dossier, 'config.local.json'), compte: path.join(dossier, 'm6.json'), calcul: path.join(dossier, 'calcul.verrou') });

/* Une seule paire calcule à la fois sur le PC (un cœur, priorité basse) : verrou d'exclusion, abandonné s'il a plus de 5 minutes. */
export function prendreVerrouCalcul(fichier, maintenant = () => Date.now()) {
  try { if (fs.existsSync(fichier) && maintenant() - fs.statSync(fichier).mtimeMs > 5 * 60e3) fs.unlinkSync(fichier); } catch (e) { /* un autre vient de le libérer */ }
  try { const fd = fs.openSync(fichier, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); return () => { try { fs.unlinkSync(fichier); } catch (e) { /* déjà libéré */ } }; } catch (e) { return null; }
}

export function creerChercheur({ dossier, paire = 'BTC', statutsM6c = STATUTS_M6C, parametresM6c = {}, fetchImpl = globalThis.fetch, maintenant = () => Date.now(), lire = null, historique = null, detecteur = null, executer = executerTranche, annees = null, trancheMs = null, sansPriorite = false, juger = null } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const F = fichiersChercheur(dossier, paire), info = infoPaire(paire) || PAIRES.BTC;
  // Le gardien prop juge chaque alerte d'ENTRÉE avec le compte écrit par la page dans m6.json (relu quand le fichier change).
  let m6Memo = { mtime: 0, m6: null };
  const jugerCompte = alerte => {
    if (juger) return juger(alerte);
    let st; try { st = fs.statSync(F.compte); } catch (e) { return null; }                                  // pas de compte connu : alerte présentée comme avant
    try {
      if (st.mtimeMs !== m6Memo.mtime) { const brut = lireJson(F.compte, null); m6Memo = { mtime: st.mtimeMs, m6: brut ? creerM6({ etat: brut, maintenant }) : null }; }
      if (!m6Memo.m6) return { decision: 'INCONNU', texte: 'Gardien : compte illisible (fichier m6.json abîmé), marge inconnue : vérifie ton solde avant tout trade', marge: 'inconnue', controle: null };       // jamais de fausse assurance
      return m6Memo.m6.jugerAlerteAgent(alerte, { maintenant: maintenant() });
    } catch (e) { return { decision: 'INCONNU', texte: 'Gardien : jugement impossible (' + String(e && e.message || e).slice(0, 60) + ')', marge: 'inconnue', controle: null }; }
  };
  const pilote = stockagePilote(dossier, { maintenant, paire, jugerAlerte: jugerCompte });
  const anneesPaire = annees != null ? annees : Math.min(9.17, (maintenant() - info.debutHistorique) / (365.25 * 86400e3));
  const histo = historique || creerHistorique({ stockage: stockageFichier(path.join(dossier, paire === 'BTC' ? 'm5' : 'm5-' + paire.toLowerCase())), lire: lire || (async url => { const r = await fetchImpl(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), maintenant, annees: anneesPaire, ...(paire === 'BTC' ? {} : { sources: { binance: sourceBinance(paire) }, ordre: ['binance'] }) });
  const jeu = detecteur || creerDetecteurJeu({ dossier });
  const etat = { version: VERSION_CHERCHEUR, pid: process.pid, demarreLe: maintenant(), vivantLe: maintenant(), phase: 'demarrage', raison: null, N: 0, tranches: 0, dernierCycle: null, derniereTranche: null, erreurs: [], donnees: null, telegram: null, jeu: false };
  let derniereBarre = null, derniereSynchro = 0, enCalcul = false, stopDemande = false, controleArret = null;

  const journal = msg => { try { const l = new Date(maintenant()).toISOString() + ' ' + String(msg).replace(/rd_[A-Za-z0-9_-]{8,}/g, 'rd_***').replace(/\d{6,}:[A-Za-z0-9_-]{25,}/g, '***').slice(0, 400) + '\n'; if (fs.existsSync(F.journal) && fs.statSync(F.journal).size > 200 * 1024) fs.renameSync(F.journal, F.journal + '.ancien'); fs.appendFileSync(F.journal, l); } catch (e) { /* jamais bloquant */ } };
  const erreur = msg => { etat.erreurs.unshift({ t: maintenant(), msg: String(msg).slice(0, 200) }); etat.erreurs.length = Math.min(etat.erreurs.length, 8); journal('ERREUR ' + msg); };
  const ecrireEtat = () => { etat.vivantLe = maintenant(); try { ecrireJson(F.etat, etat); } catch (e) { /* disque : tant pis */ } };
  const config = () => lireJson(F.config, {});
  const workerPret = () => { const c = config(); return !!(c.url && c.jeton); };

  async function envoyerTelegram(texte, type) {
    const c = config(); if (!c.url || !c.jeton) throw new Error('Worker non configuré (config.local.json)');
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetchImpl(String(c.url).replace(/\/+$/, '') + '/telegram/envoyer', { method: 'POST', headers: { 'X-Rayle-Token': c.jeton, 'Content-Type': 'application/json' }, body: JSON.stringify({ texte, type }), signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      etat.telegram = { ok: true, t: maintenant() };
    } catch (e) { etat.telegram = { ok: false, t: maintenant(), msg: String(e.message).slice(0, 120) }; throw e; } finally { clearTimeout(tm); }
  }

  /* ── (3) Notifications : chaque notification part une seule fois par canal ── */
  async function diffuserNotifications() {
    const brut = pilote.etat(); if (!brut) return 0;
    const a = brut.notifications.filter(n => !n.canaux.telegram && !n.telegramEchec && brut.profil.notifications.telegram), alertes = [];
    if (!a.length) return 0;
    const envoyees = [], echecs = [];
    for (const n of a) { try { await envoyerTelegram('Agent ' + paire + ' · ' + n.titre + '\n' + n.texte, n.type); envoyees.push(n.id); } catch (e) { echecs.push([n.id, String(e.message).slice(0, 80)]); if (!workerPret()) break; } }
    await pilote.modifier(p => { for (const n of p.etat().notifications) { if (envoyees.includes(n.id)) n.canaux.telegram = true; const f = echecs.find(x => x[0] === n.id); if (f) n.telegramEchec = f[1]; } });
    return envoyees.length;
  }

  /* ── (1) Direct : bougies fermées depuis la dernière ── */
  async function direct() {
    const prec = histo.serie().n;
    if (!prec || maintenant() - derniereSynchro > 24 * 3600e3) { await histo.synchroniser({ surProgres: () => {} }); derniereSynchro = maintenant(); }
    else { const r = await histo.actualiser(); if (!(r.nouvelles && r.nouvelles.length)) return { nouvelles: 0 }; }
    const s = histo.serie(); if (!s.n) return { nouvelles: 0 };
    const d = histo.etat(); etat.donnees = { n: s.n, fin: d.fin, source: d.source, annees: d.annees, lacunes: (d.lacunes || []).length };
    const derniere = s.t[s.n - 1];
    if (derniereBarre == null) { const e = pilote.etat(); derniereBarre = e && e.derniereBarre != null ? e.derniereBarre : derniere; if (!e || e.derniereBarre == null) await pilote.modifier(p => { p.etat().derniereBarre = derniere; }); }
    if (derniere <= derniereBarre) return { nouvelles: 0 };
    // bougies à traiter (rattrapage en bloc : la détection de setup ne se fait que sur la dernière)
    const ev = pilote.etat(), depuis = ev && ev.derniereBarre != null ? ev.derniereBarre : derniereBarre, aTraiter = []; for (let i = s.n - 1; i >= 0 && s.t[i] > depuis; i--) aTraiter.unshift({ t: s.t[i], o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i] });
    const nouvellesAlertes = [];
    await pilote.modifier(p => { for (let k = 0; k < aTraiter.length; k++) { const derniereB = k === aTraiter.length - 1, r = p.traiterBarre({ fenetre: derniereB ? tranchePlage(s, Math.max(0, s.n - FENETRE_LIVE), s.n) : null, bougie: aTraiter[k] }); nouvellesAlertes.push(...(r.alertes || [])); } p.resumeHebdo(); });
    derniereBarre = derniere;
    for (const a of nouvellesAlertes) { if (!workerPret()) break; const e = pilote.etat(); if (!e || !e.profil.notifications.telegram) break; try { await envoyerTelegram((a.type === 'ENTREE' ? (a.gardien && a.gardien.decision === 'BLOCK' ? '⛔ ' : '🟢 ') : '🟡 ') + '[' + paire + '] ' + a.texte, a.type); } catch (x) { erreur('telegram (alerte) : ' + x.message); } }
    // M6c : assistant de régime (range, ça craint, fausses cassures ; ENTRÉE seulement si une règle a passé tous les critères). Fréquence limitée, Telegram seulement si activé dans le profil.
    try {
      const a6 = analyserAssistant({ serie: s, paire, statuts: statutsM6c[paire] || statutsM6c, parametres: parametresM6c, maintenant: maintenant() });
      if (a6.ok) {
        const r6 = limiterFrequence(a6.alertes.map(x => ({ ...x, paire })), etat.m6cHist || [], maintenant()); etat.m6cHist = r6.historique.slice(-60); etat.m6c = { t: maintenant(), regime: a6.regime.nom, statuts: a6.regles.map(x => x.id + ':' + x.statut) };
        for (const al of r6.gardees) { if (al.type === 'ENTREE') { const g6 = jugerCompte(al); if (g6) { al.gardien = g6; al.texte = (g6.decision === 'BLOCK' ? 'BLOQUÉ par le gardien · ' : '') + al.texte + ' · ' + g6.texte; } } if (!workerPret()) break; const e6 = pilote.etat(); if (!e6 || !e6.profil.notifications.telegram) break; const pre = { ENTREE: '🟢 ', SORTIE: '🔴 ', RANGE: '⏸ ', ATTENTION: '⚠️ ', OBSERVATION: '👁 ' }[al.type] || ''; try { await envoyerTelegram(pre + '[' + paire + '] ' + al.texte, al.type === 'ENTREE' ? 'ENTREE' : 'OBSERVATION'); } catch (x) { erreur('telegram (assistant de régime) : ' + x.message); } }
      }
    } catch (e6) { erreur('assistant de régime : ' + e6.message); }
    // V1 : stratégies de l'utilisatrice mises EN ALERTES (« Teste ma stratégie ») : compte simulé par stratégie, alertes d'entrée et de sortie étiquetées (NON VALIDÉE / BACKTEST…), Telegram. Jamais d'ordre.
    try { await suivreStrategiesMS(s, aTraiter); } catch (ex) { erreur('stratégies de l’utilisatrice : ' + ex.message); }
    return { nouvelles: aTraiter.length, alertes: nouvellesAlertes.length };
  }

  /* ── (1 bis) Stratégies de l'utilisatrice (fichier ms-strategies.json écrit par la page) ── */
  async function suivreStrategiesMS(s, aTraiter) {
    const fich = lireJson(path.join(dossier, 'ms-strategies.json'), null); if (!fich || !Array.isArray(fich.strategies) || !fich.strategies.length) return;
    const strategies = []; for (const x of fich.strategies) { const v = validerStrategie(x.strategie); if (v.ok) strategies.push({ id: String(x.id), nom: String(x.nom || v.strategie.nom), strategie: v.strategie, confiance: x.confiance }); }
    if (!strategies.length) return;
    const fe = path.join(dossier, 'ms-etat-' + paire.toLowerCase() + '.json'); let e = lireJson(fe, null); if (!e || e.version !== 1 || !e.comptes) e = etatMSVide();
    const deja = e.derniereBarre[paire], fins = []; for (let i = s.n - 1; i >= 0 && fins.length < 6 && (deja == null || s.t[i] > deja); i--) fins.unshift(i);
    if (deja == null) fins.splice(0, Math.max(0, fins.length - 1));             // première fois : on part de la dernière bougie, rien n'est rejoué
    const alertes = []; for (const fin of fins) { const r = avancerMS({ etat: e, ctx: construireContexte(tranchePlage(s, Math.max(0, fin + 1 - FENETRE_LIVE), fin + 1)), strategies, paire, config: { ...configMoteurDe(paire), risquePct: 1 } }); e = r.etat; alertes.push(...r.alertes); }
    ecrireJson(fe, e);
    for (const a of alertes) {
      if (a.type === 'ENTREE') { const g = jugerCompte({ ...a, nomStrategie: a.nomStrategie }); if (g) { a.jugement = { decision: g.decision, texte: g.texte }; a.texte = (g.decision === 'BLOCK' ? 'BLOQUÉ par le gardien · ' : '') + a.texte + ' · ' + g.texte; } }
      if (!workerPret()) break;
      try { await envoyerTelegram((a.type === 'ENTREE' ? (a.jugement && a.jugement.decision === 'BLOCK' ? '⛔ ' : '🟢 ') : '🟡 ') + '[' + paire + '] ' + a.texte + (a.aide ? '\nRégime : ' + a.aide.regime : ''), 'OBSERVATION'); journal('alerte stratégie ' + a.id + ' envoyée'); } catch (x) { erreur('Telegram (stratégie) : ' + x.message); }
    }
    etat.ms = { t: maintenant(), strategies: strategies.length, alertes: alertes.length };
  }

  /* ── (2) Recherche par tranches ── */
  async function peutChercher() {
    const e = pilote.etat(); if (!e) return { ok: false, raison: 'pas encore d’état du pilote (ouvre le poste de pilotage une fois)' };
    const prof = e.profil;
    if (!prof.arrierePlan.actif) return { ok: false, raison: 'recherche en arrière-plan non activée' };
    if (e.pause) return { ok: false, raison: 'recherche en pause' };
    const valides = e.bibliotheque.strategies.filter(s => ['validee', 'confirmee', 'surveillance'].includes(s.statut) && !s.redondante).length;
    if (valides >= prof.cible && !e.idees.some(i => i.statut === 'en_file')) return { ok: false, raison: 'objectif atteint (' + valides + ' stratégie(s) validée(s) sur ' + prof.cible + ')' };
    if (!dansLesHeures(prof, new Date(maintenant()))) return { ok: false, raison: 'hors des heures de recherche (' + prof.arrierePlan.heureDebut + ' à ' + prof.arrierePlan.heureFin + ')' };
    const j = await jeu.evaluer({ processusJeu: prof.arrierePlan.processusJeu, pauseDansJeu: prof.arrierePlan.pauseDansJeu }); etat.jeu = j.jeu;
    if (j.jeu) return { ok: false, raison: 'pause : ' + j.raison };
    if (!histo.serie().n) return { ok: false, raison: 'pas de données' };
    return { ok: true };
  }
  async function chercher() {
    if (enCalcul) return { fait: false, raison: 'calcul déjà en cours' };
    const permis = await peutChercher(); if (!permis.ok) { etat.phase = permis.raison.startsWith('pause') ? 'pause_jeu' : 'attente'; etat.raison = permis.raison; return { fait: false, raison: permis.raison }; }
    const libererCalcul = prendreVerrouCalcul(F.calcul, maintenant); if (!libererCalcul) { etat.phase = 'attente'; etat.raison = 'une autre paire cherche en ce moment (une seule à la fois pour ne pas peser sur le PC)'; return { fait: false, raison: etat.raison }; }
    enCalcul = true; etat.phase = 'recherche'; etat.raison = null; ecrireEtat();
    try {
      const charge = await pilote.modifier(p => p.preparerTranche({ budget: trancheMs ? { tempsMs: trancheMs } : {} })); if (!charge) return { fait: false, raison: 'en pause' };
      const s = histo.serie(); let arretDemande = false;
      const pause = { douce: 60, normale: 15, max: 0 }[charge.profil.budget.charge] ?? 60;
      const res = await executer(charge, { m15: s, cede: async () => { if (pause) await new Promise(r => setTimeout(r, pause)); ecrireEtat(); if (stopDemande || fs.existsSync(F.arret)) arretDemande = true; const j = await jeu.evaluer({ processusJeu: charge.profil.arrierePlan.processusJeu, pauseDansJeu: charge.profil.arrierePlan.pauseDansJeu }); if (j.jeu) { arretDemande = true; etat.jeu = true; } }, arret: () => arretDemande,
        surEvenement: ev => { if (ev.type === 'progres') { etat.N = ev.N; } } });
      const r = await pilote.modifier(p => p.integrerTranche(res, charge.idees));
      etat.tranches++; etat.derniereTranche = { t: maintenant(), stop: r.stop, nouvellesVariantes: r.nouvellesVariantes }; etat.N = (pilote.etat() || { recherche: { N: etat.N } }).recherche.N;
      journal('tranche : ' + r.nouvellesVariantes + ' variantes, arrêt ' + r.stop + ', N=' + etat.N);
      return { fait: true, ...r };
    } catch (e) { erreur('tranche : ' + e.message); return { fait: false, raison: e.message }; }
    finally { enCalcul = false; etat.phase = 'attente'; libererCalcul(); }
  }

  /* Un cycle complet. Rend un compte rendu (utile aux tests). */
  async function cycle() {
    const cr = { direct: null, recherche: null, notifications: 0 }; etat.dernierCycle = maintenant();
    try { if (fs.existsSync(F.arret)) { stopDemande = true; return { ...cr, arret: true }; } } catch (e) { /* ignoré */ }
    try { cr.direct = await direct(); } catch (e) { erreur('direct : ' + e.message); }
    try { cr.recherche = await chercher(); } catch (e) { erreur('recherche : ' + e.message); }
    try { cr.notifications = await diffuserNotifications(); } catch (e) { erreur('notifications : ' + e.message); }
    ecrireEtat(); return cr;
  }
  function priorite() { if (sansPriorite) return; try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { journal('priorité basse impossible : ' + e.message); } }
  return { cycle, direct, chercher, diffuserNotifications, peutChercher, priorite, etat, histo, pilote, journal, jugerCompte, paire, arreter: () => { stopDemande = true; }, fichiers: F, ecrireEtat };
}

/* ── Lancement en ligne de commande ── */
const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const argv = process.argv.slice(2), args = new Set(argv), iP = argv.indexOf('--paire'), paireCli = iP >= 0 && ['BTC', 'SOL', 'DOGE'].includes(String(argv[iP + 1]).toUpperCase()) ? String(argv[iP + 1]).toUpperCase() : 'BTC', dossier = dossierVeilleur(), F = fichiersChercheur(dossier, paireCli);
  fs.mkdirSync(dossier, { recursive: true });
  if (args.has('--statut')) { const e = lireJson(F.etat, null); console.log(e ? JSON.stringify({ ...e, erreurs: undefined, enMarche: !!(e.pid && vivant(e.pid) && Date.now() - e.vivantLe < 120000) }, null, 1) : 'Le chercheur n a jamais tourne.'); process.exit(0); }
  if (args.has('--arreter')) { fs.writeFileSync(F.arret, String(Date.now())); console.log('Arret demande.'); process.exit(0); }
  try { const pid = Number(fs.readFileSync(F.verrou, 'utf8')); if (pid && pid !== process.pid && vivant(pid)) { console.log('Le chercheur tourne deja (pid ' + pid + ').'); process.exit(0); } } catch (e) { /* pas de verrou */ }
  fs.writeFileSync(F.verrou, String(process.pid)); try { fs.unlinkSync(F.arret); } catch (e) { /* rien */ }
  const c = creerChercheur({ dossier, paire: paireCli }); c.priorite(); c.journal('chercheur ' + paireCli + ' demarre (pid ' + process.pid + ')');
  let fini = false;
  const sortir = () => { if (fini) return; fini = true; c.journal('chercheur arrete'); try { c.etat.phase = 'arrete'; c.ecrireEtat(); fs.unlinkSync(F.verrou); } catch (e) { /* fini */ } process.exit(0); };
  process.on('SIGINT', sortir); process.on('SIGTERM', sortir);
  process.on('uncaughtException', e => c.journal('ERREUR non geree : ' + (e && e.message))); process.on('unhandledRejection', e => c.journal('ERREUR promesse : ' + (e && e.message)));
  let enCours = false;
  const tick = async () => { if (fini || enCours) return; enCours = true; try { const r = await c.cycle(); if (r.arret) return sortir(); } catch (e) { c.journal('ERREUR cycle : ' + e.message); } finally { enCours = false; } };
  await tick(); setInterval(tick, CYCLE_MS);
}
