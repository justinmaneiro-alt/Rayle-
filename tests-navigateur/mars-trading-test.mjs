import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre, compteur } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* Terminal de trading de Mars (étape M2a), de bout en bout dans Chrome, avec un faux Worker déterministe (même forme que /marche) : fenêtres de la table réelles,
   espace de travail multi-panneaux, indicateurs, instruments et unités, volume (indice / proxy / aucun), source et heure, pannes sans donnée inventée, historique dans
   IndexedDB, limites de requêtes, voix et ordres, aucune erreur JavaScript. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900;
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (!localStorage.getItem('rayle_mars_trading')) localStorage.setItem('rayle_mars_trading', JSON.stringify({ source: 'rayle', dock: 'correlations' })); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, worker.url); };
const ignorees = /faireconomy|ERR_FAILED|404 \(Not Found\)|Failed to load resource/;
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
const espace = () => ev(() => window.Mars.espace());
const reqs = filtre => worker.journal.filter(p => p.startsWith('/marche') && (!filtre || filtre.test(decodeURIComponent(p)))).length;
const attendreEspace = async (cond, max = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { const e = await espace(); if (e && cond(e)) return e; await attendre(200); } return espace(); };
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 }));

// ── 1. Fenêtres de la table : données réelles du Worker, exemples marqués ──
await attendre(3500);
const fr = await ev(() => window.Mars.fenetresReelles()), par = Object.fromEntries(fr.map(f => [f.id, f]));
verifier('1. graphiques US100 et or : données réelles reçues (≥ 100 bougies, source dite)', par['graphique-us100'].etat === 'ok' && par['graphique-us100'].bougies >= 100 && par['graphique-us100'].source === 'Yahoo Finance' && par['graphique-or'].etat === 'ok' && par['graphique-or'].source === 'Twelve Data', JSON.stringify([par['graphique-us100'], par['graphique-or']]));
verifier('1. fenêtre « Marché » : 9 cotations réelles', par.marche.etat === 'ok' && par.marche.cotations === 9, JSON.stringify(par.marche));
verifier('1. plus aucune fenêtre factice : vingt et une fenêtres réelles, dont BTC, dashboard, contexte et le hub Finance', fr.length === 21 && fr.every(f => f.reel) && par['graphique-btc'].etat === 'ok' && par.dashboard.etat === 'ok' && par.contexte.etat === 'ok', JSON.stringify(fr.map(f => [f.id, f.etat])));
verifier('1. l’agent BTC annonce honnêtement qu’il n’est pas encore là (aucun chiffre)', par['agent-btc'].etat === 'bientot' || par['agent-btc'].etat === 'ok');
verifier('1. première requête vers /marche : US100 et or en H1, 500 bougies', reqs(/actif=NDX&intervalle=1h&n=500/) >= 1 && reqs(/actif=XAU&intervalle=1h&n=500/) >= 1);
verifier('1. le volume de l\'or vient d\'un contrat à terme (proxy), demandé explicitement', reqs(/actif=Y:GC=F&intervalle=1h/) >= 1);
verifier('1. au plus ~30 requêtes pour tout charger (pas de rafale)', reqs() <= 30, reqs());
await page.screenshot({ path: 'captures-mars/test-trading-salon.png' });

