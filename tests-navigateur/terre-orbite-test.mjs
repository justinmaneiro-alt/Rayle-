import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';

/* Orbite de la Terre, avec de faux serveurs de tuiles (déterministe, sans réseau) : entrée, interactions, détail progressif, mémoire,
   pannes de sources, recherche, sortie, ré-entrée, mode jeu. Les captures sont dans captures-terre/. */
const { verifier, fin } = compteur();
const faux = await demarrerFauxServeur();
const injecter = async p => { await p.evaluateOnNewDocument(inj => { window.__RAYLE_TERRE_TEST__ = inj; }, faux.injection); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ avant: injecter });
const G = (f, a) => page.evaluate(f, a);
const charge = async (ms = 600) => { await attendreChargement(page, { calme: ms, max: 40000 }); };
const stats = () => page.evaluate(() => {
  const s = window.Terre.stats(), z = s.affichees.map(k => +k.split('/')[0]);
  return { aff: s.affichees.length, zmax: Math.max(0, ...z), zmin: Math.min(99, ...z), tuiles: s.tuiles, bat: s.batiments, vram: s.vram / 1048576 };
});
const ignorees = /faireconomy|404|408|ERR_FAILED|ERR_CONNECTION|Failed to load resource|favicon|INSUFFICIENT/;
const exceptions = () => erreurs.filter(x => !ignorees.test(x) && /pageerror|TypeError|ReferenceError/.test(x)).length;

// ── 1. Entrée : un clic sur la Terre lance le vol, puis l'orbite ──
await entrerEnOrbite(page);
let e = await G(() => ({
  t: window.Terre.etat(), surcharge: window.Galaxie.surchargee(), rot: window.Galaxie.systeme.parId('terre').rot,
  ui: !document.getElementById('terre-ui').hidden, sas: !document.getElementById('sas').hidden, carte: !document.getElementById('carte').hidden,
  classe: document.getElementById('vueGalaxie').classList.contains('terre-orbite')
}));
verifier('un clic sur la Terre entre en orbite', e.t.actif && e.surcharge);
verifier('la Terre a arrêté de tourner', e.rot < 0.05, 'facteur de rotation ' + e.rot.toFixed(3));
verifier('interface de la Terre visible, ni sas ni carte', e.ui && !e.sas && !e.carte && e.classe);
await attendre(1500);
const rot1 = await G(() => window.Galaxie.systeme.parId('terre').sphere.rotation.y); await attendre(1500);
const rot2 = await G(() => window.Galaxie.systeme.parId('terre').sphere.rotation.y);
verifier('la rotation reste arrêtée pendant l’orbite', Math.abs(rot2 - rot1) < 1e-6);
await charge(1500);
await page.screenshot({ path: '../captures-terre/t-orbite.png' });
let s = await stats();
verifier('des tuiles sont affichées dès l’orbite', s.aff >= 4, JSON.stringify(s));
verifier('le vol s’est terminé en orbite', !(await G(() => window.Terre.etat().vol)) && (await G(() => window.Terre.etat().dist)) > 15000);

// ── 2. Interactions ──
const d0 = (await G(() => window.Terre.etat())).dist;
await page.mouse.move(800, 450); await page.mouse.wheel({ deltaY: -700 }); await attendre(900);
const e2 = await G(() => window.Terre.etat());
verifier('la molette change l’altitude', e2.dist < d0 * 0.6, `${d0.toFixed(0)} → ${e2.dist.toFixed(0)} km`);
const avant = await G(() => window.Terre.pointSous(800, 450));
await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(900, 470, { steps: 6 }); await page.mouse.move(980, 500, { steps: 6 });
const sous = await G(() => window.Terre.pointSous(980, 500));
await page.mouse.up(); await attendre(100);
verifier('glisser : le point saisi reste sous le pointeur', avant && sous && Math.abs(avant.lon - sous.lon) < 0.5 && Math.abs(avant.lat - sous.lat) < 0.5, `${JSON.stringify(avant)} → ${JSON.stringify(sous)}`);
await attendre(1800);
const c1 = await G(() => window.Terre.etat());
await page.mouse.move(800, 450); await page.mouse.down({ button: 'right' }); await page.mouse.move(850, 470, { steps: 5 }); await page.mouse.up({ button: 'right' });
const c2 = await G(() => window.Terre.etat());
verifier('clic droit + glisser : change le cap', Math.abs(c2.cap - c1.cap) > 0.1, `${c1.cap.toFixed(2)} → ${c2.cap.toFixed(2)}`);
await G(() => window.Terre.placer({ lon: 2.35, lat: 48.86, dist: 800, cap: 0, incl: 0 })); await attendre(300);
const dd = (await G(() => window.Terre.etat())).dist;
await page.mouse.click(800, 450, { clickCount: 2 }); await attendre(2200);
const dd2 = (await G(() => window.Terre.etat())).dist;
verifier('double-clic : on se rapproche', dd2 < dd * 0.5, `${dd.toFixed(0)} → ${dd2.toFixed(0)} km`);
await G(() => window.Terre.orbite()); await attendre(3200);
verifier('« Orbite » ramène en orbite', (await G(() => window.Terre.etat())).dist > 15000);

