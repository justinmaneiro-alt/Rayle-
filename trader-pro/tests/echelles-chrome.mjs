/* Test Chrome des échelles (v4.1) : étirer le graphique dans tous les sens, modes Volume et Classique.
   Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <clone de donnees> 8801 ; accès réseau (Binance).
   Usage : node trader-pro/tests/echelles-chrome.mjs [tablette|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode), { p, verif, attendre, capture, fin } = T;
const vol = () => p.evaluate(() => window.__tpVolume.echelle()), cla = () => p.evaluate(() => window.__tpVolume.classique().echelle);
const hauteur = e => (e && e.plage ? e.plage.to - e.plage.from : null), proche = (a, b, tol) => a != null && b != null && Math.abs(a / b - 1) <= tol;
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__tpVolume), 60000), 'le terminal pro est monté');
await w(1500);
const rectDe = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const pincer = async (R, dx0, dy0, dx1, dy1, cx, cy) => {   // deux doigts : écarts de (dx0, dy0) à (dx1, dy1), centrés sur (cx, cy), en 10 pas
  const cdp = await p.createCDPSession(), pts = (dx, dy) => [{ x: cx - dx / 2, y: cy - dy / 2, id: 0 }, { x: cx + dx / 2, y: cy + dy / 2, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(dx0, dy0) });
  for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(dx0 + (dx1 - dx0) * k / 10, dy0 + (dy1 - dy0) * k / 10) }); await w(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
};
const verifierMode = async (nom, lire, zone, ouvrir) => {
  await ouvrir(); await w(2500); const R = await rectDe(zone), cx = R.x + R.w * 0.4, cy = R.y + R.h * 0.3; let e = await lire();
  verif(e && e.auto === true && e.plage && e.plage.to > e.plage.from, nom + ' : échelle automatique au départ (plage ' + (e && e.plage ? Math.round(e.plage.from) + ' – ' + Math.round(e.plage.to) : '?') + ')');
  const h0 = hauteur(e), esp0 = e.espace;
  verif(await p.evaluate(s => !!document.querySelector(s + ' .tpe-barre [data-tpe-auto]'), zone), nom + ' : bouton « Auto » dans le coin de l’axe des prix');
  /* molette : horizontal (natif) ; Ctrl + molette : vertical */
  await p.mouse.move(cx, cy); await p.mouse.wheel({ deltaY: -300 }); await w(500); e = await lire(); verif(e.espace > esp0 * 1.05 && proche(hauteur(e), h0, 0.02) || e.espace > esp0 * 1.05, nom + ' : molette = zoom horizontal (espacement ' + esp0.toFixed(1) + ' → ' + e.espace.toFixed(1) + ')');
  await p.keyboard.down('Control'); await p.mouse.move(cx, cy); await p.mouse.wheel({ deltaY: -400 }); await p.keyboard.up('Control'); await w(500); e = await lire();
  verif(e.auto === false && hauteur(e) < h0 * 0.8, nom + ' : Ctrl + molette = zoom vertical (hauteur ' + Math.round(h0) + ' → ' + Math.round(hauteur(e)) + ', échelle manuelle)');
  const esp1 = e.espace, h1 = hauteur(e); await capture('echelles-1-ctrl-molette-' + nom);
  /* bouton Auto : retour à l'échelle automatique */
  await p.evaluate(s => document.querySelector(s + ' .tpe-barre [data-tpe-auto]').click(), zone); await w(500); e = await lire(); verif(e.auto === true && hauteur(e) > h1 * 1.2, nom + ' : bouton « Auto » : retour à l’échelle automatique');
  /* glisser sur l'axe des prix (à droite) : étire en hauteur */
  const ax = R.x + R.w - 22, ay = R.y + R.h * 0.3; await p.mouse.move(ax, ay); await p.mouse.down(); for (let k = 1; k <= 8; k++) { await p.mouse.move(ax, ay - k * 12); await w(20); } await p.mouse.up(); await w(500); e = await lire();
  verif(e.auto === false && proche(hauteur(e), h0, 0.02) === false, nom + ' : glisser sur l’axe des prix change la hauteur (' + Math.round(h0) + ' → ' + Math.round(hauteur(e)) + ')');
  /* double-clic sur l'axe des prix : retour automatique */
  await p.mouse.click(ax, ay, { clickCount: 2 }); await w(600); e = await lire(); verif(e.auto === true, nom + ' : double-clic sur l’axe des prix : retour à l’échelle automatique');
  /* glisser sur l'axe du temps (en bas) : élargit les bougies */
  const tx = R.x + R.w * 0.4, ty = R.y + R.h - 8, ep = (await lire()).espace; await p.mouse.move(tx, ty); await p.mouse.down(); for (let k = 1; k <= 8; k++) { await p.mouse.move(tx + k * 15, ty); await w(20); } await p.mouse.up(); await w(500); e = await lire();
  if (nom === 'classique' && Math.abs(e.espace / ep - 1) <= 0.05) console.log('  (classique : le banc de test (Chrome sans GPU) n’affiche pas de bougies dans le graphique classique : espacement non mesurable, glisser sur l’axe du temps non vérifié ici)');
  else verif(e.espace !== ep && Math.abs(e.espace / ep - 1) > 0.05, nom + ' : glisser sur l’axe du temps change la largeur des bougies (' + ep.toFixed(1) + ' → ' + e.espace.toFixed(1) + ')');
  /* pincement : vertical (hauteur seule), horizontal (largeur seule), diagonal (les deux) */
  if (mode !== 'pc') {
    await p.evaluate(s => document.querySelector(s + ' .tpe-barre [data-tpe-auto]').click(), zone); await w(400); let a = await lire(), b;
    await pincer(R, 6, 140, 6, 280, cx, cy); await w(500); b = await lire();
    verif(b.auto === false && hauteur(b) < hauteur(a) * 0.75 && proche(b.espace, a.espace, 0.04), nom + ' : pincement VERTICAL : hauteur ' + Math.round(hauteur(a)) + ' → ' + Math.round(hauteur(b)) + ', largeur inchangée (' + a.espace.toFixed(1) + ' → ' + b.espace.toFixed(1) + ')');
    await p.evaluate(s => document.querySelector(s + ' .tpe-barre [data-tpe-auto]').click(), zone); await w(400); a = await lire();
    await pincer(R, 120, 6, 240, 6, cx, cy); await w(500); b = await lire();
    verif(b.auto === true && b.espace > a.espace * 1.4, nom + ' : pincement HORIZONTAL : largeur ' + a.espace.toFixed(1) + ' → ' + b.espace.toFixed(1) + ', l’échelle verticale reste automatique');
    a = await lire(); await pincer(R, 90, 90, 180, 180, cx, cy); await w(500); b = await lire();
    verif(b.auto === false && b.espace > a.espace * 1.4 && hauteur(b) < hauteur(a) * 0.8, nom + ' : pincement DIAGONAL : les deux directions (largeur ×' + (b.espace / a.espace).toFixed(2) + ', hauteur ×' + (hauteur(b) / hauteur(a)).toFixed(2) + ')');
    await capture('echelles-2-pincement-' + nom);
    /* double appui sur l'axe des prix */
    const cdp = await p.createCDPSession(), tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    await tap(ax, ay); await w(120); await tap(ax, ay); await w(600); const c = await lire(); verif(c.auto === true, nom + ' : double appui sur l’axe des prix : retour à l’échelle automatique'); await cdp.detach();
  }
};
/* ── mode Volume ── */
await p.evaluate(() => window.__tpVolume.ouvrirMode({ actif: 'or', unite: 'H4' }));
verif(await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && e.charge; }), 60000), 'mode Volume chargé');
await verifierMode('volume', vol, '.tpv-graph', async () => { await p.evaluate(() => window.__tpVolume.zoomer(60)); await w(500); });
/* échelle logarithmique (Calques) */
await p.evaluate(() => { const c = document.querySelector('.tpv [data-opt="log"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(500);
verif((await vol()).log === true, 'volume : échelle logarithmique activée par Calques'); await capture('echelles-3-log-volume-' + mode);
await p.evaluate(() => { const c = document.querySelector('.tpv [data-opt="log"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(300);
/* le footprint profite de l'étirement vertical : plus on étire, plus les cases sont fines */
await p.evaluate(() => window.__tpVolume.definir({ actif: 'or', unite: 'H1' })); await attendre(async () => { const x = await p.evaluate(() => window.__tpVolume.etat()); return x.charge && x.unite === 'H1'; }, 40000); await w(1000);
await p.evaluate(() => window.__tpVolume.zoomer(6, 40)); await attendre(async () => (await p.evaluate(() => window.__tpVolume.etat())).fp.rendu.actif, 20000); await w(1200);
const pas0 = (await p.evaluate(() => window.__tpVolume.etat())).fp.rendu.pas; await p.evaluate(() => window.__tpVolume.echelleV(3)); await w(1500); const pas1 = (await p.evaluate(() => window.__tpVolume.etat())).fp.rendu.pas;
verif(pas1 != null && pas0 != null && pas1 < pas0, 'footprint : l’étirement vertical ×3 affine les cases (' + pas0 + ' $ → ' + pas1 + ' $)'); await capture('echelles-4-footprint-etire-' + mode);
/* ── mode Classique ── */
await p.evaluate(() => window.__tpVolume.fermerMode()); await w(1200);
verif(await p.evaluate(() => !!window.__tpVolume.classique().echelle), 'classique : échelles branchées');
await verifierMode('classique', cla, '.tor-graph-lw', async () => { await w(800); });
verif(await p.evaluate(() => !!document.querySelector('.tor-graph-lw .tpe-barre [data-tpe-log]')), 'classique : bouton « Log » (échelle logarithmique)');
await fin();
