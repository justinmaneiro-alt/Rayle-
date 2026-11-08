/* Test Chrome des flèches H1 (v9 par défaut, cases v9 / v8 / v7 / v2) avec les VRAIES données (Kraken par le relais dédié, Binance) :
   - en H1, flèches affichées par défaut = fleches-h1-v9 (flèches v2 : niveau ≥ 5 touches ou majeur, alternance, ≥ 24 bougies), bien visibles ;
     cases v8, v7 et v2 pour comparer ; v1, v3, v4, v5, v6 calculées en arrière-plan, sans case ;
   - un segment par flèche v9, SANS étiquette permanente ; infobulle au survol : régime, niveau, touches, distance, excursions ;
   - M15, H4 : inchangés, cases cachées ; page fluide ; registre des 9 versions ; bilans depuis le commit de chaque règle ; journal.
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
const TOUS = ['fleches-h1-v2', 'fleches-h1-v7', 'fleches-h1-v8', 'fleches-h1-v9'];
const p = await nav.newPage(); await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
p.on('pageerror', e => erreurs.push(e.message));
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); localStorage.removeItem('rayle_or_registre_fleches_h1'); localStorage.removeItem('rayle_or_fleches_h1_choix_v9'); localStorage.setItem('rayle_or_fleches_h1_choix_v8', JSON.stringify(['fleches-h1-v7'])); });
await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__or && window.__or.moteur.S.hist && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 60000 }); await w(1500);

const controle = (versions) => p.evaluate(async versions => {
  const T = window.__or, S = T.moteur.S, NP = await import('/agent-trading/front/or/niveaux-periode.js'), V2 = await import('/agent-trading/front/or/fleches-h1-v2.js'), V7 = await import('/agent-trading/front/or/fleches-h1-v7.js'), V8 = await import('/agent-trading/front/or/fleches-h1-v8.js'), V9 = await import('/agent-trading/front/or/fleches-h1-v9.js'), H = await import('/agent-trading/front/or/historique-or.js');
  const serie = H.serieAffichee(S.hist, S.k, S.ecart), Vm = new Map((S.refP || []).map(b => [b.t, b.v])), n = Date.now();
  const calc = { 'fleches-v1': NP.fleches(serie, { periode: S.periode, maintenant: n, volumes: Vm }).map(f => f.t) };
  if (S.periode === 'H1') { const memo = new Map(), l = (X, i) => { if (!memo.has(X[i].t)) memo.set(X[i].t, V7.listesQuatre(X, i)); return memo.get(X[i].t); };
    const F2 = V2.flechesH1v2(serie, { maintenant: n, volumes: Vm, listes: (X, i) => l(X, i).detail }); calc['fleches-h1-v2'] = F2.map(f => f.t);
    calc['fleches-h1-v7'] = V7.flechesH1v7(serie, { maintenant: n, listes: (X, i) => l(X, i).v7 }).map(f => f.t);
    calc['fleches-h1-v8'] = V8.flechesH1v8(serie, { maintenant: n, volumes: Vm, F2 }).map(f => f.t);
    calc['fleches-h1-v9'] = V9.flechesH1v9(serie, { maintenant: n, volumes: Vm, F2 }).map(f => f.t); }
  const dk = (S.hist && S.hist.debutKraken) || 0, apres = c => +c.split('|')[1] >= dk;
  const cleA = [...new Set(versions.flatMap(v => calc[v].map(t => v + '|' + t)))].sort(), cleB = S.fleches.liste.map(f => (S.periode === 'H1' ? f.version : 'fleches-v1') + '|' + f.t).sort();
  const M = T.graph.marquesAffichees().filter(m => /^f\d/.test(m.id)), F9 = S.flechesH1 ? S.flechesH1['fleches-h1-v9'] : [], F2s = S.flechesH1 ? S.flechesH1['fleches-h1-v2'] : [];
  return { version: S.fleches.version, versions: S.fleches.versions || null, n: S.fleches.liste.length, egal: JSON.stringify(cleA.filter(apres)) === JSON.stringify(cleB.filter(apres)) && cleA.every(c => cleB.includes(c)),
    nMarques: M.length, ids: M.map(m => m.id), textes: M.map(m => m.text || ''), tailles: M.map(m => m.size), longueurs: Object.fromEntries(Object.entries(calc).map(([k, v]) => [k, v.length])),
    regles9: F9.every((f, k) => !k || (f.sens !== F9[k - 1].sens && f.i - F9[k - 1].i >= 24)) && F9.every(f => F2s.some(g => g.t === f.t && g.sens === f.sens)) && F9.every(f => f.gros.source === 'majeur' || f.gros.touches >= 5),
    segments: (S.segmentsH1 || []).length, segVus: T.graph.segments(), bilan: document.querySelector('[data-bilan-fleches]').textContent, casesCachees: document.querySelector('[data-versions-h1]').hidden };
}, versions);
const simples = c => c.ids.every(id => /^f\d+$/.test(id)) && c.textes.every(t => t === '');

/* 1. M15 inchangé (taille des flèches comprise) */
await p.waitForFunction(() => { const S = window.__or.moteur.S; return S.fleches && S.fleches.periode === 'M15'; }, { timeout: 60000 });
const m15 = await controle(['fleches-v1']);
verifier(m15.version === 'fleches-v1' && m15.egal && m15.nMarques === m15.n && simples(m15) && m15.casesCachees && m15.segVus.length === 0 && m15.tailles.every(s => s === 0.6), 'M15 : flèches v1 inchangées (taille comprise), aucune case, aucun segment', JSON.stringify({ n: m15.n }));

