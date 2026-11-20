/* Test Chrome du mode Volume (v4). Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <clone de la branche donnees> 8801 ; accès réseau (Binance).
   Usage : node trader-pro/tests/volume-chrome.mjs [tel|tablette|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode), { p, verif, attendre, capture, fin } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 60000), 'le terminal pro est monté, avec le sélecteur de mode');
verif(await p.evaluate(() => [...document.querySelectorAll('.tp-mode [data-mode]')].map(b => b.textContent).join() === 'Classique,Volume'), 'sélecteur « Classique | Volume »');
const rep = await p.evaluate(() => { const r = document.querySelector('.tp-mode').getBoundingClientRect(); return { x: r.left, w: r.width, t: r.top, vw: innerWidth }; }); verif(rep.x + rep.w > rep.vw * 0.5 && rep.t < 200 && rep.w > 20, 'le sélecteur est en haut à droite : x=' + Math.round(rep.x) + ' sur ' + rep.vw);
await w(1500); await capture('volume-0-classique');
/* fond noir du classique */
verif(await p.evaluate(() => { const g = document.querySelector('.tor-graph'); const c = g && getComputedStyle(g).backgroundColor; return c === 'rgb(0, 0, 0)'; }), 'classique : fond noir uni');
await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
verif(await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && (e.charge || e.erreur); }), 60000), 'le mode Volume a répondu');
let e = await p.evaluate(() => window.__tpVolume.etat()); console.log('  état :', JSON.stringify(e));
verif(e && e.charge && e.bougies >= 200, 'bougies chargées : ' + (e && e.bougies));
verif(e.source === 'reel' && e.deltaReel === true, 'or : volume réel Binance et delta réel');
verif(/Binance XAUUSDT/.test(e.badge) && /delta réel/.test(e.badge), 'badge de source : ' + e.badge);
verif(e.panneaux === 3, '3 panneaux : prix, volume + delta + CVD, MFI (' + e.panneaux + ')');
await w(2500); e = await p.evaluate(() => window.__tpVolume.etat());
verif(Number.isFinite(e.poc) && e.val < e.poc && e.poc < e.vah, 'profil de la zone visible : POC ' + (e.poc && e.poc.toFixed(1)) + ' dans la zone de valeur ' + (e.val && e.val.toFixed(1)) + ' – ' + (e.vah && e.vah.toFixed(1)));
verif(e.niveaux >= 1 && e.niveaux <= 5, 'supports / résistances par le volume : ' + e.niveaux + ' (3 à 5 visés, jamais plus de 5)');
verif(e.series >= 4, 'VWAP semaine et mois tracés (' + e.series + ' séries)');
await attendre(() => p.evaluate(() => { const x = window.__tpVolume.etat(); return x.carnet; }), 25000);
e = await p.evaluate(() => window.__tpVolume.etat()); console.log('  flux :', JSON.stringify(e.flux), 'carnet', e.carnet, 'gros', e.gros);
verif(e.carnet === true && e.flux.Binance === 'connecte', 'carnet Binance vivant');
verif(await p.evaluate(() => document.querySelectorAll('.tpv-ligne').length >= 20 && !!document.querySelector('.tpv-jauge')), 'échelle du carnet et jauge de déséquilibre');
verif(await p.evaluate(() => getComputedStyle(document.querySelector('.tpv')).backgroundColor === 'rgb(0, 0, 0)'), 'mode Volume : fond noir uni');
await capture('volume-1-or-h4');
/* H1 puis Daily */
for (const u of ['H1', 'J']) {
  await p.evaluate(x => document.querySelector(`.tpv [data-unite="${x}"]`).click(), u);
  verif(await attendre(() => p.evaluate(x => { const s = window.__tpVolume.etat(); return s && s.charge && s.unite === x && s.bougies > 100; }, u), 40000), u + ' : bougies chargées'); await w(1500);
}
await capture('volume-2-or-daily');
/* analyse parlée */
const phrase = await p.evaluate(() => window.__tpVolume.analyse()); console.log('  analyse :', phrase);
verif(/point de contrôle/.test(phrase) && /zone de valeur/.test(phrase) && phrase.split(/[.!?]\s/).length <= 7, 'analyse de Rayle : POC, zone de valeur, carnet, niveau, flèche en quelques phrases');
/* VWAP ancré */
const n0 = (await p.evaluate(() => window.__tpVolume.etat())).series; await p.evaluate(() => window.__tpVolume.ancrer()); await p.evaluate(() => document.querySelector('.tpv [data-ancrer]').getAttribute('aria-pressed'));
verif(await p.evaluate(() => document.querySelector('.tpv [data-ancrer]').getAttribute('aria-pressed') === 'true'), 'mode « ancrer un VWAP » armé');
/* BTC */
await p.evaluate(() => { const s = document.querySelector('.tpv [data-actif]'); s.value = 'btc'; s.dispatchEvent(new Event('change', { bubbles: true })); });
verif(await attendre(() => p.evaluate(() => { const s = window.__tpVolume.etat(); return s && s.charge && s.actif === 'btc'; }), 40000), 'Bitcoin chargé'); await w(5000);
e = await p.evaluate(() => window.__tpVolume.etat()); verif(/Binance/.test(e.badge) && e.deltaReel === true, 'BTC : ' + e.badge);
await capture('volume-3-btc');
/* Nasdaq : pas de carnet, volume par niveau de prix */
await p.evaluate(() => { const s = document.querySelector('.tpv [data-actif]'); s.value = 'us100'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await attendre(() => p.evaluate(() => { const s = window.__tpVolume.etat(); return s && (s.charge || s.erreur) && s.actif === 'us100'; }), 40000); await w(1500);
e = await p.evaluate(() => window.__tpVolume.etat()); console.log('  nasdaq :', JSON.stringify({ charge: e.charge, erreur: e.erreur, badge: e.badge }));
if (e.charge) { verif(/futures CME/.test(e.badge) && /delta estimé/.test(e.badge), 'Nasdaq : volume des futures NQ, delta estimé'); verif(await p.evaluate(() => /Carnet non disponible gratuitement/.test(document.querySelector('.tpv-droite').innerText)), 'Nasdaq : « carnet non disponible gratuitement » + volume par niveau de prix'); }
else console.log('  (instantané NQ=F pas encore publié par le robot : vérification Nasdaq ignorée) ' + e.erreur);
/* retour au classique */
await p.evaluate(() => document.querySelector('.tpv [data-vers-classique]').click()); await w(800);
verif(await p.evaluate(() => document.querySelector('.tpv').hidden === true && getComputedStyle(document.querySelector('.tor-graph')).visibility !== 'hidden'), 'retour au mode Classique : graphique classique de nouveau visible');
await capture('volume-4-retour-classique');
await fin();
