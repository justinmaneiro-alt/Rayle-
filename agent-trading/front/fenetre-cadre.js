/* ═════════════ CADRE DE FENÊTRE COMMUN (PC) : déplacer, redimensionner, plein écran, Échap ═════════════
   Utilisé par la fenêtre de l'agent (tableau de bord de l'or, « ◈ ») et par les tuiles indépendantes Musique et Télé.
   modal : fond assombri, un clic à côté ferme (agent). garder : fermer = cacher sans détruire (la musique continue, la télé reste appairée). */
const CSS = `
.at-pc-fond{position:fixed;inset:0;z-index:2147481000;background:rgba(2,4,8,.38);backdrop-filter:blur(2px)}
.at-pc{position:fixed;display:flex;flex-direction:column;max-width:100vw;max-height:100vh;box-sizing:border-box;background:#05080c;border:1px solid rgba(143,208,227,.34);border-radius:6px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden;z-index:2147481001}
.at-pc[hidden]{display:none}
.at-pc.at-pc-max{left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0}
.at-pc-barre{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px 6px 12px;background:#070b10;border-bottom:1px solid rgba(143,208,227,.16);color:#d7e3ea;font:600 12px system-ui,sans-serif;letter-spacing:.08em;cursor:move;user-select:none;touch-action:none}
.at-pc-barre button{min-width:34px;min-height:28px;margin-left:4px;background:rgba(18,26,36,.9);border:1px solid rgba(143,208,227,.25);border-radius:4px;color:#d7e3ea;font:14px system-ui;cursor:pointer}
.at-pc-barre button:hover{border-color:rgba(143,208,227,.6)}
.at-pc-corps{flex:1;min-height:0;min-width:0;overflow:auto}
.at-pc-poignee{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,rgba(143,208,227,.5) 50%,rgba(143,208,227,.5) 58%,transparent 58%,transparent 70%,rgba(143,208,227,.5) 70%,rgba(143,208,227,.5) 78%,transparent 78%)}
.at-pc-max .at-pc-poignee{display:none}
@media (max-width:700px){.at-pc{left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0}.at-pc-poignee{display:none}.at-pc-barre button{min-width:44px;min-height:36px}}`;
export function chargerCssCadre() { if (!document.getElementById('at-pc-css')) { const s = document.createElement('style'); s.id = 'at-pc-css'; s.textContent = CSS; document.head.appendChild(s); } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ouvre une fenêtre ; monter(corps) renvoie l'instance (avec detruire() facultatif). Renvoie { boite, instance, fermer, montrer, ouverte } */
export function ouvrirCadre({ titre, monter, modal = false, garder = false, largeur = 1760, hauteur = 1000, min = [640, 420], boutons = '', surBouton = null, ariaLabel = titre, defile = true }) {
  chargerCssCadre();
  const fond = modal ? document.createElement('div') : null; if (fond) fond.className = 'at-pc-fond';
  const boite = document.createElement('section'); boite.className = 'at-pc'; boite.setAttribute('role', 'dialog'); if (modal) boite.setAttribute('aria-modal', 'true');
  boite.setAttribute('aria-label', ariaLabel); boite.tabIndex = -1;
  boite.innerHTML = `<header class="at-pc-barre"><span>${esc(titre)}</span><span>${boutons}<button type="button" data-a="plein" title="Plein écran" aria-label="Plein écran">⛶</button><button type="button" data-a="fermer" title="Fermer (Échap)" aria-label="Fermer">✕</button></span></header><div class="at-pc-corps"></div><i class="at-pc-poignee" title="Redimensionner"></i>`;
  if (!defile) boite.querySelector('.at-pc-corps').style.overflow = 'hidden';
  boite.style.minWidth = `min(${min[0]}px,100vw)`; boite.style.minHeight = `min(${min[1]}px,100vh)`;
  (fond || document.body).appendChild(boite); if (fond) document.body.appendChild(fond);
  const barre = boite.querySelector('.at-pc-barre');
  // taille de départ : centrée, JAMAIS plus large que l'écran
  const vw = document.documentElement.clientWidth || innerWidth, vh = document.documentElement.clientHeight || innerHeight;
  const l = Math.min(largeur, Math.round(vw * 0.96)), h = Math.min(hauteur, Math.round(vh * 0.94));
  Object.assign(boite.style, { width: l + 'px', height: h + 'px', left: Math.round((vw - l) / 2) + 'px', top: Math.round((vh - h) / 2) + 'px' });
  const C = { boite, instance: null, ouverte: true };
  C.instance = monter(boite.querySelector('.at-pc-corps'));

  const glisser = (el, f) => el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button') || boite.classList.contains('at-pc-max')) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const r = boite.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    const bouge = m => f(r, m.clientX - x0, m.clientY - y0), fin = () => { el.removeEventListener('pointermove', bouge); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin); };
    el.addEventListener('pointermove', bouge); el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
  });
  glisser(barre, (r, dx, dy) => { boite.style.left = Math.max(-r.width + 120, Math.min(innerWidth - 120, r.left + dx)) + 'px'; boite.style.top = Math.max(0, Math.min(innerHeight - 40, r.top + dy)) + 'px'; });
  glisser(boite.querySelector('.at-pc-poignee'), (r, dx, dy) => { boite.style.width = Math.min(innerWidth - r.left, Math.max(min[0], r.width + dx)) + 'px'; boite.style.height = Math.min(innerHeight - r.top, Math.max(min[1], r.height + dy)) + 'px'; });
  barre.addEventListener('dblclick', e => { if (!e.target.closest('button')) boite.classList.toggle('at-pc-max'); });
  function pleinEcran() {
    if (document.fullscreenElement === boite) return document.exitFullscreen().catch(() => {});
    if (boite.requestFullscreen) boite.requestFullscreen().catch(() => boite.classList.toggle('at-pc-max')); else boite.classList.toggle('at-pc-max');
  }
  barre.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'fermer') fermer(); else if (b.dataset.a === 'plein') pleinEcran(); else surBouton && surBouton(b.dataset.a); });
  // les touches tapées dans la fenêtre ne vont pas à la 3D ; un clic à côté (modal) ferme
  if (fond) fond.addEventListener('pointerdown', e => { if (e.target === fond) fermer(); });
  boite.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
  const echap = e => { if (e.key === 'Escape' && C.ouverte && (modal || boite.contains(document.activeElement))) { if (document.fullscreenElement || (C.instance && C.instance.pleinEcran && C.instance.pleinEcran())) return; e.preventDefault(); e.stopImmediatePropagation(); fermer(); } };
  window.addEventListener('keydown', echap, true);
  function fermer() {
    if (!C.ouverte) return; C.ouverte = false;
    if (document.fullscreenElement === boite) document.exitFullscreen().catch(() => {});
    if (garder) { boite.hidden = true; return; }
    window.removeEventListener('keydown', echap, true);
    try { C.instance && C.instance.detruire && C.instance.detruire(); } catch (e) { /* déjà détruit */ }
    C.instance = null; boite.remove(); fond && fond.remove(); C.surFermer && C.surFermer();
  }
  C.fermer = fermer;
  C.montrer = () => { C.ouverte = true; boite.hidden = false; boite.focus(); };
  boite.focus();
  return C;
}
