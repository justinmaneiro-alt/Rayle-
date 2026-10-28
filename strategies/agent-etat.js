import { CRITERES3, empreinteV3 } from './criteres-v3.js';
import { NOMS_V3 } from './familles-v3.js';
import { NOMS_V4 } from './familles-v4.js';
import { NOMS_V6 } from './familles-v6.js';
import { phraseFrais, tauxEquilibre } from './couts-r.js';

/* ═════════════ ÉTAT DE L'AGENT UNIQUE (module pur, testé : galaxie/tests/agent-etat-test.mjs) ═════════════
   Un seul agent, toujours le même : identité stable, mémoire, versions numérotées, journal. Cet état est partagé par trois endroits : le service PC (écrit), le Worker Cloudflare (lit la version
   ACTIVE, surveille, alerte quand le PC est éteint) et la page (affiche). Format : JSON, copié dans D1 par /agent/sync (tables : agent_identite, agent_versions, strategies, backtests,
   trades_simules, alertes, journal, parametres_risque). UNE seule version active à la fois ; v1, v2… avec raison et retour arrière.
   Les calculs sont faits par du code ; les textes (rapports) peuvent être écrits par un modèle de langage, mais il ne change JAMAIS un chiffre ici. */
export const SCHEMA = 1;
export const PAIRES_AGENT = Object.freeze(['BTC', 'SOL', 'DOGE']);
export const IDENTITE_DEFAUT = Object.freeze({
  nom: 'Kepler',
  role: 'Agent de marché de Raylé : surveille Bitcoin, Solana et Doge (entrées en M15, contexte H1 et H4), cherche des stratégies simples et les met à l’épreuve, propose des positions et envoie des alertes. Il ne passe jamais d’ordre.',
  style: 'Rapports courts, en français simple, chiffres d’abord, niveau de preuve toujours indiqué. Il dit « je ne sais pas » ou « aucune stratégie validée » quand c’est vrai.',
  regles: ['Aucun ordre n’est exécuté automatiquement.', 'Les résultats passés ne garantissent rien.', 'Aucun critère de validation n’est jamais assoupli.', 'Rayle est la seule voix : l’agent lui donne des données structurées.']
});
export const PARAMETRES_RISQUE_DEFAUT = Object.freeze({ capital: 10000, risquePct: CRITERES3.prop.risquePct, drawdownMaxPct: CRITERES3.prop.drawdownMaxPct, perteJourMaxPct: CRITERES3.prop.perteJourMaxPct, objectifPct: CRITERES3.prop.objectifPct, charge: 'normal', pause: false });
export const PHASES_STRATEGIE = Object.freeze({
  simulation: 'EN SIMULATION', active: 'ACTIVE', pause: 'EN PAUSE', retiree: 'RETIRÉE'
});
const SEMAINE = 7 * 86400e3;

export function etatInitial(maintenant = Date.now()) {
  return { schema: SCHEMA, identite: { ...IDENTITE_DEFAUT, creeLe: maintenant, jalons: [] }, versions: [], active: null, strategies: {}, backtests: [], tradesSimules: [], alertes: [], journal: [],
    parametresRisque: { ...PARAMETRES_RISQUE_DEFAUT }, compteurVariantes: { BTC: 0, SOL: 0, DOGE: 0 }, recherche: { enCours: null, derniere: null, cycles: 0 }, rapport: null, miseAJour: maintenant };
}
const plafond = (liste, n) => { if (liste.length > n) liste.splice(0, liste.length - n); return liste; };
export function journaliser(etat, type, texte, maintenant = Date.now(), donnees = null) {
  etat.journal.push({ t: maintenant, type, texte: String(texte).slice(0, 500), ...(donnees ? { donnees } : {}) }); plafond(etat.journal, 1500); etat.miseAJour = maintenant; return etat;
}
export function jalon(etat, texte, maintenant = Date.now()) { etat.identite.jalons.push({ t: maintenant, texte }); plafond(etat.identite.jalons, 200); return etat; }
export const idStrategie = (famille, paire, params) => famille + ':' + paire + ':' + Object.keys(params || {}).sort().map(k => k + '=' + params[k]).join(',');

/* Crée une NOUVELLE version : `candidates` = [{ famille, paire, params, validation:{ statut, empreintes, resume } }]. Les stratégies déjà suivies gardent leur historique de simulation ;
   les nouvelles entrent en SIMULATION (alertes « SIMULATION » seulement). La version devient active tout de suite (la précédente reste en historique, retour arrière possible). */
