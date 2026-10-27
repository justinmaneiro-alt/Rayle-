// Rayle Veilleur - coeur (testable : galaxie/tests/veilleur-test.mjs). Reutilise EXACTEMENT le code de l'agent Bitcoin du navigateur (planetes/mars/pc/agent-btc/).
// A chaque cloture de bougie M15 : met a jour l'historique, calcule la lecture du marche et le setup, puis decide d'envoyer (regles.js) des alertes ENTREE / PREPARATION / OBSERVATION / MACRO.
// Envoi Telegram UNIQUEMENT par la route du Worker /telegram/envoyer (le jeton Telegram n'est jamais ici). Aucun ordre de trading, aucune IA, aucun secret affiche ni journalise.
import fs from 'node:fs';
import path from 'node:path';
import { creerAgent } from '../../planetes/mars/pc/agent-btc/agent.js';
import { PAS_M15, alignerM15 } from '../../planetes/mars/pc/agent-btc/sources.js';
import { REGLAGES_DEFAUT, decider, formaterMessage, inscrire, observationsDepuisLecture, alertesMacro, reglagesValides } from '../../planetes/mars/pc/alertes/regles.js';
import { analyserBls, SERIES_BLS, URL_BLS } from '../../planetes/mars/pc/finance/taux-calcul.js';
import { evenementsBls, evenementsFed, evenementsPublics, evenementsResultats, fusionnerCalendrier } from '../../planetes/mars/pc/finance/calendrier-calcul.js';
import { stockageFichier } from './stockage-fichier.mjs';

export const VERSION_VEILLEUR = 1;
const DELAI_APRES_CLOTURE = 6000;     // on laisse a l'echange le temps de publier la bougie fermee
const ESSAI_TOUTES = 20000;           // nouvel essai si la bougie n'est pas encore la
const MACRO_TOUTES = 5 * 60000;
const SOURCES_MACRO = { ff: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json', fed: 'https://www.federalreserve.gov/json/calendar.json', ics: 'https://www.bls.gov/schedule/news_release/bls.ics', av: k => 'https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=' + encodeURIComponent(k) };
const PAYS_VEILLEUR = ['USD', 'EUR', 'GBP', 'JPY'];
const GRANDES_VALEURS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'NFLX'];   // « résultats d'entreprises majeures » : les plus grandes valeurs du Nasdaq 100
const MAX_JOURNAL = 200 * 1024, MAX_ALERTES_FICHIER = 300;

const lireJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
const ecrireJson = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); fs.renameSync(tmp, f); };

export function fichiers(dossier) {
  return { config: path.join(dossier, 'config.local.json'), reglages: path.join(dossier, 'reglages.json'), historique: path.join(dossier, 'historique.json'), alertes: path.join(dossier, 'alertes.jsonl'),
    etat: path.join(dossier, 'etat.json'), journal: path.join(dossier, 'journal.log'), strategie: path.join(dossier, 'strategie.json'), attente: path.join(dossier, 'file-attente.json'), arret: path.join(dossier, 'arret.demande') };
}

