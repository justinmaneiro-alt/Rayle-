import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

/* Gestes V10, PHASE 2 : la détection de main s'exécute VRAIMENT dans un Worker (MediaPipe réel, fichiers du dossier assets-lourds/gestes), la dernière image est toujours prise
   (un détecteur occupé SAUTE l'image au lieu de faire une file), et le repli sur le fil principal marche si le Worker est impossible. Une image sans main : on mesure la mécanique
   (démarrage, millisecondes par image, images sautées), pas la qualité de détection d'une vraie main (à valider par Justin sur son téléphone).
   Lancer : node tests-navigateur/v10-detection-test.mjs */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(RACINE, 'assets-lourds/gestes/hand_landmarker.task'))) { console.log('assets-lourds/gestes absent (node app-pc/installer-gestes.mjs) : test ignoré'); process.exit(0); }
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-v10det-')), PORT = 8151;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run'] });
try {
  const page = await nav.newPage(); const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await page.goto('http://127.0.0.1:' + PORT + '/camera/index.html', { waitUntil: 'load' });
  const r = await page.evaluate(async () => {
    const mod = await import('/camera/detection.js'), base = location.origin + '/assets-lourds/gestes/', cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
    const x = cv.getContext('2d'); x.fillStyle = '#556'; x.fillRect(0, 0, 640, 480); x.fillStyle = '#fc4'; x.fillRect(200, 140, 240, 200);
    const t0 = performance.now();
    const d = await mod.creerDetecteur({ mjs: base + 'vision_bundle.mjs', wasm: base + 'wasm', modele: base + 'hand_landmarker.task', delegate: 'GPU', mains: 2, urlWorker: location.origin + '/camera/detection-worker.js', taille: { l: 480, h: 360 } });
    const demarrage = performance.now() - t0, ms = [], totaux = []; let ts = 1000, nonNull = 0;
    for (let i = 0; i < 60; i++) { const res = await d.detecter(cv, ts += 17); if (res) { nonNull++; ms.push(res.ms); totaux.push(res.total != null ? res.total : res.ms); } }
    // occupé : deux demandes simultanées, la seconde est refusée (image sautée)
    const [a, b] = await Promise.all([d.detecter(cv, ts += 17), d.detecter(cv, ts += 17)]);
    const med = l => l.slice().sort((p, q) => p - q)[l.length >> 1];
    let regle = true; try { d.regler({ mains: 1, taille: { l: 320, h: 240 } }); const r2 = await d.detecter(cv, ts += 17); regle = !!r2; } catch (e) { regle = false; }
    d.fermer();
    // repli : adresse de Worker introuvable → fil principal avec un message clair
    const t1 = performance.now(); const repli = await mod.creerDetecteur({ mjs: base + 'vision_bundle.mjs', wasm: base + 'wasm', modele: base + 'hand_landmarker.task', delegate: 'GPU', mains: 1, urlWorker: location.origin + '/camera/introuvable-worker.js' });
    const rr = await repli.detecter(cv, 5000); const infoRepli = { mode: repli.mode, avertissement: repli.avertissement, ok: !!rr, delai: performance.now() - t1 }; repli.fermer();
    return { mode: d.mode, delegate: d.delegate, demarrage, medianeMs: med(ms), medianeTotal: med(totaux), nonNull, simultane: [!!a, !!b], regle, infoRepli, mainsVues: ms.length };
  });
  console.log('mesures :', JSON.stringify(r));
  verifier('la détection tourne dans un Worker (mode « worker »)', r.mode === 'worker', r.mode);
  verifier('délégué GPU ou CPU annoncé', r.delegate === 'GPU' || r.delegate === 'CPU', r.delegate);
  verifier('60 images détectées une par une (aucune perdue quand le détecteur est libre)', r.nonNull === 60, r.nonNull);
  verifier('durée par image mesurée et raisonnable sur ce PC (< 40 ms, médiane)', r.medianeTotal > 0 && r.medianeTotal < 40, r.medianeTotal);
  verifier('détecteur occupé : la 2e demande simultanée est SAUTÉE (pas de file d’attente)', r.simultane[0] === true && r.simultane[1] === false, JSON.stringify(r.simultane));
  verifier('réglage « une seule main » et résolution réduite sans redémarrer', r.regle === true);
  verifier('Worker introuvable : repli automatique sur le fil principal, avec un message', r.infoRepli.mode === 'principal' && /fil principal/.test(r.infoRepli.avertissement) && r.infoRepli.ok, JSON.stringify(r.infoRepli));
  verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
} catch (e) { console.log('ERREUR', e); process.exitCode = 1; }
finally { await nav.close(); serveur.close(); fin(); }
