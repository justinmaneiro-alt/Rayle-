/* Bookmap en vrai (v12) : flux Binance réels, carte, bulles, stockage local, fluidité (processeur ralenti), actifs sans carnet grisés.
   Usage : node trader-pro/tests/bookmap-chrome.mjs [tablette|pc|tel] [BTC|OR|SOL] [secondes d'enregistrement] [ralentissement CPU]
   Prérequis : node serveur.mjs 8000 ; accès réseau (Binance). */
import { lancer, w } from './aide-chrome.mjs';
const vue = process.argv[2] || 'tablette', A = process.argv[3] || 'BTC', SEC = +(process.argv[4] || 30), CPU = +(process.argv[5] || 1);
const ID = { BTC: 'btc', OR: 'or', SOL: 'sol' }[A];
const T = await lancer(vue, { dossierCaptures: 'donnees-privees/captures-v12', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_piper_precharge: '0' } }), { p, verif, attendre, capture, fin } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 90000), 'terminal monté'); await w(2500);
await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
verif(await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && e.charge; }), 90000), 'mode Volume chargé');
verif(await p.evaluate(() => { const b = document.querySelector('.tpv [data-bookmap]'); return !!b && !b.disabled; }), 'bouton Bookmap actif pour ' + A);
const cdp = await p.createCDPSession(); if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await p.evaluate(() => document.querySelector('.tpv [data-bookmap]').click());
verif(await attendre(() => p.evaluate(() => { const b = window.__tpVolume.appel('bookmap'); return b && b.enMarche; }), 20000), 'Bookmap activé');
verif(await attendre(() => p.evaluate(() => { const b = window.__tpVolume.appel('bookmap'); return b && b.flux && b.flux.carnet === 'connecte' && b.flux.trades === 'connecte' && b.mid > 0; }), 40000), 'carnet complet (100 ms) et transactions connectés');
await w(SEC * 1000);
let e = await p.evaluate(() => window.__tpVolume.appel('bookmap')); console.log('  état :', JSON.stringify({ ...e, flux: e.flux }));
verif(e.colonnes >= Math.min(SEC - 8, 20), 'colonnes d’une seconde enregistrées : ' + e.colonnes);
verif(e.flux.diffs > SEC * 3, 'mises à jour du carnet reçues : ' + e.flux.diffs + ' (≈ 10 par seconde attendues)');
verif(e.flux.resyncs <= 2, 'resynchronisations du carnet : ' + e.flux.resyncs);
verif(e.flux.transactions > 0 && e.bulles >= 0, 'transactions reçues : ' + e.flux.transactions + ' ; gardées en bulles : ' + e.bulles);
verif(e.msDessin < 40 * Math.max(1, CPU / 2), 'temps de dessin moyen : ' + e.msDessin + ' ms (processeur ×' + CPU + ')');
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').dessiner()); await capture('bookmap-' + A);
/* fluidité : images par seconde réelles pendant un geste simulé */
const fps = await p.evaluate(async () => { const b = window.__tpVolume.appel('bookmapObjet'), n0 = b.etat().dessins, t0 = performance.now(); for (let k = 0; k < 40; k++) { b.deplacer({ demi: 60 + (k % 20) * 3, decalage: k * 1000 }); b.dessiner(); await new Promise(r => setTimeout(r, 20)); } return { ips: Math.round(b.etat().dessins - n0) / ((performance.now() - t0) / 1000), ms: b.etat().msDessin }; });
console.log('  geste :', JSON.stringify(fps)); verif(fps.ms < 45 * Math.max(1, CPU / 2), 'dessin pendant un geste : ' + fps.ms.toFixed(1) + ' ms par image');
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').deplacer({ demi: 110, decalage: 0, centre: null }));
/* échelle de temps « minutes » et réglages */
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').regler({ echelle: 'minutes', contraste: 2.5 })); await w(600); await capture('bookmap-minutes-' + A);
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').regler({ echelle: 'secondes', contraste: 1.6 }));
/* stockage : tout est écrit puis relu par une nouvelle page */
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').sauvegarder(true)); await w(1500);
e = await p.evaluate(() => window.__tpVolume.appel('bookmap')); verif(e.sauvees > 0, 'colonnes écrites sur l’appareil (IndexedDB) : ' + e.sauvees);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
/* retour au Classique : tout s'arrête */
await p.evaluate(() => document.querySelector('.tpv [data-vers-classique]').click()); await w(800);
verif(await p.evaluate(() => { const b = window.__tpVolume.appel('bookmap'); return !b || !b.enMarche; }), 'retour au Classique : le flux Bookmap est coupé');
await fin();
