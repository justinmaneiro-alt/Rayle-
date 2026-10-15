// Outils « earth_* » côté Worker (worker/worker.js) : déclarés, paramètres validés, action « terre » émise, groupe de mots-clés, consignes honnêtes.   node tests/terre-worker-test.mjs
// Le dossier worker/ n'est pas publié sur GitHub : sans lui, le test est simplement sauté.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const fichier = new URL('../worker/worker.js', import.meta.url);
if (!fs.existsSync(fichier)) { console.log('  (worker/worker.js absent : test sauté)'); process.exit(0); }
const src = fs.readFileSync(fichier, 'utf8');
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const debut = src.indexOf('// src/terre.js (la Terre sert de carte)');
if (debut < 0) { console.log('  ✘ le bloc « la Terre sert de carte » est absent du Worker : à recoller (voir docs/terre-carte.md)'); process.exit(1); }
const marque = '} catch (e) {\n}\n', fin = src.indexOf(marque, src.indexOf('CONSIGNES_AGENT += " LA TERRE EST UNE CARTE', debut)) + marque.length;
const bloc = src.slice(debut, fin);
const sortie = { outils: {}, groupes: {} };
const ctx = { declarer: o => { sortie.outils[o.nom] = o; }, init_agent() {}, GROUPES_OUTILS: sortie.groupes, CONSIGNES_AGENT: 'BASE.', poser: (s, a, texte, consigne) => { s.actions.push(a); return 'ACTION ' + texte + ' | ' + consigne; } };
vm.createContext(ctx); vm.runInContext(bloc + '\nthis.CONSIGNES=CONSIGNES_AGENT;', ctx);
const J = x => JSON.parse(JSON.stringify(x));
const s = () => ({ actions: [] });
const T = sortie.outils;

await t('quatre outils déclarés, côté page, noms acceptés par les API (sans point), schémas cohérents', () => {
  assert.deepEqual(Object.keys(T), ['earth_show_place', 'earth_show_route', 'earth_show_devices', 'earth_set_zoom']);
  for (const o of Object.values(T)) { assert.equal(o.cote, 'page'); assert.equal(o.famille, 'page'); assert.match(o.nom, /^[a-zA-Z0-9_-]{1,64}$/); assert.ok(o.description.length > 60); for (const r of o.requis) assert.ok(o.params[r], r); }
  assert.deepEqual(J(T.earth_show_place.requis), ['query']); assert.deepEqual(J(T.earth_show_route.requis), ['to']); assert.deepEqual(J(T.earth_show_devices.requis), []); assert.deepEqual(J(T.earth_set_zoom.requis), ['level']);
  assert.deepEqual(J(T.earth_show_route.params.mode.enum), ['voiture', 'velo', 'pied']);
});
await t('earth_show_place → action « terre » avec le nom logique earth.show_place', async () => {
  let ss = s(); await T.earth_show_place.executer({}, {}, { query: 'Castres' }, ss); assert.deepEqual(J(ss.actions), [{ type: 'terre', outil: 'earth.show_place', args: { query: 'Castres' } }]);
  ss = s(); await T.earth_show_place.executer({}, {}, { query: 'le Mont-Blanc', zoom: 'rue' }, ss); assert.deepEqual(J(ss.actions)[0].args, { query: 'le Mont-Blanc', zoom: 'rue' });
  ss = s(); await T.earth_show_place.executer({}, {}, { query: 'x'.repeat(500) }, ss); assert.equal(ss.actions[0].args.query.length, 160, 'borné');
  await assert.rejects(() => T.earth_show_place.executer({}, {}, {}, s()), /manquant/);
});
await t('earth_show_route : départ facultatif, mode contrôlé (voiture par défaut)', async () => {
  let ss = s(); await T.earth_show_route.executer({}, {}, { to: 'Toulouse' }, ss); assert.deepEqual(J(ss.actions), [{ type: 'terre', outil: 'earth.show_route', args: { to: 'Toulouse', from: '', mode: 'voiture' } }]);
  ss = s(); await T.earth_show_route.executer({}, {}, { to: 'Toulouse', from: 'Castres', mode: 'pied' }, ss); assert.deepEqual(J(ss.actions)[0].args, { to: 'Toulouse', from: 'Castres', mode: 'pied' });
  ss = s(); await T.earth_show_route.executer({}, {}, { to: 'Toulouse', mode: 'fusée' }, ss); assert.equal(ss.actions[0].args.mode, 'voiture');
  await assert.rejects(() => T.earth_show_route.executer({}, {}, { from: 'Castres' }, s()), /manquant/);
});
await t('earth_show_devices et earth_set_zoom', async () => {
  let ss = s(); await T.earth_show_devices.executer({}, {}, {}, ss); assert.deepEqual(J(ss.actions), [{ type: 'terre', outil: 'earth.show_devices', args: { device: '' } }]);
  ss = s(); await T.earth_show_devices.executer({}, {}, { device: 'téléphone' }, ss); assert.equal(ss.actions[0].args.device, 'téléphone');
  ss = s(); await T.earth_set_zoom.executer({}, {}, { level: 14 }, ss); assert.deepEqual(J(ss.actions)[0].args, { level: '14' }); ss = s(); await T.earth_set_zoom.executer({}, {}, { level: 'rue' }, ss); assert.equal(ss.actions[0].args.level, 'rue');
  await assert.rejects(() => T.earth_set_zoom.executer({}, {}, {}, s()), /manquant/);
});
await t('groupe de mots-clés : « montre-moi Castres », « où est mon téléphone », « zoome niveau rue », « itinéraire jusqu’à Toulouse » chargent les outils de la Terre', () => {
  const g = sortie.groupes.terre; assert.ok(g); assert.deepEqual(J(g.outils), Object.keys(T));
  const norm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const p of ['montre-moi Castres', 'où est mon téléphone', 'zoome niveau rue', 'itinéraire jusqu’à Toulouse', 'montre le Mont-Blanc', 'emmène-moi à Albi', 'où est ma tablette']) assert.ok(g.mots.test(norm(p)), p);
  assert.ok(!g.mots.test(norm('quel est le prix du bitcoin')), 'pas de déclenchement parasite');
});
await t('consignes de l’agent : outils de la Terre plutôt que la recherche web, aucun chiffre inventé, échec dit', () => {
  const c = ctx.CONSIGNES; assert.match(c, /LA TERRE EST UNE CARTE/); assert.match(c, /earth_show_place/); assert.match(c, /jamais la recherche web/); assert.match(c, /n’invente aucun chiffre/); assert.match(c, /dis-le simplement/);
});
await t('le Worker entier reste un module valide et déclare toujours les outils « afficher_carte » et « itineraire » (compatibilité)', () => {
  assert.ok(src.includes('nom: "afficher_carte"') && src.includes('nom: "itineraire"'));
});
console.log(ok + ' tests réussis');
