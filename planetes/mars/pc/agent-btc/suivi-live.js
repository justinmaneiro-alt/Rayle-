import { FAMILLES } from './hypotheses.js';
import './familles-m5.js';
import { approcheRegle } from './regles-lab.js';
import { appliquerContraintes } from './profil-agent.js';
import { evaluerBougie, fusionConfig, ouvrirPosition, resultatPosition, semaineUTC } from './moteur.js';

/* ═════════════ SUIVI EN DIRECT DE PLUSIEURS STRATÉGIES (M5 ; module pur, testé : m5-live-test.mjs) ═════════════
   À chaque bougie M15 FERMÉE : pour chaque stratégie ACTIVE (validée, confirmée ou en surveillance, jamais suspendue ni en recherche), on cherche un signal sur la dernière bougie de la fenêtre,
   on applique les limites globales (une position à la fois par défaut, maximum par semaine, repos), puis on propose ENTRÉE ou PRÉPARATION en indiquant la stratégie d'origine.
   Le compte simulé suit chaque position proposée jusqu'à son résultat avec EXACTEMENT la logique d'exécution du backtest (moteur.js) : ses résultats sont toujours séparés de ceux
   de l'entraînement et du hors échantillon. Aucun ordre réel n'existe. Les trades clos alimentent la détection de dérive (derive.js).
   Un seul signal est retenu par bougie : si plusieurs stratégies signalent en même temps, la première de la liste (la plus ancienne validée) passe et les autres sont notées « écartées : position déjà proposée ». */
const PAS = 900e3, ACTIFS = ['validee', 'confirmee', 'surveillance'];
const fmtNb = x => Math.round(x).toLocaleString('fr-FR');

export const compteVide = () => ({ ouvertes: [], fermees: [], attente: [] });
export const estSuivie = s => !!s && s.active && ACTIFS.includes(s.statut);

