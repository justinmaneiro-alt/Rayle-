import { detecterVoixV2 } from '../agents-v2/voix-agents-v2.js';
import { lireMarcheV2, lectureBougies, agreger } from '../agents-v2/lecture-marche-v2.js';
import { versBougies } from '../agent-btc/colonnes.js';

/* Côté page : « ouvre les agents prêts », « lis le marché », « à quoi sert le gardien prop ? » (appelée par commandeMars, galaxie/commandes.js). Rend le texte à dire, ou null. Sans IA.
   Les outils s'expliquent partout ; les agents prêts et la lecture du marché seulement quand Mars est ouverte (ou « sur Mars »), comme les autres commandes du terminal. */
export async function traiterAgentsV2(n0, { actif = false, explicite = false } = {}) {
  const d = detecterVoixV2(n0); if (!d) return null;
  if (d.type === 'outil') return d.texte;
  if (!actif && !explicite) return null;
  if (d.type === 'agents') {
    if (!window.Mars || !window.Mars.etat().actif || window.Mars.etat().mode !== 'interieur') { if (window.RayleOrdres) { const r = await window.RayleOrdres.envoyer({ de: 'rayle', vers: 'mars', action: 'entrer_base', params: {} }); if (r && r.ok === false) return 'Je n’ai pas pu entrer dans la base : ' + (r.erreur || 'erreur') + '.'; } }
    if (!window.Mars || !window.Mars.ouvrirPanneauTerminal) return 'Le terminal de Mars n’est pas prêt.';
    await window.Mars.ouvrirPanneauTerminal('agents-prets');
    return 'Voici les agents prêts : Tendance et Divergence RSI. Choisis une idée, règle les paramètres, lance le backtest, puis la validation hors échantillon. Aucun ordre n’est jamais passé, et un agent non validé ne propose aucune position.';
  }
  if (d.type === 'lecture') {
    try {
      const P = await import('./pilotes-paires.js'), paire = d.paire || (window.PosteAgent && window.PosteAgent.paire && window.PosteAgent.paire()) || 'BTC';
      const hote = await P.obtenirHotePaire(paire, { demarrer: true }), s = hote.serie();
      if (!s || !s.n) return 'Je n’ai pas d’historique pour ' + paire + '. Active les données de la paire dans le poste de l’agent, ou colle une capture du graphique : l’IA lira les chiffres sur ta demande.';
      const m15 = versBougies(s, Math.max(0, s.n - 4000), s.n), b = agreger(m15, d.unite).slice(-400);
      if (d.parBougie) { const r = lectureBougies(b, d.n, { unite: d.unite, actif: paire }); return r.ok ? 'Les ' + d.n + ' dernières bougies ' + d.unite + ' de ' + paire + ' : ' + r.lignes.join(' ') : r.raison; }
      const r = lireMarcheV2(b, { unite: d.unite, actif: paire, maintenant: Date.now() });
      return r.ok ? r.phrases.join(' ') : r.raison + (r.manque === 'bougies' ? ' Colle une capture du graphique dans le poste de l’agent (onglet « Capture d’écran ») : l’IA lira les chiffres sur ta demande.' : '');
    } catch (e) { return 'Je n’ai pas pu lire le marché : ' + String(e && e.message || e) + '.'; }
  }
  return null;
}
