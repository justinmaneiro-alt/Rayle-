import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre, compteur } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* Mars sur téléphone et tablette : qualité réduite, interface lisible dans un petit écran, gestes tactiles (pincer pour zoomer, toucher pour entrer / ouvrir une fenêtre),
   boutons pour entrer et sortir (pas de clavier ni de molette). */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (!localStorage.getItem('rayle_mars_trading')) localStorage.setItem('rayle_mars_trading', JSON.stringify({ source: 'rayle', dock: 'correlations' })); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1000, hauteur: 700, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await attendre(600);
await ev(() => window.Galaxie.regler({ appareil: 'telephone', qualite: 'auto', fpsMax: 0 })); await attendre(400);
const etat = () => ev(() => window.Mars.etat());
const cdp = await page.createCDPSession();
const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const pincer = async (de, vers, pas = 8) => {      // deux doigts : écart de `de` à `vers` (pixels), centrés sur l'écran
  const cx = 195, cy = 640, p = e => [{ x: cx - e / 2, y: cy, id: 1 }, { x: cx + e / 2, y: cy, id: 2 }];
  await toucher('touchStart', p(de));
  for (let i = 1; i <= pas; i++) { await toucher('touchMove', p(de + (vers - de) * i / pas)); await attendre(40); }
  await toucher('touchEnd', []); await attendre(300);
};
await entrerSurMars(page);
let e = await etat();
verifier('1. téléphone : profil de qualité basse', e.profil === 'basse', e.profil);
const visible = sel => ev(s => { const el = document.querySelector(s); if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }, sel);
verifier('1. boutons « Entrer dans la base » et « Quitter Mars » entièrement dans l’écran', await visible('#m-entrer') && await visible('#m-quitter'));
verifier('1. barre de l’heure entièrement dans l’écran', await visible('.m-heure'));
const chevauche = await ev(() => { const a = document.querySelector('.m-boutons').getBoundingClientRect(), b = document.querySelector('.m-heure').getBoundingClientRect(), c = document.querySelector('.m-titre').getBoundingClientRect(); const inter = (x, y) => !(x.right < y.left || x.left > y.right || x.bottom < y.top || x.top > y.bottom); return { bh: inter(a, b), tb: inter(c, a) }; });
verifier('1. boutons, titre et barre de l’heure ne se chevauchent pas', !chevauche.bh && !chevauche.tb, JSON.stringify(chevauche));
const taille = await ev(() => Array.from(document.querySelectorAll('#m-entrer,#m-quitter,#m-auto')).map(b => Math.round(b.getBoundingClientRect().height)));
verifier('1. cibles tactiles d’au moins 30 px de haut', taille.every(h => h >= 30), taille.join(','));

// pincer pour zoomer sur la base
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 2, lat: 18.4 + 2, dist: 100 + 60 })); await attendre(800);
const d0 = (await etat()).dist;
await pincer(60, 220); await attendre(800);
const d1 = (await etat()).dist;
verifier('2. pincer (écarter les doigts) rapproche de Mars', d1 < d0 - 5, d0.toFixed(1) + ' → ' + d1.toFixed(1));
await pincer(220, 60); await attendre(800);
const d2 = (await etat()).dist;
verifier('2. rapprocher les doigts éloigne', d2 > d1 + 3, d1.toFixed(1) + ' → ' + d2.toFixed(1));
// glisser avec un doigt : la planète tourne
const l0 = (await etat()).lon;
await toucher('touchStart', [{ x: 150, y: 640, id: 1 }]); for (let i = 1; i <= 6; i++) { await toucher('touchMove', [{ x: 150 + i * 20, y: 640, id: 1 }]); await attendre(40); } await toucher('touchEnd', []); await attendre(300);
verifier('2. un doigt qui glisse fait tourner la planète', Math.abs((await etat()).lon - l0) > 0.05, l0 + ' → ' + (await etat()).lon);
// pincer jusqu'à la base : l'entrée par zoom marche aussi au toucher
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 1.5, lat: 18.4 + 1.5, dist: 100 + 28 })); await attendre(800);
for (let i = 0; i < 5 && (await etat()).mode === 'orbite'; i++) { await pincer(60, 230); await attendre(500); }
await attendreMode(page, 'interieur', 40000);
verifier('3. en pinçant sur la base, on entre dans le salon', (await etat()).mode === 'interieur');
verifier('3. bouton « Sortir de la base » visible', await visible('#m-sortir-base'));

