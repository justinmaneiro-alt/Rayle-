// Textures réelles de la scène Univers (Lune, planètes, anneaux, relief, océans) : présence, poids, tailles, crédits, cache hors ligne ; images fixes du mode Éco.   node tests/espace-astres-test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const racine = new URL('../', import.meta.url);
const lire = f => fs.readFileSync(new URL(f, racine), 'utf8');
const taille = f => fs.statSync(new URL(f, racine)).size;
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };

const CORPS = ['lune', 'mercure', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune'];

await t('textures réelles : 1k et 2k pour la Lune et les 7 planètes, anneaux, relief et océans de la Terre — tous présents, WebP', () => {
  for (const n of CORPS) for (const r of ['1k', '2k']) {
    const f = `ui/assets/espace/${n}-${r}.webp`; assert.ok(fs.existsSync(new URL(f, racine)), f + ' manquant');
    assert.equal(lire(f).slice(0, 4), 'RIFF'); assert.ok(taille(f) > 1000, f + ' vide');
  }
  for (const f of ['saturne-anneaux', 'terre-relief-2k', 'terre-ocean-1k']) assert.ok(fs.existsSync(new URL(`ui/assets/espace/${f}.webp`, racine)), f);
});
await t('la scène Univers utilise bien ces textures (rien d’orphelin côté code)', () => {
  const tout = ['js/univers/espace/vue-systeme.js', 'js/univers/espace/vue-mars.js', 'js/univers/espace/terre.js', 'js/univers/espace/systeme.js', 'js/univers/espace/ciel.js', 'js/univers/donnees/planetes.js'].map(lire).join('\n');
  for (const n of ['mercure', 'venus', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune']) assert.ok(tout.includes('espace/' + n) || tout.includes("'" + n + "'") || tout.includes('`' + n), n + ' non utilisée');
  assert.match(tout, /saturne-anneaux/); assert.match(tout, /terre-relief-2k/); assert.match(tout, /ciel-/);
});
await t('poids : tout ui/assets/espace pèse au plus 6 Mo, et le palier par défaut (1k) reste léger', () => {
  const tous = fs.readdirSync(new URL('ui/assets/espace/', racine)).map(f => taille('ui/assets/espace/' + f));
  const total = tous.reduce((a, b) => a + b, 0);
  assert.ok(total <= 6 * 1024 * 1024, 'total ' + total);
  const un = CORPS.reduce((s, n) => s + taille(`ui/assets/espace/${n}-1k.webp`), 0);
  assert.ok(un < 1.2 * 1024 * 1024, '1k : ' + un);
  for (const n of CORPS) assert.ok(taille(`ui/assets/espace/${n}-2k.webp`) < 1.2 * 1024 * 1024, n + ' 2k trop lourd');
});
await t('dimensions des textures : 1024×512 (1k) et 2048×1024 (2k)', () => {
  const dim = f => { const b = fs.readFileSync(new URL(f, racine)); const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; } throw new Error(k); };
  for (const n of CORPS) { assert.deepEqual(dim(`ui/assets/espace/${n}-1k.webp`), [1024, 512], n + ' 1k'); assert.deepEqual(dim(`ui/assets/espace/${n}-2k.webp`), [2048, 1024], n + ' 2k'); }
});
await t('crédits : Solar System Scope (CC BY 4.0), NASA, relief calculé, tout est déclaré', () => {
  const c = lire('ui/assets/CREDITS.txt');
  assert.match(c, /Solar System Scope/); assert.match(c, /CC BY 4\.0/); assert.match(c, /terre-relief-2k/); assert.match(c, /terre-ocean-1k/); assert.match(c, /saturne-anneaux/);
  assert.match(c, /NASA/); assert.match(c, /GEBCO|Topography/);
});
await t('service worker : textures en cache d’abord, dans un cache à part qui survit aux nouvelles versions', () => {
  const sw = lire('sw.js');
  assert.match(sw, /CACHE_TEX\s*=\s*'rayle-tex-/); assert.match(sw, /\/ui\/assets\/espace\//); assert.match(sw, /texturesCacheDabord/);
  assert.match(sw, /k\.startsWith\('rayle-tex-'\)/, 'l’activation ne supprime pas le cache des textures');
});
await t('images fixes Éco : portrait 1080×1920, paysage 1920×1080, Terre 1024×1024 transparente, toutes légères', () => {
  const dim = f => { const b = fs.readFileSync(new URL('ui/assets/' + f, racine)); const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10) };
    if (k === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
    throw new Error(f + ' ' + k); };
  assert.deepEqual([dim('fond-espace-paysage.webp').w, dim('fond-espace-paysage.webp').h], [1920, 1080]);
  assert.deepEqual([dim('fond-espace-portrait.webp').w, dim('fond-espace-portrait.webp').h], [1080, 1920]);
  const p = dim('fond-globe-planete.webp'); assert.deepEqual([p.w, p.h, p.alpha], [1024, 1024, true]);
  for (const f of ['fond-espace-paysage.webp', 'fond-espace-portrait.webp', 'fond-globe-planete.webp']) assert.ok(taille('ui/assets/' + f) < 400 * 1024, f);
});
console.log(ok + ' tests réussis');
