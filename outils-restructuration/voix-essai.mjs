import { createRequire } from 'node:module';
import fs from 'node:fs';
const src = fs.readFileSync('core/voice/normalisation-fr.js', 'utf8');
const m = { exports: {} }; new Function('module', 'exports', 'window', 'self', src + '\n;')(m, m.exports, {}, {});
const N = m.exports && (m.exports.normaliser ? m.exports : null) || globalThis.NormFr;
const essais = [
  "Le US100 gagne +1,25 % à 21 345,5 points, RSI 14 à 68 ; voir https://www.lemonde.fr/economie/article/2026/11/11/abc.html",
  "XAU/USD : 3 985,66 $ (−0,4 %) · MA200 = 3 912 — support à 3 950.",
  "RDV à 22h04, le 11/11/2026 ; contact: test@exemple.fr ; #bourse → achat/vente",
  "Séisme M 5,6 près de Tokyo ; 12 000 personnes ; 1er novembre 2026 ; 3e fois.",
  "L'ONU et l'OTAN, la BCE, la Fed, le CAC 40, l'IA, le PIB, le BTP, 20 Minutes, France 24."
];
for (const e of essais) { console.log('AVANT :', e); console.log('APRÈS :', JSON.stringify(N.phrases(N.normaliser(e)))); console.log(); }
