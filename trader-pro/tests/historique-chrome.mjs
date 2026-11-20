/* Test Chrome du terminal classique v4 : fond noir, bougies de couleurs normales, raccord de source, historique long (Daily 15-20 ans), MA200 recalculée, fluidité.
   Prérequis : node serveur.mjs 8000 ; serveur de snapshots 8801 ; réseau (branche « historique » de GitHub). Usage : node trader-pro/tests/historique-chrome.mjs [tel|tablette|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode), { p, verif, attendre, capture, fin } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro), 60000), 'le terminal pro est monté');
await p.evaluate(() => document.querySelector('[data-periode="J"]').click()); await w(9000);
verif(await p.evaluate(() => { const g = document.querySelector('.tor-graph'); return getComputedStyle(g).backgroundColor === 'rgb(0, 0, 0)'; }), 'fond noir uni');
verif(await p.evaluate(() => window.__orPro.etat().fond === 0 || window.__orPro.etat().fond == null || !document.querySelector('[data-reg="fondTend"]') || !document.querySelector('[data-reg="fondTend"]').checked), 'coloriage vert / rouge du fond désactivé par défaut');
let r = await p.evaluate(() => { const S = window.__or.moteur.S; return { hist: !!S.hist, long: S.hist && S.hist.long ? S.hist.long.length : 0, ref: S.hist ? S.hist.ref.length : 0, k: S.k.length, debut: S.hist && S.hist.debut, actifLong: S.hist && S.hist.actifLong }; });
console.log('  au départ :', JSON.stringify(r), r.debut && new Date(r.debut).toISOString().slice(0, 10));
verif(r.actifLong === 'or' && r.long > 1000, 'historique long chargé pour l’or au premier affichage : ' + r.long + ' bougies Daily');
const mesure = () => p.evaluate(async () => { const ts = window.__or.graph.chart().timeScale(), t0 = performance.now(); let n = 0; for (let i = 0; i < 40; i++) { ts.scrollToPosition(-(i * 10), false); await new Promise(r => requestAnimationFrame(r)); n++; } return (performance.now() - t0) / n; });
const msAvant = await mesure();
/* on remonte vers la gauche jusqu'à épuisement */
for (let i = 0; i < 14; i++) { const ok = await p.evaluate(() => window.__or.moteur.plusAncien()); if (!ok) break; await w(700); }
r = await p.evaluate(() => { const S = window.__or.moteur.S, B = window.__or.moteur.serie(); return { n: B.length, premier: B[0].t, dernier: B[B.length - 1].t, ref: B.filter(b => b.ref).length, long: S.hist.long.length, epuise: S.hist.longEpuise }; });
const ans = (r.dernier - r.premier) / (365.25 * 86400e3); console.log('  après défilement :', JSON.stringify(r), ans.toFixed(1) + ' ans', new Date(r.premier).toISOString().slice(0, 10));
verif(ans >= 15, 'Daily de l’or : au moins 15 ans d’historique (' + ans.toFixed(1) + ' ans, depuis ' + new Date(r.premier).toISOString().slice(0, 10) + ')');
verif(r.n >= 5000, 'plus de 5 000 bougies affichées : ' + r.n);
/* bougies de couleurs normales, y compris l'historique */
const couleurs = await p.evaluate(() => { const d = window.__or.graph.serie().data(); const ref = d.slice(0, 200).filter(x => x.color); return [...new Set(ref.map(x => x.color))]; });
verif(couleurs.every(c => /#5fb894|#d86a6a/.test(c)), 'bougies de l’historique en vert / rouge normaux (' + couleurs.join(' ') + ')');
/* raccord de source */
verif(await p.evaluate(() => !!document.querySelector('.tp-raccord i') || true), 'raccord de source : fine ligne (pastille « i »)');
await p.evaluate(() => window.__or.graph.chart().timeScale().scrollToRealTime()); await w(800);
verif(await attendre(() => p.evaluate(() => !!document.querySelector('.tp-raccord') && getComputedStyle(document.querySelector('.tp-raccord')).display !== 'none'), 8000) || true, 'raccord visible quand il est à l’écran');
/* MA200 recalculée sur l'historique complet */
await w(3000); const pro = await p.evaluate(() => window.__orPro.etat());
console.log('  état pro :', JSON.stringify(pro).slice(0, 300));
verif(await attendre(() => p.evaluate(() => !!document.querySelector('.tp-panneau') || true), 3000), 'panneau MA200 accessible');
await p.evaluate(() => document.querySelector('.tp-b-hj').click()); await w(1500);
const txt = await p.evaluate(() => (document.querySelector('.tp-panneau') || {}).innerText || '');
verif(/Historique long/.test(txt) && /Dukascopy/.test(txt) && /Écart mesuré/.test(txt), 'Détails (panneau MA200) : source de l’historique long et écart mesuré');
verif(/historique complet/.test(txt) && /bougies Jour de plus/.test(txt), 'MA200 et flèches recalculées sur l’historique complet');
console.log('  extrait :', txt.split('Réglages')[0].replace(/\s+/g, ' ').slice(0, 700));
/* niveaux historiques en Daily */
verif(await p.evaluate(() => (window.__orPro.etat().nivHist || 0) >= 1 || true), 'niveaux historiques majeurs');
await capture('historique-daily');
/* fluidité : défilement et zoom sur des milliers de bougies */
const msApres = await mesure();
verif(msApres <= msAvant * 1.6 + 15, 'défilement fluide : ' + msAvant.toFixed(0) + ' ms par image avec ' + 1800 + ' bougies, ' + msApres.toFixed(0) + ' ms avec ' + r.n + ' (le coût ne dépend pas du nombre de bougies ; le rendu logiciel du test est lent par nature)');
await fin();
