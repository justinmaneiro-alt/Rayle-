/* Calcule les statistiques de chaque type de flèche (MA200 cassure / rebond, rebond et cassure de niveau, rebond Fibonacci) pour les actifs principaux, sur tout l'historique disponible.
   Usage : node outils-donnees/stats-fleches.mjs <dossier des instantanés pro-<id>.json> [sortie.json]
   (le dossier est la branche « donnees » du dépôt, ou http://… ; par défaut lit https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/)
   Sortie par défaut : trader-pro/terminal/stats-fleches.json (versionné, lu par le panneau « Statistiques » du Terminal). Règles : voir trader-pro/terminal/stats-fleches.js. */
import fs from 'node:fs';
import path from 'node:path';
import { statsUnite, PARAMS_STATS, TYPES_STATS } from '../trader-pro/terminal/stats-fleches.js';
import { barresDaily } from '../trader-pro/terminal/fleches-registre.js';

const ACTIFS = [['or', 'l’or'], ['us100', 'le Nasdaq 100'], ['us500', 'le S&P 500'], ['btc', 'le Bitcoin'], ['sol', 'Solana'], ['eurusd', 'l’EUR/USD']];
const source = process.argv[2] || 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/', sortie = process.argv[3] || 'trader-pro/terminal/stats-fleches.json';
const bougies = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 })).filter(b => b.c > 0 && b.h >= b.l);
async function lire(id) {
  const f = `pro-${id}.json`; if (/^https?:/.test(source)) { const r = await fetch(source.replace(/\/?$/, '/') + f); if (!r.ok) throw new Error(f + ' : ' + r.status); return r.json(); }
  return JSON.parse(fs.readFileSync(path.join(source, f), 'utf8'));
}
const out = { genere: new Date().toISOString(), regles: { cible: PARAMS_STATS.cible + ' R', stop: 'derrière la mèche de la bougie de confirmation, au moins ' + PARAMS_STATS.stopMinAtr + ' ATR', maxBarres: PARAMS_STATS.maxBarres, horizons: PARAMS_STATS.horizons, minSignificatif: PARAMS_STATS.minSignificatif, pivotsNiveaux: PARAMS_STATS.pivotK }, types: TYPES_STATS, actifs: {} };
for (const [id, nom] of ACTIFS) {
  let d; try { d = await lire(id); } catch (e) { console.log('  ✗ ' + id + ' : ' + e.message); continue; }
  const A = { nom }; const jeux = { H4: bougies(d.h4), J: barresDaily(id, bougies(d.j)) };
  for (const u of ['H4', 'J']) { const s = statsUnite(jeux[u], u); if (s) A[u] = s; }
  out.actifs[id] = A;
  console.log(id.padEnd(7), ['H4', 'J'].map(u => A[u] ? `${u} ${A[u].bougies} bougies · ` + TYPES_STATS.map(t => `${t.id.replace('-', ' ')}=${A[u].types[t.id].n}`).join(' ') : u + ' —').join('  |  '));
}
fs.writeFileSync(sortie, JSON.stringify(out));
console.log('écrit :', sortie, (fs.statSync(sortie).size / 1024).toFixed(0) + ' Ko');
