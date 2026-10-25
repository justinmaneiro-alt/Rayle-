/* Télécommande tactile de Raylé (K2) : quatre modes (pavé, clavier en éventail, Raylé, pilotage) qui envoient des événements à la page Raylé ouverte sur le PC,
   par une liaison WebSocket authentifiée (appairage par code à 6 chiffres, puis jeton propre à l'appareil). Rien n'agit au niveau de Windows.
   Hors liaison (page ouverte directement en local pour l'essai) : le clavier écrit seulement dans son champ de test et émet « rayle:touche ». */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var T = window.TeleCalcul;
  var $ = function (id) { return document.getElementById(id); };

  // ───────────── Réglages (sur l'appareil) ─────────────
  var reg = { main: 'gauche', taille: 100, vibre: true, sens: 10, mode: 'clavier', cible: 'auto' };
  try { var s = JSON.parse(localStorage.getItem('rayle_clavier_reglages') || '{}'); for (var k in reg) if (s[k] !== undefined) reg[k] = s[k]; } catch (e) {}
  function sauver() { try { localStorage.setItem('rayle_clavier_reglages', JSON.stringify(reg)); } catch (e) {} }
  function vibrer(ms) { if (reg.vibre && navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch (e) {} } }
  var minuteurInfo;
  function info(t) { var e = $('info'); e.textContent = t; e.classList.add('vu'); clearTimeout(minuteurInfo); minuteurInfo = setTimeout(function () { e.classList.remove('vu'); }, 1600); }

  // ───────────── Liaison avec le PC ─────────────
  var L = { reseau: false, jeton: null, ws: null, ouvert: false, rtt: null, pc: false, dernierPong: 0, n: 0, envoyes: {}, tentative: 0, minuteur: 0, surface: '2d', delaiMax: (T && T.DELAI_MAX_MS) || 5000 };
  try { L.jeton = localStorage.getItem('rayle_k2_jeton') || null; } catch (e) {}
  function voyant(id, etat, texte) { var e = $(id); e.setAttribute('data-etat', etat); if (texte != null) { var t = e.querySelector('span'); if (t) t.textContent = texte; } }
  function majVoyants() {
    if (!L.reseau) { voyant('liaison', 'hors', 'ESSAI · HORS LIAISON'); voyant('pc', 'hors'); return; }
    if (!L.ouvert) { voyant('liaison', L.jeton ? 'coupe' : 'hors', L.jeton ? 'LIAISON COUPÉE' : 'NON APPAIRÉ'); voyant('pc', 'hors'); return; }
    var q = T.classerLatence(L.rtt);
    voyant('liaison', q === 'lente' ? 'lent' : 'ok', L.rtt == null ? 'CONNECTÉ' : L.rtt + ' ms');
    voyant('pc', L.pc ? 'ok' : 'coupe');
  }
  // Envoi : seulement si la liaison est ouverte. Rien n'est mis en attente (un ordre périmé ne doit jamais partir en retard).
  function envoyer(msg) {
    if (!L.ws || !L.ouvert) return false;
    try { L.ws.send(JSON.stringify(msg)); return true; } catch (e) { return false; }
  }
  function fermerLiaison() { clearInterval(L.pings); clearInterval(L.garde); try { L.ws && L.ws.close(); } catch (e) {} }
  function connecter() {
    if (!L.jeton || (L.ws && L.ws.readyState <= 1)) return;
    var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/clavier/ws?jeton=' + encodeURIComponent(L.jeton));
    L.ws = ws;
    ws.onopen = function () {
      L.ouvert = true; L.tentative = 0; L.dernierPong = Date.now(); majVoyants();
      clearInterval(L.pings); clearInterval(L.garde);
      L.pings = setInterval(function () { var n = ++L.n; L.envoyes[n] = Date.now(); envoyer({ t: 'ping', n: n, l: L.rtt == null ? undefined : L.rtt }); }, 2000);
      L.garde = setInterval(function () { if (Date.now() - L.dernierPong > L.delaiMax) { info('Liaison trop lente : reconnexion…'); try { ws.close(); } catch (e) {} } }, 1000);
      envoyer({ a: 'mode', m: reg.mode });
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'pong') { var t0 = L.envoyes[m.n]; delete L.envoyes[m.n]; L.dernierPong = Date.now(); if (t0) L.rtt = Date.now() - t0; majVoyants(); }
      else if (m.t === 'bienvenue') { L.pc = !!m.pc; if (m.delaiMax) L.delaiMax = m.delaiMax; majVoyants(); }
      else if (m.t === 'pc') { L.pc = !!m.connecte; majVoyants(); }
      else if (m.t === 'reponse') ajouterReponse(m.texte);
      else if (m.t === 'etat-rayle') etatRayle(m.mode, m.parole);
      else if (m.t === 'surface') { L.surface = m.v; majCible(); }
      else if (m.t === 'saisie') { verrouPC = m.v ? (m.genre || 'fenetre') : ''; if (m.v) vibrer(25); }
    };
    ws.onclose = function (e) {
      L.ouvert = false; L.pc = false; clearInterval(L.pings); clearInterval(L.garde); majVoyants(); lacherTout();
      if (L.ws !== ws) return; L.ws = null;
      if (e && (e.code === 4001 || e.code === 4002)) return oublier('Cet appareil a été déconnecté depuis le PC.');
      L.tentative++;
      L.minuteur = setTimeout(verifierPuisConnecter, Math.min(5000, 300 * L.tentative));
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  // Après une coupure : le jeton est-il toujours valable ? (sinon il faut un nouvel appairage)
  function verifierPuisConnecter() {
    fetch('/clavier/statut?jeton=' + encodeURIComponent(L.jeton || ''), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s && s.k2 && !s.jetonValide) oublier('Cet appareil n\'est plus autorisé (expiré ou déconnecté). Saisis un nouveau code.'); else connecter(); })
      .catch(function () { L.minuteur = setTimeout(verifierPuisConnecter, 2000); });
  }
  function oublier(msg) {
    try { localStorage.removeItem('rayle_k2_jeton'); } catch (e) {}
    L.jeton = null; fermerLiaison(); L.ws = null; L.ouvert = false; majVoyants(); afficherAppairage(msg);
  }

  // ───────────── Appairage ─────────────
  var codeSaisi = '';
  function nomParDefaut() { var ua = navigator.userAgent; return /iPhone|Android.*Mobile/.test(ua) ? 'Téléphone' : 'Tablette'; }
  function majCode() { var s = codeSaisi + '······'.slice(codeSaisi.length); $('code-aff').textContent = s.split('').join(' '); }
  function afficherAppairage(msg) {
    codeSaisi = ''; majCode(); $('app-msg').textContent = msg || ''; $('appairage').hidden = false;
    if (!$('nom-app').value) $('nom-app').value = nomParDefaut();
  }
  function construirePaveNum() {
    var z = $('pave-num'); z.textContent = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫', 'OK'].forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.setAttribute('data-c', c);
      b.addEventListener('click', function () {
        vibrer(10);
        if (c === '⌫') codeSaisi = codeSaisi.slice(0, -1); else if (c === 'OK') return valider(); else if (codeSaisi.length < 6) codeSaisi += c;
        $('app-msg').textContent = ''; majCode(); if (codeSaisi.length === 6 && c !== '⌫') valider();
      });
      z.appendChild(b);
    });
  }
  function valider() {
    if (codeSaisi.length !== 6) { $('app-msg').textContent = 'Saisis les 6 chiffres affichés sur le PC.'; return; }
    fetch('/clavier/appairer', { method: 'POST', body: JSON.stringify({ code: codeSaisi, nom: $('nom-app').value || nomParDefaut() }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.j.jeton) { $('app-msg').textContent = (r.j && r.j.erreur) || 'Code refusé.'; codeSaisi = ''; majCode(); return; }
        L.jeton = r.j.jeton; try { localStorage.setItem('rayle_k2_jeton', L.jeton); } catch (e) {}
        $('appairage').hidden = true; connecter();
      }).catch(function () { $('app-msg').textContent = 'Le PC ne répond pas.'; });
  }

  // ───────────── Modes ─────────────
  var MODES = ['pave', 'clavier', 'rayle', 'pilotage'];
  function definirMode(m, silencieux) {
    if (MODES.indexOf(m) < 0) return;
    if (reg.mode === 'pilotage' && m !== 'pilotage') lacherPilote();
    reg.mode = m; document.body.setAttribute('data-mode', m); sauver();
    MODES.forEach(function (x) { $('v-' + x).hidden = x !== m; });
    if (m === 'clavier') { dessinerArc(); redessinerClavier(); }
    if (m === 'pave') setTimeout(tailleCv, 0);
    if (!silencieux) { vibrer(10); envoyer({ a: 'mode', m: m }); }
  }
  $('modes').addEventListener('click', function (e) { var b = e.target.closest('.mode'); if (!b || balayeRecemment()) return; definirMode(b.getAttribute('data-m')); });
  // Geste : balayer l'en-tête vers la gauche / la droite change de mode
  var balayage = null, balayeA = 0;
  var balayeRecemment = function () { return Date.now() - balayeA < 350; };
  $('haut').addEventListener('pointerdown', function (e) { balayage = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }; });
  $('haut').addEventListener('pointerup', function (e) {
    if (!balayage || balayage.id !== e.pointerId) return;
    var dx = e.clientX - balayage.x, dy = e.clientY - balayage.y, dt = Date.now() - balayage.t; balayage = null;
    if (Math.abs(dx) > 90 && Math.abs(dy) < 50 && dt < 700) {
      var i = MODES.indexOf(reg.mode) + (dx < 0 ? 1 : -1); balayeA = Date.now();
      if (i >= 0 && i < MODES.length) definirMode(MODES[i]);
    }
  });
  $('haut').addEventListener('pointercancel', function () { balayage = null; });

  // ───────────── Mode CLAVIER ─────────────
  var texte = '', pret = true, maj = 0, majUne = false, majSansAutre = false;
  function emettre(type, touche, extra) {
    var detail = { type: type, touche: touche, maj: maj > 0 || majUne, horodatage: Date.now(), source: 'clavier-eventail' };
    for (var k in extra) detail[k] = extra[k];
    document.dispatchEvent(new CustomEvent('rayle:touche', { detail: detail }));
  }
  function afficher() { $('texte').textContent = texte.length > 70 ? '…' + texte.slice(-69) : texte; }
  function ecrire(c) {
    if (maj > 0 || majUne) c = c.toUpperCase();
    if (majUne && maj === 0) { majUne = false; majLatch(); }
    texte += c; majSansAutre = false; afficher(); emettre('texte', c, {}); envoyer({ a: 'texte', c: c });
  }
  var NOMS = { accueil: 'Accueil', retour: 'Retour', fermer: 'Fermer la fenêtre', terre: 'Terre', mars: 'Mars', saturne: 'Saturne', atelier3d: 'Atelier 3D', precedent: 'Précédent', suivant: 'Suivant', plein_ecran: 'Plein écran', mode_leger: 'Mode léger', capture: 'Capture', echap: 'Échap' };
  function agir(t) {
    if (!pret) return;
    if (t.id === 'maj') { maj++; majSansAutre = true; majLatch(); return; }
    majSansAutre = false;
    if (t.id === 'echap') { emettre('special', 'Escape', {}); if (!envoyer({ a: 'special', k: 'Escape' })) info('Échap' + (L.reseau ? ' : liaison coupée' : ' (essai : non reliée)')); return; }
    if (t.cmd) { emettre('commande', t.id, {}); if (!envoyer({ a: 'commande', id: t.id })) info(NOMS[t.id] + (L.reseau ? ' : liaison coupée' : ' (essai : non reliée)')); return; }
    if (t.id === 'effacer') { texte = texte.slice(0, -1); afficher(); emettre('special', 'Backspace', {}); envoyer({ a: 'special', k: 'Backspace' }); return; }
    if (t.id === 'entree') { texte += '↵'; afficher(); emettre('special', 'Enter', {}); envoyer({ a: 'special', k: 'Enter' }); return; }
    if (t.id === 'espace') { texte += ' '; afficher(); emettre('special', ' ', {}); envoyer({ a: 'special', k: ' ' }); return; }
    ecrire(t.c);
  }
  function relacherTouche(t) { if (t.id === 'maj' && maj > 0) { maj--; if (maj === 0 && majSansAutre) majUne = true; majLatch(); } }
  function majLatch() {
    var el = document.querySelector('[data-id="maj"]'); if (el) el.classList.toggle('latch', majUne || maj > 0);
    var ch = document.querySelectorAll('.touche.car text'); for (var i = 0; i < ch.length; i++) { var t = ch[i]; var b = t.getAttribute('data-c'); t.textContent = (majUne || maj > 0) ? b.toUpperCase() : b; }
  }
  function definirEtat(p) {
    pret = p; texteBord(p ? 'PRÊT' : 'VEILLE'); $('etat').textContent = p ? 'PRÊT' : 'VEILLE'; $('etat').setAttribute('data-etat', p ? 'pret' : 'veille'); document.body.setAttribute('data-etat', p ? 'pret' : 'veille');
    if (!p) { majUne = false; majLatch(); }
  }
  $('etat').addEventListener('click', function () { definirEtat(!pret); });

  function el(nom, attrs, parent) { var e = document.createElementNS(NS, nom); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function groupe(parent, def, classes) { var g = el('g', { 'class': 'touche ' + classes, 'data-id': def.id }, parent); g.__def = def; return g; }

  // Éventail : l'anneau intérieur (le plus près du pouce) a 3 grandes touches, le milieu 4, l'extérieur 5. Les 12 touches sont des commandes de Raylé.
  var ANNEAUX = [
    { r1: 84, r2: 214, pas: 30, noms: [['accueil', 'Accueil'], ['retour', 'Retour'], ['fermer', 'Fermer']], f: 14 },
    { r1: 222, r2: 330, pas: 22.5, noms: [['terre', 'Terre'], ['mars', 'Mars'], ['saturne', 'Saturne'], ['atelier3d', 'Atelier 3D']], f: 12 },
    { r1: 338, r2: 440, pas: 15, noms: [['precedent', 'Précédent'], ['suivant', 'Suivant'], ['plein_ecran', 'Plein écran'], ['mode_leger', 'Mode léger'], ['capture', 'Capture'], ['echap', 'Échap']], f: 10 }
  ];
  /* Éventail en perspective : l'anneau intérieur (le plus près du pouce) a 3 grandes touches, le milieu 4, l'extérieur 6. Touches en traits fins brillants. */
  function dessinerArc() {
    var svg = $('arc'), W = 440, miroir = reg.main === 'droite', sens = miroir ? 0 : 1;
    svg.textContent = ''; svg.setAttribute('viewBox', '-14 -14 468 468'); svg.setAttribute('preserveAspectRatio', miroir ? 'xMaxYMax meet' : 'xMinYMax meet');
    var P = function (r, a) { var x = r * Math.cos(a), y = r * Math.sin(a); return [(miroir ? W - x : x).toFixed(1), (W - y).toFixed(1)]; };
    var rad = function (d) { return d * Math.PI / 180; };
    var defs = el('defs', {}, svg);
    el('path', { id: 'bordArc', d: 'M' + P(456, rad(84)) + 'A456 456 0 0 ' + sens + ' ' + P(456, rad(6)) }, defs);
    // bords lumineux : fines lignes d'arc continues derrière les touches
    [78, 452].forEach(function (r) { el('path', { 'class': 'filet', d: 'M' + P(r, 0) + 'A' + r + ' ' + r + ' 0 0 ' + (1 - sens) + ' ' + P(r, rad(90)) }, svg); });
    ANNEAUX.forEach(function (an, ia) {
      an.noms.forEach(function (n, i) {
        var a0 = rad(i * an.pas + 1.2), a1 = rad((i + 1) * an.pas - 1.2);
        var p1 = P(an.r2, a0), p2 = P(an.r2, a1), p3 = P(an.r1, a1), p4 = P(an.r1, a0);
        var d = 'M' + p1 + 'A' + an.r2 + ' ' + an.r2 + ' 0 0 ' + (1 - sens) + ' ' + p2 + 'L' + p3 + 'A' + an.r1 + ' ' + an.r1 + ' 0 0 ' + sens + ' ' + p4 + 'Z';
        var g = groupe(svg, { id: n[0], cmd: n[0] !== 'echap' }, 'cmd'); g.setAttribute('data-rang', 'a' + ia);
        el('path', { d: d, 'stroke-linejoin': 'round' }, g);
        var c = P((an.r1 + an.r2) / 2, (a0 + a1) / 2), t = el('text', { x: c[0], y: c[1] }, g); t.textContent = n[1]; t.setAttribute('style', 'font-size:' + an.f + 'px');
      });
    });
    var tb = el('text', { 'class': 'bord' }, svg), tp = el('textPath', { startOffset: '3%' }, tb); tp.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#bordArc'); tp.setAttribute('href', '#bordArc'); tp.id = 'bord-texte'; tp.textContent = texteBordCourant;
  }
  var texteBordCourant = 'MISE SOUS TENSION';
  function texteBord(t) { texteBordCourant = t; var e = document.getElementById('bord-texte'); if (e) e.textContent = t; var c = document.getElementById('cadran-texte'); if (c) c.textContent = t === 'MISE SOUS TENSION' ? 'TENSION' : t; }
  // Cadran : la bague circulaire lumineuse au centre de l'ensemble (décor vivant : arcs qui tournent, graduations)
  function dessinerCadran() {
    var svg = $('cadran'); svg.textContent = ''; svg.setAttribute('viewBox', '-60 -60 120 120');
    var g = el('g', { 'class': 'cad-fixe' }, svg);
    el('circle', { r: 53, 'class': 'cad-c1' }, g); el('circle', { r: 45, 'class': 'cad-c2' }, g); el('circle', { r: 20, 'class': 'cad-c3' }, g);
    var tic = ''; for (var i = 0; i < 48; i++) { var a = i * Math.PI / 24, r0 = i % 4 === 0 ? 47.5 : 49.5; tic += 'M' + (Math.cos(a) * r0).toFixed(1) + ' ' + (Math.sin(a) * r0).toFixed(1) + 'L' + (Math.cos(a) * 52).toFixed(1) + ' ' + (Math.sin(a) * 52).toFixed(1); }
    el('path', { d: tic, 'class': 'cad-tic' }, g);
    el('path', { d: 'M-45 0A45 45 0 0 1 0 -45', 'class': 'cad-arc a' }, svg); el('path', { d: 'M45 0A45 45 0 0 1 0 45', 'class': 'cad-arc b' }, svg); el('path', { d: 'M-34 0A34 34 0 0 0 0 34', 'class': 'cad-arc c' }, svg);
    el('circle', { r: 3.2, 'class': 'cad-pt' }, svg);
    var t = el('text', { x: 0, y: 1, 'class': 'cad-t', id: 'cadran-texte' }, svg); t.textContent = texteBordCourant === 'MISE SOUS TENSION' ? 'TENSION' : texteBordCourant;
  }
  // Glyphes originaux : un petit signe de traits sur un réseau de 3 × 3 points, propre à chaque caractère (calculé, jamais copié d'une police ou d'un logo)
  function glyphe(c) {
    var s = 0, base = String(c).normalize ? String(c).normalize('NFD') : String(c);
    for (var i = 0; i < base.length; i++) s = (s * 31 + base.charCodeAt(i) * 17 + 7) >>> 0;
    var r = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }, pas = 9;
    var pts = [], n = 3 + Math.floor(r() * 2), x = Math.floor(r() * 3), y = Math.floor(r() * 3);
    for (var k = 0; k < n; k++) { pts.push([x, y]); var nx = Math.floor(r() * 3), ny = Math.floor(r() * 3); if (nx === x && ny === y) nx = (nx + 1) % 3; x = nx; y = ny; }
    var d = 'M' + pts.map(function (p) { return ((p[0] - 1) * pas) + ' ' + ((p[1] - 1) * pas); }).join('L');
    var fin = pts[pts.length - 1], accent = base.length > 1 ? 'M' + ((fin[0] - 1) * pas + 3) + ' ' + ((fin[1] - 1) * pas - 4) + 'l3 -3' : '';
    return d + accent + 'M' + ((pts[0][0] - 1) * pas - 1.5) + ' ' + ((pts[0][1] - 1) * pas) + 'a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0';
  }
  var GLYPHES_SPE = { effacer: 'M-13 0L-5 -8H13V8H-5Z M0 -3L6 3M6 -3L0 3', entree: 'M13 -9V2H-8M-8 2L-1 -5M-8 2L-1 9', maj: 'M0 -9L9 1H4V9H-4V1H-9Z', espace: 'M-14 -2V4H14V-2' };
  /* Vrai AZERTY, décalages du clavier physique, 12 unités de large : chiffres, A Z E R T Y U I O P (+ é), Q S D F G H J K L M (+ è), Maj + W X C V B N (+ ç , . '), à ù et la ponctuation + Entrée.
     La barre d'espace est dessinée à part, sous les cinq rangées. */
  var LIGNES = [
    { off: 0, k: '1234567890'.split('').map(function (c) { return { c: c }; }).concat([{ id: 'effacer', l: '⌫', w: 2, spe: 1 }]) },
    { off: 0.5, k: 'azertyuiop'.split('').map(function (c) { return { c: c }; }).concat([{ c: 'é' }]) },
    { off: 0.75, k: 'qsdfghjklm'.split('').map(function (c) { return { c: c }; }).concat([{ c: 'è' }]) },
    { off: 0, k: [{ id: 'maj', l: '⇧ Maj', w: 2, spe: 1 }].concat('wxcvbn'.split('').map(function (c) { return { c: c }; }), [{ c: 'ç' }, { c: ',' }, { c: '.' }, { c: "'" }]) },
    { off: 0, k: [{ c: 'à' }, { c: 'ù' }, { c: '-' }, { c: '?' }, { c: '!' }, { c: ':' }, { c: ';' }, { c: '(' }, { c: ')' }, { id: 'entree', l: 'Entrée', w: 3, spe: 1 }] }
  ];
  var COLONNES = 12, NB_RANGS = 5;
  // touche aux angles coupés (rectangulaire) ; les touches spéciales ont les pointes d'un hexagone allongé
  function formeTouche(x, y, w, h, spe) {
    var c = spe ? Math.min(h / 2 - 1, 15) : 8, x2 = x + w, y2 = y + h;
    return spe ? 'M' + (x + c) + ' ' + y + 'H' + (x2 - c) + 'L' + x2 + ' ' + (y + h / 2) + 'L' + (x2 - c) + ' ' + y2 + 'H' + (x + c) + 'L' + x + ' ' + (y + h / 2) + 'Z'
      : 'M' + (x + c) + ' ' + y + 'H' + x2 + 'V' + (y2 - c) + 'L' + (x2 - c) + ' ' + y2 + 'H' + x + 'V' + (y + c) + 'Z';
  }
  function dessinerLettres() {
    var svg = $('lettres'), LW = svg.clientWidth, LH = svg.clientHeight;
    if (!LW || !LH) { LW = 780; LH = 460; }                                   // zone masquée (autre mode) : dessin par défaut, refait à l'affichage
    var U = LW / COLONNES, H = LH / NB_RANGS, G = Math.max(3, Math.min(U, H) * 0.07), pt = Math.min(U, H);
    svg.textContent = ''; svg.setAttribute('viewBox', '0 0 ' + LW.toFixed(1) + ' ' + LH.toFixed(1)); svg.setAttribute('preserveAspectRatio', 'none');
    LIGNES.forEach(function (lig, r) {
      var x = lig.off * U;
      lig.k.forEach(function (k) {
        var w = (k.w || 1) * U, def = k.id ? { id: k.id } : { id: 'c-' + k.c, c: k.c };
        var g = groupe(svg, def, k.spe ? 'spe' : 'car'); g.setAttribute('data-rang', 'r' + r); g.setAttribute('data-x', (x / U).toFixed(2)); g.setAttribute('data-l', k.id ? k.id : k.c);
        el('path', { d: formeTouche(x + G / 2, r * H + G / 2, w - G, H - G, !!k.spe), 'stroke-linejoin': 'round' }, g);
        var cx = x + w / 2, cy = r * H + H / 2;
        // glyphe décoratif d'origine, discret, derrière la lettre ; la lettre est GRANDE et lisible
        el('path', { 'class': 'glyphe', d: k.spe ? GLYPHES_SPE[k.id] : glyphe(k.c), transform: 'translate(' + (cx - (k.spe ? 0 : w * 0.28)).toFixed(1) + ',' + (r * H + H * 0.3).toFixed(1) + ') scale(' + (pt / 70).toFixed(2) + ')' }, g);
        var t = el('text', { x: cx.toFixed(1), y: (cy + (k.spe ? 0 : pt * 0.04)).toFixed(1), 'class': k.spe ? 'petite' : 'grande' }, g);
        t.textContent = k.spe ? k.l : k.c; t.setAttribute('style', 'font-size:' + (k.spe ? Math.max(12, pt * 0.3) : Math.max(18, pt * 0.52)).toFixed(1) + 'px'); if (!k.spe) t.setAttribute('data-c', k.c);
        x += w;
      });
    });
    majLatch();
  }
  // Barre d'espace : longue, lumineuse, indépendante et flottante sous l'éventail
  function dessinerEspace() {
    var svg = $('espace-svg'); svg.textContent = ''; svg.setAttribute('viewBox', '0 0 640 56');
    var g = groupe(svg, { id: 'espace' }, 'spe esp');
    el('path', { d: formeTouche(18, 8, 604, 40, true), 'stroke-linejoin': 'round' }, g);
    el('path', { 'class': 'glyphe', d: GLYPHES_SPE.espace, transform: 'translate(320,26)' }, g);
    var t = el('text', { x: 320, y: 27, 'class': 'esp-t' }, g); t.textContent = 'ESPACE'; t.setAttribute('dx', '58');
  }
  // rangée touchée : tout le rang prend un remplissage bleu plus vif ; onde qui se propage depuis la touche
  function rangeeActive(g, on) { var r = g.getAttribute('data-rang'); if (!r) return; var l = g.parentNode.querySelectorAll('.touche[data-rang="' + r + '"]'); for (var i = 0; i < l.length; i++) l[i].classList.toggle('rang', on); }
  function onde(g) {
    var svg = g.ownerSVGElement; if (!svg || !g.getBBox) return; var b; try { b = g.getBBox(); } catch (x) { return; }
    var c = el('circle', { cx: (b.x + b.width / 2).toFixed(1), cy: (b.y + b.height / 2).toFixed(1), r: 4, 'class': 'onde' }, svg);
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 650);
  }
  var actifs = {};   // pointerId → touche (un pointeur par doigt)
  function bas(e) {
    var g = e.target.closest && e.target.closest('.touche'); if (!g) return;
    e.preventDefault();
    try { g.setPointerCapture(e.pointerId); } catch (x) {}
    if (actifs[e.pointerId]) return;
    var a = { g: g, def: g.__def, rep: null }; actifs[e.pointerId] = a;
    g.classList.add('on'); if (pret) vibrer(12); rangeeActive(g, true); onde(g);
    agir(g.__def);
    if (g.__def.id === 'effacer' && pret) a.rep = setTimeout(function rep() { texte = texte.slice(0, -1); afficher(); emettre('special', 'Backspace', { repetition: true }); envoyer({ a: 'special', k: 'Backspace' }); a.rep = setTimeout(rep, 70); }, 420);
  }
  function haut(e) {
    var a = actifs[e.pointerId]; if (!a) return;
    clearTimeout(a.rep); a.g.classList.remove('on'); delete actifs[e.pointerId]; rangeeActive(a.g, false);
    var encore = false; for (var k in actifs) if (actifs[k].g === a.g) encore = true;
    if (encore) a.g.classList.add('on');
    relacherTouche(a.def);
  }
  ['arc', 'lettres', 'espace-svg'].forEach(function (id) {
    var s = $(id);
    s.addEventListener('pointerdown', bas); s.addEventListener('pointerup', haut); s.addEventListener('pointercancel', haut); s.addEventListener('lostpointercapture', haut);
  });

  // ───────────── Mode PAVÉ ─────────────
  var pave = $('pave'), pts = {}, nPts = 0, accX = 0, accY = 0, resteX = 0, resteY = 0, accZoom = 0, accDefX = 0, accDefY = 0;
  var tap = { t: 0, x: 0, y: 0 }, appui = null, troisFait = false, longFait = false, bougeTotal = 0, glisseOuvert = false, vit = { x: 0, y: 0, t: 0 }, inertie = 0, rafPave = 0, deuxDoigts = null;
  var verrouPC = '', lockFait = false, lockVx = 0, lockVy = 0, joy = null, joyRaf = 0;   // R3.1 : double appui maintenu = verrou ; joystick invisible = partie droite du pavé pendant le verrou
  var camGeste = false;   // geste en cours : true = le doigt pilote la caméra, false = il déplace le curseur
  function cibleEffective() { return reg.cible === 'auto' ? 'curseur' : reg.cible; }   // auto : le doigt déplace TOUJOURS le curseur (pour viser une fenêtre 3D) ; un appui posé avant de glisser = caméra
  function majCible() {
    var b = $('pave-cible'), c = cibleEffective();
    b.setAttribute('data-v', c); b.textContent = reg.cible === 'auto' ? (L.surface === '3d' ? 'Auto · Curseur · appui+glisser = caméra' : 'Auto · Curseur') : (c === 'camera' ? 'Caméra' : 'Curseur');
  }
  $('pave-cible').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('pave-cible').addEventListener('click', function () { reg.cible = reg.cible === 'auto' ? 'curseur' : reg.cible === 'curseur' ? 'camera' : 'auto'; sauver(); majCible(); vibrer(10); });
  function arreterInertie() { if (inertie) { cancelAnimationFrame(inertie); inertie = 0; } }
  function planifier() { if (!rafPave) rafPave = requestAnimationFrame(vider); }
  function sens() { return reg.sens / 10; }
  function vider() {
    rafPave = 0;
    var cam = camGeste;
    if (accX || accY) {
      if (cam) {
        if (!glisseOuvert) { glisseOuvert = true; envoyer({ a: 'glisse', etat: 'debut' }); }
        var gx = accX * sens() + resteX, gy = accY * sens() + resteY, rx = Math.round(gx), ry = Math.round(gy); resteX = gx - rx; resteY = gy - ry;
        if (rx || ry) envoyer({ a: 'glisse', etat: 'bouge', dx: rx, dy: ry });
      } else {
        var d = lockFait ? { dx: accX * sens() * 0.9, dy: accY * sens() * 0.9 } : T.deplacementPave(accX, accY, sens()), px = d.dx + resteX, py = d.dy + resteY, ix = Math.round(px), iy = Math.round(py); resteX = px - ix; resteY = py - iy;
        if (ix || iy) envoyer({ a: 'pointeur', dx: ix, dy: iy });
      }
      accX = accY = 0;
    }
    if (accZoom) { envoyer({ a: 'zoom', delta: Math.round(accZoom) }); accZoom = 0; }
    if (accDefX || accDefY) { envoyer({ a: 'defile', dx: Math.round(accDefX), dy: Math.round(accDefY) }); accDefX = accDefY = 0; }
  }
  /* joystick invisible : un second doigt posé dans les 35 % de droite pendant le verrou ; vitesse proportionnelle au décalage depuis son point de départ (zone morte 6 px) */
  function boucleJoy() {
    joyRaf = 0; if (!joy || !lockFait) return;
    var ox = joy.x - joy.x0, oy = joy.y - joy.y0, f = function (o) { var a = Math.abs(o); if (a < 6) return 0; var k = Math.min(1, (a - 6) / 60); return (o < 0 ? -1 : 1) * k * k * 9; };
    accX += f(ox); accY += f(oy); if (accX || accY) vider(); joyRaf = requestAnimationFrame(boucleJoy);
  }
  function finVerrou() { if (lockFait) { lockFait = false; envoyer({ a: 'lacher' }); } joy = null; verrouPC = ''; lockVx = lockVy = 0; }
  function fermerGlisse() { if (glisseOuvert) { glisseOuvert = false; envoyer({ a: 'glisse', etat: 'fin' }); } }
  function lancerInertie() {
    var v = { vx: vit.x, vy: vit.y }, dernier = performance.now();
    if (Math.hypot(v.vx, v.vy) < 0.35 || camGeste) return;
    (function pas(now) {
      var dt = Math.min(40, now - dernier); dernier = now;
      v = T.pasInertie(v.vx, v.vy, dt); if (v.fini) { inertie = 0; return; }
      accX += v.vx * dt; accY += v.vy * dt; vider(); inertie = requestAnimationFrame(pas);
    })(dernier);
    inertie = requestAnimationFrame(function (n) { dernier = n; });
  }
  function centre() { var xs = 0, ys = 0, n = 0, k; for (k in pts) { xs += pts[k].x; ys += pts[k].y; n++; } return { x: xs / n, y: ys / n }; }
  function distance() { var a = Object.keys(pts); if (a.length < 2) return 0; var p = pts[a[0]], q = pts[a[1]]; return Math.hypot(p.x - q.x, p.y - q.y); }
  pave.addEventListener('pointerdown', function (e) {
    e.preventDefault(); try { pave.setPointerCapture(e.pointerId); } catch (x) {}
    if (lockFait && !joy) { var rp = pave.getBoundingClientRect(); if (e.clientX > rp.left + rp.width * 0.65) { joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; vibrer(8); if (!joyRaf) joyRaf = requestAnimationFrame(boucleJoy); return; } }
    if (lockFait) return;   // pendant le verrou, tout autre doigt hors de la zone joystick est ignoré
    arreterInertie(); pave.classList.add('actif');
    pts[e.pointerId] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
    nPts = Object.keys(pts).length;
    if (nPts === 1) { appui = { t: Date.now(), moved: false, decide: false }; longFait = false; bougeTotal = 0; vit = { x: 0, y: 0, t: performance.now() };
      if (Date.now() - tap.t < 360 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 40) appui.verrouT = setTimeout(function () { if (nPts === 1 && !appui.moved && !troisFait && !joy) { lockFait = true; longFait = true; lockVx = lockVy = 0; clearTimeout(appui.long); envoyer({ a: 'verrou' }); vibrer(30); } }, 170);   // double appui maintenu : le PC verrouille la cible
      clearTimeout(appui.long); appui.long = setTimeout(function () { if (nPts === 1 && !appui.moved && !troisFait) { longFait = true; vibrer(30); envoyer({ a: 'appui_long' }); } }, 520); }   // appui long : le PC décide — barre de titre ou poignée d'une fenêtre = saisie (le doigt qui glisse déplace la fenêtre), ailleurs = clic droit
    else { if (appui) { clearTimeout(appui.long); appui.moved = true; } }
    if (nPts === 2) deuxDoigts = { d: distance(), c: centre() };
    if (nPts >= 3 && !troisFait) { troisFait = true; vibrer([20, 40, 20]); envoyer({ a: 'accueil3' }); if (appui) clearTimeout(appui.long); }
  });
  pave.addEventListener('pointermove', function (e) {
    if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; return; }
    var p = pts[e.pointerId]; if (!p || troisFait) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (nPts === 1) {
      bougeTotal += Math.abs(dx) + Math.abs(dy);
      if (appui && bougeTotal > 10) { appui.moved = true; clearTimeout(appui.long); }
      if (lockFait) { lockVx = lockVx * 0.4 + dx * 0.6; lockVy = lockVy * 0.4 + dy * 0.6; accX += lockVx; accY += lockVy; camGeste = false; planifier(); return; }   // verrou : suivi direct, un peu lissé, jamais d'accélération ni de caméra
      if (!appui.decide) { appui.decide = true; camGeste = reg.cible === 'camera' || (reg.cible === 'auto' && L.surface === '3d' && Date.now() - appui.t >= 220); if (camGeste) vibrer(8); }   // décidé au premier mouvement : doigt posé ≥ 220 ms sur une vue 3D = caméra
      accX += dx; accY += dy;
      var now = performance.now(), dtv = Math.max(1, now - vit.t); vit.x = vit.x * 0.6 + (dx / dtv) * 0.4; vit.y = vit.y * 0.6 + (dy / dtv) * 0.4; vit.t = now;
      planifier();
    } else if (nPts === 2 && deuxDoigts) {
      var d = distance(), c = centre(), dd = d - deuxDoigts.d, cx = c.x - deuxDoigts.c.x, cy = c.y - deuxDoigts.c.y;
      deuxDoigts = { d: d, c: c };
      if (Math.abs(dd) > Math.hypot(cx, cy) * 1.2) accZoom += dd * 3; else { accDefX -= cx * 2; accDefY -= cy * 2; }
      planifier();
    }
  });
  function leverPave(e) {
    if (joy && e.pointerId === joy.id) { joy = null; return; }
    var p = pts[e.pointerId]; if (!p) return;
    delete pts[e.pointerId]; var avant = nPts; nPts = Object.keys(pts).length; deuxDoigts = null;
    if (avant === 1 && appui) {
      clearTimeout(appui.long); clearTimeout(appui.verrouT); if (lockFait) { vider(); finVerrou(); longFait = false; vit = { x: 0, y: 0, t: 0 }; appui.moved = true; delete pts[e.pointerId]; appui = null; nPts = 0; pave.classList.remove('actif'); return; }
      var duree = Date.now() - appui.t;
      if (e.type === 'pointerup' && !troisFait && !longFait && !appui.moved && duree < 280) {
        var proche = Date.now() - tap.t < 360 && Math.hypot(p.x - tap.x, p.y - tap.y) < 40;
        vibrer(proche ? 18 : 10); envoyer({ a: 'clic', n: proche ? 2 : 1, bouton: 0 });
        tap = proche ? { t: 0, x: 0, y: 0 } : { t: Date.now(), x: p.x, y: p.y };
      } else if (e.type === 'pointerup' && appui.moved && !troisFait && !longFait) { vider(); lancerInertie(); }
      vider(); fermerGlisse(); if (longFait) envoyer({ a: 'lacher' }); appui = null;
    }
    if (nPts === 0) { troisFait = false; pave.classList.remove('actif'); accZoom = accDefX = accDefY = 0; fermerGlisse(); }
  }
  pave.addEventListener('pointerup', leverPave); pave.addEventListener('pointercancel', leverPave);

  // ───────────── Surface du pavé : matrice de points lumineux, bords brillants, coin incliné, anneau-curseur avec traînée et onde ─────────────
  var cv = $('pave-cv'), cxp = cv.getContext('2d'), dprP = Math.min(2, window.devicePixelRatio || 1), tP = { w: 0, h: 0 };
  var doigtsP = {}, tracesP = [], ondesP = [], rafCv = 0, texteEtatP = '';
  function tailleCv() { var r = pave.getBoundingClientRect(); tP.w = r.width; tP.h = r.height; cv.width = Math.max(2, Math.round(r.width * dprP)); cv.height = Math.max(2, Math.round(r.height * dprP)); peindrePave(performance.now()); }
  function cadreP(dm, alpha, flou) {
    var w = tP.w, h = tP.h, c = 44;
    cxp.beginPath(); cxp.moveTo(dm, dm); cxp.lineTo(w - c - dm, dm); cxp.lineTo(w - dm, c + dm); cxp.lineTo(w - dm, h - dm); cxp.lineTo(dm, h - dm); cxp.closePath();
    cxp.strokeStyle = 'rgba(190,245,255,' + alpha + ')'; cxp.shadowColor = '#7fdcff'; cxp.shadowBlur = flou; cxp.lineWidth = 1.5; cxp.stroke(); cxp.shadowBlur = 0;
  }
  function peindrePave(now) {
    var w = tP.w, h = tP.h; if (w < 10 || h < 10) return;
    cxp.setTransform(dprP, 0, 0, dprP, 0, 0); cxp.clearRect(0, 0, w, h); cxp.lineJoin = 'round';
    var foyers = []; for (var k in doigtsP) foyers.push(doigtsP[k]);
    ondesP = ondesP.filter(function (o) { return o.a > 0.02; });
    for (var y = 20; y < h - 16; y += 15) for (var x = 20; x < w - 16; x += 15) {
      var a = 0.14, i, d;
      for (i = 0; i < foyers.length; i++) { d = Math.hypot(x - foyers[i].x, y - foyers[i].y); if (d < 110) a = Math.max(a, 0.95 * (1 - d / 110)); }
      for (i = 0; i < ondesP.length; i++) { d = Math.abs(Math.hypot(x - ondesP[i].x, y - ondesP[i].y) - ondesP[i].r); if (d < 12) a = Math.max(a, 0.85 * (1 - d / 12) * ondesP[i].a); }
      if (x - (w - 44) > y - 4) continue;   // le coin incliné n'a pas de points
      cxp.fillStyle = 'rgba(160,235,255,' + a.toFixed(2) + ')'; var s = a > 0.4 ? 2.2 : 1.5; cxp.fillRect(x - s / 2, y - s / 2, s, s);
    }
    cadreP(6, 0.9, 14); cadreP(12, 0.22, 0);
    // traînée du premier doigt
    tracesP = tracesP.filter(function (p) { return now - p.t < 520; });
    cxp.lineCap = 'round';
    for (var j = 1; j < tracesP.length; j++) {
      var q0 = tracesP[j - 1], q1 = tracesP[j]; if (q1.rupture) continue;
      cxp.strokeStyle = 'rgba(190,245,255,' + (0.7 * (1 - (now - q1.t) / 520)).toFixed(2) + ')'; cxp.lineWidth = 3 * (1 - (now - q1.t) / 520) + 0.6;
      cxp.beginPath(); cxp.moveTo(q0.x, q0.y); cxp.lineTo(q1.x, q1.y); cxp.stroke();
    }
    // ondes au toucher
    for (var m = 0; m < ondesP.length; m++) { var o = ondesP[m]; cxp.strokeStyle = 'rgba(170,240,255,' + (0.8 * o.a).toFixed(2) + ')'; cxp.lineWidth = 1.5; cxp.beginPath(); cxp.arc(o.x, o.y, o.r, 0, 6.2832); cxp.stroke(); o.r += 4.2; o.a *= 0.93; }
    // anneau-curseur
    for (var n = 0; n < foyers.length; n++) {
      var f = foyers[n]; cxp.shadowColor = '#7fdcff'; cxp.shadowBlur = 16; cxp.strokeStyle = '#d6f8ff'; cxp.lineWidth = 2; cxp.beginPath(); cxp.arc(f.x, f.y, 19, 0, 6.2832); cxp.stroke();
      cxp.shadowBlur = 0; cxp.fillStyle = '#ffffff'; cxp.beginPath(); cxp.arc(f.x, f.y, 3, 0, 6.2832); cxp.fill();
      cxp.strokeStyle = 'rgba(150,230,255,.55)'; cxp.lineWidth = 1; cxp.beginPath(); cxp.arc(f.x, f.y, 28, -0.5, 1.0); cxp.stroke();
    }
    var t = (foyers.length ? (camGeste ? 'CAMÉRA · ' : 'CURSEUR · ') + 'CONTACT' : 'PRÊT'); if (t !== texteEtatP) { texteEtatP = t; $('pave-etat').textContent = t; }
    var vivant = foyers.length || ondesP.length || tracesP.length;
    rafCv = vivant && reg.mode === 'pave' && !document.hidden ? requestAnimationFrame(peindrePave) : 0;
  }
  function relancerCv() { if (!rafCv) rafCv = requestAnimationFrame(peindrePave); }
  function pointP(e) { var r = pave.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  pave.addEventListener('pointerdown', function (e) { var p = pointP(e); doigtsP[e.pointerId] = p; ondesP.push({ x: p.x, y: p.y, r: 8, a: 1 }); if (Object.keys(doigtsP).length === 1) tracesP.push({ x: p.x, y: p.y, t: performance.now(), rupture: true }); relancerCv(); });
  pave.addEventListener('pointermove', function (e) { if (!doigtsP[e.pointerId]) return; var p = pointP(e); doigtsP[e.pointerId] = p; if (Object.keys(doigtsP)[0] === String(e.pointerId)) { tracesP.push({ x: p.x, y: p.y, t: performance.now() }); if (tracesP.length > 60) tracesP.shift(); } relancerCv(); });
  function leverCv(e) { delete doigtsP[e.pointerId]; relancerCv(); }
  pave.addEventListener('pointerup', leverCv); pave.addEventListener('pointercancel', leverCv);
  window.addEventListener('resize', function () { if (reg.mode === 'pave') tailleCv(); });
  if (window.ResizeObserver) new ResizeObserver(function () { if (reg.mode === 'pave') tailleCv(); }).observe(pave);

  // ───────────── Mode RAYLÉ ─────────────
  var parler = $('parler'), parlait = false;
  function debutParole(e) { e.preventDefault(); try { parler.setPointerCapture(e.pointerId); } catch (x) {} if (parlait) return; parlait = true; parler.classList.add('on'); vibrer(25); envoyer({ a: 'rayle', id: 'parler_debut' }); }
  function finParole() { if (!parlait) return; parlait = false; parler.classList.remove('on'); vibrer(10); envoyer({ a: 'rayle', id: 'parler_fin' }); }
  parler.addEventListener('pointerdown', debutParole); parler.addEventListener('pointerup', finParole); parler.addEventListener('pointercancel', finParole); parler.addEventListener('lostpointercapture', finParole);
  $('trio').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; vibrer(12); envoyer({ a: 'rayle', id: b.getAttribute('data-r') }); });
  $('stop-parole').addEventListener('click', function () { vibrer(12); envoyer({ a: 'rayle', id: 'stop_parole' }); });
  $('raccourcis').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; vibrer(12); envoyer({ a: 'rayle', id: 'fenetre', nom: b.getAttribute('data-f') }); });
  var minuteurVol = 0; $('volume').addEventListener('input', function (e) { clearTimeout(minuteurVol); var v = +e.target.value / 100; minuteurVol = setTimeout(function () { envoyer({ a: 'rayle', id: 'volume', valeur: v }); }, 80); });
  function etatRayle(mode, parole) {
    var b = $('trio').querySelectorAll('button'); for (var i = 0; i < b.length; i++) b[i].classList.toggle('cur', b[i].getAttribute('data-r') === mode.toLowerCase());
    parler.firstChild.nodeValue = parole ? 'RAYLÉ PARLE' : 'PARLER';
  }
  function ajouterReponse(t) {
    var fil = $('fil'), v = fil.querySelector('.fil-vide'); if (v) v.remove();
    var p = document.createElement('p'); p.textContent = t; fil.appendChild(p);
    while (fil.children.length > 6) fil.removeChild(fil.firstChild);
    fil.scrollTop = fil.scrollHeight;
  }

  // ───────────── Mode PILOTAGE ─────────────
  var P = { tx: 0, ty: 0, rx: 0, ry: 0, poussee: 0, post: false, roulis: 0 }, dernierP = '', tempoP = 0;
  function pousserPilote(force) {
    var s = JSON.stringify(P); if (!force && s === dernierP) return; dernierP = s;
    envoyer({ a: 'pilote', tx: P.tx, ty: P.ty, rx: P.rx, ry: P.ry, poussee: P.poussee, post: P.post, roulis: P.roulis });
  }
  function planifierPilote() { if (!tempoP) tempoP = setTimeout(function () { tempoP = 0; pousserPilote(false); }, 33); }
  function lacherPilote() { P = { tx: 0, ty: 0, rx: 0, ry: 0, poussee: 0, post: false, roulis: 0 }; ['stick-g', 'stick-d'].forEach(function (id) { var b = $(id).querySelector('.bille'); if (b) b.style.transform = ''; }); majPoussee(); $('b-post').classList.remove('on'); pousserPilote(true); }
  function lacherTout() { lockFait = false; joy = null; verrouPC = ''; for (var k in pts) delete pts[k]; nPts = 0; troisFait = false; glisseOuvert = false; accX = accY = 0; }
  function stick(id, cle) {
    var z = $(id), base = z.querySelector('.base'), bille = z.querySelector('.bille'), pid = null;
    function suivre(e) {
      var r = base.getBoundingClientRect(), R = r.width / 2, cx = r.left + R, cy = r.top + R;
      var dx = (e.clientX - cx) / (R * 0.7), dy = (e.clientY - cy) / (R * 0.7), n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
      bille.style.transform = 'translate(' + (dx * R * 0.7).toFixed(1) + 'px,' + (dy * R * 0.7).toFixed(1) + 'px)';
      if (cle === 'g') { P.tx = +dx.toFixed(2); P.ty = +(-dy).toFixed(2); } else { P.rx = +dx.toFixed(2); P.ry = +dy.toFixed(2); }
      planifierPilote();
    }
    z.addEventListener('pointerdown', function (e) { if (pid !== null) return; e.preventDefault(); pid = e.pointerId; try { z.setPointerCapture(pid); } catch (x) {} vibrer(10); suivre(e); });
    z.addEventListener('pointermove', function (e) { if (e.pointerId === pid) suivre(e); });
    function fin(e) { if (e.pointerId !== pid) return; pid = null; bille.style.transform = ''; if (cle === 'g') { P.tx = 0; P.ty = 0; } else { P.rx = 0; P.ry = 0; } pousserPilote(true); }
    z.addEventListener('pointerup', fin); z.addEventListener('pointercancel', fin);
  }
  stick('stick-g', 'g'); stick('stick-d', 'd');
  function majPoussee() { var p = Math.round(P.poussee * 100); $('p-remplit').style.height = p + '%'; $('p-poignee').style.bottom = 'calc(' + p + '% - ' + (p / 100 * 8) + 'px)'; $('p-val').textContent = p + ' %'; }
  (function () {
    var rail = document.querySelector('.rail'), pid = null;
    function suivre(e) { var r = rail.getBoundingClientRect(); P.poussee = Math.max(0, Math.min(1, +((r.bottom - e.clientY) / r.height).toFixed(2))); majPoussee(); planifierPilote(); }
    var z = $('poussee');
    z.addEventListener('pointerdown', function (e) { if (pid !== null) return; e.preventDefault(); pid = e.pointerId; try { z.setPointerCapture(pid); } catch (x) {} vibrer(8); suivre(e); });
    z.addEventListener('pointermove', function (e) { if (e.pointerId === pid) suivre(e); });
    z.addEventListener('pointerup', function (e) { if (e.pointerId === pid) pid = null; }); z.addEventListener('pointercancel', function (e) { if (e.pointerId === pid) pid = null; });
  })();
  function maintenir(id, debut, fin) {
    var b = $(id), pid = null;
    b.addEventListener('pointerdown', function (e) { if (pid !== null) return; e.preventDefault(); pid = e.pointerId; try { b.setPointerCapture(pid); } catch (x) {} vibrer(15); debut(); });
    function relache(e) { if (e.pointerId !== pid) return; pid = null; fin(); }
    b.addEventListener('pointerup', relache); b.addEventListener('pointercancel', relache); b.addEventListener('lostpointercapture', relache);
  }
  maintenir('b-post', function () { P.post = true; $('b-post').classList.add('on'); pousserPilote(true); }, function () { P.post = false; $('b-post').classList.remove('on'); pousserPilote(true); });
  maintenir('b-roul-g', function () { P.roulis = -1; pousserPilote(true); }, function () { P.roulis = 0; pousserPilote(true); });
  maintenir('b-roul-d', function () { P.roulis = 1; pousserPilote(true); }, function () { P.roulis = 0; pousserPilote(true); });
  var VUES = ['exterieur', 'cockpit', 'libre'], NOMS_VUE = { exterieur: 'extérieure', cockpit: 'cockpit', libre: 'libre' }, iVue = 0;
  $('b-vue').addEventListener('click', function () { iVue = (iVue + 1) % VUES.length; $('vue-nom').textContent = NOMS_VUE[VUES[iVue]]; vibrer(12); envoyer({ a: 'vue', v: VUES[iVue] }); });
  setInterval(function () { if (reg.mode === 'pilotage' && L.ouvert && (P.tx || P.ty || P.rx || P.ry || P.poussee || P.post || P.roulis)) pousserPilote(true); }, 250);   // rappel régulier : le PC relâche tout si la liaison se coupe

  // ───────────── Réglages, plein écran, protections ─────────────
  ['contextmenu', 'gesturestart', 'gesturechange', 'dblclick', 'selectstart', 'dragstart'].forEach(function (n) { document.addEventListener(n, function (e) { if (e.target && e.target.id === 'nom-app') return; e.preventDefault(); }, { passive: false }); });
  document.addEventListener('touchmove', function (e) { if (!e.target.closest || !e.target.closest('.reglages,.fil,#nom-app')) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchstart', function (e) { if (e.touches.length > 1 && (!e.target.closest || !e.target.closest('.reglages'))) e.preventDefault(); }, { passive: false });
  function appliquer() {
    $('kb').setAttribute('data-main', reg.main); document.documentElement.style.setProperty('--e', (reg.taille / 100).toFixed(2));
    dessinerArc(); dessinerCadran(); majLatch();
    $('r-main').value = reg.main; $('r-taille').value = reg.taille; $('r-vibre').checked = reg.vibre; $('r-sens').value = reg.sens;
  }
  $('b-reglages').addEventListener('click', function () { var r = $('reglages'); r.hidden = !r.hidden; });
  $('r-ok').addEventListener('click', function () { $('reglages').hidden = true; });
  $('r-main').addEventListener('change', function (e) { reg.main = e.target.value; sauver(); appliquer(); });
  $('r-taille').addEventListener('input', function (e) { reg.taille = +e.target.value; sauver(); appliquer(); });
  $('r-sens').addEventListener('input', function (e) { reg.sens = +e.target.value; sauver(); });
  $('r-vibre').addEventListener('change', function (e) { reg.vibre = e.target.checked; sauver(); });
  $('r-oublier').addEventListener('click', function () { $('reglages').hidden = true; oublier('Appairage oublié sur cette tablette.'); });
  $('b-plein').addEventListener('click', function () {
    var d = document.documentElement;
    (d.requestFullscreen ? d.requestFullscreen() : (d.webkitRequestFullscreen ? (d.webkitRequestFullscreen(), Promise.resolve()) : Promise.reject()))
      .then(function () { if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape'); }).catch(function () { info('Plein écran indisponible sur cet appareil'); });
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { lacherPilote(); fermerGlisse(); } });

  // ───────────── Plein écran, orientations, redimensionnement (R2) ─────────────
  // Le clavier occupe TOUT l'écran utile (100dvh × 100dvw, zones sûres respectées), en paysage comme en portrait : les touches sont redessinées à la taille réelle de leur zone.
  var tRedim = 0;
  /* L'éventail est incliné en perspective : sa hauteur visible est plus petite que sa boîte. On l'étire (scaleY) jusqu'à ce que son bord haut touche le champ de texte : le clavier remplit tout l'écran. */
  function remplirEcran() {
    var plan = $('plan'), champ = $('champ'); if (!plan.clientHeight || !champ.clientHeight) return;
    var cible = champ.getBoundingClientRect().bottom + 6, sy = 1;
    for (var i = 0; i < 4; i++) { plan.style.setProperty('--sy', sy.toFixed(3)); var r = plan.getBoundingClientRect(), h = r.bottom - r.top, voulu = r.bottom - cible; if (h < 10) break; sy = Math.max(1, Math.min(2.2, sy * voulu / h)); }
    plan.style.setProperty('--sy', sy.toFixed(3));
  }
  function redessinerClavier() { clearTimeout(tRedim); tRedim = setTimeout(function () { if (reg.mode === 'clavier') { dessinerLettres(); dessinerEspace(); remplirEcran(); } document.body.setAttribute('data-orient', window.innerWidth >= window.innerHeight ? 'paysage' : 'portrait'); }, 60); }
  window.addEventListener('resize', redessinerClavier); window.addEventListener('orientationchange', redessinerClavier);
  if (window.ResizeObserver) new ResizeObserver(redessinerClavier).observe($('lettres'));
  // Plein écran au premier appui (le navigateur n'accepte que sur un geste) ; refusé = repli silencieux : la barre d'adresse est repoussée et la page reste fixe, sans défilement
  var pleinEssaye = false;
  function pleinEcranAuto() {
    if (pleinEssaye || document.fullscreenElement) return; pleinEssaye = true;
    var d = document.documentElement, rep = function () { /* refusé : la page est déjà fixe (position:fixed), rien à faire */ };
    try { var p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : (d.webkitRequestFullscreen ? (d.webkitRequestFullscreen(), null) : null); if (p && p.catch) p.catch(rep); else if (!p) rep(); } catch (e) { rep(); }
  }
  document.addEventListener('pointerup', function () { setTimeout(pleinEcranAuto, 900); }, { once: true, capture: true });   // différé : ne jamais chevaucher une suite de touchers en cours
  document.body.setAttribute('data-orient', window.innerWidth >= window.innerHeight ? 'paysage' : 'portrait');

  // ───────────── Démarrage ─────────────
  construirePaveNum(); dessinerLettres(); dessinerEspace(); dessinerCadran(); appliquer(); afficher(); definirEtat(true); majCible(); definirMode(MODES.indexOf(reg.mode) >= 0 ? reg.mode : 'clavier', true); majVoyants();
  fetch('/clavier/statut?jeton=' + encodeURIComponent(L.jeton || ''), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
    if (!s || !s.k2) { majVoyants(); return; }   // page ouverte sans le serveur de la télécommande : essai hors liaison
    L.reseau = true;
    if (L.jeton && s.jetonValide) connecter(); else { if (L.jeton) { try { localStorage.removeItem('rayle_k2_jeton'); } catch (e) {} L.jeton = null; } afficherAppairage(''); }
    majVoyants();
  }).catch(function () { majVoyants(); });

  texteBord('MISE SOUS TENSION'); setTimeout(function () { texteBord(pret ? 'PRÊT' : 'VEILLE'); }, 1600);   // « MISE SOUS TENSION » au démarrage, puis l'état
  window.ClavierEventail = {
    etat: function () { return { texte: texte, pret: pret, maj: maj > 0 || majUne, reglages: reg, pleinEcranEssaye: pleinEssaye, liaison: L.ouvert, reseau: L.reseau, rtt: L.rtt, pc: L.pc, mode: reg.mode, cible: cibleEffective(), pilote: JSON.parse(JSON.stringify(P)) }; },
    mode: definirMode
  };
})();
