// Outil « commande_drive » côté Worker (worker/worker.js) : déclaré, phrase nettoyée ou refusée, groupe de mots-clés, consigne d'honnêteté.   node tests/drive-worker-test.mjs
// Le dossier worker/ n'est pas publié sur GitHub : sans lui, le test est simplement sauté.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const fichier = new URL('../worker/worker.js', import.meta.url);
if (!fs.existsSync(fichier)) { console.log('  (worker/worker.js absent : test sauté)'); process.exit(0); }
const src = fs.readFileSync(fichier, 'utf8');
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const debut = src.indexOf('// src/drive.js (phase Drive)'), fin = src.indexOf('// src/relais.js (phase 3B)');
if (debut < 0) { console.log('  ✘ le Worker n’a pas encore l’outil commande_drive (colle worker/worker.js dans Cloudflare)'); process.exit(1); }
const sortie = { outils: {}, groupes: {} };
const ctx = { declarer: o => { sortie.outils[o.nom] = o; }, init_agent() {}, GROUPES_OUTILS: sortie.groupes, CONSIGNES_AGENT: 'BASE.', poser: (s, a, texte, consigne) => { s.actions.push(a); return 'ACTION: ' + texte + ' | ' + consigne; } };
vm.createContext(ctx); vm.runInContext(src.slice(debut, fin) + '\nthis.CONSIGNES=CONSIGNES_AGENT;', ctx);
const outil = sortie.outils.commande_drive;

await t('l’outil est déclaré côté page, avec une seule entrée obligatoire : la phrase', () => {
  assert.ok(outil); assert.equal(outil.cote, 'page'); assert.deepEqual([...outil.requis], ['phrase']);
  assert.match(outil.description, /N’invente JAMAIS le contenu d’un document/);
});
await t('la phrase est transmise nettoyée et bornée ; vide → échec explicite sans action', async () => {
  const s = { actions: [] }; await outil.executer({}, {}, { phrase: '  ouvre   le cours\n d’anatomie ' }, s);
  assert.deepEqual(JSON.parse(JSON.stringify(s.actions)), [{ type: 'drive', phrase: 'ouvre le cours d’anatomie' }]);
  const l = { actions: [] }; await outil.executer({}, {}, { phrase: 'x'.repeat(900) }, l); assert.equal(l.actions[0].phrase.length, 300);
  const v = { actions: [] }; await assert.rejects(() => outil.executer({}, {}, { phrase: '  ' }, v), /précise la demande/); assert.equal(v.actions.length, 0);
});
await t('le résultat n’affirme rien sur le contenu : la page lit, vérifie et remplace la réponse en cas d’échec', async () => {
  const x = await outil.executer({}, {}, { phrase: 'résume le document' }, { actions: [] });
  assert.match(x, /sans rien dire du contenu du document/); assert.match(x, /sa phrase remplace la tienne si l’action échoue/);
});
await t('le groupe de mots-clés réveille l’outil pour les demandes de documents, pas pour un cours de bourse', () => {
  const re = sortie.groupes.drive.mots; assert.deepEqual([...sortie.groupes.drive.outils], ['commande_drive']);
  for (const p of ['ouvre le cours d’anatomie', 'lis le 2e paragraphe du document', 'résume le pdf', 'corrige la faute dans le rapport', 'mets en plein ecran']) assert.ok(re.test(p), p);
  assert.ok(!re.test('quel est le prix du bitcoin') && !re.test('montre-moi mars'));
});
await t('consignes de l’agent : jamais de recherche web pour un document, ne jamais décrire un contenu non lu', () => {
  assert.match(ctx.CONSIGNES, /DOCUMENTS DU DRIVE/); assert.match(ctx.CONSIGNES, /jamais la recherche web/); assert.match(ctx.CONSIGNES, /ne dis pas qu’un document est lu ou modifié avant le résultat de la page/);
});
console.log(`${ok} tests réussis`);
