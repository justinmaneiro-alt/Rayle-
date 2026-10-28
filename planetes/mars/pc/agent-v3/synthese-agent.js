import { statutAgent, chiffres, versionActive, strategiesActives } from '../../../../strategies/agent-etat.js';
import { CRITERES3 } from '../../../../strategies/criteres-v3.js';

/* ═════════════ SYNTHÈSE DE L'AGENT POUR LES FENÊTRES DE LA TABLE (module pur, testé : galaxie/tests/agent-synthese-test.mjs) ═════════════
   Les petites fenêtres « Agent BTC », « Propositions de l'agent » et « Régime de marché » lisent le MÊME état que l'écran Agent (service PC, sinon Worker) : jamais l'ancien agent du navigateur.
   `lecture` = { origine: 'PC' | 'Worker', enMarche, etat, suivi, t } (agent-accueil.js : lireEtatAgent). Rien n'est inventé : une donnée absente est dite absente, et « pourquoi pas de setup »
   vient de la meilleure évaluation réellement faite (état de l'agent) comparée aux critères écrits d'avance (criteres-v3.js, jamais assouplis). */
const fr = new Intl.NumberFormat('fr-FR'), nb = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ',')), sg = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : '') + nb(x, d));
const NOM = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };
const ICI = (lecture, maintenant) => ({ pcVivant: !!(lecture && lecture.enMarche), rechercheEnCours: !!(lecture && lecture.etat && lecture.etat.recherche && lecture.etat.recherche.enCours), enPreparation: Object.values((lecture && lecture.suivi) || {}).some(s => s && s.pendante), positionOuverte: Object.values((lecture && lecture.suivi) || {}).some(s => s && s.position), maintenant });   // mêmes règles que l'écran Agent (agent-accueil.js)

/* Dernière évaluation de chaque (famille, paire, type) ; la meilleure par paire = la plus haute espérance nette parmi celles qui ont des trades. */
export function meilleursEssais(etat) {
  const derniers = new Map();
  for (const b of (etat && etat.backtests) || []) { const k = b.famille + '|' + b.paire + '|' + b.type, p = derniers.get(k); if (!p || (b.t || 0) >= (p.t || 0)) derniers.set(k, b); }
  const out = {};
  for (const b of derniers.values()) { if (!(b.trades > 0) || !Number.isFinite(b.esperance)) continue; const m = out[b.paire]; if (!m || b.esperance > m.esperance) out[b.paire] = b; }
  return out;
}
/* Ce qu'il manque, critère par critère, pour la meilleure évaluation d'une paire (seuils : criteres-v3.js). */
export function manque(essai) {
  if (!essai) return [];
  const C = CRITERES3, l = [];
  const ligne = (nom, valeur, requis, ok) => l.push({ nom, valeur, requis, ok });
  ligne('Gain moyen par trade (hors échantillon)', sg(essai.esperance) + ' R', '≥ ' + sg(C.horsEchantillon.esperanceMin) + ' R', essai.esperance >= C.horsEchantillon.esperanceMin);
  ligne('Nombre de trades hors échantillon', fr.format(essai.trades || 0), '≥ ' + C.horsEchantillon.tradesMin, (essai.trades || 0) >= C.horsEchantillon.tradesMin);
  if (essai.bootstrapBas != null) ligne('Borne basse de confiance à 95 %', sg(essai.bootstrapBas) + ' R', '> ' + C.bootstrap.basMin, essai.bootstrapBas > C.bootstrap.basMin);
  if (essai.dsr != null) ligne('Sharpe déflaté (tient compte de toutes les variantes testées)', nb(essai.dsr * 100, 1) + ' %', '≥ ' + Math.round(C.deflation.dsrMin * 100) + ' %', essai.dsr >= C.deflation.dsrMin);
  return l;
}
export const resumeManque = essai => { const l = manque(essai).filter(x => !x.ok); return l.length ? l.map(x => x.nom.split(' (')[0].toLowerCase() + ' ' + x.valeur + ' (requis ' + x.requis + ')').join(' · ') : 'tous les seuils chiffrés sont atteints ; restent les contrôles de robustesse et le jeu final'; };

/* Fenêtre « Agent BTC » de la table. */
export function reelAgent(lecture, maintenant = Date.now()) {
  if (!lecture) return { etat: 'indisponible', erreur: 'ni le service de l’agent (PC) ni le Worker ne répondent : lance « node agent-pc/service.mjs » ou déploie le Worker' };
  if (lecture.erreur) return { etat: 'indisponible', erreur: lecture.erreur };
  const etat = lecture.etat, st = statutAgent(etat, ICI(lecture, maintenant)), c = chiffres(etat, maintenant), v = versionActive(etat), actives = strategiesActives(etat).length;
  return { etat: 'ok', etiquette: 'RÉEL · ' + (lecture.origine === 'PC' ? 'service du PC' : 'Worker') + (lecture.enMarche ? '' : ' · service arrêté'), entete: st.phrase,
    liste: [
      { g: 'Statut', d: st.texte || st.code, c: st.code === 'aucune' ? '#ffb347' : '#41e0a0' },
      { g: 'Variantes testées', d: fr.format(c.variantes) }, { g: 'Stratégies validées', d: String(c.validees) }, { g: 'Alertes (7 jours)', d: String(c.alertesActives) },
      { g: 'Version active', d: v ? 'v' + v.numero : 'aucune' }, { g: 'Positions simulées ouvertes', d: String(Object.values(lecture.suivi || {}).filter(s => s && s.position).length) }
    ], pied: actives ? actives + ' stratégie(s) en surveillance · aucun ordre n’est passé' : 'aucune stratégie validée : pas de setup, pas d’alerte d’entrée · aucun ordre n’est passé' };
}