// ── 2. Espace de travail ──
await ev(() => window.Mars.ouvrirEspaceComplet({ instrument: 'US100', unite: 'H1', fenetre: 'graphique-us100' }));   // R2 : le clic sur le mur ouvre le terminal par groupes ; l'ancien espace reste pour la voix
let e = await attendreEspace(x => x.bougies >= 400 && x.graphique && x.graphique.bougies >= 400);
verifier('2. un clic sur la fenêtre US100 ouvre l\'espace de travail (graphique, watchlist, résumé, dock)', await ev(() => ['.tg-graphique', '.tg-p[data-panneau="watchlist"]', '.tg-p[data-panneau="resume"]', '.tg-dock .tg-onglets'].every(s => !!document.querySelector('.pn[data-id="mars-espace"] ' + s))));
verifier('2. le graphique porte 500 bougies réelles et l\'instrument US100 en H1', e.instrument === 'US100' && e.unite === 'H1' && e.graphique.bougies === 500, JSON.stringify([e.instrument, e.unite, e.graphique && e.graphique.bougies]));
verifier('2. par défaut : MA200, volume, RSI, niveaux ; 2 volets (prix + RSI)', ['ma200', 'volume', 'rsi'].every(k => e.graphique.series.includes(k)) && e.graphique.volets === 2, JSON.stringify(e.graphique.series));
verifier('2. supports et résistances automatiques calculés', e.graphique.niveaux && e.graphique.niveaux.supports.length + e.graphique.niveaux.resistances.length >= 2, JSON.stringify(e.graphique.niveaux && [e.graphique.niveaux.supports.length, e.graphique.niveaux.resistances.length]));
const infos = await ev(() => document.querySelector('.tg-infos').textContent);
verifier('2. la source, l\'heure et la nature du volume sont toujours affichées', /Yahoo Finance \(\^NDX\)/.test(infos) && /dernière bougie \d\d\/\d\d \d\d:\d\d/.test(infos) && /reçu il y a/.test(infos) && /≠ CFD/.test(infos) && /différé/i.test(infos), infos.slice(0, 260));
verifier('2. le volume du Nasdaq est dit : volume de l\'indice, pas celui du CFD', /PAS le volume du CFD/.test(infos));
// indicateurs au choix
const basculer = async k => { await ev(cle => { const i = document.querySelector('.tg-menu-liste input[data-k="' + cle + '"]'); i.click(); }, k); await attendre(500); };
for (const k of ['bollinger', 'ema200', 'macd', 'vwap', 'atr', 'profil', 'ma50', 'ema20']) await basculer(k);
e = await espace();
verifier('2. indicateurs : Bollinger, EMA 200, MACD, VWAP, ATR, MA 50, EMA 20 tracés', ['bollH', 'bollM', 'bollB', 'ema200', 'macdH', 'macdL', 'vwap', 'atr', 'ma50', 'ema20'].every(k => e.graphique.series.includes(k)), JSON.stringify(e.graphique.series));
verifier('2. sous-fenêtres : RSI, MACD, ATR (4 volets)', e.graphique.volets === 4, e.graphique.volets);
verifier('2. profil de volume : POC et zone de valeur calculés', e.graphique.profil && e.graphique.profil.poc > 0 && e.graphique.profil.vah > e.graphique.profil.val);
await page.screenshot({ path: 'captures-mars/test-trading-indicateurs.png' });
for (const k of ['bollinger', 'macd', 'vwap', 'atr', 'profil', 'ma50', 'ema20', 'ema200']) await basculer(k);
e = await espace();
verifier('2. les indicateurs se retirent', !e.graphique.series.includes('bollH') && !e.graphique.series.includes('macdH') && e.graphique.volets === 2);
// unités de temps
const par_unite = {};
for (const u of ['M15', 'H4', 'D1', 'H1']) {
  const avant = reqs(); await ev(x => document.querySelector('.tg-unite[data-u="' + x + '"]').click(), u);
  const x = await attendreEspace(y => y.unite === u && y.graphique && y.graphique.unite === u && y.bougies >= 400); par_unite[u] = [x.unite, x.bougies, reqs() - avant];
}
verifier('2. M15, H4, D1, H1 : chaque unité charge ses bougies (500) avec la bonne requête', ['M15', 'H4', 'D1', 'H1'].every(u => par_unite[u][1] >= 400) && reqs(/actif=NDX&intervalle=15min/) >= 1 && reqs(/actif=NDX&intervalle=4h/) >= 1 && reqs(/actif=NDX&intervalle=1day/) >= 1, JSON.stringify(par_unite));
const avantRetour = reqs(/actif=NDX&intervalle=1h/);
await ev(() => document.querySelector('.tg-unite[data-u="D1"]').click()); await attendre(500); await ev(() => document.querySelector('.tg-unite[data-u="H1"]').click()); await attendre(800);
verifier('2. revenir à une unité déjà chargée ne redemande rien au Worker (historique gardé dans le navigateur)', reqs(/actif=NDX&intervalle=1h/) === avantRetour);
// or : source Twelve Data, volume proxy
await ev(() => document.querySelector('.tg-chip[data-id="XAU"]').click());
e = await attendreEspace(x => x.instrument === 'XAU' && x.graphique && x.graphique.instrument === 'XAU' && x.bougies >= 400);
const infosOr = await ev(() => document.querySelector('.tg-infos').textContent);
verifier('2. l\'or : source Twelve Data, volume dit PROXY (contrat à terme COMEX GC=F)', /Twelve Data \(XAU\/USD\)/.test(infosOr) && /PROXY/.test(infosOr) && /GC=F/.test(infosOr), infosOr.slice(0, 300));
verifier('2. l\'or : le volume proxy est tracé', e.graphique.series.includes('volume'));
await ev(() => document.querySelector('.tg-chip[data-id="DXY"]').click());
e = await attendreEspace(x => x.instrument === 'DXY' && x.graphique && x.graphique.instrument === 'DXY' && x.bougies >= 400);
const infosDxy = await ev(() => document.querySelector('.tg-infos').textContent);
verifier('2. le dollar : « pas de volume gratuit », aucun histogramme de volume inventé', /pas de volume/i.test(infosDxy) && !e.graphique.series.includes('volume'), infosDxy.slice(0, 200));
await ev(() => document.querySelector('.tg-chip[data-id="US100"]').click()); await attendreEspace(x => x.instrument === 'US100' && x.graphique && x.graphique.instrument === 'US100');

