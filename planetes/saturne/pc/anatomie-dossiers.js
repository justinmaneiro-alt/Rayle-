import { creerDossiers } from '../../../core/commun/dossiers.js';
import { construire, typeDe, idReel } from './anatomie-dossiers-calcul.js';

/* ═════════════ ANATOMIE : LES DOSSIERS BRANCHÉS (R3) ═════════════
   Une fenêtre « Dossiers » (classeurs : Os, Muscles, Vaisseaux, Nerfs, Organes, Mouvements, Pathologies) ; un appui ouvre le carrousel du dossier (avec recherche : 200 os, 80 muscles…) ;
   la carte du centre s'envole vers l'espace de travail : une fiche (épinglée, avec sa vue 3D), un mouvement (animation + fenêtre) ou une pathologie. Le bouton « ↩ » d'une fenêtre (ou son menu)
   la remet dans son dossier. Toutes les entrées, posées ou non, sont aussi dans le tiroir de fenêtres global. Contenu médical inchangé : « pas un outil de diagnostic ». */
export function brancherDossiers(O, { anat, glue, tousMouvements, toutesPathologies, etat }) {
  const F = glue.fenetres; let D = null, donnees = null, mur = null;
  const calculer = () => { donnees = construire({ pieces: (anat.index && anat.index.pieces) || [], libelle: p => anat.index.libelle(p, 'fr'), mouvements: tousMouvements(), pathologies: toutesPathologies() }); return donnees; };
  const fenFiche = id => F.obtenir('fiche-' + id) || (glue.etat.fiche === id ? F.obtenir('fiche') : null);
  const fenMouv = id => (glue.etat.mouvement && glue.etat.mouvement.id === id ? F.obtenir('mouvement') : null);
  const fenPatho = id => (glue.etat.pathologie && glue.etat.pathologie.p && glue.etat.pathologie.p.id === id ? F.obtenir('pathologie') : null);
  const fenetreDe = id => { const t = typeDe(id), r = idReel(id); return t === 'piece' ? fenFiche(r) : t === 'mouvement' ? fenMouv(r) : fenPatho(r); };
  function creer() {
    const d = calculer();
    D = creerDossiers({
      dossiers: d.dossiers, fenetres: d.fenetres, vue: 'Anatomie',
      estPosee: id => !!fenetreDe(id),
      poser: id => { const t = typeDe(id), r = idReel(id); if (t === 'piece') { glue.epingler(r); return null; } if (t === 'mouvement') return O.lancerMouvement(r); return O.lancerPathologie(r, {}); },
      rectFenetre: id => { const w = fenetreDe(id); return w ? w.rect : null; },
      ranger: id => { const t = typeDe(id), r = idReel(id); if (t === 'piece') { if (F.obtenir('fiche-' + r)) F.fermer('fiche-' + r); else if (glue.etat.fiche === r) F.fermer('fiche'); } else O.arreter(); },
      apresLot: () => { if (F.recouvrements().length) F.reorganiser(); }
    });
    return D;
  }
  /* identifiant de fenêtre → entrée de dossier (pour le bouton « remettre dans son dossier ») */
  const entreeDeFenetre = wid => { if (wid.startsWith('fiche-')) return wid.slice(6); if (wid === 'fiche') return glue.etat.fiche; if (wid === 'mouvement' && glue.etat.mouvement) return 'mv:' + glue.etat.mouvement.id; if (wid === 'pathologie' && glue.etat.pathologie && glue.etat.pathologie.p) return 'pa:' + glue.etat.pathologie.p.id; return null; };
  O.rangerFenetre = wid => { const e = entreeDeFenetre(wid); if (e && D && D.dossier && fenetreDe(e)) D.rentrer(e); else F.fermer(wid); };
  O.dossiers = () => D || creer();
  O.ouvrirDossiers = () => {
    if (D) D.fermer(true); D = null; const dd = O.dossiers();   // reconstruit : la liste peut avoir grandi (catalogues étendus)
    mur = document.createElement('div');   // un élément neuf à chaque fois : sinon les écouteurs de l'ancien jeu de dossiers s'accumulent (deux carrousels au clic)
    const w = F.ouvrir({ id: 'dossiers', titre: 'Dossiers d’anatomie', sousTitre: 'Appuie sur un dossier pour l’ouvrir', genre: 'aide', contenu: mur, pastille: 'reel', rangeable: false });
    w.corps.classList.add('sa-corps-dossiers'); dd.rendreMur(mur); return w;
  };
  O.ouvrirDossier = id => { const dd = O.dossiers(); return dd.ouvrir(id); };
  F.enregistrerTiroir({ vue: 'Anatomie', entrees: () => { const d = calculer(); return d.dossiers.flatMap(x => x.ids.map(id => ({ id, titre: d.fenetres[id].titre, dossier: x.titre, apercu: d.fenetres[id].apercu, icone: d.fenetres[id].icone, posee: !!fenetreDe(id), afficher: () => { const dd = O.dossiers(); dd.sortir(id); } }))); } });
  void etat;
}
