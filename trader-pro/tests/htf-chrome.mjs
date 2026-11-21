/* Test Chrome v7 phase 2 : onglet « Bougies HTF / ICT » (bougies en grand). Prérequis : node serveur.mjs 8000. Usage : node trader-pro/tests/htf-chrome.mjs [pc|tablette|tel] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc';
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v7' }), { p, verif, attendre, capture, fin } = T;
for (const [actif, nom] of [['OR', 'or'], ['NASDAQ', 'us100']]) {
  await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1&actif=' + actif, { waitUntil: 'domcontentloaded', timeout: 90000 });
  verif(await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 60000), nom + ' : terminal monté');
  await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
  await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && e.charge; }), 40000);
  const e0 = await p.evaluate(() => window.__tpVolume.etat()); verif(e0 && e0.actif === nom, nom + ' : le Volume suit l actif du terminal (' + (e0 && e0.actif) + ')');
  verif(await p.evaluate(() => { const s = document.querySelector('.tpv [data-actif]'); return getComputedStyle(s).display === 'none'; }), nom + ' : un seul sélecteur d actif (celui du Volume est masqué)');
  await p.evaluate(() => { const b = document.querySelector('.tpv [data-onglet="ict"]'); if (b) b.click(); });
  await attendre(() => p.evaluate(() => { const l = document.querySelector('.tpv [data-lecture]'); return l && !/en cours/.test(l.innerText); }), 40000); await w(800);
  const info = await p.evaluate(() => { const cv = document.querySelector('[data-htf-cv]'); return { present: !!cv, h: cv ? cv.clientHeight : 0, proche: (document.querySelector('[data-htf-proche]') || {}).innerText || '', lecture: (document.querySelector('.tpv [data-lecture]') || {}).innerText || '' }; });
  verif(info.present && info.h >= 280, nom + ' : bougies en grand (hauteur ' + info.h + ')'); verif(/Support le plus proche|Résistance la plus proche/.test(info.proche), nom + ' : distances : ' + info.proche.replace(/\n/g, ' | '));
  await capture('htf-' + nom + '-' + mode);
  /* nombre 3 / 5 et bascule Daily / Monthly sans erreur */
  for (const [sel, val] of [['[data-htf-n]', '5'], ['[data-htf]', 'J'], ['[data-htf]', 'M'], ['[data-htf]', 'S']]) { await p.evaluate(([s, v]) => { const x = document.querySelector(s); x.value = v; x.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, val]); await w(700); }
  const ok2 = await p.evaluate(() => { const cv = document.querySelector('[data-htf-cv]'); return cv.width > 0; }); verif(ok2, nom + ' : bascule Daily / Monthly / Weekly');
}
await fin();
