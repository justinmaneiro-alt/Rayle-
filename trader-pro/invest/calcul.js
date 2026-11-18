/* ═════════════ CALCUL D'UNE ENTREPRISE DU PANIER (module PUR : fetch injectable ; Worker Cloudflare et script Node) ═════════════
   S&P 500 : fondamentaux SEC EDGAR + prix Yahoo → fiche complète (valeur.js). CAC 40 : prix Yahoo seulement (aucune source gratuite fiable de fondamentaux) → « fondamentaux indisponibles ». */
import { lireFaits, lirePrix, UA_DEFAUT } from './sources.js';
import { evaluer, ligneIndex, BADGES } from './valeur.js';

const symboleYahoo = tk => (/.PA$/.test(tk) ? tk : tk.replace(".", "-"));   // BRK.B → BRK-B chez Yahoo
export const MESSAGE_FR = 'Fondamentaux indisponibles : aucune source gratuite fiable pour les comptes des sociétés françaises (la SEC ne couvre que les sociétés américaines). Prix seulement.';
/* sociétés dont le numéro CIK du jour (nouvelle société mère) n'a pas d'historique : on lit l'ancien */
const CIK_HISTORIQUE = { XOM: 34088 };
export async function calculerEntreprise(e, { fetchFn = fetch, ua = UA_DEFAUT, maintenant = Date.now() } = {}) {
  if (e.cik) {
    const [F, Y] = await Promise.all([lireFaits(CIK_HISTORIQUE[e.tk] || e.cik, fetchFn, ua), lirePrix(symboleYahoo(e.tk), fetchFn)]);
    const f = evaluer(F.annuel, { tk: e.tk, nom: e.nom || F.nom, secteur: e.secteur, prix: Y.prix, devise: Y.devise, actions: F.actions, actionsT: F.actionsT, mensuel: Y.mensuel, splits: Y.splits, maintenant });
    return { fiche: f, ligne: ligneIndex(f) };
  }
  const Y = await lirePrix(symboleYahoo(e.tk), fetchFn), M = Y.mensuel, perf = n => (M.length > n && M[M.length - 1 - n][1] > 0 ? Y.prix / M[M.length - 1 - n][1] - 1 : null);
  const f = { tk: e.tk, nom: e.nom, secteur: e.secteur, pays: e.pays || 'FR', t: maintenant, prix: Y.prix, devise: Y.devise || 'EUR', badge: BADGES.ND, mos: null, valeur: null, methodes: [], qualite: null, avertissements: [MESSAGE_FR], hypotheses: [], perf: { a1: perf(12), a5: perf(60), a10: perf(120) }, histo: { prix: M.filter(p => p[0] >= maintenant - 11 * 365 * 86400e3), valeur: [], note: '' } };
  return { fiche: f, ligne: ligneIndex(f) };
}
