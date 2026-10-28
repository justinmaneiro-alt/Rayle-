import { creerPoste } from './poste-agent.js';
import { activerPilote, basculer } from './pilote-page.js';
import { obtenirHotePaire, activerPaire, surChangement, basculerPaire, hotesChargees } from './pilotes-paires.js';
import { synchroniserIdees } from './m6-page.js';
import { creerAccueilAgent } from './agent-accueil.js';
import { creerPanneauxV4, VUES_V4, LIBELLES_V4 } from './panneaux-v4.js';

/* ═════════════ LA GRANDE FENÊTRE « AGENT » DANS MARS (M5, étendue à trois paires en M6) ═════════════
   Ouverte depuis la table (clic sur une fenêtre de l'agent), par la voix (« ouvre l'agent », « ouvre le gardien ») ou par l'ordre `mars/ouvrir_fenetre`. Une seule à la fois : la rouvrir change
   d'onglet (et de paire), elle ne se reconstruit pas. Même mécanisme que l'espace de travail du terminal (core/commun/panneaux.js). */
const ID = 'mars-poste-agent';
let poste = null, ouvertureEnCours = null, desabonner = null, surFermeture = () => {}, accueil = null, basculerVue = () => {}, panneauxV4 = null;

function chargerCss() {
  if (document.getElementById('mars-poste-css')) return;
  const l = document.createElement('link'); l.id = 'mars-poste-css'; l.rel = 'stylesheet'; l.href = new URL('./poste-agent.css', import.meta.url).href; document.head.appendChild(l);
  const a3 = document.createElement('link'); a3.id = 'mars-agent-v3-css'; a3.rel = 'stylesheet'; a3.href = new URL('./agent-accueil.css', import.meta.url).href; document.head.appendChild(a3);
  const v = document.createElement('link'); v.id = 'mars-poste-css-v1'; v.rel = 'stylesheet'; v.href = new URL('./v1-agent.css', import.meta.url).href; document.head.appendChild(v);
}
export const posteOuvert = () => poste;
export const surPosteFerme = f => { surFermeture = f; };
const paireMemorisee = () => { try { return localStorage.getItem('rayle_poste_paire') || 'BTC'; } catch (e) { return 'BTC'; } };

