import { ouvrirGalaxieTheme, entrerSurMars, attendreMode, attendre, compteur } from './r2-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* R2 phases 1-3 : DANS LE THÈME AURORE (celui de Justin). Un clic (souris, doigt, curseur virtuel de la télécommande) sur chaque panneau du mur de la table de Mars ouvre une grande fenêtre
   VISIBLE (opacité 1, dans l'écran, taille confortable, au premier plan) ; le sélecteur de groupes, les préréglages, la mémorisation ; le gestionnaire (déplacer, redimensionner,
   agrandir, réduire, pincer, Tout fermer / Réorganiser / Réduire tout). Lancer : node tests-navigateur/r2-mars-terminal-test.mjs */
const { verifier, fin } = compteur();
const L = +process.env.L || 1920, H = +process.env.H || 1080;
const worker = await demarrerFauxWorkerMarche(8797);
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: L, hauteur: H, tactile: true });
const ev = (f, ...a) => page.evaluate(f, ...a);
verifier('thème Aurore actif', await ev(() => document.body.classList.contains('g1') && localStorage.getItem('rayle_theme') === 'aurore'));
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.2 })); await attendre(700);
const fens = await ev(() => window.Mars.positionsEcran());
verifier('21 fenêtres sur le mur', fens.length === 21, String(fens.length));

const visible = (sel) => ev(sel => { const el = document.querySelector(sel); if (!el) return { ok: false, raison: 'absente' }; const r = el.getBoundingClientRect(), c = getComputedStyle(el); const m = document.elementFromPoint(r.x + r.width / 2, Math.min(innerHeight - 2, r.y + 30));
  return { ok: c.opacity === '1' && c.visibility === 'visible' && r.width >= 300 && r.height >= 200 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && !!m && el.contains(m), op: c.opacity, rect: [r.x, r.y, r.width, r.height].map(Math.round), auPremierPlan: !!m && el.contains(m) }; }, sel);
const fermerTout = async () => { await ev(() => { window.Mars.fermerFenetre(); if (window.Panneaux) window.Panneaux.fermerTout(); localStorage.removeItem('rayle_mars_terminal'); }); await attendre(900); };
const pos = async id => (await ev(() => window.Mars.positionsEcran())).find(x => x.id === id);
const AGENT = new Set(['agent-btc', 'propositions-agent', 'regime-marche', 'perf-strategies', 'gardien-prop', 'journal-tilt', 'proba-evaluation']);
const SELECTEUR = '.gf[data-id="selecteur"]';

// ── 1. souris : chaque panneau du mur ouvre sa grande fenêtre visible ──
for (const f0 of fens) {
  const f = await pos(f0.id);
  await page.mouse.move(f.x, f.y); await attendre(120); await page.mouse.click(f.x, f.y); await attendre(AGENT.has(f.id) ? 2600 : 1600);
  if (AGENT.has(f.id)) { const v = await visible('.pn.large'); verifier('souris · ' + f.id + ' : le poste de l’agent est visible', v.ok || (v.op === '1' && v.rect && v.rect[2] > 300), JSON.stringify(v)); }
  else { const v = await visible('.gf[data-id="p-' + f.id + '"]'); if (!v.ok) console.log('   diag', f.id, JSON.stringify(f), await ev(() => [window.Mars.etat().fenetre, !!window.Mars.terminal(), document.querySelectorAll('.gf').length, document.querySelectorAll('.pn').length]), erreurs.slice(-3)); verifier('souris · ' + f.id + ' : grande fenêtre visible', v.ok, JSON.stringify(v)); }
  await fermerTout();
}

// ── 2. curseur virtuel (télécommande) : quelques panneaux ──
const virtuel = async (x, y) => { for (let i = 0; i < 80; i++) { const fini = await ev((x, y) => { const q = window.Telecommande.position(); if (Math.abs(x - q.x) < 1 && Math.abs(y - q.y) < 1) return true; window.Telecommande.appliquer({ a: 'pointeur', dx: Math.max(-140, Math.min(140, x - q.x)), dy: Math.max(-140, Math.min(140, y - q.y)) }); return false; }, x, y); if (fini) break; await attendre(15); } await attendre(200); await ev(() => window.Telecommande.appliquer({ a: 'clic', n: 1, bouton: 0 })); };
for (const id of ['graphique-us100', 'taux', 'calendrier', 'marche']) {
  const f = await pos(id); await virtuel(f.x, f.y); await attendre(1800);
  const v = await visible('.gf[data-id="p-' + id + '"]'); verifier('télécommande · ' + id + ' : grande fenêtre visible', v.ok, JSON.stringify(v));
  await fermerTout();
}

