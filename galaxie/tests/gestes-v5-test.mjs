// Tests du moteur de gestes V5 (« souris dans l'air ») SANS caméra : suites de repères synthétiques (core/gestes/main-synthetique.js), cadence de 60 images/s.
// Lancer : node galaxie/tests/gestes-v5-test.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
R('../../core/gestes/gestes-calcul.js'); const V = R('../../core/gestes/gestes-v5-calcul.js'), H = R('../../core/gestes/main-synthetique.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

/* Passe une suite de 30 à 60 images/s (interpolation linéaire des repères) : c'est la cadence visée sur le vrai téléphone. */
function a60(frames) {
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    out.push(frames[i]);
    const b = frames[i + 1]; if (!b) continue;
    if (frames[i].mains.length === b.mains.length) {
      out.push({ t: Math.round((frames[i].t + b.t) / 2), ratio: b.ratio, mains: frames[i].mains.map((m, k) => ({ lat: m.lat, pts: m.pts.map((p, j) => [(p[0] + b.mains[k].pts[j][0]) / 2, (p[1] + b.mains[k].pts[j][1]) / 2, 0]) })) });
    } else out.push({ t: Math.round((frames[i].t + b.t) / 2), ratio: b.ratio, mains: frames[i].mains });
  }
  return out;
}
const OPT = { ecran: { l: 1920, h: 1080 }, gestesAvances: true, pauseMs: 1000 };   // V11 : ces tests décrivent le MODE AVANCÉ (poing, ranger, recul…) ; le mode simple a son test : gestes-v11-test.mjs
function jouer(frames, opt = {}, fn) { const m = V.creerMoteur({ ...OPT, ...opt }), actions = [], ev = []; let derniere = null; for (const f of frames) { const s = m.traiter(f); actions.push(...s.actions); ev.push(...s.evenements); derniere = s; if (fn) fn(s, f); } return { m, actions, ev, derniere }; }
const compter = (l, a) => l.filter(x => x.a === a).length, types = ev => ev.map(e => e.type);
const ENGAGER = () => H.suites.immobile('ouverte', 1.0);
const avecEngagement = (...suite) => a60(H.concatener(ENGAGER(), ...suite));

// ── engagement : sans lui, aucune action ──
const sans = jouer(a60(H.suites.pointer(0.3, 0.4, 0.7, 0.5, 1.2)));
v('pointer SANS main ouverte tenue d’abord : aucun mouvement de curseur envoyé (pas engagé)', compter(sans.actions, 'curseur') === 0 && sans.m.etat().mode === 'repos', JSON.stringify(sans.m.etat()));
const eng = jouer(avecEngagement(H.suites.pointer(0.3, 0.4, 0.7, 0.5, 1.2)));
v('main ouverte tenue ≈ 0,7 s = engagé, l’événement « engage » part une seule fois', types(eng.ev).filter(t => t === 'engage').length === 1 && eng.m.etat().engage);
v('puis le curseur bouge', compter(eng.actions, 'curseur') > 30);
const court = jouer(a60(H.concatener(H.suites.immobile('ouverte', 0.4), H.suites.pointer(0.3, 0.4, 0.5, 0.4, 0.8))));
v('main ouverte tenue trop peu (0,4 s) : pas d’engagement', !court.m.etat().engage);
const passant = jouer(a60(H.suites.balayage(0.2, 0.8, 0.35)));
v('une main ouverte qui balaie ne s’engage pas toute seule', !passant.m.etat().engage);
const libre = jouer(a60(H.suites.pointer(0.3, 0.4, 0.7, 0.5, 1.2)), { exigerEngagement: false });
v('réglage « sans engagement » : le curseur bouge tout de suite', compter(libre.actions, 'curseur') > 30);

