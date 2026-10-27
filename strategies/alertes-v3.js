import { CRITERES3 } from './criteres-v3.js';

/* ═════════════ ALERTES DE L'AGENT (module pur, testé : galaxie/tests/agent-etat-test.mjs) ═════════════
   Huit types : PREPARATION, ENTREE, INVALIDATION, CLOTURE, COMPTE_RISQUE, DEGRADATION, RAPPORT, AUCUNE_STRATEGIE. Chaque alerte indique le NIVEAU DE PREUVE et rappelle qu'aucun ordre n'est exécuté.
   Fréquence réaliste : 1 à 5 positions par semaine. « Aucune stratégie validée » : au plus une fois par semaine. Jamais deux fois la même alerte (clé unique). */
export const TYPES_ALERTE = Object.freeze({
  PREPARATION: { emoji: '🟡', titre: 'Setup en préparation' }, ENTREE: { emoji: '🟢', titre: 'Entrée' }, INVALIDATION: { emoji: '⚪', titre: 'Setup invalidé' }, CLOTURE: { emoji: '🏁', titre: 'Position clôturée' },
  COMPTE_RISQUE: { emoji: '🔴', titre: 'Compte à risque' }, DEGRADATION: { emoji: '📉', titre: 'Stratégie dégradée' }, RAPPORT: { emoji: '📝', titre: 'Rapport hebdomadaire' }, AUCUNE_STRATEGIE: { emoji: 'ℹ️', titre: 'Aucune stratégie validée' }
});
export const PIED = 'Aucun ordre n’est exécuté automatiquement. Les résultats passés ne garantissent rien.';
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const prix = x => (x == null ? '—' : Math.abs(x) >= 100 ? fmt(x, 1) : Math.abs(x) >= 1 ? fmt(x, 2) : fmt(x, 5));
const horaire = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
export const niveauPreuve = (mode, resume = null) => (mode === 'REEL'
  ? 'Preuve : validée en backtest hors échantillon, puis confirmée en simulation directe' + (resume ? ' (' + resume.n + ' trades simulés)' : '') + '.'
  : 'Preuve : validée en backtest hors échantillon ; simulation directe EN COURS (pas encore assez de trades en direct). Alerte marquée SIMULATION.');
const etiquette = (type, mode) => (type === 'ENTREE' || type === 'PREPARATION' ? (mode === 'REEL' ? '' : 'SIMULATION · ') : '');

/* Construit une alerte. `s` = stratégie de l'état (nom, paire, phase…), `ev` = événement de direct-v3 ou données du type. */
export function construireAlerte(type, { s = null, ev = null, mode = null, resume = null, extra = {} } = {}, maintenant = Date.now()) {
  const def = TYPES_ALERTE[type]; if (!def) throw new Error('type d’alerte inconnu : ' + type);
  const m = mode || (s && s.phase === 'active' ? 'REEL' : 'SIMULATION'), qui = s ? s.nom + ' · ' + s.paire : '', pre = def.emoji + ' ' + etiquette(type, m);
  let titre = pre + def.titre + (qui ? ' · ' + qui : ''), lignes = [], cle = type + ':' + (s ? s.id : '') + ':';
  if (type === 'PREPARATION') { lignes = [ev.texte || 'Un setup se prépare.', ev.niveau ? 'Niveau à surveiller : ' + prix(ev.niveau) + '.' : '', 'Rien à faire maintenant : je te préviens si ça se confirme.']; cle += (ev.sens || 0) + ':' + Math.floor(ev.t / 3600e3); }
  else if (type === 'ENTREE') {
    const sens = ev.sens > 0 ? 'ACHAT' : 'VENTE', tl = ev.tailles;
    titre = pre + sens + ' · ' + qui;
    lignes = [sens + ' proposé(e) vers ' + prix(ev.entree) + ' (zone d’entrée à l’ouverture de la prochaine bougie M15).', 'Stop : ' + prix(ev.stop) + ' (' + fmt(ev.distancePct) + ' % du prix) · Objectifs : ' + ev.objectifs.map(o => fmt(o.R, 1) + ' R = ' + prix(o.prix)).join(' ; ') + ' · Rapport risque / gain : 1 pour ' + fmt(ev.R, 1) + '.',
      tl ? 'Taille pour risquer 1 % (' + fmt(tl.risque, 0) + ' $) : ' + fmt(tl.quantite, tl.quantite < 10 ? 4 : 2) + ' unités, soit ' + fmt(tl.valeur, 0) + ' $.' : '', ...(ev.raison || [])];
    cle += ev.signalT;
  } else if (type === 'INVALIDATION') { lignes = ['Le setup n’est plus valable : ' + ev.motif + '.']; cle += ev.signalT; }
  else if (type === 'CLOTURE') {
    const t = ev.trade; lignes = [(t.R >= 0 ? 'Gagnée' : 'Perdue') + ' : ' + (t.R >= 0 ? '+' : '−') + fmt(Math.abs(t.R)) + ' R (sortie « ' + ({ stop: 'stop', cible: 'objectif', temps: 'temps maximum' }[t.motif] || t.motif) + ' » à ' + prix(t.prixSortie) + ', après frais).', 'Ouverte le ' + horaire(t.t) + ' · durée ' + Math.round(t.barres / 4) + ' h.'];
    if (resume) lignes.push('Compte simulé : ' + fmt(resume.R, 1) + ' R sur ' + resume.n + ' trades.'); cle += t.tSortie;
  } else if (type === 'COMPTE_RISQUE') { lignes = [extra.texte || 'Le compte approche d’une limite du compte prop.']; cle += (extra.genre || '') + ':' + Math.floor(maintenant / 43200e3); }
  else if (type === 'DEGRADATION') { lignes = ['Les résultats récents s’écartent de ce que le backtest annonçait (détection de dérive).', extra.texte || '', 'La stratégie est mise en PAUSE : elle ne proposera plus d’entrée tant que je ne l’ai pas revalidée.']; cle += Math.floor(maintenant / 86400e3); }
  else if (type === 'RAPPORT') { lignes = (extra.lignes || []).slice(0, 6); cle += extra.semaine; }
  else if (type === 'AUCUNE_STRATEGIE') { lignes = [CRITERES3.aucuneStrategie, extra.variantes != null ? extra.variantes.toLocaleString('fr-FR') + ' variantes testées jusqu’ici ; je continue de chercher.' : '']; cle += Math.floor(maintenant / (7 * 86400e3)); }
  const texte = [titre, ...lignes.filter(Boolean), (type === 'ENTREE' || type === 'PREPARATION' || type === 'CLOTURE') ? niveauPreuve(m, resume) : '', PIED].filter(Boolean).join('\n');
  return { id: cle, cle, type, t: maintenant, titre, texte, mode: m, strategie: s ? s.id : null, paire: s ? s.paire : null, lue: false };
}

