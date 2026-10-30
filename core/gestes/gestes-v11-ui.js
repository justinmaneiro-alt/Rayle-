"use strict";
/* ═════════════ GESTES V11 : aide « Que puis-je faire ? », geste détecté en direct, bouton Pause ═════════════
   · Un petit panneau toujours à l'écran tant que les gestes sont actifs : les 5 gestes du mode simple en pictogrammes animés, un bouton Pause / Reprendre, « Apprendre les gestes (2 min) » et le réglage « Mode avancé ».
   · Une étiquette qui suit le curseur et dit ce que le moteur voit à cet instant (Pointer, Pincer, Glisser, Paume : accueil dans 0,8 s…).
   Textes et logique : gestes-v11-calcul.js (pur, testé). Rien n'est mémorisé sauf l'état ouvert/replié du panneau (rayle_gestes_aide). */
const GestesV11UI = (() => {
  const G = () => window.Gestes, C = () => window.GestesV11, CLE = 'rayle_gestes_aide';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let panneau = null, etiquette = null, evt = null, replie = false, derTexte = '', derActif = null, installe = false;
  try { replie = localStorage.getItem(CLE) === 'ferme'; } catch (e) { /* stockage refusé : le panneau s'ouvre */ }

  /* Pictogrammes animés (SVG + CSS, aucun fichier) : une forme simple par geste. */
  const PIC = {
    pointer: '<svg viewBox="0 0 48 48"><rect class="gv11-doigt" x="21" y="8" width="6" height="26" rx="3"/><rect x="14" y="30" width="20" height="12" rx="5" class="gv11-paume"/><circle class="gv11-pt" cx="24" cy="8" r="3"/></svg>',
    pincer: '<svg viewBox="0 0 48 48"><circle class="gv11-p1" cx="14" cy="24" r="5"/><circle class="gv11-p2" cx="34" cy="24" r="5"/><circle class="gv11-onde" cx="24" cy="24" r="4"/></svg>',
    balayer: '<svg viewBox="0 0 48 48"><g class="gv11-main"><rect x="14" y="18" width="20" height="16" rx="6" class="gv11-paume"/><rect x="15" y="9" width="3.5" height="12" rx="1.7"/><rect x="20" y="7" width="3.5" height="14" rx="1.7"/><rect x="25" y="7" width="3.5" height="14" rx="1.7"/><rect x="30" y="9" width="3.5" height="12" rx="1.7"/></g><path class="gv11-fl" d="M6 42h36M12 38l-6 4 6 4M36 38l6 4-6 4" fill="none"/></svg>',
    deux: '<svg viewBox="0 0 48 48"><circle class="gv11-m1" cx="14" cy="24" r="6"/><circle class="gv11-m2" cx="34" cy="24" r="6"/><path class="gv11-fl" d="M20 24h8M22 21l-3 3 3 3M26 21l3 3-3 3" fill="none"/></svg>',
    paume: '<svg viewBox="0 0 48 48"><circle class="gv11-fond" cx="24" cy="24" r="19"/><circle class="gv11-arc" cx="24" cy="24" r="19" pathLength="100"/><rect x="16" y="20" width="16" height="13" rx="5" class="gv11-paume"/><rect x="17" y="11" width="3" height="11" rx="1.5"/><rect x="21" y="9" width="3" height="13" rx="1.5"/><rect x="25" y="9" width="3" height="13" rx="1.5"/><rect x="29" y="11" width="3" height="11" rx="1.5"/></svg>'
  };
  function creer() {
    if (panneau) return;
    panneau = document.createElement('aside'); panneau.id = 'gv11-aide'; panneau.hidden = true; panneau.setAttribute('aria-label', 'Aide des gestes');
    panneau.innerHTML = '<button type="button" class="gv11-tete" data-a="plier" aria-expanded="true"><span class="gv11-sig">✋</span><b>Que puis-je faire ?</b><i class="gv11-chev" aria-hidden="true"></i></button>' +
      '<div class="gv11-corps"><ol class="gv11-liste">' + C().GESTES_SIMPLES.map(g => '<li><span class="gv11-pic gv11-pic-' + g.pictogramme + '" aria-hidden="true">' + PIC[g.pictogramme] + '</span><span class="gv11-txt"><b>' + esc(g.titre) + '</b><small>' + esc(g.texte) + '</small></span></li>').join('') + '</ol>' +
      '<div class="gv11-boutons"><button type="button" data-a="pause">Pause</button><button type="button" data-a="apprendre">Apprendre (2 min)</button><button type="button" data-a="avance">Mode avancé : non</button></div>' +
      '<p class="gv11-note">Pause : ce bouton, ou dis « pause les gestes ». Aucun geste ne met en pause tout seul.</p></div>';
    document.body.appendChild(panneau);
    etiquette = document.createElement('div'); etiquette.id = 'gv11-etiquette'; etiquette.hidden = true; etiquette.setAttribute('aria-hidden', 'true'); etiquette.innerHTML = '<span class="gv11-t"></span><i class="gv11-bar"></i>'; document.body.appendChild(etiquette);
    panneau.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'plier') { replie = !replie; try { localStorage.setItem(CLE, replie ? 'ferme' : 'ouvert'); } catch (x) { /* stockage refusé */ } maj(); }
      else if (a === 'pause') { const g = G(); g.mettreEnPause(!g.etat().pause); maj(); }
      else if (a === 'apprendre') { if (window.GestesV5UI) window.GestesV5UI.apprendre(); }
      else if (a === 'avance') { G().regler({ gestesAvances: !G().reglages().gestesAvances }); maj(); }
    });
  }
  /* Met à jour le panneau (visible seulement si les gestes sont actifs). */
  function maj() {
    if (!panneau) return; const g = G(), e = g.etat(), actif = !!e.actif;
    panneau.hidden = !actif; if (!actif) { etiquette.hidden = true; return; }
    panneau.classList.toggle('gv11-replie', replie); panneau.querySelector('.gv11-tete').setAttribute('aria-expanded', String(!replie));
    const bp = panneau.querySelector('[data-a="pause"]'); bp.textContent = e.pause ? 'Reprendre' : 'Pause'; bp.classList.toggle('gv11-on', !!e.pause);
    const av = !!g.reglages().gestesAvances; panneau.querySelector('[data-a="avance"]').textContent = 'Mode avancé : ' + (av ? 'oui' : 'non'); panneau.classList.toggle('gv11-avance', av);
  }
  /* Appelé à CHAQUE image par le moteur (GestesV5Actions.surEtat) : l'étiquette suit le curseur. */
  function surEtat(etat) {
    if (!etiquette || !etat) return;
    const r = C().geste(etat, evt ? { ...evt, age: performance.now() - evt.t } : null);
    const montre = !!r.texte && !!etat.curseur && (etat.mains > 0 || etat.mode === 'pause');
    if (etiquette.hidden === montre) etiquette.hidden = !montre;
    if (!montre) return;
    const t = etiquette.firstChild; if (r.texte !== derTexte) { derTexte = r.texte; t.textContent = r.texte; } if (etiquette.dataset.ton !== r.ton) etiquette.dataset.ton = r.ton;
    const x = Math.min(innerWidth - 12 - etiquette.offsetWidth, etat.curseur.x + 30), y = Math.min(innerHeight - 40, etat.curseur.y + 34);
    etiquette.style.transform = 'translate(' + Math.round(Math.max(8, x)) + 'px,' + Math.round(Math.max(8, y)) + 'px)';
    etiquette.lastChild.style.transform = 'scaleX(' + (r.progres == null ? 0 : Math.max(0, Math.min(1, r.progres))) + ')';
  }
  function installer() {
    if (installe || !G() || !C()) return; installe = true; creer();
    G().surEvenement((type, d) => {
      if (type === 'geste') { evt = { type: d.type, n: d.n, sens: d.sens, t: performance.now() }; return; }
      const a = !!G().etat().actif; if (a !== derActif) { derActif = a; if (a && !localStorageAvu()) { /* première activation : le panneau s'ouvre */ } maj(); } else maj();
    });
    if (window.GestesV5Actions && window.GestesV5Actions.surEtat) window.GestesV5Actions.surEtat(surEtat);
    maj();
  }
  const localStorageAvu = () => { try { return localStorage.getItem(CLE) != null; } catch (e) { return true; } };
  return { installer, maj, surEtat, ouvert: () => !!panneau && !panneau.hidden };
})();
window.GestesV11UI = GestesV11UI;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => GestesV11UI.installer()); else GestesV11UI.installer();
