"use strict";
/* ═════════════ GESTES (V2, phase 11) : côté page Rayle du PC ═════════════
   Trois sources de points de main : la webcam du PC (MediaPipe Hands tourne DANS ce navigateur, aucune image ne part sur Internet), la caméra du téléphone (pont QR : seuls les points arrivent,
   via le serveur local), ou un rejeu de points enregistrés (tests, sans caméra). Le moteur (gestes-calcul.js, pur) transforme les points en messages de la télécommande : ils passent par
   window.Telecommande.appliquer, donc par la MÊME liste blanche et le MÊME curseur virtuel que le pad de la tablette (fenêtres, Pad 3D, objets 3D, piles). Sans caméra : tout reste utilisable
   à la souris et au toucher ; si la permission est refusée, un message l'explique et rien ne plante. Désactivé par défaut. */
const Gestes = (() => {
  const C = window.GestesCalcul, CLE = 'rayle_gestes';
  const BASE = (window.RAYLE_GESTES_URL || new URL('assets-lourds/gestes/', document.baseURI).href).replace(/\/?$/, '/');
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { return {}; } };
  const ecrire = o => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage refusé : réglages perdus à la fermeture */ } };
  let prefs = Object.assign({ seuilFerme: C.DEFAUTS.seuilFerme, seuilOuvre: C.DEFAUTS.seuilOuvre, zoneUtile: C.DEFAUTS.zoneUtile, miroir: true, droitier: true, source: 'locale', apercu: false }, lire());
  const E = { actif: false, source: null, erreur: '', info: '', mains: 0, derniere: '', pause: false, fps: 0, charge: false, camera: false, enregistrement: null, rejeu: false, nbMessages: 0 };
  let decalageTel = null;   // horloge du téléphone -> horloge de la page (le moteur veut un temps qui avance, dans le même repère que la webcam)
  const ecouteurs = []; let calib = null, moteur = null, flux = null, video = null, detecteur = null, boucle = 0, tPrec = 0, vusRecents = 0, dernierEnvoiVide = 0, ws = null, voulu = false, apercuCtx = null, adaptatif = { fps: 30, sansMain: 0 };
  const surEvenement = f => { ecouteurs.push(f); return () => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); }; };
  const prevenir = (type, d) => { for (const f of ecouteurs.slice()) { try { f(type, d); } catch (e) { /* un écouteur fautif n'arrête pas les autres */ } } };
  const reglages = () => ({ ...prefs });
  function creerMoteur() { moteur = C.creerMoteur({ seuilFerme: prefs.seuilFerme, seuilOuvre: prefs.seuilOuvre, zoneUtile: prefs.zoneUtile, miroir: prefs.miroir, droitier: prefs.droitier, ecran: { l: innerWidth, h: innerHeight } }); return moteur; }
  window.addEventListener('resize', () => { if (moteur) moteur.regler({ ecran: { l: innerWidth, h: innerHeight } }); });

  // ── application des messages sur la page ──
  function rangerFenetres() { let n = 0; for (const g of (window.RayleGestionnaires || [])) { try { g.reorganiser('grille'); n++; } catch (e) { /* gestionnaire non prêt */ } } return n; }
  function appliquer(sortie) {
    E.mains = sortie.etat ? sortie.etat.mains : 0; E.pause = !!(sortie.etat && sortie.etat.pause);
    for (const m of sortie.msgs) { E.nbMessages++; if (window.Telecommande && window.Telecommande.appliquer) window.Telecommande.appliquer(m); }
    for (const e of sortie.evenements) {
      if (e.type === 'ranger') { rangerFenetres(); E.derniere = 'poing : fenêtres rangées'; }
      else if (e.type === 'clic') E.derniere = e.n === 2 ? 'double clic' : 'clic';
      else if (e.type === 'saisie') E.derniere = 'saisie';
      else if (e.type === 'lacher') E.derniere = 'relâché';
      else if (e.type === 'balayage') E.derniere = 'balayage ' + e.sens;
      else if (e.type === 'debut_zoom') E.derniere = 'redimensionner';
      else if (e.type === 'debut_rotation') E.derniere = 'pivoter';
      else if (e.type === 'pause') { E.derniere = e.actif ? 'gestes en pause' : 'gestes repris'; }
      prevenir('geste', e);
    }
    if (sortie.msgs.length || sortie.evenements.length) prevenir('maj', E);
  }
  function injecter(frame) {
    if (!E.actif || !moteur) return null;
    E.dernierT = frame.t; if (calib) calib(frame);
    if (E.enregistrement) E.enregistrement.frames.push({ t: frame.t, ratio: frame.ratio, mains: frame.mains.map(m => ({ lat: m.lat, pts: m.pts.map(p => [+p[0].toFixed(4), +p[1].toFixed(4), +(p[2] || 0).toFixed(4)]) })) });
    const s = moteur.traiter(frame); appliquer(s); return s;
  }

  /* Les trames du téléphone portent l'heure du téléphone (Date.now) : on les ramène à l'horloge de la page en gardant leur espacement exact, et on ne laisse jamais le temps reculer. */
  function injecterTelephone(f) {
    const maintenant = performance.now(); if (decalageTel === null) decalageTel = maintenant - f.t;
    let t = f.t + decalageTel; if (t > maintenant + 1500 || t < maintenant - 4000) { decalageTel = maintenant - f.t; t = maintenant; }   // horloge qui dérive ou rafale très en retard : on recale
    if (E.dernierT && t <= E.dernierT) t = E.dernierT + 1;
    return injecter({ t, ratio: f.ratio, mains: f.mains });
  }

  // ── source 1 : webcam du PC (MediaPipe local) ──
  async function chargerModele() {
    const vision = await import(BASE + 'vision_bundle.mjs'), fichiers = await vision.FilesetResolver.forVisionTasks(BASE + 'wasm');
    const creer = delegate => vision.HandLandmarker.createFromOptions(fichiers, { baseOptions: { modelAssetPath: BASE + 'hand_landmarker.task', delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { detecteur = await creer('GPU'); E.info = 'détection sur la carte graphique'; } catch (e) { detecteur = await creer('CPU'); E.info = 'détection sur le processeur'; }
    E.charge = true;
  }
  async function demarrerWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('Ce navigateur n’expose pas la caméra.'), { name: 'NotSupportedError' });
    if (!E.charge) { E.info = 'chargement du modèle…'; prevenir('maj', E); await chargerModele(); }
    flux = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } }, audio: false });   // résolution réduite : suffisante pour la main, très légère
    video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = flux; await video.play(); E.camera = true;
    adaptatif = { fps: 30, sansMain: 0 }; tPrec = 0; boucle = requestAnimationFrame(tick);
  }
  function tick(t) {
    if (!E.actif || E.source !== 'locale') return; boucle = requestAnimationFrame(tick);
    if (document.hidden) return;   // onglet caché : pas de calcul
    if (t - tPrec < 1000 / adaptatif.fps || video.readyState < 2) return;   // détection adaptative : 30 images/s quand une main est là, 10 quand rien ne bouge depuis 2 s
    E.fps = Math.round(1000 / Math.max(1, t - (tPrec || t - 33))); tPrec = t;
    let r; try { r = detecteur.detectForVideo(video, t); } catch (e) { return; }
    const mains = (r.landmarks || []).map((pts, i) => ({ lat: (r.handedness && r.handedness[i] && r.handedness[i][0] && r.handedness[i][0].categoryName) === 'Right' ? 'Right' : 'Left', pts: pts.map(p => [p.x, p.y, p.z || 0]) }));
    adaptatif.sansMain = mains.length ? 0 : adaptatif.sansMain + 1; adaptatif.fps = adaptatif.sansMain > 60 ? 10 : 30;
    dessinerApercu(mains);
    injecter({ t: Math.round(t), ratio: video.videoWidth / (video.videoHeight || 1), mains });
  }

  // ── source 2 : caméra du téléphone (points reçus du serveur local, jamais d'image) ──
  function connecterPont() {
    voulu = true; try { ws && ws.close(); } catch (e) { /* déjà fermée */ }
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__cam/ws');
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m.t === 'ev' && m.m) { const v = C.validerMains(m.m); if (v) injecter({ t: v.t, ratio: v.ratio, mains: v.mains }); } else if (m.t === 'etat') { E.telephone = m.etat; prevenir('maj', E); } };
    ws.onclose = () => { if (voulu && E.actif && E.source === 'telephone') setTimeout(connecterPont, 1500); };
  }
  /* source 3 : caméra du téléphone par HTTPS et Worker (phase 4 V3) : la session doit déjà exister (QR affiché), les trames arrivent par CameraRelais, revalidées. */
  async function connecterRelais() {
    const R = window.CameraRelais; if (!R) throw new Error('Module CameraRelais absent.'); decalageTel = null;
    if (!R.etat().session) { const ok = await R.demarrer({ aSurTrames: f => injecterTelephone(f) }); if (!ok) throw new Error(R.etat().erreur || 'Session impossible.'); }
    else R.definirSurTrames(f => injecterTelephone(f));
  }
  const api = (chemin, corps) => fetch('/__cam/' + chemin, corps === undefined ? { headers: { 'X-Rayle-Cam': '1' } } : { method: 'POST', headers: { 'X-Rayle-Cam': '1' }, body: JSON.stringify(corps) }).then(r => r.json());

  // ── cycle de vie ──
  function messageErreur(e) {
    const nom = e && e.name;
    if (nom === 'NotAllowedError' || nom === 'SecurityError') return 'Permission de la caméra refusée. Les gestes restent éteints ; la souris et le toucher marchent comme avant. Tu peux l’autoriser dans les réglages du site (cadenas de la barre d’adresse).';
    if (nom === 'NotFoundError' || nom === 'OverconstrainedError') return 'Aucune caméra détectée sur ce PC. Les gestes restent éteints (la souris et le toucher marchent). Branche une webcam, ou utilise la caméra du téléphone.';
    if (nom === 'NotReadableError') return 'La caméra est utilisée par un autre programme.';
    return 'Les gestes n’ont pas pu démarrer : ' + String(e && e.message || e);
  }
  const telephoneConnecte = () => { const R = window.CameraRelais, e = R && R.etat(); return !!(e && e.session && (e.etat === 'connecte' || e.etat === 'attente')); };
  /* La case « Activer les gestes » et la voix ne dépendent PAS d'une webcam : un téléphone connecté suffit. Sans téléphone, c'est la webcam du PC, sauf si le choix mémorisé est le téléphone. */
  async function activerAuto() {
    if (telephoneConnecte()) return activer({ source: 'telephone-https' });
    return activer({ source: prefs.source === 'rejeu' ? 'locale' : prefs.source });
  }
  async function activer({ source = prefs.source, memoriser = true } = {}) {
    if (E.actif && E.source === source && source === 'telephone-https') { E.erreur = ''; prevenir('maj', E); return true; }   // déjà branché : surtout ne pas refermer la session du téléphone
    if (E.actif) await desactiver(); E.erreur = ''; E.source = source; E.actif = true; creerMoteur(); prevenir('maj', E);
    if (!window.Telecommande || !window.Telecommande.appliquer) { E.actif = false; E.erreur = 'Les gestes pilotent la page par la télécommande interne, disponible dans l’application PC (127.0.0.1) : ici ils sont indisponibles.'; prevenir('maj', E); return false; }
    try {
      if (source === 'locale') await demarrerWebcam(); else if (source === 'telephone') connecterPont(); else if (source === 'telephone-https') await connecterRelais();
    } catch (e) {
      arreterFlux();
      if (source === 'locale' && telephoneConnecte() && e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError' || e.name === 'NotSupportedError')) { E.actif = false; return activer({ source: 'telephone-https', memoriser }); }   // pas de webcam mais un téléphone connecté : on prend le téléphone
      E.actif = false; E.camera = false; E.erreur = messageErreur(e); prevenir('maj', E); return false;
    }
    if (memoriser) { prefs.source = source; ecrire(prefs); }
    prevenir('maj', E); return true;
  }
  function arreterFlux() { cancelAnimationFrame(boucle); if (flux) flux.getTracks().forEach(t => t.stop()); flux = null; video = null; E.camera = false; }
  async function desactiver() {
    const etaitRelais = E.source === 'telephone-https';
    E.actif = false; voulu = false; arreterFlux(); try { ws && ws.close(); } catch (e) { /* déjà fermée */ } ws = null;
    if (moteur) { const s = moteur.traiter({ t: Date.now(), mains: [] }); for (const m of s.msgs) window.Telecommande && window.Telecommande.appliquer(m); moteur.reinitialiser(); if (window.Telecommande) window.Telecommande.appliquer({ a: 'lacher' }); }
    if (etaitRelais && window.CameraRelais) await window.CameraRelais.arreter(false);
    E.mains = 0; E.derniere = ''; prevenir('maj', E);
  }
  /* « Gestes désactivés » rapide : la caméra continue (pour la reprise par deux poings) mais plus aucune action n'est envoyée. */
  function mettreEnPause(oui) { if (moteur) moteur.pause(oui); E.pause = !!oui; if (oui && window.Telecommande) window.Telecommande.appliquer({ a: 'lacher' }); prevenir('maj', E); }

  // ── rejeu (tests, démonstration sans caméra) ──
  async function rejouer(frames, { vitesse = 1, instantane = false } = {}) {
    if (!E.actif || E.source !== 'rejeu') { await activer({ source: 'rejeu', memoriser: false }); }
    E.rejeu = true; const t0 = frames.length ? frames[0].t : 0, debut = performance.now(), base = (E.dernierT || 0) + 400; let n = 0;   // les horloges des suites repartent de 0 : on les prolonge, le moteur exige un temps qui avance
    for (const f of frames) { if (!E.actif) break; if (!instantane) { const attente = (f.t - t0) / vitesse - (performance.now() - debut); if (attente > 1) await new Promise(r => setTimeout(r, attente)); } injecter({ ...f, t: base + (f.t - t0) / vitesse }); n++; if (instantane && n % 20 === 0) await new Promise(r => setTimeout(r, 0)); }
    E.rejeu = false; return n;
  }

  // ── enregistrement de points RÉELS (fichier local) : pour rejouer plus tard et tester sans caméra ──
  function enregistrer(secondes = 5) {
    if (!E.actif) return Promise.reject(new Error('Active d’abord les gestes.'));
    return new Promise(res => { E.enregistrement = { frames: [], debut: Date.now() }; prevenir('maj', E); setTimeout(() => { const e = E.enregistrement; E.enregistrement = null; prevenir('maj', E); res({ origine: 'caméra réelle (' + E.source + ')', ips: 30, ratio: 4 / 3, enregistre: new Date().toISOString(), frames: e.frames }); }, secondes * 1000); });
  }
  function telecharger(objet, nom = 'gestes-enregistres.json') { const a = document.createElement('a'), u = URL.createObjectURL(new Blob([JSON.stringify(objet)], { type: 'application/json' })); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

  // ── aperçu (points dessinés sur l'image de la webcam, localement) ──
  const LIAISONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  function brancherApercu(canvas) { apercuCtx = canvas ? canvas.getContext('2d') : null; }
  function dessinerApercu(mains) {
    if (!apercuCtx || !video) return; const c = apercuCtx, w = c.canvas.width, h = c.canvas.height; c.save(); c.clearRect(0, 0, w, h);
    if (prefs.miroir) { c.translate(w, 0); c.scale(-1, 1); } c.drawImage(video, 0, 0, w, h); c.restore(); c.strokeStyle = '#8fd0e3'; c.fillStyle = '#c9b27a'; c.lineWidth = 2;
    for (const m of mains) { const X = p => (prefs.miroir ? 1 - p[0] : p[0]) * w, Y = p => p[1] * h; c.beginPath(); for (const [a, b] of LIAISONS) { c.moveTo(X(m.pts[a]), Y(m.pts[a])); c.lineTo(X(m.pts[b]), Y(m.pts[b])); } c.stroke(); for (const p of m.pts) c.fillRect(X(p) - 2, Y(p) - 2, 4, 4); }
  }

  // ── réglages et calibration ──
  function regler(patch) { prefs = Object.assign(prefs, patch); ecrire(prefs); if (moteur) moteur.regler({ seuilFerme: prefs.seuilFerme, seuilOuvre: prefs.seuilOuvre, zoneUtile: prefs.zoneUtile, miroir: prefs.miroir, droitier: prefs.droitier }); prevenir('maj', E); return reglages(); }
  /* Calibration guidée : trois mesures prises sur la personne (main ouverte, main pincée, balayage de l'écran avec le doigt). `etape(n, texte)` affiche la consigne ; chaque étape dure `secondes`. */
  async function calibrer({ secondes = 4, etape = () => {}, attente = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    if (!E.actif) throw new Error('Active d’abord les gestes.');
    const ouvert = [], ferme = [], pointes = []; let mode = null;
    calib = frame => {
      if (!frame.mains.length) return; const m = frame.mains[0], ratio = frame.ratio || 4 / 3, pts = m.pts.map(p => [(prefs.miroir ? 1 - p[0] : p[0]) * ratio, p[1], p[2] || 0]), r = C.pincement(pts);
      if (mode === 'ouvert') ouvert.push(r); else if (mode === 'ferme') ferme.push(r); else if (mode === 'zone') pointes.push([pts[8][0] / ratio, pts[8][1]]);
    };
    try {
      mode = 'ouvert'; etape(1, 'Ouvre la main devant la caméra, pouce et index bien écartés.'); await attente(secondes * 1000);
      mode = 'ferme'; etape(2, 'Pince le pouce et l’index et garde-les serrés.'); await attente(secondes * 1000);
      mode = 'zone'; etape(3, 'Index tendu : balaie lentement toute la surface de l’écran (coins compris).'); await attente(secondes * 1500);
    } finally { calib = null; mode = null; }
    const seuils = C.calibrerSeuils({ ouvert, ferme }), zone = C.calibrerZone(pointes), r = { seuils, zone };
    if (seuils.ok) regler({ seuilFerme: seuils.seuilFerme, seuilOuvre: seuils.seuilOuvre }); if (zone.ok) regler({ zoneUtile: zone.zoneUtile });
    return r;
  }
  function reinitialiserReglages() { prefs = Object.assign(prefs, { seuilFerme: C.DEFAUTS.seuilFerme, seuilOuvre: C.DEFAUTS.seuilOuvre, zoneUtile: C.DEFAUTS.zoneUtile }); ecrire(prefs); if (moteur) moteur.regler({ seuilFerme: prefs.seuilFerme, seuilOuvre: prefs.seuilOuvre, zoneUtile: prefs.zoneUtile }); prevenir('maj', E); }

  // ── voix : « active les gestes », « désactive les gestes », « aide des gestes »… (rend le texte à dire, ou null) ──
  async function traiterVoix(texte) {
    const n = String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ');
    if (!/\bgestes?\b/.test(n)) return null;
    if (/\b(?:aide|vocabulaire|liste|explique)\b/.test(n)) { if (window.GestesUI) window.GestesUI.aide(); return 'Voici les gestes. Pointer avec l’index déplace le curseur. Pincer et relâcher clique, pincer et tenir saisit. Deux mains pincées qui s’écartent redimensionnent. Une main ouverte qui balaie fait défiler les piles. Un poing tenu range les fenêtres. Deux poings tenus mettent les gestes en pause.'; }
    if (/\b(?:calibr\w*|regle\w*)\b/.test(n)) { if (window.GestesUI) window.GestesUI.calibration(); return 'Je lance la calibration : suis les consignes à l’écran.'; }
    if (/\b(?:desactive|coupe|arrete|eteins|stop)\b/.test(n)) { await desactiver(); return 'Gestes désactivés.'; }
    if (/\b(?:pause)\b/.test(n)) { mettreEnPause(true); return 'Gestes en pause. Deux poings tenus les reprennent.'; }
    if (/\b(?:reprends|reprend|reprise)\b/.test(n)) { mettreEnPause(false); return 'Gestes repris.'; }
    if (/\btelephone\b/.test(n) && /\b(?:active|allume|lance|demarre)\b/.test(n)) { if (window.GestesUI) window.GestesUI.telephone(); return 'Je prépare la caméra du téléphone : scanne le QR code affiché.'; }
    if (/\b(?:active|allume|lance|demarre)\b/.test(n)) { const ok = await activerAuto(); return ok ? 'Gestes activés. Dis « aide des gestes » pour la liste.' : E.erreur; }
    return null;
  }

  return { activer, activerAuto, telephoneConnecte, desactiver, mettreEnPause, injecter, rejouer, enregistrer, telecharger, calibrer, regler, reglages, reinitialiserReglages, etat: () => ({ ...E }), surEvenement, brancherApercu, traiterVoix, api, rangerFenetres, moteur: () => moteur, messageErreur };
})();
window.Gestes = Gestes;
