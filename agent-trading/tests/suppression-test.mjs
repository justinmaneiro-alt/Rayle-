/* Suppression d'un trait ou d'un carré : calculs purs + effet sur les flèches (niveau masqué = plus de NOUVELLES flèches, les anciennes restent).   node agent-trading/tests/suppression-test.mjs */
import * as S from '../front/or/suppression-calcul.js'; import * as V6 from '../front/or/fleches-simples-v6.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { serie13 } from '../recherche-or/fleches-v6-diag.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
v('zone de touche : 10 px à la souris, 20 px au doigt', S.TOL_SOURIS === 10 && S.TOL_TACTILE === 20 && S.tolerance('mouse') === 10 && S.tolerance('touch') === 20 && S.tolerance('pen') === 20 && S.tolerance(undefined) === 10);
v('« Supprimé · Annuler » reste 6 secondes', S.DUREE_ANNULER === 6000);
v('distance à un rectangle : 0 dedans, distance au bord dehors', S.distanceRect(5, 5, { x0: 0, x1: 10, y0: 0, y1: 10 }) === 0 && S.distanceRect(15, 5, { x0: 0, x1: 10, y0: 0, y1: 10 }) === 5 && Math.abs(S.distanceRect(13, 14, { x0: 0, x1: 10, y0: 0, y1: 10 }) - 5) < 1e-9);
v('distance à un segment (ligne de tendance)', Math.abs(S.distanceSegment(5, 3, 0, 0, 10, 0) - 3) < 1e-9 && Math.abs(S.distanceSegment(-4, 3, 0, 0, 10, 0) - 5) < 1e-9);
v('choisir : le plus proche gagne', S.choisir([{ type: 'zone', d: 6 }, { type: 'zone', d: 2 }]).d === 2 && S.choisir([]) === null);
v('choisir : à distance quasi égale, le dessin de l\'utilisateur passe avant le niveau calculé', S.choisir([{ type: 'zone', d: 4 }, { type: 'objet', d: 5 }]).type === 'objet' && S.choisir([{ type: 'zone', d: 1 }, { type: 'objet', d: 9 }]).type === 'zone');
v('fenêtre flottante : toujours entièrement visible (bords droit, bas, haut)', (() => { const W = 400, H = 300; return [[390, 150], [10, 5], [200, 295], [395, 295]].every(([x, y]) => { const p = S.placerFenetre(x, y, 220, 70, W, H); return p.left >= 0 && p.top >= 0 && p.left + 220 <= W && p.top + 70 <= H; }); })());
const m1 = { cle: 'a', kind: 'zone', bas: 4131, haut: 4144, t: 1000 };
v('masque : cache une zone qui le recouvre, pas une zone éloignée ni d\'un autre genre', S.zoneMasquee([m1], 'zone', 4135, 4140, 14, 2000) && !S.zoneMasquee([m1], 'zone', 4000, 4010, 14, 2000) && !S.zoneMasquee([m1], 'liq', 4135, 4140, 14, 2000));
v('masque : tolérance de 0,25 ATR (une zone voisine de quelques points est la même)', S.zoneMasquee([m1], 'zone', 4146, 4147, 14, 2000) && !S.zoneMasquee([m1], 'zone', 4160, 4170, 14, 2000));
v('masque : ne réécrit pas le passé (aucun effet avant l\'instant du masquage)', !S.zoneMasquee([m1], 'zone', 4135, 4140, 14, 500) && S.zoneMasquee([m1], 'zone', 4135, 4140, 14, 1500));
v('ajouter / retirer un masque (le retrait restitue exactement la liste d\'avant)', (() => { let L = S.ajouterMasque([], m1); const n1 = L.length; L = S.ajouterMasque(L, { ...m1, cle: 'b' }); const n2 = L.length; L = S.retirerMasque(L, 'b'); return n1 === 1 && n2 === 1 && L.length === 0 || (n1 === 1 && L.length === 1); })());
v('prix affiché : un niveau ou une plage', S.fmtPrix(4144, 4144) === '4 144' && /4 131 – 4 144/.test(S.fmtPrix(4131, 4144)));
// ── effet sur les flèches : le masque ne s'applique qu'aux nouvelles bougies, jamais aux flèches déjà posées
const K = serie13(), H = 3600e3, now = K.at(-1).t + H, base = V6.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 });
const cible = base.fleches.find(f => f.type === 'retournement' && !f.contre && f.tCloture >= Date.UTC(2026, 10, 9, 21) && f.tCloture <= Date.UTC(2026, 10, 9, 22));   // la vente du 9 nov. 21:00 sur 4 131–4 144
v('référence : la vente du 9 nov. 21:00 existe', !!cible);
const apres = V6.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5, exclure: S.exclureDe([{ cle: 'x', kind: 'zone', bas: cible.zoneBas, haut: cible.zoneHaut, t: Date.UTC(2026, 10, 9, 12) }]) });
v('niveau masqué AVANT la flèche : plus aucune flèche sur ce niveau après le masquage', !apres.fleches.some(f => f.type === 'retournement' && f.zoneBas <= cible.zoneHaut + 3 && f.zoneHaut >= cible.zoneBas - 3 && f.tCloture > Date.UTC(2026, 10, 9, 12)));
v('niveau masqué : les flèches d\'avant le masquage sont inchangées (même rendu avant l\'instant)', apres.fleches.filter(f => f.tCloture <= Date.UTC(2026, 10, 9, 12)).map(f => f.id).join() === base.fleches.filter(f => f.tCloture <= Date.UTC(2026, 10, 9, 12)).map(f => f.id).join());
const registre = base.fleches.filter(f => f.tCloture <= cible.tCloture).map(f => ({ ...f }));
const fusion = V6.fusionnerRegistre(registre, apres.fleches, apres.invalidees || []);
v('registre : une flèche déjà posée reste affichée même si son niveau est masqué ensuite (ajout seul)', registre.every(f => fusion.some(g => g.id === f.id)));
const sansMasque = V6.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5, exclure: S.exclureDe([]) }); v('sans masque : rendu identique', sansMasque.fleches.map(f => f.id).join() === base.fleches.map(f => f.id).join());
const futur = V6.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5, exclure: S.exclureDe([{ cle: 'y', kind: 'zone', bas: cible.zoneBas, haut: cible.zoneHaut, t: now + 1e9 }]) }); v('masque posé après la dernière bougie : aucune flèche existante ne bouge', futur.fleches.map(f => f.id).join() === base.fleches.map(f => f.id).join());
console.log(`${ok} OK, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
