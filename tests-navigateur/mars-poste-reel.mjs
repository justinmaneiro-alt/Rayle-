import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { historiqueReel } from '../planetes/mars/tests/aide-btc.mjs';

/* Le poste de pilotage avec de VRAIES bougies Bitcoin (cache local de 9 ans, servi par un faux échange pour ne pas retélécharger) : vue d'ensemble, recherche réelle pendant quelques minutes
   (le profil de Chrome est un profil de test : aucune donnée de ton vrai Rayle n'est touchée), graphique, laboratoire, réglages. Captures : captures-mars/m5-reel-*.png.
   Ce que ça montre : sur de vraies données, l'agent dit honnêtement « aucune stratégie validée » et compte ses variantes. Durée de recherche : MINUTES=3 par défaut. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const MINUTES = Number(process.env.MINUTES) || 3, L = 1700, H = 950, PAS = 900e3;
const { serie: S } = await historiqueReel({ annees: 9.17 });
const echange = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, u = new URL(req.url, 'http://x'), t0 = +u.searchParams.get('t0'), lim = +u.searchParams.get('limit') || 1000, out = [];
  let a = 0, b = S.n; while (a < b) { const m = (a + b) >> 1; if (S.t[m] < t0) a = m + 1; else b = m; }
  for (let i = a; i < S.n && out.length < lim; i++) out.push([S.t[i], S.o[i], S.h[i], S.l[i], S.c[i], S.v[i], 0, 0, 1, S.vb[i], 0, 0]);
  res.writeHead(200, cors); res.end(JSON.stringify(out));
});
await new Promise(r => echange.listen(8801, '127.0.0.1', r));
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await navigateur.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 240)); }); page.on('pageerror', e => erreurs.push('pageerror: ' + (e.stack || e.message).slice(0, 600)));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0');
  window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, sansVeilleur: true, periodeMs: 3600e3, lire: async url => { const q = new URL(url); const r = await fetch('http://127.0.0.1:8801/?t0=' + (q.searchParams.get('startTime') || 0) + '&limit=' + (q.searchParams.get('limit') || 1000)); return r.json(); } };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1200);
await ev(() => document.querySelector('[data-a="activer-donnees"]').click());
await page.waitForFunction(() => window.__hoteBtc && window.__hoteBtc.vue().donnees.n > 300000, { timeout: 600000 });
await attendre(2500);
const d = await ev(() => { const x = window.__hoteBtc.vue().donnees; return { n: x.n, annees: x.annees, source: x.source, lacunes: x.nbLacunes, reel: x.deltaReelPct }; });
verifier('données RÉELLES : ' + d.n + ' bougies M15, ' + d.annees.toFixed(2) + ' ans, ' + d.lacunes + ' trous, delta réel ' + Math.round(d.reel * 100) + ' %', d.n > 300000 && d.annees > 9 && d.reel > 0.99);
await ev(() => window.PosteAgent.poste().ouvrirOnglet('ensemble')); await attendre(1500);
await page.screenshot({ path: 'captures-mars/m5-reel-1-ensemble.png' });
await ev(() => document.querySelector('[data-a="recherche-reprise"]').click());
const t0 = Date.now();
while (Date.now() - t0 < MINUTES * 60000) { await attendre(15000); const v = await ev(() => window.__hoteBtc.vue()); console.log('  ' + Math.round((Date.now() - t0) / 1000) + ' s · ' + v.recherche.N + ' variantes · niveau ' + v.recherche.niveauNom + ' · validées ' + v.recherche.valideesComptees + ' · ouvertures du jeu final ' + v.coffre.ouverts.length); }
await ev(() => window.PosteAgent.poste().ouvrirOnglet('ensemble')); await attendre(1500);
await page.screenshot({ path: 'captures-mars/m5-reel-2-recherche.png' });
const v = await ev(() => window.__hoteBtc.vue());
verifier('recherche réelle : des milliers de variantes testées, comptées et affichées', v.recherche.N > 1000, String(v.recherche.N));
verifier('sur de vraies données, l’agent dit honnêtement qu’aucune stratégie n’est validée (sinon : voir le journal)', v.recherche.valideesComptees === 0 ? /Aucune stratégie n’est validée/.test(await ev(() => document.querySelector('.pa-situation').textContent)) : true, 'validées : ' + v.recherche.valideesComptees);
await ev(() => document.querySelector('[data-a="recherche-pause"]').click()); await attendre(1500);
await ev(() => window.PosteAgent.poste().ouvrirOnglet('graphique')); await attendre(3500);
verifier('graphique avec de vraies bougies (POC et phase du marché affichés)', await ev(() => { const e = window.PosteAgent.poste().etat(); return e.graph && e.graph.nBougies > 1000; }));
await page.screenshot({ path: 'captures-mars/m5-reel-3-graphique.png' });
for (const c of ['zone', 'vwap', 'asie', 'liquidite']) await ev(c => { const e = document.querySelector('[data-g-couche="' + c + '"]'); if (!e.checked) e.click(); }, c);
await attendre(2500); await page.screenshot({ path: 'captures-mars/m5-reel-4-graphique-couches.png' });
await ev(() => window.PosteAgent.poste().ouvrirOnglet('labo')); await attendre(1200);
await page.screenshot({ path: 'captures-mars/m5-reel-5-laboratoire.png' });
await ev(() => window.PosteAgent.poste().ouvrirOnglet('reglages')); await attendre(1200);
await page.screenshot({ path: 'captures-mars/m5-reel-6-reglages.png' });
await ev(() => window.PosteAgent.poste().ouvrirOnglet('strategies')); await attendre(1200);
await page.screenshot({ path: 'captures-mars/m5-reel-7-strategies.png' });
const graves = erreurs.filter(e => !/ERR_FAILED|Failed to load resource|faireconomy/.test(e)); verifier('aucune erreur JavaScript', graves.length === 0, graves.slice(0, 3).join(' | '));
console.log('\nRÉSULTAT RÉEL : ' + v.recherche.N + ' variantes testées en ' + MINUTES + ' min, ' + v.recherche.valideesComptees + ' stratégie(s) validée(s), jeu final ouvert ' + v.coffre.ouverts.length + ' fois ; pistes proches : ' + v.recherche.presque.length);
await navigateur.close(); echange.close();
process.exit(fin() ? 1 : 0);
