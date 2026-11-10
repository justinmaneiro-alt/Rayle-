/* Les formateurs mis en cache donnent EXACTEMENT les mêmes textes que les anciens appels (toLocaleTimeString / toLocaleString) : heures de Paris et prix du terminal.
   Usage : node agent-trading/tests/format-equivalence-test.mjs */
import { heureParis, dateHeureParis } from '../commun/format.js';
import { fmt } from '../front/terminal/actifs-terminal.js';
let ok = 0, ko = 0; const t = (c, m, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', m, d); } };
const ancienH = (x, sec) => new Date(x).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, hour12: false });
const ancienDH = x => new Date(x).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
let mauvaisH = 0, mauvaisDH = 0;
for (let i = 0; i < 4000; i++) { const x = 1.6e12 + i * 3_391_117 + (i % 7) * 1000; if (heureParis(x) !== ancienH(x, false) || heureParis(x, true) !== ancienH(x, true)) mauvaisH++; if (dateHeureParis(x) !== ancienDH(x)) mauvaisDH++; }
t(mauvaisH === 0, 'heureParis identique sur 4000 instants (dont minuit, heure d\'été et d\'hiver)', mauvaisH);
t(mauvaisDH === 0, 'dateHeureParis identique sur 4000 instants', mauvaisDH);
t(heureParis(null) === '—' && dateHeureParis(0) === '—', 'valeur absente : tiret');
const ancienP = (p, k) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: k, maximumFractionDigits: k }).replace(/\u202f|\u00a0/g, ' ');
let mauvaisP = 0;
for (const [id, k] of [['OR', 2], ['NASDAQ', 2], ['BTC', 2], ['SOL', 2], ['DOGE', 5]]) for (let i = 0; i < 500; i++) { const p = (i * 7919.137) % 120000 / (k > 3 ? 1000 : 1) + (i % 3) * 0.00001; if (fmt(id, p, k) !== ancienP(p, k)) mauvaisP++; }
t(mauvaisP === 0, 'fmt() identique à toLocaleString (2500 prix, 2 à 5 décimales)', mauvaisP);
t(fmt('OR', 4070.25) === '4 070,25' && fmt('OR', null) === '—' && fmt('OR', NaN) === '—', 'fmt : exemple et valeurs absentes', fmt('OR', 4070.25));
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
