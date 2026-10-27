"use strict";
/* ═════════════ RÉALITÉ VIRTUELLE : drapeau, réglages ⚙, bouton « Entrer en VR », voix ═════════════
   Petit script classique : le gros module (vr-session.js, Three.js + WebXR) n'est chargé qu'à la demande. Tant que le drapeau n'est pas coché (ou sans ?vr=1), rien n'apparaît et rien ne se charge. */
const RayleVRUI = (() => {
  const CLE = 'rayle_vr', cfg = document.getElementById('cfg');
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { return {}; } };
  const ecrire = o => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage refusé */ } };
  const drapeau = () => !!lire().actif || /[?&]vr=1\b/.test(location.search);
  const $ = id => document.getElementById(id);
  let module = null, dispo = null, bouton = null;
  const charger = async () => { if (!module) { module = await import(new URL('core/vr/vr-session.js', document.baseURI).href); } return window.RayleVR; };
  const regler = async patch => { const o = Object.assign(lire(), patch); ecrire(o); if (window.RayleVR) window.RayleVR.regler(patch); };

  async function verifier() {
    if (!drapeau()) { dispo = { drapeau: false, raison: 'Désactivée.' }; return majUI(); }
    try { const VR = await charger(); dispo = await VR.disponible(); } catch (e) { dispo = { drapeau: true, xr: false, vr: false, raison: 'Module VR indisponible : ' + (e && e.message || e) }; }
    majUI();
  }
  function majUI() {
    const ok = !!(dispo && dispo.drapeau && dispo.xr && dispo.vr);
    if ($('vr-etat')) { $('vr-etat').textContent = !drapeau() ? 'Réalité virtuelle désactivée.' : ok ? 'WebXR disponible : un casque est détecté.' : (dispo ? dispo.raison : 'Vérification…'); }
    if ($('vr-entrer')) $('vr-entrer').disabled = !ok;
    if (!bouton) { bouton = document.createElement('button'); bouton.id = 'vr-bouton-flottant'; bouton.type = 'button'; bouton.textContent = 'Entrer en VR'; bouton.hidden = true; bouton.style.cssText = 'position:fixed;right:14px;bottom:52px;z-index:2147481000;padding:8px 14px;font:13px/1.2 ui-monospace,Consolas,monospace;color:#8fd0e3;background:rgba(4,9,15,.85);border:1px solid rgba(143,208,227,.6);cursor:pointer'; bouton.addEventListener('click', entrer); document.body.appendChild(bouton); }
    bouton.hidden = !ok || !!(window.RayleVR && window.RayleVR.etat().entre);
  }
  async function entrer() { try { const VR = await charger(); await VR.entrer(); } catch (e) { if ($('vr-etat')) $('vr-etat').textContent = 'Impossible d’entrer en VR : ' + (e && e.message || e); } majUI(); }

  function section() {
    const h3 = cfg && [...cfg.querySelectorAll('h3')].find(h => /^Tests/i.test(h.textContent.trim())); if (!h3 || $('vr-section')) return;
    const s = document.createElement('div'); s.id = 'vr-section'; const o = lire();
    s.innerHTML = '<h3>Réalité virtuelle (expérimental)</h3><div class="hint" id="vr-etat" role="status"></div>' +
      '<label class="chk"><input type="checkbox" id="vr-drapeau"> Activer la réalité virtuelle (WebXR : Quest 2 par son navigateur ou par Link / Air Link, casques Windows Mixed Reality / OpenXR). <b>Jamais testée dans un casque</b> : à valider.</label>' +
      '<div class="row"><button type="button" class="ghost" id="vr-entrer" disabled>Entrer en VR</button><button type="button" class="ghost" id="vr-recentrer">Replacer les fenêtres</button><button type="button" class="ghost" id="vr-mode">Salle ↔ galaxie</button></div>' +
      '<label class="chk"><input type="checkbox" id="vr-vignette"> Vignette de confort (assombrit les bords quand tu bouges)</label>' +
      '<label for="vr-cran">Rotation par crans</label><select id="vr-cran"><option value="22.5">22,5°</option><option value="30">30°</option><option value="45">45°</option></select>' +
      '<label for="vr-depl">Déplacement</label><select id="vr-depl"><option value="fluide">Fluide (stick gauche) + téléportation (A)</option><option value="teleport">Téléportation seulement (A)</option></select>' +
      '<div class="hint">Manettes : gâchette = clic / déplacer (barre du haut) / redimensionner (coin bas-droit) ; grip = saisir ; stick droit = tourner ou défiler ; B = replacer les fenêtres ; X = salle ↔ galaxie. Voix : « Raylé, entre en VR » (affiche un bouton à toucher : le navigateur l’exige). Détails : docs/VR.md.</div>';
    h3.parentNode.insertBefore(s, h3);
    $('vr-drapeau').checked = !!o.actif; $('vr-vignette').checked = o.vignette !== false; $('vr-cran').value = String(o.cran || 30); $('vr-depl').value = o.deplacement || 'fluide';
    $('vr-drapeau').addEventListener('change', async e => { await regler({ actif: e.target.checked }); verifier(); });
    $('vr-vignette').addEventListener('change', e => regler({ vignette: e.target.checked })); $('vr-cran').addEventListener('change', e => regler({ cran: +e.target.value })); $('vr-depl').addEventListener('change', e => regler({ deplacement: e.target.value }));
    $('vr-entrer').addEventListener('click', entrer); $('vr-recentrer').addEventListener('click', async () => { if (window.RayleVR) window.RayleVR.recentrer(); });
    $('vr-mode').addEventListener('click', async () => { if (window.RayleVR) window.RayleVR.basculerMode(); });
  }

  /* Voix : « active / désactive la réalité virtuelle », « entre en VR », « sors de la VR », « recentre la VR », « mode galaxie en VR ». Rend le texte à dire, ou null. */
  async function traiterVoix(texte) {
    const n = String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ');
    if (!/\b(?:vr|realite virtuelle)\b/.test(n)) return null;
    if (/\b(?:desactive|coupe|eteins|supprime)\b/.test(n)) { await regler({ actif: false }); if ($('vr-drapeau')) $('vr-drapeau').checked = false; await verifier(); return 'Réalité virtuelle désactivée.'; }
    if (/\b(?:sors|sortir|quitte|arrete|enleve)\b/.test(n)) { if (window.RayleVR && window.RayleVR.etat().entre) { await window.RayleVR.sortir(); return 'Je te ramène à l’écran.'; } return 'Tu n’es pas en VR.'; }
    if (/\b(?:recentre|replace|rassemble|range)\b/.test(n)) { if (window.RayleVR && window.RayleVR.etat().entre) { window.RayleVR.recentrer(); return 'Fenêtres replacées autour de toi.'; } return 'Tu n’es pas en VR.'; }
    if (/\bgalaxie\b/.test(n)) { if (window.RayleVR && window.RayleVR.etat().entre) { const m = window.RayleVR.basculerMode('galaxie'); return m === 'galaxie' ? 'Mode galaxie : gâchette droite pour avancer, gauche pour freiner.' : (window.RayleVR.etat().message || 'La galaxie n’est pas prête.'); } return 'Entre d’abord en VR.'; }
    if (/\bsalle\b/.test(n)) { if (window.RayleVR && window.RayleVR.etat().entre) { window.RayleVR.basculerMode('salle'); return 'Retour dans la salle.'; } return 'Entre d’abord en VR.'; }
    if (/\b(?:active|allume|autorise)\b/.test(n) && !/\b(?:entre|lance|demarre)\b/.test(n)) { await regler({ actif: true }); if ($('vr-drapeau')) $('vr-drapeau').checked = true; await verifier(); return dispo && dispo.vr ? 'Réalité virtuelle activée : un casque est détecté. Dis « entre en VR ».' : 'Réalité virtuelle activée, mais ' + String(dispo && dispo.raison || 'aucun casque n’est détecté').replace(/\.$/, '') + '.'; }
    if (/\b(?:entre|entrer|lance|demarre|mets|passe)\b/.test(n)) { if (!drapeau()) return 'La réalité virtuelle est désactivée : dis « active la réalité virtuelle » ou coche-la dans les réglages.'; const VR = await charger(), r = await VR.demander(); return r.ok ? 'Touche le bouton « Entrer en VR » : le navigateur exige un geste de ta part.' : r.raison; }
    return null;
  }
  section(); if (drapeau()) verifier(); else majUI();
  return { verifier, entrer, traiterVoix, drapeau, regler };
})();
window.RayleVRUI = RayleVRUI;
