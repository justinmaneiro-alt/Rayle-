// Sons synthétisés (Web Audio, aucun fichier) : coups de canon, impacts, éclaboussures, craquements de bois, naufrage, mer et vent, cris de l'équipage pendant le combat.
// Le volume baisse avec la distance à la caméra. L'audio ne démarre qu'après un geste de l'utilisateur (règle des navigateurs) ; bouton muet dans l'Univers via son.muet(true).
export function creerSon(THREE, camera) {
  let ctx = null, maitre = null, muet = false, ambiance = null; const pos = new THREE.Vector3();
  function init() {
    if (ctx) return ctx; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); maitre = ctx.createGain(); maitre.gain.value = muet ? 0 : .5; maitre.connect(ctx.destination); } catch (e) { ctx = null; } return ctx;
  }
  const bruit = (dur, filtre = 'lowpass', f0 = 800, f1 = 200, vol = 1) => { if (!ctx) return; const n = ctx.sampleRate * dur | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = filtre; f.frequency.setValueAtTime(f0, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), ctx.currentTime + dur); const g = ctx.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(maitre); s.start(); return g; };
  const ton = (type, f0, f1, dur, vol) => { if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur); o.connect(g); g.connect(maitre); o.start(); o.stop(ctx.currentTime + dur + .05); };
  const dist = p => { camera.getWorldPosition(pos); return Math.max(0, 1 - pos.distanceTo(p) / 700); };
  return {
    activer() { const c = init(); if (c && c.state === 'suspended') c.resume(); this.ambiance(); return !!c; },
    muet(oui) { muet = !!oui; if (maitre) maitre.gain.value = muet ? 0 : .5; },
    estMuet: () => muet,
    canon(p) { if (!ctx) return; const k = dist(p); if (k < .02) return; bruit(1.4, 'lowpass', 900, 60, 1.2 * k); ton('sine', 90, 28, .5, .9 * k); },
    impact(p) { if (!ctx) return; const k = dist(p); if (k < .02) return; bruit(.5, 'bandpass', 1800, 300, .8 * k); ton('square', 140, 50, .18, .25 * k); },
    eclabousse(p) { if (!ctx) return; const k = dist(p); if (k < .05) return; bruit(.6, 'highpass', 3000, 800, .3 * k); },
    craque() { if (!ctx) return; for (let i = 0; i < 3; i++) setTimeout(() => ton('sawtooth', 180 + Math.random() * 120, 60, .35, .35), i * 160); bruit(1.2, 'lowpass', 600, 80, .9); },
    coule() { if (!ctx) return; bruit(3.5, 'lowpass', 500, 40, .8); ton('sine', 60, 25, 2.5, .5); },
    cri() { if (!ctx) return; const f = 380 + Math.random() * 260; ton('sawtooth', f, f * .8, .5, .12); ton('triangle', f * 2.1, f * 1.6, .45, .06); },
    ambiance() { if (!ctx || ambiance) return; const n = ctx.sampleRate * 4 | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; l = (l + .02 * x) / 1.02; d[i] = l * 3.5; } const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = ctx.createGain(); g.gain.value = .22; s.connect(f); f.connect(g); g.connect(maitre); s.start(); ambiance = { g, f }; },
    reglerAmbiance(vent01) { if (ambiance) { ambiance.g.gain.value = .12 + vent01 * .5; ambiance.f.frequency.value = 300 + vent01 * 1500; } },
    arreter() { try { ctx && ctx.close(); } catch (e) { /* déjà fermé */ } ctx = null; ambiance = null; },
  };
}