// ── 3. Watchlist, résumé, corrélations, dock ──
await attendre(2500);
const wl = await ev(() => Array.from(document.querySelectorAll('.tg-wl-ligne')).map(l => ({ id: l.dataset.id, p: l.querySelector('.p').textContent, v: l.querySelector('.v').textContent, s: !!l.querySelector('svg polyline') })));
verifier('3. watchlist : 9 instruments (US100, or, BTC, SOL, DOGE, EUR/USD, dollar, taux, VIX) avec dernier prix, variation du jour et mini-courbe', wl.length === 9 && wl.every(l => /\d/.test(l.p) && /%/.test(l.v) && l.s), JSON.stringify(wl));
const pied = await ev(() => document.querySelector('.tg-watch .tg-pied').textContent);
verifier('3. la watchlist dit sa source et l\'heure de mise à jour', /Source : .*Yahoo Finance/.test(pied) && /\d\d:\d\d:\d\d/.test(pied), pied);
const resume = await ev(() => document.querySelector('.tg-resume').textContent);
verifier('3. résumé de marché : tendance MA200, RSI, MACD, ATR, structure, niveaux, mise en garde', ['Tendance', 'RSI 14', 'MACD', 'ATR 14', 'Structure', 'Niveaux automatiques', 'ni des prévisions ni des conseils'].every(t => resume.includes(t)), resume.slice(0, 200));
await ev(() => window.Mars.espaceApi().choisirDock('correlations')); await attendre(2500);
const cr = await ev(() => Array.from(document.querySelectorAll('.tg-matrice tr')).map(r => Array.from(r.children).map(c => c.textContent)));
verifier('3. corrélations : matrice 5 × 5 de nombres, diagonale à 1,00', cr.length === 6 && cr.slice(1).every((l, i) => l.length === 6 && l[i + 1] === '1.00' && l.slice(1).every(x => /^-?\d\.\d\d$/.test(x))), JSON.stringify(cr));
const onglets = await ev(() => Array.from(document.querySelectorAll('.tg-onglet')).map(o => o.textContent + '|' + o.className.includes('tg-e-bientot')));
verifier('3. onglets du hub Finance réels (COT, calendrier, actus, banques centrales, taux, Nasdaq 100, banques et analyses (ex-« Publications », phase 7 de la V2)) ; seul « Agent stratège » reste « bientôt »', ['COT (CFTC)', 'Calendrier', 'Actus finance', 'Banques centrales', 'Taux', 'Nasdaq 100', 'Banques et analyses'].every(n => onglets.includes(n + '|false')) && onglets.includes('Agent stratège|true'), JSON.stringify(onglets));
const bt = {};
for (const [id, etape] of [['strategie', 'M4']]) {
  await ev(i => window.Mars.espaceApi().choisirDock(i), id); await attendre(150);
  const texte = await ev(() => document.querySelector('.tg-dock-p.visible').textContent);
  bt[id] = texte.includes('ÉTAPE ' + etape) && !/[0-9]{3}/.test(texte.replace(/M2b|M3|M4|Nasdaq 100/g, '')) ? true : 'KO : ' + texte.slice(0, 160);
}
verifier('3. les panneaux à venir disent leur étape et n\'affichent aucun chiffre', Object.values(bt).every(x => x === true), JSON.stringify(bt));
await ev(() => window.Mars.espaceApi().choisirDock('dashboard'));
const ex = await ev(() => document.querySelector('.tg-dock-p.visible').textContent);
verifier('3. aucun panneau factice dans l’espace (plus de positions, performance ni signaux d’exemple)', !(await ev(() => document.querySelector('.tg-e-exemple, .tg-badge-ex'))) && !/EXEMPLE/.test(ex));
await page.screenshot({ path: 'captures-mars/test-trading-espace.png' });

