/* ═════════════ CONFIGURATION GOOGLE DRIVE DE RAYLÉ ═════════════
   Seul l'identifiant client OAuth PUBLIC (« Client ID ») va ici. Il n'est pas un secret : Google le montre dans l'URL de connexion.
   Ne colle JAMAIS ici un « client secret », un jeton d'accès ou un mot de passe. Étapes pour l'obtenir : docs/drive.md.

   clientId : ex. « 123456789012-abcdefg.apps.googleusercontent.com »  (vide = Drive désactivé, Raylé le dit clairement)
   appId    : le « numéro de projet » Google Cloud (chiffres seulement, public aussi) : nécessaire pour que le sélecteur de fichiers
              donne à Raylé l'accès aux documents choisis. Laisse vide si le sélecteur fonctionne sans.
   apiKey   : OPTIONNEL. Clé d'API « navigateur » restreinte à ton adresse GitHub Pages ; seulement si le sélecteur affiche
              une erreur de clé de développeur. Par défaut vide.                                                              */
window.RAYLE_DRIVE_CONFIG = {
  clientId: '124510359283-kgoa0f52gjec3ri0t86jpp1j203ui2kn.apps.googleusercontent.com',
  appId: '124510359283',
  apiKey: ''
};
