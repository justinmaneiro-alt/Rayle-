/* ═════════════ CLAVIER EN RÉALITÉ VIRTUELLE (V3, phase 5) : un panneau 3D qui tape dans les champs de la page ═════════════
   Dans le casque on ne peut pas taper au clavier : quand un champ de texte reçoit le focus (viser + gâchette sur un champ, comme un clic), ce clavier AZERTY apparaît comme un panneau de plus (rastérisé comme les
   autres fenêtres, donc visé au rayon). Chaque touche modifie le VRAI champ (valeur, curseur, événements « input »), comme le ferait un clavier. Calculs purs : vr-clavier-calcul.js (testés).
   Tant qu'on n'est pas en VR, rien n'apparaît (le clavier du PC ou de la tablette fait le travail). JAMAIS TESTÉ DANS UN CASQUE : vérifié avec un casque émulé (IWER) et par calcul pur. */
const K = window.VRClavierCalcul;
const ID = 'vr-clavier';
const CSS = `#${ID}{position:fixed;left:-9999px;top:0;width:980px;padding:14px 16px 16px;background:#0b121b;border:2px solid #8fd0e3;box-sizing:border-box;color:#e6eef2;font:26px/1 system-ui,sans-serif;user-select:none}
#${ID}[hidden]{display:none}
#${ID} .vk-haut{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#8fd0e3;font-size:20px;letter-spacing:.08em}
#${ID} .vk-champ{flex:1;margin:0 14px;color:#c9b27a;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:right;font-size:20px}
#${ID} .vk-rang{display:flex;gap:8px;margin-top:8px}
#${ID} button{flex:1 1 0;min-width:0;height:62px;padding:0;color:#fff;background:#12202c;border:1px solid rgba(143,208,227,.5);font:inherit;cursor:pointer}
#${ID} button.vk-act{background:#1b2d3c;color:#8fd0e3}
#${ID} button.vk-on{background:#8fd0e3;color:#05080f}
#${ID} button.vk-verrou{background:#c9b27a;color:#05080f}`;

