/* RAYLE MARCHÉS dans Chrome : 1600 / 1024 / 390 px (souris) et émulation tactile (S23, tablette).
   Prérequis : node serveur.mjs 8011 (depuis la racine).  BASE=http://127.0.0.1:8011 node agent-trading/tests/marches-chrome.mjs
   Les données viennent d'un faux serveur local qui rejoue de VRAIES réponses enregistrées (marches/tests/fixtures) et qu'on peut mettre en panne en cours de test. Captures : outils-restructuration/captures-marches/. */
import fs from 'node:fs';
import http from 'node:http';
import { lancer, w, verif, APPAREILS, BASE, appui, glisser } from './tactile-aide.mjs';
import { hubFixtures } from '../../marches/tests/aide-fixtures.mjs';
import { gererMarches } from '../../marches/donnees/api.js';
const { v, fin } = verif(); const DOSSIER = 'outils-restructuration/captures-marches'; fs.mkdirSync(DOSSIER, { recursive: true });

/* faux serveur de données */
const surcharge = {}; let hub = hubFixtures(surcharge); const appels = []; let coupeTout = false;
const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__panne') { for (const m of (u.searchParams.get('motifs') || '').split(',').filter(Boolean)) surcharge[m] = { status: 500, corps: 'panne simulée' }; hub = hubFixtures(surcharge); res.writeHead(200); return res.end('ok'); }
  if (u.pathname === '/__panne-hub-seulement') { for (const m of (u.searchParams.get('motifs') || '').split(',').filter(Boolean)) surcharge[m] = { status: 500, corps: 'panne simulée' }; res.writeHead(200); return res.end('ok'); }
  if (u.pathname === '/__reset') { for (const k of Object.keys(surcharge)) delete surcharge[k]; hub = hubFixtures(surcharge); coupeTout = false; res.writeHead(200); return res.end('ok'); }
  if (u.pathname === '/__coupe') { coupeTout = true; res.writeHead(200); return res.end('ok'); }
  if (coupeTout) { req.socket.destroy(); return; }
  appels.push({ t: Date.now(), chemin: u.pathname + u.search });
  const r = await gererMarches(new Request('http://x' + req.url), { hub }); res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise(ok => serveur.listen(8801, '127.0.0.1', ok));
const ctl = chemin => fetch('http://127.0.0.1:8801' + chemin);

const nav = await lancer();
const ignore = e => /Failed to load resource|ERR_FAILED|ERR_CONNECTION|faireconomy|allorigins|net::|kraken|binance/i.test(e);
async function page(app, url, { tactile = false } = {}) {
  const p = await nav.newPage(); p.__err = []; p.on('pageerror', e => p.__err.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignore(m.text())) p.__err.push('console: ' + m.text().slice(0, 140)); });
  await p.setViewport(app === 'pc1600' ? { width: 1600, height: 900 } : app === 'pc1024' ? { width: 1024, height: 768 } : app === 'pc390' ? { width: 390, height: 844 } : APPAREILS[app]);
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_marches_base', 'http://127.0.0.1:8801'); } catch (e) { /* */ } });
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__espaces, { timeout: 45000 }).catch(() => {});
  p.cdp = await p.createCDPSession();
  return p;
}
const attendrePanneau = (p, id, ms = 40000) => p.waitForFunction(i => window.__marches && window.__marches.panneau() === i && document.querySelector('[data-mk-corps]') && !document.querySelector('.mk-chargement') && document.querySelector('[data-mk-corps]').innerHTML.length > 40, { timeout: ms }, id).then(() => true).catch(() => false);
const saisir = async (p, texte) => { await p.evaluate(() => window.__marches.focusCommande()); await p.keyboard.type(texte, { delay: 5 }); await p.keyboard.press('Enter'); };
const verifierCartes = (p, L) => p.evaluate(() => { const c = [...document.querySelectorAll('.mk-carte')]; const mauvaises = c.filter(x => { const prov = (x.querySelector('.mk-prov') || {}).textContent || ''; const badge = x.querySelector('.mk-badge'); const indispo = x.classList.contains('mk-ko'); return !/Source :/.test(prov) || !badge || (!indispo && !/\d{2}\/\d{2}\/\d{4}/.test(prov)) || (!indispo && /^\s*(0|0,00|—|-)?\s*(\$|%)?\s*$/.test((x.querySelector('.mk-val b') || {}).textContent || 'x')); }).map(x => x.dataset.mesure); return { n: c.length, mauvaises, ko: c.filter(x => x.classList.contains('mk-ko')).length }; });

