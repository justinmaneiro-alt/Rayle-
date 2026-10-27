import { sessionDe, SESSIONS } from './micro-mesures.js';
import { PHASES } from './lecture.js';

/* ═════════════ CONTEXTE DES TRADES (M5 ; module pur, testé : m5-diagnostic-test.mjs) ═════════════
   Pour chaque trade du moteur, on retrouve ce que l'agent « voyait » à la clôture de la bougie du signal (phase H1 et H4 confirmées, session, volatilité, volume relatif, delta) :
   tout est lu à l'index du signal, jamais après (aucun regard vers le futur). Sert au diagnostic (« quand ça marche »), au détail d'un trade et au graphique. */
export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const SAISONS = ['hiver', 'printemps', 'été', 'automne'];
const regimeDe = code => (code === 1 ? 'hausse' : code === 2 ? 'baisse' : code === 3 ? 'range' : 'transition');
const saisonDe = mois => (mois === 11 || mois <= 1 ? 0 : mois <= 4 ? 1 : mois <= 7 ? 2 : 3);
const volDe = r => (!Number.isFinite(r) ? 'inconnue' : r < 0.33 ? 'calme' : r < 0.66 ? 'moyenne' : 'forte');

/* Rend de nouveaux objets trade (les originaux ne sont pas modifiés) avec : phase, phaseH4, regime, session, vol, jour, saison, trimestre, volRel, deltaSens. */
export function enrichirTrades(trades, ctx) {
  return trades.map(x => {
    const i = Math.min(Math.max(0, x.signal != null ? x.signal : x.entree - 1), ctx.n - 1), d = new Date(x.t);
    const ph = ctx.h1.phase[i], ph4 = ctx.h4.phase[i], vm = ctx.volMoy20[i];
    return { ...x, phase: PHASES[ph] || 'transition', phaseCode: ph, phaseH4: PHASES[ph4] || 'transition', regime: regimeDe(ph), session: SESSIONS[sessionDe(x.t)], vol: volDe(ctx.h1.atrRang[i]),
      jour: JOURS[d.getUTCDay()], saison: SAISONS[saisonDe(d.getUTCMonth())], trimestre: d.getUTCFullYear() + 'T' + (Math.floor(d.getUTCMonth() / 3) + 1), annee: d.getUTCFullYear(),
      volRel: vm > 0 ? ctx.m15.v[i] / vm : null, deltaSens: ctx.delta15[i] > 0 ? 1 : ctx.delta15[i] < 0 ? -1 : 0 };
  });
}

const dec = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const horaire = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* « Pourquoi ce trade a été pris, pourquoi il a gagné ou perdu » : phrases construites sur les données du trade (sans IA). */
export function expliquerTrade(x, nomStrategie = 'la stratégie') {
  const sens = x.sens > 0 ? 'achat' : 'vente';
  const pris = 'Pris le ' + horaire(x.t) + ' : ' + sens + ' signalé par ' + nomStrategie + ' pendant une phase « ' + (x.phase || '?') + ' » (H4 : ' + (x.phaseH4 || '?') + '), session ' + (x.session || '?') + ', volatilité ' + (x.vol || '?') +
    (x.volRel != null ? ', volume ' + dec(x.volRel, 1) + ' fois la normale' : '') + (x.deltaSens ? ', delta ' + (x.deltaSens > 0 ? 'acheteur' : 'vendeur') : '') + '.';
  const gagne = x.R > 0, duree = x.barres != null ? Math.round(x.barres / 4 * 10) / 10 : null;
  let fin;
  if (x.motif === 'cible') fin = 'Gagnant : le prix a atteint l’objectif (' + dec(x.R) + ' R net après frais) en ' + (duree != null ? dec(duree, 1) + ' h' : '?') + '.';
  else if (x.motif === 'stop') fin = 'Perdant : le prix a touché le stop (' + dec(x.R) + ' R, frais compris) en ' + (duree != null ? dec(duree, 1) + ' h' : '?') + '. ' + (x.phase && x.regime === 'transition' ? 'La phase était une transition, souvent moins lisible.' : x.sens > 0 && x.regime === 'baisse' ? 'L’achat allait contre la tendance baissière.' : x.sens < 0 && x.regime === 'hausse' ? 'La vente allait contre la tendance haussière.' : 'Le marché est allé dans le sens inverse avant l’objectif.');
  else fin = (gagne ? 'Gagnant' : 'Perdant') + ' : sortie au bout du temps maximum (' + (duree != null ? dec(duree, 1) + ' h' : '?') + '), résultat ' + dec(x.R) + ' R.';
  return { pris, fin, texte: pris + ' ' + fin };
}
