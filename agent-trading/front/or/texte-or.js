/* ═════════════ TEXTES EN FRANÇAIS (pur, testé) : accords de pluriel et nombres ═════════════
   En français, 0 et 1 sont au singulier : « 0 morceau », « 1 morceau », « 2 morceaux ». */
const nbFr = n => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
export const estPluriel = n => Math.abs(Number(n)) >= 2;
export const pluriel = (n, un, plusieurs = un + 's') => `${nbFr(n)} ${estPluriel(n) ? plusieurs : un}`;