// ── 3. Détail progressif selon l’altitude ──
const niveaux = [];
for (const d of [20000, 3000, 300, 30, 3, 1.2]) {
  await G(d => window.Terre.placer({ lon: 2.3522, lat: 48.8566, dist: d, cap: 0.4, incl: d < 100 ? 0.9 : 0 }), d);
  await charge(900);
  const t = await stats(); niveaux.push({ d, ...t });
  if (d === 3 || d === 1.2) await page.screenshot({ path: `../captures-terre/t-detail-${d}.png` });
}
console.log('   niveaux :', niveaux.map(n => `${n.d} km → z${n.zmax} (${n.aff} tuiles${n.bat ? ', ' + n.bat + ' bât.' : ''})`).join(' | '));
verifier('plus on descend, plus les tuiles sont fines', niveaux.every((n, i) => i === 0 || n.zmax >= niveaux[i - 1].zmax) && niveaux[5].zmax >= 15, niveaux.map(n => n.zmax).join(','));
verifier('vue spatiale : niveaux bas seulement', niveaux[0].zmax <= 6);
verifier('bâtiments en volume au sol', niveaux[5].bat > 0, 'meshes : ' + niveaux[5].bat);
verifier('nombre de tuiles raisonnable', niveaux.every(n => n.aff < 450), niveaux.map(n => n.aff).join(','));

// ── 4. Mémoire maîtrisée après une longue promenade ──
const lieux = [[2.35, 48.86], [139.7, 35.7], [-74, 40.7], [31.2, 30], [151.2, -33.9], [-43.2, -22.9], [37.6, 55.8], [77.2, 28.6], [-0.1, 51.5], [18.4, -33.9], [116.4, 39.9], [-99.1, 19.4]];
let pic = 0;
for (let i = 0; i < 36; i++) {
  const [lo, la] = lieux[i % lieux.length], d = [2, 12, 60, 400][i % 4];
  await G(a => window.Terre.placer({ lon: a[0], lat: a[1], dist: a[2], cap: 0.3 * a[3], incl: a[2] < 100 ? 0.7 : 0 }), [lo, la, d, i]);
  await attendre(450);
  const t = await stats(); pic = Math.max(pic, t.tuiles);
}
await charge(1500);
s = await stats();
verifier('mémoire : le nombre de tuiles reste borné', pic <= 460 * 1.25 + 60, `pic ${pic}, final ${s.tuiles}`);
verifier('mémoire vidéo des tuiles raisonnable (< 700 Mo)', s.vram < 700, s.vram.toFixed(0) + ' Mo');

// ── 5. Pannes de sources : on continue à afficher, jamais de plantage ──
const nErr0 = exceptions();
for (const cle of ['relief', 'image', 'vecteur']) {
  faux.reglages[cle] = '404';
  await G(() => { window.Terre.globe.tuiles.vider(); window.Terre.placer({ lon: 2.35, lat: 48.86, dist: 8, cap: 0.2, incl: 0.5 }); });
  await charge(1200);
  const t = await stats();
  verifier(`panne « ${cle} » : le globe s’affiche quand même`, t.aff > 0, JSON.stringify(t));
  faux.reglages[cle] = 'ok';
}
await G(() => { window.Terre.globe.tuiles.vider(); }); await charge(1000);
verifier('après les pannes, tout revient', (await stats()).aff > 0);
verifier('aucune exception JavaScript pendant les pannes', exceptions() === nErr0);

