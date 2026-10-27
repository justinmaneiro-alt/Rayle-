import { creerPoste } from './poste-agent.js';
import { activerPilote, basculer } from './pilote-page.js';
import { obtenirHotePaire, activerPaire, surChangement, basculerPaire, hotesChargees } from './pilotes-paires.js';
import { synchroniserIdees } from './m6-page.js';

/* ═════════════ LA GRANDE FENÊTRE « AGENT » DANS MARS (M5, étendue à trois paires en M6) ═════════════
   Ouverte depuis la table (clic sur une fenêtre de l'agent), par la voix (« ouvre l'agent », « ouvre le gardien ») ou par l'ordre `mars/ouvrir_fenetre`. Une seule à la fois : la rouvrir change
   d'onglet (et de paire), elle ne se reconstruit pas. Même mécanisme que l'espace de travail du terminal (core/commun/panneaux.js). */
const ID = 'mars-poste-agent';
let poste = null, ouvertureEnCours = null, desabonner = null, surFermeture = () => {};

function chargerCss() {
  if (document.getElementById('mars-poste-css')) return;
  const l = document.createElement('link'); l.id = 'mars-poste-css'; l.rel = 'stylesheet'; l.href = new URL('./poste-agent.css', import.meta.url).href; document.head.appendChild(l);
  const v = document.createElement('link'); v.id = 'mars-poste-css-v1'; v.rel = 'stylesheet'; v.href = new URL('./v1-agent.css', import.meta.url).href; document.head.appendChild(v);
}
export const posteOuvert = () => poste;
export const surPosteFerme = f => { surFermeture = f; };
const paireMemorisee = () => { try { return localStorage.getItem('rayle_poste_paire') || 'BTC'; } catch (e) { return 'BTC'; } };

export async function ouvrirPoste(demande = {}) {
  if (poste) { if (demande.paire && poste.choisirPaire) await poste.choisirPaire(demande.paire); if (demande.onglet) await poste.ouvrirOnglet(demande.onglet); return poste; }
  if (ouvertureEnCours) { await ouvertureEnCours; if (poste) { if (demande.paire && poste.choisirPaire) await poste.choisirPaire(demande.paire); if (demande.onglet) await poste.ouvrirOnglet(demande.onglet); } return poste; }
  chargerCss();
  ouvertureEnCours = (async () => {
    const paire = String(demande.paire || paireMemorisee()).toUpperCase(), hote = await obtenirHotePaire(['BTC', 'SOL', 'DOGE'].includes(paire) ? paire : 'BTC', { demarrer: true });
    if (!window.Panneaux) throw new Error('panneaux indisponibles');
    window.Panneaux.ouvrir({
      id: ID, type: 'mars-agent', titre: 'AGENT · POSTE DE PILOTAGE', icone: '🛰', taille: 'large',
      corps: el => {
        const section = el.parentNode; if (section && section.classList) section.classList.add('mars-poste'); document.body.classList.add('mars-poste-ouvert');
        poste = creerPoste({ conteneur: el, hote, paire: ['BTC', 'SOL', 'DOGE'].includes(paire) ? paire : 'BTC', obtenirHotePaire: p => obtenirHotePaire(p, { demarrer: true }), activer: activerPilote, activerPaire, basculer: async actif => { const p = poste ? poste.paire() : 'BTC'; return p === 'BTC' ? basculer(actif) : basculerPaire(p, actif); }, onglet: demande.onglet || null });
        desabonner = surChangement(() => { if (poste) { poste.rafraichir(); synchroniserIdees(hotesChargees()).catch(() => {}); } });
        return () => { const p = poste; poste = null; if (desabonner) desabonner(); desabonner = null; document.body.classList.remove('mars-poste-ouvert'); try { p.detruire(); } catch (x) { /* déjà détruit */ } surFermeture(); };
      }
    });
  })();
  try { await ouvertureEnCours; } finally { ouvertureEnCours = null; }
  return poste;
}
window.PosteAgent = { ouvrir: (d) => ouvrirPoste(d || {}), fermer: () => fermerPoste(), poste: () => poste, paire: () => (poste ? poste.paire() : paireMemorisee()) };   // tests et voix
export function fermerPoste() { if (!poste && !document.querySelector('.pn[data-id="' + ID + '"]')) return false; if (window.Panneaux) window.Panneaux.fermer(ID); return true; }
