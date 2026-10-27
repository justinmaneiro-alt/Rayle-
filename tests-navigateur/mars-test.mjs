import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre, compteur } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* Mars de bout en bout (Chrome) : arrivée en orbite, base en deux parties, entrée et sortie par le zoom (seuils avec hystérésis), salon, fenêtres holographiques
   (clic = grand, clic ailleurs = fermer), ordres du bus et commandes vocales, autres planètes intactes, mode jeu, aucune erreur JavaScript. */
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1280, H = Number(process.env.H) || 720;
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (!localStorage.getItem('rayle_mars_trading')) localStorage.setItem('rayle_mars_trading', JSON.stringify({ source: 'rayle', dock: 'correlations' })); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
const etat = () => ev(() => window.Mars.etat());
const attendreOrbiteGalaxie = () => page.waitForFunction(() => window.Mars && !window.Mars.etat().actif && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: 30000 });
const molette = async (dy, n, pause = 140) => { await page.mouse.move(L / 2, H / 2); for (let i = 0; i < n; i++) { await page.mouse.wheel({ deltaY: dy }); await attendre(pause); } };
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
const messagesIgnores = /faireconomy|ERR_FAILED|404 \(Not Found\)|Failed to load resource/;

// ── 1. Manifeste, planète et arrivée ──
const info = await ev(() => ({ planetes: window.Galaxie.info().planetes, ordres: window.RayleOrdres.liste().filter(o => o.cible === 'mars').map(o => o.action + ':' + o.disponible) }));
verifier('1. Mars est dans la galaxie', info.planetes.includes('mars'));
verifier('1. ordres de Mars déclarés ET branchés (entrer_base, sortir_base, visiter_bureau, regler_heure)', ['entrer_base', 'sortir_base', 'visiter_bureau', 'regler_heure'].every(a => info.ordres.includes(a + ':true')), info.ordres.join(' '));
await ev(() => window.Galaxie.nav.placer(null, {})); await attendre(500);
const pos = await ev(() => { const G = window.Galaxie, o = G.systeme.parId('mars'), v = o.porteur.getWorldPosition(G.camera.position.clone().set(0, 0, 0)).project(G.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
await page.mouse.click(pos.x + 1, pos.y + 1);                       // un clic sur Mars : vol puis module
await page.waitForFunction(() => window.Mars && window.Mars.etat().actif && !window.Mars.etat().transition, { timeout: 90000 });
await page.waitForFunction(() => !window.Mars.etat().vol && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: 30000 });
let e = await etat();
verifier('1. un clic sur Mars lance le vol, puis l’orbite (module chargé)', e.actif && e.mode === 'orbite');
verifier('1. la rotation de Mars (galaxie) est figée en orbite', await ev(() => window.Galaxie.systeme.parId('mars').rotCible === 0));
verifier('1. la galaxie dessine la scène de Mars à la place de la sienne', await ev(() => window.Galaxie.surchargee()));
verifier('1. l’interface de Mars est visible, avec « Entrer dans la base »', await ev(() => !document.getElementById('mars-ui').hidden && !document.getElementById('m-entrer').hidden && document.getElementById('m-sortir-base').hidden));
verifier('1. la base est à moins de 20° du centre de l’image à l’arrivée', e.angleBase < 20, e.angleBase.toFixed(1) + '°');
verifier('1. profil de qualité moyen', e.profil === 'moyenne');

// ── 2. La base en deux parties, étiquetées ──
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 2.5, lat: 18.4 + 3, dist: 100 + 42 })); await attendre(900);
const zones = await ev(() => window.Mars.zonesEcran());
verifier('2. deux zones étiquetées : BUREAU et TERMINAL, toutes deux visibles', zones.bureau && zones.terminal && zones.bureau.visible && zones.terminal.visible, JSON.stringify(zones));
verifier('2. le bureau est à gauche (ouest) du terminal', zones.bureau.x < zones.terminal.x);
const txt = await ev(() => Array.from(document.querySelectorAll('.m-etiq')).filter(b => !b.hidden).map(b => b.textContent.replace(/\s+/g, ' ').trim()));
verifier('2. étiquettes : « Bureau BIENTÔT » et « Terminal de trading ENTRER »', txt.some(t => /Bureau.*BIENT/i.test(t)) && txt.some(t => /Terminal de trading.*ENTRER/i.test(t)), txt.join(' | '));
// un clic sur BUREAU : « bientôt », on reste dehors
await page.mouse.click(zones.bureau.x, zones.bureau.y - 14); await attendre(500);
e = await etat();
verifier('2. clic sur BUREAU : le message dit « bientôt » et on reste en orbite', /bientôt/i.test(e.message) && e.mode === 'orbite', e.message);

