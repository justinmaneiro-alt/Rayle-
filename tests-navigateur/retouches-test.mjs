import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const skin = fs.readFileSync(RACINE + 'skins/neurone/entite.js', 'utf8');
const SKIN = {};
for (const m of skin.matchAll(/^\s{4}(idle|veille|listening|thinking|speaking|alerte):\s*\{c:\[([^\]]+)\],d:\[([^\]]+)\]/gm)) SKIN[m[1]] = { c: m[2].split(',').map(Number), d: m[3].split(',').map(Number) };

// Au repos et en écoute, l’entité de la galaxie est cyan et blanche (référence vidéo) ; réflexion, parole et alerte gardent les couleurs de entite.js
SKIN.idle = { c: [.28, .78, 1.0], d: [.86, .97, 1.0] }; SKIN.veille = { c: [.30, .82, 1.0], d: [.88, .98, 1.0] }; SKIN.listening = { c: [.30, .85, 1.0], d: [.90, .98, 1.0] };

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=3840,2160'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900 });
const erreurs = [];
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const ev = f => page.evaluate(f);
const dire = t => page.evaluate(t => commandeGalaxie(t), t);
const lum = (png, x0, y0, w, h) => { let s = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (png.width * y + x) * 4; s += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]; n++; } return s / n; };
const photo = async (clip) => PNG.sync.read(Buffer.from(await page.screenshot({ clip })));

await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
await ev(() => localStorage.removeItem('rayle_galaxie_reglages'));
await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 60000 });
await attendre(2500);
await ev(() => { document.querySelectorAll('#vueGalaxie .g-aide,#vueGalaxie .g-credits,#g-parole,#etiquette,#carte').forEach(e => e.style.display = 'none'); });

/* 1. Couleurs d'origine et lumière douce du soleil */
const comparer = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.02);
for (const etat of ['idle', 'veille', 'listening', 'thinking', 'speaking', 'alerte']) {
  await ev(`window.Galaxie.soleil.etat('${etat}')`); await attendre(2300);
  const c = await ev(() => window.Galaxie.soleil.couleurs());
  v(`couleurs attendues (cyan et blanc au repos, skin pour les autres états) : ${etat}`, comparer(c.c, SKIN[etat].c) && comparer(c.d, SKIN[etat].d), JSON.stringify(c) + ' attendu ' + JSON.stringify(SKIN[etat]));
}
const orange = ([r, g, b]) => r > 0.8 && g > 0.25 && g < 0.6 && b < 0.3;
v('aucun orange hors état « alerte » (celui du skin d’origine)', ['idle', 'veille', 'listening', 'thinking', 'speaking'].every(e => !orange(SKIN[e].c) && !orange(SKIN[e].d)));
await ev(() => window.Galaxie.soleil.etat('idle')); await attendre(2300);
const ec = await ev(() => window.Galaxie.soleil.eclat());
v('halo nettement plus faible (≤ 0,03 ; avant 0,055)', ec.halo <= 0.03, ec.halo.toFixed(3));
v('cœur lumineux discret', ec.coeur <= 0.1, ec.coeur.toFixed(3));

/* 2. Nuage de neurones */
const nuage = await ev(() => { const G = window.Galaxie, g = G.soleil.groupe; const P = g.children.find(o => o.isPoints), L = g.children.find(o => o.isLineSegments); return { n: G.soleil.reseau.N, aretes: G.soleil.reseau.aretes.length, pts: P.geometry.drawRange.count, lignes: L.geometry.drawRange.count / 2, imp: L.material.uniforms.uImpulsions.value }; });
v('milliers de neurones et de connexions', nuage.n >= 10000 && nuage.aretes >= 12000, `${nuage.n} neurones, ${nuage.aretes} connexions`);
v('haute : tout le réseau affiché, impulsions actives', nuage.pts === nuage.n && nuage.imp === 1 && nuage.lignes === nuage.aretes, JSON.stringify(nuage));
const rendu = async q => { await ev(`window.Galaxie.qualite('${q}')`); await attendre(400); return ev(() => { const g = window.Galaxie.soleil.groupe; const P = g.children.find(o => o.isPoints), L = g.children.find(o => o.isLineSegments); return { pts: P.geometry.drawRange.count, lignes: L.geometry.drawRange.count / 2, imp: L.material.uniforms.uImpulsions.value }; }); };
const moy = await rendu('moyenne'), bas = await rendu('basse');
v('moyenne : sous-ensemble réparti (7000 neurones)', moy.pts === 7000 && moy.lignes < nuage.aretes && moy.lignes > 5000 && moy.imp === 1, JSON.stringify(moy));
v('basse : 2500 neurones, impulsions coupées', bas.pts === 2500 && bas.lignes > 400 && bas.imp === 0, JSON.stringify(bas));
await ev(() => window.Galaxie.qualite('haute')); await attendre(500);
// animation continue : deux images à 700 ms d'écart doivent différer dans la zone du soleil
await ev(() => window.Galaxie.nav.placer('rayle', { angle: 0, pitch: 0.2 })); await attendre(1500);
const zone = { x: 560, y: 220, width: 480, height: 460 };
const p1 = await photo(zone); await attendre(700); const p2 = await photo(zone);
let diff = 0; for (let i = 0; i < p1.data.length; i += 4) if (Math.abs(p1.data[i] - p2.data[i]) + Math.abs(p1.data[i + 2] - p2.data[i + 2]) > 30) diff++;
v('le nuage est animé en continu (impulsions et dérive)', diff / (p1.width * p1.height) > 0.004, (diff / (p1.width * p1.height) * 100).toFixed(2) + ' % des pixels changent');
await page.screenshot({ path: 'e3-soleil.png' });