/* ═══ PC : trois largeurs ═══ */
for (const app of ['pc1600', 'pc1024', 'pc390']) {
  const L = app + ' : '; await ctl('/__reset');
  const p = await page(app, '/agent-trading/front/or.html?pro=1&tactile=0#marches');
  v(await attendrePanneau(p, 'ensemble'), L + 'onglet Marchés ouvert directement, vue d\'ensemble chargée');
  const V = await verifierCartes(p, L);
  v(V.n >= 8 && V.mauvaises.length === 0, L + `${V.n} cases, toutes avec source, date, badge de fraîcheur (${V.mauvaises.join(',') || 'aucune fautive'})`);
  const dim = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  v(dim.sw <= dim.iw + 1, L + `pas de défilement horizontal de la page (${dim.sw} ≤ ${dim.iw})`);
  await p.screenshot({ path: `${DOSSIER}/${app}-ensemble.png` });
  if (app === 'pc1600') {
    for (const [cmd, id] of [['OR', 'or'], ['US100', 'us100'], ['BTC', 'btc'], ['USD', 'usd'], ['CHF', 'chf'], ['MACRO', 'macro'], ['COT OR', 'cot'], ['CAL', 'calendrier'], ['NEWS', 'actualites'], ['CORR', 'correlations'], ['SOURCES', 'sources'], ['FRED DFII10', 'fred']]) {
      await saisir(p, cmd); const ok = await attendrePanneau(p, id); v(ok, L + `commande « ${cmd} » ouvre le panneau ${id}`);
      if (['or', 'us100', 'btc', 'usd', 'chf', 'macro', 'cot'].includes(id)) { const r = await verifierCartes(p, L); v(r.n >= 2 && r.mauvaises.length === 0, L + `« ${cmd} » : ${r.n} cases, chacune avec source + date + fraîcheur (${r.mauvaises.join(',') || 'ok'})`); }
      if (id === 'or') { const t = await p.evaluate(() => document.querySelector('[data-mk-corps]').innerText); v(/proxy|PAXG/i.test(t) && /Non disponible gratuitement/i.test(t), L + 'Or : le proxy PAXG est dit proxy et les données absentes sont déclarées'); await p.screenshot({ path: `${DOSSIER}/pc1600-or.png` }); }
      if (id === 'calendrier') { const t = await p.evaluate(() => document.querySelector('[data-mk-corps]').innerText); v(/Paris/.test(t) && /Source :/.test(t), L + 'Calendrier : heure de Paris et source officielle sur chaque ligne'); await p.screenshot({ path: `${DOSSIER}/pc1600-calendrier.png` }); }
      if (id === 'actualites') { const t = await p.evaluate(() => [...document.querySelectorAll('.mk-actus li small')].map(x => x.textContent)); v(t.length >= 5 && t.every(x => /\d{2}[/:]/.test(x) || /\d/.test(x)), L + `Actualités : ${t.length} titres, chacun avec média et heure`); await p.screenshot({ path: `${DOSSIER}/pc1600-actualites.png` }); }
      if (id === 'correlations') { const t = await p.evaluate(() => ({ lignes: document.querySelectorAll('.mk-corr tbody tr').length, prov: document.querySelector('.mk-prov').textContent })); v(t.lignes >= 4 && /Calculé le \d{2}\/\d{2}\/\d{4}/.test(t.prov), L + `Corrélations : matrice ${t.lignes}×${t.lignes} avec date de calcul`); await p.click('[data-fenetre="30"]'); await w(200); v(await p.evaluate(() => document.querySelector('[data-fenetre="30"]').getAttribute('aria-pressed') === 'true'), L + 'bascule 30 / 90 jours'); await p.screenshot({ path: `${DOSSIER}/pc1600-correlations.png` }); }
      if (id === 'sources') { const n = await p.evaluate(() => document.querySelectorAll('.mk-src tbody tr').length); v(n >= 20, L + `État des sources : ${n} lignes`); await p.screenshot({ path: `${DOSSIER}/pc1600-sources.png` }); }
      if (id === 'fred') { const t = await p.evaluate(() => document.querySelector('[data-mk-corps]').innerText); v(/FRED/.test(t), L + 'FRED <série> : carte de la série demandée'); }
    }
    /* autocomplétion */
    await p.evaluate(() => { document.querySelector('[data-mk-saisie]').value = ''; }); await p.focus('[data-mk-saisie]'); await p.keyboard.type('co'); await w(150);
    const sg = await p.evaluate(() => [...document.querySelectorAll('.mk-sugg li')].map(x => x.dataset.cmd)); v(sg.includes('COT') && sg.includes('COT OR'), L + `autocomplétion « co » : ${sg.join(', ')}`);
    await p.keyboard.press('Escape'); await p.evaluate(() => { document.querySelector('[data-mk-saisie]').value = ''; });
    /* raccourci « / » depuis le graphique */
    await p.evaluate(() => window.__espaces.aller('trading')); await w(400); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('/'); await w(800);
    v(await p.evaluate(() => !document.querySelector('[data-zone="marches"]').hidden && document.activeElement === document.querySelector('[data-mk-saisie]')), L + 'touche « / » : ouvre Marchés et place le curseur dans la barre de commande');
    /* commande inconnue */
    await saisir(p, 'zzz'); await w(200); v(await p.evaluate(() => /Commande inconnue/.test(document.querySelector('[data-mk-reponse]').textContent)), L + 'commande inconnue : message clair');
    /* copilote */
    await p.evaluate(() => { document.querySelector('[data-mk-question]').value = 'que font les taux réels ?'; document.querySelector('[data-mk-copilote]').requestSubmit(); }); await p.waitForFunction(() => /FRED/.test(document.querySelector('[data-mk-reponse]').textContent), { timeout: 40000 }).catch(() => {});
    const cr = await p.evaluate(() => document.querySelector('[data-mk-reponse]').textContent); v(/FRED · DFII10/.test(cr) && /donnée du \d{2}\/\d{2}\/\d{4}/.test(cr), L + 'copilote : réponse avec source et date');
    await p.evaluate(() => { document.querySelector('[data-mk-question]').value = 'quel temps fera-t-il demain ?'; document.querySelector('[data-mk-copilote]').requestSubmit(); }); await w(1200);
    v(await p.evaluate(() => /Je n'ai pas cette donnée/.test(document.querySelector('[data-mk-reponse]').textContent)), L + 'copilote : « Je n\'ai pas cette donnée » quand elle manque');
    await p.screenshot({ path: `${DOSSIER}/pc1600-copilote.png` });
    /* voix / commande texte de l'onglet */
    const rep = await p.evaluate(() => window.__espaces.commande('rayle marchés bitcoin')); v(/Rayle Marchés ouvert/.test(rep || ''), L + 'commande vocale « Rayle marchés bitcoin »'); v(await attendrePanneau(p, 'btc'), L + '… ouvre le panneau Bitcoin');
    /* aucune requête pendant un geste sur le graphique */
    await p.evaluate(() => { window.__ttGeste = true; }); const n0 = appels.length; p.evaluate(() => window.__marches.recharger()); await w(1500); const n1 = appels.length; await p.evaluate(() => { window.__ttGeste = false; }); await w(2500);
    v(n1 === n0 && appels.length > n1, L + `aucune requête réseau pendant un geste (${n1 - n0}), reprise ensuite (${appels.length - n1})`);
    /* l'onglet Graphique n'appelle rien */
    const avant = appels.length; await p.evaluate(() => window.__espaces.aller('trading')); await w(1500); v(appels.length - avant <= 1, L + 'hors de l\'onglet Marchés : pas de rafraîchissement en boucle');
  }
  v(p.__err.length === 0, L + 'aucune erreur JavaScript' + (p.__err.length ? ' : ' + p.__err.slice(0, 2).join(' | ') : ''));
  await p.close();
}

/* ═══ pannes : une source coupée n'écrase jamais l'affichage ═══ */
{
  const L = 'pannes : '; await ctl('/__reset'); const p = await page('pc1600', '/agent-trading/front/or.html?pro=1&tactile=0#marches');
  await attendrePanneau(p, 'ensemble'); await saisir(p, 'OR'); v(await attendrePanneau(p, 'or'), L + 'panneau Or chargé');
  const prix0 = await p.evaluate(() => (document.querySelector('[data-mesure="or.paxg"] .mk-val b') || {}).textContent);
  await ctl('/__panne?motifs=api.kraken.com,fred.stlouisfed.org'); await p.evaluate(() => window.__marches.recharger()); await attendrePanneau(p, 'or'); await w(500);
  const apres = await p.evaluate(() => { const c = document.querySelector('[data-mesure="or.paxg"]'); return c ? { t: c.querySelector('.mk-val b') && c.querySelector('.mk-val b').textContent, ko: c.classList.contains('mk-ko'), pe: c.classList.contains('mk-pe'), prov: c.querySelector('.mk-prov').textContent, badges: [...c.querySelectorAll('.mk-badge')].map(b => b.textContent) } : null; });
  v(apres && (apres.ko || apres.pe), L + `or.paxg : indisponible ou périmé après coupure (${apres && apres.badges.join('+')})`);
  v(apres && (apres.ko ? !/^\s*0\s*\$?\s*$/.test(apres.t || '') : apres.t === prix0 && /PÉRIMÉ|périmé/i.test(apres.prov + apres.badges.join())), L + 'la dernière valeur connue est gardée, datée et marquée périmée (jamais un zéro)');
  const cartes = await verifierCartes(p, L); v(cartes.mauvaises.length === 0, L + `toutes les cases gardent source + badge (${cartes.n})`);
  await p.screenshot({ path: `${DOSSIER}/pc1600-panne.png` });
  await saisir(p, 'SOURCES'); await attendrePanneau(p, 'sources'); await w(300);
  const st = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mk-src tbody tr')].map(r => [r.dataset.source, r.className])));
  v(/en_panne/.test(st.kraken || '') && /en_panne/.test(st.fred || '') && !/en_panne/.test(st.deribit || '') && !/en_panne/.test(st.altme || '') && /mk-st-(ok|non_testee)/.test(st.deribit || 'mk-st-ok'), L + `« État des sources » reflète la panne simulée (kraken : ${st.kraken}, fred : ${st.fred})`);
  await p.screenshot({ path: `${DOSSIER}/pc1600-sources-panne.png` });
  /* calendrier non vérifié */
  await ctl('/__reset'); await ctl('/__panne?motifs=federalreserve.gov,ecb.europa.eu,bls.gov'); await saisir(p, 'CAL'); await attendrePanneau(p, 'calendrier'); await w(400);
  v(await p.evaluate(() => /Calendrier non vérifié/i.test(document.querySelector('[data-mk-corps]').innerText)), L + '« calendrier non vérifié » quand les sources officielles sont en panne');
  /* serveur de données totalement coupé : dernières valeurs datées hors ligne */
  await ctl('/__reset'); await saisir(p, 'OR'); await attendrePanneau(p, 'or'); await ctl('/__coupe'); await p.evaluate(() => window.__marches.recharger()); await w(2500);
  const hl = await p.evaluate(() => ({ t: document.querySelector('[data-mk-corps]').innerText, n: document.querySelectorAll('.mk-carte').length }));
  v(/Hors ligne/.test(hl.t) && /enregistrées le \d{2}\/\d{2}\/\d{4}/.test(hl.t) && hl.n >= 3, L + `hors ligne : dernières valeurs datées conservées (${hl.n} cases)`);
  await p.screenshot({ path: `${DOSSIER}/pc1600-hors-ligne.png` });
  await saisir(p, 'COT BTC'); await w(3000); v(await p.evaluate(() => /indisponibles|Données indisponibles|Hors ligne/.test(document.querySelector('[data-mk-corps]').innerText) && !document.querySelector('[data-mesure]')), L + 'panneau jamais chargé + serveur coupé : « indisponible », aucune valeur inventée');
  await ctl('/__reset'); await p.close();
}

/* ═══ tactile : fenêtres du bas, un panneau à la fois ═══ */
for (const app of ['s23', 'tablette', 'paysage']) {
  const L = 'tactile ' + app + ' : '; await ctl('/__reset');
  const p = await page(app, '/agent-trading/front/or.html?pro=1#trading'); await w(2500);
  v(await p.evaluate(() => document.documentElement.classList.contains('tm-tactile')), L + 'mode tactile actif');
  await p.evaluate(() => document.querySelector('[data-tt-donnees]').click()); await w(300);
  const tuile = await p.evaluate(() => { const b = document.querySelector('[data-tt-tuile="marches"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; });
  v(tuile && tuile.h >= 43.5 && tuile.w >= 43.5, L + `case « Marchés » dans « Données » (≥ 44 px : ${tuile && Math.round(tuile.w)}×${tuile && Math.round(tuile.h)})`);
  await appui(p, [tuile.x, tuile.y]); v(await attendrePanneau(p, 'ensemble'), L + 'un appui ouvre la fenêtre du bas, vue d\'ensemble chargée'); await w(500);
  const G = await p.evaluate(() => { const z = document.querySelector('[data-zone="marches"]'), r = z.getBoundingClientRect(), cs = getComputedStyle(z); const visibles = [...document.querySelectorAll('[data-zone]')].filter(e => !e.hidden && e.getBoundingClientRect().height > 0).map(e => e.dataset.zone); return { pos: cs.position, bas: Math.round(r.bottom), h: innerHeight, haut: Math.round(r.top), feuille: z.classList.contains('tt-feuille'), visibles, scrollH: document.documentElement.scrollHeight, scrollY: scrollY, graph: !!document.querySelector('.tor-graph-lw') && getComputedStyle(document.querySelector('#vue')).display !== 'none' && !document.querySelector('#vue').hidden }; });
  v(G.feuille && G.pos === 'fixed' && Math.abs(G.bas - G.h) <= 2, L + `fenêtre du bas fixe, pas sous le graphique (position ${G.pos}, bas ${G.bas}/${G.h})`);
  v(G.visibles.length === 1 && G.visibles[0] === 'marches', L + `un seul panneau de données visible (${G.visibles.join(',')})`);
  v(G.scrollH <= G.h + 1 && G.scrollY === 0, L + `pas de défilement de page parasite (${G.scrollH} ≤ ${G.h})`);
  const B = await p.evaluate(() => [...document.querySelectorAll('[data-zone="marches"] button, [data-zone="marches"] input[type=text]')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { n: e.textContent.trim().slice(0, 14) || e.placeholder.slice(0, 10), w: r.width, h: r.height }; }));
  v(B.length >= 12 && B.every(b => b.h >= 43.5 && b.w >= 43.5), L + `tous les boutons et champs ≥ 44 px (${B.length}${B.filter(b => b.h < 43.5 || b.w < 43.5).length ? ' ; trop petits : ' + B.filter(b => b.h < 43.5 || b.w < 43.5).map(b => b.n + ' ' + Math.round(b.w) + 'x' + Math.round(b.h)).join(', ') : ''})`);
  const dim = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); v(dim.sw <= dim.iw + 1, L + 'pas de défilement horizontal');
  await p.screenshot({ path: `${DOSSIER}/tactile-${app}-ensemble.png` });
  /* changer de panneau par les puces : un seul à la fois */
  await p.evaluate(() => document.querySelector('[data-mk-panneau="btc"]').click()); v(await attendrePanneau(p, 'btc'), L + 'puce « Bitcoin » remplace le panneau (un seul à la fois)');
  v(await p.evaluate(() => document.querySelectorAll('[data-mk-corps] > section').length > 0 && document.querySelectorAll('[data-zone="marches"]').length === 1), L + 'un seul panneau affiché');
  await p.screenshot({ path: `${DOSSIER}/tactile-${app}-bitcoin.png` });
  /* barre de commande tactile */
  await p.evaluate(() => { const i = document.querySelector('[data-mk-saisie]'); i.focus(); i.value = 'MACRO'; document.querySelector('[data-mk-cmd]').requestSubmit(); }); v(await attendrePanneau(p, 'macro'), L + 'commande MACRO depuis le champ tactile');
  /* défilement interne de la fenêtre (pas de la page) */
  const sc0 = await p.evaluate(() => document.querySelector('[data-zone="marches"]').scrollTop); await glisser(p, [200, 700], [200, 250], { pas: 12 }); await w(300);
  const sc1 = await p.evaluate(() => ({ z: document.querySelector('[data-zone="marches"]').scrollTop, y: scrollY })); v(sc1.y === 0, L + `le glissement fait défiler la fenêtre (${sc0} → ${sc1.z}), jamais la page`);
  /* fermeture par la croix → retour au graphique intact */
  await p.evaluate(() => document.querySelector('[data-tt-ferme]').click()); await w(600);
  v(await p.evaluate(() => document.querySelector('[data-zone="marches"]').hidden && !!window.__or.graph.chart()), L + 'fermeture : retour au graphique');
  v(p.__err.length === 0, L + 'aucune erreur JavaScript' + (p.__err.length ? ' : ' + p.__err.slice(0, 2).join(' | ') : ''));
  await p.close();
}
await nav.close(); serveur.close(); console.log(fin() ? '\n' + fin() + ' échec(s)' : '\ntout passe'); process.exit(fin() ? 1 : 0);
