/* ═════════════ REGISTRE DES RETOURNEMENTS DAILY SUR L'APPAREIL ═════════════
   Les flèches sont calculées (retournements-daily.js) sur les bougies Daily CLÔTURÉES et les bougies H4 de l'instantané « pro » du robot, puis fusionnées avec le registre gardé sur l'appareil :
   une flèche déjà confirmée n'est jamais modifiée, déplacée ni supprimée (aucun repaint) et n'est annoncée (voix) qu'une seule fois.
   Réglages (terminal > Affichage) : interrupteur « Flèches Daily » (activé par défaut) et version (complète / sans filtre volume / sens de la MA200 seulement ; défaut = la plus rentable au backtest). Seules des données publiques de marché sont stockées. */
import { retournements, cloturees, fusionnerRegistre, versionDe } from './retournements-daily.js';

export const CLE_REGLAGES = 'rayle_tp_retournements_reglages';
export const CLE_REGISTRE = (id, version) => `rayle_tp_rv1_${id}_${versionDe(version)}`;
/* or et indices : pas de bougie Daily le week-end (celles du samedi / dimanche viennent du perpétuel Kraken et ne font pas partie de la séance : elles sont écartées) */
const SANS_WEEKEND = new Set(['or', 'us100', 'us500']);
const jourUTC = t => Math.floor(t / 86400e3);
/* bougies Daily de l'actif ; or : si le robot publie le volume des futures COMEX (`vj` = [[t, volume], …]), c'est lui qui sert de volume (le perpétuel Kraken n'a qu'un volume en contrats, sans rapport) */
export function barresDaily(id, j, vj = null) {
  let B = SANS_WEEKEND.has(id) ? (j || []).filter(b => { const d = new Date(b.t).getUTCDay(); return d !== 0 && d !== 6; }) : (j || []);
  if (vj && vj.length) { const m = new Map(vj.map(r => [jourUTC(r[0]), r[1]])); B = B.map(b => (m.has(jourUTC(b.t)) ? { ...b, v: m.get(jourUTC(b.t)) } : b)); }
  return B;
}

const stockageDefaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const lireJ = (st, k, d) => { try { const v = JSON.parse(st.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const ecrireJ = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/* réglages : { actif: true, version: 'sansVolume' } ; une valeur invalide est ignorée (retour au défaut) */
export function lireReglages(st = stockageDefaut()) { const r = st ? lireJ(st, CLE_REGLAGES, {}) : {}; return { actif: !r || r.actif !== false, version: versionDe(r && r.version) }; }
export function ecrireReglages(r, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGLAGES, { actif: r.actif !== false, version: versionDe(r.version) }) : false; }
export const versionActive = (r = lireReglages()) => versionDe(r.version);

export function lireRegistre(id, version, st = stockageDefaut()) { const v = st ? lireJ(st, CLE_REGISTRE(id, version), []) : []; return Array.isArray(v) ? v : []; }
export function ecrireRegistre(id, version, reg, st = stockageDefaut()) { return st ? ecrireJ(st, CLE_REGISTRE(id, version), reg.slice(-300)) : false; }

/* flèches de l'actif `id` à partir de son instantané pro `D` ({ j, h4, vj? }) ; renvoie le registre fusionné, trié par date.
   Premier calcul sur cet appareil (registre vide) : tout l'historique disponible est enregistré comme déjà vu, rien n'est annoncé. */
export function flechesDe(id, D, { maintenant = Date.now(), stockage = stockageDefaut(), version = null } = {}) {
  const v = versionDe(version ?? versionActive(lireReglages(stockage))), J = cloturees(barresDaily(id, D && D.j, D && D.vj), maintenant), H = (D && D.h4) || [];
  const calc = J.length >= 260 && H.length >= 30 ? retournements(J, H, { version: v, maintenant }).signaux : [];
  const avant = lireRegistre(id, v, stockage), reg = fusionnerRegistre(id, avant, calc);
  if (!avant.length) for (const f of reg) f.vueLe = maintenant;
  if (reg.length !== avant.length) ecrireRegistre(id, v, reg, stockage);
  return reg;
}
/* flèches pas encore annoncées (vueLe nul), confirmées il y a moins de `heures` heures ; toutes sont ensuite marquées comme vues : une flèche n'est jamais annoncée deux fois */
export function nouvellesFleches(id, reg, { maintenant = Date.now(), heures = 36, stockage = stockageDefaut(), version = null } = {}) {
  const neuves = reg.filter(f => !f.vueLe && maintenant - f.tFin < heures * 3600e3 && f.tFin <= maintenant);
  let change = false; for (const f of reg) if (!f.vueLe) { f.vueLe = maintenant; change = true; }
  if (change) ecrireRegistre(id, version ?? versionActive(lireReglages(stockage)), reg, stockage); return neuves;
}
