import { creerHoteLocal, calculateurWorker } from '../agent-btc/hote-local.js';
import { ouvrirStockageBtc } from '../agent-btc/stockage-btc.js';
import { creerHoteDistant } from '../agent-btc/hote-distant.js';
import { versLocal, versVeilleur } from '../agent-btc/basculer.js';

/* ═════════════ LE PILOTE DE L'AGENT BTC DANS LA PAGE : un seul hôte par page, partagé par la grande fenêtre, la table et la voix (M5) ═════════════
   Données : Binance directement depuis le navigateur (secours Bitstamp), 9 ans de M15 dans IndexedDB « rayle-btc ». Recherche : Worker de navigateur (l'interface ne gèle pas).
   Telegram : par la route /telegram/envoyer du Worker Raylé (jamais de jeton ici). Traduction d'une « idée libre » : route /agent/idee du Worker, appelée à la demande, une seule fois.
   Tests : window.__RAYLE_POSTE_TEST__ = { stockage, lire, calculateur, envoyerTelegram, traduireIdee, periodeMs, hote } remplace le réseau, le disque et le Worker. */
import { creerSauvegardes } from '../agent-m6/reproductibilite.js';
import { obtenirM6, jugerAlerteGlobal } from './m6-page.js';
import { creerJournalErreurs } from '../agent-m6/sante.js';
const CLE_ACTIF = 'rayle_pilote_actif';
export const journalErreurs = creerJournalErreurs(100);           // erreurs récentes de l'agent (page « santé »)
export let sauvegardesBtc = null;
let promesse = null, local = null, distant = null, courant = null, facade = null, traduire = null; const auteurs = new Set();
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage interdit */ } };
export const piloteActif = () => lireLocal(CLE_ACTIF) === '1';
export const surChangement = f => { auteurs.add(f); return () => auteurs.delete(f); };
const diffuser = () => { for (const f of auteurs) { try { f(); } catch (e) { /* écouteur cassé */ } } };
const workerPret = () => { try { return typeof workerReady === 'function' && !!workerReady(); } catch (e) { return false; } };

/* Alerte d'entrée ou de préparation → Raylé (fenêtre holographique, entité en alerte, journal, voix pour une entrée). Le nom de la stratégie d'origine est toujours dit. */
export function alerteVersRayle(a) {
  const bus = window.RayleBus, entree = a.type === 'ENTREE';
  try { if (bus) bus.emit('raylé:alerte-prix', { actif: 'BTC · ' + (entree ? 'ENTRÉE' : 'PRÉPARATION') + ' · ' + (a.nomStrategie || ''), texte: a.texte, prix: entree ? a.entree : a.prix, t: a.t }); } catch (e) { /* fenêtre indisponible */ }
  if (entree) { try { if (window.Entite && Entite.alerte) Entite.alerte(9000); if (bus) bus.emit('raylé:alerte', { ms: 9000 }); } catch (e) { /* entité absente */ } }
  try { if (typeof addLine === 'function') addLine('sys', (entree ? '🚨 ' : '👁 ') + 'Agent Bitcoin · ' + a.texte); } catch (e) { /* journal absent */ }
  try { if (entree && typeof speak === 'function') speak('Justin, setup Bitcoin de la stratégie ' + (a.nomStrategie || '') + ' : ' + (a.sens > 0 ? 'achat' : 'vente') + ', stop et objectif calculés. Ce n’est pas un conseil.'); } catch (e) { /* voix indisponible */ }
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Raylé · Agent BTC', { body: a.texte }); } catch (e) { /* notifications refusées */ }
}
export function notificationVersRayle(n) {
  try { if (typeof addLine === 'function') addLine('sys', '🛰 Agent BTC · ' + n.titre + ' : ' + n.texte); } catch (e) { /* journal absent */ }
  try { if (window.RayleBus) window.RayleBus.emit('raylé:alerte-prix', { actif: 'BTC · AGENT', texte: n.titre + ' — ' + n.texte, prix: null, t: n.t }); } catch (e) { /* fenêtre indisponible */ }
  if (['validation', 'suspension', 'confirmation'].includes(n.type)) { try { if (typeof speak === 'function') speak(n.type === 'validation' ? 'Justin, une stratégie Bitcoin vient d’être validée par le backtest. Elle est maintenant en confirmation réelle.' : n.type === 'confirmation' ? 'Une stratégie Bitcoin est confirmée en réel.' : 'Une stratégie Bitcoin vient d’être suspendue.'); } catch (e) { /* voix indisponible */ } }
}

/* Appel d'une route locale du Veilleur (/__veilleur/<chemin>) : GET sans corps, POST JSON avec corps (l'en-tête dédié est exigé par le serveur). */
export const appelerVeilleur = async (chemin, corps) => {
  const r = await fetch('/__veilleur/' + chemin, corps !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify(corps) } : { cache: 'no-store' });
  return r.json();
};
const veilleurDispo = async () => { try { const j = await appelerVeilleur('pilote'); return j && j.ok ? j : null; } catch (e) { return null; } };
export const hoteCourant = () => (courant === distant && distant ? 'veilleur' : 'local');

