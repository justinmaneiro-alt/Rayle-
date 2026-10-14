// Localisation des appareils (js/rayle/localisation.js) avec navigateur et Worker simulés :   node tests/localisation-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ls = {}, appels = [], bus = [], panneaux = [];
let geo = { ok: true, lat: 45.7578, lon: 4.832, prec: 25 }, workerPret = true, appaire = 'jeton', listeWorker = [];
const ctx = {
  console, setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, Date,
  localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
  navigator: { geolocation: { getCurrentPosition: (ok, ko) => geo.ok ? ok({ coords: { latitude: geo.lat, longitude: geo.lon, accuracy: geo.prec } }) : ko({ code: 1 }) } },
  matchMedia: () => ({ matches: false }), screen: { width: 1920, height: 1080 },
  store: { get: k => (k === 'rayle_worker_appareil' ? appaire : k === 'rayle_worker_appareil_nom' ? 'PC' : '') },
  KEY_WDEV: 'rayle_worker_appareil', KEY_WDEVNOM: 'rayle_worker_appareil_nom',
  workerReady: () => workerPret,
  wfetch: async (p, o) => { appels.push([p, o && o.method, o && o.body]); return { ok: true }; },
  wjson: async () => ({ appareils: listeWorker }),
  RayleBus: { emit: (n, d) => bus.push([n, d]), fournir() {}, on() {} },
  Panneaux: { ouvrir: o => panneaux.push(o) },
  addLine() {},
  document: { hidden: false, getElementById: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/localisation.js', import.meta.url), 'utf8') + '\nglobalThis.L=RayleLocalisation; globalThis.CMD=commandeLocalisation;', ctx);
const L = ctx.L;
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const plat = o => JSON.parse(JSON.stringify(o));

await t('rien n’est demandé au navigateur sans permission', async () => { assert.equal(L.consentement(), false); assert.equal(L.maPosition(), null); });
await t('distance Paris–Lyon ≈ 392 km', () => { assert.ok(Math.abs(L.distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 45.764, lon: 4.8357 }) - 392) < 4); });
await t('formats : coordonnées, précision, ancienneté', () => {
  assert.equal(L.coordTexte(48.8566, 2.3522), '48.86° N, 2.35° E'); assert.equal(L.coordTexte(-33.9, -70.65), '33.90° S, 70.65° O');
  assert.equal(L.precisionTexte(25), '± 25 m'); assert.equal(L.precisionTexte(2300), '± 2,3 km'); assert.equal(L.precisionTexte(0), '');
  const t0 = 1e12; assert.equal(L.ilYa(t0, t0 + 10e3), 'à l’instant'); assert.equal(L.ilYa(t0, t0 + 5 * 60e3), 'il y a 5 min'); assert.equal(L.ilYa(t0, t0 + 3 * 3600e3), 'il y a 3 h'); assert.equal(L.ilYa(t0, t0 + 2 * 86400e3), 'il y a 2 j'); assert.equal(L.ilYa(0), 'jamais vu');
});
await t('une position invalide est refusée', () => {
  for (const p of [null, {}, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: 'x', lon: 1 }]) assert.equal(L.propre(p), null);
  assert.deepEqual(plat(L.propre({ lat: 1.23456789, lon: 2, prec: 12.6 })), { lat: 1.2346, lon: 2, prec: 13, t: 0 });
});
await t('genre d’appareil', () => { assert.equal(L.genre('Tablette Xiaomi'), 'tablette'); assert.equal(L.genre('Téléphone'), 'telephone'); assert.equal(L.genre('PC'), 'pc'); });
await t('autoriser : lit la position, la garde et l’envoie au Worker', async () => {
  const r = await L.autoriser(); assert.equal(r.ok, true); assert.equal(L.consentement(), true);
  assert.equal(L.maPosition().lat, 45.7578);
  const envoi = appels.find(a => a[0] === '/appareil/position'); assert.ok(envoi, 'POST /appareil/position'); assert.equal(envoi[1], 'POST');
  assert.deepEqual(JSON.parse(envoi[2]), { lat: 45.7578, lon: 4.832, prec: 25 });
});
await t('permission refusée : pas de consentement mémorisé', async () => {
  await L.arreter(); geo = { ok: false }; const r = await L.autoriser();
  assert.equal(r.ok, false); assert.match(r.raison, /refusée/); assert.equal(L.consentement(), false); assert.equal(L.maPosition(), null);
  geo = { ok: true, lat: 45.7578, lon: 4.832, prec: 25 };
});
await t('sans Worker : la position reste locale, sans erreur', async () => {
  workerPret = false; appels.length = 0; const r = await L.autoriser(); assert.equal(r.ok, true); assert.equal(appels.length, 0); workerPret = true;
});
await t('arrêter : efface en local et au Worker', async () => {
  appels.length = 0; await L.arreter(); assert.equal(L.maPosition(), null); assert.equal(L.consentement(), false);
  assert.deepEqual(JSON.parse(appels[0][2]), { effacer: true });
});
await t('liste : cet appareil + ceux du Worker, avec position et dernière activité', async () => {
  await L.autoriser();
  const maintenant = Date.now();
  listeWorker = [
    { id: 'a', nom: 'PC', moi: true, ouvert: true, vu: maintenant, position: null },
    { id: 'b', nom: 'Tablette', moi: false, ouvert: true, vu: maintenant - 120e3, position: { lat: 43.6, lon: 1.44, prec: 800, t: maintenant - 120e3 } },
    { id: 'c', nom: 'Téléphone', moi: false, ouvert: false, vu: maintenant - 7200e3, position: null },
    { id: 'd', nom: 'Ancien', revoque: true },
  ];
  const l = await L.liste();
  assert.equal(l.length, 3, 'les appareils révoqués sont ignorés');
  const pc = l.find(a => a.moi); assert.equal(pc.nom, 'PC'); assert.equal(pc.position.lat, 45.7578, 'la position locale prime pour cet appareil');
  const tab = l.find(a => a.nom === 'Tablette'); assert.equal(tab.genre, 'tablette'); assert.equal(tab.position.lon, 1.44);
  assert.equal(l.find(a => a.nom === 'Téléphone').position, null);
  const rep = L.reperes(l); assert.deepEqual(plat(rep.map(r => r.nom).sort()), ['PC', 'Tablette']);
});
await t('Worker injoignable : au moins cet appareil', async () => {
  const save = ctx.wjson; ctx.wjson = async () => { throw new Error('hors ligne'); };
  const l = await L.liste(); assert.equal(l.length, 1); assert.equal(l[0].moi, true); ctx.wjson = save;
});
await t('panneau Appareils : contenu, boutons de partage', async () => {
  listeWorker = [{ id: 'a', nom: 'PC', moi: true, ouvert: true, vu: Date.now() }, { id: 'b', nom: 'Tablette', ouvert: true, vu: Date.now(), position: { lat: 43.6, lon: 1.44, prec: 50, t: Date.now() } }];
  await L.afficher(); const p = panneaux.at(-1); assert.equal(p.id, 'appareils'); assert.match(p.corps.html, /Tablette/); assert.match(p.corps.html, /43\.60° N/);
  assert.ok(p.pied.some(b => /Arrêter/.test(b.texte))); assert.ok(p.pied.some(b => /globe/.test(b.texte)));
});
await t('panneau : le nom d’un appareil est échappé', async () => {
  listeWorker = [{ id: 'x', nom: '<img src=x onerror=1>', moi: false, ouvert: true, vu: Date.now(), position: null }];
  await L.afficher(); assert.ok(!/<img/.test(panneaux.at(-1).corps.html));
});
await t('voix : phrases comprises', () => {
  const a = p => { const r = L.analyser(p); return r && r.action; };
  assert.equal(a('Raylé, localise cet appareil'), 'autoriser'); assert.equal(a('partage ma position'), 'autoriser'); assert.equal(a('active la géolocalisation'), 'autoriser');
  assert.equal(a('arrête le partage de position'), 'arreter'); assert.equal(a('ne partage plus ma position'), 'arreter');
  assert.equal(a('où est ma tablette ?'), 'afficher'); assert.equal(a('où sont mes appareils'), 'afficher'); assert.equal(a('affiche les appareils'), 'afficher');
  for (const p of ['quelle est la météo', 'ouvre le terminal sur la tablette', 'affiche l’or en H4 sur la tablette', 'où est Paris']) assert.equal(L.analyser(p), null, p);
});
await t('voix : « où sont mes appareils » répond avec les lieux', async () => {
  listeWorker = [{ id: 'a', nom: 'PC', moi: true, ouvert: true, vu: Date.now() }, { id: 'b', nom: 'Tablette', ouvert: true, vu: Date.now(), position: { lat: 43.6, lon: 1.44, prec: 50, t: Date.now() } }];
  const r = await ctx.CMD('où sont mes appareils ?'); assert.match(r, /PC/); assert.match(r, /Tablette/);
  assert.equal(await ctx.CMD('bonjour'), null);
});
console.log(ok + ' tests réussis');
