// Éclipses de Soleil et de Lune calculées avec les vraies positions (ui/astro.js), comparées aux dates publiées par la NASA :   node tests/univers-eclipses-test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { prochaineEclipse, eclipsesEntre } from '../js/univers/espace/eclipses.js';

const ctx = {}; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/astro.js', import.meta.url), 'utf8'), ctx);
const A = ctx.RayleUI.astro;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const jours = (a, b) => Math.abs(a - b) / 864e5;

// Éclipses de 2026-2027 (NASA, instant du maximum, UTC) : jour exact, heure à ±2 h près
const PUBLIEES = [
  ['soleil', Date.UTC(2026, 1, 17, 12, 12), 'annulaire'], ['lune', Date.UTC(2026, 2, 3, 11, 33), 'totale'], ['soleil', Date.UTC(2026, 7, 12, 17, 46), 'totale'], ['lune', Date.UTC(2026, 7, 28, 4, 13), 'partielle'],
  ['soleil', Date.UTC(2027, 1, 6, 15, 59), 'annulaire'], ['lune', Date.UTC(2027, 1, 20, 23, 13), 'par la pénombre'], ['lune', Date.UTC(2027, 6, 18, 16, 3), 'par la pénombre'],
  ['soleil', Date.UTC(2027, 7, 2, 10, 7), 'totale'], ['lune', Date.UTC(2027, 7, 17, 7, 13), 'par la pénombre'],
];
t('les 9 éclipses de 2026 et 2027 sont retrouvées, ni une de plus ni une de moins', () => {
  const trouvees = eclipsesEntre(A, Date.UTC(2026, 0, 1), Date.UTC(2028, 0, 1));
  assert.equal(trouvees.length, PUBLIEES.length, trouvees.map(e => e.type + ' ' + new Date(e.ts).toISOString()).join(' | '));
  PUBLIEES.forEach(([type, ts, nature], i) => {
    const e = trouvees[i]; assert.equal(e.type, type, 'type de la ' + (i + 1) + 'e'); assert.ok(jours(e.ts, ts) < .1, 'écart ' + (jours(e.ts, ts) * 24).toFixed(1) + ' h pour ' + new Date(ts).toISOString());
    assert.equal(e.nature, nature, new Date(ts).toISOString().slice(0, 10));
  });
});
t('prochaine éclipse depuis le 14 octobre 2026 : celle du 6 février 2027 (annulaire)', () => {
  const e = prochaineEclipse(A, Date.UTC(2026, 9, 14), 800); assert.equal(e.type, 'soleil'); assert.equal(e.nature, 'annulaire'); assert.ok(jours(e.ts, Date.UTC(2027, 1, 6, 16)) < .5);
});
t('filtre par type : la prochaine éclipse de Lune depuis le 14 octobre 2026 est celle du 20 février 2027', () => {
  const e = prochaineEclipse(A, Date.UTC(2026, 9, 14), 800, 'lune'); assert.equal(e.type, 'lune'); assert.ok(jours(e.ts, Date.UTC(2027, 1, 20, 23)) < .5);
});
t('aucune éclipse dans un intervalle trop court', () => { assert.equal(prochaineEclipse(A, Date.UTC(2026, 8, 1), 10), null); });
console.log(ok + ' tests réussis');
