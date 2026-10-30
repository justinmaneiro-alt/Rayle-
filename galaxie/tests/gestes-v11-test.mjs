// V11 : MODE SIMPLE des gestes (5 gestes, engagement en 0,4 s, jamais de pause par un geste) et faux déclenchements par minute, sur des sessions SIMULÉES
// (pas de vraie main : à confirmer par le « Test de fluidité » et le jeu « Cibles » de Justin avec son vrai téléphone).
// Lancer : node galaxie/tests/gestes-v11-test.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
R('../../core/gestes/gestes-calcul.js'); const V = R('../../core/gestes/gestes-v5-calcul.js'), H = R('../../core/gestes/main-synthetique.js'); R('../../core/gestes/fluidite-calcul.js'); const SIM = R('../../core/gestes/fluidite-simulation.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const S = H.suites, OPT = { ecran: { l: 1920, h: 1080 } };   // mode simple = réglage par défaut
const concat = (...p) => { const out = []; let base = 0; for (const f of p) { for (const x of f) out.push({ ...x, t: Math.round(base + x.t - f[0].t) }); base = out[out.length - 1].t + 1000 / 30; } return out; };
function jouer(frames, opt = {}, avant = null) { const m = V.creerMoteur({ ...OPT, ...opt }), actions = [], ev = []; if (avant) avant(m); for (const f of frames) { const s = m.traiter(f); actions.push(...s.actions); ev.push(...s.evenements); } return { actions, ev, m }; }
const compter = (l, a) => l.filter(x => x.a === a).length, types = e => e.map(x => x.type);
const ENG = (o = {}) => S.immobile('ouverte', 0.7, o);

// ── 0. réglages par défaut ──
const m0 = V.creerMoteur(OPT);
v('le mode simple est le réglage par défaut', V.DEFAUTS.gestesAvances === false && m0.etat().mode === 'sans-main' && m0.options.gestesAvances === false);
v('engagement rapide : 0,4 s', V.DEFAUTS.engagementRapideMs === 400);

// ── 1. engagement : une main visible et stable 0,4 s, quelle que soit sa pose ──
for (const pose of ['ouverte', 'pointer', 'poing', 'pince']) {
  const r = jouer(S.immobile(pose, 0.7)); v('main « ' + pose + ' » stable : engagée en moins de 0,6 s', types(r.ev).includes('engage') && r.m.etat().engage);
}
const court = jouer(S.immobile('ouverte', 0.25)); v('une main vue 0,25 s seulement : pas encore engagée', !types(court.ev).includes('engage'));
const agitee = jouer(H.suite(2.5, u => [H.creerMain({ pose: 'ouverte', cx: 0.5 + 0.3 * Math.sin(u * 2 * Math.PI * 5), cy: 0.7 })]));
v('une main qui s’agite (va-et-vient rapide pendant 2,5 s) ne s’engage pas', !types(agitee.ev).includes('engage'));
const sortie = jouer(concat(ENG(), S.vide(1.6)));
v('la main sort du cadre : désengagée en 1 s ou un peu plus', types(sortie.ev).includes('sans_main') && !sortie.m.etat().engage);
const rentre = jouer(concat(ENG(), S.vide(1.6), ENG()));
v('la main revient : réengagée en moins d’une seconde', types(rentre.ev).filter(t => t === 'engage').length === 2);

// ── 2. JAMAIS de pause par un geste en mode simple ──
const poing = jouer(concat(ENG(), S.immobile('poing', 6)));
v('poing tenu 6 s : aucune pause', !types(poing.ev).includes('pause') && !poing.m.etat().pause);
const deuxP = jouer(concat(ENG(), S.deuxPoings(5)));
v('deux poings tenus 5 s : aucune pause', !types(deuxP.ev).includes('pause') && !deuxP.m.etat().pause);
const plat = jouer(concat(ENG(), S.immobile('ouverte', 8, { cx: 0.5, cy: 0.7, angle: 1.4 })));
v('main à plat / de profil (tournée) tenue 8 s : aucune pause', !types(plat.ev).includes('pause') && !plat.m.etat().pause);
const platPoing = jouer(concat(ENG(), S.immobile('poing', 3, { angle: 1.5 }), S.immobile('ouverte', 3, { angle: 1.5 }), S.immobile('poing', 3)));
v('poing et main de profil en alternance : aucune pause', !types(platPoing.ev).includes('pause'));
// pause par bouton / voix : m.pause(true), et aucun geste ne la lève
const pb = jouer(concat(ENG(), S.immobile('ouverte', 3), S.pointer(0.3, 0.4, 0.7, 0.5, 1)), {}, null);
const pb2 = (() => { const m = V.creerMoteur(OPT); for (const f of ENG()) m.traiter(f); m.pause(true); const ev = [], ac = []; for (const f of concat(S.immobile('ouverte', 3), S.pointer(0.3, 0.4, 0.7, 0.5, 1))) { const s = m.traiter(f); ev.push(...s.evenements); ac.push(...s.actions); } return { m, ev, ac }; })();
v('pause demandée (bouton / voix) : elle tient, aucun geste ne la lève', pb2.m.etat().pause && !types(pb2.ev).includes('reprise') && compter(pb2.ac, 'curseur') === 0);
pb2.m.pause(false); v('fin de pause (bouton / voix) : engagé de nouveau', pb2.m.etat().engage && !pb2.m.etat().pause);

// ── 3. les 5 gestes ──
const pointer = jouer(concat(ENG(), S.pointer(0.3, 0.4, 0.7, 0.5, 1.2)));
const cur = pointer.actions.filter(a => a.a === 'curseur'); v('1. Pointer : le curseur suit la pointe de l’index', cur.length > 15 && Math.abs(cur[cur.length - 1].x - cur[0].x) > 300);   // miroir : le sens est inversé
const pointerDeux = jouer(concat(ENG(), S.immobile('pointer', 0.3)));
v('1. Pointer : index + majeur à demi tendus = toujours un pointeur (pas de défilement parasite)', compter(pointerDeux.actions, 'defile') === 0);
const clic = jouer(concat(ENG(), S.pointer(0.4, 0.4, 0.5, 0.45, 0.6), S.pincer(0.1, { cx: 0.5, cy: 0.7 }), S.immobile('pointer', 0.4, { cx: 0.5, cy: 0.5 + 0.16 * 1.9 })));
v('2. Pincer = clic', compter(clic.actions, 'clic') === 1, JSON.stringify(types(clic.ev)));
const glisser = jouer(concat(ENG(), S.saisir(0.35, 0.2, 0.05, 0.8)));
v('2. Pincer et bouger = glisser (prise, déplacements, lâcher)', compter(glisser.actions, 'prise') === 1 && compter(glisser.actions, 'deplace') > 5 && compter(glisser.actions, 'lache') === 1);
const balayage = jouer(concat(ENG(), S.balayage(0.2, 0.8, 0.35)));
v('3. Balayer main ouverte = parcourir (événement « balayage », défilement horizontal)', types(balayage.ev).includes('balayage') && balayage.actions.some(a => a.a === 'defile' && a.dx !== 0));
const ecarte = jouer(concat(ENG(), S.deuxPincesEcart(0.2, 0.6, 1.2)));
v('4. Deux mains pincées qui s’écartent = agrandir (type « pince »)', ecarte.actions.some(a => a.a === 'deux' && a.type === 'pince' && a.d > a.d0 * 1.5));
const ouvEcarte = (() => { const f = concat(ENG(), H.suite(1.4, u => { const e = 0.18 + 0.4 * u * u * (3 - 2 * u); return [H.creerMain({ pose: 'ouverte', cx: 0.5 - e / 2, cy: 0.7, lat: 'Left' }), H.creerMain({ pose: 'ouverte', cx: 0.5 + e / 2, cy: 0.7, lat: 'Right' })]; })); return jouer(f); })();
v('4. Deux mains OUVERTES qui s’écartent = agrandir aussi (mode simple)', ouvEcarte.actions.some(a => a.a === 'deux' && a.type === 'pince' && a.d > a.d0 * 1.4), JSON.stringify(ouvEcarte.actions.filter(a => a.a === 'deux').slice(-1)));
const rapproche = jouer(concat(ENG(), S.deuxPincesEcart(0.6, 0.2, 1.2)));
v('4. Deux mains qui se rapprochent = rétrécir', rapproche.actions.some(a => a.a === 'deux' && a.d < a.d0 * 0.6));
const paume = jouer(concat(ENG(), S.immobile('ouverte', 2.4)));
v('5. Paume ouverte immobile 1,5 s = vue d’origine / accueil (« vue_initiale »), une seule fois', compter(paume.actions, 'vue_initiale') === 1);
const paumeCourte = jouer(concat(ENG(), S.immobile('ouverte', 1.0)));
v('5. Une paume PENCHÉE (ou de profil) tenue 4 s ne déclenche rien : seule une paume droite compte', compter(jouer(concat(ENG(), S.immobile('ouverte', 4, { angle: 1.4 }))).actions, 'vue_initiale') === 0);
v('5. Une paume tenue moins de 1,5 s ne déclenche rien', compter(paumeCourte.actions, 'vue_initiale') === 0);

// ── 4. les gestes AVANCÉS sont absents du mode simple, présents en mode avancé ──
const ranger = o => jouer(concat(S.immobile('ouverte', 1.0), H.suite(0.3, () => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.4 })]), H.suite(0.2, u => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.4 + 0.3 * u })]), H.suite(0.3, () => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.7 })])), o);
v('ranger vers le bas : absent en mode simple, présent en avancé', compter(ranger({}).actions, 'ranger') === 0 && compter(ranger({ gestesAvances: true, pauseMs: 1000 }).actions, 'ranger') === 1);
const fer = o => jouer(concat(S.immobile('ouverte', 1.0), S.immobile('pointer', 0.4, { cx: 0.5, cy: 0.7 }), S.immobile('poing', 0.5, { cx: 0.5, cy: 0.7 }), S.immobile('ouverte', 1.0, { cx: 0.5, cy: 0.7 })), o);
v('fermer (poing court puis main ouverte) : absent en mode simple, présent en avancé', compter(fer({}).actions, 'fermer_debut') === 0 && compter(fer({ gestesAvances: true }).actions, 'fermer_debut') === 1);
const avance = jouer(concat(S.immobile('ouverte', 1.2), S.immobile('poing', 2.4)), { gestesAvances: true });
v('mode avancé : poing IMMOBILE tenu 2 s = pause (barre de progression), pas avant', types(avance.ev).includes('pause'));
const avancePas = jouer(concat(S.immobile('ouverte', 1.2), S.immobile('poing', 1.5)), { gestesAvances: true });
v('mode avancé : poing tenu seulement 1,5 s = pas de pause', !types(avancePas.ev).includes('pause'));
const annule = (() => { const m = V.creerMoteur({ ...OPT, gestesAvances: true }); let prog = 0, ev = []; for (const f of concat(S.immobile('ouverte', 1.2), S.immobile('poing', 1.4), S.immobile('ouverte', 1.0))) { const s = m.traiter(f); ev.push(...s.evenements); const p = s.etat && s.etat.progres; if (p && p.type === 'pause') prog = Math.max(prog, p.v); } return { prog, pause: m.etat().pause, ev }; })();
v('mode avancé : la barre de pause se remplit puis s’annule en rouvrant la main (pas de pause)', annule.prog > 0.4 && !annule.pause, JSON.stringify(annule.prog));

