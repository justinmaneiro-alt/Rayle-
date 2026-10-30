"use strict";
/* ═════════════ GESTES V10 : sessions SIMULÉES pour tester le banc de mesure SANS téléphone ni main ═════════════
   Ce ne sont PAS des enregistrements réels (voir main-synthetique.js) : une suite de gestes plausibles, avec leurs clics VOULUS étiquetés, sur laquelle on mesure le moteur et les corrections.
   La vraie mesure est celle du bouton « Test de fluidité (60 s) » avec la main de Justin ; ceci sert à vérifier que les mesures, l'analyse et les corrections fonctionnent et à comparer avant/après
   SUR LA MÊME trace. `session({ ips, bruit, graine })` → { frames:[{t,ratio,mains}], intentions:[ms], duree } ; `trace(...)` ajoute arrivée, délai et cadence du téléphone. */
(function (racine) {
  const H = racine.MainSynthetique || (typeof require === 'function' ? require('./main-synthetique.js') : null);
  const FC = () => racine.FluiditeCalcul || (typeof require === 'function' ? require('./fluidite-calcul.js') : null);
  const lerpMains = (a, b, u) => a.mains.length === b.mains.length ? a.mains.map((m, k) => ({ lat: m.lat, pts: m.pts.map((p, j) => [p[0] + (b.mains[k].pts[j][0] - p[0]) * u, p[1] + (b.mains[k].pts[j][1] - p[1]) * u, 0]) })) : a.mains;
  /* Ré-échantillonne une suite de 30 images/s à `ips` (interpolation linéaire des repères), comme le ferait une caméra plus rapide. */
  function reechantillonner(frames, ips) {
    if (!frames.length) return []; const pas = 1000 / ips, out = []; let k = 0;
    for (let t = frames[0].t; t <= frames[frames.length - 1].t; t += pas) {
      while (k < frames.length - 2 && frames[k + 1].t <= t) k++;
      const a = frames[k], b = frames[k + 1] || a, u = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
      out.push({ t: Math.round(t), ratio: a.ratio, mains: lerpMains(a, b, u) });
    }
    return out;
  }
  function session({ ips = 60, bruit = 0.0012, graine = 3, clics = 6 } = {}) {
    const rnd = H.alea(graine), o = { bruit, alea: rnd }, S = H.suites, scenes = [], intentions = []; let t = 0;
    const ajoute = (frames, intention) => { const dt0 = frames[0].t; for (const f of frames) scenes.push({ ...f, t: Math.round(t + (f.t - dt0)) }); if (intention != null) intentions.push(Math.round(t + intention)); t = scenes[scenes.length - 1].t + 1000 / 30; };
    ajoute(S.immobile('ouverte', 1.0, o));
    ajoute(S.pointer(0.3, 0.4, 0.7, 0.5, 1.2, o));
    ajoute(S.immobile('pointer', 2.5, { ...o, cx: 0.5, cy: 0.5 + 0.16 * 1.9 }));          // repos : mesure du tremblement
    for (let i = 0; i < clics; i++) {
      ajoute(S.pointer(0.35 + 0.05 * i, 0.4, 0.45 + 0.05 * i, 0.45, 0.6, o));
      const tenir = 0.1, avant = 6, f = S.pincer(tenir, { ...o, cx: 0.5, cy: 0.7 });
      ajoute(f, (avant + 4 + Math.round(tenir * 30) + 2) * 1000 / 30);                     // le clic part au relâchement
    }
    ajoute(S.pointer(0.7, 0.5, 0.3, 0.6, 1.5, o));
    ajoute(S.immobile('pointer', 1.5, { ...o, cx: 0.5, cy: 0.5 + 0.16 * 1.9 }));
    ajoute(S.saisir(0.35, 0.2, 0.05, 0.8, o));
    ajoute(S.balayage(0.2, 0.8, 0.35, o));
    ajoute(S.immobile('pointer', 1.5, { ...o, cx: 0.45, cy: 0.5 + 0.16 * 1.9 }));
    return { frames: reechantillonner(scenes, ips), intentions, duree: scenes[scenes.length - 1].t };
  }
  /* Transforme une session en TRACE d'entrée (arrivée sur le PC, délai, cadence) : prête pour FluiditeCalcul.rejouer / calculer.
     degradation : { ips, gigue, perte, retard } (voir FluiditeCalcul.degrader) ; telephone : { cam, det, detMs, res, bat, eco, calcul } (valeurs constantes ou fonction du temps). */
  function trace(s, { degradation = {}, telephone = {}, ecran = { l: 1920, h: 1080 }, moteurMs = 0.4, rendu = 120 } = {}) {
    const FCm = FC(), fr = FCm.degrader(s.frames, { retard: 18, gigue: 4, ...degradation });
    const t0 = fr.length ? fr[0].tp : 0, frames = fr.map(f => ({ t: f.t, tp: f.tp - t0 + 0, tt: f.t, seq: f.seq, dt: telephone.detMs != null ? telephone.detMs : 12, n: f.mains.length, oct: 16 + 84 * f.mains.length, conf: 0.9, lat: f.tp - f.t + (telephone.detMs != null ? telephone.detMs : 12), mot: moteurMs, aff: 1000 / rendu / 2, ratio: f.ratio, mains: f.mains }));
    const sec = Math.ceil(s.duree / 1000), tel = []; for (let i = 0; i < sec; i++) tel.push({ t: i, cam: telephone.cam != null ? telephone.cam : 58, det: typeof telephone.det === 'function' ? telephone.det(i) : (telephone.det != null ? telephone.det : 58), detMs: telephone.detMs != null ? telephone.detMs : 12, bat: telephone.bat != null ? telephone.bat : 0.8, charge: !!telephone.charge, eco: !!telephone.eco, res: telephone.res || 640, calcul: telephone.calcul || 'telephone' });
    const rendus = []; for (let i = 0; i < Math.round(s.duree / (1000 / rendu)); i++) rendus.push(1000 / rendu);
    return { version: 1, origine: 'simulation', ecran, duree: s.duree, frames, tel, rendu: rendus, actions: [], evenements: [], affiche: [] };
  }
  racine.FluiditeSimulation = { session, trace, reechantillonner };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.FluiditeSimulation;
})(typeof globalThis !== 'undefined' ? globalThis : window);
