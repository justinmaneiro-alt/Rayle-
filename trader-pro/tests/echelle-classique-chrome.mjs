/* Échelle du Classique après des allers-retours Classique / Volume (v12). Usage : node trader-pro/tests/echelle-classique-chrome.mjs [tablette|pc|tel] [OR] [H4] [allers-retours] */
import { lancer, w } from './aide-chrome.mjs';
const vue = process.argv[2] || 'tablette', A = process.argv[3] || 'OR', U = process.argv[4] || 'H4', N = +(process.argv[5] || 3);
const T = await lancer(vue, { dossierCaptures: 'donnees-privees/captures-v12', vraiNavigateur: true, stockage: { rayle_donnees_base: '', rayle_piper_precharge: '0' } }), { p, verif, attendre, capture, fin } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + A, { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 90000), 'terminal monté'); await w(3000);
const mesure = () => p.evaluate(() => { const g = window.__orPro.graphe(), m = g.mesureVue(), P = g.chart().priceScale('right').options(); return { n: m.n, droiteVide: +m.droiteVide.toFixed(1), occupe: +m.occupe.toFixed(2), dedans: m.dedans, cassee: g.vueCassee(m), auto: P.autoScale }; });
const bon = m => !m.cassee && m.occupe >= 0.3 && m.droiteVide <= 12 && m.droiteVide >= -2 && m.dedans && m.auto !== false;
const choisir = async u => { await p.evaluate(x => { const b = document.querySelector('[data-periode="' + x + '"]'); if (b) b.click(); }, u); await attendre(() => p.evaluate(x => { const S = window.__or.moteur.S; return S.periode === x && !S.chargement && S.k.length > 50; }, u), 90000); await w(2500); };
await choisir(U); let m = await mesure(); console.log('départ', JSON.stringify(m)); verif(bon(m), 'échelle correcte au chargement'); await capture('echelle-0');
for (let k = 1; k <= N; k++) {
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
  await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && e.charge; }), 90000); await w(2500);
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="classique"]').click()); await w(2500);
  m = await mesure(); console.log('retour ' + k, JSON.stringify(m)); verif(bon(m), 'échelle correcte au retour ' + k);
  const autre = U === 'J' ? 'H4' : 'J'; if (k === 2) { await choisir(autre); m = await mesure(); verif(bon(m), 'échelle correcte après changement d’unité'); await choisir(U); }
}
await capture('echelle-1'); await fin();
