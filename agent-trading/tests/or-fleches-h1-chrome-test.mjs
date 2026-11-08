/* Test Chrome des flèches H1 (v4 par défaut, cases v1 / v2 / v3 / v4) avec les VRAIES données (Kraken par le relais dédié, Binance) :
   - en H1 seulement, les flèches affichées par défaut sont celles de fleches-h1-v4 ; les cases à cocher ajoutent les autres versions
     (chaque flèche porte alors sa version) ; une seule version : marques exactement comme avant ;
   - M5, M15, H4, Jour : flèches v1 inchangées (identiques au calcul fleches-v1), cases cachées ;
   - la page reste fluide pendant le calcul ; registre daté des 4 versions ; bilan par version, chacune depuis le commit de sa règle ;
   - journal : étiquette « flèche H1 » + version (v1 à v4).
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
const TOUTES = ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4'];
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
p.on('pageerror', e => erreurs.push(e.message));
// l'ancien choix (clé de la v3) ne doit pas empêcher v4 d'être la version par défaut
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); localStorage.removeItem('rayle_or_registre_fleches_h1'); localStorage.removeItem('rayle_or_fleches_h1_choix'); localStorage.setItem('rayle_or_fleches_h1_versions', JSON.stringify(['fleches-h1-v3'])); });
await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__or && window.__or.moteur.S.hist && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 60000 }); await w(1500);

const controle = (versions) => p.evaluate(async versions => {
  const T = window.__or, S = T.moteur.S, NP = await import('/agent-trading/front/or/niveaux-periode.js'), V2 = await import('/agent-trading/front/or/fleches-h1-v2.js'), V3 = await import('/agent-trading/front/or/fleches-h1-v3.js'), V4 = await import('/agent-trading/front/or/fleches-h1-v4.js'), H = await import('/agent-trading/front/or/historique-or.js');
  const serie = H.serieAffichee(S.hist, S.k, S.ecart), Vm = new Map((S.refP || []).map(b => [b.t, b.v])), n = Date.now();
  const calc = { 'fleches-v1': NP.fleches(serie, { periode: S.periode, maintenant: n, volumes: Vm }).map(f => f.t) };
  if (S.periode === 'H1') { const memo = new Map(), l = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, V4.listesDetail(X, i)); return memo.get(X[i].t); };
    calc['fleches-h1-v2'] = V2.flechesH1v2(serie, { maintenant: n, volumes: Vm, listes: l }).map(f => f.t); calc['fleches-h1-v3'] = V3.flechesH1v3(serie, { maintenant: n, volumes: Vm, listes: l }).map(f => f.t); calc['fleches-h1-v4'] = V4.flechesH1v4(serie, { maintenant: n, volumes: Vm, listes: l }).map(f => f.t); }
  const cleA = versions.flatMap(v => calc[v].map(t => v + '|' + t)).sort(), cleB = S.fleches.liste.map(f => (S.periode === 'H1' ? f.version : 'fleches-v1') + '|' + f.t).sort();
  const M = T.graph.marquesAffichees().filter(m => /^f\d/.test(m.id));
  return { version: S.fleches.version, versions: S.fleches.versions || null, n: S.fleches.liste.length, egal: JSON.stringify(cleA) === JSON.stringify(cleB), nMarques: M.length, ids: M.map(m => m.id), textes: M.map(m => m.text || ''),
    longueurs: Object.fromEntries(Object.entries(calc).map(([k, v]) => [k, v.length])), bilan: document.querySelector('[data-bilan-fleches]').textContent, casesCachees: document.querySelector('[data-versions-h1]').hidden };
}, versions);
const simples = c => c.ids.every(id => /^f\d+$/.test(id)) && c.textes.every(t => t === '');

/* 1. M15 : v1 inchangée */
await p.waitForFunction(() => { const S = window.__or.moteur.S; return S.fleches && S.fleches.periode === 'M15'; }, { timeout: 60000 });
const m15 = await controle(['fleches-v1']);
verifier(m15.version === 'fleches-v1' && m15.egal && m15.nMarques === m15.n && simples(m15) && m15.casesCachees, 'M15 : flèches v1 identiques au calcul fleches-v1, marques comme avant, cases cachées', JSON.stringify({ n: m15.n }));
verifier(/^Flèches de rebond \(M15\)/.test(m15.bilan), 'M15 : bilan des flèches de rebond inchangé', m15.bilan.slice(0, 60));

