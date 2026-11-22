/* ═════════════ COT (CFTC) : index 0-100, variation hebdomadaire, lecture en clair ═════════════
   Entrée : le JSON publié par le robot (cot-<ACTIF>.json) { nomSpec, nomComm, serie: [{ date, oi, spec: { long, court, net }, comm: {…} }] }.
   La CFTC publie le vendredi les positions du mardi précédent : la date affichée est celle du MARDI (jour de mesure). Rien n'est estimé. */

export const FENETRE_INDEX = 156;   // 3 ans de semaines
export const ZONE_HAUTE = 80, ZONE_BASSE = 20;

/* COT Index = position nette rapportée à son plus bas / plus haut sur 3 ans (0 = plus vendeur, 100 = plus acheteur) ; null tant que < 52 semaines d'historique */
export function indexCot(valeurs, fenetre = FENETRE_INDEX) {
  return valeurs.map((v, i) => {
    const w = valeurs.slice(Math.max(0, i - fenetre + 1), i + 1); if (w.length < 52) return null;
    const mn = Math.min(...w), mx = Math.max(...w); return mx === mn ? 50 : Math.round((v - mn) / (mx - mn) * 1000) / 10;
  });
}
export function analyserCot(d) {
  const S = d && Array.isArray(d.serie) ? d.serie.filter(x => x && x.date && x.spec && x.comm) : []; if (S.length < 8) return null;
  const spec = S.map(x => x.spec.net), comm = S.map(x => x.comm.net), oi = S.map(x => x.oi);
  const iSpec = indexCot(spec), iComm = indexCot(comm), n = S.length - 1;
  const var1 = (a, i) => (i > 0 ? a[i] - a[i - 1] : null);
  const barres = S.map((x, i) => ({ date: x.date, spec: var1(spec, i), comm: var1(comm, i), oi: var1(oi, i) }));
  const ext = v => (v == null ? null : v >= ZONE_HAUTE ? 'haut' : v <= ZONE_BASSE ? 'bas' : null);
  return {
    inst: d.inst, libelle: d.libelle || d.inst, nomSpec: d.nomSpec || 'Spéculateurs', nomComm: d.nomComm || 'Commerciaux', source: d.source || 'CFTC',
    dates: S.map(x => x.date), spec, comm, oi, indexSpec: iSpec, indexComm: iComm, barres,
    dernier: { date: S[n].date, spec: spec[n], comm: comm[n], oi: oi[n], indexSpec: iSpec[n], indexComm: iComm[n], varSpec: var1(spec, n), varComm: var1(comm, n), varOi: var1(oi, n), extremeSpec: ext(iSpec[n]), extremeComm: ext(iComm[n]) }
  };
}
export const dateFr = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : d);
const dec1 = v => String(v).replace('.', ',');
const fr = v => (v == null ? '—' : Math.round(v).toLocaleString('fr-FR').replace(/[  ]/g, ' '));
const signe = v => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('fr-FR').replace(/[  ]/g, ' '));
/* Phrase de lecture : décrit ce que montrent les positions, jamais une prévision ni un conseil */
export function lectureCot(a, nomActif = null) {
  if (!a) return 'Pas assez de données COT pour une lecture.';
  const d = a.dernier, nom = nomActif || a.libelle, P = [];
  const idx = d.indexSpec;
  if (idx == null) P.push(`Positions du ${dateFr(d.date)} : ${a.nomSpec.toLowerCase()} nets à ${signe(d.spec)} contrats ; l’historique est trop court (moins d’un an) pour situer cette position.`);
  else if (d.extremeSpec === 'haut') P.push(`Les ${a.nomSpec.toLowerCase()} sont à un extrême acheteur sur ${nom} (COT Index ${dec1(idx)} sur 100, plus haut ou presque sur 3 ans) : la position est déjà très chargée côté acheteur, ce qui laisse moins de marge aux nouveaux acheteurs et rend un retournement plus brutal s’il survient.`);
  else if (d.extremeSpec === 'bas') P.push(`Les ${a.nomSpec.toLowerCase()} sont à un extrême vendeur sur ${nom} (COT Index ${dec1(idx)} sur 100, plus bas ou presque sur 3 ans) : la position vendeuse est très chargée, ce qui peut alimenter un rebond violent si le marché se retourne.`);
  else P.push(`Les ${a.nomSpec.toLowerCase()} ne sont pas à un extrême sur ${nom} (COT Index ${dec1(idx)} sur 100) : la position nette est ${idx >= 55 ? 'plutôt acheteuse' : idx <= 45 ? 'plutôt vendeuse' : 'proche du milieu de sa fourchette de 3 ans'}.`);
  if (d.varSpec != null && d.varSpec !== 0) P.push(`Sur la semaine, ils ont ${d.varSpec > 0 ? 'ajouté' : 'retiré'} ${signe(d.varSpec).replace(/^[+−]/, '')} contrats nets.`);
  if (d.extremeComm === 'haut' || d.extremeComm === 'bas') P.push(`Les ${a.nomComm.toLowerCase()} sont aussi à un extrême ${d.extremeComm === 'haut' ? 'acheteur' : 'vendeur'} (COT Index ${dec1(d.indexComm)}).`);
  P.push(`Mesure du ${dateFr(d.date)} (publiée le vendredi suivant). Lecture descriptive, pas un signal.`);
  return P.join(' ');
}
export { fr as formatContrats, signe as formatVariation };
