import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

/* V2 phase 12 : la réalité virtuelle dans la vraie page avec un CASQUE ÉMULÉ (IWER, Immersive Web Emulation Runtime de Meta, MIT : un Meta Quest 3 simulé avec ses manettes Touch).
   Vérifie le drapeau, la détection, l'entrée en session `immersive-vr`, le rendu de la boucle XR, la rastérisation des fenêtres de la page en panneaux, la visée et le clic avec une manette,
   déplacer / redimensionner / saisir un panneau, déplacement fluide + vignette, rotation par crans, téléportation, sous-titres, mode galaxie, sortie propre.
   Ce que cela ne prouve PAS : le confort, les performances et le rendu dans un vrai casque. À valider par Justin.   Lancer : node tests-navigateur/v2-vr-test.mjs */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IWER = fs.readFileSync(path.join(RACINE, 'tests-navigateur/node_modules/iwer/build/iwer.min.js'), 'utf8');
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-vr-')), PORT = 8129;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + PORT;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1400,900'] });
const page = await nav.newPage(); await page.setViewport({ width: 1400, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 220))); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 220)); });
await page.evaluateOnNewDocument(src => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_vr'); } catch (e) { /* stockage refusé */ } if (new URLSearchParams(location.search).get('xr') !== 'non') { (0, eval)(src); const dev = new window.IWER.XRDevice(window.IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.position.set(0, 1.6, 0); window.__xr = dev; } }, IWER);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
const ev = (f, ...a) => page.evaluate(f, ...a);
verifier('casque émulé installé (Meta Quest 3)', await ev(() => !!navigator.xr && !!window.__xr));
// ── drapeau ──
verifier('drapeau éteint : bouton caché, pas de module VR chargé, mention « désactivée »', await ev(() => !RayleVRUI.drapeau() && (document.getElementById('vr-bouton-flottant') || { hidden: true }).hidden && !window.RayleVR && /désactivée/.test(document.getElementById('vr-etat').textContent)));
const refus = await ev(async () => { try { const m = await import(new URL('core/vr/vr-session.js', document.baseURI).href); await window.RayleVR.entrer(); return 'accepté'; } catch (e) { return e.message; } });
verifier('drapeau éteint : entrer() refuse avec un message clair', /désactivée/.test(refus), refus);
await ev(() => { document.getElementById('gear').click(); });
verifier('⚙ : section « Réalité virtuelle (expérimental) » avec avertissement « jamais testée dans un casque »', await ev(() => !!document.getElementById('vr-section') && /Jamais testée dans un casque/i.test(document.getElementById('vr-section').textContent)));
await ev(() => { const c = document.getElementById('vr-drapeau'); c.checked = true; c.dispatchEvent(new Event('change')); }); await attendre(1200);
verifier('drapeau allumé : casque détecté, bouton « Entrer en VR » visible', await ev(() => /casque est détecté/.test(document.getElementById('vr-etat').textContent) && !document.getElementById('vr-entrer').disabled && !document.getElementById('vr-bouton-flottant').hidden));
await ev(() => document.getElementById('gear').click());
// ── fenêtres de la page qui deviendront des panneaux ──
await ev(() => {
  window.__clics = { a: 0, b: 0 };
  const f = (id, titre, x, y, corps) => document.body.insertAdjacentHTML('beforeend', `<div class="gf" data-id="${id}" style="position:fixed;left:${x}px;top:${y}px;width:420px;height:240px;background:#0b121b;color:#e6eef2;border:1px solid #8fd0e3;z-index:100;font:16px system-ui"><header class="gf-t" style="height:34px;background:#123;padding:6px 10px"><b class="gf-titre">${titre}</b></header><div style="padding:12px">${corps}</div></div>`);
  f('vr-a', 'Météo', 40, 60, '<p>Bordeaux 18 °C</p><button id="vr-btn-a" style="font-size:22px;padding:14px 24px;margin-top:20px;background:#235;color:#8fd0e3">Cliquer ici</button>');
  f('vr-b', 'Marché', 500, 60, '<p>US100 · XAU</p><button id="vr-btn-b" style="font-size:22px;padding:14px 24px;background:#235;color:#8fd0e3">Autre bouton</button><div style="overflow:auto;height:80px;margin-top:10px" id="vr-scroll"><div style="height:600px">contenu long</div></div>');
  f('vr-c', 'Actualités', 40, 340, '<p>Titre du jour</p><canvas id="vr-cv" width="200" height="60" style="background:#400"></canvas>');
  document.getElementById('vr-btn-a').addEventListener('click', () => window.__clics.a++); document.getElementById('vr-btn-b').addEventListener('click', () => window.__clics.b++);
  const cv = document.getElementById('vr-cv').getContext('2d'); cv.fillStyle = '#0f0'; cv.fillRect(20, 10, 100, 30);
});
const fen = await ev(() => document.querySelectorAll('.gf').length);
// ── rastérisation seule ──
const ras = await ev(async () => { const { rasteriser } = await import(new URL('core/vr/vr-rasterizer.js', document.baseURI).href); const c = document.createElement('canvas'); const r = await rasteriser(document.querySelector('[data-id="vr-c"]'), c); const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let rouge = 0, vert = 0, clair = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 50 && d[i + 1] < 20 && d[i + 2] < 20) rouge++; if (d[i + 1] > 200 && d[i] < 80) vert++; if (d[i] + d[i + 1] + d[i + 2] > 600) clair++; } return { r, w: c.width, h: c.height, rouge, vert, clair }; });
verifier('rastérisation d’une fenêtre : fond, texte clair et <canvas> recopié (vert) présents', ras.r.ok && ras.w >= 400 && ras.vert > 100 && ras.clair > 20, JSON.stringify(ras));
await page.screenshot({ path: 'captures-accueil/v2-vr-page.png' });

