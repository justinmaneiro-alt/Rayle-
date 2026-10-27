import fs from 'node:fs';
import { ouvrirGalaxieTheme, entrerSurMars, attendreMode, attendre, compteur } from './r2-aide.mjs';

/* V2 phase 13 : le PARCOURS DES VIDÉOS de bout en bout, dans une seule session Chrome (vraie page, vrai WebGL, thème Jarvis) :
   accueil Jarvis → Sources en direct → galaxie → Mars → entrer dans le salon → fenêtres de la table → Agent BTC → sortir → Saturne → salle médicale → anatomie (squat) → retour à l'accueil.
   Mesure aussi : erreurs de console, images par seconde à chaque étape, mémoire (tas JavaScript) au début et à la fin.   Lancer : node tests-navigateur/v2-parcours-final-test.mjs   (≈ 3 min) */
const { verifier, fin } = compteur();
fs.mkdirSync('captures-accueil', { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900, theme: 'jarvis' });
const ev = (f, ...a) => page.evaluate(f, ...a);
const ordre = (vers, a, p = {}) => ev((v, a2, p2) => window.RayleOrdres.envoyer({ de: 'rayle', vers: v, action: a2, params: p2 }), vers, a, p);
const memoire = () => ev(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
const fps = async (ms = 1500) => ev(async d => { let n = 0; const t0 = performance.now(); await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < d) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return Math.round(n * 1000 / (performance.now() - t0)); }, ms);
const mesures = []; const noter = async nom => { mesures.push({ nom, fps: await fps(), tas: await memoire() }); };
const tas0 = await memoire();
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));

