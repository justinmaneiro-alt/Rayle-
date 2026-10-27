import { FAMILLES_V2 } from './familles-v2.js';
import { STATUTS, FIABILITE_TEXTE } from './validation-agent.js';

/* ═════════════ PROPOSITIONS ET ALERTES DES AGENTS PRÊTS À L'EMPLOI (V2, phase 6 ; module pur, testé : planetes/mars/tests/v2-agents-test.mjs) ═════════════
   À la clôture de chaque bougie M15 : l'agent est SANS SIGNAL, EN PRÉPARATION (le contexte est là, la confirmation pas encore) ou en ENTRÉE (le signal vient de naître).
   RÈGLES (non négociables) :
   · un agent qui n'est PAS « validé hors échantillon » ne propose JAMAIS de position et n'envoie JAMAIS d'alerte d'ENTRÉE : il dit pourquoi (statut `refusee`) ; la préparation reste visible mais est
     étiquetée « agent non validé : information seulement » ;
   · une entrée porte : sens, prix indicatif (clôture), stop, objectifs en R (le dernier est celui de l'agent), distance au stop, coût estimé en R, et le jugement du GARDIEN PROP (PASS / BLOQUÉ, taille
     conseillée : le risque est calculé avec les règles du compte, jamais plus que la marge restante) ; une entrée BLOQUÉE par le gardien n'est pas présentée comme une entrée ;
   · AUCUN ordre : alertes et explications seulement. Pas un conseil financier. */
const arr = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const virgule = x => String(x).replace('.', ',');
export const etiquetteAgent = statut => (statut === 'valide_oos' ? 'VALIDÉ HORS ÉCHANTILLON' : 'AGENT NON VALIDÉ');

/* i = index de la dernière bougie M15 FERMÉE. validation = résultat de validerAgent (ou null : jamais validé). jugerProp(plan) → { decision, texte, quantite } (gardien) ou null. */
export function proposer({ ctx, id, params, validation, i = null, paire = 'BTC', cout = null, jugerProp = null, maintenant = Date.now() }) {
  const fam = FAMILLES_V2[id]; if (!fam) return { statut: 'aucune', raison: 'agent inconnu' };
  const n = ctx.n, k = i == null ? n - 1 : i; if (k < 400) return { statut: 'aucune', raison: 'historique trop court pour juger' };
  const valide = !!validation && validation.statut === 'valide_oos';
  const sig = fam.signaux(ctx, params), sens = sig.sens[k];
  const base = { id, nom: fam.nom, paire, t: ctx.m15.t[k], etiquette: etiquetteAgent(validation && validation.statut), validation: validation ? validation.statut : 'jamais', fiabilite: FIABILITE_TEXTE };
  if (sens) {
    const entree = ctx.m15.c[k], stop = sig.stop[k], dist = Math.abs(entree - stop), R = sig.R, objectifs = [1.5, 3, R].filter((x, j, a) => a.indexOf(x) === j && x <= R).sort((a, b) => a - b).map(r => ({ R: r, prix: arr(entree + sens * r * dist, 6) }));
    const distancePct = dist / entree * 100, coutR = cout && distancePct > 0 ? (2 * cout.fraisPct + cout.spreadPct + 2 * cout.glissementPct) / distancePct : null;
    const plan = { sens, entree: arr(entree, 6), stop: arr(stop, 6), cible: objectifs[objectifs.length - 1].prix, objectif: objectifs[objectifs.length - 1].prix, paire, nomStrategie: fam.nom };
    if (!valide) return { ...base, statut: 'refusee', sens, plan, raison: 'L’agent est ' + (STATUTS[validation && validation.statut] || 'jamais validé').toLowerCase() + ' : AUCUNE position n’est proposée (un signal est pourtant présent : ' + (sens > 0 ? 'achat' : 'vente') + ' indicatif à ' + entree + '). Lance « Optimiser et valider » ; même validé, rien ne garantit l’avenir.' };
    const gardien = jugerProp ? jugerProp(plan) : null;
    if (gardien && gardien.decision === 'BLOCK') return { ...base, statut: 'bloquee', sens, plan, gardien, raison: gardien.texte };
    return { ...base, statut: 'entree', sens, plan, objectifs, distancePct: arr(distancePct, 3), coutR: coutR == null ? null : arr(coutR, 3), gardien,
      texte: (sens > 0 ? 'ENTRÉE ACHAT' : 'ENTRÉE VENTE') + ' ' + paire + ' · ' + fam.nom + ' · prix indicatif ' + plan.entree + ' · stop ' + plan.stop + ' (' + virgule(arr(distancePct, 2)) + ' %) · objectifs ' + objectifs.map(o => virgule(o.R) + ' R = ' + o.prix).join(', ') + (coutR != null ? ' · coût ' + virgule(arr(coutR, 2)) + ' R' : '') + (gardien ? ' · ' + gardien.texte : '') + ' · ' + etiquetteAgent(validation.statut) + '. Alerte seulement : aucun ordre.' };
  }
  const prep = fam.preparation ? fam.preparation(ctx, params, k) : null;
  if (prep) return { ...base, statut: 'preparation', sens: prep.sens, texte: 'EN PRÉPARATION ' + paire + ' · ' + fam.nom + ' : ' + prep.texte + (valide ? '' : ' (agent non validé : information seulement)') };
  return { ...base, statut: 'aucune', raison: 'pas de setup pour l’instant' };
}

/* Anti-doublon d'alertes : une alerte n'est envoyée que si (agent, paire, statut, sens, bougie) change ; une préparation identique n'est pas répétée avant 4 bougies. Rend la liste à envoyer. */
export function alertesAEnvoyer(propositions, memoire = {}, { maintenant = Date.now(), delaiPrepMs = 4 * 900e3 } = {}) {
  const sortie = [];
  for (const p of propositions) {
    if (p.statut !== 'entree' && p.statut !== 'preparation') continue;
    if (p.statut === 'preparation' && p.validation !== 'valide_oos') continue;          // pas de bruit pour un agent non validé
    const cle = p.id + ':' + p.paire, dernier = memoire[cle];
    if (dernier && dernier.statut === p.statut && dernier.sens === p.sens && (p.statut === 'entree' ? dernier.t === p.t : maintenant - dernier.envoyeLe < delaiPrepMs)) continue;
    memoire[cle] = { statut: p.statut, sens: p.sens, t: p.t, envoyeLe: maintenant };
    sortie.push({ type: p.statut === 'entree' ? 'ENTREE' : 'PREPARATION', texte: p.texte, proposition: p });
  }
  return sortie;
}
