"use strict";
/* ═════════════ TÉLÉCOMMANDE (K2) : côté page Rayle du PC ═════════════
   - Interrupteur dans ⚙ Réglages (désactivé par défaut) : demande au serveur local d'ouvrir ou fermer l'écoute sur le réseau local (page /clavier seulement).
   - Fenêtre : QR code, adresse, code d'appairage à 6 chiffres, appareils appairés (bouton « déconnecter »), expiration réglable, journal, arrêt d'urgence.
   - Liaison WebSocket vers le serveur local (/__tele/ws) : reçoit les événements de la tablette, ne les applique QU'À LA PAGE RAYLÉ (liste blanche de
     telecommande-calcul.js, vérifiée ici une seconde fois) : curseur virtuel, clics et glissés sur les éléments de la page, texte dans le champ actif,
     commandes de Rayle, pilotage du vaisseau / de la caméra. AUCUNE saisie ni clic au niveau de Windows. Reconnexion automatique. */
(function () {
  if (window.RAYLE_SATELLITE || !window.TeleCalcul || !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)) return;
  const T = window.TeleCalcul, $ = id => document.getElementById(id);
  const ID = 9001;   // identifiant de pointeur des événements de la tablette (jamais celui d'une vraie souris)
  const ENT = { 'X-Rayle-Tele': '1' };
  let etat = { actif: false, appareils: [], journal: [] }, ws = null, tentative = 0, minuteurWs = 0, voulu = false;
  const pos = { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) };
  let surfaceEnvoyee = '', glisse = null, dernierEvenement = 0, touchesPilote = new Set(), pilote = null, tictac = 0, defileFin = 0, defileGlisse = null;

  // setPointerCapture échoue pour un pointeur synthétique : on l'ignore seulement pour NOTRE identifiant
  const natif = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) { try { return natif.call(this, id); } catch (e) { if (id === ID) return; throw e; } };

  // ── Curseur virtuel et pastille ──
  const curseur = document.createElement('div'); curseur.id = 'tele-curseur'; curseur.hidden = true; document.body.appendChild(curseur);
  const pastille = document.createElement('div'); pastille.id = 'tele-pastille'; pastille.hidden = true; pastille.setAttribute('role', 'status'); document.body.appendChild(pastille);
  const placer = () => { curseur.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)'; };
  let cache = 0; function montrerCurseur() { curseur.hidden = false; placer(); clearTimeout(cache); cache = setTimeout(() => { curseur.hidden = true; }, 6000); }
  function dessinerPastille() {
    const c = (etat.appareils || []).filter(a => a.connecte);
    pastille.hidden = !c.length;
    if (c.length) pastille.textContent = '⌁ ' + c.map(a => a.nom + (a.latence != null ? ' · ' + a.latence + ' ms' : '')).join(' / ');
    pastille.dataset.latence = c.length ? T.classerLatence(Math.max.apply(null, c.map(a => a.latence == null ? 0 : a.latence))) : '';
  }

  // ── Événements synthétiques (dans la page seulement) ──
  const sous = () => document.elementFromPoint(pos.x, pos.y) || document.body;
  function ptr(type, el, o) {
    o = o || {};
    try { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, pointerId: ID, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: o.buttons ? 0.5 : 0, clientX: pos.x, clientY: pos.y, screenX: pos.x, screenY: pos.y, button: o.button == null ? -1 : o.button, buttons: o.buttons || 0, movementX: o.mx || 0, movementY: o.my || 0, detail: o.detail || 0 })); } catch (e) { /* élément détaché */ }
  }
  function sour(type, el, o) {
    o = o || {};
    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: pos.x, clientY: pos.y, screenX: pos.x, screenY: pos.y, button: o.button || 0, buttons: o.buttons || 0, detail: o.detail || 0, movementX: o.mx || 0, movementY: o.my || 0 })); } catch (e) { /* élément détaché */ }
  }
  function bouger(dx, dy) {
    pos.x = Math.max(0, Math.min(innerWidth - 1, pos.x + dx)); pos.y = Math.max(0, Math.min(innerHeight - 1, pos.y + dy));
    const el = glisse ? glisse.el : sous(), b = glisse ? glisse.buttons : 0;
    ptr('pointermove', el, { buttons: b, mx: dx, my: dy }); sour('mousemove', el, { buttons: b, mx: dx, my: dy }); montrerCurseur();
    const surf = el.tagName === 'CANVAS' ? '3d' : '2d'; if (surf !== surfaceEnvoyee) { surfaceEnvoyee = surf; envoyer({ t: 'surface', v: surf }); }
  }
  function appuyer(bouton, el) { const b = bouton === 2 ? 2 : 1; ptr('pointerdown', el, { button: bouton, buttons: b, detail: 1 }); sour('mousedown', el, { button: bouton, buttons: b, detail: 1 }); return b; }
  function relacher(bouton, el) { ptr('pointerup', el, { button: bouton, buttons: 0 }); sour('mouseup', el, { button: bouton, buttons: 0 }); }
  const champTexte = el => el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(button|checkbox|radio|range|submit|file|color)$/i.test(el.type || '') || el.isContentEditable);
  function clic(n, bouton) {
    const el = sous(); montrerCurseur();
    if (bouton === 2) { appuyer(2, el); relacher(2, el); sour('contextmenu', el, { button: 2 }); return; }
    // n = 2 : le deuxième appui d'un double clic (le premier clic est déjà parti avec le premier tap) ; le clic suivant porte detail = 2 puis vient dblclick
    appuyer(0, el);
    const f = el.closest && el.closest('input,textarea,select,[contenteditable="true"]'); if (f && f.focus) try { f.focus(); } catch (e) {}
    relacher(0, el); sour('click', el, { detail: n });
    if (n === 2) sour('dblclick', el, { detail: 2 });
  }
  const sur3D = () => sous().tagName === 'CANVAS';
  function glisser(etatG, dx, dy, bouton) {
    if (etatG === 'debut') { if (glisse) return; const el = sous(); glisse = { el, buttons: bouton === 2 ? 2 : 1, bouton: bouton || 0 }; appuyer(glisse.bouton, el); montrerCurseur(); }
    else if (etatG === 'bouge') { if (!glisse) return; bouger(dx, dy); }
    else if (glisse) { relacher(glisse.bouton, glisse.el); glisse = null; }
  }
  /* Appui long du pavé : sur la barre de titre ou la poignée d'une fenêtre = SAISIE (le curseur virtuel « tient » la fenêtre : les déplacements suivants la déplacent ou la redimensionnent
     jusqu'au « lacher ») ; ailleurs = clic droit, comme avant. */
  const PRISES = '.gf-t,.saf-t,.gf-poignee,.saf-poignee,.gfx-bord,.pn-tete,#tele-fenetre header';
  function appuiLong() {
    const el = sous();
    if (el.closest && el.closest(PRISES) && !el.closest('button')) { if (!glisse) { glisse = { el, buttons: 1, bouton: 0 }; appuyer(0, el); montrerCurseur(); } envoyer({ t: 'saisie', v: 1 }); return true; }
    clic(1, 2); return false;
  }
  /* R3.1 : verrou. Fenêtre sous le curseur (n'importe où dessus) = saisie de sa barre de titre ; objet 3D (canvas) = bouton gauche enfoncé (rotation). Les 'pointeur' suivants la déplacent / le font
     tourner, 'lacher' libère. Rien sous le curseur de saisissable : aucun verrou (le doigt reste un simple curseur). */
  const FENETRES_SAISISSABLES = '.gf,.saf,.pn,.pm-mobile,#tele-fenetre,#g1Fen', TITRES = '.gf-t,.saf-t,.pn-tete,.g1-fen-barre,header';
  function verrou() {
    if (glisse) return true; const el = sous(); let cible = null, genre = '';
    const fen = el.closest && el.closest(FENETRES_SAISISSABLES);
    if (fen) { cible = fen.querySelector(TITRES) || fen; genre = 'fenetre'; } else if (el.tagName === 'CANVAS') { cible = el; genre = '3d'; }
    if (!cible) { envoyer({ t: 'saisie', v: 0, genre: '' }); return false; }
    glisse = { el: cible, buttons: 1, bouton: 0 }; appuyer(0, cible); montrerCurseur(); envoyer({ t: 'saisie', v: 1, genre }); return true;
  }
  function lacher() { if (glisse) { relacher(glisse.bouton, glisse.el); glisse = null; envoyer({ t: 'saisie', v: 0 }); } }
  function defiler(dx, dy) {
    if (sur3D()) {   // vue 3D : deux doigts déplacent la vue (glisser avec le bouton droit)
      if (!defileGlisse) { defileGlisse = sous(); appuyer(2, defileGlisse); }
      const ancien = glisse; glisse = { el: defileGlisse, buttons: 2, bouton: 2 }; bouger(dx * 0.6, dy * 0.6); glisse = ancien;
      clearTimeout(defileFin); defileFin = setTimeout(() => { if (defileGlisse) { relacher(2, defileGlisse); defileGlisse = null; } }, 180);
      return;
    }
    let e = sous(), pris = false;   // R3 : une fenêtre qui a pris la molette (agrandir / réduire) empêche le défilement du contenu
    try { pris = !e.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, clientX: pos.x, clientY: pos.y, deltaX: dx, deltaY: dy, deltaMode: 0 })); } catch (x) {}
    while (!pris && e && e !== document.documentElement) {   // une molette synthétique ne fait pas défiler : on le fait nous-mêmes
      const s = getComputedStyle(e);
      if ((/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight) || (/auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth)) { e.scrollBy(dx, dy); break; }
      e = e.parentElement;
    }
    montrerCurseur();
  }
  function zoomer(delta) {
    const el = sous();
    try { el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, clientX: pos.x, clientY: pos.y, deltaY: -delta, deltaMode: 0, ctrlKey: !sur3D() })); } catch (x) {}
  }

  // ── Texte et touches spéciales (dans le champ actif de Rayle) ──
  function champActif() {
    let a = document.activeElement;
    if (champTexte(a)) return a;
    const v = [...document.querySelectorAll('input:not([type]),input[type="text"],input[type="search"],textarea')].find(e => e.offsetParent && !e.disabled && !e.readOnly);
    if (v) { v.focus(); return v; }
    return null;
  }
  function touche(type, k) { const t = document.activeElement || document.body; try { t.dispatchEvent(new KeyboardEvent(type, { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true, composed: true })); } catch (e) {} }
  function ecrire(c) {
    const a = champActif(); if (!a) return;
    if (a.isContentEditable) { document.execCommand && document.execCommand('insertText', false, c); return; }
    touche('keydown', c);
    const d = a.selectionStart == null ? a.value.length : a.selectionStart, f = a.selectionEnd == null ? d : a.selectionEnd;
    a.value = a.value.slice(0, d) + c + a.value.slice(f); try { a.setSelectionRange(d + c.length, d + c.length); } catch (e) {}
    a.dispatchEvent(new InputEvent('input', { bubbles: true, data: c, inputType: 'insertText' })); touche('keyup', c);
  }
  function speciale(k) {
    const a = champTexte(document.activeElement) ? document.activeElement : null;
    if (k === 'Backspace' && a && !a.isContentEditable) {
      touche('keydown', k);
      const d = a.selectionStart == null ? a.value.length : a.selectionStart, f = a.selectionEnd == null ? d : a.selectionEnd;
      const g = d === f ? Math.max(0, d - 1) : d; a.value = a.value.slice(0, g) + a.value.slice(f); try { a.setSelectionRange(g, g); } catch (e) {}
      a.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); touche('keyup', k); return;
    }
    if (k === ' ') return ecrire(' ');
    touche('keydown', k); if (k === 'Enter' && a && a.form && !a.dataset.teleEnvoye) { /* le champ réagit à Entrée par son propre écouteur */ } touche('keyup', k);
    if (k === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }

  // ── Commandes de Rayle ──
  const dire = t => { if (typeof respond === 'function') return respond(t); };
  const capturer = () => {
    const cs = [...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null && c.width > 200).sort((a, b) => b.width * b.height - a.width * a.height);
    try { const a = document.createElement('a'); a.href = cs[0].toDataURL('image/png'); a.download = 'Rayle-capture-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png'; document.body.appendChild(a); a.click(); a.remove(); return true; } catch (e) { return false; }
  };
  let leger = false;
  const COMMANDES = {
    accueil: () => { try { RayleBus.demander('vue:fermer'); } catch (e) {} },
    terre: () => dire('va sur la Terre'), mars: () => dire('va sur Mars'), saturne: () => dire('va sur Saturne'), atelier3d: () => dire('va sur Neptune'),
    precedent: () => { if (!(window.ImagesHolo && ImagesHolo.commande('image precedente'))) history.back(); },
    suivant: () => { if (!(window.ImagesHolo && ImagesHolo.commande('image suivante'))) history.forward(); },
    fermer: () => dire('ferme ça'),
    retour: () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); },
    plein_ecran: () => { const d = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen()).catch(() => { pastille.dataset.msg = 'Plein écran refusé : le navigateur veut un geste sur le PC'; }); },
    mode_leger: () => { leger = !leger; try { Entite.qualite(leger ? 2 : 'auto', { temporaire: true }); } catch (e) {} },
    capture: capturer
  };
  const FENETRE_ID = { meteo: 'meteo', actualites: 'actus', marche: 'marche', agent: 'agentmars' };
  const G1_FENETRE = { meteo: 'meteo', actualites: 'actus', marche: 'marche', agent: 'alertes' };   // grande fenêtre de l'accueil Aurore
  function rayle(m) {
    switch (m.id) {
      case 'parler_debut': if (!micOn) basculerConversation(); else if (mode !== 'conversation') enterConversation(); break;
      case 'parler_fin': fermerApresParole = true; break;
      case 'veille': if (!micOn) { try { ouvrirEcoute(); } catch (e) {} } enterVeille(); break;
      case 'coupe': cutAll(); fermerMicro(); break;
      case 'actif': if (!micOn) basculerConversation(); else enterConversation(); break;
      case 'stop_parole': cutAll(); break;
      case 'volume': try { audioEl.volume = m.valeur; } catch (e) {} break;
      case 'fenetre': { if (window.G1 && G1.theme() === 'aurore' && G1.ouvrir(G1_FENETRE[m.nom] || m.nom)) break; if (window.TableauBord) TableauBord.ouvrir(FENETRE_ID[m.nom]); break; }
    }
  }

  // ── Pilotage : vaisseau de Saturne (touches) ou caméra de la Terre (glisser + molette) ──
  const terreActive = () => { try { return !!(window.Terre && Terre.etat().actif); } catch (e) { return false; } };
  let vueSaturne = 'exterieur'; window.addEventListener('saturne:vue', e => { vueSaturne = e.detail.v || e.detail.vue; });
  function clavierCode(type, code) { window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true, cancelable: true })); }
  function appliquerPilote(p) {
    pilote = p;
    if (terreActive()) { demarrerTic(); return; }
    const apres = T.touchesPilote(p), d = T.differences(touchesPilote, apres);
    d.haut.forEach(c => clavierCode('keyup', c)); d.bas.forEach(c => clavierCode('keydown', c)); touchesPilote = apres;
  }
  function lacherPilote() { touchesPilote.forEach(c => clavierCode('keyup', c)); touchesPilote = new Set(); pilote = null; if (glisse && glisse.pilote) { relacher(0, glisse.el); glisse = null; } clearInterval(tictac); tictac = 0; }
  function demarrerTic() {
    if (tictac) return;
    tictac = setInterval(() => {   // caméra de la Terre : le stick de rotation fait tourner, celui de translation zoome
      if (!pilote || !terreActive()) return;
      const cv = [...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null).sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!cv) return;
      if (Math.abs(pilote.rx) + Math.abs(pilote.ry) > 0.08) {
        if (!glisse) { const r = cv.getBoundingClientRect(); pos.x = Math.round(r.left + r.width / 2); pos.y = Math.round(r.top + r.height / 2); glisse = { el: cv, buttons: 1, bouton: 0, pilote: true }; appuyer(0, cv); }
        bouger(pilote.rx * 14, pilote.ry * 14);
      } else if (glisse && glisse.pilote) { relacher(0, glisse.el); glisse = null; }
      const z = pilote.ty * 60 + (pilote.poussee > 0.1 ? pilote.poussee * 60 : 0); if (Math.abs(z) > 4) zoomer(z);
    }, 16);
  }
  function changerVue(v) { for (let i = 0; i < 3 && vueSaturne !== v; i++) { clavierCode('keydown', 'KeyV'); clavierCode('keyup', 'KeyV'); } }

  // ── V2 phase 4 : objets 3D de la mini-carte et du Pad 3D (même geste que la souris sur le canevas) ──
  let objetGeste = null, minuteurObjet = 0, modeTablette = '';
  const centrerSur = cv => { const r = cv.getBoundingClientRect(); pos.x = Math.round(r.left + r.width / 2); pos.y = Math.round(r.top + r.height / 2); };
  function finObjet() { clearTimeout(minuteurObjet); if (objetGeste) { relacher(objetGeste.bouton, objetGeste.cv); objetGeste = null; } }
  function objet(m) {
    const reg = m.id && window.Objets3DPad ? Objets3DPad.obtenir(m.id) : null;
    if (m.g === 'fin') { finObjet(); return; }
    const cv = (reg && typeof reg.canvas === 'function' && reg.canvas()) || (window.CartePad && CartePad.canevasPrincipal());
    if (m.g === 'choisir') { if (reg && reg.choisir) reg.choisir(); else if (cv) { centrerSur(cv); clic(1, 0); } return; }
    if (reg && typeof reg[m.g] === 'function') { reg[m.g](m.dx * innerWidth, m.dy * innerHeight, m.delta); return; }   // l'objet gère lui-même ses gestes
    if (!cv) return;
    if (m.g === 'zoom') { centrerSur(cv); try { cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, clientX: pos.x, clientY: pos.y, deltaY: -m.delta, deltaMode: 0 })); } catch (x) {} return; }   // directement sur le canevas : une fenêtre posée par-dessus ne prend pas la molette
    const bouton = m.g === 'pan' ? 2 : 0;
    if (!objetGeste || objetGeste.bouton !== bouton || objetGeste.cv !== cv) { finObjet(); centrerSur(cv); objetGeste = { cv, bouton }; appuyer(bouton, cv); }
    const ancien = glisse; glisse = { el: cv, buttons: bouton === 2 ? 2 : 1, bouton }; bouger(m.dx * innerWidth * 0.9, m.dy * innerHeight * 0.9); glisse = ancien;
    clearTimeout(minuteurObjet); minuteurObjet = setTimeout(finObjet, 450);   // le doigt s'est arrêté ou la liaison est tombée : le bouton est relâché
  }
  /* La carte (fenêtres + objets) n'est envoyée que si la tablette est en mode « carte » ou « Pad 3D », et seulement quand elle change (4 fois par seconde au plus). */
  let derniereCarte = '';
  function pousserCarte(force) {
    if (!window.CartePad || !(ws && ws.readyState === 1) || !(force || modeTablette === 'carte' || modeTablette === 'pad3d')) return;
    const c = CartePad.construire(), j = JSON.stringify(c); if (!force && j === derniereCarte) return; derniereCarte = j; envoyer({ t: 'carte', carte: c });
  }

  // ── Application d'un message (seconde vérification par la liste blanche) ──
  function appliquer(brut) {
    const m = T.valider(brut); if (!m) return false;
    dernierEvenement = Date.now();
    switch (m.a) {
      case 'pointeur': bouger(m.dx, m.dy); break;
      case 'clic': clic(m.n, m.bouton); break;
      case 'glisse': glisser(m.etat, m.dx, m.dy, 0); break;
      case 'appui_long': appuiLong(); break;
      case 'verrou': verrou(); break;
      case 'lacher': lacher(); break;
      case 'defile': defiler(m.dx, m.dy); break;
      case 'zoom': zoomer(m.delta); break;
      case 'accueil3': COMMANDES.accueil(); break;
      case 'texte': ecrire(m.c); break;
      case 'special': speciale(m.k); break;
      case 'commande': COMMANDES[m.id](); break;
      case 'rayle': rayle(m); break;
      case 'pilote': appliquerPilote(m); break;
      case 'vue': changerVue(m.v); break;
      case 'mode': if (m.m !== 'pilotage') lacherPilote(); if (m.m !== 'carte' && m.m !== 'pad3d') finObjet(); modeTablette = m.m; derniereCarte = ''; pousserCarte(false); break;
      case 'fenetre_deplace': case 'fenetre_taille': case 'fenetre_act': if (window.CartePad && CartePad.appliquerFenetre(m)) setTimeout(() => pousserCarte(true), 60); break;
      case 'objet': objet(m); break;
      case 'carte_demande': derniereCarte = ''; pousserCarte(true); break;
    }
    return true;
  }

  // ── Liaison avec le serveur local ──
  const api = (chemin, corps) => fetch('/__tele/' + chemin, corps === undefined ? { headers: ENT } : { method: 'POST', headers: ENT, body: JSON.stringify(corps) }).then(r => r.json());
  function modeRayle() { try { return micOn && mode === 'conversation' ? 'ACTIF' : micOn && mode === 'veille' ? 'VEILLE' : 'COUPE'; } catch (e) { return 'COUPE'; } }
  let dernierEtatRayle = '';
  function envoyer(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function pousserEtatRayle(force) {
    let parole = false; try { parole = !!speaking; } catch (e) {}
    const s = modeRayle() + (parole ? '+' : ''); if (!force && s === dernierEtatRayle) return; dernierEtatRayle = s; envoyer({ t: 'etat-rayle', mode: modeRayle(), parole });
  }
  function connecter() {
    voulu = true; clearTimeout(minuteurWs);
    if (ws && ws.readyState <= 1) return;
    ws = new WebSocket('ws://' + location.host + '/__tele/ws');
    ws.onopen = () => { tentative = 0; pousserEtatRayle(true); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'ev') appliquer(Object.assign({}, m.m));
      else if (m.t === 'etat') { etat = m.etat; if (!etat.actif) arretLiaison(); else if (!(etat.appareils || []).some(a => a.connecte)) lacherPilote(); rendre(); dessinerPastille(); }
    };
    ws.onclose = () => { ws = null; if (voulu) { tentative++; minuteurWs = setTimeout(connecter, Math.min(5000, 400 * tentative)); } };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function arretLiaison() { voulu = false; lacherPilote(); try { ws && ws.close(); } catch (e) {} ws = null; }
  async function rafraichir() { try { etat = await api('etat'); } catch (e) { etat = { actif: false, appareils: [], journal: [], erreur: 'Serveur local injoignable.' }; } if (etat.actif) connecter(); rendre(); dessinerPastille(); return etat; }
  async function basculer(on) {
    try { etat = await api(on ? 'activer' : 'desactiver', {}); } catch (e) { etat = { actif: false, appareils: [], journal: [], erreur: 'Serveur local injoignable : la télécommande demande l\'application PC ou « node serveur.mjs ».' }; }
    if (etat.actif) { connecter(); ouvrirFenetre(); } else arretLiaison();
    rendre(); dessinerPastille();
  }

  // ── Interface : interrupteur dans ⚙ et fenêtre ──
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hm = t => t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  function svgQR(lignes) {
    const n = lignes.length; let d = '';
    lignes.forEach((l, y) => { for (let x = 0; x < n; x++) if (l[x] === '1') d += 'M' + x + ' ' + y + 'h1v1h-1z'; });
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="QR code de la télécommande"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#05060c"/></svg>';
  }
  let fenetre = null;
  function ouvrirFenetre() {
    if (!fenetre) {
      fenetre = document.createElement('section'); fenetre.id = 'tele-fenetre'; fenetre.setAttribute('role', 'dialog'); fenetre.setAttribute('aria-label', 'Pilotage depuis la tablette'); document.body.appendChild(fenetre);
      fenetre.addEventListener('click', async e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'fermer') fermerFenetre();
        else if (b.dataset.a === 'deconnecter') { etat = (await api('deconnecter', { id: b.dataset.id })).etat || etat; rendre(); dessinerPastille(); }
        else if (b.dataset.a === 'urgence') { etat = await api('urgence', {}); arretLiaison(); rendre(); dessinerPastille(); }
        else if (b.dataset.a === 'arret') basculer(false);
      });
      fenetre.addEventListener('change', async e => { if (e.target.id === 'tele-exp') { const r = await api('reglages', { expirationHeures: +e.target.value }); etat = r.etat || etat; rendre(); } });
    }
    fenetre.hidden = false; rendre();
  }
  function fermerFenetre() { if (fenetre) fenetre.hidden = true; }
  function rendre() {
    const sw = $('telInterrupteur'); if (sw) sw.checked = !!etat.actif;
    const info = $('telInfo'); if (info) info.textContent = etat.erreur ? etat.erreur : etat.actif ? 'Actif sur ' + etat.adresse + ' (réseau local seulement).' : 'Désactivé : rien n’écoute hors de ce PC.';
    if (!fenetre || fenetre.hidden) return;
    const exp = [[1, '1 heure'], [24, '24 heures'], [168, '7 jours'], [720, '30 jours'], [2160, '90 jours']];
    const coursExp = exp.some(x => x[0] === etat.expirationHeures) ? exp : exp.concat([[etat.expirationHeures, etat.expirationHeures + ' h']]);
    fenetre.innerHTML =
      '<header><b>PILOTAGE TABLETTE / TÉLÉPHONE</b><span class="tele-etat" data-on="' + (etat.actif ? 1 : 0) + '">' + (etat.actif ? 'ACTIF' : 'ARRÊTÉ') + '</span><button type="button" data-a="fermer" aria-label="Fermer">✕</button></header>' +
      (etat.erreur ? '<p class="tele-err">' + esc(etat.erreur) + '</p>' : '') +
      (etat.actif ? '<div class="tele-corps"><div class="tele-qr">' + (etat.qr ? svgQR(etat.qr) : '') + '</div><div class="tele-infos">' +
        '<p>1. Connecte la tablette au <b>même Wi-Fi</b>.<br>2. Scanne le QR code (ou ouvre l’adresse).<br>3. Saisis ce code sur la tablette :</p>' +
        '<div class="tele-code" aria-label="Code d’appairage">' + esc(etat.code) + '</div>' +
        '<p class="tele-adr">' + esc(etat.url) + '</p></div></div>' : '<p>Active l’interrupteur dans ⚙ Réglages pour afficher le QR code.</p>') +
      '<h4>Appareils appairés</h4>' +
      ((etat.appareils || []).length ? '<ul class="tele-app">' + etat.appareils.map(a => '<li><span class="tele-pt" data-on="' + (a.connecte ? 1 : 0) + '"></span><b>' + esc(a.nom) + '</b><small>' + (a.connecte ? 'connecté' + (a.latence != null ? ' · ' + a.latence + ' ms' : '') : 'hors ligne') + ' · expire ' + hm(a.expire) + '</small><button type="button" data-a="deconnecter" data-id="' + esc(a.id) + '">Déconnecter</button></li>').join('') + '</ul>' : '<p class="tele-vide">Aucun appareil appairé.</p>') +
      '<div class="tele-ligne"><label>Un appareil appairé reste autorisé <select id="tele-exp">' + coursExp.map(x => '<option value="' + x[0] + '"' + (x[0] === etat.expirationHeures ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label></div>' +
      '<details><summary>Journal des connexions</summary><ol class="tele-j">' + (etat.journal || []).slice().reverse().slice(0, 14).map(j => '<li>' + hm(Date.parse(j.h)) + ' · ' + esc(j.evt) + (j.appareil ? ' · ' + esc(j.appareil) : '') + (j.raison ? ' · ' + esc(j.raison) : '') + (j.ip ? ' <small>' + esc(j.ip) + '</small>' : '') + '</li>').join('') + '</ol></details>' +
      '<footer>' + (etat.actif ? '<button type="button" class="tele-arret" data-a="arret">Arrêter</button>' : '') + '<button type="button" class="tele-urg" data-a="urgence">ARRÊT D’URGENCE</button></footer>' +
      '<small class="tele-note">L’arrêt d’urgence ferme l’écoute et oublie tous les appareils. Seule la page Raylé obéit : rien ne touche à Windows.</small>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sw = $('telInterrupteur'); if (sw) sw.addEventListener('change', () => basculer(sw.checked));
    const ou = $('telOuvrir'); if (ou) ou.addEventListener('click', () => { rafraichir().then(ouvrirFenetre); });
    rafraichir();
    RayleBus.on('raylé:reponse', d => envoyer({ t: 'reponse', texte: String((d && d.texte) || '').slice(0, 600) }));
    setInterval(() => { if (ws && ws.readyState === 1) pousserEtatRayle(false); }, 800);
    setInterval(() => pousserCarte(false), 250);
    setInterval(() => { if (etat.actif && fenetre && !fenetre.hidden) rafraichir(); }, 4000);
  });
  window.Telecommande = { etat: () => etat, appliquer, rafraichir, activer: () => basculer(true), desactiver: () => basculer(false), ouvrir: () => rafraichir().then(ouvrirFenetre), position: () => ({ ...pos }), connectee: () => !!(ws && ws.readyState === 1), derniereAction: () => dernierEvenement };
})();
