import { monter, attendre } from './v10-aide.mjs';
import { compteur } from './terre-aide.mjs';
import fs from 'node:fs';
import path from 'node:path';

/* Gestes V10, PHASE 3 : le mode « calcul sur le PC » avec une VRAIE liaison vidéo pair-à-pair. Le téléphone est un second Chrome avec la fausse caméra de Chrome (image de test, aucune main) :
   on vérifie la mécanique — le téléphone détecte lui-même dans un Worker, le PC DEMANDE, le téléphone ACCEPTE, la vidéo arrive par WebRTC direct, le PC la détecte dans son propre Worker, les trames
   passent par la même chaîne que les points du téléphone, puis le retour au calcul sur le téléphone — pas la qualité de détection d'une vraie main (à valider par Justin).
   Nécessite assets-lourds/gestes (node app-pc/installer-gestes.mjs). Lancer : node tests-navigateur/v10-pc-test.mjs */
const { verifier, fin } = compteur();
if (!fs.existsSync(path.resolve('assets-lourds/gestes/hand_landmarker.task'))) { console.log('assets-lourds/gestes absent : test ignoré'); process.exit(0); }
const M = await monter({ port: 8161, portWorker: 8797, fausseCamera: true });
const { ev } = M;
try {
  const { tel, err: errTel } = await M.telephone({ vendor: true });
  verifier('la liaison directe WebRTC s’établit (vraie caméra factice côté téléphone)', await M.direct());
  console.log('page téléphone :', JSON.stringify(await tel.evaluate(() => ({ msg: document.getElementById('m-cam').textContent, det: document.getElementById('t-det').textContent, cam: document.getElementById('t-cam').textContent }))), errTel.join('|'));
  await attendre(5000);
  const avant = await ev(() => CameraRelais.etat().tel);
  console.log('téléphone seul :', JSON.stringify(avant));
  verifier('le téléphone détecte dans un Worker (mode « worker ») et envoie ses mesures', avant && avant.mode === 'worker' && avant.det > 5 && avant.cam > 5 && avant.calcul === 'telephone', JSON.stringify(avant));
  verifier('au départ : aucune vidéo, le PC ne reçoit que des points', await ev(() => !CameraRelais.etat().piste && !window.DetectionPc.etat().actif));

  // ── on demande le calcul sur le PC ──
  await ev(() => { Gestes.regler({ calculPc: true }); Fluidite.brancherPiste(); Fluidite.activerCalculPc(true); });
  await attendre(1200);
  verifier('le téléphone demande l’accord (carte visible) et ne démarre PAS la vidéo tout seul', await tel.evaluate(() => !document.getElementById('s-pc').hidden) && await ev(() => !CameraRelais.etat().piste));
  await tel.evaluate(() => document.getElementById('b-pc-oui').click());
  let pret = false; for (let i = 0; i < 30 && !pret; i++) { await attendre(500); pret = await ev(() => { const d = DetectionPc.etat(); return CameraRelais.etat().calcul === 'pc' && d.actif && d.recues > 20; }); }
  const pc = await ev(() => ({ relais: { calcul: CameraRelais.etat().calcul, piste: !!CameraRelais.etat().piste, tel: CameraRelais.etat().tel }, det: DetectionPc.etat() }));
  console.log('calcul sur le PC :', JSON.stringify(pc));
  verifier('la vidéo arrive sur le PC par la liaison directe et le PC détecte lui-même', pret && pc.relais.piste, JSON.stringify(pc));
  verifier('la détection du PC tourne dans un Worker, avec son délégué (GPU ou CPU)', pc.det.mode === 'worker' && (pc.det.delegate === 'GPU' || pc.det.delegate === 'CPU'), JSON.stringify(pc.det));
  await attendre(3000);
  const stats = await ev(() => ({ det: DetectionPc.etat(), tel: CameraRelais.etat().tel }));
  verifier('le PC détecte plusieurs images par seconde (> 15 sur une vidéo de test)', stats.det.fps > 15, JSON.stringify(stats.det));
  verifier('le téléphone annonce qu’il n’analyse plus (calcul sur le PC) et que sa caméra continue de tourner', stats.tel && stats.tel.calcul === 'pc' && stats.tel.det == null && stats.tel.cam > 5, JSON.stringify(stats.tel));
  verifier('le téléphone affiche l’avertissement de confidentialité (pair-à-pair, jamais enregistrée)', await tel.evaluate(() => !document.getElementById('t-pc-actif').hidden && /ni serveur, ni enregistrement/.test(document.getElementById('t-pc-actif').textContent)));
  // les trames du PC passent par le même moteur de gestes
  const trames = await ev(async () => { await Gestes.activer({ source: 'telephone-https' }); let n = 0, pcN = 0; const off = Gestes.ecouterTrames(f => { n++; if (f.pc) pcN++; }); await new Promise(r => setTimeout(r, 2500)); off(); return { n, pcN }; });
  verifier('sans main devant la caméra : des battements « aucune main » passent par la chaîne des gestes (≈ 2 par seconde)', trames.pcN >= 3 && trames.pcN <= 12, JSON.stringify(trames));

  // ── retour au calcul sur le téléphone ──
  await ev(() => Fluidite.activerCalculPc(false)); await attendre(3500);
  const retour = await ev(() => ({ calcul: CameraRelais.etat().calcul, piste: !!CameraRelais.etat().piste, det: DetectionPc.etat().actif, tel: CameraRelais.etat().tel }));
  verifier('retour au calcul sur le téléphone : plus de vidéo, détection du PC arrêtée, le téléphone détecte de nouveau', retour.calcul === 'telephone' && !retour.piste && !retour.det && retour.tel && retour.tel.calcul === 'telephone' && retour.tel.det > 5, JSON.stringify(retour));
  verifier('la carte « calcul sur le PC actif » a disparu du téléphone', await tel.evaluate(() => document.getElementById('t-pc-actif').hidden));

  // ── la comparaison téléphone / PC va au bout (2 × 5 s) et recommande ──
  await ev(() => { window.__cmp = null; Fluidite.comparer(5).then(c => { window.__cmp = c; }).catch(e => { window.__cmp = { erreur: e.message }; }); });
  await attendre(1500); await tel.evaluate(() => { const b = document.getElementById('b-pc-oui'); if (!document.getElementById('s-pc').hidden) b.click(); });
  let cmp = null; for (let i = 0; i < 60 && !cmp; i++) { await attendre(500); cmp = await ev(() => window.__cmp && (window.__cmp.erreur ? window.__cmp : { meilleur: window.__cmp.meilleur, raison: window.__cmp.raison, na: window.__cmp.na, nb: window.__cmp.nb })); await tel.evaluate(() => { const b = document.getElementById('b-pc-oui'); if (b && !document.getElementById('s-pc').hidden) b.click(); }); }
  console.log('comparaison :', JSON.stringify(cmp));
  verifier('la comparaison téléphone / PC va au bout et donne une recommandation en français', cmp && !cmp.erreur && (cmp.meilleur === 'pc' || cmp.meilleur === 'telephone') && /\w/.test(cmp.raison || ''), JSON.stringify(cmp));
  await ev(() => Fluidite.activerCalculPc(false));
  verifier('aucune erreur JavaScript dans la page du PC', M.errPc.length === 0, M.errPc.join(' | '));
  verifier('aucune erreur JavaScript sur le téléphone', errTel.length === 0, errTel.join(' | '));
} catch (e) { console.log('ERREUR', e); process.exitCode = 1; }
finally { await M.fermer(); fin(); }
