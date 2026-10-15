/* ═════════════ DRIVE : la fenêtre flottante de lecture et d'édition ═════════════
   • Déplaçable (barre de titre) et redimensionnable (8 poignées tactiles) ; réduire · plein écran réel (Fullscreen API, sinon pseudo plein écran) · fermer.
   • Taille et position mémorisées ; le plein écran revient à la taille d'avant.
   • Mode lecture (toucher un paragraphe = « ce passage ») et mode édition (un bloc modifiable par paragraphe, indicateur « modifié », enregistrement
     avec confirmation, enregistrement automatique optionnel).
   • Aperçu avant/après des changements proposés par Raylé, avec Valider / Annuler.
   Contrat avec le service (js/drive/service.js) : afficher · montrer · apercu · rafraichir · visible · demanderConnexion. */
import { diffOps } from './modele.js?v=2026.10.15.2';
import { parlable } from './service.js?v=2026.10.15.2';

const CLE = 'rayle_drive_fenetre', CLE_AUTO = 'rayle_drive_auto';
const MIN_L = 290, MIN_H = 170, ZOOM_MIN = 0.8, ZOOM_MAX = 2.2;

export function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v; else if (k === 'hidden') el.hidden = !!v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e.nodeType ? e : document.createTextNode(String(e)));
  return el;
}
const lireJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const ecrireJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

