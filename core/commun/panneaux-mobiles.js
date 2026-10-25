import { vitesse, pasInertie, estLance, classerBalayage, aimanter, echelleMolette, limiterRotation, angleEntre, deltaAngle, pasClavier, fenetreSuivante } from './gestes-calcul.js';
import { enregistrerSource } from './tiroir-fenetres.js';
import { lirePrefs, effetsActifs, chargerStyleGestes, avalerClic } from './gestionnaire-fenetres.js';

/* ═════════════ FENÊTRES « PANNEAUX » ET FENÊTRES FIXES MANIPULABLES (R3, phase 3) ═════════════
   Les fenêtres du système Panneaux (Terre : actualités, météo, événements, itinéraires ; Mars : poste de l'agent ; réponses de Raylé ; médias ; Jupiter et Neptune le jour où elles auront des
   fenêtres) sont rangées en colonnes autour de l'entité. Ce module leur donne les mêmes gestes que le gestionnaire commun, SANS toucher à leur contenu :
   - glisser la barre de titre détache la fenêtre dans une couche libre (inertie, aimantation, traînée) ; « remettre à sa place » la rend à sa colonne ;
   - molette sur la barre (ou Ctrl / Alt) et pincement à deux doigts : agrandir / réduire (rotation légère réglable) ; double clic / double appui : plein écran ;
   - balayage rapide vers le bas : réduire, vers le haut : remettre ; épingler (reste ouverte, n'est pas évincée par les nouvelles fenêtres) ; clic droit : menu ;
   - clavier : Tab / Maj+Tab entre fenêtres (sur la fenêtre), flèches = déplacer, Maj+flèches = taille, Entrée = plein écran, Échap = fermer.
   rendreMobile(el, { poignee, zone, refuse, id, titre, enPlace, memoire, fermer }) : pareil pour une fenêtre fixe de l'interface (grande fenêtre de l'accueil, télécommande…). `enPlace` la garde dans
   son conteneur (positionnement absolu) ; sa position et son échelle sont mémorisées sur l'appareil (`rayle_pm_<id>`). Écran étroit (< 820 px) : pas de détachement, seulement balayage / fermeture. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const etroit = () => window.innerWidth < 821;
const HAUT = 56, BAS = 64, MARGE = 8;
let couche = null, menuEl = null, zTop = 80;
const etats = new WeakMap();                 // élément → { libre, enPlace, origine, echelle, reduit, max, epingle, avant, colonne, suivant, id, memoire }
const lireStock = cle => { try { return JSON.parse(localStorage.getItem('rayle_pm_' + cle) || 'null'); } catch (e) { return null; } };
const ecrireStock = (cle, v) => { try { localStorage.setItem('rayle_pm_' + cle, JSON.stringify(v)); } catch (e) { /* stockage interdit */ } };

function chargerCss() {
  if (document.getElementById('pm-css')) return; chargerStyleGestes();
  const l = document.createElement('link'); l.id = 'pm-css'; l.rel = 'stylesheet'; l.href = new URL('./panneaux-mobiles.css', import.meta.url).href; document.head.appendChild(l);
}
function laCouche() { if (!couche) { couche = document.createElement('div'); couche.id = 'pm-couche'; document.body.appendChild(couche); } return couche; }
const utile = () => ({ x: MARGE, y: HAUT, l: window.innerWidth - 2 * MARGE, h: window.innerHeight - HAUT - BAS });
const libres = except => [...document.querySelectorAll('#pm-couche > .pn,.pm-libre,.pm-mobile-libre')].filter(e => e !== except && e.offsetParent !== null && !(etats.get(e) || {}).reduit).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height }; });
function etat(el) { let s = etats.get(el); if (!s) { s = { libre: false, enPlace: false, origine: { x: 0, y: 0 }, echelle: 1, reduit: false, max: false, epingle: false, avant: null }; etats.set(el, s); } return s; }
/* position courante en coordonnées de l'écran (les positions en place sont relatives au conteneur) */
const pos = el => { const s = etat(el); return { x: (parseFloat(el.style.left) || 0) + s.origine.x, y: (parseFloat(el.style.top) || 0) + s.origine.y }; };
function sauver(el) { const s = etat(el); if (!s.memoire || !s.id || !s.libre) return; const p = pos(el); ecrireStock(s.id, { x: Math.round(p.x), y: Math.round(p.y), k: s.echelle, e: s.epingle ? 1 : 0, r: s.reduit ? 1 : 0, m: s.max ? 1 : 0 }); }

