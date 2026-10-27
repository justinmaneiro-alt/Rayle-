import * as THREE from 'three';
import { creerIndex, distanceMm, angleDeg } from './anatomie-index.js';
import { fiche, descriptionParlee } from './anatomie-savoirs.js';
import { creerFlux } from './anatomie-flux.js';
import { creerMouvement } from './anatomie-mouvement.js';
import { creerPathologies } from './anatomie-pathologies.js';
import { TEXTE_ECHELLE, ECHELLE_MUSCULAIRE } from './anatomie-muscles.js';

/* ═════════════ ANATOMIE : VISUALISEUR SUR LA TABLE HOLOGRAPHIQUE (S2) ═════════════
   Charge les systèmes (assets-lourds/anatomie/*.glb, Meshopt, parties progressives) dans le volume holographique de la salle médicale.
   Fonctions : rotation et zoom (déjà dans la salle), plan de coupe, isolement, transparence des autres structures, sélection au clic ou à la voix,
   étiquettes latin / français, mesure de distance et d'angle, comparaison gauche / droite, fiche sur l'écran mural, description parlée par Raylé.
   Les mesures sont celles des modèles BodyParts3D (un homme adulte de référence) : indicatives, jamais cliniques. */
const ECHELLE = 0.8, CENTRE_Y = 0.9;            // corps de 1,75 m → 1,4 m dans le volume ; centre approximatif du corps à 0,9 m
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const COULEUR_SEL = new THREE.Color(0x6fe6ff), COULEUR_B = new THREE.Color(0xc9b27a);

function decouper(texte, n) { const mots = String(texte || '').split(/\s+/), l = []; let c = ''; for (const m of mots) { if ((c + ' ' + m).trim().length > n) { l.push(c); c = m; } else c = (c + ' ' + m).trim(); } if (c) l.push(c); return l; }