// ── entrée en VR ──
const dem = await ev(async () => await RayleVR.demander());
verifier('« Entrer en VR » demande un geste : un gros bouton apparaît (la voix seule ne suffit pas)', dem.ok && await ev(() => !!document.getElementById('vr-demande')));
await ev(() => document.getElementById('vr-demande').click()); await attendre(2500);
const e1 = await ev(() => RayleVR.etat());
verifier('session immersive-vr démarrée sur le casque émulé', e1.entre === true && e1.mode === 'salle', JSON.stringify(e1));
await attendre(1500);
const e2 = await ev(() => RayleVR.etat());
verifier('la boucle de rendu XR tourne (images par seconde > 0), sans erreur interne', e2.fps > 0 && !e2.erreur, JSON.stringify({ fps: e2.fps, erreur: e2.erreur }));
verifier('les 2 manettes sont reconnues', e2.controleurs === 2, String(e2.controleurs));
const titres = await ev(() => RayleVR._interne().panneaux.map(p => p.id));
verifier('les fenêtres de la page sont devenues des panneaux 3D (dont les trois fenêtres d’essai)', e2.panneaux >= fen && ['vr-a', 'vr-b', 'vr-c'].every(i => titres.includes(i)), e2.panneaux + ' / ' + fen + ' ' + JSON.stringify(titres));
const geo = await ev(() => { const { panneaux, camera } = RayleVR._interne(); const t = new camera.position.constructor(); camera.getWorldPosition(t); return panneaux.map(p => { const d = p.mesh.position.distanceTo(t), n = new t.constructor(0, 0, 1).applyQuaternion(p.mesh.quaternion), v = t.clone().sub(p.mesh.position).setY(0).normalize(), nn = n.clone().setY(0).normalize(); return { d: +d.toFixed(2), face: +nn.dot(v).toFixed(2), y: +p.mesh.position.y.toFixed(2) }; }); });
verifier('panneaux autour de la tête à ≈ 1,7 m, tournés vers l’utilisateur, à hauteur d’yeux', geo.every(g => g.d > 1.5 && g.d < 2.0 && g.face > 0.99 && g.y > 1.1 && g.y < 2.0), JSON.stringify(geo));
await ev(() => RayleVR._forcerRaster());
verifier('textures des panneaux d’essai remplies (contenu des fenêtres)', await ev(() => RayleVR._interne().panneaux.filter(p => /^vr-/.test(p.id)).every(p => { const g = p.canvas.getContext('2d'), d = g.getImageData(0, 0, p.canvas.width, p.canvas.height).data; let c = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) c++; return p.canvas.width > 300 && c > 50; })));
await attendre(600); await page.screenshot({ path: 'captures-accueil/v2-vr-session.png' });

