// (Sans dépendance Node : marche aussi dans le navigateur, pour le mode direct de la carte de liquidité.)
// Connexion WebSocket robuste (V4, phase 2) : reconnexion avec attente progressive, surveillance du silence, trous notés (jamais comblés). Utilise le WebSocket intégré de Node (22 et plus) ;
// `WebSocketImpl` est injectable pour les tests. Aucun secret : seuls des flux publics.
export function creerConnexion({ nom, url, abonnement = null, surMessage, surOuverture = () => {}, surCoupure = () => {}, noterTrou = () => {}, WebSocketImpl = globalThis.WebSocket,
  maintenant = () => Date.now(), silenceMaxMs = 30000, attenteMinMs = 1000, attenteMaxMs = 60000, stableMs = 60000, verifierMs = 5000 } = {}) {
  let ws = null, arretee = true, attente = attenteMinMs, minuteur = null, veille = null, ouvertLe = 0, dernierMessage = 0, coupureLe = null, essais = 0;
  const stats = { ouvertures: 0, coupures: 0, messages: 0, derniereErreur: null };
  function planifier() { if (arretee) return; clearTimeout(minuteur); minuteur = setTimeout(ouvrir, attente); attente = Math.min(attenteMaxMs, attente * 2); }
  function ouvrir() {
    if (arretee) return; essais++;
    try { ws = new WebSocketImpl(url); } catch (e) { stats.derniereErreur = String(e.message).slice(0, 100); planifier(); return; }
    const courant = ws; ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (courant !== ws) return; stats.ouvertures++; ouvertLe = maintenant(); dernierMessage = ouvertLe;
      try { const msgs = typeof abonnement === 'function' ? abonnement() : abonnement; for (const m of [].concat(msgs || [])) courant.send(typeof m === 'string' ? m : JSON.stringify(m)); } catch (e) { stats.derniereErreur = String(e.message).slice(0, 100); }
      try { surOuverture({ apresCoupure: coupureLe != null, coupureLe }); } catch (e) { stats.derniereErreur = String(e.message).slice(0, 100); }
    };
    ws.onmessage = e => {
      if (courant !== ws) return; const t = maintenant();
      if (coupureLe != null) { noterTrou({ t: coupureLe, flux: nom, de: coupureLe, a: t, raison: 'connexion coupée puis rétablie' }); coupureLe = null; }
      dernierMessage = t; stats.messages++;
      if (ouvertLe && t - ouvertLe > stableMs) attente = attenteMinMs;
      try { surMessage(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data), t); } catch (err) { stats.derniereErreur = String(err.message).slice(0, 100); }
    };
    ws.onerror = e => { stats.derniereErreur = String((e && (e.message || e.type)) || 'erreur').slice(0, 100); };
    ws.onclose = () => { if (courant !== ws) return; coupure(); };
  }
  function coupure() {
    if (arretee) return; stats.coupures++; if (coupureLe == null) coupureLe = dernierMessage || maintenant(); ws = null;
    try { surCoupure({ de: coupureLe }); } catch (e) { /* rien */ }
    planifier();
  }
  function surveiller() { if (arretee || !ws) return; if (dernierMessage && maintenant() - dernierMessage > silenceMaxMs) { stats.derniereErreur = 'silence de ' + Math.round((maintenant() - dernierMessage) / 1000) + ' s : reconnexion'; const w = ws; ws = null; try { w.close(); } catch (e) { /* déjà */ } coupure(); } }
  return {
    ouvrir() { if (!arretee) return; arretee = false; attente = attenteMinMs; ouvrir(); veille = setInterval(surveiller, verifierMs); if (veille.unref) veille.unref(); },
    fermer() { arretee = true; clearTimeout(minuteur); clearInterval(veille); if (ws) { const w = ws; ws = null; try { w.close(); } catch (e) { /* déjà */ } } },
    envoyer(m) { if (ws && ws.readyState === 1) { ws.send(typeof m === 'string' ? m : JSON.stringify(m)); return true; } return false; },
    etat: () => ({ nom, connecte: !!ws && ws.readyState === 1, ...stats, dernierMessage, coupureLe, essais })
  };
}
