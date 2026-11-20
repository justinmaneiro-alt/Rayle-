/* ═════════════ NIVEAUX HISTORIQUES MAJEURS (module PUR, testé) — v4 ═════════════
   À partir des bougies JOURNALIÈRES (idéalement 10 ans et plus) :
     · plus haut historique (de la série affichée) ;
     · plus hauts et plus bas ANNUELS des années entières récentes et de l'année en cours ;
     · zones où le prix a réagi plusieurs fois sur 10 ans (pivots de 5 jours regroupés à moins de 0,6 ATR(14) Daily, au moins 3 réactions).
   Pour ne pas encombrer le graphique : seuls les niveaux à moins de `portee` (25 % par défaut) du prix sont gardés, deux niveaux à moins de 0,5 ATR sont fusionnés (le plus important gagne),
   et au plus `max` niveaux sont rendus. Lecture seule : ce ne sont pas des signaux. Chaque niveau : { prix, etiquette, type, force, an? }. */
import { atr, dernier, pivots } from '../commun/analyse.js';

const nombreFr = (x, dec = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[  ]/g, ' ');
const decimales = p => (p >= 1000 ? 0 : p >= 100 ? 1 : p >= 10 ? 2 : 4);
export function niveauxHistoriques(J, { portee = 0.25, max = 8, anneesAnnuels = 6, zonesAns = 10, maintenant = Date.now(), echelle = 1 } = {}) {
  if (!J || J.length < 250) return { niveaux: [], raison: 'moins d’un an de bougies journalières' };
  const px = J[J.length - 1].c, a = dernier(atr(J, 14)); if (!(a > 0) || !(px > 0)) return { niveaux: [], raison: 'ATR indisponible' };
  const dec = decimales(px), fmt = p => nombreFr(p, dec), anCourante = new Date(maintenant).getUTCFullYear(), candidats = [];
  /* plus haut historique de la série */
  let iMax = 0; for (let i = 1; i < J.length; i++) if (J[i].h >= J[iMax].h) iMax = i;
  candidats.push({ prix: J[iMax].h, type: 'ath', force: 100, etiquette: `Plus haut ${new Date(J[iMax].t).getUTCFullYear() === anCourante ? 'historique' : 'historique ' + new Date(J[iMax].t).getUTCFullYear()} · ${fmt(J[iMax].h)}`, an: new Date(J[iMax].t).getUTCFullYear() });
  /* extrêmes annuels */
  const parAn = new Map(); for (const b of J) { const an = new Date(b.t).getUTCFullYear(), e = parAn.get(an) || { h: -Infinity, l: Infinity }; e.h = Math.max(e.h, b.h); e.l = Math.min(e.l, b.l); parAn.set(an, e); }
  for (const [an, e] of parAn) {
    if (an < anCourante - anneesAnnuels) continue; const recence = 1 - (anCourante - an) / (anneesAnnuels + 1);
    candidats.push({ prix: e.h, type: 'haut-annuel', force: 40 + 20 * recence, etiquette: `Plus haut ${an} · ${fmt(e.h)}`, an }, { prix: e.l, type: 'bas-annuel', force: 40 + 20 * recence, etiquette: `Plus bas ${an} · ${fmt(e.l)}`, an });
  }
  /* zones de réaction répétée sur `zonesAns` ans */
  const X = J.slice(-Math.round(zonesAns * 252)), P = pivots(X, 5).sort((p, q) => p.prix - q.prix), groupes = [];
  for (const p of P) { const g = groupes[groupes.length - 1]; if (g && p.prix - g.max <= 0.6 * a) { g.pts.push(p); g.max = p.prix; } else groupes.push({ pts: [p], max: p.prix }); }
  for (const g of groupes) { if (g.pts.length < 3) continue; const prix = g.pts.reduce((s, p) => s + p.prix, 0) / g.pts.length; candidats.push({ prix, type: 'zone', touches: g.pts.length, force: 30 + 6 * g.pts.length, etiquette: `Zone ${fmt(prix)} · ${g.pts.length} réactions` }); }
  /* proximité, fusion, plafond */
  const proches = candidats.filter(c => Math.abs(c.prix / px - 1) <= portee).sort((x, y) => y.force - x.force), garde = [];
  for (const c of proches) { if (garde.length >= max) break; if (garde.every(g => Math.abs(g.prix - c.prix) >= 0.5 * a)) garde.push(c); }
  /* `echelle` : le Terminal affiche les devises ×10 000 (instruments.js) ; les bougies reçues sont brutes, les prix rendus sont ceux du graphique, les étiquettes restent en prix brut */
  return { niveaux: garde.sort((x, y) => y.prix - x.prix).map(n => ({ ...n, prix: n.prix * echelle })), atr: a, raison: garde.length ? null : 'aucun niveau historique à moins de ' + Math.round(portee * 100) + ' % du prix' };
}