export function creerVeilleur({ dossier, fetchImpl = globalThis.fetch, maintenant = () => Date.now(), lireMarche = null, stockage = null, periodeAgentMs = 3600e3 * 24, criteres = undefined } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const F = fichiers(dossier);
  let reglages = reglagesValides(lireJson(F.reglages, {}), REGLAGES_DEFAUT);
  let historique = lireJson(F.historique, []);
  let agent = null, demarrage = null, precedent = null, enAttente = lireJson(F.attente, []), file = [];
  let dernierEssai = 0, derniereFin = null, dernierMacro = 0, evenements = [], evenementsMaj = null, strategieMtime = 0, reglagesMtime = 0;
  const etat = { version: VERSION_VEILLEUR, demarreLe: maintenant(), derniereBougie: null, derniereBoucle: null, derniereAlerte: null, envoyees: 0, bloquees: 0, erreurs: [], donnees: null, strategie: null, canaux: { telegram: null } };

  const journal = (msg) => {
    try {
      const ligne = new Date(maintenant()).toISOString() + ' ' + String(msg).replace(/rd_[A-Za-z0-9_-]{8,}/g, 'rd_***').replace(/\d{6,}:[A-Za-z0-9_-]{25,}/g, '***').slice(0, 400) + '\n';
      if (fs.existsSync(F.journal) && fs.statSync(F.journal).size > MAX_JOURNAL) fs.renameSync(F.journal, F.journal + '.ancien');
      fs.appendFileSync(F.journal, ligne);
    } catch (e) { /* le journal n'est jamais bloquant */ }
  };
  const erreur = (msg) => { etat.erreurs.unshift({ t: maintenant(), msg: String(msg).slice(0, 200) }); etat.erreurs.length = Math.min(etat.erreurs.length, 8); journal('ERREUR ' + msg); };

  const config = () => lireJson(F.config, {});
  const workerPret = () => { const c = config(); return !!(c.url && c.jeton); };

  async function appelWorker(chemin, opts = {}) {
    const c = config(); if (!c.url || !c.jeton) throw new Error('Worker non configure (config.local.json : url et jeton)');
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), opts.delai || 15000);
    try {
      const res = await fetchImpl(String(c.url).replace(/\/+$/, '') + chemin, { ...opts, headers: { 'X-Rayle-Token': c.jeton, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }, signal: ctl.signal });
      const texte = await res.text(); let json = null; try { json = JSON.parse(texte); } catch (e) { /* pas du JSON */ }
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status + (json && json.error ? ' ' + json.error : '')), { status: res.status });
      return json;
    } finally { clearTimeout(tm); }
  }

  /* ── Lecture JSON publique pour l'agent (bougies) : sans jeton ── */
  const lire = async url => { const r = await fetchImpl(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

  function relireFichiers() {
    try { const m = fs.statSync(F.reglages).mtimeMs; if (m !== reglagesMtime) { reglagesMtime = m; reglages = reglagesValides(lireJson(F.reglages, {}), REGLAGES_DEFAUT); journal('reglages recharges (actif=' + reglages.actif + ')'); } } catch (e) { /* pas encore de fichier */ }
    try {
      const m = fs.statSync(F.strategie).mtimeMs;
      if (m !== strategieMtime && agent) { strategieMtime = m; injecterStrategie(); }
    } catch (e) { /* pas de strategie transmise */ }
  }
  /* La strategie validee vient de la recherche faite dans l'application (ou de `--rechercher`) : transmise par un fichier, injectee dans l'etat de l'agent. */
  function injecterStrategie() {
    const s = lireJson(F.strategie, null); if (!s || !s.verdict) return;
    const e = agent._etat();
    e.verdict = s.verdict; if (s.coffre) e.coffre = s.coffre; if (Number.isFinite(s.nVariantes)) e.nVariantes = s.nVariantes;
    if (s.reglagesAgent) e.reglages = { ...e.reglages, ...s.reglagesAgent };
    journal('strategie transmise : ' + s.verdict.etat);
    etat.strategie = s.verdict.etat;
  }

  async function assurerAgent() {
    if (agent) return agent;
    if (demarrage) return demarrage;
    demarrage = (async () => {
      const st = stockage || stockageFichier(dossier);
      const a = creerAgent({ stockage: st, lire: lireMarche || lire, periodeMs: periodeAgentMs, surAlerte: al => file.push(al), ...(criteres ? { criteres } : {}), maintenant });
      agent = a;
      await a.demarrer({ synchro: true, boucle: false });
      injecterStrategie();
      const i = a.instantane(); etat.donnees = { n: i.donnees.n, fin: i.donnees.fin, source: i.donnees.source };
      derniereFin = i.donnees.fin;
      etat.strategie = i.etatStrategie;
      journal('agent pret : ' + i.donnees.n + ' bougies, strategie ' + i.etatStrategie);
      return a;
    })().catch(e => { demarrage = null; agent = null; erreur('demarrage de l agent : ' + e.message); throw e; });
    return demarrage;
  }

  /* ── Envoi (jamais bloquant, jamais deux fois) ── */
  async function envoyerTelegram(alerte) {
    const texte = formaterMessage(alerte);
    try {
      await appelWorker('/telegram/envoyer', { method: 'POST', body: JSON.stringify({ texte, type: alerte.type }) });
      etat.canaux.telegram = { ok: true, t: maintenant() }; return true;
    } catch (e) {
      etat.canaux.telegram = { ok: false, t: maintenant(), msg: e.message.slice(0, 160) };
      // 429 (limite du Worker) ou panne : on garde l'alerte en attente, quelques essais seulement et seulement si elle est encore utile
      if (![400, 401, 404, 409].includes(e.status)) { enAttente.push({ alerte, essais: 1, t: maintenant() }); ecrireJson(F.attente, enAttente); }
      erreur('telegram : ' + e.message);
      return false;
    }
  }
  async function viderAttente() {
    if (!enAttente.length) return;
    const restant = [];
    for (const x of enAttente) {
      const age = maintenant() - x.t, utile = x.alerte.type === 'ENTREE' ? age < 20 * 60000 : age < 10 * 60000;
      if (!utile || x.essais >= 4) { journal('alerte abandonnee apres ' + x.essais + ' essai(s) : ' + x.alerte.id); continue; }
      try { await appelWorker('/telegram/envoyer', { method: 'POST', body: JSON.stringify({ texte: formaterMessage(x.alerte), type: x.alerte.type }) }); etat.canaux.telegram = { ok: true, t: maintenant() }; }
      catch (e) { restant.push({ ...x, essais: x.essais + 1 }); }
    }
    enAttente = restant; ecrireJson(F.attente, enAttente);
  }

  async function traiter(alerte, t = maintenant()) {
    const d = decider(historique, alerte, reglages, t);
    if (!d.envoyer) { if (d.raison !== 'déjà envoyée' && d.raison !== 'veilleur désactivé') etat.bloquees++; journal('alerte ' + alerte.type + ' ' + alerte.id + ' non envoyee : ' + d.raison); return { ...d, canaux: [] }; }
    historique = inscrire(historique, alerte, t); ecrireJson(F.historique, historique);
    const canaux = [];
    if (reglages.canaux.telegram) { if (workerPret() ? await envoyerTelegram(alerte) : (erreur('Worker non configure : alerte non envoyee sur Telegram'), false)) canaux.push('telegram'); }
    if (reglages.canaux.application) {
      canaux.push('application');
      const ligne = JSON.stringify({ id: alerte.id, type: alerte.type, t, texte: formaterMessage(alerte), resume: alerte.texte || alerte.titre || '', validee: alerte.validee !== false, canaux }) + '\n';
      fs.appendFileSync(F.alertes, ligne);
      try { const l = fs.readFileSync(F.alertes, 'utf8').split('\n').filter(Boolean); if (l.length > MAX_ALERTES_FICHIER) fs.writeFileSync(F.alertes, l.slice(-MAX_ALERTES_FICHIER).join('\n') + '\n'); } catch (e) { /* tant pis */ }
    }
    etat.envoyees++; etat.derniereAlerte = { id: alerte.id, type: alerte.type, t, canaux };
    journal('alerte ' + alerte.type + ' ' + alerte.id + ' envoyee (' + canaux.join('+') + ')');
    return { ...d, canaux };
  }

  /* MACRO : calendriers lus DIRECTEMENT depuis Node (pas de CORS) : calendrier public de la semaine, calendrier officiel de la Fed, calendrier officiel du BLS, résultats d'entreprises (Alpha Vantage ; clé facultative
     `alphavantage` dans config.local.json, sinon la clé de démonstration publique), valeurs « réelles » de l'inflation, du chômage et des emplois américains (API officielle du BLS, appelée seulement juste après une
     publication). Chaque source a son délai de rafraîchissement ; une source en panne est notée dans le journal et les autres continuent. Repli : route /calendar du Worker. Rien n'est inventé. */
  const TTL_MACRO = { ff: 30 * 60000, fed: 6 * 3600e3, ics: 12 * 3600e3, av: 12 * 3600e3, bls: 8 * 60000 };
  const cacheMacro = {};
  const lireTexteDirect = async url => { const r = await fetchImpl(url, { headers: { 'User-Agent': 'RayleVeilleur/1.0 (assistant personnel, usage non commercial)', Accept: '*/*' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
  async function source(cle, producteur, t) {
    const c = cacheMacro[cle]; if (c && t - c.t < TTL_MACRO[cle.split(':')[0]]) return c.v;
    try { const v = await producteur(); cacheMacro[cle] = { t, v }; return v; }
    catch (e) { journal('macro : source ' + cle + ' indisponible : ' + e.message); cacheMacro[cle] = { t: t - TTL_MACRO[cle.split(':')[0]] + 5 * 60000, v: c ? c.v : [] }; return c ? c.v : []; }   // nouvel essai dans 5 min ; ancienne copie gardée
  }
  async function majMacro(t) {
    if (!reglages.types.MACRO || t - dernierMacro < MACRO_TOUTES) return;
    dernierMacro = t;
    const listes = [];
    let publics = await source('ff', async () => evenementsPublics(JSON.parse(await lireTexteDirect(SOURCES_MACRO.ff))), t);
    if (!publics.length && workerPret()) { try { publics = evenementsPublics(await appelWorker('/calendar')); } catch (e) { journal('macro : repli Worker /calendar indisponible : ' + e.message); } }
    publics = publics.filter(e => PAYS_VEILLEUR.includes(e.pays));   // le Bitcoin réagit surtout au dollar, à l'euro, à la livre et au yen
    listes.push(publics);
    listes.push(await source('fed', async () => evenementsFed(JSON.parse((await lireTexteDirect(SOURCES_MACRO.fed)).replace(/^\uFEFF/, ''))), t));
    listes.push((await source('ics', async () => evenementsBls(await lireTexteDirect(SOURCES_MACRO.ics)), t)).filter(e => e.t > t - 86400e3 && e.t < t + 60 * 86400e3));
    const cleAv = config().alphavantage || 'demo';
    listes.push((await source('av', async () => evenementsResultats(await lireTexteDirect(SOURCES_MACRO.av(cleAv)), GRANDES_VALEURS), t)).map(e => ({ ...e, impact: 'high' })).filter(e => e.t > t - 86400e3 && e.t < t + 30 * 86400e3));   // résultats des très grandes valeurs : fort impact
    // « réel » : seulement pour les événements américains couverts par le BLS, publiés depuis moins de 3 heures et sans valeur encore
    let bls = null;
    const attendus = listes.flat().filter(e => e.pays === 'USD' && e.t <= t && t - e.t < 3 * 3600e3 && e.source && e.source.startsWith('Calendrier public') && /^(CPI m\/m|CPI y\/y|Core CPI m\/m|Unemployment Rate|Non-Farm Employment Change)$/i.test(e.titre));
    if (attendus.length) {
      const donnees = {}, besoin = new Set(attendus.flatMap(e => (/^Core CPI/i.test(e.titre) ? ['cpi_coeur_sa'] : /^CPI/i.test(e.titre) ? ['cpi_sa', 'cpi_nsa'] : /^Unemployment/i.test(e.titre) ? ['chomage'] : ['emplois'])));
      for (const k of besoin) { const pts = await source('bls:' + k, async () => analyserBls(JSON.parse(await lireTexteDirect(URL_BLS(SERIES_BLS[k])))) || [], t); if (pts && pts.length) donnees[k] = pts; }
      bls = Object.keys(donnees).length ? donnees : null;
    }
    evenements = fusionnerCalendrier(listes, { bls, maintenant: t }); evenementsMaj = t;
  }

  /* Une iteration (appelee toutes les ~20 s). Rend un petit compte rendu, utile aux tests. */
  async function cycle() {
    const t = maintenant(), cr = { calcule: false, alertes: [] };
    relireFichiers();
    etat.derniereBoucle = t;
    if (!reglages.actif) { ecrireEtat(); return cr; }
    let a; try { a = await assurerAgent(); } catch (e) { ecrireEtat(); return cr; }
    const ouvertureCourante = alignerM15(t);
    const fin = a.instantane().donnees.fin;
    if ((fin == null || fin < ouvertureCourante) && t - ouvertureCourante >= DELAI_APRES_CLOTURE && t - dernierEssai >= ESSAI_TOUTES) {
      dernierEssai = t;
      try { await a.miseAJour(); } catch (e) { erreur('mise a jour : ' + e.message); }
    }
    const i = a.instantane();
    if (i.donnees.fin != null && i.donnees.fin !== derniereFin) {       // une nouvelle bougie fermee a ete traitee
      derniereFin = i.donnees.fin; cr.calcule = true;
      etat.derniereBougie = i.donnees.fin; etat.donnees = { n: i.donnees.n, fin: i.donnees.fin, source: i.donnees.source };
      const obs = observationsDepuisLecture(i.lecture, precedent, reglages); precedent = obs.suivant;
      for (const al of file.splice(0)) cr.alertes.push(await traiter(al, t));
      if (reglages.types.OBSERVATION) for (const al of obs.alertes) cr.alertes.push(await traiter(al, t));
      else if (obs.alertes.length) journal(obs.alertes.length + ' observation(s) notable(s) ignoree(s) (type desactive)');
    } else for (const al of file.splice(0)) cr.alertes.push(await traiter(al, t));
    await majMacro(t);
    if (evenements.length) for (const al of alertesMacro(evenements, reglages, t)) cr.alertes.push(await traiter(al, t));
    await viderAttente();
    etat.strategie = i.etatStrategie;
    ecrireEtat();
    return cr;
  }

  function ecrireEtat() {
    try { ecrireJson(F.etat, { ...etat, pid: process.pid, vivantLe: maintenant(), actif: reglages.actif, workerConfigure: workerPret(), macro: { evenements: evenements.length, majLe: evenementsMaj }, enAttente: enAttente.length }); } catch (e) { /* disque plein : tant pis */ }
  }

  /* Alerte de test : passe par TOUT le circuit (regles, historique, application, Telegram) ; `sansEnvoi` coupe seulement l'appel reseau. */
  async function alerteDeTest({ sansEnvoi = true, type = 'ENTREE' } = {}) {
    const t = maintenant(), px = 100000;
    const al = { id: 'TEST:' + t, cle: 'TEST:' + t, type, groupe: 'test', validee: false, t, tSignal: t - PAS_M15, sens: 1, entree: px, stop: px - 1200, cible: px + 1200 * 5, R: 5, risquePct: 1, risqueCash: 100, phase: 'tendance haussière (FAUX SIGNAL DE TEST)',
      famille: 'test', nomStrategie: 'TEST', raison: 'ceci est un faux signal de test, aucune stratégie réelle.', invalidation: 'sans objet (test)', texte: 'FAUX SIGNAL DE TEST' };
    const avant = reglages; if (sansEnvoi) reglages = { ...reglages, canaux: { ...reglages.canaux, telegram: false } };
    reglages = { ...reglages, actif: true, silence: false, types: { ...reglages.types, [type]: true } };
    try { return await traiter(al, t); } finally { reglages = avant; }
  }

  return { cycle, traiter, alerteDeTest, etat: () => etat, reglages: () => reglages, historique: () => historique, fichiers: F, journal, assurerAgent, agent: () => agent, relireFichiers, injecterStrategie,
    arreter: () => { try { if (agent) agent.detruire(); } catch (e) { /* fini */ } } };
}
