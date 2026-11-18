/* Preuve chiffrée des flèches « MA200 H4 + zones majeures H4 » sur tout l'historique H4 chargé.
   Usage : node trader-pro/outils/backtest-ma200.mjs <dossier contenant pro-or.json, pro-us100.json…>  (instantanés de la branche « donnees ») */
import fs from 'node:fs'; import path from 'node:path';
import { analyser, PARAMS } from '../terminal/ma200-h4.js';
const dossier = path.resolve(process.argv[2] || '.'), ids = process.argv.slice(3).length ? process.argv.slice(3) : ['or', 'us100', 'us500', 'btc', 'sol'];
const bougies = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));
const f1 = v => (v == null ? '—' : v.toFixed(1)), f2 = v => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2));
const ligne = (nom, g) => `  ${nom.padEnd(12)} ${String(g.nombre).padStart(4)} flèches · ${String(g.resolues).padStart(4)} résolues · réussite ${f1(g.pct).padStart(5)} % · R moyen ${f2(g.rMoyen)}`;
export function rapport(id, Bh) {
  const A = analyser(Bh, { maintenant: Infinity }), s = A.stats; const out = [`${id} : ${s.bougies} bougies H4 (${Math.round(s.jours)} jours), ${A.toutesZones.length} zones majeures, ${f1(s.parMois)} flèches par mois`];
  out.push(ligne('TOTAL', s.total), ligne('a rebond MA', s.parType.rebond), ligne('b retest MA', s.parType.retest), ligne('c zone', s.parType.zone), ligne('grosses', s.grosses), ligne('petites', s.petites)); return { A, texte: out.join('\n') };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  console.log('Paramètres :', JSON.stringify(PARAMS));
  for (const id of ids) { const f = path.join(dossier, `pro-${id}.json`); if (!fs.existsSync(f)) continue; console.log(rapport(id, bougies(JSON.parse(fs.readFileSync(f, 'utf8')).h4)).texte); }
}