/* 2. H1 : v9 par défaut */
await p.waitForFunction(() => { const e = window.__or.moteur.S.etudeEtat; return e === 'faite' || /^échec/.test(e); }, { timeout: 120000 }); await w(500);
const fluide = await p.evaluate(async () => {
  let pire = 0, der = performance.now(), fin = false; const mes = () => { const t = performance.now(); pire = Math.max(pire, t - der); der = t; if (!fin) setTimeout(mes, 16); }; mes();
  window.__or.moteur.periode('H1');
  const t0 = performance.now(); while (performance.now() - t0 < 180000) { await new Promise(r => setTimeout(r, 100)); const S = window.__or.moteur.S; if (S.fleches && S.fleches.periode === 'H1' && S.flechesH1 && S.flechesH1['fleches-h1-v9']) break; }
  fin = true; return { pire: Math.round(pire), duree: Math.round(performance.now() - t0) };
});
verifier(fluide.pire < 800, `H1 : la page reste fluide pendant le calcul (plus longue pause ${fluide.pire} ms, calcul ${fluide.duree} ms)`);
await w(800);
const h1 = await controle(['fleches-h1-v9']);
verifier(h1.version === 'fleches-h1-v9' && h1.egal && h1.nMarques === h1.n && h1.n > 0, 'H1 : par défaut, flèches affichées = fleches-h1-v9 (malgré un ancien choix « v7 »)', JSON.stringify(h1.longueurs));
verifier(h1.regles9, 'v9 : flèches v2 seulement, niveau ≥ 5 touches ou majeur, alternance et ≥ 24 bougies');
verifier(simples(h1) && h1.tailles.every(s => s === 1), 'H1, v9 seule : marques sans étiquette, bien visibles (taille 1 au lieu de 0,6)');
verifier(h1.segments === h1.n, `un segment par flèche v9 (${h1.segments})`);
verifier(/^Flèches H1 \(version 9\) : .*depuis le 8 nov\. 2026, 13 h 03/.test(h1.bilan) && /Aucune décision avant 100/.test(h1.bilan) && /pas un filtre/.test(h1.bilan), 'H1 : bilan de v9 depuis le commit de sa règle, excursions « pas un filtre »', h1.bilan.slice(0, 160));
const cases = await p.evaluate(() => { const b = document.querySelector('[data-versions-h1]'); return { vis: !b.hidden, toutes: [...b.querySelectorAll('[data-vh1]')].map(c => c.dataset.vh1), coches: [...b.querySelectorAll('[data-vh1]')].filter(c => c.checked).map(c => c.dataset.vh1) }; });
verifier(cases.vis && JSON.stringify(cases.toutes) === '["fleches-h1-v9","fleches-h1-v8","fleches-h1-v7","fleches-h1-v2"]' && JSON.stringify(cases.coches) === '["fleches-h1-v9"]', 'H1 : cases v9, v8, v7 et v2 seulement, v9 cochée par défaut', JSON.stringify(cases));
verifier(await p.evaluate(() => { const F = window.__or.moteur.S.flechesH1; return ['fleches-v1', 'fleches-h1-v3', 'fleches-h1-v4', 'fleches-h1-v5', 'fleches-h1-v6'].every(v => Array.isArray(F[v])); }), 'v1, v3, v4, v5 et v6 toujours calculées en arrière-plan');

/* 3. segment v9 sans étiquette permanente, infobulle au survol */
{ const vu = await p.evaluate(async () => {
    const T = window.__or, S = T.moteur.S, d = T.graph.serie().data(), F = S.flechesH1['fleches-h1-v9'], f = F[F.length - 1], ts = d.map(b => b.time), seg = S.segmentsH1.find(s => s.t1 === f.t);
    const k0 = ts.findIndex(t => t >= Math.floor(seg.t0 / 1000) - 7200), k1 = ts.findIndex(t => t >= Math.floor(f.t / 1000) - 7200);
    T.graph.chart().timeScale().setVisibleLogicalRange({ from: Math.max(0, Math.max(k0, k1 - 200) - 20), to: Math.min(d.length - 1, k1 + 40) });
    await new Promise(r => setTimeout(r, 800)); return T.graph.segments();
  });
  verifier(vu.length >= 1 && vu.every(s => s.x1 > s.x0 && s.etiquette === false), `segment v9 dessiné, sans étiquette permanente (${vu.length} visible(s))`);
  if (vu.length) {
    const s0 = vu[vu.length - 1], box = await p.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: r.x, y: r.y }; });
    await p.mouse.move(box.x + Math.max(s0.x0 + 5, s0.x1 - 30), box.y + s0.y); await w(600);
    const tip = await p.evaluate(() => { const t = document.querySelector('.tor-info'); return t && !t.hidden ? t.innerText : ''; });
    verifier(/niveau déclencheur de la flèche v9/.test(tip) && /(Support|Résistance) /.test(tip) && /régime H1/.test(tip) && /touche|majeur/.test(tip) && /distance de l'extrême/.test(tip) && /excursion favorable|pas encore closes/.test(tip), 'au survol : étiquette type / prix / touches, régime, niveau, distance, excursions', tip.replace(/\n/g, ' / ').slice(0, 260));
  }
  await p.screenshot({ path: path.join(SORTIE, 'fleches-h1-v9.png') }); }

