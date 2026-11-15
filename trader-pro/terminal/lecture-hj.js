/* ═════════════ LECTURE H4 / JOUR d'un actif (module PUR, testé) : biais, MA200 H4 et J, niveaux forts, signaux, contacts ═════════════
   Entrée : les séries de l'instantané « pro » { j, h4, prix, tPrix } (bougies { t, o, h, l, c }). Aucune bougie en cours n'est utilisée : seules les bougies CLÔTURÉES comptent (la dernière est écartée
   si elle n'est pas terminée). Le terminal et le robot d'alertes utilisent exactement ce code. */
import { serieSma, projeter, niveauxCles, fusionnerNiveaux, atr, dernier } from '../commun/analyse.js';
import { signaux, simuler, statistiques } from './signaux-hj.js';

const H = 3600e3, J = 86400e3, PAS = { H4: 4 * H, J };
export const clotures = (B, pas, maintenant) => B.filter(b => b.t + pas <= maintenant);
const arrondi = (v, d = 2) => (v == null ? null : +v.toFixed(d));

export function lireHJ(d, { maintenant = Date.now(), jours = 90 } = {}) {
  const j = clotures(d.j || [], J, maintenant), h4 = clotures(d.h4 || [], 4 * H, maintenant);
  if (j.length < 215 || h4.length < 60) return { ok: false, raison: 'pas assez de bougies clôturées (' + j.length + ' jours, ' + h4.length + ' H4) : au moins 215 jours et 60 bougies H4 sont nécessaires' };
  const maJ = serieSma(j, 200), ma4 = serieSma(h4, 200), cJ = j[j.length - 1].c, mJ = maJ[maJ.length - 1].v, pente = maJ.length > 10 ? mJ - maJ[maJ.length - 11].v : 0, haut = cJ > mJ;
  const biais = haut && pente >= 0 ? 1 : (!haut && pente <= 0 ? -1 : 0);
  const aJ = dernier(atr(j, 14)), a4 = dernier(atr(h4, 14)), prix = Number.isFinite(d.prix) ? d.prix : h4[h4.length - 1].c;
  /* niveaux les plus forts : Jour d'abord, puis H4, fusionnés (au moins 1 ATR H4 d'écart), 3 au plus de chaque côté du prix, étiquettes jamais superposées */
  const nJ = niveauxCles(j, { max: 3, fenetre: 300 }), n4 = niveauxCles(h4, { max: 3, fenetre: 300 }), sep = a4 || aJ || 1;
  const marque = (L, src) => L.map(x => ({ prix: x.prix, touches: x.touches, src }));
  const tous = fusionnerNiveaux([marque([...nJ.resistances, ...nJ.supports], 'J'), marque([...n4.resistances, ...n4.supports], 'H4')], sep);
  const R = tous.filter(x => x.prix > prix).sort((a, b) => a.prix - b.prix).slice(0, 3).map((x, i) => ({ ...x, nom: 'R' + (i + 1), cote: 'R' })), S = tous.filter(x => x.prix <= prix).sort((a, b) => b.prix - a.prix).slice(0, 3).map((x, i) => ({ ...x, nom: 'S' + (i + 1), cote: 'S' }));
  /* signaux : seulement sur bougies clôturées, jamais redessinés ; on garde ceux des `jours` derniers jours */
  const sJ = signaux(j, j, 'J'), s4 = signaux(h4, j, 'H4'), depuis = maintenant - jours * J;
  const liste = [...sJ, ...s4].filter(s => s.tCloture >= depuis).sort((a, b) => b.tCloture - a.tCloture);
  /* contacts : le prix est à moins de 0,3 ATR H4 d'une MA200 ou d'un niveau Jour fort */
  const contacts = []; const tol = 0.3 * (a4 || 0);
  const m4 = ma4.length ? ma4[ma4.length - 1].v : null;
  if (tol) { if (Math.abs(prix - mJ) <= tol) contacts.push({ type: 'MA200 J', prix: arrondi(mJ) }); if (m4 != null && Math.abs(prix - m4) <= tol) contacts.push({ type: 'MA200 H4', prix: arrondi(m4) }); for (const x of marque([...nJ.resistances, ...nJ.supports], 'J')) if (Math.abs(prix - x.prix) <= tol) contacts.push({ type: (x.prix > prix ? 'résistance' : 'support') + ' Jour', prix: arrondi(x.prix) }); }
  return { ok: true, prix, tPrix: d.tPrix || null, biais, biaisTexte: biais === 1 ? 'acheteur' : biais === -1 ? 'vendeur' : 'neutre (le prix et la pente de la MA200 J se contredisent : aucun signal)', ma200J: arrondi(mJ), ma200H4: arrondi(m4), distanceMaJ: arrondi((prix / mJ - 1) * 100, 2), penteMaJ: arrondi(pente), atrJ: arrondi(aJ), atrH4: arrondi(a4),
    ma: { j: maJ, h4: ma4 }, niveaux: [...R, ...S], signaux: liste, contacts, derniereJ: j[j.length - 1].t, derniereH4: h4[h4.length - 1].t };
}
/* projette les MA sur les bougies affichées (terminal, toutes unités de temps) sans regarder le futur */
export const projeterMA = (L, B) => ({ j: projeter(L.ma.j, J, B), h4: projeter(L.ma.h4, 4 * H, B) });

/* backtest des 5 dernières années pour CET actif, en R, avec la même simulation que le rapport (sans coûts : valeur indicative affichée à côté du rapport complet) */
export function bilanRapide(d, tf = 'J', { cout = 0 } = {}) {
  const j = clotures(d.j || [], J, Date.now()), B = tf === 'J' ? j : clotures(d.h4 || [], 4 * H, Date.now()); if (j.length < 215 || B.length < 60) return null;
  return statistiques(simuler(B, signaux(B, j, tf), { cout }));
}
/* identifiants des signaux déjà vus : « actif|tf|tCloture|dir » */
export const idSignal = (actif, s) => `${actif}|${s.tf}|${s.tCloture}|${s.dir}`;
