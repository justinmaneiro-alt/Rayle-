/* Zones H1 dessinées, calculées par la MÊME chaîne que graphique-or.js, à partir des seules bougies données (flux en direct : jamais d'information future). Pur, sans DOM. */
import { niveauxPeriode } from './niveaux-periode.js';
import { selectionV6 } from './fleches-h1-v6.js';
import { zonesAffichage, atrH1 } from './zones-affichage-v1.js';
import { normaliserZones } from './zones-fines-v1.js';
const H = 3600e3;
export function zonesDirect(serie, maintenant) {
  const C = serie.filter(b => b.t + H <= maintenant); if (C.length < 40) return [];
  const N = niveauxPeriode(C, { periode: 'H1', maintenant }), ref = C[C.length - 1].c, bandes = selectionV6(N, ref, C.slice(-1600)), A = atrH1(C);
  const sr = bandes.map(b => ({ id: 'sr' + Math.round(b.p * 100), kind: 'sr', bas: b.bas, haut: b.haut, p: b.p, nom: b.texte, detail: b.detail, fort: !!b.fort, tDebut: b.tDerniere, touches: b.touches }));
  const aff = zonesAffichage(C, sr, { prix: ref, a: A }), N2 = L => normaliserZones(L, A);
  return [...N2(aff.actives), ...N2(aff.traces)].map(z => ({ id: z.id, cote: z.cote, bas: z.bas, haut: z.haut, tDebut: z.tDebut, tFin: z.tFin, nom: z.nom || (z.elements && z.elements[0].nom), force: (z.elements || [z]).reduce((s, e) => s + (e.touches || 1), 0), retournee: z.retournee, actif: z.actif }));
}