/* 2. H1 : v4 par défaut, page fluide */
const fluide = await p.evaluate(async () => {
  let pire = 0, der = performance.now(), fin = false; const mes = () => { const t = performance.now(); pire = Math.max(pire, t - der); der = t; if (!fin) setTimeout(mes, 16); }; mes();
  window.__or.moteur.periode('H1');
  const t0 = performance.now(); while (performance.now() - t0 < 120000) { await new Promise(r => setTimeout(r, 100)); const S = window.__or.moteur.S; if (S.fleches && S.fleches.periode === 'H1' && S.flechesH1) break; }
  fin = true; return { pire: Math.round(pire), duree: Math.round(performance.now() - t0) };
});
verifier(fluide.pire < 800, `H1 : la page reste fluide pendant le calcul (plus longue pause ${fluide.pire} ms, calcul ${fluide.duree} ms)`);
await w(800);
const h1 = await controle(['fleches-h1-v4']);
verifier(h1.version === 'fleches-h1-v4' && h1.egal && h1.nMarques === h1.n, 'H1 : par défaut, flèches affichées = fleches-h1-v4 (et seulement elles), malgré un ancien choix « v3 »', JSON.stringify(h1.longueurs));
verifier(simples(h1), 'H1, une seule version : marques comme avant (sans étiquette)');
verifier(/^Flèches H1 \(version 4\) : .*depuis le 8 nov\. 2026, 02 h 34/.test(h1.bilan) && /Aucune décision avant 100/.test(h1.bilan), 'H1 : bilan de v4 depuis le commit de sa règle', h1.bilan.slice(0, 160));
const cases = await p.evaluate(() => { const b = document.querySelector('[data-versions-h1]'); return { vis: !b.hidden, toutes: [...b.querySelectorAll('[data-vh1]')].map(c => c.dataset.vh1), coches: [...b.querySelectorAll('[data-vh1]')].filter(c => c.checked).map(c => c.dataset.vh1) }; });
verifier(cases.vis && cases.toutes.length === 4 && JSON.stringify(cases.coches) === '["fleches-h1-v4"]', 'H1 : cases v1 / v2 / v3 / v4 visibles, v4 cochée par défaut', JSON.stringify(cases));

/* 3. comparer : les quatre */
await p.evaluate(() => { for (const v of ['fleches-h1-v3', 'fleches-h1-v2', 'fleches-v1']) { const c = document.querySelector(`[data-vh1="${v}"]`); c.checked = true; c.dispatchEvent(new Event('change')); } }); await w(800);
const cmp = await controle(TOUTES);
verifier(JSON.stringify(cmp.versions) === JSON.stringify(TOUTES) && cmp.egal, 'comparaison : les quatre versions affichées, chacune complète', JSON.stringify(cmp.longueurs));
verifier(JSON.stringify([...new Set(cmp.textes)].sort()) === '["v1","v2","v3","v4"]' && cmp.nMarques === cmp.n && new Set(cmp.ids).size === cmp.ids.length, 'comparaison : chaque flèche porte sa version, aucune marque perdue ni en double', JSON.stringify({ n: cmp.n, marques: cmp.nMarques }));
verifier(/^Flèches H1 \(comparaison\) : v1 : .*7 nov\. 2026, 20 h 47.* \| v2 : .*01 h 07.* \| v3 : .*01 h 45.* \| v4 : .*02 h 34/.test(cmp.bilan), 'comparaison : un bilan par version, chacune depuis le commit de sa règle', cmp.bilan.slice(0, 200));
verifier(await p.evaluate(() => localStorage.getItem('rayle_or_fleches_h1_choix')) === JSON.stringify(TOUTES), 'choix mémorisé sur l’appareil');
await p.screenshot({ path: path.join(SORTIE, 'fleches-h1-comparaison.png') });
await p.evaluate(() => { for (const c of document.querySelectorAll('[data-vh1]')) { c.checked = false; c.dispatchEvent(new Event('change')); } }); await w(500);
verifier(await p.evaluate(() => JSON.stringify(window.__or.moteur.S.fleches.versions)) === '["fleches-h1-v4"]', 'tout décoché : v4 seule (jamais aucune version)');
await p.screenshot({ path: path.join(SORTIE, 'fleches-h1-v4.png') });

const reg = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('rayle_or_registre_fleches_h1') || 'null'); return r && ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4'].every(v => Array.isArray(r.versions[v])); });
verifier(reg === null || reg === true, 'registre daté des 4 versions (créé dès qu’une flèche nouvelle existe)', JSON.stringify(reg));
verifier(await p.evaluate(() => ['version 2', 'version 3', 'version 4'].every(x => [...document.querySelectorAll('details summary')].some(s => s.textContent.includes('flèches H1, ' + x)))), 'règles figées de v2, v3 et v4 consultables');

/* 4. H4 puis M15 : v1 inchangée, cases cachées */
for (const P of ['H4', 'M15']) {
  await p.evaluate(x => window.__or.moteur.periode(x), P);
  await p.waitForFunction(x => { const S = window.__or.moteur.S; return S.periode === x && S.hist && S.hist.periode === x && S.fleches && S.fleches.periode === x; }, { timeout: 90000 }, P); await w(800);
  const c = await controle(['fleches-v1']);
  verifier(c.version === 'fleches-v1' && c.egal && c.nMarques === c.n && simples(c) && c.casesCachees, `${P} : flèches v1 inchangées, cases cachées`, JSON.stringify({ n: c.n }));
}

/* 5. journal */
const j = await p.evaluate(() => { const s = document.querySelector('select[name="etiquette"]'), v = document.querySelector('select[name="versionFleche"]'); return { et: !!s && [...s.options].some(o => o.textContent === 'flèche H1'), v: !!v && [...v.options].map(o => o.value) }; });
verifier(j.et && JSON.stringify(j.v) === JSON.stringify(['fleches-h1-v4', 'fleches-h1-v3', 'fleches-h1-v2', 'fleches-v1']), 'journal : étiquette « flèche H1 » et version v1 à v4', JSON.stringify(j));

const utiles = erreurs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
verifier(utiles.length === 0, 'aucune erreur de page', JSON.stringify(utiles.slice(0, 3)));
await nav.close();
console.log(`\nor-fleches-h1-chrome-test : ${nOk} OK, ${echecs.length} échec(s)`); if (echecs.length) { console.log(echecs.join('\n')); process.exitCode = 1; }