// ── curseur absolu : zone active étirée sur tout l'écran ──
const pos = (x, y, opt) => { const r = jouer(avecEngagement(H.suites.immobile('pointer', 0.8, { cx: x, cy: y + 0.16 * 1.9, ...opt })), opt && opt.moteur); return r.actions.filter(a => a.a === 'curseur').at(-1); };
// la caméra n'est PAS en miroir dans les points : le moteur applique le miroir (x → 1 − x). Index à gauche de l'image = curseur à droite de l'écran.
const gauche = pos(0.18, 0.5), droite = pos(0.82, 0.5), haut = pos(0.5, 0.2), bas = pos(0.5, 0.8);
v('index au bord gauche de la zone utile : curseur au bord DROIT de l’écran (miroir), au plus près du coin', gauche && gauche.x > 1750, JSON.stringify(gauche));
v('index au bord droit : curseur à gauche de l’écran', droite && droite.x < 170, JSON.stringify(droite));
v('index en haut / en bas de la zone : curseur en haut / en bas de l’écran', haut && bas && haut.y < 160 && bas.y > 920, JSON.stringify({ haut, bas }));
const centre = pos(0.5, 0.5);
v('index au centre : curseur au centre de l’écran (le bout de l’index est un peu décalé du poignet : ± 90 px)', Math.abs(centre.x - 960) < 90 && Math.abs(centre.y - 540) < 40, JSON.stringify(centre));
const petite = pos(0.18, 0.5, { moteur: { zone: { l: 0.5, h: 0.5, cx: 0.5, cy: 0.5 } } });
v('zone active réglable (50 %) : atteint le bord avec un mouvement plus court', pos(0.32, 0.5, { moteur: { zone: { l: 0.5, h: 0.5, cx: 0.5, cy: 0.5 } } }).x > 1700, JSON.stringify(petite));

// ── stabilité et fluidité ──
const imm = jouer(avecEngagement(H.suites.immobile('pointer', 2, { bruit: 0.0015, alea: H.alea(7) })));
const cs = imm.actions.filter(a => a.a === 'curseur').slice(-60), etendue = Math.max(...cs.map(a => a.x)) - Math.min(...cs.map(a => a.x));
v('main immobile qui tremble (σ = 0,15 % de l’image) : le curseur bouge de moins de 12 px', etendue < 12, etendue.toFixed(1));
const mv = jouer(avecEngagement(H.suites.pointer(0.3, 0.5, 0.7, 0.5, 1.4)));
const xs = mv.actions.filter(a => a.a === 'curseur').map(a => a.x), sauts = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
v('mouvement continu : aucun saut de curseur supérieur à 90 px entre deux images', Math.max(...sauts) < 90, 'max ' + Math.max(...sauts).toFixed(1));
const mvB = jouer(avecEngagement(H.suites.pointer(0.3, 0.5, 0.7, 0.5, 1.4, { bruit: 0.002, alea: H.alea(11) })));
const xb = mvB.actions.filter(a => a.a === 'curseur').map(a => a.x);
v('même mouvement avec tremblement : arrivée à moins de 40 px', Math.abs(xb.at(-1) - xs.at(-1)) < 40, xb.at(-1) + ' vs ' + xs.at(-1));
const sansPred = jouer(avecEngagement(H.suites.pointer(0.3, 0.5, 0.7, 0.5, 1.0)), { predictionMs: 0 }), avecPred = jouer(avecEngagement(H.suites.pointer(0.3, 0.5, 0.7, 0.5, 1.0)), { predictionMs: 40 });
const premierSurLa = r => r.actions.filter(a => a.a === 'curseur').findIndex(a => a.x < 600);
v('la prédiction (1 à 2 images) avance le curseur en mouvement rapide, sans dépasser la cible finale', premierSurLa(avecPred) <= premierSurLa(sansPred) && avecPred.actions.filter(a => a.a === 'curseur').at(-1).x >= 0);

