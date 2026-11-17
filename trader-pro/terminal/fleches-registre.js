/* ═════════════ REGISTRE DES FLÈCHES DAILY SUR L'APPAREIL ═════════════
   Les flèches sont calculées (zigzag ATR, voir zigzag-daily.js) sur les bougies Daily CLÔTURÉES de l'instantané « pro » du robot, puis fusionnées avec le registre gardé sur l'appareil :
   une flèche déjà confirmée n'est jamais modifiée, déplacée ni supprimée (aucun repaint) et n'est annoncée (voix) qu'une seule fois.
   Réglages (terminal > Affichage) : interrupteur « Flèches Daily » (activé par défaut) et multiplicateur ATR par actif (2,5 par défaut). Seules des données publiques de marché sont stockées. */
import { zigzag, cloturees, fusionnerRegistre, multDe } from './zigzag-daily.js';

export const CLE_REGLAGES = 'rayle_tp_fleches_reglages';
export const CLE_REGISTRE = (id, mult) => `rayle_tp_zz1_${id}_${String(mult).replace('.', '_')}`;
/* or et indices : pas de bougie le week-end (les bougies Daily du samedi / dimanche viennent du perpétuel Kraken et ne font pas partie de la séance : elles sont écartées) */
const SANS_WEEKEND = new Set(['or', 'us100', 'us500']);
export const barresDaily = (id, j) => (SANS_WEEKEND.has(id) ? (j || []).filter(b => { const d = new Date(b.t).getUTCDay(); return d !== 0 && d !== 6; }) : (j || []));

const stockageDefaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const lireJ = (st, k, d) => { try { const v = JSON.parse(st.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const ecrireJ = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* réglages : { actif: true, mult: { or: 2.5, … } } ; une valeur invalide est ignorée (retour au défaut) */
export function lireReglages(st = stockageDefaut()) { const r = st ? lireJ(st, CLE_REGLAGES, {}) : {}; return { actif: !r || r.actif !== false, mult: r && r.mult && typeof r.mult === 'object' ? r.mult : {} }; }
export function ecrireReglages(r, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGLAGES, { actif: r.actif !== false, mult: r.mult || {} }) : false; }
export const multActif = (id, r = lireReglages()) => multDe(id, r.mult);

export function lireRegistre(id, mult, st = stockageDefaut()) { const v = st ? lireJ(st, CLE_REGISTRE(id, mult), []) : []; return Array.isArray(v) ? v : []; }
export function ecrireRegistre(id, mult, reg, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGISTRE(id, mult), reg.slice(-600)) : false; }

/* flèches de l'actif `id` à partir de ses bougies Daily (instantané pro) ; renvoie le registre fusionné, trié par date.
   Premier calcul sur cet appareil (registre vide) : tout l'historique est enregistré comme déjà vu, rien n'est annoncé. */
export function flechesDe(id, j, { maintenant = Date.now(), stockage = stockageDefaut(), mult = null } = {}) {
  const m = mult ?? multActif(id, lireReglages(stockage)), B = cloturees(barresDaily(id, j), maintenant), calc = B.length >= 60 ? zigzag(B, { mult: m }) : [];
  const avant = lireRegistre(id, m, stockage), reg = fusionnerRegistre(id, avant, calc);
  if (!avant.length) for (const f of reg) f.vueLe = maintenant;
  if (reg.length !== avant.length) ecrireRegistre(id, m, reg, stockage);
  const clot = new Map(B.map(b => [b.t, b.c])); for (const f of reg) { const c = clot.get(f.tConf); if (Number.isFinite(c)) f.prixConf = c; }   // clôture du jour de confirmation (prix d'apparition), pour l'affichage
  return reg;
}
/* flèches pas encore annoncées (vueLe nul), confirmées il y a moins de `heures` heures ; toutes sont ensuite marquées comme vues : une flèche n'est jamais annoncée deux fois */
export function nouvellesFleches(id, reg, { maintenant = Date.now(), heures = 36, stockage = stockageDefaut(), mult = null } = {}) {
  const neuves = reg.filter(f => !f.vueLe && maintenant - f.tCloture < heures * 3600e3 && f.tCloture <= maintenant);
  let change = false; for (const f of reg) if (!f.vueLe) { f.vueLe = maintenant; change = true; }
  if (change) ecrireRegistre(id, mult ?? multActif(id, lireReglages(stockage)), reg, stockage); return neuves;
}
