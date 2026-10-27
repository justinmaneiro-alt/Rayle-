import { detecter, repondre } from '../agent-btc/voix-poste.js';

/* ═════════════ VOIX DU POSTE DE PILOTAGE, CÔTÉ PAGE (M5) ═════════════
   Relie les phrases (voix-poste.js, pur) à la fenêtre, à l'hôte et au Worker. Appelée par commandeMars (galaxie/commandes.js) AVANT les anciennes explications de l'agent :
   elle ne prend que les phrases qu'elle reconnaît, tout le reste retombe sur les autres commandes. Les réponses viennent des données de l'agent, sans IA. */
export const concerne = n0 => /\b(?:agent|strateg\w*|recherche|idee|dernier trade|poste de pilotage|pourquoi|quand)\b/.test(n0);

export async function traiter(n0) {
  const P = window.PosteAgent, ouvert = !!(P && P.poste && P.poste());
  const det = detecter(n0, { fenetreOuverte: ouvert }); if (!det) return null;
  const { obtenirHotePaire } = await import('./pilotes-paires.js'), hote = await obtenirHotePaire((P && P.paire && P.paire()) || 'BTC', { demarrer: true });          // M6 : la paire affichée dans le poste (BTC par défaut)
  const ctx = { vue: hote.vue(), trades: () => hote.tousLesTrades(), diagnostic: (id, source) => hote.diagnostic(id, source), ideeEnAttente: () => { const i = hote.vue().recherche.idees.filter(x => x.statut === 'a_valider').slice(-1)[0]; return i || null; } };
  let rep = repondre(det, ctx); if (!rep) return null;
  if (rep.idee) {                                               // « donne une idée à l'agent : … » : UNE traduction par le Worker, jamais testée sans « valide l'idée »
    const r = await hote.ideeLibre(rep.idee);
    const M = await import('./fenetre-agent.js'); const poste = await M.ouvrirPoste({ onglet: 'labo' });
    return r.ok ? 'Voici ce que j’ai compris : ' + r.description + ' Je ne la teste pas tout de suite : dis « valide l’idée » pour lancer le test, ou « refuse l’idée ».' : 'Je n’ai pas pu traduire cette idée : ' + r.erreur;
  }
  if (rep.commande) { const r = await hote.commande(rep.commande); if (!r.ok) return 'Je n’ai pas pu le faire : ' + r.erreur + '.'; }
  if (rep.ouvrir) {
    const M = await import('./fenetre-agent.js'); const poste = await M.ouvrirPoste({ onglet: rep.ouvrir });
    if (poste) { await poste.ouvrirOnglet(rep.ouvrir); if (rep.graphiqueDernier) await poste.dernierTrade(); else if (rep.trade) { const x = hote.tousLesTrades().find(t => t.strategie === rep.trade.strategie && t.t === rep.trade.t); if (x) await poste.montrerTrade(x); } }
  }
  return rep.texte;
}

/* ═════════════ M6 : gardien, tilt, simulation, régime, journal, zone, bougie, rejeu, dessins ═════════════
   Appelée AVANT traiter() par commandeMars (galaxie/commandes.js). Rend le texte à dire, ou null si la phrase n'est pas pour elle. Les rapports viennent de rapports.js (sans IA). */