export function creerVersion(etat, { candidates, raison, validation = null }, maintenant = Date.now()) {
  if (!Array.isArray(candidates) || !candidates.length) throw new Error('une version doit contenir au moins une stratégie validée');
  for (const c of candidates) if (!(c.validation && c.validation.statut === 'validee_backtest')) throw new Error('seules les stratégies VALIDÉES EN BACKTEST peuvent entrer dans une version : ' + c.famille + ' ' + c.paire);
  const numero = etat.versions.length ? etat.versions[etat.versions.length - 1].numero + 1 : 1, ids = [];
  for (const c of candidates) {
    const id = idStrategie(c.famille, c.paire, c.params); ids.push(id);
    const ex = etat.strategies[id];
    if (ex) { ex.phase = ex.phase === 'retiree' ? 'simulation' : ex.phase; ex.validation = c.validation; if (ex.phase === 'simulation' && !ex.debutSimulation) ex.debutSimulation = maintenant; }
    else etat.strategies[id] = { id, famille: c.famille, nom: NOMS_V3[c.famille] || NOMS_V4[c.famille] || NOMS_V6[c.famille] || c.famille, paire: c.paire, params: c.params, phase: 'simulation', debutSimulation: maintenant, creeeDansVersion: numero, validation: c.validation, suivi: null, historique: [{ t: maintenant, evenement: 'validée en backtest, entre en simulation' }] };
  }
  for (const v of etat.versions) v.active = false;
  const v = { numero, creeLe: maintenant, raison, strategies: ids, active: true, criteres: { v3: empreinteV3() }, validation };
  etat.versions.push(v); etat.active = numero; etat.miseAJour = maintenant;
  journaliser(etat, 'version', 'Version v' + numero + ' activée : ' + raison, maintenant); jalon(etat, 'v' + numero + ' : ' + raison, maintenant);
  return v;
}
/* Retour arrière en un clic : réactive la version précédente (ou une version nommée). */
export function retourArriere(etat, vers = null, maintenant = Date.now()) {
  const cible = vers != null ? etat.versions.find(v => v.numero === vers) : etat.versions.slice().reverse().find(v => v.numero < etat.active);
  if (!cible) return { ok: false, raison: 'aucune version antérieure' };
  for (const v of etat.versions) v.active = v.numero === cible.numero;
  etat.active = cible.numero; etat.miseAJour = maintenant; journaliser(etat, 'version', 'Retour arrière : la version v' + cible.numero + ' est de nouveau active.', maintenant); jalon(etat, 'retour arrière vers v' + cible.numero, maintenant);
  return { ok: true, numero: cible.numero };
}
export const versionActive = etat => etat.versions.find(v => v.numero === etat.active) || null;
export const strategiesActives = etat => { const v = versionActive(etat); return v ? v.strategies.map(id => etat.strategies[id]).filter(s => s && s.phase !== 'retiree') : []; };

/* La simulation en direct est-elle terminée ? Il faut 4 semaines ET 30 trades simulés (le plus long des deux), sans dérive. */
export function simulationTerminee(s, resume, maintenant = Date.now(), c = CRITERES3.simulationDirect) {
  const semaines = s.debutSimulation ? (maintenant - s.debutSimulation) / SEMAINE : 0, n = resume ? resume.n : 0;
  return { semaines, trades: n, ok: semaines >= c.semainesMin && n >= c.tradesMin, reste: { semaines: Math.max(0, c.semainesMin - semaines), trades: Math.max(0, c.tradesMin - n) } };
}
/* Passe en ACTIVE les stratégies dont la simulation est terminée et saine ; rend la liste des passages (pour les journaliser et prévenir Justin). */
export function promouvoir(etat, resumes, maintenant = Date.now()) {
  const passages = [];
  for (const s of strategiesActives(etat)) {
    if (s.phase !== 'simulation') continue;
    const t = simulationTerminee(s, resumes[s.id], maintenant), r = resumes[s.id];
    if (t.ok && r && r.esperance > 0) { s.phase = 'active'; s.historique.push({ t: maintenant, evenement: 'simulation terminée (' + t.trades + ' trades, ' + t.semaines.toFixed(1) + ' semaines) : alertes d’entrée réelles autorisées' }); passages.push(s.id); journaliser(etat, 'promotion', s.nom + ' ' + s.paire + ' : simulation terminée, alertes d’entrée activées.', maintenant); }
  }
  return passages;
}
export function mettreEnPause(etat, id, raison, maintenant = Date.now()) {
  const s = etat.strategies[id]; if (!s || s.phase === 'pause') return false;
  s.phase = 'pause'; s.historique.push({ t: maintenant, evenement: 'mise en pause : ' + raison }); journaliser(etat, 'pause', s.nom + ' ' + s.paire + ' mise en pause : ' + raison, maintenant); return true;
}
/* « SIMULATION » ou « REEL » : le mode des alertes d'entrée de cette stratégie. */
export const modeAlerte = s => (s && s.phase === 'active' ? 'REEL' : 'SIMULATION');