/* Détache la fenêtre de sa colonne (ou la rend positionnable en place) : elle garde sa position actuelle. */
function detacher(el) {
  const s = etat(el); if (s.libre) return true; if (etroit()) return false;
  const r = el.getBoundingClientRect();
  if (s.enPlace) {
    const op = el.offsetParent, pr = op ? op.getBoundingClientRect() : { left: 0, top: 0 }; s.origine = { x: pr.left, y: pr.top };
    Object.assign(el.style, { position: 'absolute', left: (r.left - pr.left) + 'px', top: (r.top - pr.top) + 'px', width: r.width + 'px', height: r.height + 'px', right: 'auto', bottom: 'auto', transform: 'none', margin: '0', transformOrigin: '0 0', zIndex: ++zTop }); el.classList.add('pm-mobile-libre');
  } else {
    s.colonne = el.parentNode; s.suivant = el.nextSibling; laCouche().appendChild(el); s.origine = { x: 0, y: 0 };
    Object.assign(el.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: '0', transformOrigin: '0 0', zIndex: ++zTop }); el.classList.add('pm-libre');
  }
  s.libre = true; return true;
}
function remettre(el) {
  const s = etat(el); if (!s.libre) return; s.libre = false; s.max = false; s.reduit = false; s.echelle = 1;
  for (const k of ['position', 'left', 'top', 'width', 'height', 'right', 'bottom', 'margin', 'transform', 'transformOrigin', 'zIndex', 'scale', 'rotate']) el.style[k] = '';
  el.classList.remove('pm-libre', 'pm-mobile-libre', 'pm-max', 'pm-reduit'); s.origine = { x: 0, y: 0 };
  if (s.colonne && s.colonne.isConnected) s.colonne.insertBefore(el, s.suivant && s.suivant.parentNode === s.colonne ? s.suivant : null);
  if (s.memoire && s.id) { try { localStorage.removeItem('rayle_pm_' + s.id); } catch (e) { /* stockage interdit */ } }
}
function poser(el, x, y) {
  const s = etat(el), r = el.getBoundingClientRect();
  /* jamais tronquée par un bord quand elle tient dans l'écran ; sinon au moins 80 px restent saisissables */
  const maxX = window.innerWidth - MARGE - r.width, maxY = window.innerHeight - BAS - Math.min(r.height, window.innerHeight - HAUT - BAS);
  x = r.width + 2 * MARGE <= window.innerWidth ? Math.max(MARGE, Math.min(x, maxX)) : Math.max(MARGE - r.width + 80, Math.min(x, window.innerWidth - 80));
  y = Math.max(HAUT, Math.min(y, Math.max(HAUT, maxY)));
  el.style.left = Math.round(x - s.origine.x) + 'px'; el.style.top = Math.round(y - s.origine.y) + 'px';
}
function premierPlan(el) { const s = etat(el); if (s.libre) el.style.zIndex = (s.epingle ? 4000 : 0) + (++zTop); document.querySelectorAll('.pn.pm-focus,.pm-mobile.pm-focus').forEach(e => e.classList.remove('pm-focus')); el.classList.add('pm-focus'); }
function echelle(el, k, ancre) {
  const s = etat(el); if (!detacher(el)) return; const avant = el.getBoundingClientRect(), k0 = s.echelle, k1 = Math.max(0.5, Math.min(2.4, k0 * k));
  s.echelle = k1; el.style.scale = String(k1); if (s.max) { s.max = false; el.classList.remove('pm-max'); }
  const ax = ancre ? ancre.x : avant.left + avant.width / 2, ay = ancre ? ancre.y : avant.top + avant.height / 2, f = k1 / k0;   // l'ancre (curseur) reste fixe
  poser(el, ax - (ax - avant.left) * f, ay - (ay - avant.top) * f); sauver(el);
}
function agrandir(el, oui) {
  const s = etat(el); const veut = oui === undefined ? !s.max : !!oui; if (veut === s.max) return; if (!detacher(el)) return;
  if (veut) {
    const p = pos(el); s.avant = { x: p.x, y: p.y, w: el.style.width, h: el.style.height, k: s.echelle }; s.max = true; s.reduit = false; el.classList.remove('pm-reduit'); el.classList.add('pm-max'); el.style.scale = '1';
    el.style.left = (MARGE - s.origine.x) + 'px'; el.style.top = (HAUT - s.origine.y) + 'px'; el.style.width = (window.innerWidth - 2 * MARGE) + 'px'; el.style.height = (window.innerHeight - HAUT - BAS) + 'px';
  } else {
    s.max = false; el.classList.remove('pm-max'); const a = s.avant || { x: 80, y: 80, w: '420px', h: '', k: 1 }; s.echelle = a.k; el.style.scale = String(a.k); el.style.width = a.w; el.style.height = a.h; poser(el, a.x, a.y);
  }
  premierPlan(el); sauver(el);
}
function reduire(el, oui) { const s = etat(el); s.reduit = oui === undefined ? !s.reduit : !!oui; el.classList.toggle('pm-reduit', s.reduit); sauver(el); }
function epingler(el, oui) {
  const s = etat(el), id = el.dataset.id; s.epingle = oui === undefined ? !s.epingle : !!oui; el.classList.toggle('pm-epingle', s.epingle);
  const b = el.querySelector('.pm-pin'); if (b) { b.setAttribute('aria-pressed', s.epingle ? 'true' : 'false'); b.classList.toggle('actif', s.epingle); }
  if (window.Panneaux && window.Panneaux.epingler && id && el.classList.contains('pn')) window.Panneaux.epingler(id, s.epingle); premierPlan(el); sauver(el); return s.epingle;
}
function inertie(el, v) {
  let t = performance.now(), vv = v; const s = etat(el); s.vol = true;
  const boucle = now => {
    if (!s.vol || !el.isConnected) return; const dt = Math.min(34, now - t); t = now; const p = pasInertie(vv, dt), c = pos(el);
    poser(el, c.x + p.dx, c.y + p.dy); vv = { vx: p.vx, vy: p.vy };
    if (p.fini) { s.vol = false; recoller(el); } else requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}
function recoller(el) { if (lirePrefs().aimant) { const r = el.getBoundingClientRect(), a = aimanter({ x: r.left, y: r.top, l: r.width, h: r.height }, libres(el), utile()); poser(el, a.x, a.y); } sauver(el); }
function onde(el, e) { if (!effetsActifs()) return; const r = el.getBoundingClientRect(), o = document.createElement('i'); o.className = 'gfx-onde'; const k = (etat(el).echelle || 1); o.style.left = ((e.clientX - r.left) / k) + 'px'; o.style.top = ((e.clientY - r.top) / k) + 'px'; el.appendChild(o); setTimeout(() => o.remove(), 650); }
let trace0 = 0;
function traine(el, avant) {
  if (!effetsActifs()) return; const t = performance.now(); if (t - trace0 < 45) return; trace0 = t; if (laCouche().querySelectorAll('.gfx-trace').length > 7) return;
  const g = document.createElement('div'); g.className = 'gfx-trace'; Object.assign(g.style, { position: 'fixed', left: avant.left + 'px', top: avant.top + 'px', width: avant.width + 'px', height: avant.height + 'px', zIndex: 70 }); laCouche().appendChild(g); setTimeout(() => g.remove(), 430);
}

/* ── menu ── */
function fermerMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function menu(el, x, y, extra) {
  fermerMenu(); const s = etat(el), id = el.dataset.id || '', titre = (el.querySelector('h2') || el.querySelector('.g1-fen-titre') || el).textContent || 'Fenêtre';
  menuEl = document.createElement('div'); menuEl.className = 'gfx-menu pm-menu'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', 'Menu de la fenêtre ' + titre);
  const it = [['agrandir', s.max ? 'Restaurer' : 'Agrandir'], ['reduire', s.reduit ? 'Rétablir' : 'Réduire'], ['epingler', s.epingle ? 'Détacher' : 'Épingler au premier plan']];
  if (s.libre) it.push(['remettre', 'Remettre à sa place']); it.push(['fermer', 'Fermer']);
  menuEl.innerHTML = '<b class="gfx-menu-t">' + esc(titre.slice(0, 60)) + '</b>' + it.map(([a, t]) => '<button type="button" role="menuitem" data-m="' + a + '">' + esc(t) + '</button>').join('');
  document.body.appendChild(menuEl); menuEl.style.position = 'fixed'; menuEl.style.zIndex = 5000;
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight; menuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px'; menuEl.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
  menuEl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-m]'); if (!b) return; const a = b.dataset.m; fermerMenu();
    if (a === 'agrandir') agrandir(el); else if (a === 'reduire') reduire(el); else if (a === 'epingler') epingler(el); else if (a === 'remettre') remettre(el);
    else if (a === 'fermer') { if (extra && extra.fermer) extra.fermer(); else if (window.Panneaux && id) window.Panneaux.fermer(id); else el.hidden = true; }
  });
  menuEl.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); fermerMenu(); try { el.focus({ preventScroll: true }); } catch (e) { /* fermée */ } } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const bs = [...menuEl.querySelectorAll('button')], i = bs.indexOf(document.activeElement); bs[(i + (ev.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); } });
  const b0 = menuEl.querySelector('button'); if (b0) b0.focus({ preventScroll: true });
}
document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target)) fermerMenu(); }, true);

