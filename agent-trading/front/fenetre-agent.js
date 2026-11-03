/* ═════════════ POINT D'ENTRÉE UNIQUE DANS RAYLE ═════════════
   PC : une fenêtre (Panneaux) ouverte depuis le terminal de Mars. Téléphone / tablette : la vue plein écran ouverte depuis l'écran « Marchés ».
   Supprimer le dossier agent-trading/ suffit : les deux boutons font un import() qui échoue alors en silence et se cachent. */
import { monterVue } from './vue.js';

let instance = null;
export async function ouvrirFenetre() {
  if (instance) return instance;
  if (!window.Panneaux) return ouvrirPleinEcran();
  window.Panneaux.ouvrir({ id: 'agent-trading', type: 'agent-trading', titre: 'AGENT DE TRADING · SIMULATION', icone: '◈', taille: 'large', etat: 'simule',
    corps: el => { el.style.height = '100%'; el.style.minHeight = '560px'; const sec = el.closest('section') || el.parentNode; if (sec && sec.classList) sec.classList.add('at-fenetre'); instance = monterVue(el); return () => { instance && instance.detruire(); instance = null; }; } });
  return instance;
}

export function ouvrirPleinEcran() {
  if (instance) return instance;
  const fond = document.createElement('div');
  fond.className = 'at-plein';
  fond.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;background:#05080c;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  fond.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid rgba(143,208,227,.16);color:#d7e3ea;font:600 12px system-ui;letter-spacing:.08em">AGENT DE TRADING · SIMULATION<button type="button" aria-label="Fermer" style="min-width:44px;min-height:36px;background:none;border:1px solid rgba(143,208,227,.3);border-radius:4px;color:#d7e3ea;font-size:16px">✕</button></div><div style="flex:1;min-height:0"></div>';
  document.body.appendChild(fond);
  instance = monterVue(fond.lastElementChild, { mode: 'mobile' });
  fond.querySelector('button').onclick = () => { instance.detruire(); instance = null; fond.remove(); };
  return instance;
}
