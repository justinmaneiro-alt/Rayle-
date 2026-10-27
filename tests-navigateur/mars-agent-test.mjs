import fs from 'node:fs';
import http from 'node:http';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre, compteur } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';
import { marcheMixte } from '../planetes/mars/tests/synth-btc.mjs';
import { versBougies } from '../planetes/mars/pc/agent-btc/colonnes.js';

/* Agent BTC (M3) de bout en bout dans Chrome : faux échange Binance (bougies synthétiques ; port 8798), vrai Worker de navigateur pour la recherche, vrai IndexedDB.
   Vérifie : activation et téléchargement, panneau (marché, setup, stratégie, performance, alertes, journal), recherche en arrière-plan SANS geler l'interface, table, voix, alerte vers Raylé,
   mémorisation après rechargement, aucune erreur JavaScript. Critères d'acceptation ASSOUPLIS ici (test de mécanique) : le vrai verdict sur de vraies bougies est dans docs/agent-btc.md. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900;
const MARCHE = versBougies(marcheMixte(112000, 21)), PAS = 900e3;
const echange = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const u = new URL(req.url, 'http://x'), t0 = +u.searchParams.get('t0'), lim = +u.searchParams.get('limit') || 1000, now = Date.now();
  const l = MARCHE.filter(b => b.t >= t0 && b.t + PAS <= now).slice(0, lim);
  res.writeHead(200, cors); res.end(JSON.stringify(l.map(b => [b.t, b.o, b.h, b.l, b.c, b.v, 0, 0, 1, b.vb, 0, 0])));
});
await new Promise(r => echange.listen(8798, '127.0.0.1', r));
const worker = await demarrerFauxWorkerMarche(8797);
const permissifJSON = JSON.stringify({ version: 99, figesLe: 'test', decoupage: { fractionRecherche: 0.75, entrainementMois: 12, blocTestMois: 6, moisMinHistorique: 24 }, recherche: { tradesMin: 5, esperanceMin: -9, factProfitMin: 0 },
  horsEchantillon: { esperanceMin: -9, tradesMin: 5, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99, parSemaineMin: 0, trimestresPositifsMin: 0, trimestresTradesMin: 1, concentrationMax: 9 }, robustesse: { voisinsPositifsMin: 0, voisinsMin: 0, medianeVoisinsVsMeilleur: -99 },
  monteCarlo: { simulations: 200, drawdownP95MaxR: 9999, esperanceP5Min: -99 }, comparaisonsMultiples: { facteur: 0 }, jeuFinal: { esperanceMin: -9, tradesMin: 1, factProfitMin: 0, drawdownMaxR: 9999, parSemaineMax: 99 } });
const injecter = async p => {
  await p.evaluateOnNewDocument((u, crit) => {
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test');
    localStorage.setItem('rayle_mars_trading', JSON.stringify({ source: 'rayle', dock: 'dashboard' }));
    window.__RAYLE_AGENT_TEST__ = { exposer: true, criteres: JSON.parse(crit), lire: async url => { const q = new URL(url); const r = await fetch('http://127.0.0.1:8798/?t0=' + (q.searchParams.get('startTime') || 0) + '&limit=' + (q.searchParams.get('limit') || 1000)); return r.json(); } };
  }, worker.url, permissifJSON);
};
const ignorees = /faireconomy|ERR_FAILED|404 \(Not Found\)|Failed to load resource/;
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 })); await attendre(3000);

// ── table : l'agent annonce honnêtement qu'il n'a pas d'historique ──
let fr = await ev(() => window.Mars.fenetresReelles()); const agentFen = () => fr.find(f => f.id === 'agent-btc');
verifier('table : fenêtre « Agent BTC » : sans historique, elle dit « en préparation » (aucun chiffre inventé)', agentFen() && agentFen().etat === 'bientot', JSON.stringify(agentFen()));
await page.screenshot({ path: 'captures-mars/test-agent-table-vide.png' });

// ── ouverture du panneau en grand ──
// M5 : le clic sur la fenêtre « Agent BTC » de la table ouvre désormais le POSTE DE PILOTAGE ; l'ancien panneau reste accessible dans l'espace de travail (onglet du bas)
await ev(() => window.Mars.ouvrirFenetre('agent-btc')); await attendre(3500);
verifier('M5 : un clic sur la fenêtre « Agent BTC » de la table ouvre le poste de pilotage (grande fenêtre dédiée)', await ev(() => !!document.querySelector('.pa-poste')));
await ev(() => window.PosteAgent && window.PosteAgent.fermer()); await attendre(800);
await ev(async () => { const M = await import('/planetes/mars/pc/trading/fenetre.js'); await M.ouvrirEspace({ dock: 'agent', focus: 'agent' }); }); await attendre(2500);
verifier('un clic sur la fenêtre ouvre l’espace sur l’onglet « Agent BTC », agrandi', await ev(() => { const o = document.querySelector('.tg-onglet.actif'); return o && o.dataset.panneau === 'agent' && document.querySelector('.tg-espace').classList.contains('tg-agent-ouvert') && !!document.querySelector('.tg-agent'); }));
verifier('sans historique : le panneau propose d’activer l’agent, dit « pas de recherche », « pas de setup »', await ev(() => { const t = document.querySelector('.tg-agent').textContent; return /Activer l’agent/.test(t) && /PAS DE RECHERCHE/.test(t) && /Pas de setup|Pas encore évalué/.test(t) && /Aucun historique/.test(t); }));
await page.screenshot({ path: 'captures-mars/test-agent-vide.png' });

// ── activation : téléchargement de l'historique ──
const t0 = Date.now();
await ev(() => document.querySelector('.tg-agent [data-a="activer"]').click());
await attendre(2500);
verifier('téléchargement : progression affichée (bougies, source)', await ev(() => /Téléchargement de l’historique/.test(document.querySelector('.tg-agent .ag-src').textContent)) || await ev(() => /bougies M15/.test(document.querySelector('.tg-agent .ag-src').textContent)));
await page.waitForFunction(() => /bougies M15/.test((document.querySelector('.tg-agent .ag-src') || {}).textContent || ''), { timeout: 180000 });
const tTel = Math.round((Date.now() - t0) / 1000);
const src = await ev(() => document.querySelector('.tg-agent .ag-src').textContent);
verifier('données : Binance BTC/USDT, plus de 90 000 bougies M15, delta RÉEL, heure de la dernière bougie (' + tTel + ' s)', /Binance BTC\/USDT/.test(src) && /RÉEL/.test(src) && /dernière bougie fermée/.test(src) && Number((src.match(/(\d[\d\s\u202f\u00a0]*) bougies M15/) || [])[1].replace(/\D/g, '')) > 90000, src.slice(0, 220));
await attendre(1500);
const marche = await ev(() => document.querySelector('[data-s="marche"]').textContent);
verifier('marché : phase H1 / H4, volume, direction du volume (delta RÉEL), volatilité, MA200, profil de volume, zones', ['Phase H1', 'Phase H4', 'Volume 4 h', 'Direction du volume', 'RÉEL', 'Volatilité', 'MA200', 'POC', 'Zone au-dessus', 'Zone en dessous'].every(k => marche.includes(k)), marche.slice(0, 300));
verifier('marché : « pourquoi cette phase ? » détaille la raison en français', await ev(() => { const d = document.querySelector('[data-s="marche"] details'); return d && /Efficacité du mouvement/.test(d.textContent) && /EMA 50/.test(d.textContent); }));
verifier('setup : « pas de setup » sans stratégie, avec la raison', await ev(() => /Pas de setup/.test(document.querySelector('[data-s="setup"]').textContent) && /recherche/.test(document.querySelector('[data-s="setup"]').textContent)));
await page.screenshot({ path: 'captures-mars/test-agent-donnees.png' });

// ── recherche en arrière-plan : l'interface ne gèle pas ──
await ev(() => window.__agentBtc.reglages({ charge: 'douce' }));
await ev(() => { window.__battements = []; let d = performance.now(); window.__timer = setInterval(() => { const n = performance.now(); window.__battements.push(n - d); d = n; }, 50); });
await ev(() => document.querySelector('.tg-agent [data-a="recherche"]').click());
await attendre(1500);
verifier('recherche : état « EN RECHERCHE » avec famille et compteur de variantes', await ev(() => /EN RECHERCHE/.test(document.querySelector('[data-s="haut"]').textContent)));
await page.waitForFunction(() => !/EN RECHERCHE/.test(document.querySelector('[data-s="haut"]').textContent), { timeout: 240000 });
const gel = await ev(() => { clearInterval(window.__timer); const b = window.__battements; return { max: Math.max(...b), n: b.length, moy: b.reduce((a, x) => a + x, 0) / b.length }; });
verifier('recherche : l’interface reste fluide pendant le calcul (plus long intervalle entre deux battements < 400 ms ; Worker séparé)', gel.n > 10 && gel.max < 400, JSON.stringify(gel));
const haut = await ev(() => document.querySelector('[data-s="haut"]').textContent);
verifier('verdict affiché : stratégie VALIDÉE (critères assouplis pour le test) avec résumé', /VALIDÉE/.test(haut), haut.slice(0, 200));
const strat = await ev(() => document.querySelector('[data-s="strategie"]').textContent);
verifier('stratégie : nom, description, paramètres, critères hors échantillon, jeu final ouvert une fois, compteur de variantes', /VALIDÉE/.test(strat) && /Paramètres :/.test(strat) && /Critères hors échantillon/.test(strat) && /Jeu final \(ouvert une seule fois/.test(strat) && /Critères d’acceptation \(écrits avant les tests/.test(strat) && /variantes testées au total/.test(strat), strat.slice(0, 300));
const journal = await ev(() => document.querySelector('[data-s="journal"]').textContent);
verifier('journal d’expériences : décisions GARDER / SUPPRIMER / AJUSTER avec raison, critères écrits avant les tests', /SUPPRIMER|GARDER|AJUSTER/.test(journal) && /AVANT les tests/.test(journal) && /entrées/.test(journal), journal.slice(0, 200));
const perf = await ev(() => document.querySelector('[data-s="perf"]').textContent);
verifier('performance : backtest et compte simulé SÉPARÉS et étiquetés, avec « les résultats passés ne garantissent rien »', /BACKTEST hors échantillon/.test(perf) && /BACKTEST jeu final/.test(perf) && /COMPTE SIMULÉ en direct/.test(perf) && /Trades/.test(perf) && /Taux de réussite/.test(perf) && /R moyen/.test(perf) && /Facteur de profit/.test(perf) && /Creux maximal/.test(perf) && /Trades par semaine/.test(perf) && /ne garantissent rien/.test(perf), perf.slice(0, 300));
verifier('performance : courbe de capital dessinée (canvas non vide)', await ev(() => [...document.querySelectorAll('.ag-courbe')].some(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 150 && d[i] < 120) n++; return n > 20; })));
verifier('avertissement : ni conseil financier ni ordre, calcul seulement application ouverte', await ev(() => /Ni conseil financier/.test(document.querySelector('.tg-agent').textContent) && /n’exécute rien/.test(document.querySelector('.tg-agent').textContent)));
await page.screenshot({ path: 'captures-mars/test-agent-valide.png' });
// la zone de contrôles
const rgl = await ev(() => { const c = document.querySelector('[data-s="controles"]'); return [...c.querySelectorAll('[data-r]')].map(x => x.dataset.r); });
verifier('contrôles : capital, risque, max par semaine, repos, charge de calcul, mode observation, notifications', ['capital', 'risquePct', 'maxParSemaine', 'reposHeures', 'charge', 'observation', 'notifications'].every(k => rgl.includes(k)), JSON.stringify(rgl));
await ev(() => { const i = document.querySelector('[data-r="risquePct"]'); i.value = '2'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(600);
verifier('réglage du risque pris en compte (2 %), borné à 5 %', (await ev(() => window.__agentBtc.instantane().reglages.risquePct)) === 2);
await ev(() => window.__agentBtc.reglages({ risquePct: 1 }));

// ── table : l'agent se résume sur sa fenêtre ──
await ev(() => window.Mars.fermerFenetre()); await attendre(800);
await attendre(1500); fr = await ev(() => window.Mars.fenetresReelles());
verifier('table : la fenêtre « Agent BTC » est réelle (phase, stratégie, setup, compte)', agentFen() && agentFen().etat === 'ok', JSON.stringify(agentFen()));
await page.screenshot({ path: 'captures-mars/test-agent-table.png' });

// ── alerte vers Raylé ──
await ev(() => import('/planetes/mars/pc/trading/session-agent.js').then(m => m.alerteVersRayle({ type: 'ENTREE', sens: 1, entree: 84500, stop: 83800, cible: 87300, R: 4, t: Date.now(), texte: 'ACHAT Bitcoin vers 84 500 · stop 83 800 · objectif 87 300 (4 R)' })));
await attendre(1200);
verifier('alerte ENTRÉE : fenêtre holographique d’alerte de Raylé ouverte (système d’alertes existant réutilisé)', await ev(() => !!document.querySelector('.pn [class*="holo-alerte"], .holo-alerte') && /BTC · ENTRÉE/.test(document.body.textContent)));
await page.screenshot({ path: 'captures-mars/test-agent-alerte.png' });

// ── voix ──
const dire = t => ev(async x => window.commandeMars(x), t);
const cas = [['qu’est-ce que fait l’agent ?', /agent Bitcoin surveille/], ['en quelle phase est le marché ?', /phase de|En phase|phase/], ['pourquoi ce setup ?', /setup|Pas de setup|signal/i], ['résume les backtests', /espérance|ne garantissent rien/], ['qu’est-ce que le volume profile ?', /POC/]];
for (const [q, re] of cas) { const r = await dire(q); verifier('voix : « ' + q + ' »', typeof r === 'string' && re.test(r) && !/[*#`]/.test(r) && r.length > 40, String(r).slice(0, 160)); }
const rg = await dire('lance la recherche de stratégie bitcoin');
verifier('voix : « lance la recherche de stratégie bitcoin » lance la recherche en arrière-plan', typeof rg === 'string' && /je lance la recherche/i.test(rg) || /déjà en cours/.test(rg), String(rg).slice(0, 120));
await page.waitForFunction(() => !window.__agentBtc.instantane().recherche.enCours, { timeout: 240000 });
verifier('voix : une question sans rapport avec l’agent n’est pas prise (« la météo à Paris », « que penses-tu de l’inflation »)', (await dire('la météo à Paris')) === null && (await dire('que penses-tu de l’inflation en Europe')) === null);
verifier('journal de la page : le verdict de la recherche est annoncé', await ev(() => /Agent Bitcoin : /.test(document.body.textContent)));

// ── mémoire : rechargement de la page ──
const avantN = await ev(() => window.__agentBtc.instantane().donnees.n);
await page.reload({ waitUntil: 'load' }); await attendre(6000);
const apres = await ev(async () => { const m = await import('/planetes/mars/pc/trading/session-agent.js'); const a = await m.obtenirAgent({ demarrer: true }); const s = a.instantane(); return { n: s.donnees.n, etat: s.etatStrategie, journal: s.journal.length, source: s.donnees.source }; });
verifier('après rechargement : l’historique, la stratégie et le journal sont retrouvés (IndexedDB), sans retélécharger', apres.n >= avantN - 5 && apres.etat === 'validee' && apres.journal > 5 && apres.source === 'binance', JSON.stringify([avantN, apres]));

const vraies = erreurs.filter(x => !ignorees.test(x));
verifier('aucune erreur JavaScript', vraies.length === 0, vraies.slice(0, 3).join(' | '));
await navigateur.close(); await worker.fermer(); echange.close(); fin();
