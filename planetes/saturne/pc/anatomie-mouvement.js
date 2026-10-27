import * as THREE from 'three';
import { construireRig } from './anatomie-mouvement-calcul.js';
import { MOUVEMENTS_V2, trouverMouvementV2, explicationParleeV2 } from './anatomie-mouvements-catalogue.js';
import { construireCorps, SEGMENTS } from './anatomie-corps.js';
import { creerCinematique, contexteMouvement } from './anatomie-cinematique.js';
import { melangerRigide, identite, lisse, point } from './anatomie-mat4.js';
import { creerPeau } from './anatomie-peau.js';
import { cleMuscle } from './anatomie-muscles.js';

/* ═════════════ ANATOMIE : MOUVEMENTS DU CORPS ARTICULÉ (Phase C) ═════════════
   Moteur de lecture au-dessus du moteur de cinématique (anatomie-cinematique.js) et de l'habillage GPU (anatomie-peau.js) :
   - les OS suivent leur segment (matrice par pièce) ; muscles, ligaments, vaisseaux, nerfs et organes sont HABILLÉS (poids de proximité aux os, déformation dans le nuanceur) : aucun muscle ne flotte ;
   - la lecture est réglable : vitesse (ralenti), pause, image par image, curseur de phase, sens inverse ; entrée douce depuis la pose de repos ;
   - muscles agonistes en rouge, antagonistes en bleu, stabilisateurs en gris ; seule la couche « os » reste affichée avec les muscles du mouvement (les autres couches reviennent à l'arrêt).
   Mouvement SIMPLIFIÉ et pédagogique : pas de peau, pas de roulement-glissement, mains et pieds d'un seul bloc ; amplitudes de référence classiques, à vérifier avec le cours / un atlas. */
const M4 = THREE.Matrix4;
const COULEURS = { agoniste: [1.0, 0.25, 0.15], antagoniste: [0.2, 0.45, 1.0], stabilisateur: [0.6, 0.65, 0.72] };
export const DUREE_ENTREE = 0.7;