// ── 1. accueil Jarvis ──
await ev(() => window.RayleBus.demander('vue:fermer')); await attendre(1500);
verifier('1. accueil Jarvis : thème, entité et tableau de bord vivant', await ev(() => document.body.classList.contains('jarvis') && !!document.getElementById('tableau') && document.querySelectorAll('#tableau .tb-f').length >= 4));
await noter('accueil Jarvis');
// ── 2. Sources en direct ──
await ev(() => document.getElementById('btnSources').click()); await attendre(2500);
verifier('2. « Sources en direct » s’ouvre dans une fenêtre du bureau avec ses 6 onglets', await ev(() => { const f = document.querySelector('.gf[data-id="w-sources"]'); return !!f && ['Événements', 'Communiqués', 'Télévisions', 'Réseaux', 'Podcasts', 'Aujourd'].every(t => f.textContent.includes(t)); }));
await ev(() => document.querySelector('.gf[data-id="w-sources"] [data-b="fermer"]').click()); await attendre(500);
// ── 3. galaxie ──
await ev(() => document.getElementById('btnOuvrirGalaxie').click()); await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }); await attendre(800);
await noter('galaxie');
verifier('3. la galaxie s’ouvre et tourne', await ev(() => !!window.Galaxie && !!window.Galaxie.scene));
// ── 4. Mars : salon, fenêtres, Agent BTC ──
await entrerSurMars(page); await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur'); await ev(() => window.Mars.auto(false)); await attendre(1500);
await ev(() => window.Mars.ouvrirPanneauTerminal('graphiques')); await page.waitForFunction(() => window.Mars.terminal && window.Mars.terminal(), { timeout: 30000 }); await attendre(1500);
verifier('4. dans le salon de Mars, la table porte ses 7 piles (27 panneaux)', await ev(() => window.Mars.etat().mode === 'interieur' && ['graphiques', 'macro', 'actus', 'sentiment', 'agent', 'alertes', 'perf'].reduce((n, d) => n + window.Mars.terminal().dossiers.dossier(d).ids.length, 0) === 27));
await noter('Mars : salon');
await attendre(1500);
await ev(() => window.Mars.terminal().ouvrirPanneau('graphique-or')); await attendre(2500);
verifier('   une fenêtre du terminal s’ouvre comme fenêtre vivante (pas de grande fenêtre par-dessus)', await ev(() => !!document.querySelector('.gf[data-id="p-graphique-or"]')));
await ev(async () => { await import(new URL('planetes/mars/pc/trading/fenetre-agent.js', document.baseURI).href); await window.PosteAgent.ouvrir({}); }); await attendre(2500);
verifier('5. la fenêtre « Agent BTC » s’ouvre (poste de pilotage) sans erreur', await ev(() => !!window.PosteAgent && !!window.PosteAgent.poste && !!document.querySelector('.pa-onglets, #poste-agent, [data-onglet]')));
await noter('Mars : Agent BTC'); await page.screenshot({ path: 'captures-accueil/v2-parcours-mars-agent.png' });
await ev(() => { try { window.PosteAgent.fermer && window.PosteAgent.fermer(); } catch (e) { /* déjà fermée */ } document.querySelectorAll('.gf [data-b="fermer"]').forEach(b => { try { b.click(); } catch (e) { /* ignoré */ } }); });
await ev(() => window.Mars.sortirBase()); await attendreMode(page, 'orbite'); await attendre(800);
// ── 6. retour galaxie, Saturne, salle médicale, anatomie ──
await ev(() => window.dispatchEvent(new CustomEvent('galaxie:sortie'))); await attendre(2500);
await ev(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 90000 }); await attendre(1000);
verifier('6. à bord du vaisseau de Saturne', await ev(() => window.Saturne.etat().actif));
await ordre('saturne', 'ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 90000 }); await attendre(1200);
verifier('7. la salle médicale charge le squelette (≥ 200 pièces)', await ev(() => window.Saturne.anatomieObjet().etatPublic().visibles >= 200));
await ev(async () => { await window.Saturne.anatomieObjet().afficherSysteme('muscles'); }); await attendre(1500);
const sqr = await ordre('saturne', 'animer', { mouvement: 'squat' }); await attendre(3000);
verifier('8. le squat est joué avec les muscles affichés (ordre accepté, muscles visibles)', !!sqr && sqr.ok !== false && await ev(() => window.Saturne.anatomieObjet().etatPublic().visibles >= 200), JSON.stringify(sqr).slice(0, 160));
await noter('Saturne : anatomie (squat)'); await page.screenshot({ path: 'captures-accueil/v2-parcours-anatomie-squat.png' });
await ev(() => { window.Saturne.anatomieObjet().orchestre.glue.fenetres.fermerTout(); }); await attendre(500);
// ── 9. retour à l'accueil ──
await ev(() => window.Saturne.sortirSalle && window.Saturne.sortirSalle()); await attendre(800);
await ev(() => window.Saturne.sortir()); await attendre(2500);
await ev(() => window.RayleBus.demander('vue:fermer')); await attendre(1800);
verifier('9. retour à l’accueil Jarvis, entité et tableau de bord intacts', await ev(() => document.body.classList.contains('jarvis') && document.querySelectorAll('#tableau .tb-f').length >= 4));
await noter('accueil (retour)');
const tas1 = await memoire();
const ext = /faireconomy|CORS|Failed to load resource|ERR_FAILED|Password field|ERR_BLOCKED|WebGL.*(?:Performance|GPU stall)|favicon/i;
const miennes = erreurs.filter(e => !ext.test(e));
verifier('aucune erreur JavaScript pendant tout le parcours', miennes.length === 0, miennes.slice(0, 5).join(' | '));
console.log('\nMesures par étape (images/s de la page, tas JavaScript en Mo) :'); for (const m of mesures) console.log('  ' + m.nom.padEnd(30) + String(m.fps).padStart(4) + ' i/s   ' + m.tas + ' Mo');
console.log('  tas au début : ' + tas0 + ' Mo, à la fin : ' + tas1 + ' Mo');
verifier('mémoire : le tas JavaScript ne dépasse pas 3 fois son niveau de départ + 150 Mo après tout le parcours', tas1 === null || tas1 <= tas0 * 3 + 150, tas0 + ' → ' + tas1);
fs.writeFileSync('docs/resultats-v2/parcours-final.json', JSON.stringify({ date: new Date().toISOString(), mesures, tas0, tas1, erreurs: miennes.length }, null, 1));
await navigateur.close(); fin();
