/* ═════════════ POINTS D'ENTRÉE DANS RAYLE ═════════════
   PC : UNE fenêtre unique (accueil « + Agent » et menu Espaces, dossier du salon de Mars, bouton du Terminal) : grande, déplaçable, redimensionnable,
   plein écran possible, au-dessus de la 3D ; Échap ou un clic à côté la ferme (Échap quitte d'abord le plein écran du graphique). Même composant et mêmes données que le téléphone : une seule page qui défile.
   Téléphone / tablette : la même vue en plein écran, ouverte depuis l'écran « Marchés ».
   Supprimer le dossier agent-trading/ suffit : les entrées font un import() qui échoue alors en silence et se retirent. */
import { monterVue } from './vue.js';
import { monterTableauOr } from './or/tableau-or.js';
import { monterModules } from './or/page-or.js';
import { ouvrirCadre } from './fenetre-cadre.js';
/* Par défaut : le TABLEAU DE BORD DE L'OR (même composant que la page or.html). L'ancienne vue de l'agent reste disponible : localStorage « rayle_at_ancienne_vue » = « 1 ». */
const ancienneVue = () => { try { return localStorage.getItem('rayle_at_ancienne_vue') === '1'; } catch (e) { return false; } };
function monter(el) {
  if (ancienneVue()) return monterVue(el, { mode: 'auto' });
  const T = monterTableauOr(el, { contexte: 'fenetre' }); window.TableauOr = T; monterModules(T); return T;
}

let instance = null, fenetre = null;
export const estOuvert = () => !!fenetre;
export function fermer() { if (fenetre) { fenetre.fermer(); return true; } return false; }


export function ouvrirFenetre() {
  if (fenetre) { fenetre.boite.focus(); return instance; }
  fenetre = ouvrirCadre({ titre: '◈ OR · TABLEAU DE BORD · SIMULATION', ariaLabel: 'Agent de trading', modal: true, defile: false, monter });
  instance = fenetre.instance;
  fenetre.surFermer = () => { instance = null; fenetre = null; };
  return instance;
}

export function ouvrirPleinEcran() {
  if (instance) return instance;
  const fond = document.createElement('div');
  fond.className = 'at-plein';
  fond.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;background:#05080c;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  fond.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid rgba(143,208,227,.16);color:#d7e3ea;font:600 12px system-ui;letter-spacing:.08em">AGENT DE TRADING · SIMULATION<button type="button" aria-label="Fermer" style="min-width:44px;min-height:36px;background:none;border:1px solid rgba(143,208,227,.3);border-radius:4px;color:#d7e3ea;font-size:16px">✕</button></div><div style="flex:1;min-height:0"></div>';
  document.body.appendChild(fond);
  instance = monter(fond.lastElementChild);
  fond.querySelector('button').onclick = () => { instance.detruire(); instance = null; fond.remove(); };
  return instance;
}
