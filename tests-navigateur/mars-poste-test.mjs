import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { marcheM5, DERIVE_PLANTEE } from '../planetes/mars/tests/synth-m5.mjs';

/* Poste de pilotage « Agent BTC » (M5) de bout en bout dans Chrome : faux échange Binance (marché synthétique AVEC un avantage planté, port 8799), vrai Worker de navigateur pour la recherche,
   vrai IndexedDB. Vérifie chaque onglet, le mode simple / expert, les boutons, le graphique (positions à prendre, flèches des trades, données activables, clic sur un trade, rejeu),
   le laboratoire (constructeur, idée libre avec faux traducteur), les réglages et l'absence d'erreur JavaScript. Captures : captures-mars/m5-*.png. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1700, H = Number(process.env.H) || 950, PAS = 900e3;
const derive = DERIVE_PLANTEE;
const now0 = Math.floor(Date.now() / PAS) * PAS - 3 * 86400e3, N = 111000, SERIE = marcheM5({ n: N, graine: 9, derive, t0: now0 - 110000 * PAS });
const echange = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, u = new URL(req.url, 'http://x'), t0 = +u.searchParams.get('t0'), lim = +u.searchParams.get('limit') || 1000, out = [];
  let i = 0; while (i < SERIE.n && SERIE.t[i] < t0) i++;
  for (; i < SERIE.n && out.length < lim; i++) { if (SERIE.t[i] + PAS > Date.now()) break; out.push([SERIE.t[i], SERIE.o[i], SERIE.h[i], SERIE.l[i], SERIE.c[i], SERIE.v[i], 0, 0, 1, SERIE.vb[i], 0, 0]); }
  res.writeHead(200, cors); res.end(JSON.stringify(out));
});
await new Promise(r => echange.listen(8799, '127.0.0.1', r));
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await navigateur.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('console', m => { if (['error'].includes(m.type())) erreurs.push(m.text().slice(0, 240)); }); page.on('pageerror', e => erreurs.push('pageerror: ' + (e.stack || e.message).slice(0, 700)));
page.on('dialog', d => d.accept());
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0');
  window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, periodeMs: 3600e3, lire: async url => { const q = new URL(url); const r = await fetch('http://127.0.0.1:8799/?t0=' + (q.searchParams.get('startTime') || 0) + '&limit=' + (q.searchParams.get('limit') || 1000)); return r.json(); },
    traduireIdee: async texte => ({ regle: { nom: 'Idée traduite', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }, explication: 'Traduction de test pour : ' + texte }),
    envoyerTelegram: async (texte, type) => { (window.__telegram = window.__telegram || []).push({ texte, type }); } };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
const ev = (f, ...a) => page.evaluate(f, ...a);
const texte = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);
const cliquer = async sel => { await page.waitForSelector(sel, { timeout: 8000 }); await page.evaluate(s => document.querySelector(s).click(), sel); await attendre(350); };   // V3 : clic par le DOM (une autre fenêtre de la page peut recouvrir le bouton, sans rapport avec le test)
const onglet = async nom => { await page.evaluate(n => document.querySelector('.pa-onglets [data-onglet="' + n + '"]').click(), nom); await attendre(500); };

// ── ouverture : historique absent → on le dit, bouton d'activation ──
await ev(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1500);
verifier('fenêtre ouverte en grand (16 sous-onglets), mode SIMPLE par défaut', await ev(() => !!document.querySelector('.pa-poste') && document.querySelectorAll('.pa-onglets [data-onglet]').length === 16 && document.querySelectorAll('.pa-onglets [data-groupe]').length === 6 && document.querySelector('.pa-poste').dataset.mode === 'simple' && document.body.classList.contains('mars-poste-ouvert')));
verifier('sans historique : phrase claire + bouton d’activation, aucun chiffre inventé', /n’a pas encore d’historique/.test(await texte('.pa-situation')) && !!(await page.$('[data-a="activer-donnees"]')));
verifier('mode simple : les éléments « expert » sont cachés', await ev(() => { const x = document.querySelector('.pa-x'); return !x || getComputedStyle(x).display === 'none'; }));
await page.screenshot({ path: 'captures-mars/m5-0-vide.png' });

// ── activation : téléchargement de 9 ans (faux échange) ──
await cliquer('[data-a="activer-donnees"]');
await page.waitForFunction(() => window.__hoteBtc && window.__hoteBtc.vue().donnees.n > 100000, { timeout: 240000 });
await attendre(1500);
verifier('données : plus de 100 000 bougies, source Binance, delta réel, années affichées', await ev(() => { const d = window.__hoteBtc.vue().donnees; return d.n > 100000 && d.source === 'binance' && d.deltaReelPct > 0.99 && d.annees > 3; }));
await onglet('ensemble'); await attendre(800);
verifier('vue d’ensemble : situation, marché, stratégies actives, prochaine alerte, recherche, alertes, santé', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return ['Aucune stratégie n’est validée', 'Marché maintenant', 'Stratégies actives', 'Prochaine alerte attendue', 'Recherche', 'Dernières alertes', 'Santé de l’agent'].every(x => t.includes(x)); }));
await page.screenshot({ path: 'captures-mars/m5-1-ensemble-sans-strategie.png' });
await ev(() => window.__hoteBtc.commande({ type: 'profil', patch: { budget: { charge: 'douce', chantiersParTranche: 1, tempsMsParTranche: 30000 } } }));          // une seule idée par tranche : la recherche ne peut pas valider autre chose avant l'idée plantée
await cliquer('[data-a="recherche-reprise"]');
await page.waitForFunction(() => window.__hoteBtc.vue().recherche.N > 0, { timeout: 120000 });
verifier('la recherche sans fin démarre au clic : variantes comptées, niveau affiché, état « en cours »', await ev(() => { const v = window.__hoteBtc.vue(); return v.recherche.N > 0 && /variantes testées/.test(document.querySelector('.pa-corps').textContent) || v.rechercheEnCours; }));
await attendre(1500); await page.screenshot({ path: 'captures-mars/m5-1-ensemble-recherche.png' });
await cliquer('[data-a="recherche-pause"]'); await attendre(1500);
verifier('la recherche se met en pause au clic', await ev(() => window.__hoteBtc.vue().recherche.pause === true));
verifier('la recherche affiche le nombre de variantes et l’avertissement des comparaisons multiples', /variantes testées/.test(await texte('.pa-corps')) && /durcit le seuil/.test(await texte('.pa-corps')));
await ev(() => { window.__hoteBtc.vue(); }); await page.waitForFunction(() => !window.__hoteBtc._boucle(), { timeout: 60000 });
await ev(() => window.__hoteBtc.commande({ type: 'profil', patch: { budget: { charge: 'douce', chantiersParTranche: 60, tempsMsParTranche: 60000 } } }));

// ── on injecte l'idée plantée : testée par le VRAI protocole dans le vrai Worker ──
await ev(async () => { const h = window.__hoteBtc; await h.commande({ type: 'profil', patch: { cible: 1 } }); const r = await h.commande({ type: 'idee_proposer', regle: { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 }, origine: 'constructeur' }); await h.commande({ type: 'idee_valider', id: r.id }); });
await page.waitForFunction(() => window.__hoteBtc.vue().strategies.some(s => s.statut === 'validee'), { timeout: 240000 });
await attendre(1500);
verifier('une stratégie est VALIDÉE (backtest) par le vrai protocole', await ev(() => window.__hoteBtc.vue().strategies[0].statutLibelle === 'VALIDÉE (backtest)'));
verifier('notification de validation envoyée sur Telegram (faux) et visible', await ev(() => (window.__telegram || []).some(t => t.type === 'validation')));

// ── stratégies ──
await onglet('strategies'); await attendre(600);
verifier('carte de stratégie : nom, statut VALIDÉE (backtest), idée, avancement vers l’objectif, 3 jeux de résultats séparés', await ev(() => { const c = document.querySelector('.pa-carte'); const t = c.textContent; return c && /VALIDÉE \(backtest\)/.test(t) && /Achat/.test(t) && /objectif \+20 R sur 150 trades/.test(t) && /Hors échantillon/.test(t) && /Compte simulé en direct/.test(t) && /confirmation réelle en cours/.test(t); }));
verifier('la carte montre R moyen avec intervalle de confiance, facteur de profit, creux, taux de réussite, courbe', await ev(() => { const t = document.querySelector('.pa-carte').textContent; return /R moyen/.test(t) && /\[\+/.test(t) && /Facteur de profit/.test(t) && /Creux maximal/.test(t) && /Taux de réussite/.test(t) && !!document.querySelector('.pa-carte svg.pa-courbe polyline'); }));
verifier('boutons : activer/pause, suspendre, dupliquer, supprimer', await ev(() => ['pause', 'suspendre', 'dupliquer', 'supprimer'].every(a => !!document.querySelector('.pa-carte [data-a="' + a + '"]'))));
await page.screenshot({ path: 'captures-mars/m5-2-strategies-simple.png' });
await cliquer('.pa-mode [data-mode="expert"]'); await attendre(600);
verifier('mode EXPERT : détails (jeu final, entraînement, preuves) visibles', await ev(() => { const t = document.querySelector('.pa-carte').textContent; return /Jeu final/.test(t) && /Entraînement/.test(t) && /NE PAS lire comme une performance/.test(t) && document.querySelector('.pa-poste').dataset.mode === 'expert'; }));
await ev(() => { const d = document.querySelector('.pa-carte details'); d.open = true; }); await attendre(300);
verifier('expert : preuves — variantes testées avant, Sharpe déflaté, historique', await ev(() => { const t = document.querySelector('.pa-carte details').textContent; return /variantes avaient été testées/.test(t) && /Probabilité que son avantage soit réel/.test(t) && /Historique/.test(t); }));
await page.screenshot({ path: 'captures-mars/m5-3-strategies-expert.png' });
await cliquer('.pa-carte [data-a="dupliquer"]'); await attendre(800);
verifier('dupliquer : la règle est copiée dans le laboratoire (modifiable), aucune validation héritée, aucune copie en bibliothèque', await ev(() => window.PosteAgent.poste().onglet() === 'labo' && document.querySelectorAll('.pa-cond').length === 3 && /variante/.test(document.querySelector('[data-l="nom"]').value) && window.__hoteBtc.vue().strategies.length === 1));
await onglet('strategies');
await cliquer('.pa-mode [data-mode="simple"]');

// ── portefeuille ──
await onglet('portefeuille');
verifier('portefeuille : courbe de capital combinée, bibliothèque exportable / importable', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return /Courbe de capital combinée/.test(t) && !!document.querySelector('.pa-corps svg.pa-courbe polyline') && !!document.querySelector('[data-a="exporter"]') && !!document.querySelector('input[data-a="importer"]'); }));
await page.screenshot({ path: 'captures-mars/m5-4-portefeuille.png' });

// ── trades ──
await onglet('trades');
verifier('trades : tableau avec R, durée, origine ; filtres stratégie / résultat / phase / session ; export', await ev(() => document.querySelectorAll('.pa-table tbody tr').length > 50 && ['strategie', 'resultat', 'phase', 'session'].every(f => !!document.querySelector('[data-f="' + f + '"]')) && !!document.querySelector('[data-a="exporter-trades"]')));
const nTous = await ev(() => document.querySelectorAll('.pa-table tbody tr').length);
await ev(() => { const s = document.querySelector('[data-f="resultat"]'); s.value = 'gagnant'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(600);
verifier('filtre « gagnants » : seuls les trades gagnants restent', await ev(() => { const l = [...document.querySelectorAll('.pa-table tbody tr')]; return l.length > 0 && l.every(r => r.classList.contains('gagne')); }));
await ev(() => { const s = document.querySelector('[data-f="resultat"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(500);
await ev(() => document.querySelector('.pa-table tbody tr').click()); await attendre(500);
verifier('clic sur un trade : détail — pourquoi pris, pourquoi gagné ou perdu', await ev(() => { const t = (document.querySelector('#pa-trade-detail') || {}).textContent || ''; return /Pris le/.test(t) && /(Gagnant|Perdant)/.test(t) && /Rejouer pas à pas/.test(t); }));
await page.screenshot({ path: 'captures-mars/m5-5-trades.png' });

// ── graphique ──
await cliquer('[data-a="trade-graphique"]'); await attendre(2500);
verifier('graphique : chandeliers chargés autour du trade, flèches des trades', await ev(() => { const e = window.PosteAgent.poste().etat(); return e.onglet === 'graphique' && e.graph && e.graph.nBougies > 50 && e.graph.nMarqueurs > 0; }));
verifier('graphique : un canvas de bibliothèque est présent et non vide', await ev(() => { const c = document.querySelector('.pg-zone canvas'); return !!c && c.width > 200 && c.height > 200; }));
await page.screenshot({ path: 'captures-mars/m5-6-graphique-trade.png' });
await cliquer('[data-a="trade-rejouer"]'); await attendre(2000);
verifier('rejeu pas à pas : contrôles présents, le rejeu avance', await ev(() => !!document.querySelector('[data-a="rejeu-pas"]') && window.PosteAgent.poste().etat().graph.rejeu));
const avant = await texte('[data-g="rejeu"] span'); await cliquer('[data-a="rejeu-pas"][data-d="1"]'); await cliquer('[data-a="rejeu-pas"][data-d="1"]');
verifier('rejeu : la bougie courante change à chaque pas', (await texte('[data-g="rejeu"] span')) !== avant, avant + ' → ' + await texte('[data-g="rejeu"] span'));
await page.screenshot({ path: 'captures-mars/m5-7-rejeu.png' });
await cliquer('[data-a="rejeu-fin"]'); await attendre(1500);
await ev(() => window.PosteAgent.poste().dernierTrade()); await attendre(2500);
verifier('« montre le dernier trade sur le graphique » : le trade est sélectionné', await ev(() => !!document.querySelector('[data-g="cote"] h4') && window.PosteAgent.poste().etat().tradeChoisi));
for (const c of ['zone', 'vwap', 'asie', 'veille', 'liquidite', 'session']) { await ev(c => { const e = document.querySelector('[data-g-couche="' + c + '"]'); if (!e.checked) e.click(); }, c); await attendre(200); }
await ev(() => { window.PosteAgent.poste(); });
await cliquer('[data-g-unite="h1"]'); await attendre(1500);
verifier('données activables une à une (POC, zone de valeur, VWAP, Asie, veille, zones de liquidité, phase, session, MA 200, EMA 50, Bollinger, RSI) et unités M15 / H1 / H4', await ev(() => document.querySelectorAll('[data-g-couche]').length === 12 && document.querySelectorAll('[data-g-unite]').length === 3 && window.PosteAgent.poste().etat().graph.unite === 'h1'));
await cliquer('[data-g-unite="m15"]'); await ev(() => { const s = document.querySelector('[data-g-champ="strategie"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(1500);
await page.screenshot({ path: 'captures-mars/m5-8-graphique-couches.png' });

// ── diagnostic ──
await onglet('diagnostic');
verifier('diagnostic : 8 découpages (phase, régime, session, volatilité, jour, saison, trimestre, année) + phrases + avertissement exploratoire', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return document.querySelectorAll('.pa-corps .pa-grille > .pa-c').length === 8 && /Quand ça marche/.test(t) && /Exploratoire/.test(t) && /session/i.test(t); }));
await page.screenshot({ path: 'captures-mars/m5-9-diagnostic.png' });

// ── laboratoire ──
await onglet('labo');
verifier('laboratoire : constructeur, idée libre, idées, pistes, journal des expériences, compteur de variantes', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return ['Constructeur de règles', 'Idée libre', 'Idées et règles proposées', 'Pistes de l’agent', 'Journal des expériences', 'Variantes testées'].every(x => t.includes(x)); }));
for (let k = 0; k < 6; k++) { if (await page.$('[data-a="cond-retirer"]')) await cliquer('[data-a="cond-retirer"]'); }          // on part d'une règle vide (la copie d'une stratégie avait prérempli le constructeur)
await ev(() => { const s = document.querySelector('[data-l="type-nouveau"]'); s.value = 'rsi'; }); await cliquer('[data-a="cond-ajouter"]');
await ev(() => { const s = document.querySelector('[data-l="type-nouveau"]'); s.value = 'phase'; }); await cliquer('[data-a="cond-ajouter"]');
verifier('constructeur : deux conditions ajoutées avec leurs champs', await ev(() => document.querySelectorAll('.pa-cond').length === 2 && !!document.querySelector('.pa-cond [data-champ="seuil"]')));
await cliquer('[data-a="regle-verifier"]'); await attendre(300);
verifier('règle vérifiée : description en français', await ev(() => /Achat ou vente quand : RSI 5/.test(document.querySelector('[data-r="constructeur"]').textContent) || /valide/i.test(document.querySelector('[data-r="constructeur"]').textContent)), await texte('[data-r="constructeur"]'));
await ev(() => { const e = document.querySelector('.pa-cond [data-champ="seuil"]'); e.value = '999'; }); await cliquer('[data-a="regle-verifier"]');
verifier('règle hors bornes refusée avec la raison', /hors bornes/.test(await texte('[data-r="constructeur"]')), await texte('[data-r="constructeur"]'));
await ev(() => { const e = document.querySelector('.pa-cond [data-champ="seuil"]'); e.value = '25'; });
await ev(() => { const e = document.querySelector('[data-l="idee-libre"]'); e.value = 'acheter quand le RSI en H1 est très bas'; }); await cliquer('[data-a="idee-traduire"]'); await attendre(800);
verifier('idée libre : la règle traduite est MONTRÉE, en attente de validation (rien n’est testé)', await ev(() => { const t = document.querySelector('[data-r="idee"]').textContent; const idees = window.__hoteBtc.vue().recherche.idees; return /RSI 14 H1 < 25/.test(t) && idees.some(i => i.statut === 'a_valider') && !!document.querySelector('[data-a="idee-valider"]'); }));
const nAvant = await ev(() => window.__hoteBtc.vue().recherche.N);
await page.screenshot({ path: 'captures-mars/m5-10-laboratoire.png' });
await cliquer('[data-a="idee-refuser"]'); await attendre(500);
verifier('idée refusée : elle ne sera pas testée', await ev(() => window.__hoteBtc.vue().recherche.idees.some(i => i.statut === 'refusee') && !window.__hoteBtc.vue().recherche.idees.some(i => i.statut === 'a_valider')));

// ── positions à prendre sur le graphique (une alerte d'ENTRÉE est injectée dans l'état : entrée, stop, objectif en lignes ET en zones) ──
await ev(() => { const h = window.__hoteBtc, e = h.pilote().etat(), st = h.vue().strategies[0], d = h.serie(), t = d.t[d.n - 1], px = d.c[d.n - 1]; e.alertes.unshift({ id: 'E:test', type: 'ENTREE', strategie: st.id, nomStrategie: st.nom, sens: 1, entree: px, stop: px * 0.99, cible: px * 1.02, R: 2, t: t + 900e3, tSignal: t, texte: 'test' }); e.derniereBarre = t; });
await onglet('graphique'); await ev(() => { const s = document.querySelector('[data-g-champ="strategie"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await ev(() => window.PosteAgent.poste().rendre(true)); await attendre(1500);
verifier('graphique : la position à prendre est dessinée (entrée, stop, objectif : lignes et zones colorées, R visé)', await ev(() => window.PosteAgent.poste().etat().graph.positions === 1));
await page.screenshot({ path: 'captures-mars/m5-8b-graphique-position.png' });
await ev(() => { const e = window.__hoteBtc.pilote().etat(); e.alertes = e.alertes.filter(a => a.id !== 'E:test'); });

// ── voix : « ouvre l'agent », « montre-moi les stratégies », etc. (même fonction que la voix de Raylé) ──
const dire = p => ev(async p => await window.commandeMars(p), p);
let rep = await dire('ouvre l’agent'); verifier('voix : « ouvre l’agent »', /poste de pilotage/.test(rep || '') && await ev(() => !!document.querySelector('.pa-poste')), rep);
rep = await dire('montre-moi les stratégies'); verifier('voix : « montre-moi les stratégies » (liste lue + onglet Stratégies)', /New York \+ volume \+ delta/.test(rep || '') && await ev(() => window.PosteAgent.poste().onglet() === 'strategies'), rep);
rep = await dire('où en est la recherche ?'); verifier('voix : « où en est la recherche ? »', /variantes testées/.test(rep || '') && /seuil du hasard/.test(rep || ''), rep);
rep = await dire('pourquoi cette stratégie a perdu ?'); verifier('voix : « pourquoi cette stratégie a perdu ? » (explication du trade perdant, graphique ouvert)', /Perdant/.test(rep || '') && /Pris le/.test(rep || '') && await ev(() => window.PosteAgent.poste().onglet() === 'graphique'), (rep || '').slice(0, 200));
rep = await dire('quand marche-t-elle ?'); verifier('voix : « quand marche-t-elle ? » (diagnostic, prudence)', /Quand ça marche/.test(rep || '') && /pistes, pas comme des règles/.test(rep || '') && await ev(() => window.PosteAgent.poste().onglet() === 'diagnostic'), (rep || '').slice(0, 200));
rep = await dire('montre le dernier trade sur le graphique'); verifier('voix : « montre le dernier trade sur le graphique »', /dernier trade/.test(rep || '') && await ev(() => window.PosteAgent.poste().onglet() === 'graphique' && window.PosteAgent.poste().etat().tradeChoisi), rep);
rep = await dire('donne une idée à l’agent : acheter quand le RSI en H1 est très bas'); verifier('voix : « donne une idée à l’agent : … » traduit par le Worker (faux), montrée, PAS testée', /Voici ce que j’ai compris/.test(rep || '') && /valide l’idée/.test(rep || '') && await ev(() => window.__hoteBtc.vue().recherche.idees.some(i => i.statut === 'a_valider')), rep);
rep = await dire('refuse l’idée'); verifier('voix : « refuse l’idée »', /refusée/.test(rep || ''), rep);
rep = await dire('suspends la stratégie New York'); verifier('voix : « suspends la stratégie X »', /suspendue/.test(rep || '') && await ev(() => window.__hoteBtc.vue().strategies[0].statut === 'suspendue'), rep);
await ev(() => window.__hoteBtc.commande({ type: 'reactiver', id: window.__hoteBtc.vue().strategies[0].id }));
rep = await dire('quelle est la météo à Paris'); verifier('voix : une phrase sans rapport n’est pas prise par l’agent', !/stratégie|agent/i.test(rep || ''), rep);

// ── réglages ──
await onglet('reglages');
verifier('réglages : profil (style, unités, risque, fréquence, règles interdites, objectif, budget, arrière-plan, notifications), consignes, seuils affichés', await ev(() => { const t = document.querySelector('.pa-corps').textContent; return ['Profil de l’agent', 'Règles interdites', 'Consignes en français', 'Seuils de validation', 'Sharpe déflaté', '+0.25 R', 'jamais assouplie'].every(x => t.includes(x)); }));
await ev(() => { document.querySelector('[data-l="consignes"]').value = 'Pas de trading le week-end. Maximum 2 positions par semaine. Risque 0,5 %. Fais-moi un café.'; }); await cliquer('[data-a="consignes-lire"]');
verifier('consignes en langage clair : interprétation montrée AVANT application, phrase incomprise signalée', await ev(() => { const t = document.querySelector('[data-r="consignes"]').textContent; return /week-end/.test(t) && /2 position/.test(t) && /0,5 %/.test(t) && /Non compris/.test(t) && /café/.test(t) && window.__hoteBtc.vue().profil.maxParSemaine === 3; }));
await cliquer('[data-a="consignes-appliquer"]'); await attendre(500);
verifier('consignes appliquées au profil', await ev(() => { const p = window.__hoteBtc.vue().profil; return p.maxParSemaine === 2 && p.risquePct === 0.5 && p.reglesInterdites.includes('weekend'); }));
await ev(() => { document.querySelector('details.pa-seuils').open = true; }); await attendre(200);
await ev(() => { document.querySelector('[name="rNetMin"]').value = '10'; });
await cliquer('[data-a="seuils-apercu"]'); await attendre(500);
verifier('seuils : l’aperçu avertit que ça ASSOUPLIT et que ça ne vaut que pour les futures recherches', /ASSOUPLISSENT/.test(await texte('[data-r="seuils"]')) && /FUTURES recherches/.test(await texte('[data-r="seuils"]')), await texte('[data-r="seuils"]'));
await cliquer('[data-a="seuils-appliquer"]'); await attendre(500);
verifier('seuils : sans case de confirmation cochée, rien n’est appliqué', /Coche la case/.test(await texte('[data-r="seuils"]')) && await ev(() => window.__hoteBtc.vue().criteres.objectif.rNetMin === 20));
await page.screenshot({ path: 'captures-mars/m5-11-reglages.png' });

const gravesErreurs = erreurs.filter(e => !/ERR_FAILED|Failed to load resource|faireconomy/.test(e));
verifier('aucune erreur JavaScript', gravesErreurs.length === 0, gravesErreurs.slice(0, 4).join(' | '));
await navigateur.close(); echange.close();
process.exit(fin() ? 1 : 0);