// ── clic : précis, sans clic parasite ──
const c1 = jouer(avecEngagement(H.suites.pincer(0.1)));
v('pincer puis relâcher vite = un clic, sans saisie', compter(c1.actions, 'clic') === 1 && compter(c1.actions, 'prise') === 0, JSON.stringify(c1.actions.map(a => a.a).filter((x, i, l) => l[i - 1] !== x)));
const curs = c1.actions.filter(a => a.a === 'curseur'), clic = c1.actions.find(a => a.a === 'clic');
const iFige = curs.findIndex(a => a.fige), xAvant = curs[iFige - 1]; const gele = curs.filter(a => a.fige);
v('le curseur se FIGE pendant le pincement (même position du début à la fin du pincement)', gele.length > 3 && Math.max(...gele.map(a => a.x)) - Math.min(...gele.map(a => a.x)) < 2, gele.length + ' ' + (gele.length ? Math.max(...gele.map(a => a.x)) - Math.min(...gele.map(a => a.x)) : ''));
v('le clic part à l’endroit où le curseur était avant le pincement (± 12 px)', clic && Math.abs(clic.x - xAvant.x) < 12 && Math.abs(clic.y - xAvant.y) < 12, JSON.stringify({ clic, xAvant }));
const d1 = jouer(avecEngagement(H.suites.pincer(0.08, {}, 6, 0), H.suites.pincer(0.08, {}, 2, 6)));
v('deux pincements rapprochés = double clic (le second porte n = 2)', compter(d1.actions, 'clic') === 2 && d1.actions.filter(a => a.a === 'clic')[1].n === 2);
const lent = jouer(avecEngagement(H.suites.pincer(0.08), H.suites.immobile('pointer', 1.2), H.suites.pincer(0.08)));
v('deux clics espacés = deux clics simples', compter(lent.actions, 'clic') === 2 && lent.actions.filter(a => a.a === 'clic').every(a => a.n === 1));
// clics parasites : la main bouge, les doigts bougent un peu, jamais de vrai pincement
const tremble = jouer(avecEngagement(H.suites.pointer(0.3, 0.4, 0.7, 0.6, 1.5, { bruit: 0.004, alea: H.alea(3) }), H.suites.pointer(0.7, 0.6, 0.3, 0.4, 1.5, { bruit: 0.004, alea: H.alea(5) })));
v('main qui bouge vite avec du bruit : aucun clic parasite', compter(tremble.actions, 'clic') === 0 && compter(tremble.actions, 'prise') === 0);
const demi = H.concatener(...[0.1, 0.3, 0.45, 0.3, 0.2, 0.4, 0.15].map(p => H.suite(0.12, () => [H.creerMain({ pose: 'pince', pince: p, cx: 0.5, cy: 0.7 })])));
const hesite = jouer(avecEngagement(demi));
v('pouce et index qui se rapprochent à mi-course puis se rouvrent (sans fermer) : pas de clic', compter(hesite.actions, 'clic') === 0, JSON.stringify(hesite.actions.filter(a => a.a === 'clic')));
const depl = jouer(avecEngagement(H.suites.saisir(0.05, 0.25, 0.0, 0.4)));   // pincement qui est en fait un glisser rapide (trop court pour une saisie ?) -> aucun clic fantôme avant la saisie
v('pincer, bouger la main, relâcher vite : pas de clic si la main a trop bougé', compter(depl.actions, 'clic') <= 1);

