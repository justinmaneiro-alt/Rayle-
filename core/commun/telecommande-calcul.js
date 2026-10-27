"use strict";
/* ═════════════ TÉLÉCOMMANDE (K2) : calcul pur, partagé par le serveur (Node), la page Rayle du PC et la tablette ═════════════
   Contient la LISTE BLANCHE des actions que la tablette peut demander à Rayle : tout message hors de cette liste, ou mal formé, est ignoré (valider → null).
   Aucune dépendance, aucun accès au DOM : testé sous Node (galaxie/tests/telecommande-test.mjs). Les actions n'agissent QUE dans la page Rayle :
   jamais de saisie ni de clic au niveau de Windows. */
(function (racine) {
  const nb = (v, m) => (typeof v === 'number' && isFinite(v)) ? Math.max(-m, Math.min(m, v)) : null;
  const COMMANDES = ['accueil', 'terre', 'mars', 'saturne', 'atelier3d', 'precedent', 'suivant', 'fermer', 'retour', 'plein_ecran', 'mode_leger', 'capture'];
  const RAYLE = ['parler_debut', 'parler_fin', 'veille', 'coupe', 'actif', 'stop_parole', 'volume', 'fenetre'];
  const FENETRES = ['meteo', 'actualites', 'marche', 'agent'];
  const SPECIAUX = ['Backspace', 'Enter', ' ', 'Tab', 'Escape'];
  const VUES = ['cockpit', 'exterieur', 'libre'];
  const MODES = ['pave', 'clavier', 'rayle', 'pilotage', 'carte', 'pad3d'];
  const ACTS_FENETRE = ['focus', 'ranger', 'fermer', 'reduire', 'agrandir'];
  const GESTES_OBJET = ['tourner', 'pan', 'zoom', 'choisir', 'fin'];
  const idOk = v => typeof v === 'string' && v.length >= 1 && v.length <= 60 && /^[\w:.\-]+$/.test(v);
  const DELAI_MAX_MS = 5000;   // sans réponse à un ping pendant ce délai : la liaison est considérée coupée et se rétablit seule

  // action → validateur : renvoie le message normalisé, ou null s'il est refusé
  const ACTIONS = {
    pointeur: m => { const dx = nb(m.dx, 300), dy = nb(m.dy, 300); return dx === null || dy === null ? null : { dx, dy }; },
    clic: m => ({ n: m.n === 2 ? 2 : 1, bouton: m.bouton === 2 ? 2 : 0 }),
    glisse: m => { const dx = nb(m.dx || 0, 300), dy = nb(m.dy || 0, 300); return ['debut', 'bouge', 'fin'].includes(m.etat) && dx !== null && dy !== null ? { etat: m.etat, dx, dy } : null; },
    defile: m => { const dx = nb(m.dx || 0, 2000), dy = nb(m.dy || 0, 2000); return dx === null || dy === null ? null : { dx, dy }; },
    zoom: m => { const d = nb(m.delta, 2000); return d === null ? null : { delta: d }; },
    accueil3: () => ({}),
    appui_long: () => ({}),   // R2 : appui long du pavé = saisie d'une fenêtre (barre de titre, poignée) ou clic droit ailleurs
    verrou: () => ({}),       // R3.1 : double appui maintenu = verrouille la fenêtre ou l'objet 3D sous le curseur (le doigt qui glisse le déplace / le fait tourner jusqu'au « lacher »)
    lacher: () => ({}),
    texte: m => typeof m.c === 'string' && m.c.length >= 1 && m.c.length <= 2 ? { c: m.c } : null,
    special: m => SPECIAUX.includes(m.k) ? { k: m.k } : null,
    commande: m => COMMANDES.includes(m.id) ? { id: m.id } : null,
    rayle: m => {
      if (!RAYLE.includes(m.id)) return null;
      if (m.id === 'volume') { const v = nb(m.valeur, 1); return v === null || v < 0 ? null : { id: 'volume', valeur: v }; }
      if (m.id === 'fenetre') return FENETRES.includes(m.nom) ? { id: 'fenetre', nom: m.nom } : null;
      return { id: m.id };
    },
    pilote: m => {
      const tx = nb(m.tx || 0, 1), ty = nb(m.ty || 0, 1), rx = nb(m.rx || 0, 1), ry = nb(m.ry || 0, 1), po = nb(m.poussee || 0, 1);
      if ([tx, ty, rx, ry, po].includes(null) || po < 0) return null;
      return { tx, ty, rx, ry, poussee: po, post: m.post === true, roulis: nb(m.roulis || 0, 1) || 0 };
    },
    vue: m => VUES.includes(m.v) ? { v: m.v } : null,
    mode: m => MODES.includes(m.m) ? { m: m.m } : null,
    // V2 phase 4 : mini-carte des fenêtres (carrés) et des objets 3D (ronds) ; les déplacements sont des FRACTIONS de l'écran du PC (−1…1), jamais des pixels
    fenetre_deplace: m => { const dx = nb(m.dx, 1), dy = nb(m.dy, 1); return idOk(m.id) && dx !== null && dy !== null ? { id: m.id, dx, dy } : null; },
    fenetre_taille: m => { const e = nb(m.ech, 4); return idOk(m.id) && e !== null && e > 0 ? { id: m.id, ech: Math.max(0.5, Math.min(2, e)) } : null; },
    fenetre_act: m => idOk(m.id) && ACTS_FENETRE.includes(m.act) ? { id: m.id, act: m.act } : null,
    objet: m => { const dx = nb(m.dx || 0, 1), dy = nb(m.dy || 0, 1), d = nb(m.delta || 0, 2000); return (m.id === undefined || idOk(m.id)) && GESTES_OBJET.includes(m.g) && dx !== null && dy !== null && d !== null ? { id: m.id, g: m.g, dx, dy, delta: d } : null; },
    carte_demande: () => ({})
  };

  /* Message de la tablette { a: action, … } → { a, … normalisé } ou null (hors liste blanche, mal formé, trop gros). */
  function valider(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.a !== 'string') return null;
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, msg.a)) return null;
    let r; try { r = ACTIONS[msg.a](msg); } catch (e) { return null; }
    return r ? Object.assign({ a: msg.a }, r) : null;
  }

  /* Pilotage : sticks virtuels (−1…1) → ensemble de codes clavier pour le vaisseau de Saturne (W/S/A/D, flèches, Q/E, Maj). */
  function touchesPilote(p, seuil = 0.3) {
    const s = new Set();
    if (!p) return s;
    if (p.ty > seuil || p.poussee > 0.5) s.add('KeyW'); else if (p.ty < -seuil) s.add('KeyS');
    if (p.tx > seuil) s.add('KeyD'); else if (p.tx < -seuil) s.add('KeyA');
    if (p.rx > seuil) s.add('ArrowRight'); else if (p.rx < -seuil) s.add('ArrowLeft');
    if (p.ry > seuil) s.add('ArrowDown'); else if (p.ry < -seuil) s.add('ArrowUp');   // tirer vers soi = nez en haut (tangage haut = flèche bas)
    if (p.roulis > seuil) s.add('KeyE'); else if (p.roulis < -seuil) s.add('KeyQ');
    if (p.post) s.add('ShiftLeft');
    return s;
  }
  const differences = (avant, apres) => ({ bas: [...apres].filter(c => !avant.has(c)), haut: [...avant].filter(c => !apres.has(c)) });

  /* Pavé : sensibilité (0,3…3) et accélération douce selon la vitesse du doigt ; inertie au lâcher. */
  function deplacementPave(dx, dy, sensibilite = 1) {
    const v = Math.hypot(dx, dy), gain = sensibilite * (1 + Math.min(1.2, v / 40));
    return { dx: dx * gain, dy: dy * gain };
  }
  function pasInertie(vx, vy, dtMs, friction = 0.0045) {
    const k = Math.exp(-friction * dtMs), nx = vx * k, ny = vy * k;
    return Math.hypot(nx, ny) < 0.02 ? { vx: 0, vy: 0, fini: true } : { vx: nx, vy: ny, fini: false };
  }
  /* ── Mini-carte (V2 phase 4) : le PC décrit ses fenêtres et ses objets 3D, la tablette les dessine. Tout est borné et nettoyé des deux côtés (le serveur relaie seulement ce qui passe ici). ── */
  const fr = v => (typeof v === 'number' && isFinite(v)) ? Math.max(-0.5, Math.min(1.5, Math.round(v * 10000) / 10000)) : null;
  const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').slice(0, n);
  function normaliserCarte(c) {
    const sortie = { fenetres: [], objets: [], ecran: { l: 1, h: 1 } };
    if (!c || typeof c !== 'object') return sortie;
    if (c.ecran && +c.ecran.l > 0 && +c.ecran.h > 0) sortie.ecran = { l: Math.min(20000, Math.round(+c.ecran.l)), h: Math.min(20000, Math.round(+c.ecran.h)) };
    for (const f of (Array.isArray(c.fenetres) ? c.fenetres : []).slice(0, 40)) {
      if (!f || !idOk(f.id)) continue; const x = fr(f.x), y = fr(f.y), l = fr(f.l), h = fr(f.h); if ([x, y, l, h].includes(null) || l <= 0 || h <= 0) continue;
      sortie.fenetres.push({ id: f.id, titre: txt(f.titre, 48), x, y, l, h, actif: f.actif === true, reduite: f.reduite === true, genre: txt(f.genre, 16), mobile: f.mobile !== false });
    }
    for (const o of (Array.isArray(c.objets) ? c.objets : []).slice(0, 16)) { if (!o || !idOk(o.id)) continue; sortie.objets.push({ id: o.id, nom: txt(o.nom, 40), actif: o.actif === true }); }
    return sortie;
  }
  /* Rectangle écran du PC (fractions) → rectangle dans la boîte de la tablette (pixels). */
  const versBoite = (f, boite) => ({ x: boite.x + f.x * boite.l, y: boite.y + f.y * boite.h, l: Math.max(18, f.l * boite.l), h: Math.max(14, f.h * boite.h) });
  /* Glisser d'un carré de dxPx, dyPx pixels dans la boîte → déplacement en FRACTIONS de l'écran du PC. */
  const deplacementNorm = (dxPx, dyPx, boite) => ({ dx: boite.l > 0 ? dxPx / boite.l : 0, dy: boite.h > 0 ? dyPx / boite.h : 0 });
  /* Boîte (pixels) qui contient l'écran du PC dans une zone donnée, en gardant le rapport de l'écran. */
  function boiteDansZone(zone, ecran) {
    const r = ecran.l / ecran.h, zr = zone.l / zone.h; let l = zone.l, h = zone.h;
    if (r > zr) h = zone.l / r; else l = zone.h * r;
    return { x: zone.x + (zone.l - l) / 2, y: zone.y + (zone.h - h) / 2, l, h };
  }
  /* Lisseur d'envoi : cumule les déplacements et ne les libère qu'au plus 30 fois par seconde. */
  function creerLisseur(envoyer, intervalleMs = 33, horloge = () => Date.now()) {
    let dx = 0, dy = 0, delta = 0, ech = 1, dernier = 0, id = null;
    const vider = (force) => { const t = horloge(); if (!force && t - dernier < intervalleMs) return false; if (!dx && !dy && !delta && ech === 1) return false; dernier = t; const m = { dx, dy, delta, ech }; dx = dy = delta = 0; ech = 1; envoyer(m); return true; };
    return { ajouter(o) { dx += o.dx || 0; dy += o.dy || 0; delta += o.delta || 0; if (o.ech) ech *= o.ech; return vider(false); }, vider: () => vider(true), attendu: () => dx || dy || delta || ech !== 1 };
  }
  const classerLatence = ms => ms == null ? 'inconnue' : ms < 60 ? 'bonne' : ms < 200 ? 'correcte' : 'lente';

  /* Adresse réseau : seulement boucle locale et réseaux privés (jamais Internet). */
  function estReseauLocal(adresse) {
    let a = String(adresse || '').replace(/^::ffff:/i, '').toLowerCase();
    if (a === '::1' || /^127\./.test(a)) return true;
    if (/^10\./.test(a) || /^192\.168\./.test(a) || /^169\.254\./.test(a)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
    return /^f[cd][0-9a-f]{2}:/.test(a) || /^fe80:/.test(a);
  }

  racine.TeleCalcul = { normaliserCarte, versBoite, deplacementNorm, boiteDansZone, creerLisseur, ACTS_FENETRE, GESTES_OBJET, ACTIONS, COMMANDES, RAYLE, FENETRES, MODES, DELAI_MAX_MS, valider, touchesPilote, differences, deplacementPave, pasInertie, classerLatence, estReseauLocal };
})(typeof globalThis !== 'undefined' ? globalThis : window);
