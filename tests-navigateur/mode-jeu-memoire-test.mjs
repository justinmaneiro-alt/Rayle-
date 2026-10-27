import puppeteer from 'puppeteer-core';
import { compteur, attendre, CHROME, BASE } from './terre-aide.mjs';
/* Le mode jeu allège l'accueil TEMPORAIREMENT : fermer Rayle pendant le mode jeu ne doit pas laisser « 2D très léger » enregistré (sinon l'accueil reste en mode léger :
   plus de médias automatiques ni de vignettes, sans que personne l'ait choisi). Un choix fait dans ⚙ reste, lui, mémorisé. */
const { verifier, fin } = compteur();
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 800 });
await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', 'auto'); } });
await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
const qual = () => p.evaluate(() => localStorage.getItem('rayle_entite_qualite'));
verifier('départ : qualité enregistrée = auto', await qual() === 'auto');
await p.evaluate(() => window.RayleGalaxie.preparer()); 
const r = await p.evaluate(() => RayleOrdres.envoyer({ de: 'rayle', vers: 'rayle', action: 'mode_jeu', params: { etat: 'actif' } }));
await attendre(1500);
verifier('mode jeu activé', r.ok && await p.evaluate(() => document.body.classList.contains('mode-jeu')), JSON.stringify(r));
verifier('mode jeu : le dessin 2D léger est utilisé pour la durée du jeu', await p.evaluate(() => Entite.info().moteur === '2d'));
verifier('mode jeu : la qualité n’est PAS enregistrée (toujours « auto » dans le stockage)', await qual() === 'auto', await qual());
await p.reload({ waitUntil: 'load' }); await attendre(3500);   // = fermer Rayle pendant le mode jeu, puis le rouvrir
verifier('après fermeture en plein mode jeu : le stockage n’a pas gardé « 3 »', await qual() !== '3', await qual());
verifier('… et l’accueil n’est pas forcé en 2D', await p.evaluate(() => !document.body.classList.contains('mode-jeu')));
// sortie normale du mode jeu
await p.evaluate(() => window.RayleGalaxie.preparer());
await p.evaluate(() => RayleOrdres.envoyer({ de: 'rayle', vers: 'rayle', action: 'mode_jeu', params: { etat: 'actif' } })); await attendre(800);
await p.evaluate(() => RayleOrdres.envoyer({ de: 'rayle', vers: 'rayle', action: 'mode_jeu', params: { etat: 'inactif' } })); await attendre(1500);
verifier('sortie du mode jeu : qualité restaurée (auto)', await qual() === 'auto' && await p.evaluate(() => !document.body.classList.contains('mode-jeu')), await qual());
// un choix volontaire dans ⚙ reste enregistré
await p.evaluate(() => Entite.qualite(3)); 
verifier('un choix volontaire « très léger » reste mémorisé', await qual() === '3');
await p.evaluate(() => Entite.qualite('auto'));
await b.close(); fin();
