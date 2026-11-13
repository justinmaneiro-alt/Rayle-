/* Test Chrome : supprimer un trait ou un carré (petite fenêtre + corbeille + Annuler 6 s). Souris 1600 et 1024 px, doigt (émulation Galaxy S23, 390 px).
   Dessin de l'utilisateur supprimé pour de bon ; niveau calculé masqué et mémorisé (rechargement) ; « Rétablir les niveaux masqués » ; les flèches n'ont pas de corbeille ; aucune superposition.
   Prérequis : node serveur.mjs 8011.  Usage : node agent-trading/tests/suppression-chrome.mjs */
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011';
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
let nOk = 0; const echecs = [], erreurs = []; const w = ms => new Promise(r => setTimeout(r, ms));
const v = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m, d ? '· ' + d : ''); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const VUES = [{ nom: '1600', w: 1600, h: 900, tactile: false }, { nom: '1024', w: 1024, h: 768, tactile: false }, { nom: '390 tactile', w: 390, h: 844, tactile: true }];

async function ouvrir(ctx, vue, init) {
  const p = await ctx.newPage(); await p.setViewport({ width: vue.w, height: vue.h, deviceScaleFactor: vue.tactile ? 2 : 1, isMobile: vue.tactile, hasTouch: vue.tactile });
  if (process.env.DBG) { p.on('console', m => { if (/DBG/.test(m.text())) console.log(m.text()); }); await p.evaluateOnNewDocument(() => { window.__DBG_SUP = true; addEventListener('click', e => console.log('DBGDOC', e.target.tagName, e.target.className, e.clientX, e.clientY), true); }); }
  if (process.env.DBG) { p.on('console', m => { if (/DBG/.test(m.text())) console.log(m.text()); }); await p.evaluateOnNewDocument(() => { window.__DBG_SUP = true; }); }
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|status of 404|Telegram|Failed to load resource/i.test(m.text())) erreurs.push('console : ' + m.text().slice(0, 160)); });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_or_periode', JSON.stringify('H1')); localStorage.setItem('rayle_pwa_banniere', '1'); } catch (e) { /* */ } if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); } });
  if (init) await p.evaluateOnNewDocument(init);
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.outils && window.__or.outils.E.pret && window.__or.suppression && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 90000 });
  await w(1200); return p;
}
const boite = p => p.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const premierAppui = async (p, vue) => { await p.evaluate(() => document.querySelector('[data-graph]').scrollIntoView({ block: 'center' })); await w(250); const b = await boite(p), x = b.x + b.w * 0.5, y = b.y + b.h * 0.985; if (vue.tactile) await p.touchscreen.tap(x, y); else { await p.mouse.move(x, y); await p.mouse.click(x, y); } await w(600); };
const amorcer = async (p, vue) => {   // un premier appui sur le graphique fait défiler la page (comportement de l'application) : on l'absorbe avant de viser
  await p.evaluate(() => document.querySelector('[data-graph]').scrollIntoView({ block: 'center' })); await w(200); };
