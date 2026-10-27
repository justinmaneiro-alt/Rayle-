import { ouvrirGalaxie, positionTerre, attendre, compteur } from './terre-aide.mjs';

/* Entrer et sortir en zoomant : molette vers la Terre → vol puis orbite ; dézoomer loin → retour à la galaxie, sans clignotement. */
const { verifier, fin } = compteur();
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const ev = (f, ...a) => page.evaluate(f, ...a);
const actif = () => ev(() => !!(window.Terre && window.Terre.etat().actif));
const attendreActif = (oui, max = 40000) => page.waitForFunction(o => !!(window.Terre && window.Terre.etat().actif) === o && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: max }, oui);
await ev(() => { window.Galaxie.nav.placer(null, {}); window.__entrees = 0; window.__sorties = 0; window.addEventListener('terre:entree', () => window.__entrees++); window.addEventListener('terre:sortie', () => window.__sorties++); });
await attendre(800);

// 1. molette vers l'avant, souris sur la Terre : la caméra vole, puis l'orbite s'engage seule
let p = await positionTerre(page);
await page.mouse.move(p.x, p.y);
await page.mouse.wheel({ deltaY: -120 });
await attendre(300);
verifier('1. la molette sur la Terre lance un vol vers elle (galaxie)', await ev(() => window.Galaxie.nav.etat().vol));
await attendreActif(true);
const e1 = await ev(() => ({ rot: window.Galaxie.systeme.parId('terre').rotCible, nav: window.Galaxie.nav.etat() }));
verifier('1. l’orbite s’engage toute seule à l’arrivée', await actif());
verifier('1. la rotation de la Terre (galaxie) est figée en orbite', e1.rot === 0);

// 2. dézoomer : retour à la galaxie, sans clignotement
await ev(() => { window.Terre.placer({ dist: 6371 * 3.2 }); });
await attendre(600);
await page.mouse.move(800, 450);
for (let i = 0; i < 5; i++) { await page.mouse.wheel({ deltaY: -120 }); await attendre(80); }   // un peu de zoom avant : rien ne se passe
verifier('2. zoomer vers l’avant en orbite reste en orbite', await actif());
for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 120 }); await attendre(120); }
await attendreActif(false, 15000);
const apres = await ev(() => ({ nav: window.Galaxie.nav.etat(), rot: window.Galaxie.systeme.parId('terre').rotCible, sorties: window.__sorties }));
verifier('2. dézoomer loin ramène à la galaxie', !(await actif()));
verifier('2. la rotation de la Terre reprend', apresRot(apres.rot));
function apresRot(r) { return r === 1; }
verifier('2. la caméra de la galaxie reste sur la Terre', apres.nav.focus === 'terre', JSON.stringify(apres.nav));
const rayon = 3.2, dist = apres.nav.distance / rayon;
verifier('2. elle est assez loin pour ne pas ré-entrer (> 3,6 rayons : hystérésis)', dist > 3.8, dist.toFixed(2) + ' rayons');
await attendre(3500);
verifier('2. pas de clignotement : toujours dans la galaxie 3,5 s après, une seule sortie', !(await actif()) && (await ev(() => window.__sorties)) === 1);

// 3. aucune entrée automatique sans geste de zoom vers l'avant
await ev(() => window.Galaxie.nav.placer('terre', { distance: 3.2 * 3.0 }));
await attendre(1800);
verifier('3. près de la Terre sans toucher la molette : pas d’entrée automatique', !(await actif()));

// 4. zoom progressif à la molette depuis la distance d'arrivée : l'orbite s'engage sous le seuil
await ev(() => window.Galaxie.nav.placer('terre', { distance: 3.2 * 5 }));
await attendre(800);
p = await positionTerre(page); await page.mouse.move(p.x, p.y);
let entree = false;
for (let i = 0; i < 30 && !entree; i++) { await page.mouse.wheel({ deltaY: -100 }); await attendre(180); entree = await ev(() => window.Galaxie.nav.etat().sas); }
verifier('4. le zoom progressif engage l’orbite sous le seuil', entree);
await attendreActif(true);
verifier('4. une seule entrée de plus (pas de rebond)', (await ev(() => window.__entrees)) === 2, String(await ev(() => window.__entrees)));

console.log('erreurs :', erreurs.filter(e => !/faireconomy|404|408|ERR_FAILED|Failed to load/.test(e)).join('\n  ') || 'aucune');
await navigateur.close();
process.exit(fin() ? 1 : 0);
