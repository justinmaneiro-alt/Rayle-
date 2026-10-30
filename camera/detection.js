/* ═════════════ DÉTECTION DE MAIN (V10) : une seule interface, Worker (par défaut) ou fil principal (secours) ═════════════
   creerDetecteur({ mjs, wasm, modele, delegate, mains, urlWorker, worker }) → Promise<détecteur> avec
     · mode : 'worker' | 'principal'   · delegate : 'GPU' | 'CPU'   · avertissement : texte si le Worker n'a pas pu démarrer
     · detecter(source, ts) → Promise<{ mains:[{lat, pts:[[x,y,z]×21]}], conf, ms }> ou null si le détecteur est OCCUPÉ (l'image est simplement sautée : jamais de file d'attente, toujours la dernière image)
     · fermer()
   Le Worker reçoit une ImageBitmap (copie GPU de la vidéo, réduite à la taille voulue) : le fil principal reste libre pour la caméra, le réseau et l'affichage. Si le Worker ne démarre pas
   (navigateur sans OffscreenCanvas / import() dans un Worker, délai dépassé), on retombe sur le fil principal avec un message clair : rien ne casse. */
const DELAI_INIT_MS = 25000;

function versMains(landmarks, handedness) {
  const mains = landmarks.map((pts, i) => ({ lat: handedness[i] && handedness[i].n === 'Right' ? 'Right' : 'Left', pts: pts.map(p => [+p[0].toFixed(4), +p[1].toFixed(4), +(p[2] || 0).toFixed(4)]) }));
  const conf = handedness.reduce((m, h) => Math.max(m, h && Number.isFinite(h.s) ? h.s : 0), 0) || (mains.length ? 0.5 : 1);
  return { mains, conf };
}

async function creerSurFilPrincipal(o) {
  const vision = await import(o.mjs), fichiers = await vision.FilesetResolver.forVisionTasks(o.wasm);
  const creer = d => vision.HandLandmarker.createFromOptions(fichiers, { baseOptions: { modelAssetPath: o.modele, delegate: d }, runningMode: 'VIDEO', numHands: o.mains || 2, minHandDetectionConfidence: o.conf || 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  let lm, delegate = o.delegate === 'CPU' ? 'CPU' : 'GPU'; try { lm = await creer(delegate); } catch (e) { delegate = 'CPU'; lm = await creer('CPU'); }
  return {
    mode: 'principal', delegate, avertissement: o.avertissement || '',
    async detecter(source, ts) {
      const t0 = performance.now(); let r; try { r = lm.detectForVideo(source, ts); } catch (e) { return null; }
      const { mains, conf } = versMains((r.landmarks || []).map(pts => pts.map(p => [p.x, p.y, p.z || 0])), (r.handedness || []).map(h => h && h[0] ? { n: h[0].categoryName, s: h[0].score } : null));
      return { mains, conf, ms: performance.now() - t0 };
    },
    regler(p) { if (p.mains) { try { lm.setOptions({ numHands: p.mains }); } catch (e) { /* réglage refusé : il s'appliquera au prochain démarrage */ } } },
    fermer() { try { lm.close(); } catch (e) { /* déjà fermé */ } }
  };
}

function creerSurWorker(o) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') return reject(new Error('Worker ou ImageBitmap indisponible'));
    let w; try { w = new Worker(o.urlWorker); } catch (e) { return reject(e); }
    let occupe = false, id = 0, attente = null, fini = false;
    const minuteur = setTimeout(() => { if (!fini) { fini = true; try { w.terminate(); } catch (e) { /* déjà arrêté */ } reject(new Error('le Worker n’a pas démarré en ' + DELAI_INIT_MS / 1000 + ' s')); } }, DELAI_INIT_MS);
    w.onerror = ev => { if (!fini) { fini = true; clearTimeout(minuteur); reject(new Error(ev && ev.message || 'erreur du Worker')); } };
    w.onmessage = ev => {
      const m = ev.data;
      if (m.k === 'pret' && !fini) {
        fini = true; clearTimeout(minuteur);
        resolve({
          mode: 'worker', delegate: m.delegate, avertissement: '',
          async detecter(source, ts) {
            if (occupe) return null;   // la précédente n'est pas revenue : cette image est sautée
            occupe = true; let bmp;
            try { bmp = await createImageBitmap(source, o.taille ? { resizeWidth: o.taille.l, resizeHeight: o.taille.h, resizeQuality: 'low' } : undefined); } catch (e) { occupe = false; return null; }
            const mon = ++id, t0 = performance.now();
            return new Promise(res => { attente = { id: mon, res, t0 }; w.postMessage({ k: 'img', id: mon, bmp, ts }, [bmp]); });
          },
          regler(p) { if (p.taille) o.taille = p.taille; if (p.mains) { try { w.postMessage({ k: 'opts', mains: p.mains }); } catch (e) { /* Worker fermé */ } } },
          fermer() { try { w.postMessage({ k: 'fin' }); } catch (e) { /* déjà fermé */ } setTimeout(() => { try { w.terminate(); } catch (e) { /* déjà arrêté */ } }, 300); }
        });
      } else if (m.k === 'erreur' && !fini) { fini = true; clearTimeout(minuteur); try { w.terminate(); } catch (e) { /* déjà arrêté */ } reject(new Error(m.msg)); }
      else if (m.k === 'res' && attente && attente.id === m.id) {
        const a = attente; attente = null; occupe = false; const { mains, conf } = versMains(m.landmarks, m.handedness);
        a.res({ mains, conf, ms: m.ms, total: performance.now() - a.t0 });
      }
    };
    w.postMessage({ k: 'init', mjs: o.mjs, wasm: o.wasm, modele: o.modele, delegate: o.delegate, mains: o.mains, conf: o.conf });
  });
}

export async function creerDetecteur(o) {
  if (o.worker !== false) {
    try { return await creerSurWorker(o); }
    catch (e) { const surFil = await creerSurFilPrincipal({ ...o, avertissement: 'Détection hors du fil principal impossible (' + (e && e.message || e) + ') : elle tourne sur le fil principal.' }); return surFil; }
  }
  return creerSurFilPrincipal(o);
}
