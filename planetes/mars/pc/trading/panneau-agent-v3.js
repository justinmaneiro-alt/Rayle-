import { creerAccueilAgent } from './agent-accueil.js';
import { creerPanneauAgent } from './panneau-agent.js';

/* ═════════════ « AGENT BTC » DU TERMINAL DE MARS (V3b) ═════════════
   Onglet « Agent » (par défaut) : la page simple de l'agent Kepler, lue sur le service du PC (sinon sur le Worker) : phrase d'état, trois chiffres, version active, graphique avec les positions,
   dernier rapport en cinq lignes, Pause / Reprendre (pas de bouton « Lancer » : l'agent tourne tout seul). Onglet « Détails » : l'ancienne page, intacte (marché, microstructure, stratégies, risque,
   journal) — elle n'est construite qu'au premier clic pour ne rien télécharger inutilement. Sert l'espace de travail (onglet du bas) et les fenêtres de la table de Mars. */
function chargerCss() {
  if (document.getElementById('mars-agent-v3-css')) return;
  const l = document.createElement('link'); l.id = 'mars-agent-v3-css'; l.rel = 'stylesheet'; l.href = new URL('./agent-accueil.css', import.meta.url).href; document.head.appendChild(l);
}
export function creerPanneauAgentV3(c = {}) {
  chargerCss();
  const racine = document.createElement('div'); racine.className = 'tg-agent tg-agent-v3';
  const wrap = document.createElement('div'); wrap.className = 'av3-wrap'; wrap.dataset.vue = 'agent';
  const barre = document.createElement('div'); barre.className = 'av3-vues'; barre.setAttribute('role', 'tablist');
  barre.innerHTML = '<button type="button" role="tab" data-av3-vue="agent" class="actif">Agent</button><button type="button" role="tab" data-av3-vue="details">Détails</button><span class="av3-vues-aide">Un seul agent, toujours le même, qui cherche tout seul. Le détail est dans « Détails ».</span>';
  const paneAgent = document.createElement('div'); paneAgent.className = 'av3-pane av3-pane-agent'; const paneDetails = document.createElement('div'); paneDetails.className = 'av3-pane av3-pane-details';
  wrap.append(barre, paneAgent, paneDetails); racine.appendChild(wrap);
  const accueil = creerAccueilAgent({ conteneur: paneAgent }); let details = null, detruit = false;
  const montrer = v => {
    wrap.dataset.vue = v; barre.querySelectorAll('[data-av3-vue]').forEach(b => { const on = b.dataset.av3Vue === v; b.classList.toggle('actif', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (v === 'details' && !details && !detruit) { details = creerPanneauAgent(c); paneDetails.appendChild(details.racine); }
    try { localStorage.setItem('rayle_agent_vue', v); } catch (e) { /* stockage interdit */ }
  };
  barre.addEventListener('click', e => { const b = e.target.closest('[data-av3-vue]'); if (b) montrer(b.dataset.av3Vue); });
  montrer('agent');
  return { racine, maj() { if (details && details.maj) details.maj(); }, montrer, accueil, detruire() { detruit = true; try { accueil.detruire(); } catch (e) { /* déjà détruit */ } if (details) { try { details.detruire(); } catch (e) { /* déjà détruit */ } } } };
}