/* Fenêtre « Propositions de l'agent » : les entrées récentes s'il y en a ; sinon POURQUOI il n'y a pas de setup et ce qu'il manque pour une validation. */
export function reelPropositions(lecture, maintenant = Date.now()) {
  if (!lecture || lecture.erreur) return { etat: 'indisponible', erreur: (lecture && lecture.erreur) || 'l’état de l’agent n’est pas joignable (service PC éteint et Worker injoignable)' };
  const etat = lecture.etat, c = chiffres(etat, maintenant), entrees = (etat.alertes || []).filter(a => a.type === 'ENTREE' && maintenant - a.t < 12 * 3600e3), pos = Object.values(lecture.suivi || {}).filter(s => s && s.position);
  const liste = [];
  if (entrees.length || pos.length) {
    for (const a of entrees.slice(0, 3)) liste.push({ g: (a.titre || 'Entrée proposée').replace(/^\S+\s/, '').slice(0, 44), d: a.mode || '—', c: '#41e0a0' });
    for (const s of pos.slice(0, 2)) liste.push({ g: 'Position simulée ' + (s.position.s > 0 ? 'achat' : 'vente'), d: 'stop ' + Math.round(s.position.stop) + ' · cible ' + Math.round(s.position.cible) });
    return { etat: 'ok', etiquette: 'SIMULÉ', entete: 'Entrées proposées par l’agent', liste, pied: 'compte simulé · aucun ordre n’est passé' };
  }
  liste.push({ g: 'Pourquoi pas de setup ?', d: c.validees ? 'aucune entrée en ce moment' : 'aucune stratégie validée', c: '#ffb347' });
  const essais = meilleursEssais(etat);
  for (const p of ['BTC', 'SOL', 'DOGE']) { const e = essais[p]; if (e) liste.push({ g: NOM[p] + ' · meilleure piste', d: sg(e.esperance) + ' R/trade' + ' · ' + (e.ratees ? e.ratees.length : '?') + ' critères ratés' }); }
  const meilleure = Object.entries(essais).sort((x, y) => y[1].esperance - x[1].esperance)[0];
  if (meilleure) liste.push({ g: 'Il manque (' + NOM[meilleure[0]] + ')', d: resumeManque(meilleure[1]) });
  liste.push({ g: 'Variantes testées', d: fr.format(c.variantes) });
  liste.push({ g: 'Pour valider', d: '≥ ' + CRITERES3.horsEchantillon.tradesMin + ' trades hors échantillon · ≥ ' + sg(CRITERES3.horsEchantillon.esperanceMin) + ' R/trade · confiance 95 % > 0 · Sharpe déflaté ≥ ' + Math.round(CRITERES3.deflation.dsrMin * 100) + ' %' });
  return { etat: 'ok', etiquette: 'RÉEL', entete: 'Pas de setup : l’agent ne propose rien sans stratégie validée', liste, pied: 'critères écrits d’avance, jamais assouplis · aucun ordre n’est passé' };
}

/* Fenêtre « Régime de marché » : un régime par actif (calculé sur les vraies bougies H1 par detecteur-regime.js) ; `regimes` = { BTC: { ok, regime: { nom, code, adx, phrase, haut, bas, volatil } } | { ok:false, erreur } }. */
export function reelRegimes(regimes, lecture = null, maintenant = Date.now()) {
  const liste = [];
  for (const p of ['BTC', 'SOL', 'DOGE']) {
    const r = regimes && regimes[p]; if (!r) continue;
    if (!r.ok) { liste.push({ g: NOM[p], d: 'indisponible : ' + String(r.erreur || '?').slice(0, 40), c: '#ff6b6b' }); continue; }
    const g = r.regime, couleur = g.code === 1 ? '#41e0a0' : g.code === 2 ? '#ff6b6b' : g.code === 3 ? '#8fd0e3' : '#ffb347';
    liste.push({ g: NOM[p], d: g.nom + (g.volatil ? ' · agité' : '') + (g.adx != null ? ' · ADX ' + Math.round(g.adx) : '') + (g.code === 3 && g.haut != null ? ' · ' + Math.round(g.bas).toLocaleString('fr-FR') + '–' + Math.round(g.haut).toLocaleString('fr-FR') : ''), c: couleur });
  }
  if (!liste.length) return { etat: 'bientot', message: 'calcul du régime en cours (bougies H1 de Binance)' };
  const c = lecture && lecture.etat ? chiffres(lecture.etat, maintenant) : null;
  return { etat: 'ok', etiquette: 'RÉEL · calculé sur Binance', entete: 'Régime actuel de chaque actif (bougies H1)', liste,
    pied: (c && !c.validees ? 'l’agent n’a aucune stratégie validée : le régime décrit le marché, il ne propose pas d’entrée' : 'le régime décrit le marché, il ne prédit rien') + ' · aucun ordre' };
}