/* 3. Face nuit éclairée, différence jour/nuit conservée */
await ev(() => window.Galaxie.nav.placer('terre', { angle: 2.5, pitch: 0.1 })); await attendre(1500);
const nuit = lum(await photo({ x: 700, y: 330, width: 200, height: 240 }), 0, 0, 200, 240);
await ev(() => window.Galaxie.nav.placer('terre', { angle: 0.3, pitch: 0.2 })); await attendre(1500);
const jour = lum(await photo({ x: 700, y: 330, width: 200, height: 240 }), 0, 0, 200, 240);
v('face nuit : plus totalement noire (luminance moyenne > 8/255)', nuit > 8, nuit.toFixed(1));
v('différence jour/nuit conservée (jour ≥ 3× la nuit)', jour > nuit * 3, `jour ${jour.toFixed(0)} / nuit ${nuit.toFixed(0)}`);
await ev(() => window.Galaxie.nav.placer('jupiter', { angle: 2.7, pitch: 0.1 })); await attendre(1500);
const nuitJ = lum(await photo({ x: 700, y: 330, width: 200, height: 240 }), 0, 0, 200, 240);
v('Jupiter, face nuit : relief et bandes devinés (> 8/255)', nuitJ > 8, nuitJ.toFixed(1));

/* 4. Vitesses */
const taux = async () => { const a = await ev(() => { const t = window.Galaxie.systeme.parId('terre'); return { o: t.angle, r: t.sphere.rotation.y, t: performance.now() }; }); await attendre(4000); const b = await ev(() => { const t = window.Galaxie.systeme.parId('terre'); return { o: t.angle, r: t.sphere.rotation.y, t: performance.now() }; }); const dt = (b.t - a.t) / 1000; return { orbite: (b.o - a.o) / dt, rot: (b.r - a.r) / dt }; };
const t1 = await taux();
const attOrb = 2 * Math.PI / 92 * 0.5, attRot = 0.35 * 0.5;
v('révolution de la Terre : moitié moins vite', Math.abs(t1.orbite / attOrb - 1) < 0.08, `${t1.orbite.toFixed(4)} rad/s (attendu ${attOrb.toFixed(4)})`);
v('rotation de la Terre : moitié moins vite', Math.abs(t1.rot / attRot - 1) < 0.08, `${t1.rot.toFixed(4)} rad/s (attendu ${attRot.toFixed(4)})`);
await ev(() => window.Galaxie.regler({ vitesse: 200 }));
const t2 = await taux();
v('curseur « vitesse du système » à 200 % : double', Math.abs(t2.orbite / t1.orbite - 2) < 0.2 && Math.abs(t2.rot / t1.rot - 2) < 0.2, `${(t2.orbite / t1.orbite).toFixed(2)}×`);
await page.click('#g-reglages-btn'); await attendre(300);
v('le panneau ⚙ expose le curseur', await ev(() => document.getElementById('gp-vitesse').value === '200' && /200/.test(document.getElementById('gp-vitesse-val').textContent)));
await ev(() => { const e = document.getElementById('gp-vitesse'); e.value = 100; e.dispatchEvent(new Event('input', { bubbles: true })); });
await attendre(200);
v('curseur remis à 100 %', await ev(() => window.Galaxie.reglages().vitesse === 100));
await ev(() => window.Galaxie.panneau.fermer());
await ev(() => window.Galaxie.regler({ vitesse: 20 })); const t3 = await taux();
v('20 % : cinq fois plus lent', Math.abs(t3.orbite / t1.orbite - 0.2) < 0.05, `${(t3.orbite / t1.orbite).toFixed(2)}×`);
await ev(() => window.Galaxie.reinitialiser());

