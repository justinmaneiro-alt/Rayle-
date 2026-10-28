"use strict";
/* ═════════════ CAMÉRA DU TÉLÉPHONE PAR HTTPS (V3, phase 4 ; liaison directe WebRTC ajoutée ensuite) : côté page Rayle ═════════════
   Le PC demande une session au Worker (jeton aléatoire, usage unique, 5 minutes), affiche le QR code (adresse de la page HTTPS « Caméra Rayle » + session + jeton dans le FRAGMENT de l'adresse),
   puis reçoit les POINTS de main que le téléphone envoie et les passe au moteur de gestes. Jamais de vidéo vers le Worker. Chaque trame reçue est REVALIDÉE ici (GestesCalcul.validerMains) : ni le relais
   ni le téléphone ne sont crus sur parole.
   Deux chemins, le même moteur derrière :
     1. DIRECT (WebRTC DataChannel, non fiable et non ordonné : une trame perdue ne retarde pas la suivante). Le Worker ne sert qu'à échanger offre / réponse / candidats (/camera/signal*), ensuite les points
        vont du téléphone au PC sans repasser par lui : 30 trames par seconde, quelques millisecondes de délai sur le Wi-Fi de la maison.
     2. RELAIS par le Worker et D1 (lent : quelques paquets par seconde), seulement si le direct n'a pas pu s'établir (Worker pas à jour, réseau qui bloque).
   Aucune clé n'est affichée ni stockée : le jeton de session ne vit que dans le QR et dans la mémoire de la page. */
