/* Test Chrome du GRAPHIQUE de l'or avec les vraies données (Kraken par le relais dédié, Binance) : historique paginé et « historique de
   référence » dans une bande distincte, vue par défaut (150 bougies calées à droite), chargement en glissant vers la gauche, échelle de prix
   calée sur les bougies visibles seulement, volume dans son propre panneau, repères des niveaux hors champ, étiquettes propres (≤ 8).
   Vérifié en M5, M15, H1, H4 et Jour, sur PC et téléphone. Prérequis : node serveur.mjs 8011.  Usage : node agent-trading/tests/or-graphique-test.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011', SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m, d ? '· ' + d : ''); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
const JOUR = 86400e3, PROF = { M5: 30, M15: 182, H1: 330, H4: 330, J: 330 };   // H1/H4/J : la référence Binance commence le 11/12/2025
async function page(l, h, mobile = false) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  p.on('pageerror', e => erreurs.push(`${l}px : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/favicon|status of 404/i.test(m.text())) erreurs.push(`${l}px console : ${m.text().slice(0, 160)}`); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.moteur.S.hist && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 60000 });
  await w(1500); return p;
}
const lire = p => p.evaluate(() => {
  const T = window.__or, S = T.moteur.S, ch = T.graph.chart(), se = T.graph.serie(), d = se.data(), r = ch.timeScale().getVisibleLogicalRange();
  const vis = d.slice(Math.max(0, Math.ceil(r.from)), Math.floor(r.to) + 1), lo = Math.min(...vis.map(b => b.low)), hi = Math.max(...vis.map(b => b.high));
  const H = ch.panes()[0].getHeight(), yHi = se.priceToCoordinate(hi), yLo = se.priceToCoordinate(lo);
  return { n: d.length, ref: d.filter(b => b.color).length, k: S.k.length, debut: S.hist.debut, kEpuise: S.hist.krakenEpuise, debutK: S.k[0] && S.k[0].t,
    de: r.from, a: r.to, nv: vis.length, panes: ch.panes().length, hPrix: H, hVol: ch.panes()[1] ? ch.panes()[1].getHeight() : 0, yHi, yLo, source: document.querySelector('[data-source]').textContent };
});

/* ── PC 1600 × 900 : les cinq périodes ── */
const pc = await page(1600, 900);
for (const P of ['M5', 'M15', 'H1', 'H4', 'J']) {
  await pc.evaluate(p => window.__or.moteur.periode(p), P);
  await pc.waitForFunction(p => { const S = window.__or.moteur.S; return S.periode === p && S.hist && S.hist.periode === p && window.__or.graph.serie().data().length > 50; }, { timeout: 60000 }, P); await w(1200);
  const g = await lire(pc);
  const jours = (Date.now() - g.debut) / JOUR;
  verifier(jours >= PROF[P] - 1, `${P} : historique chargé sur ${jours.toFixed(0)} jours (${g.n} bougies, dont ${g.ref} de référence)`);
  verifier(P === 'M5' ? g.ref === 0 : g.kEpuise, `${P} : ${P === 'M5' ? '30 jours de Kraken, sans référence' : 'Kraken jusqu’à la mise en ligne du perpétuel, référence avant'}`, new Date(g.debutK).toISOString().slice(0, 10));
  verifier(g.nv >= 140 && g.nv <= 160 && g.a >= g.n - 1 + 3 && g.a <= g.n - 1 + 8, `${P} : vue par défaut ≈ 150 dernières bougies calées à droite avec une marge`, `${g.nv} visibles, ${(g.a - g.n + 1).toFixed(1)} de marge`);
  verifier(g.panes === 2 && g.hVol > 40 && g.hVol < g.hPrix / 2, `${P} : volume dans son propre panneau (${g.hVol} px sous ${g.hPrix} px)`);
  verifier(g.yHi >= 0 && g.yLo <= g.hPrix && g.yHi < g.hPrix * 0.2 && g.yLo > g.hPrix * 0.8, `${P} : échelle calée sur les bougies visibles (haut à ${g.yHi.toFixed(0)} px, bas à ${g.yLo.toFixed(0)} px sur ${g.hPrix})`);
  const E = await pc.evaluate(() => window.__or.graph.etiquettes());
  const chevauche = E.some((a, i) => E.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  verifier(E.length >= 1 && E.length <= 8 && !chevauche, `${P} : ${E.length} étiquettes (≤ 8), aucune ne se chevauche`, E.map(e => e.texte).join(' | '));
  verifier(E.every(e => !/\b(V\.|S\.|NY\.|Asi\.|Lon\.|Vol\.)|\bZ\d|\d+\/\d+/.test(e.texte)), `${P} : libellés en français clair, sans abréviation`);
  await pc.screenshot({ path: path.join(SORTIE, `graphique-${P}-pc.png`) });
}
// détail au survol : une étiquette fusionnée ou une zone montre ses niveaux
const cible = await pc.evaluate(() => { const E = window.__or.graph.etiquettes(), r = document.querySelector('[data-graph]').getBoundingClientRect(), e = E.find(x => x.n > 1) || E[0]; return e && { x: r.left + e.x + e.w / 2, y: r.top + e.y + e.h / 2, texte: e.texte, n: e.n }; });
if (cible) { await pc.mouse.move(cible.x, cible.y); await w(300); const tip = await pc.evaluate(() => { const t = document.querySelector('.tor-info'); return t && !t.hidden ? t.innerText : ''; }); verifier(tip.length > 10 && tip.includes(cible.texte.slice(0, 12)), `survol d’une étiquette : détail affiché (${cible.n} niveau${cible.n > 1 ? 'x' : ''})`, tip.replace(/\n/g, ' / ').slice(0, 200)); await pc.screenshot({ path: path.join(SORTIE, 'graphique-detail-survol.png') }); await pc.mouse.move(5, 5); }
// glisser vers la gauche (M5) : un morceau plus ancien se charge, la vue ne saute pas
await pc.evaluate(() => window.__or.moteur.periode('M5'));
await pc.waitForFunction(() => { const S = window.__or.moteur.S; return S.periode === 'M5' && S.hist && S.hist.periode === 'M5'; }, { timeout: 60000 }); await w(1000);
const av = await lire(pc);
const box = await pc.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; });
await pc.evaluate(() => { const ts = window.__or.graph.chart().timeScale(), r = ts.getVisibleLogicalRange(); ts.setVisibleLogicalRange({ from: 10, to: 10 + (r.to - r.from) }); });
await pc.waitForFunction(n => window.__or.graph.serie().data().length > n, { timeout: 60000 }, av.n); await w(1500);
const ap = await lire(pc);
verifier(ap.n >= av.n + 1900, `glisser à gauche : ${ap.n - av.n} bougies plus anciennes chargées`);
verifier(ap.de > 1000, 'la vue reste sur les mêmes bougies (pas de saut à gauche)', `${ap.de.toFixed(0)} → ${ap.a.toFixed(0)}`);
await pc.mouse.move(box.x, box.y);
// H1 : bande de référence visible quand on remonte avant le perpétuel
await pc.evaluate(() => window.__or.moteur.periode('H1'));
await pc.waitForFunction(() => { const S = window.__or.moteur.S; return S.periode === 'H1' && S.hist && S.hist.periode === 'H1'; }, { timeout: 60000 }); await w(1000);
await pc.evaluate(() => { const S = window.__or.moteur.S, d = window.__or.graph.serie().data(), i = d.findIndex(b => !b.color); window.__or.graph.chart().timeScale().setVisibleLogicalRange({ from: i - 120, to: i + 80 }); }); await w(1200);
const bande = await pc.evaluate(() => { const c = [...document.querySelectorAll('[data-graph] canvas')]; return { src: document.querySelector('[data-source]').textContent }; });
verifier(/référence Binance depuis/.test(bande.src), 'ligne de source : dates de l’historique Kraken et de la référence', bande.src.slice(-160));
await pc.screenshot({ path: path.join(SORTIE, 'graphique-H1-bande-reference.png') });

/* ── téléphone 390 × 844 ── */
const tel = await page(390, 844, true);
for (const P of ['M5', 'M15', 'H1', 'H4', 'J']) {
  await tel.evaluate(p => window.__or.moteur.periode(p), P);
  await tel.waitForFunction(p => { const S = window.__or.moteur.S; return S.periode === p && S.hist && S.hist.periode === p; }, { timeout: 60000 }, P); await w(1000);
  const g = await lire(tel);
  verifier(g.panes === 2 && g.yHi >= 0 && g.yLo <= g.hPrix, `téléphone ${P} : bougies visibles dans l’échelle, volume à part`);
  await tel.screenshot({ path: path.join(SORTIE, `graphique-${P}-telephone.png`) });
}
verifier(await tel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'téléphone : pas de défilement horizontal');
await tel.close(); await pc.close();
verifier(!erreurs.length, 'aucune erreur de page', erreurs.slice(0, 5).join(' | '));
await nav.close();
console.log(`\n${nOk} réussis, ${echecs.length} échecs`); process.exit(echecs.length ? 1 : 0);
