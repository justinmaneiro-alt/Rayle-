import fs from 'node:fs';
import path from 'node:path';
import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';

/* V3 phase 5 : atelier 3D de Neptune — poignées de manipulation (déplacer, tourner, taille) à la souris ET au doigt, aimantation, touches W / E / R / Q / G, et import de VRAIS fichiers FBX
   (texte, écrit par planetes/neptune/outils/fabriquer-fixtures.mjs) et KTX2 : damier non compressé, et vrais fichiers Basis Universal UASTC et ETC1S des exemples de three.js (MIT) transcodés par le transcodeur WebAssembly.
   Lancer : node tests-navigateur/v3-neptune-test.mjs   Ce qui n'est PAS testé ici : le confort des poignées sous de vrais doigts sur une vraie tablette. */
const { verifier, fin } = compteur();
const FIX = path.resolve('tests-navigateur/fixtures-neptune');
for (const f of ['moteur-test.glb', 'solides-test.fbx', 'plan-ktx2-rgba8.glb']) if (!fs.existsSync(path.join(FIX, f))) { console.log('Fichier d’essai absent : ' + f + ' (node planetes/neptune/outils/fabriquer-fixtures.mjs --reseau)'); process.exit(1); }
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900, tactile: true, avant: async p => { await p.evaluateOnNewDocument(() => { window.__dit = []; }); } });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const r0 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'neptune', action: 'entrer_atelier', params: {} }));
verifier('atelier ouvert par le bus d’ordres', r0 && r0.ok && await ev(() => window.Neptune.etat().actif), JSON.stringify(r0));
await page.waitForFunction(() => window.Neptune && window.Neptune.etat().actif && !window.Neptune.etat().transition && !document.getElementById('n-fondu').classList.contains('noir'), { timeout: 60000 });
await attendre(600);
const depot = f => ({ nom: f, b64: fs.readFileSync(path.join(FIX, f)).toString('base64') });
const importer = async fichiers => ev(async lot => { const files = lot.map(x => new File([Uint8Array.from(atob(x.b64), c => c.charCodeAt(0))], x.nom)); return await window.Neptune.importer(files, { garder: false }).then(r => r && { nom: r.nom, meshes: r.meshes, sommets: r.sommets }); }, fichiers.map(depot));
const vider = () => ev(() => { const A = window.Neptune.atelier(); while (A.modele.children.length) { const c = A.modele.children[0]; A.modele.remove(c); } A.selectionner(null); });

// ═══ FBX ═══
const f1 = await importer(['solides-test.fbx']);
verifier('import FBX : 2 maillages', f1 && f1.meshes === 2 && f1.sommets > 20, JSON.stringify(f1));
const fbx = await ev(() => { const A = window.Neptune.atelier(); return { pieces: A.pieces().map(p => p.nom), arbre: document.getElementById('n-arbre').textContent }; });
verifier('FBX : les deux pièces gardent leur nom', fbx.pieces.some(n => /Cube.FBX/.test(n)) && fbx.pieces.some(n => /Pyramide.FBX/.test(n)), JSON.stringify(fbx.pieces));
verifier('FBX : visibles dans l’arbre de pièces', /Cube.FBX/.test(fbx.arbre) && /Pyramide.FBX/.test(fbx.arbre));
const dim = await ev(() => { const A = window.Neptune.atelier(), b = A.stats(); let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; A.pieces().forEach(p => { p.boite && p.boite.min && p.boite.min.forEach((v, i) => { mn[i] = Math.min(mn[i], v); }); }); return { sommets: b.sommets, centres: A.pieces().map(p => p.centre.map(x => +x.toFixed(2))) }; });
verifier('FBX : cube à gauche, pyramide à droite (positions des modèles lues)', dim.centres.length === 2 && Math.abs(dim.centres[0][0] - dim.centres[1][0]) > 2, JSON.stringify(dim.centres));
verifier('FBX : les matériaux ont la couleur du fichier (rouge et bleu)', await ev(() => { const A = window.Neptune.atelier(); const cols = []; A.modele.traverse(o => { if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; cols.push(m.color.r > m.color.b ? 'rouge' : 'bleu'); } }); return cols.sort().join() === 'bleu,rouge'; }));
verifier('FBX : normales présentes (éclairage correct)', await ev(() => { let ok = true; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && !o.geometry.attributes.normal) ok = false; }); return ok; }));
await attendre(400); await page.screenshot({ path: 'captures-accueil/v3-neptune-fbx.png' });
const exp = await ev(async () => { try { const r = await window.Neptune.atelier().exporter('glb', { telechargement: false }); return { ok: true, octets: r.octets }; } catch (e) { return { ok: false, e: String(e && e.message || e) }; } });
verifier('FBX → export GLB possible', exp.ok && exp.octets > 500, JSON.stringify(exp));

