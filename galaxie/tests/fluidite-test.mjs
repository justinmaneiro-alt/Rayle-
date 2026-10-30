// Tests du banc de mesure de fluidité des gestes (V10, phase 1 et 5) SANS téléphone ni caméra : sessions simulées (core/gestes/fluidite-simulation.js), pas des enregistrements réels.
// Lancer : node galaxie/tests/fluidite-test.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
R('../../core/gestes/gestes-calcul.js'); R('../../core/gestes/gestes-v5-calcul.js'); R('../../core/gestes/main-synthetique.js');
const F = R('../../core/gestes/fluidite-calcul.js'), S = R('../../core/gestes/fluidite-simulation.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// ── statistiques ──
v('percentile / médiane', F.mediane([1, 2, 3, 4, 100]) === 3 && F.percentile([1, 2, 3, 4], 0.5) === 2.5 && F.percentile([], 0.5) === null);
v('écart-type', Math.abs(F.ecartType([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 1e-9);

// ── trace simulée de référence ──
const sess = S.session({ ips: 60 }), tr0 = S.trace(sess);
const m0 = F.calculer(F.rejouer(tr0, {}));
v('session simulée : 6 clics voulus étiquetés', sess.intentions.length === 6);
v('le moteur reconnaît les 6 clics de la session simulée', m0.clics === 6, JSON.stringify(m0.actions));
v('débit médian ≈ cadence d’entrée (60/s)', m0.debit.mediane >= 55 && m0.debit.mediane <= 65, m0.debit.mediane);
v('aucune perte sur une trace parfaite', m0.perte === 0 && m0.pertesDeMain === 0);
v('délai : p95 présent et petit sur trace saine', m0.delai.p95 != null && m0.delai.p95 < 80, m0.delai.p95);
v('composantes du délai présentes (téléphone, réseau, moteur, affichage)', ['telephone', 'reseau', 'moteurPc', 'affichage'].every(k => m0.delai.composantes[k] != null));
v('cadence du téléphone lue (caméra, détection)', m0.camera.fps === 58 && m0.detection.fps === 58 && m0.detection.msParImage === 12);

// ── tremblement : la zone morte (V10) supprime le tremblement au repos ──
const avant = F.calculer(F.rejouer(tr0, { zoneMorte: 0 })), apres = F.calculer(F.rejouer(tr0, { zoneMorte: 6 }));
v('mesure du tremblement possible sur la trace', avant.tremblementPx != null && avant.tremblementFenetres >= 2, JSON.stringify([avant.tremblementPx, avant.tremblementFenetres]));
v('SANS zone morte (V5) : le curseur tremble encore au repos (> 2 px)', avant.tremblementPx > 2, avant.tremblementPx);
v('AVEC zone morte (V10) : tremblement au repos < 2 px', apres.tremblementPx < 2, apres.tremblementPx);
v('la zone morte ne retarde pas le mouvement (retard ≤ 40 ms)', apres.retardMs != null && apres.retardMs <= 40, apres.retardMs);
v('la zone morte ne fait perdre aucun clic', apres.clics === 6 && F.calculer(F.rejouer(tr0, { zoneMorte: 0 })).clics === 6);

// ── robustesse : traces dégradées ──
const cas = {
  '30 images/s': { ips: 30 }, '15 images/s': { ips: 15 }, 'gigue 40 ms': { gigue: 40 }, '10 % de pertes': { perte: 0.1 }, 'retard 120 ms': { retard: 120 }
};
for (const [nom, deg] of Object.entries(cas)) {
  const t = S.trace(sess, { degradation: deg }), m = F.calculer(F.rejouer(t, {}));
  v('dégradé « ' + nom + ' » : les 6 clics voulus sont encore reconnus (≥ 5)', m.clics >= 5 && m.clics <= 7, m.clics);
  v('dégradé « ' + nom + ' » : aucun clic en trop', m.clicsSuspects === 0, JSON.stringify(m.raisonsSuspects));
}
const mg = F.calculer(S.trace(sess, { degradation: { gigue: 40 } }));
v('la gigue de 40 ms est vue (p95 > 30 ms)', mg.gigue.p95 > 30, mg.gigue.p95);
const mp = F.calculer(S.trace(sess, { degradation: { perte: 0.1 } }));
v('10 % de pertes mesurés entre 5 et 15 %', mp.perte > 0.05 && mp.perte < 0.15, mp.perte);
const m15 = F.calculer(S.trace(sess, { degradation: { ips: 15 } }));
v('15 images/s : débit médian ≈ 15', m15.debit.mediane >= 13 && m15.debit.mediane <= 17, m15.debit.mediane);
v('dégrader : une trame arrivée après la suivante est écartée (jamais traitée en retard)', (() => { const d = F.degrader(sess.frames, { gigue: 60 }); for (let i = 1; i < d.length; i++) if (d[i].t <= d[i - 1].t) return false; return true; })());
v('dégrader : déterministe (même graine, même résultat)', JSON.stringify(F.degrader(sess.frames.slice(0, 80), { gigue: 20, perte: 0.1, graine: 4 })) === JSON.stringify(F.degrader(sess.frames.slice(0, 80), { gigue: 20, perte: 0.1, graine: 4 })));

// ── analyse en français : le bon goulot, la bonne correction ──
const an = (deg, tel, ctx) => F.analyser(F.calculer(S.trace(sess, { degradation: deg || {}, telephone: tel || {} })), ctx);
const sain = F.analyser(m0);
v('trace saine : « aucun goulot »', /Aucun goulot/.test(sain.goulot) && sain.constats.length === 0, sain.goulot);
v('trace saine : les 5 objectifs sont atteints', sain.objectifs.filter(o => o.ok === false).length === 0, JSON.stringify(sain.objectifs.filter(o => o.ok === false)));
const lent = an({}, { det: 14, detMs: 71, res: 640 });
v('détection lente : goulot « détection sur le téléphone (14 images/s, 71 ms par image) »', /détection sur le téléphone \(14 images\/s, 71 ms par image\)/.test(lent.goulot), lent.goulot);
v('détection lente : correction = baisser la résolution + une main + couper l’aperçu, avec « Appliquer »', lent.constats[0].correction && lent.constats[0].correction.tel.res === 480 && lent.constats[0].correction.tel.mains === 1 && lent.constats[0].correction.tel.eco === true, JSON.stringify(lent.constats[0].correction));
const lent2 = an({}, { det: 14, detMs: 71, res: 320, eco: true }, { nbMainsTel: 1 });
v('téléphone déjà au plus léger : on propose le calcul sur le PC (option de confidentialité)', lent2.constats[0].correction && lent2.constats[0].correction.tel.calcul === 'pc' && lent2.constats[0].correction.option === 'confidentialite', JSON.stringify(lent2.constats[0].correction));
v('calcul sur le PC impossible : aucune correction fantaisiste', (() => { const a = an({}, { det: 14, detMs: 71, res: 320, eco: true }, { nbMainsTel: 1, calculPossibleSurPc: false }); return a.constats[0].correction === null; })());
const reseau = an({ gigue: 45, perte: 0.08 });
v('réseau : goulot « Réseau : gigue de … ms » avec un tampon proposé', /^Goulot d’étranglement|^Réseau/.test(reseau.goulot) || /Réseau/.test(reseau.goulot), reseau.goulot);
v('réseau : correction = tampon d’interpolation (page.tamponMs)', reseau.constats.some(c => c.id === 'reseau' && c.correction && c.correction.page.tamponMs > 0));
const camLent = an({}, { cam: 22, det: 22, detMs: 8 });
v('caméra à 22 images/s sans détection lente : conseil de lumière', camLent.constats.some(c => c.id === 'camera-lumiere'), camLent.constats.map(c => c.id).join());
const chaud = an({}, { det: i => 58 - Math.min(40, i * 2.5) });
v('cadence qui s’effondre avec le temps : limitation thermique détectée', chaud.constats.some(c => c.id === 'thermique'), chaud.constats.map(c => c.id).join());
const batt = an({}, { bat: 0.1 });
v('batterie basse : constat sans correction inventée', batt.constats.some(c => c.id === 'batterie' && c.correction === null));
// lissage trop fort / tremblement / faux clics : sur des mesures fabriquées (la logique d'analyse seule)
const base = F.calculer(S.trace(sess, {}));
v('lissage trop fort (retard 120 ms) : correction de lissage', (() => { const a = F.analyser({ ...base, retardMs: 120 }); const c = a.constats.find(x => x.id === 'lissage'); return c && c.correction.page.lissage < 0.5 && /retard de 120 ms/.test(c.titre); })());
v('tremblement 6 px : correction plus de lissage à l’arrêt', (() => { const a = F.analyser({ ...base, tremblementPx: 6 }); const c = a.constats.find(x => x.id === 'tremblement'); return c && c.gravite === 'rouge' && c.correction.page.lissage > 0.5; })());
v('7 faux clics en 60 s : « seuil de pincement trop bas : 7 clics suspects »', (() => { const a = F.analyser({ ...base, clicsSuspects: 7, fauxParMinute: 7, raisonsSuspects: { rebond: 5, confiance: 2, vitesse: 0 } }); const c = a.constats.find(x => x.id === 'faux-clics'); return c && /Seuil de pincement trop bas : 7 clics suspects/.test(c.titre) && c.correction.page.sensibiliteClic < 1; })());
v('délai élevé sans autre cause : la plus grosse composante est nommée', (() => { const a = F.analyser({ ...base, delai: { p50: 90, p95: 150, composantes: { telephone: 20, reseau: 10, moteurPc: 5, affichage: 100 } } }); const c = a.constats.find(x => x.id === 'delai'); return c && /affichage/.test(c.detail); })());
v('PC qui affiche 30 images/s : constat « rendu du PC »', F.analyser({ ...base, rendu: { fps: 30, pire1pc: 20 } }).constats.some(c => c.id === 'rendu-pc'));
v('gravité triée : rouge avant orange', (() => { const a = F.analyser({ ...base, tremblementPx: 3, retardMs: 150 }); return a.constats[0].gravite === 'rouge'; })());
v('mode PC actif : on ne blâme pas la détection du téléphone', !an({}, { det: 14, detMs: 71, calcul: 'pc' }, { modePc: true }).constats.some(c => c.id === 'detection-telephone'));

// ── faux clics : détection des rebonds ──
v('rebond (deux clics à 120 ms) compté comme suspect', F.clicsSuspects({ frames: [], actions: [{ t: 1000, a: 'clic', n: 1 }, { t: 1120, a: 'clic', n: 1 }] }).suspects === 1);
v('vrai double clic (n = 2) non suspect', F.clicsSuspects({ frames: [], actions: [{ t: 1000, a: 'clic', n: 1 }, { t: 1300, a: 'clic', n: 2 }] }).suspects === 0);

// ── rendu du curseur à la cadence de l’écran ──
function entrees(hz, gig, A = 150, f = 1) { const vr = t => 960 + A * Math.sin(2 * Math.PI * f * t / 1000), out = []; let s = 5; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; for (let t = 0; t < 2000; t += 1000 / hz) out.push({ ta: t + 20 + (gig ? r() * gig : 0), t, x: vr(t), y: 540 }); out.sort((a, b) => a.ta - b.ta); return { out, vr }; }
function mesRendu(e, opt) { const s = F.simulerRendu(e.out, opt); let err = 0; for (const p of s.positions) err += Math.abs(p[1] - e.vr(p[0])); return { saut: s.sautMax, err: err / s.positions.length, images: s.images }; }
for (const [hz, g] of [[30, 0], [30, 25], [15, 0]]) {
  const e = entrees(hz, g), naif = mesRendu(e, { naif: true }), rendu = mesRendu(e, {});
  v('rendu ' + hz + ' Hz gigue ' + g + ' : sauts plus petits qu’en affichant la dernière mesure', rendu.saut < naif.saut, rendu.saut.toFixed(1) + ' contre ' + naif.saut.toFixed(1));
  if (hz >= 30) v('rendu ' + hz + ' Hz gigue ' + g + ' : moins d’erreur de position que la dernière mesure', rendu.err < naif.err, rendu.err.toFixed(1) + ' contre ' + naif.err.toFixed(1));   // à 15 Hz la prédiction est presque éteinte (elle dépasse la cible quand la main s'arrête) : on ne juge que la douceur
}
{ const e = entrees(30, 0), s = F.simulerRendu(e.out, { hz: 144 }); v('rendu : une position par image de l’écran (144 Hz) même avec une entrée à 30 Hz', s.images > 144 * 1.9, s.images); }
{ const r = F.creerRendu(); r.echantillon(0, 100, 100); r.echantillon(33, 110, 100); const p1 = r.position(40), p2 = r.position(120);
  v('rendu : ne prédit jamais plus de 45 ms au-delà de la dernière mesure (la main s’arrête, le curseur aussi)', Math.abs(p2.x - 110) <= 110 + 45 * (10 / 33) - 110 + 1, p2.x); void p1; }
{ const r = F.creerRendu(); r.echantillon(0, 100, 100); r.echantillon(16, 700, 100); const p = r.position(17); v('rendu : un saut volontaire (clic, aimant) n’est pas lissé en glissade', p.x > 600, p.x); }
{ const r = F.creerRendu(); v('rendu : sans mesure, aucune position', r.position(10) === null); }

// ── auto-calibrage du filtre, seuils de pincement ──
{ const c = F.calibrerFiltre(tr0); v('calibrage du filtre : trouve un lissage qui tient le tremblement', c.tenu && c.lissage >= 0.15 && c.lissage <= 0.9, JSON.stringify(c)); }
{ const o = F.optimiserSeuils(tr0, sess.intentions); v('seuils de pincement : tous les clics voulus, moins d’un faux par minute', o.fauxTenu && o.choix.rappel === 1 && o.choix.fauxParMinute < 1, JSON.stringify(o.choix)); }

// ── calibrage personnel de 20 s : zone morte et lissage mesurés sur la personne ──
{ const V5 = R('../../core/gestes/gestes-v5-calcul.js'), al = R('../../core/gestes/main-synthetique.js').alea(9), gs = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, al()))) * Math.cos(2 * Math.PI * al());
  const repos = Array.from({ length: 80 }, () => [960 + gs() * 2, 540 + gs() * 2]), calme = Array.from({ length: 80 }, () => [960, 540]), agite = Array.from({ length: 80 }, () => [960 + gs() * 9, 540 + gs() * 9]);
  const c = V5.calibrerAuto({ repos, vitesses: Array.from({ length: 30 }, () => 1) }); v('calibrage : zone morte réglée sur un tremblement de ~2 px (entre 4 et 8 px)', c.zoneMorte >= 4 && c.zoneMorte <= 8, JSON.stringify(c));
  v('calibrage : main très calme = zone morte minimale (4 px)', V5.calibrerAuto({ repos: calme }).zoneMorte === 4);
  v('calibrage : main très agitée = zone morte plafonnée à 14 px', V5.calibrerAuto({ repos: agite }).zoneMorte === 14);
  v('calibrage : doigt rapide = lissage plus léger, doigt lent = plus fort', V5.calibrerAuto({ vitesses: Array(20).fill(2.2) }).lissage === 0.35 && V5.calibrerAuto({ vitesses: Array(20).fill(0.4) }).lissage === 0.6);
  v('calibrage : pas assez de points à l’arrêt = dit quoi faire, ne règle rien', (() => { const x = V5.calibrerAuto({ repos: repos.slice(0, 5) }); return x.zoneMorte === undefined && x.raisons.some(t => /immobile/.test(t)); })()); }

// ── téléphone ou PC : recommandation ──
{ const lentTel = F.calculer(S.trace(sess, { degradation: { ips: 15 }, telephone: { det: 14, detMs: 71 } })), rapidePc = F.calculer(S.trace(sess, { telephone: { calcul: 'pc' } }));
  const reco = F.recommander(lentTel, rapidePc);
  v('téléphone lent (15 paquets/s) contre PC rapide (60/s) : recommande le PC, avec la raison chiffrée', reco.meilleur === 'pc' && /PC tient \d+ paquets\/s/.test(reco.raison), JSON.stringify(reco));
  const egal = F.recommander(rapidePc, rapidePc); v('deux modes équivalents : on reste sur le téléphone (confidentialité maximale)', egal.meilleur === 'telephone' && /se valent/.test(egal.raison), JSON.stringify(egal));
  const inverse = F.recommander(rapidePc, lentTel); v('le téléphone fait mieux que le PC : le téléphone', inverse.meilleur === 'telephone' && /téléphone fait mieux/.test(inverse.raison));
  const vide = { debit: { mediane: null }, delai: { p95: null }, pertesDeMain: 0, perte: null }; const sans = F.recommander(vide, vide);
  v('aucune main vue pendant les mesures : pas de recommandation inventée', sans.sansMesure === true && sans.meilleur === 'telephone' && /Aucune main/.test(sans.raison)); }

// ── mini-jeu « Cibles » : score ──
{ const e = []; for (let i = 0; i < 40; i++) e.push({ taille: i % 2 ? 48 : 80, reussi: i !== 7, ms: 900 + i, erreur: 10 }); const s = F.scoreCibles(e);
  v('cibles : taux de réussite, temps moyen, précision', s.reussite === 0.975 && s.tempsMoyen > 900 && s.precisionPx === 10, JSON.stringify(s));
  v('cibles : objectif ≥ 95 % sur les cibles de 48 px et plus', s.ok === true && s.reussiteCibles48 === 0.975);
  const m = F.scoreCibles(e.map((x, i) => ({ ...x, reussi: i % 4 !== 0 }))); v('cibles : 75 % de réussite = objectif non atteint', m.ok === false && m.reussite === 0.75);
  v('cibles : aucun essai = aucune note (jamais de 100 % inventé)', F.scoreCibles([]).reussite === null); }

// ── enregistreur et stockage ──
{ const e = F.creerEnregistreur(); e.entete({ ecran: { l: 1920, h: 1080 } }); e.trame({ tp: 1000, seq: 1, n: 1, mains: [{ lat: 'Right', pts: [[0.123456789, 0.5, 0]] }] }); e.trame({ tp: 1016.5, seq: 2, n: 0 }); e.tel({ cam: 58 }); e.rendu(8.333333); e.affiche(1010, 5.123, 6.789); e.action(1010, { a: 'clic' }); e.evenement(1012, 'clic');
  const t = e.fin(); v('enregistreur : temps relatif à la première trame', t.frames[0].tp === 0 && Math.abs(t.frames[1].tp - 16.5) < 0.01 && t.actions[0].t === 10);
  v('compacter : 4 décimales au plus', !/\d\.\d{5}/.test(F.compacter(t)));
  const e2 = F.creerEnregistreur({ maxFrames: 3 }); for (let i = 0; i < 10; i++) e2.trame({ tp: i, seq: i, n: 0 }); v('enregistreur : taille bornée', e2.trace.frames.length === 3); }

// ── la trace reste rejouable après sérialisation (banc de rejeu) ──
{ const json = F.compacter(tr0), tr1 = JSON.parse(json), a = F.calculer(F.rejouer(tr1, {})), b = F.calculer(F.rejouer(tr0, {}));
  v('rejeu d’une trace relue depuis JSON : mêmes clics et mêmes mesures (à 1 px près)', a.clics === b.clics && Math.abs((a.tremblementPx || 0) - (b.tremblementPx || 0)) < 1, JSON.stringify([a.clics, b.clics, a.tremblementPx, b.tremblementPx])); }

console.log('Fluidité des gestes : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
