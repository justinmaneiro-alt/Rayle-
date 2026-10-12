/* ═════════════ STORE ANATOMIE & ORTHOPÉDIE (équivalent Zustand, sans dépendance) ═════════════
   Un seul état, immuable : chaque action remplace les tranches modifiées. Le moteur 3D, la fenêtre et le pop-up s'abonnent.
   creerStore(initial) → { obtenir(), definir(patch|fn), abonner(fn(etat,avant)) → désabonnement }
   useAnatomieStore    → le store de l'appli ; actions : voir `actions` en bas. */

export function creerStore(initial) {
  let etat = initial;
  const abonnes = new Set();
  return {
    obtenir: () => etat,
    definir(patch) {
      const avant = etat;
      const suite = typeof patch === 'function' ? patch(avant) : patch;
      if (!suite) return etat;
      let change = false;
      for (const k of Object.keys(suite)) if (suite[k] !== avant[k]) { change = true; break; }
      if (!change) return etat;
      etat = Object.assign({}, avant, suite);
      abonnes.forEach(f => { try { f(etat, avant); } catch (e) { console.error('[anatomie/store]', e); } });
      return etat;
    },
    abonner(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
  };
}

export const CALQUES = ['squelette', 'muscles', 'nerfs', 'organes', 'peau', 'reperes', 'dermatomes'];

export const COURBE_DEFAUT = { apex: 'T8', cobb: 30, convexite: 'D' };

export const ETAT_INITIAL = {
  fenetre: { ouverte: false, onglet: 'structures' },          // onglet : structures | amputations | deformations | fractures | appareillage | reperes | cours
  quick: { ouvert: false, id: null, cote: 'D' },               // pop-up 3D rapide
  calques: { squelette: true, muscles: false, nerfs: false, organes: false, peau: false, reperes: false, dermatomes: false },
  groupe: null,                                                // pop-up : liste d'ids affichés ensemble (rachis, main, quadriceps…)
  selection: null,                                             // id d'instance : 'humerus:D', 'biceps-brachial:G', 'vertebre-L4', 'coeur'
  isolation: false,                                            // la sélection est isolée en 3D
  contexte: false,                                             // en isolation, garder le reste en fantôme
  masques: [],                                                 // ids d'instance cachés par l'utilisateur
  reperesAffiches: [],                                         // ids de repères palpables affichés (en plus du calque)
  recherche: '',
  pathologie: {
    amputation: null,                                          // { niveau:'transtibiale', cote:'D'|'G'|'DG' }
    scoliose: null,                                            // { courbes:[{apex,cobb,convexite}], lignesCobb:true }
    fracture: null                                             // { id, type, angulation, decalage, raccourcissement, rotation }
  },
  appareillage: {
    actif: false,
    modele: null,                                              // id du catalogue (appareillages.js)
    materiaux: {},                                             // { composant: idMateriau }
    correction: 40,                                            // % de correction attendu (corsets)
    appuis: true,                                              // points d'appui et zones de décharge
    forces: true                                               // flèches de correction (3 points)
  }
};

export const useAnatomieStore = creerStore(ETAT_INITIAL);
const S = useAnatomieStore;
const fusion = (a, b) => Object.assign({}, a, b);

export const actions = {
  // ── fenêtres ──
  ouvrirFenetre(onglet) { S.definir(e => ({ fenetre: fusion(e.fenetre, { ouverte: true, onglet: onglet || e.fenetre.onglet }) })); },
  fermerFenetre() { S.definir(e => ({ fenetre: fusion(e.fenetre, { ouverte: false }) })); },
  onglet(nom) { S.definir(e => ({ fenetre: fusion(e.fenetre, { onglet: nom }) })); },
  ouvrirQuick(id, cote) { S.definir(e => ({ quick: { ouvert: true, id, cote: cote || e.quick.cote || 'D' } })); },
  fermerQuick() { S.definir(e => ({ quick: fusion(e.quick, { ouvert: false }) })); },
  coteQuick(cote) { S.definir(e => ({ quick: fusion(e.quick, { cote }) })); },

  // ── calques (indépendants et combinables) ──
  basculerCalque(nom, oui) {
    if (!CALQUES.includes(nom)) return;
    S.definir(e => ({ calques: fusion(e.calques, { [nom]: oui === undefined ? !e.calques[nom] : !!oui }) }));
  },
  definirCalques(patch) {
    const p = {}; for (const k of CALQUES) if (k in patch) p[k] = !!patch[k];
    S.definir(e => ({ calques: fusion(e.calques, p) }));
  },
  seulementCalques(liste) {
    const p = {}; for (const k of CALQUES) p[k] = liste.includes(k);
    S.definir({ calques: p });
  },

  // ── sélection et isolation ──
  selectionner(id) { S.definir(e => ({ selection: id || null, isolation: id ? e.isolation : false })); },
  isoler(id) { S.definir(e => ({ selection: id || e.selection, isolation: !!(id || e.selection) })); },
  quitterIsolation() { S.definir({ isolation: false }); },
  contexte(oui) { S.definir(e => ({ contexte: oui === undefined ? !e.contexte : !!oui })); },
  masquer(id, oui) {
    S.definir(e => {
      const a = e.masques.filter(x => x !== id);
      return { masques: (oui === undefined ? !e.masques.includes(id) : oui) ? a.concat(id) : a };
    });
  },
  toutAfficher() { S.definir({ masques: [] }); },
  recherche(t) { S.definir({ recherche: String(t || '') }); },
  basculerRepere(id) { S.definir(e => ({ reperesAffiches: e.reperesAffiches.includes(id) ? e.reperesAffiches.filter(x => x !== id) : e.reperesAffiches.concat(id) })); },
  tousReperes(ids) { S.definir(e => ({ reperesAffiches: e.reperesAffiches.length >= ids.length ? [] : ids.slice() })); },

  // ── pathologies ──
  amputation(niveau, cote) {
    S.definir(e => ({ pathologie: fusion(e.pathologie, { amputation: niveau ? { niveau, cote: cote || (e.pathologie.amputation && e.pathologie.amputation.cote) || 'D' } : null }),
      appareillage: fusion(e.appareillage, { actif: false, modele: null }) }));
  },
  coteAmputation(cote) { S.definir(e => e.pathologie.amputation ? { pathologie: fusion(e.pathologie, { amputation: fusion(e.pathologie.amputation, { cote }) }) } : null); },
  scoliose(spec) {
    S.definir(e => ({ pathologie: fusion(e.pathologie, { scoliose: spec ? { courbes: (spec.courbes || [COURBE_DEFAUT]).map(c => fusion(COURBE_DEFAUT, c)), lignesCobb: spec.lignesCobb !== false } : null }),
      appareillage: fusion(e.appareillage, { actif: false, modele: null }) }));
  },
  courbe(i, patch) {
    S.definir(e => {
      const s = e.pathologie.scoliose; if (!s || !s.courbes[i]) return null;
      const courbes = s.courbes.map((c, k) => k === i ? fusion(c, patch) : c);
      return { pathologie: fusion(e.pathologie, { scoliose: fusion(s, { courbes }) }) };
    });
  },
  ajouterCourbe(c) {
    S.definir(e => {
      const s = e.pathologie.scoliose || { courbes: [], lignesCobb: true };
      if (s.courbes.length >= 3) return null;
      return { pathologie: fusion(e.pathologie, { scoliose: fusion(s, { courbes: s.courbes.concat(fusion(COURBE_DEFAUT, c || { apex: 'L2', convexite: 'G', cobb: 25 })) }) }) };
    });
  },
  retirerCourbe(i) {
    S.definir(e => {
      const s = e.pathologie.scoliose; if (!s) return null;
      const courbes = s.courbes.filter((_, k) => k !== i);
      return { pathologie: fusion(e.pathologie, { scoliose: courbes.length ? fusion(s, { courbes }) : null }) };
    });
  },
  fracture(spec) {
    S.definir(e => ({ pathologie: fusion(e.pathologie, { fracture: spec ? fusion({ type: 'transversale', angulation: 0, decalage: 0, raccourcissement: 0, rotation: 0 }, spec) : null }),
      appareillage: fusion(e.appareillage, { actif: false, modele: null }) }));
  },
  reglerFracture(patch) { S.definir(e => e.pathologie.fracture ? { pathologie: fusion(e.pathologie, { fracture: fusion(e.pathologie.fracture, patch) }) } : null); },
  toutNormal() {
    S.definir(e => ({ pathologie: { amputation: null, scoliose: null, fracture: null }, appareillage: fusion(e.appareillage, { actif: false, modele: null }) }));
  },

  // ── appareillage ──
  appareil(modele) {
    S.definir(e => ({ appareillage: fusion(e.appareillage, { actif: !!modele, modele: modele || null, materiaux: {} }) }));
  },
  materiau(composant, idMateriau) { S.definir(e => ({ appareillage: fusion(e.appareillage, { materiaux: fusion(e.appareillage.materiaux, { [composant]: idMateriau }) }) })); },
  reglerAppareil(patch) { S.definir(e => ({ appareillage: fusion(e.appareillage, patch) })); },
  reinitialiser() { S.definir(Object.assign({}, ETAT_INITIAL, { fenetre: S.obtenir().fenetre, quick: S.obtenir().quick })); }
};
