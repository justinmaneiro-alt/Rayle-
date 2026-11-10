import { charger } from './donnees.mjs'; import { construire } from './contexte.mjs'; import { SPECS, signaux } from './familles.mjs';
const t0 = Date.now(); const D = charger({ debut: 2003, fin: 2019 }); const X = construire(D); console.log('H1', X.n, 'contexte', Date.now() - t0, 'ms');
for (const s of SPECS) { const t = Date.now(); let n; try { n = signaux(s, X).length; } catch (e) { n = 'ERREUR ' + e.message; } console.log(s.id.padEnd(4), String(n).padEnd(8), (Date.now() - t) + 'ms', s.libelle.slice(0, 60)); }
