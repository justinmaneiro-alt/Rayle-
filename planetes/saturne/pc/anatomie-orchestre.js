import { creerFenetresAnat } from './anatomie-fenetres-anat.js';
import { contenuCatalogue } from './anatomie-catalogue.js';
import { MOUVEMENTS_V2 as MOUVEMENTS, trouverMouvementV2 as trouverMouvement } from './anatomie-mouvements-catalogue.js';
import { TOUTES } from './anatomie-patho-catalogue.js';
import { brancherPathologies } from './anatomie-orchestre-patho.js';
import { brancherDossiers } from './anatomie-dossiers.js';

/* ═════════════ ANATOMIE : L'ORCHESTRE (panneau, catalogues, fenêtres, mouvements, pathologies) ═════════════
   Point d'entrée UNIQUE pour le panneau, les ordres vocaux et les tests : lancer un mouvement ou une pathologie ouvre toujours sa fenêtre explicative (et, pour un mouvement, la
   vue rapprochée). Les catalogues (mouvements, pathologies) sont des fenêtres avec recherche et filtres. */
export function creerOrchestre({ anat, ui, ecran, panneau = () => null, extra = {} }) {
  const glue = creerFenetresAnat({ anat, ui, ecran, surRanger: wid => (O.rangerFenetre ? O.rangerFenetre(wid) : glue.fenetres.fermer(wid)) });
  const O = { glue, fenetres: glue.fenetres, vue3d: null, mouvementsExtra: extra.mouvements || [], pathologiesExtra: extra.pathologies || [] };
  O.ouvrirVue3d = async m => { if (!O.vue3d) { const { creerVueMouvement } = await import('./anatomie-vue-mouvement.js'); O.vue3d = creerVueMouvement({ anat, F: glue.fenetres }); } return O.vue3d.ouvrir(m); };
  O.fermerVue3d = () => { if (O.vue3d) O.vue3d.fermer(); };
  const tousMouvements = () => [...MOUVEMENTS, ...O.mouvementsExtra], toutesPathologies = () => [...TOUTES, ...O.pathologiesExtra];
  const etat = t => { const p = panneau(); if (p) p.etat(t); };
  const actif = t => { const p = panneau(); if (p) p.majActif(t); };

  /* Mouvement : lance l'animation, ouvre la fenêtre explicative et la vue rapprochée. */
  O.lancerMouvement = async function (texteOuId, opts = {}) {
    const m = tousMouvements().find(x => x.id === texteOuId) || trouverMouvement(texteOuId) || tousMouvements().find(x => (x.alias || []).includes(String(texteOuId || '').toLowerCase()));
    if (!m) return { ok: false, erreur: 'je ne connais pas ce mouvement' };
    const mv = anat.mouvement(); const pt = anat.pathologiesObjet(); if (pt && pt.arreter()) { /* la pathologie cède la place au mouvement */ }
    const r = await mv.lancer(m.id, opts); if (!r.ok) return r;
    glue.ouvrirMouvement(r.mouvement); if (O.ouvrirVue3d) await O.ouvrirVue3d(r.mouvement); if (glue.fenetres.recouvrements().length) glue.fenetres.reorganiser();
    actif('Mouvement : ' + r.mouvement.nom + '. Agonistes en rouge, antagonistes en bleu.'); etat(r.mouvement.nom + ' : fenêtre explicative et vue rapprochée ouvertes.');
    return r;
  };
  brancherPathologies(O, { anat, glue, actif, etat, tousMouvements });
  O.arreter = function () { const mv = anat.mouvementObjet(), pt = anat.pathologiesObjet(); const a = !!(mv && mv.arreter()), b = !!(pt && pt.arreter()); if (O.fermerVue3d) O.fermerVue3d(); glue.fenetres.fermer('mouvement'); glue.fenetres.fermer('pathologie'); actif(null); return a || b; };
  glue.definirSurMouvement(id => O.lancerMouvement(id));
  brancherDossiers(O, { anat, glue, tousMouvements, toutesPathologies, etat });   // R3 : dossiers (Os, Muscles, Vaisseaux, Nerfs, Organes, Mouvements, Pathologies)

  /* Catalogues */
  O.catalogue = function (type) {
    const entrees = type === 'mouvements' ? tousMouvements().map(m => ({ id: m.id, nom: m.nom, categorie: m.categorie || 'Mouvements', alias: m.alias, niveau: m.niveau || '' }))
      : toutesPathologies().map(p => ({ id: p.id, nom: p.nom, categorie: p.categorie || 'Pathologies', alias: p.alias || [], niveau: p.niveau || '' }));
    const surChoix = async id => { const r = type === 'mouvements' ? await O.lancerMouvement(id) : await O.lancerPathologie(id, {}); if (!r.ok) etat(r.erreur || 'impossible'); };
    return glue.fenetres.ouvrir({ id: 'catalogue-' + type, titre: type === 'mouvements' ? 'Catalogue des mouvements' : 'Catalogue des pathologies', sousTitre: entrees.length + ' entrées', genre: 'catalogue', contenu: contenuCatalogue({ entrees, titre: type, surChoix, note: type === 'pathologies' ? 'Outil pédagogique, pas un outil de diagnostic. Chaque fiche indique son niveau : modèle 3D, simplifié, schématique ou information générale.' : 'Mouvements simplifiés, amplitudes de référence : à vérifier avec le cours / un atlas.' }), avertissement: type === 'pathologies' ? 'Pas un outil de diagnostic · à vérifier avec le cours / un atlas' : '' });
  };
  O.actionFenetres = act => { const F = glue.fenetres; if (act === 'ranger') F.reorganiser(); else if (act === 'reduire') F.reduireTout(); else if (act === 'fermer') glue.fermerTout(); };
  O.dispose = () => { if (O.fermerVue3d) O.fermerVue3d(); glue.dispose(); };
  return O;
}
