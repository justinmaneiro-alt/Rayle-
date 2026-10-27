/* ═════════════ « CAMÉRA RAYLE » : la caméra du téléphone envoie les POINTS de la main au PC (jamais la vidéo) ═════════════
   Page servie par le PC en HTTPS (réseau local seulement, jeton QR + code d'appairage à 6 chiffres, comme la télécommande de la tablette mais instance séparée : app-pc/camera-pont.mjs).
   MediaPipe Hands tourne ICI, dans le navigateur du téléphone ; les fichiers du modèle viennent du PC (/camera/vendor/…), rien n'est chargé depuis Internet.
   Messages envoyés : { a:'mains', t, ratio, mains:[{ lat, pts:[[x,y,z]×21] }] } au plus 30 fois par seconde (les mains vides à 5/s pour que le PC libère ce qu'il tenait). */
const $ = id => document.getElementById(id);
const CLE = 'rayle_cam_jeton';
const L = { jeton: null, ws: null, ouvert: false, pc: false, rtt: null, n: 0, envoyes: {}, dernierPong: 0, delaiMax: 5000, pings: 0, garde: 0, retard: 0, tentative: 0 };
const C = { flux: null, video: null, detecteur: null, boucle: 0, actif: false, dernierEnvoi: 0, dernierVu: 0, dernierVide: 0, ctx: null, verrou: null };
try { L.jeton = localStorage.getItem(CLE) || null; } catch (e) { /* stockage refusé */ }
const montrer = (id, oui) => { $(id).hidden = !oui; };
const msg = (id, texte, genre) => { $(id).innerHTML = texte ? '<div class="msg ' + (genre || '') + '">' + String(texte).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</div>' : ''; };

// ── liaison avec le PC ──
function envoyer(o) { if (L.ws && L.ws.readyState === 1) { try { L.ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } } return false; }
function voyants() {
  $('pt-pc').className = 'pt ' + (L.ouvert ? (L.pc ? 'ok' : 'att') : 'ko'); $('t-pc').textContent = L.ouvert ? (L.pc ? 'PC : Rayle ouvert' : 'PC : connecté, Rayle fermé') : 'PC : déconnecté';
  $('t-lat').textContent = L.rtt != null ? '· ' + L.rtt + ' ms' : '';
  $('pt-cam').className = 'pt ' + (C.actif ? 'ok' : ''); $('t-cam').textContent = C.actif ? 'caméra active' : 'caméra arrêtée';
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
function afficher(ecran, raison) { montrer('s-appairage', ecran === 'appairage'); montrer('s-camera', ecran === 'camera'); if (raison) msg(ecran === 'appairage' ? 'm-appairage' : 'm-cam', raison, 'sable'); }

// ── appairage ──
$('b-appairer').onclick = () => {
  const code = $('code').value.trim(); if (!/^\d{6}$/.test(code)) return msg('m-appairage', 'Le code compte 6 chiffres.', 'ko');
  fetch('/camera/appairer', { method: 'POST', body: JSON.stringify({ code, nom: $('nom').value || 'Téléphone' }) }).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(r => {
    if (!r.ok || !r.j.jeton) return msg('m-appairage', r.j && r.j.erreur || 'Appairage refusé.', 'ko');
    L.jeton = r.j.jeton; try { localStorage.setItem(CLE, L.jeton); } catch (e) { /* stockage refusé : à refaire à la prochaine visite */ }
    afficher('camera'); connecter(); voyants();
  }).catch(() => msg('m-appairage', 'Le PC ne répond pas. Vérifie le Wi-Fi.', 'ko'));
};
$('b-oublier').onclick = () => oublier('Téléphone oublié. Tu peux l’appairer de nouveau.');

// ── caméra et MediaPipe ──
async function demarrerCamera() {
  msg('m-cam', '');
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return msg('m-cam', 'Ce navigateur refuse la caméra sur une page non sécurisée. Ouvre l’adresse en https:// et accepte le certificat du PC (Avancé → Continuer). Voir docs/GESTES.md.', 'ko');
  $('b-cam').disabled = true; msg('m-cam', 'Chargement du modèle de détection de main…', 'sable');
  try {
    const vision = await import('/camera/vendor/vision_bundle.mjs');
    const fichiers = await vision.FilesetResolver.forVisionTasks('/camera/vendor/wasm');
    const creer = delegate => vision.HandLandmarker.createFromOptions(fichiers, { baseOptions: { modelAssetPath: '/camera/vendor/hand_landmarker.task', delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { C.detecteur = await creer('GPU'); } catch (e) { C.detecteur = await creer('CPU'); }
    C.flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
  } catch (e) {
    $('b-cam').disabled = false; const nom = e && e.name;
    return msg('m-cam', nom === 'NotAllowedError' ? 'Caméra refusée : autorise-la dans les réglages du navigateur, puis recommence.' : nom === 'NotFoundError' ? 'Aucune caméra trouvée sur ce téléphone.' : 'Impossible de démarrer : ' + (e && e.message || e), 'ko');
  }
  C.video = document.createElement('video'); C.video.playsInline = true; C.video.muted = true; C.video.srcObject = C.flux; await C.video.play();
  const cv = $('cv'); cv.width = 320; cv.height = Math.round(320 * (C.video.videoHeight || 480) / (C.video.videoWidth || 640)); C.ctx = cv.getContext('2d');
  C.actif = true; montrer('apercu', true); $('b-cam').hidden = true; $('b-stop').hidden = false; $('b-cam').disabled = false; msg('m-cam', ''); voyants();
  try { if (navigator.wakeLock) C.verrou = await navigator.wakeLock.request('screen'); } catch (e) { /* écran : à garder allumé à la main */ }
  boucle();
}
function arreterCamera() {
  C.actif = false; cancelAnimationFrame(C.boucle); if (C.flux) C.flux.getTracks().forEach(t => t.stop()); C.flux = null; try { C.detecteur && C.detecteur.close(); } catch (e) { /* déjà fermé */ } C.detecteur = null;
  try { C.verrou && C.verrou.release(); } catch (e) { /* déjà libéré */ } C.verrou = null; envoyer({ a: 'mains', t: Date.now(), ratio: 4 / 3, mains: [] });
  montrer('apercu', false); $('b-cam').hidden = false; $('b-stop').hidden = true; voyants();
}
$('b-cam').onclick = demarrerCamera; $('b-stop').onclick = arreterCamera;
document.addEventListener('visibilitychange', () => { if (document.hidden && C.actif) msg('m-cam', 'L’écran est masqué : le navigateur peut mettre la caméra en pause. Garde cette page au premier plan.', 'sable'); });
const LIAISONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
function dessiner(mains) {
  const c = C.ctx, w = c.canvas.width, h = c.canvas.height; c.save(); c.clearRect(0, 0, w, h); c.translate(w, 0); c.scale(-1, 1); c.drawImage(C.video, 0, 0, w, h); c.restore();
  c.strokeStyle = '#8fd0e3'; c.fillStyle = '#c9b27a'; c.lineWidth = 2;
  for (const m of mains) { c.beginPath(); for (const [a, b] of LIAISONS) { c.moveTo((1 - m.pts[a][0]) * w, m.pts[a][1] * h); c.lineTo((1 - m.pts[b][0]) * w, m.pts[b][1] * h); } c.stroke(); for (const p of m.pts) c.fillRect((1 - p[0]) * w - 2, p[1] * h - 2, 4, 4); }
}
function boucle() {
  if (!C.actif) return; C.boucle = requestAnimationFrame(boucle);
  const t = performance.now(); if (t - C.dernierEnvoi < 1000 / 30 || C.video.readyState < 2) return; C.dernierEnvoi = t;
  let r; try { r = C.detecteur.detectForVideo(C.video, t); } catch (e) { return; }
  const mains = (r.landmarks || []).map((pts, i) => ({ lat: (r.handedness && r.handedness[i] && r.handedness[i][0] && r.handedness[i][0].categoryName) === 'Right' ? 'Right' : 'Left', pts: pts.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.z || 0).toFixed(4)]) }));
  dessiner(mains);
  if (mains.length) { C.dernierVu = t; envoyer({ a: 'mains', t: Date.now(), ratio: C.video.videoWidth / (C.video.videoHeight || 1), mains }); }
  else if (t - C.dernierVide > 200) { C.dernierVide = t; envoyer({ a: 'mains', t: Date.now(), ratio: 4 / 3, mains: [] }); }
}

// ── démarrage ──
fetch('/camera/statut?jeton=' + encodeURIComponent(L.jeton || ''), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(s => {
  if (!s) { montrer('s-erreur', true); $('t-erreur').textContent = 'Ouvre cette page avec le QR code ou l’adresse affichée par Rayle sur le PC (le jeton de l’adresse est requis).'; return; }
  if (L.jeton && s.jetonValide) { afficher('camera'); connecter(); voyants(); } else { if (L.jeton) { try { localStorage.removeItem(CLE); } catch (e) { /* stockage refusé */ } L.jeton = null; } afficher('appairage'); }
}).catch(() => { montrer('s-erreur', true); $('t-erreur').textContent = 'Le PC ne répond pas.'; });
