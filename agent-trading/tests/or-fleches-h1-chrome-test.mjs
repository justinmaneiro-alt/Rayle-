/* Test Chrome des flèches H1 version 2 avec les VRAIES données (Kraken par le relais dédié, Binance) :
   - en H1 seulement, les flèches affichées sont celles de fleches-h1-v2 ; v1 n'est jamais affichée, ni dans le graphique ni dans le bilan ;
   - M5, M15, H4, Jour : flèches v1 inchangées (identiques au calcul fleches-v1) ;
   - la page reste fluide pendant le calcul (précalcul par morceaux) ; registre daté v1 + v2 dans le stockage de l'appareil ;
   - bilan H1 « depuis la date du commit », chiffre de v2 seulement ; journal : étiquette « flèche H1 » + version.
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
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_or_periode', JSON.stringify('M15')); localStorage.removeItem('rayle_or_registre_fleches_h1'); });
await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__or && window.__or.moteur.S.hist && window.__or.graph.serie() && window.__or.graph.serie().data().length > 100, { timeout: 60000 }); await w(1500);

// contrôle hors page : les flèches affichées doivent être exactement celles du calcul de la version attendue
const controle = (version) => p.evaluate(async version => {
  const T = window.__or, S = T.moteur.S, NP = await import('/agent-trading/front/or/niveaux-periode.js'), V2 = await import('/agent-trading/front/or/fleches-h1-v2.js'), H = await import('/agent-trading/front/or/historique-or.js');
  const serie = H.serieAffichee(S.hist, S.k, S.ecart), Vm = new Map((S.refP || []).map(b => [b.t, b.v])), n = Date.now();
  const v1 = NP.fleches(serie, { periode: S.periode, maintenant: n, volumes: Vm }).map(f => f.t), v2 = S.periode === 'H1' ? V2.flechesH1v2(serie, { maintenant: n, volumes: Vm }).map(f => f.t) : [];
  const aff = S.fleches.liste.map(f => f.t), marques = T.graph.marquesAffichees().filter(m => /^f\d/.test(m.id)).map(m => +m.id.slice(1));
  const attendu = version === 'fleches-h1-v2' ? v2 : v1, inclus = (A, B) => A.every(x => B.includes(x));
  return { version: S.fleches.version, n: aff.length, attendu: attendu.length, egal: inclus(attendu, aff) && inclus(aff, attendu), marquesOk: inclus(marques, aff), v1: v1.length, v2: v2.length,
    communs: v2.filter(t => v1.includes(t)).length, bilan: document.querySelector('[data-bilan-fleches]').textContent };
}, version);

/* 1. M15 : v1 inchangée */
await p.waitForFunction(() => { const S = window.__or.moteur.S; return S.fleches && S.fleches.periode === 'M15'; }, { timeout: 60000 });
const m15 = await controle('fleches-v1');
verifier(m15.version === 'fleches-v1' && m15.egal && m15.marquesOk, 'M15 : flèches v1, identiques au calcul fleches-v1', JSON.stringify({ n: m15.n, attendu: m15.attendu }));
verifier(/^Flèches de rebond \(M15\)/.test(m15.bilan), 'M15 : bilan des flèches de rebond inchangé', m15.bilan.slice(0, 60));

/* 2. H1 : v2 affichée, page fluide pendant le calcul */
const fluide = await p.evaluate(async () => {
  let pire = 0, der = performance.now(), fin = false; const mes = () => { const t = performance.now(); pire = Math.max(pire, t - der); der = t; if (!fin) setTimeout(mes, 16); }; mes();
  window.__or.moteur.periode('H1');
  const t0 = performance.now(); while (performance.now() - t0 < 90000) { await new Promise(r => setTimeout(r, 100)); const S = window.__or.moteur.S; if (S.fleches && S.fleches.periode === 'H1' && S.fleches.version === 'fleches-h1-v2') break; }
  fin = true; return { pire: Math.round(pire), duree: Math.round(performance.now() - t0) };
});
verifier(fluide.pire < 600, `H1 : la page reste fluide pendant le calcul (plus longue pause ${fluide.pire} ms, calcul ${fluide.duree} ms)`);
await w(800);
const h1 = await controle('fleches-h1-v2');
verifier(h1.version === 'fleches-h1-v2' && h1.egal && h1.marquesOk, 'H1 : flèches affichées = fleches-h1-v2 (et seulement elles)', JSON.stringify({ n: h1.n, v2: h1.v2, v1: h1.v1, communs: h1.communs }));
verifier(h1.v1 !== h1.v2 || h1.communs !== h1.v1, 'H1 : v1 n’est pas affichée (listes différentes)');
verifier(/^Flèches H1 \(version 2\) : .*depuis le 8 nov\. 2026/.test(h1.bilan) && /Aucune décision avant 100/.test(h1.bilan) && !/fleches-v1|version 1/.test(h1.bilan), 'H1 : bilan de v2 seulement, depuis la date du commit', h1.bilan.slice(0, 160));
const reg = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('rayle_or_registre_fleches_h1') || 'null'); return r && { v1: Array.isArray(r.versions['fleches-v1']), v2: Array.isArray(r.versions['fleches-h1-v2']), cree: r.cree }; });
verifier(reg === null || (reg.v1 && reg.v2), 'registre daté v1 + v2 (créé dès qu’une flèche nouvelle existe)', JSON.stringify(reg));
const regles = await p.evaluate(() => [...document.querySelectorAll('details summary')].some(s => /flèches H1, version 2/.test(s.textContent)));
verifier(regles, 'règles figées de v2 consultables');
await p.screenshot({ path: path.join(SORTIE, 'fleches-h1-v2.png') });

/* 3. H4 puis M15 : v1 inchangée après le passage en H1 */
for (const P of ['H4', 'M15']) {
  await p.evaluate(x => window.__or.moteur.periode(x), P);
  await p.waitForFunction(x => { const S = window.__or.moteur.S; return S.periode === x && S.hist && S.hist.periode === x && S.fleches && S.fleches.periode === x; }, { timeout: 90000 }, P); await w(800);
  const c = await controle('fleches-v1');
  verifier(c.version === 'fleches-v1' && c.egal && c.marquesOk, `${P} : flèches v1 inchangées`, JSON.stringify({ n: c.n, attendu: c.attendu }));
}

/* 4. journal : étiquette « flèche H1 » + version */
const j = await p.evaluate(() => { const s = document.querySelector('select[name="etiquette"]'), v = document.querySelector('select[name="versionFleche"]'); return { et: !!s && [...s.options].some(o => o.textContent === 'flèche H1'), v: !!v && [...v.options].map(o => o.value) }; });
verifier(j.et && JSON.stringify(j.v) === JSON.stringify(['fleches-h1-v2', 'fleches-v1']), 'journal : étiquette « flèche H1 » et choix de la version', JSON.stringify(j));

const utiles = erreurs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
verifier(utiles.length === 0, 'aucune erreur de page', JSON.stringify(utiles.slice(0, 3)));
await nav.close();
console.log(`\nor-fleches-h1-chrome-test : ${nOk} OK, ${echecs.length} échec(s)`); if (echecs.length) { console.log(echecs.join('\n')); process.exitCode = 1; }
