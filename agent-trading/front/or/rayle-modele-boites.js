/* Modèle d'affichage des boîtes de retournement, de la ligne de retournement et du bandeau d'état (pur, testé). Une description, jamais un ordre. */
import * as Z from './boites-v1.js';
import { hp, phraseCellule } from './rayle-modele-calcul.js';
const H = 3600e3, pc = x => (x == null ? '—' : Math.round(x * 100) + ' %');
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));

/* phrase de mesure d'une zone : retournement, intervalle, base, n ; « pas assez de données » sous 30 issues tranchées */
export function phraseZone(stats, z, nomFen = { long: '2015–2025', recent: '18 derniers mois' }) {
  const c = Z.probaZone(stats, z); if (!c) return ['mesure indisponible (statistiques non chargées)'];
  const L = [];
  for (const f of ['long', 'recent']) {
    const x = c[f]; if (!x || !x.nT) { L.push(`${nomFen[f]} : aucune arrivée mesurée`); continue; }
    if (x.nT < 30) { L.push(`${nomFen[f]} : pas assez de données (${x.nT} issues tranchées, il en faut 30)`); continue; }
    L.push(`${nomFen[f]} (${x.n} arrivées, ${x.nT} issues tranchées) : retournement ${pc(x.taux)} [${pc(x.ic[0])} – ${pc(x.ic[1])}] contre ${pc(x.base)} pour la base → ${x.verdict}`);
  }
  return L;
}
export function etiquetteZone(z) {
  const nom = `Zone de ${z.cote}`; if (z.proba == null) return `${nom} · pas de mesure`;
  return `${nom} · ${Math.round(z.proba * 100)} % · n = ${z.n}` + (z.n < 30 ? ' (peu de cas)' : '') + (z.qualifie === false ? ' · sous le seuil' : '');
}
/* boîtes à dessiner : sélection du jour (+ archives grisées en mode Complet) */
export function boitesAffichees(sel, { stats, tDerniere, vue = 'epure', archives = [] } = {}) {
  const L = sel.zones.map(z => {
    const e = Z.etendue(z, tDerniere);
    return { id: z.id, cote: z.cote, prix: z.prix, bas: z.bas, haut: z.haut, tDebut: e.tDebut, tFin: e.tFin, grise: false, etiquette: etiquetteZone(z), conf: z.conf, distAtr: z.distAtr,
      detail: [`${z.cote === 'vente' ? 'résistance' : 'support'} ${nb(z.bas, 2)} – ${nb(z.haut, 2)} · prix ${nb(z.prix, 2)} · à ${nb(z.distAtr, 1)} ATR du prix`, `confluence de ${z.conf} natures : ${z.natures.map(n => Z.NATURES[n]).join(', ')}`, `niveaux : ${z.niveaux.map(q => `${q.nom} ${nb(q.p, 2)}`).join(' · ')}`, `formée le ${hp(z.tFormation)} (heure de Paris), invalidée par une clôture H1 à plus de 0,25 ATR au-delà`, ...phraseZone(stats, z), z.qualifie === false ? 'affichée en mode Complet seulement : probabilité mesurée insuffisante (< 50 % ou moins de 15 cas)' : 'lecture en observation, jamais un ordre'] };
  });
  if (vue === 'complet') for (const a of archives) L.push({ ...a, grise: true, etiquette: a.etiquette ? `${a.etiquette} · terminée` : 'Zone terminée' });
  return L;
}
/* prochaine zone (la plus proche, au-dessus ou en dessous) pour le bandeau */
export function prochaineZone(sel, prix, atr) {
  const L = sel.zones.slice().sort((a, b) => a.distAtr - b.distAtr); const z = L[0]; if (!z) return null;
  const d = z.bas > prix ? z.bas - prix : z.haut < prix ? prix - z.haut : 0;
  return { cote: z.cote, prix: z.prix, distance: d, distAtr: atr ? d / atr : null };
}
const NOM_TEND = t => (t > 0 ? 'haussière' : t < 0 ? 'baissière' : 'en range');
export function mouvementEnCours(sm) {
  if (!sm || !sm.etat) return 'indisponible';
  const e = sm.etat; if (e.chochEnCours) return `changement de caractère ${e.chochEnCours.dir > 0 ? 'haussier' : 'baissier'} en cours`;
  if (e.impulsionActive) return `impulsion ${e.impulsionActive.dir < 0 ? 'baissière' : 'haussière'} contre la tendance`;
  return e.dernierBos ? `dernière cassure ${e.dernierBos.dir > 0 ? 'haussière' : 'baissière'} de structure` : 'aucun mouvement particulier';
}
/* bandeau d'état : tendance H1/H4, ligne de retournement, prochaine zone et distance, mouvement en cours */
export function bandeau({ h1, h4, ligne, sel, prix, atr }) {
  const P = [`Tendance H4 ${h4 && h4.etat ? NOM_TEND(h4.etat.tendance) : 'indisponible'} · H1 ${h1 && h1.etat ? NOM_TEND(h1.etat.tendance) : 'indisponible'}`];
  P.push(ligne ? ligne.texte : 'pas de ligne de retournement (tendance H1 en range)');
  const z = prochaineZone(sel, prix, atr); P.push(z ? `prochaine zone : ${z.cote} ${nb(z.prix, 0)} (${z.distance >= 0 ? nb(z.distance, 1) : '—'} $, ${nb(z.distAtr, 1)} ATR)` : 'prochaine zone : aucune zone forte à proximité');
  P.push(`mouvement en cours : ${mouvementEnCours(h1)}`); return P.join(' · ');
}
