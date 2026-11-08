/* Test Chrome des flèches H1 (v7 par défaut, case v2 seulement) avec les VRAIES données (Kraken par le relais dédié, Binance) :
   - en H1, flèches affichées par défaut = fleches-h1-v7 (alternance verte / rouge, ≥ 24 bougies, jamais en range) ; case v2 pour comparer ;
     v1, v3, v4, v5, v6 calculées en arrière-plan, sans case ;
   - un segment par flèche v7 sur son niveau déclencheur, avec étiquette ; au survol : régime, distance, bougie de touche, de confirmation ;
   - M15, H4 : inchangés, cases cachées ; page fluide ; registre des 7 versions ; bilans depuis le commit de chaque règle ; journal.
   Prérequis : node serveur.mjs 8011.  Usage : node agent-trading/tests/or-fleches-h1-chrome-test.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011', SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m, d ? '· ' + d : ''); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
p.on('pageerror', e => erreurs.push(e.message));
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); localStorage.removeItem('rayle_or_registre_fleches_h1'); localStorage.removeItem('rayle_or_fleches_h1_choix_v7'); localStorage.setItem('rayle_or_fleches_h1_choix_v6', JSON.stringify(['fleches-h1-v5'])); });
await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__or && window.__or.moteur.S.hist && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 60000 }); await w(1500);

const controle = (versions) => p.evaluate(async versions => {
  const T = window.__or, S = T.moteur.S, NP = await import('/agent-trading/front/or/niveaux-periode.js'), V2 = await import('/agent-trading/front/or/fleches-h1-v2.js'), V7 = await import('/agent-trading/front/or/fleches-h1-v7.js'), H = await import('/agent-trading/front/or/historique-or.js');
  const serie = H.serieAffichee(S.hist, S.k, S.ecart), Vm = new Map((S.refP || []).map(b => [b.t, b.v])), n = Date.now();
  const calc = { 'fleches-v1': NP.fleches(serie, { periode: S.periode, maintenant: n, volumes: Vm }).map(f => f.t) };
  if (S.periode === 'H1') { const memo = new Map(), l = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, V7.listesQuatre(X, i)); return memo.get(X[i].t); };
    calc['fleches-h1-v2'] = V2.flechesH1v2(serie, { maintenant: n, volumes: Vm, listes: (X, i) => l(X, i).detail }).map(f => f.t);
    calc['fleches-h1-v7'] = V7.flechesH1v7(serie, { maintenant: n, listes: (X, i) => l(X, i).v7 }).map(f => f.t); }
  const dk = (S.hist && S.hist.debutKraken) || 0, apres = c => +c.split('|')[1] >= dk;
  const cleA = [...new Set(versions.flatMap(v => calc[v].map(t => v + '|' + t)))].sort(), cleB = S.fleches.liste.map(f => (S.periode === 'H1' ? f.version : 'fleches-v1') + '|' + f.t).sort();
  const M = T.graph.marquesAffichees().filter(m => /^f\d/.test(m.id)), F7 = S.flechesH1 ? S.flechesH1['fleches-h1-v7'] : [];
  return { version: S.fleches.version, versions: S.fleches.versions || null, n: S.fleches.liste.length, egal: JSON.stringify(cleA.filter(apres)) === JSON.stringify(cleB.filter(apres)) && cleA.every(c => cleB.includes(c)),
    nMarques: M.length, ids: M.map(m => m.id), textes: M.map(m => m.text || ''), longueurs: Object.fromEntries(Object.entries(calc).map(([k, v]) => [k, v.length])),
    regles7: F7.every((f, k) => !k || (f.sens !== F7[k - 1].sens && f.i - F7[k - 1].i >= 24)) && F7.every(f => f.regime === 'haussier' || f.regime === 'baissier') && F7.every(f => f.tTouche < f.t),
    segments: (S.segmentsH1 || []).length, segVus: T.graph.segments(), bilan: document.querySelector('[data-bilan-fleches]').textContent, casesCachees: document.querySelector('[data-versions-h1]').hidden };
}, versions);
const simples = c => c.ids.every(id => /^f\d+$/.test(id)) && c.textes.every(t => t === '');

/* 1. M15 inchangé */
await p.waitForFunction(() => { const S = window.__or.moteur.S; return S.fleches && S.fleches.periode === 'M15'; }, { timeout: 60000 });
const m15 = await controle(['fleches-v1']);
verifier(m15.version === 'fleches-v1' && m15.egal && m15.nMarques === m15.n && simples(m15) && m15.casesCachees && m15.segVus.length === 0, 'M15 : flèches v1 inchangées, aucune case, aucun segment', JSON.stringify({ n: m15.n }));

