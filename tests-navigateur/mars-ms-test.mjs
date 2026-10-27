import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { marcheM5, DERIVE_PLANTEE } from '../planetes/mars/tests/synth-m5.mjs';
import { defautsTexte } from './texte-visible.mjs';

/* « Teste ma stratégie » (V1) de bout en bout dans Chrome : faux échange Binance (marché synthétique AVEC un avantage planté), vrai Worker de navigateur, vrai IndexedDB.
   Texte libre lu localement → blocs → relecture → validation → test (verdict, chiffres, par paire, par année, hasard, achat-conservation, variantes, capital, simulation prop) → repères sur le graphique
   → mode alertes (compte simulé, étiquettes, Telegram faux, gardien) → éditeur, duplication, compteur de variantes. Captures : captures-v1/ms-*.png. */
fs.mkdirSync('captures-v1', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1700, H = Number(process.env.H) || 950, PAS = 900e3;
const now0 = Math.floor(Date.now() / PAS) * PAS - 3 * 86400e3, N = 111000, SERIE = marcheM5({ n: N, graine: 9, derive: DERIVE_PLANTEE, t0: now0 - 110000 * PAS });
const echange = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, u = new URL(req.url, 'http://x'), t0 = +u.searchParams.get('t0'), lim = +u.searchParams.get('limit') || 1000, out = [];
  let i = 0; while (i < SERIE.n && SERIE.t[i] < t0) i++;
  for (; i < SERIE.n && out.length < lim; i++) { if (SERIE.t[i] + PAS > Date.now()) break; out.push([SERIE.t[i], SERIE.o[i], SERIE.h[i], SERIE.l[i], SERIE.c[i], SERIE.v[i], 0, 0, 1, SERIE.vb[i], 0, 0]); }
  res.writeHead(200, cors); res.end(JSON.stringify(out));
});
await new Promise(r => echange.listen(8799, '127.0.0.1', r));
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await navigateur.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('console', m => { if (m.type() === 'error' && !/Failed to load|CORS|faireconomy|ERR_FAILED/.test(m.text())) erreurs.push(m.text().slice(0, 240)); }); page.on('pageerror', e => erreurs.push('pageerror: ' + (e.stack || e.message).slice(0, 700)));
page.on('dialog', d => d.accept());
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0');
  localStorage.removeItem('rayle_ms_registre'); localStorage.removeItem('rayle_ms_etat'); localStorage.removeItem('rayle_ms_rapports');
  window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, sansAlertesMS: true, sansVeilleurMS: true, lireVeilleur: async () => false, periodeMs: 3600e3, lire: async url => { const q = new URL(url); const r = await fetch('http://127.0.0.1:8799/?t0=' + (q.searchParams.get('startTime') || 0) + '&limit=' + (q.searchParams.get('limit') || 1000)); return r.json(); },
    traduireIdee: async texte => ({ regle: { nom: 'Idée traduite', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }, explication: 'Traduction de test pour : ' + texte }),
    envoyerTelegram: async (texte, type) => { (window.__telegram = window.__telegram || []).push({ texte, type }); } };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
