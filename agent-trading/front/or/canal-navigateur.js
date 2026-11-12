/* Canal « notification navigateur / appli installée » des flèches Direct : Notification API + service worker (showNotification). Aucune donnée n'est envoyée à un serveur.
   Sans la page ouverte (ou l'appli en arrière-plan), aucune notification ne part ; un téléphone en veille coupe les pages web : Telegram (alertes-serveur.mjs) est la voie fiable. */
export const permissionNavigateur = () => { try { return typeof Notification === 'undefined' ? 'indisponible' : Notification.permission; } catch (e) { return 'indisponible'; } };
export async function demanderPermission() { try { if (typeof Notification === 'undefined') return 'indisponible'; if (Notification.permission !== 'default') return Notification.permission; return await Notification.requestPermission(); } catch (e) { return 'indisponible'; } }
export async function notifierNavigateur(m) {
  if (permissionNavigateur() !== 'granted') return false;
  const o = { body: m.corps, icon: '/icones/rayle-192.png', badge: '/icones/rayle-192.png', tag: 'rayle-or-' + (m.evenements && m.evenements[0] ? m.evenements[0].cle : Date.now()), renotify: false, data: { url: './#terminal' } };
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg && reg.showNotification) { await reg.showNotification(m.titre, o); return true; } } catch (e) { /* repli ci-dessous */ }
  try { new Notification(m.titre, o); return true; } catch (e) { return false; }
}