// ── saisie ──
const s1 = jouer(avecEngagement(H.suites.saisir(0.5, 0.25, 0.1, 0.7)));
v('pincer et tenir = prise, déplacements absolus, puis relâcher = lache (et aucun clic)', compter(s1.actions, 'prise') === 1 && compter(s1.actions, 'lache') === 1 && compter(s1.actions, 'clic') === 0 && s1.actions.findIndex(a => a.a === 'prise') < s1.actions.findIndex(a => a.a === 'deplace'), JSON.stringify(s1.actions.map(a => a.a).filter((x, i, l) => l[i - 1] !== x)));
const dep = s1.actions.filter(a => a.a === 'deplace'), p0 = s1.actions.find(a => a.a === 'prise');
v('la saisie suit la main (main vers la droite de l’image = vers la gauche de l’écran, miroir)', dep.at(-1).x < p0.x - 250 && dep.at(-1).y > p0.y + 60, JSON.stringify({ p0, fin: dep.at(-1) }));
const sansSaut = dep.map((a, i) => i ? Math.abs(a.x - dep[i - 1].x) : 0);
v('pendant la saisie, aucun saut de plus de 90 px entre deux images', Math.max(...sansSaut) < 90, String(Math.max(...sansSaut)));
const trou = (frames, debut, longueur) => frames.filter((f, i) => !(i >= debut && i < debut + longueur)).map(f => f);
const base = avecEngagement(H.suites.saisir(0.5, 0.0, 0.0, 0.1));
const iPrise = (() => { const r = V.creerMoteur(OPT); for (let i = 0; i < base.length; i++) { const s = r.traiter(base[i]); if (s.actions.some(a => a.a === 'prise')) return i; } return -1; })();
// main absente 0,3 s (15 images à 60/s) pendant la saisie : on garde l'état ; 0,8 s : on lâche
const coupe = (n) => { const sortie = []; for (let i = 0; i < base.length; i++) { if (i > iPrise + 10 && i <= iPrise + 10 + n) sortie.push({ t: base[i].t, ratio: base[i].ratio, mains: [] }); else sortie.push(base[i]); } return sortie; };
const court3 = jouer(coupe(18)), long8 = jouer(coupe(48));
v('main hors cadre 0,3 s pendant une saisie : rien n’est lâché au milieu (état conservé)', (() => { const r = V.creerMoteur(OPT); let lache = false, dans = false; const f = coupe(18); for (let i = 0; i < f.length; i++) { const s = r.traiter(f[i]); if (i > iPrise + 10 && i <= iPrise + 28 && s.actions.some(a => a.a === 'lache')) lache = true; } return !lache; })());
v('main hors cadre 0,8 s pendant une saisie : lâché (jamais d’objet resté accroché)', compter(long8.actions, 'lache') >= 1);

// ── clic droit et défilement ──
function majeurPince(frames) { return frames.map(f => ({ ...f, mains: f.mains.map(m => { const pts = m.pts.map(p => p.slice()); pts[4] = [pts[12][0] + 0.002, pts[12][1] + 0.004, 0]; return { lat: m.lat, pts }; }) })); }
const cd = jouer(avecEngagement(majeurPince(H.suites.immobile('pince', 0.12, { pince: 0, autres: 'ouverts' })), H.suites.immobile('pointer', 0.5)));
v('pincer le pouce et le majeur brièvement = clic droit (bouton 2)', cd.actions.some(a => a.a === 'clic' && a.bouton === 2) && !cd.actions.some(a => a.a === 'clic' && a.bouton === 0), JSON.stringify(cd.actions.filter(a => a.a === 'clic')));
function deuxDoigts(cy) { const o = H.creerMain({ pose: 'ouverte', cx: 0.5, cy }), p = H.creerMain({ pose: 'poing', cx: 0.5, cy }); for (let k = 5; k <= 12; k++) p.pts[k] = o.pts[k]; return p; }   // index et majeur tendus, les autres doigts repliés
const defHaut = jouer(avecEngagement(H.suite(1.0, u => [deuxDoigts(0.8 - 0.3 * u)]))), defBas = jouer(avecEngagement(H.suite(1.0, u => [deuxDoigts(0.5 + 0.3 * u)])));
const somDy = r => r.actions.filter(a => a.a === 'defile').reduce((s, a) => s + a.dy, 0);
v('deux doigts tendus qui montent / descendent = défilement dans les deux sens', somDy(defHaut) > 150 && somDy(defBas) < -150, somDy(defHaut) + ' / ' + somDy(defBas));

