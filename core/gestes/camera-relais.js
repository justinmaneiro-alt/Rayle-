"use strict";
/* ═════════════ CAMÉRA DU TÉLÉPHONE PAR HTTPS (V3, phase 4) : côté page Rayle ═════════════
   Le PC demande une session au Worker (jeton aléatoire, usage unique, 5 minutes), affiche le QR code (adresse de la page HTTPS « Caméra Rayle » + session + jeton dans le FRAGMENT de l'adresse),
   puis relit les POINTS de main que le téléphone envoie au Worker et les passe au moteur de gestes. Jamais de vidéo. Chaque trame relue est REVALIDÉE ici (GestesCalcul.validerMains) : le relais n'est pas cru sur parole.
   Aucune clé n'est affichée ni stockée : le jeton de session ne vit que dans le QR et dans la mémoire de la page. */
const CameraRelais = (() => {
  const PAGE_PAR_DEFAUT = 'https://justinmaneiro-alt.github.io/Rayle-/camera/';
  const E = { etat: 'inactive', session: null, jeton: null, expire: 0, url: '', erreur: '', recues: 0, derniere: 0, dernierEnvoi: null, qr: null };
  const ecouteurs = []; let minuteur = 0, apres = 0, enVol = false, surTrames = null, voulu = false;
  const prevenir = () => { for (const f of ecouteurs.slice()) { try { f(E); } catch (e) { /* un écouteur fautif n'arrête pas les autres */ } } };
  const surEvenement = f => { ecouteurs.push(f); return () => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); }; };
  const workerOk = () => typeof workerReady !== 'undefined' && workerReady();
  const workerUrl = () => { try { return RayleBus.demander('worker').url; } catch (e) { return ''; } };

  /* Adresse de la page du téléphone : celle du site si Rayle tourne sur GitHub Pages, sinon celle du dépôt public (réglable : window.RAYLE_CAMERA_PAGE). */
  function pageCamera() {
    if (window.RAYLE_CAMERA_PAGE) return String(window.RAYLE_CAMERA_PAGE);
    if (/\.github\.io$/.test(location.hostname)) { const base = location.pathname.replace(/[^/]*$/, ''); return location.origin + base + 'camera/'; }
    return PAGE_PAR_DEFAUT;
  }
  /* Le QR porte le moins d'octets possible : l'adresse du Worker sans « https:// ». */
  function adresseQR(page, id, jeton, worker) { return page + '#s=' + id + '&j=' + jeton + '&w=' + String(worker).replace(/^https:\/\//i, '').replace(/\/+$/, ''); }

  async function api(chemin, corps) {
    const res = await wfetch(chemin, corps === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(corps) }, 12000);
    let j = null; try { j = await res.json(); } catch (e) { /* corps illisible */ }
    if (!res.ok) { const err = new Error((j && j.error) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
    return j;
  }
  function messageErreur(e) {
    const m = String(e && e.message || e);
    if (e && e.status === 404) return 'Le Worker n’est pas à jour : la caméra du téléphone par HTTPS demande la version V3 phase 4 (voir docs/deploiement-worker-v3.md).';
    if (e && e.status === 429) return m;
    if (e && e.status === 400 && /D1/.test(m)) return 'Le Worker n’a pas de base D1 : ajoutez la liaison DB.';
    return typeof errMsg === 'function' ? errMsg(e) : m;
  }

  async function demarrer({ aSurTrames } = {}) {
    await arreter(false); surTrames = aSurTrames || surTrames; E.erreur = '';
    if (!workerOk()) { E.etat = 'erreur'; E.erreur = 'Le Worker n’est pas configuré (⚙ Réglages) : le téléphone passe par lui.'; prevenir(); return false; }
    try {
      const s = await api('/camera/session', {});
      E.session = s.id; E.jeton = s.jeton; E.expire = s.expire; E.etat = 'attente'; E.recues = 0; E.derniere = 0; E.dernierEnvoi = null; apres = 0; voulu = true;
      E.url = adresseQR(pageCamera(), s.id, s.jeton, workerUrl());
      E.qr = window.QrMatrice ? window.QrMatrice.matriceQR(E.url) : null;
    } catch (e) { E.etat = 'erreur'; E.erreur = messageErreur(e); E.session = E.jeton = null; prevenir(); return false; }
    prevenir(); planifier(1000); return true;
  }
  function planifier(ms) { clearTimeout(minuteur); if (voulu) minuteur = setTimeout(tour, ms); }
  async function tour() {
    if (!voulu || !E.session) return; if (enVol) return planifier(200); enVol = true; let delai = 220;
    try {
      const r = await api('/camera/lire?s=' + encodeURIComponent(E.session) + '&apres=' + apres);
      apres = r.seq; E.dernierEnvoi = r.dernierEnvoi; E.expire = r.expire || E.expire;
      if (r.etat === 'rejointe') { if (E.etat !== 'connecte') E.etat = 'connecte'; E.jeton = null; }   // le jeton a servi : il ne reste plus nulle part
      else if (r.etat === 'attente') { E.etat = 'attente'; delai = 1000; }
      else if (r.etat === 'expiree') { E.etat = 'expiree'; voulu = false; }
      else if (r.etat === 'fermee') { E.etat = 'fermee'; voulu = false; }
      const g = window.GestesCalcul;
      for (const t of (r.trames || [])) { const v = g ? g.validerMains(t) : null; if (v) { E.recues++; E.derniere = Date.now(); if (surTrames) surTrames({ t: v.t, ratio: v.ratio, mains: v.mains }); } }
      if (E.etat === 'connecte' && E.dernierEnvoi && Date.now() - E.dernierEnvoi > 4000) delai = 600;   // téléphone silencieux : on ralentit
      E.erreur = '';
    } catch (e) { E.erreur = messageErreur(e); delai = 2500; if (e && (e.status === 401 || e.status === 404)) voulu = false; }
    enVol = false; prevenir(); if (voulu) planifier(delai);
  }
  async function arreter(prevenirAussi = true) {
    voulu = false; clearTimeout(minuteur); const s = E.session; E.session = null; E.jeton = null; E.qr = null; E.url = '';
    if (s && workerOk()) { try { await api('/camera/fin', { s }); } catch (e) { /* le Worker referme tout seul à l'expiration */ } }
    if (E.etat !== 'erreur') E.etat = 'inactive';
    if (prevenirAussi) prevenir();
  }
  return { demarrer, arreter, etat: () => ({ ...E, qr: E.qr }), surEvenement, pageCamera, adresseQR, definirSurTrames: f => { surTrames = f; } };
})();
window.CameraRelais = CameraRelais;
