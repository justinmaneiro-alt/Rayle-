/* Test pur : saisie des nombres (virgule ET point). Usage : node trader-pro/tests/nombre-test.mjs */
import assert from 'node:assert/strict';
import { lireNombre, lireNombreOuZero, nettoyerSaisie } from '../commun/nombre.js';
let n = 0; const ok = (a, b, m) => { assert.equal(a, b, m); n++; };
ok(lireNombre('0,1'), 0.1, 'virgule'); ok(lireNombre('0.1'), 0.1, 'point'); ok(lireNombre('01'), 1, '« 01 » reste lisible');
ok(lireNombre('1 234,5'), 1234.5); ok(lireNombre('1 234,5'), 1234.5); ok(lireNombre('1.234,5'), 1234.5); ok(lireNombre('1,234.5'), 1234.5);
ok(lireNombre('1,234,567'), 1234567, 'plusieurs virgules = milliers'); ok(lireNombre('-0,25'), -0.25); ok(lireNombre('−0,25'), -0.25, 'moins typographique'); ok(lireNombre('+3,5'), 3.5);
ok(lireNombre(',5'), 0.5); ok(lireNombre('5,'), 5); ok(lireNombre('0٫1'), 0.1, 'virgule arabe'); ok(lireNombre('0，1'), 0.1, 'virgule pleine chasse');
ok(lireNombre(''), null); ok(lireNombre('abc'), null); ok(lireNombre(null), null); ok(lireNombre(undefined), null); ok(lireNombre(12.5), 12.5); ok(lireNombre('12 %'), 12);
ok(lireNombreOuZero(''), 0); ok(lireNombreOuZero('0,1'), 0.1);
ok(nettoyerSaisie('0,1'), '0,1', 'la virgule tapée est conservée'); ok(nettoyerSaisie('0.1'), '0.1'); ok(nettoyerSaisie('0٫1'), '0,1'); ok(nettoyerSaisie('1a2b'), '12');
console.log(`nombre-test : ${n} vérifications, tout passe`);