const ev = (f, ...a) => page.evaluate(f, ...a);
const texte = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);
const cliquer = async sel => { await page.waitForSelector(sel, { timeout: 8000 }); await page.click(sel); await attendre(400); };
const cliquerJS = async sel => { await ev(s => document.querySelector(s).click(), sel); await attendre(500); };
const onglet = async nom => { await ev(n => document.querySelector('.pa-onglets [data-onglet="' + n + '"]').click(), nom); await attendre(700); };
const remplir = async (sel, valeur) => { await ev((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, valeur); };

await ev(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1500);
await cliquer('[data-a="activer-donnees"]');
await page.waitForFunction(() => window.__hoteBtc && window.__hoteBtc.vue().donnees.n > 100000, { timeout: 240000 });
await attendre(1500);

// ── onglet et navigation ──
await onglet('teste');
verifier('onglet « Teste ma stratégie » dans le groupe « Stratégies et tests », visible en mode Simple', await ev(() => { const b = document.querySelector('.pa-onglets [data-onglet="teste"]'); return !!b && b.dataset.g === 'strategies' && !b.classList.contains('pa-x') && document.querySelector('.pa-corps').dataset.onglet === 'teste'; }));
verifier('liste vide : invitation claire et bouton « Nouvelle stratégie »', /Aucune stratégie/.test(await texte('.pa-corps')) && !!(await page.$('[data-a="ms-nouvelle"]')));

// ── texte libre lu localement ──
await cliquer('[data-a="ms-nouvelle"]');
verifier('éditeur ouvert : nom, côté, conditions, filtres, stop, sortie, description', await ev(() => ['nom', 'cote', 'stop-type', 'sortie-type'].every(n => !!document.querySelector('[data-ms="' + n + '"]')) && /Relis ce que ta stratégie fait/.test(document.querySelector('.pa-corps').textContent)));
verifier('éditeur vide : la description dit ce qui manque (aucune condition)', /au moins une condition/.test(await texte('.pa-corps')));
await ev(() => { document.querySelector('details').open = true; });
await remplir('[data-ms="texte"]', 'Achète entre 13h et 14h, stop 2 ATR, objectif 2 R');
await cliquer('[data-a="ms-texte-lire"]');
verifier('lecture locale : ce qui est compris est listé, rien n’est appliqué', await ev(() => { const t = document.querySelector('[data-r="ms-lecture"]').textContent; return /Ce que j’ai compris/.test(t) && /Stop : 2 ATR/.test(t) && /Objectif : 2 R/.test(t) && /Rien n’est appliqué/.test(t); }));
verifier('les blocs sont remplis (heures 13 → 14, stop ATR 2, objectif 2 R) et la description est relisible', await ev(() => document.querySelector('[data-ms="heures-on"]').checked && document.querySelector('[data-ms="heures-de"]').value === '13' && document.querySelector('[data-ms="stop-k"]').value === '2' && document.querySelector('[data-ms="sortie-R"]').value === '2' && /Filtre : seulement entre 13 h et 14 h/.test(document.querySelector('.pa-desc').textContent)));
await remplir('[data-ms="nom"]', 'Envolée de 14 h');
await page.screenshot({ path: 'captures-v1/ms-1-editeur.png' });
await cliquer('[data-a="ms-enregistrer"]');
verifier('brouillon enregistré : « À VALIDER », non testée, aucune alerte', await ev(() => { const c = document.querySelector('.pa-carte'); return !!c && /À VALIDER/.test(c.textContent) && /NON TESTÉE/.test(c.textContent) && !/ALERTES/.test(c.textContent); }));
await cliquer('[data-a="ms-valider"]');
verifier('validation refusée tant que « j’ai relu » n’est pas coché', /Coche « J’ai relu/.test(await texte('[data-r="ms-retour"]')));
await cliquerJS('[data-ms="relu"]'); await cliquer('[data-a="ms-valider"]');
verifier('validation par l’utilisatrice : « VALIDÉE PAR TOI »', await ev(() => /VALIDÉE PAR TOI/.test(document.querySelector('.pa-carte').textContent)));
const idPremiere = await ev(() => JSON.parse(localStorage.getItem('rayle_ms_registre')).strategies[0].id);

// ── alertes refusées avant test ──
await cliquerJS('[data-a="ms-annuler"]');
await cliquerJS('.pa-carte [data-a="ms-alertes"]');
verifier('alertes refusées : la stratégie n’a pas encore été testée', /teste d’abord|Teste d’abord/.test(await texte('.pa-message')), await texte('.pa-message'));

// ── test ──
await cliquerJS('.pa-carte [data-a="ms-choisir"]');
verifier('préparation du test : paires, frais Kraken, compteur de variantes annoncé', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return /Tester « Envolée de 14 h »/.test(t) && /Frais utilisés/.test(t) && /NOUVELLE variante \(1 au total/.test(t) && !!document.querySelector('[data-ms-paire="BTC"]:not([disabled])'); }));
verifier('paires sans historique désactivées avec la raison (SOL, DOGE)', await ev(() => document.querySelector('[data-ms-paire="SOL"]').disabled && /historique absent/.test(document.querySelector('.pa-corps').textContent)));
await ev(() => { for (const e of document.querySelectorAll('[data-ms-paire]')) e.checked = e.dataset.msPaire === 'BTC'; });
const t0 = Date.now(); await cliquerJS('[data-a="ms-tester"]');
await page.waitForFunction(() => /Résultat du test · Envolée/.test(document.querySelector('.pa-corps').textContent) || /pa-alerte/.test(document.querySelector('.pa-corps').innerHTML), { timeout: 240000 });
await attendre(800);
const dureeTest = Date.now() - t0;
verifier('le test répond en un temps raisonnable (Worker de navigateur) : ' + Math.round(dureeTest / 1000) + ' s', dureeTest < 120000);
verifier('verdict simple « BAT LE HASARD » sur l’avantage planté, avec ses raisons', await ev(() => { const s = document.querySelector('.pa-situation'); return !!s && /BAT LE HASARD/.test(s.textContent) && /Espérance positive/.test(s.textContent) && /entrées aléatoires/.test(s.textContent); }));
verifier('le verdict rappelle que ce n’est pas une validation (jeu final non touché)', await ev(() => /Même « bat le hasard » ne vaut pas « VALIDÉE »/.test(document.querySelector('.pa-corps').textContent) && /n’a PAS été touché/.test(document.querySelector('.pa-corps').textContent)));
verifier('chiffres : espérance, trades, taux de réussite, creux, série de pertes, intervalle à 95 %', await ev(() => { const t = document.querySelector('.pa-jeux').textContent; return /Espérance par trade/.test(t) && /Trades/.test(t) && /Taux de réussite/.test(t) && /Creux maximal/.test(t) && /Plus longue série de pertes/.test(t) && /Intervalle à 95 %/.test(t); }));
verifier('tableau par paire (BTC), long / court, par année, par régime, blocs successifs', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return /BTC/.test(t) && /Long \/ court/.test(t) && /Par année/.test(t) && /Par régime/.test(t) && /blocs de test successifs/.test(t); }));
verifier('comparaisons : entrées aléatoires, achat-conservation, Monte Carlo ; compteur de variantes expliqué', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return /Entrées aléatoires/.test(t) && /Achat-conservation/.test(t) && /Monte Carlo/.test(t) && /Variantes comptées/.test(t) && /n’est pas une note de qualité/.test(t); }));
verifier('capital à 0,25 / 0,5 / 1 % de risque et simulation prop (−3 % jour, −6 % creux, +10 %)', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return /0,25 % de risque/.test(t) && /0,5 % de risque/.test(t) && /1 % de risque/.test(t) && /Évaluation prop/.test(t) && document.querySelectorAll('.pa-courbe').length >= 3; }));
const sale = await defautsTexte(page, '.pa-corps'); verifier('texte visible : jamais « undefined », « NaN », « [object Object] »', sale && sale.length === 0, sale ? sale.join(' | ') : '');
await page.screenshot({ path: 'captures-v1/ms-2-resultat.png' });
verifier('la stratégie compte 1 variante dans le registre', await ev(id => JSON.parse(localStorage.getItem('rayle_ms_registre')).strategies.find(s => s.id === id).variantes.length === 1, idPremiere));
verifier('le jeu final n’est pas touché : tous les trades du rapport sont dans la zone de recherche (75 %)', await ev(async () => { const MS = await import('/planetes/mars/pc/trading/ms-page.js'); const r = MS._test.rapports()[(JSON.parse(localStorage.getItem('rayle_ms_registre')).strategies[0].id) + ':BTC']; const h = await import('/planetes/mars/pc/trading/pilotes-paires.js'); const s = (await h.obtenirHotePaire('BTC', { demarrer: false })).serie(); return !!r && r.trades.length > 10 && r.jeuFinalTouche === false && r.trades.every(x => x.t < s.t[Math.floor(s.n * 0.75)]); }));