/* 4. comparer v9, v8, v7, v2 ; une version cachée ne peut pas être forcée */
await p.evaluate(() => { for (const v of ['fleches-h1-v8', 'fleches-h1-v7', 'fleches-h1-v2']) { const c = document.querySelector(`[data-vh1="${v}"]`); c.checked = true; c.dispatchEvent(new Event('change')); } }); await w(800);
const cmp = await controle(TOUS);
verifier(JSON.stringify(cmp.versions) === JSON.stringify(TOUS) && cmp.egal, 'comparaison : v2, v7, v8 et v9 affichées, chacune complète', JSON.stringify(cmp.longueurs));
verifier(cmp.textes.every(t => ['v2', 'v7', 'v8', 'v9'].includes(t)) && new Set(cmp.ids).size === cmp.ids.length, 'comparaison : chaque flèche porte sa version, aucune marque en double');
verifier(cmp.segments === cmp.longueurs['fleches-h1-v7'] + cmp.longueurs['fleches-h1-v8'] + cmp.longueurs['fleches-h1-v9'], `segments de v7, v8 et v9 (${cmp.segments})`);
verifier(/^Flèches H1 \(comparaison\) : v2 : .*01 h 07.* \| v7 : .*10 h 38.* \| v8 : .*11 h 11.* \| v9 : .*13 h 03/.test(cmp.bilan), 'comparaison : un bilan par version, chacune depuis le commit de sa règle', cmp.bilan.slice(0, 200));
const force = await p.evaluate(() => window.__or.moteur.versionsH1(['fleches-h1-v6', 'fleches-h1-v5']));
verifier(JSON.stringify(force) === '["fleches-h1-v9"]', 'v5 / v6 ne peuvent pas être affichées (retour à v9)', JSON.stringify(force));
verifier(await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('rayle_or_registre_fleches_h1') || 'null'); return r === null || ['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4', 'fleches-h1-v5', 'fleches-h1-v6', 'fleches-h1-v7', 'fleches-h1-v8', 'fleches-h1-v9'].every(v => Array.isArray(r.versions[v])); }), 'registre daté des 9 versions (créé dès qu’une flèche nouvelle existe)');
verifier(await p.evaluate(() => [...document.querySelectorAll('details summary')].some(s => s.textContent.includes('flèches H1, version 9'))), 'règles figées de v9 consultables');

/* 5. H4 puis M15 inchangés */
for (const P of ['H4', 'M15']) {
  await p.evaluate(x => window.__or.moteur.periode(x), P);
  await p.waitForFunction(x => { const S = window.__or.moteur.S; return S.periode === x && S.hist && S.hist.periode === x && S.fleches && S.fleches.periode === x; }, { timeout: 90000 }, P); await w(800);
  const c = await controle(['fleches-v1']);
  verifier(c.version === 'fleches-v1' && c.egal && c.nMarques === c.n && simples(c) && c.casesCachees && c.segVus.length === 0 && c.tailles.every(s => s === 0.6), `${P} : flèches v1 inchangées, cases cachées, aucun segment`, JSON.stringify({ n: c.n }));
}
const j = await p.evaluate(() => { const s = document.querySelector('select[name="etiquette"]'), v = document.querySelector('select[name="versionFleche"]'); return { et: !!s && [...s.options].some(o => o.textContent === 'flèche H1'), v: !!v && [...v.options].map(o => o.value) }; });
verifier(j.et && j.v[0] === 'fleches-h1-v9' && ['fleches-h1-v8', 'fleches-h1-v7', 'fleches-h1-v2'].every(v => j.v.includes(v)), 'journal : étiquette « flèche H1 » et version (v9 par défaut)', JSON.stringify(j));
const utiles = erreurs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
verifier(utiles.length === 0, 'aucune erreur de page', JSON.stringify(utiles.slice(0, 3)));
await nav.close();
console.log(`\nor-fleches-h1-chrome-test : ${nOk} OK, ${echecs.length} échec(s)`); if (echecs.length) { console.log(echecs.join('\n')); process.exitCode = 1; }
