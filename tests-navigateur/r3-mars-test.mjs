import { ouvrirGalaxieTheme, entrerSurMars, attendreMode, attendre, compteur } from './r2-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* R3 phase 1 et 3 dans MARS (thème Aurore, vraie table, vrai terminal) : les 26 panneaux rangés en 7 dossiers, carrousel, sortir / remettre, préréglages, mémoire, souris,
   curseur virtuel de la télécommande (clic, molette, pincement simulé, clic droit), tiroir global. Lancer : node tests-navigateur/r3-mars-test.mjs */
const { verifier, fin } = compteur();
const L = 1920, H = 1080;
const worker = await demarrerFauxWorkerMarche(8797);
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: L, hauteur: H, tactile: true });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.2 })); await attendre(700);
const pos = async id => (await ev(() => window.Mars.positionsEcran())).find(x => x.id === id);
const fenetres = () => ev(() => [...document.querySelectorAll('#mars-terminal .gf')].map(e => e.dataset.id).sort());
const visible = id => ev(id => { const el = document.querySelector('.gf[data-id="' + id + '"]'); if (!el) return false; const r = el.getBoundingClientRect(), c = getComputedStyle(el); return c.opacity === '1' && r.width >= 300 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }, id);
const virtuel = async (x, y) => { for (let i = 0; i < 80; i++) { const fini = await ev((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-140, Math.min(140, x - q.x)), dy: Math.max(-140, Math.min(140, y - q.y)) }); return false; }, x, y); if (fini) break; await attendre(15); } await attendre(200); };
const clicV = async (x, y, bouton = 0) => { await virtuel(x, y); await ev(b => window.Telecommande.appliquer({ a: 'clic', n: 1, bouton: b }), bouton); };
const centreDe = sel => ev(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.width, h: r.height }; }, sel);

// ── ouverture du terminal ──
const f = await pos('graphique-us100');
await page.mouse.click(f.x, f.y); await attendre(2600);
verifier('le terminal s’ouvre avec la fenêtre « Dossiers du terminal »', await ev(() => !!document.querySelector('.gf[data-id="selecteur"]') && /Dossiers/.test(document.querySelector('.gf[data-id="selecteur"] .gf-titre').textContent)));
const dos = await ev(() => [...document.querySelectorAll('.dos-classeur')].map(b => ({ id: b.dataset.dos, nom: b.querySelector('.dos-onglet b').textContent, n: +b.querySelector('.dos-n').textContent })));
verifier('7 dossiers thématiques', dos.length === 7, JSON.stringify(dos.map(d => d.nom)));
verifier('noms : Graphiques, Éco et macro, Actualités, Sentiment de marché, Agent IA, Alertes et veilleur, Performance et risque', dos.map(d => d.nom).join('|') === 'Graphiques|Éco et macro|Actualités|Sentiment de marché|Agent IA|Alertes et veilleur|Performance et risque', dos.map(d => d.nom).join('|'));
verifier('les 27 panneaux sont rangés (aucun oublié)', dos.reduce((a, d) => a + d.n, 0) === 27, String(dos.reduce((a, d) => a + d.n, 0)));
const tous = await ev(() => { const t = window.Mars.terminal(), ids = new Set(); for (const d of ['graphiques', 'macro', 'actus', 'sentiment', 'agent', 'alertes', 'perf']) for (const i of t.dossiers.dossier(d).ids) ids.add(i); return [...ids]; });
verifier('27 identifiants distincts dans les dossiers', tous.length === 27);
verifier('par défaut, seule la fenêtre Dossiers et la fenêtre cliquée sont affichées (pas les 26)', (await fenetres()).length <= 3, (await fenetres()).join());
verifier('contenu cohérent : « Sentiment de marché » = contexte, corrélations, Nasdaq 100', await ev(() => window.Mars.terminal().dossiers.dossier('sentiment').ids.join()) === 'contexte,correlations,heatmap');
verifier('« Éco et macro » = taux, banques, calendrier, COT, publications', await ev(() => window.Mars.terminal().dossiers.dossier('macro').ids.join()) === 'taux,banques,calendrier,cot,publications');
// repartir d'un espace de travail propre
await ev(() => window.Mars.terminal().reinitialiser()); await attendre(800);
verifier('après Réinitialiser, seul le sélecteur de dossiers reste', (await fenetres()).join() === 'selecteur');