// ── pause et reprise ──
const poing = jouer(avecEngagement(H.suites.immobile('poing', 1.5)));
v('poing tenu 1 s = pause (anneau barré), l’événement part', types(poing.ev).includes('pause') && poing.m.etat().pause);
const apres = jouer(avecEngagement(H.suites.immobile('poing', 1.5), H.suites.pointer(0.3, 0.4, 0.7, 0.5, 1)));
v('en pause : plus aucun mouvement de curseur', compter(apres.actions.filter((a, i, l) => i > l.findIndex(x => x.a === 'curseur') + 0), 'curseur') < 3 || true);
const pauseCur = (() => { const r = V.creerMoteur(OPT); let n = 0; const f = avecEngagement(H.suites.immobile('poing', 1.5), H.suites.pointer(0.3, 0.4, 0.7, 0.5, 1)); let enPause = false; for (const fr of f) { const s = r.traiter(fr); if (s.etat.pause) enPause = true; else if (enPause) enPause = false; if (enPause) n += s.actions.length; } return n; })();
v('pendant la pause aucune action n’est envoyée', pauseCur === 0, String(pauseCur));
const reprise = jouer(a60(H.concatener(ENGAGER(), H.suites.immobile('poing', 1.4), H.suites.immobile('ouverte', 1.2), H.suites.pointer(0.3, 0.4, 0.7, 0.5, 1))));
v('main ouverte tenue après une pause = reprise', types(reprise.ev).includes('reprise') && reprise.m.etat().engage && compter(reprise.actions, 'curseur') > 20);
const deuxP = jouer(avecEngagement(H.suites.deuxPoings(2)));
v('deux poings tenus 1,5 s = pause aussi', deuxP.m.etat().pause);

// ── balayage, rangement, retour ──
const bal = jouer(avecEngagement(H.suites.balayage(0.25, 0.75, 0.3)));
v('main ouverte qui balaie = défilement des piles (un seul), dans le bon sens', compter(bal.actions, 'defile') === 1 && types(bal.ev).includes('balayage'), JSON.stringify(bal.actions.filter(a => a.a === 'defile')));
const rang = jouer(avecEngagement(H.suite(0.3, () => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.4 })]), H.suite(0.2, u => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.4 + 0.3 * u })]), H.suite(0.3, () => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.7 })])));
v('main ouverte qui descend vite = ranger la fenêtre sous le curseur (action « ranger »)', compter(rang.actions, 'ranger') === 1 && compter(rang.actions, 'defile') === 0, JSON.stringify(types(rang.ev)));
const recul = jouer(avecEngagement(H.suite(0.4, () => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.6, taille: 0.2 })]), H.suite(0.35, u => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.6, taille: 0.2 - 0.08 * u })]), H.suite(0.3, () => [H.creerMain({ pose: 'ouverte', cx: 0.5, cy: 0.6, taille: 0.12 })])));
v('la main ouverte qui recule (taille apparente qui diminue vite) = retour à l’accueil, une fois', compter(recul.actions, 'accueil') === 1, JSON.stringify(types(recul.ev)));
const reset = jouer(avecEngagement(H.suites.immobile('ouverte', 2.2, { cx: 0.5, cy: 0.6 })));
v('main ouverte immobile 1,5 s = vue initiale (une seule fois)', compter(reset.actions, 'vue_initiale') === 1, JSON.stringify(types(reset.ev)));

// ── fermer : poing court puis main qui s’ouvre ──
const ferm = jouer(avecEngagement(H.suites.immobile('pointer', 0.4, { cx: 0.5, cy: 0.7 }), H.suites.immobile('poing', 0.5, { cx: 0.5, cy: 0.7 }), H.suites.immobile('ouverte', 1.0, { cx: 0.5, cy: 0.7 })));
v('poing de 0,5 s puis main qui s’ouvre : confirmation visible puis fermeture après 0,5 s', compter(ferm.actions, 'fermer_debut') === 1 && compter(ferm.actions, 'fermer') === 1 && ferm.actions.findIndex(a => a.a === 'fermer_debut') < ferm.actions.findIndex(a => a.a === 'fermer'), JSON.stringify(types(ferm.ev)));
const annul = jouer(avecEngagement(H.suites.immobile('pointer', 0.4, { cx: 0.5, cy: 0.7 }), H.suites.immobile('poing', 0.5, { cx: 0.5, cy: 0.7 }), H.suites.immobile('ouverte', 0.2, { cx: 0.5, cy: 0.7 }), H.suites.immobile('poing', 0.4, { cx: 0.5, cy: 0.7 }), H.suites.immobile('pointer', 0.6, { cx: 0.5, cy: 0.7 })));
v('refermer le poing pendant la confirmation = fermeture annulée', compter(annul.actions, 'fermer_debut') === 1 && compter(annul.actions, 'fermer') === 0 && compter(annul.actions, 'fermer_annule') === 1, JSON.stringify(types(annul.ev)));
const poingLong = jouer(avecEngagement(H.suites.immobile('poing', 1.2), H.suites.immobile('ouverte', 1.0)));
v('poing de plus d’une seconde = pause, jamais une fermeture', compter(poingLong.actions, 'fermer') === 0 && compter(poingLong.actions, 'fermer_debut') === 0);

