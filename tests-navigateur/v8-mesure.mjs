// V8 : mesures de performance sur le profil mobile émulé : Galaxy S23 Ultra, processeur ralenti ×4, réseau 4G. Médiane de 3 chargements à froid.
//   BASE=http://127.0.0.1:8130 node tests-navigateur/v8-mesure.mjs avant     (serveur de l'ancienne version, `main` avant la V8)
//   node tests-navigateur/v8-mesure.mjs apres                                (cette version)         → docs/mesures-v8-<label>.json ; puis : node tests-navigateur/v8-mesure.mjs comparer
import fs from 'node:fs';
const label = process.argv[2] || 'apres';
if (label === 'comparer') {
  const A = JSON.parse(fs.readFileSync('docs/mesures-v8-avant.json')), B = JSON.parse(fs.readFileSync('docs/mesures-v8-apres.json'));
  const l = (n, a, b, u, mieuxBas = true) => { const ok = mieuxBas ? b <= a * 1.0 : b >= a * 0.95; console.log((ok ? 'OK  ' : 'KO  ') + n.padEnd(46) + String(a).padStart(9) + ' → ' + String(b).padStart(9) + ' ' + u); return ok; };
  let bon = true;
  bon = l('accueil prêt (CPU ×4, 4G)', A.pretMs, B.pretMs, 'ms') && bon;
  bon = l('chargement complet (load)', A.loadMs, B.loadMs, 'ms') && bon;
  bon = l('poids transféré', A.octets, B.octets, 'o') && bon;
  bon = l('JavaScript transféré', A.jsOctets, B.jsOctets, 'o') && bon;
  bon = l('fichiers demandés', A.fichiers, B.fichiers, '') && bon;
  bon = l('fichiers de Galaxie demandés', A.galaxie, B.galaxie, '') && bon;
  bon = l('mémoire JS après 5 s', A.memoMo, B.memoMo, 'Mo') && bon;
  bon = l('images/s au repos (accueil)', A.fpsRepos, B.fpsRepos, 'i/s', false) && bon;
  console.log(bon ? '\nL’accueil mobile n’est pas plus lent qu’avant.' : '\nL’ACCUEIL MOBILE EST PLUS LENT QU’AVANT'); process.exit(bon ? 0 : 1);
}
const { ouvrirMobile, galaxieChargee, attendre } = await import('./v8-aide.mjs');
const { demarrerFauxWorkerMobile } = await import('./mock-worker-mobile.mjs');
const med = l => l.slice().sort((a, b) => a - b)[Math.floor(l.length / 2)];
const mesures = [];
for (let i = 0; i < 3; i++) {
  const o = await ouvrirMobile('telephone', { attente: 0, avant: async page => {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  } });
  const p = o.page, t0 = Date.now();
  await p.waitForFunction(() => { const q = document.querySelector('#m-voix') || document.querySelector('#btn'); if (!q) return false; const r = q.getBoundingClientRect(); return r.width > 0 && getComputedStyle(q).visibility !== 'hidden' && !!(document.querySelector('.m-carte') || document.querySelector('.reactor')); }, { timeout: 60000 }).catch(() => {});
  const pretMs = o.chargeMs + (Date.now() - t0);
  await attendre(5000);
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = now => { n++; if (now - t < 2000) requestAnimationFrame(f); else r(n * 1000 / (now - t)); }; requestAnimationFrame(f); }));
  const memo = await p.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);
  const reqs = o.requetes, js = reqs.filter(r => /\.m?js(\?|$)/.test(r.url)).reduce((a, r) => a + r.octets, 0);
  mesures.push({ pretMs, loadMs: o.chargeMs, octets: o.octets.total, jsOctets: js, fichiers: reqs.length, galaxie: galaxieChargee(reqs).length, memoMo: memo == null ? 0 : +memo.toFixed(1), fpsRepos: +fps.toFixed(1) });
  await o.fermer();
}
const res = {}; for (const k of Object.keys(mesures[0])) res[k] = med(mesures.map(m => m[k]));
res.profil = 'Galaxy S23 Ultra 412×915, CPU ×4, 4G (9 Mb/s, 85 ms), cache désactivé, médiane de 3'; res.essais = mesures;
fs.writeFileSync(`docs/mesures-v8-${label}.json`, JSON.stringify(res, null, 1));
console.log(label, JSON.stringify(res));
