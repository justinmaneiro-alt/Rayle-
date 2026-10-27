// Ceinture d'astéroïdes : cailloux irréguliers en instances, relief rocheux, couleurs variées, rotations lentes, éclairage cohérent, qualités et mode jeu, 60 i/s.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=2560,1440'] });
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
await ev(() => localStorage.removeItem('rayle_galaxie_reglages'));
await page.click('#btnOuvrirGalaxie');
await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 90000 });
await attendre(2500);
await ev(() => document.querySelectorAll('#vueGalaxie .g-aide,#vueGalaxie .g-credits,#g-parole,#carte,#etiquette,.g-titre,#fil,.g-reglages,#g-retour,#g-jeu,#alertes').forEach(e => e.style.display = 'none'));

/* 1. Structure : instances, modèles variés, matières */
const st = await ev(() => {
  const g = window.Galaxie.scene.getObjectByName('ceinture'), ms = g.children.filter(o => o.isInstancedMesh);
  const rayonsVariables = m => { const p = m.geometry.attributes.position, r = []; for (let i = 0; i < p.count; i += 3) r.push(Math.hypot(p.getX(i), p.getY(i), p.getZ(i))); const mo = r.reduce((a, c) => a + c, 0) / r.length; return Math.sqrt(r.reduce((a, c) => a + (c - mo) ** 2, 0) / r.length) / mo; };
  return { n: ms.length, geos: new Set(ms.map(m => m.geometry.uuid)).size, instances: ms.reduce((t, m) => t + m.count, 0),
    sansSphere: ms.every(m => rayonsVariables(m) > 0.1), relief: ms.every(m => m.material.map && m.material.normalMap), metal: ms.filter(m => m.material.metalness > 0.5).length,
    couleurs: new Set(ms.filter(m => m.instanceColor).flatMap(m => Array.from({ length: Math.min(m.count, 60) }, (_, j) => { const a = m.instanceColor.array; return [a[j * 3], a[j * 3 + 1], a[j * 3 + 2]].map(x => x.toFixed(1)).join(); }))).size,
    info: window.Galaxie.ceinture.info() };
});
v('ceinture en instances : de 8 à 30 maillages instanciés pour 3 000 astéroïdes', st.n >= 8 && st.n <= 30 && st.instances === 3000, `${st.n} maillages, ${st.instances} instances`);
v('au moins 10 formes différentes (5 modèles × tailles)', st.geos >= 10, String(st.geos));
v('aucune sphère : chaque modèle a un relief irrégulier (> 10 % de variation de rayon)', st.sansSphere);
v('texture rocheuse + carte de normales sur chaque matière', st.relief);
v('des reflets métalliques sur quelques-uns', st.metal >= 1, String(st.metal));
v('couleurs variées (au moins 8 teintes distinctes)', st.couleurs >= 8, String(st.couleurs));
v('triangles en qualité haute : de 0,5 à 4 millions', st.info.triangles > 5e5 && st.info.triangles < 4e6, String(st.info.triangles));

/* 2. Qualités et mode jeu : moins d'astéroïdes et modèles plus simples */
const q = {};
for (const n of ['moyenne', 'basse', 'haute']) { await ev(n => window.Galaxie.qualite(n), n); await attendre(500); q[n] = await ev(() => window.Galaxie.ceinture.info()); }
v('qualité haute : 3 000 astéroïdes', q.haute.actifs === 3000 && q.haute.niveau === 'haute', JSON.stringify(q.haute));
v('qualité moyenne : 1 400 astéroïdes, modèles plus simples', q.moyenne.actifs === 1400 && q.moyenne.niveau === 'moyenne' && q.moyenne.triangles < q.haute.triangles * 0.6, `${q.moyenne.triangles} triangles`);
v('qualité basse : 500 astéroïdes, modèles très simples', q.basse.actifs === 500 && q.basse.niveau === 'basse' && q.basse.triangles < q.moyenne.triangles * 0.5, `${q.basse.triangles} triangles`);
await ev(() => window.commandeGalaxie('active le mode jeu')); await attendre(1200);
const jeu = await ev(() => window.Galaxie.ceinture.info());
v('mode jeu : peu d’astéroïdes (150) et modèles minimaux', jeu.actifs === 150 && jeu.niveau === 'basse' && jeu.triangles < q.basse.triangles, JSON.stringify(jeu));
await ev(() => window.commandeGalaxie('désactive le mode jeu')); await attendre(1500);
v('sortie du mode jeu : tout est rétabli', (await ev(() => window.Galaxie.ceinture.info())).actifs === 3000);

