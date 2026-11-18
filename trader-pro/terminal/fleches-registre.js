/* ═════════════ REGISTRE DES FLÈCHES « CASSURE MA200 H4 » SUR L'APPAREIL ═════════════
   Les flèches sont calculées (ma200-h4.js) sur les bougies H4 CLÔTURÉES de l'instantané « pro » du robot, puis fusionnées avec le registre gardé sur l'appareil :
   une flèche déjà confirmée n'est jamais modifiée, déplacée ni supprimée et n'est annoncée (voix, Telegram) qu'une seule fois.
   Réglage (terminal > Affichage) : interrupteur « Flèches » (activé par défaut). Seules des données publiques de marché sont stockées. */
import { analyser, fusionnerRegistre, ALGO_ID } from './ma200-h4.js';

export const CLE_REGLAGES = 'rayle_tp_ma200h4_reglages';
/* la clé contient l'identifiant de l'algorithme : les flèches enregistrées par une ancienne variante (ex. 71 petites flèches de la première version) ne sont plus jamais relues */
export const CLE_REGISTRE = id => `rayle_tp_ma2_${id}_${ALGO_ID()}`;
const ANCIENNES_CLES = /^rayle_tp_(?:ma1_|zz1_|rv1_|ma2_)/;
/* supprime les registres des anciens algorithmes (zigzag, retournements, première version MA200 D+H4) : plus aucune ancienne flèche ne reste sur l'appareil */
export function purgerAnciens(st = stockageDefaut()) {
  if (!st || typeof st.length !== 'number' || typeof st.key !== 'function') return 0;
  const aSupprimer = []; for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && ANCIENNES_CLES.test(k) && !/^rayle_tp_ma2_/.test(k)) aSupprimer.push(k); else if (k && /^rayle_tp_ma2_/.test(k) && !k.endsWith('_' + ALGO_ID())) aSupprimer.push(k); }
  for (const k of aSupprimer) { try { st.removeItem(k); } catch (e) { /* */ } } return aSupprimer.length;
}

const stockageDefaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const lireJ = (st, k, d) => { try { const v = JSON.parse(st.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const ecrireJ = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* réglages : { actif: true, fond: true } */
export function lireReglages(st = stockageDefaut()) { const r = st ? lireJ(st, CLE_REGLAGES, {}) : {}; return { actif: !r || r.actif !== false, fond: !r || r.fond !== false }; }
export function ecrireReglages(r, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGLAGES, { actif: r.actif !== false, fond: r.fond !== false }) : false; }

export function lireRegistre(id, st = stockageDefaut()) { const v = st ? lireJ(st, CLE_REGISTRE(id), []) : []; return Array.isArray(v) ? v : []; }
export function ecrireRegistre(id, reg, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGISTRE(id), reg.slice(-400)) : false; }

/* analyse complète de l'actif `id` à partir de son instantané pro `D` ({ h4 }) : le registre fusionné (trié par heure de confirmation), la tendance H4 bougie par bougie, les zones majeures, les statistiques et les bougies utilisées.
   Premier calcul sur cet appareil (registre vide) : tout l'historique disponible est enregistré comme déjà vu, rien n'est annoncé. */
export const BOUGIES_MIN = 205;
export function analyseDe(id, D, { maintenant = Date.now(), stockage = stockageDefaut() } = {}) {
  purgerAnciens(stockage);
  const Bh = ((D && D.h4) || []).filter(b => b.t + 4 * 3600e3 <= maintenant);
  const A = Bh.length >= BOUGIES_MIN ? analyser(Bh, { maintenant }) : { B: Bh, M: [], fleches: [], sens: [] };
  const avant = lireRegistre(id, stockage), reg = fusionnerRegistre(id, avant, A.fleches);
  if (!avant.length) for (const f of reg) f.vueLe = maintenant;
  if (reg.length !== avant.length) ecrireRegistre(id, reg, stockage);
  return { reg, Bh, M: A.M, sens: A.sens };
}
export const flechesDe = (id, D, opt = {}) => analyseDe(id, D, opt).reg;
/* flèches pas encore annoncées (vueLe nul), confirmées il y a moins de `heures` heures ; toutes sont ensuite marquées comme vues : une flèche n'est jamais annoncée deux fois */
export function nouvellesFleches(id, reg, { maintenant = Date.now(), heures = 36, stockage = stockageDefaut() } = {}) {
  const neuves = reg.filter(f => !f.vueLe && maintenant - f.tFin < heures * 3600e3 && f.tFin <= maintenant);
  let change = false; for (const f of reg) if (!f.vueLe) { f.vueLe = maintenant; change = true; }
  if (change) ecrireRegistre(id, reg, stockage); return neuves;
}