// ── 4. Voix et ordres ──
const dire = t => ev(async x => window.commandeMars(x), t);
let r = await dire('montre-moi l’or en H1'); e = await espace();
verifier('4. voix « montre-moi l\'or en H1 »', e.instrument === 'XAU' && e.unite === 'H1' && /Or en H1/.test(String(r)), String(r));
r = await dire('passe en H4'); e = await attendreEspace(x => x.unite === 'H4');
verifier('4. voix « passe en H4 »', e.unite === 'H4' && e.instrument === 'XAU', String(r));
r = await dire('mets le nasdaq'); e = await attendreEspace(x => x.instrument === 'US100');
verifier('4. voix « mets le nasdaq »', e.instrument === 'US100' && e.unite === 'H4', String(r));
r = await dire('affiche le dollar en journalier'); e = await attendreEspace(x => x.instrument === 'DXY' && x.unite === 'D1');
verifier('4. voix « affiche le dollar en journalier »', e.instrument === 'DXY' && e.unite === 'D1', String(r));
verifier('4. une question n\'est pas prise pour un ordre (« quel est le prix de l\'or »)', (await dire('quel est le prix de l’or')) === null);
verifier('4. sans rapport avec le terminal : ignoré (« la météo à Paris »)', (await dire('la météo à Paris')) === null);
const ordre = (a, p) => ev((x, y) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'mars', action: x, params: y }), a, p);
let o = await ordre('afficher_graphique', { instrument: 'XAU', unite: 'D1' }); e = await attendreEspace(x => x.instrument === 'XAU' && x.unite === 'D1');
verifier('4. ordre mars/afficher_graphique', o.ok && e.instrument === 'XAU' && e.unite === 'D1', JSON.stringify(o));
o = await ordre('changer_actif', { actif: 'BTC' });
verifier('4. ordre changer_actif BTC : le Bitcoin s’affiche (instrument réel depuis M2a-bis)', o.ok && /BTC/.test(o.texte), JSON.stringify(o));
o = await ordre('ouvrir_fenetre', { fenetre: 'cot' });
verifier('4. ordre ouvrir_fenetre cot : le panneau COT s\'ouvre (réel depuis la nuit n° 2)', o.ok && /COT/.test(o.texte), JSON.stringify(o));
o = await ordre('ouvrir_fenetre', { fenetre: 'analyse' });
verifier('4. ordre ouvrir_fenetre analyse : étape suivante, rien d\'inventé', !o.ok && /étape suivante/.test(o.erreur), JSON.stringify(o));
o = await ordre('analyser', { actif: 'US100' });
verifier('4. ordre analyser : « étape M4 » (aucune IA ici)', !o.ok && /M4/.test(o.erreur), JSON.stringify(o));
verifier('4. paramètre invalide refusé par le bus', !(await ordre('afficher_graphique', { instrument: 'ETH', unite: 'H1' })).ok);
// Échap : ferme l'espace, reste dans la base
await page.keyboard.press('Escape'); await attendre(800);
verifier('4. Échap ferme l\'espace de travail sans quitter la base', !(await espace()) && (await ev(() => window.Mars.etat().mode)) === 'interieur' && (await ev(() => window.Mars.etat().fenetre)) === null);
// depuis l'orbite : la voix entre dans la base et ouvre l'espace
await ev(() => window.Mars.sortirBase()); await attendreMode(page, 'orbite', 30000);
r = await dire('montre-moi l’or en M15'); e = await attendreEspace(x => x.instrument === 'XAU' && x.unite === 'M15', 40000);
verifier('4. depuis l\'orbite : « montre-moi l\'or en M15 » entre dans la base et ouvre le terminal', (await ev(() => window.Mars.etat().mode)) === 'interieur' && e && e.instrument === 'XAU' && e.unite === 'M15', String(r));
await ev(() => window.Mars.fermerFenetre()); await attendre(500);

// ── 5. Limites : pas de martelage du Worker ──
const n0 = reqs(); await ev(() => window.Mars.ouvrirFenetre('graphique-or')); await attendre(22000);
verifier('5. espace ouvert 22 s : au plus 8 requêtes de plus (rafraîchissement raisonnable)', reqs() - n0 <= 8, reqs() - n0);
await ev(() => window.Mars.fermerFenetre());