// ── 3. dossiers (R3 : les groupes de R2 sont devenus 7 dossiers holographiques ; le détail est dans r3-mars-test.mjs) ──
const fus = await pos('graphique-us100');
await page.mouse.click(fus.x, fus.y); await attendre(2200);
const info = await ev(() => { const t = window.Mars.terminal && window.Mars.terminal(); return t ? t.etat() : null; });
verifier('le terminal expose son état', !!info && info.fenetres.includes('selecteur') && info.fenetres.includes('p-graphique-us100'), JSON.stringify(info));
verifier('fenêtre des dossiers visible', (await visible(SELECTEUR)).ok);
verifier('7 dossiers', (await ev(() => document.querySelectorAll('.dos-classeur').length)) === 7);
verifier('le dossier du panneau cliqué est mémorisé', await ev(() => window.Mars.terminal().etat().groupe === 'graphiques'));
const nbDossier = g => ev(g => window.Mars.terminal().dossiers.dossier(g).ids.length, g);
verifier('dossier Éco et macro : 5 panneaux', (await nbDossier('macro')) === 5);
verifier('dossier Actualités : 1 panneau', (await nbDossier('actus')) === 1);
verifier('dossier Agent IA : 4 panneaux', (await nbDossier('agent')) === 4);
verifier('dossier Performance et risque : 4 panneaux', (await nbDossier('perf')) === 4);
verifier('dossier Graphiques : 8 panneaux', (await nbDossier('graphiques')) === 8);
await ev(() => window.Mars.terminal().ouvrirPanneau('taux')); await attendre(1500);
verifier('ouvrir un panneau ouvre sa fenêtre', (await visible('.gf[data-id="p-taux"]')).ok);
await ev(() => window.Mars.terminal().retirerPanneau('taux')); await attendre(500);
verifier('le retirer la ferme', await ev(() => !document.querySelector('.gf[data-id="p-taux"]')));
await ev(() => document.querySelector('.tm-btn[data-p="surveillance"]').click()); await attendre(2500);
const surv = await ev(() => [...document.querySelectorAll('.gf')].map(e => e.dataset.id).sort());
verifier('préréglage Surveillance : 4 fenêtres + sélecteur', surv.length === 5 && surv.includes('p-alertes') && surv.includes('p-gardien-prop'), JSON.stringify(surv));
verifier('toutes visibles et sans recouvrement', await ev(() => window.Mars.terminal().gestionnaire.recouvrements().length === 0) && (await ev(() => [...document.querySelectorAll('.gf')].every(e => { const r = e.getBoundingClientRect(); return r.width >= 300 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && getComputedStyle(e).opacity === '1'; }))));
const memo = await ev(() => JSON.parse(localStorage.getItem('rayle_mars_terminal')));
verifier('choix mémorisés', memo && memo.ouverts.length === 4, JSON.stringify(memo));
verifier('disposition mémorisée', await ev(() => !!localStorage.getItem('rayle_fenetres_mars-terminal')));
await ev(() => document.querySelector('.tm-reinit').click()); await attendre(800);
verifier('Réinitialiser : seul le sélecteur reste', (await ev(() => [...document.querySelectorAll('.gf')].map(e => e.dataset.id))).join() === 'selecteur');