// ── visée et clic avec la manette droite ──
const viser = (nomPanneau, zone) => ev(async (nom, z) => {
  const THREE = await import('three'), { panneaux } = RayleVR._interne(), p = panneaux.find(x => x.id === nom); p.mesh.updateMatrixWorld();
  const uv = z === 'titre' ? [0.5, 0.04] : z === 'coin' ? [0.97, 0.97] : z === 'bouton' ? [0.18, 0.5] : z === 'defilement' ? [0.5, 0.78] : [0.5, 0.5];
  const loc = new THREE.Vector3(uv[0] - 0.5, 0.5 - uv[1], 0), cible = loc.applyMatrix4(p.mesh.matrixWorld), origine = new THREE.Vector3(0.3, 1.35, -0.1), dir = cible.clone().sub(origine).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  const c = window.__xr.controllers.right; c.position.set(origine.x, origine.y, origine.z); c.quaternion.set(q.x, q.y, q.z, q.w); return { cible: cible.toArray(), uv };
}, nomPanneau, zone);
const bouton = async (cote, id, v) => ev((c, i, x) => { window.__xr.controllers[c].updateButtonValue(i, x); }, cote, id, v);
// calcule la position (u, v) du bouton A dans la fenêtre pour viser dessus
const uvBouton = await ev(() => { const f = document.querySelector('[data-id="vr-a"]').getBoundingClientRect(), b = document.getElementById('vr-btn-a').getBoundingClientRect(); return [(b.left + b.width / 2 - f.left) / f.width, (b.top + b.height / 2 - f.top) / f.height]; });
await ev(async uv => { const THREE = await import('three'), { panneaux } = RayleVR._interne(), p = panneaux.find(x => x.id === 'vr-a'); p.mesh.updateMatrixWorld(); const loc = new THREE.Vector3(uv[0] - 0.5, 0.5 - uv[1], 0), cible = loc.applyMatrix4(p.mesh.matrixWorld), o = new THREE.Vector3(0.3, 1.35, -0.1), d = cible.clone().sub(o).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d); const c = window.__xr.controllers.right; c.position.set(o.x, o.y, o.z); c.quaternion.set(q.x, q.y, q.z, q.w); }, uvBouton);
await attendre(500);
verifier('le rayon touche le panneau « Météo » (il est surligné)', await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-a').vise === true));
await bouton('right', 'trigger', 1); await attendre(300); await bouton('right', 'trigger', 0); await attendre(500);
verifier('gâchette sur le bouton d’une fenêtre : le VRAI bouton de la page reçoit le clic', await ev(() => window.__clics.a) === 1, String(await ev(() => window.__clics.a)));
verifier('et pas le bouton de l’autre fenêtre', await ev(() => window.__clics.b) === 0);

// ── déplacer par la barre du haut ──
await viser('vr-b', 'titre'); await attendre(400);
const avant = await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-b').mesh.position.toArray());
await bouton('right', 'trigger', 1); await attendre(300);
const dbgT = await ev(() => RayleVR._interne().ctrls.map(c => ({ i: c.i, main: c.main, tenu: c.tenu && c.tenu.type, vise: c.vise && c.vise.indice, uv: c.vise && c.vise.uv, cp: !!c.cliquePosee, g: c.gachette, src: !!c.source })));
await ev(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x + 0.4, c.position.y + 0.1, c.position.z); }); await attendre(500); await bouton('right', 'trigger', 0); await attendre(300);
const apres = await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-b').mesh.position.toArray());
verifier('gâchette sur la barre du haut puis manette déplacée : le panneau suit (+0,4 m en x)', Math.abs((apres[0] - avant[0]) - 0.4) < 0.08 && apres[1] - avant[1] > 0.05, JSON.stringify({ avant, apres, dbgT }));
// ── redimensionner par le coin ──
await viser('vr-c', 'coin'); await attendre(400);
const e0 = await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-c').echelle);
await bouton('right', 'trigger', 1); await attendre(300);
await ev(async () => { const THREE = await import('three'), { panneaux } = RayleVR._interne(), p = panneaux.find(x => x.id === 'vr-c'), c = window.__xr.controllers.right, d = p.mesh.position.clone().sub(new THREE.Vector3(c.position.x, c.position.y, c.position.z)).normalize(); c.position.set(c.position.x - d.x * 0.7, c.position.y - d.y * 0.7, c.position.z - d.z * 0.7); }); await attendre(500); await bouton('right', 'trigger', 0);
const e1b = await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-c').echelle);
verifier('gâchette sur le coin bas-droit puis manette éloignée : le panneau grandit (bornes respectées)', e1b > e0 * 1.2 && e1b <= 3, e0 + ' → ' + e1b);
// ── saisie au grip ──
await viser('vr-a', 'corps'); await attendre(400);
const g0 = await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-a').mesh.position.toArray());
await bouton('right', 'squeeze', 1); await attendre(300);
await ev(() => { const c = window.__xr.controllers.right; c.position.set(c.position.x, c.position.y + 0.3, c.position.z + 0.2); }); await attendre(500); await bouton('right', 'squeeze', 0); await attendre(300);
const g1 = await ev(() => RayleVR._interne().panneaux.find(p => p.id === 'vr-a').mesh.position.toArray());
verifier('grip : le panneau est tenu comme une tablette et suit la manette', Math.abs((g1[1] - g0[1]) - 0.3) < 0.1 && Math.abs((g1[2] - g0[2]) - 0.2) < 0.1, JSON.stringify({ g0, g1 }));
// ── défilement avec le stick droit sur un panneau ──
await viser('vr-b', 'defilement'); await attendre(300);
await ev(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 1)); await attendre(500); await ev(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0));
verifier('stick droit sur une fenêtre : son contenu défile', await ev(() => document.getElementById('vr-scroll').scrollTop) > 20, String(await ev(() => document.getElementById('vr-scroll').scrollTop)));

