import { construireContexte } from '../agent-btc/contexte.js';
import { simuler, CONFIG_DEFAUT } from '../agent-btc/moteur.js';
import { AVERTISSEMENT, fR, pct, qualiteEchantillon, resumeR, wilson } from './stats-m6.js';

/* ═════════════ « TESTER MA ZONE » (M6 ; module pur, testé : planetes/mars/tests/m6-graphique-test.mjs) ═════════════
   Tu traces une zone de prix ; l'agent regarde ce qui s'est passé HISTORIQUEMENT quand le prix y est arrivé :
   - APPROCHES : chaque arrivée dans la zone après au moins `separation` bougies passées dehors (un épisode = une approche) ;
   - RÉACTIONS : après l'approche, le prix s'éloigne de `k` ATR H1 du côté d'où il venait (REBOND) ou traverse la zone et la dépasse de `k` ATR (CASSURE) dans les `horizon` bougies suivantes, sinon INDÉCIS ;
   - TRADES SIMULÉS avec le vrai moteur de backtest (frais, spread, glissement de la paire, stop prioritaire) : « jouer le rebond » (stop au-delà de la zone) et « jouer la cassure » (stop au milieu de la zone) ;
     nombre de cas, taux de réussite (intervalle de Wilson), R moyen (intervalle à 95 %), séparés en première et seconde moitié de l'histoire pour juger la stabilité.
   LIMITE CAPITALE : la zone est choisie APRÈS avoir vu le graphique ; les résultats sont donc OPTIMISTES (biais de sélection) et ne prouvent rien tout seuls. Un niveau de prix absolu n'a d'ailleurs pas la même
   signification à des époques de prix très différents. Le résultat dit toujours « échantillon : n cas » et l'incertitude. Aucune IA. */
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n), R: 2 });

export function testerZone(serie, zone, { R = 2, horizon = 48, k = 1, separation = 16, config = {}, ctx = null, depuis = null, margeStopATR = 0.25 } = {}) {
  const n = serie.n; if (n < 600) return { ok: false, erreur: 'historique trop court pour tester une zone (600 bougies au moins)' };
  const haut = Math.max(zone.prixHaut, zone.prixBas), bas = Math.min(zone.prixHaut, zone.prixBas);
  if (!(haut > bas) || !(bas > 0)) return { ok: false, erreur: 'zone invalide : il faut deux prix différents et positifs' };
  const c = ctx || construireContexte(serie), a1 = c.h1.atr, i0 = depuis != null ? Math.max(200, indexDepuis(serie.t, depuis)) : 200;
  const touche = i => serie.l[i] <= haut && serie.h[i] >= bas;
  const approches = [];
  let dehors = separation;                                               // nombre de bougies d'affilée passées en dehors de la zone
  for (let i = i0; i < n - 1; i++) {
    if (touche(i)) {
      if (dehors >= separation && a1[i] > 0) {
        const avant = serie.c[i - 1], dir = avant < bas ? 1 : avant > haut ? -1 : 0;        // 1 : on vient du dessous (résistance probable), −1 : du dessus (support probable)
        if (dir !== 0) approches.push({ i, t: serie.t[i], dir, atr: a1[i] });
      }
      dehors = 0;
    } else dehors++;
  }
  const evenements = [], sigRebond = fabrique(n), sigCassure = fabrique(n); sigRebond.R = R; sigCassure.R = R;
  for (const ap of approches) {
    const { i, dir, atr } = ap, fin = Math.min(n - 1, i + horizon); let issue = 'indecis', iss = -1;
    for (let j = i; j <= fin; j++) {
      const rebond = dir > 0 ? serie.l[j] <= bas - k * atr : serie.h[j] >= haut + k * atr, cassure = dir > 0 ? serie.c[j] >= haut + k * atr : serie.c[j] <= bas - k * atr;
      if (j === i && !(dir > 0 ? serie.c[i] <= haut : serie.c[i] >= bas)) { issue = 'cassure'; iss = j; break; }                     // la bougie d'arrivée ferme déjà de l'autre côté
      if (rebond && cassure) { issue = 'indecis'; iss = j; break; }
      if (rebond) { issue = 'rebond'; iss = j; break; } if (cassure) { issue = 'cassure'; iss = j; break; }
    }
    evenements.push({ ...ap, issue, jusqua: iss });
    // signaux : rebond = on joue contre l'approche à la bougie d'arrivée (si elle ne ferme pas déjà au-delà) ; cassure = on joue dans le sens de l'approche à la première clôture au-delà de k·ATR
    if (dir > 0 ? serie.c[i] <= haut : serie.c[i] >= bas) { sigRebond.sens[i] = -dir; sigRebond.stop[i] = dir > 0 ? haut + margeStopATR * atr : bas - margeStopATR * atr; }
    for (let j = i; j <= fin; j++) { const passe = dir > 0 ? serie.c[j] >= haut + k * atr : serie.c[j] <= bas - k * atr; if (passe) { if (!sigCassure.sens[j]) { sigCassure.sens[j] = dir; sigCassure.stop[j] = (haut + bas) / 2 - dir * margeStopATR * atr; } break; } }
  }
  const cfg = { ...CONFIG_DEFAUT, ...config, maxParSemaine: 99, reposBarres: 0, distanceMinPct: 0.02, distanceMaxPct: 15 };
  const jouer = sig => { const r = simuler(serie, sig, cfg, { de: i0 }); return r.trades; };
  const tr = { rebond: jouer(sigRebond), cassure: jouer(sigCassure) };
  const milieu = serie.t[Math.floor((i0 + n) / 2)];
  const bloc = trades => ({ ...resumeR(trades.map(x => x.R)), moitie1: resumeR(trades.filter(x => x.t < milieu).map(x => x.R)), moitie2: resumeR(trades.filter(x => x.t >= milieu).map(x => x.R)), trades });
  const nb = e => evenements.filter(x => x.issue === e).length, N = evenements.length;
  const res = {
    ok: true, zone: { prixHaut: haut, prixBas: bas, largeurPct: (haut - bas) / bas * 100 }, parametres: { R, horizon, k, separation, margeStopATR }, periode: { de: serie.t[i0], a: serie.t[n - 1] },
    approches: N, parSens: { dessous: evenements.filter(x => x.dir > 0).length, dessus: evenements.filter(x => x.dir < 0).length },
    reactions: { rebond: wilson(nb('rebond'), N), cassure: wilson(nb('cassure'), N), indecis: wilson(nb('indecis'), N) },
    rebond: bloc(tr.rebond), cassure: bloc(tr.cassure), evenements,
    biais: 'Zone choisie après avoir vu le graphique : résultats optimistes.', echantillon: qualiteEchantillon(N), avertissement: AVERTISSEMENT
  };
  res.verdict = verdict(res);
  res.phrases = phrases(res);
  return res;
}
const indexDepuis = (t, x) => { let a = 0, b = t.length; while (a < b) { const m = (a + b) >> 1; if (t[m] < x) a = m + 1; else b = m; } return a; };

