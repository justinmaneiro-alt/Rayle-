"use strict";
/* ═════════════ GESTES : interface (⚙ Gestes, pastille d'état, écran d'aide, calibrage, caméra du téléphone par QR) ═════════════ */
const GestesUI = (() => {
  const G = window.Gestes, cfg = document.getElementById('cfg');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  let sect = null, modale = null, pastille = null, minuteurTel = 0, etatTel = null, avaitTel = false, messageBouton = null;

  const VOCABULAIRE = [
    ['☝', 'Pointer', 'Index tendu, les autres doigts repliés : le curseur suit ton doigt.'],
    ['🤏', 'Pincer et relâcher vite', 'Un clic. Deux pincements rapprochés : double clic.'],
    ['🤏…', 'Pincer et tenir (0,3 s)', 'Saisir : la fenêtre ou l’objet 3D sous le curseur te suit ; relâche pour le lâcher.'],
    ['🤏🤏', 'Pincer à deux mains et écarter', 'Redimensionner / zoomer ; rapprocher pour réduire.'],
    ['✋', 'Main ouverte qui balaie', 'Faire défiler les piles (balayage rapide gauche ou droite).'],
    ['✊', 'Poing tenu 0,7 s', 'Ranger les fenêtres.'],
    ['✋✋', 'Deux mains ouvertes qui tournent', 'Faire pivoter l’objet 3D.'],
    ['✊✊', 'Deux poings tenus 1,5 s', 'Mettre les gestes en pause, et les reprendre de la même façon.']
  ];

  function section() {
    const h3 = cfg && [...cfg.querySelectorAll('h3')].find(h => /^Tests/i.test(h.textContent.trim())); if (!h3 || $('gestes-section')) return;
    sect = document.createElement('div'); sect.id = 'gestes-section';
    sect.innerHTML = '<h3>Gestes (caméra)</h3><div class="hint" id="gs-etat" role="status"></div>' +
      '<label class="chk"><input type="checkbox" id="gs-actif"> Activer les gestes de la main (la caméra analyse les points de ta main, rien ne part sur Internet)</label>' +
      '<label for="gs-source">Caméra</label><select id="gs-source"><option value="locale">Webcam du PC</option><option value="telephone-https">Caméra du téléphone (QR sécurisé HTTPS)</option><option value="telephone">Caméra du téléphone (réseau local, avancé)</option></select>' +
      '<div class="row"><button type="button" class="ghost" id="gs-aide">Aide des gestes</button><button type="button" class="ghost" id="gs-calib">Calibrer</button><button type="button" class="ghost" id="gs-tel">Caméra du téléphone…</button><button type="button" class="ghost" id="gs-suivi">Fenêtre de suivi</button><button type="button" class="ghost" id="gs-pause">Pause</button><button type="button" class="ghost" id="gs-enreg">Enregistrer 5 s</button></div>' +
      '<label class="chk"><input type="checkbox" id="gs-miroir"> Image en miroir (caméra de face)</label><label class="chk"><input type="checkbox" id="gs-droitier"> Main droite pour le curseur</label>' +
      '<div class="hint">Désactivé par défaut. Sans caméra, la souris et le toucher marchent comme avant. Alt+G : pause rapide. Procédure et limites : docs/GESTES.md.</div>';
    h3.parentNode.insertBefore(sect, h3);
    /* La case marche avec la caméra du téléphone dès qu'il est connecté (ou en attente) ; sans téléphone, avec le choix de la liste (webcam du PC par défaut). */
    $('gs-actif').addEventListener('change', async e => {
      if (e.target.checked) {
        const src = $('gs-source').value;
        if (!G.telephoneConnecte() && src === 'telephone-https' && window.CameraRelais) { e.target.checked = false; telephone(); return; }
        if (G.telephoneConnecte()) await G.activer({ source: 'telephone-https' }); else await G.activer({ source: src });
      } else await G.desactiver();
      maj();
    });
    $('gs-source').addEventListener('change', async e => { G.regler({ source: e.target.value }); if (G.etat().actif) await G.activer({ source: e.target.value }); maj(); });
    $('gs-aide').addEventListener('click', aide); $('gs-calib').addEventListener('click', calibration); $('gs-tel').addEventListener('click', telephone); $('gs-suivi').addEventListener('click', () => { if (window.GestesTel) window.GestesTel.ouvrir(); });
    $('gs-pause').addEventListener('click', () => { G.mettreEnPause(!G.etat().pause); });
    $('gs-miroir').addEventListener('change', e => G.regler({ miroir: e.target.checked })); $('gs-droitier').addEventListener('change', e => G.regler({ droitier: e.target.checked }));
    $('gs-enreg').addEventListener('click', async () => { try { $('gs-etat').textContent = 'Enregistrement de 5 secondes… bouge la main.'; const j = await G.enregistrer(5); G.telecharger(j, 'gestes-' + Date.now() + '.json'); $('gs-etat').textContent = 'Enregistré : ' + j.frames.length + ' images (fichier téléchargé, rejouable pour les tests).'; } catch (e) { $('gs-etat').textContent = e.message; } });
  }

  function pastilleEl() {
    if (pastille) return pastille; pastille = document.createElement('div'); pastille.id = 'gestes-pastille'; pastille.setAttribute('role', 'status'); pastille.hidden = true; document.body.appendChild(pastille);
    pastille.addEventListener('click', () => G.mettreEnPause(!G.etat().pause)); return pastille;
  }
  function libelle(e) {
    if (!e.actif) return e.erreur ? 'Gestes : ' + e.erreur : 'Gestes désactivés';
    const src = { locale: 'webcam', telephone: 'téléphone (réseau local)', 'telephone-https': 'caméra du téléphone', rejeu: 'rejeu' }[e.source] || e.source;
    if (e.source === 'telephone-https' && window.CameraRelais) { const r = window.CameraRelais.etat(); return (e.pause ? '⏸ Gestes en pause' : '✋ Gestes') + ' · ' + src + ' · ' + (r.etat === 'attente' ? 'en attente du téléphone' : r.liaison === 'direct' ? 'connecté (direct, ' + r.debit + ' paquets/s' + (r.delai != null ? ', ' + r.delai + ' ms' : '') + ')' : r.etat === 'connecte' ? 'connecté (par le Worker, lent)' : 'non connecté') + (r.etat === 'connecte' ? ' · ' + e.mains + ' main' + (e.mains > 1 ? 's' : '') : '') + (e.derniere ? ' · ' + e.derniere : ''); }
    return (e.pause ? '⏸ Gestes en pause' : '✋ Gestes') + ' · ' + src + (e.camera || e.source !== 'locale' ? ' · ' + e.mains + ' main' + (e.mains > 1 ? 's' : '') : (e.info ? ' · ' + e.info : '')) + (e.derniere ? ' · ' + e.derniere : '');
  }
  function maj() {
    const e = G.etat(), r = G.reglages(), p = pastilleEl();
    p.hidden = !e.actif; p.textContent = libelle(e); p.dataset.etat = e.pause ? 'pause' : e.mains ? 'main' : 'attente';
    const tel = e.actif && e.source === 'telephone-https';
    if (tel && !avaitTel && window.GestesTel) window.GestesTel.ouvrir();   // la fenêtre de suivi s'ouvre quand la caméra du téléphone s'active
    if (!tel && avaitTel && window.GestesTel && !(e.erreur)) window.GestesTel.fermer();
    avaitTel = tel;
    if (sect) { $('gs-etat').textContent = libelle(e) + (e.erreur ? '' : ''); $('gs-actif').checked = e.actif; const sv = e.actif ? e.source : r.source; $('gs-source').value = sv === 'telephone' || sv === 'telephone-https' ? sv : 'locale'; $('gs-miroir').checked = r.miroir; $('gs-droitier').checked = r.droitier; $('gs-pause').textContent = e.pause ? 'Reprendre' : 'Pause'; if (e.erreur) $('gs-etat').textContent = e.erreur; }
  }

  function modaleEl() {
    if (modale) return modale; modale = document.createElement('section'); modale.id = 'gestes-modale'; modale.hidden = true; modale.setAttribute('role', 'dialog'); document.body.appendChild(modale);
    modale.addEventListener('click', e => { if (e.target.closest('[data-g="fermer"]') || e.target === modale) fermer(); }); return modale;
  }
  function fermer() { messageBouton = null; if (!modale) return; modale.hidden = true; modale.innerHTML = ''; G.brancherApercu(null); clearInterval(minuteurTel); }
  function ouvrirModale(titre, html) { const m = modaleEl(); m.hidden = false; m.innerHTML = '<div class="gm-boite"><header><b>' + esc(titre) + '</b><button type="button" data-g="fermer" aria-label="Fermer">✕</button></header><div class="gm-corps">' + html + '</div></div>'; return m; }

  function aide() {
    ouvrirModale('Les gestes de la main', '<table class="gm-tab"><tbody>' + VOCABULAIRE.map(([i, n, d]) => '<tr><td class="gm-ic">' + i + '</td><td><b>' + esc(n) + '</b><br><span>' + esc(d) + '</span></td></tr>').join('') + '</tbody></table>' +
      '<p class="gm-note">Les gestes passent par le même curseur virtuel que le pad de la tablette : ils marchent sur les fenêtres de Mars, de l’accueil, les piles et les objets 3D. Si un geste se déclenche tout seul, mets les gestes en pause (Alt+G, ou deux poings tenus) et refais la calibration. Dis « Raylé, désactive les gestes » pour tout couper.</p>' +
      '<div class="gm-actions"><button type="button" id="gm-calib">Calibrer maintenant</button></div>');
    $('gm-calib').addEventListener('click', calibration);
  }

  function calibration() {
    const e = G.etat();
    ouvrirModale('Calibrage des gestes', '<p class="gm-note">Trois mesures de quelques secondes, prises sur toi : main ouverte, main pincée, balayage de l’écran avec le doigt. Les seuils (pincement) et la taille de la zone de la main sont réglés d’après elles.</p>' +
      '<div class="gm-apercu"><canvas id="gm-cv" width="320" height="240"></canvas></div><div id="gm-consigne" class="gm-consigne">' + (e.actif ? 'Prêt.' : 'Active d’abord les gestes (⚙ → Gestes), puis reviens ici.') + '</div><div id="gm-resultat" class="gm-note"></div>' +
      '<div class="gm-actions"><button type="button" id="gm-go"' + (e.actif ? '' : ' disabled') + '>Démarrer</button><button type="button" class="sec" id="gm-reset">Remettre les réglages d’origine</button></div>');
    G.brancherApercu($('gm-cv'));
    $('gm-reset').addEventListener('click', () => { G.reinitialiserReglages(); $('gm-resultat').textContent = 'Réglages d’origine rétablis.'; });
    $('gm-go').addEventListener('click', async () => {
      $('gm-go').disabled = true;
      try {
        const r = await G.calibrer({ etape: (n, t) => { $('gm-consigne').textContent = 'Étape ' + n + '/3 — ' + t; } });
        $('gm-consigne').textContent = 'Terminé.';
        $('gm-resultat').innerHTML = (r.seuils.ok ? 'Pincement : fermé sous ' + r.seuils.seuilFerme + ', ouvert au-dessus de ' + r.seuils.seuilOuvre + '. ' : '<b>Pincement non réglé :</b> ' + esc(r.seuils.raison) + ' ') + (r.zone.ok ? 'Zone de la main : ' + Math.round(r.zone.zoneUtile * 100) + ' % de l’image.' : '<b>Zone non réglée :</b> ' + esc(r.zone.raison));
      } catch (err) { $('gm-resultat').textContent = err.message; }
      $('gm-go').disabled = false;
    });
  }

  // ── caméra du téléphone par QR ──
  function svgQR(lignes) {
    const n = lignes.length; let d = ''; lignes.forEach((l, y) => { for (let x = 0; x < n; x++) if (l[x] === '1') d += 'M' + x + ' ' + y + 'h1v1h-1z'; });
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" role="img" aria-label="QR code de la caméra du téléphone"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#050608"/></svg>';
  }
  /* Mode sécurisé HTTPS (V3 phase 4) : page GitHub Pages + Worker, QR à jeton unique, aucune alerte de certificat. */
  let minuteurHttps = 0;
  function majHttps() {
    const z = $('gm-https'); if (!z) { clearInterval(minuteurHttps); return; }
    const R = window.CameraRelais; if (!R) { z.innerHTML = '<div class="gm-err">Module indisponible.</div>'; return; }
    const e = R.etat(), reste = e.expire ? Math.max(0, Math.round((e.expire - Date.now()) / 1000)) : 0, mmss = Math.floor(reste / 60) + ' min ' + String(reste % 60).padStart(2, '0') + ' s';
    let h = '<h4 class="gm-h">Mode sécurisé (HTTPS) · recommandé</h4>';
    if (e.etat === 'attente' && e.qr) {
      h += '<div class="gm-qr">' + svgQR(e.qr.map(l => l.map(x => x ? '1' : '0').join(''))) + '</div><p class="gm-note">Scanne ce QR code avec le téléphone : il ouvre une page <b>HTTPS</b> (aucun avertissement de certificat). Le code ne sert <b>qu’une fois</b> et expire dans <b>' + mmss + '</b>. Seuls les points de ta main transitent, jamais la vidéo.</p>';
    } else if (e.etat === 'connecte') {
      h += '<p class="gm-note"><b>Téléphone connecté.</b> ' + e.recues + ' trames de points reçues · liaison ' + (e.liaison === 'direct' ? '<b>directe</b> : ' + e.debit + ' paquets/s' + (e.delai != null ? ', délai ' + e.delai + ' ms' : '') : e.liaison === 'negociation' ? 'directe en cours d’ouverture…' : 'par le Worker (lente)' + (e.directEchec ? ' : ' + esc(e.directEchec) : '')) + (e.dernierEnvoi ? ' · dernier envoi il y a ' + Math.max(0, Math.round((Date.now() - e.dernierEnvoi) / 1000)) + ' s' : '') + '. Session valable encore ' + mmss + '. Sur le téléphone, appuie sur « Démarrer la caméra ».</p>';
    } else if (e.etat === 'expiree') h += '<div class="gm-err">Le code a expiré (ou la session est terminée). Génère-en un nouveau.</div>';
    else if (e.etat === 'fermee') h += '<p class="gm-note">Session fermée.</p>';
    else h += '<p class="gm-note">Un QR code à usage unique, valable 5 minutes, lie le téléphone à cette session. Il passe par ton Worker Cloudflare : le téléphone n’a besoin d’aucune configuration.</p>';
    if (e.erreur) h += '<div class="gm-err">' + esc(e.erreur) + '</div>';
    const g = G.etat(), actifTel = g.actif && g.source === 'telephone-https';
    if (e.etat === 'attente' || e.etat === 'connecte') h += '<div class="gm-etat ' + (messageBouton && messageBouton.ko ? 'ko' : actifTel ? 'ok' : '') + '" role="status" id="gm-etat-gestes">' + esc(messageBouton ? messageBouton.t : actifTel ? 'Gestes activés avec la caméra du téléphone. Lève la main devant le téléphone.' : 'Gestes éteints. Appuie sur « Utiliser la caméra du téléphone pour les gestes ».') + '</div>';
    h += '<div class="gm-actions">' + (e.etat === 'attente' || e.etat === 'connecte' ? '<button type="button" data-h="utiliser">Utiliser la caméra du téléphone pour les gestes</button><button type="button" class="sec" data-h="suivi">Fenêtre de suivi</button><button type="button" class="sec" data-h="fermer">Fermer la session</button>' : '<button type="button" data-h="creer">Générer un QR code sécurisé</button>') + '</div>';
    if (z.dataset.sig !== h) { z.dataset.sig = h; z.innerHTML = h; }
  }
  async function majTelephone() {
    const z = $('gm-tel'); if (!z) return;
    try { etatTel = await G.api('etat'); } catch (e) { etatTel = { actif: false, erreur: 'Serveur local injoignable : cette fonction demande l’application PC.' }; }
    const t = etatTel;
    z.innerHTML = !t.actif
      ? '<p class="gm-note">Le pont est éteint. Il ouvre une page sécurisée, accessible seulement depuis ton réseau local (Wi-Fi de la maison), qui reçoit uniquement les points de ta main.</p>' + (t.erreur ? '<div class="gm-err">' + esc(t.erreur) + '</div>' : '') + '<div class="gm-actions"><button type="button" data-t="activer">Activer le pont téléphone</button></div>'
      : '<div class="gm-qr">' + (t.qr ? svgQR(t.qr) : '') + '</div><p class="gm-note">Scanne ce QR code avec le téléphone, puis saisis le code à 6 chiffres : <b class="gm-code">' + esc(t.code || '') + '</b> (valable 5 minutes).<br><small>' + esc(t.url || '') + '</small></p>' +
        (t.https ? '' : '<div class="gm-err">Page en HTTP : Chrome refusera la caméra du téléphone tant qu’elle n’est pas en HTTPS (certificat non fabriqué).</div>') + (t.avertissement ? '<div class="gm-err">' + esc(t.avertissement) + '</div>' : '') +
        '<p class="gm-note">Le téléphone affichera un avertissement de certificat (« connexion non privée ») : c’est normal, le certificat est fabriqué par ce PC. Choisis « Avancé » puis « Continuer ». Pose-le sur un support, écran vers toi.</p>' +
        '<h4 class="gm-h">Téléphones appairés</h4>' + ((t.appareils || []).length ? t.appareils.map(a => '<div class="gm-app">' + esc(a.nom) + (a.connecte ? ' · <b>connecté</b>' + (a.latence != null ? ' · ' + a.latence + ' ms' : '') : ' · hors ligne') + ' <button type="button" data-t="deconnecter" data-id="' + esc(a.id) + '">Retirer</button></div>').join('') : '<p class="gm-note">Aucun téléphone appairé.</p>') +
        '<div class="gm-actions"><button type="button" data-t="utiliser">Utiliser la caméra du téléphone pour les gestes</button><button type="button" class="sec" data-t="arret">Éteindre le pont</button><button type="button" class="sec" data-t="urgence">Arrêt d’urgence</button></div>';
  }
  function telephone() {
    ouvrirModale('Caméra du téléphone', '<div id="gm-https"></div><h4 class="gm-h">Réseau local (avancé)</h4><div id="gm-tel">Chargement…</div>');
    $('gm-https').addEventListener('click', async e => {
      const b = e.target.closest('[data-h]'); if (!b || !window.CameraRelais) return;
      if (b.dataset.h === 'creer') { await window.CameraRelais.demarrer({ aSurTrames: f => G.injecter(f) }); }
      else if (b.dataset.h === 'fermer') { await window.CameraRelais.arreter(); if (G.etat().actif && G.etat().source === 'telephone-https') await G.desactiver(); }
      else if (b.dataset.h === 'utiliser') {
        messageBouton = { t: 'Activation des gestes…' }; majHttps();
        const ok = await G.activer({ source: 'telephone-https' }); const g = G.etat();
        messageBouton = ok ? { t: 'Gestes activés avec la caméra du téléphone. Lève la main devant le téléphone.' } : { t: g.erreur || 'Les gestes n’ont pas pu s’activer.', ko: true };
        maj();
      } else if (b.dataset.h === 'suivi') { if (window.GestesTel) window.GestesTel.ouvrir(); }
      majHttps();
    });
    if (window.CameraRelais) window.CameraRelais.surEvenement(majHttps);
    majHttps(); clearInterval(minuteurHttps); minuteurHttps = setInterval(majHttps, 1000);
    $('gm-tel').addEventListener('click', async e => {   // un seul écouteur : le conteneur reste, son contenu est redessiné
      const b = e.target.closest('[data-t]'); if (!b) return;
      if (b.dataset.t === 'activer') { try { etatTel = await G.api('activer', {}); } catch (x) { /* serveur local injoignable : majTelephone l'explique */ } }
      else if (b.dataset.t === 'arret') await G.api('desactiver', {}); else if (b.dataset.t === 'urgence') await G.api('urgence', {});
      else if (b.dataset.t === 'deconnecter') await G.api('deconnecter', { id: b.dataset.id });
      else if (b.dataset.t === 'utiliser') { await G.activer({ source: 'telephone' }); maj(); }
      majTelephone();
    });
    majTelephone(); clearInterval(minuteurTel); minuteurTel = setInterval(majTelephone, 3000);
  }

  window.addEventListener('keydown', e => { if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'g' || e.key === 'G') && G.etat().actif) { e.preventDefault(); G.mettreEnPause(!G.etat().pause); } });
  G.surEvenement(maj); section(); maj(); setInterval(() => { const e = G.etat(); if (e.actif && e.source === "telephone-https") maj(); }, 1000);
  return { aide, calibration, telephone, maj, fermer, VOCABULAIRE };
})();
window.GestesUI = GestesUI;
