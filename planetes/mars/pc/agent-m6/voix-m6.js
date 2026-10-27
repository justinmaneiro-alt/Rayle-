/* ═════════════ VOIX DE RAYLÉ POUR L'AGENT, VERSION M6 (module pur, testé : planetes/mars/tests/m6-etat-test.mjs) ═════════════
   Reconnaît les phrases que tu dis à Rayle à propos de l'agent de trading (gardien, tilt, simulation, régime, journal, zone, bougie, rejeu…) et les range en commandes. Rayle est la seule voix :
   les réponses viennent de rapports.js (modèles de phrases à partir des données de l'agent, sans IA). Les phrases d'avant (ouvre l'agent, montre les stratégies, pourquoi cette stratégie a perdu…)
   restent traitées par agent-btc/voix-poste.js ; ce module ne prend QUE ce qui est nouveau et laisse passer le reste (renvoie null).
   `n0` = phrase normalisée (minuscules, sans accents). */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’\-\/]/g, ' ').replace(/[?!.,;…«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const PAIRES = [['doge', 'DOGE'], ['dogecoin', 'DOGE'], ['solana', 'SOL'], ['sol', 'SOL'], ['bitcoin', 'BTC'], ['btc', 'BTC']];
const paireDe = t => { for (const [m, p] of PAIRES) if (new RegExp('\\b' + m + '\\b').test(t)) return p; return null; };
const ONGLETS = [['gardien prop|gardien', 'gardien'], ['tilt', 'tilt'], ['journal', 'journal'], ['simulation', 'simulation'], ['regime', 'regime'], ['capture', 'capture'], ['sante', 'sante'], ['laboratoire', 'labo'], ['portefeuille', 'portefeuille'], ['diagnostic', 'diagnostic'], ['reglages', 'reglages'], ['graphique', 'graphique'], ['trades', 'trades'], ['bibliotheque|idees', 'idees']];

export function detecterM6(phrase) {
  const t = norm(phrase); if (!t) return null; const paire = paireDe(t);
  // rapports parlés
  if (/\b(?:ou j en suis|ou en suis je|ou en est mon compte|mes limites|marge (?:du jour|restante)|perte du jour|ma marge|mon drawdown|limites? du compte|etat du compte|progression (?:vers|de) (?:l objectif|l evaluation))\b/.test(t) && !/\b(?:tilt|journal)\b/.test(t)) return { type: 'rapport', sujet: 'gardien' };
  if (/\bai je le droit\b.*\b(?:trade|trader|prendre|entrer|setup)\b|\bpuis je (?:prendre|trader|entrer)\b|\best ce que je peux (?:prendre|trader|entrer)\b|\bje peux (?:trader|prendre un trade)\b/.test(t)) return { type: 'rapport', sujet: 'controle' };
  if (/\bsuis je en tilt\b|\bje suis en tilt\b|\betat de tilt\b|\bmon tilt\b|\bniveau de tilt\b|\bai je tilt\b/.test(t)) return { type: 'rapport', sujet: 'tilt' };
  if (/\bprobabilite\b.*\b(?:reussir|evaluation|challenge|objectif)\b|\b(?:chances?|proba)\b.*\b(?:evaluation|challenge|reussir)\b|\bvais je reussir l evaluation\b|\bsimulation de l evaluation\b|\bsimule l evaluation\b/.test(t)) return { type: 'rapport', sujet: 'simulation' };
  if (/\bbilan\b.*\b(?:semaine|hebdo|hebdomadaire)\b|\bbilan de la semaine\b/.test(t)) return { type: 'rapport', sujet: 'bilan' };
  if (/\bregime\b.*\b(?:marche|btc|bitcoin|sol|solana|doge|dogecoin|crypto)\b|\b(?:quel|c est quoi le|donne moi le) regime\b/.test(t)) return { type: 'rapport', sujet: 'regime', paire };
  if (/\bsante de l agent\b|\bl agent va t il bien\b|\betat de sante\b|\bl agent fonctionne\b|\bdonnees (?:a jour|fraiches)\b/.test(t)) return { type: 'rapport', sujet: 'sante' };
  if (/\bbibliotheque d idees\b|\bmes idees\b|\bcombien d idees\b|\bidees (?:testees|en attente)\b/.test(t)) return { type: 'rapport', sujet: 'idees' };
  if (/\b(?:ou en est|etat de|avancement de) (?:la|toute la) recherche\b.*\b(?:paires?|toutes|trois)\b|\brecherche (?:sur|de) (?:toutes les paires|les trois paires)\b/.test(t)) return { type: 'rapport', sujet: 'recherche' };
  // graphique
  if (/\b(?:teste|tester|testes|mesure|analyse)\b.*\bma zone\b/.test(t)) return { type: 'tester_zone' };
  if (/\bexplique\b.*\b(?:cette bougie|la derniere bougie|la bougie)\b|\bque se passe t il sur cette bougie\b/.test(t)) return { type: 'bougie', quand: 'derniere', paire };
  if (/\b(?:rejoue|rejouer|replay|rejoue moi)\b.*\b(?:dernier trade|periode|derniere periode)\b/.test(t)) return { type: 'rejouer', quoi: /\bperiode\b/.test(t) ? 'periode_affichee' : 'dernier_trade' };
  if (/\b(?:efface|supprime|enleve)\b.*\b(?:mes dessins|tes dessins|les dessins de l agent|les dessins)\b/.test(t)) return { type: 'effacer_dessins', cible: /\bmes\b/.test(t) ? 'utilisateur' : 'agent' };
  if (/\b(?:masque|cache)\b.*\b(?:dessins|les dessins de l agent)\b/.test(t)) return { type: 'masquer_dessins', cible: 'agent' };
  if (/\b(?:montre|affiche|reaffiche|remets)\b.*\b(?:les dessins|dessins de l agent|tes dessins)\b/.test(t)) return { type: 'afficher_dessins', cible: 'agent' };
  // ouverture d'un onglet ou d'une paire
  const ouv = /\b(?:ouvre|ouvrir|affiche|afficher|montre|montrer|va sur|va dans)\b/.test(t);
  if (ouv) {
    for (const [mots, onglet] of ONGLETS) if (new RegExp('\\b(?:' + mots + ')\\b').test(t) && !/\bstrategies?\b/.test(t) && !/\bdernier trade\b/.test(t)) return { type: 'ouvrir', onglet, paire };
    if (paire && /\b(?:agent|poste)\b/.test(t)) return { type: 'ouvrir', onglet: 'ensemble', paire };
  }
  if (/\b(?:ajoute|enregistre|garde)\b.*\b(?:trade|resultat)\b.*\bjournal\b|\bnote un trade\b/.test(t)) return { type: 'ouvrir', onglet: 'journal', ajouter: true };
  return null;
}
export const normaliser = norm;
