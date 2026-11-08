/* ═════════════ TERMINAL : RÈGLES DES ALERTES (pur, testé) ═════════════
   Anti-doublon et délai minimum (alertes-terminal-v1) ; textes des alertes. Information de lecture, pas un signal ni une promesse. */
import { REGLES_TERMINAL } from './regles-terminal.js';
export const MENTION = 'Information de lecture, pas un signal ni une promesse.';
export const MENTION_OUVERT = 'Les alertes fonctionnent tant que Rayle est ouvert.';
export const TEXTES = Object.freeze({ approche: 'approche', touche: 'touche', rebond: 'rebond confirmé', cassure: 'cassure confirmée', alerte: 'prix atteint', entree: 'entrée touchée', stop: 'stop touché', objectif: 'objectif atteint', plus1R: '+1 R atteint', annonce: 'annonce économique' });
export const IMPORTANTS = Object.freeze(['touche', 'rebond', 'cassure', 'alerte', 'stop', 'objectif', 'plus1R', 'annonce']);

/* une alerte est-elle admise ? jamais deux identiques (même objet, même type, même bougie) ; au plus une du même type pour le même objet
   toutes les 30 minutes ; seulement si l'événement est RÉCENT (la bougie s'est close il y a moins de 2 bougies + 2 min) : un événement survenu
   Rayle fermé va au registre, sans alerte */
export function admettre(historique, ev, { maintenant = Date.now(), ms = 3600e3, R = REGLES_TERMINAL } = {}) {
  if (historique.some(h => h.id === ev.id)) return { ok: false, raison: 'doublon' };
  const fin = ev.tFin != null ? ev.tFin : ev.t + ms;
  if (maintenant - fin > 2 * ms + 120e3) return { ok: false, raison: 'ancien' };
  const dernier = historique.filter(h => h.objet === ev.objet && h.type === ev.type).reduce((m, h) => Math.max(m, h.recu || 0), 0);
  if (dernier && maintenant - dernier < R.delaiAlerteMin * 60e3) return { ok: false, raison: 'délai' };
  return { ok: true };
}
export function texteAlerte(ev, { nomActif = '', nomObjet = '', fmt = x => String(x) } = {}) {
  const sens = ev.type === 'rebond' ? (ev.sens === 'hausse' ? ' (vers le haut, sur support)' : ' (vers le bas, sur résistance)') : ev.type === 'cassure' ? (ev.sens === 'hausse' ? ' (vers le haut : l’objet devient support)' : ' (vers le bas : l’objet devient résistance)') : '';
  return `${nomActif} ${ev.unite || ''} · ${TEXTES[ev.type] || ev.type}${sens} · ${nomObjet}${ev.niveau != null ? ' ' + fmt(ev.niveau) : ''} · prix ${fmt(ev.prix)}`.replace(/\s+/g, ' ').trim();
}
/* phrase courte pour la voix de Rayle */
export function phraseAlerte(ev, { nomActif = '', fmt = x => String(x) } = {}) {
  const n = ev.niveau != null ? fmt(ev.niveau) : fmt(ev.prix);
  const P = { approche: `${nomActif} approche ${n}.`, touche: `${nomActif} touche ${n}.`, rebond: `${nomActif} rebondit sur ${n}, rebond confirmé ${ev.sens === 'hausse' ? 'vers le haut' : 'vers le bas'}.`, cassure: `${nomActif} casse ${n}, cassure confirmée.`, alerte: `${nomActif} atteint ${n}.`, entree: `Entrée touchée sur ${nomActif}.`, stop: `Stop touché sur ${nomActif}.`, objectif: `Objectif atteint sur ${nomActif}.`, plus1R: `${nomActif} : plus un R atteint. Tu peux passer le stop à l’entrée.`, annonce: ev.texte || 'Annonce économique bientôt.' };
  return P[ev.type] || '';
}
