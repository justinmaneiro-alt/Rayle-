import { creerHoteLocal, calculateurWorker } from '../agent-btc/hote-local.js';
import { creerHoteDistant } from '../agent-btc/hote-distant.js';
import { versLocal, versVeilleur } from '../agent-btc/basculer.js';
import { ouvrirStockageBtc } from '../agent-btc/stockage-btc.js';
import { creerSauvegardes } from '../agent-m6/reproductibilite.js';
import { PAIRES, ORDRE_PAIRES, sourceBinance } from '../agent-m6/paires.js';
import { obtenirM6, jugerAlerteGlobal } from './m6-page.js';
import { obtenirHote as obtenirHoteBtc, activerPilote as activerBtc, basculer as basculerBtc, surChangement as surChangementBtc, journalErreurs, alerteVersRayle, notificationVersRayle, appelerVeilleur } from './pilote-page.js';

/* ═════════════ LES HÔTES DE L'AGENT PAR PAIRE (M6) : BTC (inchangé), SOL et DOGE ═════════════
   Chaque paire a SA base de données (IndexedDB « rayle-btc », « rayle-sol », « rayle-doge »), SON état de pilote (compteur de variantes, bibliothèque de stratégies, compte simulé,
   coffre du jeu final), SES coûts et SA recherche. Rien n'est partagé : les résultats d'une paire ne valident jamais une autre. Données : Binance (CORS ouvert), historique depuis le
   début de la paire sur Binance (SOL 2020-08-11, DOGE 2019-07-05). Pas de secours Bitstamp pour SOL et DOGE (pas d'historique profond) : si Binance est fermé, l'historique est INDISPONIBLE.
   Comme pour BTC, la recherche peut passer en arrière-plan sur le PC (un chercheur par paire dans le Veilleur, un seul calcule à la fois) : la façade garde alors le même objet.
   Tests : window.__RAYLE_POSTE_TEST__.hotes = { SOL: hote, … } remplace tout. */
const entrees = {}, promesses = {}; const auteurs = new Set();
const CLE_ACTIF = id => 'rayle_pilote_actif_' + id.toLowerCase();
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* interdit */ } };
const diffuser = () => { for (const f of auteurs) { try { f(); } catch (e) { /* écouteur cassé */ } } };
export const surChangement = f => { auteurs.add(f); const off = surChangementBtc(f); return () => { auteurs.delete(f); off(); }; };
export const paireActive = id => (id === 'BTC' ? lireLocal('rayle_pilote_actif') === '1' : lireLocal(CLE_ACTIF(id)) === '1');
export { ORDRE_PAIRES, PAIRES };

const lireReseau = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
export const appelerPaire = id => (chemin, corps) => appelerVeilleur(chemin + (chemin.includes('?') ? '&' : '?') + 'paire=' + id, corps);

