/* Test Chrome du terminal « pro » H4 / Jour (or.html). Usage : node trader-pro/tests/terminal-chrome.mjs [tel|tablette|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode), { p, verif, attendre, capture } = T;
const url = 'http://rayle.test:8000/agent-trading/front/or.html?hj=1';
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro), 60000), 'le terminal pro est monté');
verif(await attendre(() => p.evaluate(() => window.__orPro && window.__orPro.etat().ma.length === 2), 30000), 'MA200 H4 et MA200 J présentes sur le graphique');
await w(2500); const e = await p.evaluate(() => window.__orPro.etat()); console.log('  état :', JSON.stringify(e));
verif(e.niveaux >= 2 && e.niveaux <= 6, 'niveaux forts : ' + e.niveaux + ' (6 au plus)');
verif(await p.evaluate(() => Object.values(window.__or.graph.couches()).every(v => v === false)), 'graphique propre : tous les calques sont désactivés par défaut');
verif(await p.evaluate(() => [...document.querySelectorAll('.tor-graph-barre, .tor-ft-ligne, .tt-fl')].every(b => getComputedStyle(b).display === 'none')), 'barres d’outils secondaires masquées (derrière « Détails »)');
verif(await p.evaluate(() => { const s = document.querySelector('.tor-graph-source'); return !s || getComputedStyle(s).display === 'none'; }), 'ligne des sources masquée');
verif(await p.evaluate(() => [...document.querySelectorAll('.tp-b-details, .tp-b-hj')].length === 2 && [...document.querySelectorAll('.tp-b-details, .tp-b-hj')].every(b => { const r = b.getBoundingClientRect(); return r.width > 30 && r.height > 20 && r.right <= innerWidth + 1 && getComputedStyle(b).visibility !== 'hidden'; })), 'boutons « Détails » et « Signaux H4 / J » visibles à l’écran');
const labels = await p.evaluate(() => { const g = window.__or.graph; return g.chart().panes().length; }); verif(labels >= 1, 'graphique présent');
await capture('terminal-propre');
console.log('— unités de temps : la MA200 H4 / J reste visible —');
for (const per of ['M15', 'H1', 'H4', 'J']) { await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), per); await w(9000); verif(await p.evaluate(() => window.__orPro.etat().ma.length === 2 && window.__or.moteur.serie().length > 20), per + ' : MA200 H4 et J dessinées, bougies présentes'); verif(await attendre(() => p.evaluate(() => { const r = window.__or.graph.chart().timeScale().getVisibleLogicalRange(), n = window.__or.moteur.serie().length; return !!r && r.to >= n - 12 && r.from < n; }), 15000), per + ' : la dernière bougie est visible (vue sur les dernières bougies)'); await capture('terminal-' + per); }
console.log('— panneau H4 / Jour —');
await p.evaluate(() => document.querySelector('.tp-b-hj').click()); await w(600);
verif(await p.evaluate(() => { const a = document.querySelector('.tp-panneau'); return !!a && !a.hidden && /Biais Jour/i.test(a.innerText) && /Backtest/i.test(a.innerText); }), 'le panneau indique le biais, les niveaux, les signaux et le backtest'); await capture('terminal-panneau');
const txt = await p.evaluate(() => document.querySelector('.tp-panneau').innerText); console.log('  ' + txt.replace(/\s+/g, ' ').slice(0, 520));
verif(/NON RENTABLE|positif|fragile|insuffisant/i.test(txt), 'le verdict du backtest est affiché clairement');
const nFiches = await p.evaluate(() => document.querySelectorAll('.tp-panneau [data-fiche]').length); if (nFiches) { await p.evaluate(() => document.querySelector('.tp-panneau [data-fiche]').click()); await w(1200); }
await p.evaluate(() => document.querySelector('.tp-panneau [data-fermer]').click());
console.log('— « Détails » —');
await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(1500);
verif(await p.evaluate(() => document.documentElement.classList.contains('tp-details') && [...document.querySelectorAll('.tor-graph-barre, .tor-ft-ligne, .tt-fl')].some(b => getComputedStyle(b).display !== 'none')), '« Détails » rend les barres d’outils');
await capture('terminal-details'); await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(800);
verif(await p.evaluate(() => Object.values(window.__or.graph.couches()).every(v => v === false)), 'retour au graphique propre');
console.log('— copie locale des bougies —');
const db = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('rayle-or-cache'); r.onsuccess = () => { try { const q = r.result.transaction('historique').objectStore('historique').getAllKeys(); q.onsuccess = () => res(q.result); } catch (er) { res([]); } }; r.onerror = () => res([]); })); verif(db.length >= 1, 'copie locale des bougies enregistrée : ' + db.join(', '));
await p.reload({ waitUntil: 'domcontentloaded' }); const t0 = Date.now(); verif(await attendre(() => p.evaluate(() => window.__or && window.__or.moteur && window.__or.moteur.serie().length > 50), 30000, 200), 'après rechargement, les bougies sont là en ' + (Date.now() - t0) + ' ms'); console.log('  premières bougies après', Date.now() - t0, 'ms ; copie utilisée :', await p.evaluate(() => !!(window.__or.moteur.S.hist && window.__or.moteur.S.hist.depuisCache)));
await T.fin();
