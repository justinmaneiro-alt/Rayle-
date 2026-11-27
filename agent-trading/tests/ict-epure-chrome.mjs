/* Test Chrome de l'ICT ÉPURÉ sur le chemin RÉEL du terminal (or.html + integration.js, SANS ?pro=1) : petits carrés (14 caractères au plus, aucun sur une bougie, aucun loin de son objet),
   Essentiel ≤ 8 objets / Complet ≤ 20, échelle de prix identique avec l'ICT allumé et éteint, carte ⓘ et légende fermées par défaut, une seule bulle, pas de bulle au survol,
   autres couches de niveaux de Rayle cachées, badge sous la rangée « Tendance … » et hors de la barre d'outils, captures. Bougies de l'or simulées (voir ict-visuel-aide.mjs) ; REEL=1 : vraies bougies.
   Prérequis : node serveur.mjs 8011. Usage : node agent-trading/tests/ict-epure-chrome.mjs [pc1600|tab1440|tab1024|tel390] */
import fs from 'node:fs';
import { initPrix, lancer, ouvrir, VUES, w, SOURCE } from './ict-visuel-aide.mjs';
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
fs.mkdirSync('captures-or', { recursive: true }); await initPrix(); console.log('données :', SOURCE);
const PLAN = { pc1600: ['M15', 'H1', 'H4', 'J'], tab1440: ['J', 'H1'], tab1024: ['H1'], tel390: ['H1'] };
const demandees = process.argv[2] ? [process.argv[2]] : Object.keys(PLAN), NOM = { M15: 'M15', H1: 'H1', H4: 'H4', J: 'Daily' }, PREF = process.env.PREFIXE || 'epure';
const nav = await lancer();
const unite = (p, u) => p.evaluate(x => { document.querySelector(`[data-periode="${x}"]`).click(); }, u).then(() => p.waitForFunction(x => window.__or.moteur.S.periode === x && window.__or.moteur.serie().length > 100, { timeout: 30000 }, u).catch(() => {})).then(() => w(3000));
/* échelle de prix : les prix aux deux bords et au milieu du panneau des bougies */
const echelle = p => p.evaluate(() => { const g = window.__or.graph, s = g.serie(), h = g.conteneur().clientHeight; return [0.2, 0.5, 0.8].map(f => +(s.coordinateToPrice(f * h * 0.6) ?? 0).toFixed(2)); });
for (const vue of demandees) {
  const p = await ouvrir(nav, VUES[vue]);
  v(await p.evaluate(() => !/pro=1/.test(location.search)), `${vue} : chemin réel, sans ?pro=1`);
  v(await p.evaluate(() => !document.documentElement.classList.contains('tp-details')), `${vue} : graphique propre (Détails éteint)`);
  await unite(p, PLAN[vue][0]);
  const avant = await echelle(p); const sansIct = await p.evaluate(() => window.__or.graph.ictEtat().cadres === 0 && window.__or.graph.ictEtat().pastilles === 0);
  v(sansIct, `${vue} : rien n'est dessiné avant le clic (ni carrés, ni pastilles)`);
  await p.evaluate(() => document.querySelector('.tp-b-ict').click()); await w(2200);
  const apres = await echelle(p);
  v(JSON.stringify(avant) === JSON.stringify(apres) || avant.every((x, k) => Math.abs(x - apres[k]) < 0.6), `${vue} : l'échelle de prix est la même avec l'ICT allumé et éteint (${avant.join(' / ')} → ${apres.join(' / ')})`);
  /* carte et légende fermées par défaut ; ⓘ ouvre la carte, un appui ailleurs la ferme */
  const etat0 = await p.evaluate(() => { const c = document.querySelector('[data-ict-carte]'), l = document.querySelector('[data-ict-leg]'), b = document.querySelector('[data-ict-bulle]'); return { carte: !c.hidden, leg: !l.hidden, bulle: !b.hidden, bouton: !!document.querySelector('[data-ict-leg-b]'), i: !!document.querySelector('[data-ict-i]') }; });
  v(!etat0.carte && !etat0.leg && !etat0.bulle && etat0.bouton && etat0.i, `${vue} : carte, légende et bulle fermées par défaut (bouton « ? Légende » et ⓘ présents)`);
  /* le badge : une ligne, sous la rangée « Tendance … », hors de la barre d'outils, hors des bougies */
  const lay = await p.evaluate(() => { const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom } : null; };
    const g = window.__or.graph, gr = g.conteneur().getBoundingClientRect(), bad = r(document.querySelector('[data-ict-badge]')), ai = r(document.querySelector('.tp-aides')), lg = r(document.querySelector('.tp-ligne-boutons')), ma = r(document.querySelector('.tp-ma-legende'));
    const B = g.etat().bougies, hw = 3, bougies = []; for (const b of B.slice(-400)) { const x = g.xDeT(b.t), yh = g.yDe(b.h), yl = g.yDe(b.l); if (x != null && yh != null && yl != null) bougies.push({ x0: gr.left + x - hw, x1: gr.left + x + hw, y0: gr.top + Math.min(yh, yl), y1: gr.top + Math.max(yh, yl) }); }
    return { bad, ai, lg, ma, bougies, lignes: document.querySelector('[data-ict-badge-t]').textContent.split('\n').length, texte: document.querySelector('[data-ict-badge-t]').textContent, hauteur: bad ? bad.y1 - bad.y0 : 0 }; });
  const inter = (a, b) => a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  v(lay.bad && lay.lignes === 1 && lay.hauteur < 48 && /^[A-Za-z0-9]+ · structure /.test(lay.texte), `${vue} : badge d'une seule ligne (« ${lay.texte} »)`);
  v(!inter(lay.bad, lay.ai) && !inter(lay.bad, lay.ma), `${vue} : le badge ne recouvre pas la rangée « Tendance … · volatilité … »`);
  v(!inter(lay.bad, lay.lg), `${vue} : la barre d'outils ne passe pas sur le badge`);
  v(!lay.bougies.some(b => inter(b, lay.lg)) && !lay.bougies.some(b => inter(b, lay.bad)), `${vue} : ni la barre d'outils ni le badge ne passent sur une bougie`);
  await p.evaluate(() => document.querySelector('[data-ict-i]').click()); await w(300);
  const carte = await p.evaluate(() => { const c = document.querySelector('[data-ict-carte]'); return { ouverte: !c.hidden, texte: c.innerText }; });
  v(carte.ouverte && /Structure /.test(carte.texte) && /Lecture ICT : /.test(carte.texte) && !/\d,\d\d(?!\d)/.test(carte.texte), `${vue} : ⓘ ouvre la carte aux verdicts nommés, prix à une décimale`);
  await p.evaluate(() => document.querySelector('[data-ict-leg-b]').click()); await w(300);
  v(await p.evaluate(() => document.querySelector('[data-ict-carte]').hidden && !document.querySelector('[data-ict-leg]').hidden), `${vue} : « ? Légende » ouvre la légende et ferme la carte`);
  const libre = () => p.evaluate(() => { const g = window.__or.graph, gr = g.conteneur().getBoundingClientRect(); for (const fy of [0.3, 0.4, 0.5, 0.6, 0.7]) for (const fx of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) { const x = gr.width * fx, y = gr.height * fy; if (!g.ictCadreA(x, y) && !document.elementsFromPoint(gr.left + x, gr.top + y).some(e => e.closest && e.closest('.ict-ui>*'))) return { x: gr.left + x, y: gr.top + y }; } return { x: gr.left + gr.width * 0.15, y: gr.top + gr.height * 0.6 }; });
  let cible = await libre();
  await p.mouse.click(cible.x, cible.y); await w(300);
  v(await p.evaluate(() => document.querySelector('[data-ict-carte]').hidden && document.querySelector('[data-ict-leg]').hidden && document.querySelector('[data-ict-bulle]').hidden), `${vue} : un appui ailleurs ferme la carte, la légende et la bulle`);
  for (const u of PLAN[vue]) {
    await unite(p, u);
    for (const mode of ['essentiel', 'complet']) {
      await p.evaluate(m => window.__or.ict.mode(m), mode); await w(1300);
      const id = `${vue} ${u} ${mode}`;
      const E = await p.evaluate(() => { const g = window.__or.graph, a = window.__or.ict.analyse(), m = window.__or.ict.modele(), et = g.ictEtat(), B = g.etat().bougies, ts = g.chart().timeScale(), pas = Math.abs((g.xDeT(B[B.length - 1].t) ?? 0) - (g.xDeT(B[B.length - 2].t) ?? 0)) || 6;
        const hw = pas * 0.35, bougies = []; for (const b of B.slice(-500)) { const x = g.xDeT(b.t), yh = g.yDe(b.h), yl = g.yDe(b.l); if (x != null && yh != null && yl != null) bougies.push({ x: x - hw, y: Math.min(yh, yl), w: 2 * hw, h: Math.abs(yl - yh) }); }
        void ts; return { unite: a && a.nom, ok: a && a.ok, mode: window.__or.ict.etatIct().mode, n: m.objets.filter(o => o.kind !== 'scenario').length, courts: m.objets.map(o => o.court), pas, carres: et.carres, bougies, pastilles: et.pastilles, ray: g.rayleEtat(), etiq: g.etiquettes().length, v8: g.lectureV8Etat ? g.lectureV8Etat() : null, errs: 0 }; });
      v(E.ok && E.unite === NOM[u] && E.mode === mode, `${id} : analyse de l'unité affichée (${E.unite})`);
      v(E.n > 0 && E.n <= (mode === 'essentiel' ? 8 : 20), `${id} : ${E.n} objets (${mode === 'essentiel' ? '8' : '20'} au plus)`);
      v(E.courts.every(c => c.length >= 1 && c.length <= 14), `${id} : tous les carrés tiennent sur une ligne de 14 caractères au plus (${E.courts.join(' | ')})`);
      const poses = E.carres.filter(c => !c.replie), chev = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      v(poses.length > 0, `${id} : ${poses.length} carrés posés sur ${E.carres.length}`);
      v(poses.every(c => !E.bougies.some(b => chev(c, b))), `${id} : aucun carré ne recouvre une bougie (corps et mèches)`);
      let sans = true; for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) if (chev(poses[i], poses[j])) sans = false; v(sans, `${id} : aucun carré n'en recouvre un autre`);
      v(poses.every(c => { const z = c.zone; if (!z) return false; const cy = c.y + c.h / 2, ligne = z.y1 - z.y0 <= 10; return (ligne ? Math.abs(cy - (z.y0 + z.y1) / 2) < 1.5 || c.style === 'texte' || /Premium|Discount/.test(c.court) : (z.y1 - z.y0 >= c.h ? cy >= z.y0 - 1 && cy <= z.y1 + 1 : Math.abs(cy - (z.y0 + z.y1) / 2) < 1.5) || /Premium|Discount|OTE/.test(c.court)) && c.x + c.w >= z.x0 - 8; }), `${id} : aucun carré ne s'éloigne de son objet`);
      v(!E.ray.types.niveau && !E.ray.types.boite && E.etiq === 0 && (!E.v8 || (E.v8.zones === 0 && E.v8.boites === 0)), `${id} : les autres couches de niveaux de Rayle (proposés, VAH / VAL, zones de réaction, boîtes) ne sont pas tracées (${JSON.stringify(E.ray.types)})`);
      v(E.pastilles <= 2, `${id} : pastilles de l'axe : le prix seulement, pour la BSL et la SSL (${E.pastilles})`);
      await p.screenshot({ path: `captures-or/${PREF}-${vue}-${u}-${mode}.png` });
    }
  }
  /* une seule bulle, de 4 lignes au plus, qui s'ouvre au toucher d'un objet (jamais au survol) et se ferme ailleurs */
  await unite(p, PLAN[vue][PLAN[vue].length - 1]); await p.evaluate(() => window.__or.ict.mode('complet')); await w(1300);
  const pts = await p.evaluate(() => { const g = window.__or.graph, gr = g.conteneur().getBoundingClientRect(), L = g.ictEtat().carres.filter(c => !c.replie && c.style !== 'texte'); return L.slice(0, 2).map(c => ({ x: gr.left + c.x + c.w / 2, y: gr.top + c.y + c.h / 2, court: c.court })); });
  if (pts.length) {
    await p.mouse.move(pts[0].x, pts[0].y); await w(400);
    v(await p.evaluate(() => document.querySelector('[data-ict-bulle]').hidden && document.querySelector('.tor-info').hidden), `${vue} : survoler un objet n'ouvre aucune bulle`);
    await p.mouse.click(pts[0].x, pts[0].y); await w(500);
    const b1 = await p.evaluate(() => { const b = document.querySelector('[data-ict-bulle]'); return { ouverte: !b.hidden, lignes: b.querySelectorAll('h4, div.l').length, texte: b.innerText, bouton: !!b.querySelector('[data-ict-explique]'), info: !document.querySelector('.tor-info').hidden }; });
    v(b1.ouverte && b1.lignes >= 2 && b1.lignes <= 4 && b1.bouton && !b1.info, `${vue} : toucher le carré « ${pts[0].court} » ouvre UNE bulle de ${b1.lignes} lignes (4 au plus) avec « Rayle, explique »`);
    { const second = await p.evaluate(() => { const g = window.__or.graph, gr = g.conteneur().getBoundingClientRect(), b = document.querySelector('[data-ict-bulle]').getBoundingClientRect(); return g.ictEtat().carres.filter(c => !c.replie && c.style !== 'texte').map(c => ({ x: gr.left + c.x + c.w / 2, y: gr.top + c.y + c.h / 2, court: c.court })).filter(q => !(q.x > b.left - 4 && q.x < b.right + 4 && q.y > b.top - 4 && q.y < b.bottom + 4) && !document.elementsFromPoint(q.x, q.y).some(e => e.closest && e.closest('.ict-ui>*, .tp-ligne-boutons'))).find(q => q.court !== undefined && Math.hypot(q.x - 0, 0) > 0) || null; });
      if (second && second.court !== pts[0].court) { await p.mouse.click(second.x, second.y); await w(500); }
      else await p.evaluate(() => { const L = window.__or.ict.modele().objets.filter(o => o.kind !== 'scenario'); window.__or.ict.ouvrirBulle(L[L.length - 1]); });
      v(await p.evaluate(() => document.querySelectorAll('.ict-bulle:not([hidden])').length === 1 && document.querySelector('.tor-info').hidden), `${vue} : une seule bulle ouverte à la fois`); }
    await p.evaluate(() => document.querySelector('[data-ict-explique]') && document.querySelector('[data-ict-explique]').click()); await w(300);
    v(await p.evaluate(() => /Rayle, explique-moi/.test(window.__or.ict.derniereQuestion() || '')), `${vue} : « Rayle, explique » prépare la question`);
    cible = await libre(); await p.mouse.click(cible.x, cible.y); await w(300); v(await p.evaluate(() => document.querySelector('[data-ict-bulle]').hidden), `${vue} : un appui ailleurs ferme la bulle`);
  } else v(false, `${vue} : aucun carré posé pour tester la bulle`);
  /* Détails allumé : l'ICT garde la place, les niveaux de Rayle restent cachés ; état conservé après un rechargement */
  await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(1800);
  v(await p.evaluate(() => { const g = window.__or.graph; return g.ictEtat().cadres > 0 && !g.rayleEtat().types.niveau && g.etiquettes().length === 0; }), `${vue} : avec « Détails » allumé, l'ICT reste et les niveaux de Rayle restent cachés`);
  await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(1200);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.ict && window.__or.moteur.serie().length > 100 && document.querySelector('.tp-b-ict'), { timeout: 60000 }); await w(5000);
  const apresR = await p.evaluate(() => ({ cadres: window.__or.graph.ictEtat().cadres, mode: window.__or.ict.etatIct().mode, actif: window.__or.ict.etatIct().actif, carte: window.__or.ict.etatIct().carte, leg: window.__or.ict.etatIct().legende }));
  v(apresR.actif && apresR.cadres > 0 && apresR.mode === 'complet' && !apresR.carte && !apresR.leg, `${vue} : après un rechargement l'ICT revient, carte et légende toujours fermées (${JSON.stringify(apresR)})`);
  const dire = t => p.evaluate(x => window.TableauOr.commande(x), t);
  v(/caché/.test(await dire('cache l ICT')) && await p.evaluate(() => window.__or.graph.ictEtat().cadres === 0 && window.__or.graph.ictEtat().pastilles === 0), `${vue} : « cache l'ICT » retire tout (carrés et pastilles)`);
  v(/ICT affiché/.test(await dire('affiche l ICT')), `${vue} : « affiche l'ICT »`); v(/complet/.test(await dire('ICT complet')) && await p.evaluate(() => window.__or.ict.etatIct().mode === 'complet'), `${vue} : « ICT complet »`); v(/essentiel/.test(await dire('ICT essentiel')), `${vue} : « ICT essentiel »`);
  if (vue === 'tel390') v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'tel390 : pas de défilement horizontal');
  v(p.__err.length === 0, `${vue} : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
