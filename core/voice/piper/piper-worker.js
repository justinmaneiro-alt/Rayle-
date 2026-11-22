/* Rayle v9 — Piper TTS dans un Web Worker (le thread de l'interface reste libre).
   Chaîne : texte → phonèmes (piper_phonemize, espeak-ng en WebAssembly) → identifiants → réseau ONNX Piper (onnxruntime-web) → audio WAV.
   Les fichiers du moteur et les modèles de voix sont donnés par la page (blobs gardés dans le Cache Storage) : le tout marche hors ligne après le premier chargement.
   Licences : onnxruntime-web (MIT), piper-phonemize (MIT), espeak-ng (GPL-3.0), voix Piper (voir NOTICE.md). */
'use strict';
let ortLib = null, phonemize = null, wasmPhonemize = null, donneesPhonemize = null, pret = false;
const voix = {};   // id → { session, config }

function wav(pcm, hz) {
  const n = pcm.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, hz, true); v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return b;
}

async function initialiser(m) {
  importScripts(m.urls.ort, m.urls.phonemize);       // définit self.ort et self.createPiperPhonemize
  ortLib = self.ort; phonemize = self.createPiperPhonemize;
  ortLib.env.wasm.numThreads = 1; ortLib.env.wasm.simd = true; ortLib.env.wasm.proxy = false;
  ortLib.env.wasm.wasmPaths = { 'ort-wasm-simd.wasm': m.urls.ortWasm, 'ort-wasm.wasm': m.urls.ortWasm, 'ort-wasm-simd-threaded.wasm': m.urls.ortWasm, 'ort-wasm-threaded.wasm': m.urls.ortWasm };
  wasmPhonemize = await WebAssembly.compile(m.wasmPhonemize);   // compilé une seule fois, réutilisé à chaque phrase
  donneesPhonemize = m.donneesPhonemize;
  pret = true;
}

async function chargerVoix(m) {
  if (voix[m.voix]) return;
  const session = await ortLib.InferenceSession.create(m.modele, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  voix[m.voix] = { session, config: m.config };
}

/* texte → identifiants de phonèmes ; une instance de l'analyseur par appel (il se termine après chaque lecture), sans retélécharger ni recompiler */
function phonemes(texte, langue) {
  return new Promise((resolve, reject) => {
    let fait = false;
    phonemize({
      print: data => { if (fait) return; fait = true; try { resolve(JSON.parse(data).phoneme_ids); } catch (e) { reject(e); } },
      printErr: () => { /* messages d'espeak : ignorés */ },
      instantiateWasm: (imports, rappel) => { WebAssembly.instantiate(wasmPhonemize, imports).then(inst => rappel(inst, wasmPhonemize)).catch(reject); return {}; },
      getPreloadedPackage: () => donneesPhonemize.slice(0)
    }).then(mod => { try { mod.callMain(['-l', langue, '--input', JSON.stringify([{ text: texte.trim() }]), '--espeak_data', '/espeak-ng-data']); } catch (e) { if (!fait) reject(e); } }).catch(reject);
  });
}

async function dire(m) {
  const v = voix[m.voix]; if (!v) throw new Error('voix non chargée : ' + m.voix);
  const t0 = Date.now(), c = v.config, ids = await phonemes(m.texte, c.espeak.voice); const tPh = Date.now() - t0;
  if (!ids || !ids.length) throw new Error('aucun phonème pour ce texte');
  const echelle = Math.max(0.5, Math.min(2, Number(m.vitesse) || 1));          // vitesse : 2 = deux fois plus vite → length_scale divisé
  const feeds = {
    input: new ortLib.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ortLib.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ortLib.Tensor('float32', Float32Array.from([c.inference.noise_scale, c.inference.length_scale / echelle, c.inference.noise_w]), [3])
  };
  if (c.num_speakers > 1) feeds.sid = new ortLib.Tensor('int64', BigInt64Array.from([BigInt(m.locuteur || 0)]), [1]);
  const t1 = Date.now(), sortie = await v.session.run(feeds), pcm = sortie.output.data;
  self.__chrono = { phonemes: tPh, inference: Date.now() - t1, nPhonemes: ids.length, echantillons: pcm.length };
  return wav(pcm, c.audio.sample_rate);
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') { await initialiser(m); self.postMessage({ type: 'ok', id: m.id }); }
    else if (m.type === 'voix') { await chargerVoix(m); self.postMessage({ type: 'ok', id: m.id }); }
    else if (m.type === 'dire') { const b = await dire(m); self.postMessage({ type: 'wav', id: m.id, buffer: b, chrono: self.__chrono }, [b]); }
  } catch (err) { self.postMessage({ type: 'erreur', id: m.id, message: String((err && err.message) || err) }); }
};
