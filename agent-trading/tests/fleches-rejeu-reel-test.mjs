/* ABSENCE DE REDESSIN des flèches sur les VRAIES données (Kraken par le relais + référence Binance) : node agent-trading/tests/fleches-rejeu-reel-test.mjs
   L'historique est rejoué bougie par bougie sur ses dernières bougies (H4 : 250, H1 : 120, M15 : 60) ; à chaque pas, les flèches calculées
   avec les seules bougies connues doivent être EXACTEMENT celles du calcul complet jusqu'à ce point : jamais redessinées, déplacées ni retirées. */
import { chargerHistorique, serieAffichee } from '../front/or/historique-or.js';
import { ecartMesure } from '../front/or/bougies-or.js';
import { PERIODES } from '../front/or/config-or.js';
import { fleches } from '../front/or/niveaux-periode.js';
import { flechesH1v2, listesAvant } from '../front/or/fleches-h1-v2.js';
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
  if (ecarts) echecs++; }
process.exit(echecs ? 1 : 0);
