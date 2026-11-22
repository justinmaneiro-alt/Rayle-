/* Bookmap : mémoire locale (la carte relue après rechargement) et actifs sans carnet (bouton grisé avec la raison). Usage : node trader-pro/tests/bookmap-reprise-chrome.mjs [tablette|pc|tel] */
import { lancer, w } from './aide-chrome.mjs';
const vue = process.argv[2] || 'tablette';
const T = await lancer(vue, { dossierCaptures: 'donnees-privees/captures-v12', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_piper_precharge: '0' } }), { p, verif, attendre, capture, fin } = T;
const ouvrirVolume = async A => {
  await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
  verif(await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 90000), A + ' : terminal monté'); await w(2500);
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
  return attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return !!(e && e.charge); }), 90000);
};
/* 1. actifs sans carnet : bouton grisé + raison */
for (const A of ['NASDAQ', 'EURUSD']) {
  verif(await ouvrirVolume(A), A + ' : Volume chargé');
  const b = await p.evaluate(() => { const x = document.querySelector('.tpv [data-bookmap]'); return { dis: x.disabled, titre: x.title, possible: window.__tpVolume.appel('bookmapPossible') }; });
  verif(b.dis && !b.possible && /carnet/.test(b.titre), A + ' : bouton Bookmap grisé, infobulle : « ' + b.titre.slice(0, 70) + '… »');
  await p.evaluate(() => document.querySelector('.tpv [data-bookmap]').click()); await w(500);
  verif(await p.evaluate(() => { const e = window.__tpVolume.appel('bookmap'); return !e || !e.enMarche; }), A + ' : un clic sur le bouton grisé ne lance rien');
}
/* 2. mémoire : enregistrer 20 s sur BTC, recharger, retrouver la carte */
verif(await ouvrirVolume('BTC'), 'BTC : Volume chargé');
await p.evaluate(() => document.querySelector('.tpv [data-bookmap]').click());
verif(await attendre(() => p.evaluate(() => { const b = window.__tpVolume.appel('bookmap'); return b && b.mid > 0 && b.flux && b.flux.carnet === 'connecte'; }), 40000), 'BTC : Bookmap en direct'); await w(20000);
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').sauvegarder(true)); await w(1500);
const avant = await p.evaluate(() => window.__tpVolume.appel('bookmap')); verif(avant.sauvees >= 10, 'BTC : ' + avant.sauvees + ' colonnes écrites');
verif(await ouvrirVolume('BTC'), 'BTC : après rechargement, Volume chargé');
await p.evaluate(() => document.querySelector('.tpv [data-bookmap]').click());
verif(await attendre(() => p.evaluate(() => { const b = window.__tpVolume.appel('bookmap'); return b && b.mid > 0; }), 40000), 'BTC : Bookmap en direct après rechargement'); await w(3000);
const apres = await p.evaluate(() => window.__tpVolume.appel('bookmap')); console.log('  après rechargement :', JSON.stringify({ relues: apres.relues, colonnes: apres.colonnes, couvertureMs: apres.couvertureMs }));
verif(apres.relues >= 10, 'la carte de la visite précédente est relue : ' + apres.relues + ' colonnes');
verif(apres.couvertureMs > 25000, 'la couverture dépasse la durée de la visite en cours : ' + Math.round(apres.couvertureMs / 1000) + ' s');
await p.evaluate(() => window.__tpVolume.appel('bookmapObjet').dessiner()); await capture('bookmap-reprise');
await fin();