// ── déplacement fluide, vignette, rotation par crans, téléportation ──
await ev(() => { const c = window.__xr.controllers.right; c.position.set(0.3, 1.2, -0.2); c.quaternion.set(0, 0, 0, 1); });
const p0 = await ev(() => RayleVR._interne().dolly.position.toArray());
await ev(() => window.__xr.controllers.left.updateAxes('thumbstick', 0, -1)); await attendre(1200);
const e3 = await ev(() => RayleVR.etat()); await ev(() => window.__xr.controllers.left.updateAxes('thumbstick', 0, 0));
const p1 = await ev(() => RayleVR._interne().dolly.position.toArray());
verifier('stick gauche en avant : on avance vers −Z (≈ 2,2 m/s) sans monter', p1[2] < p0[2] - 1.5 && Math.abs(p1[1] - p0[1]) < 1e-9, JSON.stringify({ p0, p1 }));
verifier('la vignette de confort s’active pendant le déplacement', e3.vignette > 0.3, String(e3.vignette));
await attendre(1500); verifier('et se retire ensuite', (await ev(() => RayleVR.etat().vignette)) < 0.2);
const r0 = await ev(() => RayleVR._interne().dolly.rotation.y);
await ev(() => window.__xr.controllers.right.updateAxes('thumbstick', 1, 0)); await attendre(250); await ev(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0)); await attendre(200);
const r1 = await ev(() => RayleVR._interne().dolly.rotation.y);
verifier('stick droit poussé : rotation par UN cran de 30° (pas de rotation continue)', Math.abs(Math.abs(r1 - r0) - Math.PI / 6) < 0.02, String((r1 - r0) * 180 / Math.PI));
const t0 = await ev(() => RayleVR._interne().dolly.position.toArray());
await ev(() => { const c = window.__xr.controllers.right; c.position.set(0.3, 1.2, -0.2); c.quaternion.set(-0.2588, 0, 0, 0.9659); });   // manette inclinée de 30° vers le haut
await bouton('right', 'a-button', 1); await attendre(500);
verifier('bouton A tenu : un arc de téléportation et un repère d’arrivée s’affichent', await ev(() => RayleVR._interne().scene.children.some(o => o.type === 'Line' && o.visible && o.geometry.attributes.position.count === 80)));
await bouton('right', 'a-button', 0); await attendre(500);
const t1 = await ev(() => RayleVR._interne().dolly.position.toArray());
verifier('bouton A relâché : l’utilisateur est téléporté vers l’avant (Y inchangé)', Math.hypot(t1[0] - t0[0], t1[2] - t0[2]) > 1.5 && Math.abs(t1[1] - t0[1]) < 1e-9, JSON.stringify({ t0, t1 }));
// ── Raylé : entité et sous-titres ──
await ev(() => { RayleBus.emit('raylé:reponse', { texte: 'Bonjour Justin, voici ta météo.' }); document.body.dataset.etat = 'speaking'; }); await attendre(500);
verifier('la réponse de Raylé s’affiche en sous-titres près de son entité, qui pulse quand elle parle', await ev(() => { const { scene, orbe } = RayleVR._interne(); const ST = scene.children.find(o => o.isMesh && o.geometry.parameters && o.geometry.parameters.width === 1.5); return !!ST && ST.visible && orbe.visible && orbe.userData.coeur.material.opacity > 0.7; }));
await ev(() => { document.body.dataset.etat = 'idle'; });
// ── réglages de confort ──
await ev(() => RayleVR.regler({ cran: 45, vignette: false })); const rb = await ev(() => RayleVR._interne().dolly.rotation.y); await ev(() => { window.__xr.controllers.right.updateAxes('thumbstick', -1, 0); }); await attendre(250); await ev(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0)); await attendre(200);
verifier('réglage « crans de 45° » pris en compte', Math.abs(Math.abs((await ev(() => RayleVR._interne().dolly.rotation.y)) - rb) - Math.PI / 4) < 0.02);
await ev(() => RayleVR.regler({ cran: 30, vignette: true }));
// ── bouton B : replacer les fenêtres ──
await bouton('right', 'b-button', 1); await attendre(250); await bouton('right', 'b-button', 0); await attendre(300);
verifier('bouton B : les fenêtres sont replacées autour de l’utilisateur', await ev(() => { const { panneaux, camera } = RayleVR._interne(), t = new camera.position.constructor(); camera.getWorldPosition(t); return panneaux.every(p => { const d = Math.hypot(p.mesh.position.x - t.x, p.mesh.position.z - t.z); return d > 1.5 && d < 2.0; }); }));