/* 2. H1 : v7 par défaut (après l'étude des zones, tâche longue sans rapport) */
await p.waitForFunction(() => { const e = window.__or.moteur.S.etudeEtat; return e === 'faite' || /^échec/.test(e); }, { timeout: 120000 }); await w(500);
const fluide = await p.evaluate(async () => {
  let pire = 0, der = performance.now(), fin = false; const mes = () => { const t = performance.now(); pire = Math.max(pire, t - der); der = t; if (!fin) setTimeout(mes, 16); }; mes();
  window.__or.moteur.periode('H1');
  const t0 = performance.now(); while (performance.now() - t0 < 180000) { await new Promise(r => setTimeout(r, 100)); const S = window.__or.moteur.S; if (S.fleches && S.fleches.periode === 'H1' && S.flechesH1) break; }
  fin = true; return { pire: Math.round(pire), duree: Math.round(performance.now() - t0) };
});
verifier(fluide.pire < 800, `H1 : la page reste fluide pendant le calcul (plus longue pause ${fluide.pire} ms, calcul ${fluide.duree} ms)`);
await w(800);
const h1 = await controle(['fleches-h1-v7']);
verifier(h1.version === 'fleches-h1-v7' && h1.egal && h1.nMarques === h1.n, 'H1 : par défaut, flèches affichées = fleches-h1-v7 (malgré un ancien choix « v5 »)', JSON.stringify(h1.longueurs));
verifier(h1.regles7, 'v7 : alternance verte / rouge, ≥ 24 bougies d’écart, jamais en range, touche avant la flèche');
verifier(simples(h1), 'H1, une seule version : marques comme avant (sans étiquette)');
verifier(h1.segments === h1.n && h1.n > 0, `un segment par flèche v7 (${h1.segments})`);
verifier(/^Flèches H1 \(version 7\) : .*depuis le 8 nov\. 2026, 10 h 38/.test(h1.bilan) && /Aucune décision avant 100/.test(h1.bilan), 'H1 : bilan de v7 depuis le commit de sa règle', h1.bilan.slice(0, 160));
const cases = await p.evaluate(() => { const b = document.querySelector('[data-versions-h1]'); return { vis: !b.hidden, toutes: [...b.querySelectorAll('[data-vh1]')].map(c => c.dataset.vh1), coches: [...b.querySelectorAll('[data-vh1]')].filter(c => c.checked).map(c => c.dataset.vh1) }; });
verifier(cases.vis && JSON.stringify(cases.toutes) === '["fleches-h1-v7","fleches-h1-v2"]' && JSON.stringify(cases.coches) === '["fleches-h1-v7"]', 'H1 : seulement les cases v7 et v2, v7 cochée par défaut', JSON.stringify(cases));
verifier(await p.evaluate(() => { const F = window.__or.moteur.S.flechesH1; return ['fleches-v1', 'fleches-h1-v3', 'fleches-h1-v4', 'fleches-h1-v5', 'fleches-h1-v6'].every(v => Array.isArray(F[v])); }), 'v1, v3, v4, v5 et v6 toujours calculées en arrière-plan');

/* 3. segment : on place la vue sur la dernière flèche v7, puis survol du segment */
const vu = await p.evaluate(async () => {
  const T = window.__or, S = T.moteur.S, d = T.graph.serie().data(), F = S.flechesH1['fleches-h1-v7'], f = F[F.length - 1], ts = d.map(b => b.time);
  const kT = ts.findIndex(t => t >= Math.floor(f.tTouche / 1000) - 7200), kC = ts.findIndex(t => t >= Math.floor(f.t / 1000) - 7200);
  T.graph.chart().timeScale().setVisibleLogicalRange({ from: Math.max(0, kT - 40), to: Math.min(d.length - 1, kC + 40) });
  await new Promise(r => setTimeout(r, 800)); return T.graph.segments();
});
verifier(vu.length >= 1 && vu.every(s => s.x1 > s.x0 && /^(Support|Résistance) /.test(s.libelle)), `segment dessiné avec son étiquette (${vu.length} visible(s))`, vu[0] && vu[0].libelle);
if (vu.length) {
  const s0 = vu[vu.length - 1], box = await p.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await p.mouse.move(box.x + (s0.x0 + s0.x1) / 2, box.y + s0.y); await w(600);
  const tip = await p.evaluate(() => { const t = document.querySelector('.tor-info'); return t && !t.hidden ? t.innerText : ''; });
  verifier(/niveau déclencheur de la flèche v7/.test(tip) && /régime H1/.test(tip) && /distance de la touche/.test(tip) && /bougie de touche/.test(tip) && /bougie de confirmation/.test(tip), 'survol du segment : régime, distance, bougie de touche, bougie de confirmation', tip.replace(/\n/g, ' / ').slice(0, 240));
}
await p.screenshot({ path: path.join(SORTIE, 'fleches-h1-v7.png') });