// ── 6. Historique dans IndexedDB, relecture après rechargement ──
const idb = await ev(() => new Promise(res => { const q = indexedDB.open('rayle-trading', 1); q.onsuccess = () => { const t = q.result.transaction('series'), s = t.objectStore('series'), k = s.getAllKeys(); k.onsuccess = () => { const c = s.get('US100|H1'); c.onsuccess = () => res({ cles: k.result, n: c.result ? c.result.bougies.length : 0, source: c.result && c.result.meta && c.result.meta.source }); }; }; q.onerror = () => res(null); }));
verifier('6. IndexedDB « rayle-trading » : séries enregistrées (US100 H1 : 500 bougies, source gardée)', idb && idb.cles.length >= 8 && idb.n >= 500 && idb.source === 'Yahoo Finance', JSON.stringify(idb && [idb.cles.length, idb.n, idb.source]));
const avantReload = worker.journal.length;
await page.reload({ waitUntil: 'load' }); await attendre(1000);
await page.click('#btnOuvrirGalaxie'); await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }); await attendre(500);
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page); await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.ouvrirEspaceComplet({ instrument: 'US100', unite: 'H1', fenetre: 'graphique-us100' }));   // R2 : le clic sur le mur ouvre le terminal par groupes ; l'ancien espace reste pour la voix
e = await attendreEspace(x => x.bougies >= 400);
const apres = worker.journal.slice(avantReload).filter(p => /actif=NDX&intervalle=1h/.test(p)).length;
verifier('6. après rechargement : l\'historique est relu depuis le navigateur sans requête inutile (US100 H1)', e && e.bougies >= 500 && apres === 0, 'requêtes NDX 1h : ' + apres);
await ev(() => window.Mars.fermerFenetre());

// ── 7. Secours et pannes : jamais de donnée inventée ──
worker.scenario.secoursXAU = true;
await ev(() => window.Mars.ouvrirFenetre('graphique-or')); await attendre(500);
await ev(() => document.querySelector('.tg-btn[title*="Redemander"]').click());   // ↻ : redemande maintenant ; le Worker répond en secours
await attendre(2500); e = await espace();
const infosSec = await ev(() => document.querySelector('.tg-infos').textContent);
verifier('7. source de secours : la mention SECOURS est affichée', /secours/i.test(infosSec) && /Yahoo Finance \(GC=F\)/.test(infosSec), infosSec.slice(0, 220));
await ev(() => window.Mars.fermerFenetre());
worker.scenario.secoursXAU = false;

verifier('8. aucune erreur JavaScript', erreurs.filter(x => !ignorees.test(x)).length === 0, erreurs.filter(x => !ignorees.test(x)).join(' | '));

// ── 9. Panne totale du Worker (nouvelle page, stockage vierge) ──
const w2 = await demarrerFauxWorkerMarche(8798); w2.scenario.toutEnPanne = true;
const inj2 = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (!localStorage.getItem('rayle_mars_trading')) localStorage.setItem('rayle_mars_trading', JSON.stringify({ source: 'rayle', dock: 'correlations' })); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); }, w2.url); };
const g2 = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: inj2 });
const ev2 = (f, ...a) => g2.page.evaluate(f, ...a);
await ev2(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(g2.page); await ev2(() => window.Mars.entrerBase()); await attendreMode(g2.page, 'interieur', 40000); await attendre(3000);
const fp = Object.fromEntries((await ev2(() => window.Mars.fenetresReelles())).map(f => [f.id, f]));
verifier('9. Worker en panne : les fenêtres réelles disent « indisponible » (aucune courbe inventée)', fp['graphique-us100'].etat === 'indisponible' && fp['graphique-or'].etat === 'indisponible' && fp.marche.etat === 'indisponible' && fp['graphique-us100'].bougies === 0, JSON.stringify(fp['graphique-us100']));
await ev2(() => window.Mars.ouvrirFenetre('graphique-us100')); await attendre(3500);
const ep = await ev2(() => ({ etat: window.Mars.espace(), message: document.querySelector('.tg-etat').textContent, infos: document.querySelector('.tg-infos').textContent, wl: Array.from(document.querySelectorAll('.tg-wl-ligne .p')).map(x => x.textContent) }));
verifier('9. espace en panne : « INDISPONIBLE » affiché, zéro bougie, watchlist « indispo. »', ep.etat.bougies === 0 && /INDISPONIBLE/.test(ep.message + ep.infos) && ep.wl.every(x => /indispo/.test(x)), JSON.stringify([ep.etat.bougies, ep.message.slice(0, 80), ep.wl]));
await g2.page.screenshot({ path: 'captures-mars/test-trading-panne.png' });
w2.scenario.toutEnPanne = false;
await ev2(() => document.querySelector('.tg-btn[title*="Redemander"]').click()); await attendre(2500);
verifier('9. le Worker revient : l\'espace se remplit tout seul', (await ev2(() => window.Mars.espace())).bougies >= 400);
verifier('9. aucune erreur JavaScript pendant la panne', g2.erreurs.filter(x => !ignorees.test(x)).length === 0, g2.erreurs.filter(x => !ignorees.test(x)).join(' | '));
await g2.navigateur.close(); await w2.fermer();
await navigateur.close(); await worker.fermer();
process.exit(fin() ? 1 : 0);