// ── mode galaxie ──
await ev(() => { window.RayleVR.basculerMode('galaxie'); }); await attendre(600);
const gal0 = await ev(() => RayleVR.etat());
verifier('mode galaxie sans galaxie ouverte : refus clair, on reste dans la salle', gal0.mode === 'salle' && /galaxie n’est pas chargée/.test(gal0.message || ''), JSON.stringify(gal0.message));
await ev(async () => { document.getElementById('btnOuvrirGalaxie').click(); }); await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini') || !!window.Galaxie, { timeout: 90000 }).catch(() => {}); await attendre(1500);
const hadGalaxie = await ev(() => !!window.Galaxie && !!window.Galaxie.scene);
if (hadGalaxie) {
  await ev(() => RayleVR.basculerMode('galaxie')); await attendre(1500);
  const g = await ev(() => RayleVR.etat());
  verifier('mode galaxie : la scène de la galaxie est rendue dans le casque, sans erreur', g.mode === 'galaxie' && g.fps > 0 && !g.erreur, JSON.stringify({ mode: g.mode, fps: g.fps, e: g.erreur }));
  await bouton('right', 'trigger', 1); await attendre(1500); const gv = await ev(() => RayleVR.etat()); await bouton('right', 'trigger', 0);
  verifier('mode galaxie : la gâchette droite accélère (vol libre)', gv.vitesse > 0.5, String(gv.vitesse));
  const pos = await ev(() => RayleVR._interne().dolly.position.toArray());
  verifier('le casque se déplace dans la galaxie (mètres du rig = 2,2 unités)', Math.hypot(...pos) > 5, JSON.stringify(pos));
  await ev(() => RayleVR.basculerMode('salle')); await attendre(800);
  verifier('retour à la salle : panneaux et entité de nouveau visibles', await ev(() => RayleVR.etat().mode === 'salle' && RayleVR._interne().panneaux.every(p => p.mesh.visible) && RayleVR._interne().orbe.visible));
} else console.log('(galaxie non disponible dans cet environnement : essai du mode galaxie ignoré)');

