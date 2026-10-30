// Banc AVANT / APRÈS de la V10 sur des traces SIMULÉES (pas de vraie main : les valeurs réelles viennent du « Test de fluidité » de Justin). Écrit le tableau de docs/GESTES.md.
// « Avant » = le moteur et l'affichage de la V9 (zone morte 0, relâchement à la 1re image, clic dès 25 ms, aucun rejet d'image aberrante, anneau posé à chaque mesure).
// « Après » = la V10 (zone morte 6 px, relâchement à 2 images, clic ≥ 60 ms, rejet des images aberrantes, anneau interpolé et prédit à la cadence de l'écran).
// Lancer : node galaxie/tests/fluidite-banc.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
R('../../core/gestes/gestes-calcul.js'); R('../../core/gestes/gestes-v5-calcul.js'); const H = R('../../core/gestes/main-synthetique.js');
const F = R('../../core/gestes/fluidite-calcul.js'), SIM = R('../../core/gestes/fluidite-simulation.js');
const AVANT = { zoneMorte: 0, relacheImages: 1, clicMin: 25, rejetAberrant: false }, APRES = {};
const conditions = [['60 images/s, bruit moyen', { ips: 60 }, {}], ['30 images/s', { ips: 30 }, {}], ['15 images/s', { ips: 15 }, { ips: 15 }], ['gigue 40 ms', { ips: 60 }, { gigue: 40 }], ['10 % de pertes', { ips: 60 }, { perte: 0.1 }]];
const lignes = [];
for (const [nom, simOpt, deg] of conditions) {
  const s = SIM.session({ ips: simOpt.ips > 30 ? 60 : 30, bruit: 0.0015, graine: 5 }), tr = SIM.trace(s, { degradation: deg });
  const a = F.calculer(F.rejouer(tr, AVANT)), b = F.calculer(F.rejouer(tr, APRES));
  // fluidité de l'anneau : écart moyen entre la position AFFICHÉE (écran 120 Hz) et la position réelle du doigt au même instant (au meilleur délai de la trace), en mouvement seulement
  const ecart = (opt, naif) => {
    const r = F.rejouer(tr, opt), fr = r.frames.filter(f => f.cur && f.ref && f.pose === 'pointer'), e = fr.map(f => ({ ta: f.tp, t: f.tt != null ? f.tt : f.tp, x: f.cur[0], y: f.cur[1] }));
    const sim = F.simulerRendu(e, { hz: 120, naif }), lat = Math.min(...r.frames.filter(f => f.tt != null).map(f => f.tp - f.tt)), truth = fr.map(f => ({ t: f.tt != null ? f.tt : f.tp, x: f.ref[0], y: f.ref[1] }));
    const interp = tt => { let lo = 0, hi = truth.length - 1; if (tt <= truth[0].t) return truth[0]; if (tt >= truth[hi].t) return truth[hi]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (truth[m].t <= tt) lo = m; else hi = m; } const u = (tt - truth[lo].t) / Math.max(1e-6, truth[hi].t - truth[lo].t); return { x: truth[lo].x + (truth[hi].x - truth[lo].x) * u, y: truth[lo].y + (truth[hi].y - truth[lo].y) * u }; };
    const coupures = []; for (let i = 1; i < truth.length; i++) if (Math.hypot(truth[i].x - truth[i - 1].x, truth[i].y - truth[i - 1].y) > 100) coupures.push(truth[i].t);   // les raccords de la trace simulée (la main ne se téléporte pas) ne comptent pas
    let s = 0, n = 0; for (let i = 1; i < sim.positions.length; i++) { const p = sim.positions[i], q = interp(p[0] - lat), q0 = interp(p[0] - lat - 50); if (Math.hypot(q.x - q0.x, q.y - q0.y) < 8) continue; if (coupures.some(c => p[0] - lat >= c - 60 && p[0] - lat <= c + 250)) continue; s += Math.hypot(p[1] - q.x, p[2] - q.y); n++; }
    return n ? s / n : null;
  };
  const sauts = (opt, naif) => ecart(opt, naif);
  lignes.push({ nom, avant: { trem: a.tremblementPx, retard: a.retardMs, clics: a.clics, saut: sauts(AVANT, true) }, apres: { trem: b.tremblementPx, retard: b.retardMs, clics: b.clics, saut: sauts(APRES, false) } });
}
const f = x => (x == null ? '—' : typeof x === 'number' ? +x.toFixed(1) : x);
console.log('| Condition (trace simulée de 21 s, 6 clics voulus) | Tremblement au repos (px) | Retard en mouvement (ms) | Clics reconnus | Écart de l’anneau au doigt en mouvement (px, écran 120 Hz) |');
console.log('|---|---|---|---|---|');
for (const l of lignes) console.log('| ' + l.nom + ' | ' + f(l.avant.trem) + ' → **' + f(l.apres.trem) + '** | ' + f(l.avant.retard) + ' → ' + f(l.apres.retard) + ' | ' + l.avant.clics + ' → ' + l.apres.clics + ' | ' + f(l.avant.saut) + ' → **' + f(l.apres.saut) + '** |');
// aberrations d'image
const faussePince = (frames, p, g) => { const r = H.alea(g); return frames.map(x => (r() < p ? { ...x, mains: [H.creerMain({ pose: 'pince', pince: 1, cx: 0.5, cy: 0.7 })] } : x)); };
const ouvre = (frames, p, g) => { const r = H.alea(g); return frames.map(x => (r() < p && x.mains.length ? { ...x, mains: [H.creerMain({ pose: 'pince', pince: 0, cx: 0.5, cy: 0.7 })] } : x)); };
const V = R('../../core/gestes/gestes-v5-calcul.js'), S = H.suites;
const concat = (...p) => { const out = []; let base = 0; for (const f2 of p) { for (const x of f2) out.push({ ...x, t: Math.round(base + x.t - f2[0].t) }); base = out[out.length - 1].t + 1000 / 30; } return out; };
const compter = (l, a) => l.filter(x => x.a === a).length;
const jouer = (frames, opt) => { const m = V.creerMoteur({ ecran: { l: 1920, h: 1080 }, ...opt }), ac = []; for (const x of frames) ac.push(...m.traiter(x).actions); return ac; };
for (const [ips, nom] of [[30, '30 images/s'], [60, '60 images/s']]) {
  const out = {}; for (const [lab, opt] of [['avant', AVANT], ['apres', APRES]]) {
    let faux = 0, minutes = 0, lachers = 0;
    for (let g = 1; g <= 4; g++) { const r = H.alea(g * 977), parts = [S.immobile('ouverte', 1, {})]; let x = 0.5, y = 0.5, t = 0; while (t < 60) { const x1 = 0.3 + r() * 0.4, y1 = 0.35 + r() * 0.3, d = 0.6 + r() * 1.2; parts.push(S.pointer(x, y, x1, y1, d, { bruit: 0.0015, alea: H.alea(g) })); t += d; x = x1; y = y1; } let f2 = concat(...parts); if (ips === 60) f2 = SIM.reechantillonner(f2, 60); minutes += (f2[f2.length - 1].t - f2[0].t) / 60000; const a = jouer(faussePince(f2, 0.01, g), opt); faux += compter(a, 'clic') + compter(a, 'prise'); }
    for (let g = 1; g <= 6; g++) { let f2 = concat(S.immobile('ouverte', 1, {}), S.saisir(0.5, 0.2, 0.05, 1.5, { bruit: 0.0012, alea: H.alea(g) })); if (ips === 60) f2 = SIM.reechantillonner(f2, 60); lachers += compter(jouer(ouvre(f2, 0.02, g), opt), 'lache'); }
    out[lab] = { faux: faux / minutes, lachers: lachers / 6 };
  }
  console.log('| Images aberrantes (1 % de « pincé » isolés, 2 % d’« ouvertes » pendant une saisie), ' + nom + ' | faux clics/min ' + f(out.avant.faux) + ' → **' + f(out.apres.faux) + '** | saisies lâchées à tort ' + f(out.avant.lachers - 1) + ' → **' + f(out.apres.lachers - 1) + '** par saisie | | |');
}
