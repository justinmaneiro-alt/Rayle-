/* Test Chrome de l'ICT VISUEL sur le chemin RÉEL du terminal (or.html + integration.js, SANS ?pro=1) : bouton ICT dans la barre, Essentiel | Complet, ICT affiché en graphique propre, mémorisé après rechargement et changement d'unité,
   objets nommés, bulle « pourquoi » + « Rayle, explique », commandes vocales, M15 / H1 / H4 / Jour, pc1600 / tab1024 / tel390, captures. Bougies de l'or simulées (série calée sur le prix réel), voir ict-visuel-aide.mjs.
   Prérequis : node serveur.mjs 8011. Usage : node agent-trading/tests/ict-visuel-chrome.mjs [pc1600|tab1024|tel390] */
import fs from 'node:fs';
import { initPrix, lancer, ouvrir, VUES, w, SOURCE } from './ict-visuel-aide.mjs';
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
fs.mkdirSync('captures-or', { recursive: true }); await initPrix(); console.log('données :', SOURCE);
const demandees = process.argv[2] ? [process.argv[2]] : Object.keys(VUES), NOM = { M15: 'M15', H1: 'H1', H4: 'H4', J: 'Daily' }, AUTRES = { M15: /\b(H1|H4|Daily)\b/, H1: /\b(M15|H4|Daily)\b/, H4: /\b(M15|H1|Daily)\b/, J: /\b(M15|H1|H4)\b/ };
const nav = await lancer();
const unite = (p, u) => p.evaluate(x => { const b = document.querySelector(`[data-periode="${x}"]`); b.click(); }, u).then(() => p.waitForFunction(x => window.__or.moteur.S.periode === x && window.__or.moteur.serie().length > 100, { timeout: 30000 }, u).catch(() => {})).then(() => w(2800));
for (const vue of demandees) {
  const p = await ouvrir(nav, VUES[vue]);
  v(await p.evaluate(() => !document.documentElement.search && !/pro=1/.test(location.search)), `${vue} : chemin réel, sans ?pro=1 (${await p.evaluate(() => location.search)})`);
  const pos = await p.evaluate(() => { const g = document.querySelector('.tp-b-hj'), i = document.querySelector('.tp-b-ict'), d = [...document.querySelectorAll('.tp-b-donnees')].find(x => x.textContent.trim() === 'Données'); if (!g || !i || !d) return null; const k = [...i.parentNode.children]; return { ordre: k.indexOf(g) < k.indexOf(i) && k.indexOf(i) < k.indexOf(d), visible: i.getBoundingClientRect().width > 20 && i.getBoundingClientRect().right <= innerWidth + 1 }; });
  v(pos && pos.ordre && pos.visible, `${vue} : le bouton ICT est visible, entre MA200 et Données`);
  v(await p.evaluate(() => !document.documentElement.classList.contains('tp-details')), `${vue} : graphique propre (Détails éteint)`);
  v(await p.evaluate(() => window.__or.graph.ictEtat().cadres === 0), `${vue} : rien n'est dessiné avant le clic`);
  await p.evaluate(() => document.querySelector('.tp-b-ict').click()); await w(1500);
  v(await p.evaluate(() => window.__or.graph.ictEtat().cadres > 0 && document.querySelector('.tp-b-ict').getAttribute('aria-pressed') === 'true'), `${vue} : un clic sur ICT dessine la lecture, même en graphique propre`);
  const bascule = await p.evaluate(() => { const m = document.querySelector('.tp-ict-mode'); return m ? { visible: m.getBoundingClientRect().width > 20, hidden: m.hidden } : null; });
  v(bascule && (vue === 'tel390' ? !bascule.visible || true : bascule.visible && !bascule.hidden), `${vue} : bascule Essentiel | Complet ${vue === 'tel390' ? '(dans le menu ⋯ sur téléphone)' : 'visible à côté du bouton'}`);
  if (vue === 'tel390') { await p.evaluate(() => document.querySelector('[data-tt-plus]').click()); await w(600); v(await p.evaluate(() => !!document.querySelector('[data-tt-ict="complet"]') && document.querySelector('[data-tt-ict="complet"]').getBoundingClientRect().width > 50), 'tel390 : « ICT complet » est dans le menu ⋯'); await p.evaluate(() => document.querySelector('[data-tt-ferme-reglages]').click()); await w(300); }
  for (const u of ['M15', 'H1', 'H4', 'J']) {
    await unite(p, u);
    for (const mode of ['essentiel', 'complet']) {
      await p.evaluate(m => window.__or.ict.mode(m), mode); await w(900);
      const E = await p.evaluate(() => { const a = window.__or.ict.analyse(), m = window.__or.ict.modele(); return { unite: a && a.nom, ok: a && a.ok, n: m ? m.objets.length : -1, noms: m ? m.objets.map(o => o.nom) : [], badge: m && m.badge.texte, textes: m ? [m.badge.texte, ...m.objets.map(o => o.nom + ' ' + (o.detail || ''))].join(' | ') : '', unites: m ? [...new Set(m.objets.map(o => o.unite))] : [], c: window.__or.graph.ictEtat(), carte: (document.querySelector('[data-ict-carte]') || {}).innerText || '', mode: window.__or.ict.etatIct().mode, lect: window.__or.ict.lecture({ actif: 'or', mode: 'complet' }), propre: !document.documentElement.classList.contains('tp-details') }; });
      v(E.ok && E.unite === NOM[u] && E.mode === mode, `${vue} ${u} ${mode} : analyse de l'unité affichée (${E.unite})`);
      v(E.n > 0 && E.noms.every(n => n && n.trim().length >= 2), `${vue} ${u} ${mode} : ${E.n} objets, chacun a un nom`);
      v(mode === 'complet' || E.n <= 15, `${vue} ${u} ${mode} : essentiel ≤ 15 objets (${E.n})`);
      v(E.unites.length === 1 && E.unites[0] === NOM[u] && !AUTRES[u].test(E.textes.replace(/Tendance \w+ :/, '')), `${vue} ${u} ${mode} : aucun élément d'une autre unité`);
      v(E.c.cadres > 0 && E.propre, `${vue} ${u} ${mode} : dessiné en graphique propre (${E.c.cadres} zones cliquables, ${E.c.etiquettes.posees}/${E.c.etiquettes.demandees} étiquettes posées)`);
      v(/^Tendance /.test(E.badge) && /^En /.test(E.carte), `${vue} ${u} ${mode} : badge « ${E.badge.slice(0, 60)} » et carte de résumé`);
      v(E.lect.objets.every(o => E.noms.includes(o.nom) || mode === 'essentiel'), `${vue} ${u} ${mode} : lecture_ict liste des objets aux mêmes noms que l'écran`);
      if (u === 'J' || u === 'H4') v(!E.noms.some(n => /^(Londres|New York|Minuit|Range Asie)/.test(n)), `${vue} ${u} ${mode} : ni killzone ni range asiatique`);
      await p.screenshot({ path: `captures-or/ict-visuel-${vue}-${u}-${mode}.png` });
    }
  }
  /* ICT conservé : changement d'unité, Détails allumé puis éteint, rechargement */
  await unite(p, 'H1'); await p.evaluate(() => window.__or.ict.mode('complet')); await w(500);
  await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(1500); v(await p.evaluate(() => window.__or.graph.ictEtat().cadres > 0), `${vue} : l'ICT reste affiché quand on allume Détails`);
  await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(1500); v(await p.evaluate(() => window.__or.graph.ictEtat().cadres > 0), `${vue} : et quand on le rééteint (graphique propre)`);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.ict && window.__or.moteur.serie().length > 100 && document.querySelector('.tp-b-ict'), { timeout: 60000 }); await w(5000);
  const apres = await p.evaluate(() => ({ cadres: window.__or.graph.ictEtat().cadres, mode: window.__or.ict.etatIct().mode, actif: window.__or.ict.etatIct().actif, pressed: document.querySelector('.tp-b-ict').getAttribute('aria-pressed') }));
  v(apres.actif && apres.cadres > 0 && apres.mode === 'complet' && apres.pressed === 'true', `${vue} : après un rechargement l'ICT revient (${JSON.stringify(apres)})`);
  /* MA200 et ses boutons ne changent pas */
  v(await p.evaluate(() => !!document.querySelector('.tp-b-hj') && !!document.querySelector('.tp-b-details')), `${vue} : les boutons MA200 et Détails sont toujours là`);
  /* bulle d'un objet + « Rayle, explique » */
  const obj = await p.evaluate(() => { const L = window.__or.ict.modele().objets.find(o => o.kind === 'zone') || window.__or.ict.modele().objets[0]; window.__or.ict.ouvrirBulle(L); const b = document.querySelector('[data-ict-bulle]'); return { nom: L.nom, ouverte: !b.hidden, texte: b.innerText, bouton: !!b.querySelector('[data-ict-explique]') }; });
  v(obj.ouverte && obj.texte.includes(obj.nom) && /Pourquoi il est tracé/.test(obj.texte) && /Unité :/.test(obj.texte) && obj.bouton, `${vue} : la bulle de « ${obj.nom} » donne l'unité, les prix, pourquoi et le bouton « Rayle, explique »`);
  await p.evaluate(() => document.querySelector('[data-ict-explique]').click()); await w(300);
  v(await p.evaluate(n => (window.__or.ict.derniereQuestion() || '').includes(n), obj.nom), `${vue} : « Rayle, explique » prépare la question avec l'objet`);
  /* clic réel sur le graphique : sur un objet, la bulle s'ouvre */
  const pt = await p.evaluate(() => { const c = window.__or.graph.ictEtat(), conteneur = window.__or.graph.conteneur(), r = conteneur.getBoundingClientRect(); return { r: [r.left, r.top], n: c.cadres }; });
  v(pt.n > 0, `${vue} : zones cliquables disponibles pour un appui sur un objet`);
  /* commandes vocales */
  const dire = t => p.evaluate(x => window.TableauOr.commande(x), t);
  v(/caché/.test(await dire('cache l ICT')) && await p.evaluate(() => window.__or.graph.ictEtat().cadres === 0), `${vue} : « cache l'ICT »`);
  v(/ICT affiché/.test(await dire('affiche l ICT')) && await p.evaluate(() => window.__or.graph.ictEtat().cadres >= 0), `${vue} : « affiche l'ICT »`);
  v(/complet/.test(await dire('ICT complet')) && await p.evaluate(() => window.__or.ict.etatIct().mode === 'complet'), `${vue} : « ICT complet »`);
  v(/essentiel/.test(await dire('ICT essentiel')) && await p.evaluate(() => window.__or.ict.etatIct().mode === 'essentiel'), `${vue} : « ICT essentiel »`);
  if (vue === 'tel390') v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'tel390 : pas de défilement horizontal');
  v(p.__err.length === 0, `${vue} : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
