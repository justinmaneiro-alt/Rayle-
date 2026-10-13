/* ═════════════ POP-UP 3D RAPIDE (« Quick View ») ═════════════
   Fenêtre flottante, déplaçable et redimensionnable : la structure demandée est isolée en 3D (rotation, zoom) avec sa description à côté.
   Appelée par Raylé (« décris-moi l'humérus », « où s'insère le biceps ? ») depuis l'accueil, le chat ou le terminal. */
import { useAnatomieStore as S, actions as A, creerStore, ETAT_INITIAL } from './store.js?v=2026.10.13.11';
import { MoteurAnatomie } from './moteur.js?v=2026.10.13.11';
import * as R from './registre.js?v=2026.10.13.11';
import * as K from './cours.js?v=2026.10.13.11';
import { chargerTHREE, webglDisponible, h, vider } from './outils.js?v=2026.10.13.11';

let boite = null, moteur = null, store = null, cible = null, jeton = 0;
const dom = {};

function construire() {
  if (boite) return;
  dom.titre = h('b', { class: 'anq-titre' });
  dom.cotes = h('span', { class: 'anq-cotes' });
  dom.canvas = h('canvas', { class: 'an-canvas', 'aria-label': 'Structure en 3D : glisser pour tourner, molette pour zoomer' });
  dom.etiquettes = h('div', { class: 'an-etiquettes', 'aria-hidden': 'true' });
  dom.texte = h('div', { class: 'anq-texte' });
  dom.erreur = h('p', { class: 'an-erreur', hidden: true });
  dom.entete = h('div', { class: 'anq-entete' }, dom.titre, dom.cotes,
    h('button', { type: 'button', class: 'an-mini', title: 'Rotation automatique', 'aria-label': 'Rotation automatique', onclick: ev => { const on = !(moteur && moteur.auto); moteur && moteur.rotationAuto(on); ev.currentTarget.classList.toggle('actif', on); } }, '⟳'),
    h('button', { type: 'button', class: 'an-mini', title: 'Ouvrir dans Anatomie & Orthopédie', 'aria-label': 'Ouvrir dans Anatomie et Orthopédie', onclick: ouvrirComplet }, '⤢'),
    h('button', { type: 'button', class: 'an-mini', title: 'Fermer', 'aria-label': 'Fermer', onclick: fermerQuick }, '✕'));
  boite = h('div', { id: 'anQuick', class: 'anq hud-cadre hud-in', role: 'dialog', 'aria-label': 'Aperçu 3D' }, dom.entete,
    h('div', { class: 'anq-corps' }, h('div', { class: 'anq-scene' }, dom.canvas, dom.etiquettes, dom.erreur), dom.texte));
  document.body.appendChild(boite);
  deplacable(boite, dom.entete);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && boite && !boite.hidden) fermerQuick(); });
}
function deplacable(fenetre, poignee) {
  let d = null;
  poignee.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button')) return;
    const r = fenetre.getBoundingClientRect(); d = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
    poignee.setPointerCapture(ev.pointerId); fenetre.style.right = 'auto'; fenetre.style.bottom = 'auto'; fenetre.style.left = r.left + 'px'; fenetre.style.top = r.top + 'px';
  });
  poignee.addEventListener('pointermove', ev => { if (!d) return; fenetre.style.left = Math.min(Math.max(ev.clientX - d.dx, 0), innerWidth - 80) + 'px'; fenetre.style.top = Math.min(Math.max(ev.clientY - d.dy, 0), innerHeight - 50) + 'px'; });
  poignee.addEventListener('pointerup', () => { d = null; }); poignee.addEventListener('pointercancel', () => { d = null; });
}

