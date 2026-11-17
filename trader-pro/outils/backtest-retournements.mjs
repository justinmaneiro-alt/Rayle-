/* Backtest WALK-FORWARD des « Retournements Daily » sur l'Or (futures GC) et le Nasdaq 100, avec tout l'historique H4 disponible.
   Usage : node trader-pro/outils/backtest-retournements.mjs <dossier-des-données> [fichier-de-sortie.json]
   (données : node trader-pro/outils/telecharger-retournements.mjs <dossier>). L'algorithme avance bougie H4 par bougie H4 et ne voit jamais le futur (voir retournements-daily.js) ;
   chaque signal est ensuite joué sur les bougies H4 suivantes (stop / objectif, voir simuler). Résultats en multiples de R ; frais et glissement non comptés. */
import fs from 'node:fs'; import path from 'node:path';
import { enH4 } from '../commun/analyse.js';
import { retournements, simuler, VERSIONS, cloturees } from '../terminal/retournements-daily.js';

const dossier = path.resolve(process.argv[2] || '.'), sortie = process.argv[3] ? path.resolve(process.argv[3]) : null;
const lire = f => JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] || 0 }));
const NOMS = { or: 'Or (futures COMEX GC)', us100: 'Nasdaq 100' };

export function statistiques(trades, annees) {
  const R = trades.map(t => t.r), n = R.length, g = R.filter(x => x > 0), p = R.filter(x => x <= 0);
  let serie = 0, pire = 0; for (const x of R) { if (x <= 0) { serie++; pire = Math.max(pire, serie); } else serie = 0; }
  const somme = a => a.reduce((s, x) => s + x, 0), moy = a => (a.length ? somme(a) / a.length : 0);
  return { signaux: n, parAn: annees > 0 ? n / annees : 0, gagnants: n ? g.length / n * 100 : 0, rGagnant: moy(g), rPerdant: moy(p), esperance: moy(R), pireSerie: pire, total: somme(R) };
}
export function lancer() {
  const sorties = { dossier, actifs: {} };
  for (const id of ['or', 'us100']) {
    const Bj = cloturees(lire(`${id}-j.json`)), Bh = enH4(lire(`${id}-h1.json`), Date.now()).filter(b => !b.enCours).map(({ enCours, ...b }) => b), annees = (Bh[Bh.length - 1].t - Bh[0].t) / (365.25 * 86400e3);
    const r = { nom: NOMS[id], h4: Bh.length, de: new Date(Bh[0].t).toISOString().slice(0, 10), a: new Date(Bh[Bh.length - 1].t).toISOString().slice(0, 10), annees, versions: {} };
    for (const v of Object.keys(VERSIONS)) {
      const { signaux, bilan } = retournements(Bj, Bh, { version: v }), trades = [];
      for (const s of signaux) { const x = simuler(s, Bh); if (x.r != null && x.sortie !== 'en cours') trades.push({ ...x, t: s.t, dir: s.dir }); }
      r.versions[v] = { ...statistiques(trades, annees), enCours: signaux.length - trades.length, longs: signaux.filter(s => s.dir > 0).length, courts: signaux.filter(s => s.dir < 0).length, bilan, liste: signaux.map(s => ({ t: new Date(s.t).toISOString().slice(0, 16), dir: s.dir, zone: s.zone.nom, ratio: +s.ratio.toFixed(2), entree: +s.entree.toFixed(2), stop: +s.stop.toFixed(2), objectif: +s.objectif.toFixed(2), rr: +s.rr.toFixed(2) })), sorties: trades.map(t => t.sortie) };
    }
    sorties.actifs[id] = r;
  }
  return sorties;
}
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const S = lancer();
  for (const [id, r] of Object.entries(S.actifs)) {
    console.log(`\n${r.nom} : ${r.h4} bougies H4, ${r.de} → ${r.a} (${f1(r.annees)} an)`);
    console.log('version                     | signaux | /an  | %gagn | R gagn | R perd | espérance/trade | pire série | total R | (en cours)');
    for (const [v, x] of Object.entries(r.versions)) console.log(`${VERSIONS[v].nom.padEnd(27)} | ${String(x.signaux).padStart(7)} | ${f1(x.parAn).padStart(4)} | ${f1(x.gagnants).padStart(5)} | ${f2(x.rGagnant).padStart(6)} | ${f2(x.rPerdant).padStart(6)} | ${f2(x.esperance).padStart(15)} | ${String(x.pireSerie).padStart(10)} | ${f2(x.total).padStart(7)} | ${x.enCours}`);
  }
  for (const [id, r] of Object.entries(S.actifs)) for (const [v, x] of Object.entries(r.versions)) console.log(id, v, JSON.stringify(x.bilan));
  if (sortie) fs.writeFileSync(sortie, JSON.stringify(S, null, 1));
}
