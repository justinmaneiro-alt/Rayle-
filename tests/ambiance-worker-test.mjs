// Outil « regler_ambiance » côté Worker (worker/worker.js) : déclaré, paramètres bornés.   node tests/ambiance-worker-test.mjs
// Le dossier worker/ n'est pas publié sur GitHub : sans lui, le test est simplement sauté.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const fichier = new URL('../worker/worker.js', import.meta.url);
if (!fs.existsSync(fichier)) { console.log('  (worker/worker.js absent : test sauté)'); process.exit(0); }
const { default: worker } = await import(fichier.href);
const env = { RAYLE_TOKEN: 'code-de-test-123456' };
const ctx = { waitUntil(p) { Promise.resolve(p).catch(() => {}); } };
const r = await worker.fetch(new Request('https://w.test/outils', { headers: { 'X-Rayle-Token': env.RAYLE_TOKEN, 'CF-Connecting-IP': '10.1.1.1' } }), env, ctx);
const d = await r.json();
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const outil = (d.outils || []).flatMap(f => f.outils).find(o => o.nom === 'regler_ambiance');
t('l’outil « regler_ambiance » est déclaré (côté page)', () => { assert.equal(r.status, 200); assert.ok(outil, 'outil absent'); });
const src = fs.readFileSync(fichier, 'utf8');
t('paramètres : ambiances, thèmes, fonds et entités connus de la page', () => {
  const bloc = src.slice(src.indexOf('nom: "regler_ambiance"'), src.indexOf('GROUPES_OUTILS.ambiance'));
  for (const v of ['auto', 'off', 'detente', 'focus', 'pluie', 'orage', 'neige', 'brouillard', 'nuit', 'aube', 'crepuscule']) assert.ok(bloc.includes('"' + v + '"'), 'ambiance ' + v);
  for (const v of ['originel', 'arc', 'rouge', 'aurore', 'ambre', 'nebuleuse', 'jarvis', 'video', 'sphere', 'neurones', 'espace', 'mars', 'jupiter', 'saturne', 'iss', 'terre']) assert.ok(bloc.includes('"' + v + '"'), v);
  assert.ok(/duree_minutes/.test(bloc) && /Math\.min\(1440/.test(bloc), 'durée bornée à 24 h');
});
t('groupe de mots-clés : « ambiance pluie », « mets le thème », « il neige »… offrent l’outil à l’IA', () => {
  const m = src.match(/GROUPES_OUTILS\.ambiance = \{\s*mots: (\/.*\/),/); assert.ok(m, 'groupe absent');
  const re = eval(m[1]);
  for (const p of ['mets l ambiance detente', 'adapte l ambiance a la meteo', 'passe en mode nuit', 'change le theme', 'il neige', 'plus de vent', 'mets le fond espace', 'emmene moi voir saturne', 'montre la lune']) assert.ok(re.test(p), p);
  for (const p of ['quel est le prix du bitcoin', 'ouvre le terminal']) assert.ok(!re.test(p), p);
});
console.log(ok + ' tests réussis');