/* Signaux d'une stratégie sur la fenêtre `ctx` (calculés sur toute la fenêtre, lus à l'index j). */
export function signauxStrategie(ctx, strat, profil = null) {
  const F = FAMILLES[strat.famille]; if (!F) return null;
  const params = strat.famille === 'regle' ? strat.regle || strat.params : strat.params;
  return appliquerContraintes(ctx, F.signaux(ctx, params), profil);
}
/* Limites globales avant de PROPOSER un trade. Rend null si tout va bien, sinon la raison (en français). */
export function motifLimite(compte, alertes, t, profil) {
  if (compte.ouvertes.length + compte.attente.length >= profil.maxSimultanees) return 'une position simulée est déjà en cours ou en attente (' + profil.maxSimultanees + ' à la fois au plus)';
  const sem = semaineUTC(t), entrees = alertes.filter(a => a.type === 'ENTREE' && semaineUTC(a.tSignal) === sem).length;
  if (entrees >= profil.maxParSemaine) return 'limite de ' + profil.maxParSemaine + ' position(s) par semaine atteinte (' + entrees + ' cette semaine)';
  const derniere = compte.fermees.length ? Math.max(...compte.fermees.map(x => x.tSortie)) : -Infinity;
  if (t - derniere < profil.reposHeures * 3600e3) return 'repos de ' + profil.reposHeures + ' h après la dernière sortie';
  return null;
}
/* Analyse la dernière bougie de la fenêtre pour toutes les stratégies suivies. Rend { alertes:[], setups:{id: {statut, raison…}}, ecartees:[] }. Ne modifie rien. */
export function detecterSetups({ ctx, strategies, compte, alertes = [], profil, config = {}, phase = null }) {
  const j = ctx.n - 1, tBarre = ctx.m15.t[j], cfg = fusionConfig({ risquePct: profil.risquePct, ...config }), res = { alertes: [], setups: {}, ecartees: [] };
  const motif = motifLimite(compte, alertes, tBarre, profil);
  let proposee = false;
  for (const strat of strategies.filter(estSuivie)) {
    const sig = signauxStrategie(ctx, strat, profil);
    if (!sig) { res.setups[strat.id] = { statut: 'aucun', raison: 'Famille inconnue : ' + strat.famille }; continue; }
    if (sig.sens[j] !== 0) {
      const sens = sig.sens[j], px = ctx.m15.c[j], stop = sig.stop[j], dist = Math.abs(px - stop), pos = ouvrirPosition(cfg, sens, px, stop, sig.R);
      if (!pos) { res.setups[strat.id] = { statut: 'aucun', raison: 'Signal ignoré : stop trop proche ou trop loin du prix (hors des limites de risque).' }; continue; }
      if (motif) { res.setups[strat.id] = { statut: 'bloque', sens, raison: 'Signal détecté mais non proposé : ' + motif + '.' }; continue; }
      if (proposee) { res.ecartees.push({ id: strat.id, nom: strat.nom, raison: 'une autre stratégie a déjà proposé une position sur cette bougie' }); res.setups[strat.id] = { statut: 'bloque', sens, raison: 'Signal écarté : une autre stratégie a déjà proposé une position sur cette bougie.' }; continue; }
      const capital = profil.capital, risque = capital * profil.risquePct / 100, qte = risque / pos.dist;
      const a = { id: 'E:' + strat.id + ':' + tBarre, type: 'ENTREE', paire: profil.paire || 'BTC', strategie: strat.id, nomStrategie: strat.nom, statutStrategie: strat.statut, validee: true, t: tBarre + PAS, tSignal: tBarre, sens, entree: px, stop, cible: px + sens * sig.R * dist, R: sig.R,
        risquePct: profil.risquePct, risqueCash: risque, quantite: qte, notionnel: qte * px, distancePct: dist / px * 100, phase,
        invalidation: 'Le setup n’est plus valable si le prix touche ' + fmtNb(stop) + ' avant l’entrée, ou si l’entrée n’est pas prise dans les deux bougies M15 qui suivent.',
        texte: strat.nom + ' · ' + (sens > 0 ? 'ACHAT' : 'VENTE') + ' ' + (profil.nomActif || 'Bitcoin') + ' vers ' + fmtNb(px) + ' · stop ' + fmtNb(stop) + ' · objectif ' + fmtNb(px + sens * sig.R * dist) + ' (' + sig.R + ' R)' + (strat.statut === 'validee' ? ' · en confirmation réelle en cours' : strat.statut === 'surveillance' ? ' · EN SURVEILLANCE' : '') };
      res.alertes.push(a); res.setups[strat.id] = { statut: 'entree', ...a }; proposee = true; continue;
    }
    let ap = null;
    if (strat.famille === 'regle') ap = approcheRegle(ctx, strat.regle || strat.params, j);
    else if (FAMILLES[strat.famille].approche) { const x = FAMILLES[strat.famille].approche(ctx, strat.params, j); ap = x && { sens: x.sens, manque: [x.texte], reunies: [] , niveau: x.niveau }; }
    if (ap && !motif) {
      const a = { id: 'P:' + strat.id + ':' + ap.sens + ':' + Math.floor(tBarre / 3600e3), type: 'PREPARATION', paire: profil.paire || 'BTC', strategie: strat.id, nomStrategie: strat.nom, statutStrategie: strat.statut, validee: true, t: tBarre + PAS, tSignal: tBarre, sens: ap.sens, niveau: ap.niveau || null, prix: ctx.m15.c[j], phase,
        texte: 'PRÉPARATION · ' + strat.nom + ' : ' + (ap.reunies && ap.reunies.length ? 'conditions réunies (' + ap.reunies.join(' ; ') + '), il manque : ' : '') + ap.manque.join(' ; ') };
      res.alertes.push(a); res.setups[strat.id] = { statut: 'preparation', ...a };
    } else res.setups[strat.id] = { statut: 'aucun', raison: motif ? 'Pas de setup : ' + motif + '.' : 'Pas de setup : les conditions de la stratégie ne sont pas réunies.' };
  }
  return res;
}
/* Enregistre les alertes ENTRÉE comme ordres en attente d'exécution (à l'ouverture de la bougie suivante). */
export function planifierEntrees(compte, alertes) {
  for (const a of alertes) if (a.type === 'ENTREE' && !compte.attente.some(x => x.id === a.id)) compte.attente.push({ id: a.id, strategie: a.strategie, tSignal: a.tSignal, sens: a.sens, stop: a.stop, R: a.R });
}
/* Avance le compte simulé d'une bougie fermée { t, o, h, l, c }. Rend les trades CLOS pendant cette bougie ([{ strategie, R, … }]). */
export function avancerCompte(compte, bougie, { profil, config = {} }) {
  const cfg = fusionConfig({ risquePct: profil.risquePct, ...config }), clos = [];
  for (const a of compte.attente.slice()) {
    if (bougie.t < a.tSignal + PAS) continue;
    compte.attente = compte.attente.filter(x => x !== a);
    if (bougie.t > a.tSignal + PAS) { a.annule = 'signal trop ancien (l’application n’a pas tourné)'; continue; }
    const pos = ouvrirPosition(cfg, a.sens, bougie.o, a.stop, a.R); if (!pos) { a.annule = 'distance au stop hors limites à l’exécution'; continue; }
    const capital = profil.capital + compte.fermees.reduce((s, x) => s + x.pnl, 0), risque = capital * profil.risquePct / 100;
    compte.ouvertes.push({ ...a, pos, entreeT: bougie.t, risqueCash: risque, quantite: risque / pos.dist, detenues: 0 });
  }
  for (const p of compte.ouvertes.slice()) {
    p.detenues++; const ex = evaluerBougie(cfg, p.pos, bougie, p.detenues === 1, p.detenues); if (!ex) continue;
    const r = resultatPosition(cfg, p.pos, ex.prix); compte.ouvertes = compte.ouvertes.filter(x => x !== p);
    const trade = { id: p.id, strategie: p.strategie, t: p.entreeT, tSortie: bougie.t + PAS, sens: p.sens, prixEntree: p.pos.fill, stop: p.pos.stop, cible: p.pos.cible, prixSortie: ex.prix, motif: ex.motif, R: r.R, risqueCash: p.risqueCash, pnl: p.risqueCash * r.R, barres: p.detenues, distancePct: p.pos.pct };
    compte.fermees.push(trade); clos.push(trade);
  }
  if (compte.fermees.length > 1000) compte.fermees.splice(0, compte.fermees.length - 1000);
  return clos;
}
