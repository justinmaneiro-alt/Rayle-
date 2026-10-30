"use strict";
/* ═════════════ GESTES V10 : mode « calcul sur le PC » (performance maximale) ═════════════
   Le téléphone envoie la vidéo basse résolution EN DIRECT vers ce PC (WebRTC pair-à-pair : aucun serveur, jamais enregistrée) et c'est CE PC qui détecte les mains (MediaPipe dans un Worker,
   carte graphique du PC) : souvent 60 images/s là où un téléphone en fait 15 à 30. DÉSACTIVÉ PAR DÉFAUT (réglage « Calcul sur le PC », rayle_gestes → calculPc) ; le téléphone doit en plus
   ACCEPTER sur son écran. Seul ce PC voit l'image : elle sert à une vidéo cachée, jamais dessinée, jamais stockée ni envoyée ailleurs. La suite de la chaîne (lissage, gestes, actions) est identique
   au mode « points seulement » : les trames produites ont le même format que celles du téléphone. */
const DetectionPc = (() => {
  const E = { actif: false, mode: '', delegate: '', erreur: '', fps: 0, ms: 0, recues: 0, lat: null, detectees: 0 };
  let det = null, video = null, rvfc = 0, flux = null, surTrame = null, n = 0, derniereMain = 0, chrono = 0, minuteur = 0, fenetre = { n: 0, ms: [] }, occupe = false;
  const mediane = l => { const s = l.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : 0; };

  async function demarrer(piste, { base, mains = 2, rtt = () => null, injecter } = {}) {
    arreter(); surTrame = injecter; E.erreur = ''; flux = piste;
    try {
      const mod = await import(new URL('camera/detection.js', document.baseURI).href);
      det = await mod.creerDetecteur({ mjs: base + 'vision_bundle.mjs', wasm: base + 'wasm', modele: base + 'hand_landmarker.task', delegate: 'GPU', mains, urlWorker: new URL('camera/detection-worker.js', document.baseURI).href });
    } catch (e) { E.erreur = 'Le modèle de détection n’a pas pu démarrer sur le PC : ' + (e && e.message || e) + ' (node app-pc/installer-gestes.mjs ?)'; return false; }
    E.mode = det.mode; E.delegate = det.delegate; E.actif = true; if (det.avertissement) E.erreur = det.avertissement;
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = flux; video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video); try { await video.play(); } catch (e) { /* la lecture démarre dès la première image */ }
    chrono = performance.now(); n = 0; fenetre = { n: 0, ms: [] }; minuteur = setInterval(seconde, 1000);
    const suite = () => { if (!E.actif || !video) return; rvfc = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(image) : requestAnimationFrame(() => image(performance.now(), null)); };
    async function image(now, meta) {
      if (!E.actif) return; suite(); E.recues++;
      if (video.readyState < 2 || occupe) return;
      occupe = true; const t0 = performance.now();
      try {
        const r = await det.detecter(video, t0 + 0.001 * (++n));
        if (!r) return; const fin = performance.now(); fenetre.n++; fenetre.ms.push(r.total != null ? r.total : fin - t0);
        // âge de l'image : heure de capture annoncée par WebRTC si elle existe, sinon moitié de l'aller-retour + ~25 ms d'encodage/décodage (ESTIMATION, marquée comme telle)
        const age = meta && Number.isFinite(meta.captureTime) ? Math.max(0, Math.min(400, t0 - meta.captureTime)) : ((rtt() || 4) / 2 + 25), lat = age + (fin - t0);
        const mains = r.mains; E.lat = lat;
        if (mains.length) { derniereMain = t0; injecter({ a: 'mains', t: fin, ratio: video.videoWidth / (video.videoHeight || 1), mains, seq: n & 0xFFFF, dt: Math.min(255, Math.round(lat)), conf: r.conf, lat, pc: true }); E.detectees++; }
        else if (fin - derniereMain > 500) { derniereMain = fin; injecter({ a: 'mains', t: fin, ratio: 4 / 3, mains: [], seq: n & 0xFFFF, conf: 1, pc: true }); }
      } finally { occupe = false; }
    }
    suite(); return true;
  }
  function seconde() {
    const dt = Math.max(0.5, (performance.now() - chrono) / 1000); chrono = performance.now();
    E.fps = +(fenetre.n / dt).toFixed(1); E.ms = +mediane(fenetre.ms).toFixed(1); fenetre = { n: 0, ms: [] };
  }
  function arreter() {
    E.actif = false; clearInterval(minuteur); try { video && video.cancelVideoFrameCallback && video.cancelVideoFrameCallback(rvfc); } catch (e) { /* déjà annulé */ }
    if (video) { try { video.pause(); } catch (e) { /* déjà arrêtée */ } video.srcObject = null; video.remove(); } video = null; flux = null;
    try { det && det.fermer(); } catch (e) { /* déjà fermé */ } det = null; occupe = false;
  }
  return { demarrer, arreter, etat: () => ({ ...E }) };
})();
window.DetectionPc = DetectionPc;
