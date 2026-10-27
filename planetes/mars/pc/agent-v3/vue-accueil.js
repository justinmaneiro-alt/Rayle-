import { annoter } from './glossaire-v3.js';
import { statutAgent, chiffres, strategiesActives, versionActive } from '../../../../strategies/agent-etat.js';
import { rapportTemplate, faitsRapport } from '../../../../strategies/rapport-v3.js';

/* ═════════════ ÉCRAN D'ACCUEIL DE L'AGENT (module pur, testé : galaxie/tests/agent-page-test.mjs) ═════════════
   Cinq choses, dans cet ordre : (1) UNE phrase : que fait l'agent maintenant ? (2) Pause / Reprendre et la charge — pas de bouton « Lancer » : il tourne tout seul ; (3) trois chiffres + la version
   active ; (4) le graphique avec les positions ; (5) le dernier rapport en 5 lignes. Les mots techniques sont expliqués au survol / au toucher. Rien n'est inventé : sans données, l'écran le dit.
   Le détail (marché, microstructure, stratégies, risque, journal, systèmes) est dans l'onglet « Détails ». */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = new Intl.NumberFormat('fr-FR'), jourFr = t => (t ? new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/') : '—');
const heureFr = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const nb = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
export const AVERTISSEMENT = 'Les résultats passés ne garantissent rien. Aucun ordre n’est exécuté : l’agent propose et alerte, c’est toi qui décides.';
const ICONES_STATUT = { recherche: 'recherche', surveillance: 'veille', preparation: 'prepa', position: 'position', pause: 'pause', pc_eteint: 'eteint', veille_recherche: 'eteint', aucune: 'aucune' };

/* (1) La phrase du haut. `source` : { origine: 'PC' | 'Worker', enMarche } pour dire d'où vient l'état. */
export function htmlPhrase(etat, ctx, source = null) {
  const st = statutAgent(etat, ctx);
  return '<section class="av3-phrase" data-statut="' + esc(st.code) + '"><div class="av3-q">Que fait l’agent maintenant ?</div><div class="av3-rep"><i class="av3-pastille av3-p-' + esc(ICONES_STATUT[st.code] || 'aucune') + '"></i><b>' + esc(st.texte.charAt(0).toUpperCase() + st.texte.slice(1)) + '</b></div>'
    + '<p>' + annoter(esc(st.phrase)) + '</p>' + (source ? '<small class="av3-src">État lu sur : ' + esc(source.origine) + (source.enMarche === false ? ' (service arrêté)' : '') + (source.t ? ' · ' + esc(heureFr(source.t)) : '') + '</small>' : '') + '</section>';
}
/* (2) Pause / Reprendre + charge de calcul. Jamais de « Lancer ». */
export function htmlControle(etat) {
  const p = etat.parametresRisque || {}, charge = p.charge || 'normal';
  return '<section class="av3-ctl" aria-label="Contrôle de l’agent"><button type="button" class="av3-btn ' + (p.pause ? 'av3-reprise' : 'av3-pause') + '" data-av3="' + (p.pause ? 'reprendre' : 'pause') + '">' + (p.pause ? '▶ Reprendre' : '⏸ Pause') + '</button>'
    + '<label class="av3-charge">Charge de calcul du PC <select data-av3-charge aria-label="Charge de calcul">' + ['faible', 'normal', 'fort'].map(c => '<option value="' + c + '"' + (c === charge ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label>'
    + '<span class="av3-aide">L’agent tourne tout seul : rien à démarrer. La charge « faible » laisse le PC tranquille ; il se met aussi en pause quand tu joues.</span></section>';
}
/* (3) Trois chiffres + version active. */
export function htmlChiffres(etat, maintenant = Date.now()) {
  const c = chiffres(etat, maintenant), v = versionActive(etat);
  const carte = (nom, val, aide) => '<div class="av3-carte"><b>' + val + '</b><span>' + annoter(esc(nom)) + '</span>' + (aide ? '<small>' + esc(aide) + '</small>' : '') + '</div>';
  return '<section class="av3-chiffres">' + carte('variantes testées', fr.format(c.variantes), 'pas une note de qualité') + carte('stratégies validées', String(c.validees), c.validees ? 'en simulation ou actives' : 'aucune pour l’instant') + carte('alertes actives', String(c.alertesActives), '7 derniers jours')
    + '<div class="av3-carte av3-version"><b>' + (v ? 'v' + v.numero : '—') + '</b><span>version active</span><small>' + (v ? 'validée le ' + jourFr(v.creeLe) : 'aucune version validée') + '</small></div></section>';
}
/* (5) Dernier rapport en 5 lignes. */
export function htmlRapport(etat, ctx = {}, maintenant = Date.now()) {
  const r = etat.rapport && etat.rapport.lignes && etat.rapport.lignes.length ? { lignes: etat.rapport.lignes.slice(0, 5), source: etat.rapport.source, t: etat.rapport.t } : { lignes: rapportTemplate(faitsRapport(etat, ctx, maintenant)), source: 'écrit par le code, sans modèle', t: null };
  return '<section class="av3-rapport"><h3>Le dernier rapport de l’agent</h3><ol>' + r.lignes.map(l => '<li>' + annoter(esc(l)) + '</li>').join('') + '</ol><small>' + (r.t ? 'Écrit le ' + esc(heureFr(r.t)) + ' · ' : '') + 'source : ' + esc(r.source) + '</small></section>';
}
/* Stratégies suivies (liste courte, sous les chiffres). */
export function htmlStrategies(etat, suivi = {}) {
  const l = strategiesActives(etat); if (!l.length) return '<section class="av3-strats"><h3>Stratégies suivies</h3><p class="av3-vide">Aucune stratégie validée pour l’instant. L’agent continue de chercher.</p></section>';
  const PH = { simulation: 'en simulation', active: 'active', pause: 'en pause' };
  return '<section class="av3-strats"><h3>Stratégies suivies</h3><ul>' + l.map(s => { const sv = suivi[s.id], n = sv ? sv.trades.length : 0, R = sv ? sv.trades.reduce((a, x) => a + x.R, 0) : 0;
    return '<li data-phase="' + esc(s.phase) + '"><b>' + esc(s.nom) + '</b> · ' + esc(s.paire) + ' <em>' + esc(PH[s.phase] || s.phase) + '</em><span>' + n + ' trade(s) simulé(s)' + (n ? ' · ' + (R >= 0 ? '+' : '−') + nb(Math.abs(R), 1) + ' R' : '') + '</span></li>'; }).join('') + '</ul></section>';
}
/* Alertes récentes (3). */
export function htmlAlertes(etat) {
  const a = (etat.alertes || []).filter(x => x.type !== 'RAPPORT').slice(-3).reverse(); if (!a.length) return '';
  return '<section class="av3-alertes"><h3>Dernières alertes</h3><ul>' + a.map(x => '<li><b>' + esc(x.titre) + '</b> <small>' + esc(heureFr(x.t)) + (x.mode === 'SIMULATION' ? ' · SIMULATION' : '') + '</small></li>').join('') + '</ul></section>';
}
/* La page complète (sans le graphique, que la page DOM construit). */
export function htmlAccueil(etat, { ctx = {}, source = null, suivi = {}, maintenant = Date.now() } = {}) {
  return htmlPhrase(etat, ctx, source) + htmlControle(etat) + htmlChiffres(etat, maintenant) + '<section class="av3-graphique" data-av3-graphique><h3>Positions sur le graphique <small data-av3-gtitre></small></h3><div class="av3-graph-boite" data-av3-graph></div><div class="av3-courbes" data-av3-courbes></div></section>'
    + htmlRapport(etat, ctx, maintenant) + htmlStrategies(etat, suivi) + htmlAlertes(etat) + '<footer class="av3-pied">' + esc(AVERTISSEMENT) + '</footer>';
}
/* Écran quand aucun état n'est joignable (ni le PC, ni le Worker). */
export function htmlIndisponible(raison) {
  return '<section class="av3-phrase" data-statut="indisponible"><div class="av3-q">Que fait l’agent maintenant ?</div><div class="av3-rep"><i class="av3-pastille av3-p-eteint"></i><b>Je ne peux pas le savoir</b></div><p>' + esc(raison || 'L’état de l’agent est introuvable.') + '</p><p class="av3-aide">Pour le démarrer : <code>node agent-pc/installer-agent.mjs</code> (une étape à la fois), ou relie le Worker de Raylé dans ⚙ Réglages.</p></section><footer class="av3-pied">' + esc(AVERTISSEMENT) + '</footer>';
}
