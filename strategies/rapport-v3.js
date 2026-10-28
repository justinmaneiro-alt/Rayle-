import { chiffres, statutAgent, strategiesActives, versionActive, phraseFraisEtat } from './agent-etat.js';
import { CRITERES3 } from './criteres-v3.js';

/* ═════════════ RAPPORT DE L'AGENT EN 5 LIGNES (module pur, testé : galaxie/tests/agent-etat-test.mjs) ═════════════
   Le CODE calcule les faits (compteurs, résultats, statut). Un modèle de langage (LM Studio, Dolphin 3.0 ou les API gratuites) peut REFORMULER ces faits en français simple, mais :
   - il ne reçoit que des faits structurés et n'a accès à aucune clé de trading ;
   - tout chiffre de sa réponse doit exister dans les faits (sinon sa réponse est REFUSÉE et le texte écrit par le code est utilisé) ;
   - il ne passe aucun ordre. */
const fr = (x, d = 0) => (x == null || !Number.isFinite(x) ? 'inconnu' : x.toFixed(d).replace('.', ','));
const jourFr = t => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/');

export function faitsRapport(etat, ctx = {}, maintenant = Date.now()) {
  const st = statutAgent(etat, ctx), c = chiffres(etat, maintenant), actives = strategiesActives(etat), v = versionActive(etat);
  const essais = etat.backtests.slice(-5), meilleur = etat.backtests.filter(b => b.esperance != null && b.statut !== 'rejetee_causalite').sort((a, b) => b.esperance - a.esperance)[0] || null;
  return { statut: st, version: c.version, derniereValidation: c.derniereValidation, variantes: c.variantes, validees: c.validees, alertesActives: c.alertesActives, strategies: actives.map(s => ({ nom: s.nom, paire: s.paire, phase: s.phase })), versionRaison: v ? v.raison : null,
    essaisRecents: essais.map(b => ({ nom: b.nom, paire: b.paire, statut: b.statut, esperance: b.esperance, trades: b.trades })), meilleurEssai: meilleur ? { nom: meilleur.nom, paire: meilleur.paire, esperance: meilleur.esperance, trades: meilleur.trades, statut: meilleur.statut } : null,
    frais: phraseFraisEtat(etat), fraisMoyenR: c.fraisMoyenR, compte: ctx.compte || null, maintenant };
}
/* Le rapport écrit par le code : cinq lignes, français simple, jamais de promesse. */
export function rapportTemplate(f) {
  const l = [];
  l.push(f.statut.phrase);
  l.push('J’ai testé ' + f.variantes.toLocaleString('fr-FR') + ' variantes de stratégies jusqu’ici ; ' + (f.validees ? f.validees + ' stratégie(s) ont passé la validation (version v' + f.version + ', validée le ' + jourFr(f.derniereValidation) + ').' : 'aucune n’a passé la validation : ' + CRITERES3.aucuneStrategie));
  if (f.meilleurEssai) l.push('Meilleur essai pour l’instant : ' + f.meilleurEssai.nom + ' sur ' + f.meilleurEssai.paire + ', ' + fr(f.meilleurEssai.esperance, 2) + ' R par trade sur ' + f.meilleurEssai.trades + ' trades hors échantillon (' + (f.meilleurEssai.statut === 'validee_backtest' ? 'validé en backtest' : 'pas validé') + ').');
  else l.push('Je n’ai pas encore de résultat chiffré à te montrer.');
  if (f.fraisMoyenR != null) l[l.length - 1] += ' ' + f.frais;      // V6 : « Frais moyens : X R par trade. Taux de réussite minimal pour être rentable avec RR=2 : Y %. »
  l.push(f.strategies.length ? 'Stratégies suivies : ' + f.strategies.map(s => s.nom + ' ' + s.paire + ' (' + ({ simulation: 'en simulation', active: 'active', pause: 'en pause' }[s.phase] || s.phase) + ')').join(', ') + '.' : 'Aucune stratégie n’est suivie pour l’instant : pas d’alerte d’entrée à attendre.');
  l.push('Rappel : les résultats passés ne garantissent rien et aucun ordre n’est exécuté.');
  return l;
}
export function promptRapport(f) {
  return 'Tu es la plume de l’agent de marché de Raylé. Réécris ces faits en 5 lignes courtes, en français simple, sans markdown ni émoji, sans promesse de gain. N’ajoute AUCUN chiffre qui ne figure pas dans les faits. FAITS (JSON) : ' + JSON.stringify({ ...f, maintenant: undefined, derniereValidation: f.derniereValidation ? jourFr(f.derniereValidation) : null });
}
/* Tous les nombres d'un texte (formes « 2973 », « 2 973 », « 0,25 », « 4 »). */
export function nombresDe(texte) { return (String(texte).replace(/ | /g, ' ').replace(/(\d) (\d{3})(?!\d)/g, '$1$2').match(/\d+(?:[.,]\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.'))); }
/* Un texte de modèle est accepté seulement si chacun de ses nombres vient des faits (arrondis compris) ou du rappel standard. */
export function accepterTexteModele(texte, f) {
  if (!texte || typeof texte !== 'string' || texte.length < 40 || texte.length > 1500) return { ok: false, raison: 'texte absent ou de taille anormale' };
  const permis = new Set(nombresDe(JSON.stringify({ ...f, maintenant: undefined, derniereValidation: f.derniereValidation ? jourFr(f.derniereValidation) : '' })));
  const proche = x => [...permis].some(p => Math.abs(p - x) < 0.0051 || Math.abs(Math.round(p * 10) / 10 - x) < 0.0051 || Math.abs(Math.round(p) - x) < 0.0051);
  const inconnus = nombresDe(texte).filter(x => !proche(x) && ![1, 2, 3, 4, 5].includes(x));
  return inconnus.length ? { ok: false, raison: 'chiffre(s) inventé(s) : ' + inconnus.slice(0, 4).join(', ') } : { ok: true };
}
