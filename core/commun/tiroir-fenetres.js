import { filtrerTiroir, grouperTiroir } from './dossiers-calcul.js';

/* ═════════════ TIROIR DE FENÊTRES GLOBAL (R3, phase 3) ═════════════
   Liste TOUTES les fenêtres du projet par vue puis par dossier, avec recherche ; un appui en affiche une, où qu'on soit.
   Chaque gestionnaire de fenêtres s'inscrit avec une source : { vue, entrees: () => [{ id, titre, dossier, apercu, icone, posee, afficher }] }.
   Les fenêtres du système « Panneaux » (Terre, Jupiter, Neptune…) s'inscrivent de la même façon (core/commun/panneaux-mobiles.js).
   Ouverture : bouton 🗂 en bas à gauche, raccourci Alt+T, ou window.TiroirFenetres.ouvrir(). Fermeture : Échap. Rien n'est inventé : une vue sans fenêtre dit « aucune fenêtre ». */
const sources = new Map();
let panneau = null, bouton = null;
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function enregistrerSource(cle, source) { sources.set(cle, source); majBouton(); if (panneau) dessiner(); return () => { if (sources.get(cle) === source) { sources.delete(cle); majBouton(); if (panneau) dessiner(); } }; }
export function toutes() {
  const sortie = [];
  for (const s of sources.values()) { let es = []; try { es = s.entrees() || []; } catch (e) { es = []; } for (const e of es) sortie.push({ ...e, vue: s.vue, dossier: e.dossier || s.vue }); }
  return sortie;
}
function chargerStyle() {
  if (document.getElementById('tf-css')) return;
  const l = document.createElement('link'); l.id = 'tf-css'; l.rel = 'stylesheet'; l.href = new URL('./tiroir-fenetres.css', import.meta.url).href; document.head.appendChild(l);
}
function majBouton() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!bouton) {
    chargerStyle(); bouton = document.createElement('button'); bouton.type = 'button'; bouton.className = 'tf-bouton'; bouton.id = 'tfBouton'; bouton.title = 'Tiroir de fenêtres (Alt+T) : toutes les fenêtres du projet'; bouton.setAttribute('aria-label', 'Tiroir de fenêtres'); bouton.innerHTML = '<span aria-hidden="true">🗂</span>';
    bouton.addEventListener('click', () => (panneau ? fermer() : ouvrir())); document.body.appendChild(bouton);
  }
  bouton.hidden = sources.size === 0;
}
function dessiner() {
  if (!panneau) return; const q = panneau.querySelector('input').value, tout = toutes(), vues = grouperTiroir(filtrerTiroir(tout, q));
  const zone = panneau.querySelector('.tf-liste');
  zone.innerHTML = vues.length ? vues.map(v => '<section class="tf-vue"><h3>' + esc(v.vue) + '</h3>' + v.dossiers.map(d => '<div class="tf-dossier"><h4>' + esc(d.dossier) + ' <small>' + d.fenetres.length + '</small></h4><div class="tf-fenetres">' + d.fenetres.map(f => '<button type="button" class="tf-f' + (f.posee ? ' posee' : '') + '" data-cle="' + esc(f.vue + '\u0001' + f.id) + '" title="' + esc(f.apercu || f.titre) + '"><i aria-hidden="true">' + esc(f.icone || '◈') + '</i><span>' + esc(f.titre) + '</span>' + (f.posee ? '<em>ouverte</em>' : '') + '</button>').join('') + '</div></div>').join('') + '</section>').join('')
    : '<p class="tf-vide">' + (tout.length ? 'Aucune fenêtre ne correspond à « ' + esc(q) + ' ».' : 'Aucune fenêtre dans cette vue pour le moment.') + '</p>';
  panneau.querySelector('.tf-compte').textContent = tout.length + ' fenêtre' + (tout.length > 1 ? 's' : '');
}
export function ouvrir() {
  if (panneau) { panneau.querySelector('input').focus(); return panneau; }
  chargerStyle(); majBouton();
  panneau = document.createElement('div'); panneau.className = 'tf-panneau'; panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-label', 'Tiroir de fenêtres');
  panneau.innerHTML = '<header><b>Tiroir de fenêtres</b><span class="tf-compte"></span><button type="button" class="tf-x" aria-label="Fermer le tiroir">✕</button></header><input type="search" placeholder="Chercher une fenêtre, un dossier…" aria-label="Rechercher une fenêtre" autocomplete="off"><div class="tf-liste"></div>';
  document.body.appendChild(panneau); dessiner();
  panneau.querySelector('input').addEventListener('input', dessiner);
  panneau.querySelector('.tf-x').addEventListener('click', fermer);
  panneau.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }, true);
  panneau.addEventListener('click', e => {
    const b = e.target.closest('.tf-f'); if (!b) return; const [vue, id] = b.dataset.cle.split('\u0001'), ent = toutes().find(x => x.vue === vue && x.id === id);
    if (ent && ent.afficher) { try { ent.afficher(); } catch (x) { /* une fenêtre défaillante ne bloque pas le tiroir */ } } fermer();
  });
  panneau.querySelector('input').focus(); if (bouton) bouton.classList.add('actif'); return panneau;
}
export function fermer() { if (!panneau) return false; panneau.remove(); panneau = null; if (bouton) bouton.classList.remove('actif'); return true; }
export const estOuvert = () => !!panneau;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => { if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); panneau ? fermer() : ouvrir(); } }, true);
  if (typeof window !== 'undefined') window.TiroirFenetres = { ouvrir, fermer, toutes, enregistrerSource, estOuvert };
}
