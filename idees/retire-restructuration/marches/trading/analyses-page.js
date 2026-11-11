import { obtenirFinance } from '../finance/donnees.js';
import { resumerAnalyses } from '../finance/analyses-calcul.js';

/* Contexte des analyses publiques (banques centrales, BRI, ING Think) pour Raylé et les agents : une phrase de faits (combien, qui, quels titres), jamais un signal d'entrée.
   Silencieux en cas de panne (Worker verrouillé, sources non déployées) : on rend '' plutôt que d'inventer. Attend 6 secondes au plus. */
export async function contexteAnalyses({ delaiMs = 6000 } = {}) {
  try {
    const r = await Promise.race([obtenirFinance().flux('institutions'), new Promise(ko => setTimeout(() => ko(new Error('délai dépassé')), delaiMs))]);
    if (!r || r.etat !== 'ok') return '';
    return resumerAnalyses(r.items).texte;
  } catch (e) { return ''; }
}