export function obtenirHote({ demarrer = true } = {}) {
  if (promesse) return promesse;
  promesse = (async () => {
    const test = window.__RAYLE_POSTE_TEST__ || {};
    if (test.hote) { local = test.hote; courant = local; facade = local; if (local.surChangement) local.surChangement(diffuser); return facade; }
    const stockage = test.stockage || await ouvrirStockageBtc(test.indexedDB === null ? null : undefined);
    const lire = test.lire || (async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    const calculateur = test.calculateur !== undefined ? test.calculateur : (typeof Worker !== 'undefined' ? calculateurWorker(() => new Worker(new URL('../agent-btc/worker-pilote.js', import.meta.url), { type: 'module' })) : null);
    const envoyerTelegram = test.envoyerTelegram || (async (texte, type) => {
      if (!workerPret()) throw new Error('Worker non configuré');
      const res = await window.wfetch('/telegram/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte, type }) }, 20000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
    });
    traduire = test.traduireIdee || (async texte => {
      if (!workerPret()) throw new Error('Worker non configuré (⚙ Réglages de Raylé)');
      const res = await window.wfetch('/agent/idee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte }) }, 40000);
      if (res.status === 404) throw new Error('le Worker n’a pas encore la route /agent/idee (à déployer avec ton accord : voir docs/m5-progression.md)');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
    try { await obtenirM6(); } catch (e) { journalErreurs.ajouter('m6', e && e.message || e); }                // le compte doit exister avant les hôtes : le gardien juge leurs alertes
    const sauvegardes = creerSauvegardes(stockage, { garder: 5 });          // M6 : sauvegarde horaire de l'état du pilote, 5 gardées, restauration si l'état principal est corrompu
    local = creerHoteLocal({ stockage, lire, calculateur, periodeMs: test.periodeMs || 60000, surChangement: diffuser, surAlerte: alerteVersRayle, surNotification: notificationVersRayle, envoyerTelegram, traduireIdee: traduire, annees: 9.17, sauvegardes, erreurs: journalErreurs, jugerAlerte: jugerAlerteGlobal, ...(test.hoteOptions || {}) });
    sauvegardesBtc = sauvegardes;
    courant = local;
    facade = new Proxy({}, { get: (_, k) => { const v = courant[k]; return typeof v === 'function' ? v.bind(courant) : v; } });   // la fenêtre garde le même objet quand on passe de la page au Veilleur
    if (test.exposer) window.__hoteBtc = facade;
    if (demarrer) {
      await local.demarrer({ synchro: piloteActif() || !!test.synchro, boucleDirect: true, chercher: false });
      // Le Veilleur du PC cherche déjà en arrière-plan ? Alors la page ne fait qu'afficher et commander.
      if (!test.sansVeilleur) { const j = await veilleurDispo(); if (j && j.existe && j.etat.profil.arrierePlan.actif) await adopterDistant(); }
      try { if (window.RayleBus && window.RayleBus.on) window.RayleBus.on('mode:jeu', e => { const a = !!(e && e.actif); try { local.definirModeJeu(a); } catch (x) { /* ignoré */ } if (distant) distant.definirModeJeu(a); }); } catch (x) { /* bus absent */ }
    }
    return facade;
  })();
  return promesse;
}
async function adopterDistant() {
  if (!distant) distant = creerHoteDistant({ hoteDonnees: local, appeler: appelerVeilleur, surChangement: diffuser, surAlerte: alerteVersRayle, surNotification: notificationVersRayle, traduireIdee: traduire });
  await distant.demarrer(); local.pauserRecherche(); courant = distant; diffuser();
}
/* Passe la recherche sur le PC (actif = true) ou la ramène dans la page (actif = false), sans rien perdre (voir agent-btc/basculer.js). */
export async function basculer(actif) {
  if (!local) throw new Error('agent non chargé');
  const dispo = await veilleurDispo(); if (!dispo) throw new Error('Le Veilleur du PC n’est disponible que dans l’application Rayle pour Windows (le serveur local ne répond pas).');
  if (actif) { const r = await versVeilleur({ local, appeler: appelerVeilleur }); await adopterDistant(); return 'La recherche tourne maintenant en arrière-plan sur le PC (' + (r.mode === 'adopte' ? 'état transmis' : 'états fusionnés') + '), à priorité basse, dans les heures réglées et jamais pendant que tu joues.'; }
  await versLocal({ local, appeler: appelerVeilleur }); if (distant) { distant.detruire(); distant = null; } courant = local; diffuser(); return 'La recherche est revenue dans cette page.';
}
/* Active l'agent pour de bon : télécharge l'historique (une seule fois, ≈ 9 ans) puis suit le marché en continu ; la recherche démarre. */
export async function activerPilote() {
  ecrireLocal(CLE_ACTIF, '1'); const h = await obtenirHote({ demarrer: false }); await local.demarrer({ synchro: true, boucleDirect: true });
  if (!(window.__RAYLE_POSTE_TEST__ && window.__RAYLE_POSTE_TEST__.sansRecherche)) h.lancerRecherche();
  return h;
}
export async function demanderNotifications() { try { if ('Notification' in window && Notification.permission === 'default') return await Notification.requestPermission(); return Notification.permission; } catch (e) { return 'denied'; } }