/* 5. La Lune */
const lune = await ev(() => { const G = window.Galaxie, T = G.systeme.parId('terre'); return { n: T.satellites.length, rayon: T.config.satellites[0].rayon, cible: G.nav.cibles().includes('lune') }; });
v('la Lune est en orbite autour de la Terre et dans les cibles', lune.n === 1 && lune.cible, JSON.stringify(lune));
// rotation synchrone : la même face regarde toujours la Terre
const synchro = async () => ev(() => { const G = window.Galaxie, T = G.systeme.parId('terre'), L = T.satellites[0].vaisseau; L.updateMatrixWorld(true); const m = L.matrixWorld.elements; const axe = { x: -m[0], y: -m[1], z: -m[2] }; const l = Math.hypot(axe.x, axe.y, axe.z); const pl = L.getWorldPosition(G.camera.position.clone()), pt = T.porteur.getWorldPosition(G.camera.position.clone()); const d = { x: pt.x - pl.x, y: pt.y - pl.y, z: pt.z - pl.z }; const ld = Math.hypot(d.x, d.y, d.z); return (axe.x * d.x + axe.y * d.y + axe.z * d.z) / (l * ld); });
const s1 = await synchro(); await attendre(4000); const s2 = await synchro(); await attendre(4000); const s3 = await synchro();
v('rotation synchrone : l’axe de la face visible suit la direction de la Terre', Math.abs(s1 - s2) < 0.01 && Math.abs(s2 - s3) < 0.01 && Math.abs(s1) > 0.9, [s1, s2, s3].map(x => x.toFixed(3)).join(' / '));
const mouv = await ev(() => { const G = window.Galaxie, L = G.systeme.parId('terre').satellites[0].vaisseau; const a = L.getWorldPosition(G.camera.position.clone()).toArray(); return a; });
await attendre(3000);
const mouv2 = await ev(() => { const G = window.Galaxie, L = G.systeme.parId('terre').satellites[0].vaisseau; return L.getWorldPosition(G.camera.position.clone()).toArray(); });
v('la Lune se déplace sur son orbite', Math.hypot(mouv[0] - mouv2[0], mouv[1] - mouv2[1], mouv[2] - mouv2[2]) > 0.3);
// sélectionnable à la souris
await ev(() => window.Galaxie.nav.placer(null, { distance: 40 })); await ev(() => window.Galaxie.nav.placer('terre', { angle: 0.6, pitch: 0.5, distance: 28 })); await attendre(1200);
const ecran = await ev(() => { const G = window.Galaxie, L = G.systeme.parId('terre').satellites[0].vaisseau; const p = L.getWorldPosition(G.camera.position.clone()).project(G.camera); return { x: (p.x * .5 + .5) * innerWidth, y: (-p.y * .5 + .5) * innerHeight, devant: p.z < 1 }; });
await page.mouse.move(ecran.x, ecran.y); await attendre(300);
v('survol de la Lune détecté', (await ev(() => window.Galaxie.nav.etat())).survol === 'lune', JSON.stringify(ecran));
await page.mouse.click(ecran.x, ecran.y); await attendre(300);
v('clic : la Lune est sélectionnée, carte affichée', (await ev(() => window.Galaxie.nav.etat())).selection === 'lune' && await ev(() => document.getElementById('carte-titre').textContent === 'Lune'));
await page.mouse.click(ecran.x, ecran.y, { clickCount: 2 }); await attendre(3600);
const e = await ev(() => window.Galaxie.nav.etat());
v('double-clic : vol jusqu’à la Lune puis sas', e.focus === 'lune' && e.sas === true, JSON.stringify(e));
v('distance d’arrivée cohérente avec sa taille', Math.abs(e.distance - 0.95 * 4.2) < 0.6 || e.distance < 8, e.distance.toFixed(2));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await attendre(3500);
// à la voix
for (const phrase of ['va sur la Lune', 'montre-moi la Lune', 'emmène-moi sur la Lune']) {
  await ev(() => window.Galaxie.nav.retour()); await attendre(3200);
  const r = await dire(phrase); await attendre(3500);
  v(`voix : « ${phrase} »`, r === 'Cap sur la Lune.' && (await ev(() => window.Galaxie.nav.etat())).focus === 'lune', r);
}
await ev(() => window.Galaxie.nav.retour()); await attendre(3200);

