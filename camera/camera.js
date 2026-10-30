/* ═════════════ « CAMÉRA RAYLE » : la caméra du téléphone envoie les POINTS de la main au PC (jamais la vidéo) ═════════════
   Page servie par le PC en HTTPS (réseau local seulement, jeton QR + code d'appairage à 6 chiffres, comme la télécommande de la tablette mais instance séparée : app-pc/camera-pont.mjs).
   MediaPipe Hands tourne ICI, dans le navigateur du téléphone ; les fichiers du modèle viennent du PC (/camera/vendor/…), rien n'est chargé depuis Internet.
   MODE HTTPS (V3 phase 4) : la page est servie par GitHub Pages (HTTPS valide, la caméra est autorisée) et le QR contient #s=<session>&j=<jeton à usage unique>&w=<adresse du Worker> dans le FRAGMENT (jamais envoyé à un serveur,
   effacé de la barre d'adresse dès le chargement). Le jeton est échangé UNE fois contre une clé d'émission ; les points partent par paquets vers le Worker (/camera/points), le PC les relit. MediaPipe vient alors de jsDelivr (version figée).
   Messages envoyés : { a:'mains', t, ratio, mains:[{ lat, pts:[[x,y,z]×21] }] } au plus 30 fois par seconde (les mains vides à 5/s pour que le PC libère ce qu'il tenait).
   LIAISON DIRECTE (WebRTC DataChannel, non fiable et non ordonné) : après la connexion, le téléphone ouvre un canal direct vers le PC (le Worker ne sert qu'à échanger offre / réponse / candidats) et y envoie chaque trame
   tout de suite, sans lot. Tant que le canal n'est pas ouvert (ou si le Worker n'a pas la signalisation), les trames partent par lots vers le Worker comme avant. Aperçu de la caméra : JAMAIS envoyé, sauf si le PC le demande
   (case cochée par Justin) ; alors un petit JPEG part par le canal direct seulement (jamais par le Worker).
   V5 : une détection par image de la caméra (requestVideoFrameCallback, 60 images/s demandées, jamais en retard), paquets BINAIRES de 100 à 184 octets (camera/paquet-binaire.js) envoyés SEULEMENT si la liaison
   n'est pas encombrée (un paquet en retard est sauté, jamais mis en file), aperçu réduit et coupable (« Économie »), écran gardé allumé (Wake Lock, redemandé au retour sur la page). */
