import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';

/* V2 phase 3 : le bureau de l'accueil JARVIS. Vraies fenêtres du tableau de bord posées dans des fenêtres déplaçables, « Sources en direct » à un endroit prévisible, piles et carrousel,
   arc sans chevauchement, retour dans la colonne, interrupteur de l'ancien système.   Lancer : node tests-navigateur/v2-jarvis-test.mjs */
const { verifier, fin } = compteur();
fs.mkdirSync('captures-accueil', { recursive: true });
const L = 1600, H = 900;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await nav.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', 'jarvis'); localStorage.removeItem('rayle_fenetres_v1'); } catch (e) {} });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(4500);
const ev = (f, ...a) => page.evaluate(f, ...a);
const rect = id => ev(id => { const e = document.querySelector('.gf[data-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), l: Math.round(r.width), h: Math.round(r.height) }; }, id);
const fenetres = () => ev(() => [...document.querySelectorAll('#jarvis-bureau .gf')].map(e => e.dataset.id).sort());
const colonnes = () => ev(() => document.querySelectorAll('#tableau .tb-f').length);

verifier('thème Jarvis, bureau actif', await ev(() => window.JarvisBureau && JarvisBureau.actif()));
verifier('7 fenêtres vivantes dans les colonnes', (await colonnes()) === 7, String(await colonnes()));
verifier('bouton « Bureau » visible', await ev(() => { const b = document.getElementById('btnBureau'); return !!b && b.getBoundingClientRect().width > 20; }));

// ── poser la météo dans une fenêtre ──
await ev(() => document.querySelector('#tableau .tb-f[data-id="meteo"] .tb-pose').click()); await attendre(1800);
verifier('la météo est posée dans une fenêtre déplaçable', (await fenetres()).includes('w-meteo'), (await fenetres()).join());
verifier('…et a quitté sa colonne (6 restent)', (await colonnes()) === 6);
const r1 = await rect('w-meteo'); await attendre(2500); const r2 = await rect('w-meteo');
verifier('la fenêtre ne bouge pas toute seule', JSON.stringify(r1) === JSON.stringify(r2), JSON.stringify([r1, r2]));
verifier('le contenu est celui de la vraie fenêtre (titre « Météo »)', await ev(() => /Météo/.test(document.querySelector('.gf[data-id="w-meteo"] .tb-t h3').textContent)));
verifier('taille lisible (≥ 300 px de large)', r1 && r1.l >= 300 && r1.h >= 200, JSON.stringify(r1));
verifier('pas de recul / flou (opacité 1)', await ev(() => getComputedStyle(document.querySelector('.gf[data-id="w-meteo"] .tb-f')).opacity === '1'));
// glisser par la barre de titre
const tete = await ev(() => { const r = document.querySelector('.gf[data-id="w-meteo"] .gf-t').getBoundingClientRect(); return { x: r.x + 80, y: r.y + r.height / 2 }; });
await page.mouse.move(tete.x, tete.y); await page.mouse.down(); await page.mouse.move(tete.x + 50, tete.y + 40, { steps: 5 }); await page.mouse.move(tete.x + 160, tete.y + 90, { steps: 5 }); await page.mouse.up(); await attendre(700);
const r3 = await rect('w-meteo'); verifier('glisser la barre de titre la déplace', Math.abs(r3.x - r1.x) > 40 || Math.abs(r3.y - r1.y) > 30, JSON.stringify([r1, r3]));
await ev(() => window.JarvisBureau.instance().then(b => b.gestionnaire.dimensionner('w-meteo', 500, 380))); await attendre(300);
const r4 = await rect('w-meteo'); verifier('redimensionner', r4.l === 500 && r4.h === 380, JSON.stringify(r4));
// retour dans la colonne
await ev(() => document.querySelector('.gf[data-id="w-meteo"] [data-b="fermer"]').click()); await attendre(800);
verifier('fermée, la fenêtre revient dans sa colonne (7)', (await colonnes()) === 7 && !(await fenetres()).includes('w-meteo'));

// ── Sources en direct : endroit prévisible ──
await ev(() => document.getElementById('btnSources').click()); await attendre(2500);
const s1 = await rect('w-sources');
verifier('« Sources en direct » s’ouvre dans une fenêtre du bureau', !!s1, JSON.stringify(s1));
verifier('…pas dans le système Panneaux (aucune fenêtre hub-sources)', !(await ev(() => !!document.querySelector('#panneaux .pn[data-id="hub-sources"]'))));
verifier('à droite, sous l’en-tête (endroit prévisible)', s1 && s1.x + s1.l >= L - 30 && s1.y <= 90, JSON.stringify(s1));
verifier('les 6 onglets sont là', await ev(() => ['Événements', 'Communiqués', 'Télévisions', 'Réseaux', 'Podcasts', 'Aujourd'].every(t => document.querySelector('.gf[data-id="w-sources"]').textContent.includes(t))));
await ev(() => document.querySelector('.gf[data-id="w-sources"] [data-b="fermer"]').click()); await attendre(500);
await ev(() => document.getElementById('btnSources').click()); await attendre(1500);
const s2 = await rect('w-sources'); verifier('rouverte : même endroit', JSON.stringify(s1) === JSON.stringify(s2), JSON.stringify([s1, s2]));
await page.screenshot({ path: 'captures-accueil/v2-jarvis-sources.png' });
await ev(() => document.querySelector('.gf[data-id="w-sources"] [data-b="fermer"]').click()); await attendre(400);

// ── piles ──
await ev(() => window.Panneaux && Panneaux.fermerTout()); await attendre(600);   // le message d'accueil de Raylé recouvre le coin gauche
await ev(() => document.getElementById('btnBureau').click()); await attendre(1500);
verifier('« Bureau » ouvre la fenêtre des piles', (await fenetres()).includes('bureau'));
const piles = await ev(() => [...document.querySelectorAll('.dos-classeur')].map(b => b.querySelector('.dos-onglet b').textContent));
verifier('4 piles : Infos du jour, Marchés et agent, Terre et événements, Sources en direct', piles.join('|') === 'Infos du jour|Marchés et agent|Terre et événements|Sources en direct', piles.join('|'));
const cl = await ev(() => { const r = document.querySelector('.dos-classeur[data-dos="infos"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(cl.x, cl.y); await attendre(1500);
verifier('un appui sur la pile ouvre un carrousel de 4 cartes', await ev(() => document.querySelectorAll('.dos-voile .dos-carte').length === 4));
await page.keyboard.press('Enter'); await attendre(2200);
verifier('la fenêtre du centre (Heure et date) est posée', (await fenetres()).includes('w-heure'), (await fenetres()).join());
for (const id of ['actus', 'systeme', 'marche']) await ev(id => window.JarvisBureau.ouvrir(id), id);
await attendre(1500);
await ev(() => window.JarvisBureau.disposer('arc')); await attendre(900);
verifier('arc : aucun chevauchement entre les fenêtres posées', await ev(() => window.JarvisBureau.instance().then(b => b.gestionnaire.recouvrements().length === 0)));
await page.screenshot({ path: 'captures-accueil/v2-jarvis-bureau.png' });
await ev(() => window.JarvisBureau.toutRanger()); await attendre(1200);
verifier('« Tout ranger » : les 7 fenêtres sont revenues dans leurs colonnes', (await colonnes()) === 7, String(await colonnes()));
const e = erreurs.filter(x => !/faireconomy|404|ERR_FAILED|ERR_CONNECTION|Failed to load resource|net::/.test(x)); verifier('aucune erreur JavaScript', !e.length, e.slice(0, 4).join(' | '));
await nav.close(); process.exit(fin() ? 1 : 0);
