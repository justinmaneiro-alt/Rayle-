// Pépinière live sur le PC (V4, phase 7) : fait avancer, à chaque cycle du service, les candidates en simulation (strategies/pepiniere.js) avec les VRAIES données : bougies M15 fermées (candidates
// « historique ») et barres d'une minute du carnet enregistré (candidates « carnet »). État : <agent>\pepiniere.json. Aucun ordre, aucune clé : du paper trading avec les mêmes frais que le backtest.
import path from 'node:path';
import { dossierAgent, lireJson, ecrireJson } from './etat-agent.mjs';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { surveillerRegle } from '../strategies/surveillance-commune.js';
import { etatPepiniereVide, ajouterCandidate, candidatesDepuisRecherche, candidatesCarnet, integrerTradesHistoriques, proposerEntreePapier, avancerPapier, evaluer, resumePepiniere, PEPINIERE } from '../strategies/pepiniere.js';
import { proposerCarnet, ORDRE_CARNET } from '../strategies/familles-carnet.js';
import { cascadesLiquidations } from '../strategies/liquidite/pieges-stops.js';
import { analyserActif, stockageDe } from './flux/analyse-liquidite.mjs';

export const fichierPepiniere = dossier => path.join(dossier, 'pepiniere.json');
export const lirePepiniere = dossier => { const p = lireJson(fichierPepiniere(dossier), null); return p && p.version === 1 ? p : etatPepiniereVide(); };
export const ecrirePepiniere = (pep, dossier) => ecrireJson(fichierPepiniere(dossier), pep, { copies: 1 });

/* Remplit la pépinière (au démarrage et chaque jour) : les 15 candidates du carnet (5 familles × 3 actifs) puis les meilleures non validées de la recherche, jusqu'à 50. */
export function alimenter(pep, etat, paires, maintenant) {
  let n = 0; for (const c of candidatesCarnet(ORDRE_CARNET, paires)) if (ajouterCandidate(pep, c, maintenant).ok) n++;
  for (const c of candidatesDepuisRecherche(etat)) if (ajouterCandidate(pep, c, maintenant).ok) n++;
  return n;
}
/* Avance toutes les candidates. `serie(p)` rend la série M15 de l'actif ; `etat` = état de l'agent (coûts et risque) ; `stockage` = flux enregistrés (peut être null : les candidates carnet attendent). Rend { changements, avancees }. */
export async function avancerPepiniere({ dossier = dossierAgent(), pep = null, etat, serie, paires, maintenant = Date.now(), stockage = null, analyseur = analyserActif, derniereAnalyse = {} } = {}) {
  pep = pep || lirePepiniere(dossier); const changements = [], entrees = []; let avancees = 0;
  // 1. candidates « historique » : compte simulé du service sur les bougies M15 fermées
  for (const c of pep.candidates) {
    if (c.statut !== 'active' || c.type !== 'historique') continue; const s = serie(c.paire); if (!s || s.n < 1500) continue;
    if (c.suivi && c.suivi.derniereBarre != null && c.suivi.derniereBarre >= s.t[s.n - 1]) continue;                               // rien de neuf depuis la dernière bougie
    const fen = s.n > 3000 ? tranche(s, s.n - 3000, s.n) : s, r = surveillerRegle({ regle: { id: c.id, famille: c.famille, params: c.params, paire: c.paire, mode: 'SIMULATION', nom: c.nom }, s: null, suivi: c.suivi, serie: fen, risque: etat.parametresRisque || {}, alertesRecentes: [], maintenant });
    if (r.erreur) continue; c.suivi = r.suivi; avancees += integrerTradesHistoriques(c, r.suivi.trades);
    for (const ev of r.evenements || []) if (ev.type === 'ENTREE') entrees.push({ id: c.id, nom: c.nom, paire: c.paire, sens: ev.sens, stop: ev.stop, t: ev.t });
  }
  // 2. candidates « carnet » : propositions de la carte de liquidité (une analyse par actif et par minute), puis simulation sur les barres d'une minute
  const S = stockage || (() => { try { return stockageDe(dossier); } catch (e) { return null; } })();
  if (S) for (const actif of paires) {
    const cands = pep.candidates.filter(c => c.statut === 'active' && c.type === 'carnet' && c.paire === actif); if (!cands.length) continue; const cle = 'binance-spot-' + actif;
    const bars = S.lireAgg1m(cle, maintenant - 3 * 3600e3, maintenant).filter(b => b.t + 60000 <= maintenant && b.ouv > 0);
    for (const c of cands) { const dep = c.dernierBarre1m || 0; for (const b of bars) if (b.t > dep) { for (const tr of avancerPapier(c, { t: b.t, o: b.ouv, h: b.haut, l: b.bas, c: b.cloture }, configMoteurDe(actif))) avancees++; c.dernierBarre1m = b.t; } }
    if (maintenant - (derniereAnalyse[actif] || 0) >= 60000 && bars.length) {
      derniereAnalyse[actif] = maintenant;
      try {
        const a = await analyseur({ dossier, actif, venue: 'binance-spot', minutes: 20, maintenant, stockage: S }); if (a && a.prix) {
          const ev = S.lireLignes('evenements', cle, maintenant - 60000, maintenant), liq = S.lireLignes('liquidations', 'binance-fut-' + actif, maintenant - 20 * 60e3, maintenant);
          const props = proposerCarnet({ actif, t: maintenant, prix: a.prix, atr: a.prix * 0.0015, analyse: a, evenementsRecents: ev, cascades: cascadesLiquidations(liq, { fenetreS: 60, seuilUsd: actif === 'BTC' ? 1e6 : 2e5 }), joursCarnet: a.joursCarnet });
          for (const p of props) { const c = cands.find(x => x.famille === p.famille); if (c && proposerEntreePapier(c, p, maintenant)) entrees.push({ id: c.id, nom: c.nom, paire: c.paire, sens: p.sens, stop: p.stop, t: maintenant }); }
        }
      } catch (e) { /* analyse indisponible : on réessaie dans une minute */ }
    }
  }
  changements.push(...evaluer(pep, maintenant)); ecrirePepiniere(pep, dossier);
  return { changements, avancees, pep, entrees };
}
export { resumePepiniere, PEPINIERE };
