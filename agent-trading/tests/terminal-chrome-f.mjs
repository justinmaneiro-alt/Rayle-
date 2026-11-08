/* Corrections du terminal dans Chrome (2026-11-08) : plein écran avec carnet visible à sa place, page qui défile sans onglets, sections
   complètes sans texte coupé, tableau multi-unités et score, santé, calendrier, COT, rapports, outil Position (trois lignes, aucun bloc,
   1 et 2 ATR, extrémités réglables), journal automatique, Rayle (bulle, « demander à Rayle », données des sections), Nasdaq par le PC,
   aucune pause > 0,8 s. Vraies données (Kraken par le serveur du PC, Binance, CFTC, flux publics). */
export default async function ({ verifier, w, ouvrirTerminal, nav }) {
  const ctx = await nav.createBrowserContext();
  const p = await ouvrirTerminal(ctx, { l: 1680, h: 950, init: () => { if (!sessionStorage.getItem('initF')) { sessionStorage.setItem('initF', '1'); localStorage.clear(); localStorage.setItem('rayle_term_unite_OR', '"M15"'); indexedDB.deleteDatabase('rayle-terminal-outils'); } } });
  await p.waitForFunction(() => window.__terminal.module('positions') && window.__terminal.module('rayle'), { timeout: 30000 });
  await p.waitForFunction(() => window.__terminal.etatCarnet(), { timeout: 30000 }).catch(() => null);
  const T = 'window.__terminal';

  /* ── 1. page unique qui défile ── */
  const pg = await p.evaluate(() => { const R = document.querySelector('.tr'), e = document.querySelector('.tr-ecran').getBoundingClientRect(); return { onglets: document.querySelectorAll('[data-onglet]').length, ancres: [...document.querySelectorAll('[data-ancre]')].map(a => a.dataset.ancre), defile: R.scrollHeight > R.clientHeight * 2, hEcran: Math.round(e.height), hVue: R.clientHeight, bulle: !!document.querySelector('.tr-bulle-btn'), rayleOnglet: !!document.querySelector('[data-onglet="rayle"]') }; });
  verifier(pg.onglets === 0 && !pg.rayleOnglet, 'aucun onglet, aucune sous-fenêtre (Rayle n’est pas un onglet)');
  verifier(pg.defile && Math.abs(pg.hEcran - pg.hVue) <= 2, 'graphique + carnet à la hauteur de l’écran, sections en dessous par défilement', `${pg.hEcran} / ${pg.hVue}`);
  verifier(pg.ancres.join() === 'tableau,sante,calendrier,cot,rapports,actus,journal,alertes,registre,cotations', 'fine barre d’ancres dans l’ordre demandé');
  verifier(pg.bulle, 'Rayle : bulle discrète');

  /* ── 2. plein écran ── */
  const avant = await p.evaluate(() => { const g = document.querySelector('[data-graph]').getBoundingClientRect(), c = document.querySelector('.tr-carnet').getBoundingClientRect(); return { gl: g.width, gh: g.height, cl: c.width }; });
  await p.click('[data-a="plein"]'); await w(700);
  const pl = await p.evaluate(() => {
    const R = document.querySelector('.tr'), g = document.querySelector('[data-graph]').getBoundingClientRect(), c = document.querySelector('.tr-carnet').getBoundingClientRect(), o = document.querySelector('.tr-outils').getBoundingClientRect(), h = document.querySelector('.tr-haut-barre');
    const flottants = [...document.querySelectorAll('.tr-ecran *')].filter(x => { const s = getComputedStyle(x), r = x.getBoundingClientRect(); return (s.position === 'absolute' || s.position === 'fixed') && r.width > 160 && r.height > 120 && s.display !== 'none' && s.visibility !== 'hidden' && !x.closest('[data-graph]') && !x.closest('.tr-carnet') && !x.hidden && x.offsetParent !== null; }).map(x => x.className);
    return { plein: R.classList.contains('plein'), gl: g.width, gh: g.height, cl: c.width, cDroite: Math.round(innerWidth - c.right), cHaut: Math.round(c.top), cBas: Math.round(innerHeight - c.bottom), oGauche: Math.round(o.left), oVisible: o.width > 30, entete: getComputedStyle(h).display, toile: !!document.querySelector('.tr-carnet canvas'), bulle: getComputedStyle(document.querySelector('.tr-bulle')).display, flottants };
  });
  verifier(pl.plein && pl.gl > avant.gl * 0.99 && pl.gh > avant.gh, 'plein écran : le graphique prend tout l’espace', `${Math.round(avant.gl)}×${Math.round(avant.gh)} → ${Math.round(pl.gl)}×${Math.round(pl.gh)}`);
  verifier(pl.toile && pl.cDroite <= 1 && pl.cHaut <= 1 && pl.cBas <= 1 && Math.abs(pl.cl - avant.cl) < 2, 'plein écran : carnet d’ordres visible à droite, à sa place, même largeur', JSON.stringify({ d: pl.cDroite, h: pl.cHaut, b: pl.cBas, l: pl.cl }));
  verifier(pl.oGauche <= 1 && pl.oVisible && pl.entete === 'none', 'plein écran : barre d’outils de gauche conservée');
  verifier(!pl.flottants.length && pl.bulle === 'none', 'plein écran : aucun panneau flottant', pl.flottants.join(','));
  const c1 = await p.evaluate(() => { const c = window.__terminal.etatCarnet(); return c ? c.carnet.maj || c.milieu : null; }); await w(2500);
  const c2 = await p.evaluate(() => { const c = window.__terminal.etatCarnet(); return c ? { maj: c.carnet.maj || c.milieu, pret: c.carnet.pret } : null; });
  verifier(c2 && c2.pret, 'plein écran : carnet en direct (flux reçu)', JSON.stringify([c1, c2]));
  await p.keyboard.press('Escape'); await w(400);
  verifier(!(await p.evaluate(() => document.querySelector('.tr').classList.contains('plein'))), 'sortie du plein écran par Échap');
  await p.mouse.click(400, 400); await p.keyboard.press('f'); await w(400);
  const f1 = await p.evaluate(() => document.querySelector('.tr').classList.contains('plein')); await p.keyboard.press('f'); await w(400);
  const f2 = await p.evaluate(() => document.querySelector('.tr').classList.contains('plein'));
  verifier(f1 && !f2, 'touche F : entre et sort du plein écran');
  await p.click('[data-a="plein"]'); await w(300); await p.click('[data-a="plein"]'); await w(300);
  verifier(!(await p.evaluate(() => document.querySelector('.tr').classList.contains('plein'))), 'sortie par le même bouton');

  /* ── 3. sections complètes ── */
  await p.evaluate(() => window.__terminal.ongletBas('tableau')); await w(300);
  await p.waitForFunction(() => document.querySelector('.tr-tb'), { timeout: 90000 }).catch(() => null);
  const tb = await p.evaluate(() => { const t = document.querySelector('.tr-tb'); if (!t) return null; return { cols: [...t.querySelectorAll('thead th')].map(x => x.textContent).filter(Boolean), lignes: [...t.querySelectorAll('tbody th')].map(x => x.textContent.split('(')[0].trim()), scores: [...t.querySelectorAll('.tr-score')].map(s => ({ v: +s.firstChild.textContent, c: s.className, t: s.title })), mini: t.querySelectorAll('.tr-tb-mini svg').length }; });
  verifier(tb && tb.cols.join() === 'M5,M15,H1,Jour,Global', 'tableau : colonnes M5, M15, H1, Jour, Global', tb && tb.cols.join());
  verifier(tb && ['Tendance', 'RSI', 'Vol net USD', 'Support', 'Résistance', 'Score'].every(x => tb.lignes.some(l => l.startsWith(x))), 'tableau : lignes tendance, RSI, vol net USD, support, résistance, score', tb && tb.lignes.join('|'));
  verifier(tb && tb.scores.length === 5 && tb.scores.every(s => s.v >= 0 && s.v <= 100 && /haut|bas|neutre/.test(s.c)) && /pas une prévision/.test(tb.scores[0].t) && /tendance .*\/30/.test(tb.scores[0].t), 'score /100 coloré, formule et composantes au survol', tb && tb.scores.map(s => s.v).join(','));
  verifier(tb && tb.mini >= 4, 'mini-graphique de tendance par unité');
  await p.hover('.tr-score'); await w(150);
  verifier(/score-lecture-v1|tendance/.test(await p.evaluate(() => document.querySelector('[data-score-detail]').textContent)), 'détail du score affiché au survol');
  const volOr = await p.evaluate(() => [...document.querySelectorAll('.tr-tb tbody tr')].find(r => /Vol net/.test(r.textContent)).textContent);
  verifier(/\$/.test(volOr), 'or : volume net en dollars (Binance XAUUSDT)', volOr.replace(/\s+/g, ' ').slice(0, 90));
  for (const id of ['sante', 'calendrier', 'cot', 'rapports', 'actus', 'journal']) { await p.evaluate(i => window.__terminal.ongletBas(i), id); await w(400); }
  await p.waitForFunction(() => document.querySelector('[data-section="cot"] .tr-courbes') && document.querySelector('[data-section="sante"] .tr-seance') && document.querySelector('[data-section="rapports"] .tr-rapport'), { timeout: 60000 }).catch(() => null);
  await w(3000);
  const sec = await p.evaluate(() => { const z = id => document.querySelector(`[data-section="${id}"]`); return {
    sante: { seances: z('sante').querySelectorAll('.tr-seance').length, graph: z('sante').querySelectorAll('svg').length, txt: z('sante').textContent },
    cal: { lignes: z('calendrier').querySelectorAll('.tr-cal tbody tr').length, cols: [...z('calendrier').querySelectorAll('.tr-cal thead th')].map(x => x.textContent).join(','), rebours: !!z('calendrier').querySelector('[data-rebours]'), filtre: z('calendrier').querySelectorAll('[data-cal-dev]').length, txt: z('calendrier').textContent.slice(0, 120) },
    cot: { cols: [...z('cot').querySelectorAll('thead th')].map(x => x.textContent).join(','), lignes: z('cot').querySelectorAll('tbody tr').length, courbes: z('cot').querySelectorAll('.tr-courbes polyline').length, txt: z('cot').textContent.slice(0, 100) },
    rap: { n: z('rapports').querySelectorAll('.tr-rapport').length, liens: z('rapports').querySelectorAll('.tr-rapport a[href^="https"]').length, etat: z('rapports').querySelectorAll('.tr-liste li').length, txt: z('rapports').textContent.slice(0, 100) },
    demander: document.querySelectorAll('.tr-section [data-demander]').length }; });
  verifier(sec.sante.seances === 3 && sec.sante.graph >= 3 && /Volatilit/.test(sec.sante.txt) && /Spread/.test(sec.sante.txt) && /Corrélations/.test(sec.sante.txt) && /Mineurs/.test(sec.sante.txt), 'santé : volatilité et rang, volume, spread, carnet, séances, corrélations, mineurs et ETF, avec graphiques', `${sec.sante.seances} séances, ${sec.sante.graph} graphiques`);
  verifier(/Rang historique/.test(sec.sante.txt), 'santé : rang historique de l’ATR');
  verifier(sec.cal.lignes > 5 ? /Heure,Devise,Impact,Annonce,Précédent,Prévision,Résultat/.test(sec.cal.cols) && sec.cal.filtre > 2 : /indisponible/i.test(sec.cal.txt), 'calendrier complet (heure de Paris, impact, précédent, prévision, résultat, filtre devise) ou cause claire', sec.cal.cols || sec.cal.txt);
  verifier(/Achats,Ventes,Net,Variation du net/.test(sec.cot.cols) && /intérêt ouvert/.test(sec.cot.cols) && sec.cot.lignes === 3 && sec.cot.courbes === 3, 'COT : tableau complet et graphique des positions nettes par catégorie', sec.cot.cols.slice(0, 80) || sec.cot.txt);
  verifier(sec.rap.n >= 5 && sec.rap.liens >= 5 && sec.rap.etat >= 7, 'rapports et analyses publics : titre, date, source, lien, résumé ; état des sources', `${sec.rap.n} rapports`);
  verifier(sec.demander >= 10, 'un bouton « demander à Rayle » par section', sec.demander);
  // texte coupé ?
  const coupes = await p.evaluate(() => { const L = []; const R0 = document.querySelector('.tr-sections').getBoundingClientRect();
    for (const x of document.querySelectorAll('.tr-sections *')) { if (!x.offsetParent || x.closest('.tr-defile-x') || x.closest('svg')) continue; const s = getComputedStyle(x), r = x.getBoundingClientRect();
      if ((s.textOverflow === 'ellipsis' || s.overflowX === 'hidden' || s.overflow === 'hidden') && x.scrollWidth > x.clientWidth + 1 && x.textContent.trim()) L.push(x.className || x.tagName);
      else if (r.width && r.right > R0.right + 2 && x.textContent.trim() && !x.children.length) L.push('déborde:' + (x.className || x.tagName) + ':' + x.textContent.slice(0, 20)); }
    return L.slice(0, 10); });
  verifier(!coupes.length, 'sections : aucun texte coupé', coupes.join(' · '));
  const hor = await p.evaluate(() => { const R = document.querySelector('.tr'); return R.scrollWidth <= R.clientWidth + 1; });
  verifier(hor, 'aucun défilement horizontal de la page');
  await p.evaluate(() => window.__terminal.ongletBas('tableau')); await w(200); await p.screenshot({ path: 'captures-or/terminal-f-tableau.png' });
  await p.evaluate(() => window.__terminal.ongletBas('sante')); await w(200); await p.screenshot({ path: 'captures-or/terminal-f-sante.png' });
  await p.evaluate(() => window.__terminal.ongletBas('cot')); await w(200); await p.screenshot({ path: 'captures-or/terminal-f-cot.png' });
  await p.evaluate(() => document.querySelector('.tr').scrollTo(0, 0)); await w(300);

  /* ── 4. outil Position ── */
  const bt = await p.evaluate(() => { const b = document.querySelector('.tr-outils [data-outil="position"]'), r = b.getBoundingClientRect(), o = document.querySelector('.tr-outils').getBoundingClientRect(); return { vis: r.width > 20 && r.top >= o.top && r.bottom <= o.bottom && getComputedStyle(b).visibility === 'visible', lib: b.dataset.libelle, txt: b.textContent }; });
  await p.hover('.tr-outils [data-outil="position"]'); await w(150);
  const bulleLib = await p.evaluate(() => getComputedStyle(document.querySelector('.tr-outils [data-outil="position"]'), '::after').content);
  verifier(bt.vis && /Position/.test(bt.lib) && /Pos/.test(bt.txt) && /Position/.test(bulleLib), 'bouton « Position » visible dans la barre de gauche, libellé au survol', bulleLib);
  const r = await p.evaluate(() => { const b = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: b.left, y: b.top, l: b.width, h: b.height }; });
  await p.click('[data-outil="position"]'); await w(150); await p.mouse.click(r.x + r.l * 0.55, r.y + r.h * 0.5); await w(500);
  const P1 = await p.evaluate(() => { const T = window.__terminal, P = T.module('positions').positions(), x = P[P.length - 1]; return { n: P.length, e: x.entree, s: x.stop, o: x.objectif, atr: T.atr(), id: x.id, tick: 0.01 }; });
  verifier(P1.n === 1 && Math.abs(Math.abs(P1.e - P1.s) - P1.atr) <= 0.02 && Math.abs(Math.abs(P1.o - P1.e) - 2 * Math.abs(P1.e - P1.s)) <= 0.02, 'stop à 1 ATR et objectif à 2 ATR par défaut', `ATR ${P1.atr && P1.atr.toFixed(2)} · risque ${Math.abs(P1.e - P1.s).toFixed(2)}`);
  await p.click('[data-pa="fermer"]'); await w(100);
  // aucun carré ni bloc de couleur : même nombre de fillRect avec et sans la couche des positions
  const fr = await p.evaluate(async () => { const T = window.__terminal, n = { rect: 0, texte: 0 }, o = CanvasRenderingContext2D.prototype.fillRect, ot = CanvasRenderingContext2D.prototype.strokeText;
    CanvasRenderingContext2D.prototype.fillRect = function (...a) { if (/positions-terminal/.test(new Error().stack)) n.rect++; return o.apply(this, a); };
    CanvasRenderingContext2D.prototype.strokeText = function (...a) { if (/positions-terminal/.test(new Error().stack)) n.texte++; return ot.apply(this, a); };
    T.couche('positions', true); T.graph.redessiner(); await new Promise(r => setTimeout(r, 400)); CanvasRenderingContext2D.prototype.fillRect = o; CanvasRenderingContext2D.prototype.strokeText = ot; return n; });
  verifier(fr.rect === 0 && fr.texte > 0, 'position : trois fines lignes et étiquette sobre, aucun carré ni bloc de couleur (aucun fillRect)', JSON.stringify(fr));
  // extrémité gauche tirée à la souris
  const ex = await p.evaluate(id => { const T = window.__terminal, M = T.module('positions'), p = M.positions().find(x => x.id === id); const [x0, x1] = M.bornes(id); return { x0, x1, y: T.graph.yDe(p.entree), ys: T.graph.yDe(p.stop) }; }, P1.id);
  const yM = (ex.y + ex.ys) / 2; await p.mouse.move(r.x + ex.x0 + 1, r.y + yM); await p.mouse.down(); await p.mouse.move(r.x + ex.x0 - 140, r.y + yM, { steps: 6 }); await p.mouse.up(); await w(300);
  const ap = await p.evaluate(id => { const p = window.__terminal.module('positions').positions().find(x => x.id === id); return { t0: p.tAff0, cree: p.cree }; }, P1.id);
  verifier(ap.t0 != null && ap.t0 < ap.cree, 'longueur horizontale réglée en tirant l’extrémité gauche', JSON.stringify({ ...ap, ex }));
  // journal automatique : position ouverte au prix, puis clôturée à la main → résultat en R dans le journal
  const jr = await p.evaluate(async () => { const T = window.__terminal, M = T.module('positions'), px = T.prix(), a = T.atr();
    const q = await M.creer({ entree: px + a * 0.01, stop: px - a, objectif: px + 2 * a }); await M.suivreTout(); await new Promise(r => setTimeout(r, 300));
    const ouv = M.positions().find(x => x.id === q.id).etat; let fin = null; if (ouv === 'ouverte') { await M.actionner(q.id, 'cloturer'); await new Promise(r => setTimeout(r, 500)); fin = M.positions().find(x => x.id === q.id).etat; }
    const L = M.lignes().filter(l => l.position === q.id).map(l => ({ e: l.evenement, R: l.R })); T.ongletBas('journal'); await new Promise(r => setTimeout(r, 300));
    return { ouv, fin, L, txt: document.querySelector('[data-panneau="journal"]').textContent }; });
  verifier(jr.L.some(l => l.e === 'creee') && (jr.ouv !== 'ouverte' || (jr.fin === 'cloturee' && jr.L.some(l => l.e === 'cloturee' && Number.isFinite(l.R)))), 'journal automatique : tracée, ouverte, clôturée à la main avec résultat en R', JSON.stringify(jr.L) + ' ' + jr.ouv);
  verifier(/clôturée à la main|tracée/.test(jr.txt) && / R/.test(jr.txt), 'journal visible dans sa section');

  /* ── 5. Rayle ── */
  await p.evaluate(() => window.__terminal.ongletBas('cot')); await w(200);
  await p.click('[data-section="cot"] [data-demander]'); await p.waitForFunction(() => /COT|rapport/i.test((document.querySelector('[data-panneau="rayle"] .tr-reponse') || {}).textContent || ''), { timeout: 20000 }).catch(() => null);
  const ry = await p.evaluate(() => ({ ouverte: !document.querySelector('[data-panneau="rayle"]').hidden, rep: (document.querySelector('[data-panneau="rayle"] .tr-reponse') || {}).textContent || '', S: Object.keys(window.__terminal.module('rayle').sections()), ctx: (document.querySelector('[data-panneau="rayle"] details pre') || {}).textContent || '' }));
  verifier(ry.ouverte && /COT/.test(ry.rep) && /pas une promesse/i.test(ry.rep) && !/\b(achète|vends|passe un ordre)\b/i.test(ry.rep), '« demander à Rayle » (COT) : la bulle s’ouvre, Rayle explique sans ordre', ry.rep.slice(0, 120));
  verifier(['tableau', 'annonces', 'rapports', 'actus', 'cot', 'sante', 'journal'].every(k => ry.S.includes(k)), 'Rayle reçoit les données structurées de toutes les sections', ry.S.join());
  verifier(/Tableau multi-unités/.test(ry.ctx) && /Journal :/.test(ry.ctx) && /Carnet/.test(ry.ctx) && /Positions suivies/.test(ry.ctx), 'contexte de Rayle : tableau, journal, carnet, positions', ry.ctx.length + ' caractères');
  await p.keyboard.press('Escape'); await w(200);
  verifier(await p.evaluate(() => document.querySelector('[data-panneau="rayle"]').hidden), 'bulle refermée par Échap');

  /* ── 6. Nasdaq par le serveur du PC ── */
  await p.evaluate(() => window.__terminal.choisirActif('NASDAQ'));
  await p.waitForFunction(() => window.__terminal.graph.etat().actif === 'NASDAQ' && (window.__terminal.graph.etat().n > 50 || /indisponibles/.test(document.querySelector('[data-hist]').textContent)), { timeout: 90000 }).catch(() => null);
  const nq = await p.evaluate(() => ({ n: window.__terminal.graph.etat().n, src: document.querySelector('[data-source]').textContent, prix: window.__terminal.prix() }));
  verifier(nq.n > 50 && /Kraken PF_US100USD · lu par le PC/.test(nq.src) && nq.prix > 10000, 'Nasdaq servi par Kraken (PF_US100USD) via le serveur du PC', `${nq.n} bougies · ${nq.src} · ${nq.prix}`);
  await p.evaluate(() => window.__terminal.choisirActif('OR')); await w(2000);

  const L = await p.evaluate(() => window.__longues.slice());
  verifier(Math.max(0, ...L) < 800, 'fluidité : aucune pause > 0,8 s', 'pire tâche longue ' + Math.max(0, ...L) + ' ms sur ' + L.length);
  await p.screenshot({ path: 'captures-or/terminal-f-haut.png' });
  await ctx.close();
}