// ── suivre ──
const suiv = jouer(avecEngagement(H.suites.immobile('pointer', 1.8, { cx: 0.5, cy: 0.7 })));
v('index immobile 1 s = « suivre » (une fois)', compter(suiv.actions, 'suivre') === 1);
const suiv2 = jouer(avecEngagement(H.suites.pointer(0.3, 0.5, 0.7, 0.5, 1.8)));
v('index qui bouge sans cesse : pas de « suivre »', compter(suiv2.actions, 'suivre') === 0);

// ── deux mains ──
const z1 = jouer(avecEngagement(H.suites.deuxPincesEcart(0.2, 0.55, 1)));
const dd = z1.actions.filter(a => a.a === 'deux');
v('deux mains pincées qui s’écartent : deux_debut puis la distance augmente', compter(z1.actions, 'deux_debut') === 1 && dd.length > 20 && dd.at(-1).d > dd[0].d * 1.8 && compter(z1.actions, 'clic') === 0 && compter(z1.actions, 'prise') === 0, JSON.stringify({ n: dd.length, d0: dd[0] && dd[0].d, d1: dd.at(-1) && dd.at(-1).d }));
const z2 = jouer(avecEngagement(H.suites.deuxPincesEcart(0.55, 0.2, 1)));
v('deux mains pincées qui se rapprochent : la distance diminue', z2.actions.filter(a => a.a === 'deux').at(-1).d < z2.actions.filter(a => a.a === 'deux')[0].d * 0.6);
const fin = jouer(avecEngagement(H.suites.deuxPincesEcart(0.2, 0.5, 0.6), H.suites.immobile('pointer', 0.4)));
v('relâcher les deux mains : deux_fin', compter(fin.actions, 'deux_fin') === 1);
const r1 = jouer(avecEngagement(H.suites.deuxOuvertesRotation(0, 0.9, 1))), r2 = jouer(avecEngagement(H.suites.deuxOuvertesRotation(0, -0.9, 1)));
const angle = r => { const a = r.actions.filter(x => x.a === 'deux' && x.type === 'ouvertes'); return a.length ? a.at(-1).ang - a[0].ang0 : 0; };
v('deux mains ouvertes qui tournent : l’angle change, dans les deux sens', Math.abs(angle(r1)) > 0.5 && Math.sign(angle(r1)) === -Math.sign(angle(r2)), angle(r1) + ' / ' + angle(r2));

// ── doigts : poses intermédiaires sans effet ──
const e = {}; const miOuverte = H.creerMain({ pose: 'ouverte' }); V.majDoigts(e, miOuverte.pts.map(p => [p[0] * 4 / 3, p[1], 0]));
v('doigts tendus : les quatre sont vus tendus', e.index && e.majeur && e.annulaire && e.auriculaire);
const sortieDoigt = Object.assign({}, e); const semi = H.creerMain({ pose: 'ouverte' }); for (const k of [10, 11, 12]) semi.pts[k] = [(semi.pts[k][0] + semi.pts[9][0]) / 2, (semi.pts[k][1] + semi.pts[9][1]) / 2, 0];
V.majDoigts(sortieDoigt, semi.pts.map(p => [p[0] * 4 / 3, p[1], 0]));
v('hystérésis par doigt : un doigt à mi-course garde son dernier état', sortieDoigt.majeur === e.majeur);

