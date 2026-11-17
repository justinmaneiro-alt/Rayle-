/* ═════════════ REGISTRE DES FLÈCHES « MA200 DAILY + H4 » SUR L'APPAREIL ═════════════
   Les flèches sont calculées (ma200-h4.js) sur les bougies Daily CLÔTURÉES et les bougies H4 de l'instantané « pro » du robot, puis fusionnées avec le registre gardé sur l'appareil :
   une flèche déjà confirmée n'est jamais modifiée, déplacée ni supprimée (aucun repaint) et n'est annoncée (voix) qu'une seule fois.
   Réglages (terminal > Affichage) : interrupteur « Flèches » (activé par défaut) et fond coloré selon le sens Daily (activé par défaut). Seules des données publiques de marché sont stockées. */
import { analyserMA, cloturees, fusionnerRegistre, ALGO_ID } from './ma200-h4.js';

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
/* or et indices : pas de bougie Daily le week-end (celles du samedi / dimanche viennent du perpétuel Kraken et ne font pas partie de la séance : elles sont écartées) */
const SANS_WEEKEND = new Set(['or', 'us100', 'us500']);
export const barresDaily = (id, j) => (SANS_WEEKEND.has(id) ? (j || []).filter(b => { const d = new Date(b.t).getUTCDay(); return d !== 0 && d !== 6; }) : (j || []));

const stockageDefaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const lireJ = (st, k, d) => { try { const v = JSON.parse(st.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const ecrireJ = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* réglages : { actif: true, fond: true } */
export function lireReglages(st = stockageDefaut()) { const r = st ? lireJ(st, CLE_REGLAGES, {}) : {}; return { actif: !r || r.actif !== false, fond: !r || r.fond !== false }; }
export function ecrireReglages(r, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGLAGES, { actif: r.actif !== false, fond: r.fond !== false }) : false; }

export function lireRegistre(id, st = stockageDefaut()) { const v = st ? lireJ(st, CLE_REGISTRE(id), []) : []; return Array.isArray(v) ? v : []; }
export function ecrireRegistre(id, reg, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGISTRE(id), reg.slice(-400)) : false; }

/* analyse complète de l'actif `id` à partir de son instantané pro `D` ({ j, h4 }) : le registre fusionné (trié par heure de confirmation), le sens Daily bougie par bougie et les bougies utilisées.
   Premier calcul sur cet appareil (registre vide) : tout l'historique disponible est enregistré comme déjà vu, rien n'est annoncé. */
export function analyseDe(id, D, { maintenant = Date.now(), stockage = stockageDefaut() } = {}) {
  purgerAnciens(stockage);
  const Bj = cloturees(barresDaily(id, D && D.j), maintenant), Bh = ((D && D.h4) || []).filter(b => b.t + 4 * 3600e3 <= maintenant);
  const A = Bj.length >= 260 ? analyserMA(Bj, Bh.length >= 250 ? Bh : [], { maintenant }) : { S: null, tout: [], sens: [] };
  const avant = lireRegistre(id, stockage), reg = fusionnerRegistre(id, avant, A.tout);
  if (!avant.length) for (const f of reg) f.vueLe = maintenant;
  if (reg.length !== avant.length) ecrireRegistre(id, reg, stockage);
  return { reg, Bj, Bh, S: A.S, sens: A.sens };
}
export const flechesDe = (id, D, opt = {}) => analyseDe(id, D, opt).reg;
/* flèches pas encore annoncées (vueLe nul), confirmées il y a moins de `heures` heures ; toutes sont ensuite marquées comme vues : une flèche n'est jamais annoncée deux fois */
export function nouvellesFleches(id, reg, { maintenant = Date.now(), heures = 36, stockage = stockageDefaut() } = {}) {
  const neuves = reg.filter(f => !f.vueLe && maintenant - f.tFin < heures * 3600e3 && f.tFin <= maintenant);
  let change = false; for (const f of reg) if (!f.vueLe) { f.vueLe = maintenant; change = true; }
  if (change) ecrireRegistre(id, reg, stockage); return neuves;
}
