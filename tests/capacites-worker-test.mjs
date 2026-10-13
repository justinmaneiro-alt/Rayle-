// Outil « commande_espace » côté Worker (worker/worker.js) : déclaré, paramètres corrigés ou refusés, groupe de mots-clés, consignes honnêtes.   node tests/capacites-worker-test.mjs
// Le dossier worker/ n'est pas publié sur GitHub : sans lui, le test est simplement sauté.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const fichier = new URL('../worker/worker.js', import.meta.url);
if (!fs.existsSync(fichier)) { console.log('  (worker/worker.js absent : test sauté)'); process.exit(0); }
const src = fs.readFileSync(fichier, 'utf8');
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const { default: worker } = await import(fichier.href);
const env = { RAYLE_TOKEN: 'code-de-test-123456' };
const r = await worker.fetch(new Request('https://w.test/outils', { headers: { 'X-Rayle-Token': env.RAYLE_TOKEN, 'CF-Connecting-IP': '10.1.1.2' } }), env, { waitUntil() {} });
const d = await r.json();
const outil = (d.outils || []).flatMap(f => f.outils).find(o => o.nom === 'commande_espace');

// le bloc du Worker exécuté avec de faux « declarer » / « poser »
const debut = src.indexOf('// src/capacites.js (phase capacités)'), fin = src.indexOf('// src/relais.js (phase 3B)');
const bloc = src.slice(debut, fin);
const sortie = { outils: {}, groupes: {}, actions: [] };
const ctx = { declarer: o => { sortie.outils[o.nom] = o; }, init_agent() {}, GROUPES_OUTILS: sortie.groupes, CONSIGNES_AGENT: 'BASE.', poser: (s, a, texte, consigne) => { s.actions.push(a); return 'ACTION EFFECTUÉE (côté page) : ' + texte + '. CONSIGNE : ' + consigne; } };
vm.createContext(ctx); vm.runInContext(bloc + '\nthis.CONSIGNES=CONSIGNES_AGENT;', ctx);
const J = x => JSON.parse(JSON.stringify(x));
const tool = sortie.outils.commande_espace, s = () => ({ actions: [] });

await t('l’outil « commande_espace » est déclaré dans le Worker (côté page)', () => { assert.equal(r.status, 200); assert.ok(outil, 'outil absent de /outils'); assert.equal(outil.cote, 'page'); });
await t('étapes : liste, texte seul ou raccourci « cible » ; bornées à 6 étapes de 120 caractères', async () => {
  let ss = s(); await tool.executer({}, {}, { etapes: ['montre-moi Mars', 'montre Perseverance'] }, ss); assert.deepEqual(J(ss.actions), [{ type: 'espace', phrases: ['montre-moi Mars', 'montre Perseverance'] }]);
  ss = s(); await tool.executer({}, {}, { etapes: 'zoome dessus' }, ss); assert.deepEqual(J(ss.actions)[0].phrases, ['zoome dessus']);
  ss = s(); await tool.executer({}, {}, { cible: 'Saturne' }, ss); assert.deepEqual(J(ss.actions)[0].phrases, ['montre-moi Saturne']);
  ss = s(); await tool.executer({}, {}, { etapes: Array.from({ length: 10 }, (_, i) => 'x'.repeat(300) + i) }, ss); assert.equal(ss.actions[0].phrases.length, 6); assert.ok(ss.actions[0].phrases.every(p => p.length <= 120));
  ss = s(); await tool.executer({}, {}, { etapes: [null, '  ', 'recule'] }, ss); assert.deepEqual(J(ss.actions)[0].phrases, ['recule']);
});
await t('paramètre vide ou mal formé : échec explicite (l’IA réessaie), aucune action posée', async () => {
  const ss = s(); await assert.rejects(() => tool.executer({}, {}, {}, ss), /précise au moins une étape/); await assert.rejects(() => tool.executer({}, {}, { etapes: [] }, ss), /précise/); assert.equal(ss.actions.length, 0);
});
await t('le résultat n’affirme pas un succès que la page ne connaît pas encore : la page confirme ou remplace', async () => {
  const x = await tool.executer({}, {}, { etapes: ['montre-moi Mars'] }, s()); assert.match(x, /la page exécute, confirme ou signale un échec, et sa phrase remplace la tienne si l’action échoue/);
});
await t('groupe de mots-clés : montrer, zoomer, revenir… offrent l’outil ; une question de marché non', () => {
  const re = ctx.GROUPES_OUTILS.espace.mots;
  for (const p of ['montre moi mars puis perseverance', 'zoome dessus', 'et sa lune', 'reviens sur la terre', 'garde cette vue', 'echelle realiste', 'emmene moi voir saturne', 'ou est curiosity', 'montre le trou noir']) assert.ok(re.test(p), p);
  for (const p of ['quel est le prix du bitcoin', 'ajoute le rsi']) assert.ok(!re.test(p), p);
  assert.deepEqual([...ctx.GROUPES_OUTILS.espace.outils], ['commande_espace']);
});
await t('consignes de l’agent : outils d’abord (jamais de recherche web), enchaînement, hypothèse probable, échec dit, honnêteté sur les chiffres, mode d’échelle', () => {
  const c = ctx.CONSIGNES;
  for (const m of ['commande_espace', 'jamais la recherche web', 'enchaîne plusieurs étapes en un seul appel', 'hypothèse la plus probable', 'dis-le simplement, sans prétendre qu\'elle est faite', 'dis que tu ne l\'as pas au lieu de l\'inventer', 'échelle réaliste ou pédagogique']) assert.ok(c.includes(m), m);
  assert.ok(c.startsWith('BASE.'));
  assert.ok(/CONSIGNES_AGENT \+= /.test(bloc));
});
console.log(ok + ' groupes réussis');