export async function traiterM6(n0) {
  const { detecterM6c } = await import('../agent-m6c/voix-m6c.js'), d6c = detecterM6c(n0);            // M6c : régime, range, cassure, « ça craint » (avant les rapports M6 : plus précis)
  if (d6c) {
    const A = await import('./assistant-page.js'), texte = await A.repondreVoixM6c(d6c);
    try { const M = await import('./fenetre-agent.js'), poste = await M.ouvrirPoste({ onglet: 'regime', paire: d6c.paire || undefined }); if (poste) { if (d6c.paire && poste.choisirPaire) await poste.choisirPaire(d6c.paire); await poste.ouvrirOnglet('regime'); } } catch (e) { /* la réponse parlée suffit */ }
    return texte;
  }
  const { detecterM6 } = await import('../agent-m6/voix-m6.js'), det = detecterM6(n0); if (!det) return null;
  const ouvrir = async (onglet, paire) => { const M = await import('./fenetre-agent.js'), poste = await M.ouvrirPoste({ onglet, paire }); if (poste) { if (paire && poste.choisirPaire) await poste.choisirPaire(paire); await poste.ouvrirOnglet(onglet); } return poste; };
  const paireCourante = det.paire || (window.PosteAgent && window.PosteAgent.paire && window.PosteAgent.paire()) || 'BTC';
  switch (det.type) {
    case 'rapport': { const { rapportVocal } = await import('./rapports-agent.js'), r = await rapportVocal(det.sujet, det.paire || paireCourante); if (r.ouvrir && det.sujet !== 'recherche') await ouvrir(r.ouvrir, det.sujet === 'regime' ? paireCourante : null); return r.texte; }
    case 'tester_zone': { const G = (await import('./chart-api.js')).GraphiqueAgent, r = await G.testerMaZone(); if (r.ok) await ouvrir('graphique', r.paire); return r.ok ? r.texte : 'Je n’ai pas pu tester ta zone : ' + r.erreur + '.'; }
    case 'bougie': { const G = (await import('./chart-api.js')).GraphiqueAgent, r = await G.expliquerBougie(paireCourante, det.quand); return r.ok ? r.texte : 'Je n’ai pas pu expliquer cette bougie : ' + r.erreur + '.'; }
    case 'rejouer': { const poste = await ouvrir('graphique'); if (!poste) return 'Le poste de pilotage ne s’est pas ouvert.'; if (det.quoi === 'dernier_trade') { const x = await poste.dernierTrade(true); return x ? 'Rejeu du dernier trade : avance avec « pas suivant ».' : 'Aucun trade à rejouer.'; } return poste.rejouerPeriode ? await poste.rejouerPeriode() : 'Le rejeu d’une période n’est pas disponible.'; }
    case 'effacer_dessins': { const G = (await import('./chart-api.js')).GraphiqueAgent, m = G.magasin(paireCourante), n = m.vider(det.cible === 'utilisateur' ? 'utilisateur' : 'agent').n; return n ? n + ' dessin' + (n > 1 ? 's' : '') + (det.cible === 'utilisateur' ? ' à toi' : ' de l’agent') + ' effacé' + (n > 1 ? 's' : '') + '.' : 'Il n’y avait aucun dessin à effacer.'; }
    case 'masquer_dessins': { const G = (await import('./chart-api.js')).GraphiqueAgent, m = G.magasin(paireCourante), g = m.groupes().filter(x => x.auteur === 'agent'); for (const x of g) m.masquerGroupe(x.groupe, true); return g.length ? 'Dessins de l’agent masqués (' + g.length + ' groupe' + (g.length > 1 ? 's' : '') + '). Dis « montre les dessins » ou utilise la case du graphique pour les réafficher.' : 'L’agent n’a tracé aucun dessin.'; }
    case 'afficher_dessins': { const G = (await import('./chart-api.js')).GraphiqueAgent, m = G.magasin(paireCourante), g = m.groupes().filter(x => x.auteur === 'agent'); for (const x of g) m.masquerGroupe(x.groupe, false); if (g.length) await ouvrir('graphique', paireCourante); return g.length ? 'Dessins de l’agent réaffichés.' : 'L’agent n’a tracé aucun dessin.'; }
    case 'ouvrir': { await ouvrir(det.onglet, det.paire); return 'Voici ' + ({ gardien: 'le gardien prop', tilt: 'le détecteur de tilt', journal: 'ton journal de trades', simulation: 'la simulation de l’évaluation', regime: 'le régime de marché', capture: 'la lecture de capture', sante: 'la santé de l’agent', labo: 'le laboratoire et la bibliothèque d’idées', idees: 'la bibliothèque d’idées', ensemble: 'l’agent ' + ({ BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' }[det.paire] || ''), portefeuille: 'le portefeuille de stratégies', diagnostic: 'le diagnostic', reglages: 'les réglages', graphique: 'le graphique de l’agent', trades: 'les trades' }[det.onglet] || 'l’agent') + '.'; }
    default: return null;
  }
}