import { creerDetecteur } from './detection.js';
const $ = id => document.getElementById(id);
const CLE = 'rayle_cam_jeton';
const MP = '0.10.21', CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP + '/', MODELE_CDN = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const W = { actif: false, s: null, j: null, url: null, cle: null, expire: 0, sortie: [], minuteur: 0, envoyes: 0, erreurs: 0, fin: false };
const D = { pc: null, canal: null, ouvert: false, envoyes: 0, fenetre: [], rtt: null, apercu: false, dernierApercu: 0, sigApres: 0, sondeSig: 0, essai: 0, debut: 0, echec: '' };
const L = { jeton: null, ws: null, ouvert: false, pc: false, rtt: null, n: 0, envoyes: {}, dernierPong: 0, delaiMax: 5000, pings: 0, garde: 0, retard: 0, tentative: 0 };
const K = { binaire: false, seq: 0, dt: 0, conf: 1, eco: false, dernierDessin: 0, sautes: 0, stats: null, dernierT: 0 };
try { K.eco = localStorage.getItem('rayle_cam_eco') === '1'; } catch (e) { /* stockage refusé */ }
/* V10 : réglages du téléphone (mémorisés ici ; modifiables ici ou depuis le PC par « Test de fluidité → Appliquer »). */
const CFG_CLE = 'rayle_cam_cfg';
const CFG = Object.assign({ res: 'auto', mains: 2, worker: true, noir: false }, (() => { try { return JSON.parse(localStorage.getItem(CFG_CLE) || '{}') || {}; } catch (e) { return {}; } })());
const sauverCfg = () => { try { localStorage.setItem(CFG_CLE, JSON.stringify(CFG)); } catch (e) { /* stockage refusé */ } };
const NIV = self.AdaptationCamera ? self.AdaptationCamera.NIVEAUX : [{ id: 0, l: 320, h: 240 }, { id: 1, l: 480, h: 360 }, { id: 2, l: 640, h: 480 }];
const S = { adapt: null, niveau: 2, camN: 0, detN: 0, sautes: 0, detMs: [], chrono: 0, lum: null, bat: null, charge: null, calcul: 'telephone', sender: null, bilan: null, histDet: [] };
const C = { flux: null, video: null, detecteur: null, boucle: 0, actif: false, dernierEnvoi: 0, dernierVu: 0, dernierVide: 0, ctx: null, verrou: null };
try { L.jeton = localStorage.getItem(CLE) || null; } catch (e) { /* stockage refusé */ }
/* Lecture du fragment du QR, puis effacement immédiat de l'adresse (le jeton ne reste ni dans l'historique ni dans un signet). */
(function lireFragment() {
  const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const s = h.get('s'), j = h.get('j'), w = h.get('w');
  if (!(s || j || w)) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* historique non modifiable : le jeton reste à usage unique */ }
  let url = null; try { const u = new URL(/^https?:\/\//i.test(w || '') ? w : 'https://' + w); if (u.protocol === 'https:' || ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.protocol === 'http:')) url = u.origin; } catch (e) { /* adresse invalide */ }
  W.actif = true; W.s = /^[\w-]{6,40}$/.test(s || '') ? s : null; W.j = /^[\w-]{20,80}$/.test(j || '') ? j : null; W.url = url;
})();
const montrer = (id, oui) => { $(id).hidden = !oui; };
const msg = (id, texte, genre) => { $(id).innerHTML = texte ? '<div class="msg ' + (genre || '') + '">' + String(texte).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</div>' : ''; };

// ── liaison avec le PC ──
function envoyer(o) {
  if (o.a === 'mains' && K.binaire && W.actif && D.ouvert && D.canal && D.canal.readyState === 'open' && self.PaquetBinaire) {   // binaire seulement si le PC l'a annoncé (PC et téléphone peuvent ne pas être à la même version)   // liaison directe : paquet binaire
    if (D.canal.bufferedAmount > 4096) { K.sautes++; return false; }   // la liaison est encombrée : on SAUTE ce paquet au lieu de l'empiler
    try { D.canal.send(self.PaquetBinaire.encoder({ t: o.t, ratio: o.ratio, mains: o.mains, seq: K.seq++, dt: K.dt, conf: K.conf })); D.envoyes++; D.fenetre.push(Date.now()); return true; } catch (e) { /* canal en difficulté : repli ci-dessous */ }
  }
  if (W.actif && D.ouvert && D.canal && D.canal.readyState === 'open') { try { D.canal.send(JSON.stringify(o)); if (o.a === 'mains') { D.envoyes++; D.fenetre.push(Date.now()); } return true; } catch (e) { /* canal en difficulté : repli par le Worker ci-dessous */ } }
  if (W.actif) { if (!W.cle || W.fin) return false; W.sortie.push(o); if (W.sortie.length > 60) W.sortie.splice(0, W.sortie.length - 60); return true; }
  if (L.ws && L.ws.readyState === 1) { try { L.ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } } return false;
}
function voyants() {
  if (W.actif) { $('pt-pc').className = 'pt ' + (W.cle && !W.fin ? (W.erreurs > 3 ? 'att' : 'ok') : 'ko'); $('t-pc').textContent = W.fin ? 'Session terminée' : W.cle ? (W.erreurs > 3 ? 'Rayle : liaison instable' : 'Connecté à Rayle') : 'Non connecté'; $('t-lat').textContent = statsLiaison(); $('pt-cam').className = 'pt ' + (C.actif ? 'ok' : ''); $('t-cam').textContent = C.actif ? 'caméra active' : 'caméra arrêtée'; return; }
  $('pt-pc').className = 'pt ' + (L.ouvert ? (L.pc ? 'ok' : 'att') : 'ko'); $('t-pc').textContent = L.ouvert ? (L.pc ? 'PC : Rayle ouvert' : 'PC : connecté, Rayle fermé') : 'PC : déconnecté';
  $('t-lat').textContent = L.rtt != null ? '· ' + L.rtt + ' ms' : '';
  $('pt-cam').className = 'pt ' + (C.actif ? 'ok' : ''); $('t-cam').textContent = C.actif ? 'caméra active' : 'caméra arrêtée';
}
function ctrlEnvoyer(o) { const s = JSON.stringify(o); for (const k of [D.ctrl, D.canal]) { if (k && k.readyState === 'open') { try { k.send(s); return true; } catch (e) { /* canal en difficulté : on essaie l'autre */ } } } return false; }
function debitEnvoi() { const lim = Date.now() - 1000; D.fenetre = D.fenetre.filter(t => t >= lim); return D.fenetre.length; }
function statsLiaison() {
  if (D.ouvert) { const st = K.stats && Date.now() - K.stats.recu < 3000 ? K.stats : null; return '· direct · ' + debitEnvoi() + ' paquets/s' + (st && st.delai != null ? ' · délai ' + st.delai + ' ms' : D.rtt != null ? ' · ' + Math.max(1, Math.round(D.rtt / 2)) + ' ms' : '') + (st && st.perte > 0.02 ? ' · perte ' + Math.round(st.perte * 100) + ' %' : '') + (K.eco ? ' · économie' : ''); }
  if (D.pc && !D.echec) return '· liaison directe en cours…';
  return W.envoyes ? '· relais Worker (lent)' + (D.echec ? ' : ' + D.echec : '') : '';
}
function fermerLiaison() { clearInterval(L.pings); clearInterval(L.garde); clearTimeout(L.retard); try { L.ws && L.ws.close(); } catch (e) { /* déjà fermée */ } L.ws = null; }
function connecter() {
  fermerLiaison(); if (!L.jeton) return;
  const ws = new WebSocket('wss://' + location.host + '/camera/ws?jeton=' + encodeURIComponent(L.jeton)); L.ws = ws;
  ws.onopen = () => {
    L.ouvert = true; L.tentative = 0; L.dernierPong = Date.now(); voyants();
    L.pings = setInterval(() => { const n = ++L.n; L.envoyes[n] = Date.now(); envoyer({ t: 'ping', n, l: L.rtt == null ? undefined : L.rtt }); }, 2000);
    L.garde = setInterval(() => { if (Date.now() - L.dernierPong > L.delaiMax) { try { ws.close(); } catch (e) { /* déjà fermée */ } } }, 1000);
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m.t === 'pong') { L.dernierPong = Date.now(); if (L.envoyes[m.n]) { L.rtt = Date.now() - L.envoyes[m.n]; delete L.envoyes[m.n]; voyants(); } } else if (m.t === 'bienvenue') { L.pc = !!m.pc; if (m.delaiMax) L.delaiMax = m.delaiMax; voyants(); } else if (m.t === 'pc') { L.pc = !!m.connecte; voyants(); } };
  ws.onclose = ev => {
    L.ouvert = false; L.pc = false; voyants(); clearInterval(L.pings); clearInterval(L.garde);
    if (ev.code === 4001 || ev.code === 4002 || ev.code === 1001) { oublier(ev.code === 1001 ? 'Le PC a coupé le pont caméra.' : 'Ce téléphone a été déconnecté depuis le PC : appaire-le de nouveau.'); return; }
    L.tentative++; L.retard = setTimeout(connecter, Math.min(8000, 600 * L.tentative));
  };
  ws.onerror = () => {};
}
function oublier(raison) { arreterCamera(); fermerLiaison(); try { localStorage.removeItem(CLE); } catch (e) { /* stockage refusé */ } L.jeton = null; afficher('appairage', raison); }
function afficher(ecran, raison) { montrer('s-worker', ecran === 'worker'); montrer('s-appairage', ecran === 'appairage'); montrer('s-camera', ecran === 'camera'); if (raison) msg(ecran === 'appairage' ? 'm-appairage' : 'm-cam', raison, 'sable'); }

// ── mode HTTPS par le Worker (V3 phase 4) ──
const pt = (url, corps) => fetch(W.url + url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corps), cache: 'no-store', referrerPolicy: 'no-referrer' });   // text/plain : pas de pré-requête CORS
function finSession(texte, genre) { W.fin = true; clearInterval(W.minuteur); fermerDirect(); arreterCamera(); W.cle = null; voyants(); afficher('worker'); $('b-rejoindre').hidden = true; msg('m-worker', texte, genre || 'sable'); }
async function rejoindre() {
  if (!W.s || !W.j || !W.url) return msg('m-worker', 'Ce lien est incomplet. Redemande un QR code au PC (Rayle → ⚙ → Gestes → Caméra du téléphone).', 'ko');
  $('b-rejoindre').disabled = true; msg('m-worker', 'Connexion à Rayle…', 'sable');
  try {
    const r = await pt('/camera/rejoindre', { jeton: W.j }), j = await r.json().catch(() => ({}));
    W.j = null;   // à usage unique : on ne le garde pas
    if (!r.ok || !j.cle) { $('b-rejoindre').disabled = false; $('b-rejoindre').hidden = true; return msg('m-worker', (j && j.error ? j.error : 'Connexion refusée') + '. (Chaque QR code ne sert qu’une fois et expire en 5 minutes.)', 'ko'); }
    W.cle = j.cle; W.expire = j.expire || 0; afficher('camera'); voyants();
    W.minuteur = setInterval(vider, 60); setInterval(voyants, 1000); ouvrirDirect();
  } catch (e) { $('b-rejoindre').disabled = false; msg('m-worker', 'Rayle ne répond pas (réseau ? Worker ?). Vérifie la connexion du téléphone, puis scanne un nouveau QR code.', 'ko'); }
}
/* ── liaison directe (WebRTC) ── le téléphone propose (offre), le PC répond ; messages de signalisation par le Worker, clé d'émission comme preuve. */
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const signal = (chemin, corps) => pt(chemin, Object.assign({ s: W.s, cle: W.cle }, corps));
function fermerDirect() { S.sender = null; if (S.calcul === 'pc') { S.calcul = 'telephone'; reprendreLocal(); } try { D.ctrl && D.ctrl.close(); } catch (e) { /* déjà fermé */ } D.ctrl = null; K.binaire = false; clearInterval(D.sondeSig); try { D.canal && D.canal.close(); } catch (e) { /* déjà fermé */ } try { D.pc && D.pc.close(); } catch (e) { /* déjà fermée */ } D.canal = null; D.pc = null; D.ouvert = false; D.rtt = null; D.apercu = false; }
async function ouvrirDirect() {
  if (typeof RTCPeerConnection === 'undefined' || !W.cle || W.fin) { D.echec = 'WebRTC indisponible'; return; }
  fermerDirect(); D.echec = ''; D.sigApres = 0; D.debut = Date.now(); const essai = ++D.essai;
  const p = D.pc = new RTCPeerConnection({ iceServers: ICE }), c = D.canal = p.createDataChannel('points', { ordered: false, maxRetransmits: 0 });
  D.ctrl = p.createDataChannel('ctrl', { ordered: true });   // V10 : canal FIABLE pour les réglages et la négociation du mode « calcul sur le PC » (les points, eux, restent non fiables)
  D.ctrl.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m && m.t === 'cfg') appliquerCfg(m); else if (m && m.t === 'sdp') traiterSdp(m); };
  c.onopen = () => { if (D.canal !== c) return; D.ouvert = true; D.echec = ''; W.sortie.length = 0; voyants(); };   // les trames en attente pour le Worker sont périmées : on repart sur le direct
  c.onclose = () => { if (D.canal !== c) return; D.ouvert = false; D.apercu = false; voyants(); if (!W.fin && W.cle && essai === D.essai) setTimeout(() => { if (!D.ouvert && !W.fin && W.cle && essai === D.essai) ouvrirDirect(); }, 2000); };
  c.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') { try { c.send(JSON.stringify({ t: 'pong', n: m.n, h: Date.now() })); } catch (e) { /* canal fermé */ } }   // h : l'heure de ce téléphone, pour que le PC mesure le vrai délai
    else if (m.t === 'cfg') appliquerCfg(m);
    else if (m.t === 'sdp') traiterSdp(m);
    else if (m.t === 'apercu') D.apercu = !!m.actif;
    else if (m.t === 'rtt' && Number.isFinite(m.ms)) D.rtt = m.ms;
    else if (m.t === 'caps') K.binaire = !!m.binaire;
    else if (m.t === 'stats') { K.stats = { delai: Number.isFinite(m.delai) ? m.delai : null, perte: Number.isFinite(m.perte) ? m.perte : 0, debit: Number.isFinite(m.debit) ? m.debit : 0, conseil: typeof m.conseil === 'string' ? m.conseil.slice(0, 160) : '', recu: Date.now() }; const z = $('t-conseil'); if (z) z.textContent = K.stats.conseil; }
    else if (m.t === 'fin') finSession('Le PC a coupé la liaison. Pour reprendre, scanne un nouveau QR code.', 'sable');
  };
  p.onicecandidate = ev => { if (ev.candidate && D.pc === p) signal('/camera/signal', { m: { k: 'ice', c: { candidate: ev.candidate.candidate, sdpMLineIndex: ev.candidate.sdpMLineIndex, sdpMid: ev.candidate.sdpMid } } }).catch(() => {}); };
  p.onconnectionstatechange = () => { if (D.pc === p && p.connectionState === 'failed') { D.echec = 'liaison directe impossible'; voyants(); } };
  try {
    const o = await p.createOffer(); await p.setLocalDescription(o);
    const r = await signal('/camera/signal', { m: { k: 'offre', sdp: o.sdp } });
    if (!r.ok) { D.echec = r.status === 404 || r.status === 400 ? 'Worker sans signalisation' : 'signalisation refusée'; voyants(); return; }
  } catch (e) { D.echec = 'signalisation injoignable'; voyants(); return; }
  clearInterval(D.sondeSig);
  D.sondeSig = setInterval(async () => {   // la réponse et les candidats du PC
    if (D.pc !== p || W.fin) return clearInterval(D.sondeSig);
    if (D.ouvert && Date.now() - D.debut > 20000) return clearInterval(D.sondeSig);
    if (!D.ouvert && Date.now() - D.debut > 25000) { D.echec = 'liaison directe non établie'; clearInterval(D.sondeSig); voyants(); return; }
    try {
      const r = await signal('/camera/signal-lire', { apres: D.sigApres }); if (!r.ok) return; const j = await r.json();
      for (const x of (j.signaux || [])) {
        D.sigApres = Math.max(D.sigApres, x.q); const m = x.m; if (!m || D.pc !== p) continue;
        if (m.k === 'reponse') await p.setRemoteDescription({ type: 'answer', sdp: m.sdp });
        else if (m.k === 'ice' && m.c) await p.addIceCandidate({ candidate: m.c.candidate, sdpMLineIndex: m.c.sdpMLineIndex, sdpMid: m.c.sdpMid }).catch(() => {});
      }
    } catch (e) { /* réseau capricieux : on réessaie au tour suivant */ }
  }, 250);
}
let enVol = false;
async function vider() {
  if (!W.cle || W.fin || enVol) return;
  if (D.ouvert) { W.sortie.length = 0; return; }   // le direct est ouvert : rien ne passe plus par le Worker
  if (W.expire && Date.now() > W.expire) return finSession('La session de 15 minutes est terminée. Scanne un nouveau QR code pour continuer.', 'sable');
  if (!W.sortie.length) return;
  const trames = W.sortie.splice(0, 40); enVol = true;
  try {
    const r = await pt('/camera/points', { s: W.s, cle: W.cle, trames });
    if (r.status === 403) return finSession('La session est terminée ou a été fermée sur le PC. Scanne un nouveau QR code.', 'sable');
    if (r.status === 429) { W.erreurs++; } else if (!r.ok) W.erreurs++; else { W.erreurs = 0; W.envoyes++; }
  } catch (e) { W.erreurs++; } finally { enVol = false; voyants(); }
}
$('b-rejoindre').onclick = rejoindre;

