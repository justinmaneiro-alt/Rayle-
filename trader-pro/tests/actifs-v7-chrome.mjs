/* Test Chrome v7 phase 5 : changement d'actif dans les deux modes (aucun reste de l'actif précédent) + cohérence des prix Classique / Volume.
   Prérequis : node serveur.mjs 8000 ; accès réseau. Usage : node trader-pro/tests/actifs-v7-chrome.mjs [pc|tablette|tel] [OR,BTC,NASDAQ,EURUSD] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', liste = (process.argv[3] || 'BTC,OR,NASDAQ,EURUSD').split(','), VOL = { OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol', EURUSD: 'eurusd', DXY: 'dxy', USDCHF: 'usdchf' };
const T = await lancer(mode), { p, verif, attendre, fin } = T;
const vus = [];
for (const A of liste) {
  await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const monte = await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 60000); verif(monte, A + ' : terminal pro monté'); if (!monte) continue;
  const tete1 = await p.evaluate(() => (document.querySelector('.tor-tete, .tt-barre') || {}).innerText || '');
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
  await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && (e.charge || e.erreur); }), 60000);
  const e = await p.evaluate(() => window.__tpVolume.etat());
  verif(e && e.actif === VOL[A], A + ' : Volume sur le bon actif (' + (e && e.actif) + ')');
  verif(e && e.charge && e.bougies >= 100, A + ' : ' + (e && e.bougies) + ' bougies Volume' + (e && e.erreur ? ' · erreur ' + e.erreur : ''));
  /* unité identique : H4 par défaut des deux côtés */
  const unites = await p.evaluate(() => ({ vol: window.__tpVolume.etat().unite, cl: ((document.querySelector('[data-periode][aria-pressed="true"]') || {}).dataset || {}).periode || null }));
  verif(!unites.cl || String(unites.cl).toUpperCase() === String(unites.vol).toUpperCase(), A + ' : même unité Classique / Volume (' + unites.cl + ' / ' + unites.vol + ')');
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="classique"]').click()); await w(1500);
  const tete2 = await p.evaluate(() => (document.querySelector('.tor-tete, .tt-barre') || {}).innerText || '');
  verif(tete1 === tete2 || tete2.length > 0, A + ' : retour au Classique, en-tête présent');
  const autres = liste.filter(x => x !== A).map(x => x.toLowerCase());
  verif(!(e && e.badge) || !autres.some(x => x.length > 3 && new RegExp('\\b' + x + '\\b', 'i').test(e.badge)), A + ' : badge sans reste d’un autre actif (' + (e && e.badge) + ')');
  await w(32000);   // le Classique note son prix toutes les 30 s
  vus.push(A);
}
const R = await p.evaluate(async () => { const m = await import('/trader-pro/commun/incidents-donnees.js'); const reg = JSON.parse(localStorage.getItem('rayle_prix_vus_v1') || '{}'); return { reg, ecarts: m.ecartsPrix(reg) }; });
console.log('  prix vus :', JSON.stringify(Object.fromEntries(Object.entries(R.reg).map(([a, s]) => [a, Object.fromEntries(Object.entries(s).map(([k, x]) => [k, x.p]))]))));
verif(R.ecarts.length === 0, 'cohérence des prix (0,5 %) : ' + (R.ecarts.length ? JSON.stringify(R.ecarts) : 'aucun écart'));
await fin();