export async function ouvrirPoste(demande = {}) {
  if (poste) { if (demande.vue) basculerVue(demande.vue); if (demande.paire && poste.choisirPaire) await poste.choisirPaire(demande.paire); if (demande.onglet) { basculerVue("details"); await poste.ouvrirOnglet(demande.onglet); } return poste; }
  if (ouvertureEnCours) { await ouvertureEnCours; if (poste) { if (demande.paire && poste.choisirPaire) await poste.choisirPaire(demande.paire); if (demande.onglet) { basculerVue("details"); await poste.ouvrirOnglet(demande.onglet); } } return poste; }
  chargerCss();
  ouvertureEnCours = (async () => {
    const paire = String(demande.paire || paireMemorisee()).toUpperCase(), hote = await obtenirHotePaire(['BTC', 'SOL', 'DOGE'].includes(paire) ? paire : 'BTC', { demarrer: true });
    if (!window.Panneaux) throw new Error('panneaux indisponibles');
    window.Panneaux.ouvrir({
      id: ID, type: 'mars-agent', titre: 'AGENT · POSTE DE PILOTAGE', icone: '🛰', taille: 'large',
      corps: el => {
        const section = el.parentNode; if (section && section.classList) section.classList.add('mars-poste'); document.body.classList.add('mars-poste-ouvert');
        // V3 : deux vues. « Agent » = l'écran simple (une phrase, trois chiffres, le graphique avec les positions, le rapport) ; « Détails » = le poste de pilotage d'avant, intact (marché, microstructure,
        // stratégies, risque et compte, journal, systèmes). Rien n'est supprimé.
        const barreVue = document.createElement('div'); barreVue.className = 'av3-vues'; barreVue.setAttribute('role', 'tablist');
        barreVue.innerHTML = '<button type="button" role="tab" data-av3-vue="agent">Agent</button><button type="button" role="tab" data-av3-vue="details">Détails</button>' + VUES_V4.map(k => '<button type="button" role="tab" data-av3-vue="' + k + '">' + LIBELLES_V4[k] + '</button>').join('') + '<span class="av3-vues-aide">Un seul agent, toujours le même, qui tourne tout seul.</span>';
        const paneAgent = document.createElement('div'); paneAgent.className = 'av3-pane av3-pane-agent'; const paneDetails = document.createElement('div'); paneDetails.className = 'av3-pane av3-pane-details';
        const paneV4 = document.createElement('div'); paneV4.className = 'av3-pane av3-pane-v4'; panneauxV4 = creerPanneauxV4({ conteneur: paneV4 });
        const wrap = document.createElement('div'); wrap.className = 'av3-wrap'; wrap.append(barreVue, paneAgent, paneDetails, paneV4); el.appendChild(wrap);
        const lireVue = () => { try { return localStorage.getItem('rayle_agent_vue') === 'details' ? 'details' : 'agent'; } catch (e) { return 'agent'; } };
        basculerVue = v => { wrap.dataset.vue = v; try { localStorage.setItem('rayle_agent_vue', v); } catch (e) { /* interdit */ } barreVue.querySelectorAll('[data-av3-vue]').forEach(b => { b.classList.toggle('actif', b.dataset.av3Vue === v); b.setAttribute('aria-selected', String(b.dataset.av3Vue === v)); }); if (VUES_V4.includes(v)) panneauxV4.montrer(v); else if (panneauxV4) panneauxV4.cacher(); if (v === 'agent' && accueil) accueil.rafraichir(); if (v === 'details' && poste) { try { poste.rafraichir(); } catch (x) { /* pas encore prêt */ } } };
        barreVue.addEventListener('click', ev => { const b = ev.target.closest('[data-av3-vue]'); if (b) basculerVue(b.dataset.av3Vue); });
        accueil = creerAccueilAgent({ conteneur: paneAgent });
        basculerVue(demande.vue || (demande.onglet ? 'details' : (window.__RAYLE_POSTE_TEST__ ? 'details' : lireVue())));   // les anciens tests du poste (drapeau __RAYLE_POSTE_TEST__) arrivent sur « Détails » comme avant
        poste = creerPoste({ conteneur: paneDetails, hote, paire: ['BTC', 'SOL', 'DOGE'].includes(paire) ? paire : 'BTC', obtenirHotePaire: p => obtenirHotePaire(p, { demarrer: true }), activer: activerPilote, activerPaire, basculer: async actif => { const p = poste ? poste.paire() : 'BTC'; return p === 'BTC' ? basculer(actif) : basculerPaire(p, actif); }, onglet: demande.onglet || null });
        desabonner = surChangement(() => { if (poste) { poste.rafraichir(); synchroniserIdees(hotesChargees()).catch(() => {}); } });
        return () => { const p = poste; poste = null; if (accueil) { try { accueil.detruire(); } catch (x) { /* déjà détruit */ } accueil = null; } if (desabonner) desabonner(); desabonner = null; document.body.classList.remove('mars-poste-ouvert'); try { p.detruire(); } catch (x) { /* déjà détruit */ } surFermeture(); };
      }
    });
  })();
  try { await ouvertureEnCours; } finally { ouvertureEnCours = null; }
  return poste;
}
window.PosteAgent = { ouvrir: (d) => ouvrirPoste(d || {}), vue: v => basculerVue(v), accueil: () => accueil, fermer: () => fermerPoste(), poste: () => poste, paire: () => (poste ? poste.paire() : paireMemorisee()) };   // tests et voix
export function fermerPoste() { if (!poste && !document.querySelector('.pn[data-id="' + ID + '"]')) return false; if (window.Panneaux) window.Panneaux.fermer(ID); return true; }
