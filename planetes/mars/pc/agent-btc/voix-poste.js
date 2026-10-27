import { expliquerTrade } from './contexte-trades.js';

/* ═════════════ VOIX DU POSTE DE PILOTAGE (M5 ; module pur, testé : m5-voix-test.mjs) ═════════════
   Détecte les phrases qui concernent l'agent Bitcoin et construit les réponses PARLÉES à partir des données de l'agent (modèles de phrases, zéro IA). Seule exception : « donne une idée à l'agent »
   suivie d'un texte est envoyée UNE fois au Worker pour traduction (côté page), et la règle traduite n'est testée qu'après « valide l'idée ».
   Phrases prises : « ouvre l'agent », « montre-moi les stratégies », « pourquoi cette stratégie a perdu ? », « quand marche-t-elle ? », « montre le dernier trade sur le graphique »,
   « suspends la stratégie X », « où en est la recherche ? », « donne une idée à l'agent (: …) », « valide l'idée », « refuse l'idée ». `n0` = phrase normalisée (minuscules, sans accents ni ponctuation). */
const AGENT = /\b(?:agent|agents|strategies?|poste de pilotage|recherche de strategie|la recherche|l idee|idee a l agent)\b/;
const nb = (x, d = 1) => (x == null || !Number.isFinite(x) ? 'inconnu' : x.toFixed(d).replace('.', ','));
const pluriel = (n, s, p) => n + ' ' + (n > 1 ? p : s);

