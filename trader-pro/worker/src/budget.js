/* ═════════════ BUDGET DU JOUR (v6, B1/B2) — compteurs du Worker, vidés dans D1 UNE FOIS par passage du déclencheur planifié (jamais une écriture par requête) ═════════════
   Les compteurs vivent en mémoire de l'instance : si Cloudflare recycle l'instance entre deux passages, quelques requêtes ne sont pas comptées (la mesure sous-estime légèrement ; la page État des données le dit).
   À 70 % d'une limite : un message Telegram (une fois par jour et par limite) et un facteur de ralentissement renvoyé aux appareils (`ralentir`). Les alertes de trading ne sont jamais ralenties. */
import { creerCompteur, niveau, phraseBudget, facteurRalentissement, jourUTC, LIMITES, NOMS } from '../../commun/budget-cf.js';

export const compteur = creerCompteur();
let facteur = 1;   // facteur de ralentissement connu de cette instance (mis à jour à chaque passage du cron) : renvoyé aux appareils dans l'en-tête X-Rayle-Ralentir
export const facteurActuel = () => facteur;
/* enveloppe un dépôt D1 pour compter les lignes lues / écrites (estimation : 1 ligne par lecture clé-valeur, n lignes par écriture de lots) */
export function compterDepot(depot, cpt = compteur) {
  return new Proxy(depot, { get(cible, nom) {
    const f = cible[nom]; if (typeof f !== 'function') return f;
    return async (...a) => { const r = await f.apply(cible, a);
      if (nom === 'kvLire' || nom === 'revision' || nom === 'compter') cpt.ajouter('d1Lues', 1);
      else if (nom === 'lireDepuis') cpt.ajouter('d1Lues', Array.isArray(r) ? r.length : 1);
      else if (nom === 'kvEcrire' || nom === 'prochaineRevision') cpt.ajouter('d1Ecrites', 1);
      else if (nom === 'ecrireLignes') cpt.ajouter('d1Ecrites', Number(r) || 0);
      return r; }; } });
}
const VIDE = (t = Date.now()) => ({ jour: jourUTC(t), requetes: 0, d1Lues: 0, d1Ecrites: 0, kvLectures: 0, kvEcritures: 0, crons: 1, alertes: {} });
/* vide les compteurs dans D1 ; renvoie l'état du jour et le niveau */
export async function viderBudget(depot, cpt = compteur, maintenant = Date.now()) {
  let b = (await depot.kvLire('budget')) || VIDE(maintenant); if (b.jour !== jourUTC(maintenant)) b = VIDE(maintenant);
  const c = cpt.vider(); b.requetes += c.requetes + 1; b.d1Lues += c.d1Lues + 2; b.d1Ecrites += c.d1Ecrites + 1; b.kvLectures += c.kvLectures; b.kvEcritures += c.kvEcritures; b.crons = 1;   // +1 : ce passage du cron
  await depot.kvEcrire('budget', b); const n = niveau(b); facteur = facteurRalentissement(n); return { budget: b, niveau: n };
}
/* alerte Telegram à 70 % (une par jour et par limite) */
export async function alerterBudget(env, depot, b, n, fetchFn = fetch) {
  if (n.niveau !== 'alerte' || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || (b.alertes && b.alertes[n.pire])) return false;
  const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: '⚠️ Rayle : ' + phraseBudget(n) + ' (limites gratuites de Cloudflare). Lecture seule, aucun ordre.' }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) return false; b.alertes = { ...(b.alertes || {}), [n.pire]: true }; await depot.kvEcrire('budget', b); return true;
}
/* réponse de GET /budget : consommation du jour + niveau + facteur de ralentissement conseillé aux appareils */
export async function repondreBudget(depot, cpt = compteur, maintenant = Date.now()) {
  let b = (await depot.kvLire('budget')) || VIDE(maintenant); if (b.jour !== jourUTC(maintenant)) b = VIDE(maintenant); const c = cpt.lire();
  const conso = { ...b, requetes: b.requetes + c.requetes, d1Lues: b.d1Lues + c.d1Lues, d1Ecrites: b.d1Ecrites + c.d1Ecrites }, n = niveau(conso);
  return { jour: b.jour, conso, niveau: n.niveau, pire: n.pire, pct: n.pct, ralentir: facteurRalentissement(n), limites: LIMITES, texte: phraseBudget(n), mesure: 'estimation : compteurs en mémoire vidés dans D1 à chaque passage du déclencheur (5 min)' };
}
