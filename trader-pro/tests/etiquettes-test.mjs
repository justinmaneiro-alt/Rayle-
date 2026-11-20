/* Tests purs de l'empilement des étiquettes de l'axe des prix (v6, A6). Usage : node trader-pro/tests/etiquettes-test.mjs */
import { empiler } from '../volume/etiquettes-axe.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const sansChevauchement = (L, e) => { const s = [...L].sort((a, b) => a - b); return s.every((x, i) => i === 0 || x - s[i - 1] >= e - 1e-9); };
v(empiler([]).length === 0, 'liste vide');
v(JSON.stringify(empiler([100, 200, 300], 15)) === '[100,200,300]', 'étiquettes déjà espacées : inchangées');
const a = empiler([100, 102, 104, 106], 15); v(sansChevauchement(a, 15) && a[0] === 100, 'quatre étiquettes collées : écart minimal respecté, la première ne bouge pas (' + a + ')');
const b = empiler([500, 498, 501, 499], 14, 0, 520); v(sansChevauchement(b, 14) && Math.max(...b) <= 520, 'ordre quelconque, bornées en bas (' + b + ')');
const c = empiler([495, 497, 499], 15, 0, 500); v(sansChevauchement(c, 15) && Math.max(...c) <= 500, 'débordement en bas : on remonte (' + c + ')');
const d = empiler([2, 3], 15, 8, 500); v(d[0] >= 8 && sansChevauchement(d, 15), 'bornées en haut (' + d + ')');
const e = empiler([300, 100], 15); v(e[0] === 300 && e[1] === 100, 'l\'ordre des entrées est conservé en sortie');
const f = Array.from({ length: 40 }, (_, i) => 200 + i % 3); const r = empiler(f, 15, 0, 1000); v(sansChevauchement(r, 15) && Math.max(...r) <= 1000, '40 étiquettes au même endroit : empilées sans chevauchement');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `etiquettes-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
