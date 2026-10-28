/* ═════════════ ORDRES DE JUPITER (bus d'ordres) : déclarés dans le manifeste, pas encore actifs ═════════════
   « coder » et « montrer_resultat » existent pour que Raylé sache qu'ils appartiennent à Jupiter ; tant que les agents de code ne sont pas construits ils répondent honnêtement qu'ils ne le sont pas
   (jamais de faux code, jamais de faux résultat). À remplacer le jour où les agents existent : garder les noms d'ordres, brancher le Worker (/planete/jupiter/interprete). */
export const MESSAGE = 'Les agents de code de Jupiter ne sont pas encore construits : je ne peux pas écrire de code de cette façon pour le moment.';
export function brancher({ O }) {
  const sur = (action, fn) => { try { O.enregistrer('jupiter', action, fn, { delai: 5000 }); } catch (e) { /* ordre non déclaré par le manifeste : ignoré */ } };
  sur('coder', async () => ({ ok: false, erreur: MESSAGE }));
  sur('montrer_resultat', async () => ({ ok: false, erreur: 'Il n’y a encore aucun code produit par Jupiter à montrer.' }));
}