function verdictDe(b) {
  if (b.n < 30) return 'echantillon_insuffisant';
  if (b.ic.bas > 0) return b.moitie1.esperance > 0 && b.moitie2.esperance > 0 ? 'avantage_apparent' : 'avantage_instable';
  if (b.ic.haut < 0) return 'desavantage';
  return 'rien_de_net';
}
function verdict(r) { return { rebond: verdictDe(r.rebond), cassure: verdictDe(r.cassure) }; }
const NOMS = { echantillon_insuffisant: 'échantillon insuffisant pour conclure', avantage_apparent: 'avantage apparent (à confirmer : zone choisie après coup)', avantage_instable: 'avantage apparent mais instable entre les deux moitiés de l’histoire', desavantage: 'désavantage net', rien_de_net: 'rien de net (l’intervalle contient zéro)' };
export const nomVerdict = v => NOMS[v] || v;

function phrases(r) {
  const p = [], z = r.zone, f = x => x.toLocaleString('fr-FR', { maximumFractionDigits: z.prixBas < 1 ? 5 : 2 });
  p.push('Zone ' + f(z.prixBas) + ' à ' + f(z.prixHaut) + ' : ' + r.approches + ' approche' + (r.approches > 1 ? 's' : '') + ' dans l’historique (échantillon ' + r.echantillon + ').');
  if (r.approches === 0) { p.push('Le prix n’y est jamais arrivé depuis l’extérieur sur la période étudiée : rien à mesurer.'); return p; }
  const R = r.reactions;
  p.push('Rebond dans ' + pct(R.rebond.p) + ' des cas (fourchette ' + pct(R.rebond.bas) + ' à ' + pct(R.rebond.haut) + '), cassure dans ' + pct(R.cassure.p) + ', indécis dans ' + pct(R.indecis.p) + '.');
  for (const [cle, nom] of [['rebond', 'Jouer le rebond'], ['cassure', 'Jouer la cassure']]) {
    const b = r[cle];
    if (b.n === 0) { p.push(nom + ' : aucun trade simulable.'); continue; }
    p.push(nom + ' (cible ' + r.parametres.R + ' R, frais compris) : ' + b.n + ' trades, réussite ' + pct(b.taux.p) + ' (' + pct(b.taux.bas) + ' à ' + pct(b.taux.haut) + '), R moyen ' + fR(b.esperance) + (b.ic.bas != null ? ' (' + fR(b.ic.bas) + ' à ' + fR(b.ic.haut) + ')' : '') + ' → ' + nomVerdict(r.verdict[cle]) + '.');
  }
  p.push(r.biais + ' ' + r.avertissement);
  return p;
}
export const explicationZone = r => (r.ok ? r.phrases.join(' ') : 'Je n’ai pas pu tester cette zone : ' + r.erreur + '.');
