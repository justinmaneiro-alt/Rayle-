/* Dernière visite sur CET appareil : Rayle l'enregistre (battement toutes les minutes quand la page est visible) et, si tu étais absent plus de 3 heures, te propose le point à l'ouverture
   (« Tu étais absent depuis 9 heures, je te fais le point ? »). Pur (stockage injectable) + branchement navigateur. Jamais de donnée envoyée ailleurs : l'heure reste sur l'appareil. */
export const CLE_VISITE = 'rayle_point_visite_v1', SEUIL_ABSENCE_MS = 3 * 3600e3, BATTEMENT_MS = 60e3;
const defaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export function lireVisite(st = defaut()) { try { const v = JSON.parse(st.getItem(CLE_VISITE) || 'null'); return v && Number.isFinite(v.derniere) ? v : null; } catch (e) { return null; } }
export function ecrireVisite(v, st = defaut()) { try { st.setItem(CLE_VISITE, JSON.stringify(v)); return true; } catch (e) { return false; } }
/* au chargement : compare à la visite précédente ; renvoie { absenceMs, proposer } ; ne propose qu'une fois par absence */
export function evaluerVisite(visite, maintenant = Date.now(), seuil = SEUIL_ABSENCE_MS) {
  if (!visite) return { absenceMs: null, proposer: false, premiere: true };
  const absenceMs = maintenant - visite.derniere; return { absenceMs, proposer: absenceMs >= seuil && !(visite.proposeLe && visite.proposeLe >= visite.derniere), premiere: false };
}
export function enregistrerBattement(maintenant = Date.now(), st = defaut(), { proposeLe } = {}) { const v = lireVisite(st) || {}; return ecrireVisite({ ...v, derniere: maintenant, ...(proposeLe ? { proposeLe } : {}) }, st); }
export function phraseProposition(absenceMs) { const h = Math.round(absenceMs / 3600e3), t = h < 48 ? `${h} heure${h > 1 ? 's' : ''}` : `${Math.round(h / 24)} jours`; return `Tu étais absent depuis ${t}, je te fais le point ?`; }
/* branchement : `proposer({ absenceMs, phrase })` est appelé au plus une fois par absence */
export function brancherVisite({ proposer, st = defaut() } = {}) {
  if (typeof document === 'undefined' || brancherVisite.fait) return; brancherVisite.fait = true;
  const proposerSiBesoin = E => { if (E.proposer && typeof proposer === 'function') { try { proposer({ absenceMs: E.absenceMs, phrase: phraseProposition(E.absenceMs) }); enregistrerBattement(Date.now(), st, { proposeLe: Date.now() }); } catch (e) { /* facultatif */ } } };
  const v0 = lireVisite(st), E = evaluerVisite(v0); if (v0 && Date.now() - v0.derniere > 30 * 60e3) ecrireVisite({ ...v0, precedente: v0.derniere }, st);   /* nouvelle connexion : on garde l'heure de la précédente pour « depuis ma dernière connexion » */
  enregistrerBattement(Date.now(), st); setTimeout(() => proposerSiBesoin(E), 5000);
  setInterval(() => { if (!document.hidden) enregistrerBattement(Date.now(), st); }, BATTEMENT_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const R = evaluerVisite(lireVisite(st)); enregistrerBattement(Date.now(), st); proposerSiBesoin(R); } });
}
