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
  await pc.waitForFunction(p => { const S = window.__or.moteur.S; return S.niveauxP && S.fleches && S.fleches.periode === p; }, { timeout: 60000 }, P); await w(600);
  const nv = await pc.evaluate(() => {
    const T = window.__or, S = T.moteur.S, N = S.niveauxP, ch = T.graph.chart(), d = T.graph.serie().data(), r = ch.timeScale().getVisibleLogicalRange();
    const vis = d.slice(Math.max(0, Math.ceil(r.from)), Math.floor(r.to) + 1), hi = Math.max(...vis.map(b => b.high)), lo = Math.min(...vis.map(b => b.low));
    const M = T.graph.marquesAffichees();
    return { a: N.a, version: N.version || null, prix: S.prix, hi, lo, bandes: N.bandes.map(b => ({ bas: b.bas, haut: b.haut, p: b.p, cote: b.cote, fort: b.fort, texte: b.texte })), liq: (S.liquidite.zones || []).map(z => z.texte),
      fl: S.fleches.liste.length, rouges: M.filter(m => m.shape === 'arrowDown' && /ef5f5f/i.test(m.color)).length, vertes: M.filter(m => m.shape === 'arrowUp' && /4fd18b/i.test(m.color)).length,
      bilan: document.querySelector('[data-bilan-fleches]').textContent, E: T.graph.etiquettes() };
  });
  const parCote = c => nv.bandes.filter(b => b.cote === c).length, tri = nv.bandes.slice().sort((x, y) => x.bas - y.bas);
  const maxC = P === 'H1' ? 8 : 4;   /* H1 : 6 (niveaux-h1-v5) + 2 retournés (niveaux-h1-v6) */ verifier(parCote('resistance') <= maxC && parCote('support') <= maxC && nv.bandes.length >= 2 && (P !== 'H1' || nv.version === 'niveaux-h1-v6'), `${P} : ${parCote('resistance')} résistances et ${parCote('support')} supports (≤ ${maxC} de chaque côté${P === 'H1' ? ', règles niveaux-h1-v6' : ''})`, nv.bandes.map(b => (b.fort ? '■ ' : '□ ') + b.texte).join(' | '));
  verifier(tri.every((b, i) => !i || b.bas - tri[i - 1].haut >= nv.a - 1e-6), `${P} : bandes espacées d’au moins 1 ATR (${nv.a.toFixed(2)} $)`);
  const chevauche = nv.E.some((a, i) => nv.E.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  verifier(nv.E.length >= 1 && !chevauche, `${P} : ${nv.E.length} étiquettes alignées à droite, aucune ne se chevauche`, nv.E.map(e => e.texte).join(' | '));
  verifier(nv.E.every(e => /^(▲ |▼ )?(Résistance|Support|Liquidité (haute|basse)) [\d ]+/.test(e.texte) && e.texte.length <= 80), `${P} : étiquettes courtes en français`);
  verifier(nv.fl > 0 && nv.rouges + nv.vertes === nv.fl, `${P} : ${nv.fl} flèches (${nv.rouges} rouges vers le bas, ${nv.vertes} vertes vers le haut)`);
  verifier((P === 'H1' ? /^Flèches H1 \(version 7\)/.test(nv.bilan) && (/pas assez de données/.test(nv.bilan) || /au hasard \(même régime, mêmes heures\)/.test(nv.bilan)) : /Flèches de rebond/.test(nv.bilan) && (/pas assez de données/.test(nv.bilan) || /au hasard aux mêmes heures/.test(nv.bilan))) && /jamais un ordre/.test(nv.bilan), `${P} : bilan honnête sous le graphique${P === 'H1' ? ' (H1 : version 7, depuis le commit de sa règle)' : ''}`, nv.bilan.slice(0, 200));
  if (P === 'H4' || P === 'J') {   // acceptation : plus hauts et plus bas majeurs de l'historique visible présents, jamais tous autour du prix
    const couvre = x => nv.bandes.some(b => x >= b.bas - nv.a && x <= b.haut + nv.a);
    verifier(couvre(nv.hi) && couvre(nv.lo), `${P} : le plus haut (${nv.hi.toFixed(0)}) et le plus bas (${nv.lo.toFixed(0)}) visibles sont des niveaux affichés`);
    const etendue = Math.max(...nv.bandes.map(b => b.haut)) - Math.min(...nv.bandes.map(b => b.bas));
    verifier(etendue >= 0.6 * (nv.hi - nv.lo), `${P} : niveaux répartis sur ${Math.round(etendue)} $ (vue : ${Math.round(nv.hi - nv.lo)} $), pas regroupés autour du prix`);
  }
  await pc.screenshot({ path: path.join(SORTIE, `graphique-${P}-pc.png`) });
}
// détail au survol : une étiquette, puis une flèche (H1)
await pc.evaluate(() => window.__or.moteur.periode('H1'));
await pc.waitForFunction(() => { const S = window.__or.moteur.S; return S.periode === 'H1' && S.fleches && S.fleches.periode === 'H1'; }, { timeout: 60000 }); await w(1200);
const cible = await pc.evaluate(() => { const E = window.__or.graph.etiquettes(), r = document.querySelector('[data-graph]').getBoundingClientRect(), e = E[0]; return e && { x: r.left + e.x + e.w / 2, y: r.top + e.y + e.h / 2, texte: e.texte }; });
if (cible) { await pc.mouse.move(cible.x, cible.y); await w(300); const tip = await pc.evaluate(() => { const t = document.querySelector('.tor-info'); return t && !t.hidden ? t.innerText : ''; }); verifier(tip.length > 10 && tip.includes(cible.texte.slice(0, 12)), 'survol d’une étiquette : détail affiché', tip.replace(/\n/g, ' / ').slice(0, 200)); await pc.mouse.move(5, 5); }
const fl = await pc.evaluate(() => {
  const T = window.__or, ch = T.graph.chart(), se = T.graph.serie(), r = document.querySelector('[data-graph]').getBoundingClientRect(), vr = ch.timeScale().getVisibleRange(), d = se.data();
  for (const f of T.moteur.S.fleches.liste.slice().reverse()) {
    const b = d.find(x => x.time >= vr.from && x.time <= vr.to && Math.abs(x.time - (f.t / 1000)) < 7200 && Math.abs((f.sens === 'baisse' ? x.high : x.low) - (f.sens === 'baisse' ? Math.max(x.high) : Math.min(x.low))) < 1e-9);
    const tm = T.graph.marquesAffichees().find(m => m.id === 'f' + f.t); if (!tm) continue;
    const bar = d.find(x => x.time === tm.time); if (!bar) continue;
    const x = ch.timeScale().timeToCoordinate(tm.time); if (x == null || x < 20) continue;
    const y = f.sens === 'baisse' ? se.priceToCoordinate(bar.high) - 12 : se.priceToCoordinate(bar.low) + 12;
    return { x: r.left + x, y: r.top + y, sens: f.sens };
  }
  return null;
});
if (fl) { await pc.mouse.move(fl.x, fl.y); await w(400); const tip = await pc.evaluate(() => { const t = document.querySelector('.tor-info'); return t && !t.hidden ? t.innerText : ''; }); verifier(/Rebond/.test(tip) && /touches|régime H1 (haussier|baissier)/.test(tip) && /version fleches-h1-v7/.test(tip) && !/undefined/.test(tip) && /volume/.test(tip) && /jamais un ordre/.test(tip), `survol d’une flèche H1 ${fl.sens === 'baisse' ? 'rouge' : 'verte'} : niveau, touches ou régime, version, volume (plus de « undefined »)`, tip.replace(/\n/g, ' / ').slice(0, 220)); await pc.screenshot({ path: path.join(SORTIE, 'graphique-fleche-survol.png') }); await pc.mouse.move(5, 5); }
else verifier(false, 'une flèche visible en H1 pour le survol');
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
for (const P of ['M15', 'H1', 'H4', 'J']) {
  await tel.evaluate(p => window.__or.moteur.periode(p), P);
  await tel.waitForFunction(p => { const S = window.__or.moteur.S; return S.periode === p && S.hist && S.hist.periode === p; }, { timeout: 60000 }, P); await w(1000);
  const g = await lire(tel);
  verifier(g.panes === 2 && g.yHi >= 0 && g.yLo <= g.hPrix, `téléphone ${P} : bougies visibles dans l’échelle, volume à part`);
  await tel.waitForFunction(p => { const S = window.__or.moteur.S; return S.fleches && S.fleches.periode === p; }, { timeout: 60000 }, P); await w(500);
  const Et = await tel.evaluate(() => window.__or.graph.etiquettes());
  verifier(!Et.some((a, i) => Et.some((b, j) => j > i && a.y < b.y + b.h && b.y < a.y + a.h)), `téléphone ${P} : ${Et.length} étiquettes sans chevauchement`);
  await tel.screenshot({ path: path.join(SORTIE, `graphique-${P}-telephone.png`) });
}
verifier(await tel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'téléphone : pas de défilement horizontal');
await tel.close(); await pc.close();
verifier(!erreurs.length, 'aucune erreur de page', erreurs.slice(0, 5).join(' | '));
await nav.close();
console.log(`\n${nOk} réussis, ${echecs.length} échecs`); process.exit(echecs.length ? 1 : 0);
