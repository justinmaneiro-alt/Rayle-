/* Backtest WALK-FORWARD de « MA200 Daily + H4 » sur l'Or (futures GC) et le Nasdaq 100.
   Usage : node trader-pro/outils/backtest-ma200.mjs <dossier-des-données> [fichier-de-sortie.json]
   (données : node trader-pro/outils/telecharger-historique.mjs <dossier>). Le H4 est parcouru bougie par bougie sans jamais voir le futur (voir ma200-h4.js) ; chaque flèche est ensuite suivie jusqu'à sa sortie
   (stop, changement de sens Daily, cassure du dernier creux H4 important : fonction suivre). Résultats en multiples de R ; frais et glissement non comptés ; les flèches encore ouvertes à la fin des données sont exclues.
   Deux bases de comparaison :
   - « fenêtre H4 » (≈ 2,4 ans pour l'or, ≈ 2,9 ans pour le Nasdaq) : TOUTES les flèches (grosses + petites) dont la confirmation tombe dans la période où le H4 existe : base commune des variantes ;
   - « grosses sur 10 ans » : seulement les grosses flèches (Daily), pour comparer les filtres anti-piège sur tout l'historique. */
import fs from 'node:fs'; import path from 'node:path';
import { enH4 } from '../commun/analyse.js';
import { analyserMA, suivre, cloturees, VARIANTES, FILTRES } from '../terminal/ma200-h4.js';

const dossier = path.resolve(process.argv[2] || '.'), sortie = process.argv[3] ? path.resolve(process.argv[3]) : null;
const lire = f => JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] || 0 }));
const NOMS = { or: 'Or (futures COMEX GC)', us100: 'Nasdaq 100' };

export function statistiques(R, annees) {
  const n = R.length, g = R.filter(x => x > 0), p = R.filter(x => x <= 0), somme = a => a.reduce((s, x) => s + x, 0), moy = a => (a.length ? somme(a) / a.length : 0);
  let serie = 0, pire = 0; for (const x of R) { if (x <= 0) { serie++; pire = Math.max(pire, serie); } else serie = 0; }
  const total = somme(R), meilleur = n ? Math.max(...R) : 0;
  return { signaux: n, parAn: annees > 0 ? n / annees : 0, gagnants: n ? g.length / n * 100 : 0, gain: moy(g), perte: moy(p), esperance: moy(R), pireSerie: pire, total, meilleur, sansMeilleur: n ? total - meilleur : 0 };
}
/* flèches d'une variante / d'un filtre, suivies jusqu'à leur sortie : [{ f, s }] */
export function evaluer(Bj, Bh, variante, filtre) {
  const A = analyserMA(Bj, Bh, { variante, filtre });
  return { A, suivis: A.tout.map(f => ({ f, s: suivre(f, Bj, Bh, A.S) })) };
}
export function lancer() {
  const S = { actifs: {} };
  for (const id of ['or', 'us100']) {
    const Bj = cloturees(lire(`${id}-j.json`)), Bh = enH4(lire(`${id}-h1.json`), Date.now()).filter(b => !b.enCours).map(({ enCours, ...b }) => b);
    const anJ = (Bj[Bj.length - 1].t - Bj[0].t) / (365.25 * 86400e3), anH = (Bh[Bh.length - 1].t - Bh[0].t) / (365.25 * 86400e3), debutH = Bh[0].t;
    const r = { nom: NOMS[id], jours: Bj.length, h4: Bh.length, deJ: new Date(Bj[0].t).toISOString().slice(0, 10), deH: new Date(Bh[0].t).toISOString().slice(0, 10), a: new Date(Bh[Bh.length - 1].t).toISOString().slice(0, 10), anJ, anH, filtres: {}, matrice: {} };
    for (const filtre of Object.keys(FILTRES)) {
      const { suivis } = evaluer(Bj, Bh, 'V1', filtre), g = suivis.filter(x => x.f.type === 'grosse');
      const Rg = g.filter(x => x.s.etat === 'sortie').map(x => x.s.r);
      r.filtres[filtre] = { ...statistiques(Rg, anJ), ouvertes: g.filter(x => x.s.etat !== 'sortie').length };
      for (const variante of Object.keys(VARIANTES)) {
        const { suivis: sv } = evaluer(Bj, Bh, variante, filtre), fen = sv.filter(x => x.f.tFin >= debutH), fermes = fen.filter(x => x.s.etat === 'sortie');
        const Rp = fermes.filter(x => x.f.type !== 'grosse').map(x => x.s.r), comb = statistiques([...Rg, ...Rp], 1); comb.parAn = Rg.length / anJ + Rp.length / anH;   // combiné : grosses sur 10 ans + petites sur la fenêtre H4
        r.matrice[`${variante}|${filtre}`] = { combine: comb, ...statistiques(fermes.map(x => x.s.r), anH), grosses: fermes.filter(x => x.f.type === 'grosse').length, petites: fermes.filter(x => x.f.type !== 'grosse').length, ouvertes: fen.length - fermes.length,
          liste: fen.map(x => ({ t: new Date(x.f.t).toISOString().slice(0, 16), type: x.f.type, dir: x.f.dir, zone: x.f.zone, entree: +x.f.entree.toFixed(2), stop: +x.f.stop.toFixed(2), r: +x.s.r.toFixed(2), etat: x.s.etat, motif: x.s.motif || null })) };
      }
    }
    S.actifs[id] = r;
  }
  return S;
}
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), ligne = (nom, x) => `${nom.padEnd(14)} | ${String(x.signaux).padStart(7)} | ${f1(x.parAn).padStart(5)} | ${f1(x.gagnants).padStart(5)} | ${f2(x.esperance).padStart(8)} | ${f2(x.total).padStart(8)} | ${f2(x.sansMeilleur).padStart(11)} | ${String(x.pireSerie).padStart(10)}`;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const S = lancer();
  for (const r of Object.values(S.actifs)) {
    console.log(`\n${r.nom} : Daily ${r.jours} bougies (${r.deJ}, ${f1(r.anJ)} ans), H4 ${r.h4} bougies (${r.deH} → ${r.a}, ${f1(r.anH)} ans)`);
    console.log('GROSSES SEULES sur 10 ans, par filtre\nfiltre         | signaux |  /an | %gagn | espér./R |  total R | sans meill. | pire série');
    for (const k of Object.keys(FILTRES)) console.log(ligne(k, r.filtres[k]));
    console.log('VARIANTES sur la fenêtre H4 (grosses + petites)\nvariante|filtre| signaux |  /an | %gagn | espér./R |  total R | sans meill. | pire série | (grosses/petites)');
    for (const [k, x] of Object.entries(r.matrice)) console.log(ligne(k, x) + ` | ${x.grosses}/${x.petites}`);
    console.log('COMBINÉ : grosses 10 ans + petites fenêtre H4\nvariante|filtre| signaux |  /an | %gagn | espér./R |  total R | sans meill. | pire série');
    for (const [k, x] of Object.entries(r.matrice)) console.log(ligne(k, x.combine));
  }
  if (sortie) fs.writeFileSync(sortie, JSON.stringify(S));
}
