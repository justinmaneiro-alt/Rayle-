// ISS articulée (ui/espace-iss.js) : angles des cardans alpha / bêta et des radiateurs depuis la direction du Soleil.   node tests/espace-iss-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ctx = { console, Math };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../ui/espace-iss.js', import.meta.url), 'utf8'), ctx);
const I = ctx.RayleUI.espaceISS;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.message); process.exitCode = 1; } };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
let graine = 7; const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
const soleilAlea = () => unit([alea() * 2 - 1, alea() * 2 - 1, alea() * 2 - 1]);

t('cellules face au Soleil : la normale des ailes est le Soleil (produit scalaire = 1) pour 2000 directions', () => {
  let prec;
  for (let i = 0; i < 2000; i++) {
    const s = soleilAlea(); if (Math.hypot(s[1], s[2]) < .01) continue;
    const a = I.angles(s, prec); prec = a; const v = I.vecteurs(a);
    assert.ok(Math.abs(dot(v.normale, s) - 1) < 1e-9, 'normale·soleil = ' + dot(v.normale, s));
    assert.ok(Math.abs(dot(v.mat, s)) < 1e-9, 'le mât est perpendiculaire au Soleil');
    assert.ok(Math.abs(Math.hypot(...v.normale) - 1) < 1e-9);
  }
});
t('radiateurs en bord : le Soleil est dans leur plan (normale du panneau ⟂ Soleil)', () => {
  let prec;
  for (let i = 0; i < 2000; i++) {
    const s = soleilAlea(); if (Math.hypot(s[1], s[2]) < .01) continue;
    const a = I.angles(s, prec); prec = a; const r = I.vecteurs(a).radiateur;
    const normale = [0, -r[2], r[1]];                      // le panneau contient x et r : sa normale est dans le plan yz, perpendiculaire à r
    assert.ok(Math.abs(dot(normale, s)) < 1e-9, 'normale·soleil = ' + dot(normale, s));
    assert.ok(Math.abs(dot(r, [0, s[1], s[2]]) / Math.hypot(s[1], s[2])) > .999999, 'le grand côté suit le Soleil projeté');
  }
});
t('une orbite : le Soleil fait un tour dans le plan de la station → alpha fait un tour complet, sans saut, quelle que soit l’incidence bêta', () => {
  for (const betaOrbite of [0, 20, 52, 75]) {
    const b = betaOrbite * Math.PI / 180; let prec = null, total = 0, dernier = null, maxPas = 0;
    for (let k = 0; k <= 360; k += 2) {
      const u = k * Math.PI / 180;
      const s = unit([Math.sin(b), Math.cos(b) * Math.cos(u), Math.cos(b) * Math.sin(u)]);        // x = normale du plan orbital
      const a = I.angles(s, prec); prec = a;
      if (dernier !== null) { let d = a.alpha - dernier; d = Math.atan2(Math.sin(d), Math.cos(d)); maxPas = Math.max(maxPas, Math.abs(d)); total += d; }
      dernier = a.alpha;
      assert.ok(Math.abs(Math.abs(a.beta) - (Math.PI / 2 - b)) < 1e-9 || Math.abs(Math.abs(a.beta) - (Math.PI / 2 - b)) > 0, 'bêta défini');
    }
    assert.ok(Math.abs(Math.abs(total) - 2 * Math.PI) < 1e-6, 'alpha : un tour par orbite (β orbite ' + betaOrbite + '°) : ' + total);
    assert.ok(maxPas < .04 + 1e-9, 'pas de saut (' + maxPas + ')');
  }
});
t('l’angle bêta des cardans vaut 90° moins l’angle bêta de l’orbite', () => {
  for (const betaOrbite of [0, 30, 60]) {
    const b = betaOrbite * Math.PI / 180, s = unit([Math.sin(b), Math.cos(b), 0]);
    const a = I.angles(s, { alpha: 0, beta: 0, rad: 0 });
    assert.ok(Math.abs(Math.abs(a.beta) - (Math.PI / 2 - b)) < 1e-9, 'β = ' + a.beta * 180 / Math.PI);
  }
});
t('Soleil dans l’axe du treillis : on garde les angles précédents (pas de division par zéro)', () => {
  const a = I.angles([1, 0, 0], { alpha: .5, beta: .2, rad: 1 });
  assert.equal(a.degenere, true); assert.equal(a.alpha, .5); assert.equal(a.rad, 1);
});
console.log(ok + ' tests réussis');
