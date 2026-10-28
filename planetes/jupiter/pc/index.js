/* ═════════════ JUPITER : LE VAISSEAU DE CODE (structure vide, V3 phase 5) ═════════════
   Jupiter est la base des agents de code, au service de toutes les planètes (voir VISION.md) ; son satellite « Arcadia » est le vaisseau du capitaine. Rien n'est encore construit : ce module est la STRUCTURE
   prête à recevoir plus tard le thème, le vaisseau et les agents. En attendant, il dit la vérité (une fenêtre « pas encore construit »), ne simule aucun agent et ne produit aucun faux code.
   Quand on construira Jupiter : remplacer `entrer` par la vraie scène (comme planetes/neptune/pc/index.js : G.surcharger, G.nav.deleguer, fondu), garder `sortir`, brancher les agents côté Worker
   (/planete/jupiter/interprete, déclaré dans le manifeste) et remplacer les ordres de ordres-jupiter.js. Le même point d'entrée sert la tablette et le téléphone (terminal-2d/index.js). */
export const ETAT = 'structure-vide';
let ouvert = false;
const ID_PANNEAU = 'jupiter-attente';

const html = () => `<div class="jup-attente"><b>Jupiter n’est pas encore construit.</b>
  <p>Ici vivront le vaisseau du capitaine (l’Arcadia) et les agents de code de Raylé, au service de toutes les planètes : écrire un site, un script, un gadget, une extension.</p>
  <ul><li>Les agents de code : <b>pas encore créés</b>.</li><li>Les ordres « coder » et « montrer le résultat » : <b>déclarés, pas encore actifs</b>.</li><li>Le vaisseau en 3D : <b>à venir</b>.</li></ul>
  <p>Rien d’ici ne produit de code pour le moment : si tu me demandes d’écrire du code, je te le dirai franchement.</p></div>`;

export function entrer(G, options = {}) {
  ouvert = true;
  try {
    if (window.Panneaux && window.Panneaux.ouvrir) window.Panneaux.ouvrir({ id: ID_PANNEAU, type: 'holo-jupiter', titre: 'Jupiter · vaisseau de code', icone: '◈', etat: 'bientot', duree: 0, corps: { html: html() } });
  } catch (e) { /* fenêtres indisponibles : la galaxie reste utilisable */ }
  window.Jupiter = api; window.dispatchEvent(new CustomEvent('jupiter:entree', { detail: { etat: ETAT } }));
  return Promise.resolve();
}
export function sortir() {
  if (!ouvert) return Promise.resolve(); ouvert = false;
  try { if (window.Panneaux && window.Panneaux.fermer) window.Panneaux.fermer(ID_PANNEAU); } catch (e) { /* déjà fermée */ }
  window.dispatchEvent(new CustomEvent('jupiter:sortie', {})); return Promise.resolve();
}
const api = { etat: () => ({ actif: ouvert, mode: ETAT, agents: 0 }), entrer, sortir, texteAttente: () => html().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
window.addEventListener('galaxie:sortie', () => { if (ouvert) sortir(); });
