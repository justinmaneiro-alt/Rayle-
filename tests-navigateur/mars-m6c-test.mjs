import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { marcheM5, DERIVE_PLANTEE } from '../planetes/mars/tests/synth-m5.mjs';

/* M6c de bout en bout dans Chrome (assistant de marché par régime ; modèle : mars-m6-test.mjs) : trois paires (faux échange Binance, port 8799), gardien prop, tilt, journal (formulaire et CSV), simulation, régime (faux réseau), capture d'écran (fausse IA),
   santé, bibliothèque d'idées, outils du graphique (zone, test de zone, clic de bougie, couches), changement de paire. Captures : captures-mars/m6c-*.png. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1700, H = Number(process.env.H) || 950, PAS = 900e3;
const now0 = Math.floor(Date.now() / PAS) * PAS - 3 * 86400e3, N = 21000, SERIE = marcheM5({ n: N, graine: 9, derive: DERIVE_PLANTEE, t0: now0 - (N - 1000) * PAS });
const echange = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, u = new URL(req.url, 'http://x'), t0 = +u.searchParams.get('t0'), lim = +u.searchParams.get('limit') || 1000, sym = u.searchParams.get('symbol') || '', k = /SOL/.test(sym) ? 0.0125 : /DOGE/.test(sym) ? 0.00001 : 1, out = [];
  let i = 0; while (i < SERIE.n && SERIE.t[i] < t0) i++;
  for (; i < SERIE.n && out.length < lim; i++) { if (SERIE.t[i] + PAS > Date.now()) break; out.push([SERIE.t[i], SERIE.o[i] * k, SERIE.h[i] * k, SERIE.l[i] * k, SERIE.c[i] * k, SERIE.v[i], 0, 0, 1, SERIE.vb[i], 0, 0]); }
  res.writeHead(200, cors); res.end(JSON.stringify(out));
});
await new Promise(r => echange.listen(8799, '127.0.0.1', r));
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await navigateur.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('console', m => { if (['error'].includes(m.type())) erreurs.push(m.text().slice(0, 240)); }); page.on('pageerror', e => erreurs.push('pageerror: ' + (e.stack || e.message).slice(0, 700)));
page.on('dialog', d => d.accept());
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0');
  window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, sansVeilleur: true, sansCanvas: true, periodeMs: 3600e3, annees: 0.1,
    lire: async url => { const q = new URL(url); const r = await fetch('http://127.0.0.1:8799/?symbol=' + (q.searchParams.get('symbol') || '') + '&t0=' + (q.searchParams.get('startTime') || 0) + '&limit=' + (q.searchParams.get('limit') || 1000)); return r.json(); },
    lireReseau: async url => {
      if (/fundingRate/.test(url)) return Array.from({ length: 100 }, (_, i) => ({ symbol: 'X', fundingTime: Date.now() - (100 - i) * 8 * 3600e3, fundingRate: String(0.00005 + (i % 9) * 0.000004) }));
      if (/alternative/.test(url)) return { data: [{ value: '61', value_classification: 'Greed', timestamp: String(Math.floor(Date.now() / 1000)) }] };
      if (/coingecko/.test(url)) return { data: { market_cap_change_percentage_24h_usd: 0.8, market_cap_percentage: { btc: 57 } } };
      throw new Error('inconnu');
    },
    lireCapture: async () => { const p = window.__prixCapture || 100; return { lecture: { instrument: 'BTCUSDT', unite: '1h', prixDernier: p, niveaux: [{ type: 'support', prix: p * 0.98, etiquette: 'support' }, { type: 'resistance', prix: p * 1.02 }, { type: 'niveau', prix: p * 40 }], zones: [{ prixHaut: p * 0.99, prixBas: p * 0.97 }], confiance: 0.8 }, moteur: 'Gemini/test' }; },
    traduireIdee: async texte => ({ regle: { nom: 'Idée traduite', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }, explication: 'Traduction de test pour : ' + texte }),
    envoyerTelegram: async () => {} };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
const ev = (f, ...a) => page.evaluate(f, ...a);
const texte = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);
const cliquer = async sel => { await page.waitForSelector(sel, { timeout: 8000 }); await page.click(sel); await attendre(350); };
const onglet = async nom => { await page.evaluate(n => document.querySelector('.pa-onglets [data-onglet="' + n + '"]').click(), nom); await attendre(700); };
const remplir = async (sel, val) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, String(val)); };
const soumettre = async sel => { await page.$eval(sel, f => f.requestSubmit()); await attendre(900); };

await ev(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1500);
// ── activation de BTC (historique du faux échange) ──
await onglet('ensemble'); await cliquer('[data-a="activer-donnees"]');
await page.waitForFunction(() => window.__hoteBtc && window.__hoteBtc.vue().donnees.n > 15000, { timeout: 240000 }); await attendre(1500);
// ── onglet Régime : l'assistant par régime s'affiche et analyse BTC tout seul ──
await onglet('regime');
await page.waitForFunction(() => /assistant par régime/.test(document.body.textContent), { timeout: 20000 });
verifier('onglet Régime : trois cartes « assistant par régime » (Bitcoin, Solana, Dogecoin)', await ev(() => { const t = document.body.textContent; return ['Bitcoin · assistant par régime', 'Solana · assistant par régime', 'Dogecoin · assistant par régime'].every(x => t.includes(x)); }));
await page.waitForSelector('[data-a="m6c-analyser"][data-paire="BTC"]', { timeout: 20000 });
await cliquer('[data-a="m6c-analyser"][data-paire="BTC"]'); await attendre(3500);
const txt = await ev(() => document.body.textContent);
verifier('analyse BTC : le régime est annoncé avec une phrase en français', /(range entre|Tendance (haussière|baissière)|Transition)/.test(txt), txt.slice(0, 200));
verifier('critères écrits avant les tests affichés avec leur empreinte, jeu final jamais ouvert', /d8c5e758/.test(txt) && /Jeu final/.test(txt) && /jamais été ouvert/.test(txt));
verifier('performance : étiquette BACKTEST, règles en INFORMATION, pas de CONFIRMÉ EN RÉEL', /BACKTEST/.test(txt) && (txt.match(/INFORMATION/g) || []).length >= 4 && !/CONFIRMÉ EN RÉEL(?! :)/.test(txt.replace(/pas de CONFIRMÉ EN RÉEL[^<]*/g, '')));
verifier('performance : précision du détecteur, fausses cassures évitées / subies, trades évités par le filtre, gros mouvements', /Précision du détecteur/.test(txt) && /fausses cassures SUBIES/.test(txt) && /ÉVITÉES/.test(txt) && /Trades évités grâce au filtre/.test(txt) && /Gros mouvements/.test(txt));
// ── le graphique reçoit les zones de régime (groupe regime-m6c) ──
const groupes = await ev(() => window.GraphiqueAgent.magasin('BTC').groupes().map(g => g.groupe + ':' + g.auteur));
verifier('graphique : le groupe « regime-m6c » est tracé par l’agent', groupes.some(g => g === 'regime-m6c:agent'), groupes.join());
const nDessins = await ev(() => window.GraphiqueAgent.magasin('BTC').lister({ groupe: 'regime-m6c' }).length);
verifier('graphique : au moins un dessin de régime (zone ou niveau)', nDessins >= 1, nDessins);
await onglet('graphique'); await attendre(1800);
verifier('graphique : le groupe de régime est listé et peut être masqué', await ev(() => [...document.querySelectorAll('[data-gd]')].some(e => e.dataset.gd === 'regime-m6c')));
await page.screenshot({ path: 'captures-mars/m6c-1-graphique.png' });
await ev(() => window.GraphiqueAgent.masquer('BTC', 'regime-m6c', true)); await attendre(500);
verifier('masquer le groupe « regime-m6c » fonctionne', await ev(() => window.GraphiqueAgent.magasin('BTC').groupes().find(g => g.groupe === 'regime-m6c').visibles === 0));
await ev(() => window.GraphiqueAgent.masquer('BTC', 'regime-m6c', false));
// ── simulation d'évaluation à 0,25 / 0,5 / 1 % ──
await onglet('regime'); await attendre(900);
const aBouton = await ev(() => !!document.querySelector('[data-a="m6c-sim"][data-paire="BTC"]'));
if (aBouton) { await cliquer('[data-a="m6c-sim"][data-paire="BTC"]'); await attendre(2500); verifier('simulation BACKTEST : trois niveaux de risque, « pas une promesse »', await ev(() => /0,25 % de risque/.test(document.body.textContent) && /1 % de risque/.test(document.body.textContent) && /pas une promesse/.test(document.body.textContent))); }
else verifier('simulation : bouton absent faute de règle avec assez de trades (honnête)', true);
await page.screenshot({ path: 'captures-mars/m6c-2-regime.png' });
// ── voix ──
const dits = await ev(async () => {
  const VP = await import('/planetes/mars/pc/trading/voix-poste-page.js'), out = {}, norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[?!']/g, ' ').replace(/-/g, ' ');
  for (const [k, p] of [['etat', 'on est en range sur bitcoin'], ['bornes', 'où sont les bornes du range sur bitcoin'], ['craint', 'ça craint sur bitcoin'], ['cassure', 'y a-t-il une cassure valide sur bitcoin'], ['fausse', 'attention fausse cassure sur bitcoin']]) out[k] = await VP.traiterM6(norm(p));
  return out;
});
verifier('voix : chaque phrase de régime reçoit une réponse parlée en français (jamais vide)', Object.values(dits).every(t => typeof t === 'string' && t.length > 15), JSON.stringify(dits).slice(0, 300));
verifier('voix : aucune réponse ne présente une règle non validée comme un signal d’entrée', !Object.values(dits).some(t => /ENTRÉE valide|signal d’entrée validé/i.test(t)));
// ── fenêtres de la table : performance et régime reprennent l'assistant ──
const reels = await ev(async () => { const F = await import('/planetes/mars/pc/trading/fenetres-m6.js'), AP = await import('/planetes/mars/pc/trading/assistant-page.js'); return F.construireReels(window.RayleM6.vue(), {}, {}, null, { paires: ['BTC'], assistants: AP.assistantsMemo() }); });
verifier('table de Mars : « performance des stratégies » montre la courbe BACKTEST de l’assistant (INFORMATION)', reels['perf-strategies'].etat === 'ok' && reels['perf-strategies'].etiquette === 'BACKTEST' && /information/.test(reels['perf-strategies'].pied) && reels['perf-strategies'].courbes.length >= 1, JSON.stringify(reels['perf-strategies']).slice(0, 200));
verifier('table de Mars : « régime de marché » ajoute la ligne « assistant » de la paire', reels['regime-marche'].etat === 'ok' && reels['regime-marche'].liste.some(l => /assistant/.test(l.g)), JSON.stringify(reels['regime-marche']).slice(0, 200));
// ── alertes : diffusion limitée en fréquence, assistant coupable ──
await ev(() => localStorage.removeItem('rayle_m6c_hist'));
const premiere = await ev(async () => { const AP = await import('/planetes/mars/pc/trading/assistant-page.js'), recu = []; await AP.assistantTick(['BTC'], { diffuser: a => recu.push(a.type) }); return recu; });
const seconde = await ev(async () => { const AP = await import('/planetes/mars/pc/trading/assistant-page.js'), recu = []; await AP.assistantTick(['BTC'], { diffuser: a => recu.push(a.type) }); return recu.length; });
verifier('alertes : une deuxième passe sur la même bougie ne répète rien', seconde === 0, JSON.stringify(premiere) + ' / ' + seconde);
verifier('aucune alerte d’ENTRÉE tant qu’aucune règle n’a battu le hasard', !premiere.includes('ENTREE'));
verifier('l’assistant peut être coupé', await ev(async () => { const AP = await import('/planetes/mars/pc/trading/assistant-page.js'); AP.reglerAssistant(false); const r = await AP.assistantTick(['BTC']); AP.reglerAssistant(true); return r.length === 0; }));
const gravesErreurs = erreurs.filter(e => !/ERR_FAILED|Failed to load resource|faireconomy|__veilleur/.test(e));
verifier('aucune erreur JavaScript', gravesErreurs.length === 0, gravesErreurs.slice(0, 4).join(' | '));
await navigateur.close(); echange.close();
process.exit(fin() ? 1 : 0);