// ── 5. faux déclenchements par minute (cible < 1) ──
/* Une session « vie normale » : pointer qui se promène, pauses main ouverte à plat, poing posé, main de profil, hésitations de pincement à mi-course, main qui sort et rentre. AUCUN geste voulu. */
function vieNormale(secondes, o, graine) {
  const r = H.alea(graine * 977), parts = [ENG(o)]; let x = 0.5, y = 0.5, t = 0;
  while (t < secondes) {
    const x1 = 0.3 + r() * 0.4, y1 = 0.35 + r() * 0.3, d = 0.6 + r() * 1.2; parts.push(S.pointer(x, y, x1, y1, d, o)); t += d; x = x1; y = y1;
    const k = r();
    if (k < 0.25) { const p = 0.5 + r() * 2; parts.push(S.immobile('pointer', p, { ...o, cx: x, cy: y + 0.16 * 1.9 })); t += p; }
    else if (k < 0.4) { const p = 1 + r() * 5; parts.push(S.immobile('poing', p, { ...o, cx: 0.5, cy: 0.75 })); t += p; }                         // poing posé (longtemps)
    else if (k < 0.55) { const penche = r() < 0.5, p = penche ? 1 + r() * 5 : 0.3 + r() * 0.4; parts.push(S.immobile('ouverte', p, { ...o, cx: 0.5 + (r() - 0.5) * 0.04, cy: 0.75, angle: penche ? 1.4 : 0 })); t += p; }   // main à plat / de profil / penchée (longtemps) ou droite (moins de 0,7 s : une paume droite immobile 1,5 s est le geste voulu « paume = accueil »)
    else if (k < 0.65) { parts.push(S.vide(0.3 + r() * 1.5)); t += 1; }
    else if (k < 0.72) { const p = 1 + r() * 2; parts.push(S.immobile('pointer', 0.3, { ...o, cx: x, cy: 0.9 }), H.suite(p, () => [H.creerMain({ ...o, pose: 'pince', autres: 'rentres', pince: 0.3 + r() * 0.15, cx: x, cy: 0.7 })])); t += p; }   // hésitation du pouce (jamais un vrai pincement)
  }
  return concat(...parts);
}
const adapter = (frames, ips) => ips === 60 ? SIM.reechantillonner(frames, 60) : ips === 30 ? frames : frames.filter((_, i) => i % 2 === 0);
const TOUT = ['pause', 'fermer_debut', 'fermer', 'ranger', 'accueil', 'suivre', 'vue_initiale', 'defile', 'prise'];
let minutes = 0, faux = 0, pauses = 0, clics = 0; const detail = [], PAR_TYPE = {};
for (const ips of [60, 30]) for (const bruit of [0.0008, 0.0015]) for (let g = 1; g <= 5; g++) {
  const o = { bruit, alea: H.alea(g) }, f = adapter(vieNormale(80, o, g), ips), dur = (f[f.length - 1].t - f[0].t) / 60000, r = jouer(f);
  const n = TOUT.reduce((a, k) => a + compter(r.actions, k), 0) + compter(r.actions, 'clic'); for (const k of [...TOUT, 'clic']) if (compter(r.actions, k)) PAR_TYPE[k] = (PAR_TYPE[k] || 0) + compter(r.actions, k); faux += n; minutes += dur; pauses += types(r.ev).filter(t => t === 'pause').length; if (n) detail.push(ips + ' ips, bruit ' + bruit + ', graine ' + g + ' : ' + n);
}
console.log('   par type :', JSON.stringify(PAR_TYPE)); if (process.env.DET) console.log(detail.join(String.fromCharCode(10)));
console.log('   faux déclenchements (mode simple) :', faux, 'sur', minutes.toFixed(1), 'minutes =', (faux / minutes).toFixed(2), '/ min ; pauses :', pauses);
v('0 pause intempestive pendant ' + minutes.toFixed(0) + ' minutes de vie normale (poing posé, main à plat, main de profil…)', pauses === 0, String(pauses));
v('faux déclenchements < 1 par minute en mode simple (' + (faux / minutes).toFixed(2) + ')', faux / minutes < 1, detail.slice(0, 5).join(' | '));
// la même session en mode AVANCÉ montre le problème que le mode simple corrige
let pausesAv = 0; for (let g = 1; g <= 5; g++) { const o = { bruit: 0.0008, alea: H.alea(g) }; pausesAv += types(jouer(adapter(vieNormale(80, o, g), 30), { gestesAvances: true, pauseMs: 1000 }).ev).filter(t => t === 'pause').length; }
console.log('   (pour comparaison, mode avancé à l’ancien réglage de 1 s : ' + pausesAv + ' pauses sur les mêmes sessions)');
v('contrôle : l’ancien réglage (poing 1 s, mode avancé) déclenchait bien des pauses sur ces mêmes sessions', pausesAv > 0, String(pausesAv));
console.log('Gestes V11 : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