/* 6. Espacement et cohérence */
const orbites = await ev(() => window.Galaxie.registre.planetes.map(p => ({ id: p.id, d: p.distance, r: p.rayon, a: p.anneaux ? p.anneaux.exterieur : 0 })));
const ecarts = orbites.slice(1).map((o, i) => o.d - orbites[i].d);
v('planètes plus espacées qu’avant (écart minimal ≥ 8, avant : 6)', Math.min(...ecarts) >= 8, ecarts.join(', '));
v('Neptune ≥ 130 (avant : 104)', orbites.find(o => o.id === 'neptune').d >= 130);
v('ceinture entre Mars et Jupiter', (() => { const c = 57, c2 = 66, mars = orbites.find(o => o.id === 'mars'), jup = orbites.find(o => o.id === 'jupiter'); return c > mars.d + mars.r && c2 < jup.d - jup.r; })());
v('anneaux de Saturne n’atteignent pas Jupiter ni Uranus', (() => { const s = orbites.find(o => o.id === 'saturne'), j = orbites.find(o => o.id === 'jupiter'), u = orbites.find(o => o.id === 'uranus'); return s.d - s.a > j.d + j.r && s.d + s.a < u.d - u.r; })());
const dist = await ev(() => window.Galaxie.nav.etat().distance);
v('caméra d’accueil : vue d’ensemble à 130', Math.abs(dist - 130) < 3, dist.toFixed(0));
const visibles = await ev(() => window.Galaxie.registre.planetes.filter(p => { const G = window.Galaxie, o = G.systeme.parId(p.id); const q = o.porteur.getWorldPosition(G.camera.position.clone()).project(G.camera); return Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && q.z < 1; }).length);
v('la vue d’ensemble montre au moins 6 planètes sur 8', visibles >= 6, visibles + '/8');
let ratios = [];
for (const id of ['mercure', 'terre', 'mars', 'jupiter', 'saturne', 'neptune']) {
  await ev(`window.Galaxie.nav.allerA('${id}')`); await attendre(3500);
  const d = await ev(() => window.Galaxie.nav.etat().distance); const r = orbites.find(o => o.id === id).r;
  ratios.push(`${id} ${d.toFixed(1)}/${r}`);
  if (Math.abs(d - Math.max(r * 4.2, 3.5)) > 0.8) v(`distance d’arrivée ${id}`, false, d.toFixed(2));
}
v('distances d’arrivée proportionnelles au rayon (4,2×)', !ratios.some(x => x.includes('NaN')), ratios.join(' · '));
await ev(() => window.Galaxie.nav.retour()); await attendre(3200);
v('retour à l’accueil à 130', Math.abs((await ev(() => window.Galaxie.nav.etat().distance)) - 130) < 3);

/* 7. Mode jeu */
await dire('active le mode jeu'); await attendre(2500);
const jeu = await ev(() => { const g = window.Galaxie.soleil.groupe; const P = g.children.find(o => o.isPoints), L = g.children.find(o => o.isLineSegments); return { pts: P.geometry.drawRange.count, imp: L.material.uniforms.uImpulsions.value, cour: window.Galaxie.soleil.flashs, fps: window.Galaxie.mesures(1500) }; });
v('mode jeu : 1250 neurones, impulsions et flashs coupés, 30 i/s', jeu.pts === 1250 && jeu.imp === 0 && jeu.cour === false && jeu.fps.fps < 36, JSON.stringify({ pts: jeu.pts, imp: jeu.imp, cour: jeu.cour, fps: Math.round(jeu.fps.fps) }));
await dire('désactive le mode jeu'); await attendre(1500);
const retour = await ev(() => window.Galaxie.soleil.groupe.children.find(o => o.isPoints).geometry.drawRange.count);
v('sortie du mode jeu : réseau complet', retour === 12000, String(retour));

/* 8. Performances */
await ev(() => window.Galaxie.regler({ fpsMax: 0 }));
const mesure = async (w, h) => { await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 }); await attendre(1500); const out = {}; for (const vue of [null, 'rayle', 'terre']) { await ev(`window.Galaxie.nav.placer(${vue ? "'" + vue + "'" : 'null'}, {})`); await attendre(2500); const m = await ev(() => window.Galaxie.mesures(2000)); out[vue || 'ensemble'] = `${Math.round(m.fps)} i/s (1 % ${Math.round(m.pire1)}, GPU ${m.gpuMs ? m.gpuMs.toFixed(1) : '?'} ms)`; } return out; };
const hd = await mesure(1600, 900), qhd = await mesure(2560, 1440), uhd = await mesure(3840, 2160);
console.log('   1600×900 :', JSON.stringify(hd)); console.log('   2560×1440 :', JSON.stringify(qhd)); console.log('   3840×2160 :', JSON.stringify(uhd));
const mini = o => Math.min(...Object.values(o).map(s => parseInt(s)));
v('au moins 60 i/s en qualité haute (900p, 1440p, 4K)', mini(hd) >= 60 && mini(qhd) >= 60 && mini(uhd) >= 60, `${mini(hd)} / ${mini(qhd)} / ${mini(uhd)}`);

console.log(`\n${ok} réussis, ${ko} échecs · erreurs console : ${erreurs.filter(x => !/calendar|faireconomy|ERR_FAILED|404/.test(x)).length}`);
await navigateur.close();
