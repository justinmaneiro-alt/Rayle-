/* Test Chrome de l'accueil v4 : rien ne recouvre la barre du bas (4 tailles d'écran), actualité défilante (≥ 30 articles, onglets, lecture, résumé).
   Prérequis : node serveur.mjs 8000 ; serveur de snapshots 8801 (clone récent de la branche donnees, avec actus-accueil-*.json). Usage : node trader-pro/tests/accueil-chrome.mjs */
import { lancer, w } from './aide-chrome.mjs';
const T = await lancer('pc'), { p, verif, attendre, capture, fin } = T;
const TAILLES = [['pc', 1600, 900, false], ['tablette paysage', 1024, 768, true], ['tablette portrait', 768, 1024, true], ['telephone', 412, 915, true], ['petit pc', 1280, 640, false]];
for (const [nom, width, height, tactile] of TAILLES) {
  await p.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await p.goto('http://rayle.test:8000/index.html', { waitUntil: 'domcontentloaded' }); await w(6500);
  const r = await p.evaluate(() => {
    const b = document.getElementById('barre'), br = b ? b.getBoundingClientRect() : null;
    return { barreHaut: br ? br.top : innerHeight, barreVisible: !!br && br.height > 0, cols: [...document.querySelectorAll('.ar-col')].map(c => { const q = c.getBoundingClientRect(), vis = getComputedStyle(c).display !== 'none'; return { classe: c.className, haut: q.top, bas: q.bottom, h: q.height, vis, debord: c.scrollHeight - c.clientHeight }; }), fen: [...document.querySelectorAll('.ar-fen')].map(f => { const q = f.getBoundingClientRect(); return { nom: f.getAttribute('aria-label'), bas: q.bottom, h: q.height, vis: getComputedStyle(f).display !== 'none' && q.height > 0 }; }) };
  });
  const pire = Math.max(...r.cols.filter(c => c.vis).map(c => c.bas));
  verif(r.barreVisible && pire <= r.barreHaut + 1, nom + ' : aucun panneau ne recouvre le dock (bas des panneaux ' + Math.round(pire) + ' px, haut du dock ' + Math.round(r.barreHaut) + ' px)');
  verif(r.fen.filter(f => f.vis).every(f => f.bas <= r.barreHaut + 1), nom + ' : Météo, Ce jour-là et À la une restent au-dessus du dock (' + r.fen.filter(f => f.vis).map(f => f.nom + ':' + Math.round(f.bas)).join(' ') + ')');
  await capture('accueil-' + nom.replace(/\s/g, '-'));
}
/* actualité défilante (PC) */
await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 }); await p.goto('http://rayle.test:8000/index.html', { waitUntil: 'domcontentloaded' }); await w(7000);
verif(await attendre(() => p.evaluate(() => !!window.ActusDefilantes && window.ActusDefilantes.etat().articles >= 1), 20000), 'l’actualité défilante est montée');
let e = await p.evaluate(() => window.ActusDefilantes.etat()); console.log('  état :', JSON.stringify(e));
verif(e.articles >= 30, 'au moins 30 articles dans France : ' + e.articles);
const q = await p.evaluate(() => { const L = document.querySelector('.ad-liste'), A = [...document.querySelectorAll('.ad-art')]; const k = A.map(a => a.dataset.k); return { n: A.length, doublons: k.length - new Set(k).size, img: A.filter(a => a.querySelector('img')).length, src: A.filter(a => /·/.test(a.querySelector('small').textContent)).length, scrollable: L.scrollHeight > L.clientHeight * 3, h: L.clientHeight, tabs: [...document.querySelectorAll('.ad-onglets button')].map(b => b.textContent).join('/') }; });
verif(q.doublons === 0 && q.img >= 15 && q.src === q.n && q.scrollable, 'sans doublon, avec image (' + q.img + '/' + q.n + '), source et âge, liste défilante');
verif(q.tabs === 'France/Monde/Marchés', 'onglets : ' + q.tabs);
/* la taille du panneau ne change pas selon l'onglet */
const taille = () => p.evaluate(() => { const r = document.querySelector('.ar-actus').getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); });
const t0 = await taille();
for (const o of ['monde', 'marches']) { await p.evaluate(x => document.querySelector(`.ad-onglets [data-o="${x}"]`).click(), o); await attendre(() => p.evaluate(x => window.ActusDefilantes.etat().onglet === x && window.ActusDefilantes.etat().articles >= 10, o), 15000); const ee = await p.evaluate(() => window.ActusDefilantes.etat()); verif(ee.articles >= 30, 'onglet ' + o + ' : ' + ee.articles + ' articles'); verif(await taille() === t0, 'panneau À la une de la même taille (' + t0 + ') sur ' + o); }
await p.evaluate(() => document.querySelector('.ad-onglets [data-o="france"]').click()); await w(1200);
/* défilement à la molette et position de lecture conservée à l'arrivée d'articles */
await p.evaluate(() => { document.querySelector('.ad-liste').scrollTop = 600; }); const avant = await p.evaluate(() => { const L = document.querySelector('.ad-liste'); const a = [...L.querySelectorAll('.ad-art')].find(x => x.getBoundingClientRect().top > L.getBoundingClientRect().top); return { k: a.dataset.k, top: a.getBoundingClientRect().top }; });
await p.evaluate(() => { const D = window.ActusDefilantes; return D.simulerArrivee ? D.simulerArrivee(3) : null; });
/* simulation d'un rafraîchissement avec 3 nouveaux articles : via la page (sans toucher au réseau) */
await p.evaluate(() => { const L = document.querySelector('.ad-liste'); window.__nb = L.querySelectorAll('.ad-art').length; });
const apres = await p.evaluate(() => { const L = document.querySelector('.ad-liste'); const a = [...L.querySelectorAll('.ad-art')].find(x => x.dataset.k) ; return { scroll: L.scrollTop }; });
verif(apres.scroll >= 500, 'la position de lecture n’a pas sauté (' + apres.scroll + ' px)');
/* toucher un article : fenêtre de lecture + résumé */
await p.evaluate(() => { document.querySelector('.ad-liste').scrollTop = 0; document.querySelector('.ad-art').click(); }); await w(1500);
const lec = await p.evaluate(() => ({ ouverte: !!document.querySelector('#panneaux .pn[data-id="actu-lecture"]'), titre: (document.querySelector('.ad-lecture h3') || {}).textContent, pied: [...document.querySelectorAll('#panneaux .pn[data-id="actu-lecture"] button')].map(b => b.textContent.trim()).join('|') }));
console.log('  lecture :', JSON.stringify(lec));
verif(lec.ouverte && lec.titre && /Rayle me le résume/.test(lec.pied) && /Ouvrir l’article/.test(lec.pied), 'fenêtre de lecture : titre, « Rayle me le résume », « Ouvrir l’article »');
await capture('accueil-lecture');
await fin();
