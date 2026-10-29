import { CRITERES3 } from './criteres-v3.js';
import { tauxEquilibre, esperanceProfil } from './couts-r.js';
import { NOMS_V3 } from './familles-v3.js';
import { NOMS_V4 } from './familles-v4.js';
import { NOMS_V6 } from './familles-v6.js';
import { evaluerNiveauResume } from './criteres-v4.js';

/* ═════════════ MEILLEURES PISTES (V6, phase 3 ; module pur, testé : galaxie/tests/pistes-test.mjs) ═════════════
   Transforme les résultats de la recherche (résumés de validation gardés dans l'état de l'agent) en une liste lisible : les 5 meilleures pistes avec taux de réussite, rapport gain / risque moyen,
   taux de réussite d'ÉQUILIBRE (en dessous, la stratégie perd de l'argent après frais), espérance avant / après frais, trades hors échantillon, trades par mois, creux, et la PREUVE MANQUANTE en clair.
   Ce module n'accorde RIEN : il ne valide pas, il ne change aucun seuil. Une piste n'est « prouvée » que si la validation complète (critères v1, v2, v3 + jeu final ouvert une fois) l'a dit.
   Honnêteté : un chiffre issu de la zone de recherche est optimiste (c'est là qu'on a choisi) ; une piste « prometteuse » est une raison de la regarder en direct, jamais une promesse. */
const NOMS = { ...NOMS_V3, ...NOMS_V4, ...NOMS_V6 };
const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));
const nomDe = b => b.nom || NOMS[b.famille] || b.famille;
export const PROFIL_45_RR2 = Object.freeze({ nom: '45 % de réussite, rapport gain / risque ≥ 2', tauxMin: 0.38, tauxMax: 0.55, rrMin: 2 });

/* Statut d'une piste : prouvée (validée par le protocole complet), prometteuse (positive hors échantillon avec des preuves partielles), décevante. */
export function statutPiste(b) {
  if (b.statut === 'validee_backtest' && b.jeuFinal && b.jeuFinal.ok) return { code: 'prouvee', texte: 'PROUVÉE : validée en backtest ET sur le jeu final (ouvert une seule fois)' };
  if (b.statut === 'validee_backtest') return { code: 'validee_backtest', texte: 'VALIDÉE EN BACKTEST : le jeu final n’a pas (encore) confirmé' };
  if (b.statut === 'rejetee_causalite' || b.statut === 'rejetee_auditeur') return { code: 'rejetee', texte: 'REJETÉE (' + (b.statut === 'rejetee_causalite' ? 'elle regardait le futur' : 'l’Auditeur l’a cassée') + ')' };
  if (b.esperance != null && b.esperance > 0.10 && b.trades >= 60) return { code: 'prometteuse', texte: 'PROMETTEUSE, NON PROUVÉE : positive hors échantillon mais des preuves manquent' };
  return { code: 'decevante', texte: 'DÉCEVANTE : pas d’avantage net démontré' };
}