/* ── attache les gestes à une fenêtre ── */
function attacher(el, { tete, extra, zone, refuse } = {}) {
  if (el.dataset.pm) return; el.dataset.pm = '1'; el.tabIndex = 0; el.classList.add('pm-mobile-ok'); const s = etat(el);
  tete = tete || el.querySelector('.pn-tete'); if (!tete) return;
  if (!tete.querySelector('.pm-pin') && el.classList.contains('pn')) { const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'pm-pin'; pin.title = 'Épingler au premier plan'; pin.setAttribute('aria-label', 'Épingler'); pin.setAttribute('aria-pressed', 'false'); pin.innerHTML = '&#9685;'; const x = tete.querySelector('.pn-x'); tete.insertBefore(pin, x); pin.addEventListener('click', () => epingler(el)); }
  const bonneZone = t => !(t.closest('button,input,select,textarea,a') || (refuse && t.closest(refuse)) || (zone && !t.closest(zone)));
  /* glisser par la barre de titre */
  tete.addEventListener('pointerdown', e => {
    if (!bonneZone(e.target) || (e.button !== 0 && e.pointerType === 'mouse')) return; premierPlan(el); s.vol = false;
    const x0 = e.clientX, y0 = e.clientY, t0 = performance.now(), pts = [{ t: t0, x: x0, y: y0 }]; let depart = null, bouge = false;
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return; pts.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); if (pts.length > 12) pts.shift();
      if (!bouge && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) { bouge = true; if (!detacher(el)) return; depart = pos(el); el.classList.add('pm-deplace'); }
      if (!bouge || !depart || s.max) return; const avant = el.getBoundingClientRect();
      let nx = depart.x + ev.clientX - x0, ny = depart.y + ev.clientY - y0;
      if (lirePrefs().aimant) { const r = el.getBoundingClientRect(), a = aimanter({ x: nx, y: ny, l: r.width, h: r.height }, libres(el), utile()); nx = a.x; ny = a.y; }
      poser(el, nx, ny); traine(el, avant);
    };
    const fin = ev => {
      if (ev.pointerId !== e.pointerId) return; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin);
      el.classList.remove('pm-deplace'); const dt = performance.now() - t0, dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (ev.type === 'pointerup' && ev.pointerType === 'touch') {
        const sens = classerBalayage(dx, dy, dt, { distance: 60, vitesseMin: 0.7 });
        if ((sens === 'bas' && !s.reduit) || (sens === 'haut' && s.reduit)) { avalerClic(); if (depart) poser(el, depart.x, depart.y); reduire(el, sens === 'bas'); return; }
        if (!bouge && dt < 320) { const m = performance.now(); if (m - (s.dernierTap || 0) < 360) { s.dernierTap = 0; s.dernierAgr = m; avalerClic(); agrandir(el); return; } s.dernierTap = m; }
      }
      if (ev.type === 'pointerup' && bouge && s.libre && !s.max) { pts.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); const v = vitesse(pts); if (lirePrefs().inertie && estLance(v) && !matchMedia('(prefers-reduced-motion: reduce)').matches) { inertie(el, v); return; } recoller(el); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);   // sur window : détacher déplace l'élément dans le DOM, ce qui libère la capture du pointeur
  });
  tete.addEventListener('dblclick', e => { if (bonneZone(e.target) && performance.now() - (s.dernierAgr || 0) > 500) agrandir(el); });
  el.addEventListener('pointerdown', e => { premierPlan(el); onde(el, e); });
  /* molette */
  el.addEventListener('wheel', e => {
    if (etroit() || e.target.closest('canvas,input,textarea,select,iframe')) return; const cadre = !!e.target.closest('.pn-tete,.pm-tete') || (tete !== el && tete.contains(e.target) && bonneZone(e.target)), c = el.querySelector('.pn-corps,.g1-fen-corps') || el, defile = c.scrollHeight > c.clientHeight + 2;
    if (!(cadre || e.ctrlKey || e.altKey || !defile)) return; e.preventDefault(); echelle(el, echelleMolette(e.deltaY), { x: e.clientX, y: e.clientY });
  }, { passive: false });
  /* pincement à deux doigts (+ rotation légère) */
  const doigts = new Map(); let pince = null;
  const deux = () => [...doigts.values()], dist = () => { const [a, b] = deux(); return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  el.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || etroit() || e.target.closest('canvas')) return; doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (doigts.size === 2) { const [a, b] = deux(); pince = { d: dist(), a0: angleEntre(a, b), k: s.echelle || 1 }; s.vol = false; } });
  el.addEventListener('pointermove', e => {
    if (!doigts.has(e.pointerId)) return; doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pince && doigts.size === 2) { const [a, b] = deux(), vise = pince.k * dist() / pince.d, ctr = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; echelle(el, vise / (s.echelle || 1), ctr); if (lirePrefs().rotation) el.style.rotate = limiterRotation(deltaAngle(angleEntre(a, b), pince.a0)).toFixed(2) + 'deg'; }
  });
  const finDoigt = e => { if (!doigts.delete(e.pointerId)) return; if (pince && doigts.size < 2) { pince = null; if (el.style.rotate) { el.style.transition = 'rotate .28s ease-out'; el.style.rotate = '0deg'; setTimeout(() => { el.style.transition = ''; el.style.rotate = ''; }, 320); } } };
  el.addEventListener('pointerup', finDoigt); el.addEventListener('pointercancel', finDoigt);
  /* clic droit */
  el.addEventListener('contextmenu', e => { if (e.target.closest('input,textarea')) return; e.preventDefault(); menu(el, e.clientX, e.clientY, extra); });
  /* clavier (la fenêtre a le focus) */
  el.addEventListener('keydown', e => {
    if (e.target !== el) return; const k = e.key, toutes = () => [...document.querySelectorAll('.pn')];
    if (k === 'Tab' && el.classList.contains('pn')) { e.preventDefault(); const ids = toutes().map((q, i) => q.dataset.id || 'i' + i), cur = ids[toutes().indexOf(el)], suiv = fenetreSuivante(ids, cur, e.shiftKey), q = toutes()[ids.indexOf(suiv)]; if (q) { premierPlan(q); q.focus({ preventScroll: true }); } return; }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (extra && extra.fermer) extra.fermer(); else if (window.Panneaux && el.dataset.id) window.Panneaux.fermer(el.dataset.id); return; }
    if (k === 'Enter') { e.preventDefault(); agrandir(el); return; }
    if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) { e.preventDefault(); const r = el.getBoundingClientRect(); menu(el, r.left + 24, r.top + 24, extra); return; }
    const pas = pasClavier(k, { maj: e.shiftKey, ctrl: e.ctrlKey }); if (!pas || etroit()) return; e.preventDefault();
    if (pas.dl || pas.dh) echelle(el, 1 + (pas.dl + pas.dh) / 240); else if (detacher(el)) { const c = pos(el); poser(el, c.x + pas.dx, c.y + pas.dy); sauver(el); }
  });
}

