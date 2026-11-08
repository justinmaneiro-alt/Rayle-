/* ═════════════ VUE « TERMINAL » DE RAYLE (core/commun/vues.js : ouvrir / fermer / commande) ═════════════
   Monte le terminal de trading dans #vueTerminal, par-dessus l'ancien terminal 2D (gardé, masqué ; retour possible : localStorage
   « rayle_terminal_ancien » = « 1 »). Fermer la vue démonte le terminal (flux, minuteries) ; les bougies restent dans le cache local. */
import { monterTerminal } from './terminal.js';

let T = null, hote = null;
export async function ouvrir() {
  const vue = document.getElementById('vueTerminal'); if (!vue) throw new Error('#vueTerminal absent');
  vue.classList.add('tr-vue');
  if (!document.getElementById('tr-vue-css')) { const s = document.createElement('style'); s.id = 'tr-vue-css'; s.textContent = '#vueTerminal.tr-vue>:not(.tr-hote){display:none!important}#vueTerminal.tr-vue{position:fixed;inset:0;z-index:50;background:#05080c}#vueTerminal.tr-vue>.tr-hote{position:absolute;inset:0}'; document.head.appendChild(s); }
  if (!hote) { hote = document.createElement('div'); hote.className = 'tr-hote'; vue.appendChild(hote); }
  if (!T) T = monterTerminal(hote, { contexte: 'vue' });
  try { if (window.RayleBus) RayleBus.fusion('terminal', { ouvert: true, version: 'terminal-rayle' }); } catch (e) { /* */ }
  return T;
}
export function fermer() { if (T) { T.detruire(); T = null; } }
export function commande(texte) { return T && T.module('rayle') ? T.module('rayle').commande(texte) : false; }
export const instance = () => T;