/* La preuve manquante, critère par critère, avec une estimation du temps pour les trades. `b` = résumé de validation. */
export function preuveManquante(b, c3 = CRITERES3) {
  const manques = [], n = b.trades || 0, tMin = c3.horsEchantillon.tradesMin, pm = b.moisTest > 0 ? n / b.moisTest : (b.zone && b.zone.mois > 12 ? n / (b.zone.mois - 12) : null);
  if (n < tMin) {
    const reste = tMin - n, semaines = pm > 0 ? reste / pm * 4.345 : null;
    manques.push({ critere: 'trades', texte: 'il manque ' + reste + ' trades hors échantillon (' + n + ' sur ' + tMin + ')' + (semaines != null ? ', environ ' + (semaines < 1.5 ? 'une semaine' : semaines < 9 ? Math.round(semaines) + ' semaines' : Math.round(semaines / 4.345) + ' mois') + ' au rythme actuel (' + fr(pm, 1) + ' par mois) — de NOUVELLES données, donc via la simulation en direct ou le jeu final, pas la zone de recherche déjà utilisée' : ''), reste, semaines });
  }
  if (b.esperance != null && b.esperance < c3.horsEchantillon.esperanceMin) manques.push({ critere: 'esperance', texte: 'l’espérance nette est de ' + fr(b.esperance) + ' R par trade ; il en faut ' + fr(c3.horsEchantillon.esperanceMin) + ' R' });
  if (b.bootstrapBas != null && !(b.bootstrapBas > c3.bootstrap.basMin)) manques.push({ critere: 'confiance', texte: 'à 95 % de confiance l’espérance pourrait être nulle ou négative (borne basse ' + fr(b.bootstrapBas) + ' R)' });
  if (b.dsr != null && b.dsr < c3.deflation.dsrMin) manques.push({ critere: 'hasard', texte: 'probabilité que ce ne soit pas du hasard, compte tenu du nombre de variantes testées : ' + Math.round(b.dsr * 100) + ' % (il en faut ' + Math.round(c3.deflation.dsrMin * 100) + ' %)' });
  if (b.propDdPct != null && b.propDdPct > c3.prop.drawdownMaxPct) manques.push({ critere: 'creux', texte: 'creux simulé de ' + fr(b.propDdPct, 1) + ' % (limite du compte prop : ' + c3.prop.drawdownMaxPct + ' %)' });
  for (const r of b.ratees || []) { if (/Voisins|Médiane des voisins/.test(r)) { if (!manques.some(m => m.critere === 'voisins')) manques.push({ critere: 'voisins', texte: 'le résultat n’est pas stable quand on bouge un peu les paramètres' }); } else if (/Régimes/.test(r)) manques.push({ critere: 'regimes', texte: 'positive dans moins de deux régimes de marché' }); else if (/Actifs positifs/.test(r)) manques.push({ critere: 'actifs', texte: 'pas positive sur au moins deux actifs avec les mêmes paramètres' }); }
  const vus = new Set(); return manques.filter(m => (vus.has(m.critere + m.texte) ? false : vus.add(m.critere + m.texte)));
}

