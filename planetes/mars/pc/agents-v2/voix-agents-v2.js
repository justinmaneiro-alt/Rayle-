import { trouverOutil, expliquerOutil } from './outils-terminal.js';

/* ═════════════ VOIX DES AGENTS PRÊTS, DE LA LECTURE DU MARCHÉ ET DES OUTILS (V2, phase 6 ; module pur, testé : planetes/mars/tests/v2-voix-test.mjs) ═════════════
   `detecterVoixV2(n0)` : n0 = phrase normalisée (sans accents, sans ponctuation, minuscules). Rend { type, … } ou null (la phrase n'est pas pour ce module : les autres commandes décident).
   · { type: 'outil', texte }              « à quoi sert le gardien prop ? », « c'est quoi l'outil COT ? » (réponse construite par la table de outils-terminal.js, sans IA) ;
   · { type: 'agents' }                    « ouvre les agents prêts », « crée une stratégie guidée », « assistant de stratégie » ;
   · { type: 'lecture', paire, unite, n }  « lis le marché », « analyse le Bitcoin en H4 », « explique les 10 dernières bougies de Solana ».
   Prudence : la détection ne prend que des formulations claires, pour ne pas voler une question générale à l'IA. */
const PAIRES = [['doge', 'DOGE'], ['dogecoin', 'DOGE'], ['solana', 'SOL'], ['sol', 'SOL'], ['bitcoin', 'BTC'], ['btc', 'BTC']];
const UNITES = [['m15', 'M15'], ['15 minutes', 'M15'], ['quinze minutes', 'M15'], ['h1', 'H1'], ['une heure', 'H1'], ['1 heure', 'H1'], ['h4', 'H4'], ['quatre heures', 'H4'], ['4 heures', 'H4'], ['d1', 'D1'], ['journalier', 'D1'], ['journee', 'D1']];
const mot = (n0, m) => new RegExp('(?:^| )' + m + '(?: |$)').test(n0);

export function detecterVoixV2(n0) {
  if (!n0) return null;
  // 1. « à quoi sert … » : outil du terminal
  if (/\b(?:a quoi (?:sert|servent)|que fait (?:l outil|le panneau|la fenetre)|c est quoi (?:l outil|le panneau|la fenetre|cet outil)|explique(?: moi)? (?:l outil|le panneau|la fenetre|cet outil)|comment (?:marche|fonctionne) (?:l outil|le panneau|la fenetre))\b/.test(n0)) {
    const r = trouverOutil(n0);
    if (r && r.score >= 10) return { type: 'outil', texte: expliquerOutil(n0).texte };
    if (/\b(?:outil|panneau|fenetre)\b/.test(n0) && !/\b(?:agent btc)\b/.test(n0)) return { type: 'outil', texte: expliquerOutil(n0).texte };
    return null;
  }
  // 2. assistant des agents prêts
  if (/\b(?:agents? prets?|assistant de strategies?|assistant d agents?|(?:cree|creer|fabrique|fais) (?:moi )?une strategie guidee|strategie guidee|agent tendance|agent divergence)\b/.test(n0)) return { type: 'agents' };
  // 3. lecture du marché
  if (/\b(?:lis|lit|lire|analyse|analyser|decris|decrire|donne moi) (?:moi )?(?:le |la )?(?:lecture du )?marche\b|\blecture du marche\b|\b(?:les )?(\d+ )?dernieres? bougies?\b|\bbougie par bougie\b|\b(?:lis|analyse|lit) (?:le |la )?(?:bitcoin|btc|solana|sol|dogecoin|doge)\b/.test(n0)) {
    let paire = null; for (const [m, p] of PAIRES) if (mot(n0, m)) { paire = p; break; }
    let unite = null; for (const [m, u] of UNITES) if (mot(n0, m)) { unite = u; break; }
    const nb = /(\d+) dernieres? bougies?/.exec(n0), parBougie = /\bbougie par bougie\b|\bdernieres? bougies?\b/.test(n0);
    return { type: 'lecture', paire, unite: unite || (parBougie ? 'M15' : 'H1'), n: nb ? Math.min(30, Math.max(3, Number(nb[1]))) : 8, parBougie };
  }
  return null;
}
