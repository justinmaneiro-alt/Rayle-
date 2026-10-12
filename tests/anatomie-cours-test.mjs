// Cours de l'utilisateur (base de connaissances) : découpage, recherche BM25 sans accents, extraits pour l'IA.   node tests/anatomie-cours-test.mjs
import assert from 'node:assert/strict';

// IndexedDB minimal en mémoire
const donnees = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      const db = { createObjectStore() { }, transaction() {
        const t = { objectStore: () => ({
          put: d => { donnees.set(d.id, JSON.parse(JSON.stringify(d))); queueMicrotask(() => t.oncomplete && t.oncomplete()); return {}; },
          delete: id => { donnees.delete(id); queueMicrotask(() => t.oncomplete && t.oncomplete()); return {}; },
          getAll: () => { const r = { result: Array.from(donnees.values()).map(x => JSON.parse(JSON.stringify(x))) }; queueMicrotask(() => t.oncomplete && t.oncomplete()); return r; }
        }) };
        return t;
      } };
      req.result = db; req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess();
    });
    return req;
  }
};
const K = await import('../js/anatomie/cours.js');
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const COURS_GENOU = `# Biomécanique du genou

Le genou est une articulation trochléenne et condylienne. La flexion est limitée par le contact des masses musculaires, l'extension par les ligaments croisés.

## Le quadriceps

Le quadriceps s'insère sur la tubérosité tibiale antérieure par le tendon patellaire. Il est innervé par le nerf fémoral (L2-L4) et permet l'extension du genou.

## Orthèses de genou

Une orthèse ligamentaire en carbone limite le tiroir antérieur. L'appui se fait sur le tendon patellaire et la tête de la fibula doit rester déchargée car le nerf fibulaire commun y passe.`;
const COURS_CORSET = `Corset de Chêneau

Le corset de Chêneau est un corset thermoformé asymétrique. Il comporte des zones de pression sur la convexité et des zones d'expansion sur la concavité, pour obtenir une dérotation de la colonne.

Matériaux

On utilise le polyéthylène ou le PA6 imprimé en 3D. Les pelotes sont en mousse EVA.`;

await t('découpage en passages avec les titres', () => {
  const p = K.decouper(COURS_GENOU);
  assert.ok(p.length >= 3, 'passages : ' + p.length); assert.ok(p.some(x => x.startsWith('Le quadriceps — ')));
  assert.ok(p.every(x => x.length < 1100));
});
await t('ajout, liste, suppression', async () => {
  const a = await K.ajouter({ titre: 'Biomécanique du genou', texte: COURS_GENOU });
  await K.ajouter({ titre: 'Corsets', texte: COURS_CORSET });
  assert.equal((await K.lister()).length, 2);
  await assert.rejects(() => K.ajouter({ titre: 'x', texte: 'trop court' }));
  const b = await K.ajouter({ titre: 'Poubelle', texte: 'Un texte quelconque assez long pour être enregistré dans la base.' });
  await K.supprimer(b.id); assert.equal((await K.lister()).length, 2);
});
await t('recherche : accents, pluriels, pertinence', async () => {
  let r = await K.chercher("Où s'insère le quadriceps ?");
  assert.ok(r.length >= 1 && /quadriceps/.test(r[0].texte) && r[0].titre === 'Biomécanique du genou', JSON.stringify(r[0] && r[0].titre));
  r = await K.chercher('corset de Cheneau pelotes');
  assert.equal(r[0].titre, 'Corsets');
  r = await K.chercher('nerf fibulaire commun tête de la fibula orthèse');
  assert.equal(r[0].titre, 'Biomécanique du genou'); assert.match(r[0].texte, /fibulaire/);
  assert.deepEqual(await K.chercher('recette de la tarte aux pommes'), []);
  assert.deepEqual(await K.chercher(''), []);
});
await t('extraits pour l’IA : cités avec le titre du cours', async () => {
  const c = await K.contexte('matériaux du corset de Chêneau');
  assert.match(c, /EXTRAITS DES COURS/); assert.match(c, /\(Corsets\)/); assert.match(c, /PA6/);
  assert.equal(await K.contexte('recette de la tarte'), '');
});
await t('import de fichiers : texte, HTML ; le PDF est refusé avec explication', async () => {
  const faux = (nom, contenu, type = 'text/plain') => ({ name: nom, type, size: contenu.length, text: async () => contenu });
  const d = await K.importerFichier(faux('Cours anatomie.html', '<html><style>x{}</style><body><h1>Le deltoïde</h1><p>Le deltoïde est innervé par le nerf axillaire et réalise l\'abduction du bras.</p></body></html>', 'text/html'));
  assert.equal(d.titre, 'Cours anatomie'); assert.ok(!/<|style/.test(d.passages.join(' ')));
  assert.ok((await K.chercher('innervation du deltoïde'))[0].texte.includes('axillaire'));
  await assert.rejects(() => K.importerFichier({ name: 'cours.pdf', type: 'application/pdf', size: 10, text: async () => '' }), /PDF/);
});
console.log(ok + ' tests réussis');
