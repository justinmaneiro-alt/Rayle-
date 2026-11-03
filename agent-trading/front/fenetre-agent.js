/* ═════════════ POINTS D'ENTRÉE DANS RAYLE ═════════════
   PC : UNE fenêtre unique (accueil « + Agent » et menu Espaces, dossier du salon de Mars, bouton du Terminal) : grande, déplaçable, redimensionnable,
   plein écran possible, au-dessus de la 3D ; Échap ou un clic à côté la ferme. Même composant et mêmes données que le téléphone (onglets).
   Téléphone / tablette : la même vue en plein écran, ouverte depuis l'écran « Marchés ».
   Supprimer le dossier agent-trading/ suffit : les entrées font un import() qui échoue alors en silence et se retirent. */
import { monterVue } from './vue.js';

let instance = null, fenetre = null;
const CSS_PC = `
.at-pc-fond{position:fixed;inset:0;z-index:2147481000;background:rgba(2,4,8,.38);backdrop-filter:blur(2px)}
.at-pc{position:fixed;display:flex;flex-direction:column;min-width:640px;min-height:420px;background:#05080c;border:1px solid rgba(143,208,227,.34);border-radius:6px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}
.at-pc.at-pc-max{left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0}
.at-pc-barre{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px 6px 12px;border-bottom:1px solid rgba(143,208,227,.16);color:#d7e3ea;font:600 12px system-ui,sans-serif;letter-spacing:.08em;cursor:move;user-select:none;touch-action:none}
.at-pc-barre button{min-width:34px;min-height:28px;margin-left:4px;background:rgba(18,26,36,.9);border:1px solid rgba(143,208,227,.25);border-radius:4px;color:#d7e3ea;font:14px system-ui;cursor:pointer}
.at-pc-barre button:hover{border-color:rgba(143,208,227,.6)}
.at-pc-corps{flex:1;min-height:0}
.at-pc-poignee{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,rgba(143,208,227,.5) 50%,rgba(143,208,227,.5) 58%,transparent 58%,transparent 70%,rgba(143,208,227,.5) 70%,rgba(143,208,227,.5) 78%,transparent 78%)}
.at-pc-max .at-pc-poignee{display:none}`;

export const estOuvert = () => !!fenetre;
export function fermer() { if (fenetre) { fenetre.fermer(); return true; } return false; }

export function ouvrirFenetre() {
  if (fenetre) { fenetre.boite.focus(); return instance; }
  if (!document.getElementById('at-pc-css')) { const s = document.createElement('style'); s.id = 'at-pc-css'; s.textContent = CSS_PC; document.head.appendChild(s); }
  const fond = document.createElement('div'); fond.className = 'at-pc-fond';
  fond.innerHTML = '<section class="at-pc" role="dialog" aria-modal="true" aria-label="Agent de trading" tabindex="-1"><header class="at-pc-barre"><span>◈ AGENT DE TRADING · SIMULATION</span><span><button type="button" data-a="plein" title="Plein écran" aria-label="Plein écran">⛶</button><button type="button" data-a="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button></span></header><div class="at-pc-corps"></div><i class="at-pc-poignee" title="Redimensionner"></i></section>';
  document.body.appendChild(fond);
  const boite = fond.firstElementChild, barre = boite.querySelector('.at-pc-barre');
  // taille de départ : grande (jusqu'à 1500 × 900), centrée
  const l = Math.min(1500, Math.round(innerWidth * 0.94)), h = Math.min(900, Math.round(innerHeight * 0.9));
  Object.assign(boite.style, { width: l + 'px', height: h + 'px', left: Math.round((innerWidth - l) / 2) + 'px', top: Math.round((innerHeight - h) / 2) + 'px' });
  instance = monterVue(boite.querySelector('.at-pc-corps'), { mode: 'mobile' });   // même composant que le téléphone : onglets Graphique | Carnet | Positions | Portefeuille

  // déplacer (barre de titre) et redimensionner (coin)
  const glisser = (el, f) => el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button') || boite.classList.contains('at-pc-max')) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const r = boite.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    const bouge = m => f(r, m.clientX - x0, m.clientY - y0), fin = () => { el.removeEventListener('pointermove', bouge); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin); };
    el.addEventListener('pointermove', bouge); el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
  });
  glisser(barre, (r, dx, dy) => { boite.style.left = Math.max(-r.width + 120, Math.min(innerWidth - 120, r.left + dx)) + 'px'; boite.style.top = Math.max(0, Math.min(innerHeight - 40, r.top + dy)) + 'px'; });
  glisser(boite.querySelector('.at-pc-poignee'), (r, dx, dy) => { boite.style.width = Math.max(640, r.width + dx) + 'px'; boite.style.height = Math.max(420, r.height + dy) + 'px'; });
  barre.addEventListener('dblclick', e => { if (!e.target.closest('button')) basculerMax(); });
  function basculerMax() { boite.classList.toggle('at-pc-max'); }
  function pleinEcran() {
    if (document.fullscreenElement === boite) return document.exitFullscreen().catch(() => {});
    if (boite.requestFullscreen) boite.requestFullscreen().catch(() => basculerMax()); else basculerMax();
  }
  barre.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'fermer') fermerFenetre(); else pleinEcran(); });
  // clic à côté de la fenêtre = fermer ; les touches tapées dans la fenêtre ne vont pas à la 3D
  fond.addEventListener('pointerdown', e => { if (e.target === fond) fermerFenetre(); });
  fond.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
  const echap = e => { if (e.key === 'Escape' && fenetre) { if (document.fullscreenElement) return; e.preventDefault(); e.stopImmediatePropagation(); fermerFenetre(); } };
  window.addEventListener('keydown', echap, true);
  function fermerFenetre() {
    if (!fenetre) return;
    window.removeEventListener('keydown', echap, true);
    if (document.fullscreenElement === boite) document.exitFullscreen().catch(() => {});
    try { instance.detruire(); } catch (e) { /* déjà détruit */ }
    instance = null; fenetre = null; fond.remove();
  }
  fenetre = { boite, fermer: fermerFenetre };
  boite.focus();
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
