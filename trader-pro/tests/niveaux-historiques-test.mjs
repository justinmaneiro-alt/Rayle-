/* node trader-pro/tests/niveaux-historiques-test.mjs */
import { niveauxHistoriques } from '../terminal/niveaux-historiques.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const J = 86400e3, T0 = Date.UTC(2016, 0, 4);
/* 10 ans de marché : oscillation lente + une zone à 2 000 touchée 4 fois, plus haut absolu 3 000 en 2024, bas 2024 à 1 984 */
const B = []; for (let i = 0; i < 3650; i++) { const t = T0 + i * J, base = 1800 + 600 * Math.sin(i / 400) + i * 0.15; B.push({ t, o: base, h: base + 12, l: base - 12, c: base + 1, v: 1 }); }
const an = y => B.filter(b => new Date(b.t).getUTCFullYear() === y);
const bar2024 = an(2024)[100]; bar2024.h = 3000; an(2024)[200].l = 1984;
const R = niveauxHistoriques(B, { maintenant: Date.UTC(2026, 0, 1), portee: 0.6 });
v(R.niveaux.length > 0 && R.niveaux.length <= 8, 'au plus 8 niveaux : ' + R.niveaux.length);
v(R.niveaux.some(n => n.type === 'ath' && n.prix === 3000 && /Plus haut historique 2024 · 3 000/.test(n.etiquette)), 'plus haut historique 2024 · 3 000 : ' + (R.niveaux.find(n => n.type === 'ath') || {}).etiquette);
v(R.niveaux.every((n, i, L) => i === 0 || L[i - 1].prix > n.prix), 'triés du plus haut au plus bas');
const A = R.niveaux.map(n => n.prix); v(A.every((p, i) => A.every((q, j) => i === j || Math.abs(p - q) >= 1)), 'niveaux fusionnés quand ils sont à moins de 0,5 ATR');
v(niveauxHistoriques(B.slice(0, 100)).niveaux.length === 0, 'moins d’un an de bougies : rien');
const loin = niveauxHistoriques(B, { maintenant: Date.UTC(2026, 0, 1), portee: 0.001 }); v(loin.niveaux.length <= 1, 'portée étroite : seuls les niveaux tout proches du prix');
const e = niveauxHistoriques(B.map(b => ({ ...b, o: b.o / 10000, h: b.h / 10000, l: b.l / 10000, c: b.c / 10000 })), { maintenant: Date.UTC(2026, 0, 1), portee: 0.6, echelle: 10000 });
const ea = e.niveaux.find(n => n.type === 'ath'); v(ea && Math.abs(ea.prix - 3000) < 1e-6 && /0,3000/.test(ea.etiquette), 'échelle ×10 000 : prix du graphique ×10 000, étiquette en prix brut');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
