/* ═════════════ DÉTECTION DE MAIN HORS DU FIL PRINCIPAL (V10) : Worker classique, partagé par le téléphone (page caméra) et le PC (mode « calcul sur le PC ») ═════════════
   Messages reçus  : { k:'init', mjs, wasm, modele, delegate:'GPU'|'CPU', mains, conf } · { k:'img', id, bmp (ImageBitmap transféré), ts } · { k:'fin' }
   Messages envoyés: { k:'pret', delegate } · { k:'erreur', msg } · { k:'res', id, landmarks, handedness, ms }
   MediaPipe est chargé par import() (autorisé dans un Worker classique) ; le chargeur WebAssembly de MediaPipe utilise importScripts, qui n'existe que dans un Worker classique : c'est pourquoi
   ce fichier n'est PAS un module. Une image n'est jamais traitée en retard : l'appelant n'envoie une image que quand la précédente est revenue. Aucune image ne sort de ce Worker : seuls des points reviennent. */
let lm = null, delegue = '';
self.onmessage = async e => {
  const m = e.data;
  if (m.k === 'init') {
    try {
      const vision = await import(m.mjs), fichiers = await vision.FilesetResolver.forVisionTasks(m.wasm);
      const creer = d => vision.HandLandmarker.createFromOptions(fichiers, { baseOptions: { modelAssetPath: m.modele, delegate: d }, runningMode: 'VIDEO', numHands: m.mains || 2, minHandDetectionConfidence: m.conf || 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      try { lm = await creer(m.delegate === 'CPU' ? 'CPU' : 'GPU'); delegue = m.delegate === 'CPU' ? 'CPU' : 'GPU'; } catch (err) { lm = await creer('CPU'); delegue = 'CPU'; }
      postMessage({ k: 'pret', delegate: delegue });
    } catch (err) { postMessage({ k: 'erreur', msg: String(err && err.message || err) }); }
  } else if (m.k === 'img') {
    const t0 = performance.now(); let r = null;
    try { r = lm ? lm.detectForVideo(m.bmp, m.ts) : null; } catch (err) { r = null; }
    try { m.bmp.close(); } catch (err) { /* déjà libérée */ }
    postMessage({ k: 'res', id: m.id, ms: performance.now() - t0, landmarks: r ? (r.landmarks || []).map(pts => pts.map(p => [p.x, p.y, p.z || 0])) : [], handedness: r ? (r.handedness || []).map(h => h && h[0] ? { n: h[0].categoryName, s: h[0].score } : null) : [] });
  } else if (m.k === 'opts') { try { if (lm && m.mains) lm.setOptions({ numHands: m.mains }); } catch (err) { /* réglage refusé */ } }
  else if (m.k === 'fin') { try { lm && lm.close(); } catch (err) { /* déjà fermé */ } lm = null; self.close(); }
};