export function obtenirHotePaire(id, { demarrer = true } = {}) {
  id = String(id).toUpperCase(); if (!PAIRES[id]) return Promise.reject(new Error('paire inconnue : ' + id));
  if (id === 'BTC') return obtenirHoteBtc({ demarrer }).then(h => { if (!entrees.BTC) entrees.BTC = { facade: h }; return h; });
  if (promesses[id]) return promesses[id];
  promesses[id] = (async () => {
    const test = (window.__RAYLE_POSTE_TEST__ || {}), p = PAIRES[id];
    if (test.hotes && test.hotes[id]) { entrees[id] = { facade: test.hotes[id] }; return test.hotes[id]; }
    try { await obtenirM6(); } catch (e) { journalErreurs.ajouter('m6', e && e.message || e); }
    const stockage = test.stockage ? test.stockage : await ouvrirStockageBtc(test.indexedDB === null ? null : undefined, 'rayle-' + id.toLowerCase());
    const calculateur = test.calculateur !== undefined ? test.calculateur : (typeof Worker !== 'undefined' ? calculateurWorker(() => new Worker(new URL('../agent-btc/worker-pilote.js', import.meta.url), { type: 'module' })) : null);
    const annees = Math.min(9.17, (Date.now() - p.debutHistorique) / (365.25 * 86400e3));
    const local = creerHoteLocal({ stockage, lire: test.lire || lireReseau, calculateur, periodeMs: test.periodeMs || 60000, surChangement: diffuser, surAlerte: alerteVersRayle, surNotification: notificationVersRayle,
      annees, paire: id, sources: { binance: sourceBinance(id) }, ordreSources: ['binance'], sauvegardes: creerSauvegardes(stockage, { garder: 5 }), erreurs: journalErreurs, jugerAlerte: jugerAlerteGlobal, ...(test.hoteOptions || {}) });
    const e = entrees[id] = { local, distant: null, courant: local }; e.facade = new Proxy({}, { get: (_, k) => { const v = e.courant[k]; return typeof v === 'function' ? v.bind(e.courant) : v; } });
    if (demarrer) {
      await local.demarrer({ synchro: paireActive(id), boucleDirect: true, chercher: false });
      if (!test.sansVeilleur) { try { const j = await appelerPaire(id)('pilote'); if (j && j.ok && j.existe && j.etat.profil.arrierePlan.actif) await adopterDistant(id); } catch (x) { /* pas de Veilleur : la page cherche seule */ } }
    }
    return e.facade;
  })();
  return promesses[id];
}
async function adopterDistant(id) {
  const e = entrees[id]; if (!e.distant) e.distant = creerHoteDistant({ hoteDonnees: e.local, appeler: appelerPaire(id), surChangement: diffuser, surAlerte: alerteVersRayle, surNotification: notificationVersRayle });
  await e.distant.demarrer(); e.local.pauserRecherche(); e.courant = e.distant; diffuser();
}
/* Passe la recherche d'une paire sur le PC (actif = true) ou la ramène dans la page, sans rien perdre (basculer.js). */
export async function basculerPaire(id, actif) {
  id = String(id).toUpperCase(); if (id === 'BTC') return basculerBtc(actif);
  await obtenirHotePaire(id, { demarrer: true }); const e = entrees[id]; if (!e || !e.local) throw new Error('agent non chargé pour ' + id);
  let dispo; try { dispo = await appelerPaire(id)('pilote'); } catch (x) { dispo = null; } if (!dispo || !dispo.ok) throw new Error('Le Veilleur du PC n’est disponible que dans l’application Rayle pour Windows (le serveur local ne répond pas).');
  if (actif) { const r = await versVeilleur({ local: e.local, appeler: appelerPaire(id) }); await adopterDistant(id); return 'La recherche de ' + PAIRES[id].nom + ' tourne maintenant en arrière-plan sur le PC (' + (r.mode === 'adopte' ? 'état transmis' : 'états fusionnés') + '), à priorité basse, une paire à la fois.'; }
  await versLocal({ local: e.local, appeler: appelerPaire(id) }); if (e.distant) { e.distant.detruire(); e.distant = null; } e.courant = e.local; diffuser(); return 'La recherche de ' + PAIRES[id].nom + ' est revenue dans cette page.';
}
/* Active l'agent d'une paire : télécharge son historique (une fois) puis suit le marché ; la recherche démarre. */
export async function activerPaire(id) {
  id = String(id).toUpperCase(); if (id === 'BTC') return activerBtc();
  ecrireLocal(CLE_ACTIF(id), '1'); const h = await obtenirHotePaire(id, { demarrer: false }); const e = entrees[id]; await e.local.demarrer({ synchro: true, boucleDirect: true });
  if (!(window.__RAYLE_POSTE_TEST__ && window.__RAYLE_POSTE_TEST__.sansRecherche)) h.lancerRecherche();
  return h;
}
/* Les hôtes déjà chargés (jamais d'hôte créé juste pour regarder). */
export const hotesChargees = () => { const o = {}; for (const [id, e] of Object.entries(entrees)) if (e.facade) o[id] = e.facade; return o; };
/* Vue légère de toutes les paires pour la fenêtre : { BTC: {chargee, active, vue}, … }. */
export async function vuesDesPaires() {
  const out = {};
  for (const id of ORDRE_PAIRES) {
    const actif = paireActive(id);
    if (!actif && id !== 'BTC' && !entrees[id]) { out[id] = { id, active: false, chargee: false }; continue; }
    try { const h = await obtenirHotePaire(id, { demarrer: actif }); out[id] = { id, active: actif, chargee: true, vue: h.vue() }; } catch (e) { out[id] = { id, active: actif, chargee: false, erreur: String(e && e.message || e) }; }
  }
  return out;
}
