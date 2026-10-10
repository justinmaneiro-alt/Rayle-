// Détecteur de double clap (js/rayle/clap.js) sur des signaux synthétiques :   node tests/clap-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/clap.js', import.meta.url), 'utf8'), ctx);
const SR = 48000, B = 512;
let graine = 3; const rnd = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296 * 2 - 1; };

// fabrique un signal : bruit de fond + événements {t (ms), type}
function signal(dureeMs, evts, bruit = .003) {
  const n = Math.round(SR * dureeMs / 1000), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rnd() * bruit;
  for (const e of evts) {
    const d = Math.round(SR * e.t / 1000);
    if (e.type === 'clap') for (let i = 0; i < SR * .06 && d + i < n; i++) x[d + i] += rnd() * (e.a || .7) * Math.exp(-i / (SR * .007));
    if (e.type === 'syllabe') for (let i = 0; i < SR * .22 && d + i < n; i++) { const t = i / SR, env = Math.min(1, t / .03) * (t > .19 ? Math.max(0, 1 - (t - .19) / .03) : 1); x[d + i] += rnd() * .35 * env; }
    if (e.type === 'porte') for (let i = 0; i < SR * .35 && d + i < n; i++) x[d + i] += rnd() * .8 * Math.exp(-i / (SR * .12));   // choc long et grave
  }
  return x;
}
function compter(x, sens = 'moyenne') {
  const det = ctx.RayleClap.creer({ sensibilite: sens });
  let n = 0;
  for (let i = 0; i + B <= x.length; i += B) if (det.bloc(x.subarray(i, i + B), i / SR * 1000)) n++;
  return n;
}
let ok = 0; const t = (nom, f) => { try { f(); ok++; console.log('  ✔', nom); } catch (e) { console.log('  ✘', nom, '\n   ', e.message); process.exitCode = 1; } };

t('double clap (300 ms d\'écart) → réveil', () => assert.equal(compter(signal(3000, [{ t: 1000, type: 'clap' }, { t: 1300, type: 'clap' }])), 1));
t('double clap à 160 ms et à 580 ms → réveil', () => {
  assert.equal(compter(signal(3000, [{ t: 1000, type: 'clap' }, { t: 1160, type: 'clap' }])), 1);
  assert.equal(compter(signal(3000, [{ t: 1000, type: 'clap' }, { t: 1580, type: 'clap' }])), 1);
});
t('un seul clap → rien', () => assert.equal(compter(signal(3000, [{ t: 1000, type: 'clap' }])), 0));
t('deux claps trop éloignés (900 ms) → rien', () => assert.equal(compter(signal(3000, [{ t: 1000, type: 'clap' }, { t: 1900, type: 'clap' }])), 0));
t('applaudissements (4 claps rapprochés) → rien', () => assert.equal(compter(signal(4000, [0, 250, 500, 750].map(d => ({ t: 1000 + d, type: 'clap' })))), 0));
t('parole (syllabes) → rien', () => assert.equal(compter(signal(4000, [0, 260, 520, 800, 1050, 1300].map(d => ({ t: 1000 + d, type: 'syllabe' })))), 0));
t('porte qui claque (choc long) deux fois → rien', () => assert.equal(compter(signal(3000, [{ t: 1000, type: 'porte' }, { t: 1400, type: 'porte' }])), 0));
t('sensibilité : clap faible détecté en « forte », pas en « faible »', () => {
  const x = signal(3000, [{ t: 1000, type: 'clap', a: .12 }, { t: 1300, type: 'clap', a: .12 }]);
  assert.equal(compter(x, 'forte'), 1);
  assert.equal(compter(x, 'faible'), 0);
});
t('deux doubles claps séparés → deux réveils', () => assert.equal(compter(signal(5000, [{ t: 1000, type: 'clap' }, { t: 1300, type: 'clap' }, { t: 3200, type: 'clap' }, { t: 3500, type: 'clap' }])), 2));
console.log(ok + ' tests réussis');
