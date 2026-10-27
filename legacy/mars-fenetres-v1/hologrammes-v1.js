import * as THREE from 'three';
import { FENETRES, fenetre } from './exemples.js';
import { dispositionFenetres } from './mars-calcul.js';
import { dessinerFenetreFlottante, construireContenu } from './dessin-exemples.js';
import { magasinReels } from './trading/rendu-reel.js';

/* ═════════════ FENÊTRES HOLOGRAPHIQUES FLOTTANTES AU-DESSUS DE LA TABLE ═════════════
   Sept plans translucides qui flottent en deux arcs (légère oscillation), chacun gravé de son aperçu RÉEL (donnée du Worker avec sa source, ou « indisponible » / « en préparation » : jamais de chiffre inventé). Survol : la fenêtre s'éclaire ;
   clic : elle s'ouvre en grand (core/commun/panneaux.js, taille « large ») ; clic ailleurs : elle se ferme (géré par index.js via fermerSiOuverte). */
export function creerHologrammes({ parent, centreTable, ouvrirEspace = null, fermerEspace = null }) {
  const groupe = new THREE.Group(); groupe.name = 'hologrammes'; parent.add(groupe);
  const dispo = dispositionFenetres(FENETRES.length, [centreTable[0], 0, centreTable[2]]);
  const items = FENETRES.map((def, i) => {
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 800;   // ×2 : texte net en haute résolution
    const ctx = cv.getContext('2d'); dessinerFenetreFlottante(ctx, def, false, def.reel ? { etat: 'chargement' } : null);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(1.15, 1.15, 1.15) });
    const d = dispo[i], plan = new THREE.Mesh(new THREE.PlaneGeometry(d.largeur, d.hauteurFenetre), mat);
    plan.userData.fenetre = def.id; plan.renderOrder = 6;
    const pivot = new THREE.Group(); pivot.position.set(...d.position); pivot.rotation.y = d.lacet; pivot.add(plan); groupe.add(pivot);
    // trait lumineux vers la table
    const fil = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -d.hauteurFenetre / 2, 0), new THREE.Vector3(-d.position[0] * 0.0 + 0, -d.position[1] + 0.82, 0)]), new THREE.LineBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.35 }));
    pivot.add(fil);
    return { def, plan, pivot, ctx, tex, cv, survol: false, base: d.position[1], phase: i * 1.3, reel: def.reel ? { etat: 'chargement' } : null };
  });
  const cibles = items.map(x => x.plan), rayon = new THREE.Raycaster();
  let courant = null, ouvert = null, survolId = null;
  const redessiner = it => { dessinerFenetreFlottante(it.ctx, it.def, it.survol, it.reel); it.tex.needsUpdate = true; };
  /* Données réelles d'une fenêtre (venues du Worker) : la fenêtre se redessine. */
  function majReel(id, reel) { const it = items.find(x => x.def.id === id); if (it && it.def.reel) { it.reel = reel; magasinReels.poser(id, reel); redessiner(it); } }

  function viser(ndc, camera) { rayon.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera); const h = rayon.intersectObjects(cibles, false)[0]; return h ? h.object.userData.fenetre : null; }
  function definirSurvol(id) {
    if (id === survolId) return; survolId = id;
    for (const it of items) { const s = it.def.id === id; if (s !== it.survol) { it.survol = s; redessiner(it); } }
  }
  function ouvrir(id) {
    const def = fenetre(id); if (!def) return false;
    if (ouvrirEspace) {
      ouvert = id; document.dispatchEvent(new CustomEvent('mars:fenetre', { detail: { id } }));
      const ok = ouvrirEspace({ instrument: def.instrument, unite: def.unite, dock: def.dock, focus: def.focus, onglet: def.onglet, paire: def.paire, fenetre: id });
      if (ok && typeof ok.catch === 'function') ok.catch(() => { ouvert = null; ouvrirExemple(def); });
      return true;
    }
    return ouvrirExemple(def);
  }
  function ouvrirExemple(def) {
    if (!window.Panneaux) return false;
    const id = def.id;
    window.Panneaux.ouvrir({ id: 'mars-' + id, type: 'mars-exemple', titre: def.titre + ' — EXEMPLE', icone: def.icone, taille: 'large', corps: el => construireContenu(def, el), pied: [{ texte: 'Fermer', clic: () => fermer() }], onFermer: () => { if (ouvert === id) { ouvert = null; document.dispatchEvent(new CustomEvent('mars:fenetre', { detail: { id: null } })); } } });
    ouvert = id; document.dispatchEvent(new CustomEvent('mars:fenetre', { detail: { id } })); return true;
  }
  function fermer() {
    if (!ouvert) return false; const id = ouvert; ouvert = null;
    if (fermerEspace) fermerEspace(); if (window.Panneaux) window.Panneaux.fermer('mars-' + id);
    document.dispatchEvent(new CustomEvent('mars:fenetre', { detail: { id: null } })); return true;
  }
  /* L'espace s'est fermé tout seul (croix, Échap) : on le sait. */
  function marquerOuvert(id) { ouvert = id; document.dispatchEvent(new CustomEvent('mars:fenetre', { detail: { id } })); }
  function espaceFerme() { if (ouvert) { ouvert = null; document.dispatchEvent(new CustomEvent('mars:fenetre', { detail: { id: null } })); } }
  function maj(t) {
    for (const it of items) {
      it.pivot.position.y = it.base + Math.sin(t * 0.8 + it.phase) * 0.025;
      const cible = it.survol || ouvert === it.def.id ? 1.18 : 1;
      it.pivot.scale.x += (cible - it.pivot.scale.x) * 0.15; it.pivot.scale.y = it.pivot.scale.x;
      it.plan.material.opacity = 0.93 + 0.07 * Math.sin(t * 6 + it.phase);
    }
  }
  return { groupe, items, viser, survoler: definirSurvol, ouvrir, fermer, espaceFerme, marquerOuvert, majReel, ouvert: () => ouvert, maj, ids: () => FENETRES.map(f => f.id), position: id => { const it = items.find(x => x.def.id === id); return it ? it.pivot.getWorldPosition(new THREE.Vector3()) : null; } };
}
