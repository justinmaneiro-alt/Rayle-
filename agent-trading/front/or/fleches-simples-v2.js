/* ═════════════ FLÈCHES SIMPLES v2 — « fleches-simples-v2 » (2026-11-12) : mêmes règles que fleches-simples-v1 (scellée, intacte), mais CAUSALES ═════════════
   Audit « en direct simulé » : avec les zones finales, la v1 posait des flèches rétroactives (une zone devient « majeure » ou apparaît APRÈS la bougie ; les touches comptent l'avenir).
   Ici le moteur rejoue l'historique bougie par bougie : à chaque pas, zones recalculées avec les seules bougies connues, v1 appliquée, et seule une flèche posée SUR LA DERNIÈRE bougie close est acceptée
   (indexApparition = indexDessin = bougie de confirmation, première clôture hors de la zone). Une flèche acceptée n'est jamais déplacée ni retirée. Espacement ≥ 6 bougies appliqué au fil de l'eau (une cassure MA200 est toujours gardée).
   Pur, sans DOM. Information de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import { resultat } from './fleches-terminal-v1.js';
export const VERSION = 'fleches-simples-v2', H = 3600e3, P = V1.P, TYPES = V1.TYPES, idNiveau = V1.idNiveau, fusionnerRegistre = V1.fusionnerRegistre, textesRes = V1.textesRes;
export const DEPART = 260, PLAFOND = 10, RESERVE_MA = 4, FENETRE = 600;   // au plus 10 flèches sur 600 bougies : un retournement est refusé dès 6 flèches dans la fenêtre (4 places gardées pour les cassures MA200), une cassure MA200 dès 10

/* rejeu en direct : B = bougies H1 closes ; zonesA(bougies, maintenant) → zones connues à cet instant ; depart = premier pas rejoué (bougie d'indice depart-1) ; deja = flèches déjà acceptées avant ce pas */
export function rejouer(B, zonesA, { depart = DEPART, deja = [] } = {}) {
  const acceptees = deja.slice(), vus = [];
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), r = V1.calculer(S, zonesA(S, S[n - 1].t + H), { maintenant: S[n - 1].t + H });
    for (const f of r.toutes) {
      if (f.i !== n - 1) continue;                                              // déjà vue, ou rétroactive : jamais posée après coup
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) continue;
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= (f.type === 'ma_cassure' ? PLAFOND : PLAFOND - RESERVE_MA)) continue;
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; delete g.resultat;
      acceptees.push(g); vus.push(g);
    }
  }
  return { fleches: vus, toutes: acceptees };
}
/* calcul pour l'interface : rejeu complet (premier chargement) ou seulement les nouvelles bougies (depart) ; les résultats à 6/12/24 bougies sont mesurés après coup */
export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720 } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes` };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja });
  return { fleches: r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) })), n: closes.length, raison: null, vers: closes.length };
}
export const detail = f => {
  const l = V1.detail(f);
  l.push(`Apparue le ${new Date(f.tCloture).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (clôture de la bougie de confirmation) · clôture ${Math.round(f.prix)}`, 'Arrive après le plus haut/bas : repère de lecture, pas un ordre');
  return l;
};
export const bilan = () => ({});
