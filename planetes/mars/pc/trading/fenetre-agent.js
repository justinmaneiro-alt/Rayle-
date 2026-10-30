import { creerPoste } from './poste-agent.js';
import { activerPilote, basculer } from './pilote-page.js';
import { obtenirHotePaire, activerPaire, surChangement, basculerPaire, hotesChargees } from './pilotes-paires.js';
import { synchroniserIdees } from './m6-page.js';
import { creerAccueilAgent, creerAgentLisible } from './agent-accueil.js';
import { creerPanneauxV4, VUES_V4, LIBELLES_V4 } from './panneaux-v4.js';

/* ═════════════ LA GRANDE FENÊTRE « AGENT » DANS MARS (M5, étendue à trois paires en M6) ═════════════
   Ouverte depuis la table (clic sur une fenêtre de l'agent), par la voix (« ouvre l'agent », « ouvre le gardien ») ou par l'ordre `mars/ouvrir_fenetre`. Une seule à la fois : la rouvrir change
   d'onglet (et de paire), elle ne se reconstruit pas. Même mécanisme que l'espace de travail du terminal (core/commun/panneaux.js). */
const ID = 'mars-poste-agent';
let poste = null, ouvertureEnCours = null, desabonner = null, surFermeture = () => {}, accueil = null, lisible = null, basculerVue = () => {}, panneauxV4 = null;