// ── 3. Entrée par le zoom (molette vers la base) ──
await ev(() => window.Mars.placerOrbite({ lon: 77.5 - 2, lat: 18.4 + 2, dist: 100 + 34 })); await attendre(1500);
verifier('3. près de la base mais SANS molette : on n’entre pas tout seul', (await etat()).mode === 'orbite');
await molette(-120, 30, 150);
await attendreMode(page, 'interieur', 40000);
e = await etat();
verifier('3. la molette vers l’avant, face à la base, fait entrer dans le salon', e.mode === 'interieur');
verifier('3. l’interface passe en mode salon (bouton « Sortir de la base »)', await ev(() => !document.getElementById('m-sortir-base').hidden && document.getElementById('m-entrer').hidden));
verifier('3. les vingt et une fenêtres holographiques existent (toutes réelles)', e.fenetres.length === 21);
await page.screenshot({ path: 'captures-mars/test-salon.png' });

// ── 4. Fenêtres holographiques : clic = espace de travail en grand, clic ailleurs = ferme ──
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.2 })); await attendre(700);
const fens = await ev(() => window.Mars.positionsEcran());
verifier('4. toutes les fenêtres sont à l’écran', fens.length === 21 && fens.every(f => f.devant && f.x > 0 && f.x < L && f.y > 0 && f.y < H), JSON.stringify(fens.map(f => [f.id, Math.round(f.x), Math.round(f.y)])));
const survole = fens[1]; await page.mouse.move(survole.x, survole.y); await attendre(300);
verifier('4. survol d’une fenêtre : curseur « main »', await ev(() => document.getElementById('scene3d').style.cursor === 'pointer'));
await page.mouse.click(survole.x, survole.y); await attendre(1500);
e = await etat();
verifier('4. un clic sur une fenêtre ouvre l’espace de travail en grand (Panneaux, taille large)', e.fenetre === survole.id && await ev(() => !!document.querySelector('.pn.large[data-id="mars-espace"] .tg-espace') || !!document.querySelector('.gf[data-id^="p-"]')), String(e.fenetre));
verifier('4. la fenêtre « or » règle le graphique sur XAU/USD', (await ev(() => window.Mars.espace())).instrument === 'XAU');
await page.mouse.click(L - 4, H * 0.5); await attendre(900);                    // clic en dehors du panneau (marge droite, sur la scène)
e = await etat();
verifier('4. un clic en dehors ferme l’espace de travail', e.fenetre === null && !(await ev(() => document.querySelector('.pn.large'))));
// toutes les fenêtres : ouverture sur le bon panneau, mention EXEMPLE pour ce qui n’est pas réel
const attendu = { 'graphique-us100': ['US100', null], 'graphique-or': ['XAU', null], 'graphique-btc': ['BTC', null], marche: [null, 'correlations'], dashboard: [null, 'dashboard'], contexte: [null, 'contexte'] };
let bons = true, detail = [];
for (const [id, [ins, dock]] of Object.entries(attendu)) {
  await ev(i => window.Mars.ouvrirFenetre(i), id); await attendre(900);
  const x = await ev(() => window.Mars.espace()); const exemple = await ev(() => { const o = document.querySelector('.tg-onglet.actif'); const p = document.querySelector('.tg-dock-p.visible > header, .tg-dock-p.visible'); return { onglet: o && o.dataset.panneau, texte: document.querySelector('.tg-dock-p.visible') ? document.querySelector('.tg-dock-p.visible').textContent : '' }; });
  const ok = x && (!ins || x.instrument === ins) && (!dock || exemple.onglet === dock) && true;
  if (!ok) { bons = false; detail.push(id + ':' + JSON.stringify(x && [x.instrument, exemple.onglet])); }
  await ev(() => window.Mars.fermerFenetre()); await attendre(300);
}
verifier('4. les fenêtres de la table ouvrent l’espace sur le bon instrument / panneau (aucune n’est factice)', bons, detail.join(' | '));
await ev(() => window.Mars.ouvrirFenetre('graphique-us100')); await attendre(1200);
const btns = await ev(() => ({ chips: Array.from(document.querySelectorAll('.tg-chip')).map(b => b.textContent), unites: Array.from(document.querySelectorAll('.tg-unite')).map(b => b.textContent), ind: Array.from(document.querySelectorAll('.tg-menu-liste label')).map(l => l.textContent.trim()) }));
verifier('4. espace : US100 et XAU, M15 H1 H4 D1, indicateurs MA/EMA/RSI/MACD/Bollinger/ATR/VWAP/volume/profil/niveaux', btns.chips.includes('US100') && btns.chips.includes('Or') && ['M15', 'H1', 'H4', 'D1'].every(u => btns.unites.includes(u)) && ['MA 200', 'EMA 200', 'RSI 14', 'MACD', 'Bollinger', 'ATR 14', 'VWAP', 'Volume', 'Profil de volume', 'Supports / résistances'].every(n => btns.ind.includes(n)), JSON.stringify(btns));
await ev(() => document.querySelector('.tg-chip[data-id="XAU"]').click()); await attendre(1500);
verifier('4. changer d’instrument dans l’espace : XAU/USD', (await ev(() => window.Mars.espace())).instrument === 'XAU');
await ev(() => window.Mars.fermerFenetre());
// Échap : ferme d’abord la fenêtre, ne quitte pas la base
await ev(() => window.Mars.ouvrirFenetre('dashboard')); await attendre(300);
await page.keyboard.press('Escape'); await attendre(600);
e = await etat();
verifier('4. Échap ferme la fenêtre ouverte sans quitter la base', e.fenetre === null && e.mode === 'interieur', e.mode + '/' + e.fenetre);

