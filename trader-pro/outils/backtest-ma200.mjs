/* Backtest WALK-FORWARD de « MA200 Daily + H4 » (cassures et rebonds sur la MA200 Daily) sur l'Or (futures GC) et le Nasdaq 100.
   Usage : node trader-pro/outils/backtest-ma200.mjs <dossier-des-données> [fichier-de-sortie.json]
   (données : node trader-pro/outils/telecharger-historique.mjs <dossier>). Le H4 est parcouru bougie par bougie sans jamais voir le futur (voir ma200-h4.js) ; chaque flèche est suivie jusqu'à sa sortie (fonction suivre :
   stop à 0,5 ATR de l'autre côté de la MA200, ou clôture Daily de l'autre côté). Résultats en multiples de R ; frais et glissement non comptés ; les flèches encore ouvertes à la fin des données sont exclues.
   Bases de comparaison :
   - « 10 ans » : cassures seules sur tout le Daily. La confirmation « 1 clôture H4 » n'a pas de H4 avant 2023-2024 : elle est remplacée par un PROXY (l'ouverture du lendemain reste du bon côté), suivi sur le Daily ;
   - « fenêtre H4 » (≈ 2,4 ans pour l'or, ≈ 2,9 ans pour le Nasdaq) : cassures avec la vraie clôture H4 + rebonds, suivis sur les bougies H4 ;
   - « combiné » : cassures sur 10 ans + rebonds sur la fenêtre H4 (base de la sélection de la variante par défaut). */
import fs from 'node:fs'; import path from 'node:path';
import { enH4 } from '../commun/analyse.js';
import { analyserMA, suivre, cloturees, CONFIRMATIONS } from '../terminal/ma200-h4.js';

const dossier = path.resolve(process.argv[2] || '.'), sortie = process.argv[3] ? path.resolve(process.argv[3]) : null;
const lire = f => JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')).map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] || 0 }));
const NOMS = { or: 'Or (futures COMEX GC)', us100: 'Nasdaq 100' };

export function statistiques(R, annees) {
  const n = R.length, g = R.filter(x => x > 0), p = R.filter(x => x <= 0), somme = a => a.reduce((s, x) => s + x, 0), moy = a => (a.length ? somme(a) / a.length : 0);
  let serie = 0, pire = 0; for (const x of R) { if (x <= 0) { serie++; pire = Math.max(pire, serie); } else serie = 0; }
  const total = somme(R), meilleur = n ? Math.max(...R) : 0;
  return { signaux: n, parAn: annees > 0 ? n / annees : 0, gagnants: n ? g.length / n * 100 : 0, gain: moy(g), perte: moy(p), esperance: moy(R), pireSerie: pire, total, meilleur, sansMeilleur: n ? total - meilleur : 0 };
}
const fermes = L => L.filter(x => x.s.etat === 'sortie');
export function lancer() {
  const S = { actifs: {} };
  for (const id of ['or', 'us100']) {
    const Bj = cloturees(lire(`${id}-j.json`)), Bh = enH4(lire(`${id}-h1.json`), Date.now()).filter(b => !b.enCours).map(({ enCours, ...b }) => b);
    const anJ = (Bj[Bj.length - 1].t - Bj[0].t) / (365.25 * 86400e3), anH = (Bh[Bh.length - 1].t - Bh[0].t) / (365.25 * 86400e3), debutH = Bh[0].t;
    const r = { nom: NOMS[id], jours: Bj.length, h4: Bh.length, deJ: new Date(Bj[0].t).toISOString().slice(0, 10), deH: new Date(Bh[0].t).toISOString().slice(0, 10), a: new Date(Bh[Bh.length - 1].t).toISOString().slice(0, 10), anJ, anH, matrice: {}, rebonds: null };
    /* rebonds : ne dépendent ni de la confirmation ni du filtre de pente des cassures */
    const A0 = analyserMA(Bj, Bh), sr = A0.rebonds.map(f => ({ f, s: suivre(f, Bj, Bh, A0.S) })), Rr = fermes(sr).map(x => x.s.r);
    r.rebonds = { ...statistiques(Rr, anH), ouvertes: sr.length - Rr.length, liste: sr.map(x => ({ t: new Date(x.f.t).toISOString().slice(0, 16), dir: x.f.dir, entree: +x.f.entree.toFixed(2), stop: +x.f.stop.toFixed(2), r: +x.s.r.toFixed(2), etat: x.s.etat })) };
    for (const conf of Object.keys(CONFIRMATIONS)) for (const pente of [true, false]) {
      const cle = `${conf}|${pente ? 'pente' : 'sanspente'}`;
      /* 10 ans (Daily seul ; proxy pour la clôture H4) */
      const A10 = analyserMA(Bj, [], { confirmation: conf, pente, proxyH4: true, avecRebonds: false }), s10 = A10.cassures.map(f => ({ f, s: suivre(f, Bj, [], A10.S) })), R10 = fermes(s10).map(x => x.s.r);
      /* fenêtre H4 (vraie clôture H4) */
      const AH = analyserMA(Bj, Bh, { confirmation: conf, pente, avecRebonds: false }), sH = AH.cassures.filter(f => f.tFin >= debutH).map(f => ({ f, s: suivre(f, Bj, Bh, AH.S) })), RH = fermes(sH).map(x => x.s.r);
      const comb = statistiques([...R10, ...Rr], 1); comb.parAn = R10.length / anJ + Rr.length / anH;
      r.matrice[cle] = { dix: { ...statistiques(R10, anJ), ouvertes: s10.length - R10.length }, fenetre: { ...statistiques(RH, anH), ouvertes: sH.length - RH.length }, combine: comb,
        liste10: s10.map(x => ({ t: new Date(x.f.t).toISOString().slice(0, 10), dir: x.f.dir, r: +x.s.r.toFixed(2), etat: x.s.etat })) };
    }
    S.actifs[id] = r;
  }
  return S;
}
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), ligne = (nom, x) => `${nom.padEnd(20)} | ${String(x.signaux).padStart(7)} | ${f1(x.parAn).padStart(5)} | ${f1(x.gagnants).padStart(5)} | ${f2(x.esperance).padStart(8)} | ${f2(x.total).padStart(8)} | ${f2(x.sansMeilleur).padStart(11)} | ${String(x.pireSerie).padStart(10)}`;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const S = lancer(), tete = 'variante             | signaux |  /an | %gagn | espér./R |  total R | sans meill. | pire série';
  for (const r of Object.values(S.actifs)) {
    console.log(`\n${r.nom} : Daily ${r.jours} bougies (${r.deJ}), H4 ${r.h4} bougies (${r.deH} → ${r.a})`);
    console.log('CASSURES sur 10 ans (Daily ; la clôture H4 = proxy)\n' + tete); for (const [k, x] of Object.entries(r.matrice)) console.log(ligne(k, x.dix));
    console.log('CASSURES sur la fenêtre H4 (vraie clôture H4)\n' + tete); for (const [k, x] of Object.entries(r.matrice)) console.log(ligne(k, x.fenetre));
    console.log('REBONDS (fenêtre H4)\n' + tete + '\n' + ligne('rebonds', r.rebonds));
    console.log('COMBINÉ : cassures 10 ans + rebonds fenêtre H4\n' + tete); for (const [k, x] of Object.entries(r.matrice)) console.log(ligne(k, x.combine));
  }
  if (sortie) fs.writeFileSync(sortie, JSON.stringify(S));
}