/** cible : id d'instance ('humerus:D'), ou résultat de registre.trouver() ({ base, ids, cote, nom, groupe }). */
export async function afficherQuick(c, options = {}) {
  construire();
  let ids, sid = null, nom, groupe = null, sym = false, cote = options.cote || null;
  if (typeof c === 'string') { sid = c; ids = [c]; }
  else {
    const def = R.definition(c.base);
    if (c.groupe || (c.ids && c.ids.length > 2)) { groupe = c.ids; ids = c.ids; nom = c.nom; }
    else { sym = !!(def && def.sym); cote = c.cote || cote || 'D'; sid = sym ? c.base + ':' + cote : c.base; ids = [sid]; }
  }
  if (sid) { const def = R.definition(sid); sym = !!(def && def.sym); cote = R.cote(sid) || cote; }
  cible = { sid, groupe, nom, sym, cote };
  const mon = ++jeton;
  boite.hidden = false; boite.classList.remove('hud-out'); boite.classList.add('hud-in');
  A.ouvrirQuick(sid || (groupe && groupe[0]), cote);
  rendreTexte();
  if (!webglDisponible()) { dom.erreur.hidden = false; dom.erreur.textContent = 'La 3D n’est pas disponible sur cet appareil : voici la description.'; return; }
  dom.erreur.hidden = true;
  try {
    const THREE = await chargerTHREE();
    if (mon !== jeton || boite.hidden) return;
    if (!moteur) {
      store = creerStore(Object.assign({}, JSON.parse(JSON.stringify(ETAT_INITIAL)), { contexte: true }));
      moteur = new MoteurAnatomie(THREE, dom.canvas, { store, etiquettes: dom.etiquettes, mini: true, rotationAuto: false, surSelection: surClic });
    }
    appliquer();
  } catch (e) { dom.erreur.hidden = false; dom.erreur.textContent = '3D indisponible : ' + (e && e.message || e); }
}
/** Toucher une pièce du groupe : sa fiche s'affiche à la place de la liste */
function surClic(sid) {
  if (!cible || !cible.groupe || !sid || !cible.groupe.includes(sid)) return;
  cible.focus = sid; store.definir({ selection: sid }); rendreTexte();
}
function appliquer() {
  if (!moteur || !cible) return;
  const sel = cible.sid;
  store.definir({ selection: sel, groupe: cible.groupe, isolation: true, contexte: true, calques: Object.assign({}, store.obtenir().calques, { squelette: true }) });
  if (cible.groupe) setTimeout(() => moteur && moteur.focaliser(cible.groupe), 30);
  else if (sel) setTimeout(() => moteur && moteur.focaliser(sel), 30);
}
function rendreTexte() {
  vider(dom.texte); vider(dom.cotes);
  const mon = jeton;
  if (cible.groupe) {
    dom.titre.textContent = cible.nom;
    const noms = Array.from(new Set(cible.groupe.map(i => R.definition(i) && R.definition(i).nom))).filter(Boolean);
    const ff = cible.focus && R.fiche(cible.focus);
    if (ff) { dom.texte.append(h('p', { class: 'an-sous' }, ff.nom + ' · ' + ff.sous)); ff.champs.slice(0, 4).forEach(ch => dom.texte.append(h('div', { class: 'an-champ-fiche' }, h('h4', null, ch.label), Array.isArray(ch.valeur) ? h('ul', null, ch.valeur.slice(0, 4).map(v => h('li', null, v))) : h('p', null, ch.valeur)))); }
    dom.texte.append(h('p', { class: 'an-sous' }, noms.length + ' structures affichées'), h('p', { class: 'an-note-texte' }, noms.slice(0, 40).join(' · ')),
      h('p', { class: 'an-note-texte' }, 'Touchez une pièce pour la décrire, ou dites son nom à Raylé.'));
    return;
  }
  const f = R.fiche(cible.sid); if (!f) return;
  dom.titre.textContent = f.nom;
  if (cible.sym) ['D', 'G'].forEach(c => dom.cotes.append(h('button', { type: 'button', class: 'an-mini' + (cible.cote === c ? ' actif' : ''), 'aria-label': c === 'D' ? 'Côté droit' : 'Côté gauche', onclick: () => { const b = R.base(cible.sid); afficherQuick(b + ':' + c); } }, c)));
  dom.texte.append(h('p', { class: 'an-sous' }, f.sous));
  f.champs.slice(0, 6).forEach(ch => dom.texte.append(h('div', { class: 'an-champ-fiche' }, h('h4', null, ch.label), Array.isArray(ch.valeur) ? h('ul', null, ch.valeur.slice(0, 4).map(v => h('li', null, v))) : h('p', null, ch.valeur))));
  const bloc = h('div', { class: 'an-champ-fiche an-cours' }); dom.texte.append(bloc);
  K.chercher(R.nomAffiche(cible.sid).replace(/ (droit|gauche|droite)$/, '') + ' ' + (f.type === 'muscle' ? 'insertion origine action' : ''), 1).then(r => {
    if (mon !== jeton || !r.length) return;
    bloc.append(h('h4', null, 'Dans vos cours'), h('blockquote', { class: 'an-extrait' }, h('b', null, r[0].titre), h('p', null, r[0].texte.slice(0, 320))));
  }).catch(() => { });
}
function ouvrirComplet() {
  const c = cible; fermerQuick();
  import('./index.js?v=2026.10.13.11').then(m => m.ouvrirAnatomie({ selection: c && c.sid, isoler: true }));
}
export function fermerQuick() {
  if (!boite) return;
  jeton++;
  boite.classList.remove('hud-in'); boite.classList.add('hud-out');
  setTimeout(() => { if (boite && boite.classList.contains('hud-out')) { boite.hidden = true; if (moteur) { moteur.dispose(); moteur = null; store = null; } } }, 340);
  A.fermerQuick();
}
export const quickOuvert = () => !!(boite && !boite.hidden);
