/* Test Chrome v7 : US100 et US500 au comptant (comme XTB) dans les DEUX modes, écart réel avec les futures affiché en petit, mêmes prix en Classique et en Volume.
   Données de production (branche donnees). Usage : node trader-pro/tests/indices-v7-chrome.mjs [pc|tablette|tel] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc';
const T = await lancer(mode, { stockage: { rayle_donnees_base: 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/' } }), { p, verif, attendre, fin } = T;
const nb = s => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
for (const [A, ref] of [['NASDAQ', 25028.98], ['SP500', 6910.39]]) {
  await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await attendre(() => p.evaluate(() => !!window.__tpVolume), 60000); await attendre(() => p.evaluate(() => /\d/.test((document.querySelector('[data-or-prix]') || {}).innerText || '')), 30000); await w(3000);
  const cl = await p.evaluate(() => ({ prix: (document.querySelector('[data-or-prix]') || {}).innerText, ecart: (document.querySelector('[data-tp-ecart]') || {}).innerText || '' }));
  console.log('  ' + A + ' Classique :', JSON.stringify(cl));
  verif(Math.abs(nb(cl.prix) / ref - 1) < 0.002, A + ' Classique = dernière clôture officielle de l’indice (' + ref + ') : ' + cl.prix);
  verif(/futures (NQ|ES) .* : [+−]\d+,\d\d % vs comptant/.test(cl.ecart), A + ' Classique : écart futures en petit : ' + cl.ecart);
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
  await attendre(() => p.evaluate(() => { try { const e = window.__tpVolume.etat(); return e && e.charge && e.ecart; } catch (x) { return false; } }), 60000); await w(1500);
  const v = await p.evaluate(() => { const e = window.__tpVolume.etat(); return { dernier: e.dernier, bougies: e.bougies, avecVolume: e.avecVolume, ecart: e.ecart, badge: e.badge }; });
  console.log('  ' + A + ' Volume :', JSON.stringify(v));
  verif(Math.abs(v.dernier / ref - 1) < 0.002, A + ' Volume : prix au comptant ' + v.dernier + ' (indice ' + ref + ')');
  verif(Math.abs(v.dernier / nb(cl.prix) - 1) < 0.003, A + ' : Classique et Volume identiques à 0,3 %');
  verif(v.avecVolume > v.bougies * 0.3, A + ' Volume : volume des futures rattaché aux bougies (' + v.avecVolume + ' / ' + v.bougies + ')');
  verif(/comptant/.test(v.badge) && /vs comptant/.test(v.badge), A + ' Volume : badge avec écart : ' + v.badge);
  verif(v.ecart && v.ecart.ecart > -0.01 && v.ecart.ecart < 0.015, A + ' : écart futures/comptant plausible : ' + (v.ecart && (v.ecart.ecart * 100).toFixed(2)) + ' %');
}
await fin();
