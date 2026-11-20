/* Test Chrome v6 du mode Volume (gestes TradingView, légende, panneaux, repli, onglets…). Prérequis : node serveur.mjs 8000 ; accès réseau.
   Usage : node trader-pro/tests/volume-v6-chrome.mjs [tel|tablette|pc] [bloc,bloc…] ; blocs : a1 a2 a3 a4 a5 a6 a7 */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', blocs = (process.argv[3] || 'a1').split(',');
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v6' }), { p, verif, attendre, capture, fin } = T;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro && !!window.__tpVolume), 60000), 'terminal pro monté');
await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
await attendre(() => p.evaluate(() => !!document.querySelector('.tpv [data-actif]')), 30000);
const choisir = async (a, u) => { await p.evaluate(([a, u]) => { const s = document.querySelector('.tpv [data-actif]'); s.value = a; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector(`.tpv [data-unite="${u}"]`).click(); }, [a, u]); await attendre(() => p.evaluate(([a, u]) => { const e = window.__tpVolume.etat(); return e && (e.charge || e.erreur) && e.actif === a && e.unite === u; }, [a, u]), 60000); await w(3500); return p.evaluate(() => window.__tpVolume.etat()); };
const centre = async () => p.evaluate(() => { const r = document.querySelector('.tpv-graph').getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.35, droite: r.right - 25, bas: r.top + r.height * 0.55, w: r.width, h: r.height }; });
const plage = () => p.evaluate(() => { const e = window.__tpVolume.echelle(); return e; });
const prixVisibles = () => p.evaluate(() => window.__tpVolume.echelle().plage);

if (blocs.includes('a1')) {
  let e = await choisir('or', 'H4'); verif(e.charge && e.bougies > 200, 'A1 : or H4 chargé (' + e.bougies + ')');
  const L = await p.evaluate(() => document.querySelector('[data-legende]').innerText); verif(/XAU\/USD|Or|OR/i.test(L) && /O \d/.test(L) && /Vol/.test(L) && /Δ/.test(L), 'A1 : légende OHLC + volume + delta : ' + L.slice(0, 120));
  const c = await centre(); const r0 = await prixVisibles(); verif(r0 && r0.from < r0.to, 'A1 : plage de prix lisible');
  /* glisser vertical à la souris : la plage de prix bouge, l'échelle auto est coupée */
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x - 60, c.y + 90, { steps: 12 }); await p.mouse.up(); await w(400);
  const r1 = await prixVisibles(); verif(r1.from !== r0.from && Math.abs((r1.to - r1.from) - (r0.to - r0.from)) < (r0.to - r0.from) * 0.02, 'A1 : glisser = déplacement vertical libre (plage ' + r0.from.toFixed(1) + ' → ' + r1.from.toFixed(1) + ')');
  verif(await p.evaluate(() => window.__tpVolume.echelle().auto === false), 'A1 : le glisser vertical coupe l\'échelle auto');
  /* molette = zoom horizontal */
  const z0 = await p.evaluate(() => window.__tpVolume.echelle().espace); await p.mouse.move(c.x, c.y); await p.mouse.wheel({ deltaY: -400 }); await w(400); const z1 = await p.evaluate(() => window.__tpVolume.echelle().espace); verif(z1 > z0, 'A1 : molette = zoom horizontal (' + z0.toFixed(1) + ' → ' + z1.toFixed(1) + ')');
  /* axe des prix : étirer en hauteur */
  const r2 = await prixVisibles(); await p.mouse.move(c.droite, c.y); await p.mouse.down(); await p.mouse.move(c.droite, c.y - 80, { steps: 10 }); await p.mouse.up(); await w(300); const r3 = await prixVisibles(); verif(Math.abs((r3.to - r3.from) - (r2.to - r2.from)) > (r2.to - r2.from) * 0.05, 'A1 : glisser sur l\'axe des prix change la hauteur');
  /* double clic sur l'axe = retour auto */
  await p.mouse.click(c.droite, c.y, { clickCount: 2 }); await w(500); verif(await p.evaluate(() => window.__tpVolume.echelle().auto === true), 'A1 : double clic sur l\'axe des prix = retour à l\'échelle auto');
  /* bouton « » » : apparaît quand on s'éloigne de la dernière bougie, ramène à la fin */
  await p.evaluate(() => window.__tpVolume.zoomer(60, 80)); await w(500); verif(await p.evaluate(() => !document.querySelector('[data-temps-reel]').hidden), 'A1 : bouton « » » visible loin du direct');
  await p.evaluate(() => document.querySelector('[data-temps-reel]').click()); await w(600); verif(await p.evaluate(() => document.querySelector('[data-temps-reel]').hidden), 'A1 : « » » ramène à la dernière bougie');
  /* panneaux masquables */
  await p.evaluate(() => { const c = document.querySelector('[data-opt="pMfi"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(300); verif(await p.evaluate(() => window.__tpVolume.etat().panneaux === 3), 'A1 : panneau MFI masquable sans erreur');
  await capture('a1-or-h4');
}

if (blocs.includes('a2')) {
  const lst = (process.argv[4] || 'btc,sol,or,us100,us500,eurusd').split(','), us = (process.argv[5] || 'J,H4,H1').split(',');
  for (const a of lst) for (const u of us) {
    const e = await choisir(a, u); const ok = e.charge && !e.erreur; verif(ok, 'A2 ' + a + ' ' + u + ' : chargé sans erreur' + (e.erreur ? ' (' + e.erreur + ')' : ''));
    if (!ok) continue; await w(5000);
    const d = await p.evaluate(() => ({ B: window.__tpVolume.barres(), c: window.__tpVolume.controle(), n: document.querySelector('[data-att]').hidden })); const B = d.B;
    const pas = { H1: 3600e3, H4: 14400e3, J: 86400e3 }[u]; let maxSaut = 0, trous = 0; for (let i = 1; i < B.length; i++) { maxSaut = Math.max(maxSaut, Math.abs(B[i].o / B[i - 1].c - 1)); if ((a === 'btc' || a === 'sol') && B[i].t - B[i - 1].t > 3 * pas) trous++; }
    console.log('  ' + a + ' ' + u + ' : ' + B.length + ' bougies, du ' + new Date(B[0].t).toISOString().slice(0, 10) + ' au ' + new Date(B[B.length - 1].t).toISOString().slice(0, 10) + ', dernier ' + B[B.length - 1].c.toFixed(2) + ', saut max ' + (maxSaut * 100).toFixed(1) + ' %, longues ' + B.filter(b => b.long).length + ', raccord ' + JSON.stringify(d.c.raccord) + ', source ' + d.c.source + (d.c.repli ? ' REPLI ' + d.c.repli : ''));
    verif(B.length > 200, 'A2 ' + a + ' ' + u + ' : plus de 200 bougies'); verif(maxSaut < 0.3, 'A2 ' + a + ' ' + u + ' : aucun saut de plus de 30 % (' + (maxSaut * 100).toFixed(1) + ' %)'); verif(trous === 0, 'A2 ' + a + ' ' + u + ' : aucun trou de plus de 2 bougies sur crypto (' + trous + ')'); verif(d.n, 'A2 ' + a + ' ' + u + ' : plus d écran de chargement');
    await capture('a2-' + a + '-' + u);
  }
}
await fin();