// ── appairage ──
$('b-appairer').onclick = () => {
  const code = $('code').value.trim(); if (!/^\d{6}$/.test(code)) return msg('m-appairage', 'Le code compte 6 chiffres.', 'ko');
  fetch('/camera/appairer', { method: 'POST', body: JSON.stringify({ code, nom: $('nom').value || 'Téléphone' }) }).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(r => {
    if (!r.ok || !r.j.jeton) return msg('m-appairage', r.j && r.j.erreur || 'Appairage refusé.', 'ko');
    L.jeton = r.j.jeton; try { localStorage.setItem(CLE, L.jeton); } catch (e) { /* stockage refusé : à refaire à la prochaine visite */ }
    afficher('camera'); connecter(); voyants();
  }).catch(() => msg('m-appairage', 'Le PC ne répond pas. Vérifie le Wi-Fi.', 'ko'));
};
$('b-oublier').onclick = () => { if (W.actif) return finSession('Session fermée sur ce téléphone. Pour reprendre, scanne un nouveau QR code.', 'sable'); oublier('Téléphone oublié. Tu peux l’appairer de nouveau.'); };

// ── caméra et MediaPipe ──
/* Banc d'essai (adresse locale seulement) : rejoue des points ENREGISTRÉS au lieu de la caméra, pour tester toute la chaîne sans main ni objectif. Test réel avec une vraie caméra : à valider par Justin. */
function rejouerTest(suite) {
  let i = 0, file = null, f0 = 0, ti = 0, boucleFile = 0; C.actif = true; montrer('apercu', false); $('b-cam').hidden = true; $('b-stop').hidden = false; msg('m-cam', 'Essai : points enregistrés (pas de caméra).', 'sable'); voyants();
  const faux = document.createElement('canvas'); faux.width = 640; faux.height = 480; const fx = faux.getContext('2d'); fx.fillStyle = '#356'; fx.fillRect(0, 0, 640, 480); fx.fillStyle = '#fc4'; fx.fillRect(200, 140, 240, 200); C.video = faux; C.ctx = {};   // image factice : seulement pour tester l'aperçu (envoyerApercu)
  window.__RAYLE_CAM_JOUER__ = frames => { file = frames; f0 = performance.now(); ti = Date.now(); i = 0; };   // essais : joue une suite UNE fois (aux temps d'origine), puis revient à la suite de fond
  demarrerStats(); initAdaptation();
  C.test = setInterval(() => {
    S.camN += (suite.camIps || suite.ips || 30) / (suite.ips || 30); S.detN += suite.detFraction == null ? 1 : suite.detFraction; S.detMs.push(suite.detMs || 8);   // essais : la caméra peut aller plus vite que la détection (suite.camIps)
    envoyerApercu();
    if (file) { const ecoule = performance.now() - f0; while (i < file.length && file[i].t <= ecoule) { const f = file[i++]; envoyer({ a: 'mains', t: ti + f.t, ratio: f.ratio || 4 / 3, mains: f.mains }); } if (i >= file.length) file = null; return; }
    const f = suite.frames[boucleFile++ % suite.frames.length]; envoyer({ a: 'mains', t: Date.now(), ratio: f.ratio || 4 / 3, mains: f.mains });
  }, Math.round(1000 / (suite.ips || 30)));
}
async function demarrerCamera() {
  msg('m-cam', '');
  if (window.__RAYLE_CAM_TEST__ && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return rejouerTest(window.__RAYLE_CAM_TEST__);
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return msg('m-cam', 'Ce navigateur refuse la caméra sur une page non sécurisée. Ouvre l’adresse en https:// et accepte le certificat du PC (Avancé → Continuer). Voir docs/GESTES.md.', 'ko');
  $('b-cam').disabled = true; msg('m-cam', 'Chargement du modèle de détection de main…', 'sable');
  try {
    const base = window.__RAYLE_CAM_VENDOR__ && /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? window.__RAYLE_CAM_VENDOR__ : (W.actif ? CDN : location.origin + '/camera/vendor/');   // __RAYLE_CAM_VENDOR__ : essais en local seulement
    initAdaptation();
    C.detecteur = await creerDetecteur({ mjs: base + 'vision_bundle.mjs', wasm: base + 'wasm', modele: W.actif && base === CDN ? MODELE_CDN : base + 'hand_landmarker.task', delegate: 'GPU', mains: CFG.mains, worker: CFG.worker, urlWorker: new URL('detection-worker.js', import.meta.url).href, taille: NIV[S.niveau] });
    if (C.detecteur.avertissement) msg('m-cam', C.detecteur.avertissement, 'sable');
    const n0 = NIV[S.niveau];
    /* Contraintes de la plus exigeante à la plus souple : certaines caméras refusent « au moins 30 images/s » (OverconstrainedError) ; on retombe alors sur l'idéal seul, puis sur n'importe quelle caméra. */
    const essais = [{ facingMode: 'user', width: { ideal: n0.l }, height: { ideal: n0.h }, frameRate: { ideal: 60, min: 30 } }, { facingMode: 'user', width: { ideal: n0.l }, height: { ideal: n0.h }, frameRate: { ideal: 60 } }, true];
    for (let i = 0; i < essais.length && !C.flux; i++) { try { C.flux = await navigator.mediaDevices.getUserMedia({ video: essais[i], audio: false }); } catch (e) { if (!(e && e.name === 'OverconstrainedError') || i === essais.length - 1) throw e; } }
  } catch (e) {
    $('b-cam').disabled = false; const nom = e && e.name;
    return msg('m-cam', nom === 'NotAllowedError' || nom === 'SecurityError' ? 'Caméra refusée. Rien n’est envoyé à Rayle. Pour l’autoriser : Chrome → cadenas (ou ⋮) → Autorisations → Caméra → Autoriser ; Safari → aA → Réglages du site web → Caméra. Puis recharge cette page : si le QR code a servi, redemande-en un au PC.' : nom === 'NotFoundError' ? 'Aucune caméra trouvée sur ce téléphone.' : 'Impossible de démarrer : ' + (e && e.message || e), 'ko');
  }
  C.video = document.createElement('video'); C.video.playsInline = true; C.video.muted = true; C.video.srcObject = C.flux; await C.video.play();
  const cv = $('cv'); cv.width = 320; cv.height = Math.round(320 * (C.video.videoHeight || 480) / (C.video.videoWidth || 640)); C.ctx = cv.getContext('2d');
  C.actif = true; montrer('apercu', true); $('b-cam').hidden = true; $('b-stop').hidden = false; $('b-cam').disabled = false; msg('m-cam', ''); voyants();
  verrouEcran();
  appliquerEco(); appliquerNoir(); boucle(); demarrerStats();
}
async function verrouEcran() { try { if (navigator.wakeLock && C.actif && !C.verrou) { C.verrou = await navigator.wakeLock.request('screen'); C.verrou.addEventListener('release', () => { C.verrou = null; }); } } catch (e) { /* écran : à garder allumé à la main */ } }
function appliquerEco() { const b = $('b-eco'); if (b) b.textContent = K.eco ? 'Aperçu coupé (économie) · le rétablir' : 'Économie : couper l’aperçu'; if (C.actif) montrer('apercu', !K.eco); }
$('b-eco').onclick = () => { K.eco = !K.eco; try { localStorage.setItem('rayle_cam_eco', K.eco ? '1' : '0'); } catch (e) { /* stockage refusé */ } appliquerEco(); voyants(); };
function arreterCamera() {
  arreterStats(); if (S.calcul === 'pc') { S.calcul = 'telephone'; try { S.sender && D.pc && D.pc.removeTrack(S.sender); } catch (e) { /* déjà retirée */ } S.sender = null; }
  D.apercu = false; clearInterval(C.test); C.actif = false; cancelAnimationFrame(C.boucle); try { C.video && C.video.cancelVideoFrameCallback && C.video.cancelVideoFrameCallback(C.rvfc); } catch (e) { /* déjà annulé */ } if (C.flux) C.flux.getTracks().forEach(t => t.stop()); C.flux = null; try { C.detecteur && C.detecteur.fermer(); } catch (e) { /* déjà fermé */ } C.detecteur = null;
  try { C.verrou && C.verrou.release(); } catch (e) { /* déjà libéré */ } C.verrou = null; envoyer({ a: 'mains', t: Date.now(), ratio: 4 / 3, mains: [] });
  montrer('apercu', false); $('b-cam').hidden = false; $('b-stop').hidden = true; voyants();
}
$('b-cam').onclick = demarrerCamera; $('b-stop').onclick = arreterCamera;
document.addEventListener('visibilitychange', () => { if (!document.hidden) verrouEcran(); if (document.hidden && C.actif) msg('m-cam', 'L’écran est masqué : le navigateur peut mettre la caméra en pause. Garde cette page au premier plan.', 'sable'); });
const LIAISONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
function dessiner(mains) {
  if (K.eco || !C.ctx || !C.ctx.canvas) return;
  const c = C.ctx, w = c.canvas.width, h = c.canvas.height; c.save(); c.clearRect(0, 0, w, h); c.translate(w, 0); c.scale(-1, 1); c.drawImage(C.video, 0, 0, w, h); c.restore();
  c.strokeStyle = '#8fd0e3'; c.fillStyle = '#c9b27a'; c.lineWidth = 2;
  for (const m of mains) { c.beginPath(); for (const [a, b] of LIAISONS) { c.moveTo((1 - m.pts[a][0]) * w, m.pts[a][1] * h); c.lineTo((1 - m.pts[b][0]) * w, m.pts[b][1] * h); } c.stroke(); for (const p of m.pts) c.fillRect((1 - p[0]) * w - 2, p[1] * h - 2, 4, 4); }
}
/* Aperçu demandé par le PC (case cochée par Justin) : petit JPEG, 5 images par seconde au plus, par le canal DIRECT seulement. */
function envoyerApercu() {
  if (!D.apercu || !D.ouvert || !C.video || !C.ctx) return;
  const t = performance.now(); if (t - D.dernierApercu < 200) return; D.dernierApercu = t;
  try {
    const mini = envoyerApercu.cv || (envoyerApercu.cv = document.createElement('canvas')); mini.width = 160; mini.height = 120; const x = mini.getContext('2d'); x.save(); x.translate(160, 0); x.scale(-1, 1); x.drawImage(C.video, 0, 0, 160, 120); x.restore();
    const d = mini.toDataURL('image/jpeg', 0.45); if (d.length < 15000) D.canal.send(JSON.stringify({ a: 'image', d }));
  } catch (e) { /* canal occupé : on saute cette image */ }
}
/* Une détection par image de la caméra, TOUJOURS la dernière : l'image suivante est demandée tout de suite, et si la détection précédente n'est pas finie la nouvelle image est SAUTÉE
   (jamais de file d'attente, donc jamais de retard qui s'accumule). Avec le Worker, la détection ne bloque ni la caméra, ni le réseau, ni l'affichage. */
function boucle() {
  if (!C.actif) return;
  const suite = () => { if (!C.actif) return; if (C.video.requestVideoFrameCallback) C.rvfc = C.video.requestVideoFrameCallback(image); else C.boucle = requestAnimationFrame(image); };
  async function image(maintenant, meta) {
    if (!C.actif) return;
    suite(); S.camN++;
    if (S.calcul === 'pc' || !C.detecteur || C.video.readyState < 2) return;
    const t0 = performance.now(), age = meta && Number.isFinite(meta.captureTime) ? Math.max(0, Math.min(250, t0 - meta.captureTime)) : 0, stamp = Math.max(t0, K.dernierT + 1); K.dernierT = stamp;
    const r = await C.detecteur.detecter(C.video, stamp); if (!r || !C.actif) { if (!r) S.sautes++; return; }
    const fin = performance.now(); S.detN++; S.detMs.push(r.total != null ? r.total : fin - t0);
    K.dt = Math.min(255, Math.round(age + (fin - t0))); K.conf = r.conf;
    const mains = r.mains;
    if (mains.length) { C.dernierVu = t0; envoyer({ a: 'mains', t: Date.now(), ratio: C.video.videoWidth / (C.video.videoHeight || 1), mains }); }
    else if (t0 - C.dernierVide > 500) { C.dernierVide = t0; envoyer({ a: 'mains', t: Date.now(), ratio: 4 / 3, mains: [] }); }   // sans main : un battement toutes les 0,5 s (le PC garde l'état moins d'une demi-seconde)
    if (!CFG.noir && t0 - K.dernierDessin > 80) { K.dernierDessin = t0; dessiner(mains); envoyerApercu(); }   // aperçu : 12 images par seconde au plus, jamais à chaque détection
  }
  suite();
}

// ── V10 : statistiques d'une seconde, adaptation de la résolution, réglages reçus du PC, mode « calcul sur le PC » ──
const mediane = l => { const s = l.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };
function initAdaptation() {
  S.niveau = CFG.res === 'auto' ? 2 : Math.max(0, NIV.findIndex(n => n.l === +CFG.res));
  S.adapt = self.AdaptationCamera ? self.AdaptationCamera.creerAdaptation({ niveau: S.niveau, niveauMax: CFG.res === 'auto' ? 2 : S.niveau, auto: CFG.res === 'auto' }) : null;
}
function appliquerNoir() { document.body.classList.toggle('noir', !!CFG.noir && C.actif); if (CFG.noir) montrer('apercu', false); else if (C.actif) montrer('apercu', !K.eco); }
function demarrerStats() {
  S.camN = S.detN = S.sautes = 0; S.detMs = []; S.chrono = performance.now(); S.histDet = [];
  try { navigator.getBattery && navigator.getBattery().then(b => { S.bat = b.level; S.charge = b.charging; b.addEventListener('levelchange', () => { S.bat = b.level; }); b.addEventListener('chargingchange', () => { S.charge = b.charging; }); }).catch(() => {}); } catch (e) { /* batterie non lisible */ }
  clearInterval(S.minuteur); S.minuteur = setInterval(secondeStats, 1000);
}
function arreterStats() { clearInterval(S.minuteur); S.minuteur = 0; }
function luminosite() {
  try {
    if (!C.video || C.video.readyState < 2) return S.lum;
    const cv = luminosite.cv || (luminosite.cv = document.createElement('canvas')); cv.width = 16; cv.height = 12; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(C.video, 0, 0, 16, 12);
    const d = x.getImageData(0, 0, 16, 12).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return Math.round(s / (d.length / 4));
  } catch (e) { return S.lum; }
}
let tLum = 0;
function secondeStats() {
  const maintenant = performance.now(), dt = Math.max(0.5, (maintenant - S.chrono) / 1000); S.chrono = maintenant;
  const cam = S.camN / dt, det = S.calcul === 'pc' ? null : S.detN / dt, detMs = mediane(S.detMs); S.camN = S.detN = 0; S.detMs = [];
  if (maintenant - tLum > 2000) { tLum = maintenant; S.lum = luminosite(); }
  const mode = C.detecteur ? C.detecteur.mode : '', n = NIV[S.niveau];
  if (S.calcul !== 'pc') {
    S.histDet.push(det);
    $('pt-det').className = 'pt ' + (det >= 45 ? 'ok' : det >= 30 ? 'att' : 'ko'); $('t-det').textContent = 'détection : ' + Math.round(det) + ' images/s' + (detMs != null ? ' · ' + Math.round(detMs) + ' ms' : '') + ' · ' + n.l + '×' + n.h + (mode === 'worker' ? ' · Worker' : '');
    if (S.adapt) {
      const d = S.adapt.echantillon({ t: maintenant / 1000, camFps: cam, detFps: det, detMs: detMs == null ? 0 : detMs });
      if (d.action === 'baisser' || d.action === 'monter') { S.niveau = d.niveau; changerResolution(); msg('m-cam', d.raison, 'sable'); }
      if (d.lumiere) { $('t-conseil').textContent = d.raison; essayerPoseCourte(cam); } else if (d.proposerPc) $('t-conseil').textContent = d.raison + ' (Dans Rayle : Test de fluidité → calcul sur le PC.)'; else if (d.eco && !K.eco) { K.eco = true; try { localStorage.setItem('rayle_cam_eco', '1'); } catch (e) { /* stockage refusé */ } appliquerEco(); $('t-conseil').textContent = d.raison; }
    }
  } else { $('pt-det').className = 'pt ok'; $('t-det').textContent = 'calcul sur le PC · caméra ' + Math.round(cam) + ' images/s'; }
  if (S.pose && maintenant - S.pose.t > 6000) { const gagne = cam >= S.pose.avant * 1.25; if (!gagne) revenirPoseAuto(); else { S.pose.garde = true; S.pose.t = 1e15; } }   // la pose courte n'a pas fait gagner 25 % de cadence : on revient à l'automatique
  ctrlEnvoyer({ t: 'tel', cam: +cam.toFixed(1), det: det == null ? null : +det.toFixed(1), detMs: detMs == null ? null : +detMs.toFixed(1), sautes: S.sautes, bat: S.bat, charge: S.charge, eco: !!K.eco, res: n.l, calcul: S.calcul, pose: S.pose ? 'courte' : 'auto', lum: S.lum, mode, delegate: C.detecteur ? C.detecteur.delegate : '', mains: CFG.mains, noir: !!CFG.noir, auto: CFG.res === 'auto' });
  S.sautes = 0;
}
/* Lumière faible : la caméra allonge son temps de pose et fait chuter la cadence. Si l'appareil le permet (exposureTime), on essaie une pose COURTE (10 ms, sensibilité maximale) : image plus bruitée
   mais cadence tenue. Une seule tentative par session ; retour à l'automatique si la cadence ne gagne pas au moins 25 % en 6 s. Appareil sans ce réglage : on conseille seulement « plus de lumière ». */
async function essayerPoseCourte(camFps) {
  if (S.pose || S.poseEssayee) return; const piste = C.flux && C.flux.getVideoTracks()[0]; if (!piste || !piste.getCapabilities) return;
  let cap; try { cap = piste.getCapabilities(); } catch (e) { return; }
  if (!cap.exposureTime || !(cap.exposureMode || []).includes('manual')) return; S.poseEssayee = true;
  try { await piste.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: Math.max(cap.exposureTime.min, Math.min(cap.exposureTime.max, 100)) }, ...(cap.iso ? [{ iso: cap.iso.max }] : [])] }); S.pose = { t: performance.now(), avant: camFps }; msg('m-cam', 'Lumière faible : pose courte essayée pour garder la cadence (retour à l’automatique si ça n’aide pas).', 'sable'); }
  catch (e) { S.pose = null; }
}
async function revenirPoseAuto() { const piste = C.flux && C.flux.getVideoTracks()[0]; S.pose = null; try { if (piste) await piste.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] }); } catch (e) { /* réglage non pris en charge */ } msg('m-cam', 'La pose courte n’a pas amélioré la cadence : exposition automatique rétablie. Plus de lumière sur la main aide davantage.', 'sable'); }
async function changerResolution() {
  const n = NIV[S.niveau]; try { const piste = C.flux && C.flux.getVideoTracks()[0]; if (piste) await piste.applyConstraints({ width: { ideal: n.l }, height: { ideal: n.h }, frameRate: { ideal: 60, min: 30 } }); } catch (e) { /* le téléphone garde sa résolution : la réduction se fait alors à la copie */ }
  if (C.detecteur && C.detecteur.regler) C.detecteur.regler({ taille: n });
}
/* Réglages reçus du PC (« Appliquer » du Test de fluidité) ou choisis ici. Rien n'est appliqué sans trace : le message est affiché. */
function appliquerCfg(m) {
  const dit = [];
  if (m.res != null && [320, 480, 640].includes(+m.res)) { CFG.res = String(+m.res); S.niveau = NIV.findIndex(x => x.l === +m.res); if (S.adapt) S.adapt.regler({ auto: false, niveau: S.niveau, niveauMax: S.niveau }); changerResolution(); dit.push('résolution ' + m.res + ' × ' + Math.round(m.res * 0.75)); }
  if (m.res === 'auto') { CFG.res = 'auto'; if (S.adapt) S.adapt.regler({ auto: true, niveauMax: 2 }); dit.push('résolution automatique'); }
  if (m.mains === 1 || m.mains === 2) { CFG.mains = m.mains; dit.push(m.mains + ' main' + (m.mains > 1 ? 's' : '')); if (C.detecteur && C.detecteur.regler) C.detecteur.regler({ mains: m.mains }); }
  if (typeof m.eco === 'boolean') { K.eco = m.eco; try { localStorage.setItem('rayle_cam_eco', m.eco ? '1' : '0'); } catch (e) { /* stockage refusé */ } appliquerEco(); if (m.eco) { CFG.noir = true; dit.push('aperçu coupé'); } }
  if (typeof m.noir === 'boolean') { CFG.noir = m.noir; appliquerNoir(); }
  if (m.calcul === 'pc') { if (S.calcul !== 'pc') { montrer('s-pc', true); dit.push('demande du calcul sur le PC (à accepter ici)'); } }
  else if (m.calcul === 'telephone' && S.calcul === 'pc') arreterVideoPc();
  sauverCfg(); synchroReglages(); if (dit.length) msg('m-cam', 'Rayle a réglé ce téléphone : ' + dit.join(', ') + '.', 'sable');
}
function synchroReglages() { const r = $('r-res'); if (r) r.value = CFG.res; const m = $('r-mains'); if (m) m.value = String(CFG.mains); const w = $('r-worker'); if (w) w.checked = !!CFG.worker; const n = $('r-noir'); if (n) n.checked = !!CFG.noir; }
$('r-res').onchange = e => appliquerCfg({ res: e.target.value === 'auto' ? 'auto' : +e.target.value });
$('r-mains').onchange = e => appliquerCfg({ mains: +e.target.value });
$('r-worker').onchange = e => { CFG.worker = e.target.checked; sauverCfg(); msg('m-cam', 'Réglage mémorisé : il s’applique au prochain démarrage de la caméra.', 'sable'); };
$('r-noir').onchange = e => appliquerCfg({ noir: e.target.checked });
synchroReglages();