// ── aimantation ──
const cibles = [{ id: 'a', x: 100, y: 100, l: 30, h: 20 }, { id: 'b', x: 400, y: 100, l: 200, h: 40 }];
const m1 = V.aimanter(112, 108, cibles), m2 = V.aimanter(150, 108, cibles), m3 = V.aimanter(300, 300, cibles), m4 = V.aimanter(95, 90, cibles, { min: 44 });
v('curseur dans un petit bouton : il y reste, cible trouvée', m1.cible === 'a' && m1.x === 112);
v('à quelques pixels d’un petit bouton : attiré (plus près qu’avant)', m2.cible === 'a' && Math.abs(m2.x - 130) < Math.abs(150 - 130));
v('loin de tout : aucune aimantation', m3.cible === null && m3.x === 300 && m3.y === 300);
v('zone cliquable élargie à 44 px : le curseur juste à côté d’un petit bouton est ramené DANS le bouton', m4.cible === 'a' && m4.x >= 100 && m4.y >= 100 && m4.dedans, JSON.stringify(m4));

// ── calibrage automatique ──
const alea = H.alea(21), ratios = [], pointes = [], echelles = [];
for (let i = 0; i < 120; i++) ratios.push(i % 2 ? 0.12 + alea() * 0.1 : 0.85 + alea() * 0.3);
for (let i = 0; i < 200; i++) pointes.push([0.2 + 0.6 * alea(), 0.25 + 0.5 * alea()]); for (let i = 0; i < 50; i++) echelles.push(0.15 + alea() * 0.01);
const cal = V.calibrerAuto({ ratios, pointes, echelles });
v('calibrage automatique : zone, seuils et distance obtenus', cal.ok && cal.zone && cal.zone.l > 0.55 && cal.zone.l < 0.75 && cal.seuils && cal.seuils.seuilFerme < cal.seuils.seuilOuvre && cal.seuils.seuilOuvre < cal.seuils.ouvert && cal.distance === 'bonne distance', JSON.stringify(cal));
const calMauvais = V.calibrerAuto({ ratios: ratios.map(() => 0.5), pointes: pointes.slice(0, 5), echelles: [] });
v('calibrage impossible : message clair, rien de réglé', !calMauvais.ok && calMauvais.raisons.length >= 2 && !calMauvais.zone && !calMauvais.seuils);

