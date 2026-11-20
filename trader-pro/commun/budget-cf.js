/* ═════════════ BUDGET GRATUIT CLOUDFLARE (v6, B1/B2) — limites, prévision, seuils d'alerte, ralentissement automatique ═════════════
   Plan gratuit : 100 000 requêtes Worker / jour ; 10 ms de CPU par exécution ; 50 sous-requêtes externes par exécution ; 5 déclencheurs planifiés pour tout le compte ;
   KV : 100 000 lectures et 1 000 écritures / jour (RAYLE N'ÉCRIT JAMAIS DANS KV) ; D1 : 5 000 000 lignes lues, 100 000 lignes écrites par jour, 5 Go.
   Objectif : rester sous 30 % de chaque limite ; à 70 % : alerte Telegram et ralentissement des rafraîchissements non essentiels (les alertes de trading restent prioritaires). Module pur. */
export const LIMITES = Object.freeze({ requetes: 100000, cpuMs: 10, sousRequetes: 50, crons: 5, kvLectures: 100000, kvEcritures: 1000, d1Lues: 5e6, d1Ecrites: 1e5 });
export const SEUIL_CIBLE = 0.3, SEUIL_ALERTE = 0.7;
/* prévision journalière : appareils actifs × interrogations par heure d'utilisation + crons */
export function budgetPrevu({ appareils = 3, heuresActivesParAppareil = 6, intervalleSync = 45, intervalleEtat = 300, passesCron = 288, d1LuesParCron = 40, d1EcritesParCron = 2, d1LuesParRequete = 2, requetesAlertesFond = 0 } = {}) {
  const sync = Math.round(appareils * heuresActivesParAppareil * 3600 / intervalleSync), etat = 0;   // l'état des données est lu sur le CDN GitHub, pas sur le Worker
  const requetes = sync + passesCron + requetesAlertesFond, d1Lues = requetes * d1LuesParRequete + passesCron * d1LuesParCron, d1Ecrites = passesCron * d1EcritesParCron + 50;
  return { requetes, kvLectures: 0, kvEcritures: 0, d1Lues, d1Ecrites, crons: 1, cpuMsParExecution: 4, sousRequetesParCron: 12, detail: { sync, passesCron, etat } };
}
/* pourcentages d'une consommation { requetes, kvLectures, kvEcritures, d1Lues, d1Ecrites, crons } */
export function pourcentages(c) {
  const p = {}; for (const k of ['requetes', 'kvLectures', 'kvEcritures', 'd1Lues', 'd1Ecrites', 'crons']) p[k] = (c[k] || 0) / LIMITES[k]; return p;
}
/* niveau : 'ok' (< 30 %), 'attention' (30–70 %), 'alerte' (≥ 70 % : prévenir et ralentir) ; `pire` = la limite la plus proche */
export function niveau(c) {
  const p = pourcentages(c); let pire = null, max = -1; for (const [k, v] of Object.entries(p)) if (v > max) { max = v; pire = k; }
  return { niveau: max >= SEUIL_ALERTE ? 'alerte' : max >= SEUIL_CIBLE ? 'attention' : 'ok', pire, pct: max, pourcentages: p };
}
/* facteur de ralentissement des rafraîchissements NON essentiels (sync, état, interrogations de fond) ; les alertes de trading ne sont jamais ralenties */
export const facteurRalentissement = n => (n.niveau === 'alerte' ? 4 : n.niveau === 'attention' ? 1.5 : 1);
export const NOMS = Object.freeze({ requetes: 'requêtes Worker', kvLectures: 'lectures KV', kvEcritures: 'écritures KV', d1Lues: 'lignes D1 lues', d1Ecrites: 'lignes D1 écrites', crons: 'déclencheurs planifiés' });
export function phraseBudget(n) { const nom = NOMS[n.pire] || n.pire; return n.niveau === 'ok' ? `Budget gratuit Cloudflare : tout va bien (la limite la plus proche, ${nom}, est à ${Math.round(n.pct * 100)} %).` : `Budget gratuit Cloudflare : ${nom} à ${Math.round(n.pct * 100)} % de la limite du jour${n.niveau === 'alerte' ? ' ; je ralentis les rafraîchissements non essentiels, les alertes de trading restent prioritaires' : ''}.`; }
/* compteur en mémoire de l'instance du Worker, vidé dans D1 par le déclencheur planifié (une écriture par passage, jamais une par requête) */
export function creerCompteur() { const c = { requetes: 0, d1Lues: 0, d1Ecrites: 0, kvLectures: 0, kvEcritures: 0 }; return { ajouter: (k, n = 1) => { if (k in c) c[k] += n; }, vider() { const r = { ...c }; for (const k of Object.keys(c)) c[k] = 0; return r; }, lire: () => ({ ...c }) }; }
export const jourUTC = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