// ═══ KTX2 ═══
await vider();
const k1 = await importer(['plan-ktx2-rgba8.glb']);
const t1 = await ev(() => { let t = null; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.material.map) t = { data: !!o.material.map.isDataTexture, comp: !!o.material.map.isCompressedTexture, w: o.material.map.image && o.material.map.image.width, cs: o.material.map.colorSpace }; }); return t; });
verifier('KTX2 non compressé (damier 8×8) : texture chargée sur le plan', k1 && k1.meshes === 1 && t1 && t1.w === 8, JSON.stringify([k1, t1]));
verifier('KTX2 non compressé : espace colorimétrique sRGB', t1 && t1.cs === 'srgb', JSON.stringify(t1));
for (const [fic, nom] of [['plan-ktx2-uastc.glb', 'UASTC'], ['plan-ktx2-etc1s.glb', 'ETC1S']]) {
  if (!fs.existsSync(path.join(FIX, fic))) { console.log('SKIP KTX2 ' + nom + ' : fichier absent (fabriquer-fixtures.mjs --reseau)'); continue; }
  await vider(); const k = await importer([fic]);
  const t = await ev(() => { let t = null; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.material.map) t = { comp: !!o.material.map.isCompressedTexture, w: o.material.map.image && o.material.map.image.width, h: o.material.map.image && o.material.map.image.height, fmt: o.material.map.format }; }); return t; });
  verifier('KTX2 Basis ' + nom + ' : transcodé par le transcodeur WebAssembly (texture compressée GPU)', k && k.meshes === 1 && t && t.comp && t.w >= 4, JSON.stringify([k, t]));
}
await attendre(300); await page.screenshot({ path: 'captures-accueil/v3-neptune-ktx2.png' });

// ═══ POIGNÉES ═══
await vider();
const g1 = await importer(['moteur-test.glb']);
verifier('moteur chargé pour les poignées', g1 && g1.meshes === 12); await attendre(1800);   // la caméra finit de se cadrer
const idP = await ev(() => window.Neptune.atelier().pieces().find(p => p.nom === 'Piston 2').id);
verifier('aucune poignée au départ', await ev(() => window.Neptune.atelier().etat.poignees === null && window.Neptune.atelier().poignee.mode() === null));
await ev(id => window.Neptune.atelier().selectionner(id), idP); await attendre(200);
verifier('poignées activées par le bouton « Déplacer »', await ev(() => { document.querySelector('#neptune-ui [data-a="poignee-deplacer"]').click(); return window.Neptune.atelier().etat.poignees === 'deplacer'; }));
verifier('le bouton est marqué actif', await ev(() => document.querySelector('#neptune-ui [data-a="poignee-deplacer"]').classList.contains('actif')));
await attendre(250); await page.screenshot({ path: 'captures-accueil/v3-neptune-poignees.png' });

/* trouve, sur l'écran, un point où une poignée de l'axe voulu est visée : on avance depuis le centre de la pièce le long de l'axe projeté */
async function trouverPoignee(axe, tactile = false) {
  const info = await ev((id, axe2) => {
    const A = window.Neptune.atelier(), o = A.parId(id), c = o.getWorldPosition(o.position.clone()), r = document.querySelector('#scene3d') ? document.querySelector('#scene3d').getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const pt = v => { const p = v.clone().project(A.camera); return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (-p.y * 0.5 + 0.5) * r.height]; };
    const d = c.clone(); d[axe2] += 0.15; return { c: pt(c), d: pt(d) };
  }, idP, axe);
  const dx = info.d[0] - info.c[0], dy = info.d[1] - info.c[1], n = Math.hypot(dx, dy) || 1;
  for (let k = 25; k <= 190; k += 6) {
    const x = info.c[0] + dx / n * k, y = info.c[1] + dy / n * k;
    if (tactile) { const vise = await ev((x2, y2) => { const A = window.Neptune.atelier(); return A.poignee.appuyer({ clientX: x2, clientY: y2, button: 0, pointerType: 'touch' }) ? (A.poignee.relacher({ clientX: x2, clientY: y2, button: 0 }), true) : false; }, x, y); if (vise) return { x, y, dx: dx / n, dy: dy / n }; }
    else { await page.mouse.move(x, y); await attendre(30); if (await ev(() => window.Neptune.atelier().poignee.visee())) return { x, y, dx: dx / n, dy: dy / n }; }
  }
  return null;
}
const pos = () => ev(id => { const o = window.Neptune.atelier().parId(id); return o.position.toArray().map(v => +v.toFixed(4)); }, idP);
const cam = () => ev(() => { const c = window.Neptune.atelier(); return c.camera.position.toArray().map(v => +v.toFixed(3)); });

