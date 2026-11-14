import assert from 'node:assert/strict';
import { filtrerProposes, atrSimple, etiquettesLibres } from '../front/or/proposes-filtre.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const B = Array.from({ length: 30 }, (_, i) => ({ h: 101 + i % 2, l: 99, c: 100 })); const atr = atrSimple(B); ok(atr > 1.9 && atr < 3.1, 'atr ' + atr);
// 300 niveaux espacés de 0,1 ATR autour du prix : jamais plus de 6, tous à ± 8 ATR, écart ≥ 0,5 ATR
const P = Array.from({ length: 300 }, (_, i) => ({ p: 100 - 15 * atr + i * 0.1 * atr, cle: 'k' + i, unite: 'H4' }));
const R = filtrerProposes(P, 100, atr); ok(R.length <= 6 && R.length >= 1, 'max 6 : ' + R.length);
ok(R.every(x => Math.abs(x.p - 100) <= 8 * atr + 1e-9), 'portée');
for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) ok(Math.abs(R[i].p - R[j].p) >= 0.5 * atr - 1e-9, 'fusion');
ok(filtrerProposes([{ p: 100 + 20 * atr, cle: 'x' }], 100, atr).length === 0, 'trop loin écarté');
ok(filtrerProposes([], 100, atr).length === 0 && filtrerProposes(null, 100, atr).length === 0, 'vide');
ok(filtrerProposes(P, NaN, atr).length === 0, 'prix absent');
ok(filtrerProposes(P, 100, 0).length === 6, 'sans ATR : 6 au plus');
const lib = etiquettesLibres([{ cle: 'a' }, { cle: 'b' }, { cle: 'c' }], { a: 10, b: 14, c: 40 }, 12); ok(lib.has('a') && !lib.has('b') && lib.has('c'), 'étiquettes');
console.log('proposes-filtre : ' + n + ' vérifications OK');
{ const { reduireMA } = await import('../front/or/proposes-filtre.js'); let m = 0; const ok2 = (c, t) => { assert.ok(c, t); m++; };
  const H = 3600e3, bars = Array.from({ length: 10 }, (_, i) => ({ t: i * 24 * H })); const pts = Array.from({ length: 240 }, (_, i) => ({ t: i * H, v: 100 + i }));
  const r = reduireMA(pts, bars); ok2(r.length === 10, 'une par bougie : ' + r.length); ok2(r[0].v === 123 && r[9].v === 339, 'dernière valeur de chaque bougie : ' + r[0].v + ' ' + r[9].v);
  ok2(r.every((x, i) => i === 0 || x.t > r[i - 1].t), 'temps strictement croissants'); ok2(reduireMA([], bars).length === 0 && reduireMA(pts, []).length === 0, 'vide');
  console.log('reduireMA : ' + m + ' vérifications OK'); }
