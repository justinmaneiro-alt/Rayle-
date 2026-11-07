/* ═════════════ LIEN TÉLÉ ↔ TÉLÉCOMMANDE (WebSocket du relais dédié « rayle-or-relais », sans secret, rien de stocké) ═════════════
   Télé : role=tele (un code de 4 chiffres libre ; 409 = déjà pris → nouveau code). Télécommande : role=commande avec le code affiché sur la télé.
   Messages sans donnée personnelle : commandes de la liste blanche, et un petit état (titre du morceau, vue) dans l'autre sens. Reconnexion automatique. */
import { RELAIS_WS, codeAleatoire, codeValide } from './tele-calcul.js';

export function creerLien({ role, code = null, surMessage = () => {}, surEtat = () => {}, WS = globalThis.WebSocket, url = RELAIS_WS }) {
  let ws = null, ferme = false, delai = 1000, minuterie = null, essais = 0;
  if (role === 'tele' && !codeValide(code)) code = codeAleatoire();
  const dire = (e, extra = {}) => surEtat({ etat: e, code, ...extra });
  function ouvrir() {
    if (ferme) return;
    try { ws = new WS(`${url}?code=${code}&role=${role}`); } catch (e) { dire('erreur', { raison: e.message }); planifier(); return; }
    dire('connexion');
    let ouvert = false;
    ws.onopen = () => { ouvert = true; delai = 1000; essais = 0; dire(role === 'tele' ? 'en attente' : 'appairé'); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'appaire') dire('appairé'); else surMessage(m); };
    ws.onclose = ev => {
      if (ferme) return;
      // la poignée de main refusée (409 : code pris ; 404 : aucune télé) se voit comme une fermeture sans ouverture
      if (!ouvert) { essais++; if (role === 'tele' && essais >= 2) { code = codeAleatoire(); essais = 0; } if (role === 'commande' && essais >= 3) { dire('introuvable', { raison: 'aucune télé avec ce code (vérifie les 4 chiffres)' }); return; } }
      dire('reconnexion'); planifier();
    };
    ws.onerror = () => { /* onclose suit */ };
  }
  function planifier() { clearTimeout(minuterie); minuterie = setTimeout(ouvrir, delai); delai = Math.min(15000, delai * 2); }
  ouvrir();
  return {
    code: () => code,
    envoyer(m) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; },
    fermer() { ferme = true; clearTimeout(minuterie); try { ws && ws.close(); } catch (e) { /* */ } }
  };
}