// ── souris : déplacer le long de X ──
const ca = await cam(); await attendre(400); const cb = await cam(); verifier('la caméra est immobile sans action (pas de rotation automatique)', ca.every((v, i) => Math.abs(v - cb[i]) < 1e-3), JSON.stringify([ca, cb]));
const p0 = await pos(), c0 = await cam();
const h = await trouverPoignee('x');
verifier('une poignée de l’axe X est trouvée sous la souris', !!h);
if (h) {
  verifier('le curseur devient une main (poignée visée)', await ev(() => document.querySelector('#scene3d').style.cursor === 'grab'));
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + h.dx * 50, h.y + h.dy * 50, { steps: 8 });
  verifier('pendant la saisie : la poignée est « occupée »', await ev(() => window.Neptune.atelier().poignee.occupe()));
  await page.mouse.move(h.x + h.dx * 110, h.y + h.dy * 110, { steps: 8 }); await page.mouse.up(); await attendre(150);
  const p1 = await pos(), c1 = await cam();
  verifier('la pièce s’est déplacée le long de X seulement', Math.abs(p1[0] - p0[0]) > 0.02 && Math.abs(p1[1] - p0[1]) < 1e-3 && Math.abs(p1[2] - p0[2]) < 1e-3, JSON.stringify([p0, p1]));
  verifier('la caméra n’a PAS tourné pendant la saisie', c0.every((v, i) => Math.abs(v - c1[i]) < 1e-3), JSON.stringify([c0, c1]));
  verifier('relâché : plus de saisie', await ev(() => !window.Neptune.atelier().poignee.occupe()));
}
// ── clic dans le vide avec les poignées : la caméra tourne toujours normalement ──
const cAv = await cam(); await page.mouse.move(800, 140); await page.mouse.down(); await page.mouse.move(920, 140, { steps: 6 }); await page.mouse.up(); await attendre(120);
verifier('glisser dans le vide : la caméra tourne encore (orbite intacte)', (await cam()).some((v, i) => Math.abs(v - cAv[i]) > 0.01));

// ── aimantation ──
await ev(id => { const A = window.Neptune.atelier(); A.parId(id).position.set(0, 0.22, 0); A.selectionner(null); A.selectionner(id); }, idP);
verifier('aimantation activée (touche G)', await ev(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); return window.Neptune.atelier().etat.aimant === true; }));
const h2 = await trouverPoignee('x');
if (h2) {
  const q0 = await pos(); await page.mouse.move(h2.x, h2.y); await page.mouse.down(); await page.mouse.move(h2.x + h2.dx * 90, h2.y + h2.dy * 90, { steps: 10 }); await page.mouse.up(); await attendre(150);
  const q1 = await pos(), pas = await ev(() => window.Neptune.atelier().etat.pas);
  verifier('aimantation : le pas est défini (1/20 de la taille du modèle)', pas > 0.001, String(pas));
  verifier('aimantation : la pièce tombe sur un multiple du pas', Math.abs(q1[0] - q0[0]) > 0.005 && Math.abs(q1[0] / pas - Math.round(q1[0] / pas)) < 0.02, JSON.stringify([q0, q1, pas]));
}
await ev(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })));
verifier('aimantation coupée (touche G)', await ev(() => window.Neptune.atelier().etat.aimant === false));

// ── touches W / E / R / Q ──
const touche = async k => { await ev(k2 => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k2, bubbles: true })), k); await attendre(60); return ev(() => window.Neptune.atelier().etat.poignees); };
verifier('touche E : poignées de rotation', await touche('e') === 'tourner');
verifier('touche R : poignées de taille', await touche('r') === 'echelle');
verifier('touche W : poignées de déplacement', await touche('w') === 'deplacer');
verifier('touche Q : poignées retirées', await touche('q') === null);

