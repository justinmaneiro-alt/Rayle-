import { creerCalcul } from './fenetres-calcul.js';
import { vitesse, pasInertie, estLance, classerBalayage, aimanter, redimBord, echelleMolette, limiterRotation, angleEntre, deltaAngle, pasClavier, fenetreSuivante, cascade, carrouselFenetres, arcFenetres } from './gestes-calcul.js';
import { enregistrerSource } from './tiroir-fenetres.js';

/* ═════════════ GESTIONNAIRE DE FENÊTRES COMMUN (accueil, Mars, anatomie, Terre…) ═════════════
   Un seul module pour toutes les vues. R2 : barre de titre (déplacement souris ET doigt), coin, pincement, agrandir / restaurer, réduire, fermer, premier plan, mémoire par vue (`cle`),
   barre « Fenêtres » (liste, Réorganiser, Réduire tout, Tout fermer). R3 ajoute les gestes « Iron Man » pour TOUTES les fenêtres :
   - doigt : glisser avec INERTIE (la fenêtre glisse et ralentit), AIMANTATION douce aux bords et aux autres fenêtres, pincement à deux doigts (taille) avec ROTATION légère réglable,
     double appui sur la barre = agrandir / restaurer, balayage rapide vers le bas = réduire, vers le haut = remettre ;
   - souris (et curseur virtuel de la télécommande, qui envoie les mêmes événements) : glisser, MOLETTE sur la barre / les bords (ou Ctrl / Alt) = agrandir / réduire la fenêtre sous le curseur,
     8 bords et coins pour redimensionner, CLIC DROIT = menu (agrandir, réduire, épingler, ranger dans son dossier, fermer) ;
   - clavier : Tab / Maj+Tab (fenêtre sélectionnée) ou F6 pour passer de fenêtre en fenêtre, flèches = déplacer, Maj+flèches = redimensionner, Entrée = agrandir / restaurer, Échap = fermer, ? = aide ;
   - épingler (reste au premier plan, hors du rangement), « Réorganiser » en grille, cascade ou carrousel ;
   - effets holographiques : apparition avec scintillement et balayage de lumière, halo lumineux, parallaxe légère du halo, traînée pendant le déplacement, onde au point de contact. Réduits
     en mode léger / animations réduites / réglage « Effets » coupé (aucun effet ne change ce qui est affiché).
   Le style (verre sombre, bord fin cyan, coins coupés) est dans gestionnaire-fenetres.css pour le préfixe « gf » ; l'anatomie garde son préfixe « saf » et sa feuille de style.

   const gf = creerGestionnaire({ ui, ecran, prefixe, calc, cle, idRacine, surChangement, vue, surRanger });
   gf.ouvrir({ id, titre, sousTitre, genre, contenu, taille, position, pastille, sur, avertissement, epingle, rangeable, dossier }) → { id, el, corps }
   gf.fermer(id) · focus(id) · reduire(id, oui) · agrandir(id, oui) · epingler(id, oui) · ranger(id) · deplacer(id, x, y) · dimensionner(id, l, h) · reduireTout() · fermerTout()
   gf.reorganiser(mode = 'grille' | 'arc' | 'cascade' | 'carrousel') · menu(id, x, y) · aide(oui) · enregistrerTiroir({ vue, entrees }) · liste() · obtenir(id) · recouvrements() · redimensionner() · dispose() */
