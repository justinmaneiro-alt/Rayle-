import * as THREE from 'three';
import { creerAtelier } from './atelier.js';
import * as M from './maquette-calcul.js';

/* ═════════════ NEPTUNE : L'ATELIER 3D (module PC) ═════════════
   Appelé par la galaxie quand la caméra arrive sur Neptune (manifeste modules.pc.entree). `entrer(G)` : fondu, la galaxie dessine la scène de l'atelier à la place de la sienne
   (G.surcharger), la souris est déléguée ici (G.nav.deleguer) ; Échap ramène à la galaxie (événement galaxie:sortie). Interface volontairement SIMPLE : l'esthétique viendra plus tard.
   Le moteur est dans atelier.js ; les calculs purs dans maquette-calcul.js ; la voix dans voix-neptune.js. Les fichiers restent dans le navigateur (rien n'est envoyé sur Internet). */
let inst = null, enCours = null;
const attendre = ms => new Promise(r => setTimeout(r, ms));
export function entrer(G, options = {}) {
  if (!enCours) enCours = (async () => { inst = inst || await construire(G); await inst.entrer(options); })().finally(() => { enCours = null; });
  return enCours;
}
export const sortir = () => inst && inst.sortir();
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function construire(G) {
  const racine = document.getElementById('vueGalaxie'), canvas = G.canvas, renderer = G.renderer;
  if (!document.getElementById('neptune-css')) { const l = document.createElement('link'); l.id = 'neptune-css'; l.rel = 'stylesheet'; l.href = new URL('./neptune.css', import.meta.url).href; document.head.appendChild(l); }
  const ui = document.createElement('div'); ui.id = 'neptune-ui'; ui.hidden = true;
  ui.innerHTML = `
  <div class="n-titre"><b>N E P T U N E</b><span>Atelier 3D · maquettes</span></div>
  <div class="n-barre" role="toolbar" aria-label="Atelier 3D">
    <label class="n-btn">Importer<input type="file" id="n-fichiers" multiple accept=".glb,.gltf,.obj,.mtl,.stl,.fbx,.bin,.png,.jpg,.jpeg,.webp" hidden></label>
    <label class="n-btn">Dossier<input type="file" id="n-dossier" webkitdirectory multiple hidden></label>
    <button type="button" data-a="fabriquer">Fabriquer…</button>
    <button type="button" data-a="presenter" title="Visite guidée pièce par pièce, à voix haute">Présenter</button>
    <button type="button" data-a="visite" title="Parcours de caméra">Visite</button>
    <button type="button" data-a="eclater" title="Vue éclatée">Éclater</button>
    <button type="button" data-a="assembler" title="Assemblage animé">Assembler</button>
    <button type="button" data-a="coupe" title="Plan de coupe">Coupe</button>
    <button type="button" data-a="mesure" title="Mesurer : clique deux points">Mesurer</button>
    <button type="button" data-a="cadrer">Cadrer</button>
    <button type="button" data-a="aide">Aide</button>
    <button type="button" data-a="quitter">Quitter</button>
  </div>
  <aside class="n-gauche" aria-label="Pièces"><h3>Pièces <small id="n-stats"></small></h3><div class="n-arbre" id="n-arbre"></div>
    <div class="n-actions"><button data-p="isoler">Isoler</button><button data-p="tout">Tout afficher</button><button data-p="parent">Parent</button><button data-p="dupliquer">Dupliquer</button><button data-p="sym">Symétrie X</button><button data-p="supprimer">Supprimer</button></div></aside>
  <aside class="n-droite" aria-label="Propriétés">
    <details open><summary>Sélection</summary><div id="n-sel" class="n-note">Aucune pièce sélectionnée.</div>
      <div class="n-ligne"><label>Couleur <input type="color" id="n-couleur" value="#b8c2cc"></label><label>Métal <input type="range" id="n-metal" min="0" max="1" step="0.05" value="0.1"></label><label>Rugosité <input type="range" id="n-rugo" min="0" max="1" step="0.05" value="0.5"></label></div>
      <div class="n-ligne n-pave"><span>Déplacer</span><button data-d="x-">X−</button><button data-d="x+">X+</button><button data-d="y-">Y−</button><button data-d="y+">Y+</button><button data-d="z-">Z−</button><button data-d="z+">Z+</button></div>
      <div class="n-ligne n-pave"><span>Tourner 15°</span><button data-r="x">X</button><button data-r="y">Y</button><button data-r="z">Z</button><span>Échelle</span><button data-e="0.9">÷1,1</button><button data-e="1.1">×1,1</button></div></details>
    <details open><summary>Affichage</summary><div class="n-ligne"><label>Fond <select id="n-fond"><option value="sombre">Sombre</option><option value="noir">Noir</option><option value="gris">Gris</option><option value="clair">Clair</option></select></label>
      <label>Éclairage <select id="n-hdri"><option value="studio">Studio</option><option value="aucun">Aucun (lumières seules)</option></select></label><label class="n-btn">HDRI…<input type="file" id="n-hdr" accept=".hdr" hidden></label></div>
      <div class="n-ligne"><label><input type="checkbox" id="n-ombres" checked> Ombres</label><label><input type="checkbox" id="n-grille" checked> Grille</label><label><input type="checkbox" id="n-tour"> Rotation lente</label><label>Exposition <input type="range" id="n-expo" min="0.3" max="2.5" step="0.1" value="1"></label></div>
      <div class="n-ligne"><label>Éclaté <input type="range" id="n-eclate" min="0" max="2" step="0.05" value="0"></label></div>
      <div class="n-ligne" id="n-coupe-ligne" hidden><label>Axe <select id="n-coupe-axe"><option value="1">Y (haut)</option><option value="0">X</option><option value="2">Z</option></select></label><label>Position <input type="range" id="n-coupe-pos" min="0" max="1" step="0.01" value="0.5"></label><label><input type="checkbox" id="n-coupe-inv"> Inverser</label></div></details>
    <details><summary>Mesures et scans</summary><div id="n-mesure" class="n-note">Mode Mesurer : clique deux points sur le modèle.</div>
      <div class="n-ligne"><label>Unité du fichier <select id="n-unite"><option value="m">mètre</option><option value="cm">centimètre</option><option value="mm">millimètre</option></select></label></div>
      <div class="n-ligne"><label>Axe <select id="n-circ-axe"><option value="1">Y (haut)</option><option value="0">X</option><option value="2">Z</option></select></label><label>Hauteur <input type="range" id="n-circ-h" min="0" max="1" step="0.01" value="0.5"></label><button data-a="circ">Circonférence</button></div><div id="n-circ" class="n-note"></div></details>
    <details><summary>Animation</summary><div id="n-clips" class="n-note">Aucune animation dans le modèle.</div>
      <div class="n-ligne"><label>Instant (s) <input type="number" id="n-tcle" min="0" step="0.5" value="0" style="width:5em"></label><button data-c="position">Clé position</button><button data-c="rotation">Clé rotation</button><button data-c="echelle">Clé échelle</button></div>
      <div class="n-ligne"><button data-a="lire-cles">Lire les clés</button><button data-a="effacer-cles">Effacer</button></div><div id="n-pistes" class="n-note"></div></details>
    <details><summary>Fichier, impression 3D</summary>
      <div class="n-ligne"><button data-x="glb">Exporter GLB</button><button data-x="stl">Exporter STL</button><button data-x="obj">Exporter OBJ</button><label>STL en <select id="n-stl-u"><option value="1000">mm (×1000 depuis m)</option><option value="10">mm (×10 depuis cm)</option><option value="1">tel quel</option></select></label></div>
      <div class="n-ligne"><button data-a="impression">Contrôle d’impression</button></div><div id="n-imp" class="n-note"></div></details>
    <details><summary>Modèles libres et attribution</summary><div id="n-sources" class="n-note"></div>
      <div class="n-note">Fiche du dernier modèle importé (gardée dans le GLB exporté) :</div>
      <div class="n-ligne"><input id="n-at-titre" placeholder="Titre"><input id="n-at-auteur" placeholder="Auteur"><input id="n-at-licence" placeholder="Licence (CC0, CC-BY…)"><input id="n-at-url" placeholder="Adresse d’origine"><button data-a="attribuer">Enregistrer</button></div><div id="n-at-etat" class="n-note"></div></details>
  </aside>
  <div class="n-glisser" id="n-glisser" hidden>Dépose ici un modèle (GLB, glTF, OBJ, STL, FBX)</div>
  <div class="n-etat" id="n-etat"></div><div class="n-message" id="n-message" hidden></div><div class="n-mesure-etiquette" id="n-etiquette" hidden></div><div class="n-fondu" id="n-fondu"></div>
  <div class="n-modale" id="n-modale" hidden></div>`;
  racine.appendChild(ui);
  const $ = id => ui.querySelector('#' + id), fonduEl = $('n-fondu'), messageEl = $('n-message'), etatEl = $('n-etat'), etiquetteEl = $('n-etiquette'), modale = $('n-modale');
  let minuteurMessage = 0;
  const dire = (txt, ms = 4500) => { messageEl.textContent = txt; messageEl.hidden = !txt; clearTimeout(minuteurMessage); if (txt && ms) minuteurMessage = setTimeout(() => { messageEl.hidden = true; }, ms); };
  const fondu = async (noir, ms = 420) => { fonduEl.style.transitionDuration = ms + 'ms'; fonduEl.classList.toggle('noir', noir); await attendre(ms + 30); };

  let atelier = null, actif = false, transition = false, geste = null, dernierImport = null, retirerPad = null;
  const canvasEl = canvas;
  const selId = () => atelier && atelier.etat.selection;
  function ecran() { const r = canvasEl.getBoundingClientRect(); return { l: Math.max(1, r.width), h: Math.max(1, r.height) }; }

  // ── rendu de l'arbre ──
  function dessinerArbre() {
    if (!atelier) return;
    const sel = selId(), lignes = [];
    const rec = (n, niv) => {
      lignes.push(`<div class="n-noeud${n.id === sel ? ' sel' : ''}" data-id="${n.id}" style="padding-left:${niv * 14 + 4}px"><button class="n-oeil" data-oeil="${n.id}" aria-label="Afficher ou masquer" title="Afficher / masquer">${n.visible ? '◉' : '○'}</button><span class="n-nom" data-nom="${n.id}">${esc(n.nom)}</span><small>${n.type === 'maillage' ? n.sommets + ' s.' : n.enfants.length + ''}</small></div>`);
      if (niv < 12) n.enfants.forEach(e => rec(e, niv + 1));
    };
    atelier.modele.children.forEach(c => { if (!c.userData.__aide) rec(atelier.arbre(c), 0); });
    $('n-arbre').innerHTML = lignes.length ? lignes.join('') : '<div class="n-note">Vide. Importe un fichier, dépose-le ici, ou dis « Raylé, fabrique un engrenage de 24 dents ».</div>';
    const s = atelier.stats(); $('n-stats').textContent = s.meshes ? '· ' + s.pieces + ' pièces · ' + s.sommets.toLocaleString('fr-FR') + ' sommets' : '';
    const clips = atelier.listeClips(); $('n-clips').innerHTML = clips.length ? clips.map(c => `<div class="n-ligne"><span>${esc(c.nom)} · ${c.duree.toFixed(1)} s</span><button data-clip="${c.i}">${c.joue ? 'Stop' : 'Lire'}</button></div>`).join('') : 'Aucune animation dans le modèle.';
    const p = atelier.etatPistes(); $('n-pistes').textContent = p.pistes.length ? p.pistes.map(x => x.nom + ' · ' + x.propriete + ' · ' + x.cles + ' clé(s)').join(' — ') + ' (durée ' + p.duree.toFixed(1) + ' s)' : '';
    const att = atelier.fichesAttribution(); $('n-at-etat').textContent = att.length ? att.map(a => a.modele + ' : ' + (a.texte || '')).join(' | ') : '';
    $('n-sources').innerHTML = M.SOURCES_MODELES.map(s2 => `<div><a href="${s2.url}" target="_blank" rel="noopener">${esc(s2.nom)}</a> — ${esc(s2.licences)}. ${esc(s2.note)}</div>`).join('') + '<div>Garde toujours l’attribution (fiche ci-dessous) : elle voyage dans le GLB exporté.</div>';
  }
  function majSelection(info) {
    const o = info && atelier.parId(info.id);
    $('n-sel').textContent = o ? (o.name + ' — ' + (o.isMesh ? 'maillage de ' + o.geometry.attributes.position.count + ' sommets' : 'groupe de ' + o.children.length + ' éléments')) : 'Aucune pièce sélectionnée.';
    if (o) { const m = (() => { let r = null; o.traverse(x => { if (!r && x.isMesh) r = Array.isArray(x.material) ? x.material[0] : x.material; }); return r; })(); if (m && m.color) $('n-couleur').value = '#' + m.color.getHexString(); if (m && 'metalness' in m) { $('n-metal').value = m.metalness; $('n-rugo').value = m.roughness; } }
    dessinerArbre();
  }

  // ── gestes de souris sur la scène (délégués par la galaxie) ──
  const handlers = {
    pointerdown(e) { if (transition) return; canvasEl.setPointerCapture(e.pointerId); geste = { x: e.clientX, y: e.clientY, bouge: 0, bouton: e.button, shift: e.shiftKey }; },
    pointermove(e) { if (!geste) return; const dx = e.clientX - geste.x, dy = e.clientY - geste.y; geste.x = e.clientX; geste.y = e.clientY; geste.bouge += Math.abs(dx) + Math.abs(dy); if (geste.bouton === 2 || geste.bouton === 1 || geste.shift) atelier.souris.deplacer(dx, dy); else atelier.souris.tourner(dx, dy); },
    pointerup(e) { try { canvasEl.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ } const g = geste; geste = null; if (!g || transition) return; if (g.bouge < 6 && g.bouton === 0) atelier.clic(e.clientX, e.clientY, { parent: e.altKey }); },
    pointercancel() { geste = null; },
    wheel(e) { if (transition) return; atelier.souris.zoom(e.deltaY * (e.deltaMode === 1 ? 33 : 1)); },
    dblclick() { /* évite que la galaxie vole vers un astre */ }
  };
  function placerEtiquette() {
    const m = atelier.derniereMesure(), p = m && atelier.milieuMesure(); if (!m || !p || !p.devant) { if (!etiquetteEl.hidden) etiquetteEl.hidden = true; return; }
    const r = canvasEl.getBoundingClientRect(); etiquetteEl.hidden = false; etiquetteEl.textContent = m.texte; etiquetteEl.style.left = (r.left + p.x * r.width) + 'px'; etiquetteEl.style.top = (r.top + p.y * r.height) + 'px';
  }
  const gererMenu = e => { if (actif) e.preventDefault(); };

  // ── construction de l'atelier (à l'entrée) ──
  function creer() {
    atelier = creerAtelier({ renderer, canvas });
    atelier.sur('modele', dessinerArbre); atelier.sur('selection', majSelection); atelier.sur('pistes', dessinerArbre);
    atelier.sur('mesure', m => { const el = $('n-mesure'); el.textContent = m ? 'Distance : ' + m.texte + ' (Δx ' + +m.dx.toPrecision(3) + ', Δy ' + +m.dy.toPrecision(3) + ', Δz ' + +m.dz.toPrecision(3) + ') — dans l’unité du fichier choisie ci-contre.' : 'Mode Mesurer : clique deux points sur le modèle.'; if (!m) etiquetteEl.hidden = true; });
    atelier.sur('visite', note => dire(note, 3500));
    atelier.sur('etat', () => { ui.querySelectorAll('[data-a="coupe"]').forEach(b => b.classList.toggle('actif', atelier.etat.coupe.actif)); ui.querySelectorAll('[data-a="mesure"]').forEach(b => b.classList.toggle('actif', atelier.etat.mesure)); etatEl.textContent = atelier.etat.visite ? 'Visite en cours : ' + atelier.etat.visite.genre + ' (bouge la souris pour reprendre la main)' : ''; });
    const { l, h } = ecran(); atelier.dimensionner(l, h);
  }
  async function importerFichiers(liste, extra = {}) {
    if (!liste.length) return;
    try { dire('Chargement de ' + liste[0].name + '…', 0); const r = await atelier.importer(liste, extra); dernierImport = r; if (extra.garder !== false) import('./bibliotheque.js').then(B => B.enregistrer(r.nom, liste)).catch(() => {}); dire(r.nom + ' : ' + r.meshes + ' maillages, ' + r.sommets.toLocaleString('fr-FR') + ' sommets' + (r.clips ? ', ' + r.clips + ' animation(s)' : '') + '.', 5000); return r; }
    catch (e) { dire('Import impossible : ' + (e && e.message || e), 9000); }
  }
  function ouvrirModale(titre, html, surFermer) { modale.hidden = false; modale.innerHTML = `<div class="n-boite" role="dialog" aria-label="${esc(titre)}"><h3>${esc(titre)}</h3>${html}<div class="n-ligne"><button data-m="fermer">Fermer</button></div></div>`; modale.querySelector('[data-m="fermer"]').addEventListener('click', () => { modale.hidden = true; if (surFermer) surFermer(); }); }
  const fermerModale = () => { modale.hidden = true; };

  // ── commandes de l'interface ──
  ui.addEventListener('click', async e => {
    const b = e.target.closest('button, .n-nom'); if (!b || !atelier) return;
    if (b.dataset.oeil) { const o = atelier.parId(b.dataset.oeil); atelier.afficher(b.dataset.oeil, o ? !o.visible : true); return; }
    if (b.dataset.nom) { atelier.selectionner(b.dataset.nom); return; }
    if (b.dataset.clip !== undefined) { const c = atelier.listeClips()[+b.dataset.clip]; atelier.lireClip(+b.dataset.clip, !(c && c.joue)); dessinerArbre(); return; }
    if (b.dataset.p) {
      const id = selId();
      if (b.dataset.p === 'tout') { atelier.toutAfficher(); return; }
      if (!id) { dire('Sélectionne d’abord une pièce (clic sur le modèle ou dans la liste).'); return; }
      if (b.dataset.p === 'isoler') atelier.isoler(id); else if (b.dataset.p === 'supprimer') atelier.supprimer(id); else if (b.dataset.p === 'dupliquer') { const n = atelier.dupliquer(id); if (n) atelier.selectionner(n); }
      else if (b.dataset.p === 'sym') { const n = atelier.symetrie(id, 0); if (n) atelier.selectionner(n); }
      else if (b.dataset.p === 'parent') { const o = atelier.parId(id); if (o && o.parent && o.parent !== atelier.modele) atelier.selectionner(o.parent.uuid); }
      return;
    }
    if (b.dataset.d) { const id = selId(); if (!id) return dire('Sélectionne une pièce.'); const k = atelier.camera.position.distanceTo(atelier.parId(id).getWorldPosition(new THREE.Vector3())) * 0.05, v = [0, 0, 0], ax = 'xyz'.indexOf(b.dataset.d[0]); v[ax] = b.dataset.d[1] === '+' ? k : -k; atelier.deplacer(id, v); return; }
    if (b.dataset.r) { const id = selId(); if (!id) return dire('Sélectionne une pièce.'); const v = [0, 0, 0]; v['xyz'.indexOf(b.dataset.r)] = 15; atelier.tourner(id, v); return; }
    if (b.dataset.e) { const id = selId(); if (!id) return dire('Sélectionne une pièce.'); atelier.echelle(id, +b.dataset.e); return; }
    if (b.dataset.c) { const id = selId(); if (!id) return dire('Sélectionne une pièce pour poser une clé.'); atelier.poserCle(id, b.dataset.c, Math.max(0, +$('n-tcle').value || 0)); return; }
    if (b.dataset.x) { const f = b.dataset.x; try { const r = await atelier.exporter(f, { echelleSTL: +$('n-stl-u').value || 1 }); dire('Exporté : ' + r.fichier + ' (' + Math.round(r.octets / 1024) + ' Ko).', 5000); } catch (err) { dire('Export impossible : ' + (err && err.message || err), 7000); } return; }
    const a = b.dataset.a; if (!a) return;
    if (a === 'quitter') api.sortir(); else if (a === 'cadrer') atelier.cadrer();
    else if (a === 'mesure') { atelier.regler({ mesure: !atelier.etat.mesure }); if (!atelier.etat.mesure) atelier.effacerMesure(); dire(atelier.etat.mesure ? 'Mesure : clique deux points sur le modèle.' : 'Mesure terminée.'); }
    else if (a === 'coupe') { const c = atelier.etat.coupe; atelier.regler({ coupe: { ...c, actif: !c.actif } }); $('n-coupe-ligne').hidden = !atelier.etat.coupe.actif; }
    else if (a === 'eclater') { const v = atelier.etat.eclate > 0 ? 0 : 1; const r = atelier.eclater(v); if (!r.ok) dire(r.raison); else $('n-eclate').value = v; }
    else if (a === 'assembler') { const sens = atelier.etat.eclate > 0 ? 'assembler' : 'desassembler'; const r = atelier.animerAssemblage(sens, 3); if (!r.ok) dire(r.raison); else dire(sens === 'assembler' ? 'Assemblage…' : 'Désassemblage…', 3000); }
    else if (a === 'visite') { if (atelier.etat.visite) atelier.arreterVisite(); else { const r = atelier.lancerVisite(); dire(r.ok ? 'Visite « ' + r.genre + ' » : ' + Math.round(r.duree) + ' s.' : r.raison); } }
    else if (a === 'presenter') api.presenter();
    else if (a === 'fabriquer') ouvrirFabrication();
    else if (a === 'aide') ouvrirAide();
    else if (a === 'circ') { const r = atelier.circonference(selId(), +$('n-circ-axe').value, +$('n-circ-h').value); $('n-circ').textContent = r.ok ? 'Contour à cette hauteur : ' + +r.circonference.toPrecision(5) + ' ' + r.unite + ' · aire ' + +r.aire.toPrecision(4) + ' ' + r.unite + '² · ' + r.boucles + ' boucle(s)' + (r.fermee ? '' : ' (contour non fermé)') + '. ' + r.note : r.raison; }
    else if (a === 'impression') { const r = atelier.controleImpression(selId()); $('n-imp').innerHTML = !r.ok ? esc(r.raison) : '<b>' + (r.imprimable ? 'Aucun défaut géométrique détecté.' : 'Problèmes :') + '</b><ul>' + r.problemes.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>Volume ' + +r.volume.toPrecision(5) + ' (unités du fichier³) · surface ' + +r.surface.toPrecision(5) + ' · ' + r.triangles + ' triangles.<br>' + r.hypotheses.map(h => `Si le fichier est en <b>${h.unite}</b> : ${+h.plusGrandeDimension_mm.toPrecision(4)} mm de long, ${+h.volume_cm3.toPrecision(4)} cm³${h.plausible ? '' : ' (peu plausible)'}`).join('<br>') + '<br><i>' + esc(r.note) + '</i>'; }
    else if (a === 'lire-cles') { const r = atelier.lirePistes(); dire(r.ok ? 'Lecture des images clés : ' + r.duree.toFixed(1) + ' s.' : r.raison); }
    else if (a === 'effacer-cles') atelier.effacerPistes();
    else if (a === 'attribuer') {
      const f = M.attribution({ titre: $('n-at-titre').value, auteur: $('n-at-auteur').value, licence: $('n-at-licence').value, url: $('n-at-url').value });
      const cible = dernierImport && dernierImport.groupe; if (!cible) return dire('Importe d’abord un modèle.');
      if (!f.ok) { $('n-at-etat').textContent = 'Fiche incomplète : il manque ' + f.manque.join(', ') + '. Licences acceptées : ' + Object.keys(M.LICENCES_LIBRES).join(', ') + '.'; return; }
      cible.userData.attribution = { titre: $('n-at-titre').value, auteur: $('n-at-auteur').value, licence: f.licenceCode, url: $('n-at-url').value, texte: f.texte }; dessinerArbre();
    }
  });
  ui.addEventListener('dblclick', e => { const n = e.target.closest('.n-nom'); if (!n || !atelier) return; const nv = window.prompt('Nouveau nom de la pièce :', n.textContent); if (nv) atelier.renommer(n.dataset.nom, nv); });
  ui.addEventListener('change', async e => {
    const t = e.target; if (!atelier) return;
    if (t.id === 'n-fichiers') { const f = [...t.files]; t.value = ''; await importerFichiers(f, { unite: atelier.etat.unite }); }
    else if (t.id === 'n-dossier') { const f = [...t.files].filter(x => atelier.formatsPris.includes((/\.([a-z0-9]+)$/i.exec(x.name) || [])[1]?.toLowerCase())); const toutes = [...t.files]; t.value = ''; if (!f.length) return dire('Aucun modèle (GLB, glTF, OBJ, STL, FBX) dans ce dossier.'); if (f.length === 1) { await importerFichiers(toutes, {}); return; } ouvrirModale('Modèles du dossier', f.map((x, i) => `<div class="n-ligne"><button data-ouvrir="${i}">${esc(x.webkitRelativePath || x.name)}</button></div>`).join(''), null); modale.querySelectorAll('[data-ouvrir]').forEach(bt => bt.addEventListener('click', async () => { fermerModale(); await importerFichiers([f[+bt.dataset.ouvrir], ...toutes.filter(x => x !== f[+bt.dataset.ouvrir] && !atelier.formatsPris.includes((/\.([a-z0-9]+)$/i.exec(x.name) || [])[1]?.toLowerCase()))], {}); })); }
    else if (t.id === 'n-hdr') { const f = t.files[0]; t.value = ''; if (f) try { await atelier.chargerHDRI(f); dire('Éclairage HDRI chargé.'); } catch (err) { dire('HDRI illisible : ' + (err && err.message || err)); } }
    else if (t.id === 'n-fond') atelier.regler({ fond: t.value }); else if (t.id === 'n-hdri') atelier.regler({ hdri: t.value }); else if (t.id === 'n-ombres') atelier.regler({ ombres: t.checked }); else if (t.id === 'n-grille') atelier.regler({ grille: t.checked }); else if (t.id === 'n-tour') atelier.regler({ tourAuto: t.checked });
    else if (t.id === 'n-unite') atelier.regler({ unite: t.value });
    else if (t.id === 'n-coupe-axe') atelier.regler({ coupe: { ...atelier.etat.coupe, axe: +t.value } }); else if (t.id === 'n-coupe-inv') atelier.regler({ coupe: { ...atelier.etat.coupe, inverse: t.checked } });
  });
  ui.addEventListener('input', e => {
    const t = e.target; if (!atelier) return;
    if (t.id === 'n-expo') atelier.regler({ exposition: +t.value });
    else if (t.id === 'n-eclate') { const r = atelier.eclater(+t.value); if (!r.ok) dire(r.raison); }
    else if (t.id === 'n-coupe-pos') atelier.regler({ coupe: { ...atelier.etat.coupe, position: +t.value } });
    else if (t.id === 'n-couleur') { const id = selId(); if (id) atelier.couleur(id, t.value); }
    else if (t.id === 'n-metal' || t.id === 'n-rugo') { const id = selId(); if (id) atelier.materiau(id, { metal: +$('n-metal').value, rugosite: +$('n-rugo').value }); }
  });
  // glisser-déposer
  const surDepot = e => { if (!actif || !e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); $('n-glisser').hidden = e.type === 'drop' || e.type === 'dragleave'; };
  ['dragenter', 'dragover', 'dragleave'].forEach(n => ui.addEventListener(n, surDepot));
  ui.addEventListener('drop', async e => { surDepot(e); if (!actif || !e.dataTransfer || !e.dataTransfer.files.length) return; await importerFichiers([...e.dataTransfer.files], { unite: atelier.etat.unite }); });
  window.addEventListener('keydown', e => {
    if (!actif || transition || e.target.matches('input, textarea, select') || modale.hidden === false && e.key !== 'Escape') { if (actif && e.key === 'Escape' && !modale.hidden) fermerModale(); return; }
    if (e.key === 'Delete' && selId()) { atelier.supprimer(selId()); e.stopPropagation(); } else if (e.key === 'f' || e.key === 'F') atelier.cadrer(selId() ? atelier.parId(selId()) : atelier.modele); else if (e.key === 'm' || e.key === 'M') ui.querySelector('[data-a="mesure"]').click(); else if (e.key === 'h' || e.key === 'H') { if (selId()) atelier.isoler(selId()); else atelier.toutAfficher(); e.stopPropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener('galaxie:sortie', () => { if (actif) api.sortir(); });
  window.addEventListener('resize', () => { if (actif && atelier) { const { l, h } = ecran(); atelier.dimensionner(l, h); } });

  function ouvrirFabrication() {
    ouvrirModale('Fabriquer une forme paramétrique', `<p class="n-note">Décris l’objet : engrenage, coque ou voilier, mât, boîtier, cylindre, tube, sphère, cône, tore, casque, plastron, brassard, armure simple. Ce sont des <b>formes simples</b> : aucune génération photoréaliste n’est fiable sans service payant. Pour du détail, importe un modèle libre de droits.</p>
      <textarea id="n-desc" rows="3" placeholder="un engrenage de 24 dents, module 2 mm, épaisseur 8 mm"></textarea><div class="n-ligne"><button data-m="fab">Fabriquer</button></div><div id="n-fab-msg" class="n-note"></div>`);
    modale.querySelector('[data-m="fab"]').addEventListener('click', () => { const r = api.fabriquer(modale.querySelector('#n-desc').value); modale.querySelector('#n-fab-msg').textContent = r.message + (r.notes ? ' ' + r.notes.join(' ') : ''); if (r.ok) setTimeout(fermerModale, 1400); });
  }
  function ouvrirAide() {
    ouvrirModale('Atelier 3D : mode d’emploi', `<ul class="n-aide"><li><b>Importer</b> : bouton, dossier ou glisser-déposer (GLB, glTF avec ses .bin et textures, OBJ + MTL, STL, FBX). Draco et Meshopt sont pris en charge.</li>
      <li><b>Souris</b> : gauche = tourner, droit / molette enfoncée / Maj = déplacer, molette = zoom. Clic = sélectionner (Alt = le parent). F = cadrer, H = isoler / tout afficher, M = mesurer, Suppr = supprimer.</li>
      <li><b>Présenter</b> : Raylé isole chaque pièce et dit ce qu’elle sait vraiment (nom, définition vérifiée, taille). Elle ne t’invente rien sur une pièce inconnue.</li>
      <li><b>Voix</b> : « présente pièce par pièce », « isole le piston », « éclate la vue », « rassemble », « fais la visite », « coupe en deux », « mesure », « fabrique un engrenage de 24 dents », « exporte en STL », « contrôle l’impression ».</li>
      <li><b>Impression 3D</b> : contrôle d’étanchéité, volume, hypothèses d’échelle (mm, cm, m), export STL dans l’échelle voulue. Pas de pilotage d’imprimante.</li>
      <li><b>Scans de membres (STL/OBJ)</b> : visualisation, mesures de distance, circonférence et aire d’une coupe à une hauteur donnée. Outil de visualisation, pas une mesure clinique validée.</li>
      <li><b>Modèles libres</b> : Poly Pizza, NASA 3D, Smithsonian, Sketchfab (CC), Kenney : télécharge le fichier puis importe-le et remplis la fiche d’attribution.</li></ul>`);
  }

  // ── pad 3D (tablette) : l'atelier est un objet 3D manipulable ──
  function brancherPad() {
    if (!window.Objets3DPad) return;
    retirerPad = window.Objets3DPad.enregistrer('neptune-atelier', { nom: 'Atelier 3D', canvas: canvasEl, actif: () => actif, tourner: (dx, dy) => atelier && atelier.souris.tourner(dx, dy), pan: (dx, dy) => atelier && atelier.souris.deplacer(dx, dy), zoom: d => atelier && atelier.souris.zoom(d) });
  }

  // ── API ──
  const api = {
    async entrer({ rapide = false } = {}) {
      if (actif) return; actif = true; transition = true;
      await fondu(true, rapide ? 140 : 380);
      if (!atelier) creer(); await atelier.pret;
      G.nav.selectionner(null); G.nav.deleguer(handlers); G.surcharger({ scene: atelier.scene, camera: atelier.camera, maj: dt => { atelier.maj(dt); placerEtiquette(); } });
      canvasEl.addEventListener('contextmenu', gererMenu); racine.classList.add('neptune-actif'); ui.hidden = false; dessinerArbre(); brancherPad();
      window.dispatchEvent(new CustomEvent('neptune:entree', {}));
      await attendre(rapide ? 40 : 120); await fondu(false, rapide ? 300 : 600); transition = false;
      dire('Atelier 3D : importe un fichier ou dis « fabrique un engrenage ». Aide : bouton Aide.', 6000);
    },
    async sortir() {
      if (!actif) return; transition = true; await fondu(true, 380);
      if (atelier) atelier.arreterPresentation();
      G.surcharger(null); G.nav.deleguer(null); canvasEl.removeEventListener('contextmenu', gererMenu); if (retirerPad) { retirerPad(); retirerPad = null; }
      fermerModale(); actif = false; racine.classList.remove('neptune-actif'); ui.hidden = true;
      window.dispatchEvent(new CustomEvent('neptune:sortie', {}));
      await attendre(120); await fondu(false, 500); transition = false;
    },
    etat: () => ({ actif, transition, ...(atelier ? { pieces: atelier.stats().pieces, meshes: atelier.stats().meshes, selection: selId(), visite: !!atelier.etat.visite } : {}) }),
    atelier: () => atelier,
    dire,
    async importer(fichiers, o) { return importerFichiers([...fichiers], o); },
    fabriquer(description) { if (!atelier) return { ok: false, message: 'L’atelier n’est pas ouvert.' }; const r = atelier.fabriquer(description); if (r.ok) dire(r.message, 5000); else dire(r.message, 7000); return r; },
    /* Présentation à voix haute : `parler` est la fonction de lecture de la page (speak) ; sans elle, les phrases s'affichent seulement. */
    async presenter({ sansIntro = false, attendreParole = false } = {}) {
      if (!atelier || !actif) return { ok: false, raison: 'L’atelier n’est pas ouvert.' };
      const parler = window.speak, ajout = window.addLine;
      const finParole = async () => { for (let i = 0; i < 150 && typeof speaking !== 'undefined' && speaking; i++) await attendre(100); };   // `speaking` : variable de la page (voix.js)
      if (attendreParole) await finParole();
      const dit = async t => { dire(t, 0); if (ajout) try { ajout('ray', t); } catch (e) { /* journal indisponible */ } if (typeof parler === 'function') { try { await Promise.race([parler(t), attendre(8000 + t.length * 110)]); } catch (e) { await attendre(Math.min(6000, 600 + t.length * 45)); } } else await attendre(Math.min(5000, 600 + t.length * 38)); };
      const r = await atelier.presenter({ dire: dit, unite: atelier.etat.unite, sansIntro }); dire('', 0); return r;
    },
    arreterPresentation() { if (atelier) atelier.arreterPresentation(); }
  };
  window.Neptune = api;
  return api;
}