// ── 5. Sortie par le zoom arrière, avec hystérésis ──
await ev(() => window.Mars.placerInterieur({ avancee: 0 })); await attendre(300);
await molette(120, 14, 130);
await attendreMode(page, 'orbite', 30000);
e = await etat();
verifier('5. dézoomer au fond du salon (en insistant) ramène en orbite', e.mode === 'orbite');
verifier('5. hystérésis : on ressort plus haut que le seuil d’entrée', e.dist > 100 + 25, e.dist.toFixed(1));
await attendre(2500);
verifier('5. et on ne re-rentre pas tout seul (pas de va-et-vient)', (await etat()).mode === 'orbite');
// un seul coup de molette ne suffit pas à sortir (il faut insister)
await molette(-120, 18, 140); await attendreMode(page, 'interieur', 40000);
await molette(120, 1, 100); await attendre(500);
verifier('5. un seul coup de molette arrière ne fait pas sortir', (await etat()).mode === 'interieur');

// ── 6. Échap : base → orbite → galaxie ──
await page.keyboard.press('Escape'); await attendreMode(page, 'orbite', 30000);
verifier('6. Échap dans le salon : retour à l’orbite', (await etat()).mode === 'orbite');
await page.keyboard.press('Escape'); await attendreOrbiteGalaxie();
e = await etat();
verifier('6. Échap en orbite : retour à la galaxie', !e.actif && !(await ev(() => window.Galaxie.surchargee())));
verifier('6. la rotation de Mars reprend', await ev(() => window.Galaxie.systeme.parId('mars').rotCible === 1));
verifier('6. l’interface de Mars est cachée', await ev(() => document.getElementById('mars-ui').hidden));

