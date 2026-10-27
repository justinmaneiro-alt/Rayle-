import fs from 'node:fs';
import { ouvrirGalaxieTheme as ouvrirGalaxie, attendre, compteur } from './r2-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';

/* V3 phase 5 : Terre en MODE LÉGER (carte plate) pour tablette et téléphone, dans la vraie page, avec de faux serveurs de tuiles et un faux Worker (sans réseau).
   Vérifie : sélection automatique selon l'appareil (tablette / téléphone → carte plate, PC → globe 3D, réglage 'leger' / '3d'), dessin des tuiles, glisser / pincer / double appui AU DOIGT (événements tactiles réels),
   recherche de lieux, actualités sur la carte (épingles, fiche, météo), ordres de Raylé (même API que le globe), retour à la galaxie, travail de la carte graphique quasi nul, pannes de tuiles.
   Lancer : node tests-navigateur/v3-terre-leger-test.mjs   Non testé ici : une vraie tablette ou un vrai téléphone (fluidité du glisser, batterie, mémoire). */
const { verifier: v0, fin } = compteur();
const verifier = (n, c, d = '') => v0(n, c, String(d).replace(/\s+/g, ' ').slice(0, 240));
const faux = await demarrerFauxServeur(8123), worker = await demarrerFauxWorker(8795);
fs.mkdirSync('../captures-terre/leger', { recursive: true });
const injecter = async p => { await p.evaluateOnNewDocument((inj, urlWorker) => { window.__RAYLE_TERRE_TEST__ = inj; try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', urlWorker); localStorage.setItem('rayle_worker_token', 'test'); localStorage.removeItem('rayle_terre_leger_vue'); } catch (e) { /* stockage refusé */ } }, faux.injection, worker.url); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 820, hauteur: 1180, tactile: true, avant: injecter });
const G = (f, ...a) => page.evaluate(f, ...a);
const cdp = await page.createCDPSession();
const tactile = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
const geste = async (departs, arrivees, pas = 8) => { await tactile('touchStart', departs); for (let i = 1; i <= pas; i++) { await tactile('touchMove', departs.map((d, k) => ({ x: d.x + (arrivees[k].x - d.x) * i / pas, y: d.y + (arrivees[k].y - d.y) * i / pas }))); await attendre(16); } await tactile('touchEnd', []); };
const tap = async (x, y) => { await tactile('touchStart', [{ x, y }]); await attendre(40); await tactile('touchEnd', []); };
const ignorees = /faireconomy|404|408|502|ERR_FAILED|ERR_CONNECTION|Failed to load resource|favicon|INSUFFICIENT|route inconnue|non configuré|pas à jour|GPU stall|WebGL/;
const exceptions = () => erreurs.filter(x => !ignorees.test(x) && /pageerror|TypeError|ReferenceError/.test(x));
const vue = () => G(() => window.Terre.carte().vue());

// ── 1. tablette : la Terre s'ouvre en carte plate ──
await G(() => window.Galaxie.regler({ appareil: 'tablette' }));
await G(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
await page.waitForFunction(() => window.Terre && window.Terre.mode === 'leger' && window.Terre.etat().entree, { timeout: 60000 });
await attendre(600);
verifier('1. tablette : le module léger a pris le relais (window.Terre.mode = leger)', await G(() => window.Terre.mode === 'leger' && window.TerreLegere === window.Terre));
verifier('1. la carte plate est visible, l’interface du globe est cachée', await G(() => { const u = document.getElementById('terre-leger'), g = document.getElementById('terre-ui'); return !u.hidden && u.getBoundingClientRect().width > 700 && (!g || getComputedStyle(g).display === 'none' || !g.offsetParent); }));
verifier('1. aucune texture ni module 3D du globe chargé (pas de window.Terre.globe)', await G(() => !window.Terre.globe));
verifier('1. des tuiles ont été demandées aux serveurs d’imagerie', faux.journal.some(p => p.startsWith('/gibs/')), faux.journal.slice(0, 3).join(' '));
await page.waitForFunction(() => window.Terre.carte().etat().images > 0 && window.Terre.carte().etat().enAttente === 0, { timeout: 15000 });
await attendre(400);
const px = await G(() => { const c = document.querySelector('#terre-leger canvas'), x = c.getContext('2d'), d = x.getImageData(c.width / 2, c.height / 2, 1, 1).data; return [d[0], d[1], d[2]]; });
verifier('1. le canevas montre l’imagerie (pixel central coloré, pas noir)', px[0] + px[1] + px[2] > 120, JSON.stringify(px));
verifier('1. échelle affichée', await G(() => /\d+\s?k?m/.test(document.querySelector('#terre-leger .tl-echelle span').textContent)));
verifier('1. crédits visibles en bas', await G(() => /NASA GIBS/.test(document.querySelector('#terre-leger .tl-credits').textContent)));
verifier('1. boutons assez grands pour un doigt (≥ 44 px)', await G(() => [...document.querySelectorAll('#terre-leger .tl-b')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 43.5 && b.getBoundingClientRect().width >= 43.5)));
verifier('1. la scène 3D de la galaxie ne dessine presque rien (≤ 30 appels de rendu, contre plusieurs centaines pour la galaxie)', await G(() => { const m = window.Galaxie.mesures(1500); return m.appels <= 30; }), await G(() => JSON.stringify({ appels: window.Galaxie.mesures(1500).appels })));

// ── 2. glisser au doigt ──
const r = await G(() => { const b = document.querySelector('#terre-leger .tl-carte').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
const v1 = await vue();
await geste([{ x: r.x - 150, y: r.y }], [{ x: r.x + 100, y: r.y }]); await attendre(900);
const v2 = await vue();
verifier('2. glisser vers la droite : la carte se déplace vers l’ouest (longitude qui diminue)', v2.lon < v1.lon - 1, JSON.stringify([v1.lon, v2.lon]));
verifier('2. glisser horizontal : la latitude ne bouge presque pas', Math.abs(v2.lat - v1.lat) < 0.5);

// ── 3. pincer ──
const z0 = (await vue()).zoom;
await geste([{ x: r.x - 40, y: r.y }, { x: r.x + 40, y: r.y }], [{ x: r.x - 160, y: r.y }, { x: r.x + 160, y: r.y }], 10); await attendre(500);
const z1 = (await vue()).zoom; verifier('3. deux doigts qui s’écartent : zoom avant (≈ +2 niveaux)', z1 > z0 + 1.4 && z1 < z0 + 2.6, JSON.stringify([z0, z1]));
await geste([{ x: r.x - 160, y: r.y }, { x: r.x + 160, y: r.y }], [{ x: r.x - 60, y: r.y }, { x: r.x + 60, y: r.y }], 10); await attendre(500);
const z2 = (await vue()).zoom; verifier('3. deux doigts qui se rapprochent : zoom arrière', z2 < z1 - 0.8, JSON.stringify([z1, z2]));
const v2b = await vue();
await geste([{ x: r.x, y: r.y + 150 }], [{ x: r.x, y: r.y - 100 }]); await attendre(900);
const v3 = await vue(); verifier('2. glisser vers le haut : la carte suit le doigt, on voit plus au sud (latitude qui diminue)', v3.lat < v2b.lat - 0.3, JSON.stringify([v2b.lat, v3.lat]));

// ── 4. double appui ──
const zd0 = (await vue()).zoom;
await tap(r.x + 20, r.y + 20); await attendre(120); await tap(r.x + 20, r.y + 20); await attendre(900);
const zd1 = (await vue()).zoom; verifier('4. double appui : +1 niveau de zoom', Math.abs(zd1 - (zd0 + 1)) < 0.15, JSON.stringify([zd0, zd1]));

// ── 5. recherche de lieux ──
await G(() => { const i = document.querySelector('#terre-leger .tl-recherche input'); i.value = 'Toulouse'; document.querySelector('#terre-leger .tl-recherche').requestSubmit(); });
await page.waitForFunction(() => document.querySelectorAll('#terre-leger .tl-resultats button').length >= 1, { timeout: 8000 });
verifier('5. la recherche propose des lieux (faux géocodage)', await G(() => /Toulouse/.test(document.querySelector('#terre-leger .tl-resultats').textContent)));
await G(() => document.querySelector('#terre-leger .tl-resultats button').click()); await attendre(1500);
const vt = await vue(); verifier('5. la carte vole vers Toulouse et zoome sur la ville', Math.abs(vt.lat - 43.6) < 0.3 && Math.abs(vt.lon - 1.44) < 0.3 && vt.zoom > 9, JSON.stringify(vt));
await page.waitForFunction(() => window.Terre.carte().etat().enAttente === 0, { timeout: 10000 });

// ── 6. appui sur la carte : point choisi + météo ──
await tap(r.x, r.y); await attendre(700);
verifier('6. un appui bref ouvre la fiche du point choisi', await G(() => !document.querySelector('#terre-leger .tl-feuille').hidden && /Point choisi/.test(document.querySelector('#terre-leger .tl-feuille').textContent)));
await G(() => document.querySelector('#terre-leger [data-a="meteo-point"]').click());
await page.waitForFunction(() => { const el = document.querySelector('#panneaux .pn[data-id="terre-meteo"]'); return !!el && !el.querySelector('.t-charge'); }, { timeout: 15000 });
verifier('6. la météo (même fenêtre que sur le globe) affiche des valeurs réelles du faux Worker', await G(() => { const t = document.querySelector('#panneaux .pn[data-id="terre-meteo"]').innerText; return /°|km\/h|%/.test(t) && !/Indisponible/i.test(t); }), await G(() => document.querySelector('#panneaux .pn[data-id="terre-meteo"]').innerText.slice(0, 100)));
await G(() => { document.querySelector('#terre-leger [data-a="fermer-feuille"]').click(); window.Panneaux && window.Panneaux.fermer('terre-meteo'); });

// ── 7. actualités sur la carte ──
await G(() => document.querySelector('#terre-leger [data-a="france"]').click());
await page.waitForFunction(() => document.querySelectorAll('#terre-leger .tl-pin').length >= 3 && !!document.querySelector('#panneaux .pn[data-id="terre-fil-france"]'), { timeout: 20000 });
await attendre(1500);
const nPins = await G(() => document.querySelectorAll('#terre-leger .tl-pin').length);
verifier('7. « France » : la carte vole sur la France et montre des épingles (≥ 3)', nPins >= 3 && Math.abs((await vue()).lat - 46.6) < 4, nPins);
verifier('7. le panneau « France » (même que le globe) liste les sujets', await G(() => /actualit/i.test(document.querySelector('#panneaux .pn[data-id="terre-fil-france"]').innerText)));
verifier('7. les épingles sont assez grandes pour le doigt (zone d’appui ≥ 44 px)', await G(() => [...document.querySelectorAll('#terre-leger .tl-pin')].every(b => { const r2 = b.getBoundingClientRect(); return r2.width + 18 >= 43.5; })));
const pinPos = await G(() => { const b = document.querySelector('#terre-leger .tl-pin'); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
await G(() => document.querySelector('#terre-leger .tl-pin').click()); await attendre(500);
const fiche = await G(() => { const f = document.querySelector('#terre-leger .tl-feuille'); return { vis: !f.hidden, genre: f.dataset.genre, lien: (f.querySelector('a.tl-f-titre') || {}).href || '', texte: f.innerText }; });
verifier('7. toucher une épingle ouvre la fiche du sujet (titre, média, lien https)', fiche.vis && fiche.genre === 'sujet' && /^https:/.test(fiche.lien) && fiche.texte.length > 30, JSON.stringify(fiche).slice(0, 200));
verifier('7. la fiche ne copie aucun texte d’article (titre, média, date, lieu seulement)', fiche.texte.length < 600);
await G(() => document.querySelector('#panneaux .pn[data-id="terre-fil-france"] [data-voir]').click()); await attendre(1500);
verifier('7. bouton « Voir » du panneau : le sujet s’ouvre sur la carte et le panneau se ferme (petit écran)', await G(() => !document.querySelector('#panneaux .pn[data-id="terre-fil-france"]') && document.querySelector('#terre-leger .tl-feuille').dataset.genre === 'sujet' && !!document.querySelector('#terre-leger .tl-pin.choisi')));
await page.screenshot({ path: '../captures-terre/leger/actualites.png' });

// ── 8. ordres de Raylé (même API que le globe) ──
const api = await G(() => ['volerVers', 'aller', 'afficherFil', 'eclairerSujet', 'apaiserSujets', 'aSujet', 'meteo', 'meteoIci', 'actualites', 'etat', 'afficherEvenements', 'chercher'].filter(n => typeof window.Terre[n] !== 'function'));
verifier('8. toutes les fonctions utilisées par ordres-terre.js existent', api.length === 0, api.join(','));
const o1 = await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'terre', action: 'tourner_vers', params: { lieu: 'Toulouse' } }));
await attendre(1800);
verifier('8. ordre « tourner_vers » : la carte va à Toulouse', o1 && o1.ok !== false && Math.abs((await vue()).lat - 43.6) < 0.4, JSON.stringify(o1));
const ev1 = await G(() => window.Terre.afficherEvenements({}));
verifier('8. événements naturels : réponse honnête (non disponible en mode léger), pas de plantage', ev1 && ev1.ok === false && /léger/.test(ev1.phrase || ''));
const sid = await G(() => { const b = document.querySelector('#terre-leger .tl-pin'); return window.Terre.sujetsEtat().nombre > 0; });
verifier('8. sujets mémorisés', sid === true);

// ── 9. pannes ──
faux.reglages.image = '404'; await G(() => window.Terre.carte().regler({ eox: false })); await G(() => window.Terre.carte().volerVers(100, 10, 5, 1)); await attendre(1500);
verifier('9. imagerie en panne : la carte reste utilisable (pas d’exception)', exceptions().length === 0, exceptions().join(' | '));
verifier('9. aucun trou noir si une image parente existe (repli flou)', await G(() => window.Terre.carte().etat().images > 0));
faux.reglages.image = 'ok'; await G(() => window.Terre.carte().regler({ eox: true }));
worker.scenario ? (worker.scenario.fil = 'panne') : null;

// ── 10. sortie ──
await G(() => document.querySelector('#terre-leger [data-a="quitter"]').click()); await attendre(1500);
verifier('10. « ‹ Galaxie » : la carte se ferme et la galaxie reprend', await G(() => document.getElementById('terre-leger').hidden && !document.getElementById('vueGalaxie').classList.contains('terre-leger-actif')));
verifier('10. la vue est retenue sur l’appareil (rayle_terre_leger_vue)', await G(() => { try { const v = JSON.parse(localStorage.getItem('rayle_terre_leger_vue')); return Number.isFinite(v.lon) && Number.isFinite(v.zoom); } catch (e) { return false; } }));
verifier('10. fenêtres de la Terre fermées en partant', await G(() => !document.querySelector('#panneaux .pn[data-id="terre-fil-france"]')));

// ── 11. réentrée : la vue retenue revient ──
await G(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
await page.waitForFunction(() => window.Terre && window.Terre.mode === 'leger' && window.Terre.etat().entree && !document.getElementById('terre-leger').hidden, { timeout: 30000 });
await attendre(500);
const vr = await vue(); verifier('11. on retrouve la dernière vue (autour de Toulouse ou de la France)', vr.zoom > 3, JSON.stringify(vr));
await G(() => document.querySelector('#terre-leger [data-a="quitter"]').click()); await attendre(1200);

// ── 12. choix du mode : PC → globe 3D ; réglage « leger » → carte même sur PC ──
await G(() => window.Galaxie.regler({ appareil: 'pc' }));
await G(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
await page.waitForFunction(() => window.Terre && window.Terre.etat().actif && window.Terre.etat().entree && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 60000 }).catch(() => {});
verifier('12. PC (auto) : c’est le globe 3D (pas de mode léger)', await G(() => window.Terre.mode !== 'leger' && !!window.Terre.globe));
await G(() => window.Galaxie.nav.fermerSas()); await attendre(1500);
await G(() => { localStorage.setItem('rayle_terre_vue', 'leger'); });
await G(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
await page.waitForFunction(() => window.Terre && window.Terre.mode === 'leger' && !document.getElementById('terre-leger').hidden, { timeout: 30000 }).catch(() => {});
verifier('12. réglage rayle_terre_vue = leger : carte plate même sur PC', await G(() => window.Terre.mode === 'leger' && !document.getElementById('terre-leger').hidden));
await G(() => { document.querySelector('#terre-leger [data-a="globe"]').click(); });
verifier('12. bouton « Globe 3D » : mémorise le choix et prévient', await G(() => localStorage.getItem('rayle_terre_vue') === '3d' && /globe 3D/i.test(document.querySelector('#terre-leger .tl-info').textContent)));

verifier('aucune exception JavaScript', exceptions().length === 0, exceptions().join(' | '));
await navigateur.close(); faux.fermer && faux.fermer(); worker.fermer && worker.fermer(); fin();
process.exit(0);
