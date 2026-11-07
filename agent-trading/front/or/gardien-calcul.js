/* ═════════════ GARDIEN DE DRAWDOWN DU COMPTE PROP (pur, testé) ═════════════
   Défauts de Justin : capital de départ 10 000 $, limites du compte : perte du jour 3 %, perte totale 6 %.
   Paliers du gardien (plus prudents que le compte) : alerte à 1,5 % de perte du jour ; « STOP POUR AUJOURD'HUI » à 2,5 % ou après 2 pertes
   de suite dans la journée ; alertes à 3 % puis 5 % de perte totale ; avancement vers +10 %.
   Base de calcul réglable : « solde » (trades clôturés seulement) ou « équité » (solde + latent saisi). Jour = jour de Paris, réglable.
   Le gardien ne passe et ne bloque aucun ordre réel : il affiche. */
import { pluriel } from './texte-or.js';
import { plNet, ferme } from './journal-calcul.js';
import { cleJour } from './niveaux-or.js';
import { KRAKEN } from './config-or.js';

export const DEFAUTS = Object.freeze({ capital: 10000, limiteJour: 3, limiteTotale: 6, alerteJour: 1.5, stopJour: 2.5, pertesDeSuite: 2, alertesTotales: [3, 5], objectif: 10, base: 'solde', risque: 0.5 });

export function etatGardien(trades, { reglages = DEFAUTS, maintenant = Date.now(), latent = 0, jourDe = cleJour } = {}) {
  const R = { ...DEFAUTS, ...reglages }, C = R.capital;
  const clos = trades.filter(t => t.devise !== 'EUR' && t.source !== 'xtb' && (ferme(t) || t.pl != null) && t.tSortie && t.tSortie <= maintenant).sort((a, b) => a.tSortie - b.tSortie);
  const realise = clos.reduce((a, t) => a + (plNet(t) || 0), 0), lat = R.base === 'equite' ? (+latent || 0) : 0;
  const jour = jourDe(maintenant), duJour = clos.filter(t => jourDe(t.tSortie) === jour);
  const soldeDebutJour = C + clos.filter(t => jourDe(t.tSortie) < jour).reduce((a, t) => a + (plNet(t) || 0), 0);
  const pnlJour = duJour.reduce((a, t) => a + (plNet(t) || 0), 0) + lat, actuel = C + realise + lat;
  const perteJourPct = Math.max(0, -pnlJour) / C * 100, perteTotalePct = Math.max(0, C - actuel) / C * 100, gainPct = (actuel - C) / C * 100;
  let suite = 0; for (let i = duJour.length - 1; i >= 0 && (plNet(duJour[i]) || 0) < 0; i--) suite++;
  const alertes = [];
  let statut = 'ok';
  if (perteTotalePct >= R.limiteTotale) { statut = 'limite'; alertes.push({ niveau: 'rouge', texte: `Limite de perte totale du compte atteinte (${perteTotalePct.toFixed(2)} % ≥ ${R.limiteTotale} %).` }); }
  if (perteJourPct >= R.limiteJour) { statut = 'limite'; alertes.push({ niveau: 'rouge', texte: `Limite de perte du jour du compte atteinte (${perteJourPct.toFixed(2)} % ≥ ${R.limiteJour} %).` }); }
  if (statut !== 'limite' && (perteJourPct >= R.stopJour || suite >= R.pertesDeSuite)) { statut = 'stop'; alertes.push({ niveau: 'rouge', texte: `STOP POUR AUJOURD'HUI : ${perteJourPct >= R.stopJour ? `perte du jour ${perteJourPct.toFixed(2)} % (palier ${R.stopJour} %)` : `${pluriel(suite, 'perte', 'pertes')} de suite`}.` }); }
  if (statut === 'ok' && perteJourPct >= R.alerteJour) { statut = 'attention'; alertes.push({ niveau: 'orange', texte: `Attention : perte du jour ${perteJourPct.toFixed(2)} % (alerte à ${R.alerteJour} %, stop à ${R.stopJour} %).` }); }
  for (const a of [...R.alertesTotales].sort((x, y) => y - x)) if (perteTotalePct >= a && perteTotalePct < R.limiteTotale) { alertes.push({ niveau: a >= 5 ? 'rouge' : 'orange', texte: `Perte totale ${perteTotalePct.toFixed(2)} % (palier ${a} %, limite du compte ${R.limiteTotale} %).` }); if (statut === 'ok') statut = 'attention'; break; }
  return {
    statut, alertes, capital: C, actuel, realise, latent: lat, pnlJour, perteJourPct, perteTotalePct, gainPct, pertesDeSuite: suite, tradesJour: duJour.length, soldeDebutJour,
    resteJour: Math.max(0, C * R.stopJour / 100 + Math.min(0, pnlJour)), resteTotal: Math.max(0, actuel - C * (1 - R.limiteTotale / 100)),
    avancement: Math.max(0, Math.min(1, gainPct / R.objectif)), objectif: R.objectif, base: R.base
  };
}

/* calculateur de taille : risque (% de l'équité) / distance du stop ; contrats Kraken PF_XAUUSD = 1 once, pas de 0,001 */
export function taillePosition({ equite, risquePct = DEFAUTS.risque, entree, stop, tailleContrat = KRAKEN.tailleContrat, pas = KRAKEN.pasQuantite }) {
  if (!(equite > 0) || !(risquePct > 0) || !(entree > 0) || !(stop > 0)) return { ok: false, raison: 'renseigne l’équité, le risque, l’entrée et le stop' };
  const dist = Math.abs(entree - stop); if (!dist) return { ok: false, raison: 'le stop est égal à l’entrée' };
  const risque$ = equite * risquePct / 100, brut = risque$ / (dist * tailleContrat), contrats = Math.floor(brut / pas + 1e-9) * pas;
  return { ok: contrats > 0, raison: contrats > 0 ? null : 'taille inférieure au minimum de 0,001 contrat', risque$, distance: dist, contrats: Math.round(contrats * 1000) / 1000, onces: Math.round(contrats * tailleContrat * 1000) / 1000, risqueReel$: contrats * tailleContrat * dist, valeur$: contrats * tailleContrat * entree, lotsXtb: Math.round(contrats * tailleContrat / 100 * 100) / 100 };
}
