/* Non-repaint de toute la stratégie Rayle v1 sur des centaines de préfixes : l'état calculé à la bougie k avec les seules bougies ≤ k est EXACTEMENT celui que donne la série entière
   (moyenne mobile et ses événements, niveaux, zones, régime de volatilité) ; les scénarios sont déterministes. Aucune donnée du futur n'entre dans un objet déjà posé. */
import * as MA from '../front/or/ma-evenements-v1.js'; import * as Z from '../front/or/boites-v1.js'; import * as SC from '../front/or/scenarios-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5), g = prng(33), B = []; let c = 4000; for (let i = 0; i < 1500; i++) { const o = c; c = o + (g() - 0.5) * 7 + Math.sin(i / 37) * 3 + (i > 700 && i < 900 ? 0.6 : 0); B.push({ t: t0 + i * H, o, h: Math.max(o, c) + g() * 2, l: Math.min(o, c) - g() * 2, c, v: 50 + g() * 100 }); }
const pleineMA = MA.analyser(B), pleine = Z.preparer(B), cle = e => [e.id, e.i, e.type, e.dir, Math.round(e.niveau * 1e6), e.profil ? e.profil.session + e.profil.corps + e.profil.h4 + e.profil.volume : ''].join('|');
let nM = 0, nZ = 0, nS = 0, nR = 0, nV = 0, bon = { m: true, z: true, n: true, r: true, s: true };
for (let k = 260; k <= 1500; k += 5) {
  const pre = B.slice(0, k);
  // moyenne mobile : événements du préfixe = événements de la série entière dont l'indice < k
  const a = MA.analyser(pre).events.map(cle).join(';'), b = pleineMA.events.filter(e => e.i < k).map(cle).join(';'); nM++; if (a !== b) { bon.m = false; console.log('repaint MA au préfixe', k); break; }
  if (k % 20 !== 0) continue;
  const pp = Z.preparer(pre);
  // niveaux et zones à la dernière bougie du préfixe
  const na = Z.niveauxA(pp, k - 1).map(x => [x.nature, x.nom, Math.round(x.p * 1e6), x.t].join('|')).sort().join(';'), nb = Z.niveauxA(pleine, k - 1).map(x => [x.nature, x.nom, Math.round(x.p * 1e6), x.t].join('|')).sort().join(';'); nS++; if (na !== nb) { bon.n = false; console.log('repaint niveaux au préfixe', k); break; }
  const za = Z.zonesA(pp, k - 1).map(z => [z.id, z.conf, z.tFormation, z.invalide, z.tInval, Math.round(z.bas * 1e6), Math.round(z.haut * 1e6)].join('|')).join(';'), zb = Z.zonesA(pleine, k - 1).map(z => [z.id, z.conf, z.tFormation, z.invalide, z.tInval, Math.round(z.bas * 1e6), Math.round(z.haut * 1e6)].join('|')).join(';'); nZ++; if (za !== zb) { bon.z = false; console.log('repaint zones au préfixe', k); break; }
  // régime de volatilité
  const ra = SC.regimeVol(pp.A, k - 1), rb = SC.regimeVol(pleine.A, k - 1); nR++; if (ra !== rb) { bon.r = false; console.log('repaint régime au préfixe', k); break; }
  // scénarios : déterministes pour un même préfixe
  const mk = () => SC.construire({ B: pre, atr: pp.A[k - 1], prix: pre[k - 1].c, t1: 1, t4: 1, positionMa: 1, niveaux: Z.niveauxA(pp, k - 1), ligne: null, stats: null, horizon: '1j', regime: ra || 'moyen', tDerniere: pre[k - 1].t });
  nV++; if (JSON.stringify(mk()) !== JSON.stringify(mk())) { bon.s = false; console.log('scénario non déterministe au préfixe', k); break; }
}
v(bon.m && nM >= 240, `moyenne mobile : événements identiques sur ${nM} préfixes`); v(bon.n && nS >= 60, `niveaux (swings H4, veille, semaine, volume) identiques sur ${nS} préfixes`); v(bon.z && nZ >= 60, `zones (confluence, invalidation) identiques sur ${nZ} préfixes`);
v(bon.r && nR >= 60, `régime de volatilité identique sur ${nR} préfixes`); v(bon.s && nV >= 60, `scénarios déterministes sur ${nV} préfixes`);
v(nM + nS + nZ + nR + nV >= 500, `au total ${nM + nS + nZ + nR + nV} contrôles de non-repaint`);
console.log(`rayle-norepaint : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