// ── souris : ouvrir, naviguer, sortir ──
const cl = await centreDe('.dos-classeur[data-dos="macro"]');
await page.mouse.click(cl.x, cl.y); await attendre(1000);
const carr = () => ev(() => { const v = document.querySelector('.dos-voile'); if (!v) return null; const cs = [...v.querySelectorAll('.dos-carte')]; return { n: cs.length, centre: cs.findIndex(c => c.classList.contains('centre')), titre: v.querySelector('.dos-titre-carte').textContent }; });
let c = await carr(); verifier('un clic sur le classeur « Éco et macro » ouvre un carrousel de 5 cartes', c && c.n === 5 && c.centre === 0, JSON.stringify(c));
await page.keyboard.press('ArrowRight'); await attendre(700); c = await carr(); verifier('flèches : la carte du centre change (Banques centrales)', c.centre === 1 && /Banques/.test(c.titre), JSON.stringify(c));
await page.mouse.move(L / 2, H / 2); await page.mouse.wheel({ deltaY: 120 }); await attendre(700); c = await carr(); verifier('molette : carte suivante', c.centre === 2);
const cc = await centreDe('.dos-carte.centre'); await page.mouse.click(cc.x, cc.y); await attendre(1500);
verifier('un clic sur la carte du centre sort « Calendrier économique » vers l’espace de travail', (await fenetres()).includes('p-calendrier') && await visible('p-calendrier'), (await fenetres()).join());
verifier('le dossier s’est refermé', !(await carr()));
verifier('le classeur affiche « 1 posée »', await ev(() => /1 posée/.test(document.querySelector('.dos-classeur[data-dos="macro"] .dos-pos').textContent)));
// remettre
await ev(() => document.querySelector('.gf[data-id="p-calendrier"] [data-b="ranger"]').click()); await attendre(1000);
verifier('le bouton « remettre dans son dossier » ramène la fenêtre', !(await fenetres()).includes('p-calendrier') && await ev(() => document.querySelector('.dos-classeur[data-dos="macro"] .dos-pos').textContent === ''));
// plusieurs fenêtres : tout afficher
const cm = await centreDe('.dos-classeur[data-dos="perf"]'); await page.mouse.click(cm.x, cm.y); await attendre(900);
await ev(() => document.querySelector('.dos-voile [data-a="tout"]').click()); await attendre(2600);
let fs = await fenetres(); verifier('« Tout afficher » : les 4 fenêtres de Performance et risque', ['p-perf-strategies', 'p-gardien-prop', 'p-journal-tilt', 'p-proba-evaluation'].every(x => fs.includes(x)), fs.join());
verifier('toutes visibles, sans recouvrement', await ev(() => window.Mars.terminal().gestionnaire.recouvrements().length === 0));
// épingle + mémoire
await ev(() => window.Mars.terminal().gestionnaire.epingler('p-gardien-prop', true)); await attendre(200);
const memo = await ev(() => JSON.parse(localStorage.getItem('rayle_fenetres_mars-terminal')));
verifier('positions et épingle mémorisées', memo && memo['p-gardien-prop'] && memo['p-gardien-prop'].e === 1 && Object.keys(memo).length >= 5, JSON.stringify(Object.keys(memo || {})));
const avant = await ev(() => JSON.parse(JSON.stringify(window.Mars.terminal().gestionnaire.obtenir('p-gardien-prop').rect)));
await ev(() => window.Mars.fermerFenetre()); await attendre(1200);
verifier('le terminal se ferme', !(await ev(() => !!window.Mars.terminal())));
await page.mouse.click(f.x, f.y); await attendre(2800);
fs = await fenetres(); const apres = await ev(() => { const o = window.Mars.terminal().gestionnaire.obtenir('p-gardien-prop'); return o && o.rect; });
verifier('à la réouverture, les fenêtres posées reviennent', ['p-perf-strategies', 'p-gardien-prop', 'p-journal-tilt', 'p-proba-evaluation'].every(x => fs.includes(x)), fs.join());
verifier('à la même place et toujours épinglée', apres && Math.abs(apres.x - avant.x) < 3 && Math.abs(apres.y - avant.y) < 3 && await ev(() => window.Mars.terminal().gestionnaire.obtenir('p-gardien-prop').epingle), JSON.stringify([avant, apres]));
// préréglage + réinitialiser
await ev(() => document.querySelector('.tm-presets [data-p="trading"]').click()); await attendre(3000);
fs = await fenetres(); verifier('préréglage Trading : 4 fenêtres + les dossiers', ['p-graphique-us100', 'p-graphique-or', 'p-marche', 'p-dashboard'].every(x => fs.includes(x)) && fs.includes('selecteur'), fs.join());
await ev(() => document.querySelector('.tm-reinit').click()); await attendre(900);
verifier('Réinitialiser : seul le sélecteur reste et la mémoire est vidée', (await fenetres()).join() === 'selecteur');

