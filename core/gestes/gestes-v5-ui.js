"use strict";
/* ═════════════ GESTES V5 : réglages simples (⚙), calibrage rapide de 10 s, mode « Apprendre les gestes » ═════════════
   Réglages : zone active, lissage, sensibilité du clic, taille du pointeur, main dominante, miroir, aimantation, durée d'engagement, mode relatif, diagnostic ; bouton « Restaurer ».
   Apprendre : neuf mini-exercices de ≈ 15 s (engager, pointer, cliquer, glisser une fenêtre, l'agrandir, tourner un objet 3D, balayer, ranger, pause) dans une scène d'entraînement.
   Les exercices utilisent les VRAIS gestes (mêmes événements que sur le reste de Rayle), donnent un retour « bien ! / réessaie » et gardent leurs statistiques sur l'appareil (rayle_gestes_appr). */
const GestesV5UI = (() => {
  const G = () => window.Gestes, esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CLE_STATS = 'rayle_gestes_appr';
  const lireStats = () => { try { return JSON.parse(localStorage.getItem(CLE_STATS) || '{}') || {}; } catch (e) { return {}; } };
  const ecrireStats = o => { try { localStorage.setItem(CLE_STATS, JSON.stringify(o)); } catch (e) { /* stockage refusé : statistiques perdues à la fermeture */ } };

  // ── réglages ──
  const CURSEURS = [
    ['zone', 'Zone active de la main', 40, 100, 1, '%', p => Math.round(p.zoneL * 100), v => ({ zoneL: v / 100, zoneH: v / 100 })],
    ['lissage', 'Lissage du curseur', 0, 100, 1, '%', p => Math.round(p.lissage * 100), v => ({ lissage: v / 100 })],
    ['clic', 'Sensibilité du clic', 60, 160, 5, '%', p => Math.round(p.sensibiliteClic * 100), v => ({ sensibiliteClic: v / 100 })],
    ['taille', 'Taille du pointeur', 40, 140, 2, ' px', p => p.taillePointeur, v => ({ taillePointeur: v })],
    ['aimant', 'Aimantation sur les boutons', 0, 100, 5, '%', p => Math.round(p.aimantation * 100), v => ({ aimantation: v / 100 })],
    ['engage', 'Durée d’engagement (main ouverte)', 300, 1500, 50, ' ms', p => p.engagementMs, v => ({ engagementMs: v })]
  ];
  function installer(sect) {
    if (!sect || document.getElementById('gv5-reglages')) return;
    const p = G().reglages(), d = document.createElement('details'); d.id = 'gv5-reglages';
    d.innerHTML = '<summary>Réglages de la souris dans l’air (V5)</summary>' +
      CURSEURS.map(([id, nom, mn, mx, pas, u, lire]) => '<label class="gv5-l">' + nom + '<output id="gv5-o-' + id + '">' + lire(p) + u + '</output><input type="range" id="gv5-r-' + id + '" min="' + mn + '" max="' + mx + '" step="' + pas + '" value="' + lire(p) + '"></label>').join('') +
      '<label class="gv5-l">Main qui commande le curseur<select id="gv5-main"><option value="1">Droite</option><option value="0">Gauche</option></select></label>' +
      '<label class="chk"><input type="checkbox" id="gv5-exiger"> Engager avec la main ouverte avant d’agir (anti-gestes accidentels)</label>' +
      '<label class="chk"><input type="checkbox" id="gv5-recul"> Main ouverte qui recule = retour à l’accueil</label>' +
      '<label class="chk"><input type="checkbox" id="gv5-relatif"> Mode relatif (comme une souris : on peut reposer la main)</label>' +
      '<label class="chk"><input type="checkbox" id="gv5-diag-case"> Superposition de diagnostic (squelette, distance de pincement, débit, délai)</label>' +
      '<label class="gv5-l">Moteur de gestes<select id="gv5-moteur"><option value="v5">V5 : souris dans l’air (recommandé)</option><option value="v2">V2 : ancien moteur, curseur relatif</option></select></label>' +
      '<div class="row"><button type="button" class="ghost" id="gv5-apprendre">Apprendre les gestes</button><button type="button" class="ghost" id="gv5-calib10">Calibrage rapide (10 s)</button><button type="button" class="ghost" id="gv5-restaurer">Restaurer les réglages</button></div>' +
      '<div class="hint">Zone active : 70 % du cadre de la caméra couvrent tout l’écran. Pince plus facile = sensibilité plus haute. Le moteur V2 reste disponible si besoin.</div>';
    sect.appendChild(d);
    const maj = () => {
      const q = G().reglages(); for (const [id, , , , , u, lire] of CURSEURS) { const r = document.getElementById('gv5-r-' + id), o = document.getElementById('gv5-o-' + id); if (r && document.activeElement !== r) r.value = lire(q); if (o) o.textContent = lire(q) + u; }
      document.getElementById('gv5-main').value = q.droitier ? '1' : '0'; document.getElementById('gv5-exiger').checked = !!q.exigerEngagement; document.getElementById('gv5-relatif').checked = !!q.modeRelatif; document.getElementById('gv5-recul').checked = q.reculActif !== false; document.getElementById('gv5-diag-case').checked = !!q.diagnostic; document.getElementById('gv5-moteur').value = q.moteur === 'v2' ? 'v2' : 'v5';
    };
    for (const [id, , , , , , , versPrefs] of CURSEURS) document.getElementById('gv5-r-' + id).addEventListener('input', e => { G().regler(versPrefs(+e.target.value)); maj(); });
    document.getElementById('gv5-main').addEventListener('change', e => G().regler({ droitier: e.target.value === '1' }));
    document.getElementById('gv5-exiger').addEventListener('change', e => G().regler({ exigerEngagement: e.target.checked }));
    document.getElementById('gv5-recul').addEventListener('change', e => G().regler({ reculActif: e.target.checked }));
    document.getElementById('gv5-relatif').addEventListener('change', e => G().regler({ modeRelatif: e.target.checked }));
    document.getElementById('gv5-diag-case').addEventListener('change', e => G().regler({ diagnostic: e.target.checked }));
    document.getElementById('gv5-moteur').addEventListener('change', async e => { G().regler({ moteur: e.target.value }); const s = G().etat(); if (s.actif) await G().activer({ source: s.source, memoriser: false }); });
    document.getElementById('gv5-apprendre').addEventListener('click', apprendre); document.getElementById('gv5-calib10').addEventListener('click', calibrageRapide);
    document.getElementById('gv5-restaurer').addEventListener('click', () => { G().reinitialiserReglages(); maj(); });
    maj();
  }

  // ── calibrage rapide (10 s) ──
  function calibrageRapide() {
    const ui = window.GestesUI; if (!ui || !ui.ouvrirModale) return;
    const e = G().etat(), m = ui.ouvrirModale('Calibrage rapide (10 secondes)', '<p class="gm-note">Pendant 10 secondes : d’abord tu balaies l’écran avec l’index (la zone confortable de ta main), puis tu pinces et rouvres la main quelques fois. Rayle règle la zone active et les seuils de pincement d’après TOI, et dit si ta main est à la bonne distance.</p>' +
      '<div id="gv5-cal-consigne" class="gm-consigne">' + (e.actif ? 'Prêt.' : 'Active d’abord les gestes (⚙ → Gestes), puis reviens ici.') + '</div><div id="gv5-cal-res" class="gm-note"></div><div class="gm-actions"><button type="button" id="gv5-cal-go"' + (e.actif ? '' : ' disabled') + '>Démarrer</button></div>');
    document.getElementById('gv5-cal-go').addEventListener('click', async () => {
      const b = document.getElementById('gv5-cal-go'); b.disabled = true;
      try {
        const r = await G().calibrerAuto({ etape: (n, t) => { document.getElementById('gv5-cal-consigne').textContent = 'Étape ' + n + '/2 — ' + t; } });
        document.getElementById('gv5-cal-consigne').textContent = 'Terminé.';
        document.getElementById('gv5-cal-res').innerHTML = (r.zone ? 'Zone active : ' + Math.round(r.zone.l * 100) + ' % × ' + Math.round(r.zone.h * 100) + ' % du cadre. ' : '') + (r.seuils ? 'Pincement : fermé sous ' + r.seuils.seuilFerme + ', ouvert au-dessus de ' + r.seuils.seuilOuvre + '. ' : '') + (r.distance ? 'Distance : ' + esc(r.distance) + '. ' : '') + (r.raisons.length ? '<br><b>Pas réglé :</b> ' + r.raisons.map(esc).join(' ') : '');
      } catch (err) { document.getElementById('gv5-cal-res').textContent = err.message; }
      b.disabled = false;
    });
    return m;
  }

  // ── Apprendre les gestes ──
  let racine = null, courant = null, fermee = true;
  const attente = ms => new Promise(r => setTimeout(r, ms));
  const posCurseur = () => (window.Telecommande ? window.Telecommande.position() : { x: -999, y: -999 });
  function ecouterGeste(type, fn) { return G().surEvenement((t, d) => { if (t === 'geste' && d.type === type) fn(d); }); }
  /* Chaque exercice : installe ses éléments dans `sc` (la scène), appelle `reussi()` quand le geste est fait, renvoie une fonction de nettoyage. */
  const EXERCICES = [
    { id: 'engager', titre: 'Engager', consigne: 'Ouvre la main devant la caméra et tiens-la immobile environ une seconde : l’anneau se remplit, puis les gestes sont engagés.',
      installer: (sc, reussi) => { if (G().etat().engage) reussi(); const off = ecouterGeste('engage', reussi), off2 = ecouterGeste('reprise', reussi); return () => { off(); off2(); }; } },
    { id: 'pointer', titre: 'Pointer', consigne: 'Index tendu, les autres doigts repliés : touche les quatre cibles avec le curseur.',
      installer: (sc, reussi) => {
        const pos = [[0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]], el = pos.map(([x, y], i) => { const c = document.createElement('div'); c.className = 'gv5-cible'; c.style.left = x * 100 + '%'; c.style.top = y * 100 + '%'; c.textContent = i + 1; sc.appendChild(c); return c; });
        const iv = setInterval(() => { const p = posCurseur(); let tout = true; for (const c of el) { const r = c.getBoundingClientRect(); if (Math.hypot(p.x - (r.left + r.width / 2), p.y - (r.top + r.height / 2)) < 50) c.dataset.ok = '1'; if (c.dataset.ok !== '1') tout = false; } if (tout) reussi(); }, 60);
        return () => clearInterval(iv); } },
    { id: 'cliquer', titre: 'Pincer pour cliquer', consigne: 'Place le curseur sur le grand bouton, puis pince vite le pouce et l’index, et rouvre : trois fois.',
      installer: (sc, reussi) => { const b = document.createElement('button'); b.className = 'gv5-grosbouton'; let n = 0; b.textContent = 'Clique-moi (0 / 3)'; b.addEventListener('click', () => { n++; b.textContent = 'Clique-moi (' + Math.min(n, 3) + ' / 3)'; if (n >= 3) reussi(); }); sc.appendChild(b); return () => b.remove(); } },
    { id: 'glisser', titre: 'Glisser une fenêtre', consigne: 'Pointe la barre de titre, pince et GARDE pincé, déplace la main, puis relâche.',
      installer: (sc, reussi) => {
        const f = document.createElement('div'); f.className = 'gv5-demo-fen'; f.style.left = '60px'; f.style.top = '50px'; f.innerHTML = '<div class="gv5-t">Fenêtre d’essai</div><div class="gv5-corps">Déplace-moi.</div>'; sc.appendChild(f);
        const t = f.querySelector('.gv5-t'); let o = null, x0 = 60, y0 = 50, fm, fu;
        t.addEventListener('pointerdown', e => { o = { dx: e.clientX - f.offsetLeft - sc.getBoundingClientRect().left, dy: e.clientY - f.offsetTop - sc.getBoundingClientRect().top }; });
        window.addEventListener('pointermove', fm = e => { if (!o) return; const r = sc.getBoundingClientRect(); f.style.left = Math.max(0, Math.min(r.width - 120, e.clientX - r.left - o.dx)) + 'px'; f.style.top = Math.max(0, Math.min(r.height - 60, e.clientY - r.top - o.dy)) + 'px'; if (Math.hypot(f.offsetLeft - x0, f.offsetTop - y0) > 180) reussi(); });
        window.addEventListener('pointerup', fu = () => { o = null; });
        return () => { window.removeEventListener('pointermove', fm); window.removeEventListener('pointerup', fu); f.remove(); }; } },
    { id: 'agrandir', titre: 'Agrandir une fenêtre', consigne: 'Pince le coin en bas à droite (le triangle), tire pour agrandir. (Avec deux mains, pince la fenêtre des deux côtés et écarte.)',
      installer: (sc, reussi) => {
        const f = document.createElement('div'); f.className = 'gv5-demo-fen'; f.style.left = '60px'; f.style.top = '40px'; f.innerHTML = '<div class="gv5-t">Agrandis-moi</div><div class="gv5-corps">Tire le coin.</div><div class="gv5-demo-poignee"></div>'; sc.appendChild(f);
        const h = f.querySelector('.gv5-demo-poignee'); let o = null, fm, fu; const l0 = 300;
        h.addEventListener('pointerdown', e => { const r = f.getBoundingClientRect(); o = { dx: r.right - e.clientX, dy: r.bottom - e.clientY }; });
        window.addEventListener('pointermove', fm = e => { if (!o) return; const r = f.getBoundingClientRect(); f.style.width = Math.max(180, e.clientX + o.dx - r.left) + 'px'; f.style.height = Math.max(120, e.clientY + o.dy - r.top) + 'px'; if (f.offsetWidth > l0 + 90) reussi(); });
        window.addEventListener('pointerup', fu = () => { o = null; });
        return () => { window.removeEventListener('pointermove', fm); window.removeEventListener('pointerup', fu); f.remove(); }; } },
    { id: 'tourner', titre: 'Tourner un objet 3D', consigne: 'Pointe le cube, pince et garde pincé, bouge la main : le cube tourne. Relâche en mouvement : il continue un instant (inertie).',
      installer: (sc, reussi) => {
        const cv = document.createElement('canvas'); cv.className = 'gv5-demo-cv'; cv.width = 320; cv.height = 240; sc.appendChild(cv); const c = cv.getContext('2d');
        let ay = 0.6, ax = 0.4, o = null, total = 0, fm, fu;
        const S = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], A = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        const dessin = () => { c.clearRect(0, 0, 320, 240); c.strokeStyle = '#8fd0e3'; c.lineWidth = 2; const P = S.map(([x, y, z]) => { const x1 = x * Math.cos(ay) + z * Math.sin(ay), z1 = -x * Math.sin(ay) + z * Math.cos(ay), y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax); const k = 90 / (3.2 - z2 * 0.5); return [160 + x1 * k, 120 + y1 * k]; }); c.beginPath(); for (const [a, b] of A) { c.moveTo(P[a][0], P[a][1]); c.lineTo(P[b][0], P[b][1]); } c.stroke(); };
        dessin(); cv.addEventListener('pointerdown', e => { o = { x: e.clientX, y: e.clientY }; });
        window.addEventListener('pointermove', fm = e => { if (!o) return; const dx = e.clientX - o.x, dy = e.clientY - o.y; o = { x: e.clientX, y: e.clientY }; ay += dx * 0.012; ax += dy * 0.012; total += Math.hypot(dx, dy) * 0.012; dessin(); if (total > 2.2) reussi(); });
        window.addEventListener('pointerup', fu = () => { o = null; });
        return () => { window.removeEventListener('pointermove', fm); window.removeEventListener('pointerup', fu); cv.remove(); }; } },
    { id: 'balayer', titre: 'Balayer', consigne: 'Main ouverte, balaie vite de gauche à droite (ou l’inverse) : c’est ce qui fait défiler les piles de fenêtres.',
      installer: (sc, reussi) => { const z = document.createElement('div'); z.className = 'gv5-zone-balayage'; z.textContent = '← balaie la main ouverte →'; sc.appendChild(z); const off = ecouterGeste('balayage', reussi); return () => { off(); z.remove(); }; } },
    { id: 'ranger', titre: 'Ranger', consigne: 'Main ouverte, descends-la vite, comme pour pousser une fenêtre vers le bas : elle se range dans la pile.',
      installer: (sc, reussi) => { const z = document.createElement('div'); z.className = 'gv5-zone-balayage'; z.textContent = '↓ pousse la main ouverte vers le bas ↓'; sc.appendChild(z); const off = ecouterGeste('ranger_bas', reussi); return () => { off(); z.remove(); }; } },
    { id: 'pause', titre: 'Pause', consigne: 'Ferme le poing et tiens-le une seconde : les gestes se mettent en pause (anneau barré). Puis ouvre la main une seconde pour reprendre.',
      installer: (sc, reussi) => { let enPause = false; const o1 = ecouterGeste('pause', () => { enPause = true; sc.dataset.pause = '1'; }), o2 = ecouterGeste('reprise', () => { if (enPause) reussi(); }); return () => { o1(); o2(); delete sc.dataset.pause; }; } }
  ];

  function attendreExercice(ex, sc, aide) {
    return new Promise(resolve => {
      let fini = false, nettoyer = null, rappel = null; const t0 = performance.now();
      const fin = r => { if (fini) return; fini = true; clearTimeout(rappel); if (nettoyer) nettoyer(); resolve({ resultat: r, ms: Math.round(performance.now() - t0) }); };
      courant = { saute: () => fin('saute'), ex };
      nettoyer = ex.installer(sc, () => fin('ok')); if (fini && nettoyer) nettoyer();   // l'exercice peut être réussi dès l'installation (déjà engagé)
      if (!fini) rappel = setTimeout(() => { aide('Pas encore ? Respire, refais le geste plus lentement. Tu peux aussi passer cet exercice.', false); }, 15000);
    });
  }
  async function apprendre() {
    if (!fermee) return; fermee = false;
    const stats = lireStats(); racine = document.createElement('section'); racine.id = 'gv5-appr'; racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-label', 'Apprendre les gestes');
    racine.innerHTML = '<header><b>APPRENDRE LES GESTES</b><button type="button" data-a="passer">Passer cet exercice</button><button type="button" data-a="fermer">Fermer</button></header><div class="gv5-pas"></div><div class="gv5-consigne"></div><div class="gv5-retour"></div><div class="gv5-scene"></div><div class="gv5-pied"><span></span></div>';
    document.body.appendChild(racine);
    const pas = racine.querySelector('.gv5-pas'), consigne = racine.querySelector('.gv5-consigne'), retour = racine.querySelector('.gv5-retour'), scene = racine.querySelector('.gv5-scene'), pied = racine.querySelector('.gv5-pied span');
    pas.innerHTML = EXERCICES.map(e => '<i data-id="' + e.id + '">' + esc(e.titre) + '</i>').join('');
    racine.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'fermer') fermer(); else if (b.dataset.a === 'passer' && courant) courant.saute(); });
    const aide = (t, ok) => { retour.textContent = t; retour.classList.toggle('ok', !!ok); };
    if (!G().etat().actif) {
      consigne.textContent = 'Les gestes sont éteints. Active-les pour t’entraîner (webcam du PC ou caméra du téléphone).'; const b = document.createElement('button'); b.textContent = 'Activer les gestes'; b.style.margin = '10px 16px'; b.addEventListener('click', async () => { b.disabled = true; const ok = await G().activerAuto(); if (!ok) aide(G().etat().erreur || 'Impossible d’activer les gestes.', false); else { b.remove(); lancer(); } }); scene.appendChild(b);
    } else lancer();
    async function lancer() {
      let reussis = 0;
      for (const ex of EXERCICES) {
        if (fermee) return; const li = pas.querySelector('[data-id="' + ex.id + '"]'); li.dataset.s = 'en-cours'; consigne.textContent = ex.titre + ' — ' + ex.consigne; aide('', false); scene.textContent = '';
        const r = await attendreExercice(ex, scene, aide); if (fermee) return;
        const s = stats[ex.id] = stats[ex.id] || { essais: 0, reussis: 0, meilleurMs: null }; s.essais++;
        if (r.resultat === 'ok') { s.reussis++; reussis++; s.meilleurMs = s.meilleurMs == null ? r.ms : Math.min(s.meilleurMs, r.ms); li.dataset.s = 'ok'; aide('Bien ! (' + (r.ms / 1000).toFixed(1) + ' s)', true); } else { li.dataset.s = 'saute'; aide('Exercice passé. Tu pourras le refaire plus tard.', false); }
        ecrireStats(stats); pied.textContent = 'Réussis : ' + reussis + ' / ' + EXERCICES.length; await attente(r.resultat === 'ok' ? 1100 : 500);
      }
      scene.textContent = ''; consigne.textContent = 'Terminé : ' + reussis + ' exercice' + (reussis > 1 ? 's' : '') + ' réussi' + (reussis > 1 ? 's' : '') + ' sur ' + EXERCICES.length + '.';
      aide(reussis === EXERCICES.length ? 'Tout est bon. Si un geste se déclenche mal ensuite, lance le calibrage rapide (⚙ → Gestes).' : 'Tu peux relancer « Apprendre les gestes » pour les exercices passés.', reussis === EXERCICES.length);
      scene.innerHTML = '<div style="padding:20px">' + EXERCICES.map(e => { const s = stats[e.id]; return '<div>' + esc(e.titre) + ' : ' + (s ? s.reussis + ' réussi(s) sur ' + s.essais + ' essai(s)' + (s.meilleurMs != null ? ', meilleur temps ' + (s.meilleurMs / 1000).toFixed(1) + ' s' : '') : 'pas encore fait') + '</div>'; }).join('') + '</div>';
    }
  }
  function fermer() { fermee = true; if (courant) { try { courant.saute(); } catch (e) { /* déjà terminé */ } courant = null; } if (racine) { racine.remove(); racine = null; } }
  const statistiques = () => lireStats();

  return { installer, apprendre, fermer, calibrageRapide, statistiques, EXERCICES: EXERCICES.map(e => ({ id: e.id, titre: e.titre })), ouverte: () => !fermee };
})();
window.GestesV5UI = GestesV5UI;
