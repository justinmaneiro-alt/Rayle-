/* ═════════════ REGISTRE DES FLÈCHES DAILY SUR L'APPAREIL : le terminal et Marchés > Actifs affichent EXACTEMENT les mêmes flèches ═════════════
   Les flèches sont calculées sur les bougies Daily CLÔTURÉES de l'instantané « pro » du robot (même série que le backtest et les alertes), puis fusionnées avec le registre gardé sur l'appareil :
   une flèche déjà publiée n'est jamais modifiée, déplacée ni supprimée. Seules des données publiques de marché sont stockées (aucune donnée de trading). */
import { calculer, cloturees, fusionnerRegistre, RETENUE } from './fleches-daily.js';

export const CLE_REGISTRE = id => 'rayle_tp_fleches_v1_' + id;
/* or et indices : pas de bougie le week-end (les bougies Daily du samedi / dimanche viennent du perpétuel Kraken et n'existent pas dans le backtest : elles sont écartées pour que la méthode voie la même série) */
const SANS_WEEKEND = new Set(['or', 'us100', 'us500']);
export const barresDaily = (id, j) => (SANS_WEEKEND.has(id) ? (j || []).filter(b => { const d = new Date(b.t).getUTCDay(); return d !== 0 && d !== 6; }) : (j || []));

const stockageDefaut = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
export function lireRegistre(id, st = stockageDefaut()) { try { const v = JSON.parse(st.getItem(CLE_REGISTRE(id)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
export function ecrireRegistre(id, reg, st = stockageDefaut()) { try { st.setItem(CLE_REGISTRE(id), JSON.stringify(reg.slice(-400))); return true; } catch (e) { return false; } }

/* flèches de l'actif `id` à partir de ses bougies Daily (instantané pro) ; renvoie le registre fusionné, trié par date */
export function flechesDe(id, j, { maintenant = Date.now(), stockage = stockageDefaut() } = {}) {
  const B = cloturees(barresDaily(id, j), maintenant), calc = B.length >= 60 ? calculer(B, RETENUE.methode, RETENUE.params) : [];
  const avant = lireRegistre(id, stockage), reg = fusionnerRegistre(id, avant, calc);
  if (reg.length !== avant.length) ecrireRegistre(id, reg, stockage);
  return reg;
}
/* flèches pas encore annoncées (vueLe nul) et récentes (moins de `heures` heures depuis la clôture) ; les marque comme annoncées */
export function nouvellesFleches(id, reg, { maintenant = Date.now(), heures = 36, stockage = stockageDefaut() } = {}) {
  const neuves = reg.filter(f => !f.vueLe && maintenant - f.tCloture < heures * 3600e3 && f.tCloture <= maintenant);
  let change = false; for (const f of reg) if (!f.vueLe) { f.vueLe = maintenant; change = true; }
  if (change) ecrireRegistre(id, reg, stockage); return neuves;
}