/* Statut visible partout (Mars, Jarvis, Telegram, voix). */
export const STATUTS_AGENT = Object.freeze({
  recherche: 'en recherche', surveillance: 'en surveillance', preparation: 'setup en préparation', position: 'position proposée', pause: 'en pause', pc_eteint: 'PC éteint : surveillance seule', veille_recherche: 'en veille de recherche', aucune: 'aucune stratégie validée'
});
export function statutAgent(etat, { pcVivant = true, rechercheEnCours = false, enPreparation = false, positionOuverte = false } = {}) {
  let code;
  if (etat.parametresRisque.pause) code = 'pause';
  else if (positionOuverte) code = 'position';
  else if (enPreparation) code = 'preparation';
  else if (!pcVivant) code = strategiesActives(etat).length ? 'pc_eteint' : 'veille_recherche';
  else if (rechercheEnCours) code = 'recherche';
  else code = strategiesActives(etat).length ? 'surveillance' : 'aucune';
  return { code, texte: STATUTS_AGENT[code], phrase: phraseStatut(etat, code) };
}
function phraseStatut(etat, code) {
  const n = strategiesActives(etat).length;
  return ({ pause: 'L’agent est en pause (tu l’as demandé).', position: 'Une position est proposée : regarde le graphique.', preparation: 'Un setup se prépare : rien à faire pour l’instant, je te préviens si ça se confirme.',
    pc_eteint: 'Ton PC est éteint : je surveille le marché depuis le serveur avec la dernière version validée (v' + etat.active + '), mais je ne cherche pas de nouvelles stratégies.', veille_recherche: 'Ton PC est éteint : pas de recherche en ce moment.',
    recherche: 'Je cherche et teste des stratégies sur les données ' + (n ? 'et je surveille le marché avec ' + n + ' stratégie(s).' : '; aucune n’est encore validée.'), surveillance: 'Je surveille le marché avec ' + n + ' stratégie(s) (version v' + etat.active + ').', aucune: CRITERES3.aucuneStrategie })[code];
}
/* Frais moyens en R par trade (V6) : `etat.frais` = { coutMoyenR, t } mesuré chaque jour par le service sur tout ce qui a été testé ; sinon, moyenne pondérée des résumés de validation qui la contiennent. */
export function fraisMoyenR(etat) {
  if (etat.frais && Number.isFinite(etat.frais.coutMoyenR)) return etat.frais.coutMoyenR;
  const l = (etat.backtests || []).filter(b => Number.isFinite(b.coutMoyenR) && b.trades > 0), n = l.reduce((a, b) => a + b.trades, 0);
  return n ? l.reduce((a, b) => a + b.coutMoyenR * b.trades, 0) / n : null;
}
/* La phrase de l'état : « Frais moyens : X R par trade. Taux de réussite minimal pour être rentable avec RR=2 : Y %. » */
export const phraseFraisEtat = etat => phraseFrais({ coutMoyenR: fraisMoyenR(etat), rr: 2 });
/* Les trois chiffres + la version active. */
export function chiffres(etat, maintenant = Date.now()) {
  const variantes = Object.values(etat.compteurVariantes).reduce((a, b) => a + b, 0), v = versionActive(etat);
  const alertesActives = etat.alertes.filter(a => !a.lue && maintenant - a.t < 7 * 86400e3 && a.type !== 'RAPPORT').length;
  const frais = fraisMoyenR(etat);
  return { variantes, validees: strategiesActives(etat).length, alertesActives, version: v ? v.numero : null, derniereValidation: v ? v.creeLe : null, fraisMoyenR: frais, tauxEquilibreRR2: frais == null ? null : tauxEquilibre(2, frais) };
}
/* Règles minimales envoyées au Worker : seulement ce qu'il faut pour surveiller (famille + paramètres) et le mode d'alerte. */
export function exporterRegles(etat) {
  return strategiesActives(etat).filter(s => s.phase !== 'pause').map(s => ({ id: s.id, famille: s.famille, paire: s.paire, params: s.params, mode: modeAlerte(s), version: etat.active, nom: s.nom }));
}
