/* v6 (B2) : voyant global « données » dans la barre du haut et bouton « État des données » dans les Réglages (page : trader-pro/commun/etat-donnees-ui.js). Jamais bloquant : sans module, rien ne se passe. */
(function () {
  function lireConn() { try { var c = JSON.parse(localStorage.getItem('rayle_pf_conn_v1') || 'null'); return c && c.url ? { url: String(c.url).replace(/\/+$/, ''), code: String(c.code || '') } : null; } catch (e) { return null; } }
  function demarrer() {
    import('../../trader-pro/commun/etat-donnees-ui.js').then(function (m) {
      var b = document.getElementById('bridgeStatus');
      if (b && !document.getElementById('voyantDonnees')) { var s = document.createElement('span'); s.id = 'voyantDonnees'; s.style.cssText = 'display:inline-block;margin-left:6px'; b.insertAdjacentElement('afterend', s); m.monterVoyant(s, { lireConn: lireConn }); }
      var cfg = document.getElementById('cfg'), top = cfg && cfg.querySelector('.cfg-top');
      if (top && !document.getElementById('cfgEtatDonnees')) { var bt = document.createElement('button'); bt.type = 'button'; bt.id = 'cfgEtatDonnees'; bt.className = 'ghost'; bt.textContent = 'État des données'; bt.style.margin = '8px 0'; bt.addEventListener('click', function () { m.ouvrirEtatDonnees({ lireConn: lireConn }); }); top.insertAdjacentElement('afterend', bt); }
    }).catch(function () { /* état des données indisponible */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
