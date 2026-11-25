/* ═════════════ ALERTES VOCALES DU RÉSEAU D'INFORMATION : Rayle annonce à la voix les infos de score ≥ seuil (passe dans les lunettes via le téléphone) ═════════════
   Le Worker envoie déjà le même message par Telegram (PC éteint ou non). Ici, seulement la voix, quand l'appli est ouverte : une phrase par alerte, jamais un ordre.
   Règles : seuil réglable (80 par défaut) ; une alerte par fil toutes les 30 min sauf REVIREMENT (déjà appliqué par le serveur) ; mode nuit réglable (pas de voix, Telegram seulement) ; au plus 2 phrases d'un coup.
   Au premier lancement, rien n'est rattrapé : les alertes manquées se retrouvent dans le point « Ce que tu as raté ». Module pur + branchement navigateur. */
import { lireAlertes, lireReglages, modeNuit, CLE_VU } from './client.js';
import { lireConn } from '../terminal/dessins-stockage.js';

/* alertes à dire maintenant : plus récentes que la dernière vue, assez importantes, pas trop vieilles */
export function alertesADire(etat, { vuT = 0, reglages, maintenant = Date.now(), maxAgeMs = 25 * 60e3, max = 2 } = {}) {
  const L = (etat && etat.alertes ? etat.alertes : []).filter(a => a.t > vuT).sort((a, b) => a.t - b.t), nouvelleVue = L.length ? Math.max(vuT, ...L.map(a => a.t)) : vuT;
  const dire = L.filter(a => (a.revirement || a.score >= reglages.seuilVoix) && maintenant - a.t <= maxAgeMs);
  const silence = !reglages.voix || modeNuit(reglages, maintenant);
  return { aDire: silence ? [] : dire.slice(-max), manquees: silence ? dire.length : Math.max(0, dire.length - max), nouvelleVue, silence };
}
export function brancherAlertesReseau({ parler = t => (typeof window.speak === 'function' ? window.speak(t) : null), intervalle = 60000 } = {}) {
  if (typeof document === 'undefined' || brancherAlertesReseau.fait) return; brancherAlertesReseau.fait = true;
  const lireVu = () => { try { return JSON.parse(localStorage.getItem(CLE_VU) || 'null'); } catch (e) { return null; } }, ecrireVu = t => { try { localStorage.setItem(CLE_VU, JSON.stringify(t)); } catch (e) { /* plein */ } };
  let enCours = false;
  const passe = async () => {
    if (enCours || document.hidden) return; enCours = true;
    try {
      const conn = lireConn(); if (!conn && Date.now() - (passe.derniere || 0) < 5 * 60e3) return; passe.derniere = Date.now();   // sans Worker : l'état publié ne change que toutes les 5 minutes
      const r = await lireAlertes({ conn }), E = { alertes: r.alertes }, vu = lireVu(), maintenant = Date.now();
      if (vu == null) { ecrireVu(Math.max(maintenant, ...((E.alertes || []).map(a => a.t)))); return; }   // premier lancement : on ne rattrape rien
      const R = alertesADire(E, { vuT: vu, reglages: lireReglages(), maintenant }); ecrireVu(R.nouvelleVue);
      for (const a of R.aDire) parler(a.texte);
    } catch (e) { /* hors ligne : réessai à la prochaine minute */ } finally { enCours = false; }
  };
  setInterval(passe, intervalle); document.addEventListener('visibilitychange', () => { if (!document.hidden) passe(); }); setTimeout(passe, 8000);
}
