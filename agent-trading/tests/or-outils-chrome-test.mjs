/* Test Chrome des OUTILS DE DESSIN de l'or (terminal-outils.js) : barre compacte, dessin de chaque outil à la souris, position en lignes
   avec une seule étiquette, déplacement à la souris, édition, suppression, persistance IndexedDB après rechargement, export / import,
   niveaux proposés (confirmer / supprimer), anciennes flèches masquées par défaut, MA200 ; puis, avec des bougies H1 REJOUÉES une à une
   (horloge injectée) : alertes sur chaque type d'objet, flèches v10 et croix jamais déplacées (non-repeint), registre en ajout seul,
   anti-doublon, pauses de l'interface < 0,8 s. Prérequis : node serveur.mjs 8011.  Usage : node agent-trading/tests/or-outils-chrome-test.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011';
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m, d ? '· ' + d : ''); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
const H = 3600e3;

async function ouvrir(p, init) {
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|status of 404|Telegram/i.test(m.text())) erreurs.push('console : ' + m.text().slice(0, 160)); });
  if (init) await p.evaluateOnNewDocument(init);
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.outils && window.__or.outils.E.pret && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 90000 });
  await w(800);
}

/* ═══ 1. dessin avec les vraies données ═══ */
const ctx = await nav.createBrowserContext(), p = await ctx.newPage(); await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
await ouvrir(p, () => { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); });
const def = await p.evaluate(() => { const T = window.__or, c = T.graph.couches(); return { boutons: [...document.querySelectorAll('[data-outil]')].map(b => b.dataset.outil), aimant: !!document.querySelector('[data-o="aimant"]'), ancienPos: !!document.querySelector('[data-a="position"]'), fleches: c.fleches, sr: c.sr, liq: c.liquidite, bilan: document.querySelector('[data-bilan-fleches]').hidden, marques: T.graph.marquesAffichees().filter(m => m.shape && m.shape.startsWith('arrow')).length, regl: T.outils.regl }; });
verifier(def.boutons.join() === 'horizontale,zone,tendance,rayon,position' && def.aimant && !def.ancienPos, 'barre compacte : ligne, zone, tendance, rayon, position, aimant (l’ancien bouton Position à blocs a disparu)');
verifier(def.fleches === false && def.bilan && def.marques === 0, 'anciennes flèches v1-v9 masquées par défaut (case « anciennes flèches » décochée)');
verifier(def.sr === false && def.liq === false && def.regl.niveauxAuto === false, 'niveaux automatiques détaillés masqués par défaut');
await p.evaluate(() => window.__or.outils.regler({ aimant: false }));
const box = await p.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(), h = window.__or.graph.chart().panes()[0].getHeight(); return { x: r.left, y: r.top, w: r.width, h }; });
const X = f => box.x + box.w * f, Y = f => box.y + box.h * f;
const prixA = f => p.evaluate(y => window.__or.graph.serie().coordinateToPrice(y), box.h * f);
async function dessiner(type, pts) { await p.click(`[data-outil="${type}"]`); for (const [fx, fy] of pts) { await p.mouse.click(X(fx), Y(fy)); await w(120); } await w(300); }
await dessiner('horizontale', [[0.5, 0.3]]);
await dessiner('zone', [[0.5, 0.62], [0.5, 0.66]]);
await dessiner('tendance', [[0.3, 0.8], [0.55, 0.7]]);
await dessiner('rayon', [[0.35, 0.2], [0.5, 0.25]]);
await dessiner('position', [[0.75, 0.45], [0.75, 0.55], [0.75, 0.25]]);
const d1 = await p.evaluate(() => { const T = window.__or, O = T.outils.E.objets; return { types: O.map(o => o.type), pos: O.find(o => o.type === 'position'), cadres: T.graph.outilsCadres(), pH: O.find(o => o.type === 'horizontale').p, txt: document.querySelector('[data-mo-liste]').textContent }; });
const p30 = await prixA(0.3);
verifier(d1.types.join() === 'horizontale,zone,tendance,rayon,position', 'les cinq outils dessinés à la souris', d1.types.join());
verifier(Math.abs(d1.pH - p30) < 1, 'ligne horizontale posée au prix cliqué', `${d1.pH} ≈ ${p30.toFixed(2)}`);
verifier(d1.cadres.filter(c => c.sorte === 'objet').length === 5, 'chaque objet est tracé sur le graphique');
const posLib = await p.evaluate(() => document.querySelector('[data-mo-liste]').textContent);
verifier(d1.pos && d1.pos.stop < d1.pos.entree && /Achat · Entrée [\d  ]+ · SL [\d  ]+ · TP [\d  ]+ · R [\d,]+ · risque 50 \$ · taille [\d,]+ contrats \(1 oz\)/.test(posLib), 'position : achat déduit du stop au-dessous, étiquette unique « Entrée · SL · TP · R · risque · taille (1 oz) », risque 0,5 % de 10 000 $', (posLib.match(/Achat[^]*?oz\)/) || [''])[0]);
const pc = d1.cadres.find(c => c.ys); verifier(pc && Object.keys(pc.ys).sort().join() === 'entree,objectif,stop', 'position : trois fines lignes (entrée, stop, objectif), aucun bloc de couleur');
// infobulle au survol d'un objet
{ const c0 = d1.cadres.find(c => c.sorte === 'objet'); await p.mouse.move(X(0.2), box.y + c0.y); await w(400);
  const tip = await p.evaluate(() => { const t = document.querySelector('.tor-info'); return t && !t.hidden ? t.innerText : ''; });
  verifier(/Niveau [\d  ,]+/.test(tip) && /Support \/ résistance/.test(tip) && /tant que Rayle est ouvert/.test(tip), 'au survol d’un objet : infobulle (nom, prix, surveillance)', tip.replace(/\n/g, ' · ')); await p.mouse.move(X(0.2), Y(0.95)); }
