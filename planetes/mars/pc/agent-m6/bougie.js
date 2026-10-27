import { construireContexte } from '../agent-btc/contexte.js';
import { construireMicro, SESSIONS } from '../agent-btc/micro-mesures.js';
import { raisonPhase, PHASES } from '../agent-btc/lecture.js';
import { tranche } from '../agent-btc/colonnes.js';
import { lireGraphique, niveauxA } from './chart-etat.js';
import { versBougies } from '../agent-btc/colonnes.js';

/* ═════════════ « EXPLIQUE-MOI CETTE BOUGIE » (M6 ; module pur, testé : planetes/mars/tests/m6-graphique-test.mjs) ═════════════
   Clic sur une bougie M15 : Rayle explique son contexte avec les données de l'agent, SANS IA : forme de la bougie, volume relatif, delta (réel ou estimé), phase H1 et H4 telles que l'agent les voyait
   à CE moment-là (le passé seul : on recalcule sur les bougies jusqu'à celle-ci), session, VWAP du jour, indicateurs (RSI, position par rapport à la MA 200, ATR), supports / résistances proches.
   Une phrase par fait ; un fait inconnu est dit « inconnu », jamais deviné. Ce n'est pas une prévision : « ce qui s'est passé », pas « ce qui va se passer ». */
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));

/* Forme de la bougie par ses proportions (corps, mèches), sans jargon inutile. */
export function formeBougie(b, precedente = null) {
  const range = b.h - b.l; if (!(range > 0)) return { nom: 'plate', phrase: 'bougie plate (aucune amplitude)' };
  const corps = Math.abs(b.c - b.o), haut = b.h - Math.max(b.o, b.c), bas = Math.min(b.o, b.c) - b.l, rc = corps / range, rh = haut / range, rb = bas / range, hausse = b.c >= b.o;
  let nom, phrase;
  if (rc < 0.1) { nom = 'doji'; phrase = 'doji : ouverture et clôture presque égales, hésitation'; }
  else if (rc > 0.8) { nom = hausse ? 'marubozu haussier' : 'marubozu baissier'; phrase = (hausse ? 'forte bougie haussière' : 'forte bougie baissière') + ' pleine, presque sans mèches'; }
  else if (rb > 0.55 && rh < 0.2) { nom = 'marteau'; phrase = 'longue mèche basse : les vendeurs ont poussé puis les acheteurs ont repris la main'; }
  else if (rh > 0.55 && rb < 0.2) { nom = 'étoile filante'; phrase = 'longue mèche haute : les acheteurs ont poussé puis les vendeurs ont repris la main'; }
  else { nom = hausse ? 'haussière' : 'baissière'; phrase = hausse ? 'bougie haussière' : 'bougie baissière'; }
  let engl = false; if (precedente) { const pc = Math.abs(precedente.c - precedente.o); engl = corps > pc * 1.2 && ((hausse && precedente.c < precedente.o && b.c > precedente.o && b.o < precedente.c) || (!hausse && precedente.c > precedente.o && b.c < precedente.o && b.o > precedente.c)); }
  return { nom, phrase: phrase + (engl ? ', qui avale la bougie précédente' : ''), corpsPct: rc, mecheHautePct: rh, mecheBassePct: rb, avalement: engl };
}

