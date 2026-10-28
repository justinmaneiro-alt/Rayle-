import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { famille } from './familles-v3.js';
import './familles-v6.js';
import { simulerRiche, configRiche, dimensionner } from './simulateur-riche.js';
import { ETAT_REGLE_VIDE, taillePosition } from './direct-v3.js';

/* ═════════════ SUIVI EN DIRECT DES FAMILLES « RICHES » DE LA V6 (module pur, testé : galaxie/tests/direct-riche-test.mjs) ═════════════
   Les familles de la V6 (ordres limités, stop minimum, sorties partielle / suiveuse) ont leur propre simulateur (simulateur-riche.js). Pour les suivre en direct avec EXACTEMENT la même logique que le backtest, on REJOUE
   le simulateur sur les dernières bougies fermées à chaque passage (fenêtre de quelques milliers de bougies) : ce qui est testé est ce qui tourne. L'état de la règle garde la dernière bougie vue ; les trades clos depuis
   deviennent des événements CLOTURE, la position ouverte et l'ordre limité en attente sont recalculés. Aucun ordre n'est passé. Même forme d'état et d'événements que direct-v3.js (les alertes et l'écran
   n'y voient aucune différence), plus un champ `ordre` ('marche' ou 'limite') sur l'événement ENTREE. */
export const estRiche = id => { const f = famille(id); return !!(f && f.riche); };
const heure = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export function avancerRegleRiche({ regle, serie, etat = ETAT_REGLE_VIDE(), config = {}, capital = 10000, risquePct = 1, ctx = null }) {
  const fam = famille(regle.famille); if (!fam) return { etat, evenements: [], erreur: 'famille inconnue : ' + regle.famille };
  const n = serie.n, evenements = [];
  if (n < 4000) return { etat, evenements, erreur: 'pas assez de bougies (' + n + ') pour chauffer les indicateurs H4 (il en faut au moins 4000 en M15)' };
  const c = ctx || construireContexte(serie), sig = fam.signaux(c, regle.params), cfg = configRiche(config, sig.options || {}), dernier = n - 1, deja = etat.derniereBarre;
  const sim = simulerRiche(serie, sig, config, { de: 0, a: n }), capitalCourant = () => (etat.equite.length ? etat.equite[etat.equite.length - 1].capital : capital);
  // première passe : rien n'est rejoué (on part de la dernière bougie fermée) ; l'historique n'est pas présenté comme des trades du direct
  if (deja == null) { etat.derniereBarre = serie.t[dernier]; etat.signalVu = sig.sens[dernier] !== 0 ? serie.t[dernier] : null; etat.position = null; etat.pendante = null; return { etat, evenements }; }
  // 1) trades clos depuis la dernière passe
  for (const x of sim.trades) {
    if (!(x.tSortie > deja)) continue;
    const cap = capitalCourant() * (1 + risquePct / 100 * x.R);
    const trade = { t: x.t, tSortie: x.tSortie, sens: x.sens, prixEntree: x.prixEntree, stop: x.stop, cible: x.cible, prixSortie: x.prixSortie, motif: x.motif, R: x.R, barres: x.barres, signalT: serie.t[x.signal], maker: !!x.maker, partielle: !!x.partielle };
    etat.trades.push(trade); etat.equite.push({ t: x.tSortie, capital: cap }); etat.prochainApres = x.tSortie + cfg.reposBarres * 900e3; evenements.push({ type: 'CLOTURE', t: x.tSortie, trade });
  }
  // 2) position ouverte / ordre limité en attente
  const o = sim.ouverte;
  if (o) etat.position = { s: o.sens, fill: o.prixEntree, stop: o.stop, cible: o.cible, dist: o.dist, pct: o.pct, t: o.t, signalT: serie.t[o.signal], barres: dernier - o.entree + 1, partielleFaite: o.partielleFaite, maker: o.maker, tailles: taillePosition(capitalCourant(), risquePct, o.prixEntree, o.stop) };
  else etat.position = null;
  const w = sim.enAttente; etat.pendante = w ? { sens: w.sens, stop: w.stop, R: sig.R, signalT: serie.t[w.signal], niveau: w.niveau, ordre: 'limite', expire: serie.t[Math.min(dernier, w.expire)] } : null;
  // 3) nouveau signal sur la dernière bougie fermée → entrée à l'ouverture de la suivante (ou ordre limité posé)
  if (sig.sens[dernier] !== 0 && etat.signalVu !== serie.t[dernier] && !o) {
    etat.signalVu = serie.t[dernier];
    const s = sig.sens[dernier], lim = sig.limite ? sig.limite[dernier] : NaN, maker = Number.isFinite(lim), fillApprox = maker ? lim : serie.c[dernier], cibleAbs = sig.cible ? sig.cible[dernier] : NaN;
    const dm = dimensionner(cfg, s, fillApprox, sig.stop[dernier], sig.R, cibleAbs, maker);
    if (dm.ok) {
      const objectifs = [1, 2, sig.R].filter((x, k, a) => a.indexOf(x) === k).map(x => ({ R: x, prix: fillApprox + s * x * dm.dist })); if (Number.isFinite(cibleAbs)) objectifs.push({ R: Math.abs(cibleAbs - fillApprox) / dm.dist, prix: cibleAbs });
      const raison = [fam.nom + ' : signal ' + (s > 0 ? 'd’achat' : 'de vente') + ' à la clôture de la bougie M15 de ' + heure(serie.t[dernier] + 900e3) + '.', maker ? 'Ordre LIMITE à ' + lim.toFixed(lim >= 100 ? 1 : 4) + ' : il n’est rempli que si le prix traverse ce niveau ; sinon il expire sans coût.' : 'Entrée au marché à l’ouverture de la prochaine bougie M15.'];
      if (dm.elargi) raison.push('Stop élargi à ' + dm.pct.toFixed(2).replace('.', ',') + ' % du prix pour que les frais restent sous ' + String(cfg.coutPlafondR).replace('.', ',') + ' R.');
      etat.pendante = { sens: s, stop: dm.stop, R: sig.R, signalT: serie.t[dernier], niveau: maker ? lim : null, ordre: maker ? 'limite' : 'marche' };   // entrée au marché à l'ouverture suivante, ou ordre limité posé
      evenements.push({ type: 'ENTREE', t: serie.t[dernier] + 900e3, sens: s, entree: fillApprox, stop: dm.stop, cible: dm.cible, R: sig.R, distancePct: dm.pct, ordre: maker ? 'limite' : 'marche', objectifs, raison, signalT: serie.t[dernier], tailles: taillePosition(capitalCourant(), risquePct, fillApprox, dm.stop) });
    } else evenements.push({ type: 'INVALIDATION', t: serie.t[dernier] + 900e3, sens: s, motif: dm.raison === 'rr' ? 'rapport gain / risque insuffisant (moins de 1,5)' : dm.raison === 'frais' ? 'frais trop élevés pour cette distance au stop' : 'stop trop proche ou trop loin : setup écarté', signalT: serie.t[dernier] });
  }
  etat.derniereBarre = serie.t[dernier];
  if (etat.trades.length > 400) etat.trades = etat.trades.slice(-400);
  if (etat.equite.length > 400) etat.equite = etat.equite.slice(-400);
  return { etat, evenements };
}
