"use strict";
/* Les modules d'origine absents de cette version (terminal de trading, anatomie, Drive, appareils, relais, cartes…) restent rangés dans modules/.
   Le noyau de Rayle les appelle de façon optionnelle : ces fonctions neutres répondent « pas pour moi » pour que sa voix et son caractère fonctionnent seuls. */
  const commandeSecurite=async()=>null, commandeTerminal=async()=>null, commandeCarte=async()=>null;
  const majVitesseUI=()=>{};
  const secCapturer=()=>false;
  const montrerReponse=()=>{};   // les fenêtres de points clés (HUD) ne sont pas affichées dans cette version sans interface
