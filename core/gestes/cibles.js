"use strict";
/* ═════════════ GESTES V10 : mini-jeu « Cibles » (3 minutes) = test de qualité OBJECTIF des clics ═════════════
   Des cibles rondes de 48, 64, 96 et 120 px apparaissent une par une à des endroits au hasard ; on les « clique » (pincement avec les gestes, ou souris pour une mesure de référence).
   Mesure : taux de réussite par taille, temps moyen jusqu'au clic, précision (distance au centre). Objectif : ≥ 95 % sur les cibles d'au moins 48 px. L'aimantation des gestes joue comme dans
   Rayle (les cibles sont des éléments cliquables), c'est donc la qualité du clic RÉEL qui est notée. Le score est mémorisé sur cet appareil (rayle_fluidite_cibles) pour comparer avant / après
   chaque réglage. Un clic hors cible, ou une cible laissée 6 s, compte comme raté. */
const CiblesJeu = (() => {
  const CLE = 'rayle_fluidite_cibles', TAILLES = [48, 64, 96, 120];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '[]') || []; } catch (e) { return []; } };
  const ecrire = l => { try { localStorage.setItem(CLE, JSON.stringify(l.slice(-10))); } catch (e) { /* stockage refusé */ } };
  let jeu = null;

  function lancer({ secondes = 180, essaisMax = 80, delaiMax = 6000, alea = Math.random } = {}) {
    return new Promise(resolve => {
      if (jeu) return resolve(null);
      const FC = window.FluiditeCalcul, g = window.Gestes, avecGestes = !!(g && g.etat().actif);
      const ov = document.createElement('div'); ov.id = 'cibles-jeu'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Jeu Cibles');
      ov.innerHTML = '<div class="cj-haut"><b>Cibles</b> <span data-k="info"></span><progress max="100" value="0"></progress><button type="button" data-k="stop">Arrêter</button></div><div class="cj-aire"></div>' +
        '<div class="cj-accueil"><h2>Jeu « Cibles » · ' + Math.round(secondes / 60) + ' minutes</h2><p>Clique chaque cible aussi vite et aussi juste que possible : ' + (avecGestes ? 'pince le pouce et l’index pour cliquer.' : 'à la souris (les gestes ne sont pas actifs : ce sera une mesure de référence).') + '</p><p class="cj-note">Tailles : ' + TAILLES.join(', ') + ' px. Objectif : au moins 95 % de réussite.</p><button type="button" data-k="go" role="button">Commencer</button></div>';
      document.body.appendChild(ov); jeu = { ov };
      const aire = ov.querySelector('.cj-aire'), info = ov.querySelector('[data-k="info"]'), prog = ov.querySelector('progress'), accueil = ov.querySelector('.cj-accueil');
      const essais = []; let cible = null, debut = 0, t0 = 0, fini = false, minuteur = 0, suivant = 0;
      const clic = e => { if (e.target.closest('[data-k="stop"]') || e.target.closest('[data-k="go"]')) return; if (cible) finEssai({ x: e.clientX, y: e.clientY }); };
      const touche = e => { if (e.key === 'Escape') terminer(true); };
      function terminer(annule) {
        if (fini) return; fini = true; clearTimeout(minuteur); clearTimeout(suivant); document.removeEventListener('click', clic, true); document.removeEventListener('keydown', touche, true); if (cible) cible.el.remove(); ov.remove(); jeu = null;
        const score = FC.scoreCibles(essais); const entree = { date: new Date().toISOString(), gestes: avecGestes, ...score };
        if (!annule || essais.length >= 10) { const l = lire(); l.push(entree); ecrire(l); }
        resolve({ essais, score, entree, annule: !!annule });
      }
      function nouvelle() {
        if (fini) return; if ((performance.now() - debut) / 1000 >= secondes || essais.length >= essaisMax) return terminer(false);
        const taille = TAILLES[Math.floor(alea() * TAILLES.length)], r = aire.getBoundingClientRect(), m = taille / 2 + 24;
        const x = m + alea() * Math.max(1, r.width - 2 * m), y = m + alea() * Math.max(1, r.height - 2 * m);
        const el = document.createElement('div'); el.className = 'cj-cible'; el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Cible de ' + taille + ' pixels');
        el.style.cssText = 'width:' + taille + 'px;height:' + taille + 'px;left:' + (r.left + x - taille / 2) + 'px;top:' + (r.top + y - taille / 2) + 'px'; document.body.appendChild(el);
        cible = { el, taille, cx: r.left + x, cy: r.top + y, t0: performance.now() }; el.dataset.t = String(taille);
        minuteur = setTimeout(() => finEssai(null), delaiMax);
        info.textContent = essais.length + ' cibles · ' + Math.round(essais.filter(e => e.reussi).length / Math.max(1, essais.length) * 100) + ' % réussies';
        prog.value = Math.min(100, (performance.now() - debut) / (secondes * 1000) * 100);
      }
      function finEssai(clic) {
        if (!cible || fini) return; clearTimeout(minuteur); const c = cible; cible = null; c.el.remove();
        const d = clic ? Math.hypot(clic.x - c.cx, clic.y - c.cy) : null, reussi = d != null && d <= c.taille / 2;
        essais.push({ taille: c.taille, reussi, ms: Math.round(performance.now() - c.t0), erreur: d == null ? null : Math.round(d * 10) / 10, rate: reussi ? '' : (d == null ? 'trop lent' : 'à côté') });
        suivant = setTimeout(nouvelle, 400);
      }
      document.addEventListener('click', clic, true); document.addEventListener('keydown', touche, true);
      ov.querySelector('[data-k="stop"]').addEventListener('click', () => terminer(true));
      ov.querySelector('[data-k="go"]').addEventListener('click', () => { accueil.remove(); debut = performance.now(); nouvelle(); });
    });
  }
  function afficher(res) {
    const ui = window.GestesUI; if (!ui || !ui.ouvrirModale || !res) return;
    const s = res.score, ligne = ([t, b]) => '<tr><td>' + t + ' px</td><td>' + b.reussis + ' / ' + b.essais + '</td><td>' + Math.round(b.taux * 100) + ' %</td></tr>';
    const hist = lire().slice(0, -1).slice(-3).map(h => '<div>' + new Date(h.date).toLocaleString('fr-FR') + ' : ' + (h.reussite == null ? '—' : Math.round(h.reussite * 100) + ' %') + (h.gestes ? ' (gestes)' : ' (souris)') + '</div>').join('');
    ui.ouvrirModale('Jeu Cibles : résultat', '<div class="gm-etat ' + (s.ok === true ? 'ok' : s.ok === false ? 'ko' : '') + '"><b>' + (s.reussite == null ? 'Aucune cible jouée' : Math.round(s.reussite * 100) + ' % de réussite') + '</b><div>' + (s.ok === true ? 'Objectif atteint : ≥ 95 % sur les cibles d’au moins 48 px.' : s.ok === false ? 'Objectif non atteint (95 % sur les cibles d’au moins 48 px).' : '') + '</div></div>' +
      '<div class="gm-note">' + s.essais + ' cibles · temps moyen ' + (s.tempsMoyen == null ? '—' : s.tempsMoyen + ' ms') + ' · précision moyenne ' + (s.precisionPx == null ? '—' : s.precisionPx + ' px du centre') + ' · ' + (res.entree.gestes ? 'avec les gestes' : 'à la souris (référence)') + '</div>' +
      '<table class="gm-tab"><thead><tr><th>Taille</th><th>Réussies</th><th>Taux</th></tr></thead><tbody>' + Object.entries(s.parTaille).sort((a, b) => a[0] - b[0]).map(ligne).join('') + '</tbody></table>' + (hist ? '<h4 class="gm-h">Parties précédentes</h4><div class="gm-note">' + hist + '</div>' : ''));
  }
  async function jouer(opts) { const r = await lancer(opts); if (r) afficher(r); return r; }
  return { lancer, jouer, afficher, historique: lire, enCours: () => !!jeu };
})();
window.CiblesJeu = CiblesJeu;
