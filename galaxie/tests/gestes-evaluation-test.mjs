// Évaluation HORS LIGNE des gestes (V10, phase 6) : rappel par geste et faux déclenchements par minute, sur des sessions SIMULÉES (pas de vraie main : à confirmer par le « Test de fluidité »
// et le jeu « Cibles » de Justin). Variantes : cadence 60 / 30 / 15 images/s, bruit de détection faible / moyen / fort, 8 graines.
// Lancer : node galaxie/tests/gestes-evaluation-test.mjs   (option : EVAL=table pour afficher le tableau complet)
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
R('../../core/gestes/gestes-calcul.js'); const V = R('../../core/gestes/gestes-v5-calcul.js'), H = R('../../core/gestes/main-synthetique.js'); R('../../core/gestes/fluidite-calcul.js'); const SIM = R('../../core/gestes/fluidite-simulation.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const S = H.suites, OPT = { ecran: { l: 1920, h: 1080 }, gestesAvances: true, pauseMs: 1000 };   // mode avancé (V10) ; le mode simple : gestes-v11-test.mjs
const concat = (...p) => { const out = []; let base = 0; for (const f of p) { for (const x of f) out.push({ ...x, t: Math.round(base + x.t - f[0].t) }); base = out[out.length - 1].t + 1000 / 30; } return out; };
function jouer(frames, opt = {}) { const m = V.creerMoteur({ ...OPT, ...opt }), actions = [], ev = []; for (const f of frames) { const s = m.traiter(f); actions.push(...s.actions); ev.push(...s.evenements); } return { actions, ev, m }; }
const compter = (l, a) => l.filter(x => x.a === a).length, types = e => e.map(x => x.type);
const VARIANTES = []; for (const ips of [60, 30, 15]) for (const bruit of [0.0008, 0.0015, 0.0025]) for (let g = 1; g <= 8; g++) VARIANTES.push({ ips, bruit, graine: g });
const ENGAGER = o => S.immobile('ouverte', 1.0, o);
const GESTES = {
  clic: { construire: o => concat(ENGAGER(o), S.pointer(0.4, 0.4, 0.5, 0.45, 0.6, o), S.pincer(0.1, { ...o, cx: 0.5, cy: 0.7 }), S.immobile('pointer', 0.4, { ...o, cx: 0.5, cy: 0.5 + 0.16 * 1.9 })), reussi: r => compter(r.actions, 'clic') === 1 && compter(r.actions, 'prise') === 0 },
  saisie: { construire: o => concat(ENGAGER(o), S.saisir(0.35, 0.2, 0.05, 0.8, o)), reussi: r => compter(r.actions, 'prise') === 1 && compter(r.actions, 'lache') === 1 && compter(r.actions, 'deplace') > 5 },
  balayage: { construire: o => concat(ENGAGER(o), S.balayage(0.2, 0.8, 0.35, o)), reussi: r => types(r.ev).includes('balayage') },
  pause: { construire: o => concat(ENGAGER(o), S.immobile('poing', 1.4, o)), reussi: r => types(r.ev).includes('pause') }
};
/* Mouvements NORMAUX sans aucun geste : pointer qui se promène, main ouverte qui flotte, repos. Tout geste déclenché ici est un FAUX déclenchement. */
function distracteurs(secondes, o, graine) {
  const r = H.alea(graine * 977), parts = [ENGAGER(o)]; let x = 0.5, y = 0.5, t = 0;
  while (t < secondes) { const x1 = 0.3 + r() * 0.4, y1 = 0.35 + r() * 0.3, d = 0.6 + r() * 1.2; parts.push(S.pointer(x, y, x1, y1, d, o)); t += d; x = x1; y = y1; if (r() < 0.4) { const p = 0.5 + r() * 1.5; parts.push(S.immobile('pointer', p, { ...o, cx: x, cy: y + 0.16 * 1.9 })); t += p; } }
  return concat(...parts);
}
const adapter = (frames, ips) => ips === 60 ? SIM.reechantillonner(frames, 60) : ips === 30 ? frames : frames.filter((_, i) => i % 2 === 0);
const tab = [];
for (const [nom, def] of Object.entries(GESTES)) {
  const parIps = {};
  for (const va of VARIANTES) { const o = { bruit: va.bruit, alea: H.alea(va.graine) }; const r = jouer(adapter(def.construire(o), va.ips)); const k = va.ips + '/' + va.bruit; (parIps[k] = parIps[k] || { n: 0, ok: 0 }).n++; if (def.reussi(r)) parIps[k].ok++; }
  for (const [k, b] of Object.entries(parIps)) tab.push([nom, k, b.ok / b.n]);
}
if (process.env.EVAL === 'table') for (const l of tab) console.log(l[0].padEnd(9), l[1].padEnd(12), (l[2] * 100).toFixed(0) + ' %');
for (const nom of Object.keys(GESTES)) {
  const bons = tab.filter(l => l[0] === nom && !l[1].startsWith('15/') && l[1].split('/')[1] !== '0.0025'), tous = tab.filter(l => l[0] === nom && !l[1].startsWith('15/'));
  const pire = Math.min(...bons.map(l => l[2])), moy = tous.reduce((a, l) => a + l[2], 0) / tous.length;
  v('rappel « ' + nom + ' » ≥ 95 % à 30–60 images/s avec un bruit faible ou moyen (pire cas ' + Math.round(pire * 100) + ' %)', pire >= 0.95, JSON.stringify(bons.filter(l => l[2] < 0.95)));
  v('rappel « ' + nom + ' » ≥ 85 % en moyenne même avec un bruit fort', moy >= 0.85, moy.toFixed(2));
  const l15 = tab.filter(l => l[0] === nom && l[1].startsWith('15/')), m15 = l15.reduce((a, l) => a + l[2], 0) / l15.length;
  v('rappel « ' + nom + ' » à 15 images/s (caméra très lente) ≥ 70 %', m15 >= 0.7, m15.toFixed(2));
}
// faux déclenchements : 5 minutes de mouvements normaux par cadence × bruit
let tot = { min: 0, faux: 0 }, parCas = [];
for (const ips of [60, 30, 15]) for (const bruit of [0.0008, 0.0015, 0.0025]) {
  let faux = 0, minutes = 0;
  for (let g = 1; g <= 3; g++) { const o = { bruit, alea: H.alea(g) }, f = adapter(distracteurs(100, o, g), ips), dur = (f[f.length - 1].t - f[0].t) / 60000; const r = jouer(f);
    faux += ['clic', 'prise', 'ranger', 'fermer', 'accueil', 'vue_initiale'].reduce((a, k) => a + compter(r.actions, k), 0) + compter(r.actions, 'defile'); minutes += dur; }
  parCas.push([ips + ' ips, bruit ' + bruit, +(faux / minutes).toFixed(2), +minutes.toFixed(1)]); tot.min += minutes; tot.faux += faux;
}
if (process.env.EVAL === 'table') for (const l of parCas) console.log('faux/min', l.join(' · '));
v('faux déclenchements : moins de 1 par minute sur ' + tot.min.toFixed(0) + ' minutes de mouvements normaux (' + tot.faux + ' en tout)', tot.faux / tot.min < 1, (tot.faux / tot.min).toFixed(2));
v('faux déclenchements : aucun cas isolé au-dessus de 2 par minute', parCas.every(l => l[1] < 2), JSON.stringify(parCas.filter(l => l[1] >= 2)));
// ── détections aberrantes (images isolées) : ni faux clic, ni saisie lâchée ──
const faussePince = (frames, p, graine) => { const r = H.alea(graine); return frames.map(f => (r() < p ? { ...f, mains: [H.creerMain({ pose: 'pince', pince: 1, cx: 0.5, cy: 0.7 })] } : f)); };
const ouvreGlitch = (frames, p, graine) => { const r = H.alea(graine); return frames.map(f => (r() < p && f.mains.length ? { ...f, mains: [H.creerMain({ pose: 'pince', pince: 0, cx: 0.5, cy: 0.7 })] } : f)); };
for (const ips of [60, 30]) {
  let faux = 0, minutes = 0, lachers = 0, essais = 0, clicsPerdus = 0;
  for (let g = 1; g <= 4; g++) {
    const o = { bruit: 0.0015, alea: H.alea(g) }; let f = distracteurs(60, o, g); if (ips === 60) f = SIM.reechantillonner(f, 60);
    minutes += (f[f.length - 1].t - f[0].t) / 60000; const r = jouer(faussePince(f, 0.01, g)); faux += compter(r.actions, 'clic') + compter(r.actions, 'prise');
  }
  for (let g = 1; g <= 6; g++) { let f = concat(S.immobile('ouverte', 1, {}), S.saisir(0.5, 0.2, 0.05, 1.5, { bruit: 0.0012, alea: H.alea(g) })); if (ips === 60) f = SIM.reechantillonner(f, 60); const r = jouer(ouvreGlitch(f, 0.02, g)); lachers += compter(r.actions, 'lache'); essais++; }
  for (let g = 1; g <= 6; g++) { let f = GESTES.clic.construire({ bruit: 0.0012, alea: H.alea(g) }); if (ips === 60) f = SIM.reechantillonner(f, 60); const r = jouer(ouvreGlitch(f, 0.02, g)); if (compter(r.actions, 'clic') < 1) clicsPerdus++; }
  v('image « pincée » isolée (1 % des images, ' + ips + ' images/s) : moins de 1 faux clic par minute', faux / minutes < 1, (faux / minutes).toFixed(2));
  v('2 % d’images « ouvertes » aberrantes pendant une saisie (' + ips + ' images/s) : la saisie n’est lâchée qu’une fois, à la fin', lachers === essais, lachers + ' lâchers sur ' + essais + ' saisies');
  v('2 % d’images aberrantes autour d’un clic (' + ips + ' images/s) : le clic part quand même (au plus 1 perdu sur 6)', clicsPerdus <= 1, clicsPerdus);
}
// pincement qui tremble autour du seuil : pas de rafale de clics
{ const al = H.alea(4); const tenir = (fn, d) => Array.from({ length: Math.round(d * 30) }, (_, i) => ({ t: Math.round(i * 1000 / 30), ratio: 4 / 3, mains: [H.creerMain({ pose: 'pince', pince: fn(i), cx: 0.5, cy: 0.7 })] }));
  const r = jouer(concat(S.immobile('ouverte', 1.0), tenir(() => 0, 0.4), tenir(() => 0.62 + (al() - 0.5) * 0.12, 4), tenir(() => 0, 0.6)));
  v('pincement qui tremble exactement au seuil pendant 4 s : au plus 2 clics ou prises (jamais une rafale)', compter(r.actions, 'clic') + compter(r.actions, 'prise') <= 2, compter(r.actions, 'clic') + ' clics, ' + compter(r.actions, 'prise') + ' prises'); }
console.log('Évaluation hors ligne des gestes : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
