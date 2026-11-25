/* Charge tout ce qu'il faut pour un point (fiches de lecture, réseau d'information, calendrier), le compose (code), puis laisse l'IA de Rayle le reformuler à l'oral (vérifié) et le range dans l'historique.
   Aucune donnée n'est inventée : source absente = le point le dit. */
import { lireFiches, lireReseau, lirePrevisions } from '../reseau/client.js';
import { creerPrevisions } from '../copilote/previsions.js';
import { lireCalendrier } from '../commun/donnees.js';
import { lireEvenements } from '../marches/calendrier.js';
import { composerPoint } from './composer.js';
import { polir } from './polir.js';
import { demanderIA } from '../commun/ia.js';

export async function construirePoint({ type = 'depuis', actif = null, depuis = null, absenceMs = null, maintenant = Date.now(), reformuler = true } = {}) {
  const [F, R, C, V] = await Promise.allSettled([lireFiches(), lireReseau(), lireCalendrier({ delai: 7000 }), lirePrevisions()]);
  const fiches = F.status === 'fulfilled' ? F.value : {}, reseau = R.status === 'fulfilled' ? R.value.donnees : null, evenements = C.status === 'fulfilled' ? lireEvenements(C.value.donnees) : [];
  const previsions = V.status === 'fulfilled' && V.value.length ? creerPrevisions(V.value) : null;   // Rayle adapte sa confiance à sa fiabilité mesurée
  const P = composerPoint({ type, fiches, actifs: actif ? [actif] : null, depuis, maintenant, reseau, evenements, absenceMs, previsions });
  P.sourcesLues = { fiches: F.status === 'fulfilled' && Object.keys(fiches).length, reseau: R.status === 'fulfilled', calendrier: C.status === 'fulfilled' };
  if (reformuler && !P.vide) { const pol = await polir(P.texteParle, P.faits, { demanderIA }); P.texteParle = pol.texte; P.redaction = pol.source; P.raisonRedaction = pol.raison; } else P.redaction = 'regles';
  return P;
}