const CameraRelais = (() => {
  const PAGE_PAR_DEFAUT = 'https://justinmaneiro-alt.github.io/Rayle-/camera/';
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];   // gratuit, sans compte ; sur le Wi-Fi de la maison les adresses locales suffisent (le STUN sert hors du réseau)
  const DELAI_DIRECT_MS = 15000, TAILLE_IMAGE_MAX = 16000;
  const E = { etat: 'inactive', session: null, jeton: null, expire: 0, url: '', erreur: '', recues: 0, derniere: 0, dernierEnvoi: null, qr: null, liaison: 'aucune', rtt: null, delai: null, apercu: null, apercuVoulu: false, derniereTrame: null, directEchec: '', perte: 0, ecartes: 0, gigue: 0, dtTel: 0, confiance: null, traitement: 0, delaiTotal: null, conseil: '', binaire: false };
  const ecouteurs = []; let minuteur = 0, apres = 0, sigApres = 0, enVol = false, surTrames = null, voulu = false;
  let pair = null, canal = null, pings = 0, sondes = {}, debutNegociation = 0, vus = [];
  const PB = () => window.PaquetBinaire, suivi = window.PaquetBinaire ? window.PaquetBinaire.creerSuivi() : null;   // V5 : paquets binaires, séquence, pertes
  const prevenir = () => { for (const f of ecouteurs.slice()) { try { f(E); } catch (e) { /* un écouteur fautif n'arrête pas les autres */ } } };
  const surEvenement = f => { ecouteurs.push(f); return () => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); }; };
  const workerOk = () => typeof workerReady !== 'undefined' && workerReady();
  const workerUrl = () => { try { return RayleBus.demander('worker').url; } catch (e) { return ''; } };

  /* Adresse de la page du téléphone : celle du site si Rayle tourne sur GitHub Pages, sinon celle du dépôt public (réglable : window.RAYLE_CAMERA_PAGE). */
  function pageCamera() {
    if (window.RAYLE_CAMERA_PAGE) return String(window.RAYLE_CAMERA_PAGE);
    if (/\.github\.io$/.test(location.hostname)) { const base = location.pathname.replace(/[^/]*$/, ''); return location.origin + base + 'camera/'; }
    return PAGE_PAR_DEFAUT;
  }
  /* Le QR porte le moins d'octets possible : l'adresse du Worker sans « https:// ». */
  function adresseQR(page, id, jeton, worker) { return page + '#s=' + id + '&j=' + jeton + '&w=' + String(worker).replace(/^https:\/\//i, '').replace(/\/+$/, ''); }

  async function api(chemin, corps) {
    const res = await wfetch(chemin, corps === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(corps) }, 12000);
    let j = null; try { j = await res.json(); } catch (e) { /* corps illisible */ }
    if (!res.ok) { const err = new Error((j && j.error) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
    return j;
  }
  function messageErreur(e) {
    const m = String(e && e.message || e);
    if (e && e.status === 404) return 'Le Worker n’est pas à jour : la caméra du téléphone par HTTPS demande la version V3 phase 4 (voir docs/deploiement-worker-v3.md).';
    if (e && e.status === 429) return m;
    if (e && e.status === 400 && /D1/.test(m)) return 'Le Worker n’a pas de base D1 : ajoutez la liaison DB.';
    return typeof errMsg === 'function' ? errMsg(e) : m;
  }

  // ── réception d'une trame (les deux chemins passent ici) ──
  function recevoir(brut) {
    const g = window.GestesCalcul, v = g ? g.validerMains(brut) : null; if (!v) return false;
    const maintenant = Date.now(); E.recues++; E.derniere = maintenant; vus.push(maintenant); if (vus.length > 200) vus = vus.slice(-100);
    E.derniereTrame = { t: v.t, ratio: v.ratio, mains: v.mains }; if (v.dt != null) E.dtTel = v.dt; if (v.conf != null) E.confiance = v.conf;
    const p0 = performance.now(); if (surTrames) surTrames({ t: v.t, ratio: v.ratio, mains: v.mains }); E.traitement = E.traitement * 0.9 + (performance.now() - p0) * 0.1;
    return true;
  }
  /* Trames reçues pendant la dernière seconde (par n'importe quel chemin). */
  function debit() { const lim = Date.now() - 1000; vus = vus.filter(t => t >= lim); return vus.length; }

  // ── liaison directe ──
  const envoyerSignal = m => api('/camera/signal-pc', { s: E.session, m }).catch(() => { /* Worker sans signalisation : le relais continue tout seul */ });
  function fermerPair() {
    clearInterval(pings); pings = 0; sondes = {};
    try { canal && canal.close(); } catch (e) { /* déjà fermé */ } try { pair && pair.close(); } catch (e) { /* déjà fermée */ }
    canal = null; pair = null; debutNegociation = 0;
    if (E.liaison === 'direct' || E.liaison === 'negociation') E.liaison = E.session ? 'worker' : 'aucune';
    E.rtt = E.delai = null; E.apercu = null; E.binaire = false; if (suivi) suivi.reinitialiser();
  }
  /* Une fois par seconde : débit, pertes, délai bout en bout et conseil, sur la fenêtre de suivi ET renvoyés au téléphone. */
  function mesures() {
    if (!suivi || !PB()) return; const st = suivi.stats(); E.perte = st.perte; E.ecartes = st.ecartes; E.gigue = st.gigue;
    E.delaiTotal = PB().delaiBoutEnBout(E.dtTel, E.rtt, E.traitement);
    const actif = E.liaison === 'direct' && E.etat === 'connecte', mainsVues = !!(E.derniereTrame && E.derniereTrame.mains.length && Date.now() - E.derniere < 700);
    E.conseil = PB().conseil({ debit: debit(), perte: E.perte, delai: E.delaiTotal, mainsVues, actif });
    envoyerCanal({ t: 'stats', delai: E.delaiTotal, perte: +E.perte.toFixed(3), debit: debit(), conseil: E.conseil });
  }
  function envoyerCanal(o) { if (canal && canal.readyState === 'open') { try { canal.send(JSON.stringify(o)); return true; } catch (e) { return false; } } return false; }
  function brancherCanal(c) {
    canal = c; try { c.binaryType = 'arraybuffer'; } catch (e) { /* navigateur sans binaryType : texte seulement */ }
    c.onopen = () => {
      E.liaison = 'direct'; E.directEchec = ''; debutNegociation = 0; E.erreur = '';
      clearInterval(pings); pings = setInterval(() => { const n = ++sondes.n || (sondes.n = 1); sondes[n] = performance.now(); envoyerCanal({ t: 'ping', n }); envoyerCanal({ t: 'caps', binaire: !!PB() }); mesures(); for (const k of Object.keys(sondes)) if (k !== 'n' && performance.now() - sondes[k] > 6000) delete sondes[k]; }, 1000);
      if (E.apercuVoulu) envoyerCanal({ t: 'apercu', actif: true });
      envoyerCanal({ t: 'caps', binaire: !!PB() });   // annonce : « je sais lire les paquets binaires »
      prevenir();
    };
    c.onclose = () => { if (canal !== c) return; clearInterval(pings); pings = 0; canal = null; E.liaison = voulu ? 'worker' : 'aucune'; E.rtt = E.delai = null; E.apercu = null; prevenir(); };
    c.onmessage = ev => {
      if (ev.data instanceof ArrayBuffer && PB()) {   // V5 : paquet binaire (100 à 184 octets)
        if (ev.data.byteLength > 400) return; const t = PB().decoder(ev.data); if (!t) return;
        if (suivi.noter(t.seq) !== 'ok') return;   // plus vieux que le dernier vu, ou doublon : écarté, jamais traité en retard
        E.binaire = true; recevoir(t); return;
      }
      if (typeof ev.data !== 'string' || ev.data.length > 24000) return;   // un message de points fait ~ 2 Ko ; une image d'aperçu 16 Ko au plus
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (!m || typeof m !== 'object') return;
      if (m.a === 'mains') { recevoir(m); }
      else if (m.t === 'ping') envoyerCanal({ t: 'pong', n: m.n });
      else if (m.t === 'pong') { const t0 = sondes[m.n]; if (t0 != null) { delete sondes[m.n]; E.rtt = Math.round(performance.now() - t0); E.delai = Math.max(1, Math.round(E.rtt / 2)); envoyerCanal({ t: 'rtt', ms: E.rtt }); } }
      else if (m.a === 'image') { if (E.apercuVoulu && typeof m.d === 'string' && m.d.length <= TAILLE_IMAGE_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.d)) { E.apercu = m.d; prevenir(); } }   // aperçu : seulement si Justin l'a demandé, seulement du JPEG
    };
  }
  async function traiterSignal(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'offre' && typeof m.sdp === 'string') {
      if (typeof RTCPeerConnection === 'undefined') return;
      fermerPair(); E.liaison = 'negociation'; debutNegociation = Date.now();
      const p = pair = new RTCPeerConnection({ iceServers: ICE });
      p.ondatachannel = ev => { if (pair === p) brancherCanal(ev.channel); };
      p.onicecandidate = ev => { if (ev.candidate && pair === p) envoyerSignal({ k: 'ice', c: { candidate: ev.candidate.candidate, sdpMLineIndex: ev.candidate.sdpMLineIndex, sdpMid: ev.candidate.sdpMid } }); };
      p.onconnectionstatechange = () => { if (pair === p && (p.connectionState === 'failed' || p.connectionState === 'closed')) { E.directEchec = 'la liaison directe a échoué'; fermerPair(); prevenir(); } };
      try { await p.setRemoteDescription({ type: 'offer', sdp: m.sdp }); const r = await p.createAnswer(); await p.setLocalDescription(r); await envoyerSignal({ k: 'reponse', sdp: r.sdp }); }
      catch (e) { E.directEchec = 'négociation impossible'; fermerPair(); }
    } else if (m.k === 'ice' && pair && m.c) { try { await pair.addIceCandidate({ candidate: m.c.candidate, sdpMLineIndex: m.c.sdpMLineIndex, sdpMid: m.c.sdpMid }); } catch (e) { /* candidat périmé : sans importance */ } }
  }
  /* Aperçu vidéo : désactivé par défaut. L'image ne passe que par la liaison DIRECTE (jamais par le Worker), en petit JPEG, et seulement tant que Justin le demande. */
  function definirApercu(oui) { E.apercuVoulu = !!oui; if (!oui) E.apercu = null; envoyerCanal({ t: 'apercu', actif: !!oui }); prevenir(); return E.apercuVoulu && canal && canal.readyState === 'open'; }

  async function demarrer({ aSurTrames } = {}) {
    await arreter(false); surTrames = aSurTrames || surTrames; E.erreur = ''; E.directEchec = '';
    if (!workerOk()) { E.etat = 'erreur'; E.erreur = 'Le Worker n’est pas configuré (⚙ Réglages) : le téléphone passe par lui.'; prevenir(); return false; }
    try {
      const s = await api('/camera/session', {});
      E.session = s.id; E.jeton = s.jeton; E.expire = s.expire; E.etat = 'attente'; E.recues = 0; E.derniere = 0; E.dernierEnvoi = null; apres = 0; sigApres = 0; vus = []; voulu = true; E.liaison = 'worker';
      E.url = adresseQR(pageCamera(), s.id, s.jeton, workerUrl());
      E.qr = window.QrMatrice ? window.QrMatrice.matriceQR(E.url) : null;
    } catch (e) { E.etat = 'erreur'; E.erreur = messageErreur(e); E.session = E.jeton = null; prevenir(); return false; }
    prevenir(); planifier(1000); return true;
  }
  function planifier(ms) { clearTimeout(minuteur); if (voulu) minuteur = setTimeout(tour, ms); }
  async function tour() {
    if (!voulu || !E.session) return; if (enVol) return planifier(100); enVol = true; let delai = 120;
    try {
      const r = await api('/camera/lire?s=' + encodeURIComponent(E.session) + '&apres=' + apres + '&sig=' + sigApres);
      apres = r.seq; E.dernierEnvoi = r.dernierEnvoi; E.expire = r.expire || E.expire;
      if (r.etat === 'rejointe') { if (E.etat !== 'connecte') E.etat = 'connecte'; E.jeton = null; }   // le jeton a servi : il ne reste plus nulle part
      else if (r.etat === 'attente') { E.etat = 'attente'; delai = 1000; }
      else if (r.etat === 'expiree') { E.etat = 'expiree'; voulu = false; fermerPair(); }
      else if (r.etat === 'fermee') { E.etat = 'fermee'; voulu = false; fermerPair(); }
      for (const x of (r.signaux || [])) { sigApres = Math.max(sigApres, Number(x.q) || 0); await traiterSignal(x.m); }
      for (const t of (r.trames || [])) recevoir(t);
      if (E.liaison === 'negociation' && debutNegociation && Date.now() - debutNegociation > DELAI_DIRECT_MS) { E.directEchec = 'la liaison directe n’a pas abouti en ' + DELAI_DIRECT_MS / 1000 + ' s'; fermerPair(); E.liaison = 'worker'; }
      if (E.liaison === 'direct') delai = 1000;   // les points arrivent en direct : on ne consulte le Worker que pour savoir si la session vit encore
      else if (E.liaison === 'negociation') delai = 150;
      else if (E.etat === 'connecte' && E.dernierEnvoi && Date.now() - E.dernierEnvoi > 4000) delai = 600;   // téléphone silencieux : on ralentit
      E.erreur = '';
    } catch (e) { E.erreur = messageErreur(e); delai = 2500; if (e && (e.status === 401 || e.status === 404)) voulu = false; }
    enVol = false; prevenir(); if (voulu) planifier(delai);
  }
  async function arreter(prevenirAussi = true) {
    voulu = false; clearTimeout(minuteur); const s = E.session; envoyerCanal({ t: 'fin' }); fermerPair(); E.session = null; E.jeton = null; E.qr = null; E.url = ''; E.liaison = 'aucune'; E.derniereTrame = null;
    if (s && workerOk()) { try { await api('/camera/fin', { s }); } catch (e) { /* le Worker referme tout seul à l'expiration */ } }
    if (E.etat !== 'erreur') E.etat = 'inactive';
    if (prevenirAussi) prevenir();
  }
  return { demarrer, arreter, mesures, etat: () => ({ ...E, qr: E.qr, debit: debit() }), debit, surEvenement, pageCamera, adresseQR, definirSurTrames: f => { surTrames = f; }, definirApercu, recevoirTrame: recevoir };
})();
window.CameraRelais = CameraRelais;
