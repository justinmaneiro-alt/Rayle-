import { carrousel, eventail, centreApresGlisse, centreFinal, toucheCarrousel, centreMolette, borne, norme } from './dossiers-calcul.js';

/* ═════════════ DOSSIERS HOLOGRAPHIQUES (R3) : mur de classeurs + carrousel 3D ═════════════
   Réutilisable par toute vue qui a beaucoup de fenêtres (terminal de Mars, anatomie, tiroir global).
   const D = creerDossiers({ dossiers, fenetres, estPosee, poser, rectFenetre, ranger, apresLot, vue });
     dossiers : [{ id, titre, icone, ids }] · fenetres : { id: { titre, icone, apercu, etat } } · estPosee(id) · poser(id) ouvre la fenêtre dans l'espace de travail
     rectFenetre(id) → rectangle de la fenêtre posée (pour l'animation de vol) · ranger(id) la ferme (retour au dossier) · apresLot() après « tout afficher »
   D.rendreMur(el) (classeurs : onglet, icône, nombre de fenêtres, léger flottement) · D.majMur() · D.ouvrir(id) · D.fermer() · D.sortir(id) · D.rentrer(id) · D.toutAfficher(id)
   Carrousel : glisser au doigt / à la souris, molette, flèches ; la carte du centre est mise en avant, les autres reculent en transparence ; clic ou Entrée sur la carte du centre
   (ou la glisser vers le haut) la fait s'envoler vers l'espace de travail ; glisser vers le bas ou Échap referme. Effets réduits en mode léger / animations réduites. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ETATS = { reel: 'RÉEL', differe: 'DIFFÉRÉ', simule: 'SIMULÉ', exemple: 'EXEMPLE', bientot: 'BIENTÔT' };
export function chargerStyleDossiers() {
  if (document.getElementById('dos-css')) return;
  const l = document.createElement('link'); l.id = 'dos-css'; l.rel = 'stylesheet'; l.href = new URL('./dossiers.css', import.meta.url).href; document.head.appendChild(l);
}
export const effetsReduits = () => { try { return document.body.dataset.hud === 'leger' || matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('rayle_fenetres_effets') === '0'; } catch (e) { return false; } };

export function creerDossiers({ dossiers, fenetres, estPosee = () => false, poser, rectFenetre = () => null, ranger = () => {}, apresLot = () => {}, vue = '' }) {
  chargerStyleDossiers();
  let murEl = null, voile = null, scene = null, cartes = [], dosOuvert = null, centre = 0, ids = [], gardeOuvert = false, precedentFocus = null, tMolette = 0, largeurCarte = 340;
  const dossier = id => dossiers.find(d => d.id === id) || null;
  const info = id => fenetres[id] || { titre: id, icone: '◈', apercu: '' };
  const nbPosees = d => d.ids.filter(estPosee).length;

  /* ── mur de classeurs ── */
  function majMur() {
    if (!murEl) return;
    for (const b of murEl.querySelectorAll('[data-dos]')) {
      const d = dossier(b.dataset.dos); if (!d) continue; const k = nbPosees(d);
      b.querySelector('.dos-n').textContent = d.ids.length; b.querySelector('.dos-pos').textContent = k ? k + ' posée' + (k > 1 ? 's' : '') : '';
      b.classList.toggle('actif', k > 0); b.setAttribute('aria-label', d.titre + ', ' + d.ids.length + ' fenêtre' + (d.ids.length > 1 ? 's' : '') + (k ? ', ' + k + ' posée' + (k > 1 ? 's' : '') : ''));
    }
  }
  function rendreMur(el) {
    murEl = el; el.classList.add('dos-mur');
    el.innerHTML = dossiers.map((d, k) => '<button type="button" class="dos-classeur" data-dos="' + esc(d.id) + '" style="--ph:' + (k * 0.65).toFixed(2) + 's"><span class="dos-onglet"><i aria-hidden="true">' + esc(d.icone) + '</i><b>' + esc(d.titre) + '</b></span><span class="dos-face"><span class="dos-compte"><strong class="dos-n"></strong> fenêtre' + (d.ids.length > 1 ? 's' : '') + '</span><em class="dos-pos"></em></span></button>').join('');
    el.addEventListener('click', e => { const b = e.target.closest('[data-dos]'); if (b) ouvrir(b.dataset.dos, b); });
    majMur();
  }
  const tuile = id => (murEl ? murEl.querySelector('[data-dos="' + id + '"]') : null);

  /* ── carrousel ── */
  const reduit = effetsReduits;
  function pose(c, instant) {
    const lay = carrousel(ids.length, c, { largeurCarte, largeurEcran: window.innerWidth });
    lay.forEach((p, i) => {
      const el = cartes[i]; if (!el) return; if (!p.visible && el.dataset.v !== '1') return; el.dataset.v = p.visible ? '1' : ''; el.style.transition = instant ? 'none' : '';
      el.style.transform = 'translate(-50%,-50%) translate3d(' + p.x + 'px,0,' + p.z + 'px) rotateY(' + p.rot.toFixed(1) + 'deg) scale(' + p.echelle.toFixed(3) + ')';
      el.style.opacity = p.opacite; el.style.zIndex = p.zIndex; el.style.pointerEvents = p.visible ? '' : 'none'; el.style.display = p.visible ? '' : 'none'; el.classList.toggle('centre', Math.round(c) === i);
      el.tabIndex = Math.round(c) === i ? 0 : -1; el.setAttribute('aria-hidden', Math.round(c) === i ? 'false' : 'true');
    });
    const pts = voile && voile.querySelector('.dos-points'); if (pts) for (const [i, b] of [...pts.children].entries()) b.classList.toggle('actif', i === Math.round(c));
    const t = voile && voile.querySelector('.dos-titre-carte'); if (t) t.textContent = ids.length ? info(ids[Math.round(c)]).titre + ' (' + (Math.round(c) + 1) + '/' + ids.length + ')' : '';
  }
  const htmlCartes = () => ids.map((i, k) => '<div class="dos-carte" role="button" style="opacity:0;pointer-events:none" data-id="' + esc(i) + '" data-k="' + k + '" aria-label="' + esc(info(i).titre) + '">' + htmlCarte(i) + '</div>').join('');
  /* recherche dans un grand dossier (os, muscles…) : seules les cartes qui correspondent restent */
  function filtrer(q) {
    const d = dossier(dosOuvert); if (!d || !scene) return; const n = norme(q).trim();
    ids = n ? d.ids.filter(i => norme(info(i).titre + ' ' + (info(i).apercu || '')).includes(n)) : d.ids.slice(); centre = 0;
    scene.innerHTML = ids.length ? htmlCartes() : '<p class="dos-aucun">Aucune fenêtre ne correspond.</p>'; cartes = [...scene.querySelectorAll('.dos-carte')]; pose(centre, true);
    const sm = voile.querySelector('.dos-tete-t small'); if (sm) sm.textContent = ids.length + ' sur ' + d.ids.length + ' fenêtre' + (d.ids.length > 1 ? 's' : '') + (vue ? ' · ' + vue : '');
  }
  function allerA(i) { centre = borne(i, ids.length); pose(centre, false); }
  function htmlCarte(id) {
    const f = info(id), posee = estPosee(id), e = f.etat || (f.reel ? 'reel' : 'bientot');
    return '<span class="dos-carte-bord"></span><span class="dos-carte-ico" aria-hidden="true">' + esc(f.icone || '◈') + '</span><b class="dos-carte-titre">' + esc(f.titre) + '</b><span class="dos-carte-ap">' + esc(f.apercu || '') + '</span><span class="dos-carte-pied"><em class="dos-etat ' + esc(e) + '">' + (ETATS[e] || esc(String(e).toUpperCase())) + '</em>' + (posee ? '<em class="dos-posee">POSÉE</em>' : '<em class="dos-sortir">appui = sortir</em>') + '</span><i class="dos-scan"></i>';
  }
  function ouvrir(id, depuis) {
    const d = dossier(id); if (!d) return false; if (voile) fermer(true);
    dosOuvert = id; ids = d.ids.slice(); centre = 0; precedentFocus = document.activeElement; gardeOuvert = false;
    largeurCarte = Math.max(220, Math.min(340, Math.round(window.innerWidth * 0.74)));
    voile = document.createElement('div'); voile.className = 'dos-voile' + (reduit() ? ' dos-sobre' : ''); voile.setAttribute('role', 'dialog'); voile.setAttribute('aria-modal', 'true'); voile.setAttribute('aria-label', 'Dossier ' + d.titre); voile.tabIndex = -1;
    voile.style.setProperty('--dos-l', largeurCarte + 'px');
    voile.innerHTML = '<header class="dos-tete"><span class="dos-tete-ico" aria-hidden="true">' + esc(d.icone) + '</span><span class="dos-tete-t"><b>' + esc(d.titre) + '</b><small>' + ids.length + ' fenêtre' + (ids.length > 1 ? 's' : '') + (vue ? ' · ' + esc(vue) : '') + '</small></span>'
      + '<span class="dos-actions">' + (ids.length > 12 ? '<input type="search" class="dos-filtre" data-a="filtre" placeholder="Chercher dans le dossier…" aria-label="Chercher dans le dossier" autocomplete="off">' : '') + '<button type="button" data-a="tout" title="Poser toutes les fenêtres du dossier dans l’espace de travail">Tout afficher</button><label class="dos-garde" title="Laisser le dossier ouvert après une sortie"><input type="checkbox" data-a="garde"> Garder ouvert</label><button type="button" data-a="fermer" title="Refermer le dossier (Échap)" aria-label="Refermer le dossier">✕</button></span></header>'
      + '<div class="dos-scene" tabindex="-1"></div><footer class="dos-pied"><button type="button" class="dos-fl" data-a="prec" aria-label="Fenêtre précédente">‹</button><span class="dos-centre"><span class="dos-titre-carte"></span><span class="dos-points">' + (ids.length > 24 ? '' : ids.map(() => '<i></i>').join('')) + '</span><small>Glisse, molette ou flèches · appui sur la carte du centre pour la sortir · glisse-la vers le haut pour l’envoyer · vers le bas pour refermer</small></span><button type="button" class="dos-fl" data-a="suiv" aria-label="Fenêtre suivante">›</button></footer>';
    scene = voile.querySelector('.dos-scene');
    scene.innerHTML = htmlCartes();
    cartes = [...scene.children]; document.body.appendChild(voile);
    /* départ en éventail replié sur le classeur, puis déploiement échelonné */
    const o = (depuis || tuile(id)) ? (depuis || tuile(id)).getBoundingClientRect() : null, ev = eventail(ids.length, 0);
    if (!reduit()) cartes.forEach((c, k) => { const ox = o ? o.left + o.width / 2 - window.innerWidth / 2 : 0, oy = o ? o.top + o.height / 2 - window.innerHeight / 2 : 120; c.style.transition = 'none'; c.style.opacity = 0; c.style.transform = 'translate(-50%,-50%) translate3d(' + ox + 'px,' + (oy + ev[k].y) + 'px,-200px) rotate(' + ev[k].rot + 'deg) scale(.4)'; c.style.transitionDelay = (k * 38) + 'ms'; });
    voile.getBoundingClientRect(); requestAnimationFrame(() => { voile.classList.add('ouvert'); pose(centre, reduit()); setTimeout(() => cartes.forEach(c => { c.style.transitionDelay = ''; }), 700); });
    liaisons(); if (reduit()) pose(centre, true);
    voile.focus({ preventScroll: true }); return true;
  }
  function fermer(vite) {
    if (!voile) return false; const v = voile, c = cartes; window.removeEventListener('keydown', surTouche, true);
    voile = null; scene = null; cartes = []; dosOuvert = null;
    if (vite || reduit()) v.remove(); else { v.classList.remove('ouvert'); v.classList.add('ferme'); c.forEach((x, k) => { x.style.transitionDelay = (k * 20) + 'ms'; x.style.transform = 'translate(-50%,-50%) translate3d(0,80px,-300px) scale(.4)'; x.style.opacity = 0; }); setTimeout(() => v.remove(), 380); }
    try { precedentFocus && precedentFocus.focus && precedentFocus.focus({ preventScroll: true }); } catch (e) { /* élément disparu */ }
    return true;
  }
  function surTouche(e) {
    if (!voile) return; const t = e.target;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fermer(); return; }
    if (t && t.closest && t.closest('input,textarea,select') ) return;
    const n = toucheCarrousel(e.key, Math.round(centre), ids.length);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); allerA(n); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !(t.closest && t.closest('button'))) { e.preventDefault(); e.stopImmediatePropagation(); sortir(ids[Math.round(centre)]); return; }
    if (e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); allerA(Math.round(centre) + (e.shiftKey ? -1 : 1)); }
  }
  function liaisons() {
    window.addEventListener('keydown', surTouche, true);   // sur window : passe avant les captures de touches des vues 3D (vol de Saturne, navigation)
    voile.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'fermer') fermer(); else if (a === 'tout') toutAfficher(dosOuvert); else if (a === 'prec') allerA(Math.round(centre) - 1); else if (a === 'suiv') allerA(Math.round(centre) + 1);
    });
    voile.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.a === 'filtre') filtrer(e.target.value); });
    voile.addEventListener('change', e => { if (e.target.dataset.a === 'garde') gardeOuvert = e.target.checked; });
    voile.addEventListener('pointerdown', e => { if (e.target === voile || e.target === scene) { /* fond : un appui simple referme */ voile.dataset.fond = '1'; } else delete voile.dataset.fond; });
    scene.addEventListener('wheel', e => { e.preventDefault(); const t = performance.now(); if (t - tMolette < 140) return; tMolette = t; allerA(centreMolette(Math.round(centre), e.deltaY || e.deltaX, ids.length)); }, { passive: false });
    let drag = null;
    scene.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, c0: centre, carte: e.target.closest('.dos-carte'), pts: [{ t: performance.now(), x: e.clientX }], bouge: false };
      try { scene.setPointerCapture(e.pointerId); } catch (x) { /* pointeur synthétique */ }
    });
    scene.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.bouge && Math.hypot(dx, dy) > 8) { drag.bouge = true; drag.axe = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'; scene.classList.add('glisse'); }
      if (!drag.bouge) return; drag.pts.push({ t: performance.now(), x: e.clientX }); if (drag.pts.length > 8) drag.pts.shift();
      if (drag.axe === 'h') { centre = centreApresGlisse(drag.c0, dx, Math.max(90, largeurCarte * 0.5), ids.length); pose(centre, true); }
      else { const k = cartes[Math.round(centre)]; if (k) { k.style.transition = 'none'; k.style.translate = '0 ' + Math.max(-260, Math.min(160, dy)) + 'px'; } }
    });
    const fin = e => {
      if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; scene.classList.remove('glisse');
      try { scene.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ }
      const dy = e.clientY - d.y0, ci = Math.round(centre), cc = cartes[ci]; if (cc) cc.style.translate = '';
      if (e.type === 'pointercancel') { allerA(Math.round(centre)); return; }
      if (!d.bouge) { if (d.carte) { const k = +d.carte.dataset.k; if (k === ci) sortir(ids[k]); else allerA(k); } else if (voile && voile.dataset.fond) fermer(); return; }
      if (d.axe === 'v') { if (dy < -110) sortir(ids[ci]); else if (dy > 130) fermer(); else allerA(ci); return; }
      const a = d.pts[0], b = d.pts[d.pts.length - 1], v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
      allerA(centreFinal(centre, ids.length, v * 300 / Math.max(90, largeurCarte * 0.5)));
    };
    scene.addEventListener('pointerup', fin); scene.addEventListener('pointercancel', fin);
  }

  /* ── vol des fenêtres : du carrousel vers l'espace de travail, et retour ── */
  function fantome(r, html, classe) {
    const g = document.createElement('div'); g.className = 'dos-fantome ' + (classe || ''); g.innerHTML = html;
    Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); document.body.appendChild(g); return g;
  }
  function voler(g, de, vers, duree, fin) {
    const dx = vers.left - de.left, dy = vers.top - de.top, sx = Math.max(0.05, vers.width / de.width), sy = Math.max(0.05, vers.height / de.height);
    if (reduit() || !g.animate) { g.remove(); fin && fin(); return; }
    const an = g.animate([{ transform: 'translate(0,0) scale(1,1)', opacity: 1 }, { transform: 'translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - 40) + 'px) scale(' + ((1 + sx) / 2) + ',' + ((1 + sy) / 2) + ')', opacity: 0.9, offset: 0.55 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: 0.1 }], { duration: duree, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    an.onfinish = () => { g.remove(); fin && fin(); };
  }
  const enDom = r => (r ? { left: r.x, top: r.y, width: r.l, height: r.h } : null);
  function sortir(id) {
    if (!id) return false; const carte = scene && scene.querySelector('[data-id="' + id + '"]'), de = carte ? carte.getBoundingClientRect() : null, deja = estPosee(id);
    const res = poser(id);   // peut être asynchrone (mouvement, pathologie) : le vol part quand la fenêtre existe
    const apres = () => { majMur(); if (carte) carte.innerHTML = htmlCarte(id); const vers = enDom(rectFenetre(id)); if (de && vers && !deja) voler(fantome(de, '<span class="dos-carte-ico">' + esc(info(id).icone) + '</span><b>' + esc(info(id).titre) + '</b>', 'carte'), de, vers, 520); };
    if (res && typeof res.then === 'function') res.then(apres, () => {}); else apres();
    if (voile && !gardeOuvert) { if (de) setTimeout(() => fermer(), 60); else fermer(); }
    return true;
  }
  function rentrer(id) {
    const r = rectFenetre(id), d = dossiers.find(x => x.ids.includes(id)), t = d && tuile(d.id);
    const vers = t ? t.getBoundingClientRect() : { left: 20, top: window.innerHeight - 60, width: 140, height: 36 };
    if (!r) { ranger(id); majMur(); return false; }
    const g = fantome({ left: r.x, top: r.y, width: r.l, height: r.h }, '<span class="dos-carte-ico">' + esc(info(id).icone) + '</span><b>' + esc(info(id).titre) + '</b>', 'retour');
    ranger(id); majMur();
    voler(g, { left: r.x, top: r.y, width: r.l, height: r.h }, vers, 460, () => { if (t) { t.classList.add('dos-recoit'); setTimeout(() => t.classList.remove('dos-recoit'), 600); } });
    return true;
  }
  function toutAfficher(idDossier) {
    const d = dossier(idDossier); if (!d) return false; const cs = scene ? [...scene.children] : [];
    d.ids.forEach((id, k) => { if (estPosee(id)) return; const carte = cs[k], de = carte ? carte.getBoundingClientRect() : null; poser(id, { lot: true });
      const vers = enDom(rectFenetre(id)); if (de && vers) setTimeout(() => voler(fantome(de, '<span class="dos-carte-ico">' + esc(info(id).icone) + '</span><b>' + esc(info(id).titre) + '</b>', 'carte'), de, vers, 520), k * 60); });
    apresLot(d.ids); majMur(); if (voile) fermer(); return true;
  }
  return { rendreMur, majMur, ouvrir, fermer, sortir, rentrer, toutAfficher, ouvert: () => dosOuvert, centre: () => Math.round(centre), allerA, tuile, carte: id => (scene ? scene.querySelector('[data-id="' + id + '"]') : null), dossier, nbPosees };
}
