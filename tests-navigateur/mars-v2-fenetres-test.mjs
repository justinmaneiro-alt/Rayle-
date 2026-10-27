import fs from 'node:fs';
import { ouvrirGalaxieTheme, entrerSurMars, attendreMode, attendre, compteur } from './r2-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* V2 phase 2 : le bureau holographique de Mars. Piles sur la table → carrousel → fenêtre VIVANTE posée sur l'écran (aucune grande fenêtre HTML par-dessus),
   déplacer / redimensionner / ranger / arc, stabilité, mémoire, ancien système derrière l'interrupteur.   Lancer : node tests-navigateur/mars-v2-fenetres-test.mjs */
const { verifier, fin } = compteur();
fs.mkdirSync('captures-mars', { recursive: true });
const L = 1600, H = 900;
const worker = await demarrerFauxWorkerMarche(8797);
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: L, hauteur: H });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur');
await ev(() => { window.Mars.auto(false); window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.3 }); }); await attendre(700);
const pos = async id => (await ev(() => window.Mars.positionsEcran())).find(x => x.id === id);
const fenetres = () => ev(() => [...document.querySelectorAll('#mars-terminal .gf')].map(e => e.dataset.id).sort());
const rect = id => ev(id => { const e = document.querySelector('.gf[data-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), l: Math.round(r.width), h: Math.round(r.height) }; }, id);

// ── 1. les piles ──
const ids = await ev(() => window.Mars.etat().fenetres);
verifier('8 piles sur la table (7 dossiers + Mes fenêtres)', ids.length === 8, ids.join());
verifier('aucune fenêtre HTML ouverte au départ', !(await fenetres()).length && !(await ev(() => document.querySelector('.pn[data-id^="mars-"]'))), JSON.stringify([await fenetres(), await ev(() => { const e = document.querySelector('.pn'); return e ? e.outerHTML.slice(0, 160) : null; })]));
// ── 2. un clic sur la pile « Graphiques » ouvre le carrousel du dossier ──
const p = await pos('graphiques');
await page.mouse.click(p.x, p.y); await attendre(2500);
const carr = await ev(() => { const v = document.querySelector('.dos-voile'); return v ? { n: v.querySelectorAll('.dos-carte').length } : null; });
verifier('clic sur la pile Graphiques → carrousel de 8 cartes', carr && carr.n === 8, JSON.stringify(carr));
await page.keyboard.press('Enter'); await attendre(2500);
let fs1 = await fenetres();
verifier('la fenêtre du centre est posée sur l’écran (graphique US100)', fs1.includes('p-graphique-us100'), fs1.join());
verifier('pas de fenêtre « Dossiers du terminal » imposée', !fs1.includes('selecteur'));
verifier('AUCUNE grande fenêtre du système Panneaux par-dessus', !(await ev(() => !!document.querySelector('.pn[data-id^="mars-"]'))));
const r0 = await rect('p-graphique-us100');
verifier('taille lisible (largeur ≥ 340 px)', r0 && r0.l >= 340 && r0.h >= 220, JSON.stringify(r0));
verifier('la pile affiche « 1 ouverte »', await ev(() => window.Mars.terminal() && window.Mars.terminal().etat().fenetres.length === 1));
await attendre(1500);
// la fenêtre contient un vrai graphique vivant (pas une image)
verifier('contenu vivant : zone de graphique HTML présente', await ev(() => !!document.querySelector('.gf[data-id="p-graphique-us100"] .tm-graph-zone')));
// ── 3. stabilité 3 s ──
const r1 = await rect('p-graphique-us100'); await attendre(3000); const r2 = await rect('p-graphique-us100');
verifier('une fenêtre ne bouge pas toute seule', JSON.stringify(r1) === JSON.stringify(r2), JSON.stringify([r1, r2]));
// ── 4. plusieurs fenêtres + arc sans chevauchement ──
for (const id of ['graphique-or', 'marche', 'dashboard', 'calendrier', 'cot']) await ev(id => window.Mars.terminal().ouvrirPanneau(id), id);
await attendre(1500);
await ev(() => window.Mars.terminal().gestionnaire.reorganiser('arc')); await attendre(800);
const nb = (await fenetres()).length;
verifier('6 fenêtres ouvertes', nb === 6, String(nb));
verifier('« Disposer en arc » : aucune fenêtre ne se chevauche', await ev(() => window.Mars.terminal().gestionnaire.recouvrements().length === 0));
await page.screenshot({ path: 'captures-mars/v2-bureau-arc.png' });
// ── 5. déplacer à la souris par la barre de titre ──
const avant = await rect('p-graphique-or'), tete = await ev(() => { const e = document.querySelector('.gf[data-id="p-graphique-or"] .gf-t'); const r = e.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; });
await page.mouse.move(tete.x, tete.y); await page.mouse.down(); await page.mouse.move(tete.x + 40, tete.y + 30, { steps: 6 }); await page.mouse.move(tete.x + 90, tete.y + 60, { steps: 6 }); await page.mouse.up(); await attendre(700);
const apres = await rect('p-graphique-or');
verifier('glisser la barre de titre déplace la fenêtre', apres && (Math.abs(apres.x - avant.x) > 30 || Math.abs(apres.y - avant.y) > 20), JSON.stringify([avant, apres]));
// ── 6. redimensionner ──
await ev(() => window.Mars.terminal().gestionnaire.dimensionner('p-graphique-or', 620, 420)); await attendre(300);
const rr = await rect('p-graphique-or'); verifier('redimensionner', rr && rr.l === 620 && rr.h === 420, JSON.stringify(rr));
// ── 7. ranger dans la pile ──
await ev(() => window.Mars.terminal().retirerPanneau('graphique-or')); await attendre(600);
verifier('ranger : la fenêtre retourne dans sa pile', !(await fenetres()).includes('p-graphique-or'));
// ── 8. mémoire de disposition ──
const mem = await ev(() => localStorage.getItem('rayle_fenetres_mars-terminal'));
verifier('la disposition est mémorisée', !!mem && mem.length > 20);
// ── 9. un clic dans le vide ne ferme pas le bureau ──
await page.mouse.click(L / 2, 120); await attendre(500);
verifier('cliquer dans le vide ne ferme pas les fenêtres', (await fenetres()).length >= 4);
// ── 10. pile « Mes fenêtres » = tiroir ──
const pm = await pos('ouvertes'); await page.mouse.click(pm.x, pm.y); await attendre(800);
verifier('la pile « Mes fenêtres » ouvre le tiroir', await ev(() => !!document.querySelector('.tf-panneau')));
await page.keyboard.press('Escape'); await attendre(300);
// ── 11. stabilité des piles pendant que des fenêtres sont ouvertes ──
const s1 = await ev(() => window.Mars.etatPlans()); await attendre(2000); const s2 = await ev(() => window.Mars.etatPlans());
verifier('piles immobiles (aucune variation d’opacité ni de position)', JSON.stringify(s1) === JSON.stringify(s2));
// ── 11b. la voix (« montre-moi l'or en H4 ») pose une fenêtre vivante, pas une grande fenêtre ──
await ev(() => window.Mars.terminal().retirerPanneau('graphique-or')); await attendre(400);
const rep = await ev(() => window.Mars.afficherGraphique({ instrument: 'XAU', unite: 'H4' })); await attendre(1500);
verifier('« montre-moi l’or en H4 » : fenêtre posée, unité H4 active', rep.ok && (await fenetres()).includes('p-graphique-or') && await ev(() => document.querySelector('.gf[data-id="p-graphique-or"] .tm-unites .actif').dataset.u === 'H4'), JSON.stringify(rep));
verifier('…et aucune grande fenêtre Panneaux', !(await ev(() => !!document.querySelector('.pn[data-id^="mars-"]'))));
// ── 12. ancien système derrière l’interrupteur ──
verifier('l’interrupteur « ancien système » existe dans ⚙', await ev(() => !!document.getElementById('kAncienFenetres')));
const e = erreurs.filter(x => !/faireconomy|404|ERR_FAILED|ERR_CONNECTION/.test(x)); verifier('aucune erreur JavaScript', !e.length, e.slice(0, 4).join(' | '));
worker.close && worker.close(); await navigateur.close(); process.exit(fin() ? 1 : 0);
