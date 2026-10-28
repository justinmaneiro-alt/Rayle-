import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

/* V3 phase 5 : le CLAVIER EN VR, avec un casque émulé (IWER, Meta Quest 3 simulé, MIT). Un champ de texte de la page reçoit le focus (visée + gâchette, comme un clic) : un clavier AZERTY apparaît comme un panneau 3D,
   chaque touche visée au rayon + gâchette modifie le VRAI champ (valeur, curseur, événements « input »), majuscules, accents, symboles, effacement, entrée (envoi du formulaire), fermeture.
   Ce que cela ne prouve PAS : le confort de frappe, la précision de visée et le rendu dans un vrai casque (à valider par Justin).   Lancer : node tests-navigateur/v3-vr-clavier-test.mjs */
const { verifier, fin } = compteur();
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IWER = fs.readFileSync(path.join(RACINE, 'tests-navigateur/node_modules/iwer/build/iwer.min.js'), 'utf8');
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-vrk-')), PORT = 8130;
const serveur = creerServeur({ portReseau: 0, dossierDonnees, ip: '127.0.0.1' });
await new Promise(r => serveur.listen(PORT, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + PORT;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1400,900'] });
const page = await nav.newPage(); await page.setViewport({ width: 1400, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 220)));
await page.evaluateOnNewDocument(src => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_vr', JSON.stringify({ actif: true })); } catch (e) { /* stockage refusé */ } (0, eval)(src); const dev = new window.IWER.XRDevice(window.IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.position.set(0, 1.6, 0); window.__xr = dev; }, IWER);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(2500);
const ev = (f, ...a) => page.evaluate(f, ...a);

// ── une fenêtre avec un champ, un formulaire et une zone de texte, comme celles de Raylé ──
await ev(() => {
  window.__j = { envois: [], entrees: [] };
  document.body.insertAdjacentHTML('beforeend', `<div class="gf" data-id="vr-form" style="position:fixed;left:40px;top:60px;width:520px;height:300px;background:#0b121b;color:#e6eef2;border:1px solid #8fd0e3;font:20px system-ui"><div class="gf-titre" style="height:36px">Recherche</div>
    <form id="vr-f" style="padding:10px"><input id="vr-champ" type="search" aria-label="Chercher un lieu" style="font-size:24px;width:440px;padding:10px;background:#123;color:#fff;border:1px solid #8fd0e3"><button type="submit" style="font-size:20px;padding:8px 14px;margin-top:10px">Chercher</button></form>
    <textarea id="vr-zone" style="margin:0 10px;width:480px;height:70px;font-size:20px"></textarea><input type="checkbox" id="vr-case"></div>`);
  document.getElementById('vr-f').addEventListener('submit', e => { e.preventDefault(); window.__j.envois.push(document.getElementById('vr-champ').value); });
  window.__j.entrees = []; document.getElementById('vr-champ').addEventListener('input', e => window.__j.entrees.push(e.inputType + ':' + (e.data || '')));
});
verifier('script du clavier chargé, aucun clavier hors VR', await ev(() => !!window.VRClavierCalcul && !document.getElementById('vr-clavier')));
await ev(() => document.getElementById('vr-champ').focus()); await attendre(300);
verifier('hors VR (écran normal) : le focus d’un champ ne fait pas apparaître le clavier virtuel', await ev(() => !document.getElementById('vr-clavier')));

// ── entrée en VR ──
await ev(() => { document.activeElement && document.activeElement.blur(); });
await ev(async () => { await RayleVR.demander(); });
await ev(() => document.getElementById('vr-demande').click()); await attendre(2500);
verifier('session VR démarrée (casque émulé)', await ev(() => RayleVR.etat().entre === true));
verifier('le clavier est monté mais caché tant qu’aucun champ n’a le focus', await ev(() => { const k = document.getElementById('vr-clavier'); return !!k && k.hidden === true; }));
await ev(() => { document.activeElement && document.activeElement.blur(); });

// ── focus d'un champ → le clavier apparaît comme panneau ──
await ev(() => document.getElementById('vr-champ').focus()); await attendre(2200);
const k1 = await ev(() => { const k = document.getElementById('vr-clavier'), P = RayleVR._interne().panneaux.find(p => p.el === k); return { visible: !k.hidden, touches: k.querySelectorAll('[data-k]').length, panneau: !!P, w: P && P.mesh.scale.x, y: P && P.mesh.position.y, champ: k.querySelector('.vk-champ').textContent }; });
verifier('un champ de texte a le focus : le clavier AZERTY apparaît', k1.visible && k1.touches > 40, JSON.stringify(k1));
verifier('le clavier est un panneau 3D de la scène, de taille raisonnable (≤ 1 m de large)', k1.panneau && k1.w > 0.3 && k1.w <= 1.0, JSON.stringify(k1));
verifier('placé sous les yeux (hauteur < 1,4 m) et devant', k1.y < 1.4 && k1.y > 0.8, String(k1.y));
verifier('il nomme le champ visé (accessibilité)', k1.champ === 'Chercher un lieu', k1.champ);
await ev(() => RayleVR._forcerRaster && RayleVR._forcerRaster()); await attendre(500);
verifier('la texture du clavier est remplie (touches dessinées)', await ev(() => { const k = document.getElementById('vr-clavier'), P = RayleVR._interne().panneaux.find(p => p.el === k), g = P.canvas.getContext('2d'), d = g.getImageData(0, 0, P.canvas.width, P.canvas.height).data; let c = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 240) c++; return P.canvas.width > 300 && c > 200; }));
await page.screenshot({ path: 'captures-accueil/v3-vr-clavier.png' });

// ── viser une touche avec la manette et appuyer sur la gâchette ──
const viserTouche = id => ev(async idt => {
  const THREE = await import('three'), { panneaux } = RayleVR._interne(), k = document.getElementById('vr-clavier'), p = panneaux.find(x => x.el === k), b = k.querySelector('[data-k="' + idt + '"]'); if (!b) return false;
  const f = k.getBoundingClientRect(), r = b.getBoundingClientRect(), uv = [(r.left + r.width / 2 - f.left) / f.width, (r.top + r.height / 2 - f.top) / f.height];
  p.mesh.updateMatrixWorld(); const loc = new THREE.Vector3(uv[0] - 0.5, 0.5 - uv[1], 0), cible = loc.applyMatrix4(p.mesh.matrixWorld), o = new THREE.Vector3(0.25, 1.3, -0.1), d = cible.clone().sub(o).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
  const c = window.__xr.controllers.right; c.position.set(o.x, o.y, o.z); c.quaternion.set(q.x, q.y, q.z, q.w); return true;
}, id);
const gachette = async () => { await ev(() => window.__xr.controllers.right.updateButtonValue('trigger', 1)); await attendre(160); await ev(() => window.__xr.controllers.right.updateButtonValue('trigger', 0)); await attendre(260); };
const taper = async id => { const ok = await viserTouche(id); if (!ok) return false; await attendre(260); await gachette(); await attendre(250); await ev(() => RayleVR._forcerRaster && RayleVR._forcerRaster()); return true; };
const valeur = () => ev(() => document.getElementById('vr-champ').value);
await taper('c:b'); await taper('c:o'); await taper('c:n');
verifier('trois touches visées à la manette : « bon » est écrit dans le VRAI champ de la page', await valeur() === 'bon', await valeur());
verifier('le focus est resté sur le champ (on peut continuer à taper)', await ev(() => document.activeElement.id === 'vr-champ'));
verifier('le champ a reçu de vrais événements « input » (insertText)', await ev(() => window.__j.entrees.length >= 3 && window.__j.entrees.every(x => x.startsWith('insertText'))), await ev(() => JSON.stringify(window.__j.entrees)));
await taper('maj'); await taper('c:j'); await taper('c:o'); await taper('c:u'); await taper('c:r');
verifier('⇧ puis « jour » : une seule majuscule', await valeur() === 'bonJour', await valeur());
await taper('accents'); await taper('c:é');
verifier('mode accents : « é » inséré', (await valeur()) === 'bonJouré', await valeur());
await taper('retour');
verifier('⌫ efface le dernier caractère', (await valeur()) === 'bonJour', await valeur());
await taper('lettres'); await taper('espace'); await taper('c:t'); await taper('c:o'); await taper('c:u'); await taper('c:l');
verifier('espace + lettres', (await valeur()) === 'bonJour toul', await valeur());
await taper('gauche'); await taper('gauche'); await taper('c:x');
verifier('flèche gauche ×2 puis une lettre : insertion au milieu du mot', (await valeur()) === 'bonJour toxul', await valeur());
await taper('symboles'); await taper('c:@');
verifier('mode symboles : « @ »', (await valeur()).includes('@'), await valeur());
await taper('lettres');
// entrée : envoi du formulaire
await taper('entree');
verifier('↵ dans un champ de formulaire : le formulaire est envoyé (événement submit)', await ev(() => window.__j.envois.length === 1 && /bonJour/.test(window.__j.envois[0])), await ev(() => JSON.stringify(window.__j.envois)));

// ── zone de texte multiligne ──
await ev(() => document.getElementById('vr-zone').focus()); await attendre(800);
await taper('c:a'); await taper('entree'); await taper('c:b');
verifier('zone multiligne : ↵ fait un saut de ligne (pas d’envoi)', await ev(() => document.getElementById('vr-zone').value === 'a\nb' && window.__j.envois.length === 1), await ev(() => JSON.stringify(document.getElementById('vr-zone').value)));
verifier('le clavier suit le champ actif (nom de la zone)', await ev(() => document.querySelector('#vr-clavier .vk-champ').textContent.length > 0));

// ── champs sans texte : pas de clavier ──
await taper('fermer');
verifier('✕ ferme le clavier', await ev(() => document.getElementById('vr-clavier').hidden === true));
await attendre(1800);
verifier('le panneau du clavier a disparu de la scène une fois fermé', await ev(() => !RayleVR._interne().panneaux.some(p => p.el.id === 'vr-clavier')));
await ev(() => document.getElementById('vr-case').focus()); await attendre(600);
verifier('une case à cocher n’ouvre pas le clavier', await ev(() => document.getElementById('vr-clavier').hidden === true));

// ── retour au champ, majuscules verrouillées ──
await ev(() => { document.getElementById('vr-champ').value = ''; document.getElementById('vr-champ').focus(); }); await attendre(2000);
await viserTouche('maj'); await attendre(260); await gachette(); await gachette(); await taper('c:a'); await taper('c:b');
verifier('double appui sur ⇧ : majuscules verrouillées (AB)', await valeur() === 'AB', await valeur());

// ── sortie de la VR : tout est nettoyé ──
await ev(async () => { await RayleVR.sortir(); }); await attendre(1500);
verifier('sortie de VR : le clavier est retiré de la page', await ev(() => !document.getElementById('vr-clavier') && !document.getElementById('vr-clavier-css')));
verifier('hors VR, un champ n’appelle plus le clavier', await ev(() => { document.getElementById('vr-champ').blur(); document.getElementById('vr-champ').focus(); return !document.getElementById('vr-clavier'); }));
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await nav.close(); serveur.close(); fin();
