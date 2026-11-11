/* Test Chrome du Terminal unifié : onglets, sélecteur d'instruments, flèches, pages (Actualités, COT, Santé, Institutions, Calendrier), voix.
   Données RÉELLES lues par le serveur du PC (Yahoo, CFTC, Trésor, SPDR…) : le test échoue si une page affiche une panne qui ne vient pas d'une source.
   PC 1600, tablette 1024, téléphone 390. Prérequis : `node serveur.mjs 8123` à la racine ; BASE=http://127.0.0.1:8123 */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8123'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const ouvrir = async (l, h, url, mob = l < 900) => {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); for (const k of Object.keys(localStorage)) if (/^rayle_(or|invest|terminal)/.test(k)) localStorage.removeItem(k); } } catch (e) { /* */ } });
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__espaces && window.__or && window.__or.graph && window.__or.graph.etat().bougies.length > 20, { timeout: 60000 }).catch(() => {});
  return p;
};
const sansDebordement = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);

for (const [l, h] of [[1600, 900], [1024, 768], [390, 844]]) {
  /* ── or : onglets, libellés, flèches ── */
  const p = await ouvrir(l, h, '/agent-trading/front/or.html#trading'); await w(2500);
  const T = await p.evaluate(() => ({ marque: document.querySelector('.esp-marque').textContent, onglets: [...document.querySelectorAll('.esp-barre [data-espace]')].map(b => b.textContent), options: [...document.querySelectorAll('[data-instrument] option')].map(o => o.textContent), titre: document.title, corps: document.body.innerText }));
  v(T.marque === 'Terminal' && T.titre.startsWith('Terminal'), `${l}px : l'application s'appelle « Terminal »`);
  v(JSON.stringify(T.onglets) === JSON.stringify(['Graphique', 'Actualités', 'COT', 'Santé du marché', 'Institutions', 'Calendrier', 'Journal', 'Capital']), `${l}px : onglets ${T.onglets.join(' · ')}`);
  v(!/terminal de l.or|ancien terminal/i.test(T.corps), `${l}px : aucun libellé « terminal de l'or » / « ancien terminal »`);
  v(T.options.length === 8 && ['Or', 'Nasdaq 100', 'S&P 500', 'Bitcoin', 'Solana', 'Dollar', 'EUR/USD', 'USD/CHF'].every(x => T.options.includes(x)), `${l}px : sélecteur d'instruments (${T.options.join(', ')})`);
  v(await p.evaluate(() => document.querySelector('[data-instrument]').value === 'OR'), `${l}px : l'or est l'instrument par défaut`);
  v(await p.evaluate(() => /Kraken/.test(document.querySelector('[data-instrument-source]').textContent)), `${l}px : source et retard affichés`);
  v(await p.evaluate(() => !!document.querySelector('[data-ft-hist]') && window.__or.flechesT), `${l}px : interrupteur « Flèches : historique 30 j »`);
  const F1 = await p.evaluate(() => window.__or.flechesT.etat()); v(F1.barres > 200, `${l}px : flèches calculées sur ${F1.barres} bougies H1 closes (${F1.n} flèche(s), ${F1.visibles} visible(s))`);
  await p.evaluate(() => window.__or.flechesT.fixerHistorique(false)); const F2 = await p.evaluate(() => window.__or.flechesT.etat()); await p.evaluate(() => window.__or.flechesT.fixerHistorique(true)); const F3 = await p.evaluate(() => window.__or.flechesT.etat());
  v(F2.visibles <= F3.visibles && F3.hist === true, `${l}px : l'interrupteur réduit/rétablit l'historique (${F2.visibles} → ${F3.visibles})`);
  v(await p.evaluate(() => window.__or.graph.flechesTerminalEtat().n === window.__or.flechesT.etat().visibles), `${l}px : les flèches visibles sont transmises au graphique`);
  v(await sansDebordement(p), `${l}px : pas de débordement horizontal (Graphique)`);
  if (l === 1600) await p.screenshot({ path: 'captures-or/terminal-v2-or-1600.png' });
  v(p.__err.length === 0, `${l}px : aucune erreur de page (${p.__err.slice(0, 2).join(' | ')})`);

  /* ── pages ── */
  for (const [k, attendu] of [['actualites', /Résumé de Rayle/], ['cot', /Ce que ça veut dire/], ['sante', /MA200|Dollar/], ['institutions', /13F|SEC/], ['calendrier', /Impact|Événement/]]) {
    await p.evaluate(kk => window.__espaces.aller(kk), k); await p.waitForFunction(kk => { const z = document.querySelector(`[data-zone="${kk}"]`); return z && !z.hidden && !/Chargement…/.test(z.innerText); }, { timeout: 60000 }, k).catch(() => {}); await w(300);
    const txt = await p.evaluate(kk => document.querySelector(`[data-zone="${kk}"]`).innerText, k);
    v(attendu.test(txt), `${l}px : page ${k} chargée`);
    v(!/\[object|undefined|NaN/.test(txt), `${l}px : page ${k} sans « undefined » ni « NaN »`);
    v(await sansDebordement(p), `${l}px : page ${k} sans débordement horizontal`);
    if (k === 'cot' || k === 'sante') v(await p.evaluate(kk => document.querySelectorAll(`[data-zone="${kk}"] svg.pg-svg`).length >= 2, k), `${l}px : page ${k} avec graphiques`);
    if (l === 1600) await p.screenshot({ path: `captures-or/terminal-v2-${k}-1600.png`, fullPage: false });
  }
  v(p.__err.length === 0, `${l}px : aucune erreur de page après les pages (${p.__err.slice(0, 2).join(' | ')})`);
  /* ── journal et capital ── */
  await p.evaluate(() => window.__espaces.aller('journal')); await w(500);
  v(await p.evaluate(() => { const j = document.querySelector('[data-journal-bloc]'); return !!j && j.offsetParent !== null && document.querySelector('.tor-ecran1').offsetParent === null; }), `${l}px : onglet Journal = le journal (sans le graphique)`);
  await p.evaluate(() => window.__espaces.aller('capital')); await w(800);
  v(await p.evaluate(() => !document.querySelector('[data-zone="capital"]').hidden && document.querySelector('#vue').hidden), `${l}px : onglet Capital`);
  await p.close();
}

/* ── autres instruments : mêmes outils, source et retard affichés ── */
for (const id of ['NASDAQ', 'SP500', 'BTC', 'SOL', 'DXY', 'EURUSD', 'USDCHF']) {
  const p = await ouvrir(1600, 900, `/agent-trading/front/or.html?actif=${id}#trading`); await w(3000);
  const E = await p.evaluate(() => ({ barres: window.__or.graph.etat().bougies.length, titre: document.querySelector('.tor-titre').innerText, source: document.querySelector('[data-instrument-source]').textContent, valeur: document.querySelector('[data-instrument]').value, prix: window.__or.moteur.S.prix, ft: window.__or.flechesT && window.__or.flechesT.etat(), avert: (document.querySelector('[data-avert-instrument]') || {}).textContent || '', bandeau: (document.querySelector('[data-bandeau]') || {}).textContent || '', cles: Object.keys(localStorage).filter(k => /^rayle_or_.*__/.test(k)) }));
  v(E.valeur === id && E.barres > 100, `${id} : ${E.barres} bougies chargées, prix ${E.prix} (${E.titre.replace(/\s+/g, ' ').slice(0, 60)})`);
  v(/Yahoo/.test(E.source) && /(temps|différé|quasi)/i.test(E.source), `${id} : source et retard affichés (${E.source.slice(0, 80)})`);
  v(E.ft && E.ft.barres > 200, `${id} : flèches calculées sur ${E.ft ? E.ft.barres : 0} bougies H1 (${E.ft ? E.ft.n : 0} flèche(s))`);
  v(/pas transposables/.test(E.avert), `${id} : avertissement sur les statistiques de l'or`);
  v(E.cles.length > 0, `${id} : données de l'instrument stockées à part (${E.cles[0] || 'aucune'})`);
  v(!/Kraken/.test(E.bandeau), `${id} : le bandeau ne parle pas de Kraken (${E.bandeau.slice(0, 80)})`);
  await p.screenshot({ path: `captures-or/terminal-v2-${id}-1600.png` });
  v(p.__err.length === 0, `${id} : aucune erreur de page (${p.__err.slice(0, 2).join(' | ')})`);
  await p.close();
}

/* ── voix ── */
{
  const p = await ouvrir(1600, 900, '/agent-trading/front/or.html#trading'); await w(1500);
  const R = {};
  for (const [k, t] of [['cot', 'explique le COT'], ['sante', 'où en est la santé du marché'], ['banques', 'qu\'ont dit les banques cette semaine'], ['change', 'qu\'est-ce qui change pour l\'or']]) R[k] = await p.evaluate(tt => window.__espaces.commande(tt), t);
  for (const k of Object.keys(R)) { v(typeof R[k] === 'string' && R[k].length > 40, `voix « ${k} » : réponse (${String(R[k]).slice(0, 90)}…)`); v(!/\b(achète|achetez|acheter|vends|vendez|vendre)\b/i.test(R[k]), `voix « ${k} » : aucun conseil d'achat ou de vente`); }
  v(await p.evaluate(() => { const s = window.__espaces; return typeof s.instantane === 'function'; }), 'Rayle lit chaque page : instantané structuré disponible');
  const snaps = await p.evaluate(() => window.__espaces.instantanes()); v(['cot', 'sante', 'institutions', 'calendrier'].every(k => snaps[k]), `instantanés structurés : ${Object.keys(snaps).join(', ')}`);
  const sw = await p.evaluate(() => window.__espaces.commande('passe sur le bitcoin')); v(/Bitcoin/.test(sw), `voix : changement d'instrument (${sw})`);
  await p.close();
}
await nav.close(); console.log(ko ? `${ko} ÉCHEC(S)` : 'tout passe'); process.exit(ko ? 1 : 0);
