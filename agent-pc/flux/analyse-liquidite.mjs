// Analyse de liquidité côté PC (V4, phases 3 et 4) : charge sur le disque ce que le service a enregistré, puis appelle le moteur pur (strategies/liquidite/analyse.js).
//   node agent-pc/flux/analyse-liquidite.mjs BTC binance-spot [minutes]     affiche l'analyse (résumé « Où va le marché ? »)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dossierAgent, fichiersAgent, lireJson } from '../etat-agent.mjs';
import { creerStockage } from './stockage-flux.mjs';
import { fichiersFlux } from './service-flux.mjs';
import { lireBarresTrades, lireMetrics, ACTIFS_HIST } from './historique-trades.mjs';
import { chargerSerie } from '../travailleur.mjs';
import { analyserLiquidite } from '../../strategies/liquidite/analyse.js';
import { PAIRES } from '../../planetes/mars/pc/agent-m6/paires.js';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';

export const VENUES = Object.freeze(['binance-spot', 'binance-fut', 'kraken']);
const cache = new Map();                                                                  // série M15 par actif (rechargée au plus toutes les 5 minutes)
async function serieM15(dossier, actif, maintenant) {
  const c = cache.get(actif); if (c && maintenant - c.t < 300000) return c.s;
  const s = await chargerSerie(fichiersAgent(dossier).donnees, actif).catch(() => null); if (!s || !s.n) return null;
  const fin = Math.max(0, s.n - 6000), sl = tranche(s, fin, s.n); cache.set(actif, { t: maintenant, s: sl }); return sl;                     // les ≈ 2 derniers mois suffisent aux piscines
}
export function stockageDe(dossier = dossierAgent()) { const F = fichiersFlux(dossier); return creerStockage({ dossier: F.dossier }); }
export function joursCarnet(dossier, cle, maintenant = Date.now()) { const e = lireJson(fichiersFlux(dossier).etat, null), t = e && e.premierEnregistrement && e.premierEnregistrement[cle]; return t ? (maintenant - t) / 86400e3 : null; }

export async function analyserActif({ dossier = dossierAgent(), actif = 'BTC', venue = 'binance-spot', minutes = 20, maintenant = Date.now(), stockage = null } = {}) {
  if (!PAIRES[actif]) throw new Error('actif inconnu : ' + actif); if (!VENUES.includes(venue)) throw new Error('flux inconnu : ' + venue);
  const S = stockage || stockageDe(dossier), cle = venue + '-' + actif, t0 = maintenant - minutes * 60e3;
  const donnees = S.lireProfondeur(cle, t0, maintenant), evenements = S.lireLignes('evenements', cle, t0, maintenant), trades = S.lireLignes('trades', cle, t0, maintenant);
  const sym = ACTIFS_HIST[actif], jours3 = 3 * 86400e3;
  let barresProfil = null, metrics = null; try { barresProfil = lireBarresTrades(dossier, 'spot', sym, maintenant - jours3, maintenant); if (!barresProfil.length) barresProfil = null; } catch (e) { /* pas d'historique */ }
  try { metrics = lireMetrics(dossier, sym, maintenant - 2 * jours3, maintenant); if (!metrics.length) metrics = null; } catch (e) { /* pas de metrics */ }
  const derives = S.lireLignes('derives', 'binance-fut-' + actif, maintenant - 6 * 3600e3, maintenant);
  const m15 = await serieM15(dossier, actif, maintenant);
  return analyserLiquidite({ actif, venue, maintenant, donnees, evenements, trades, barresProfil, m15, metrics, derives, joursCarnet: joursCarnet(dossier, cle, maintenant), ronds: PAIRES[actif].ronds });
}

const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const [actif = 'BTC', venue = 'binance-spot', min = '20'] = process.argv.slice(2), r = await analyserActif({ actif, venue, minutes: Number(min) });
  console.log(JSON.stringify({ actif: r.actif, venue: r.venue, prix: r.prix, sources: r.sources, avertissements: r.avertissements, murs: r.murs.slice(0, 5), pression: r.pression, profil: r.profil && { poc: r.profil.poc, vah: r.profil.vah, val: r.profil.val } }, null, 1));
  if (r.aimants) console.log('\n' + r.aimants.resume.join('\n'));
}