// ── repères sur le graphique ──
await cliquerJS('[data-a="ms-graphique"][data-paire="BTC"]');
verifier('repères du test tracés sur le graphique (groupe « Mes stratégies · … »)', await ev(async () => { const { GraphiqueAgent } = await import('/planetes/mars/pc/trading/chart-api.js'); const l = GraphiqueAgent.lire ? GraphiqueAgent.lire('BTC') : null; return /signaux tracés/.test(document.querySelector('.pa-message').textContent) || (l && JSON.stringify(l).includes('Mes stratégies')); }), await texte('.pa-message'));

// ── mode alertes : stratégie fréquente pour avoir des signaux sur les dernières bougies ──
await cliquerJS('[data-a="ms-nouvelle"]');
await ev(() => { document.querySelector('[data-ms-nouveau="entree"]').value = 'rsi'; }); await cliquerJS('[data-a="ms-cond-ajouter"][data-ctx="entree"]');
await ev(() => { const c = [...document.querySelectorAll('[data-ms-cond^="entree:0:"]')]; for (const e of c) { const k = e.dataset.msCond.split(':')[2]; if (k === 'tf') e.value = 'm15'; if (k === 'op') e.value = '<'; if (k === 'seuil') e.value = '70'; } });
await remplir('[data-ms="nom"]', 'RSI fréquent'); await ev(() => { const s = document.querySelector('[data-ms="stop-k"]'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); const r = document.querySelector('[data-ms="sortie-R"]'); r.value = '1'; r.dispatchEvent(new Event('change', { bubbles: true })); });
await cliquer('[data-a="ms-enregistrer"]'); await cliquerJS('[data-ms="relu"]'); await cliquer('[data-a="ms-valider"]');
await cliquerJS('[data-a="ms-annuler"]');
const id2 = await ev(() => JSON.parse(localStorage.getItem('rayle_ms_registre')).strategies[1].id);
await ev(id => document.querySelector('.pa-carte[data-ms-id="' + id + '"] [data-a="ms-choisir"]').click(), id2); await attendre(600);
await cliquerJS('[data-a="ms-tester"]');
await page.waitForFunction(() => /Résultat du test · RSI fréquent/.test(document.querySelector('.pa-corps').textContent) || document.querySelector('.pa-corps .pa-alerte'), { timeout: 240000 });
await attendre(600);
const v2 = await texte('.pa-situation');
verifier('stratégie sans avantage : verdict « NE BAT PAS LE HASARD » (ou pas assez de trades), jamais un faux « bat le hasard »', /NE BAT PAS|PAS ASSEZ/.test(v2) && !/BAT LE HASARD/.test(v2.replace(/NE BAT PAS LE HASARD/, '')), v2.slice(0, 120));
await page.screenshot({ path: 'captures-v1/ms-3-ne-bat-pas.png' });
await cliquerJS('.pa-carte[data-ms-id="' + id2 + '"] [data-a="ms-alertes"]');
verifier('NON VALIDÉE : les alertes exigent une confirmation explicite (acceptée ici par la boîte de dialogue)', await ev(id => { const r = JSON.parse(localStorage.getItem('rayle_ms_registre')).strategies.find(s => s.id === id); return r.alertes.actif === true && r.alertes.confirmeLe > 0; }, id2));
verifier('la carte affiche ALERTES et l’étiquette NON VALIDÉE', await ev(id => { const t = document.querySelector('.pa-carte[data-ms-id="' + id + '"]').textContent; return /ALERTES/.test(t) && /NON VALIDÉE/.test(t); }, id2));
// rejeu des 6 dernières bougies : le suivi produit des alertes d'entrée / sortie, étiquetées
const alertes = await ev(async () => {
  const MS = await import('/planetes/mars/pc/trading/ms-page.js'), h = await (await import('/planetes/mars/pc/trading/pilotes-paires.js')).obtenirHotePaire('BTC', { demarrer: false }), s = h.serie();
  MS._test.definirDerniereBarre('BTC', s.t[s.n - 7]); const sortie = await MS.tickAlertesMS(); return sortie.map(a => ({ type: a.type, etiquette: a.etiquette, texte: a.texte, id: a.id, aide: !!a.aide }));
});
verifier('suivi des alertes : des alertes sont produites sur les dernières bougies', alertes.length >= 1, JSON.stringify(alertes).slice(0, 200));
verifier('chaque alerte porte « NON VALIDÉE » et « Aucun ordre n’est passé »', alertes.every(a => a.etiquette === 'NON VALIDÉE' && /NON VALIDÉE/.test(a.texte) && /Aucun ordre/.test(a.texte)));
verifier('les alertes d’entrée donnent la raison, le régime et l’aide à la décision', alertes.filter(a => a.type === 'ENTREE').every(a => /raison :/.test(a.texte) && /régime/.test(a.texte) && a.aide));
const tg = await ev(() => window.__telegram || []);
verifier('Telegram (faux) reçoit les alertes avec l’étiquette, une fois chacune', tg.length === alertes.length && tg.every(t => /NON VALIDÉE/.test(t.texte)), tg.length + '/' + alertes.length);
verifier('Rayle journalise les alertes (journal technique)', await ev(() => /NON VALIDÉE/.test(document.getElementById('log').textContent)));
const rejeu = await ev(async () => { const MS = await import('/planetes/mars/pc/trading/ms-page.js'); return (await MS.tickAlertesMS()).length; });
verifier('un second passage sur les mêmes bougies ne répète aucune alerte', rejeu === 0, String(rejeu));
await attendre(500); await ev(id => document.querySelector('.pa-carte[data-ms-id="' + id + '"] [data-a="ms-choisir"]').click(), id2); await attendre(800);
verifier('tableau de performance des positions proposées, stratégie par stratégie', await ev(() => { const t = [...document.querySelectorAll('.pa-corps .pa-c')].find(x => /performance des positions proposées/.test(x.textContent)); return !!t && /RSI fréquent/.test(t.textContent) && /Clôturées/.test(t.textContent); }));
await page.screenshot({ path: 'captures-v1/ms-4-alertes.png' });