/* Une ligne par (famille, actif) : la MEILLEURE évaluation connue, avec toutes les mesures. */
export function pistesDepuis(backtests, { c3 = CRITERES3, nMin = 20 } = {}) {
  const m = new Map();
  for (const b of backtests || []) {
    if (b.esperance == null || b.trades == null || b.trades < nMin || b.statut === 'rejetee_causalite') continue;
    const k = b.famille + ':' + b.paire, e = m.get(k), cle = x => (x.bootstrapBas != null ? x.bootstrapBas : x.esperance * 0.5 - 0.2) + (statutPiste(x).code === 'prouvee' ? 100 : 0);
    if (!e || cle(b) > cle(e)) m.set(k, b);
  }
  return [...m.values()].map(b => {
    const p = b.tauxReussite, rr = b.rrMoyen != null ? b.rrMoyen : (p > 0 && p < 1 && b.factProfit != null && Number.isFinite(b.factProfit) ? b.factProfit * (1 - p) / p : null), couts = b.coutMoyenR, st = statutPiste(b), manque = preuveManquante(b, c3);
    return { id: b.id || b.famille + ':' + b.paire, famille: b.famille, nom: nomDe(b), paire: b.paire, statut: st, tauxReussite: p, rrMoyen: rr, tauxEquilibre: rr != null && couts != null ? tauxEquilibre(rr, couts) : null, coutMoyenR: couts, esperanceApres: b.esperance,
      esperanceAvant: couts != null && b.esperance != null ? b.esperance + couts : null, trades: b.trades, tradesParMois: b.moisTest > 0 ? b.trades / b.moisTest : (b.zone && b.zone.mois > 12 ? b.trades / (b.zone.mois - 12) : null), ddR: b.ddR, ddPct: b.propDdPct, dsr: b.dsr, bootstrapBas: b.bootstrapBas,
      retenus: b.retenus || null, manque, nVariantes: b.nVariantes, jeuFinal: b.jeuFinal ? { ok: !!b.jeuFinal.ok, ouvert: !!b.jeuFinal.ouvert } : null, enPepiniere: false, t: b.t || null,
      niveaux: { strict: evaluerNiveauResume(b, { version: 'strict' }), equilibre: evaluerNiveauResume(b, { version: 'equilibre' }) } };   // V7 : « validée au niveau strict ? équilibré ? pourquoi pas »
  });
}
const rang = p => (p.statut.code === 'prouvee' ? 4 : p.statut.code === 'validee_backtest' ? 3 : p.statut.code === 'prometteuse' ? 2 : p.statut.code === 'decevante' ? 1 : 0);
/* Les `n` meilleures pistes : d'abord les prouvées, puis les prometteuses, classées par la borne BASSE de confiance (jamais par une espérance brute chanceuse), puis par le nombre de trades. */
export function meilleuresPistes(backtests, { n = 5, c3 = CRITERES3, inclureDecevantes = true } = {}) {
  const l = pistesDepuis(backtests, { c3 }).filter(p => p.statut.code !== 'rejetee' && (inclureDecevantes || p.statut.code !== 'decevante'));
  l.sort((a, b) => rang(b) - rang(a) || ((b.bootstrapBas != null ? b.bootstrapBas : b.esperanceApres * 0.5 - 0.2) - (a.bootstrapBas != null ? a.bootstrapBas : a.esperanceApres * 0.5 - 0.2)) || b.trades - a.trades);
  return l.slice(0, n);
}
/* Filtre « profil » : taux de réussite dans une plage ET rapport gain / risque moyen réalisé au moins `rrMin`. Chaque piste dit en plus ce qui est PROUVÉ et ce qui est seulement PROMETTEUR. */
export function filtrerProfil(pistes, profil = PROFIL_45_RR2) {
  return pistes.filter(p => p.tauxReussite != null && p.rrMoyen != null && p.tauxReussite >= profil.tauxMin && p.tauxReussite <= profil.tauxMax && p.rrMoyen >= profil.rrMin)
    .map(p => ({ ...p, profil: profil.nom, honnetete: p.statut.code === 'prouvee' ? 'prouvé par le protocole complet' : p.statut.code === 'validee_backtest' ? 'validé en backtest, jeu final à confirmer' : p.statut.code === 'prometteuse' ? 'seulement prometteur : ' + (p.manque.length ? p.manque[0].texte : 'preuves à compléter') : 'pas démontré' }));
}
/* Le profil de Justin donne-t-il, avec ces frais, l'espérance visée ? (information, pas un critère) */
export const espereProfil = (coutMoyenR, p = 0.45, rr = 2) => ({ esperance: esperanceProfil(p, rr, coutMoyenR || 0), tauxEquilibre: tauxEquilibre(rr, coutMoyenR || 0) });

export function phrasePiste(p) {
  const l = [p.nom + ' sur ' + p.paire + ' (' + p.statut.texte + ')'];
  l.push('réussite ' + (p.tauxReussite == null ? '—' : Math.round(p.tauxReussite * 100) + ' %') + ', gain moyen / perte moyenne ' + fr(p.rrMoyen, 1) + ' (équilibre à ' + (p.tauxEquilibre == null ? '—' : Math.round(p.tauxEquilibre * 100) + ' %') + '), ' + fr(p.esperanceAvant) + ' R avant frais, ' + fr(p.esperanceApres) + ' R après (frais ' + fr(p.coutMoyenR) + ' R), ' + p.trades + ' trades hors échantillon' + (p.tradesParMois != null ? ' (' + fr(p.tradesParMois, 1) + ' par mois)' : '') + '.');
  if (p.manque.length) l.push('Preuve manquante : ' + p.manque.slice(0, 3).map(m => m.texte).join(' ; ') + '.');
  return l;
}
/* Lignes pour le rapport quotidien : la meilleure piste, sa preuve manquante, les frais moyens. */
export function lignesRapportPistes(pistes, fraisPhrase = null) {
  const L = [], p = pistes[0];
  if (p) { L.push('Meilleure piste : ' + p.nom + ' sur ' + p.paire + ' — ' + fr(p.esperanceApres) + ' R par trade après frais sur ' + p.trades + ' trades hors échantillon (' + p.statut.texte.split(':')[0].toLowerCase() + ').'); if (p.manque.length) L.push('Preuve manquante : ' + p.manque.slice(0, 2).map(m => m.texte).join(' ; ') + '.'); }
  else L.push('Aucune piste chiffrée pour l’instant.');
  if (fraisPhrase) L.push(fraisPhrase);
  return L;
}
