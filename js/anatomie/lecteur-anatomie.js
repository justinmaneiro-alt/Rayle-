/* ═════════════ PRÉSENTATIONS ANIMÉES DU CORPS : adaptateur du lecteur pour la fenêtre Anatomie ═════════════
   Traduit chaque étape d'un script (presentation.js) en actions sur le moteur 3D (moteur.js : presenter, cadrerStructures, étiquettes animées) et sur le store.
   Sauvegarde l'état de la fenêtre (calques, sélection, pathologies) au départ et le rétablit à la fin. */
import { useAnatomieStore as S, actions as A } from './store.js?v=2026.10.15.4';
import { ZONES } from './moteur.js?v=2026.10.15.4';
import { Lecteur } from './lecteur.js?v=2026.10.15.4';
import { lireEtatChargement } from './modeles-glb.js?v=2026.10.15.4';

const attente = ms => new Promise(r => setTimeout(r, ms));
const CADRES = {
  jambe: c => ({ zone: c === 'G' ? 'jambe-gauche' : 'jambe-droite' }), bras: c => ({ zone: c === 'G' ? 'bras-gauche' : 'bras-droit' }), tronc: () => ({ zone: 'tronc' }),
  tete: () => ({ cible: [0, 1.6, 0], dist: 1 }), corps: () => ({ cible: [0, .9, 0], dist: 3.2 })
};
const CHAMPS_SAUVES = ['calques', 'selection', 'isolation', 'isolationGroupe', 'contexte', 'groupe', 'masques', 'reperesAffiches', 'pathologie', 'appareillage'];

export function creerAdaptateur(moteur) {
  const T = moteur.THREE, sauve = {}; const e0 = S.obtenir(); CHAMPS_SAUVES.forEach(k => { sauve[k] = e0[k]; });
  let vitesse = 1, cles = 0;
  A.toutNormal(); A.selectionner(null);
  const tous = type => Array.from(moteur.entrees.values()).filter(en => type.includes(en.type)).map(en => en.sid);

  async function attendreEntrees(ids, ctx) {
    const t0 = Date.now(); let signale = false;
    while (Date.now() - t0 < 14000) {
      if (ctx.jeton && !ctx.jeton()) return;
      const manquants = ids.filter(i => !moteur.entrees.has(i));
      if (!manquants.length) return;
      if (!signale && Date.now() - t0 > 700) { signale = true; const l = lireEtatChargement(); ctx.attente('Chargement des modèles 3D' + (l.couches.length ? ' (' + l.couches.join(', ') + ')' : '') + '…'); }
      if (manquants.length < ids.length * .02 && Date.now() - t0 > 4000) return;       // quelques structures n'existent jamais (muscle sans forme) : on n'attend pas pour rien
      await attente(150);
    }
  }
  function ensembles(sc) {
    const visibles = sc.visibles ? new Set(sc.visibles) : null, fantomes = new Set(sc.fantomes || []);
    if (sc.peau && visibles) tous(['peau']).forEach(i => visibles.add(i));
    for (const t of sc.contexte || []) tous(t === 'os' ? ['os', 'cartilage'] : [t]).forEach(i => { if (visibles && !visibles.has(i)) { visibles.add(i); fantomes.add(i); } });
    for (const i of fantomes) visibles && visibles.add(i);
    return { visibles, fantomes, accent: new Set(sc.accent || []) };
  }
  return {
    async appliquer(etape, ctx) {
      const sc = etape.scene || {}; vitesse = ctx.vitesse || 1;
      moteur.retirerEtiquettesAnim(null);
      A.seulementCalques(sc.calques && sc.calques.length ? sc.calques : ['squelette']);
      const ids = (sc.visibles || []).concat(sc.fantomes || []).concat(sc.cadrer || []).filter(i => !/^repere:/.test(i) || true);
      await attendreEntrees(Array.from(new Set(ids)), ctx);
      if (ctx.jeton && !ctx.jeton()) return;
      if (sc.peau) await attendreEntrees(['peau:tronc'], ctx);
      const ens = ensembles(sc);
      moteur.presenter(ens, sc.fondu === false ? 0 : 700 / vitesse);
      moteur.orbite = sc.orbite ? .0026 * vitesse : 0;
      if (sc.region && !(sc.cadrer && sc.cadrer.length && sc.couche)) {
        const c = (CADRES[sc.region] || CADRES.corps)(sc.cote); const z = c.zone ? ZONES[c.zone] : c;
        moteur.allerA({ az: moteur.plusProche(0), el: .08, dist: z.dist, cible: new T.Vector3(...z.cible) }, 1200 / vitesse);
      } else if (sc.cadrer && sc.cadrer.length) {
        if (!moteur.cadrerStructures(sc.cadrer, { facteur: sc.facteur || 2.6, az: sc.az == null ? null : sc.az, el: sc.el == null ? null : sc.el, ms: 1300 / vitesse })) moteur.vue('face');
      }
      moteur.demander();
    },
    etiquette(etape, lab, n, ctx) {
      const a = lab.ancre || {}; let p = null;
      try {
        if (a.centre) { const g = moteur.geometrieStructure(a.centre); p = g && g.centre.clone().add(new T.Vector3(0, (g.taille || .1) * .5 + .01, 0)); }
        else if (a.bout != null) { const g = moteur.geometrieStructure(a.sid); p = g && g.bouts[a.bout]; }
        else if (a.contact) { const c = moteur.contactStructures(a.contact[0], a.contact[1]); p = c && (a.cote ? c.b : c.a); }
      } catch (e) { p = null; }
      if (!p) return;
      const cle = 'pr' + (++cles);
      setTimeout(() => { if (!moteur.mort) moteur.etiquetteAnim(cle, p, lab.texte, lab.classe || ''); }, 350 * n / ((ctx && ctx.vitesse) || vitesse));
    },
    retirerEtiquettes() { moteur.retirerEtiquettesAnim(null); },
    vitesse(v) { vitesse = v; },
    redimensionner() { moteur.redimensionner && moteur.redimensionner(); },
    nettoyer() {
      try { moteur.presenter(null); S.definir(sauve); moteur.vue && moteur.vue('face'); } catch (e) { console.warn('[présentation] restauration', e); }
    }
  };
}

/** Lance une présentation dans la fenêtre Anatomie (déjà ouverte). → le lecteur */
export async function lancerPresentation(script, options = {}) {
  if (window.RayleLecteur) { try { window.RayleLecteur.fermer(); } catch (e) { } }
  let moteur = null; for (let i = 0; i < 100 && !(moteur = window.RayleAnatomieMoteur); i++) await attente(100);
  const racine = document.getElementById('vueAnatomie'), centre = racine && racine.querySelector('.an-centre');
  if (!moteur || !centre) throw new Error('La fenêtre 3D n’est pas disponible (WebGL ou three.js indisponible).');
  const lecteur = new Lecteur({ conteneur: centre, racine, script, adaptateur: creerAdaptateur(moteur), surFermer: l => { if (window.RayleLecteur === l) window.RayleLecteur = null; }, sansVoix: !!options.sansVoix, dire: options.dire, taire: options.taire });
  window.RayleLecteur = lecteur; lecteur.demarrer();
  return lecteur;
}
