// ISS par TLE + SGP4 dans ui/espace.js : ordre de repli (frais → cache → secours), cache, TLE invalide.   node tests/iss-tle-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, setTimeout, clearTimeout, Math, Date };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['../ui/astro.js', '../ui/sgp4.js', '../ui/espace.js']) vm.runInContext(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), ctx);
const E = ctx.RayleUI.espace;
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const proche = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, m + ' : ' + a + ' vs ' + b);
const T1 = '1 25544U 98067A   26286.11204827  .00005858  00000+0  11499-3 0  9991', T2 = '2 25544  51.6319  76.5194 0006724 256.4602 103.5638 15.48846742590035';
const mk = (o = {}) => { const mem = new Map(Object.entries(o.stock || {})); const now = o.now || Date.UTC(2026, 9, 13, 12, 59, 39); const appels = [];
  const m = E.creerISS({ maintenant: () => now, stockage: { get: k => mem.get(k) ?? null, set: (k, v) => v == null ? mem.delete(k) : mem.set(k, v) }, fetch: async u => { appels.push(u); return o.fetch ? o.fetch(u) : { ok: true, text: async () => 'ISS (ZARYA)\r\n' + T1 + '\r\n' + T2 + '\r\n' }; } });
  return { m, mem, appels, now }; };

await t('sans réseau ni cache : TLE de secours embarqué, position réelle à quelques km (api.wheretheiss.at du 13/10/2026)', async () => {
  const x = mk({ fetch: async () => { throw new Error('hors ligne'); } });
  const e = await x.m.charger();
  assert.equal(e.source, 'tle-secours'); assert.equal(e.simule, true);
  proche(e.lat, -40.575, .05, 'latitude'); proche(e.lon, 79.770, .05, 'longitude'); proche(e.alt, 429.1, 1.5, 'altitude');
  assert.ok(e.ageTleJours > 0 && e.ageTleJours < 1);
});
await t('TLE frais : téléchargé une fois, mis en cache 6 h, source « frais »', async () => {
  const x = mk(); const e = await x.m.charger();
  assert.equal(e.source, 'tle-frais'); assert.equal(e.simule, false); assert.equal(x.appels.length, 1); assert.ok(/celestrak\.org.*CATNR=25544/.test(x.appels[0]));
  assert.ok(x.mem.get('rayle_esp_tle').includes('25544'));
  await x.m.charger(); assert.equal(x.appels.length, 1, 'cache valable');
});
await t('TLE invalide ou réponse sans ISS : le TLE précédent reste utilisé, aucune exception', async () => {
  for (const corps of ['<html>erreur</html>', 'ISS\n1 25544U trop court\n2 25544 court']) {
    const x = mk({ fetch: async () => ({ ok: true, text: async () => corps }) });
    const e = await x.m.charger(); assert.equal(e.source, 'tle-secours'); assert.ok(isFinite(e.lat) && isFinite(e.ra));
  }
  const y = mk({ fetch: async () => ({ ok: false, status: 503, text: async () => '' }) }); assert.equal((await y.m.charger()).source, 'tle-secours');
});
await t('cache périmé : on le garde hors ligne (source « cache »), pas de position absurde', async () => {
  const stock = { rayle_esp_tle: JSON.stringify({ l1: T1, l2: T2, recu: Date.UTC(2026, 9, 10) }) };
  const x = mk({ stock, fetch: async () => { throw new Error('hors ligne'); } });
  assert.equal((await x.m.charger()).source, 'tle-cache');
});
await t('repère inertiel : (ra, dec, r) cohérents avec la latitude, r ≈ 1,065 rayon terrestre, trace continue', async () => {
  const x = mk(); await x.m.charger(); const e = x.m.etat();
  proche(e.dec, e.lat, .25, 'déclinaison ≈ latitude (écart géodésique)'); proche(e.r, 1 + 429 / 6371, .003, 'r');
  const tr = x.m.trace(x.now, 45, 5, 1); assert.ok(tr.length > 40);
  const xyz = p => { const a = p.ra * Math.PI / 180, d = p.dec * Math.PI / 180; return [p.r * Math.cos(d) * Math.cos(a), p.r * Math.cos(d) * Math.sin(a), p.r * Math.sin(d)]; };
  for (let i = 1; i < tr.length; i++) { const a = xyz(tr[i]), b = xyz(tr[i - 1]); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < .085, 'pas de saut'); }
});
console.log(ok + ' groupes réussis');
