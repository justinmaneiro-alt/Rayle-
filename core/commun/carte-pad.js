"use strict";
/* ═════════════ MINI-CARTE DU PAD (V2, phase 4), côté PC ═════════════
   Décrit à la tablette ce qui est ouvert : un CARRÉ par fenêtre (position et proportions de l'écran du PC, en fractions), un ROND par objet 3D manipulable. La tablette dessine la carte
   (clavier/clavier.js) et renvoie des déplacements en fractions d'écran ; ce module les applique aux VRAIES fenêtres par l'API des gestionnaires (core/commun/gestionnaire-fenetres.js :
   déplacer, dimensionner, ranger, fermer…), jamais par un clic au niveau de Windows. Les objets 3D passent par Objets3DPad (chaque vue peut enregistrer ses objets) ou, à défaut,
   par le plus grand canevas visible (le même geste que la souris : tourner = bouton gauche, déplacer = bouton droit, zoom = molette). Données purement locales. */
(function () {
  if (window.RAYLE_SATELLITE) return;
  const T = window.TeleCalcul;
  const objets = new Map();   // id → { nom, canvas?, tourner?, pan?, zoom?, choisir?, actif? }
  window.Objets3DPad = {
    enregistrer(id, def) { objets.set(String(id), def || {}); return () => objets.delete(String(id)); },
    retirer(id) { objets.delete(String(id)); },
    obtenir: id => objets.get(String(id)) || null,
    liste: () => [...objets.entries()].map(([id, d]) => ({ id, nom: d.nom || id, actif: typeof d.actif === 'function' ? !!d.actif() : false }))
  };
  const ecran = () => ({ l: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) });
  const visible = el => !!el && el.offsetParent !== null || (el && getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none');
  let index = new Map();   // identifiant de carte → { api, lid } ou { pn: element }

  /* Les fenêtres ouvertes : toutes celles des gestionnaires communs + les fenêtres du système Panneaux (lecture seule : on peut les fermer). */
  function fenetres() {
    const e = ecran(), sortie = []; index = new Map();
    for (const api of (window.RayleGestionnaires || [])) {
      let liste = []; try { liste = api.liste(); } catch (x) { continue; }
      const racine = api.racine && api.racine.id ? api.racine.id : 'gf';
      for (const f of liste) {
        const id = racine + ':' + f.id, o = api.obtenir(f.id), el = o && o.el;
        if (el && (el.hidden || getComputedStyle(el).display === 'none')) continue;
        const r = el ? el.getBoundingClientRect() : { left: f.x, top: f.y, width: f.l, height: f.h };
        const actif = !!(el && [...el.classList].some(c => /-focus$/.test(c)));
        index.set(id, { api, lid: f.id });
        sortie.push({ id, titre: f.titre, genre: f.genre, x: r.left / e.l, y: r.top / e.h, l: r.width / e.l, h: r.height / e.h, actif, reduite: !!f.reduite, mobile: true });
      }
    }
    for (const pn of document.querySelectorAll('#panneaux .pn')) {
      const r = pn.getBoundingClientRect(); if (r.width < 10 || r.height < 10 || getComputedStyle(pn).display === 'none') continue;
      const id = 'pn:' + (pn.dataset.id || 'x'), titre = (pn.querySelector('.pn-tete h2, .pn-tete') || {}).textContent || 'Fenêtre';
      index.set(id, { pn });
      sortie.push({ id, titre: titre.trim(), genre: 'panneau', x: r.left / e.l, y: r.top / e.h, l: r.width / e.l, h: r.height / e.h, actif: false, reduite: false, mobile: false });
    }
    return sortie;
  }
  /* Les objets 3D : ceux que les vues ont enregistrés, sinon le plus grand canevas visible (« Scène 3D »). */
  function canevasPrincipal() {
    return [...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null && c.width > 200 && c.height > 150 && getComputedStyle(c).visibility !== 'hidden').sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
  }
  function nomScene() {
    try { if (window.Mars && Mars.etat().actif) return 'Mars (base et planète)'; } catch (e) {}
    try { if (window.Terre && Terre.etat().actif) return 'La Terre'; } catch (e) {}
    try { if (document.body.classList.contains('vue-galaxie')) return 'La galaxie'; } catch (e) {}
    return 'Scène 3D';
  }
  function listeObjets() {
    const l = window.Objets3DPad.liste();
    if (canevasPrincipal() && !l.some(o => o.id === 'scene')) l.push({ id: 'scene', nom: nomScene(), actif: true });
    return l;
  }
  function construire() { return { ecran: ecran(), fenetres: fenetres(), objets: listeObjets() }; }

  /* Applique une action de fenêtre venue de la tablette (déjà validée par la liste blanche). Rend vrai si quelque chose a bougé. */
  function appliquerFenetre(m) {
    if (!index.has(m.id)) fenetres();                       // la carte a pu changer depuis le dernier envoi
    const c = index.get(m.id); if (!c) return false;
    const e = ecran();
    if (c.pn) { if (m.a === 'fenetre_act' && m.act === 'fermer') { const x = c.pn.querySelector('.pn-x'); if (x) { x.click(); return true; } } return false; }
    const { api, lid } = c, o = api.obtenir(lid); if (!o) return false;
    if (m.a === 'fenetre_deplace') return api.deplacer(lid, o.rect.x + m.dx * e.l, o.rect.y + m.dy * e.h);
    if (m.a === 'fenetre_taille') {
      const nl = Math.round(o.rect.l * m.ech), nh = Math.round(o.rect.h * m.ech);
      api.dimensionner(lid, nl, nh); const n = api.obtenir(lid); if (n) api.deplacer(lid, o.rect.x - (n.rect.l - o.rect.l) / 2, o.rect.y - (n.rect.h - o.rect.h) / 2);   // l'agrandissement part du centre
      return true;
    }
    if (m.a === 'fenetre_act') {
      if (m.act === 'focus') { if (o.reduite) api.reduire(lid, false); api.focus(lid); }
      else if (m.act === 'reduire') api.reduire(lid);
      else if (m.act === 'agrandir') api.agrandir(lid);
      else if (m.act === 'ranger') { if (!api.ranger(lid)) api.fermer(lid); }
      else if (m.act === 'fermer') api.fermer(lid);
      return true;
    }
    return false;
  }
  window.CartePad = { construire, appliquerFenetre, canevasPrincipal, fenetres: () => fenetres(), objets: listeObjets, enregistrer: window.Objets3DPad.enregistrer };
})();
