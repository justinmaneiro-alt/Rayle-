/* ABSENCE DE REDESSIN des flèches sur les VRAIES données (Kraken par le relais + référence Binance) : node agent-trading/tests/fleches-rejeu-reel-test.mjs
   L'historique est rejoué bougie par bougie sur ses dernières bougies (H4 : 250, H1 : 120, M15 : 60) ; à chaque pas, les flèches calculées
   avec les seules bougies connues doivent être EXACTEMENT celles du calcul complet jusqu'à ce point : jamais redessinées, déplacées ni retirées. */
import { chargerHistorique, serieAffichee } from '../front/or/historique-or.js';
import { ecartMesure } from '../front/or/bougies-or.js';
import { PERIODES } from '../front/or/config-or.js';
import { fleches } from '../front/or/niveaux-periode.js';
import { flechesH1v2, listesAvant } from '../front/or/fleches-h1-v2.js';
import { flechesH1v3 } from '../front/or/fleches-h1-v3.js';
import { flechesH1v4, listesDetail } from '../front/or/fleches-h1-v4.js';
import { flechesH1v5, listesV5 } from '../front/or/fleches-h1-v5.js';
const maintenant = Date.now(), H15 = await chargerHistorique('M15', { maintenant }), ecart = ecartMesure(H15.k, H15.vol).ecart;
const cle = f => `${f.t}|${f.sens}|${f.niveau.toFixed(4)}|${f.type}`;
let echecs = 0;
for (const [P, pas] of [['H4', 250], ['H1', 120], ['M15', 60]]) {
  const H = P === 'M15' ? H15 : await chargerHistorique(P, { maintenant }), S = serieAffichee(H, H.k, ecart), V = new Map(H.vol.map(b => [b.t, b.v])), ms = PERIODES[P].ms;
  const C = S.filter(b => b.t + ms <= maintenant), tout = fleches(C, { periode: P, maintenant, volumes: V });
  let ecarts = 0; const t0 = Date.now();
  for (let i = C.length - pas; i < C.length; i++) {
    const pref = C.slice(0, i + 1), F = fleches(pref, { periode: P, maintenant: pref[i].t + ms, volumes: V });
    if (F.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++;
  }
  console.log(`${ecarts ? 'ÉCHEC' : 'OK  '} ${P} : ${pas} bougies rejouées une par une, ${(k => `${k} flèche${k >= 2 ? 's' : ''} posée${k >= 2 ? 's' : ''}`)(tout.filter(f => f.i >= C.length - pas).length)} pendant le rejeu, ${ecarts} différence(s) (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (ecarts) echecs++;
}
// version 2 (H1 seulement) : niveaux listés mis en cache par bougie (ils ne dépendent que des bougies d'avant)
{ const H = await chargerHistorique('H1', { maintenant }), S = serieAffichee(H, H.k, ecart), V = new Map(H.vol.map(b => [b.t, b.v])), ms = PERIODES.H1.ms;
  const C = S.filter(b => b.t + ms <= maintenant), memo = new Map(), listes = (X, i) => { const k = X[i].t; if (!memo.has(k)) memo.set(k, listesAvant(X, i)); return memo.get(k); };
  const t0 = Date.now(), tout = flechesH1v2(C, { maintenant, volumes: V, listes }), pas = 120; let ecarts = 0;
  for (let i = C.length - pas; i < C.length; i++) { const pref = C.slice(0, i + 1), F = flechesH1v2(pref, { maintenant: pref[i].t + ms, volumes: V, listes }); if (F.map(cle).join(';') !== tout.filter(f => f.i <= i).map(cle).join(';')) ecarts++; }
  // contrôle : le cache ne change rien (calcul sans cache sur la série complète)
  const sans = flechesH1v2(C, { maintenant, volumes: V }); if (sans.map(cle).join(';') !== tout.map(cle).join(';')) ecarts++;
  console.log(`${ecarts ? 'ÉCHEC' : 'OK  '} H1 v2 : ${pas} bougies rejouées une par une, ${tout.filter(f => f.i >= C.length - pas).length} flèche(s) posée(s) pendant le rejeu, ${ecarts} différence(s), ${tout.length} flèches v2 sur ${C.length} bougies (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (ecarts) echecs++;
  // version 3 : même rejeu
  const t3 = Date.now(), tout3 = flechesH1v3(C, { maintenant, volumes: V, listes }); let e3 = 0;
  for (let i = C.length - pas; i < C.length; i++) { const pref = C.slice(0, i + 1), F = flechesH1v3(pref, { maintenant: pref[i].t + ms, volumes: V, listes }); if (F.map(cle).join(';') !== tout3.filter(f => f.i <= i).map(cle).join(';')) e3++; }
  console.log(`${e3 ? 'ÉCHEC' : 'OK  '} H1 v3 : ${pas} bougies rejouées une par une, ${tout3.filter(f => f.i >= C.length - pas).length} flèche(s) posée(s) pendant le rejeu, ${e3} différence(s), ${tout3.length} flèches v3 (${((Date.now() - t3) / 1000).toFixed(0)} s)`);
  if (e3) echecs++;
  // version 4 (liste détaillée, mise en cache) : même rejeu
  const memoD = new Map(), lD = (X, i) => { const k = X[i].t; if (!memoD.has(k)) memoD.set(k, listesDetail(X, i)); return memoD.get(k); };
  const t4 = Date.now(), tout4 = flechesH1v4(C, { maintenant, volumes: V, listes: lD }); let e4 = 0;
  for (let i = C.length - pas; i < C.length; i++) { const pref = C.slice(0, i + 1), F = flechesH1v4(pref, { maintenant: pref[i].t + ms, volumes: V, listes: lD }); if (F.map(cle).join(';') !== tout4.filter(f => f.i <= i).map(cle).join(';')) e4++; }
  console.log(`${e4 ? 'ÉCHEC' : 'OK  '} H1 v4 : ${pas} bougies rejouées une par une, ${tout4.filter(f => f.i >= C.length - pas).length} flèche(s) posée(s) pendant le rejeu, ${e4} différence(s), ${tout4.length} flèches v4 (${((Date.now() - t4) / 1000).toFixed(0)} s)`);
  if (e4) echecs++;
  // version 5 (niveaux affichés niveaux-h1-v5, mis en cache) : même rejeu
  const memo5 = new Map(), l5 = (X, i) => { const k = X[i].t; if (!memo5.has(k)) memo5.set(k, listesV5(X, i)); return memo5.get(k); };
  const t5 = Date.now(), tout5 = flechesH1v5(C, { maintenant, volumes: V, listes: l5 }); let e5 = 0;
  for (let i = C.length - pas; i < C.length; i++) { const pref = C.slice(0, i + 1), F = flechesH1v5(pref, { maintenant: pref[i].t + ms, volumes: V, listes: l5 }); if (F.map(cle).join(';') !== tout5.filter(f => f.i <= i).map(cle).join(';')) e5++; }
  console.log(`${e5 ? 'ÉCHEC' : 'OK  '} H1 v5 : ${pas} bougies rejouées une par une, ${tout5.filter(f => f.i >= C.length - pas).length} flèche(s) posée(s) pendant le rejeu, ${e5} différence(s), ${tout5.length} flèches v5 (${((Date.now() - t5) / 1000).toFixed(0)} s)`);
  if (e5) echecs++; }
process.exit(echecs ? 1 : 0);