// ── 6. Recherche d’un lieu ──
await G(() => window.Terre.orbite()); await attendre(3000);
await page.type('#terre-ui .t-recherche input', 'Toulouse');
await page.keyboard.press('Enter');
await page.waitForFunction(() => { const t = window.Terre.etat(); return !t.vol && Math.abs(t.lat - 43.6043) < 0.5; }, { timeout: 15000 }).catch(() => {});
e = await G(() => window.Terre.etat());
verifier('recherche « Toulouse » : vol jusqu’à la ville', Math.abs(e.lat - 43.6043) < 0.3 && Math.abs(e.lon - 1.4437) < 0.3 && e.dist < 40, JSON.stringify({ lat: e.lat, lon: e.lon, dist: e.dist }));
verifier('la requête de recherche part vers le service de géocodage', faux.journal.includes('/geocodage'));
const autres = await page.evaluate(() => [...document.querySelectorAll('#terre-ui .t-resultats button')].map(b => b.textContent));
verifier('les autres résultats sont proposés', autres.length === 1 && /Louisiane/.test(autres[0]), autres.join('|'));
await charge(1500);
await page.screenshot({ path: '../captures-terre/t-recherche-toulouse.png' });

// ── 7. Sortie par Échap : retour à la galaxie, la rotation reprend en douceur ──
await page.keyboard.press('Escape'); await attendre(250);   // le premier Échap quitte le champ de recherche, le second sort de la Terre
if (await G(() => window.Terre.etat().actif)) await page.keyboard.press('Escape');
await page.waitForFunction(() => !window.Terre.etat().actif && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 15000 });
e = await G(() => ({
  surcharge: window.Galaxie.surchargee(), ui: !document.getElementById('terre-ui').hidden, rot: window.Galaxie.systeme.parId('terre').rot,
  focus: window.Galaxie.nav.etat().focus, classe: document.getElementById('vueGalaxie').classList.contains('terre-orbite')
}));
verifier('Échap : retour à la galaxie', !e.surcharge && !e.ui && !e.classe && e.focus === 'terre', JSON.stringify(e));
const rotDebut = e.rot; await attendre(2500);
const rotFin = await G(() => window.Galaxie.systeme.parId('terre').rot);
verifier('la rotation de la Terre reprend en douceur', rotFin > 0.7 && rotFin >= rotDebut, `${rotDebut.toFixed(2)} → ${rotFin.toFixed(2)}`);
await page.screenshot({ path: '../captures-terre/t-retour-galaxie.png' });

// ── 8. Ré-entrée ──
await G(() => window.Galaxie.nav.retour()); await attendre(3000);
await G(() => window.Galaxie.nav.allerA('terre', { entrer: true }));   // (la Terre peut passer derrière le soleil à l'écran : on utilise la même commande que la voix)
await page.waitForFunction(() => window.Terre.etat().actif && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 60000 });
verifier('on peut re-entrer en orbite', await G(() => window.Terre.etat().actif));
await attendre(2000);
verifier('tuiles de nouveau affichées', (await stats()).aff > 0);

// ── 9. Mode jeu : qualité basse ──
await G(() => { window.RayleBus.fusion('mode_jeu', { actif: true }); window.RayleBus.emit('mode:jeu', { actif: true }); });
await attendre(700);
e = await G(() => window.Terre.etat());
verifier('mode jeu : profil de rendu « basse »', e.profil === 'basse', e.profil);
await G(() => { window.RayleBus.fusion('mode_jeu', { actif: false }); window.RayleBus.emit('mode:jeu', { actif: false }); });
await attendre(700);
verifier('hors mode jeu : le profil revient', (await G(() => window.Terre.etat().profil)) !== 'basse');

const sansBruit = erreurs.filter(x => !ignorees.test(x));
verifier('aucune erreur dans la console', sansBruit.length === 0, sansBruit.slice(0, 3).join(' || '));
console.log('requêtes reçues par le faux serveur :', faux.journal.length);
await navigateur.close(); await faux.fermer();
process.exit(fin() ? 1 : 0);