// ── rotation ──
await touche('e');
const hr = await (async () => { for (let k = 20; k <= 200; k += 5) { const info = await ev((id, kk) => { const A = window.Neptune.atelier(), o = A.parId(id), c = o.getWorldPosition(o.position.clone()), r = document.querySelector('#scene3d').getBoundingClientRect(), p = c.clone().project(A.camera); return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (-p.y * 0.5 + 0.5) * r.height]; }, idP, k); for (let a = 0; a < 360; a += 20) { const x = info[0] + Math.cos(a * Math.PI / 180) * k, y = info[1] + Math.sin(a * Math.PI / 180) * k; await page.mouse.move(x, y); if (await ev(() => window.Neptune.atelier().poignee.visee())) return { x, y, cx: info[0], cy: info[1] }; } } return null; })();
verifier('un anneau de rotation est trouvé', !!hr);
if (hr) {
  const r0 = await ev(id => window.Neptune.atelier().parId(id).quaternion.toArray(), idP);
  await page.mouse.move(hr.x, hr.y); await page.mouse.down(); const ang = Math.atan2(hr.y - hr.cy, hr.x - hr.cx); for (let i = 1; i <= 10; i++) await page.mouse.move(hr.cx + Math.cos(ang + i * 0.08) * Math.hypot(hr.x - hr.cx, hr.y - hr.cy), hr.cy + Math.sin(ang + i * 0.08) * Math.hypot(hr.x - hr.cx, hr.y - hr.cy)); await page.mouse.up(); await attendre(150);
  const r1 = await ev(id => window.Neptune.atelier().parId(id).quaternion.toArray(), idP);
  verifier('la pièce a tourné', r0.some((v, i) => Math.abs(v - r1[i]) > 0.01), JSON.stringify([r0, r1]));
}

// ── taille ──
await touche('r'); await ev(id => { const A = window.Neptune.atelier(); A.parId(id).quaternion.set(0, 0, 0, 1); A.selectionner(null); A.selectionner(id); }, idP);
const he = await trouverPoignee('x');
if (he) {
  const s0 = await ev(id => window.Neptune.atelier().parId(id).scale.toArray(), idP);
  await page.mouse.move(he.x, he.y); await page.mouse.down(); await page.mouse.move(he.x + he.dx * 60, he.y + he.dy * 60, { steps: 8 }); await page.mouse.up(); await attendre(150);
  const s1 = await ev(id => window.Neptune.atelier().parId(id).scale.toArray(), idP);
  verifier('la taille de la pièce a changé', s0.some((v, i) => Math.abs(v - s1[i]) > 0.02), JSON.stringify([s0, s1]));
} else verifier('une poignée de taille est trouvée', false);

// ── AU DOIGT : appui sur une poignée = saisie, la caméra ne bouge pas ──
await touche('w'); await ev(id => { const A = window.Neptune.atelier(); A.parId(id).position.set(0, 0.22, 0); A.parId(id).scale.set(1, 1, 1); A.selectionner(null); A.selectionner(id); }, idP);
const ht = await trouverPoignee('x', true);
verifier('au doigt : une poignée est saisie dès l’appui (pas de survol nécessaire)', !!ht);
if (ht) {
  const t0 = await pos(), ct0 = await cam();
  await page.touchscreen.touchStart(ht.x, ht.y); for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(ht.x + ht.dx * 9 * i, ht.y + ht.dy * 9 * i); await page.touchscreen.touchEnd(); await attendre(200);
  const t1 = await pos(), ct1 = await cam();
  verifier('au doigt : la pièce se déplace', Math.abs(t1[0] - t0[0]) > 0.01, JSON.stringify([t0, t1]));
  verifier('au doigt : la caméra reste immobile', ct0.every((v, i) => Math.abs(v - ct1[i]) < 1e-3));
}

// ── désactivation, sélection vide, sortie ──
await touche('q');
verifier('poignées retirées : plus d’aide visible dans la scène', await ev(() => { let vis = false; window.Neptune.atelier().scene.traverse(o => { if (o.userData && o.userData.__aide && o.type !== 'BoxHelper' && o.visible && o.parent === window.Neptune.atelier().scene) vis = true; }); return !vis; }));
await ev(() => window.Neptune.atelier().selectionner(null));
verifier('aucune pièce choisie : poignées sans effet', await ev(() => { window.Neptune.atelier().poignees('deplacer'); return window.Neptune.atelier().poignee.appuyer({ clientX: 10, clientY: 10, button: 0 }) === false; }));
await ev(() => window.Neptune.sortir ? 0 : 0);
await page.keyboard.press('Escape'); await attendre(1500);
verifier('sortie de l’atelier sans erreur', await ev(() => !window.Neptune.etat().actif));
const graves = erreurs.filter(e => !/favicon|ERR_FAILED|Failed to load resource|404|WebGL|GPU stall|faireconomy|CORS policy/i.test(e));
verifier('aucune erreur JavaScript', graves.length === 0, graves.slice(0, 3).join(' | '));
await navigateur.close(); fin();