/* Mode « calcul sur le PC » : DÉSACTIVÉ par défaut, demandé par le PC, ACCEPTÉ ici. La vidéo basse résolution part par la même liaison pair-à-pair (jamais par le Worker ni un serveur), n'est jamais enregistrée. */
async function demarrerVideoPc() {
  if (!D.pc || !D.ouvert || !C.flux) { msg('m-cam', 'Le calcul sur le PC demande la liaison directe (elle n’est pas établie).', 'ko'); return; }
  const piste = C.flux.getVideoTracks()[0]; if (!piste) return;
  S.sender = D.pc.addTrack(piste, C.flux); S.calcul = 'pc';
  try { const p = S.sender.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}]; p.encodings[0].maxBitrate = 900000; p.encodings[0].maxFramerate = 60; p.degradationPreference = 'maintain-framerate'; await S.sender.setParameters(p); } catch (e) { /* réglages d'encodage non disponibles : valeurs par défaut */ }
  try { await renegocier(); } catch (e) { S.calcul = 'telephone'; msg('m-cam', 'Négociation de la vidéo impossible : le calcul reste sur ce téléphone.', 'ko'); return; }
  montrer('t-pc-actif', true); montrer('s-pc', false); ctrlEnvoyer({ t: 'calcul', etat: 'pc' });
}
async function renegocier() { const o = await D.pc.createOffer(); await D.pc.setLocalDescription(o); if (!ctrlEnvoyer({ t: 'sdp', type: 'offer', sdp: o.sdp })) throw new Error('canal de contrôle fermé'); }
async function traiterSdp(m) { try { if (m.type === 'answer' && typeof m.sdp === 'string' && D.pc) await D.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) { /* réponse périmée */ } }
async function arreterVideoPc() {
  try { S.sender && D.pc && D.pc.removeTrack(S.sender); } catch (e) { /* déjà retirée */ } S.sender = null; S.calcul = 'telephone'; montrer('t-pc-actif', false);
  try { if (D.pc && D.ouvert) await renegocier(); } catch (e) { /* liaison fermée */ }
  reprendreLocal(); ctrlEnvoyer({ t: 'calcul', etat: 'telephone' });
}
function reprendreLocal() { montrer('t-pc-actif', false); S.histDet = []; }
$('b-pc-oui').onclick = demarrerVideoPc; $('b-pc-non').onclick = () => { montrer('s-pc', false); ctrlEnvoyer({ t: 'calcul', etat: 'refuse' }); };
$('b-pc-stop').onclick = arreterVideoPc;

// ── démarrage ──
if (W.actif) { afficher('worker'); $('t-worker-url').textContent = W.url ? W.url.replace(/^https?:\/\//, '') : '(adresse absente)'; if (!W.s || !W.j || !W.url) { $('b-rejoindre').hidden = true; msg('m-worker', 'Ce lien est incomplet ou périmé. Redemande un QR code au PC (Rayle → ⚙ → Gestes → Caméra du téléphone).', 'ko'); } }
else fetch('/camera/statut?jeton=' + encodeURIComponent(L.jeton || ''), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(s => {
  if (!s) { montrer('s-erreur', true); $('t-erreur').textContent = 'Ouvre cette page avec le QR code ou l’adresse affichée par Rayle sur le PC (le jeton de l’adresse est requis).'; return; }
  if (L.jeton && s.jetonValide) { afficher('camera'); connecter(); voyants(); } else { if (L.jeton) { try { localStorage.removeItem(CLE); } catch (e) { /* stockage refusé */ } L.jeton = null; } afficher('appairage'); }
}).catch(() => { montrer('s-erreur', true); $('t-erreur').textContent = 'Le PC ne répond pas.'; });