export async function creerAnatomie({ api, salle, renderer, ui }) {
  const base = api.modeles.urlBase();
  const rep = await fetch(base + 'anatomie/index.json'); if (!rep.ok) throw new Error('index d’anatomie introuvable (' + rep.status + ') : lancer planetes/saturne/outils/anatomie-convertir.mjs');
  let traductions = null; try { const tr = await fetch(new URL('data/anatomie_fr.json', document.baseURI).href); if (tr.ok) traductions = (await tr.json()).noms || null; } catch (e) { /* sans le fichier : nom latin ou terme anglais signalé */ }
  const index = creerIndex(await rep.json(), traductions);
  const racine = new THREE.Group(); racine.name = 'anatomie'; racine.scale.setScalar(ECHELLE); racine.position.y = -CENTRE_Y * ECHELLE; racine.userData.anat = true;
  salle.holo.add(racine); salle.silhouette.visible = false; salle.etiquette.visible = false;
  renderer.localClippingEnabled = true;
  // l'éclairage de la table est prévu pour une silhouette sombre : sur des os clairs il blanchit tout, on l'atténue tant que l'anatomie est affichée
  const lumieres = []; salle.scene.traverse(o => { if (o.isPointLight) { lumieres.push([o, o.intensity]); o.intensity *= 0.22; } });
  /* `systemes` = les systèmes que l'utilisateur a ACTIVÉS (bouton ou voix) : seul le squelette l'est par défaut. `charges` = ceux dont le modèle est en mémoire (un système chargé peut être masqué).
     `surcharge` : liste imposée pendant une pathologie ou un mouvement (restaurée ensuite). `forcees` : pièces montrées même si leur système est masqué (sélection, muscles d'un mouvement). */
  const etat = { charges: new Set(), systemes: new Set(), surcharge: null, forcees: new Map(), meshs: new Map(), selection: [], couche: 1, isole: false, opacite: 1, langue: 'fr', coupe: { axe: null, valeur: 0 }, mesure: null, orbite: 0, etiquettes: new Map(), survol: null, nonCharges: 0 };
  const ecouteurs = new Set(), imageHooks = new Set(), schemas = new Map();
  const prevenir = (type, detail) => { for (const f of ecouteurs) { try { f(type, detail); } catch (e) { /* un écouteur défaillant ne bloque pas l'anatomie */ } } };
  const plan = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const matsPartages = new Set(), raycaster = new THREE.Raycaster(), v2 = new THREE.Vector2();

  let mvt = null, pat = null;
  const flux = creerFlux({ racine, index });
  const mat = m => { if (!m.userData.propre) { m.material = m.material.clone(); m.userData.propre = true; m.material.userData.fluxSys = null; flux.brancher(m.material, m.material.name); } return m.material; };
  const toutesMat = () => { const s = new Set(matsPartages); for (const ms of etat.meshs.values()) for (const m of ms) if (m.userData.propre) s.add(m.material); return s; };
  function appliquerCoupe() {
    const c = etat.coupe; const planes = c.axe ? [plan] : [];
    if (c.axe) { const n = AXES[c.axe].clone(); const origine = racine.localToWorld(new THREE.Vector3(0, CENTRE_Y, 0)); const bornes = c.axe === 'y' ? 0.9 : 0.25; const pt = origine.clone().add(AXES[c.axe].clone().multiplyScalar(c.valeur * bornes * ECHELLE)); plan.setFromNormalAndCoplanarPoint(n.negate(), pt); }
    for (const m of toutesMat()) { m.clippingPlanes = planes; m.clipShadows = false; m.needsUpdate = true; }
  }
  /* Une pièce est visible si son système est activé (ou imposé par `surcharge`), ou si elle est sélectionnée / forcée, et si l'isolement, les couches et les masquages de pathologie le permettent. */
  const systemesVisibles = () => etat.surcharge || etat.systemes;
  const estForcee = id => { for (const s of etat.forcees.values()) if (s.has(id)) return true; return false; };
  function appliquerEtat() {
    const sel = new Set(etat.selection), sv = systemesVisibles();
    for (const [id, ms] of etat.meshs) for (const m of ms) {
      const estSel = sel.has(id);
      const p = index.parId.get(id);
      m.visible = !m.userData.cachePatho && !!p && (sv.has(p.systeme) || estSel || estForcee(id)) && !(etat.isole && sel.size && !estSel) && !(p.couche && p.couche < etat.couche && !estSel && !estForcee(id));
      if (estSel) { const t = mat(m); t.transparent = false; t.opacity = 1; t.emissive = (m.userData.couleur || COULEUR_SEL).clone(); t.emissiveIntensity = 0.5; t.depthWrite = true; }
      else if (m.userData.propre && !m.userData.role) { m.material.emissiveIntensity = 0; }
    }
    const transp = etat.opacite < 0.999 && sel.size;
    for (const mp of matsPartages) { mp.transparent = !!transp; mp.opacity = transp ? etat.opacite : 1; mp.depthWrite = !transp; mp.needsUpdate = true; }
    // pièces à matériau propre (habillées pour un mouvement, teintées…) qui ne sont pas sélectionnées : même transparence que les autres structures
    for (const [id, ms] of etat.meshs) for (const m of ms) if (m.userData.propre && !sel.has(id) && !m.userData.role) { const mt = m.material, o = transp ? etat.opacite : 1; if (mt.transparent !== !!transp || mt.opacity !== o) { mt.transparent = !!transp; mt.opacity = o; mt.depthWrite = !transp; mt.needsUpdate = true; } }
    appliquerCoupe(); majEtiquettes(); majFiche();
  }
  function etiquette(piece, hex) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const cx = cv.getContext('2d');
    const nom = etat.langue === 'la' ? (piece.nom_la || piece.nom_en) : etat.langue === 'fr+la' ? index.libelle(piece, 'fr') + ' · ' + (piece.nom_la || '') : index.libelle(piece, 'fr');
    cx.fillStyle = 'rgba(4,9,15,0.85)'; cx.fillRect(0, 0, 512, 96); cx.strokeStyle = hex || '#8fd0e3'; cx.lineWidth = 3; cx.strokeRect(2, 2, 508, 92);
    cx.fillStyle = '#e8f4fb'; cx.font = '600 28px "Cascadia Mono", Consolas, monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; let t = nom; while (cx.measureText(t).width > 480 && t.length > 8) t = t.slice(0, -2); cx.fillText(t === nom ? t : t + '…', 256, 48);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false })); sp.scale.set(0.74, 0.139, 1); sp.renderOrder = 20;
    // V2 : l'étiquette ne se pose plus SUR la pièce (elle masquait le modèle) : elle va en marge, reliée par un trait fin
    const g = new THREE.Group(); g.add(sp); g.userData.sp = sp;
    const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: new THREE.Color(hex || '#8fd0e3'), depthTest: false, transparent: true, opacity: 0.9, toneMapped: false }));
    ligne.renderOrder = 19; ligne.frustumCulled = false; g.add(ligne); g.userData.ligne = ligne; return g;
  }
  /* Place l'étiquette g en marge, du côté de la pièce (c = centre de la pièce, repère du modèle) ; rang décale les étiquettes d'une même sélection pour qu'elles ne se chevauchent pas. */
  function poserEtiquette(g, c, rang = 0) {
    const cote = c[0] >= 0 ? 1 : -1, x = cote * Math.max(Math.abs(c[0]) + 0.46, 0.8), y = c[1] + 0.05 + 0.17 * rang;
    g.position.set(x, y, c[2]);
    const pos = g.userData.ligne.geometry.attributes.position; pos.setXYZ(0, c[0] - x, c[1] - y, 0); pos.setXYZ(1, -cote * 0.37, 0, 0); pos.needsUpdate = true; g.userData.ligne.geometry.computeBoundingSphere();
  }
  const liberer = g => { if (g.parent) g.parent.remove(g); g.traverse(o => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); }); };
  /* Étiquettes : seulement pour la structure SURVOLÉE (étiquette provisoire) ou SÉLECTIONNÉE (3 au plus) ; elles disparaissent avec le survol ou la sélection. */
  function majEtiquettes() {
    for (const [id, sp] of etat.etiquettes) { liberer(sp); etat.etiquettes.delete(id); }
    etat.selection.slice(0, 3).forEach((id, rang) => { const p = index.parId.get(id), c = p && index.centre(p); if (!c) return; const sp = etiquette(p); poserEtiquette(sp, c, rang); etat.etiquettes.set(id, sp); racine.add(sp); });
    if (etat.survol && etat.selection.includes(etat.survol.id)) effacerSurvol();
  }
  function effacerSurvol() { if (!etat.survol) return; liberer(etat.survol.sp); etat.survol = null; prevenir('survol', null); }
  function poserSurvol(p) {
    if (etat.survol && etat.survol.id === p.id) return; effacerSurvol(); if (etat.selection.includes(p.id)) return;
    const c = index.centre(p); if (!c) return; const sp = etiquette(p); poserEtiquette(sp, c, 0); racine.add(sp); etat.survol = { id: p.id, sp }; prevenir('survol', p.id);
  }
  /* La fiche n'est plus dessinée sur un petit écran mural : les fenêtres holographiques (anatomie-fenetres.js) écoutent les changements de sélection. */
  function majFiche() { prevenir('selection', { ids: etat.selection.slice(), mesure: etat.mesure }); }
  function ajouterMeshs(groupe) {
    groupe.traverse(o => {
      if (!o.isMesh) return; o.userData.couleur = null; (etat.meshs.get(o.name) || etat.meshs.set(o.name, []).get(o.name)).push(o);
      const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { matsPartages.add(m); flux.brancher(m, m.name); });
    });
  }

  const api2 = {
    index, racine, etat,
    systemes: () => index.systemes().map(s => ({ id: s, chargé: etat.charges.has(s) })),
    /* Systèmes SCHÉMATIQUES (hors modèle) : fn() rend un groupe THREE dont les maillages portent l'id d'une pièce ajoutée à l'index. */
    declarerSchema(sys, fn) { schemas.set(sys, fn); },
    /* Charge le modèle d'un système (une fois) sans l'activer. */
    async chargerSysteme(sys, { surProgres = null } = {}) {
      if (!index.systemes().includes(sys) && !schemas.has(sys)) return { ok: false, erreur: 'système inconnu : ' + sys };
      if (etat.charges.has(sys)) { if (etat.chargements && etat.chargements.has(sys)) await etat.chargements.get(sys); return { ok: true, deja: true }; }
      etat.charges.add(sys); (etat.chargements = etat.chargements || new Map());
      const p = (async () => { const g = schemas.has(sys) ? await schemas.get(sys)() : await api.modeles.charger('anatomie-' + sys, { surProgres }); racine.add(g); ajouterMeshs(g); appliquerEtat(); })();
      etat.chargements.set(sys, p); try { await p; } catch (e) { etat.charges.delete(sys); throw e; } finally { etat.chargements.delete(sys); }
      return { ok: true };
    },
    /* Active un système (bouton ou demande vocale) : chargé si besoin, puis affiché. */
    async afficherSysteme(sys, { surProgres = null } = {}) {
      const r = await api2.chargerSysteme(sys, { surProgres }); if (!r.ok) return r;
      etat.systemes.add(sys); appliquerEtat(); prevenir('systemes', [...etat.systemes]); return { ok: true, deja: !!r.deja };
    },
    masquerSysteme(sys) { etat.systemes.delete(sys); appliquerEtat(); prevenir('systemes', [...etat.systemes]); },
    /* Imposer une liste de systèmes (pathologie, mouvement) ; null rend l'état choisi par l'utilisateur. Les systèmes imposés sont chargés si besoin. */
    async surcharger(liste) {
      if (!liste) { etat.surcharge = null; appliquerEtat(); prevenir('systemes', [...etat.systemes]); return; }
      for (const s of liste) await api2.chargerSysteme(s); etat.surcharge = new Set(liste); appliquerEtat(); prevenir('systemes', [...etat.surcharge]);
    },
    /* Montre des pièces précises même si leur système est masqué (source = nom de l'appelant) ; ids = null pour retirer. */
    forcer(source, ids) { if (!ids || !ids.length) etat.forcees.delete(source); else etat.forcees.set(source, new Set(ids)); appliquerEtat(); },
    /* Masquage d'une pièce par une pathologie (amputation, agénésie…) : indépendant des systèmes activés. */
    cacherPiece(id, oui) { for (const m of etat.meshs.get(id) || []) m.userData.cachePatho = !!oui; },
    effacerCachees() { for (const ms of etat.meshs.values()) for (const m of ms) m.userData.cachePatho = false; appliquerEtat(); },
    appliquer: appliquerEtat,
    abonner(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    systemesActifs: () => [...systemesVisibles()],
    /* État par défaut : seul le squelette est affiché. */
    squeletteSeul() { etat.surcharge = null; etat.systemes = new Set(['os']); api2.toutAfficher(); prevenir('systemes', ['os']); },
    async selectionner(ids, { cadrer = true } = {}) {
      const liste = (Array.isArray(ids) ? ids : [ids]).map(i => (typeof i === 'string' ? index.parId.get(i) : i)).filter(Boolean);
      for (const p of liste) if (!etat.charges.has(p.systeme)) await api2.chargerSysteme(p.systeme);       // chargée, pas activée : seule la pièce choisie apparaît
      etat.selection = liste.map(p => p.id); etat.mesure = null; effacerSurvol(); appliquerEtat();
      if (cadrer && liste.length) api2.cadrer(liste);
      return liste;
    },
    cadrer(liste) {
      const b = new THREE.Box3(); for (const p of liste) if (p.bornes) { b.expandByPoint(new THREE.Vector3(...p.bornes[0])); b.expandByPoint(new THREE.Vector3(...p.bornes[1])); }
      if (b.isEmpty()) return; const c = new THREE.Vector3(); b.getCenter(c); const s = new THREE.Vector3(); b.getSize(s);
      const monde = racine.localToWorld(c.clone()); salle.controle.cadrer(monde, Math.max(1.0, Math.min(5.8, Math.max(s.x, s.y, s.z) * ECHELLE * 2.2 + 0.7)));
    },
    /* Couches de muscles : 1 = toutes ; 2 = sans la couche superficielle ; 3 = seulement la couche profonde (couches estimées par la géométrie du modèle). */
    couches(n) { etat.couche = Math.max(1, Math.min(3, Math.round(n))); appliquerEtat(); return etat.couche; },
    echelle: () => ({ texte: TEXTE_ECHELLE, niveaux: ECHELLE_MUSCULAIRE }),
    /* Animation illustrative (artères : du cœur vers la périphérie ; veines : vers le cœur ; nerfs et encéphale : influx ; cœur : battement). */
    flux(oui) { flux.activer(oui !== false); return flux.actif(); },
    /* Teinte un mesh (rôle d'un muscle dans un mouvement : rouge agoniste, bleu antagoniste) */
    teinterMesh(m, col) { const t = mat(m); t.emissive = new THREE.Color(col[0], col[1], col[2]); t.emissiveIntensity = 0.55; },
    /* Squelette articulé et mouvements (S5), créé à la demande */
    mouvement() { if (!mvt) mvt = creerMouvement({ anat: api2 }); return mvt; },
    mouvementObjet: () => mvt,
    /* Pathologies et orthopédie (S6), créées à la demande */
    pathologies() { if (!pat) pat = creerPathologies({ anat: api2 }); return pat; },
    pathologiesObjet: () => pat,
    materielPropre: mat,
    /* Oriente la caméra : az = 0 vue de face (le modèle regarde vers +Z si rig.ant = 1), π vue de dos, ±π/2 de profil */
    orienter(az, el) { salle.controle.orienter(az, el); },
    isoler(oui) { etat.isole = !!oui; appliquerEtat(); },
    /* « Tout afficher » : lève l'isolement, la transparence, la coupe, les couches et la sélection, et rend visibles toutes les pièces des systèmes ACTIVÉS. Les systèmes que tu n'as pas demandés restent masqués. */
    toutAfficher() { etat.orbite = 0; etat.isole = false; etat.couche = 1; etat.selection = []; etat.mesure = null; etat.opacite = 1; etat.coupe = { axe: null, valeur: 0 }; effacerSurvol(); appliquerEtat(); salle.controle.recentrer(); },
    transparence(v) { etat.opacite = Math.max(0.05, Math.min(1, v)); appliquerEtat(); },
    couper(axe, valeur = 0) { etat.coupe = { axe: axe && AXES[axe] ? axe : null, valeur: Math.max(-1, Math.min(1, valeur)) }; appliquerCoupe(); },
    langue(l) { etat.langue = l === 'la' || l === 'fr+la' ? l : 'fr'; majEtiquettes(); },
    /* Mesure : 2 pièces sélectionnées = distance entre centres (mm) ; 3 pièces = angle au sommet de la deuxième (degrés). Résultat indicatif. */
    mesurer() {
      const ps = etat.selection.map(i => index.parId.get(i)).filter(Boolean), cs = ps.map(p => index.centre(p));
      if (ps.length < 2) return { ok: false, erreur: 'choisis au moins deux structures (clic en gardant Maj)' };
      let t = ps.length === 2 ? 'Distance centre à centre : ' + distanceMm(cs[0], cs[1]).toFixed(0) + ' mm' : 'Angle en ' + index.libelle(ps[1], 'fr') + ' : ' + angleDeg(cs[0], cs[1], cs[2]).toFixed(1) + '°';
      etat.mesure = t + ' (modèle, indicatif)'; majFiche(); return { ok: true, texte: etat.mesure };
    },
    /* Comparaison gauche / droite : encombrement des deux côtés (boîtes alignées sur les axes, indicatif). */
    async comparer(ref) {
      const p = typeof ref === 'string' ? (index.parId.get(ref) || index.resoudre(ref)[0]) : ref; if (!p) return { ok: false, erreur: 'structure introuvable' };
      const m = index.miroir(p.id); if (!m) return { ok: false, erreur: 'cette structure n’a pas de côté opposé' };
      await api2.selectionner([p, m]);
      for (const [q, col] of [[p, COULEUR_SEL], [m, COULEUR_B]]) (etat.meshs.get(q.id) || []).forEach(x => { x.userData.couleur = col; mat(x).emissive = col.clone(); });
      const a = index.dimensions(p), b = index.dimensions(m), g = Math.max(...a), d = Math.max(...b);
      etat.mesure = 'Plus grande dimension : ' + (g * 1000).toFixed(0) + ' mm (' + p.cote + ') et ' + (d * 1000).toFixed(0) + ' mm (' + m.cote + '), écart ' + Math.abs((g - d) * 1000).toFixed(1) + ' mm'; majFiche();
      return { ok: true, texte: etat.mesure };
    },
    /* Description parlée + caméra qui tourne doucement pendant la lecture. */
    async decrire(texte) {
      const trouvees = index.resoudre(texte); if (!trouvees.length) return { ok: false, erreur: 'je ne trouve pas « ' + texte + ' » dans le modèle' };
      await api2.selectionner(trouvees); api2.balayer(9000); prevenir('decrire', { ids: trouvees.map(p => p.id) });
      return { ok: true, texte: descriptionParlee(fiche(trouvees[0])), ids: trouvees.map(p => p.id) };
    },
    balayer(ms) { etat.orbite = ms; },
    /* Pièce sous le pointeur (visible, hors coupe) ou null. */
    sous(clientX, clientY) {
      const r = renderer.domElement.getBoundingClientRect(); v2.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(v2, salle.camera);
      const cibles = []; racine.traverse(o => { if (o.isMesh && o.visible && o.parent && !o.userData.clone2) cibles.push(o); });
      const hits = raycaster.intersectObjects(cibles, false).filter(h => !(etat.coupe.axe && plan.distanceToPoint(h.point) < 0));
      for (const h of hits) { const id = h.object.name; if (index.parId.has(id) && h.object.visible) return index.parId.get(id); }
      return null;
    },
    /* Clic : sélectionne la pièce (Maj : l'ajoute) ; un clic dans le vide désélectionne. */
    clic(clientX, clientY, additif = false) {
      const p = api2.sous(clientX, clientY);
      if (!p) { if (!additif && etat.selection.length) { etat.selection = []; etat.mesure = null; appliquerEtat(); } return null; }
      const id = p.id, sel = additif ? [...new Set([...etat.selection, id])] : [id]; etat.selection = sel; etat.mesure = null; effacerSurvol(); appliquerEtat(); prevenir('clic', { id, additif }); return p;
    },
    /* Survol : étiquette provisoire de la pièce sous le pointeur (limitée à une mesure toutes les 70 ms) ; hors de toute pièce, elle disparaît. */
    survoler(clientX, clientY) {
      const t = performance.now(); if (t - (etat.dernierSurvol || 0) < 70) return; etat.dernierSurvol = t;
      const p = api2.sous(clientX, clientY); if (p) poserSurvol(p); else effacerSurvol();
    },
    finSurvol() { effacerSurvol(); },
    /* Fonctions appelées à chaque image après la mise à jour du mouvement (vue rapprochée du mouvement, mesures de test). */
    surImage(f) { imageHooks.add(f); }, retirerImage(f) { imageHooks.delete(f); },
    maj(dt, t) {
      flux.maj(t); if (mvt) mvt.maj(dt); for (const f of imageHooks) { try { f(dt, t); } catch (e) { console.error('[anatomie] image :', e); } }
      if (etat.orbite > 0) { etat.orbite -= dt * 1000; salle.controle.glisser(-dt * 40, 0); }
      const pulse = 0.4 + 0.2 * Math.sin(t * 3); for (const id of etat.selection) (etat.meshs.get(id) || []).forEach(m => { if (m.userData.propre) m.material.emissiveIntensity = pulse; });
    },
    etatPublic: () => ({ chargés: [...etat.charges], actifs: [...systemesVisibles()], survol: etat.survol && etat.survol.id, forcees: [...etat.forcees.values()].reduce((s, x) => s + x.size, 0), selection: etat.selection.slice(), flux: flux.actif(), couche: etat.couche, isole: etat.isole, opacite: etat.opacite, coupe: { ...etat.coupe }, langue: etat.langue, mesure: etat.mesure, pieces: index.taille, meshs: etat.meshs.size, etiquettes: etat.etiquettes.size, visibles: [...etat.meshs.values()].reduce((s, ms) => s + ms.filter(m => m.visible).length, 0) }),
    dispose() { effacerSurvol(); for (const [id, sp] of etat.etiquettes) { liberer(sp); etat.etiquettes.delete(id); } ecouteurs.clear(); salle.holo.remove(racine); for (const [l, i] of lumieres) l.intensity = i; },
    ui
  };
  const m0 = salle.maj; salle.maj = (dt, t) => { m0(dt, t); api2.maj(dt, t); };
  renderer.domElement.addEventListener('pointerleave', effacerSurvol);          // le pointeur passe sur le panneau ou une fenêtre : l'étiquette provisoire disparaît
  const dispose0 = api2.dispose; api2.dispose = () => { renderer.domElement.removeEventListener('pointerleave', effacerSurvol); dispose0(); };
  return api2;
}