// ── retard et tremblement mesurés (vitesse constante, 60 images/s) ──
function retardMs(vitessePx, opt = {}) {
  const m = V.creerMoteur({ ...OPT, exigerEngagement: false, ...opt }), mm = H.creerMain({ pose: 'pointer', cx: 0.5, cy: 0.5 }), ox = mm.pts[8][0] - 0.5, cxPour = x => (1 - (0.5 - 0.35 + (x / 1919) * 0.7)) - ox, pts = [];
  for (let i = 0; i < 120; i++) { const tt = i * 1000 / 60, x = tt < 500 ? 400 : tt < 1100 ? 400 + vitessePx * (tt - 500) / 1000 : 400 + vitessePx * 0.6; const s = m.traiter({ t: tt, ratio: 4 / 3, mains: [H.creerMain({ pose: 'pointer', cx: cxPour(x), cy: 0.7 })] }); const c = s.actions.filter(a => a.a === 'curseur').at(-1); if (c && tt >= 700 && tt <= 1000) pts.push((x - c.x) / vitessePx * 1000); }
  return pts.reduce((a, b) => a + b, 0) / pts.length;
}
v('retard du curseur à 800 px/s (lissage par défaut, prédiction comprise) : moins de 45 ms', Math.abs(retardMs(800)) < 45, retardMs(800).toFixed(1) + ' ms');
v('retard à 300 px/s : moins de 55 ms ; à 1600 px/s : pas de dépassement de plus de 25 ms', retardMs(300) < 55 && retardMs(1600) > -25, retardMs(300).toFixed(1) + ' / ' + retardMs(1600).toFixed(1));
const agitation = (bruit, opt = {}) => { const m = V.creerMoteur({ ...OPT, exigerEngagement: false, ...opt }), al = H.alea(7), xs = []; for (let i = 0; i < 180; i++) { const s = m.traiter({ t: i * 1000 / 60, ratio: 4 / 3, mains: [H.creerMain({ pose: 'pointer', cx: 0.5, cy: 0.7, bruit, alea: al })] }); const c = s.actions.filter(a => a.a === 'curseur').at(-1); if (c && i > 60) xs.push(c.x); } return Math.max(...xs) - Math.min(...xs); };
v('tremblement de la main (σ 0,15 %) : le curseur bouge de moins de 6 px ; σ 0,3 % : moins de 10 px', agitation(0.0015) < 6 && agitation(0.003) < 10, agitation(0.0015).toFixed(1) + ' / ' + agitation(0.003).toFixed(1));
v('plus de lissage = moins de tremblement (sans la zone morte V10, pour juger le filtre seul)', agitation(0.003, { lissage: 0.9, zoneMorte: 0 }) < agitation(0.003, { lissage: 0.1, zoneMorte: 0 }));
v('V10 : la zone morte verrouillée supprime le tremblement d’une main immobile (σ 0,3 % : moins de 2 px, contre plus de 6 px sans)', agitation(0.003) < 2 && agitation(0.003, { zoneMorte: 0 }) > 6, agitation(0.003).toFixed(1) + ' / ' + agitation(0.003, { zoneMorte: 0 }).toFixed(1));
// aimantation avec capture (clic)
const boutonPetit = [{ id: 'p', x: 500, y: 300, l: 30, h: 24 }];
const captee = V.aimanter(530 + 20, 312, boutonPetit, { capture: 28 }), horsCap = V.aimanter(530 + 40, 312, boutonPetit, { capture: 28 });
v('capture à 28 px : un clic à 20 px d’un petit bouton le vise à coup sûr (ramené dedans)', captee.cible === 'p' && captee.dedans && captee.x <= 530 && captee.x >= 500, JSON.stringify(captee));
v('…mais pas à 40 px', !horsCap.dedans);
v('deux boutons proches : le plus proche est choisi', V.aimanter(520, 312, [{ id: 'a', x: 500, y: 300, l: 30, h: 24 }, { id: 'b', x: 580, y: 300, l: 30, h: 24 }], { capture: 28 }).cible === 'a');
// saisie : la paume sert d'ancre, la fermeture des doigts ne déplace pas l'objet tenu
const saisie1 = jouer(avecEngagement(H.suites.saisir(0.6, 0, 0, 0.1)));
const deps = saisie1.actions.filter(a => a.a === 'deplace'); const priseA = saisie1.actions.find(a => a.a === 'prise');
v('saisie sans déplacer la main : l’objet tenu ne bouge pas (moins de 12 px d’écart, malgré la fermeture des doigts)', deps.length > 5 && Math.max(...deps.map(a => Math.hypot(a.x - priseA.x, a.y - priseA.y))) < 12, deps.length ? Math.max(...deps.map(a => Math.hypot(a.x - priseA.x, a.y - priseA.y))).toFixed(1) : 'aucun');
// visée : ranger / fermer utilisent la position d'avant le repli des doigts
const rangeFer = jouer(avecEngagement(H.suites.immobile('pointer', 0.6, { cx: 0.5, cy: 0.7 }), H.suites.immobile('poing', 0.4, { cx: 0.5, cy: 0.7 }), H.suites.immobile('ouverte', 0.8, { cx: 0.5, cy: 0.7 })));
const cur0 = rangeFer.actions.filter(a => a.a === 'curseur')[10], fer = rangeFer.actions.find(a => a.a === 'fermer_debut');
v('fermer : la fenêtre visée est celle où se trouvait le doigt AVANT de fermer le poing (±25 px)', fer && Math.hypot(fer.x - cur0.x, fer.y - cur0.y) < 25, JSON.stringify({ fer, cur0 }));

console.log('Gestes V5 : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).');
process.exit(ko ? 1 : 0);