// déplacement à la souris de la ligne horizontale
const id0 = await p.evaluate(() => window.__or.outils.E.objets[0].id), yL = d1.cadres.find(c => c.id === id0).y;
await p.mouse.move(X(0.4), box.y + yL); await p.mouse.down(); await p.mouse.move(X(0.4), box.y + yL + 15, { steps: 4 }); await p.mouse.move(X(0.4), box.y + yL + 40, { steps: 6 }); await p.mouse.up(); await w(400);
const d2 = await p.evaluate(() => window.__or.outils.E.objets[0]); const pNouv = await p.evaluate(y => window.__or.graph.serie().coordinateToPrice(y), yL + 40);
verifier(d2.p < d1.pH && Math.abs(d2.p - pNouv) < 1 && d2.modifie > 0, 'ligne déplacée à la souris (la surveillance repart de la modification)', `${d1.pH} → ${d2.p}`);
// déplacement du stop de la position (sens recalculé)
const posC = (await p.evaluate(() => window.__or.graph.outilsCadres())).find(c => c.ys);
await p.mouse.move(X(0.9), box.y + posC.ys.stop); await p.mouse.down(); await p.mouse.move(X(0.9), box.y + posC.ys.stop - 10, { steps: 3 }); await p.mouse.move(X(0.9), box.y + posC.ys.entree - 60, { steps: 8 }); await p.mouse.up(); await w(400);
const d3 = await p.evaluate(() => { const o = window.__or.outils.E.objets.find(o => o.type === 'position'); return { o, txt: document.querySelector('[data-mo-liste]').textContent }; });
verifier(d3.o.stop > d3.o.entree && /Vente · Entrée/.test(d3.txt), 'stop glissé au-dessus de l’entrée : la position devient une vente');
// édition : prix, étiquette, couleur, épaisseur, alerte ; suppression
const idZ = await p.evaluate(() => window.__or.outils.E.objets.find(o => o.type === 'zone').id);
await p.evaluate(id => window.__or.outils.selectionner(id), idZ); await w(150);
await p.evaluate(() => { const ed = document.querySelector('[data-ed]'), s = (k, v) => { const i = ed.querySelector(`[data-c="${k}"]`); if (i.type === 'checkbox') i.checked = v; else i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }; s('etiquette', 'Ma zone'); });
await w(200); await p.evaluate(() => { const ed = document.querySelector('[data-ed]'), i = ed.querySelector('[data-c="couleur"]'); i.value = '#ff8800'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(200);
await p.evaluate(() => { const ed = document.querySelector('[data-ed]'), i = ed.querySelector('[data-c="epaisseur"]'); i.value = '2'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(200);
await p.evaluate(() => { const ed = document.querySelector('[data-ed]'), i = ed.querySelector('[data-c="alerte"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(200);
await p.evaluate(() => { const ed = document.querySelector('[data-ed]'), i = ed.querySelector('[data-c="haut"]'); i.value = String(+i.value + 3); i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(300);
const d4 = await p.evaluate(id => window.__or.outils.E.objets.find(o => o.id === id), idZ);
verifier(d4.etiquette === 'Ma zone' && d4.couleur === '#ff8800' && d4.epaisseur === 2 && d4.alerte === true, 'objet modifiable : étiquette, couleur, épaisseur, case « m’alerter »');
const idR = await p.evaluate(() => window.__or.outils.E.objets.find(o => o.type === 'rayon').id);
await p.evaluate(id => window.__or.outils.selectionner(id), idR); await w(100); await p.evaluate(id => window.__or.outils.supprimer(id), idR); await w(300);   // l'ancien bouton « Supprimer » n'existe plus : la suppression à la souris est testée dans suppression-chrome.mjs
verifier(await p.evaluate(id => !window.__or.outils.E.objets.some(o => o.id === id), idR), 'objet supprimé');
// MA200
await p.evaluate(() => window.__or.outils.regler({ ma200: true })); await w(500);
const ma = await p.evaluate(() => window.__or.graph.chart().panes()[0].getSeries().length);
verifier(ma >= 2, 'MA200 : courbe fine ajoutée sur le graphique', `${ma} séries dans le panneau des prix`);
// export
const exp = await p.evaluate(() => { document.querySelector('.tor-ob-aff').open = true; document.querySelector('[data-o="exporter"]').click(); return window.__or.outils.E.dernierExport; });
const J = JSON.parse(exp); verifier(J.format === 'rayle-or-outils-1' && J.objets.length === 4, 'export JSON de mes outils', `${J.objets.length} objets`);
// persistance
const avant = await p.evaluate(() => window.__or.outils.E.objets.map(o => o.id + ':' + (o.p ?? o.haut ?? o.p1 ?? o.entree)).join('|'));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__or && window.__or.outils && window.__or.outils.E.pret, { timeout: 90000 }); await w(500);
const apres = await p.evaluate(() => window.__or.outils.E.objets.map(o => o.id + ':' + (o.p ?? o.haut ?? o.p1 ?? o.entree)).join('|'));
verifier(avant === apres && await p.evaluate(() => window.__or.outils.regl.ma200 === true), 'persistance : objets et réglages retrouvés après rechargement (IndexedDB, appareil seulement)');
// import (dans un profil vide)
const ctx2 = await nav.createBrowserContext(), p2 = await ctx2.newPage(); await p2.setViewport({ width: 1400, height: 850 });
await ouvrir(p2);
const imp = await p2.evaluate(async txt => { const r = await window.__or.outils.importerTexte(txt), mauvais = await window.__or.outils.importerTexte('{pas du json'); return { n: r.objets.length, ids: window.__or.outils.E.objets.map(o => o.id).join('|'), mauvais: mauvais.erreur }; }, exp);
verifier(imp.n === 4 && imp.ids === J.objets.map(o => o.id).join('|') && /illisible/.test(imp.mauvais), 'import JSON : objets retrouvés ; fichier illisible refusé proprement');
await ctx2.close();
await ctx.close();

/* ═══ 2. alertes, flèches v10 et croix avec des bougies H1 rejouées une à une ═══ */
const T0 = Math.floor(Date.now() / H) * H - 400 * H;
function serie() {
  const B = []; let c = 4100;
  const pousse = (o, h, l, cl) => { B.push({ t: T0 + B.length * H, o, h, l, c: cl, v: 1 }); c = cl; };
  for (let i = 0; i < 200; i++) { const o = c, cl = 4100 + (i % 2 ? 3 : -3); pousse(o, Math.max(o, cl) + 4, Math.min(o, cl) - 4, cl); }   // ATR ≈ 10
  pousse(4097, 4098, 4081, 4086);   // 200 : approche + touche de 4080, entrée 4090 traversée
  pousse(4086, 4097, 4085, 4095);   // 201 : rebond confirmé (clôture ≥ 4080 + 1 ATR)
  for (let i = 0; i < 4; i++) pousse(4095, 4104, 4093, 4100);
  pousse(4100, 4113, 4099, 4108);   // 206 : +1 R de la position (4110)
  for (let i = 0; i < 12; i++) pousse(4105, 4110, 4100, 4104);
  pousse(4104, 4105, 4088, 4090); pousse(4090, 4092, 4079, 4083); pousse(4083, 4084, 4060, 4062);   // 219-221 : approche, touche, puis cassure de 4080
  pousse(4062, 4063, 4045, 4048);   // 222 : cassure de la zone 4060-4064, stop 4070 touché
  for (let i = 0; i < 12; i++) pousse(4048, 4053, 4043, 4047);
  return B;
}
const B = serie(), FIN = B.length;
const ctx3 = await nav.createBrowserContext(), q = await ctx3.newPage(); await q.setViewport({ width: 1600, height: 900 });
await q.evaluateOnNewDocument((B, T0, H) => {
  window.__horloge = T0 + 196 * H; window.__k = 196;
  window.__RAYLE_OR_OUTILS_TEST__ = { maintenant: () => window.__horloge, chargerH1: async () => window.__B.slice(0, window.__k), intervalle: 1e9,
    chargerHist: async u => { const P = u === 'H4' ? 4 * H : 24 * H, L = []; for (let i = 0; i < 200; i++) { const m = i === 100 ? 120 : i === 130 ? -120 : 0; L.push({ t: T0 - 200 * P + i * P, o: 4100, h: 4105 + Math.max(0, m), l: 4095 + Math.min(0, m), c: 4100 }); } return { k: L, ref: [] }; } };
  window.__B = B;
  try { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); } catch (e) {}
}, B, T0, H);
await ouvrir(q);
await q.evaluate(() => { window.__longues = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longues.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} });
await q.evaluate(async T0 => {
  const O = window.__or.outils;
  O.regler({ son: true });
  await O.creer('horizontale', { p: 4080, cree: T0, alerte: true });
  await O.creer('zone', { bas: 4060, haut: 4064, cree: T0 });
  await O.creer('tendance', { t1: T0 + 150 * 3600e3, p1: 4079, t2: T0 + 190 * 3600e3, p2: 4080, cree: T0 });
  await O.creer('rayon', { t1: T0 + 150 * 3600e3, p1: 4078, t2: T0 + 190 * 3600e3, p2: 4080, cree: T0 });
  await O.creer('position', { entree: 4090, stop: 4070, objectif: 4140, cree: T0 });
}, T0);
const traces = [];
for (let k = 197; k <= FIN; k++) {
  const r = await q.evaluate(async (k, T0) => { window.__k = k; window.__horloge = T0 + k * 3600e3 + 60e3; const O = window.__or.outils; await O.tour();
    const G = window.__or.graph.outils(); return { fl: G.fleches10.map(f => f.objet + '@' + f.t).sort(), cx: G.croix.map(c => c.objet + '@' + c.t).sort(), reg: O.E.registre.length, al: O.E.alertes.length }; }, k, T0);
  traces.push(r);
}
const nonRepeint = traces.every((r, i) => !i || traces[i - 1].fl.every(f => r.fl.includes(f)) && traces[i - 1].cx.every(c => r.cx.includes(c)));
verifier(nonRepeint, 'bougies rejouées une à une : aucune flèche ni croix déplacée ou retirée (non-repeint)');
verifier(traces.every((r, i) => !i || r.reg >= traces[i - 1].reg), 'registre en ajout seul : il ne diminue jamais');
const fin = await q.evaluate(() => { const O = window.__or.outils, E = O.E, id = t => E.objets.find(o => o.type === t).id;
  const types = t => [...new Set(E.alertes.filter(a => a.objet === id(t)).map(a => a.type))].sort();
  return { h: types('horizontale'), z: types('zone'), tl: types('tendance'), ry: types('rayon'), pos: types('position'), fl: window.__or.graph.outils().fleches10, cx: window.__or.graph.outils().croix, ids: { h: id('horizontale'), z: id('zone') },
    notifs: document.querySelector('[data-notifs-liste]').textContent, panneau: document.querySelector('[data-mo-alertes]').textContent, reg: E.registre.map(e => e.type), suivis: E.suivis.length, bilan: document.querySelector('[data-mo-bilan]').textContent, pire: E.pireTache, etat: document.querySelector('[data-mo-etat]').textContent, marques: window.__or.graph.marquesAffichees().filter(m => String(m.id).startsWith('w')).length }; });
verifier(['approche', 'cassure', 'rebond', 'touche'].every(t => fin.h.includes(t)) && fin.h.includes('alerte'), 'ligne : approche, touche, rebond confirmé, cassure et alerte libre', fin.h.join(', '));
verifier(fin.z.includes('cassure') && fin.z.includes('approche'), 'zone : approche et cassure', fin.z.join(', '));
verifier(fin.tl.includes('touche') && fin.ry.includes('touche'), 'ligne de tendance et rayon : valeur à la bougie courante, touches détectées', `${fin.tl.join(', ')} / ${fin.ry.join(', ')}`);
verifier(['entree', 'plus1R', 'stop'].every(t => fin.pos.includes(t)), 'position : entrée, +1 R (break-even proposé), stop', fin.pos.join(', '));
const flH = fin.fl.filter(f => f.objet === fin.ids.h), cxH = fin.cx.filter(c => c.objet === fin.ids.h);
verifier(flH.length === 1 && flH[0].sens === 'hausse' && flH[0].t === T0 + 201 * H + H - 1, 'une seule flèche verte sur la ligne, posée à la clôture de la bougie de rebond', new Date(flH[0] && flH[0].t + 1).toISOString());
verifier(cxH.length === 1 && cxH[0].t === T0 + 221 * H + H - 1, 'une croix à la cassure confirmée de la ligne (clôture à ≥ 0,5 ATR au-delà)');
verifier(fin.marques >= 1, 'flèches v10 affichées sur le graphique (unité M15)');
verifier(/pas un signal ni une promesse/.test(fin.panneau + fin.notifs) && /rebond confirmé/.test(fin.panneau), 'historique des alertes (objet, type, prix, heure) avec « information de lecture, pas un signal ni une promesse »');
verifier(/tant que Rayle est ouvert/.test(fin.etat), 'il est dit que les alertes fonctionnent tant que Rayle est ouvert');
verifier(fin.reg.includes('rebond') && fin.reg.includes('cassure') && fin.reg.includes('approche') && fin.reg.includes('touche'), 'registre daté : approches, touches, rebonds et cassures enregistrés', `${fin.reg.length} événements, ${fin.suivis} mesurés sur 48 bougies`);
verifier(/pas assez de données/.test(fin.bilan) && /fleches-v10/.test(fin.bilan), 'bilan par type d’outil (« pas assez de données » sous 30) et bilan v10 depuis son commit');
// anti-doublon : rejouer la même bougie ne réannonce rien
const nAl = await q.evaluate(async () => { const n = window.__or.outils.E.alertes.length; await window.__or.outils.tour(); await window.__or.outils.tour(); return [n, window.__or.outils.E.alertes.length]; });
verifier(nAl[0] === nAl[1], 'anti-doublon : la même bougie analysée deux fois ne crée aucune nouvelle alerte');
// niveaux proposés (fractales H4 et Jour injectées)
await q.waitForFunction(() => window.__or.outils.E.proposes.length >= 2, { timeout: 10000 }).catch(() => {});
const pr = await q.evaluate(async () => { const O = window.__or.outils, L = O.E.proposes.map(p => p.cle), n0 = O.E.objets.length; await O.decider(L[0], true); const apres1 = O.E.proposes.length; await O.decider(O.E.proposes[0].cle, false);
  return { n: L.length, conf: O.E.objets.length === n0 + 1 && O.E.objets[O.E.objets.length - 1].origine === 'propose', reste: O.E.proposes.length, apres1, cadres: window.__or.graph.outilsCadres().filter(c => c.sorte === 'propose').length }; });
verifier(pr.n >= 2 && pr.conf && pr.reste === pr.n - 2, 'niveaux proposés : « mon niveau » crée un objet, « supprimer » le retire de la liste', JSON.stringify(pr));
const lt = await q.evaluate(() => Math.max(0, ...window.__longues));
verifier(fin.pire < 800 && lt < 800, 'calcul par morceaux : aucune pause de l’interface > 0,8 s', `pire tâche des outils ${fin.pire.toFixed(0)} ms, plus longue tâche ${lt.toFixed(0)} ms`);
await ctx3.close();

verifier(!erreurs.length, 'aucune erreur JavaScript', erreurs.slice(0, 3).join(' | '));
await nav.close();
console.log(`\n${nOk} OK, ${echecs.length} échec(s)`); if (echecs.length) { console.log(echecs.join('\n')); process.exit(1); }