export const clavierVR = (() => {
  const E = { monte: false, visible: false, mode: 'lettres', maj: false, verrou: false, cible: null, nbFrappes: 0 };
  let el = null, etat = K ? K.etatInitial() : null, cible = null, ecouteurs = [], styleEl = null;
  const enChamp = n => !!(n && n.nodeType === 1 && !n.closest('#' + ID) && K.estChampTexte(n.tagName, n.type, n.isContentEditable) && !n.readOnly && !n.disabled);
  const multiligne = n => n && (n.tagName === 'TEXTAREA' || n.isContentEditable);
  function lireChamp() {
    if (!cible) return { valeur: '', debut: 0, fin: 0 };
    if (cible.isContentEditable) { const t = cible.textContent || ''; return { valeur: t, debut: t.length, fin: t.length }; }
    const v = String(cible.value == null ? '' : cible.value);
    if (K.sansSelection(cible.type)) return { valeur: v, debut: v.length, fin: v.length };
    let d = v.length, f = v.length; try { d = cible.selectionStart == null ? v.length : cible.selectionStart; f = cible.selectionEnd == null ? d : cible.selectionEnd; } catch (e) { /* sélection inaccessible */ }
    return { valeur: v, debut: d, fin: f };
  }
  function ecrireChamp(nouveau, avant, op) {
    if (!cible) return;
    if (cible.isContentEditable) {   // édition riche : on passe par execCommand (annulable, déclenche les bons événements)
      cible.focus({ preventScroll: true });
      if (op.efface) document.execCommand('delete'); else if (op.insere) document.execCommand('insertText', false, op.insere);
      return;
    }
    if (nouveau.valeur !== avant.valeur) {
      const proto = cible.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, set = Object.getOwnPropertyDescriptor(proto, 'value');
      if (set && set.set) set.set.call(cible, nouveau.valeur); else cible.value = nouveau.valeur;   // même chemin que la frappe réelle (les bibliothèques de formulaires le voient)
      cible.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: op.efface ? 'deleteContentBackward' : 'insertText', data: op.insere || null }));
    }
    if (!K.sansSelection(cible.type)) { try { cible.setSelectionRange(nouveau.debut, nouveau.fin); } catch (e) { /* type sans sélection */ } }
  }
  function envoyerEntree() {
    if (!cible) return;
    const base = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const a = cible.dispatchEvent(new KeyboardEvent('keydown', base)); cible.dispatchEvent(new KeyboardEvent('keypress', base));
    if (a && cible.form && cible.tagName === 'INPUT') { try { if (typeof cible.form.requestSubmit === 'function') cible.form.requestSubmit(); else cible.form.submit(); } catch (e) { /* formulaire invalide : le navigateur l'affiche */ } }
    cible.dispatchEvent(new KeyboardEvent('keyup', base));
  }
  function appuyer(touche, t = performance.now()) {
    if (typeof touche === 'string') touche = K.toucheParId(touche); if (!touche) return null;
    if (!cible || !cible.isConnected) { cible = null; if (touche.id === 'fermer') masquer(); return null; }
    const avant = lireChamp(), r = K.appuyer(avant, etat, touche, { multiligne: multiligne(cible), maxLength: cible.maxLength > 0 ? cible.maxLength : 0, t });
    etat = r.etat; ecrireChamp(r.champ, avant, r);
    if (r.evenement === 'entree') envoyerEntree(); else if (r.evenement === 'fermer') { masquer(); return r; }
    try { cible.focus({ preventScroll: true }); } catch (e) { /* champ retiré */ }
    E.nbFrappes++; dessiner(); majEtat(); return r;
  }
  function dessiner() {
    if (!el) return;
    const dispo = K.DISPOSITIONS[etat.mode];
    el.querySelector('.vk-champ').textContent = cible ? (cible.getAttribute('aria-label') || cible.placeholder || cible.name || cible.id || 'champ de texte') : '';
    el.querySelector('.vk-corps').innerHTML = dispo.map(rangee => '<div class="vk-rang">' + rangee.map(k => {
      const lib = k.type === 'car' ? K.caractere(k, etat.maj) : k.etiquette, cl = k.type === 'action' ? 'vk-act' + (k.id === 'maj' && etat.maj ? (etat.verrou ? ' vk-verrou' : ' vk-on') : '') : '';
      return '<button type="button" class="' + cl + '" data-k="' + k.id.replace(/"/g, '&quot;') + '" style="flex-grow:' + (k.largeur || 1) + '" aria-label="' + (lib === ' ' ? 'espace' : lib.replace(/"/g, '&quot;')) + '">' + (lib.replace(/&/g, '&amp;').replace(/</g, '&lt;')) + '</button>';
    }).join('') + '</div>').join('');
  }
  const majEtat = () => { E.mode = etat.mode; E.maj = etat.maj; E.verrou = etat.verrou; E.cible = cible ? (cible.id || cible.name || cible.tagName) : null; ecouteurs.forEach(f => { try { f({ ...E }); } catch (e) { /* écouteur fautif */ } }); };
  function afficher(champ) {
    if (!el) return; cible = champ; etat = K.etatInitial(); el.hidden = false; E.visible = true; dessiner(); majEtat();
  }
  function masquer() { if (!el) return; el.hidden = true; E.visible = false; cible = null; if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#' + ID)) document.activeElement.blur(); majEtat(); }

  // le clavier suit le focus : un champ de texte reçoit le focus → il apparaît ; le focus passe sur autre chose (hors clavier) → il disparaît
  const surFocus = e => { if (!E.monte) return; if (e.target && e.target.closest && e.target.closest('#' + ID)) return; if (enChamp(e.target) && (!E.visible || cible !== e.target)) afficher(e.target); };   // le même champ qui reprend le focus après une touche ne remet pas le clavier à zéro
  const surPerdu = e => { if (!E.monte || !cible) return; const vers = e.relatedTarget; if (vers && vers.closest && vers.closest('#' + ID)) return; setTimeout(() => { if (!E.monte) return; const a = document.activeElement; if (a && a.closest && a.closest('#' + ID)) return; if (a !== cible && !enChamp(a)) masquer(); }, 250); };
  const surClic = e => { const b = e.target.closest && e.target.closest('#' + ID + ' [data-k]'); if (b) { e.preventDefault(); appuyer(b.dataset.k); } };
  const surMousedown = e => { if (e.target.closest && e.target.closest('#' + ID)) e.preventDefault(); };   // cliquer une touche ne retire pas le focus du champ

  function monter() {
    if (E.monte || !K) return E; E.monte = true;
    styleEl = document.createElement('style'); styleEl.id = ID + '-css'; styleEl.textContent = CSS; document.head.appendChild(styleEl);
    el = document.createElement('div'); el.id = ID; el.hidden = true; el.setAttribute('role', 'application'); el.setAttribute('aria-label', 'Clavier virtuel');
    el.innerHTML = '<div class="vk-haut"><span>CLAVIER</span><span class="vk-champ"></span><span>AZERTY</span></div><div class="vk-corps"></div>';
    document.body.appendChild(el);
    document.addEventListener('focusin', surFocus, true); document.addEventListener('focusout', surPerdu, true); el.addEventListener('click', surClic); el.addEventListener('mousedown', surMousedown, true); el.addEventListener('pointerdown', surMousedown, true);
    const actif = document.activeElement; if (enChamp(actif)) afficher(actif);
    majEtat(); return E;
  }
  function demonter() {
    if (!E.monte) return; E.monte = false; document.removeEventListener('focusin', surFocus, true); document.removeEventListener('focusout', surPerdu, true);
    if (el) { el.remove(); el = null; } if (styleEl) { styleEl.remove(); styleEl = null; } cible = null; E.visible = false; majEtat();
  }
  return { monter, demonter, afficher, masquer, appuyer, etat: () => ({ ...E, element: el, cible }), surChange: f => { ecouteurs.push(f); }, ID };
})();
window.RayleVRClavier = clavierVR;
