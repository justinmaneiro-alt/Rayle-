/* ═════════════ TABLETTE : MINI-CARTE (carrés = fenêtres, ronds = objets 3D) ET PAD 3D (V2, phase 4) ═════════════
   Chargé après clavier.js, qui expose window.RayleTablette = { envoyer, vibrer, info }. Le PC décrit ce qui est ouvert (message { t: 'carte' }, reçu par recevoir()) ;
   la tablette dessine un carré vide par fenêtre (même place et même proportion que sur l'écran du PC) et un rond par objet 3D, et renvoie des déplacements en FRACTIONS d'écran,
   groupés à 30 messages par seconde au plus. La liste blanche (core/commun/telecommande-calcul.js) valide tout côté serveur et côté PC.
   Carte : glisser un carré = déplacer la fenêtre · pincer (2 doigts) = agrandir / réduire · toucher = la passer devant · appui long = menu (ranger, réduire, agrandir, fermer).
           glisser un rond = faire tourner l'objet · 2 doigts = déplacer (pan) + pincer = zoom · toucher = le choisir.
   Pad 3D : 1 doigt = tourner · 2 doigts = déplacer (pan) et pincer = zoom · toucher = clic · joystick facultatif (pilotage : translation) pour se promener. */
(function () {
  'use strict';
  var T = window.TeleCalcul, R = window.RayleTablette;
  if (!T || !R) return;
  var $ = function (id) { return document.getElementById(id); };
  var carte = { fenetres: [], objets: [], ecran: { l: 16, h: 9 } }, boite = { x: 0, y: 0, l: 1, h: 1 }, choisi = '', gestes = {}, nPtrs = 0, menuId = '';
  var pointeurs = {};   // id → { x, y }
  function nettoyer(t) { return String(t == null ? '' : t).replace(/[<>&"]/g, ' '); }
  function envoyer(m) { return R.envoyer(m); }

  // ───────────── Affichage de la carte ─────────────
  function mesurer() {
    var z = $('carte-ecran'); if (!z) return;
    var zone = z.parentNode.getBoundingClientRect(), r = T.boiteDansZone({ x: 0, y: 0, l: zone.width, h: zone.height }, carte.ecran);
    boite = r; z.style.width = r.l + 'px'; z.style.height = r.h + 'px';
  }
  function dessiner() {
    var z = $('carte-ecran'); if (!z) return; mesurer();
    var vus = {};
    carte.fenetres.forEach(function (f) {
      vus[f.id] = 1; var el = z.querySelector('[data-id="' + f.id.replace(/"/g, '') + '"]');
      if (!el) { el = document.createElement('div'); el.className = 'carre'; el.setAttribute('data-id', f.id); el.innerHTML = '<span></span>'; z.appendChild(el); }
      var p = T.versBoite(f, { x: 0, y: 0, l: boite.l, h: boite.h });
      if (!gestes[f.id] || !gestes[f.id].actif) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.width = p.l + 'px'; el.style.height = p.h + 'px'; }
      el.classList.toggle('actif', !!f.actif); el.classList.toggle('reduite', !!f.reduite); el.classList.toggle('fixe', f.mobile === false);
      el.firstChild.textContent = nettoyer(f.titre);
    });
    [].slice.call(z.querySelectorAll('.carre')).forEach(function (el) { if (!vus[el.getAttribute('data-id')] && !(gestes[el.getAttribute('data-id')] && gestes[el.getAttribute('data-id')].actif)) el.remove(); });
    var o = $('carte-objets'); var sig = JSON.stringify(carte.objets.map(function (x) { return [x.id, x.nom, x.id === choisi]; }));
    if (o.getAttribute('data-sig') !== sig) {
      o.setAttribute('data-sig', sig);
      o.innerHTML = carte.objets.length ? carte.objets.map(function (x) { return '<div class="rond' + (x.id === choisi ? ' choisi' : '') + '" data-id="' + nettoyer(x.id) + '"><i></i><span>' + nettoyer(x.nom) + '</span></div>'; }).join('') : '<p class="carte-vide">Aucun objet 3D à manipuler.</p>';
    }
    $('carte-etat').textContent = carte.fenetres.length ? carte.fenetres.length + ' fenêtre' + (carte.fenetres.length > 1 ? 's' : '') + ' ouverte' + (carte.fenetres.length > 1 ? 's' : '') + ' sur le PC' : 'Aucune fenêtre ouverte sur le PC.';
  }
  function recevoir(c) {
    if (!c) return; carte = { fenetres: c.fenetres || [], objets: c.objets || [], ecran: c.ecran || carte.ecran };
    if (!carte.objets.some(function (o) { return o.id === choisi; })) choisi = carte.objets.length ? carte.objets[0].id : '';
    if (document.body.getAttribute('data-mode') === 'carte') dessiner();
  }

  // ───────────── Gestes sur les carrés ─────────────
  function carreSous(e) { var c = e.target.closest && e.target.closest('.carre'); return c && !c.classList.contains('fixe') ? c : (e.target.closest && e.target.closest('.carre')); }
  var lis = {};   // lisseurs par fenêtre / objet
  function lisseurPour(cle, fabriquer) { return lis[cle] || (lis[cle] = fabriquer()); }
  var zone = $('carte-ecran');
  var tl = { nb: 0 };
  zone.addEventListener('pointerdown', function (e) {
    var c = e.target.closest('.carre'); if (!c) return; e.preventDefault(); fermerMenu();
    var id = c.getAttribute('data-id'), g = gestes[id] || (gestes[id] = { actif: false, pts: {}, dist0: 0, t0: 0, bouge: 0, long: 0 });
    g.pts[e.pointerId] = { x: e.clientX, y: e.clientY }; g.actif = true; g.t0 = Date.now(); g.bouge = 0; try { c.setPointerCapture(e.pointerId); } catch (x) {}
    c.classList.add('tenu');
    var ks = Object.keys(g.pts); if (ks.length === 2) g.dist0 = Math.hypot(g.pts[ks[0]].x - g.pts[ks[1]].x, g.pts[ks[0]].y - g.pts[ks[1]].y);
    clearTimeout(g.long); if (ks.length === 1) g.long = setTimeout(function () { if (g.actif && g.bouge < 12 && Object.keys(g.pts).length === 1) { g.menu = true; ouvrirMenu(id, c); } }, 520);
  });
  zone.addEventListener('pointermove', function (e) {
    var c = e.target.closest('.carre'); if (!c) return; var id = c.getAttribute('data-id'), g = gestes[id]; if (!g || !g.pts[e.pointerId]) return;
    var p = g.pts[e.pointerId], ks = Object.keys(g.pts), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; g.bouge += Math.abs(dx) + Math.abs(dy);
    if (g.menu) return;
    var l = lisseurPour('f:' + id, function () { return T.creerLisseur(function (m) { if (m.dx || m.dy) envoyer({ a: 'fenetre_deplace', id: id, dx: m.dx, dy: m.dy }); if (m.ech !== 1) envoyer({ a: 'fenetre_taille', id: id, ech: m.ech }); }, 33); });
    if (ks.length >= 2) {
      var a = g.pts[ks[0]], b = g.pts[ks[1]], d = Math.hypot(a.x - b.x, a.y - b.y); if (g.dist0 > 12 && d > 12) { var ech = d / g.dist0; if (Math.abs(ech - 1) > 0.012) { g.dist0 = d; l.ajouter({ ech: ech }); } }
    } else {
      var n = T.deplacementNorm(dx, dy, boite); l.ajouter(n);
      c.style.left = (parseFloat(c.style.left) + dx) + 'px'; c.style.top = (parseFloat(c.style.top) + dy) + 'px';   // retour visuel immédiat ; le PC renvoie ensuite la vraie position
    }
  });
  function finCarre(e) {
    var c = e.target.closest('.carre'); if (!c) return; var id = c.getAttribute('data-id'), g = gestes[id]; if (!g || !g.pts[e.pointerId]) return;
    delete g.pts[e.pointerId]; clearTimeout(g.long);
    if (!Object.keys(g.pts).length) {
      var l = lis['f:' + id]; if (l) l.vider();
      if (e.type === 'pointerup' && !g.menu && g.bouge < 12 && Date.now() - g.t0 < 380) { envoyer({ a: 'fenetre_act', id: id, act: 'focus' }); R.vibrer(10); }
      g.actif = false; g.menu = false; c.classList.remove('tenu'); setTimeout(function () { envoyer({ a: 'carte_demande' }); }, 120);
    } else g.dist0 = 0;
  }
  zone.addEventListener('pointerup', finCarre); zone.addEventListener('pointercancel', finCarre);

  // ───────────── Menu d'un carré (appui long) ─────────────
  function ouvrirMenu(id, c) {
    menuId = id; var m = $('carte-menu'), f = carte.fenetres.filter(function (x) { return x.id === id; })[0] || {};
    m.innerHTML = '<b>' + nettoyer(f.titre || '') + '</b>' + (f.mobile === false ? '' : '<button data-act="ranger">Ranger</button><button data-act="reduire">' + (f.reduite ? 'Rétablir' : 'Réduire') + '</button><button data-act="agrandir">Agrandir</button>') + '<button data-act="fermer" class="danger">Fermer</button><button data-act="x" class="ghost">Annuler</button>';
    m.hidden = false; R.vibrer(25);
  }
  function fermerMenu() { $('carte-menu').hidden = true; menuId = ''; }
  $('carte-menu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return; var a = b.getAttribute('data-act');
    if (a !== 'x' && menuId) envoyer({ a: 'fenetre_act', id: menuId, act: a });
    fermerMenu(); setTimeout(function () { envoyer({ a: 'carte_demande' }); }, 200);
  });

  // ───────────── Gestes sur les ronds (objets 3D) ─────────────
  var og = {};
  function objetEnvoi(id) {
    return lisseurPour('o:' + id, function () { return T.creerLisseur(function (m) { if (m.dx || m.dy) envoyer({ a: 'objet', id: og.mode === 'pan' ? og.id : og.id, g: og.mode || 'tourner', dx: m.dx, dy: m.dy }); if (m.delta) envoyer({ a: 'objet', id: og.id, g: 'zoom', delta: m.delta }); }, 33); });
  }
  var objets = $('carte-objets');
  objets.addEventListener('pointerdown', function (e) {
    var r = e.target.closest('.rond'); if (!r) return; e.preventDefault(); var id = r.getAttribute('data-id');
    og = og.id === id && og.actif ? og : { id: id, actif: true, pts: {}, dist0: 0, t0: Date.now(), bouge: 0, mode: 'tourner', el: r };
    og.pts[e.pointerId] = { x: e.clientX, y: e.clientY }; try { r.setPointerCapture(e.pointerId); } catch (x) {}
    var ks = Object.keys(og.pts); if (ks.length === 2) { og.mode = 'pan'; og.dist0 = Math.hypot(og.pts[ks[0]].x - og.pts[ks[1]].x, og.pts[ks[0]].y - og.pts[ks[1]].y); envoyer({ a: 'objet', id: id, g: 'fin' }); }
    r.classList.add('tenu');
  });
  objets.addEventListener('pointermove', function (e) {
    if (!og.actif || !og.pts[e.pointerId]) return; var p = og.pts[e.pointerId], ks = Object.keys(og.pts), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; og.bouge += Math.abs(dx) + Math.abs(dy);
    var diam = Math.max(60, og.el.getBoundingClientRect().width), l = objetEnvoi(og.id), k = 1.4 / diam;   // faire le tour du rond = environ un écran de rotation
    if (ks.length >= 2) {
      var a = og.pts[ks[0]], b = og.pts[ks[1]], d = Math.hypot(a.x - b.x, a.y - b.y), dd = og.dist0 ? (d - og.dist0) : 0; og.dist0 = d;
      l.ajouter({ dx: dx * k * 0.5, dy: dy * k * 0.5, delta: dd * 2.5 });
    } else l.ajouter({ dx: dx * k, dy: dy * k });
  });
  function finRond(e) {
    if (!og.actif || !og.pts[e.pointerId]) return; delete og.pts[e.pointerId];
    if (!Object.keys(og.pts).length) {
      var l = lis['o:' + og.id]; if (l) l.vider();
      envoyer({ a: 'objet', id: og.id, g: 'fin' });
      if (e.type === 'pointerup' && og.bouge < 10 && Date.now() - og.t0 < 380) { choisi = og.id; carte.objets.forEach(function (o) { o.actif = o.id === choisi; }); $('carte-objets').removeAttribute('data-sig'); dessiner(); envoyer({ a: 'objet', id: og.id, g: 'choisir' }); R.vibrer(10); }
      og.el.classList.remove('tenu'); og = {};
    } else { og.mode = 'tourner'; og.dist0 = 0; envoyer({ a: 'objet', id: og.id, g: 'fin' }); }
  }
  objets.addEventListener('pointerup', finRond); objets.addEventListener('pointercancel', finRond);

  // ───────────── Pad 3D ─────────────
  var pad = $('pad3d-zone'), pp = {}, pad3 = { dist0: 0, bouge: 0, t0: 0, mode: '' };
  function envoiPad() {
    return lisseurPour('pad', function () { return T.creerLisseur(function (m) {
      if (m.dx || m.dy) envoyer({ a: 'objet', id: choisi || undefined, g: pad3.mode === 'pan' ? 'pan' : 'tourner', dx: m.dx, dy: m.dy });
      if (m.delta) envoyer({ a: 'objet', id: choisi || undefined, g: 'zoom', delta: m.delta });
    }, 33); });
  }
  pad.addEventListener('pointerdown', function (e) {
    if (e.target.closest('#pad3d-joy')) return; e.preventDefault(); pp[e.pointerId] = { x: e.clientX, y: e.clientY }; try { pad.setPointerCapture(e.pointerId); } catch (x) {}
    var ks = Object.keys(pp); if (ks.length === 1) { pad3.t0 = Date.now(); pad3.bouge = 0; pad3.mode = 'tourner'; }
    if (ks.length === 2) { pad3.mode = 'pan'; pad3.dist0 = Math.hypot(pp[ks[0]].x - pp[ks[1]].x, pp[ks[0]].y - pp[ks[1]].y); envoyer({ a: 'objet', id: choisi || undefined, g: 'fin' }); }
    $('pad3d-zone').classList.add('tenu');
  });
  pad.addEventListener('pointermove', function (e) {
    var p = pp[e.pointerId]; if (!p) return; var ks = Object.keys(pp), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; pad3.bouge += Math.abs(dx) + Math.abs(dy);
    var r = pad.getBoundingClientRect(), l = envoiPad();
    if (ks.length >= 2) {
      var a = pp[ks[0]], b = pp[ks[1]], d = Math.hypot(a.x - b.x, a.y - b.y), dd = pad3.dist0 ? d - pad3.dist0 : 0; pad3.dist0 = d;
      l.ajouter({ dx: dx / r.width * 0.5, dy: dy / r.height * 0.5, delta: dd * 3 });   // chaque doigt compte pour moitié : la main entière se déplace d'un seul geste
    } else l.ajouter({ dx: dx / r.width * 1.1, dy: dy / r.height * 1.1 });
  });
  function finPad(e) {
    if (!pp[e.pointerId]) return; delete pp[e.pointerId];
    if (!Object.keys(pp).length) {
      var l = lis['pad']; if (l) l.vider(); envoyer({ a: 'objet', id: choisi || undefined, g: 'fin' });
      if (e.type === 'pointerup' && pad3.bouge < 10 && Date.now() - pad3.t0 < 320) { envoyer({ a: 'clic', n: 1 }); R.vibrer(10); }   // toucher = clic à l'endroit du curseur
      $('pad3d-zone').classList.remove('tenu');
    } else { pad3.mode = 'tourner'; pad3.dist0 = 0; envoyer({ a: 'objet', id: choisi || undefined, g: 'fin' }); }
  }
  pad.addEventListener('pointerup', finPad); pad.addEventListener('pointercancel', finPad);

  // joystick virtuel facultatif : translation (vaisseau, caméra de la Terre) par le message « pilote » existant
  var joy = { actif: false, id: null, x0: 0, y0: 0, tx: 0, ty: 0, tic: 0 };
  var jz = $('pad3d-joy'), jb = jz.querySelector('.bille');
  function joyEnvoi() { envoyer({ a: 'pilote', tx: joy.tx, ty: joy.ty, rx: 0, ry: 0, poussee: 0, post: false, roulis: 0 }); }
  jz.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); joy.actif = true; joy.id = e.pointerId; var r = jz.getBoundingClientRect(); joy.x0 = r.left + r.width / 2; joy.y0 = r.top + r.height / 2; try { jz.setPointerCapture(e.pointerId); } catch (x) {} jm(e); clearInterval(joy.tic); joy.tic = setInterval(joyEnvoi, 33); });
  function jm(e) { if (!joy.actif || e.pointerId !== joy.id) return; var ox = e.clientX - joy.x0, oy = e.clientY - joy.y0, R0 = 52, d = Math.hypot(ox, oy), k = d > R0 ? R0 / d : 1; ox *= k; oy *= k; joy.tx = Math.round(ox / R0 * 100) / 100; joy.ty = Math.round(-oy / R0 * 100) / 100; jb.style.transform = 'translate(' + ox + 'px,' + oy + 'px)'; }
  jz.addEventListener('pointermove', jm);
  function jf(e) { if (e.pointerId !== joy.id) return; joy.actif = false; joy.tx = joy.ty = 0; clearInterval(joy.tic); joyEnvoi(); jb.style.transform = ''; }
  jz.addEventListener('pointerup', jf); jz.addEventListener('pointercancel', jf);
  $('pad3d-joy-bt').addEventListener('click', function () { var on = $('pad3d-joy').hidden; $('pad3d-joy').hidden = !on; this.classList.toggle('actif', on); if (!on) { joy.tx = joy.ty = 0; joyEnvoi(); } });
  $('pad3d-cible').addEventListener('click', function () {
    if (!carte.objets.length) { envoyer({ a: 'carte_demande' }); return; }
    var i = carte.objets.findIndex(function (o) { return o.id === choisi; }); choisi = carte.objets[(i + 1) % carte.objets.length].id; majCiblePad(); R.vibrer(10);
  });
  function majCiblePad() { var o = carte.objets.filter(function (x) { return x.id === choisi; })[0]; $('pad3d-cible').textContent = 'Objet : ' + (o ? nettoyer(o.nom) : 'scène 3D'); }

  // ───────────── Affichage selon le mode ─────────────
  function afficher(m) {
    if (m === 'carte') { setTimeout(function () { dessiner(); }, 0); envoyer({ a: 'carte_demande' }); }
    if (m === 'pad3d') { majCiblePad(); envoyer({ a: 'carte_demande' }); }
  }
  window.addEventListener('resize', function () { if (document.body.getAttribute('data-mode') === 'carte') dessiner(); });
  setInterval(function () { if (document.body.getAttribute('data-mode') === 'pad3d') majCiblePad(); }, 1000);
  window.CarteTablette = { recevoir: function (c) { recevoir(c); if (document.body.getAttribute('data-mode') === 'pad3d') majCiblePad(); }, afficher: afficher, etat: function () { return { carte: carte, choisi: choisi, boite: boite }; } };
})();