function chargerCss() {
  if (document.getElementById('mars-poste-css')) return;
  const l = document.createElement('link'); l.id = 'mars-poste-css'; l.rel = 'stylesheet'; l.href = new URL('./poste-agent.css', import.meta.url).href; document.head.appendChild(l);
  const al = document.createElement('link'); al.id = 'mars-agent-lisible-css'; al.rel = 'stylesheet'; al.href = new URL('../../../../core/commun/agent-lisible.css', import.meta.url).href; document.head.appendChild(al);
  const a3 = document.createElement('link'); a3.id = 'mars-agent-v3-css'; a3.rel = 'stylesheet'; a3.href = new URL('./agent-accueil.css', import.meta.url).href; document.head.appendChild(a3);
  const tv = document.createElement('link'); tv.id = 'mars-trader-vue-css'; tv.rel = 'stylesheet'; tv.href = new URL('../../../../core/commun/trader-vue.css', import.meta.url).href; document.head.appendChild(tv);
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
        // V13 : UNE vue principale lisible (« Agent » : barre d'état, quatre chiffres, graphique avec les positions, courbe, liste). Tout le reste est rangé derrière « Détails » : le rapport et les stratégies (l'ancien
        // écran Agent), le poste de pilotage complet, puis Positions du jour, Bilan, Pourquoi pas plus, Liquidité, Équipe, Occasions manquées, Données… Rien n'est supprimé.
        const SOUS = [['rapport', 'Rapport et stratégies'], ['details', 'Poste de pilotage']].concat(VUES_V4.map(k => [k, LIBELLES_V4[k]]));
        const barreVue = document.createElement('div'); barreVue.className = 'av3-vues'; barreVue.setAttribute('role', 'tablist');
        barreVue.innerHTML = '<div class="av3-prim"><button type="button" role="tab" data-av3-vue="agent">Agent</button><button type="button" role="tab" data-av3-details aria-expanded="false">Détails</button><span class="av3-vues-aide">Simulation, aucun ordre réel.</span></div>'
          + '<div class="av3-sous" data-av3-sous hidden>' + SOUS.map(([k, n]) => '<button type="button" role="tab" data-av3-vue="' + k + '">' + n + '</button>').join('') + '</div>';
        const paneAgent = document.createElement('div'); paneAgent.className = 'av3-pane av3-pane-agent'; const paneRapport = document.createElement('div'); paneRapport.className = 'av3-pane av3-pane-rapport'; const paneDetails = document.createElement('div'); paneDetails.className = 'av3-pane av3-pane-details';
        const paneV4 = document.createElement('div'); paneV4.className = 'av3-pane av3-pane-v4'; panneauxV4 = creerPanneauxV4({ conteneur: paneV4 });
        const wrap = document.createElement('div'); wrap.className = 'av3-wrap'; wrap.append(barreVue, paneAgent, paneRapport, paneDetails, paneV4); el.appendChild(wrap);
        const lireVue = () => { try { const v = localStorage.getItem('rayle_agent_vue'); return v && v !== 'agent' && SOUS.some(x => x[0] === v) ? v : 'agent'; } catch (e) { return 'agent'; } };
        let derniereSous = 'rapport';
        basculerVue = v => {
          if (v === 'agent' || !SOUS.some(x => x[0] === v)) v = 'agent'; else derniereSous = v;
          wrap.dataset.vue = v; try { localStorage.setItem('rayle_agent_vue', v); } catch (e) { /* interdit */ }
          barreVue.querySelectorAll('[data-av3-vue]').forEach(b => { b.classList.toggle('actif', b.dataset.av3Vue === v); b.setAttribute('aria-selected', String(b.dataset.av3Vue === v)); });
          const det = barreVue.querySelector('[data-av3-details]'); det.classList.toggle('actif', v !== 'agent'); det.setAttribute('aria-expanded', String(v !== 'agent')); barreVue.querySelector('[data-av3-sous]').hidden = v === 'agent';
          if (VUES_V4.includes(v)) panneauxV4.montrer(v); else if (panneauxV4) panneauxV4.cacher();
          if (v === 'agent' && lisible) lisible.rafraichir(); if (v === 'rapport' && accueil) accueil.rafraichir(); if (v === 'details' && poste) { try { poste.rafraichir(); } catch (x) { /* pas encore prêt */ } }
        };
        barreVue.addEventListener('click', ev => { if (ev.target.closest('[data-av3-details]')) { basculerVue(wrap.dataset.vue === 'agent' ? derniereSous : 'agent'); return; } const b = ev.target.closest('[data-av3-vue]'); if (b) basculerVue(b.dataset.av3Vue); });
        lisible = creerAgentLisible({ conteneur: paneAgent, surCouche: () => basculerVue('liquidite') });   // le bouton « Détails » est celui de la barre du haut
        accueil = creerAccueilAgent({ conteneur: paneRapport });
        basculerVue(demande.vue || (demande.onglet ? 'details' : (window.__RAYLE_POSTE_TEST__ ? 'details' : lireVue())));   // les anciens tests du poste (drapeau __RAYLE_POSTE_TEST__) arrivent sur « Détails » comme avant
        poste = creerPoste({ conteneur: paneDetails, hote, paire: ['BTC', 'SOL', 'DOGE'].includes(paire) ? paire : 'BTC', obtenirHotePaire: p => obtenirHotePaire(p, { demarrer: true }), activer: activerPilote, activerPaire, basculer: async actif => { const p = poste ? poste.paire() : 'BTC'; return p === 'BTC' ? basculer(actif) : basculerPaire(p, actif); }, onglet: demande.onglet || null });
        desabonner = surChangement(() => { if (poste) { poste.rafraichir(); synchroniserIdees(hotesChargees()).catch(() => {}); } });
        return () => { const p = poste; poste = null; if (accueil) { try { accueil.detruire(); } catch (x) { /* déjà détruit */ } accueil = null; } if (lisible) { try { lisible.detruire(); } catch (x) { /* déjà détruit */ } lisible = null; } if (desabonner) desabonner(); desabonner = null; document.body.classList.remove('mars-poste-ouvert'); try { p.detruire(); } catch (x) { /* déjà détruit */ } surFermeture(); };
      }
    });
  })();
  try { await ouvertureEnCours; } finally { ouvertureEnCours = null; }
  return poste;
}
window.PosteAgent = { ouvrir: (d) => ouvrirPoste(d || {}), vue: v => basculerVue(v), accueil: () => accueil, lisible: () => lisible, fermer: () => fermerPoste(), poste: () => poste, paire: () => (poste ? poste.paire() : paireMemorisee()) };   // tests et voix
export function fermerPoste() { if (!poste && !document.querySelector('.pn[data-id="' + ID + '"]')) return false; if (window.Panneaux) window.Panneaux.fermer(ID); return true; }
