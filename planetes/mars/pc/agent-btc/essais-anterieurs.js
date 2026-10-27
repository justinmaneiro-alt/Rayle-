/* ═════════════ VARIANTES DÉJÀ TESTÉES AVANT L'OUVERTURE DE L'APPLICATION (M5 ; comptées pour ne pas tricher) ═════════════
   Le seuil du hasard (Sharpe déflaté) dépend du nombre TOTAL de variantes essayées sur ces mêmes données. Celles de l'étape M3 / M4 (recherche réelle de l'application) et celles que j'ai moi-même
   essayées pendant le développement de M5 (essais à blanc sur les vraies bougies, SANS jamais ouvrir le jeu final : `planetes/mars/outils-agent/m5-essai-long.mjs`) sont des essais : on ne peut pas
   repartir de zéro en prétendant ne rien avoir vu. Le compteur d'un état neuf démarre donc à `total` ; il ne diminue jamais (voir pilote-coeur.js : fusion d'états). Mettre à jour ce fichier
   chaque fois qu'un nouvel essai à blanc est fait sur les vraies données (il est relu par les tests : le total ne doit jamais baisser). */
export const VARIANTES_AVANT = Object.freeze({
  m3m4: 3101,                 // recherche réelle M3 (2 973) + microstructure M4 (128), docs/agent-btc.md
  m5Developpement: 640000,    // essais à blanc M5 sur 9 ans de vraies bougies (règles aléatoires et gabarits), jeu final jamais ouvert ; voir docs/m5-progression.md
  get total() { return this.m3m4 + this.m5Developpement; }
});

/* M6 : plancher du compteur pour une autre paire que BTC. Les 640 000 essais à blanc de M5 ont été faits sur les bougies du bitcoin : ils ne disent rien des données de SOL ou de DOGE.
   Mais les FAMILLES d'idées (M3 et M4, 3 101 variantes) ont été conçues en regardant le bitcoin : elles comptent pour les autres paires. Chaque paire a son propre compteur, qui ne baisse jamais. */
export const plancherVariantes = paire => (!paire || paire === 'BTC' ? VARIANTES_AVANT.total : VARIANTES_AVANT.m3m4);