export const CLE_STOCKAGE = 'rayle_fenetres_';
const CLE_PREFS = 'rayle_fenetres_prefs', CLE_EFFETS = 'rayle_fenetres_effets';
const lireMemoire = cle => { try { return JSON.parse(localStorage.getItem(CLE_STOCKAGE + cle) || '{}') || {}; } catch (e) { return {}; } };
const ecrireMemoire = (cle, m) => { try { localStorage.setItem(CLE_STOCKAGE + cle, JSON.stringify(m)); } catch (e) { /* stockage interdit : tant pis */ } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Réglages de la manipulation (sur l'appareil) : rotation à deux doigts, parallaxe, inertie ; « effets » dans une clé à part (partagée avec les dossiers). */
export function lirePrefs() {
  const d = { rotation: true, parallaxe: true, inertie: true, aimant: true };
  try { Object.assign(d, JSON.parse(localStorage.getItem(CLE_PREFS) || '{}') || {}); } catch (e) { /* valeur corrompue */ }
  try { d.effets = localStorage.getItem(CLE_EFFETS) !== '0'; } catch (e) { d.effets = true; }
  return d;
}
export function ecrirePrefs(p) {
  try { const { effets, ...reste } = p; localStorage.setItem(CLE_PREFS, JSON.stringify(reste)); if (effets !== undefined) localStorage.setItem(CLE_EFFETS, effets ? '1' : '0'); } catch (e) { /* stockage interdit */ }
}
/* Les effets sont réduits en mode léger, avec « animations réduites » ou si le réglage est coupé. */
export function effetsActifs() {
  if (!lirePrefs().effets) return false;
  try { if (document.body.dataset.hud === 'leger' || matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) { /* pas de matchMedia */ }
  return true;
}
const sansAnimation = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
/* Un appui qui change la fenêtre (double appui, balayage) ne doit pas « traverser » : le clic synthétique qui suit tomberait sur ce qui se trouve maintenant sous le doigt. */
export function avalerClic(ms = 450) {
  const stop = e => { e.stopPropagation(); e.preventDefault(); };
  document.addEventListener('click', stop, true); setTimeout(() => document.removeEventListener('click', stop, true), ms);
}
let dernier = null;                                   // dernier gestionnaire manipulé (pour F6)

export function creerGestionnaire({ ui, ecran = () => ({ l: window.innerWidth, h: window.innerHeight }), surChangement = () => {}, prefixe = 'gf', calc = null, cle = null, idRacine = null, libelleBarre = 'Fenêtres', barreVisible = true, classeSupp = '', vue = '', surRanger = null, rangeableParDefaut = false } = {}) {
  chargerStyleGestes();
  const C = calc || creerCalcul();
  const { MARGE, MINI_L, MINI_H, HAUT_RESERVE, BAS_RESERVE, etroit, tailleParDefaut, placer, limiter, reorganiser, recouvrements, pleinEcran, pincer } = C;
  const p = prefixe;
  const racine = document.createElement('div'); racine.id = idRacine || (p + '-racine'); racine.className = p + '-racine'; ui.appendChild(racine);
  const barre = document.createElement('div'); barre.className = p + '-barre'; barre.hidden = true; barre.setAttribute('role', 'toolbar'); barre.setAttribute('aria-label', 'Gestionnaire de fenêtres');
  barre.innerHTML = '<span class="' + p + '-barre-t">' + esc(libelleBarre) + ' <b data-r="n">0</b></span><span class="' + p + '-chips" data-r="chips"></span><button type="button" data-g="reduire" title="Réduire ou rétablir toutes les fenêtres">Réduire tout</button><span class="' + p + '-ranger"><button type="button" data-g="ranger" title="Replacer les fenêtres en grille, sans recouvrement">Réorganiser</button><button type="button" data-g="mode" title="Grille, cascade ou carrousel" aria-label="Choisir la disposition" aria-haspopup="true">&#9662;</button></span><button type="button" data-g="fermer" title="Fermer toutes les fenêtres">Tout fermer</button><button type="button" data-g="aide" title="Raccourcis et réglages des fenêtres" aria-label="Aide des fenêtres">?</button>';
  ui.appendChild(barre);
  const fen = new Map();                 // id → { el, corps, ombre, titre, genre, rect, reduite, max, avantMax, ordre, sur, epingle, rangeable }
  let z = 20, ordre = 0, memoire = cle ? lireMemoire(cle) : {}, menuEl = null, aideEl = null, trace0 = 0;
  const bloquer = el => { for (const t of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'keydown', 'keyup', 'dblclick', 'contextmenu']) el.addEventListener(t, e => { e.stopPropagation(); }); };
  bloquer(barre);
  const utile = () => { const e = ecran(); return { x: MARGE, y: HAUT_RESERVE, l: e.l - 2 * MARGE, h: e.h - HAUT_RESERVE - BAS_RESERVE }; };

  const lire = f => ({ id: f.id, ...f.rect });
  const memoriser = f => { if (!cle) return; memoire[f.id] = { x: f.rect.x, y: f.rect.y, l: f.rect.l, h: f.rect.h, r: f.reduite ? 1 : 0, m: f.max ? 1 : 0, e: f.epingle ? 1 : 0 }; ecrireMemoire(cle, memoire); };
  const syncOmbre = f => { if (!f.ombre) return; const s = f.ombre.style; s.left = f.rect.x + 'px'; s.top = f.rect.y + 'px'; s.width = f.rect.l + 'px'; s.height = f.el.offsetHeight + 'px'; };
  const poser = (f, r) => { f.rect = limiter(r, ecran()); const s = f.el.style; s.left = f.rect.x + 'px'; s.top = f.rect.y + 'px'; s.width = f.rect.l + 'px'; s.height = f.reduite ? 'auto' : f.rect.h + 'px'; syncOmbre(f); };
  const autresRects = f => [...fen.values()].filter(g => g !== f && !g.reduite).map(lire);
  function majBarre() {
    barre.hidden = !barreVisible || fen.size === 0; barre.querySelector('[data-r="n"]').textContent = fen.size;
    barre.querySelector('[data-r="chips"]').innerHTML = [...fen.values()].map(f => '<button type="button" class="' + p + '-chip' + (f.el.classList.contains(p + '-focus') ? ' actif' : '') + (f.reduite ? ' reduite' : '') + (f.epingle ? ' epingle' : '') + '" data-id="' + esc(f.id) + '" title="' + esc(f.titre) + '">' + esc(f.titre.slice(0, 22)) + '</button>').join('');
    surChangement(api.liste());
  }
  function focus(id, clavier) {
    const f = fen.get(id); if (!f) return; for (const g of fen.values()) g.el.classList.toggle(p + '-focus', g === f);
    f.el.style.zIndex = (f.epingle ? 4000 : 0) + (++z); if (f.ombre) f.ombre.style.zIndex = (f.epingle ? 4000 : 0) + z - 1; if (f.reduite && etroit(ecran())) api.reduire(id, false); majBarre();
    if (clavier) { try { f.el.focus({ preventScroll: true }); } catch (e) { /* élément non focalisable */ } } dernier = api;
  }
  function fermer(id) {
    const f = fen.get(id); if (!f) return false; arreter(f); fen.delete(id);
    try { if (f.sur && f.sur.fermer) f.sur.fermer(); } catch (e) { /* un module défaillant ne bloque pas la fermeture */ }
    if (f.obs) f.obs.disconnect(); if (f.ombre) f.ombre.remove(); f.el.remove(); const reste = [...fen.values()].sort((a, b) => b.ordre - a.ordre)[0]; if (reste) focus(reste.id); else majBarre(); return true;
  }
  const arreter = f => { f.inertie = false; };
  /* Glisser avec un pointeur (souris, doigt, curseur virtuel de la télécommande) : relâché = fin, annulé = fin. */
  function glisser(cible, e, dep, fin2) {
    cible.setPointerCapture && (() => { try { cible.setPointerCapture(e.pointerId); } catch (x) { /* pointeur synthétique */ } })();
    const bouge = ev => { if (ev.pointerId === e.pointerId) dep(ev); }, fin = ev => { if (ev.pointerId !== e.pointerId) return; cible.removeEventListener('pointermove', bouge); cible.removeEventListener('pointerup', fin); cible.removeEventListener('pointercancel', fin); try { cible.releasePointerCapture(ev.pointerId); } catch (x) { /* déjà relâché */ } fin2(ev); };
    cible.addEventListener('pointermove', bouge); cible.addEventListener('pointerup', fin); cible.addEventListener('pointercancel', fin);
  }

  /* ── effets holographiques (réduits si effetsActifs() est faux) ── */
  function onde(f, e) {
    if (!effetsActifs()) return; const r = f.el.getBoundingClientRect(), o = document.createElement('i'); o.className = 'gfx-onde';
    o.style.left = (e.clientX - r.left) + 'px'; o.style.top = (e.clientY - r.top) + 'px'; f.el.appendChild(o); setTimeout(() => o.remove(), 650);
  }
  function traine(f, avant) {
    if (!effetsActifs()) return; const t = performance.now(); if (t - trace0 < 45) return; trace0 = t;
    if (racine.querySelectorAll('.gfx-trace').length > 7) return;
    const g = document.createElement('div'); g.className = 'gfx-trace'; Object.assign(g.style, { left: avant.x + 'px', top: avant.y + 'px', width: avant.l + 'px', height: f.el.offsetHeight + 'px', zIndex: 1 });
    racine.appendChild(g); setTimeout(() => g.remove(), 430);
  }
  /* parallaxe légère : le halo de chaque fenêtre se décale à l'opposé du pointeur (souris seulement) */
  let rafPar = 0;
  const surPointeurPar = e => {
    if (e.pointerType === 'touch' || rafPar || !effetsActifs() || !lirePrefs().parallaxe) return;
    rafPar = requestAnimationFrame(() => { rafPar = 0; const x = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2, y = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2; racine.style.setProperty('--gfx-px', x.toFixed(3)); racine.style.setProperty('--gfx-py', y.toFixed(3)); });
  };
  window.addEventListener('pointermove', surPointeurPar, { passive: true });

  /* ── inertie après un lancer ── */
  function lancer(f, v) {
    f.inertie = true; let t = performance.now();
    const boucle = maintenant => {
      if (!f.inertie || !fen.has(f.id)) return; const dt = Math.min(34, maintenant - t); t = maintenant; const s = pasInertie(v, dt);
      const brut = { ...f.rect, x: f.rect.x + s.dx, y: f.rect.y + s.dy }, lim = limiter(brut, ecran());
      v = { vx: lim.x !== brut.x ? -s.vx * 0.25 : s.vx, vy: lim.y !== brut.y ? -s.vy * 0.25 : s.vy }; poser(f, lim);
      if (s.fini) { f.inertie = false; fin(); } else requestAnimationFrame(boucle);
    };
    const fin = () => { if (lirePrefs().aimant) poser(f, aimanter(f.rect, autresRects(f), utile())); memoriser(f); f.el.classList.remove(p + '-deplace'); };
    requestAnimationFrame(boucle);
  }

  /* ── menu de fenêtre (clic droit) ── */
  function fermerMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function menu(id, x, y) {
    const f = fen.get(id); if (!f) return false; fermerMenu(); focus(id);
    menuEl = document.createElement('div'); menuEl.className = 'gfx-menu'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', 'Menu de la fenêtre ' + f.titre);
    const it = [['agrandir', f.max ? 'Restaurer' : 'Agrandir'], ['reduire', f.reduite ? 'Rétablir' : 'Réduire'], ['epingler', f.epingle ? 'Détacher' : 'Épingler au premier plan']];
    if (f.rangeable) it.push(['ranger', 'Ranger dans son dossier']); it.push(['fermer', 'Fermer']);
    menuEl.innerHTML = '<b class="gfx-menu-t">' + esc(f.titre) + '</b>' + it.map(([a, t]) => '<button type="button" role="menuitem" data-m="' + a + '">' + esc(t) + '</button>').join('');
    bloquer(menuEl); racine.appendChild(menuEl);
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight, e = ecran(); menuEl.style.left = Math.max(4, Math.min(x, e.l - w - 4)) + 'px'; menuEl.style.top = Math.max(4, Math.min(y, e.h - h - 4)) + 'px';
    menuEl.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (!b) return; const a = b.dataset.m; fermerMenu(); if (a === 'agrandir') api.agrandir(id); else if (a === 'reduire') api.reduire(id); else if (a === 'epingler') api.epingler(id); else if (a === 'ranger') api.ranger(id); else if (a === 'fermer') fermer(id); });
    menuEl.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); fermerMenu(); try { f.el.focus({ preventScroll: true }); } catch (x) { /* fermée */ } } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const b = [...menuEl.querySelectorAll('button')], i = b.indexOf(document.activeElement); b[(i + (ev.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length].focus(); } });
    const b0 = menuEl.querySelector('button'); if (b0) b0.focus({ preventScroll: true }); return true;
  }
  const surFondMenu = e => { if (menuEl && !menuEl.contains(e.target)) fermerMenu(); };
  document.addEventListener('pointerdown', surFondMenu, true);

  /* ── aide et réglages ── */
  function aide(oui) {
    const veut = oui === undefined ? !aideEl : !!oui; if (!veut) { if (aideEl) { aideEl.remove(); aideEl = null; } return false; } if (aideEl) return true;
    const pr = lirePrefs(); aideEl = document.createElement('div'); aideEl.className = 'gfx-aide'; aideEl.setAttribute('role', 'dialog'); aideEl.setAttribute('aria-label', 'Aide des fenêtres');
    aideEl.innerHTML = '<header><b>Manipuler les fenêtres</b><button type="button" data-a="x" aria-label="Fermer l’aide">✕</button></header><div class="gfx-aide-c"><h4>Doigt</h4><ul><li>Glisser la barre de titre : déplacer (la fenêtre glisse et ralentit)</li><li>Pincer à deux doigts : agrandir / réduire (et pivoter légèrement)</li><li>Double appui sur la barre : agrandir / restaurer</li><li>Balayage rapide vers le bas : réduire · vers le haut : remettre</li></ul><h4>Souris</h4><ul><li>Glisser la barre · bords et coins : redimensionner</li><li>Molette sur la barre ou un bord (ou Ctrl + molette) : agrandir / réduire</li><li>Clic droit : menu (agrandir, réduire, épingler, ranger, fermer)</li></ul><h4>Clavier</h4><ul><li>Tab / Maj+Tab ou F6 : passer d’une fenêtre à l’autre</li><li>Flèches : déplacer · Maj + flèches : redimensionner · Ctrl : pas ×4</li><li>Entrée : agrandir / restaurer · Échap : fermer · ? : cette aide · Alt+T : tiroir de fenêtres</li></ul><h4>Réglages</h4>'
      + '<label><input type="checkbox" data-p="effets"' + (pr.effets ? ' checked' : '') + '> Effets holographiques (scintillement, traînée, onde)</label><label><input type="checkbox" data-p="rotation"' + (pr.rotation ? ' checked' : '') + '> Rotation légère à deux doigts</label><label><input type="checkbox" data-p="parallaxe"' + (pr.parallaxe ? ' checked' : '') + '> Profondeur (halo qui suit le pointeur)</label><label><input type="checkbox" data-p="inertie"' + (pr.inertie ? ' checked' : '') + '> Inertie au lancer</label><label><input type="checkbox" data-p="aimant"' + (pr.aimant ? ' checked' : '') + '> Aimantation aux bords</label></div>';
    bloquer(aideEl); ui.appendChild(aideEl);
    aideEl.addEventListener('click', e => { if (e.target.closest('[data-a="x"]')) aide(false); });
    aideEl.addEventListener('change', e => { const c = e.target.closest('input[data-p]'); if (!c) return; ecrirePrefs({ ...lirePrefs(), [c.dataset.p]: c.checked }); });
    aideEl.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); aide(false); } });
    const b = aideEl.querySelector('button'); if (b) b.focus({ preventScroll: true }); return true;
  }

  const api = {
    racine, barre, calc: C,
    ouvrir({ id, titre, sousTitre = '', genre = 'fiche', contenu = '', taille = null, position = null, pastille = '', sur = null, avertissement = '', epingle = false, rangeable = null, dossier = '' }) {
      let f = fen.get(id);
      if (!f) {
        const el = document.createElement('section'); el.className = p + ' gfx-fen' + (classeSupp ? ' ' + classeSupp : ''); el.dataset.id = id; el.dataset.genre = genre; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', titre); el.tabIndex = 0;
        el.innerHTML = '<header class="' + p + '-t"><i class="' + p + '-pastille" data-r="pastille"></i><span class="' + p + '-titres"><b class="' + p + '-titre" data-r="titre"></b><small class="' + p + '-sous" data-r="sous"></small></span><span class="' + p + '-b"><button type="button" data-b="ranger" title="Remettre dans son dossier" aria-label="Remettre dans son dossier" hidden>&#8617;</button><button type="button" data-b="epingler" title="Épingler au premier plan" aria-label="Épingler" aria-pressed="false">&#9685;</button><button type="button" data-b="reduire" title="Réduire / rétablir" aria-label="Réduire">&#8211;</button><button type="button" data-b="agrandir" title="Agrandir / restaurer" aria-label="Agrandir">&#9633;</button><button type="button" data-b="fermer" title="Fermer" aria-label="Fermer">&#10005;</button></span></header><div class="' + p + '-corps" data-r="corps"></div><footer class="' + p + '-pied" data-r="pied" hidden></footer><i class="' + p + '-poignee" data-r="poignee" title="Redimensionner"></i>'
          + ['n', 's', 'e', 'w', 'ne', 'nw', 'sw'].map(b => '<i class="gfx-bord gfx-bord-' + b + '" data-bord="' + b + '"></i>').join('') + '<i class="gfx-balayage"></i>';
        racine.appendChild(el); bloquer(el);
        f = { id, el, corps: el.querySelector('[data-r="corps"]'), titre, genre, rect: null, reduite: false, max: false, avantMax: null, ordre: ++ordre, sur, epingle: false, rangeable: false, dernierTap: 0, dernierAgrandir: 0, rotation: 0 };
        if (effetsActifs()) { f.ombre = document.createElement('div'); f.ombre.className = 'gfx-ombre'; racine.insertBefore(f.ombre, el); el.classList.add('gfx-apparait'); setTimeout(() => el.classList.remove('gfx-apparait'), 900); }
        fen.set(id, f);
        const m = memoire[id], t = taille || tailleParDefaut(genre, ecran());
        const r = m ? { x: m.x, y: m.y, l: m.l, h: m.h } : position ? { x: position.x, y: position.y, l: t.l, h: t.h } : placer([...fen.values()].filter(g => g !== f && !g.reduite).map(lire), t, ecran());
        poser(f, r);
        if (m && m.m) { f.avantMax = { ...f.rect }; f.max = true; el.classList.add(p + '-max'); poser(f, pleinEcran(ecran())); }
        const entete = el.querySelector('.' + p + '-t');
        /* déplacement : souris, doigt, curseur virtuel ; inertie, aimantation, traînée, balayage et double appui */
        entete.addEventListener('pointerdown', e => {
          if (e.target.closest('button') || (e.button !== 0 && e.pointerType === 'mouse')) return; focus(id); arreter(f);
          const dx = e.clientX - f.rect.x, dy = e.clientY - f.rect.y, depart = { ...f.rect }, t0 = performance.now(), pts = [{ t: t0, x: e.clientX, y: e.clientY }], x0 = e.clientX, y0 = e.clientY, deplacable = !etroit(ecran()) && !f.max; let bouge = false;
          if (deplacable) el.classList.add(p + '-deplace');
          glisser(entete, e, ev => {
            pts.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); if (pts.length > 12) pts.shift(); if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) bouge = true; if (!deplacable) return;
            const avant = { ...f.rect }, brut = { ...f.rect, x: ev.clientX - dx, y: ev.clientY - dy };
            poser(f, lirePrefs().aimant ? aimanter(brut, autresRects(f), utile()) : brut); if (bouge) traine(f, avant);
          }, ev => {
            const dt = performance.now() - t0, tdx = ev.clientX - x0, tdy = ev.clientY - y0;
            if (ev.type === 'pointerup' && ev.pointerType === 'touch') {
              const sens = classerBalayage(tdx, tdy, dt, { distance: 60, vitesseMin: 0.7 });
              if ((sens === 'bas' && !f.reduite) || (sens === 'haut' && f.reduite)) { avalerClic(); if (deplacable) poser(f, depart); el.classList.remove(p + '-deplace'); api.reduire(id, sens === 'bas'); return; }
              if (!bouge && dt < 320) { const maintenant = performance.now(); if (maintenant - f.dernierTap < 360) { f.dernierTap = 0; f.dernierAgrandir = maintenant; avalerClic(); el.classList.remove(p + '-deplace'); api.agrandir(id); return; } f.dernierTap = maintenant; }
            }
            if (!deplacable) { el.classList.remove(p + '-deplace'); return; }
            pts.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); const v = vitesse(pts);   // le relâchement compte : une pause avant de lâcher annule le lancer
            if (ev.type === 'pointerup' && bouge && lirePrefs().inertie && !sansAnimation() && estLance(v)) { lancer(f, v); return; }
            el.classList.remove(p + '-deplace'); memoriser(f);
          });
        });
        entete.addEventListener('dblclick', e => { if (!e.target.closest('button') && performance.now() - f.dernierAgrandir > 500) api.agrandir(id); });
        /* coin sud-est (poignée) et 7 autres bords / coins */
        const demarrerRedim = (cibleEl, bordNom, e) => {
          if ((e.button !== 0 && e.pointerType === 'mouse') || etroit(ecran()) || f.max) return; e.stopPropagation(); focus(id); arreter(f);
          const x0 = e.clientX, y0 = e.clientY, r0 = { ...f.rect }; el.classList.add(p + '-redim');
          glisser(cibleEl, e, ev => { poser(f, redimBord(r0, bordNom, ev.clientX - x0, ev.clientY - y0, C, ecran())); if (f.sur && f.sur.redim) f.sur.redim(f.rect); }, () => { el.classList.remove(p + '-redim'); memoriser(f); });
        };
        const poi = el.querySelector('[data-r="poignee"]'); poi.addEventListener('pointerdown', e => demarrerRedim(poi, 'se', e));
        for (const b of el.querySelectorAll('[data-bord]')) b.addEventListener('pointerdown', e => demarrerRedim(b, b.dataset.bord, e));
        /* pincement à deux doigts n'importe où sur la fenêtre (+ rotation légère) */
        const doigts = new Map(); let pince = null;
        const deuxPoints = () => [...doigts.values()];
        const dist = () => { const [a, b] = deuxPoints(); return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
        el.addEventListener('pointerdown', e => {
          if (!el.classList.contains(p + '-focus')) focus(id); dernier = api; onde(f, e);
          if (e.pointerType !== 'touch' || e.target.closest('canvas,[data-pas-pincer]')) return; doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (doigts.size === 2 && !f.max && !etroit(ecran())) { const [a, b] = deuxPoints(); pince = { d0: dist(), r0: { ...f.rect }, a0: angleEntre(a, b) }; arreter(f); }
        });
        el.addEventListener('pointermove', e => {
          if (!doigts.has(e.pointerId)) return; doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pince && doigts.size === 2) {
            poser(f, pincer(pince.r0, dist() / pince.d0, ecran())); if (f.sur && f.sur.redim) f.sur.redim(f.rect);
            if (lirePrefs().rotation) { const [a, b] = deuxPoints(); f.rotation = limiterRotation(deltaAngle(angleEntre(a, b), pince.a0)); el.style.rotate = f.rotation.toFixed(2) + 'deg'; }
          }
        });
        const finDoigt = e => {
          if (!doigts.delete(e.pointerId)) return;
          if (pince && doigts.size < 2) { pince = null; memoriser(f); if (f.rotation) { f.rotation = 0; el.style.transition = 'rotate .28s ease-out'; el.style.rotate = '0deg'; setTimeout(() => { el.style.transition = ''; el.style.rotate = ''; }, 320); } }
        };
        el.addEventListener('pointerup', finDoigt); el.addEventListener('pointercancel', finDoigt);
        /* molette : agrandit / réduit la fenêtre sous le curseur (barre, bords, Ctrl / Alt, ou corps qui ne défile pas) */
        el.addEventListener('wheel', e => {
          if (etroit(ecran()) || f.max || e.target.closest('canvas,[data-pas-pincer],input,textarea,select')) return;
          const surCadre = !!e.target.closest('.' + p + '-t,.' + p + '-poignee,[data-bord],.' + p + '-pied'), c = f.corps, defile = c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2;
          if (!(surCadre || e.ctrlKey || e.altKey || !defile)) return; e.preventDefault(); arreter(f);
          poser(f, pincer(f.rect, echelleMolette(e.deltaY), ecran())); if (f.sur && f.sur.redim) f.sur.redim(f.rect); clearTimeout(f.tMol); f.tMol = setTimeout(() => memoriser(f), 250);
        }, { passive: false });
        /* clic droit : menu de fenêtre */
        el.addEventListener('contextmenu', e => { if (e.target.closest('input,textarea')) return; e.preventDefault(); menu(id, e.clientX, e.clientY); });
        /* clavier : la fenêtre (cadre) a le focus */
        el.addEventListener('keydown', e => {
          if (e.target !== el) return;
          const k = e.key;
          if (k === 'Tab') { e.preventDefault(); const s = fenetreSuivante(ordreClavier(), id, e.shiftKey); if (s) focus(s, true); return; }
          if (k === 'Escape') { e.preventDefault(); fermer(id); return; }
          if (k === 'Enter') { e.preventDefault(); api.agrandir(id); return; }
          if (k === '?' || k === 'F1') { e.preventDefault(); aide(); return; }
          if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) { e.preventDefault(); const r = el.getBoundingClientRect(); menu(id, r.left + 24, r.top + 24); return; }
          const pas = pasClavier(k, { maj: e.shiftKey, ctrl: e.ctrlKey }); if (!pas || f.max) return; e.preventDefault();
          if (pas.dl || pas.dh) api.dimensionner(id, f.rect.l + pas.dl, f.rect.h + pas.dh); else api.deplacer(id, f.rect.x + pas.dx, f.rect.y + pas.dy);
        });
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-b]'); if (!b) return;
          if (b.dataset.b === 'fermer') fermer(id); else if (b.dataset.b === 'agrandir') api.agrandir(id); else if (b.dataset.b === 'epingler') api.epingler(id); else if (b.dataset.b === 'ranger') api.ranger(id); else api.reduire(id);
        });
        if (typeof ResizeObserver !== 'undefined') { new ResizeObserver(() => { if (f.sur && f.sur.redim && !f.reduite) f.sur.redim(f.rect); }).observe(f.corps); f.obs = new ResizeObserver(() => syncOmbre(f)); f.obs.observe(el); }
        if (m && m.r) { f.reduite = true; el.classList.add(p + '-reduite'); el.style.height = 'auto'; }
        if (m && m.e) { f.epingle = true; }
      } else { f.sur = sur || f.sur; f.titre = titre; if (taille && !f.max) poser(f, { ...f.rect, l: taille.l, h: taille.h }); }
      if (epingle) f.epingle = true;
      f.el.dataset.genre = genre; f.el.setAttribute('aria-label', titre); f.rangeable = (rangeable === null ? (typeof rangeableParDefaut === 'function' ? !!rangeableParDefaut(id) : !!rangeableParDefaut) : !!rangeable) && !!surRanger; f.dossier = dossier || f.dossier || '';
      f.el.classList.toggle('gfx-epingle', f.epingle); const be = f.el.querySelector('[data-b="epingler"]'); be.setAttribute('aria-pressed', f.epingle ? 'true' : 'false'); be.classList.toggle('actif', f.epingle);
      const br = f.el.querySelector('[data-b="ranger"]'); br.hidden = !f.rangeable; if (f.dossier) br.title = 'Remettre dans le dossier « ' + f.dossier + ' »';
      f.el.querySelector('[data-r="titre"]').textContent = titre; f.el.querySelector('[data-r="sous"]').textContent = sousTitre; f.el.querySelector('[data-r="pastille"]').dataset.p = pastille;
      const pied = f.el.querySelector('[data-r="pied"]'); pied.hidden = !avertissement; pied.textContent = avertissement;
      if (contenu !== null && contenu !== undefined && contenu !== '__garder__') { if (typeof contenu === 'string') f.corps.innerHTML = contenu; else { f.corps.textContent = ''; f.corps.appendChild(contenu); } }
      if (!f.reduite || !memoire[id]) { f.reduite = false; f.el.classList.remove(p + '-reduite'); }
      focus(id); syncOmbre(f); return { id, el: f.el, corps: f.corps };
    },
    fermer, focus,
    obtenir: id => { const f = fen.get(id); return f ? { id, el: f.el, corps: f.corps, rect: { ...f.rect }, reduite: f.reduite, max: f.max, epingle: !!f.epingle } : null; },
    reduire(id, oui) {
      const f = fen.get(id); if (!f) return; f.reduite = oui === undefined ? !f.reduite : !!oui; f.el.classList.toggle(p + '-reduite', f.reduite); f.el.style.height = f.reduite ? 'auto' : f.rect.h + 'px';
      if (!f.reduite) { poser(f, f.rect); focus(id); } majBarre(); memoriser(f); syncOmbre(f);
    },
    agrandir(id, oui) {
      const f = fen.get(id); if (!f) return;
      const veut = oui === undefined ? !f.max : !!oui; if (veut === f.max) return;
      if (veut) { f.avantMax = { ...f.rect }; f.max = true; f.reduite = false; f.el.classList.remove(p + '-reduite'); f.el.classList.add(p + '-max'); poser(f, pleinEcran(ecran())); }
      else { f.max = false; f.el.classList.remove(p + '-max'); poser(f, f.avantMax || f.rect); }
      if (f.sur && f.sur.redim) f.sur.redim(f.rect); focus(id); memoriser(f);
    },
    /* Épingle : reste au premier plan, ignorée par « Réorganiser » et « Réduire tout ». */
    epingler(id, oui) {
      const f = fen.get(id); if (!f) return false; f.epingle = oui === undefined ? !f.epingle : !!oui; f.el.classList.toggle('gfx-epingle', f.epingle);
      const be = f.el.querySelector('[data-b="epingler"]'); be.setAttribute('aria-pressed', f.epingle ? 'true' : 'false'); be.classList.toggle('actif', f.epingle); focus(id); memoriser(f); return f.epingle;
    },
    /* Remet la fenêtre dans son dossier (le propriétaire de la vue anime le retour puis la ferme). */
    ranger(id) { const f = fen.get(id); if (!f || !surRanger) return false; surRanger(id); return true; },
    deplacer(id, x, y) { const f = fen.get(id); if (!f || f.max) return false; poser(f, { ...f.rect, x, y }); memoriser(f); return true; },
    dimensionner(id, l, h) { const f = fen.get(id); if (!f || f.max) return false; poser(f, { ...f.rect, l, h }); if (f.sur && f.sur.redim) f.sur.redim(f.rect); memoriser(f); return true; },
    reduireTout() { const cibles = [...fen.values()].filter(f => !f.epingle), tout = cibles.every(f => f.reduite); for (const f of cibles) api.reduire(f.id, !tout); },
    fermerTout() { for (const id of [...fen.keys()]) fermer(id); },
    menu, aide, fermerMenu,
    /* Replace les fenêtres ouvertes (hors épinglées) : grille propre (défaut), cascade ou carrousel. */
    reorganiser(mode = 'grille') {
      const e = ecran(), cibles = [...fen.values()].filter(f => !f.epingle).sort((a, b) => a.ordre - b.ordre).map(lire);
      const dispo = mode === 'cascade' ? cascade(cibles, e, C) : mode === 'carrousel' ? carrouselFenetres(cibles, e, C, Math.floor((cibles.length - 1) / 2)) : mode === 'arc' ? arcFenetres(cibles, e, C) : reorganiser(cibles, e);
      for (const q of dispo) { const f = fen.get(q.id); f.reduite = false; f.max = false; f.el.classList.remove(p + '-reduite', p + '-max'); poser(f, q); if (f.sur && f.sur.redim) f.sur.redim(f.rect); memoriser(f); }
      if (mode === 'carrousel') for (const q of [...dispo].sort((a, b) => a.zOrdre - b.zOrdre)) focus(q.id);
      majBarre();
    },
    /* Après un changement de taille de la fenêtre du navigateur : tout ramener dans l'écran. */
    redimensionner() { for (const f of fen.values()) poser(f, f.max ? pleinEcran(ecran()) : f.rect); if (fen.size && !cle) api.reorganiser(); },
    oublier() { memoire = {}; if (cle) ecrireMemoire(cle, memoire); },
    liste: () => [...fen.values()].sort((a, b) => a.ordre - b.ordre).map(f => ({ id: f.id, titre: f.titre, genre: f.genre, reduite: f.reduite, max: f.max, epingle: !!f.epingle, ...f.rect })),
    recouvrements: () => recouvrements([...fen.values()].filter(f => !f.reduite).map(lire)),
    /* Tiroir global : remplace la liste par défaut (les fenêtres ouvertes) par un catalogue complet de la vue. */
    enregistrerTiroir(source) { tiroirSource = source; },
    dispose() { for (const id of [...fen.keys()]) fermer(id); fermerMenu(); aide(false); racine.remove(); barre.remove(); window.removeEventListener('resize', surRedim); window.removeEventListener('pointermove', surPointeurPar); document.removeEventListener('pointerdown', surFondMenu, true); document.removeEventListener('keydown', surF6, true); retirerTiroir(); if (dernier === api) dernier = null; }
  };
  const ordreClavier = () => [...fen.values()].sort((a, b) => a.ordre - b.ordre).map(f => f.id);
  barre.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.g === 'fermer') api.fermerTout(); else if (b.dataset.g === 'reduire') api.reduireTout(); else if (b.dataset.g === 'ranger') api.reorganiser('grille'); else if (b.dataset.g === 'aide') aide();
    else if (b.dataset.g === 'mode') ouvrirModes(b);
    else if (b.dataset.id) { const f = fen.get(b.dataset.id); if (f) { if (f.reduite) api.reduire(f.id, false); focus(f.id, true); } }
  });
  /* choix de la disposition : grille, cascade, carrousel */
  function ouvrirModes(ancre) {
    fermerMenu(); menuEl = document.createElement('div'); menuEl.className = 'gfx-menu gfx-modes'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', 'Disposition des fenêtres');
    menuEl.innerHTML = [['grille', 'Grille'], ['arc', 'Arc devant moi'], ['cascade', 'Cascade'], ['carrousel', 'Carrousel']].map(([m, t]) => '<button type="button" role="menuitem" data-mode="' + m + '">' + t + '</button>').join('');
    bloquer(menuEl); ui.appendChild(menuEl); const r = ancre.getBoundingClientRect(); menuEl.style.position = 'fixed'; menuEl.style.left = Math.max(4, r.left) + 'px'; menuEl.style.top = Math.max(4, r.top - menuEl.offsetHeight - 6) + 'px'; menuEl.style.zIndex = 80;
    menuEl.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; const m = b.dataset.mode; fermerMenu(); api.reorganiser(m); });
    menuEl.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fermerMenu(); } });
    const b0 = menuEl.querySelector('button'); if (b0) b0.focus({ preventScroll: true });
  }
  /* F6 : fenêtre suivante (Maj+F6 : précédente), pour le dernier gestionnaire manipulé */
  const surF6 = e => {
    if (e.key !== 'F6' || dernier !== api || !fen.size) return; const t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable]')) return;
    e.preventDefault(); const ids = ordreClavier(), courant = [...fen.values()].find(f => f.el.classList.contains(p + '-focus')), s = fenetreSuivante(ids, courant ? courant.id : null, e.shiftKey); if (s) { const f = fen.get(s); if (f.reduite) api.reduire(s, false); focus(s, true); }
  };
  document.addEventListener('keydown', surF6, true);
  const surRedim = () => api.redimensionner(); window.addEventListener('resize', surRedim);
  /* tiroir : par défaut les fenêtres ouvertes de ce gestionnaire */
  let tiroirSource = null;
  const retirerTiroir = enregistrerSource(vue ? vue : (cle || idRacine || p + '-' + Math.random().toString(36).slice(2, 7)), { get vue() { return tiroirSource ? tiroirSource.vue : (vue || libelleBarre); }, entrees: () => (tiroirSource ? tiroirSource.entrees() : [...fen.values()].map(f => ({ id: f.id, titre: f.titre, dossier: f.dossier || 'Ouvertes', posee: true, apercu: '', afficher: () => { if (f.reduite) api.reduire(f.id, false); focus(f.id, true); } }))) });
  return api;
}

/* Effets et gestes communs à tous les préfixes (gfx-*), chargés avec le premier gestionnaire. */
export function chargerStyleGestes() {
  if (typeof document === 'undefined' || document.getElementById('gfx-css')) return;
  const l = document.createElement('link'); l.id = 'gfx-css'; l.rel = 'stylesheet'; l.href = new URL('./gestes-fenetres.css', import.meta.url).href; document.head.appendChild(l);
}

/* Feuille de style du préfixe « gf » (Mars, accueil), chargée à la demande. */
export function chargerStyle() {
  if (document.getElementById('gf-css')) return;
  const l = document.createElement('link'); l.id = 'gf-css'; l.rel = 'stylesheet'; l.href = new URL('./gestionnaire-fenetres.css', import.meta.url).href; document.head.appendChild(l);
}