// toucher une fenêtre holographique
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.05, avancee: 0.35 })); await attendre(800);
const fens = await ev(() => window.Mars.positionsEcran());
const f = fens.find(x => x.devant && x.x > 20 && x.x < 370 && x.y > 50 && x.y < 800);
verifier('4. au moins une fenêtre holographique est à l’écran du téléphone', !!f, JSON.stringify(fens.map(x => [x.id, Math.round(x.x), Math.round(x.y)])));
if (f) {
  await toucher('touchStart', [{ x: f.x, y: f.y, id: 1 }]); await attendre(60); await toucher('touchEnd', []); await attendre(2500);
  e = await etat();
  verifier('4. toucher une fenêtre ouvre l’espace de travail en grand', e.fenetre !== null && await ev(() => !!document.querySelector('.pn.large .tg-espace') || !!document.querySelector('.gf[data-id^="p-"]')), String(e.fenetre));
  const r = await ev(() => { const p = document.querySelector('.pn.large').getBoundingClientRect(); return { l: p.left, r: p.right, t: p.top, b: p.bottom }; });
  verifier('4. l’espace de travail tient dans l’écran du téléphone', r.l >= -1 && r.r <= 391 && r.t >= -1 && r.b <= 845, JSON.stringify(r));
  const barre = await ev(() => Array.from(document.querySelectorAll('.tg-chip,.tg-unite,.tg-btn,.tg-onglet')).filter(b => b.offsetParent !== null).map(b => { const q = b.getBoundingClientRect(); return { h: Math.round(q.height), t: b.textContent.slice(0, 12) }; }));
  verifier('4. boutons du terminal (instruments, unités, panneaux) d’au moins 34 px de haut', barre.length > 15 && barre.filter(x => x.h < 34).length === 0, JSON.stringify(barre.filter(x => x.h < 34)));
  const graph = await ev(() => { const g = document.querySelector('.tg-graphique').getBoundingClientRect(); return { w: Math.round(g.width), h: Math.round(g.height) }; });
  verifier('4. le graphique occupe la largeur du téléphone et au moins 300 px de haut', graph.w >= 340 && graph.h >= 300, JSON.stringify(graph));
  const ch = await ev(() => { const b = document.querySelector('.tg-chip[data-id="XAU"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await toucher('touchStart', [{ x: ch.x, y: ch.y, id: 1 }]); await attendre(60); await toucher('touchEnd', []); await attendre(2500);
  verifier('4. toucher « Or » change l’instrument', (await ev(() => window.Mars.espace())).instrument === 'XAU');
  verifier('4. sur téléphone : indicateurs allégés par défaut (MA200, volume, RSI, niveaux)', await ev(() => { const s = window.Mars.espace().graphique.series; return !s.includes('bollH') && !s.includes('macdH') && s.includes('ma200'); }));
  await page.screenshot({ captureBeyondViewport: false, path: 'captures-mars/tactile-espace.png' });
  await ev(() => document.querySelector('.pn[data-id="mars-espace"] .pn-x').click()); await attendre(800);
  verifier('4. la croix ferme l’espace de travail', (await etat()).fenetre === null && !(await ev(() => document.querySelector('.pn.large'))));
}
// sortir avec le bouton, puis quitter Mars avec le bouton
await ev(() => document.getElementById('m-sortir-base').click()); await attendreMode(page, 'orbite', 30000);
verifier('5. le bouton « Sortir de la base » ramène en orbite', (await etat()).mode === 'orbite');
await ev(() => document.getElementById('m-quitter').click());
await page.waitForFunction(() => !window.Mars.etat().actif && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: 30000 });
verifier('5. le bouton « Quitter Mars » ramène à la galaxie', !(await etat()).actif);
// (les captures d'écran viennent à la fin : Chrome réinitialise l'émulation tactile après une capture)
verifier('6. aucune erreur JavaScript', erreurs.filter(x => !/faireconomy|ERR_FAILED|404|Failed to load/.test(x)).length === 0, erreurs.join(' | '));
await navigateur.close(); await worker.fermer();
process.exit(fin() ? 1 : 0);
