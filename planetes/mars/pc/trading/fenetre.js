import { creerEspace } from './espace.js';
import { obtenirClient } from './session.js';
import { INSTRUMENTS, UNITES, libelleDemande } from './instruments.js';

/* ═════════════ L'ESPACE DE TRAVAIL DANS UNE GRANDE FENÊTRE (core/commun/panneaux.js) ═════════════
   Un seul espace à la fois. Rouvrir une autre fenêtre de la table (ou une commande vocale) ne le reconstruit pas : il change simplement d'instrument, d'unité ou de panneau. */
const ID = 'mars-espace';
let espace = null, ouvertureEnCours = null, surFermeture = () => {};

function chargerCss() {
  if (document.getElementById('mars-trading-css')) return;
  const l = document.createElement('link'); l.id = 'mars-trading-css'; l.rel = 'stylesheet'; l.href = new URL('./espace.css', import.meta.url).href; document.head.appendChild(l);
  const v = document.createElement('link'); v.id = 'mars-trading-css-v1'; v.rel = 'stylesheet'; v.href = new URL('./v1-agent.css', import.meta.url).href; document.head.appendChild(v);
}
export const espaceOuvert = () => espace;
export const surEspaceFerme = f => { surFermeture = f; };

export async function ouvrirEspace(demande = {}, { tactile = false } = {}) {
  if (espace) { espace.appliquer(demande); return espace; }
  if (ouvertureEnCours) { await ouvertureEnCours; if (espace) espace.appliquer(demande); return espace; }
  chargerCss();
  ouvertureEnCours = (async () => {
    const client = await obtenirClient();
    if (!window.Panneaux) throw new Error('panneaux indisponibles');
    window.Panneaux.ouvrir({
      id: ID, type: 'mars-terminal', titre: 'TERMINAL MARS · ' + (demande.instrument ? INSTRUMENTS[demande.instrument].court : 'marchés'), icone: '📈', taille: 'large',
      corps: el => {
        const section = el.parentNode; if (section && section.classList) section.classList.add('mars-espace'); document.body.classList.add('mars-espace-ouvert');
        espace = creerEspace({ conteneur: el, client, tactile, depart: { instrument: demande.instrument, unite: demande.unite, dock: demande.dock, source: demande.source }, surChangement: e => { const t = document.querySelector('.pn[data-id="' + ID + '"] .pn-tete h2'); if (t) t.textContent = 'TERMINAL MARS · ' + INSTRUMENTS[e.instrument].court + ' · ' + UNITES[e.unite].nom; } });
        return () => { const e = espace; espace = null; document.body.classList.remove('mars-espace-ouvert'); try { e.detruire(); } catch (x) { /* déjà détruit */ } surFermeture(); };
      }
    });
    espace.appliquer({ focus: demande.focus });
  })();
  try { await ouvertureEnCours; } finally { ouvertureEnCours = null; }
  return espace;
}
export function fermerEspace() { if (!espace && !document.querySelector('.pn[data-id="' + ID + '"]')) return false; if (window.Panneaux) window.Panneaux.fermer(ID); return true; }

/* « montre-moi l'or en H1 » : change d'instrument et/ou d'unité ; ouvre l'espace si besoin. Rend la phrase de confirmation. */
export async function afficher({ instrument, unite, source }, opts = {}) {
  if (!instrument && !unite && !source) return null;
  if (!espace) await ouvrirEspace({ instrument, unite, source }, opts); else espace.appliquer({ instrument, unite, source });
  return libelleDemande(instrument, unite) || (source === 'tv' ? 'le graphique TradingView' : 'le graphique Raylé');
}
