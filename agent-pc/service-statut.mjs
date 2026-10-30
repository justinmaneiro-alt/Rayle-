// STATUT CLAIR DU SERVICE KEPLER (V12, phase 6) : en marche ou arrêté, depuis quand, dernière bougie traitée, positions suivies, et UNE étape pour le redémarrer. Pur (testé : galaxie/tests/trader-service-test.mjs).
const dureeTexte = ms => { if (!(ms >= 0)) return 'un moment'; const m = Math.round(ms / 60000); if (m < 2) return 'moins de 2 minutes'; if (m < 120) return m + ' minutes'; const h = Math.round(m / 60); if (h < 48) return h + ' heures'; return Math.round(h / 24) + ' jours'; };
export const COMMANDE_REDEMARRAGE = 'node agent-pc/service.mjs   (ou double-clic sur agent-pc/RayleAgent.vbs)';
export const SEUIL_VIVANT = 120000;
/* info : contenu de service.json ; pidVivant : le processus existe-t-il ? */
export function statutService(info, pidVivant, maintenant = Date.now()) {
  if (!info) return { enMarche: false, phraseCourte: 'Le service Kepler n’a jamais été démarré sur ce PC.', phrase: 'Le service Kepler n’a jamais été démarré sur ce PC. Pour le lancer (une seule étape) : ' + COMMANDE_REDEMARRAGE + '.', depuis: null, arretDepuis: null, commande: COMMANDE_REDEMARRAGE };
  const age = maintenant - (info.vivantLe || 0), enMarche = !!pidVivant && age < SEUIL_VIVANT;
  const bougies = info.trader && info.trader.derniereBougie ? Object.entries(info.trader.derniereBougie).map(([a, t]) => a + ' ' + new Date(t).toISOString().slice(5, 16).replace('T', ' ') + ' UTC').join(' · ') : null;
  if (enMarche) return { enMarche: true, phraseCourte: 'Le service Kepler est en marche depuis ' + dureeTexte(maintenant - info.demarreLe) + '.', phrase: 'Le service Kepler est en marche depuis ' + dureeTexte(maintenant - info.demarreLe) + (bougies ? ' · dernière bougie traitée : ' + bougies : '') + (info.trader ? ' · ' + info.trader.suivies + ' position(s) suivie(s)' : '') + '.', depuis: info.demarreLe, arretDepuis: null, derniereBougie: bougies, positionsSuivies: info.trader ? info.trader.suivies : null };
  return { enMarche: false, phraseCourte: 'Le service est arrêté depuis ' + dureeTexte(age) + '.', phrase: 'Le service est arrêté depuis ' + dureeTexte(age) + ' (dernier battement : ' + new Date(info.vivantLe).toISOString().slice(0, 16).replace('T', ' ') + ' UTC). Redémarre-le avec : ' + COMMANDE_REDEMARRAGE + ' — une seule étape ; les positions suivies reprennent là où elles s’étaient arrêtées.', depuis: info.demarreLe, arretDepuis: info.vivantLe, derniereBougie: bougies, positionsSuivies: info.trader ? info.trader.suivies : null, commande: COMMANDE_REDEMARRAGE };
}

/* Verrou périmé (V13) : un PID encore vivant ne suffit pas, Windows réattribue les anciens numéros (ex. svchost). Le verrou n'est respecté que si le PID est vivant ET que service.json (écrit par le
   service Kepler à chaque battement) porte ce même PID avec un battement récent, ou si le verrou vient d'être écrit (démarrage en cours). Pur, testé : galaxie/tests/verrou-test.mjs. */
export const GRACE_VERROU = 60000;
export function verrouRespecte({ pidVerrou, pidVivant, pidCourant, info, ageVerrou, maintenant = Date.now() }) {
  if (!pidVerrou || pidVerrou === pidCourant || !pidVivant) return { respecte: false, raison: 'pas de verrou actif' };
  const battementRecent = !!(info && info.pid === pidVerrou && maintenant - (info.vivantLe || 0) < SEUIL_VIVANT);
  if (battementRecent) return { respecte: true, raison: 'le service Kepler tourne (battement récent)' };
  if (ageVerrou != null && ageVerrou < GRACE_VERROU) return { respecte: true, raison: 'démarrage d’un autre service en cours' };
  return { respecte: false, raison: 'verrou périmé : le PID ' + pidVerrou + ' n’est pas le service Kepler (numéro réutilisé par Windows)' };
}
