/* ═════════════ PASSAGE ENTRE « CETTE PAGE » ET « VEILLEUR DU PC » (M5 ; testé : galaxie/tests/hote-distant-test.mjs) ═════════════
   Quand on active « recherche en arrière-plan », l'état du pilote (stratégies et leurs preuves, coffre du jeu final, compteur de variantes, profil) doit passer dans le fichier du Veilleur SANS RIEN PERDRE,
   surtout pas une ouverture du jeu final (sinon une fenêtre déjà consommée pourrait resservir) :
   - pas d'état dans le fichier : on l'adopte tel quel ;
   - un état existe déjà : on fusionne le coffre (union) et la bibliothèque (import vérifié par sceau ; les identifiants déjà connus sont ignorés).
   Dans l'autre sens, l'état du fichier remplace celui de la page (le fichier est la référence tant que le Veilleur cherche). `appeler(chemin, corps?)` rend le JSON de la route /__veilleur/<chemin>. */
export async function versVeilleur({ local, appeler }) {
  const pilote = local.pilote(), etat = pilote.etat(), distant = await appeler('pilote');
  if (!distant || !distant.ok) throw new Error((distant && distant.erreur) || 'Veilleur injoignable');
  let mode;
  if (!distant.existe) { const r = await appeler('pilote-adopter', { etat }); if (!r.ok) throw new Error(r.erreur || 'adoption refusée'); mode = 'adopte'; }
  else {
    await appeler('pilote-commande', { commande: { type: 'fusion_etat', id: etat.id, N: etat.recherche.N, ouverts: (etat.coffre && etat.coffre.ouverts) || [] } });
    const exp = pilote.commande({ type: 'exporter' }); if (exp.ok) await appeler('pilote-commande', { commande: { type: 'importer', texte: exp.texte } });
    mode = 'fusionne';
  }
  await appeler('pilote-commande', { commande: { type: 'profil', patch: { arrierePlan: { ...etat.profil.arrierePlan, actif: true } } } });
  await appeler('chercheur-demarrer', {});
  if (local.pauserRecherche) local.pauserRecherche();
  return { mode };
}
export async function versLocal({ local, appeler }) {
  const distant = await appeler('pilote'); if (!distant || !distant.ok || !distant.existe) throw new Error('aucun état du Veilleur à reprendre');
  await appeler('pilote-commande', { commande: { type: 'profil', patch: { arrierePlan: { ...distant.etat.profil.arrierePlan, actif: false } } } });
  await appeler('chercheur-arreter', {});
  const frais = await appeler('pilote'); local.adopterEtat(frais.etat);
  return { mode: 'repris' };
}
