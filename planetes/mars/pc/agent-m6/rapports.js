import { construireSante } from './sante.js';
import { STATUTS_IDEE } from './idees.js';

/* ═════════════ RAPPORTS DE L'AGENT À RAYLÉ (M6 ; module pur, testé : planetes/mars/tests/m6-etat-test.mjs) ═════════════
   Rayle est la SEULE voix : l'agent ne dialogue pas avec toi, il remet à Rayle des données structurées, et Rayle te les explique. Ce module transforme ces données en phrases PARLÉES, par modèles de
   phrases, sans IA. Une explication libre (« pourquoi le marché fait ça ? ») reste une question à l'IA de Raylé, comme avant. Chaque rapport dit ce qu'il ne sait pas, et rappelle que
   ce n'est pas un conseil financier quand il parle de décisions. */
export const SUJETS_RAPPORT = Object.freeze(['gardien', 'controle', 'tilt', 'simulation', 'regime', 'bilan', 'sante', 'recherche', 'journal', 'idees']);
const nbf = x => Math.round(x).toLocaleString('fr-FR');
const NOM = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };

/* ctx = { m6 (vue de l'état global), pilotes: { BTC: vue du pilote, … }, regimes: { BTC: régime, … }, simulation: résultat ou null, sante: entrées de santé, paire } */
export function rapport(sujet, ctx) {
  const m6 = ctx.m6;
  switch (sujet) {
    case 'gardien': return { texte: m6.gardien.phrase + (m6.regles.modeDrawdown === 'fixe' ? '' : ' Drawdown suiveur sur l’équité (le plus strict).') + ' Ce n’est pas un conseil financier : le gardien mesure, il ne passe aucun ordre.', ouvrir: 'gardien' };
    case 'controle': return peutTrader(ctx);
    case 'tilt': return { texte: m6.tilt.phrase, ouvrir: 'tilt' };
    case 'simulation': {
      const s = ctx.simulation;
      if (!s) return { texte: 'Je n’ai pas encore de simulation. Ouvre l’onglet « Simulation d’évaluation » et choisis une stratégie : je rejouerai des milliers de scénarios avec tes limites.', ouvrir: 'simulation' };
      return s.ok ? { texte: s.phrases.slice(0, 3).join(' ') + ' ' + s.avertissement, ouvrir: 'simulation' } : { texte: 'Je ne peux pas simuler : ' + s.erreur + '.', ouvrir: 'simulation' };
    }
    case 'regime': {
      const p = ctx.paire || 'BTC', r = ctx.regimes && ctx.regimes[p];
      return r && r.ok ? { texte: r.phrase, ouvrir: 'regime' } : { texte: 'Je n’ai pas de régime de marché pour ' + (NOM[p] || p) + (r && r.erreur ? ' : ' + r.erreur : ' : active l’agent pour télécharger l’historique') + '.', ouvrir: 'regime' };
    }
    case 'bilan': { const b = ctx.bilan; return { texte: b ? b.phrase + (b.regles && b.regles.length ? ' Règles pour la prochaine session : ' + b.regles.join(' ') : '') : 'Pas de bilan : le journal est vide.', ouvrir: 'journal' }; }
    case 'sante': { const s = construireSante(ctx.sante || {}, ctx.maintenant || Date.now()); const pb = s.lignes.filter(l => l.etat === 'ko' || l.etat === 'attention'); return { texte: s.phrase + (pb.length ? ' ' + pb.slice(0, 3).map(l => l.nom + ' : ' + l.detail).join(' ; ') + '.' : ''), ouvrir: 'sante' }; }
    case 'recherche': {
      const l = Object.entries(ctx.pilotes || {}).filter(([, v]) => v && v.recherche).map(([p, v]) => {
        const r = v.recherche; return (NOM[p] || p) + ' : ' + nbf(r.N) + ' variantes testées, ' + r.valideesComptees + ' stratégie(s) validée(s) sur ' + r.cible + (r.pause ? ', en pause' : r.objectifAtteint ? ', objectif atteint' : '') + (r.stagnation && r.stagnation.stagne ? ', STAGNE (je change de famille)' : '') + (r.focus ? ', famille actuelle : ' + r.focus : '');
      });
      return { texte: l.length ? l.join('. ') + '. Plus il y a de variantes testées, plus le seuil du hasard monte : l’absence de stratégie validée est un résultat honnête.' : 'L’agent n’est activé sur aucune paire.', ouvrir: 'ensemble' };
    }
    case 'journal': { const n = m6.nJournal; return { texte: n ? 'Ton journal contient ' + n + ' trade(s). ' + (m6.tilt.niveau !== 'VERT' ? m6.tilt.phrase : 'Aucun signal de tilt.') : 'Ton journal est vide : ajoute un trade ou importe un fichier CSV.', ouvrir: 'journal' }; }
    case 'idees': {
      const c = {}; for (const i of m6.idees) c[i.statut] = (c[i.statut] || 0) + 1; const t = Object.entries(c).map(([k, n]) => n + ' ' + (STATUTS_IDEE[k] || k).split(' :')[0]);
      return { texte: m6.idees.length ? 'Bibliothèque d’idées : ' + m6.idees.length + ' idée(s) — ' + t.join(', ') + '.' : 'La bibliothèque est vide : ajoute une idée ou charge le catalogue des projets open source.', ouvrir: 'idees' };
    }
    default: return { texte: 'Je ne connais pas ce rapport.' };
  }
}

/* « Ai-je le droit de prendre un trade ? » : le gardien, le tilt, puis chaque setup de l'agent jugé par le contrôle en 9 points. */
function peutTrader(ctx) {
  const m6 = ctx.m6, g = m6.gardien, t = m6.tilt, p = [];
  if (g.niveau === 'BLOQUE') return { texte: 'Non. ' + g.decision + ' ' + g.phrases[0], ouvrir: 'gardien' };
  if (g.coupeCircuit.actif) return { texte: 'Non, pas maintenant. ' + g.decision, ouvrir: 'gardien' };
  if (t.niveau === 'ROUGE') return { texte: 'Non. ' + t.phrase, ouvrir: 'tilt' };
  if (!g.assezDeMarge) return { texte: 'Non, pas de nouveau setup : ' + g.decision + ' ' + g.phrases[0], ouvrir: 'gardien' };
  p.push(t.niveau === 'ORANGE' ? 'Prudence : ' + t.phrase : 'Le gardien ne s’y oppose pas.');
  p.push(g.phrases[0]);
  const juges = (ctx.jugements || []);
  if (juges.length) for (const j of juges.slice(0, 3)) p.push((NOM[j.paire] || j.paire) + ', ' + j.nomStrategie + ' : ' + j.texte);
  else p.push('Je n’ai aucun setup à te proposer en ce moment : pas de setup, pas de trade.');
  p.push('Ce n’est pas un conseil financier, et aucun ordre n’est passé.');
  return { texte: p.join(' '), ouvrir: 'gardien' };
}
