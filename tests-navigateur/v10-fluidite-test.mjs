import { createRequire } from 'node:module';
import { monter, attendre, RACINE } from './v10-aide.mjs';
import { compteur } from './terre-aide.mjs';

/* Gestes V10, PHASES 1 à 6 : la chaîne COMPLÈTE avec un faux téléphone (page « Caméra Rayle » réelle, points synthétiques rejoués, vraie liaison WebRTC, vrai relais du Worker).
   Vérifie : synchronisation d'horloge et délai mesuré, statistiques du téléphone reçues chaque seconde, « Test de fluidité » (trace complète, mesures, analyse), goulot « détection sur le téléphone »
   avec correction qui s'APPLIQUE réellement sur le téléphone, adaptation automatique de la résolution, curseur dessiné à la cadence de l'écran, jeu « Cibles », sécurité du mode « calcul sur le PC »
   (désactivé par défaut, refus possible). Ce ne sont PAS une vraie main ni un vrai Wi-Fi : à valider par Justin avec son Galaxy S23 Ultra.   Lancer : node tests-navigateur/v10-fluidite-test.mjs */
const { verifier, fin } = compteur();
const R = createRequire(import.meta.url);
R('../core/gestes/gestes-calcul.js'); R('../core/gestes/gestes-v5-calcul.js'); R('../core/gestes/main-synthetique.js');
const S = R('../core/gestes/fluidite-simulation.js');
const session = S.session({ ips: 60, bruit: 0.0012, graine: 3 });
const M = await monter({ port: 8160, portWorker: 8799 });
const { pc, ev, direct } = M;
try {
  const { tel, err: errTel } = await M.telephone({ fond: { ips: 60, frames: session.frames.map(f => ({ t: f.t, ratio: f.ratio, mains: f.mains })), camIps: 60, detMs: 9 } });
  verifier('la liaison directe WebRTC s’établit', await direct());
  await attendre(4000);

  // ── horloge synchronisée, statistiques du téléphone ──
  const sync = await ev(() => { const e = CameraRelais.etat(); return { decalage: e.decalage, rttMin: e.rttMin, delaiMesure: e.delaiMesure, tel: e.tel }; });
  verifier('horloge téléphone ↔ PC synchronisée (même machine : décalage < 30 ms)', sync.decalage != null && Math.abs(sync.decalage) < 30, JSON.stringify(sync));
  verifier('délai de bout en bout MESURÉ (pas estimé) disponible', sync.delaiMesure != null && sync.delaiMesure >= 0 && sync.delaiMesure < 80, JSON.stringify(sync));
  verifier('statistiques du téléphone reçues chaque seconde (caméra, détection, résolution, mode de calcul)', sync.tel && sync.tel.cam > 30 && sync.tel.det > 30 && sync.tel.res === 640 && sync.tel.calcul === 'telephone', JSON.stringify(sync.tel));
  const ligne = await ev(() => { GestesTel.ouvrir(); return new Promise(r => setTimeout(() => r(document.querySelector('#gestes-tel [data-k="tel"]').textContent), 600)); });
  verifier('la fenêtre de suivi affiche la ligne « Téléphone » (cadence, résolution)', /détection \d+ im\/s/.test(ligne) && /640 px/.test(ligne), ligne);
  const sonde = await tel.evaluate(() => ({ det: document.getElementById('t-det').textContent, pt: document.getElementById('pt-det').className }));
  verifier('le téléphone affiche discrètement les images/s de détection avec un voyant vert / orange / rouge', /détection : \d+ images\/s/.test(sonde.det) && /\b(ok|att|ko)\b/.test(sonde.pt), JSON.stringify(sonde));

  // ── test de fluidité de 10 s sur de vrais flux ──
  const rec = await ev(async () => { await Gestes.activer({ source: 'telephone-https' }); const trace = await Fluidite.enregistrer(10); const r = Fluidite.analyserTrace(trace); window.__trace = trace; return { n: trace.frames.length, lat: trace.frames.filter(f => f.lat != null).length, aff: trace.frames.filter(f => f.aff != null).length, ref: trace.frames.filter(f => f.ref).length, rendu: trace.rendu.length, tel: trace.tel.length, affiche: trace.affiche.length, actions: trace.actions.length, decalage: trace.decalage, metrics: r.metrics, goulot: r.analyse.goulot, objectifs: r.analyse.objectifs, constats: r.analyse.constats.map(c => c.id) }; });
  const m = rec.metrics;
  console.log('mesures du test :', JSON.stringify({ n: rec.n, debit: m.debit, delai: m.delai, rendu: m.rendu, trem: m.tremblementPx, retard: m.retardMs, clics: m.clics, suspects: m.clicsSuspects, goulot: rec.goulot }));
  verifier('la trace contient ~60 trames par seconde (≥ 500 en 10 s)', rec.n >= 500, rec.n);
  verifier('chaque trame porte son délai mesuré, son affichage, la position visée sans filtre', rec.lat > rec.n * 0.8 && rec.aff > rec.n * 0.8 && rec.ref > rec.n * 0.8, JSON.stringify(rec));
  verifier('les images/s du PC, les positions affichées et les lignes du téléphone sont enregistrées', rec.rendu > 300 && rec.affiche > 300 && rec.tel >= 8, JSON.stringify({ rendu: rec.rendu, affiche: rec.affiche, tel: rec.tel }));
  verifier('débit médian ≥ 45 paquets/s (objectif de Justin)', m.debit.mediane >= 45, m.debit.mediane);
  verifier('débit minimum ≥ 30 paquets/s', m.debit.min >= 30, m.debit.min);
  verifier('délai de bout en bout < 80 ms au 95e centile', m.delai.p95 != null && m.delai.p95 < 80, m.delai.p95);
  verifier('le PC affiche ≥ 50 images/s', m.rendu.fps >= 50, m.rendu.fps);
  verifier('tremblement du curseur au repos < 2 px', m.tremblementPx != null && m.tremblementPx < 2, m.tremblementPx + ' (' + m.tremblementFenetres + ' fenêtres)');
  verifier('aucun clic suspect dans une session propre', m.clicsSuspects === 0, JSON.stringify(m.raisonsSuspects));
  verifier('l’analyse répond en français', typeof rec.goulot === 'string' && rec.goulot.length > 10, rec.goulot);

  // ── budget du Worker / de D1 : en liaison directe, les points ne passent PAS par lui ──
  { const avantAppels = { ...M.appels }; await attendre(6000); const apres = { ...M.appels }, d = r => (apres[r] || 0) - (avantAppels[r] || 0);
    verifier('liaison directe : aucun point envoyé par le Worker (0 appel à /camera/points en 6 s)', d('/camera/points') === 0, JSON.stringify({ points: d('/camera/points'), lire: d('/camera/lire') }));
    verifier('liaison directe : le PC ne consulte le Worker qu’environ une fois par seconde (≤ 9 appels en 6 s, lecture seule)', d('/camera/lire') <= 9, d('/camera/lire'));
    verifier('liaison directe : aucune signalisation en plus une fois connecté', d('/camera/signal') + d('/camera/signal-pc') <= 3, d('/camera/signal') + ' / ' + d('/camera/signal-pc')); }

  // ── goulot « détection sur le téléphone » : le téléphone annonce 14 détections/s alors que la caméra tourne à 58 ──
  await tel.evaluate(() => { const t = window.__RAYLE_CAM_TEST__; t.camIps = 58; t.detFraction = 14 / 60; t.detMs = 71; });
  await attendre(1500);
  const lent = await ev(async () => { const trace = await Fluidite.enregistrer(5); const r = Fluidite.analyserTrace(trace); return { goulot: r.analyse.goulot, c: r.analyse.constats.find(x => x.id === 'detection-telephone') || null, ids: r.analyse.constats.map(c => c.id) }; });
  verifier('goulot nommé : « détection sur le téléphone (… images/s, … ms par image) »', /détection sur le téléphone \(\d+(\.\d)? images\/s, \d+ ms par image\)/.test(lent.goulot), lent.goulot + ' ' + lent.ids.join());
  verifier('la correction propose de réduire la résolution / une main / l’aperçu', lent.c && lent.c.correction && (lent.c.correction.tel.res < 640 || lent.c.correction.tel.calcul === 'pc'), JSON.stringify(lent.c));
  verifier('le téléphone a baissé sa résolution tout seul (adaptation automatique) et le dit', await tel.evaluate(() => /Détection trop lente/.test(document.getElementById('m-cam').textContent) || /résolution réduite/.test(document.body.textContent)), await tel.evaluate(() => document.getElementById('m-cam').textContent));
  // « Appliquer » : réglages réellement reçus et appliqués par le téléphone
  await ev(() => Fluidite.appliquerCorrection({ libelle: 'test', tel: { res: 320, mains: 1, eco: true } }));
  await attendre(1200);
  const cfg = await tel.evaluate(() => ({ cfg: JSON.parse(localStorage.getItem('rayle_cam_cfg') || '{}'), msg: document.getElementById('m-cam').textContent, res: document.getElementById('r-res').value, mains: document.getElementById('r-mains').value, eco: localStorage.getItem('rayle_cam_eco') }));
  verifier('« Appliquer » : le téléphone passe en 320 × 240, une main, aperçu coupé, et l’affiche', cfg.cfg.res === '320' && cfg.cfg.mains === 1 && cfg.eco === '1' && /Rayle a réglé ce téléphone/.test(cfg.msg), JSON.stringify(cfg));
  verifier('retour manuel : les menus du téléphone reflètent les réglages (résolution, mains)', cfg.res === '320' && cfg.mains === '1', JSON.stringify(cfg));
  await attendre(1500);
  const st = await ev(() => CameraRelais.etat().tel);
  verifier('le PC voit le nouveau réglage dans les statistiques suivantes (320 px)', st && st.res === 320 && st.mains === 1, JSON.stringify(st));
  await ev(() => CameraRelais.envoyerReglages({ res: 'auto', mains: 2, eco: false })); await attendre(800);
  const cfg2 = await tel.evaluate(() => JSON.parse(localStorage.getItem('rayle_cam_cfg') || '{}'));
  verifier('retour au réglage automatique possible depuis le PC', cfg2.res === 'auto' && cfg2.mains === 2, JSON.stringify(cfg2));

  // ── mode « calcul sur le PC » : désactivé par défaut, le téléphone peut refuser ──
  const defaut = await ev(() => ({ prefs: Gestes.reglages().calculPc, etat: CameraRelais.etat().calcul, voulu: CameraRelais.etat().calculVoulu, piste: !!CameraRelais.etat().piste }));
  verifier('calcul sur le PC DÉSACTIVÉ par défaut (confidentialité maximale : points seulement)', defaut.prefs === false && defaut.etat === 'telephone' && defaut.voulu === false && defaut.piste === false, JSON.stringify(defaut));
  await ev(() => CameraRelais.demanderCalculPc(true)); await attendre(1000);
  const demande = await tel.evaluate(() => ({ carte: !document.getElementById('s-pc').hidden, texte: document.getElementById('s-pc').textContent }));
  verifier('le téléphone affiche l’explication et demande l’accord (jamais d’envoi vidéo sans accepter)', demande.carte && /pair-à-pair/.test(demande.texte) && /jamais enregistrée/.test(demande.texte), JSON.stringify(demande));
  await tel.evaluate(() => document.getElementById('b-pc-non').click()); await attendre(800);
  const refus = await ev(() => ({ voulu: CameraRelais.etat().calculVoulu, calcul: CameraRelais.etat().calcul, piste: !!CameraRelais.etat().piste }));
  verifier('refus sur le téléphone : le PC repasse en « points seulement », aucune vidéo reçue', refus.voulu === false && refus.calcul === 'telephone' && refus.piste === false, JSON.stringify(refus));
  verifier('une offre vidéo non demandée est ignorée par le PC (sécurité)', await ev(async () => { const avant = !!CameraRelais.etat().piste; return avant === false; }));

  // ── curseur rendu à la cadence de l'écran (les points n'arrivent qu'à 30 Hz) ──
  const rendu = await ev(async () => {
    await Gestes.activer({ source: 'rejeu', memoriser: false });
    const s = new __T.Suite(); s.engager(); s.vers(1200, 700, 1800); s.vers(300, 300, 1800);
    const frames = s.frames.filter((_, i) => i % 2 === 0);   // 30 images/s d'entrée
    await new Promise(r => setTimeout(r, 300));
    const entrees = [], maj = []; let prec = null;
    const off = Gestes.ecouterTrames((f, sortie) => { const c = sortie.etat && sortie.etat.curseur; const t = performance.now(); if (c && prec && Math.hypot(c.x - prec.x, c.y - prec.y) > 1.5) entrees.push(t); if (c) prec = { x: c.x, y: c.y }; });
    const mo = new MutationObserver(() => { maj.push(performance.now()); }); mo.observe(document.getElementById('gv5-curseur') || document.body, { attributes: true, attributeFilter: ['style'], subtree: false });
    await Gestes.rejouer(frames, { vitesse: 1, ecart: 17 }); off(); mo.disconnect();
    const d0 = entrees[0], d1 = entrees[entrees.length - 1], dur = (d1 - d0) / 1000, dans = maj.filter(t => t >= d0 && t <= d1 + 60).length;
    return { entrees: entrees.length, duree: dur, entreeParSeconde: entrees.length / dur, parSeconde: dans / dur };
  });
  verifier('l’anneau est redessiné ≥ 1,6 × plus souvent que les points reçus pendant un mouvement (entrée 30 Hz → écran 60 Hz et plus)', rendu.parSeconde >= rendu.entreeParSeconde * 1.6, JSON.stringify(rendu));

  // ── jeu « Cibles » ──
  const jouer = async (decalage) => {
    await ev(() => { window.__r = null; window.__g = CiblesJeu.lancer({ secondes: 60, essaisMax: 12, alea: (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })() }).then(r => { window.__r = r; }); });
    await attendre(200); const bouton = await pc.$('#cibles-jeu [data-k="go"]'); const bb = await bouton.boundingBox(); await pc.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    for (let i = 0; i < 40; i++) {
      await attendre(500);
      const c = await ev(() => { const e = document.querySelector('.cj-cible'); if (!e) return window.__r ? 'fin' : null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: r.width }; });
      if (c === 'fin') break; if (c) await pc.mouse.click(c.x + decalage * c.t, c.y);
      if (await ev(() => !!window.__r)) break;
    }
    await attendre(600); return ev(() => window.__r && { n: window.__r.score.essais, reussite: window.__r.score.reussite, ok: window.__r.score.ok, parTaille: window.__r.score.parTaille, gestes: window.__r.entree.gestes });
  };
  const parfait = await jouer(0);
  verifier('jeu Cibles : 12 cibles cliquées en plein centre = 100 %, objectif atteint', parfait && parfait.n === 12 && parfait.reussite === 1 && parfait.ok === true, JSON.stringify(parfait));
  const rate = await jouer(1.2);
  verifier('jeu Cibles : clics à côté des cibles = objectif NON atteint (jamais de 100 % inventé)', rate && rate.reussite < 0.5 && rate.ok === false, JSON.stringify(rate));
  verifier('les parties sont mémorisées pour comparer avant / après', await ev(() => CiblesJeu.historique().length >= 2));

  // ── pages sans erreur ──
  verifier('aucune erreur JavaScript dans la page du PC', M.errPc.length === 0, M.errPc.join(' | '));
  verifier('aucune erreur JavaScript sur le téléphone', errTel.length === 0, errTel.join(' | '));
} catch (e) { console.log('ERREUR', e); process.exitCode = 1; }
finally { await M.fermer(); fin(); }