/* 3. Mouvement : chacun tourne et se déplace */
await ev(() => window.Galaxie.ceinture.figer(false));
const m0 = await ev(() => { const m = window.Galaxie.scene.getObjectByName('ceinture').children.find(o => o.isInstancedMesh && o.count > 20); return Array.from(m.instanceMatrix.array.slice(0, 16 * 20)); });
await attendre(1500);
const m1 = await ev(() => { const m = window.Galaxie.scene.getObjectByName('ceinture').children.find(o => o.isInstancedMesh && o.count > 20); return Array.from(m.instanceMatrix.array.slice(0, 16 * 20)); });
let bouges = 0; for (let j = 0; j < 20; j++) { let d = 0; for (let k = 0; k < 16; k++) d += Math.abs(m0[j * 16 + k] - m1[j * 16 + k]); if (d > 1e-4) bouges++; }
v('les astéroïdes tournent et avancent (20 / 20 ont bougé en 1,5 s)', bouges === 20, String(bouges));

/* 4. Éclairage cohérent et opacité : un gros caillou, côté soleil puis côté ombre */
await ev(() => window.Galaxie.ceinture.figer(true));
const gros = await ev(() => { const c = window.Galaxie.ceinture, i = c.plusGros(); return c.echantillon(i); });
const pixels = async clip => PNG.sync.read(Buffer.from(await page.screenshot({ clip })));
const lum = p => { let s = 0, n = 0; for (let i = 0; i < p.data.length; i += 4) { s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]; n++; } return s / n; };
const ecart = (a, c) => { let m = 0; for (let i = 0; i < a.data.length; i += 4) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a.data[i + k] - c.data[i + k])); return m; };
const CENTRE = { x: 780, y: 430, width: 40, height: 40 };
const vers = async cote => {   // cote = +1 : caméra côté soleil ; -1 : côté ombre
  const yaw = Math.atan2(-gros.z * cote, -gros.x * cote);
  await ev((g, yaw) => window.Galaxie.nav.placer(null, { point: [g.x, g.y, g.z], distance: Math.max(1.6, g.taille * 5), yaw, pitch: 0.05 }), gros, yaw); await attendre(700);
};
const ciel = oui => ev(oui => { window.Galaxie.scene.getObjectByName('ciel').visible = oui; }, oui);
await vers(+1); const clair = lum(await pixels(CENTRE));
await vers(-1);
await ciel(true); await attendre(200); const sombreAvec = await pixels(CENTRE); await ciel(false); await attendre(200); const sombreSans = await pixels(CENTRE); await ciel(true);
const lSombre = lum(sombreAvec);
await page.screenshot({ path: 'asteroide-ombre.png' });
v('une face éclairée (côté soleil) nettement plus claire que la face sombre', clair > lSombre * 2 && clair > 12, `${clair.toFixed(1)} vs ${lSombre.toFixed(1)}`);
v('face sombre pleine et opaque : le ciel ne passe pas à travers (écart ≤ 4)', ecart(sombreAvec, sombreSans) <= 4, String(ecart(sombreAvec, sombreSans)));
await vers(+1); await page.screenshot({ path: 'asteroide-eclaire.png' });

/* 5. Images par seconde au cœur de la ceinture */
await ev(() => { window.Galaxie.ceinture.figer(false); window.Galaxie.nav.placer(null, { point: [61, 0, 0], distance: 5, yaw: 1.2, pitch: 0.12 }); }); await attendre(1500);
const f1 = await ev(() => window.Galaxie.mesures(2000));
v('dans la ceinture, qualité haute : ≥ 60 images/s (1600×900)', f1.fps >= 60, `${Math.round(f1.fps)} i/s (pire 1 % ${Math.round(f1.pire1)})`);
await page.setViewport({ width: 2560, height: 1440 }); await attendre(1500);
const f2 = await ev(() => window.Galaxie.mesures(2000));
v('dans la ceinture, qualité haute : ≥ 60 images/s (2560×1440)', f2.fps >= 60, `${Math.round(f2.fps)} i/s (pire 1 % ${Math.round(f2.pire1)})`);
await page.setViewport({ width: 1600, height: 900 });

v('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
await b.close();
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
