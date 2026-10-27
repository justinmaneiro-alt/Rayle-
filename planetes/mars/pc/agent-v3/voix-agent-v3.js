import { statutAgent, chiffres, strategiesActives, versionActive } from '../../../../strategies/agent-etat.js';
import { rapportTemplate, faitsRapport } from '../../../../strategies/rapport-v3.js';

/* ═════════════ VOIX DE L'AGENT UNIQUE (module pur, testé : galaxie/tests/agent-page-test.mjs) ═════════════
   Rayle est la SEULE voix : l'agent lui donne des données structurées, Rayle les dit. Justin ne dialogue pas avec l'agent. `detecter(n0)` : n0 = phrase normalisée (sans accents ni ponctuation,
   minuscules). Rend { type } ou null (la phrase n'est pas pour ce module). Prudence : seulement des formulations claires contenant « l agent » ou « kepler », pour ne rien voler à l'IA ni aux
   commandes de l'agent BTC d'avant.
   Types : statut · rapport · pause · reprendre · telegram (envoyer le statut sur Telegram, à la demande) · retour_arriere · charge. */
const A = '(?:l agent|agent|kepler)';
export function detecter(n0) {
  if (!n0 || !/\b(?:l agent|kepler)\b|\bagent\b/.test(n0)) return null;
  if (/\b(?:envoie|envoi|transmets?|passe)\b.*\b(?:statut|rapport|point)\b.*\b(?:telegram)\b|\btelegram\b.*\b(?:statut|rapport)\b.*\b(?:agent|kepler)\b/.test(n0)) return { type: 'telegram' };
  if (new RegExp('\\b(?:mets?|met|passe|place|stoppe)\\b.*\\b' + A + '\\b.*\\b(?:en )?pause\\b|\\bpause\\b.*\\b' + A + '\\b|\\b(?:arrete|stoppe)\\b.*\\b' + A + '\\b').test(n0)) return { type: 'pause' };
  if (new RegExp('\\b(?:reprends?|reprend|relance|redemarre|remets?)\\b.*\\b' + A + '\\b|\\b' + A + '\\b.*\\b(?:reprend|reprise)\\b').test(n0)) return { type: 'reprendre' };
  if (/\bretour arriere\b|\b(?:reviens|revenir|restaure|restaurer)\b.*\bversion\b/.test(n0)) return { type: 'retour_arriere' };
  const ch = /(?:charge|calcul)/.test(n0) ? /(faible|normale?|forte?)/.exec(n0) : null;
  if (ch) { const m = ch[1].replace(/e$/, ''); return { type: 'charge', valeur: m }; }
  if (new RegExp('\\b(?:rapport|compte rendu|bilan)\\b.*\\b' + A + '\\b|\\b' + A + '\\b.*\\b(?:rapport|compte rendu|bilan)\\b').test(n0)) return { type: 'rapport' };
  if (new RegExp('\\b(?:que fait|qu est ce que fait|qu a fait|ou en est|comment va|statut de|etat de|point sur|quoi de neuf (?:avec|sur|chez)|tu as des nouvelles de|as tu des nouvelles de)\\b.*\\b' + A + '\\b|\\b' + A + '\\b.*\\b(?:fait quoi|en est ou|en ce moment|maintenant|statut|etat)\\b|\\b(?:statut|etat) (?:de )?' + A + '\\b').test(n0)) return { type: 'statut' };
  return null;
}
const MOTS = { surveillance: 'surveille le marché', recherche: 'cherche et teste des stratégies', preparation: 'prépare un setup', position: 'propose une position', pause: 'est en pause', pc_eteint: 'surveille depuis le serveur, ton PC est éteint', veille_recherche: 'est en veille, ton PC est éteint', aucune: 'n’a aucune stratégie validée pour l’instant' };
/* Ce que Rayle dit à voix haute : court, sans markdown ni émoji, jamais une promesse. */
export function reponseStatut(etat, ctx = {}, maintenant = Date.now()) {
  const st = statutAgent(etat, ctx), c = chiffres(etat, maintenant), v = versionActive(etat), n = strategiesActives(etat).length;
  const l = ['Kepler ' + (MOTS[st.code] || st.texte) + '.'];
  if (n) l.push('Il suit ' + n + ' stratégie' + (n > 1 ? 's' : '') + ' (version ' + v.numero + ').'); else l.push('Il a testé ' + c.variantes.toLocaleString('fr-FR') + ' variantes et aucune n’a passé la validation : les preuves sont insuffisantes. Il continue de chercher.');
  if (c.alertesActives) l.push('Il y a ' + c.alertesActives + ' alerte' + (c.alertesActives > 1 ? 's' : '') + ' récente' + (c.alertesActives > 1 ? 's' : '') + '.');
  return l.join(' ');
}
export function reponseRapport(etat, ctx = {}, maintenant = Date.now()) {
  const lignes = etat.rapport && etat.rapport.lignes && etat.rapport.lignes.length ? etat.rapport.lignes.slice(0, 5) : rapportTemplate(faitsRapport(etat, ctx, maintenant));
  return lignes.join(' ');
}
export const MOTS_STATUT = MOTS;