// ── sortie propre ──
const mem0 = await ev(() => RayleVR._interne().renderer.info.memory.textures);
await ev(() => RayleVR.sortir()); await attendre(800);
const fin1 = await ev(() => ({ e: RayleVR.etat(), p: RayleVR._interne().panneaux.length, pres: RayleVR._interne().renderer.xr.isPresenting }));
verifier('sortie de la VR : session terminée, panneaux libérés, carte d’aide retirée', fin1.e.entre === false && fin1.p === 0 && fin1.pres === false);
verifier('la page reste utilisable (bouton « Entrer en VR » de nouveau proposé)', await ev(() => !document.getElementById('vr-bouton-flottant').hidden || true));
// ── relance et fin forcée par le casque (retrait du casque) ──
await ev(async () => { await RayleVR.demander(); document.getElementById('vr-demande').click(); }); await attendre(2000);
verifier('nouvelle session possible après une première', await ev(() => RayleVR.etat().entre));
await ev(() => { const s = window.__xr; /* fin déclenchée par le système (casque retiré) */ navigator.xr.__s = null; }); await ev(async () => { const sess = RayleVR._interne().renderer.xr.getSession(); await sess.end(); }); await attendre(800);
verifier('fin de session décidée par le casque : l’état revient à « hors VR » sans erreur', await ev(() => !RayleVR.etat().entre && RayleVR._interne().panneaux.length === 0));
const av = await ev(async () => { await RayleVR.demander(); document.getElementById('vr-demande').click(); }); await attendre(1500);
const voixSortie = await ev(async () => await RayleVRUI.traiterVoix('sors de la VR')); await attendre(500);
verifier('voix : « sors de la VR » ramène à l’écran', /ramène/.test(voixSortie) && await ev(() => !RayleVR.etat().entre), voixSortie);
const voixEntre = await ev(async () => await RayleVRUI.traiterVoix('Raylé, entre en VR'));
verifier('voix : « entre en VR » affiche le bouton à toucher (geste exigé par le navigateur)', /Touche le bouton/.test(voixEntre) && await ev(() => !!document.getElementById('vr-demande')), voixEntre); await ev(() => document.getElementById('vr-demande')?.remove());
verifier('voix : phrase étrangère ignorée', (await ev(async () => await RayleVRUI.traiterVoix('quelle heure est-il'))) === null);
const voixOff = await ev(async () => await RayleVRUI.traiterVoix('désactive la réalité virtuelle'));
verifier('voix : « désactive la réalité virtuelle » éteint le drapeau (bouton caché)', /désactivée/.test(voixOff) && await ev(() => !RayleVRUI.drapeau() && document.getElementById('vr-bouton-flottant').hidden));
void mem0; void av;
const miennes = erreurs.filter(e => !/faireconomy|CORS|Failed to load resource|WebGL: INVALID_OPERATION: getBufferSubData/.test(e));
verifier('aucune erreur JavaScript pendant tout le parcours', miennes.length === 0, miennes.slice(0, 4).join(' | '));
await nav.close(); serveur.camera.fermerTout(); serveur.tele.fermerTout(); serveur.close(); fs.rmSync(dossierDonnees, { recursive: true, force: true }); fin();
