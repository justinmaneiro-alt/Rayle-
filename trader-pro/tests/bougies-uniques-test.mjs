/* Tests purs de la série unique (v12, phase 1). Usage : node trader-pro/tests/bougies-uniques-test.mjs */
import { canoniser, comparer } from '../commun/bougies-uniques.js';
import { raccorder } from '../commun/serie-continue.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, b = (t, c, extra = {}) => ({ t, o: c, h: c + 1, l: c - 1, c, v: 0, ...extra });
const unique = Array.from({ length: 6 }, (_, i) => b(i * H + 1800e3, 100 + i));   // grille :30 (indice au comptant)
const volume = Array.from({ length: 6 }, (_, i) => ({ t: i * H, o: 999, h: 999, l: 999, c: 999, v: 10 + i, bv: 5 }));   // grille :00, autres prix
const C = canoniser(unique, volume, H);
v(C.bougies.length === 6, 'canoniser : autant de bougies que la série unique');
v(C.bougies.every((x, i) => x.c === 100 + i && x.t === unique[i].t && x.o === unique[i].o), 'canoniser : les prix viennent UNIQUEMENT de la série unique (jamais ceux du Volume)');
v(C.bougies.every((x, i) => x.v === 10 + i && x.bv === 5), 'canoniser : le volume est rattaché à la bougie qui contient sa date');
const C2 = canoniser(unique, [{ t: unique[2].t, v: 7, bv: 3 }, { t: unique[2].t + 60e3, v: 2, bv: 1 }], H);
v(C2.bougies[2].v === 9 && C2.bougies[2].bv === 4, 'canoniser : plusieurs bougies de volume dans une bougie = somme');
v(C2.bougies[0].v === 0 && C2.sansVolume >= 5 && !('bv' in C2.bougies[0]), 'canoniser : sans volume reçu, 0 et jamais de delta inventé');
v(canoniser([], volume, H).bougies.length === 0, 'canoniser : série unique vide');
/* le bug de la v11 : une source « 1 500 plus anciennes » ne doit plus jamais écraser les prix récents */
const vieux = Array.from({ length: 6 }, (_, i) => b(-100 * H + i * H, 117800 + i, { v: 1 }));
v(canoniser(unique, vieux, H).bougies.every((x, i) => x.c === 100 + i), 'canoniser : un historique périmé du Volume ne change aucun prix');
/* comparer */
const A = Array.from({ length: 400 }, (_, i) => b(i * H, 100 + i));
v(comparer(A, A.map(x => ({ ...x }))).ok, 'comparer : séries identiques');
const B2 = A.map(x => ({ ...x })); B2[350].h += 5; v(!comparer(A, B2).ok && comparer(A, B2).diffs[0].type === 'h', 'comparer : un plus haut différent est détecté');
const B3 = A.slice(0, 399); v(!comparer(A, B3).ok, 'comparer : dernière date différente détectée');
const B4 = A.map(x => ({ ...x })); B4[399].c *= 1.005; v(comparer(A, B4).ok, 'comparer : la bougie en cours peut bouger de moins de 1 %');
const B5 = A.map(x => ({ ...x })); B5[399].c *= 1.05; v(!comparer(A, B5).ok, 'comparer : la bougie en cours ne peut pas bouger de 5 %');
/* raccord : l'historique long ne sert qu'avant la série unique */
const longues = Array.from({ length: 10 }, (_, i) => b(i * H, 100 + i)), recentes = Array.from({ length: 5 }, (_, i) => b(5 * H + 1800e3 + i * H, 105 + i));
const R = raccorder(longues, recentes, { avantSeulement: true });
v(R.bougies.length === 6 + 5 && R.bougies.slice(6).every((x, i) => x.t === recentes[i].t), 'raccorder : avantSeulement retire les bougies longues qui chevauchent la série unique');
v(raccorder(longues, recentes).bougies.length === 15, 'raccorder : comportement d’origine inchangé sans l’option');
console.log(ko ? `bougies-uniques-test : ${ko} échec(s)` : `bougies-uniques-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