/* 4. comparer v7 et v2 ; une version cachée ne peut pas être forcée */
await p.evaluate(() => { const c = document.querySelector('[data-vh1="fleches-h1-v2"]'); c.checked = true; c.dispatchEvent(new Event('change')); }); await w(800);
const cmp = await controle(['fleches-h1-v2', 'fleches-h1-v7']);
verifier(JSON.stringify(cmp.versions) === '["fleches-h1-v2","fleches-h1-v7"]' && cmp.egal, 'comparaison : v2 et v7 affichées, chacune complète', JSON.stringify(cmp.longueurs));
verifier(JSON.stringify([...new Set(cmp.textes)].sort()) === '["v2","v7"]' && new Set(cmp.ids).size === cmp.ids.length, 'comparaison : chaque flèche porte sa version, aucune marque en double');
verifier(/^Flèches H1 \(comparaison\) : v2 : .*01 h 07.* \| v7 : .*10 h 38/.test(cmp.bilan), 'comparaison : un bilan par version, chacune depuis le commit de sa règle', cmp.bilan.slice(0, 200));
await p.evaluate(() => { const c = document.querySelector('[data-vh1="fleches-h1-v7"]'); c.checked = false; c.dispatchEvent(new Event('change')); }); await w(500);
verifier(await p.evaluate(() => (window.__or.moteur.S.segmentsH1 || []).length) === 0, 'v7 décochée : plus aucun segment');
const force = await p.evaluate(() => window.__or.moteur.versionsH1(['fleches-h1-v6', 'fleches-h1-v5']));
verifier(JSON.stringify(force) === '["fleches-h1-v7"]', 'v5 / v6 ne peuvent pas être affichées (retour à v7)', JSON.stringify(force));
verifier(await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('rayle_or_registre_fleches_h1') || 'null'); return r === null || ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4', 'fleches-h1-v5', 'fleches-h1-v6', 'fleches-h1-v7'].every(v => Array.isArray(r.versions[v])); }), 'registre daté des 7 versions (créé dès qu’une flèche nouvelle existe)');
verifier(await p.evaluate(() => [...document.querySelectorAll('details summary')].some(s => s.textContent.includes('flèches H1, version 7'))), 'règles figées de v7 consultables');

/* 5. H4 puis M15 inchangés */
for (const P of ['H4', 'M15']) {
  await p.evaluate(x => window.__or.moteur.periode(x), P);
  await p.waitForFunction(x => { const S = window.__or.moteur.S; return S.periode === x && S.hist && S.hist.periode === x && S.fleches && S.fleches.periode === x; }, { timeout: 90000 }, P); await w(800);
  const c = await controle(['fleches-v1']);
  verifier(c.version === 'fleches-v1' && c.egal && c.nMarques === c.n && simples(c) && c.casesCachees && c.segVus.length === 0, `${P} : flèches v1 inchangées, cases cachées, aucun segment`, JSON.stringify({ n: c.n }));
}
const j = await p.evaluate(() => { const s = document.querySelector('select[name="etiquette"]'), v = document.querySelector('select[name="versionFleche"]'); return { et: !!s && [...s.options].some(o => o.textContent === 'flèche H1'), v: !!v && [...v.options].map(o => o.value) }; });
verifier(j.et && j.v[0] === 'fleches-h1-v7' && j.v.includes('fleches-h1-v2'), 'journal : étiquette « flèche H1 » et version (v7 par défaut)', JSON.stringify(j));
const utiles = erreurs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
verifier(utiles.length === 0, 'aucune erreur de page', JSON.stringify(utiles.slice(0, 3)));
await nav.close();
console.log(`\nor-fleches-h1-chrome-test : ${nOk} OK, ${echecs.length} échec(s)`); if (echecs.length) { console.log(echecs.join('\n')); process.exitCode = 1; }