/* Filtre les alertes candidates : jamais deux fois la même clé ; « aucune stratégie » au plus une fois par semaine ; PREPARATION limitée à 1 par stratégie et par 4 h ; au plus `max` entrées par jour. */
export function filtrerAlertes(etat, candidates, maintenant = Date.now(), { maxEntreesParJour = 3 } = {}) {
  const gardees = [], vues = new Set(etat.alertes.map(a => a.cle));
  for (const a of candidates) {
    if (vues.has(a.cle)) continue;
    if (a.type === 'AUCUNE_STRATEGIE' && etat.alertes.some(x => x.type === 'AUCUNE_STRATEGIE' && maintenant - x.t < 7 * 86400e3)) continue;
    if (a.type === 'PREPARATION' && etat.alertes.concat(gardees).some(x => x.type === 'PREPARATION' && x.strategie === a.strategie && maintenant - x.t < 4 * 3600e3)) continue;
    if (a.type === 'ENTREE' && etat.alertes.concat(gardees).filter(x => x.type === 'ENTREE' && maintenant - x.t < 86400e3).length >= maxEntreesParJour) continue;
    gardees.push(a); vues.add(a.cle);
  }
  return gardees;
}
export function enregistrerAlertes(etat, alertes) { for (const a of alertes) etat.alertes.push(a); if (etat.alertes.length > 600) etat.alertes.splice(0, etat.alertes.length - 600); return alertes.length; }
/* Trop de positions proposées pour une stratégie ? (plus de 8 entrées en 7 jours = moteur trop permissif : il doit se resserrer, la stratégie est suspendue le temps de la revoir). */
export function tropPermissive(etat, idStrategie, maintenant = Date.now(), c = CRITERES3.rythme) {
  const n = etat.alertes.filter(a => a.type === 'ENTREE' && a.strategie === idStrategie && maintenant - a.t < 7 * 86400e3).length;
  return { n, trop: n > c.alerteTropPermissive, attendu: '1 à ' + c.positionsParSemaineMax + ' par semaine' };
}
/* Contrôle du compte prop (limites 3 % par jour, 6 % de creux) → alertes « compte à risque » quand la marge passe sous 25 % de la limite. */
export function controleCompte({ ddPct, pertejourPct }, c = CRITERES3.prop) {
  const out = [];
  if (pertejourPct >= c.perteJourMaxPct * 0.75) out.push({ genre: 'jour', texte: 'Perte du jour : ' + fmt(pertejourPct) + ' % pour une limite de ' + c.perteJourMaxPct + ' % (marge ' + fmt(c.perteJourMaxPct - pertejourPct) + ' %). Pas de nouveau trade aujourd’hui.' });
  if (ddPct >= c.drawdownMaxPct * 0.75) out.push({ genre: 'dd', texte: 'Creux du compte : ' + fmt(ddPct) + ' % pour une limite de ' + c.drawdownMaxPct + ' % (marge ' + fmt(c.drawdownMaxPct - ddPct) + ' %).' });
  return out;
}
