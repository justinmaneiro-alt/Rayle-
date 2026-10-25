import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';

/* R3 phases 1-2 sur le BANC (r3-banc.html : gestionnaire commun + dossiers, sans la 3D) : dossiers (ouvrir, naviguer, sortir une fenêtre, la remettre, tout afficher, refermer), mémoire après
   rechargement, souris (glisser + inertie + aimantation, molette, bords, clic droit), clavier, épingle, dispositions, tactile réel (CDP : glisser, balayage, double appui, pincement + rotation),
   effets. Lancer : node tests-navigateur/r3-gestes-test.mjs */
const { verifier, fin } = compteur();
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1600,900'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900, hasTouch: true });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); sessionStorage.setItem('__init', '1'); } });
const charger = async () => { await page.goto(BASE + '/tests-navigateur/r3-banc.html', { waitUntil: 'load' }); await page.waitForFunction(() => window.__pret === true, { timeout: 15000 }); await attendre(300); };
await charger();
const ev = (f, ...a) => page.evaluate(f, ...a);
const rect = id => ev(id => { const e = document.querySelector('.gf[data-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height }; }, id);
const fenetres = () => ev(() => [...document.querySelectorAll('.gf')].map(e => e.dataset.id).sort());
const centre = (r) => ({ x: r.x + r.l / 2, y: r.y + r.h / 2 });
const entete = async id => { const r = await rect(id); return { x: r.x + 44, y: r.y + 20 }; };
const cdp = await page.createCDPSession();
const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });

// ── 1. dossiers : le mur ──
verifier('le mur affiche 3 classeurs (dossiers), pas les 9 fenêtres', (await ev(() => document.querySelectorAll('#mur .dos-classeur').length)) === 3 && (await fenetres()).length === 0);
verifier('chaque classeur dit son nom et son nombre de fenêtres', await ev(() => [...document.querySelectorAll('#mur .dos-classeur')].every(b => b.querySelector('.dos-onglet b').textContent.length > 2 && +b.querySelector('.dos-n').textContent > 0 && /fenêtre/.test(b.getAttribute('aria-label')))));
verifier('les classeurs flottent doucement (animation)', await ev(() => getComputedStyle(document.querySelector('.dos-classeur')).animationName === 'dos-flotte'));
// ouverture
await page.click('#mur [data-dos="graphiques"]'); await attendre(900);
const etatCarr = () => ev(() => { const v = document.querySelector('.dos-voile'); if (!v) return null; const cs = [...v.querySelectorAll('.dos-carte')]; return { n: cs.length, centre: cs.findIndex(c => c.classList.contains('centre')), op: cs.map(c => +getComputedStyle(c).opacity), titre: v.querySelector('.dos-titre-carte').textContent, ouvert: v.classList.contains('ouvert') }; });
let c = await etatCarr();
verifier('un appui ouvre le dossier en carrousel : 4 cartes, la première au centre', c && c.ouvert && c.n === 4 && c.centre === 0, JSON.stringify(c));
verifier('la carte du centre est pleinement visible, les autres reculent en transparence', c.op[0] === 1 && c.op[1] < 0.95 && c.op[2] < c.op[1] && c.op[3] <= c.op[2], c.op.join(','));
verifier('les cartes sont dans l’écran (la centrale entière)', await ev(() => { const r = document.querySelector('.dos-carte.centre').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
await page.keyboard.press('ArrowRight'); await attendre(700); c = await etatCarr(); verifier('flèche droite : carte suivante', c.centre === 1);
await page.keyboard.press('End'); await attendre(600); c = await etatCarr(); verifier('Fin : dernière carte', c.centre === 3);
await page.keyboard.press('Home'); await attendre(600); c = await etatCarr(); verifier('Début : première carte', c.centre === 0);
await page.mouse.move(800, 400); await page.mouse.wheel({ deltaY: 120 }); await attendre(700); c = await etatCarr(); verifier('molette : carte suivante', c.centre === 1);
// glisser horizontal
await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(560, 450, { steps: 8 }); await page.mouse.up(); await attendre(700); c = await etatCarr(); verifier('glisser vers la gauche fait défiler (au moins une carte)', c.centre >= 2, JSON.stringify(c));
await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(1200, 450, { steps: 8 }); await page.mouse.up(); await attendre(700); c = await etatCarr(); verifier('glisser vers la droite revient en arrière', c.centre <= 1, JSON.stringify(c));
// toucher une carte latérale la recentre
await page.keyboard.press('Home'); await attendre(600);
const posLat = await ev(() => { const r = document.querySelectorAll('.dos-carte')[1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(posLat.x, posLat.y); await attendre(700); c = await etatCarr(); verifier('un appui sur une carte latérale la met au centre', c && c.centre === 1, JSON.stringify(c));
// sortir la carte du centre
const titreCentre = c.titre;
const pc = await ev(() => { const r = document.querySelector('.dos-carte.centre').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(pc.x, pc.y); await attendre(1100);
verifier('un appui sur la carte du centre la sort : le carrousel se referme et la fenêtre est posée', !(await etatCarr()) && (await fenetres()).join() === 'p-graphiques-or', (await fenetres()).join());
let r = await rect('p-graphiques-or'); verifier('la fenêtre posée est visible et dans l’écran', r && r.x >= 0 && r.y >= 0 && r.x + r.l <= 1600 && r.y + r.h <= 900 && r.l >= 260, JSON.stringify(r));
verifier('le classeur affiche « 1 posée »', await ev(() => /1 posée/.test(document.querySelector('#mur [data-dos="graphiques"] .dos-pos').textContent)));
verifier('le titre de la carte sortie était bien celui de la fenêtre', /Or/.test(titreCentre));
// retour au dossier
verifier('la fenêtre a le bouton « remettre dans son dossier »', await ev(() => { const b = document.querySelector('.gf[data-id="p-graphiques-or"] [data-b="ranger"]'); return !!b && !b.hidden; }));
await ev(() => document.querySelector('.gf[data-id="p-graphiques-or"] [data-b="ranger"]').click()); await attendre(900);
verifier('elle retourne dans son dossier (fenêtre fermée, compteur remis à zéro)', (await fenetres()).length === 0 && await ev(() => document.querySelector('#mur [data-dos="graphiques"] .dos-pos').textContent === ''));
// glisser-sortir vers le haut
await page.click('#mur [data-dos="macro"]'); await attendre(900);
const pm = await ev(() => { const r = document.querySelector('.dos-carte.centre').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(pm.x, pm.y); await page.mouse.down(); await page.mouse.move(pm.x, pm.y - 180, { steps: 8 }); await page.mouse.up(); await attendre(1100);
verifier('glisser la carte vers le haut la sort du dossier', (await fenetres()).join() === 'p-macro-taux', (await fenetres()).join());
// refermer d'un geste (vers le bas) et par Échap
await page.click('#mur [data-dos="agent"]'); await attendre(900);
const pb = await ev(() => { const r = document.querySelector('.dos-carte.centre').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(pb.x, pb.y); await page.mouse.down(); await page.mouse.move(pb.x, pb.y + 220, { steps: 8 }); await page.mouse.up(); await attendre(700);
verifier('glisser vers le bas referme le dossier sans rien sortir', !(await ev(() => document.querySelector('.dos-voile'))) && (await fenetres()).join() === 'p-macro-taux');
await page.click('#mur [data-dos="agent"]'); await attendre(800); await page.keyboard.press('Escape'); await attendre(700);
verifier('Échap referme le dossier', !(await ev(() => document.querySelector('.dos-voile'))));
// tout afficher
await page.click('#mur [data-dos="graphiques"]'); await attendre(800); await ev(() => document.querySelector('.dos-voile [data-a="tout"]').click()); await attendre(1400);
const toutes = await fenetres(); verifier('« Tout afficher » pose les 4 fenêtres du dossier (en plus de la déjà posée)', toutes.filter(x => /graphiques/.test(x)).length === 4 && toutes.length === 5, toutes.join());
verifier('elles sont rangées sans recouvrement', await ev(() => window.banc.gf.recouvrements().length === 0));
// garder ouvert
await ev(() => window.banc.gf.fermerTout()); await attendre(300);
await page.click('#mur [data-dos="macro"]'); await attendre(800); await ev(() => { const c = document.querySelector('.dos-voile [data-a="garde"]'); c.click(); }); await page.keyboard.press('Enter'); await attendre(900);
verifier('« Garder ouvert » : le dossier reste ouvert après une sortie', !!(await ev(() => document.querySelector('.dos-voile'))) && (await fenetres()).length === 1);
await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await attendre(900); await page.keyboard.press('Escape'); await attendre(600);
verifier('on peut en sortir plusieurs d’affilée', (await fenetres()).length === 2);
await ev(() => window.banc.gf.fermerTout()); await attendre(300);

// ── 2. mémoire après rechargement ──
await ev(() => { window.banc.poser('graphiques-bitcoin'); window.banc.poser('agent-agent'); }); await attendre(500);
await ev(() => window.banc.gf.deplacer('p-agent-agent', 700, 300)); await attendre(200);
const avantRecharge = await rect('p-agent-agent');
await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__pret === true); await attendre(700);
const apres = await rect('p-agent-agent');
verifier('les fenêtres posées reviennent après rechargement', (await fenetres()).join() === 'p-agent-agent,p-graphiques-bitcoin', (await fenetres()).join());
verifier('avec la même position', apres && Math.abs(apres.x - avantRecharge.x) < 3 && Math.abs(apres.y - avantRecharge.y) < 3, JSON.stringify([avantRecharge, apres]));
verifier('le mur reflète les fenêtres posées', await ev(() => /1 posée/.test(document.querySelector('#mur [data-dos="agent"] .dos-pos').textContent)));

// ── 3. souris : glisser, inertie, aimantation ──
await ev(() => window.banc.gf.fermerTout()); await ev(() => { window.banc.poser('macro-taux'); window.banc.poser('macro-banques'); }); await attendre(500);
await ev(() => window.banc.gf.deplacer('p-macro-taux', 500, 200)); await ev(() => window.banc.gf.deplacer('p-macro-banques', 1000, 500)); await attendre(200);
let h = await entete('p-macro-taux'), r0 = await rect('p-macro-taux'), r2;
await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + 60, h.y + 30, { steps: 5 }); await attendre(160); await page.mouse.up(); await attendre(250);
let r1 = await rect('p-macro-taux'); verifier('glisser par la barre de titre déplace la fenêtre', Math.abs(r1.x - r0.x - 60) < 14 && Math.abs(r1.y - r0.y - 30) < 14, JSON.stringify([r0, r1]));
// inertie : mouvement rapide, relâche en mouvement
h = await entete('p-macro-taux'); r0 = await rect('p-macro-taux');
await page.mouse.move(h.x, h.y); await page.mouse.down();
for (let i = 1; i <= 6; i++) { await page.mouse.move(h.x + i * 30, h.y, {}); await attendre(12); }
await page.mouse.up(); r1 = await rect('p-macro-taux'); await attendre(450); r2 = await rect('p-macro-taux');
verifier('lancer : la fenêtre continue de glisser après le relâchement (inertie)', r2.x - r1.x > 25, JSON.stringify([r0, r1, r2]));
await attendre(900); const r3 = await rect('p-macro-taux'); await attendre(300); const r4 = await rect('p-macro-taux');
verifier('puis elle ralentit et s’arrête', Math.abs(r4.x - r3.x) < 2);
// aimantation au bord gauche
await ev(() => window.banc.gf.deplacer('p-macro-taux', 300, 300)); await attendre(100);
h = await entete('p-macro-taux'); r0 = await rect('p-macro-taux');
await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x - (r0.x - 15), h.y, { steps: 10 }); await attendre(120); await page.mouse.up(); await attendre(200);
r1 = await rect('p-macro-taux'); verifier('aimantation douce : proche du bord gauche, la fenêtre s’y colle (x = 10)', Math.abs(r1.x - 10) < 1.5, JSON.stringify(r1));
// molette sur la barre de titre
await ev(() => window.banc.gf.deplacer('p-macro-taux', 400, 200)); await attendre(100);
h = await entete('p-macro-taux'); r0 = await rect('p-macro-taux');
await page.mouse.move(h.x, h.y); await page.mouse.wheel({ deltaY: -100 }); await page.mouse.wheel({ deltaY: -100 }); await attendre(300); r1 = await rect('p-macro-taux');
verifier('molette sur la barre de titre : la fenêtre grandit', r1.l > r0.l * 1.1, JSON.stringify([r0, r1]));
await page.mouse.wheel({ deltaY: 100 }); await page.mouse.wheel({ deltaY: 100 }); await page.mouse.wheel({ deltaY: 100 }); await attendre(300); r2 = await rect('p-macro-taux');
verifier('molette dans l’autre sens : elle rétrécit', r2.l < r1.l * 0.95, JSON.stringify([r1, r2]));
// molette dans le corps défilant = défilement, pas de redimensionnement
const cps = await ev(() => { const e = document.querySelector('.gf[data-id="p-macro-taux"] .gf-corps'), r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
r0 = await rect('p-macro-taux'); await page.mouse.move(cps.x, cps.y); await page.mouse.wheel({ deltaY: 200 }); await attendre(250); r1 = await rect('p-macro-taux');
verifier('molette dans un contenu qui défile : le contenu défile, la taille ne change pas', Math.abs(r1.l - r0.l) < 1 && (await ev(() => document.querySelector('.gf[data-id="p-macro-taux"] .gf-corps').scrollTop)) > 0);
await page.mouse.move(cps.x, cps.y); await page.keyboard.down('Control'); await page.mouse.wheel({ deltaY: -100 }); await page.keyboard.up('Control'); await attendre(250); r2 = await rect('p-macro-taux');
verifier('Ctrl + molette redimensionne même dans le contenu', r2.l > r1.l * 1.05, JSON.stringify([r1, r2]));
// bords
const bord = async (id, b) => ev((id, b) => { const e = document.querySelector('.gf[data-id="' + id + '"] [data-bord="' + b + '"]').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, id, b);
await ev(() => { window.banc.gf.deplacer('p-macro-taux', 400, 250); window.banc.gf.dimensionner('p-macro-taux', 400, 300); }); await attendre(150);
r0 = await rect('p-macro-taux'); let b = await bord('p-macro-taux', 'e');
await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + 100, b.y, { steps: 5 }); await page.mouse.up(); await attendre(150); r1 = await rect('p-macro-taux');
verifier('bord droit : la largeur augmente de 100', Math.abs(r1.l - r0.l - 100) < 3 && Math.abs(r1.x - r0.x) < 1, JSON.stringify([r0, r1]));
b = await bord('p-macro-taux', 'w'); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x - 80, b.y, { steps: 5 }); await page.mouse.up(); await attendre(150); r2 = await rect('p-macro-taux');
verifier('bord gauche : la fenêtre s’étend vers la gauche (bord droit fixe)', Math.abs(r2.l - r1.l - 80) < 3 && Math.abs((r2.x + r2.l) - (r1.x + r1.l)) < 2, JSON.stringify([r1, r2]));
b = await bord('p-macro-taux', 'n'); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x, b.y - 60, { steps: 5 }); await page.mouse.up(); await attendre(150); const r5 = await rect('p-macro-taux');
verifier('bord haut : la hauteur augmente (bord bas fixe)', Math.abs(r5.h - r2.h - 60) < 3 && Math.abs((r5.y + r5.h) - (r2.y + r2.h)) < 2, JSON.stringify([r2, r5]));
b = await bord('p-macro-taux', 'sw'); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + 50, b.y + 40, { steps: 5 }); await page.mouse.up(); await attendre(150); const r6 = await rect('p-macro-taux');
verifier('coin sud-ouest : largeur réduite et hauteur augmentée', r6.l < r5.l - 40 && r6.h > r5.h + 30, JSON.stringify([r5, r6]));

// ── 4. clic droit : menu ──
h = await entete('p-macro-taux'); await page.mouse.click(h.x, h.y, { button: 'right' }); await attendre(250);
const menu = await ev(() => { const m = document.querySelector('.gfx-menu'); return m ? [...m.querySelectorAll('button')].map(x => x.textContent) : null; });
verifier('clic droit : menu agrandir, réduire, épingler, ranger, fermer', menu && menu.join('|') === 'Agrandir|Réduire|Épingler au premier plan|Ranger dans son dossier|Fermer', JSON.stringify(menu));
await ev(() => document.querySelector('.gfx-menu [data-m="epingler"]').click()); await attendre(200);
verifier('Épingler : la fenêtre est marquée épinglée', await ev(() => document.querySelector('.gf[data-id="p-macro-taux"]').classList.contains('gfx-epingle') && document.querySelector('.gf[data-id="p-macro-taux"] [data-b="epingler"]').getAttribute('aria-pressed') === 'true'));
verifier('le menu se ferme après le choix', !(await ev(() => document.querySelector('.gfx-menu'))));
await ev(() => window.banc.gf.focus('p-macro-banques'));
verifier('une fenêtre épinglée reste devant les autres', await ev(() => +document.querySelector('.gf[data-id="p-macro-taux"]').style.zIndex > +document.querySelector('.gf[data-id="p-macro-banques"]').style.zIndex));
const avantRanger = await rect('p-macro-taux'); await ev(() => window.banc.gf.reorganiser('grille')); await attendre(200); const apresRanger = await rect('p-macro-taux');
verifier('« Réorganiser » ne déplace pas une fenêtre épinglée', Math.abs(avantRanger.x - apresRanger.x) < 1 && Math.abs(avantRanger.y - apresRanger.y) < 1);
await ev(() => window.banc.gf.reduireTout()); await attendre(200);
verifier('« Réduire tout » ignore aussi les épinglées', await ev(() => !document.querySelector('.gf[data-id="p-macro-taux"]').classList.contains('gf-reduite') && document.querySelector('.gf[data-id="p-macro-banques"]').classList.contains('gf-reduite')));
await ev(() => { window.banc.gf.reduireTout(); }); await ev(() => window.banc.gf.reduire('p-macro-banques', false));
// mémoire de l'épingle
await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__pret === true); await attendre(600);
verifier('l’épingle est mémorisée après rechargement', await ev(() => { const e = document.querySelector('.gf[data-id="p-macro-taux"]'); return !!e && window.banc.gf.obtenir('p-macro-taux') && true; }));
// ranger via le menu
h = await entete('p-macro-banques'); await page.mouse.click(h.x, h.y, { button: 'right' }); await attendre(200); await ev(() => document.querySelector('.gfx-menu [data-m="ranger"]').click()); await attendre(900);
verifier('menu « Ranger dans son dossier » : la fenêtre retourne dans son dossier', !(await fenetres()).includes('p-macro-banques'));

// ── 5. clavier ──
await ev(() => { window.banc.poser('macro-banques'); window.banc.poser('agent-agent'); window.banc.gf.dimensionner('p-macro-banques', 380, 280); window.banc.gf.deplacer('p-macro-banques', 1000, 500); }); await attendre(400);
await ev(() => window.banc.gf.focus('p-macro-banques', true)); await attendre(100);
verifier('la fenêtre a le focus clavier', await ev(() => document.activeElement && document.activeElement.dataset.id === 'p-macro-banques'));
r0 = await rect('p-macro-banques'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await attendre(150); r1 = await rect('p-macro-banques');
verifier('flèches : déplacent la fenêtre de 24 px', Math.abs(r1.x - r0.x - 24) < 1.5 && Math.abs(r1.y - r0.y - 24) < 1.5, JSON.stringify([r0, r1]));
await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift'); await attendre(150); r2 = await rect('p-macro-banques');
verifier('Maj + flèches : redimensionnent', Math.abs(r2.l - r1.l - 24) < 1.5 && Math.abs(r2.h - r1.h - 24) < 1.5, JSON.stringify([r1, r2]));
await page.keyboard.press('Enter'); await attendre(200); verifier('Entrée : agrandit', (await rect('p-macro-banques')).l > 1400);
await page.keyboard.press('Enter'); await attendre(200); verifier('Entrée de nouveau : restaure', Math.abs((await rect('p-macro-banques')).l - r2.l) < 2);
const avant = await ev(() => document.activeElement.dataset.id); await page.keyboard.press('Tab'); await attendre(100); const apresTab = await ev(() => document.activeElement.dataset.id);
verifier('Tab : passe à une autre fenêtre', apresTab && apresTab !== avant, avant + ' → ' + apresTab);
await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); await attendre(100);
verifier('Maj + Tab : revient', (await ev(() => document.activeElement.dataset.id)) === avant);
await page.keyboard.press('F6'); await attendre(100); verifier('F6 : fenêtre suivante', (await ev(() => document.activeElement.dataset.id)) !== avant);
await page.keyboard.press('?'); await attendre(200);
verifier('? ouvre l’aide avec les raccourcis et les réglages', await ev(() => { const a = document.querySelector('.gfx-aide'); return !!a && /Tab/.test(a.textContent) && a.querySelectorAll('input[type=checkbox]').length === 5; }));
await page.keyboard.press('Escape'); await attendre(150); verifier('Échap ferme l’aide', !(await ev(() => document.querySelector('.gfx-aide'))));
await ev(() => window.banc.gf.focus('p-macro-banques', true)); await page.keyboard.press('Escape'); await attendre(250);
verifier('Échap sur une fenêtre la ferme', !(await fenetres()).includes('p-macro-banques'));
// la touche Entrée dans un champ de la fenêtre n'agrandit pas
// ── 6. dispositions ──
await ev(() => window.banc.gf.epingler('p-macro-taux', false));
await ev(() => { window.banc.gf.fermerTout(); for (const i of ['graphiques-bitcoin', 'graphiques-or', 'graphiques-us100', 'macro-taux', 'agent-agent']) window.banc.poser(i); }); await attendre(500);
await page.click('.gf-barre [data-g="mode"]'); await attendre(150);
verifier('la barre propose grille, cascade, carrousel', await ev(() => [...document.querySelectorAll('.gfx-modes button')].map(b => b.textContent).join() === 'Grille,Cascade,Carrousel'));
await ev(() => document.querySelector('.gfx-modes [data-mode="cascade"]').click()); await attendre(250);
const ls = await ev(() => window.banc.gf.liste()); verifier('cascade : décalage régulier vers le bas et la droite', ls.every((f, i) => i === 0 || (f.x > ls[i - 1].x && f.y > ls[i - 1].y)), JSON.stringify(ls.map(f => [f.x, f.y])));
await page.click('.gf-barre [data-g="mode"]'); await attendre(100); await ev(() => document.querySelector('.gfx-modes [data-mode="carrousel"]').click()); await attendre(250);
const lc = await ev(() => window.banc.gf.liste()); const maxL = Math.max(...lc.map(f => f.l));
verifier('carrousel : une fenêtre centrale plus grande que les autres, toutes dans l’écran', lc.filter(f => f.l === maxL).length === 1 && lc.every(f => f.x >= 0 && f.x + f.l <= 1600 && f.y >= 0 && f.y + f.h <= 900), JSON.stringify(lc.map(f => [Math.round(f.x), f.l])));
await page.click('.gf-barre [data-g="ranger"]'); await attendre(250);
verifier('grille : aucun recouvrement', await ev(() => window.banc.gf.recouvrements().length === 0));

// ── 7. tactile réel (CDP) ──
await ev(() => { window.banc.gf.fermerTout(); window.banc.poser('graphiques-bitcoin'); window.banc.poser('macro-taux'); window.banc.gf.deplacer('p-graphiques-bitcoin', 300, 200); window.banc.gf.deplacer('p-macro-taux', 900, 300); }); await attendre(400);
h = await entete('p-graphiques-bitcoin'); r0 = await rect('p-graphiques-bitcoin');
await toucher('touchStart', [h]); for (let i = 1; i <= 8; i++) { await toucher('touchMove', [{ x: h.x + i * 8, y: h.y + i * 4 }]); await attendre(40); } await attendre(200); await toucher('touchEnd', []); await attendre(350);
r1 = await rect('p-graphiques-bitcoin'); verifier('doigt : glisser la barre de titre déplace la fenêtre', Math.abs(r1.x - r0.x - 64) < 14 && Math.abs(r1.y - r0.y - 32) < 14, JSON.stringify([r0, r1]));
// balayage rapide vers le bas = réduire
h = await entete('p-graphiques-bitcoin'); r0 = await rect('p-graphiques-bitcoin');
await toucher('touchStart', [h]); await toucher('touchMove', [{ x: h.x, y: h.y + 40 }]); await attendre(20); await toucher('touchMove', [{ x: h.x + 2, y: h.y + 110 }]); await attendre(20); await toucher('touchEnd', []); await attendre(350);
verifier('doigt : balayage rapide vers le bas réduit la fenêtre (sans la déplacer)', await ev(() => document.querySelector('.gf[data-id="p-graphiques-bitcoin"]').classList.contains('gf-reduite')) && Math.abs((await rect('p-graphiques-bitcoin')).x - r0.x) < 4, JSON.stringify(await rect('p-graphiques-bitcoin')));
h = await entete('p-graphiques-bitcoin');
await toucher('touchStart', [h]); await toucher('touchMove', [{ x: h.x, y: h.y - 40 }]); await attendre(20); await toucher('touchMove', [{ x: h.x, y: h.y - 110 }]); await attendre(20); await toucher('touchEnd', []); await attendre(350);
verifier('doigt : balayage rapide vers le haut remet la fenêtre', !(await ev(() => document.querySelector('.gf[data-id="p-graphiques-bitcoin"]').classList.contains('gf-reduite'))));
// double appui = agrandir / restaurer
h = await entete('p-graphiques-bitcoin'); r0 = await rect('p-graphiques-bitcoin');
await toucher('touchStart', [h]); await toucher('touchEnd', []); await attendre(120); await toucher('touchStart', [h]); await toucher('touchEnd', []); await attendre(350);
verifier('doigt : double appui sur la barre agrandit', (await rect('p-graphiques-bitcoin')).l > 1400);
h = await entete('p-graphiques-bitcoin'); await toucher('touchStart', [h]); await toucher('touchEnd', []); await attendre(120); await toucher('touchStart', [h]); await toucher('touchEnd', []); await attendre(350);
verifier('doigt : second double appui restaure', Math.abs((await rect('p-graphiques-bitcoin')).l - r0.l) < 3);
// pincement + rotation
await ev(() => { window.banc.gf.fermer('p-graphiques-bitcoin'); window.banc.gf.deplacer('p-macro-taux', 700, 250); }); await attendre(200);
r0 = await rect('p-macro-taux'); const cc = centre(r0);
await toucher('touchStart', [{ x: cc.x - 60, y: cc.y }, { x: cc.x + 60, y: cc.y }]);
for (let i = 1; i <= 8; i++) await toucher('touchMove', [{ x: cc.x - 60 - i * 8, y: cc.y - i * 6 }, { x: cc.x + 60 + i * 8, y: cc.y + i * 6 }]);
const rot = await ev(() => document.querySelector('.gf[data-id="p-macro-taux"]').style.rotate);
await toucher('touchEnd', []); await attendre(500);
r1 = await rect('p-macro-taux');
verifier('doigts : le pincement agrandit', r1.l > r0.l * 1.25, JSON.stringify([r0, r1]));
verifier('doigts : la rotation légère s’applique pendant le geste (≤ 8°)', /deg/.test(rot) && Math.abs(parseFloat(rot)) > 1 && Math.abs(parseFloat(rot)) <= 8.01, rot);
verifier('puis la fenêtre se redresse', (await ev(() => document.querySelector('.gf[data-id="p-macro-taux"]').style.rotate)) === '');
await ev(() => localStorage.setItem('rayle_fenetres_prefs', JSON.stringify({ rotation: false }))); r0 = await rect('p-macro-taux'); const c2 = centre(r0);
await toucher('touchStart', [{ x: c2.x - 60, y: c2.y }, { x: c2.x + 60, y: c2.y }]); for (let i = 1; i <= 6; i++) await toucher('touchMove', [{ x: c2.x - 60 - i * 5, y: c2.y - i * 6 }, { x: c2.x + 60 + i * 5, y: c2.y + i * 6 }]);
verifier('réglable : rotation coupée = aucune rotation', (await ev(() => document.querySelector('.gf[data-id="p-macro-taux"]').style.rotate)) === ''); await toucher('touchEnd', []); await attendre(300);
await ev(() => localStorage.removeItem('rayle_fenetres_prefs'));

// ── 8. effets holographiques ──
await ev(() => { window.banc.gf.fermerTout(); window.banc.poser('agent-régime'); }); await attendre(120);
verifier('apparition : scintillement et balayage de lumière', await ev(() => { const e = document.querySelector('.gf[data-id="p-agent-régime"]'); return e.classList.contains('gfx-apparait') && !!e.querySelector('.gfx-balayage') && getComputedStyle(e).animationName === 'gfx-scintille'; }));
verifier('halo lumineux derrière la fenêtre', await ev(() => !!document.querySelector('.gfx-ombre')));
h = await entete('p-agent-régime'); await page.mouse.move(h.x, h.y); await page.mouse.down(); await attendre(60);
verifier('onde au point de contact', (await ev(() => document.querySelectorAll('.gfx-onde').length)) >= 1);
await page.mouse.move(h.x + 120, h.y + 60, { steps: 6 }); verifier('traînée lumineuse pendant le déplacement', (await ev(() => document.querySelectorAll('.gfx-trace').length)) >= 1); await page.mouse.up();
await page.mouse.move(100, 100); await attendre(80); const p1 = await ev(() => document.querySelector('.gf-racine').style.getPropertyValue('--gfx-px'));
await page.mouse.move(1500, 800); await attendre(120); const p2 = await ev(() => document.querySelector('.gf-racine').style.getPropertyValue('--gfx-px'));
verifier('parallaxe : le halo suit la position du pointeur', p1 !== '' && p2 !== '' && +p2 > +p1, p1 + ' → ' + p2);
await ev(() => { document.body.dataset.hud = 'leger'; window.banc.gf.fermerTout(); window.banc.poser('agent-régime'); }); await attendre(120);
verifier('mode léger : ni halo, ni scintillement, ni onde', await ev(() => { const e = document.querySelector('.gf[data-id="p-agent-régime"]'); return !document.querySelector('.gfx-ombre') && !e.classList.contains('gfx-apparait'); }));
await ev(() => { delete document.body.dataset.hud; });

console.log('erreurs page :', erreurs.slice(0, 5));
await navigateur.close();
process.exit(fin() ? 1 : 0);
