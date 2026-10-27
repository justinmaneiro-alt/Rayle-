import { creerAgent } from '../agent-btc/agent.js';
import { ouvrirStockageBtc } from '../agent-btc/stockage-btc.js';
import { detecterSujet, expliquer } from '../agent-btc/explications.js';

/* ═════════════ L'AGENT BTC DANS LA PAGE : un seul agent par page, partagé par la table, l'espace de travail et la voix ═════════════
   Données : Binance (data-api.binance.vision, CORS ouvert) directement depuis le navigateur, secours Bitstamp : le Worker Cloudflare n'est PAS utilisé (aucune modification du Worker).
   Les alertes réutilisent le système d'alertes de Raylé (fenêtre holographique, entité en état « alerte », journal, voix pour une ENTRÉE) et, si tu l'as autorisé, une notification du navigateur.
   L'agent ne calcule que quand l'application est ouverte : c'est la limite de la solution 100 % gratuite et 100 % locale (voir docs/agent-btc.md pour les pistes gratuites d'alerte hors ligne).
   Tests : window.__RAYLE_AGENT_TEST__ = { lire, creerWorker, criteres, periodeMs } remplace le réseau, le Worker et les critères. */
const CLE_ACTIF = 'rayle_agent_btc_actif';
let promesse = null, agent = null, auteurs = new Set();
const lireLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrireLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage interdit */ } };
export const agentActif = () => lireLocal(CLE_ACTIF) === '1';
export const surChangement = f => { auteurs.add(f); return () => auteurs.delete(f); };
let etaitEnCours = false;
const diffuser = () => {
  try {
    const s = agent && agent.instantane();
    if (s) { if (etaitEnCours && !s.recherche.enCours && s.verdict) { try { if (window.VeilleurPage && agent) VeilleurPage.pousserStrategie(agent._etat()); } catch (e) { /* veilleur absent */ } const t = 'Agent Bitcoin : ' + s.verdict.resume; try { if (typeof addLine === 'function') addLine('sys', t); if (window.RayleBus) window.RayleBus.emit('agent-btc:verdict', s.verdict); } catch (e) { /* journal absent */ } } etaitEnCours = s.recherche.enCours; }
  } catch (e) { /* instantané indisponible */ }
  for (const f of auteurs) { try { f(); } catch (e) { /* écouteur cassé */ } }
};

export function alerteVersRayle(a) {
  const bus = window.RayleBus, entree = a.type === 'ENTREE';
  const texte = (entree ? 'Agent Bitcoin : ' : 'Agent Bitcoin, préparation : ') + a.texte.replace(/^PRÉPARATION · /, '');
  try { if (bus) bus.emit('raylé:alerte-prix', { actif: 'BTC · ' + (entree ? 'ENTRÉE' : 'PRÉPARATION'), texte: a.texte, prix: entree ? a.entree : a.prix, t: a.t }); } catch (e) { /* fenêtre indisponible */ }
  if (entree) { try { if (window.Entite && Entite.alerte) Entite.alerte(9000); if (bus) bus.emit('raylé:alerte', { ms: 9000 }); } catch (e) { /* entité absente */ } }
  try { if (typeof addLine === 'function') addLine('sys', (entree ? '🚨 ' : '👁 ') + texte); } catch (e) { /* journal absent */ }
  try { if (entree && typeof speak === 'function') speak('Justin, setup Bitcoin : ' + (a.sens > 0 ? 'achat' : 'vente') + ', stop et objectif calculés. Ce n’est pas un conseil.'); } catch (e) { /* voix indisponible */ }
  try { if (agent && agent.instantane().reglages.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification('Raylé · Agent BTC', { body: texte }); } catch (e) { /* notifications refusées */ }
}

export function obtenirAgent({ demarrer = true } = {}) {
  if (promesse) return promesse;
  promesse = (async () => {
    const test = window.__RAYLE_AGENT_TEST__ || {};
    const stockage = await ouvrirStockageBtc(test.indexedDB === null ? null : undefined);
    const lire = test.lire || (async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    const creerWorker = test.creerWorker || (typeof Worker !== 'undefined' ? () => new Worker(new URL('../agent-btc/worker-recherche.js', import.meta.url), { type: 'module' }) : null);
    // M4 : téléchargement des archives zip des contrats à terme (financement, intérêt ouvert) ; le zip est décompressé par le navigateur (DecompressionStream)
    const lireOctets = test.lireOctets || (async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer()); });
    const inflater = test.inflater || (typeof DecompressionStream !== 'undefined' ? async b => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : null);
    agent = creerAgent({ stockage, lire, creerWorker, criteres: test.criteres, periodeMs: test.periodeMs || 60000, surChangement: diffuser, surAlerte: alerteVersRayle, lireOctets, inflater });
    if (test.exposer) window.__agentBtc = agent;
    if (demarrer) await agent.demarrer({ synchro: agentActif() || !!test.synchro });
    return agent;
  })();
  return promesse;
}
/* Active l'agent pour de bon (téléchargement de l'historique au premier usage, puis mise à jour continue à chaque ouverture de Rayle). */
export async function activerAgent() { ecrireLocal(CLE_ACTIF, '1'); const a = await obtenirAgent({ demarrer: false }); await a.demarrer({ synchro: true }); return a; }
export async function demanderNotifications() { try { if ('Notification' in window && Notification.permission === 'default') return await Notification.requestPermission(); return Notification.permission; } catch (e) { return 'denied'; } }

/* Voix : phrase → texte parlé, ou null si la phrase ne concerne pas l'agent. */
export function sujetDeLaPhrase(phrase) { const d = detecterSujet(phrase); return d ? d.sujet : null; }
/* M4 : « explique l'absorption », « quelle session est en cours ? », « où sont les zones de liquidité ? » (det vient de micro-concepts.js:detecterQuestionMicro). */
export async function expliquerMicroAgent(det) { const a = await obtenirAgent({ demarrer: true }); const E = await import('../agent-btc/micro-explications.js'); return E.expliquerMicro(det.sujet, det.concept, a.instantane()); }
const CLE_DERIV = 'rayle_agent_btc_deriv';
export const derivActif = () => lireLocal(CLE_DERIV) === '1';
/* Active les données de financement et d'intérêt ouvert (≈ 2 minutes au premier passage, puis mise à jour douce). */
export async function activerDeriv() { ecrireLocal(CLE_DERIV, '1'); const a = await obtenirAgent({ demarrer: true }); a.synchroniserDeriv(); return a; }
export async function expliquerAgent(sujet) { const a = await obtenirAgent({ demarrer: true }); return expliquer(sujet, a.instantane()); }
export async function lancerRechercheAgent() {
  const a = await activerAgent(), s = a.instantane();
  if (!s.donnees.n) return 'Je n’ai pas pu charger l’historique Bitcoin' + (s.donnees.erreur ? ' : ' + s.donnees.erreur : '') + '. Réessaie dans un instant.';
  if (s.recherche.enCours) return 'Une recherche est déjà en cours.';
  a.lancerRecherche({ generationsMax: 2 });
  return 'Je lance la recherche de stratégie sur ' + (s.donnees.annees ? s.donnees.annees.toFixed(1).replace('.', ',') + ' ans' : 'tout l’historique') + ' de Bitcoin. Elle tourne en arrière-plan, quelques secondes à quelques minutes, et je te dirai le verdict.';
}