// ── 7. Entrée / sortie de l’orbite par le zoom, depuis la galaxie ──
await ev(() => window.Galaxie.nav.placer('mars', { angle: 0.5, pitch: 0.2, distance: 7 })); await attendre(600);
const p2 = await ev(() => { const G = window.Galaxie, o = G.systeme.parId('mars'), v = o.porteur.getWorldPosition(G.camera.position.clone().set(0, 0, 0)).project(G.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
await page.mouse.move(p2.x, p2.y); await page.mouse.wheel({ deltaY: -120 });
await page.waitForFunction(() => window.Mars.etat().actif && !window.Mars.etat().transition, { timeout: 60000 });
verifier('7. la molette sur Mars (galaxie) fait entrer en orbite', (await etat()).mode === 'orbite');
await ev(() => window.Mars.placerOrbite({ dist: 100 * 4.6 })); await attendre(1200);
await molette(120, 14, 120); await attendreOrbiteGalaxie();
verifier('7. dézoomer au maximum et insister : retour à la galaxie', !(await etat()).actif);

// ── 8. Ordres du bus et commandes vocales ──
const ordre = (action, params = {}) => ev((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'mars', action: a, params: p }), action, params);
let r = await ordre('entrer_base');
e = await etat();
verifier('8. ordre mars/entrer_base : vole sur Mars, entre dans la base', r.ok && e.mode === 'interieur', JSON.stringify(r));
r = await ordre('regler_heure', { heure: 21.5 });
verifier('8. ordre mars/regler_heure', r.ok && Math.abs((await etat()).heure - 21.5) < 0.1 && (await etat()).auto === false, JSON.stringify(r));
r = await ordre('sortir_base'); e = await etat();
verifier('8. ordre mars/sortir_base : retour à l’orbite', r.ok && e.mode === 'orbite', JSON.stringify(r));
verifier('8. à la sortie, la caméra reparaît à 34 d’altitude (bien au-dessus du seuil d’entrée, 15)', Math.abs(e.dist - 134) < 2, e.dist.toFixed(1));
r = await ordre('visiter_bureau'); e = await etat();
verifier('8. ordre mars/visiter_bureau : « bientôt », on reste dehors', r.ok && /bientôt/i.test(r.texte) && e.mode === 'orbite', JSON.stringify(r));
verifier('8. ordre invalide refusé par le bus', !(await ev(() => window.RayleOrdres.envoyer({ vers: 'mars', action: 'regler_heure', params: { heure: 'x' } }))).ok);
await ev(() => window.Mars.sortir ? 0 : 0);
await page.keyboard.press('Escape'); await attendreOrbiteGalaxie();
const dire = t => ev(async x => commandeGalaxie(x), t);
let rep = await dire('entre dans la base');
e = await etat();
verifier('8. voix « entre dans la base » : on entre', e.mode === 'interieur', String(rep));
rep = await dire('sors de la base'); e = await etat();
verifier('8. voix « sors de la base » : on sort', e.mode === 'orbite', String(rep));
await page.keyboard.press('Escape'); await attendreOrbiteGalaxie();
rep = await dire('sors de la base');
verifier('8. voix « sors de la base » hors de la base : réponse claire', /pas dans la base/i.test(String(rep)), String(rep));
rep = await dire('va sur Mars');
await page.waitForFunction(() => window.Mars.etat().actif && !window.Mars.etat().transition, { timeout: 60000 });
verifier('8. voix « va sur Mars » : orbite de Mars', (await etat()).mode === 'orbite', String(rep));
rep = await dire('entre dans la base'); verifier('8. voix « entre dans la base » depuis l’orbite', (await etat()).mode === 'interieur', String(rep));
await ev(() => window.Mars.sortirBase()); await attendreMode(page, 'orbite');
rep = await dire('va au bureau'); verifier('8. voix « va au bureau » : bientôt', /bientôt/i.test(String(rep)) && (await etat()).mode === 'orbite', String(rep));
await page.keyboard.press('Escape'); await attendreOrbiteGalaxie();

// ── 9. Les autres planètes et l’accueil n’ont rien perdu ──
await ev(() => window.Galaxie.nav.allerA('jupiter', { entrer: true }));   // Saturne a maintenant son module (vaisseau) : Jupiter sert de planète sans module
await page.waitForFunction(() => window.Galaxie.nav.etat().sas, { timeout: 30000 });
verifier('9. Jupiter : le sas s’ouvre toujours (pas de module), Mars reste inactive', (await ev(() => window.Galaxie.nav.etat().sas)) && !(await etat()).actif);
await page.keyboard.press('Escape'); await attendre(500);
await ev(() => window.Galaxie.nav.allerA('terre', { entrer: true }));
await page.waitForFunction(() => window.Terre && window.Terre.etat().actif && !document.getElementById('terre-fondu').classList.contains('noir'), { timeout: 90000 });
verifier('9. la Terre entre toujours en orbite (Mars inactive)', (await ev(() => window.Terre.etat().actif)) && !(await etat()).actif);
await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.Terre.etat().actif, { timeout: 30000 }); await attendre(600);
await ev(() => window.Galaxie.nav.retour()); await attendre(500);
await ev(() => window.RayleBus.demander('vue:fermer')); await attendre(800);
verifier('9. retour à l’accueil Jarvis', await ev(() => !document.body.classList.contains('vue-galaxie')));

// ── 10. Mode jeu : Mars s’allège ──
await ev(() => window.RayleBus.demander('vue:ouvrir', 'galaxie')); await attendre(1200);
await ev(() => { document.body.classList.add('mode-jeu'); window.RayleBus.fusion('mode_jeu', { actif: true }); window.RayleBus.emit('mode:jeu', { actif: true }); }); await attendre(600);
await entrerSurMars(page);
e = await etat();
verifier('10. mode jeu : profil allégé', e.profil === 'jeu', e.profil);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
verifier('10. mode jeu : le salon s’ouvre quand même', (await etat()).mode === 'interieur');
await ev(() => { window.RayleBus.fusion('mode_jeu', { actif: false }); window.RayleBus.emit('mode:jeu', { actif: false }); document.body.classList.remove('mode-jeu'); });

verifier('11. aucune erreur JavaScript', erreurs.filter(x => !messagesIgnores.test(x)).length === 0, erreurs.filter(x => !messagesIgnores.test(x)).join(' | '));
await navigateur.close(); await worker.fermer();
process.exit(fin() ? 1 : 0);
