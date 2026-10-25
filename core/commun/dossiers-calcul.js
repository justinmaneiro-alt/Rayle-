/* ═════════════ DOSSIERS HOLOGRAPHIQUES : CALCULS PURS (testés : galaxie/tests/r3-dossiers-test.mjs) ═════════════
   Un dossier = { id, titre, icone, ids: [identifiants de fenêtres] }. Chaque fenêtre est dans UN dossier (rien d'oublié, rien en double).
   Le carrousel place les cartes autour d'un centre (éventuellement fractionnaire pendant un glissement) : x, profondeur, rotation, échelle, transparence. */

/* Problèmes de rangement (vide = tout va bien) : fenêtre inconnue, fenêtre dans deux dossiers, fenêtre oubliée, dossier vide. */
export function verifierDossiers(dossiers, toutesLesIds) {
  const pb = [], vus = new Map(), connues = new Set(toutesLesIds);
  for (const d of dossiers) {
    if (!d.ids || !d.ids.length) pb.push('dossier vide : ' + d.id);
    for (const id of d.ids || []) { if (!connues.has(id)) pb.push('fenêtre inconnue : ' + id); if (vus.has(id)) pb.push('fenêtre dans deux dossiers : ' + id); vus.set(id, d.id); }
  }
  for (const id of toutesLesIds) if (!vus.has(id)) pb.push('fenêtre oubliée : ' + id);
  return pb;
}
export const dossierDe = (dossiers, id) => (dossiers.find(d => (d.ids || []).includes(id)) || {}).id || null;
export const borne = (i, n) => (n <= 0 ? 0 : Math.max(0, Math.min(n - 1, i)));

/* Disposition d'un carrousel 3D. n cartes, centre (peut être fractionnaire), largeur de carte et d'écran en pixels.
   Rend pour chaque carte : { i, dec, x (px depuis le centre), z (px, négatif = recule), rot (degrés), echelle, opacite, zIndex, visible }. */
export function carrousel(n, centre, { largeurCarte = 360, largeurEcran = 1280, maxVisibles = 4 } = {}) {
  const pas = Math.max(largeurCarte * 0.34, Math.min(largeurCarte * 0.62, (largeurEcran - largeurCarte) / (2 * Math.max(1, Math.min(maxVisibles, 3)))));
  return Array.from({ length: n }, (_, i) => {
    const dec = i - centre, a = Math.abs(dec), s = Math.sign(dec);
    const x = s * (a <= 1 ? a * pas * 1.25 : pas * 1.25 + (a - 1) * pas * 0.78);
    return { i, dec, x: Math.round(x), z: -Math.round(Math.min(a, 3) * 150), rot: -s * Math.min(a, 2) * 26, echelle: Math.max(0.55, 1 - 0.14 * Math.min(a, 3.2)), opacite: a > maxVisibles + 0.5 ? 0 : Math.max(0.18, 1 - 0.3 * a), zIndex: 100 - Math.round(a * 10), visible: a <= maxVisibles + 0.5 };
  });
}
/* Éventail : les cartes pivotent autour d'un point sous l'écran (animation d'ouverture d'un dossier). */
export function eventail(n, centre, { ecartDeg = 13 } = {}) {
  return Array.from({ length: n }, (_, i) => { const dec = i - centre; return { i, dec, rot: dec * ecartDeg, y: Math.abs(dec) * 14, echelle: 1 - Math.min(Math.abs(dec), 3) * 0.05 }; });
}
/* Centre après un glissement de dx pixels (positif = vers la droite : on recule dans la liste). */
export const centreApresGlisse = (centre0, dx, pasPx, n) => Math.max(0, Math.min(n - 1, centre0 - dx / Math.max(1, pasPx)));
export const centreFinal = (centre, n, vitesse = 0) => borne(Math.round(centre - Math.max(-1.5, Math.min(1.5, vitesse * 0.35))), n);
export function toucheCarrousel(touche, centre, n) {
  if (touche === 'ArrowRight' || touche === 'ArrowDown') return borne(centre + 1, n);
  if (touche === 'ArrowLeft' || touche === 'ArrowUp') return borne(centre - 1, n);
  if (touche === 'Home') return 0;
  if (touche === 'End') return n - 1;
  return centre;
}
export const centreMolette = (centre, deltaY, n) => borne(centre + (deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0), n);

/* ── Tiroir global : filtre par texte (titre, dossier, vue), accents et casse ignorés ── */
export const norme = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function filtrerTiroir(entrees, requete) {
  const q = norme(requete).trim(); if (!q) return entrees;
  const mots = q.split(/\s+/);
  return entrees.filter(e => { const t = norme([e.titre, e.dossier, e.vue, e.apercu].join(' ')); return mots.every(m => t.includes(m)); });
}
/* Regroupe des entrées { vue, dossier, … } par vue puis par dossier, dans l'ordre d'arrivée. */
export function grouperTiroir(entrees) {
  const vues = new Map();
  for (const e of entrees) {
    if (!vues.has(e.vue)) vues.set(e.vue, new Map());
    const dos = vues.get(e.vue); if (!dos.has(e.dossier)) dos.set(e.dossier, []); dos.get(e.dossier).push(e);
  }
  return [...vues].map(([vue, dos]) => ({ vue, dossiers: [...dos].map(([dossier, fenetres]) => ({ dossier, fenetres })) }));
}
