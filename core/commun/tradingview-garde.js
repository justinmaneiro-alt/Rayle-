/* Garde du widget TradingView : le widget est une iframe d'un autre site, la page ne peut pas voir ce qu'elle affiche. Un cadre resté vide (script bloqué, réseau,
   widget planté) ne donne aucune erreur : on le détecte par l'ABSENCE des messages que le widget envoie à la page quand il démarre
   (« tv-widget-load », « widgetReady », « quoteUpdate »). Sans message dans le délai : message de secours visible + lien vers TradingView + « Réessayer ».
   Script classique (window.TVGarde) et module Node (tests). */
(function (racine) {
  var DELAI_MS = 15000;
  var NOMS_PRET = { 'tv-widget-load': 1, widgetReady: 1, quoteUpdate: 1 };
  /* Le message vient-il d'un widget TradingView vivant ? (fonction pure, testée) */
  function messagePret(origine, donnees) {
    if (!/^https:\/\/([a-z0-9-]+\.)*tradingview(-widget)?\.com$/.test(String(origine || ''))) return false;
    var d = donnees;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return false; } }
    return !!(d && typeof d === 'object' && NOMS_PRET[d.name]);
  }
  /* Adresse du même graphique sur tradingview.com (pour l'ouvrir dans un onglet). */
  function lien(symbole, intervalle) {
    return 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbole || '') + '&interval=' + encodeURIComponent(intervalle || '60');
  }
  function echapper(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* Surveille `boite` : appelle surPret() au premier message du widget, surEchec() si rien n'arrive dans `delai`. Rend { arreter(), pret() }. */
  function surveiller(opt) {
    var fen = opt.fenetre || racine, delai = opt.delai || fen.__TV_DELAI_MS__ || DELAI_MS, fini = false, ok = false, minuteur = null;
    function ecoute(e) { if (!ok && messagePret(e.origin, e.data)) { ok = true; terminer(); if (opt.surPret) opt.surPret(); } }
    function terminer() { fini = true; if (minuteur) fen.clearTimeout(minuteur); fen.removeEventListener('message', ecoute); }
    fen.addEventListener('message', ecoute);
    minuteur = fen.setTimeout(function () { if (fini) return; terminer(); if (opt.surEchec) opt.surEchec(); }, delai);
    return { arreter: function () { if (!fini) terminer(); }, pret: function () { return ok; } };
  }
  /* Message de secours dans `boite` (remplace le cadre muet). `actions` : { reessayer(), alternative() } ; `libelleAlt` : texte du bouton (ex. « Graphique Raylé »). */
  function afficherSecours(boite, opt) {
    var d = boite.ownerDocument, bloc = d.createElement('div');
    bloc.className = 'tv-secours'; bloc.setAttribute('role', 'alert');
    bloc.style.cssText = 'position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center;background:#06040b;color:#cfe9f2;font:14px/1.5 system-ui,sans-serif';
    bloc.innerHTML = '<div style="font-size:15px">TradingView n’a pas pu se charger.</div><div style="opacity:.75;max-width:520px">' + echapper(opt.raison || 'Le widget n’a pas répondu (réseau, bloqueur de publicités ou service indisponible).') + '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a data-a="onglet" href="' + echapper(lien(opt.symbole, opt.intervalle)) + '" target="_blank" rel="noopener noreferrer" style="padding:7px 14px;border:1px solid #8fd0e3;color:#8fd0e3;text-decoration:none">Ouvrir dans un nouvel onglet</a>' +
      '<button type="button" data-a="reessayer" style="padding:7px 14px;border:1px solid #8fd0e3;background:transparent;color:#8fd0e3;cursor:pointer">Réessayer</button>' +
      (opt.alternative ? '<button type="button" data-a="alt" style="padding:7px 14px;border:1px solid #8fd0e3;background:transparent;color:#8fd0e3;cursor:pointer">' + echapper(opt.libelleAlt || 'Graphique Raylé') + '</button>' : '') + '</div>';
    if (boite.style && !/relative|absolute|fixed/.test(boite.ownerDocument.defaultView.getComputedStyle(boite).position)) boite.style.position = 'relative';
    boite.appendChild(bloc);
    var r = bloc.querySelector('[data-a=reessayer]'); if (r) r.onclick = function () { if (opt.reessayer) opt.reessayer(); };
    var a = bloc.querySelector('[data-a=alt]'); if (a) a.onclick = function () { if (opt.alternative) opt.alternative(); };
    return bloc;
  }
  /* Le widget garde la taille qu'avait son cadre à son démarrage (fenêtre en cours d'animation, dossier replié…) : constaté dans la fenêtre de Mars, le graphique
     n'occupait que les deux tiers du cadre, le reste restait vide. Un vrai changement de taille de l'iframe (-60 px, puis retour 250 ms plus tard) le fait se recalculer ;
     un décalage d'un pixel ne suffit pas. */
  function ajusterTaille(boite) {
    var f = boite.querySelector('iframe'); if (!f || f.__tvAjuste) return;
    var fen = boite.ownerDocument.defaultView, w = f.getBoundingClientRect().width; if (w < 200) return;
    f.__tvAjuste = true; f.style.width = (w - 60) + 'px';
    fen.setTimeout(function () { f.style.width = '100%'; f.__tvAjuste = false; }, 250);
  }
  /* Recalcule le widget à chaque changement de taille du cadre (arrêt : la fonction rendue). */
  function suivreTaille(boite) {
    var fen = boite.ownerDocument.defaultView, t = null, derniere = boite.clientWidth + 'x' + boite.clientHeight;
    if (!fen.ResizeObserver) return function () {};
    var obs = new fen.ResizeObserver(function () {
      var f = boite.querySelector('iframe'); if (f && f.__tvAjuste) return;
      var n = boite.clientWidth + 'x' + boite.clientHeight; if (n === derniere) return; derniere = n;
      if (t) fen.clearTimeout(t); t = fen.setTimeout(function () { ajusterTaille(boite); }, 500);
    });
    obs.observe(boite);
    return function () { if (t) fen.clearTimeout(t); obs.disconnect(); };
  }
  var API = { DELAI_MS: DELAI_MS, messagePret: messagePret, lien: lien, surveiller: surveiller, afficherSecours: afficherSecours, ajusterTaille: ajusterTaille, suivreTaille: suivreTaille };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else racine.TVGarde = API;
})(typeof window !== 'undefined' ? window : globalThis);
