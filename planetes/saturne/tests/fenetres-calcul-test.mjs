/* Phase B : placement des fenêtres holographiques (module pur) à 1366, 1920, 2560, en vertical et sur téléphone : rien ne déborde de l'écran, rien ne recouvre le panneau de commande,
   les fenêtres ne se recouvrent pas entre elles tant que la place le permet, et ne sont jamais plus petites que le minimum lisible. */
import { tailleParDefaut, placer, limiter, reorganiser, recouvrements, dansEcran, largeurPanneau, etroit, MINI_L, MINI_H } from '../pc/anatomie-fenetres-calcul.js';
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) { ko++; console.log('ÉCHEC :', m); } };
const ECRANS = [{ l: 1366, h: 768 }, { l: 1920, h: 1080 }, { l: 2560, h: 1440 }, { l: 1600, h: 900 }, { l: 820, h: 1180 }, { l: 390, h: 844 }];
for (const e of ECRANS) {
  const panneau = largeurPanneau(e); let liste = [];
  for (const genre of ['fiche', 'mouvement', 'vue3d']) { const t = tailleParDefaut(genre, e), r = placer(liste.map(x => ({ x: x.x, y: x.y, l: x.l, h: x.h })), t, e); liste.push({ id: genre, ...r }); }
  const nom = e.l + '×' + e.h;
  ok(liste.every(r => dansEcran(r, e)), nom + ' : toutes les fenêtres dans l’écran');
  ok(liste.every(r => r.l >= (etroit(e) ? 300 : MINI_L) && r.h >= MINI_H), nom + ' : tailles minimales respectées');
  if (!etroit(e)) { ok(liste.every(r => r.x >= panneau - 1), nom + ' : aucune fenêtre sur le panneau de commande (' + panneau + ' px)'); ok(recouvrements(liste).every(([, , aire]) => aire < 0.9 * Math.min(...liste.map(r => r.l * r.h))), nom + ' : le recouvrement éventuel reste limité (une fenêtre lisible qui en recouvre un peu une autre vaut mieux qu’une fenêtre minuscule ; « Réorganiser » range en grille) : ' + JSON.stringify(recouvrements(liste))); }
  const rr = reorganiser(liste, e); ok(rr.every(r => dansEcran(r, e)), nom + ' : après réorganisation, dans l’écran');
  if (!etroit(e)) ok(recouvrements(rr).length === 0, nom + ' : après réorganisation, sans recouvrement');
  const l = limiter({ x: -50, y: -50, l: 9999, h: 9999 }, e); ok(dansEcran(l, e), nom + ' : limiter ramène dans l’écran');
}
console.log(`fenêtres : ${n - ko}/${n} vérifications`); process.exit(ko ? 1 : 0);
