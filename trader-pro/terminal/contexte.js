/* ═════════════ CONTEXTE D'UNE FLÈCHE ET AIDES À LA DÉCISION DU GRAPHIQUE (module PUR, testé) ═════════════
   Le contexte n'EMPÊCHE jamais une flèche : il s'ajoute à son libellé (« au-dessus de la MA200 », « alignement Daily / H4 », « contre-tendance », « pendant annonce »). */

/* A : { H4: analyse MA200 H4, J: analyse MA200 Jour } (voir fleches-registre.analyseDe) ; renvoie la tendance connue à l'instant t (ms) pour l'unité */
export function tendanceA(Au, t) {
  if (!Au || !Au.sens || !Au.sens.length) return null;
  let r = null; for (const s of Au.sens) { if (s.tFin <= t) r = s.sens; else break; } return r;
}
/* valeur de la MA200 de l'unité connue à l'instant t */
export function ma200A(Au, t) {
  if (!Au || !Au.B || !Au.M) return null; const pas = Au.unite === 'J' ? 86400e3 : 4 * 3600e3; let r = null; for (let i = 0; i < Au.B.length; i++) { if (Au.B[i].t + pas <= t) r = Au.M[i]; else break; } return r;
}
/* ev : { dir, entree, tFin, unite } ; Pour H1 et H4 on utilise la MA200 H4, pour Jour la MA200 Jour (comme les flèches MA200) */
export function contexteEvenement(A, ev) {
  if (!A) return null;
  const su = ev.unite === 'J' ? 'J' : 'H4', ma = ma200A(A[su], ev.tFin), daily = tendanceA(A.J, ev.tFin), h4 = tendanceA(A.H4, ev.tFin);
  const cote = ma != null && Number.isFinite(ev.entree) ? (ev.entree > ma ? 1 : -1) : null;
  const aligne = daily && h4 ? daily === h4 : null;
  return { ma: cote, daily, h4, aligne, contreTendance: daily ? ev.dir !== daily : null, annonce: ev.annonce || null };
}
export function libelleContexte(c, ev) {
  if (!c) return '';
  const p = [];
  if (c.ma != null) p.push(c.ma > 0 ? 'au-dessus de la MA200' : 'sous la MA200');
  if (c.aligne != null) p.push(c.aligne ? 'Daily et H4 alignés' : 'Daily et H4 non alignés');
  if (c.contreTendance) p.push('contre-tendance');
  if (c.annonce) p.push('pendant annonce');
  return p.join(' · ');
}