export function detecter(n0, { fenetreOuverte = false } = {}) {
  const t = String(n0 || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’\-\/]/g, ' ').replace(/[?!.,;…«»"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const btc = /\b(?:agent|bitcoin|btc)\b/.test(t), strat = /\bstrategies?\b/.test(t), contexte = btc || strat || fenetreOuverte;
  // idées
  let m;
  if ((m = t.match(/\bdonne(?:r)? (?:une |l )?idee a l agent\b\s*(.*)$/)) || (m = t.match(/\bj ai une idee pour l agent\b\s*(.*)$/))) return { type: 'idee_donner', texte: (m[1] || '').replace(/^(?:que|c est|:)\s*/, '').trim() };
  if (/\b(?:valide|teste|lance)\b.*\bl idee\b|\bl idee\b.*\b(?:est bonne|c est bon)\b/.test(t)) return { type: 'idee_valider' };
  if (/\b(?:refuse|annule|supprime|oublie)\b.*\bl idee\b/.test(t)) return { type: 'idee_refuser' };
  if (/\bidee\b/.test(t) && /\b(?:agent|strategie)\b/.test(t) && /\b(?:donne|donner)\b/.test(t)) return { type: 'idee_donner', texte: '' };
  // V1 : « teste ma stratégie » (onglet où l'utilisatrice décrit SA règle et la fait tester contre le hasard)
  if (/\b(?:teste|tester|testez)\b.*\b(?:ma|mes|une|la|cette) strategies?\b/.test(t) || /\bteste ma strategie\b/.test(t)) return { type: 'teste' };
  // ouverture
  if (/\b(?:ouvre|ouvrir|affiche|afficher|montre|montrer|lance|va sur)\b.*\b(?:agent|poste de pilotage)\b/.test(t) && !/\bstrategies?\b/.test(t) && !/\brecherche\b/.test(t) && !/\bdernier trade\b/.test(t)) return { type: 'ouvrir' };
  if (/\b(?:montre|montrer|affiche|afficher|ouvre|ouvrir|liste)\b.*\bstrategies?\b/.test(t) && contexte) return { type: 'strategies' };
  if (/\bdernier trade\b/.test(t) && /\b(?:graphique|montre|affiche)\b/.test(t) && contexte) return { type: 'dernier_trade' };
  if (/\bpourquoi\b.*\b(?:perdu|perd|perdante|rate|echoue)\b/.test(t) && contexte) return { type: 'perdu', nom: nomDe(t) };
  if (/\bpourquoi\b.*\b(?:gagne|gagnante|marche|reussi)\b/.test(t) && contexte && /\bstrategie|trade\b/.test(t)) return { type: 'gagne', nom: nomDe(t) };
  if (/\bquand\b.*\b(?:marche|fonctionne|gagne|perd|ne marche pas)\b/.test(t) && contexte && (/\b(?:elle|cette strategie|la strategie|ca)\b/.test(t) || strat)) return { type: 'quand', nom: nomDe(t) };
  if (/\b(?:suspend|suspends|suspendre|stoppe|arrete|desactive|mets en pause)\b.*\bstrategie\b/.test(t)) return { type: 'suspendre', nom: nomDe(t) };
  if (/\bou en est\b.*\brecherche\b|\brecherche\b.*\b(?:avance|en cours)\b|\betat de la recherche\b/.test(t) && (btc || /\bstrategie|agent\b/.test(t) || fenetreOuverte)) return { type: 'recherche' };
  if (/\b(?:pause|arrete|stoppe)\b.*\brecherche\b/.test(t) && (btc || strat)) return { type: 'recherche_pause' };
  if (/\b(?:reprends|reprend|relance|redemarre)\b.*\brecherche\b/.test(t) && (btc || strat)) return { type: 'recherche_reprise' };
  return null;
}
/* Extrait un fragment de nom de stratégie : « suspends la stratégie retour poc » → « retour poc ». */
function nomDe(t) { const m = t.match(/\bstrategie\s+(?!a perdu|a gagne|perd|marche)(?:s\d+\b|(.+))$/); const x = (m && m[1] || '').replace(/\b(?:a perdu|a gagne|s il te plait|stp|svp)\b/g, '').trim(); return x.length > 2 ? x : null; }

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/* Trouve la stratégie visée : par fragment de nom, sinon la dernière concernée (dernier trade), sinon la seule active. */
export function trouverStrategie(vue, nom, trades = []) {
  const liste = vue.strategies.filter(s => s.statut !== 'rejetee');
  if (nom) { const mots = norm(nom).split(/\s+/).filter(w => w.length > 2); const s = liste.find(x => mots.length && mots.every(w => norm(x.nom).includes(w))) || liste.find(x => mots.some(w => norm(x.nom).includes(w))); if (s) return { s, certain: true }; }
  const dernier = trades.slice().sort((a, b) => b.t - a.t)[0]; if (dernier) { const s = liste.find(x => x.id === dernier.strategie); if (s) return { s, certain: false }; }
  const actives = liste.filter(x => x.active); if (actives.length === 1) return { s: actives[0], certain: false };
  return { s: null, certain: false, candidates: liste };
}

/* Réponse parlée. `ctx` = { vue, trades(), diagnostic(id, source), ideeEnAttente() } (fournis par la page). Rend { texte, ouvrir?: 'ensemble'|…, commande?: {…}, graphiqueDernier?: true }. */
export function repondre(det, ctx) {
  const v = ctx.vue, r = v.recherche;
  switch (det.type) {
    case 'teste': return { texte: 'Voici « Teste ma stratégie ». Décris ta règle avec des blocs ou en français : je la teste contre le hasard, avec les frais, et rien n’est appliqué sans ta validation.', ouvrir: 'teste' };
    case 'ouvrir': return { texte: 'Voici le poste de pilotage de l’agent Bitcoin. ' + etatCourt(v), ouvrir: 'ensemble' };
    case 'strategies': {
      const l = v.strategies.filter(s => s.statut !== 'rejetee');
      if (!l.length) return { texte: 'Aucune stratégie dans la bibliothèque pour l’instant. L’agent cherche, ' + pluriel(r.N, 'variante testée', 'variantes testées') + '.', ouvrir: 'strategies' };
      return { texte: 'Il y a ' + pluriel(l.length, 'stratégie', 'stratégies') + ' : ' + l.map(s => s.nom + ', ' + s.statutLibelle.toLowerCase() + (s.horsEchantillon ? ', ' + nb(s.horsEchantillon.Rtotal) + ' R net hors échantillon sur ' + s.horsEchantillon.n + ' trades' : '')).join(' ; ') + '.', ouvrir: 'strategies' };
    }
    case 'dernier_trade': { const t = ctx.trades().sort((a, b) => b.t - a.t)[0]; return t ? { texte: 'Voici le dernier trade : ' + (t.sens > 0 ? 'un achat' : 'une vente') + ' de ' + t.nomStrategie + ', ' + (t.R > 0 ? 'gagnant' : 'perdant') + ' de ' + nb(Math.abs(t.R), 2) + ' R.', ouvrir: 'graphique', graphiqueDernier: true } : { texte: 'Aucune stratégie n’a encore de trade à montrer.' }; }
    case 'perdu': case 'gagne': {
      const trades = ctx.trades(), { s, candidates } = trouverStrategie(v, det.nom, trades); if (!s) return { texte: candidates && candidates.length ? 'Quelle stratégie ? Dis par exemple : pourquoi ' + candidates[0].nom + ' a perdu.' : 'Je n’ai aucune stratégie à expliquer.' };
      const siens = trades.filter(x => x.strategie === s.id).sort((a, b) => b.t - a.t), cible = siens.find(x => (det.type === 'perdu' ? x.R <= 0 : x.R > 0)); if (!cible) return { texte: s.nom + ' n’a aucun trade ' + (det.type === 'perdu' ? 'perdant' : 'gagnant') + ' enregistré.' };
      const e = expliquerTrade(cible, s.nom), dg = ctx.diagnostic(s.id, 'oos');
      let plus = ''; if (dg) { const mauvais = dg.resume.find(p => /^Quand ça ne marche pas/.test(p)); if (det.type === 'perdu' && mauvais) plus = ' ' + mauvais; }
      return { texte: 'Le dernier trade ' + (det.type === 'perdu' ? 'perdant' : 'gagnant') + ' de ' + s.nom + ' : ' + e.pris + ' ' + e.fin + plus, ouvrir: 'graphique', trade: { strategie: s.id, t: cible.t } };
    }
    case 'quand': {
      const { s } = trouverStrategie(v, det.nom, ctx.trades()); if (!s) return { texte: 'Je n’ai pas de stratégie à analyser pour l’instant.' };
      const dg = ctx.diagnostic(s.id, 'oos'); if (!dg) return { texte: s.nom + ' n’a pas encore assez de trades pour un diagnostic.' };
      return { texte: s.nom + ' : ' + dg.resume.join(' ') + ' Ce sont des sous-groupes : à prendre comme des pistes, pas comme des règles.', ouvrir: 'diagnostic' };
    }
    case 'suspendre': {
      const { s, certain, candidates } = trouverStrategie(v, det.nom, []); if (!s) return { texte: candidates && candidates.length ? 'Quelle stratégie veux-tu suspendre ? Il y a : ' + candidates.map(x => x.nom).join(', ') + '.' : 'Il n’y a aucune stratégie à suspendre.' };
      if (!['validee', 'confirmee', 'surveillance'].includes(s.statut)) return { texte: s.nom + ' est ' + s.statutLibelle.toLowerCase() + ' : il n’y a rien à suspendre.' };
      return { texte: 'C’est fait : ' + s.nom + ' est suspendue, elle n’émettra plus aucun signal. Tu pourras la réactiver depuis l’onglet Stratégies.', commande: { type: 'suspendre', id: s.id, raison: 'suspendue à la voix' } };
    }
    case 'recherche': {
      const dernier = r.dernierChantier ? ' Dernière idée examinée : ' + r.dernierChantier.nom + '.' : '';
      const valid = r.valideesComptees ? pluriel(r.valideesComptees, 'stratégie validée', 'stratégies validées') + ' sur ' + r.cible + ' visées' : 'aucune stratégie validée sur ' + r.cible + ' visées';
      return { texte: 'La recherche ' + (v.rechercheEnCours ? 'tourne' : r.pause ? 'est en pause' : r.objectifAtteint ? 'a atteint son objectif' : 'est à l’arrêt') + ' : ' + pluriel(r.N, 'variante testée', 'variantes testées') + ', niveau « ' + r.niveauNom + ' », ' + valid + '.' + dernier + ' Plus on teste de variantes, plus le seuil du hasard monte.', ouvrir: 'ensemble' };
    }
    case 'recherche_pause': return { texte: 'La recherche est en pause.', commande: { type: 'recherche_pause' } };
    case 'recherche_reprise': return { texte: 'Je relance la recherche.', commande: { type: 'recherche_reprise' } };
    case 'idee_donner': return det.texte ? { texte: '', idee: det.texte } : { texte: 'D’accord, je t’ouvre le laboratoire. Écris ton idée dans le champ « Idée libre », ou dis-la moi : donne une idée à l’agent, puis ton idée.', ouvrir: 'labo' };
    case 'idee_valider': { const i = ctx.ideeEnAttente(); return i ? { texte: 'Idée validée. Je la teste avec exactement les mêmes critères que les autres : ' + i.description, commande: { type: 'idee_valider', id: i.id } } : { texte: 'Aucune idée n’est en attente de validation.' }; }
    case 'idee_refuser': { const i = ctx.ideeEnAttente(); return i ? { texte: 'Idée refusée, elle ne sera pas testée.', commande: { type: 'idee_refuser', id: i.id } } : { texte: 'Aucune idée n’est en attente.' }; }
    default: return null;
  }
}
function etatCourt(v) { const r = v.recherche; return r.valideesComptees ? pluriel(r.valideesComptees, 'stratégie validée', 'stratégies validées') + ' sur ' + r.cible + '.' : 'Aucune stratégie validée pour l’instant : l’agent cherche, ' + pluriel(r.N, 'variante testée', 'variantes testées') + '.'; }
export { AGENT };
