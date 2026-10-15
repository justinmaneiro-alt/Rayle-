// Briques communes des scènes intérieures des planètes.
// Une scène intérieure expose  { mount(P, opts) → {texte}, unmount(P, opts) → {texte} }  où P est le contexte partagé du thème Espace (theme-espace.js) :
//   P.allerVue(nom, opts) · P.vueNom() · P.liberer(nom)
// mount  : charge la scène à la demande et s'y place ; unmount : en sort (retour au système solaire) et libère la mémoire de la scène.

// Intérieur porté par une « vue » existante du thème Espace (la Terre intégrée, la vue Mars chargée à la demande).
export function interieurVue({ id, vue, optionsEntree = o => o, texteEntree, texteSortie }) {
  return {
    id, vue,
    async mount(P, opts = {}) {
      await P.allerVue(vue, optionsEntree(opts));
      return { texte: texteEntree };
    },
    // cible : planète devant laquelle on ressort (vue rapprochée) ; sans cible : vue d'ensemble du système
    async unmount(P, opts = {}) {
      if (P.vueNom() === vue) await P.allerVue('systeme', opts.cible ? { cible: opts.cible } : {});
      else if (P.liberer) P.liberer(vue);                // on était déjà ailleurs : on libère seulement
      return { texte: texteSortie };
    },
  };
}

// Planète sans scène intérieure : « prête à recevoir un thème ». Le registre ne charge même pas ce module tant qu'aucun thème n'est branché.
export function interieurAbsent(id) {
  return {
    id, vue: null,
    async mount() { return { ok: false, pret: true, texte: 'Cette planète n’a pas encore de thème intérieur.' }; },
    async unmount() { return { ok: true, texte: '' }; },
  };
}