const cliquer = async (p, vue, rx, ry) => { await amorcer(p, vue); const b = await boite(p), x = b.x + rx, y = b.y + ry; if (vue.tactile) await p.touchscreen.tap(x, y); else { await p.mouse.move(x, y); await p.mouse.click(x, y); } await w(250); };
const etatFen = p => p.evaluate(() => { const f = document.querySelector('[data-sup-fenetre]'), t = document.querySelector('[data-sup-toast]'), r = e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  return { ouverte: !!f && !f.hidden, nom: f && f.querySelector('[data-sup-nom]') ? f.querySelector('[data-sup-nom]').textContent : '', prix: f && f.querySelector('[data-sup-prix]') ? f.querySelector('[data-sup-prix]').textContent : '', note: f && f.querySelector('[data-sup-note]') ? f.querySelector('[data-sup-note]').textContent : '', rect: f && !f.hidden ? r(f) : null, corbeille: !!(f && f.querySelector('[data-sup-corbeille]')), toast: !!t && !t.hidden, toastTexte: t ? t.textContent : '', toastRect: t && !t.hidden ? r(t) : null, vw: innerWidth, vh: innerHeight }; });
const inter = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const vue of VUES.filter(q => !process.env.VUE || q.nom.startsWith(process.env.VUE))) {
  const l = vue.nom, ctx = await nav.createBrowserContext(); const p = await ouvrir(ctx, vue);
  // ── 1. un trait dessiné par moi, dans un endroit libre
  await premierAppui(p, vue);
  const B = await boite(p);
  await p.evaluate(() => { const g = window.__or.graph; g.couches({ sr: false, liquidite: false, fleches: false }); });   // les flèches sont testées à part (section 4)
  await p.evaluate(() => document.querySelector('[data-graph]').scrollIntoView({ block: 'center' })); await w(300);
  await p.evaluate(t => { window.__libre = t ? 24 : 14; }, vue.tactile);
  const placement = await p.evaluate(() => { const g = window.__or.graph, S = g.serie(), h = g.chart().panes()[0].getHeight(), ts = g.chart().timeScale(), T = new Set(g.marquesAffichees().map(m => m.time)), r0 = document.querySelector('[data-graph]').getBoundingClientRect(), diag = { y: 0, marques: 0, canvas: 0, cand: 0 };
    for (let f = 0.15; f < 0.9; f += 0.01) { const y = f * h; for (let x = 60; x < r0.width - 70; x += 6) { diag.y++; const t = ts.coordinateToTime(x), t1 = ts.coordinateToTime(x + 9), t0 = ts.coordinateToTime(x - 9); if (T.has(t) || T.has(t1) || T.has(t0)) { diag.marques++; continue; }
      if (![-14, 0, 14].every(dy => { const el = document.elementFromPoint(r0.left + x, r0.top + y + dy); return el && el.tagName === 'CANVAS'; })) { diag.canvas++; continue; } if (g.candidatsSuppr(x, y, window.__libre).length) { diag.cand++; continue; } return { x, y, p: S.coordinateToPrice(y) }; } } return { diag }; });
  if (placement && placement.diag) console.log('INFO placement impossible', l, JSON.stringify(placement.diag));
  v(!!placement && !placement.diag, `${l} : un endroit libre existe pour dessiner un trait`); if (!placement || placement.diag) { await ctx.close(); continue; }
  const o = await p.evaluate(async pr => { const O = window.__or.outils; return await O.creer('horizontale', { p: Math.round(pr * 100) / 100, etiquette: 'Mon trait' }); }, placement.p); await w(500);
  await p.evaluate(t => { window.__tactile = t; }, vue.tactile);
  await p.evaluate(() => document.querySelector('[data-graph]').scrollIntoView({ block: window.__tactile ? 'start' : 'center' })); await w(400);
  let xClic; const yTrait = await p.evaluate(pr => window.__or.graph.serie().priceToCoordinate(pr), placement.p), tol = vue.tactile ? 20 : 10;
  // les bandeaux posés sur le graphique captent le pointeur : on choisit un x où le graphique lui-même est sous le doigt (sur le trait et de part et d'autre)
  const xLibre = await p.evaluate((yy, marques) => { const r0 = document.querySelector('[data-graph]').getBoundingClientRect(), ts = window.__or.graph.chart().timeScale(), T = new Set(marques); for (let q = 80; q < 1100; q += 5) { const t = ts.coordinateToTime(q), t1 = ts.coordinateToTime(q + 9), t0 = ts.coordinateToTime(q - 9); if (T.has(t) || T.has(t1) || T.has(t0)) continue; if ([-26, -14, -3, 0, 3, 7, 14, 26].every(dy => { const el = document.elementFromPoint(r0.left + q, r0.top + yy + dy); return el && el.tagName === 'CANVAS'; })) return q; } return null; }, yTrait, await p.evaluate(() => window.__or.graph.marquesAffichees().map(m => m.time)));
  v(xLibre != null, `${l} : un endroit du trait n'est pas recouvert par un bandeau`); xClic = xLibre ?? placement.x;
  // zone de touche généreuse : le trait est atteint jusqu'à tol px (10 souris, 20 doigt), pas au-delà
  const zone = await p.evaluate((x, y, tl, id) => { const g = window.__or.graph, a = g.candidatsSuppr(x, y + 2, tl).some(c => c.cle === 'obj:' + id), b = g.candidatsSuppr(x, y + tl + 4, tl).some(c => c.cle === 'obj:' + id); return { a, b }; }, xClic, yTrait, tol, o.id);
  v(zone.a && !zone.b, `${l} : le trait est atteint de près, pas au-delà de ${tol} px`, JSON.stringify(zone));
  let e = await etatFen(p);
  // dans la zone de touche généreuse
  if (process.env.DBG) { const bb = await boite(p); console.log('DBGPT', JSON.stringify(bb), 'x', xClic, 'y', yTrait + tol - 3, await p.evaluate((x, y) => { const el = document.elementFromPoint(x, y); return [scrollY, el && el.tagName + '.' + el.className, window.__or.graph.candidatsSuppr(x - 0, y - 0, 10).length]; }, bb.x + xClic, bb.y + yTrait + tol - 3)); }
  const dOuvre = vue.tactile ? 8 : tol - 3;
  await cliquer(p, vue, xClic, yTrait + dOuvre); e = await etatFen(p);
  v(e.ouverte && e.corbeille && /Mon trait/.test(e.nom) && /\d/.test(e.prix), `${l} : un ${vue.tactile ? 'appui' : 'clic'} à ${dOuvre} px du trait ouvre la fenêtre (nom, prix, corbeille)`, `${e.nom} · ${e.prix}`);
  if (!vue.tactile) { v(await p.evaluate(() => window.__or.graph.etat().hl === 'obj:' + window.__or.outils.E.objets[0].id), `${l} : le survol met le trait en surbrillance`); }
  v(e.rect && e.rect.x >= 0 && e.rect.y >= 0 && e.rect.x + e.rect.w <= e.vw && e.rect.y + e.rect.h <= e.vh, `${l} : la fenêtre reste entièrement visible`);
  if (vue.tactile) v(e.rect && e.rect.h >= 40, `${l} : corbeille tactile de taille suffisante`);
  // Échap ferme
  await p.keyboard.press('Escape'); await w(150); v(!(await etatFen(p)).ouverte, `${l} : Échap ferme la fenêtre`);
  // clic ailleurs ferme (dans le graphique, loin de tout)
  await cliquer(p, vue, xClic, yTrait); await cliquer(p, vue, B.w * 0.5, B.h * 0.93); v(!(await etatFen(p)).ouverte, `${l} : un clic ailleurs ferme la fenêtre`);
  await cliquer(p, vue, xClic, yTrait); await p.mouse.click(5, 5).catch(() => {}); await w(200); v(!(await etatFen(p)).ouverte, `${l} : un clic hors du graphique ferme la fenêtre`);
  // corbeille : supprime sans confirmation
  await cliquer(p, vue, xClic, yTrait); e = await etatFen(p);
  let dialogue = false; p.once('dialog', d => { dialogue = true; d.dismiss(); });
  await p.click('[data-sup-corbeille]'); await w(500); e = await etatFen(p);
  v(!dialogue && !e.ouverte && (await p.evaluate(id => !window.__or.outils.E.objets.some(x => x.id === id), o.id)), `${l} : la corbeille supprime tout de suite (aucune fenêtre de confirmation)`);
  v(e.toast && /Supprimé/.test(e.toastTexte) && /Annuler/.test(e.toastTexte), `${l} : message « Supprimé · Annuler » affiché en bas`, e.toastTexte);
  v(e.toastRect && e.toastRect.y + e.toastRect.h <= e.vh && e.toastRect.x >= 0 && e.toastRect.x + e.toastRect.w <= e.vw, `${l} : le message reste dans l'écran`);
  await p.click('[data-sup-annuler]'); await w(500);
  v(await p.evaluate(id => window.__or.outils.E.objets.some(x => x.id === id), o.id) && !(await etatFen(p)).toast, `${l} : Annuler remet le trait`);
  // le message disparaît seul après 6 s
  await cliquer(p, vue, xClic, yTrait); await p.click('[data-sup-corbeille]'); await w(300); const t0 = Date.now(); v((await etatFen(p)).toast, `${l} : message présent juste après`);
  await w(5200); const av = (await etatFen(p)).toast; await w(1400); const ap = (await etatFen(p)).toast; v(av && !ap, `${l} : le message reste 6 secondes puis disparaît`, `${Date.now() - t0} ms`);
  v(await p.evaluate(id => !window.__or.outils.E.objets.some(x => x.id === id), o.id), `${l} : le trait supprimé est bien définitivement supprimé`);
  // persistance du dessin supprimé après rechargement
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.outils && window.__or.outils.E.pret && window.__or.suppression && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 90000 }); await w(1500); await premierAppui(p, vue);
  v(await p.evaluate(id => !window.__or.outils.E.objets.some(x => x.id === id), o.id), `${l} : le trait supprimé ne revient pas après rechargement`);

  // ── 2. un niveau calculé : masqué, mémorisé
  await p.evaluate(() => window.__or.graph.couches({ sr: true, fleches: false })); await w(2500);
  console.log('INFO', l, 'zones dessinées :', await p.evaluate(() => (window.__or.graph.etat().cadresZ || []).map(c => (c.kind || '?') + ':' + Math.round(c.ym) + ':' + Math.round(c.x1 - c.x0)).join(' ')));
  await p.evaluate(() => document.querySelector('[data-graph]').scrollIntoView({ block: 'center' })); await w(300);
  const z = await p.evaluate(() => { const g = window.__or.graph, h = g.chart().panes()[0].getHeight(), ts = g.chart().timeScale(), T = new Set(g.marquesAffichees().map(m => m.time)), r0 = document.querySelector('[data-graph]').getBoundingClientRect(); const L = (g.etat().cadresZ || []).filter(c => c.z && c.kind === 'sr' && c.ym > 30 && c.ym < h - 30 && c.x1 - c.x0 > 120);
    for (const c of L) for (let q = Math.max(c.x0 + 10, 80); q < Math.min(c.x1 - 10, r0.width - 90); q += 8) { const t = ts.coordinateToTime(q), t1 = ts.coordinateToTime(q + 9), t0 = ts.coordinateToTime(q - 9); if (T.has(t) || T.has(t1) || T.has(t0)) continue; if ([-8, 0, 8].every(dy => { const el = document.elementFromPoint(r0.left + q, r0.top + c.ym + dy); return el && el.tagName === 'CANVAS'; }) && g.candidatsSuppr(q, c.ym, 6).length === 1) return { x: q, y: c.ym, p: c.z.p, texte: c.g && c.g.texte }; } return null; });
  v(!!z, `${l} : au moins une zone support / résistance est affichée`);
  if (z) {
    await cliquer(p, vue, z.x, z.y); e = await etatFen(p);
    v(e.ouverte && /flèches/.test(e.note) && /Ce niveau ne produira plus de flèches\./.test(e.note), `${l} : la fenêtre d'un niveau calculé dit « Ce niveau ne produira plus de flèches. »`, e.note);
    const clePrix = Math.round(z.p * 100);
    await p.click('[data-sup-corbeille]'); await w(500);
    const reste = () => p.evaluate(cp => (window.__or.graph.etat().cadresZ || []).filter(c => c.z && c.kind === 'sr' && Math.round(c.z.p * 100) === cp).length, clePrix);
    v((await reste()) === 0 && (await etatFen(p)).toast, `${l} : le niveau calculé est masqué (plus dessiné) avec « Annuler »`);
    await p.click('[data-sup-annuler]'); await w(500); v((await reste()) > 0, `${l} : Annuler remet le niveau`);
    await cliquer(p, vue, z.x, z.y); await p.click('[data-sup-corbeille]'); await w(400);
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.outils && window.__or.outils.E.pret && window.__or.suppression && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 90000 }); await w(1500); await premierAppui(p, vue); await p.evaluate(() => window.__or.graph.couches({ sr: true, fleches: false })); await w(900);
    v((await reste()) === 0 && (await p.evaluate(() => window.__or.suppression.masques().length)) >= 1, `${l} : le niveau masqué reste masqué après rechargement`);
    // les flèches ne regardent plus ce niveau
    v(await p.evaluate(() => { const M = window.__or.suppression.masques(); return M.length >= 1 && M.every(m => m.t > 0 && m.haut >= m.bas); }), `${l} : le masque est mémorisé avec son instant (aucun passé réécrit)`);
    // « Rétablir les niveaux masqués » dans Couches
    const bouton = await p.evaluate(() => !!document.querySelector('[data-mo-retablir]')); v(bouton, `${l} : le bouton « Rétablir les niveaux masqués » existe dans Couches`);
    const n = await p.evaluate(async () => await window.__or.outils.retablirMasques()); await w(700); v(n >= 1 && (await reste()) > 0 && (await p.evaluate(() => window.__or.suppression.masques().length)) === 0, `${l} : « Rétablir » remet tous les niveaux masqués`, String(n));
  }
  // ── 3. niveau proposé (H4 / Jour) : masqué et mémorisé, rétabli
  await premierAppui(p, vue);
  const pr = await p.evaluate(async () => { const O = window.__or.outils; for (let i = 0; i < 40 && !O.E.proposes.length; i++) await new Promise(r => setTimeout(r, 500)); const P = O.E.proposes.find(q => { const y = window.__or.graph.serie().priceToCoordinate(q.p); const hh = window.__or.graph.chart().panes()[0].getHeight(); return y != null && y > hh * 0.45 && y < hh - 20; }); return P ? { cle: P.cle, p: P.p, y: window.__or.graph.serie().priceToCoordinate(P.p) } : null; });
  if (pr) {
    await p.evaluate(() => window.__or.graph.couches({ sr: false })); await w(500);
    // la page défile au premier appui (comportement de l'application) : pour ce niveau, le clic est transmis par le même point d'entrée que le vrai clic (souris et doigt déjà testés ci-dessus)
    await p.evaluate((y, tact) => window.__or.suppression.clic(300, y + 2, { pointerType: tact ? 'touch' : 'mouse' }), pr.y, vue.tactile); await w(300); e = await etatFen(p);
    v(e.ouverte && /proposé/i.test(e.nom), `${l} : un niveau proposé ouvre la fenêtre`, e.nom);
    if (e.ouverte) { await p.click('[data-sup-corbeille]'); await w(600); v(await p.evaluate(c => !window.__or.outils.E.proposes.some(q => q.cle === c), pr.cle), `${l} : niveau proposé masqué`);
      await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.outils && window.__or.outils.E.pret && window.__or.suppression && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 90000 }); await w(2500); await premierAppui(p, vue);
      v(await p.evaluate(c => !window.__or.outils.E.proposes.some(q => q.cle === c), pr.cle), `${l} : niveau proposé toujours masqué après rechargement`);
      const n2 = await p.evaluate(async () => await window.__or.outils.retablirMasques()); await w(600); v(n2 >= 1 && (await p.evaluate(c => window.__or.outils.E.proposes.some(q => q.cle === c), pr.cle)), `${l} : « Rétablir » remet le niveau proposé`); }
  } else console.log('INFO', l, ': aucun niveau proposé visible (ignoré)');
  // ── 4. une flèche n'a pas de corbeille
  await p.evaluate(() => window.__or.graph.couches({ sr: true, fleches: true })); await w(700); await p.evaluate(() => document.querySelector('[data-graph]').scrollIntoView({ block: 'center' })); await w(300);
  const fl = await p.evaluate(() => { const T = window.__or, L = T.flechesT ? T.flechesT.liste().filter(f => !f.contre) : []; const g = T.graph; for (const f of L.slice().reverse()) { const x = g.xDeT(f.t), b = T.moteur && null; const S = g.serie(); const bar = (g.etat().bougies || []).find(q => q.t === f.t); if (x == null || !bar) continue; const y = f.dir > 0 ? S.priceToCoordinate(bar.l) : S.priceToCoordinate(bar.h); if (y == null || x < 20 || x > innerWidth - 20) continue; return { x, y: f.dir > 0 ? y + 14 : y - 14 }; } return null; });
  if (fl) { await cliquer(p, vue, fl.x, fl.y); e = await etatFen(p); v(!e.ouverte, `${l} : un clic sur une flèche n'ouvre pas la corbeille (la flèche garde son infobulle)`); } else console.log('INFO', l, ': aucune flèche visible à cliquer (ignoré)');
  await ctx.close();
}
await nav.close();
console.log(`\n${nOk} vérifications OK, ${echecs.length} échec(s)`); if (erreurs.length) console.log('Erreurs page :', [...new Set(erreurs)].slice(0, 8));
if (echecs.length) { console.log(echecs.join('\n')); process.exit(1); }