/* serie = colonnes M15 complètes ; t = ouverture de la bougie. Rend { ok, phrases:[], faits:{…} }. */
export function expliquerBougie(serie, t, { deltaReel = true, paire = null } = {}) {
  let i = -1; for (let k = serie.n - 1; k >= 0; k--) if (serie.t[k] === t) { i = k; break; }
  if (i < 0) return { ok: false, erreur: 'aucune bougie à cet instant' };
  if (i < 300) return { ok: false, erreur: 'trop tôt dans l’historique pour expliquer cette bougie (il faut 300 bougies avant)' };
  const a = Math.max(0, i - 3500), fenetre = tranche(serie, a, i + 1), j = fenetre.n - 1;             // le passé seul, jusqu'à cette bougie incluse
  const ctx = construireContexte(fenetre), mi = construireMicro(ctx);
  const b = { t: serie.t[i], o: serie.o[i], h: serie.h[i], l: serie.l[i], c: serie.c[i], v: serie.v[i] }, prec = { o: serie.o[i - 1], c: serie.c[i - 1] };
  const forme = formeBougie(b, prec), phrases = [];
  const quand = new Date(b.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
  phrases.push('Bougie de ' + quand + ' (heure de Paris) : ' + forme.phrase + '. Ouverture ' + f(b.o) + ', haut ' + f(b.h) + ', bas ' + f(b.l) + ', clôture ' + f(b.c) + ' (' + f((b.c - b.o) / b.o * 100) + ' %).');
  const volRel = mi.volRel[j], faits = { forme, volRel: Number.isFinite(volRel) ? volRel : null };
  phrases.push(!Number.isFinite(volRel) ? 'Volume : inconnu.' : 'Volume ' + f(volRel, 1) + ' fois la moyenne des 20 bougies précédentes (' + (volRel >= 2 ? 'très élevé' : volRel >= 1.3 ? 'élevé' : volRel <= 0.6 ? 'faible' : 'normal') + ').');
  const dr = mi.deltaRatio[j], estime = ctx.deltaEstime && ctx.deltaEstime[j] === 1; faits.deltaRatio = Number.isFinite(dr) ? dr : null; faits.deltaEstime = !!estime;
  phrases.push(!Number.isFinite(dr) ? 'Delta : inconnu.' : 'Delta ' + (dr > 0.1 ? 'acheteur' : dr < -0.1 ? 'vendeur' : 'équilibré') + ' (' + f(dr * 100, 0) + ' % du volume)' + (estime ? ', ESTIMÉ à partir du sens de la bougie : la source ne donne pas le volume acheteur' : ', réel') + '.');
  const sess = SESSIONS[mi.sess[j]]; faits.session = sess; phrases.push('Session : ' + sess + '.');
  const p1 = raisonPhase(ctx.h1.prep, ctx.h1.idx[j] >= 0 ? ctx.h1.idx[j] : 0), p4 = raisonPhase(ctx.h4.prep, ctx.h4.idx[j] >= 0 ? ctx.h4.idx[j] : 0);
  faits.phaseH1 = p1.phase; faits.phaseH4 = p4.phase; phrases.push('Phase à ce moment : ' + p1.phase + ' en H1, ' + p4.phase + ' en H4.');
  if (Number.isFinite(mi.vwap[j])) { const e = mi.sigma[j] > 0 ? (b.c - mi.vwap[j]) / mi.sigma[j] : 0; faits.vwap = mi.vwap[j]; faits.ecartVwap = e; phrases.push('VWAP du jour ' + f(mi.vwap[j]) + ' : la clôture est ' + (b.c >= mi.vwap[j] ? 'au-dessus' : 'sous') + ' (' + f(Math.abs(e), 1) + ' écart-type).'); }
  const E = lireGraphique({ bougies: versBougies(fenetre), indicateurs: ['rsi14', 'ma200', 'atr14'], derniers: 1, volumeReel: deltaReel, paire });
  const rsi = E.indicateurs.rsi14.derniere.valeur, ma = E.indicateurs.ma200.derniere.valeur, atr = E.indicateurs.atr14.derniere.valeur;
  faits.rsi = rsi; faits.ma200 = ma; faits.atr = atr;
  if (rsi != null) phrases.push('RSI 14 : ' + f(rsi, 0) + (rsi >= 70 ? ' (surachat)' : rsi <= 30 ? ' (survente)' : '') + '.');
  if (ma != null) phrases.push('Le prix est ' + (b.c >= ma ? 'au-dessus' : 'sous') + ' la MA 200 M15 (' + f(Math.abs(b.c - ma) / ma * 100) + ' %).');
  if (atr != null) phrases.push('Amplitude de la bougie : ' + f((b.h - b.l) / atr, 1) + ' ATR.');
  const nv = niveauxA(versBougies(fenetre), j); faits.niveaux = nv;
  const proche = [...nv.supports.map(x => ['support', x.prix]), ...nv.resistances.map(x => ['résistance', x.prix])].sort((u, v) => Math.abs(u[1] - b.c) - Math.abs(v[1] - b.c))[0];
  if (proche) phrases.push('Niveau le plus proche : ' + proche[0] + ' à ' + f(proche[1]) + ' (' + f(Math.abs(proche[1] - b.c) / b.c * 100) + ' % du prix).');
  phrases.push('C’est ce que montrent les données de ce moment-là ; ce n’est pas une prévision.');
  return { ok: true, t: b.t, bougie: b, faits, phrases, texte: phrases.join(' '), phaseNom: PHASES[ctx.h1.phase[j]] };
}
