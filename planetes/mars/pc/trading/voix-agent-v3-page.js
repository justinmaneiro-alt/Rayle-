import { detecter, reponseStatut, reponseRapport } from '../agent-v3/voix-agent-v3.js';
import { lireEtatAgent, envoyerCommande } from './agent-accueil.js';

/* Côté page : « que fait l'agent ? », « le rapport de l'agent », « mets l'agent en pause », « reprends l'agent », « envoie le statut de l'agent sur Telegram » (appelée par galaxie/commandes.js).
   Rend le texte à dire, ou null si la phrase n'est pas pour l'agent. Rayle est la seule voix : l'agent lui donne des données, jamais de conversation directe. Sans IA. */
export async function traiterAgentV3(n0) {
  const d = detecter(n0); if (!d) return null;
  if (d.type === 'pause') { const r = await envoyerCommande({ type: 'pause' }); return r.ok ? 'C’est fait : l’agent se met en pause à son prochain cycle, dans une trentaine de secondes. Dis « reprends l’agent » pour le relancer.' : 'Je n’arrive pas à joindre l’agent : ni le service du PC ni le Worker ne répondent.'; }
  if (d.type === 'reprendre') { const r = await envoyerCommande({ type: 'reprendre' }); return r.ok ? 'D’accord, l’agent reprend son travail.' : 'Je n’arrive pas à joindre l’agent.'; }
  if (d.type === 'retour_arriere') { const r = await envoyerCommande({ type: 'retour_arriere' }); return r.ok ? 'Je demande le retour à la version précédente de l’agent. Je te préviens sur Telegram quand c’est fait.' : 'Je n’arrive pas à joindre l’agent.'; }
  if (d.type === 'charge') { if (!['faible', 'normal', 'fort'].includes(d.valeur)) return 'La charge de calcul peut être faible, normale ou forte.'; const r = await envoyerCommande({ type: 'charge', valeur: d.valeur }); return r.ok ? 'La charge de calcul de l’agent passe à ' + (d.valeur === 'normal' ? 'normale' : d.valeur === 'fort' ? 'forte' : 'faible') + '.' : 'Je n’arrive pas à joindre l’agent.'; }
  const e = await lireEtatAgent(); if (!e || !e.etat) return 'Je ne trouve pas l’état de l’agent : le service du PC n’est pas démarré et le Worker ne l’a pas reçu. Lance l’installation de l’agent, une étape à la fois.';
  const ctx = { pcVivant: e.enMarche, rechercheEnCours: !!(e.etat.recherche && e.etat.recherche.enCours), enPreparation: Object.values(e.suivi || {}).some(s => s && s.pendante), positionOuverte: Object.values(e.suivi || {}).some(s => s && s.position) };
  if (d.type === 'rapport') return reponseRapport(e.etat, ctx);
  const texte = reponseStatut(e.etat, ctx);
  if (d.type === 'telegram') {
    try { if (typeof workerReady === 'undefined' || !workerReady()) return 'Le Worker n’est pas configuré : je ne peux pas écrire sur Telegram. Voici le statut : ' + texte; const r = await window.wfetch('/telegram/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: 'Statut de l’agent : ' + texte + '\nAucun ordre n’est exécuté automatiquement.', type: 'SYSTEME' }) }); return r.ok ? 'C’est envoyé sur Telegram. ' + texte : 'Telegram a refusé le message. Voici le statut : ' + texte; } catch (err) { return 'Je n’ai pas pu écrire sur Telegram. Voici le statut : ' + texte; }
  }
  return texte;
}
