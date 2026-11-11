/* ═════════════ CONFIGURATION UNIQUE DE L'APPLICATION (côté page) ═════════════
   L'adresse du backend ne se règle qu'ici (ou dans ⚙ Réglages, qui a priorité sur cet appareil). Aucun secret : le jeton n'est jamais écrit ici.
   Pour un serveur Node autonome : mettre son adresse (ex. 'https://rayle.mondomaine.fr'). Voir DEPLOIEMENT.md. */
window.RAYLE_CONFIG = {
  workerUrl: 'https://rayle.justinmaneiro.workers.dev'
};
