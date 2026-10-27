// Le soleil de la galaxie est l'entité Raylé (cyan et blanc, neurones reliés de fins fils, couches concentriques, flashs blancs).
// Vérifie : palette, absence de l'ancien nuage violet / de la couronne, lumière cyan clair sur les planètes, halo discret, flashs, voix,
// luminosité des alentours (le halo ne masque pas les planètes), images par seconde, version allégée en mode jeu.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
const ev = f => page.evaluate(f);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
await ev(() => localStorage.removeItem('rayle_galaxie_reglages'));
await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 90000 });
await attendre(2500);
await ev(() => { document.querySelectorAll('#vueGalaxie .g-aide,#vueGalaxie .g-credits,#g-parole,#etiquette,#carte').forEach(e => e.style.display = 'none'); window.Galaxie.soleil.etat('idle'); });
await attendre(2500);

/* 1. Palette : cyan et blanc, ni bleu-violet ni orange */
const c = await ev(() => window.Galaxie.soleil.couleurs());
v('au repos : cœur bleu-cyan (vert et bleu forts, rouge faible)', c.c[2] > 0.9 && c.c[1] > 0.7 && c.c[0] < 0.4, JSON.stringify(c.c));
v('au repos : nœuds presque blancs', c.d.every(x => x > 0.8), JSON.stringify(c.d));
v('au repos : plus de bleu-violet (l’ancien rouge ≈ vert ≈ 0,4 a disparu)', !(Math.abs(c.c[0] - c.c[1]) < 0.1 && c.c[2] > 0.9));
v('au repos : pas d’orange', !(c.c[0] > 0.8 && c.c[1] < 0.6 && c.c[2] < 0.3));

/* 2. Structure de la scène : pas de couronne, pas d'ancien nuage */
const scene = await ev(() => window.Galaxie.soleil.groupe.children.map(o => o.type + (o.geometry ? ':' + o.geometry.type : '')));
v('plus de couronne ni de plan nuageux autour du soleil', !scene.some(t => /Mesh:PlaneGeometry/.test(t)), scene.join(', '));
v('le soleil = fils + neurones + halo + cœur + lumière', ['LineSegments', 'Points', 'Sprite', 'PointLight'].every(t => scene.some(x => x.startsWith(t))));

/* 3. Lumière des planètes : cyan clair, et halo discret */
const ec = await ev(() => window.Galaxie.soleil.eclat());
v('lumière sur les planètes : cyan très clair (bleu ≥ vert ≥ rouge, tous > 0,75)', ec.lumiere[2] >= ec.lumiere[0] && ec.lumiere[1] >= ec.lumiere[0] && ec.lumiere.every(x => x > 0.75), ec.lumiere.map(x => x.toFixed(2)).join(' '));
v('halo très doux (≤ 0,02) et cœur discret (≤ 0,12)', ec.halo <= 0.02 && ec.coeur <= 0.12, `${ec.halo.toFixed(3)} / ${ec.coeur.toFixed(3)}`);

/* 4. Rendu : couleur dominante cyan, alentours sombres */
await ev(() => { const s = window.Galaxie.soleil; s.flashs = false; window.Galaxie.nav.placer('rayle', { angle: 0, pitch: 0.2 }); }); await attendre(1800);
const photo = async () => PNG.sync.read(Buffer.from(await page.screenshot()));
const analyser = (png, x0, y0, x1, y1, seuil) => {
  let r = 0, g = 0, bl = 0, n = 0, lum = 0, tot = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (png.width * y + x) * 4, L = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]; lum += L; tot++; if (L > seuil) { r += png.data[i]; g += png.data[i + 1]; bl += png.data[i + 2]; n++; } }
  return { r: r / Math.max(1, n), g: g / Math.max(1, n), b: bl / Math.max(1, n), n, lum: lum / tot };
};
let p = await photo();
const centre = analyser(p, 620, 320, 980, 580, 140);
v('pixels brillants du soleil : cyan et blanc (vert > rouge, bleu ≥ vert)', centre.n > 300 && centre.g > centre.r * 1.05 && centre.b >= centre.g * 0.97, JSON.stringify({ n: centre.n, r: Math.round(centre.r), g: Math.round(centre.g), b: Math.round(centre.b) }));
const bords = analyser(p, 520, 640, 1080, 760, 0);   // sous le soleil, là où le halo ne doit pas éblouir
v('alentours non éblouis (luminance moyenne < 70/255)', bords.lum < 70, bords.lum.toFixed(1));
await page.screenshot({ path: 'entite-1-repos.png' });