export function creerMouvement({ anat }) {
  const index = anat.index, rig = construireRig(index);
  const peau = creerPeau({ anat });
  const etat = { actif: null, t: 0, vitesse: 1, boucle: true, sens: 1, pause: false, roles: null, vus: new WeakSet(), entree: 1, dernier: null, ecouteurs: new Set(), phases: 0, balayage: 0 };
  let corps = null, cine = null, ctx = null;
  const mat = new M4();

  /* le corps articulé : centre des têtes fémorale et humérale ajusté sur les sommets des os (os chargés) ; pivots calibrés (anatomie-pivots.js) */
  function init() {
    if (corps) return;
    const pointsOs = id => { const ms = anat.etat.meshs.get(id); return ms && ms.length ? peau.decoder(ms[0], false).P : null; };
    corps = construireCorps(index, { pointsOs }); cine = creerCinematique(corps); ctx = contexteMouvement(corps);
    peau.preparerOs(corps);
  }
  function enregistrer() {            // pièces nouvellement chargées : matrice de repos, segment
    for (const [id, ms] of anat.etat.meshs) for (const m of ms) {
      if (etat.vus.has(m)) continue; etat.vus.add(m); const p = index.parId.get(id);
      m.userData.m0 = m.userData.m0 || m.matrix.clone(); m.userData.segV2 = corps.segmentOs[id] || null; m.userData.segRigide = rig.segmentDe[id] || 'tronc'; m.userData.os = p.systeme === 'os';
    }
  }
  /* habillage progressif : pièces visibles non osseuses, celles du mouvement d'abord */
  function planifier() {
    for (const [id, ms] of anat.etat.meshs) for (const m of ms) {
      if (m.userData.os || m.userData.peau || !m.userData.m0) continue; if (!m.visible) continue;
      const p = index.parId.get(id); peau.planifier(m, p, !!m.userData.role);
    }
  }
  const versM4 = a => mat.fromArray(a);
  function appliquer(T) {
    peau.majOs(T);
    for (const [, ms] of anat.etat.meshs) for (const m of ms) {
      if (!m.userData.m0) continue; m.matrixAutoUpdate = false; m.frustumCulled = false;
      if (m.userData.peau) continue;
      const seg = m.userData.segV2 || m.userData.segRigide; const a = T[seg]; if (!a) continue;
      m.matrix.copy(versM4(a)).multiply(m.userData.m0); m.matrixWorldNeedsUpdate = true;
    }
    peau.majVolumes(T);
  }
  function reinitialiser() {
    peau.reinitialiser();
    for (const ms of anat.etat.meshs.values()) for (const m of ms) if (m.userData.m0) { m.matrix.copy(m.userData.m0); m.matrixWorldNeedsUpdate = true; if (!m.userData.peau) m.frustumCulled = true; }
  }
  function teinter(roles) {
    for (const ms of anat.etat.meshs.values()) for (const m of ms) if (m.userData.role) { m.userData.role = null; if (m.userData.propre) m.material.emissiveIntensity = 0; }
    if (!roles) return;
    for (const [liste, col] of [[roles.stabilisateurs, COULEURS.stabilisateur], [roles.antagonistes, COULEURS.antagoniste], [roles.agonistes, COULEURS.agoniste]]) for (const k of liste || []) for (const p of index.pieces) if (p.systeme === 'muscles' && cleMuscle(p.nom_en) === k) for (const m of anat.etat.meshs.get(p.id) || []) { anat.teinterMesh(m, col); m.userData.role = col; }
  }
  const idsMuscles = m => { const k = new Set([...m.agonistes, ...m.antagonistes, ...(m.stabilisateurs || [])]); return index.pieces.filter(p => p.systeme === 'muscles' && k.has(cleMuscle(p.nom_en))).map(p => p.id); };

  /* transformations pour un mouvement à la phase p ; mélange avec le repos pendant l'entrée */
  function calculer(m, p) {
    const r = cine.poser(m.pose(((p % 1) + 1) % 1, ctx)); let T = r.T;
    if (etat.entree < 1) { const w = lisse(etat.entree), repos = identite(); T = {}; for (const s of SEGMENTS) T[s] = melangerRigide(repos, r.T[s], w); }
    return { T, r };
  }
  const notifier = () => { for (const f of etat.ecouteurs) { try { f(etat.dernier); } catch (e) { /* un écouteur défaillant ne bloque pas la lecture */ } } };

  const api = {
    rig, MOUVEMENTS: MOUVEMENTS_V2, etat,
    liste: () => MOUVEMENTS_V2.map(m => ({ id: m.id, nom: m.nom, categorie: m.categorie })),
    corps: () => { init(); return corps; }, cinematique: () => { init(); return cine; }, peau, contexte: () => { init(); return ctx; },
    abonner(f) { etat.ecouteurs.add(f); return () => etat.ecouteurs.delete(f); },
    async lancer(texteOuId, { boucle = true, vitesse = null, phase = 0 } = {}) {
      const m = MOUVEMENTS_V2.find(x => x.id === texteOuId) || trouverMouvementV2(texteOuId); if (!m) return { ok: false, erreur: 'je ne connais pas ce mouvement' };
      for (const s of ['os', 'muscles']) await anat.chargerSysteme(s);
      init(); enregistrer();
      etat.actif = m; etat.t = phase; etat.boucle = boucle; etat.sens = 1; etat.pause = false; etat.entree = 0; if (vitesse) etat.vitesse = vitesse;
      etat.roles = { agonistes: m.agonistes, antagonistes: m.antagonistes, stabilisateurs: m.stabilisateurs || [] };
      // seul le squelette et les muscles du mouvement sont montrés : les autres couches reviennent à l'arrêt
      await anat.surcharger(['os']); anat.forcer('mouvement', idsMuscles(m)); teinter(etat.roles); enregistrer(); planifier();
      anat.cadrer(index.deSysteme('os').filter(p => /femur|humerus|skull/i.test(p.nom_en)));
      const r = calculer(m, etat.t); appliquer(r.T); etat.dernier = r; notifier();
      return { ok: true, mouvement: m, texte: explicationParleeV2(m) };
    },
    arreter() { if (!etat.actif) return false; etat.actif = null; etat.dernier = null; reinitialiser(); teinter(null); anat.forcer('mouvement', null); anat.surcharger(null); notifier(); return true; },
    /* lecture */
    regler(vitesse) { etat.vitesse = Math.max(0.05, Math.min(3, vitesse)); return etat.vitesse; },
    pause(oui = true) { etat.pause = !!oui; return etat.pause; },
    sens(s) { etat.sens = s < 0 ? -1 : 1; return etat.sens; },
    phase(p) { if (!etat.actif) return null; etat.t = ((p % 1) + 1) % 1; etat.entree = 1; const r = calculer(etat.actif, etat.t); appliquer(r.T); etat.dernier = r; notifier(); return etat.t; },
    /* image par image : n images (positif ou négatif) sur 120 images par cycle ; met en pause */
    pas(n = 1) { if (!etat.actif) return null; etat.pause = true; return api.phase(etat.t + n / 120); },
    /* Position à une phase donnée (tests et captures) sans lancer le mouvement */
    poser(m, phase) { init(); enregistrer(); const mv = typeof m === 'string' ? MOUVEMENTS_V2.find(x => x.id === m) : m; const r = calculer(mv, phase); appliquer(r.T); etat.dernier = r; return r.T; },
    /* Pose statique à partir d'angles de l'ancien format (attitudes et déformations : anatomie-pathologies-calcul.js) ; le pied le plus bas reste au sol */
    poserAngles(anciens) {
      init(); enregistrer(); const J = {}; let pel = {};
      for (const [j, v] of Object.entries(anciens)) {
        if (j === 'tronc') J.lombaire = { ...v }; else if (j === 'bassin') pel = { dy: v.dy || 0 }; else if (/^genou/.test(j)) J[j] = { fl: v.fl || 0, ab: v.ab || 0 }; else J[j] = { ...v };
      }
      const r = cine.poser({ joints: J, pelvis: pel }), T = r.T; let ecart = 1e9;
      for (const S of ['D', 'G']) { const A = corps.pivots['cheville' + S]; ecart = Math.min(ecart, point(T['jambe' + S], A)[1] - A[1]); }
      const dy = -ecart; for (const s of SEGMENTS) T[s] = [...T[s]]; for (const s of SEGMENTS) T[s][13] += dy;
      etat.dernier = { T, r }; appliquer(T);
      const M = {}; for (const s of SEGMENTS) M[s] = new M4().fromArray(T[s]); return M;          // matrices THREE pour les modules de pathologies
    },
    reinitialiser,
    maj(dt) {
      if (!etat.actif) return;
      if (etat.entree < 1) etat.entree = Math.min(1, etat.entree + dt / DUREE_ENTREE);
      if (!etat.pause) {
        etat.t += etat.sens * dt * etat.vitesse / etat.actif.duree;
        if (!etat.boucle && (etat.t >= 1 || etat.t <= 0)) { api.arreter(); return; }
        etat.t = ((etat.t % 1) + 1) % 1;
      }
      if (++etat.phases % 12 === 0) { enregistrer(); planifier(); }
      peau.traiter(corps, 5);
      const r = calculer(etat.actif, etat.t); appliquer(r.T); etat.dernier = r; notifier();
    },
    detail: () => ({ actif: etat.actif && etat.actif.id, phase: etat.actif ? ((etat.t % 1) + 1) % 1 : null, vitesse: etat.vitesse, pause: etat.pause, sens: etat.sens, entree: etat.entree, peau: peau.etat(), cdg: etat.dernier && etat.dernier.r ? etat.dernier.r.cdg : null, marge: etat.dernier && etat.dernier.r ? etat.dernier.r.marge : null })
  };
  return api;
}