export function creerFenetre({ service, auth, choisir, dire }) {
  const sauve = lireJson(CLE, {});
  const etat = { rect: null, avant: null, plein: false, pseudo: false, reduit: false, edition: false, zoom: sauve.zoom || 1, modifie: false, ouverte: false, vue: 'liste', selection: -1 };
  const el = {};
  let racine = null, apercuCourant = null, minuteurAuto = null, dernierSurligne = [];

  /* ───── construction ───── */
  function monter() {
    if (racine) return;
    el.titre = h('span', { class: 'dr-titre' }, 'Documents Drive');
    el.type = h('small', { class: 'dr-type' });
    el.badge = h('span', { class: 'dr-badge', hidden: true, title: 'Des changements ne sont pas enregistrés' }, '● modifié');
    const bouton = (cls, txt, titre, f) => h('button', { type: 'button', class: 'dr-b ' + cls, title: titre, 'aria-label': titre, onclick: f }, txt);
    el.bAnnuler = bouton('dr-annuler', '↶', 'Annuler la dernière modification', () => rep(service.annuler()));
    el.bListe = bouton('dr-liste', '📁', 'Mes documents autorisés', () => { etat.vue = 'liste'; dessiner(); });
    el.bCopier = bouton('dr-copier', '⧉ Copier', 'Copier le texte sélectionné (ou tout le document si rien n’est sélectionné)', () => copierTexte());
    el.bCopier.addEventListener('pointerdown', ev => ev.preventDefault());            // garde la sélection de texte en cours
    el.bMode = bouton('dr-mode', '✎ Éditer', 'Passer en mode édition', () => basculerMode());
    el.bMoins = bouton('dr-zm', 'A−', 'Texte plus petit', () => zoom(-1));
    el.bPlus = bouton('dr-zp', 'A+', 'Texte plus grand', () => zoom(1));
    el.bReduire = bouton('dr-reduire', '▁', 'Réduire', () => etat.reduit ? restaurer() : reduire());
    el.bPlein = bouton('dr-plein-b', '⤢', 'Plein écran', () => etat.plein ? normal() : plein());
    el.bFermer = bouton('dr-fermer', '✕', 'Fermer', () => fermer());
    el.barre = h('div', { class: 'dr-barre' }, h('div', { class: 'dr-titres' }, el.titre, el.type), el.badge, h('div', { class: 'dr-outils' }, el.bAnnuler, el.bListe, el.bCopier, el.bMode, el.bMoins, el.bPlus, el.bReduire, el.bPlein, el.bFermer));
    el.connexion = h('div', { class: 'dr-connexion', hidden: true });
    el.bandeau = h('div', { class: 'dr-bandeau', hidden: true });
    el.corps = h('div', { class: 'dr-corps', tabindex: '0' });
    el.apercu = h('div', { class: 'dr-apercu', hidden: true });
    el.etat = h('span', { class: 'dr-statut', role: 'status' });
    el.bEnreg = h('button', { type: 'button', class: 'dr-b dr-enreg', disabled: true, onclick: () => demanderEnregistrement() }, '💾 Enregistrer');
    el.auto = h('input', { type: 'checkbox', id: 'drAuto' }); el.auto.checked = localStorage.getItem(CLE_AUTO) === '1';
    el.auto.addEventListener('change', () => {
      if (el.auto.checked && !confirm('Enregistrement automatique : tes modifications seront écrites dans le document du Drive quelques secondes après chaque pause. Tu pourras toujours annuler avec ↶. Activer ?')) { el.auto.checked = false; return; }
      try { localStorage.setItem(CLE_AUTO, el.auto.checked ? '1' : '0'); } catch (e) { /* ignore */ }
      planifierAuto();
    });
    el.pied = h('div', { class: 'dr-pied' }, el.etat, h('label', { class: 'dr-auto', title: 'Enregistre tout seul après une pause' }, el.auto, ' auto'), el.bEnreg);
    racine = h('div', { class: 'dr-fenetre', role: 'dialog', 'aria-label': 'Document Google Drive', hidden: true }, el.barre, el.connexion, el.bandeau, el.corps, el.apercu, el.pied);
    for (const s of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) racine.append(h('div', { class: 'dr-poignee dr-p-' + s, 'data-sens': s, 'aria-hidden': 'true' }));
    document.body.append(racine);
    brancherDeplacement(); brancherRedim();
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && etat.plein && !etat.pseudo) { etat.plein = false; appliquerClasses(); } });
    document.addEventListener('webkitfullscreenchange', () => { if (!document.webkitFullscreenElement && etat.plein && !etat.pseudo) { etat.plein = false; appliquerClasses(); } });
    window.addEventListener('resize', () => { if (etat.ouverte) { etat.rect = contraindre(etat.rect); poser(); } });
    el.corps.addEventListener('scroll', () => { /* la position visible est calculée à la demande */ }, { passive: true });
    service.surChangement(() => { majTitre(); majBoutons(); });
    if (auth) auth.surChangement(() => majConnexion());
  }

  /* ───── géométrie ───── */
  const vp = () => ({ w: window.innerWidth, h: window.innerHeight });
  function rectDefaut() {
    const { w, h: hh } = vp();
    if (w < 640) return { x: 6, y: 52, w: w - 12, h: Math.round(hh * 0.62) };
    const lw = Math.min(620, w - 40), lh = Math.min(560, hh - 110);
    return { x: Math.max(12, w - lw - 24), y: 64, w: lw, h: lh };
  }
  function contraindre(r) {
    const { w, h: hh } = vp(); r = { ...r };
    r.w = Math.max(MIN_L, Math.min(r.w, w)); r.h = Math.max(MIN_H, Math.min(r.h, hh));
    r.x = Math.max(-r.w + 90, Math.min(r.x, w - 90)); r.y = Math.max(0, Math.min(r.y, hh - 44));
    return r;
  }
  function poser() { if (!racine || !etat.rect) return; const r = etat.rect; Object.assign(racine.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
  function memoriser() { ecrireJson(CLE, { ...etat.rect, reduit: etat.reduit, zoom: etat.zoom }); }
  function appliquerClasses() {
    racine.classList.toggle('dr-plein', etat.plein); racine.classList.toggle('dr-pseudo', etat.plein && etat.pseudo);
    racine.classList.toggle('dr-reduit', etat.reduit); racine.classList.toggle('dr-doc-temp', !!(service.courant() && service.courant().temporaire)); racine.classList.toggle('dr-edition', etat.edition);
    document.body.classList.toggle('dr-pseudo-actif', etat.plein && etat.pseudo);
    el.bPlein.textContent = etat.plein ? '⤡' : '⤢'; el.bPlein.title = el.bPlein.ariaLabel = etat.plein ? 'Quitter le plein écran' : 'Plein écran';
    el.bReduire.textContent = etat.reduit ? '▢' : '▁'; el.bReduire.title = el.bReduire.ariaLabel = etat.reduit ? 'Restaurer' : 'Réduire';
    el.corps.style.fontSize = (15 * etat.zoom).toFixed(1) + 'px';
  }

  function brancherDeplacement() {
    let depart = null;
    el.barre.addEventListener('pointerdown', ev => {
      if (ev.target.closest('button') || etat.plein) return;
      depart = { px: ev.clientX, py: ev.clientY, x: etat.rect.x, y: etat.rect.y, id: ev.pointerId };
      el.barre.setPointerCapture(ev.pointerId); racine.classList.add('dr-bouge'); ev.preventDefault();
    });
    el.barre.addEventListener('pointermove', ev => {
      if (!depart || ev.pointerId !== depart.id) return;
      etat.rect = contraindre({ ...etat.rect, x: depart.x + ev.clientX - depart.px, y: depart.y + ev.clientY - depart.py }); poser();
    });
    const fin = ev => { if (!depart) return; depart = null; racine.classList.remove('dr-bouge'); memoriser(); };
    el.barre.addEventListener('pointerup', fin); el.barre.addEventListener('pointercancel', fin);
    el.barre.addEventListener('dblclick', ev => { if (!ev.target.closest('button')) etat.plein ? normal() : plein(); });
  }
  function brancherRedim() {
    let d = null;
    racine.addEventListener('pointerdown', ev => {
      const p = ev.target.closest('.dr-poignee'); if (!p || etat.plein || etat.reduit) return;
      d = { s: p.dataset.sens, px: ev.clientX, py: ev.clientY, r: { ...etat.rect }, id: ev.pointerId, el: p };
      p.setPointerCapture(ev.pointerId); racine.classList.add('dr-bouge'); ev.preventDefault(); ev.stopPropagation();
    });
    racine.addEventListener('pointermove', ev => {
      if (!d || ev.pointerId !== d.id) return;
      const dx = ev.clientX - d.px, dy = ev.clientY - d.py, r = { ...d.r }, { w, h: hh } = vp();
      if (d.s.includes('e')) r.w = Math.min(d.r.w + dx, w - d.r.x);
      if (d.s.includes('s')) r.h = Math.min(d.r.h + dy, hh - d.r.y);
      if (d.s.includes('w')) { const nw = Math.max(MIN_L, d.r.w - dx); r.x = d.r.x + (d.r.w - nw); r.w = nw; }
      if (d.s.includes('n')) { const nh = Math.max(MIN_H, d.r.h - dy); r.y = d.r.y + (d.r.h - nh); r.h = nh; }
      r.w = Math.max(MIN_L, r.w); r.h = Math.max(MIN_H, r.h);
      etat.rect = r; poser();
    });
    const fin = () => { if (!d) return; d = null; racine.classList.remove('dr-bouge'); memoriser(); };
    racine.addEventListener('pointerup', fin); racine.addEventListener('pointercancel', fin);
  }

  /* ───── fenêtre : ouvrir, fermer, réduire, plein écran ───── */
  function ouvrirFenetre() {
    monter();
    if (!etat.rect) { const r = sauve.w ? { x: sauve.x, y: sauve.y, w: sauve.w, h: sauve.h } : rectDefaut(); etat.rect = contraindre(r); etat.reduit = false; }
    racine.hidden = false; etat.ouverte = true; poser(); appliquerClasses(); majTitre(); majBoutons();
  }
  function fermer() {
    if (!racine) return { ok: true, dit: 'Il n’y a pas de document ouvert.' };
    if (etat.modifie && !confirm('Des modifications ne sont pas enregistrées. Fermer quand même ?')) return { ok: false, dit: 'Je laisse le document ouvert : il a des modifications non enregistrées.' };
    if (etat.plein) normal();
    racine.hidden = true; etat.ouverte = false; etat.modifie = false; etat.edition = false; service.fermer(); apercuCourant = null; el.apercu.hidden = true;
    return { ok: true, dit: 'J’ai fermé le document.' };
  }
  function reduire() { ouvrirFenetre(); if (etat.plein) normal(); etat.reduit = true; appliquerClasses(); memoriser(); return { ok: true, dit: 'Fenêtre réduite.' }; }
  function restaurer() { ouvrirFenetre(); etat.reduit = false; appliquerClasses(); memoriser(); return { ok: true, dit: 'Fenêtre restaurée.' }; }
  async function plein() {
    ouvrirFenetre(); if (etat.plein) return { ok: true, dit: 'C’est déjà en plein écran.' };
    etat.reduit = false; etat.avant = { ...etat.rect };
    let natif = false;
    try {
      if (racine.requestFullscreen) { await racine.requestFullscreen({ navigationUI: 'hide' }); natif = true; }
      else if (racine.webkitRequestFullscreen) { racine.webkitRequestFullscreen(); natif = !!document.webkitFullscreenElement || true; }
    } catch (e) { natif = false; }
    etat.plein = true; etat.pseudo = !natif;
    appliquerClasses();
    return { ok: true, dit: natif ? 'Plein écran.' : 'Plein écran (affichage agrandi : ton navigateur n’autorise pas le plein écran réel ici).' };
  }
  async function normal() {
    if (!racine || !etat.plein) return { ok: true, dit: 'La fenêtre est déjà à sa taille normale.' };
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.webkitFullscreenElement) document.webkitExitFullscreen(); } catch (e) { /* ignore */ }
    etat.plein = false; etat.pseudo = false; if (etat.avant) etat.rect = etat.avant; poser(); appliquerClasses();
    return { ok: true, dit: 'Retour à la taille précédente.' };
  }
  function zoom(sens) {
    ouvrirFenetre(); etat.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((etat.zoom + sens * 0.15) * 100) / 100)); appliquerClasses(); memoriser();
    return { ok: true, dit: etat.zoom >= ZOOM_MAX || etat.zoom <= ZOOM_MIN ? 'Taille du texte au ' + (sens > 0 ? 'maximum' : 'minimum') + '.' : 'Texte ' + (sens > 0 ? 'agrandi' : 'réduit') + '.' };
  }

  /* ───── en-tête, boutons, connexion ───── */
  function majTitre() {
    if (!racine) return;
    const c = service.courant();
    if (etat.vue === 'doc' && c) { el.titre.textContent = c.meta.name; el.type.textContent = (c.temporaire ? 'lecture seule · non mémorisé' : c.lectureSeule ? 'lecture seule' : etat.edition ? 'édition' : 'lecture'); }
    else { el.titre.textContent = 'Documents Drive'; el.type.textContent = service.fichiers().length + ' autorisé' + (service.fichiers().length > 1 ? 's' : ''); }
    el.badge.hidden = !etat.modifie;
  }
  function majBoutons() {
    if (!racine) return;
    const c = service.courant(), doc = etat.vue === 'doc' && !!c;
    el.bCopier.hidden = !doc;
    el.bMode.hidden = !doc || (c && c.lectureSeule); el.bMode.textContent = etat.edition ? '👁 Lire' : '✎ Éditer';
    el.bAnnuler.hidden = !doc || !service.etat().annulable; el.bMoins.hidden = el.bPlus.hidden = !doc;
    el.bListe.hidden = etat.vue === 'liste'; el.pied.hidden = !doc || !etat.edition;
    el.bEnreg.disabled = !etat.modifie;
  }
  function majConnexion(message) {
    if (!racine) return;
    const e = auth ? auth.etat() : { configure: true, connecte: false };
    el.connexion.replaceChildren();
    if (!e.configure) {
      el.connexion.hidden = false;
      el.connexion.append(h('div', { class: 'dr-msg' }, 'Google n’est pas encore configuré : il manque l’identifiant client dans js/config-drive.js (étapes dans docs/drive.md).'));
    } else if (message || (!e.connecte && etat.besoinConnexion)) {
      el.connexion.hidden = false;
      el.connexion.append(h('div', { class: 'dr-msg' }, message || 'Connexion à Google requise.'), h('button', { type: 'button', class: 'dr-b dr-gros', onclick: connecterGoogle }, 'Se connecter à Google'));
    } else el.connexion.hidden = true;
  }
  async function connecterGoogle() {
    try {
      await auth.connecter(); etat.besoinConnexion = false; majConnexion(); dessiner();
      const r = await service.reprendre(); if (r) dire(r.dit); else dire('Connecté à Google.');
    } catch (e) { majConnexion(e.message); dire(e.message); }
  }
  async function demanderConnexion(msg) { ouvrirFenetre(); etat.besoinConnexion = true; etat.vue = etat.vue || 'liste'; majConnexion(msg); }

  /* ───── contenu : liste des documents ou document ───── */
  function dessiner() {
    ouvrirFenetre();
    const c = service.courant();
    if (etat.vue === 'doc' && c) dessinerDocument(c); else dessinerListe();
    majTitre(); majBoutons(); majConnexion();
  }
  function dessinerListe() {
    etat.vue = 'liste'; el.bandeau.hidden = true;
    const l = service.fichiers();
    el.corps.classList.remove('dr-doc'); el.corps.replaceChildren(
      h('div', { class: 'dr-liste-tete' }, h('b', null, 'Documents que Raylé peut lire'), h('button', { type: 'button', class: 'dr-b dr-gros', onclick: () => choisir().then(r => r && r.dit && dire(r.dit)) }, '＋ Choisir dans Google Drive'),
        auth && (auth.etat().connecte || auth.etat().dejaConnecte) ? h('button', { type: 'button', class: 'dr-b', title: 'Révoque l’accès de Raylé à ton compte Google (les documents choisis restent dans la liste)', onclick: async () => { await auth.deconnecter(); dire('Je me suis déconnectée de Google.'); dessiner(); } }, 'Se déconnecter') : null),
      l.length ? h('ul', { class: 'dr-fichiers' }, l.map(f => h('li', null,
        h('button', { type: 'button', class: 'dr-fichier', onclick: () => rep(service.ouvrir(f.name)) }, h('span', { class: 'dr-ico' }, icone(f.mimeType)), h('span', { class: 'dr-nom' }, f.name)),
        h('button', { type: 'button', class: 'dr-b dr-oubli', title: 'Retirer de la liste de Raylé', 'aria-label': 'Retirer ' + f.name + ' de la liste', onclick: () => { service.oublier(f.id); dessiner(); } }, '✕'))))
        : h('p', { class: 'dr-vide' }, 'Aucun document autorisé pour l’instant. Touche « Choisir dans Google Drive » : Raylé ne verra que ce que tu sélectionnes.'),
      h('p', { class: 'dr-note' }, 'Dis par exemple : « ouvre le cours d’anatomie », « lis le 2e paragraphe », « résume le document ».'));
  }
  const icone = m => /document$|wordprocessing/.test(m || '') ? '📄' : /pdf/.test(m || '') ? '📕' : /spreadsheet/.test(m || '') ? '📊' : /presentation/.test(m || '') ? '📽' : '📝';

  function dessinerDocument(c) {
    etat.vue = 'doc'; el.bandeau.replaceChildren();
    const infos = c.avertissements.slice();
    el.bandeau.hidden = !infos.length; if (infos.length) el.bandeau.append(h('span', null, 'ℹ ' + infos.join(' ')));
    el.corps.classList.add('dr-doc'); el.corps.replaceChildren();
    const blocs = [];
    c.paragraphes.forEach((p, i) => {
      if (!parlable(p.texte) && !etat.edition) return;
      const modifiable = etat.edition && p.editable !== false;
      const n = h(p.niveau ? 'h' + Math.min(6, p.niveau + 1) : 'p', { class: 'dr-p' + (p.niveau ? ' dr-titre-p' : '') + (p.puce ? ' dr-puce' : '') + (modifiable ? ' dr-modif' : '') + (p.tableau ? ' dr-cellule' : ''), 'data-i': i, 'data-orig': i });
      n.textContent = p.texte.replace(/￼/g, '▣');
      if (p.page && (i === 0 || c.paragraphes[i - 1].page !== p.page)) n.dataset.page = 'p. ' + p.page;
      if (modifiable) {
        n.contentEditable = 'plaintext-only'; if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
        n.spellcheck = true; n.lang = 'fr';
        n.addEventListener('input', surEdition);
        n.addEventListener('keydown', ev => touche(ev, n));
        n.addEventListener('focus', () => { etat.selection = i; barreBloc(n); });
        n.addEventListener('paste', ev => { if (n.contentEditable === 'true') { ev.preventDefault(); document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain')); } });
      } else if (!etat.edition) {
        n.addEventListener('click', () => { if (getSelection().toString()) return; selectionner(i); });
      }
      el.corps.append(n); blocs.push(n);
    });
    if (!blocs.length) el.corps.append(h('p', { class: 'dr-vide' }, 'Ce document ne contient pas de texte lisible.'));
    etat.modifie = false; etat.selection = -1; majTitre(); majBoutons();
    appliquerSurlignage(dernierSurligne, true);
  }
  function selectionner(i) {
    etat.selection = i; service.choisirPassage(i);
    el.corps.querySelectorAll('.dr-choisi').forEach(x => x.classList.remove('dr-choisi'));
    const n = el.corps.querySelector('[data-i="' + i + '"]'); if (n) n.classList.add('dr-choisi');
  }

  /** copie la sélection (ou, sans sélection, tout le texte du document) dans le presse-papiers */
  async function copierTexte() {
    const c = service.courant(); if (!c) return { ok: false, dit: 'Aucun document n’est ouvert.' };
    const sel = ((getSelection() && getSelection().toString()) || '').trim();
    const texte = sel || c.paragraphes.filter(p => parlable(p.texte)).map(p => p.texte.replace(/￼/g, '')).join('\n\n');
    let ok = false;
    try { await navigator.clipboard.writeText(texte); ok = true; }
    catch (e) {
      try { const t = h('textarea', { style: 'position:fixed;opacity:0;top:0' }); t.value = texte; document.body.append(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (x) { ok = false; }
    }
    el.bCopier.textContent = ok ? (sel ? '✔ Sélection copiée' : '✔ Document copié') : '✖ Copie impossible';
    setTimeout(() => { el.bCopier.textContent = '⧉ Copier'; }, 2200);
    return { ok, dit: ok ? (sel ? 'J’ai copié la sélection.' : 'J’ai copié le texte du document.') : 'Je n’ai pas pu copier le texte : sélectionne-le et utilise « Copier » du navigateur.' };
  }

  /* ───── édition ───── */
  function blocsEdites() { return [...el.corps.querySelectorAll('.dr-p')]; }
  function texteBloc(n) { return n.innerText.replace(/\n+$/g, '').replace(/▣/g, '￼'); }
  function surEdition() { calculerModifie(); planifierAuto(); }
  function calculerModifie() {
    if (!service.courant()) return;
    try { etat.modifie = opsDepuisEdition().length > 0; } catch (e) { etat.modifie = true; }
    majTitre(); majBoutons();
  }
  function touche(ev, n) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ajouterApres(n); }
    else if (ev.key === 'Backspace' && !texteBloc(n).length) { ev.preventDefault(); retirer(n); }
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); demanderEnregistrement(); }
  }
  function nouveauBloc() {
    const n = h('p', { class: 'dr-p dr-modif dr-nouveau', 'data-i': 'n' + Math.random().toString(36).slice(2, 6) });
    n.contentEditable = 'plaintext-only'; if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.addEventListener('input', surEdition); n.addEventListener('keydown', ev => touche(ev, n)); n.addEventListener('focus', () => barreBloc(n));
    return n;
  }
  function ajouterApres(n) { const b = nouveauBloc(); n.after(b); b.focus(); surEdition(); }
  function retirer(n) {
    const prec = n.previousElementSibling; n.remove(); if (prec && prec.classList.contains('dr-p')) { prec.focus(); const r = document.createRange(); r.selectNodeContents(prec); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    surEdition();
  }
  function barreBloc(n) {
    el.corps.querySelectorAll('.dr-barre-bloc').forEach(x => x.remove());
    const b = h('div', { class: 'dr-barre-bloc', contenteditable: 'false' },
      h('button', { type: 'button', class: 'dr-b', onmousedown: ev => ev.preventDefault(), onclick: () => ajouterApres(n) }, '＋ paragraphe dessous'),
      h('button', { type: 'button', class: 'dr-b', onmousedown: ev => ev.preventDefault(), onclick: () => retirer(n) }, '🗑 supprimer'));
    n.after(b);
  }
  /** les blocs affichés (dans l'ordre de l'écran) → opérations, comparées au document tel qu'il était à l'ouverture */
  function opsDepuisEdition() {
    const c = service.courant(), apres = [];
    for (const n of blocsEdites()) {
      const o = n.dataset.orig, i = /^\d+$/.test(o || '') ? +o : null;
      if (i == null) { const t = texteBloc(n); if (t.trim()) apres.push({ orig: null, texte: t, style: 'normal' }); continue; }
      apres.push({ orig: i, texte: n.classList.contains('dr-modif') ? texteBloc(n) : c.paragraphes[i].texte });
    }
    return diffOps(c.paragraphes, apres);
  }
  async function basculerMode(vers) {
    const c = service.courant(); if (!c) return { ok: false, dit: 'Aucun document n’est ouvert.' };
    if (c.lectureSeule) return { ok: false, dit: 'Ce document est en lecture seule : je ne peux pas passer en édition.' };
    const edition = vers == null ? !etat.edition : vers === 'edition';
    if (edition === etat.edition) return { ok: true, dit: edition ? 'Le mode édition est déjà actif.' : 'Le mode lecture est déjà actif.' };
    if (!edition && etat.modifie && !confirm('Des modifications ne sont pas enregistrées. Repasser en lecture les abandonne. Continuer ?')) return { ok: false, dit: 'Je reste en édition : tu as des modifications non enregistrées.' };
    etat.edition = edition; dessiner(); appliquerClasses();
    return { ok: true, dit: edition ? 'Mode édition : touche un paragraphe pour le modifier, puis Enregistrer.' : 'Mode lecture.' };
  }

  /* ───── enregistrement (avec confirmation avant écrasement) ───── */
  function planifierAuto() {
    clearTimeout(minuteurAuto);
    if (!el.auto || !el.auto.checked || !etat.modifie) return;
    minuteurAuto = setTimeout(() => enregistrer({ auto: true }), 4000);
  }
  async function demanderEnregistrement() { return enregistrer({ auto: false }); }
  async function enregistrer({ auto }) {
    const c = service.courant(); if (!c || !etat.edition) return { ok: false, dit: 'Rien à enregistrer.' };
    let ops; try { ops = opsDepuisEdition(); } catch (e) { return { ok: false, dit: 'Je ne peux pas calculer les changements : ' + e.message }; }
    if (!ops.length) { etat.modifie = false; majTitre(); majBoutons(); return { ok: true, dit: 'Il n’y a rien à enregistrer.' }; }
    const r = await service.enregistrer(ops);
    if (!r.ok) { el.etat.textContent = r.dit; return r; }
    if (auto && !r.ailleurs) return appliquerEdition(ops, false);
    afficherConfirmation(r, ops);
    return { ok: true, dit: 'Confirme l’enregistrement dans la fenêtre.', enAttente: true };
  }
  function afficherConfirmation(r, ops) {
    el.apercu.hidden = false; el.apercu.replaceChildren(
      h('div', { class: 'dr-ap-titre' }, r.ailleurs ? '⚠ Le document a changé sur le Drive depuis son ouverture' : 'Enregistrer ces changements dans le Drive ?'),
      r.ailleurs ? h('div', { class: 'dr-ap-alerte' }, 'Enregistrer écrase les paragraphes que tu as modifiés ; les autres changements faits ailleurs sont conservés.') : null,
      listeApercu(r.apercu),
      h('div', { class: 'dr-ap-boutons' },
        h('button', { type: 'button', class: 'dr-b dr-gros dr-ok', onclick: () => appliquerEdition(ops, r.ailleurs) }, r.ailleurs ? 'Écraser et enregistrer' : 'Enregistrer'),
        r.ailleurs ? h('button', { type: 'button', class: 'dr-b dr-gros', onclick: () => recharger() }, 'Recharger la version du Drive') : null,
        h('button', { type: 'button', class: 'dr-b dr-gros', onclick: () => { el.apercu.hidden = true; } }, 'Annuler')));
  }
  async function appliquerEdition(ops, force) {
    el.apercu.hidden = true; el.etat.textContent = 'Enregistrement…';
    const r = await service.appliquerEdition(force ? ops.map(o => ({ ...o, force: true })) : ops);
    el.etat.textContent = r.ok ? 'Enregistré et vérifié ✔' : r.dit;
    if (r.ok) { etat.modifie = false; dessiner(); } else if (r.conflit) afficherConflit(r);
    if (r.dit) dire(r.dit);
    return r;
  }
  function afficherConflit(r) {
    el.apercu.hidden = false; el.apercu.replaceChildren(h('div', { class: 'dr-ap-titre' }, '⚠ ' + r.dit), h('div', { class: 'dr-ap-boutons' }, h('button', { type: 'button', class: 'dr-b dr-gros', onclick: () => recharger() }, 'Recharger la version du Drive'), h('button', { type: 'button', class: 'dr-b dr-gros', onclick: () => { el.apercu.hidden = true; } }, 'Garder mon texte')));
  }
  async function recharger() {
    const c = service.courant(); el.apercu.hidden = true; if (!c) return;
    etat.modifie = false; const r = await service.ouvrir(c.fichier.name); if (r.dit) dire(r.dit);
  }

  /* ───── aperçu d'une modification proposée par Raylé ───── */
  function listeApercu(ap) {
    return h('ul', { class: 'dr-ap-liste' }, (ap || []).slice(0, 12).map(a => h('li', null,
      h('div', { class: 'dr-ap-lieu' }, a.type === 'inserer' ? 'Ajout ' + a.lieu : a.type === 'supprimer' ? 'Suppression : ' + a.lieu : 'Modification : ' + a.lieu),
      a.avant ? h('div', { class: 'dr-avant' }, h('span', { class: 'dr-etiq' }, 'Avant'), a.avant) : null,
      a.apres ? h('div', { class: 'dr-apres' }, h('span', { class: 'dr-etiq' }, 'Après'), a.apres) : null)));
  }
  function apercu(ap) {
    ouvrirFenetre(); apercuCourant = ap;
    if (!ap) { el.apercu.hidden = true; return; }
    el.apercu.hidden = false;
    el.apercu.replaceChildren(h('div', { class: 'dr-ap-titre' }, 'Raylé propose ' + (ap.length > 1 ? ap.length + ' changements' : 'ce changement')), listeApercu(ap),
      h('div', { class: 'dr-ap-boutons' },
        h('button', { type: 'button', class: 'dr-b dr-gros dr-ok', onclick: async () => { const r = await service.valider(); el.apercu.hidden = true; if (r.dit) dire(r.dit); } }, 'Valider'),
        h('button', { type: 'button', class: 'dr-b dr-gros', onclick: () => { const r = service.refuser(); el.apercu.hidden = true; if (r.dit) dire(r.dit); } }, 'Annuler')));
    const premier = ap[0] && ap[0].i >= 0 ? ap[0].i : null;
    if (premier != null) montrer([premier], { douce: true });
  }

  /* ───── mise en évidence, défilement, position visible ───── */
  function appliquerSurlignage(indices, persistant) {
    if (!racine) return;
    el.corps.querySelectorAll('.dr-lu,.dr-surligne').forEach(x => x.classList.remove('dr-lu', 'dr-surligne'));
    for (const i of indices) { const n = el.corps.querySelector('[data-i="' + i + '"]'); if (n) n.classList.add(persistant ? 'dr-surligne' : 'dr-lu'); }
  }
  function montrer(indices, opts = {}) {
    if (!etat.ouverte || etat.vue !== 'doc') { if (service.courant()) { etat.vue = 'doc'; dessiner(); } else return; }
    dernierSurligne = opts.surligner ? indices.slice() : [];
    appliquerSurlignage(indices, !!opts.surligner);
    const n = indices.length ? el.corps.querySelector('[data-i="' + indices[0] + '"]') : null;
    if (n) { try { n.scrollIntoView({ block: 'center', behavior: opts.douce ? 'auto' : 'smooth' }); } catch (e) { n.scrollIntoView(); } }
  }
  function visible() {
    if (!racine || etat.vue !== 'doc') return -1;
    const top = el.corps.getBoundingClientRect().top + 4;
    for (const n of el.corps.querySelectorAll('.dr-p[data-i]')) { const r = n.getBoundingClientRect(); if (r.bottom > top + 10 && /^\d+$/.test(n.dataset.i)) return +n.dataset.i; }
    return -1;
  }
  function afficher(et, doc) {
    etat.edition = false; etat.modifie = false; dernierSurligne = []; etat.vue = 'doc'; etat.besoinConnexion = false;
    ouvrirFenetre(); if (etat.reduit) { etat.reduit = false; appliquerClasses(); }
    dessiner(); el.corps.scrollTop = 0; el.apercu.hidden = true;
  }
  function rafraichir(et, doc) { if (!etat.ouverte) return; const garde = el.corps.scrollTop; etat.modifie = false; apercuCourant = null; el.apercu.hidden = true; dessiner(); el.corps.scrollTop = garde; el.etat.textContent = ''; }
  async function rep(p) { const r = await p; if (r && r.dit) dire(r.dit); return r; }

  /** description pour Raylé : ce qui est à l'écran */
  function etatFenetre() {
    return { ouverte: etat.ouverte && racine && !racine.hidden, reduit: etat.reduit, plein: etat.plein, pseudo: etat.pseudo, edition: etat.edition, modifie: etat.modifie, zoom: etat.zoom, vue: etat.vue, apercu: !!apercuCourant, rect: etat.rect && { ...etat.rect } };
  }

  return {
    afficher, montrer, apercu, rafraichir, visible, demanderConnexion,
    ouvrirListe() { etat.vue = 'liste'; dessiner(); return { ok: true, dit: 'Voici les documents autorisés.' }; },
    fermer, plein, normal, reduire, restaurer, zoom, mode: basculerMode, enregistrer: demanderEnregistrement, etat: etatFenetre, dessiner,
    _racine: () => racine
  };
}