// ── curseur virtuel de la télécommande ──
const cs = await centreDe('.dos-classeur[data-dos="sentiment"]'); await clicV(cs.x, cs.y); await attendre(1000);
c = await carr(); verifier('télécommande : un clic virtuel ouvre le dossier « Sentiment de marché »', c && c.n === 3, JSON.stringify(c));
await virtuel(L / 2, H / 2 - 60); await ev(() => window.Telecommande.appliquer({ a: 'defile', dx: 0, dy: 120 })); await attendre(800); c = await carr();
verifier('télécommande : la molette virtuelle fait défiler le carrousel', c && c.centre === 1, JSON.stringify(c));
const cv = await centreDe('.dos-carte.centre'); await clicV(cv.x, cv.y); await attendre(1500);
verifier('télécommande : un clic virtuel sur la carte du centre la sort', (await fenetres()).includes('p-correlations') && await visible('p-correlations'), (await fenetres()).join());
// molette / pincement simulé sur la fenêtre
const W = '.gf[data-id="p-correlations"]'; let r0 = await centreDe(W);
const tete = await ev(sel => { const r = document.querySelector(sel + ' .gf-t').getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; }, W);
await virtuel(tete.x, tete.y); await ev(() => window.Telecommande.appliquer({ a: 'zoom', delta: 120 })); await attendre(300); let r1 = await centreDe(W);
verifier('télécommande : le pincement simulé (zoom) agrandit la fenêtre', r1.l > r0.l * 1.05, JSON.stringify([r0.l, r1.l]));
await ev(() => window.Telecommande.appliquer({ a: 'defile', dx: 0, dy: 120 })); await attendre(300); const r2 = await centreDe(W);
verifier('télécommande : la molette sur la barre de titre réduit la fenêtre', r2.l < r1.l, JSON.stringify([r1.l, r2.l]));
await clicV(tete.x, tete.y, 2); await attendre(300);
verifier('télécommande : le clic droit virtuel ouvre le menu de fenêtre', await ev(() => !!document.querySelector('.gfx-menu') && /Épingler/.test(document.querySelector('.gfx-menu').textContent)));
await ev(() => document.querySelector('.gfx-menu [data-m="epingler"]').click()); await attendre(200);
verifier('… et « Épingler » fonctionne', await ev(() => window.Mars.terminal().gestionnaire.obtenir('p-correlations').epingle));

// ── tiroir global ──
await ev(() => window.TiroirFenetres.ouvrir()); await attendre(300);
const tir = await ev(() => ({ n: document.querySelectorAll('.tf-f').length, vues: [...document.querySelectorAll('.tf-vue h3')].map(h => h.textContent) }));
verifier('le tiroir liste toutes les fenêtres du terminal (27) par dossier', tir.n >= 27 && tir.vues.some(v => /Mars/.test(v)), JSON.stringify(tir));
await page.type('.tf-panneau input', 'taux'); await attendre(250);
verifier('la recherche filtre (« taux »)', (await ev(() => [...document.querySelectorAll('.tf-f')].map(b => b.textContent))).some(t => /Taux/.test(t)) && (await ev(() => document.querySelectorAll('.tf-f').length)) <= 3);
await ev(() => [...document.querySelectorAll('.tf-f')].find(b => /Taux/.test(b.textContent)).click()); await attendre(1500);
verifier('un appui dans le tiroir affiche la fenêtre', (await fenetres()).includes('p-taux') && await visible('p-taux'));
verifier('le tiroir se referme', !(await ev(() => document.querySelector('.tf-panneau'))));
await page.keyboard.down('Alt'); await page.keyboard.press('t'); await page.keyboard.up('Alt'); await attendre(300);
verifier('Alt+T ouvre le tiroir', await ev(() => !!document.querySelector('.tf-panneau'))); await page.keyboard.press('Escape'); await attendre(200);

// ── tactile : ouvrir un dossier au doigt ──
await ev(() => window.Mars.terminal().reinitialiser()); await attendre(800);
const cdp = await page.createCDPSession();
const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
const ca = await centreDe('.dos-classeur[data-dos="agent"]'); await toucher('touchStart', [ca]); await toucher('touchEnd', []); await attendre(1000);
c = await carr(); verifier('doigt : un appui ouvre le dossier « Agent IA » (5 cartes)', c && c.n === 5, JSON.stringify(c));
const ct = await centreDe('.dos-carte.centre'); await toucher('touchStart', [ct]); for (let i = 1; i <= 8; i++) { await toucher('touchMove', [{ x: ct.x - i * 40, y: ct.y }]); await attendre(25); } await attendre(150); await toucher('touchEnd', []); await attendre(800);
c = await carr(); verifier('doigt : glisser fait défiler le carrousel', c && c.centre >= 1, JSON.stringify(c));
const cs2 = await centreDe('.dos-carte.centre'); await toucher('touchStart', [cs2]); await toucher('touchEnd', []); await attendre(1500);
verifier('doigt : un appui sur la carte du centre la sort', (await fenetres()).filter(x => x !== 'selecteur').length === 1);
console.log('erreurs page :', erreurs.filter(m => !/faireconomy|ERR_FAILED|404|Failed to load resource|CORS|bls\.gov|tradingview/i.test(m)).slice(0, 6));
await navigateur.close(); worker.close && worker.close();
process.exit(fin() ? 1 : 0);
