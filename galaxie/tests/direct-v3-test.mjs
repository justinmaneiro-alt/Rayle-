import { avancerRegle, ETAT_REGLE_VIDE, resumeCompte, taillePosition } from '../../strategies/direct-v3.js';
import { famille } from '../../strategies/familles-v3.js';
import { simuler, semaineUTC } from '../../planetes/mars/pc/agent-btc/moteur.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';

let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const serie = marcheMixte(30000, 4);
/* PARITÉ : le direct, nourri bougie après bougie (par paquets), donne les MÊMES trades que le backtest sur la série entière. */
for (const [id, params] of [['tendance_ma', null], ['cassure_retest', { N: 96, attente: 48, tol: 0.6, pad: 0.3, R: 3 }], ['fin_range', null]]) {
  const f = famille(id), p = params || Object.fromEntries(Object.entries(f.grille(0)).map(([k, x]) => [k, x[0]]));
  const sig = f.signaux(construireContexte(serie), p), ref = simuler(serie, sig, {}).trades;
  // départ à froid : un début de semaine où le backtest n'a ni position ouverte ni repos en cours (sinon les deux états de départ diffèrent)
  let D = 1200; while (D < serie.n - 3000 && !(semaineUTC(serie.t[D]) !== semaineUTC(serie.t[D - 1]) && !ref.some(x => x.entree <= D && D <= x.sortie + 40))) D++;
  const etat = ETAT_REGLE_VIDE(); etat.derniereBarre = serie.t[D - 1];
  let evts = [];
  for (let fin = D; fin <= serie.n; fin += 250) { const r = avancerRegle({ regle: { id, famille: id, params: p }, serie: tranche(serie, 0, Math.min(fin, serie.n)), etat }); evts.push(...r.evenements); }
  const r = avancerRegle({ regle: { id, famille: id, params: p }, serie, etat }); evts.push(...r.evenements);
  const refApres = ref.filter(x => x.entree >= D);
  v(id + ' : direct = backtest (même nombre de trades)', etat.trades.length === refApres.length, etat.trades.length + ' vs ' + refApres.length);
  const m = Math.min(etat.trades.length, refApres.length);
  let identiques = 0; for (let k = 0; k < m; k++) if (etat.trades[k].t === refApres[k].t && Math.abs(etat.trades[k].R - refApres[k].R) < 1e-9) identiques++;
  v(id + ' : direct = backtest (mêmes dates et mêmes R)', m > 0 && identiques === m, identiques + '/' + m);
  v(id + ' : un événement ENTREE précède chaque trade', evts.filter(e => e.type === 'ENTREE').length >= etat.trades.length);
}
{
  const f = famille('cassure_retest'), p = { N: 96, attente: 48, tol: 0.6, pad: 0.3, R: 3 }, etat = ETAT_REGLE_VIDE();
  const a = avancerRegle({ regle: { id: 'x', famille: 'cassure_retest', params: p }, serie: tranche(serie, 0, 5000), etat });
  v('première exécution : on part de la dernière bougie, rien n’est rejoué', etat.trades.length === 0 && a.evenements.filter(e => e.type === 'CLOTURE').length === 0);
  const b = avancerRegle({ regle: { id: 'x', famille: 'cassure_retest', params: p }, serie: tranche(serie, 0, 5000), etat });
  v('deuxième appel sans nouvelle bougie : aucun événement (pas de doublon d’alerte)', b.evenements.length === 0);
  const c = avancerRegle({ regle: { id: 'x', famille: 'tendance_ma', params: {} }, serie: tranche(serie, 0, 300) });
  v('trop peu de bougies : message clair, pas de plantage', !!c.erreur && /pas assez/.test(c.erreur));
  v('famille inconnue : erreur claire', !!avancerRegle({ regle: { famille: 'nimporte' }, serie }).erreur);
}
{
  const t = taillePosition(10000, 1, 100, 98);
  v('taille de position : 100 $ de risque, stop à 2 $ → 50 unités (valeur 5 000 $)', Math.abs(t.quantite - 50) < 1e-9 && Math.abs(t.valeur - 5000) < 1e-6 && t.risque === 100);
  v('taille de position : stop nul → pas de taille', taillePosition(10000, 1, 100, 100) === null);
  const r = resumeCompte({ trades: [{ R: 2, t: 1, tSortie: 2 }, { R: -1, t: 3, tSortie: 4 }, { R: -1, t: 5, tSortie: 6 }] });
  v('résumé : −0 R au total, creux 2 R, 1 gagnant sur 3', Math.abs(r.R) < 1e-9 && r.ddR === 2 && Math.abs(r.tauxReussite - 1 / 3) < 1e-9 && r.n === 3);
}
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
