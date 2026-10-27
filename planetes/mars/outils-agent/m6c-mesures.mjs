import fs from 'node:fs';
import { historiquePaire } from './m6c-donnees.mjs';
import { decouper } from '../pc/agent-btc/evaluation.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { statistiques } from '../pc/agent-btc/moteur.js';
import { contexteRegime, REGLES } from '../pc/agent-m6c/regles-regime.js';
import { simulerSuiveur } from '../pc/agent-m6c/simulateur-suiveur.js';
import { precisionDetecteur } from '../pc/agent-m6c/precision-detecteur.js';
import { CODES } from '../pc/agent-m6c/detecteur-regime.js';

/* Mesures de description (zone A seulement) : précision du détecteur de régime ; trades évités par le filtre « pas d'entrée en range » et ce qu'ils auraient coûté ;
   gros mouvements captés ; fausses cassures évitées / subies. Aucun réglage n'est fait à partir de ces chiffres. */
const sortie = {};
for (const paire of (process.argv[2] || 'BTC,SOL,DOGE').split(',')) {
  const { serie } = await historiquePaire(paire), dec = decouper(serie), A = tranche(serie, 0, dec.finA), ctx = contexteRegime(A), det = ctx.reg.det, H = ctx.h1.serie, o = { paire };
  o.precision = precisionDetecteur(det, H);
  const R = ctx.reg.regime, part = [0, 0, 0, 0]; for (let i = 0; i < ctx.n; i++) part[R[i]]++; o.partRegimes = part.map(x => x / ctx.n);
  // trades évités : règles de tendance SANS filtre de régime, comptées quand le signal tombe pendant un RANGE
  o.evites = {};
  for (const id of ['tendance_cassure', 'tendance_repli']) {
    const reg = REGLES[id], sig = reg.signaux(ctx, { ...reg.defaut, filtre: 0 }), tr = simulerSuiveur(A, sig, {}, { de: 0, a: A.n }).trades;
    const dansRange = tr.filter(x => R[x.signal] === CODES.RANGE), st = statistiques(dansRange, { barres: A.n }), tot = statistiques(tr, { barres: A.n });
    o.evites[id] = { tradesSansFiltre: tr.length, enRange: dansRange.length, RenRange: st.Rtotal, esperanceEnRange: st.esperance, esperanceTous: tot.esperance };
  }
  // gros mouvements : mouvements de >= 5 ATR H1 en 24 h dans le sens d'une tendance ; part captée par les trades de cassure_range / tendance (au moins un trade ouvert pendant le mouvement)
  const sig = REGLES.cassure_range.signaux(ctx, { mode: 'immediat', score: 3, mult: 1.5 }); const retest = REGLES.cassure_range.signaux(ctx, REGLES.cassure_range.defaut);
  o.cassures = { immediat: { subies: sig.evenements.filter(e => e.type === 'subie').length, signaux: sig.sens.reduce((a, x) => a + (x ? 1 : 0), 0) }, retest: { evitees: retest.evenements.filter(e => e.type === 'evitee').length, signaux: retest.sens.reduce((a, x) => a + (x ? 1 : 0), 0) } };
  // gros mouvements : en H1, mouvement dirigé >= 5 ATR H1 sur 48 h (départ au point bas / haut, sans chevauchement) ; « capté » = un trade (règles par défaut, tous régimes confondus) ouvert dans le même sens pendant le mouvement et gagnant
  { const tousTrades = []; for (const id of ['tendance_cassure', 'tendance_repli', 'cassure_range']) { const reg = REGLES[id], sg = reg.signaux(ctx, reg.defaut); tousTrades.push(...simulerSuiveur(A, sg, {}, { de: 0, a: A.n }).trades.map(x => ({ ...x, id }))); }
    let k = 0, n = 0, captes = 0; const parRegle = { tendance_cassure: 0, tendance_repli: 0, cassure_range: 0 };
    for (let i = 300; i < H.n - 48;) {
      const a0 = H.c[i], atr0 = det.atr[i]; if (!(atr0 > 0)) { i++; continue; }
      let fin = -1, sens = 0; for (let j = i + 4; j <= i + 48; j++) if (Math.abs(H.c[j] - a0) >= 5 * atr0) { fin = j; sens = H.c[j] > a0 ? 1 : -1; break; }
      if (fin < 0) { i++; continue; }
      n++; const t0 = H.t[i], t1 = H.t[fin] + 3600e3, pris = tousTrades.filter(x => x.sens === sens && x.R > 0 && x.t < t1 && x.tSortie > t0);
      if (pris.length) { captes++; for (const id of new Set(pris.map(x => x.id))) parRegle[id]++; }
      i = fin + 1; k++; }
    o.grosMouvements = { n, captes, part: n ? captes / n : null, parRegle, definition: 'mouvement dirigé de plus de 5 ATR H1 en 48 h ; capté si un trade dans le même sens, gagnant, était ouvert pendant ce mouvement' };
    console.log(' gros mouvements :', n, 'dont', captes, 'captés par au moins un trade gagnant (' + (n ? Math.round(captes / n * 100) : 0) + ' %)'); }
  sortie[paire] = o;
  console.log('\n' + paire, 'régimes (M15) : transition', (o.partRegimes[0] * 100).toFixed(0), '% · haussier', (o.partRegimes[1] * 100).toFixed(0), '% · baissier', (o.partRegimes[2] * 100).toFixed(0), '% · range', (o.partRegimes[3] * 100).toFixed(0), '%');
  for (const p of o.precision) console.log(' précision', p.regime.padEnd(20), 'n', String(p.n).padStart(5), 'taux', p.taux == null ? '—' : (p.taux * 100).toFixed(1) + ' %', 'base', p.base == null ? '—' : (p.base * 100).toFixed(1) + ' %', 'lift', p.lift == null ? '—' : p.lift.toFixed(2), p.ok ? 'OK' : 'insuffisant');
  for (const [id, e] of Object.entries(o.evites)) console.log(' filtre range', id.padEnd(17), e.enRange + ' trades sur ' + e.tradesSansFiltre + ' tombaient en range, total ' + e.RenRange.toFixed(1) + ' R (' + (e.esperanceEnRange == null ? '—' : e.esperanceEnRange.toFixed(3)) + ' R/trade, contre ' + (e.esperanceTous == null ? '—' : e.esperanceTous.toFixed(3)) + ' tous régimes)');
  console.log(' cassures : immédiat ' + o.cassures.immediat.signaux + ' signaux dont ' + o.cassures.immediat.subies + ' fausses cassures subies ; retest ' + o.cassures.retest.signaux + ' signaux, ' + o.cassures.retest.evitees + ' fausses cassures évitées');
}
fs.mkdirSync(new URL('../../../docs/resultats-m6c/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../../docs/resultats-m6c/mesures-' + new Date().toISOString().slice(0, 10) + '.json', import.meta.url), JSON.stringify(sortie, null, 1));
