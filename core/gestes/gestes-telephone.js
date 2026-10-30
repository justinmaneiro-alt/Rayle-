"use strict";
/* ═════════════ GESTES : fenêtre de suivi de la caméra du téléphone (sur le PC) ═════════════
   S'ouvre toute seule quand les gestes s'activent avec la caméra du téléphone. Montre, en direct : le squelette des mains reçu (dessiné à partir des points, pas d'une image), le geste reconnu,
   l'état de la liaison (directe / relais / en attente), le débit (paquets par seconde) et le délai. L'APERÇU VIDÉO de la caméra est désactivé par défaut : il ne part du téléphone que si la case est cochée ici,
   par la liaison directe seulement, en petit JPEG, et s'arrête dès qu'elle est décochée ou que la fenêtre se ferme. Se déplace à la souris ou au doigt (barre de titre). */
const GestesTel = (() => {
  const G = window.Gestes, esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LIAISONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  let fen = null, cv = null, ctx = null, raf = 0, derniereMaj = 0, imgApercu = null;

  /* Texte du geste en cours, d'après l'état du moteur et le dernier événement (pur : testable sans navigateur). */
  function libelleGeste(e, moteur) {
    if (!e.actif) return 'gestes éteints';
    if (e.pause) return 'en pause';
    const m = moteur || {};
    if (e.moteurV === 5) {   // V5 : l'engagement d'abord
      if (e.mode === 'sans-main') return 'aucune main';
      if (e.mode === 'repos') return 'main vue, pas engagé (ouvre-la ≈ 1 s)';
      if (m.deux === 'pince') return 'deux mains : redimensionner / zoomer';
      if (m.deux === 'ouvertes') return 'deux mains : pivoter';
      if (m.saisie) return 'saisie (fenêtre ou objet tenu)';
      if (e.derniere) return 'engagé · ' + e.derniere;
      return 'engagé · ' + (e.pose || 'pointer');
    }
    if (m.deux === 'zoom') return 'redimensionner (deux mains)';
    if (m.deux === 'rotation') return 'pivoter (deux mains)';
    if (m.saisie) return 'saisie (fenêtre ou objet tenu)';
    if (e.derniere) return e.derniere;
    return e.mains ? 'pointer' : 'aucune main';
  }
  function libelleLiaison(r) {
    if (r.etat === 'attente') return { t: 'en attente du téléphone (scanne le QR)', c: 'att' };
    if (r.etat === 'expiree' || r.etat === 'fermee') return { t: 'session terminée', c: 'ko' };
    if (r.etat === 'erreur' || r.erreur) return { t: 'erreur : ' + (r.erreur || 'liaison'), c: 'ko' };
    if (r.liaison === 'direct') return { t: 'connecté · liaison directe (WebRTC)', c: 'ok' };
    if (r.liaison === 'negociation') return { t: 'connecté · ouverture de la liaison directe…', c: 'att' };
    if (r.etat === 'connecte') return { t: 'connecté · par le Worker (lent)' + (r.directEchec ? ' · ' + r.directEchec : ''), c: 'att' };
    return { t: 'non connecté', c: 'ko' };
  }
  const R = () => window.CameraRelais;

  function dessiner() {
    raf = requestAnimationFrame(dessiner); if (!fen || !ctx) return;
    const r = R(), tr = r && r.etat().derniereTrame, c = ctx, w = cv.width, h = cv.height, miroir = G.reglages().miroir;
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(143,208,227,.06)'; c.fillRect(0, 0, w, h);
    const frais = tr && r.etat().derniere && Date.now() - r.etat().derniere < 700;
    if (frais) for (const [i, m] of tr.mains.entries()) {
      const X = p => (miroir ? 1 - p[0] : p[0]) * w, Y = p => p[1] * h; c.strokeStyle = i ? '#c9b27a' : '#8fd0e3'; c.fillStyle = i ? '#c9b27a' : '#8fd0e3'; c.lineWidth = 2; c.beginPath();
      for (const [a, b] of LIAISONS) { c.moveTo(X(m.pts[a]), Y(m.pts[a])); c.lineTo(X(m.pts[b]), Y(m.pts[b])); } c.stroke();
      for (const p of m.pts) c.fillRect(X(p) - 2, Y(p) - 2, 4, 4);
    }
    const now = performance.now(); if (now - derniereMaj > 250) { derniereMaj = now; textes(); }
  }
  function textes() {
    if (!fen) return; const r = R() ? R().etat() : {}, e = G.etat(), l = libelleLiaison(r), mot = G.moteur() ? G.moteur().etat() : null;
    const set = (id, v) => { const el = fen.querySelector('[data-k="' + id + '"]'); if (el && el.textContent !== v) el.textContent = v; };
    const pt = fen.querySelector('[data-k="pt"]'); if (pt) pt.className = 'gt-pt ' + l.c;
    set('liaison', l.t); set('debit', r.liaison === 'direct' || r.etat === 'connecte' ? (r.debit || 0) + ' paquets/s' + (r.binaire ? ' (binaires)' : '') : '—');
    set('delai', r.delaiTotal != null ? r.delaiTotal + ' ms de bout en bout (téléphone ' + r.dtTel + ' · réseau ' + r.delai + ' · PC ' + (r.traitement || 0).toFixed(1) + ')' : r.delai != null ? r.delai + ' ms (aller-retour ' + r.rtt + ' ms)' : (r.liaison === 'direct' ? 'mesure…' : '—'));
    set('perte', r.liaison === 'direct' ? Math.round((r.perte || 0) * 100) + ' % perdus · ' + (r.ecartes || 0) + ' en retard écartés · gigue ' + (r.gigue || 0) + ' ms' : '—');
    const cf = fen.querySelector('[data-k="conf"]'); if (cf) cf.value = r.confiance == null ? 0 : r.confiance; set('confT', r.confiance == null ? '—' : Math.round(r.confiance * 100) + ' %');
    set('geste', libelleGeste(e, mot)); set('mains', String(e.mains || 0)); set('recues', String(r.recues || 0) + ' trames reçues');
    const t = r.tel; set('tel', t ? [t.calcul === 'pc' ? 'calcul sur le PC' : 'calcul sur le téléphone', t.cam != null ? 'caméra ' + Math.round(t.cam) + ' im/s' : null, t.det != null ? 'détection ' + Math.round(t.det) + ' im/s' : null, t.detMs != null ? Math.round(t.detMs) + ' ms' : null, t.res ? t.res + ' px' : null, t.mode === 'worker' ? 'Worker' : t.mode === 'principal' ? 'fil principal' : null, t.bat != null ? 'batterie ' + Math.round(t.bat * 100) + ' %' : null].filter(Boolean).join(' · ') : '—');
    const cmp = fen.querySelector('[data-g="comparer"]'); if (cmp) cmp.hidden = !(G.reglages().calculPc && r.liaison === 'direct');
    const lim = fen.querySelector('[data-k="note"]');
    if (lim) lim.textContent = r.liaison === 'direct' ? (r.conseil || '') : (r.etat === 'connecte' ? 'Sans la liaison directe le débit reste faible : le Worker doit être à jour (voir docs/GESTES.md).' : '');
    if (imgApercu) { if (r.apercu && imgApercu.src !== r.apercu) imgApercu.src = r.apercu; imgApercu.hidden = !r.apercu; }
  }
  function ouvrir() {
    if (fen) { fen.hidden = false; return fen; }
    fen = document.createElement('section'); fen.id = 'gestes-tel'; fen.setAttribute('role', 'region'); fen.setAttribute('aria-label', 'Suivi de la caméra du téléphone');
    fen.innerHTML = '<header data-g="barre"><span class="gt-pt ko" data-k="pt"></span><b>Caméra du téléphone</b><button type="button" data-g="fermer" aria-label="Fermer la fenêtre de suivi">✕</button></header>' +
      '<div class="gt-corps"><canvas width="280" height="210" aria-label="Squelette des mains reçu du téléphone"></canvas><img alt="Aperçu de la caméra du téléphone" hidden>' +
      '<dl><dt>Liaison</dt><dd data-k="liaison">…</dd><dt>Débit</dt><dd data-k="debit">—</dd><dt>Délai</dt><dd data-k="delai">—</dd><dt>Geste</dt><dd data-k="geste">—</dd><dt>Perte</dt><dd data-k="perte">—</dd><dt>Confiance</dt><dd><meter data-k="conf" min="0" max="1" low="0.5" high="0.8" optimum="1" value="0" style="width:90px"></meter> <span data-k="confT">—</span></dd><dt>Mains vues</dt><dd data-k="mains">0</dd><dt>Reçu</dt><dd data-k="recues">0</dd><dt>Téléphone</dt><dd data-k="tel">—</dd></dl>' +
      '<div class="gt-note" data-k="note"></div>' +
      '<div class="gt-fl"><button type="button" data-g="test">Test de fluidité (60 s)</button><button type="button" data-g="cibles">Jeu Cibles (3 min)</button><button type="button" data-g="comparer" hidden>Comparer téléphone / PC</button></div>' +
      '<label class="gt-chk gt-pcc"><input type="checkbox" data-g="calculpc"> Autoriser le calcul sur le PC (mode performance : la vidéo basse résolution part en direct du téléphone vers ce PC, sans serveur, sans enregistrement ; le téléphone doit aussi accepter). Désactivé par défaut : sans cela, seuls les points de ta main quittent le téléphone.</label>' +
      '<label class="gt-chk"><input type="checkbox" data-g="apercu"> Aperçu vidéo de la caméra (désactivé par défaut : une petite image part du téléphone, seulement tant que c’est coché)</label></div>';
    document.body.appendChild(fen); cv = fen.querySelector('canvas'); ctx = cv.getContext('2d'); imgApercu = fen.querySelector('img');
    fen.addEventListener('click', e => {
      if (e.target.closest('[data-g="fermer"]')) fermer();
      else if (e.target.closest('[data-g="test"]') && window.Fluidite) window.Fluidite.lancer();
      else if (e.target.closest('[data-g="cibles"]') && window.CiblesJeu) window.CiblesJeu.jouer();
      else if (e.target.closest('[data-g="comparer"]') && window.Fluidite) window.Fluidite.lancerComparaison();
    });
    const cc = fen.querySelector('[data-g="calculpc"]'); cc.checked = !!G.reglages().calculPc;
    cc.addEventListener('change', e => { G.regler({ calculPc: e.target.checked }); if (window.Fluidite) { window.Fluidite.brancherPiste(); window.Fluidite.activerCalculPc(e.target.checked); } });
    fen.querySelector('[data-g="apercu"]').addEventListener('change', e => { const ok = R() && R().definirApercu(e.target.checked); if (e.target.checked && !ok) { /* demandé : part dès que le canal direct s'ouvre */ } });
    // déplacer la fenêtre par la barre de titre (souris ou doigt)
    let dep = null; const barre = fen.querySelector('[data-g="barre"]');
    barre.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const b = fen.getBoundingClientRect(); dep = { dx: e.clientX - b.left, dy: e.clientY - b.top, id: e.pointerId }; try { barre.setPointerCapture(e.pointerId); } catch (x) { /* capture refusée */ } });
    barre.addEventListener('pointermove', e => { if (!dep || e.pointerId !== dep.id) return; fen.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - dep.dx)) + 'px'; fen.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - dep.dy)) + 'px'; fen.style.right = fen.style.bottom = 'auto'; });
    const fin = e => { if (dep && e.pointerId === dep.id) dep = null; }; barre.addEventListener('pointerup', fin); barre.addEventListener('pointercancel', fin);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(dessiner); textes(); return fen;
  }
  function fermer() {
    if (!fen) return; if (R()) R().definirApercu(false);
    cancelAnimationFrame(raf); raf = 0; fen.remove(); fen = null; cv = ctx = imgApercu = null;
  }
  return { ouvrir, fermer, ouverte: () => !!fen, libelleGeste, libelleLiaison };
})();
window.GestesTel = GestesTel;
