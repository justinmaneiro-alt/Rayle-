// Contrat d'agent d'une planète (INTERFACE VIDE pour l'instant : le branchement réel arrive avec le Prompt 6).
// Chaque planète du registre porte un champ `agent` de cette forme :  { id, nom, role, endpoint }
//   id        identifiant stable de l'agent (ex. « agent-mars »), ou null tant qu'aucun agent n'est associé
//   nom       nom affiché
//   role      ce que l'agent fait dans cette planète (ex. « garde la base de code »)
//   endpoint  adresse HTTPS que Raylé appellera pour lui parler ; null = agent non branché
// Tant que `endpoint` est null, l'agent est « déclaré mais non branché » : rien n'est appelé, rien n'est simulé.
export const CHAMPS_AGENT = Object.freeze(['id', 'nom', 'role', 'endpoint']);

export const agentVide = () => ({ id: null, nom: null, role: null, endpoint: null });

export const estBranche = a => !!(a && typeof a.endpoint === 'string' && a.endpoint);

// { ok, erreurs[] } : null est accepté (planète sans agent) ; sinon exactement les 4 champs, chacun texte non vide ou null, endpoint en https.
export function validerAgent(a) {
  if (a === null) return { ok: true, erreurs: [] };
  const erreurs = [];
  if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, erreurs: ['un agent est un objet { id, nom, role, endpoint } ou null'] };
  for (const k of Object.keys(a)) if (!CHAMPS_AGENT.includes(k)) erreurs.push('champ inconnu : ' + k);
  for (const k of CHAMPS_AGENT) {
    if (!(k in a)) { erreurs.push('champ manquant : ' + k); continue; }
    if (a[k] !== null && (typeof a[k] !== 'string' || !a[k].trim())) erreurs.push(k + ' : texte non vide ou null');
  }
  if (typeof a.endpoint === 'string' && a.endpoint && !/^https:\/\/[^\s]+$/.test(a.endpoint)) erreurs.push('endpoint : adresse https:// attendue');
  if (a.endpoint && !a.id) erreurs.push('un agent branché doit avoir un id');
  return { ok: erreurs.length === 0, erreurs };
}