/* Rend mobile n'importe quelle fenêtre fixe de l'interface : barre de titre = `poignee`, `zone` (sélecteur) limite où l'on peut saisir, `refuse` exclut des sous-zones (onglets…). */
export function rendreMobile(el, { poignee, zone = null, refuse = null, id, titre, enPlace = false, memoire = true, fermer = null } = {}) {
  if (!el || el.dataset.pm) return false; chargerCss(); el.classList.add('pm-mobile'); if (id) el.dataset.id = id;
  const s = etat(el); s.enPlace = !!enPlace; s.id = id || null; s.memoire = !!(memoire && id); attacher(el, { tete: poignee || el, zone, refuse, extra: fermer ? { fermer } : null });
  if (enPlace) {
    const m = s.memoire ? lireStock(id) : null;   // position mémorisée : appliquée quand la fenêtre est visible (hidden retiré)
    const appliquer = () => {
      if (!m || s.libre || el.hidden || etroit()) return; if (!detacher(el)) return; s.echelle = m.k || 1; el.style.scale = String(s.echelle); poser(el, m.x, m.y);
      if (m.e) epingler(el, true); if (m.m) agrandir(el, true);
    };
    if (m) { appliquer(); new MutationObserver(appliquer).observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
  }
  return true;
}

function balayer(racine) { for (const el of racine.querySelectorAll ? racine.querySelectorAll('.pn') : []) attacher(el); if (racine.classList && racine.classList.contains('pn')) attacher(racine); }
function demarrer() {
  chargerCss(); const zone = document.getElementById('panneaux'); if (!zone) return;
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) balayer(n); }).observe(zone, { childList: true, subtree: true });
  /* les fenêtres détachées vivent dans #pm-couche : Panneaux.fermer les retire de là aussi (parentNode) */
  balayer(zone);
  /* la grande fenêtre de l'accueil et celle de la télécommande (créée à la demande) se déplacent par leur barre ; les réglages sont un volet plein écran par conception (Échap les ferme) */
  const veille = () => {
    const t = document.getElementById('tele-fenetre'); if (t && !t.dataset.pm) rendreMobile(t, { poignee: t, zone: 'header', id: 'tele-fenetre', titre: 'Télécommande', fermer: () => { t.hidden = true; } });
    const g = document.getElementById('g1Fen'); if (g && !g.dataset.pm) rendreMobile(g, { poignee: g, zone: '.g1-fen-barre,.g1-fen-titre', id: 'g1-grande', titre: 'Accueil', enPlace: true, fermer: () => { if (window.G1) window.G1.fermer(); } });
  };
  new MutationObserver(veille).observe(document.body, { childList: true, subtree: true }); veille();
  enregistrerSource('interface', { vue: 'Interface', entrees: () => [{ id: 'reglages', titre: 'Réglages', dossier: 'Réglages et pilotage', icone: '⚙', posee: !!(document.getElementById('cfg') && document.getElementById('cfg').classList.contains('open')), afficher: () => { const c = document.getElementById('cfg'); if (c) c.classList.add('open'); } }, { id: 'telecommande', titre: 'Télécommande (tablette)', dossier: 'Réglages et pilotage', icone: '📱', posee: !!(document.getElementById('tele-fenetre') && !document.getElementById('tele-fenetre').hidden), afficher: () => { if (window.Telecommande) window.Telecommande.ouvrir(); } }] });
  enregistrerSource('panneaux', { vue: 'Fenêtres Raylé (Terre, Mars, réponses)', entrees: () => (window.Panneaux ? window.Panneaux.liste() : []).map(p => ({ id: p.id, titre: p.titre || p.id, dossier: p.type || 'Panneaux', posee: true, apercu: '', afficher: () => { const el = document.querySelector('.pn[data-id="' + p.id + '"]'); if (!el) return; const s = etat(el); if (s.reduit) reduire(el, false); premierPlan(el); el.focus({ preventScroll: true }); } })) });
  /* accueil : la grande fenêtre et ses neuf contenus (météo, à faire, messages, santé, marché, actualités, alertes, événements, systèmes) */
  enregistrerSource('accueil', { vue: 'Accueil', entrees: () => (window.G1 && window.G1.fenetres ? window.G1.fenetres() : []).map(id => ({ id, titre: ((window.G1Fenetres ? window.G1Fenetres.ONGLETS : []).find(o => o.id === id) || { titre: id }).titre, dossier: 'Grande fenêtre', icone: '🪟', posee: !!(window.G1.courant && window.G1.courant() === id), afficher: () => window.G1.ouvrir(id) })) });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer(); }
export const pm = { detacher, remettre, agrandir, reduire, epingler, echelle, menu, etat: el => ({ ...etat(el) }), mobiles: () => [...document.querySelectorAll('.pn.pm-libre,.pm-mobile-libre,.pm-mobile')] };
if (typeof window !== 'undefined') window.PanneauxMobiles = { ...pm, rendreMobile, pos };
