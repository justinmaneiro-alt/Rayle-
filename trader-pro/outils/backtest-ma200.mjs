/* Backtest WALK-FORWARD de « MA200 Daily + H4 » sur l'Or (futures GC) et le Nasdaq 100 : 10 ans de Daily (grosses flèches), tout le H4 disponible (petites flèches).
   Usage : node trader-pro/outils/backtest-ma200.mjs <dossier-des-données> [fichier-de-sortie.json]
   (données : node trader-pro/outils/telecharger-historique.mjs <dossier>). Le H4 est parcouru bougie par bougie sans jamais voir le futur (voir ma200-h4.js) ; chaque flèche est ensuite suivie jusqu'à sa sortie
   (stop, changement de sens Daily, cassure du dernier creux H4 important : fonction suivre). Résultats en multiples de R ; frais et glissement non comptés ; les flèches encore ouvertes à la fin des données sont exclues. */
import fs from 'node:fs'; import path from 'node:path';
import { enH4 } from '../commun/analyse.js';
import { analyserMA, suivre, cloturees } from '../terminal/ma200-h4.js';

const dossier = path.resolve(process.argv[2] || '.'), sortie = process.argv[3] ? path.resolve(process.argv[3]) : null;
const lire = f => JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] || 0 }));
const NOMS = { or: 'Or (futures COMEX GC)', us100: 'Nasdaq 100' };

export function statistiques(R, annees) {
  const n = R.length, g = R.filter(x => x > 0), p = R.filter(x => x <= 0), somme = a => a.reduce((s, x) => s + x, 0), moy = a => (a.length ? somme(a) / a.length : 0);
  let serie = 0, pire = 0; for (const x of R) { if (x <= 0) { serie++; pire = Math.max(pire, serie); } else serie = 0; }
  return { signaux: n, parAn: annees > 0 ? n / annees : 0, gagnants: n ? g.length / n * 100 : 0, gain: moy(g), perte: moy(p), esperance: moy(R), pireSerie: pire, total: somme(R) };
}
export function lancer() {
  const S = { actifs: {} };
  for (const id of ['or', 'us100']) {
    const Bj = cloturees(lire(`${id}-j.json`)), Bh = enH4(lire(`${id}-h1.json`), Date.now()).filter(b => !b.enCours).map(({ enCours, ...b }) => b);
    const A = analyserMA(Bj, Bh), anJ = (Bj[Bj.length - 1].t - Bj[0].t) / (365.25 * 86400e3), anH = (Bh[Bh.length - 1].t - Bh[0].t) / (365.25 * 86400e3);
    const suivis = A.tout.map(f => ({ f, s: suivre(f, Bj, Bh, A.S) })), fermes = suivis.filter(x => x.s.etat === 'sortie'), r = { nom: NOMS[id], jours: Bj.length, h4: Bh.length, deJ: new Date(Bj[0].t).toISOString().slice(0, 10), deH: new Date(Bh[0].t).toISOString().slice(0, 10), a: new Date(Bh[Bh.length - 1].t).toISOString().slice(0, 10), anJ, anH };
    const sel = (type) => fermes.filter(x => (type === 'petites' ? x.f.type !== 'grosse' : x.f.type === type)).map(x => x.s.r);
    r.grosses = { ...statistiques(sel('grosse'), anJ), ouvertes: suivis.filter(x => x.f.type === 'grosse' && x.s.etat !== 'sortie').length };
    r.petites = { ...statistiques(sel('petites'), anH), ouvertes: suivis.filter(x => x.f.type !== 'grosse' && x.s.etat !== 'sortie').length };
    r.rebonds = statistiques(sel('rebond'), anH); r.cassures = statistiques(sel('cassure'), anH);
    r.motifs = {}; for (const x of fermes) (r.motifs[x.f.type === 'grosse' ? 'grosse' : 'petite'] ||= {})[x.s.motif] = ((r.motifs[x.f.type === 'grosse' ? 'grosse' : 'petite'] || {})[x.s.motif] || 0) + 1;
    r.liste = suivis.map(x => ({ t: new Date(x.f.t).toISOString().slice(0, 16), type: x.f.type, dir: x.f.dir, zone: x.f.zone, entree: +x.f.entree.toFixed(2), stop: +x.f.stop.toFixed(2), r: +x.s.r.toFixed(2), etat: x.s.etat, motif: x.s.motif || null }));
    S.actifs[id] = r;
  }
  return S;
}
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), ligne = (nom, x) => `${nom.padEnd(18)} | ${String(x.signaux).padStart(7)} | ${f1(x.parAn).padStart(5)} | ${f1(x.gagnants).padStart(5)} | ${f2(x.gain).padStart(6)} | ${f2(x.perte).padStart(7)} | ${f2(x.esperance).padStart(11)} | ${String(x.pireSerie).padStart(10)} | ${f2(x.total).padStart(8)}`;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const S = lancer();
  for (const r of Object.values(S.actifs)) {
    console.log(`\n${r.nom} : Daily ${r.jours} bougies (${r.deJ}, ${f1(r.anJ)} ans), H4 ${r.h4} bougies (${r.deH} → ${r.a}, ${f1(r.anH)} ans)`);
    console.log('flèches            | signaux |  /an | %gagn |   gain |   perte | espérance/R | pire série | total R');
    console.log(ligne('grosses (Daily)', r.grosses)); console.log(ligne('petites (H4)', r.petites)); console.log(ligne('  dont rebonds', r.rebonds)); console.log(ligne('  dont cassures', r.cassures));
    console.log('ouvertes (exclues) : grosses', r.grosses.ouvertes, ', petites', r.petites.ouvertes, '| motifs de sortie', JSON.stringify(r.motifs));
  }
  if (sortie) fs.writeFileSync(sortie, JSON.stringify(S));
}