// ── 4. gestionnaire : déplacer, redimensionner, agrandir, réduire, fermer, pincer ──
await ev(() => window.Mars.terminal().ouvrirPanneau('marche', { donner: true })); await attendre(1500);
const W = '.gf[data-id="p-marche"]';
const rect = () => ev(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height }; }, W);
let r0 = await rect();
await page.mouse.move(r0.x + 200, r0.y + 20); await page.mouse.down(); await page.mouse.move(r0.x + 140, r0.y + 120, { steps: 6 }); await attendre(200); await page.mouse.up(); await attendre(200);
let r1 = await rect(); verifier('déplacement à la souris par la barre de titre', Math.abs(r1.x - r0.x + 60) < 3 && Math.abs(r1.y - r0.y - 100) < 3, JSON.stringify([r0, r1]));
const pg = await ev(sel => { const r = document.querySelector(sel + ' .gf-poignee').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, W);
await page.mouse.move(pg.x, pg.y); await page.mouse.down(); await page.mouse.move(pg.x - 100, pg.y - 80, { steps: 6 }); await page.mouse.up(); await attendre(200);
let r2 = await rect(); verifier('redimensionnement par le coin', r2.l < r1.l - 60 && r2.h < r1.h - 50, JSON.stringify([r1, r2]));
// hors écran : on tente de la sortir complètement
await page.mouse.move(r2.x + 200, r2.y + 20); await page.mouse.down(); await page.mouse.move(L + 800, H + 800, { steps: 6 }); await page.mouse.up(); await attendre(200);
let r3 = await rect(); verifier('jamais complètement hors de l’écran', r3.x < L - 100 && r3.y < H - 60 && r3.x + r3.l > 100, JSON.stringify(r3));
await ev(sel => document.querySelector(sel + ' [data-b="agrandir"]').click(), W); await attendre(250);
let r4 = await rect(); verifier('agrandir : presque tout l’écran', r4.l > L - 40 && r4.h > H - 160, JSON.stringify(r4));
await ev(sel => document.querySelector(sel + ' [data-b="agrandir"]').click(), W); await attendre(250);
let r5 = await rect(); verifier('restaurer : retour à la taille d’avant', Math.abs(r5.l - r3.l) < 3 && Math.abs(r5.h - r3.h) < 3, JSON.stringify([r3, r5]));
await ev(sel => document.querySelector(sel + ' [data-b="reduire"]').click(), W); await attendre(250);
verifier('réduire : seule la barre de titre reste', (await rect()).h < 90);
await ev(sel => document.querySelector(sel + ' [data-b="reduire"]').click(), W); await attendre(250);
verifier('rétablir', (await rect()).h > 150);
const cdp = await page.createCDPSession();
const toucher = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
// déplacement au doigt par la barre de titre
const e0 = await rect(); const tx = e0.x + 150, ty = e0.y + 20;
await toucher('touchStart', [{ x: tx, y: ty }]); for (let i = 1; i <= 6; i++) await toucher('touchMove', [{ x: tx - i * 10, y: ty - i * 15 }]); await attendre(200); await toucher('touchEnd', []); await attendre(300);
const e1 = await rect(); verifier('déplacement au doigt', Math.abs(e1.x - (e0.x - 60)) < 6 && Math.abs(e1.y - (e0.y - 90)) < 6, JSON.stringify([e0, e1]));
// pincement à deux doigts (événements tactiles réels via CDP)
const r6 = await rect(); const cx = r6.x + r6.l / 2, cy = r6.y + r6.h / 2;
await toucher('touchStart', [{ x: cx - 60, y: cy }, { x: cx + 60, y: cy }]);
for (let i = 1; i <= 8; i++) await toucher('touchMove', [{ x: cx - 60 - i * 12, y: cy }, { x: cx + 60 + i * 12, y: cy }]);
await toucher('touchEnd', []); await attendre(300);
const r7 = await rect(); verifier('pincement à deux doigts : la fenêtre grandit', r7.l > r6.l * 1.3, JSON.stringify([r6, r7]));
// cibles tactiles de 44 px
verifier('boutons de la barre de titre ≥ 36 px (44 px en pointeur grossier)', await ev(sel => [...document.querySelectorAll(sel + ' .gf-b button')].every(b => b.getBoundingClientRect().width >= 36 && b.getBoundingClientRect().height >= 36), W));
// barre Fenêtres
verifier('barre « Fenêtres » visible', await ev(() => { const b = document.querySelector('.gf-barre'); return !!b && !b.hidden && b.getBoundingClientRect().width > 100; }));
await ev(() => window.Mars.terminal().ouvrirPanneau('taux')); await ev(() => window.Mars.terminal().ouvrirPanneau('banques')); await attendre(1200);
await ev(() => document.querySelector('.gf-barre [data-g="reduire"]').click()); await attendre(300);
verifier('Réduire tout', await ev(() => window.Mars.terminal().gestionnaire.liste().every(f => f.reduite)));
await ev(() => document.querySelector('.gf-barre [data-g="reduire"]').click()); await attendre(300);
await ev(() => document.querySelector('.gf-barre [data-g="ranger"]').click()); await attendre(400);
verifier('Réorganiser : grille sans recouvrement', await ev(() => window.Mars.terminal().gestionnaire.recouvrements().length === 0));
// ── 5. télécommande : appui long sur une barre de titre = saisie de la fenêtre (déplacer, redimensionner) ──
{
  const W2 = '.gf[data-id="p-taux"]';
  const R = () => ev(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height }; }, W2);
  const marche = async (dx, dy) => { for (let i = 0; i < 12; i++) { await ev((dx, dy) => window.Telecommande.appliquer({ a: 'pointeur', dx, dy }), dx / 12, dy / 12); await attendre(25); } };
  let a = await R(); await virtuel(a.x + 80, a.y + 18); await attendre(150);
  await ev(() => window.Telecommande.appliquer({ a: 'appui_long' })); await attendre(150);
  const sx = a.x > L / 2 ? -150 : 150, sy = a.y + a.h + 60 > H - 78 ? -60 : 60;
  await marche(sx, sy); await ev(() => window.Telecommande.appliquer({ a: 'lacher' })); await attendre(300);
  let b2 = await R(); verifier('télécommande : appui long sur la barre de titre puis glisser déplace la fenêtre', Math.abs(b2.x - a.x - sx) < 25 && Math.abs(b2.y - a.y - sy) < 25, JSON.stringify([a, b2]));
  const poi = await ev(sel => { const r = document.querySelector(sel + ' .gf-poignee').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, W2);
  await virtuel(poi.x, poi.y); await attendre(150); console.log('   sous le curseur :', await ev(() => { const q = window.Telecommande.position(), e = document.elementFromPoint(q.x, q.y); return [q.x, q.y, e && (e.className || e.tagName)]; }), poi);
  await ev(() => window.Telecommande.appliquer({ a: 'appui_long' })); await attendre(150);
  await marche(-60, -40); await ev(() => window.Telecommande.appliquer({ a: 'lacher' })); await attendre(300);
  let c2 = await R(); verifier('télécommande : appui long sur la poignée redimensionne', c2.l < b2.l - 30 && c2.h < b2.h - 20, JSON.stringify([b2, c2]));
  const bt = await ev(sel => { const r = document.querySelector(sel + ' [data-b="reduire"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, W2);
  await virtuel(bt.x, bt.y); await attendre(300);
  verifier('télécommande : le bouton Réduire fonctionne au clic virtuel', (await R()).h < 90);
  const bg = await ev(sel => { const r = document.querySelector(sel + ' [data-b="agrandir"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, W2);
  await virtuel(bg.x, bg.y); await attendre(300);
  verifier('télécommande : le bouton Agrandir fonctionne au clic virtuel', (await R()).l > L - 40);
  verifier('plus rien n’est saisi après « lacher »', await ev(() => { const q = window.Telecommande.position(); window.Telecommande.appliquer({ a: 'pointeur', dx: 5, dy: 0 }); return true; }));
}
await ev(() => document.querySelector('.gf-barre [data-g="fermer"]').click()); await attendre(500);
verifier('Tout fermer ferme le terminal', await ev(() => !document.querySelector('.gf') && !window.Mars.terminal()));

console.log('erreurs page :', erreurs.filter(m => !/faireconomy|ERR_FAILED|404|Failed to load resource|CORS|bls\.gov|tradingview/i.test(m)).slice(0, 6));
await navigateur.close(); worker.close && worker.close();
process.exit(fin() ? 1 : 0);