/* 5. Flash : le nuage passe presque entièrement au blanc, puis revient au cyan */
await ev(() => { window.Galaxie.soleil.flashs = true; window.Galaxie.soleil.flash(1); }); await attendre(380);
const f1 = await ev(() => window.Galaxie.soleil.eclat().flash);
p = await photo(); const fl = analyser(p, 620, 320, 980, 580, 140);
await page.screenshot({ path: 'entite-2-flash.png' });
v('flash : l’enveloppe monte (> 0,6)', f1 > 0.6, f1.toFixed(2));
v('flash : les pixels deviennent blancs (rouge ≈ bleu)', fl.r / fl.b > 0.9, `r/b = ${(fl.r / fl.b).toFixed(2)} (repos : ${(centre.r / centre.b).toFixed(2)})`);
let minFlash = 1; for (let i = 0; i < 70; i++) { await attendre(50); minFlash = Math.min(minFlash, await ev(() => window.Galaxie.soleil.eclat().flash)); }
v('flash : l’entité revient au cyan (enveloppe ≈ 0)', minFlash < 0.05, minFlash.toFixed(3));
// flashs spontanés : l'entité s'illumine d'elle-même à intervalles
await ev(() => { window.Galaxie.soleil.etat('thinking'); });   // flashs fréquents (toutes les ~3 s)
let vus = 0, prec = 0; for (let i = 0; i < 160; i++) { await attendre(50); const f = await ev(() => window.Galaxie.soleil.eclat().flash); if (f > 0.7 && prec <= 0.7) vus++; prec = f; }
v('flashs spontanés : au moins un en 8 s en réflexion', vus >= 1, String(vus));
await ev(() => window.Galaxie.soleil.etat('idle'));

/* 6. États et voix */
await ev(() => { window.Galaxie.soleil.etat('speaking'); }); await attendre(1500);
const amp = await ev(() => window.Galaxie.soleil.eclat().amp);
v('parole : le soleil réagit à l’amplitude de la voix (simulée ou mesurée)', amp > 0.05, amp.toFixed(2));
await ev(() => { window.Galaxie.soleil.amplitude(() => 0.9); }); await attendre(800);
v('amplitude fournie (voix réelle) : prise en compte', (await ev(() => window.Galaxie.soleil.eclat().amp)) > 0.6);
await ev(() => { window.Galaxie.soleil.amplitude(null); window.Galaxie.soleil.etat('idle'); });

/* 7. Images par seconde et mode jeu */
await attendre(1500);
const m = await ev(() => window.Galaxie.mesures(2000));
v('qualité haute : ≥ 60 images/s', m.fps >= 60, `${Math.round(m.fps)} i/s (pire 1 % ${Math.round(m.pire1)})`);
await ev(() => window.Galaxie.nav.placer(null)); await attendre(1200);
const mEns = await ev(() => window.Galaxie.mesures(2000));
v('vue d’ensemble : ≥ 60 images/s', mEns.fps >= 60, `${Math.round(mEns.fps)} i/s`);
await page.screenshot({ path: 'entite-3-ensemble.png' });
await ev(() => window.commandeGalaxie('active le mode jeu')); await attendre(1500);
const jeu = await ev(() => { const s = window.Galaxie.soleil, P = s.groupe.children.find(o => o.isPoints), L = s.groupe.children.find(o => o.isLineSegments); return { pts: P.geometry.drawRange.count, imp: L.material.uniforms.uImpulsions.value, flashs: s.flashs, fl: s.eclat().flash }; });
v('mode jeu : version allégée (1250 neurones, ni impulsions ni flashs)', jeu.pts === 1250 && jeu.imp === 0 && jeu.flashs === false && jeu.fl === 0, JSON.stringify(jeu));
await ev(() => window.commandeGalaxie('désactive le mode jeu')); await attendre(1200);

v('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await b.close();
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
