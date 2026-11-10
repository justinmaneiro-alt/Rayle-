/* ═════════════ VUE « TERMINAL » DE RAYLE (core/commun/vues.js : ouvrir / fermer / commande) ═════════════
   Monte le terminal de trading dans #vueTerminal, par-dessus l'ancien terminal 2D (gardé, masqué ; retour possible : localStorage
   « rayle_terminal_ancien » = « 1 »). Fermer la vue démonte le terminal (flux, minuteries) ; les bougies restent dans le cache local. */
import { monterTerminal } from './terminal.js';

/* 2026-11-10 : l'écran « Terminal » de Rayle ouvre le terminal à jour (agent-trading/front/or.html, dans un cadre plein écran). L'ancien terminal reste accessible : bouton « Ancien terminal » d'or.html, ou localStorage « rayle_terminal_ancien_v2 » = « 1 ». */
const ancienV2 = () => { try { return localStorage.getItem('rayle_terminal_ancien_v2') === '1'; } catch (e) { return false; } };
function monterOr(h) {
  const f = document.createElement('iframe'); f.className = 'tr-or'; f.title = 'Terminal de l’or'; f.allow = 'clipboard-read; clipboard-write; autoplay; microphone'; f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#05080c';
  f.src = new URL('../or.html?vue=1', import.meta.url).href; h.appendChild(f);
  const proxy = { commande: t => { try { const T = f.contentWindow.TableauOr; return T && T.commande ? T.commande(t) : null; } catch (e) { return null; } } }; window.TableauOr = proxy;   // la voix de Rayle (phrase.js) interroge window.TableauOr : on le relaie vers la page de l'or
  return { iframe: f, detruire() { if (window.TableauOr === proxy) delete window.TableauOr; f.remove(); }, module(n) { return n === 'rayle' ? { commande: t => { try { const T = f.contentWindow.TableauOr; return !!(T && T.commande && T.commande(t)); } catch (e) { return false; } } } : null; } };
}

let T = null, hote = null;
export async function ouvrir() {
  const vue = document.getElementById('vueTerminal'); if (!vue) throw new Error('#vueTerminal absent');
  vue.classList.add('tr-vue');
  if (!document.getElementById('tr-vue-css')) { const s = document.createElement('style'); s.id = 'tr-vue-css'; s.textContent = '#vueTerminal.tr-vue>:not(.tr-hote){display:none!important}#vueTerminal.tr-vue{position:fixed;inset:0;z-index:50;background:#05080c}#vueTerminal.tr-vue>.tr-hote{position:absolute;inset:0}'; document.head.appendChild(s); }
  if (!hote) { hote = document.createElement('div'); hote.className = 'tr-hote'; vue.appendChild(hote); }
  if (!T) T = ancienV2() ? monterTerminal(hote, { contexte: 'vue' }) : monterOr(hote);
  try { if (window.RayleBus) RayleBus.fusion('terminal', { ouvert: true, version: 'terminal-rayle' }); } catch (e) { /* */ }
  return T;
}
export function fermer() { if (T) { T.detruire(); T = null; } }
export function commande(texte) { return T && T.module('rayle') ? T.module('rayle').commande(texte) : false; }
export const instance = () => T;