// ── modification : validation retirée, alertes coupées ; duplication : compteur conservé ──
await cliquerJS('.pa-carte[data-ms-id="' + id2 + '"] [data-a="ms-modifier"]');
await remplir('[data-ms="stop-k"]', '1.5'); await cliquer('[data-a="ms-enregistrer"]');
verifier('modifier la règle : la validation et les alertes sont retirées, relis puis valide de nouveau', await ev(id => { const r = JSON.parse(localStorage.getItem('rayle_ms_registre')).strategies.find(s => s.id === id); return !r.valideeLe && !r.alertes.actif && r.nModifs === 1; }, id2));
await cliquerJS('[data-a="ms-annuler"]');
await cliquerJS('.pa-carte[data-ms-id="' + id2 + '"] [data-a="ms-dupliquer"]');
verifier('dupliquer : même lignée, le compteur de variantes continue', await ev(id => { const reg = JSON.parse(localStorage.getItem('rayle_ms_registre')); const c = reg.strategies.find(s => s.nom === 'RSI fréquent (copie)'); const o = reg.strategies.find(s => s.id === id); return !!c && c.lignee === o.lignee && !c.valideeLe; }, id2));
await cliquerJS('.pa-carte[data-ms-id="' + id2 + '"] [data-a="ms-choisir"]');
verifier('après modification non testée : le prochain test sera une nouvelle variante (2) avec l’avertissement', /NOUVELLE variante \(2 au total/.test(await texte('.pa-corps')), (await texte('.pa-corps')).slice(0, 300));

// ── traduction IA à la demande ──
await cliquerJS('[data-a="ms-nouvelle"]'); await ev(() => { document.querySelector('details').open = true; });
await remplir('[data-ms="texte"]', 'Achète quand le RSI est très bas en H1'); await cliquer('[data-a="ms-texte-ia"]'); await attendre(800);
verifier('traduction par l’IA (fausse) : règle proposée à relire, rien d’appliqué', await ev(() => /Traduction de test/.test(document.querySelector('[data-r="ms-lecture"]').textContent) && /Rien n’est appliqué|Relis/.test(document.querySelector('.pa-corps').textContent)));
const sale2 = await defautsTexte(page, '.pa-corps'); verifier('texte visible de l’éditeur propre', sale2 && sale2.length === 0, sale2 ? sale2.join(' | ') : '');
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await navigateur.close(); echange.close(); fin();
